/**
 * v3.25 -- Host-LLM execution adapter.
 *
 * The "host LLM" pattern: when the harness runs INSIDE Claude Code or
 * Codex (which already have first-class LLMs), it should NOT call an
 * external API. Instead it emits a structured prompt + expected response
 * shape into a file; the host LLM consumes the prompt with its own model
 * and writes the kernel response back to a sibling file.
 *
 * Why this exists (from the v3.24 spec):
 *   - One-click integration with CC/Codex without `ANTHROPIC_API_KEY`
 *   - The host owns the LLM (cost, model choice, rate limits, safety
 *     filters all stay on the host)
 *   - Identical to the existing 4 modes (real/cache/test/skeleton) at the
 *     ProductionKernelOutput boundary; host-llm just sources the kernel
 *     from a file the host writes instead of an HTTP response
 *
 * Wire protocol (intentionally simple — JSON files, no daemon):
 *
 *   1. Harness calls `prepareHostLlmRequest(input)` -> writes
 *      `<exchange_dir>/<request_id>.request.json` with prompt + metadata
 *   2. Harness blocks on `awaitHostLlmResponse(request_id)` polling
 *      `<exchange_dir>/<request_id>.response.json`
 *   3. Host (CC slash command, Codex tool, or test harness) reads request,
 *      runs its LLM, writes response.json with `{ code, references_used,
 *      review_notes, llm_model_used }`
 *   4. Harness parses response, returns ProductionKernelOutput
 *
 * Why JSON files (vs stdin/stdout, named pipes, sockets):
 *   - Works identically across CC slash command, Codex tool exec, and
 *     standalone testing
 *   - Inspectable post-hoc (can replay an exchange by re-running the
 *     consumer against the saved request.json)
 *   - Survives across processes — host-LLM tool can take seconds to
 *     respond, the harness CLI exits cleanly waiting on file presence
 *   - Test-friendly: just write the response file ahead of time
 *
 * Detection (when to default to host-llm mode):
 *   - `EVOKERNEL_HOST_LLM=true` env var (explicit)
 *   - `CLAUDEAGENT` or `CLAUDE_CODE_SESSION` env vars (CC context)
 *   - `CODEX_SESSION_ID` env var (Codex context)
 *   - `--use-host-llm` CLI flag (highest precedence; index.ts injects
 *     EVOKERNEL_HOST_LLM=true into env)
 */

import { mkdir, readFile, writeFile, access, stat } from 'node:fs/promises';
import { existsSync, constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

import type {
  ProductionKernelInput,
  ProductionKernelOutput,
} from './llm-orchestrator';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface HostLlmRequest {
  /** Schema version for forward compat. */
  schema_version: '0.1';
  /** Request id (matches the file basename). */
  request_id: string;
  /** ISO timestamp when the harness wrote the request. */
  emitted_at: string;
  /** Generation context the host LLM needs to produce real code. */
  generation: {
    op: string;
    target_arch: string;
    language: string;
    /** Bundle subset relevant to this op (avoid leaking full corpus to host). */
    bundle_excerpt: {
      model_id: string;
      hardware_id: string;
      vendor_id: string;
      op_signature?: string;
      op_numerical_rules?: Array<{ aspect: string; per_library: Record<string, string> }>;
      op_reference_impl_snippet?: string;
      relevant_dsl_examples: Array<{ id: string; language: string; arch_family: string; title: string; code_excerpt: string }>;
      relevant_isa_primitives: Array<{ id: string; arch_family: string; class: string }>;
    };
    /** Prior attempt diagnostic when retrying after a Layer V failure. */
    prior_attempt_diagnostic?: string;
  };
  /** Hash of the input so cached responses can be matched without re-parsing. */
  prompt_hash: string;
  /**
   * Wire-format hint for the host LLM. The structured prompt the host
   * should send to its own model.
   */
  prompt: string;
  /** Suggested response shape — host-side guidance only. */
  expected_response_shape: {
    code: 'string -- generated kernel source code, complete and compilable';
    references_used: 'string[] -- corpus ids the LLM cited (DSL example ids, ISA primitive ids, etc.)';
    review_notes: 'string[] -- caveats the human reviewer should know';
    llm_model_used: 'string -- e.g. claude-sonnet-4-7, gpt-5, etc';
  };
}

export interface HostLlmResponse {
  schema_version: '0.1';
  request_id: string;
  responded_at: string;
  code: string;
  references_used: string[];
  review_notes: string[];
  llm_model_used: string;
  /** Optional: error message from the host if generation failed. */
  error?: string;
}

export interface HostLlmExchangeOptions {
  /** Where to write request.json + read response.json. Default: ~/.cache/evokernel/host-llm-exchange/ */
  exchange_dir?: string;
  /** Max wait time in ms before giving up. Default: 5 minutes. */
  timeout_ms?: number;
  /** Poll interval for response.json. Default: 500ms. */
  poll_interval_ms?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the harness should default to host-llm mode.
 * Precedence (high → low):
 *   1. `EVOKERNEL_HOST_LLM=true` (explicit override, set by --use-host-llm)
 *   2. CLAUDEAGENT / CLAUDE_CODE_SESSION env vars present (CC context)
 *   3. CODEX_SESSION_ID env var present (Codex context)
 */
export function shouldUseHostLlm(): boolean {
  if (process.env.EVOKERNEL_HOST_LLM === 'true') return true;
  if (process.env.CLAUDEAGENT) return true;
  if (process.env.CLAUDE_CODE_SESSION) return true;
  if (process.env.CODEX_SESSION_ID) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// Default exchange dir
// ─────────────────────────────────────────────────────────────────────────

export function defaultExchangeDir(): string {
  return process.env.EVOKERNEL_HOST_LLM_EXCHANGE_DIR
    ?? path.join(os.homedir(), '.cache/evokernel/host-llm-exchange');
}

// ─────────────────────────────────────────────────────────────────────────
// Write request
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build the structured HostLlmRequest from a ProductionKernelInput. The
 * host LLM receives ONLY the bundle excerpt relevant to this op (not the
 * full corpus) — keeps the prompt focused and the cost lower.
 */
export function buildHostLlmRequest(
  input: ProductionKernelInput,
  prompt: string,
  promptHash: string,
  language: string,
): HostLlmRequest {
  const op_in_bundle = input.bundle.applicable_ops.find((o) => o.id === input.op);
  const arch_family = input.target_arch;
  const dsl_examples = input.bundle.dsl_examples
    .filter((d) => d.arch_family === arch_family || d.language === language)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      language: d.language,
      arch_family: d.arch_family,
      title: d.title,
      code_excerpt: d.code.slice(0, 1500),
    }));
  const isa_primitives = input.bundle.isa_primitives
    .filter((i) => i.arch_family === arch_family)
    .slice(0, 5)
    .map((i) => ({ id: i.id, arch_family: i.arch_family, class: i.class }));

  const request_id = `${input.bundle.model.id}__${input.bundle.hardware.id}__${input.op}__${promptHash.slice(0, 12)}`;

  return {
    schema_version: '0.1',
    request_id,
    emitted_at: new Date().toISOString(),
    generation: {
      op: input.op,
      target_arch: input.target_arch,
      language,
      bundle_excerpt: {
        model_id: input.bundle.model.id,
        hardware_id: input.bundle.hardware.id,
        vendor_id: input.bundle.vendor.id,
        op_signature: op_in_bundle?.formal_semantics?.signature,
        op_numerical_rules: op_in_bundle?.formal_semantics?.numerical_rules,
        op_reference_impl_snippet: op_in_bundle?.formal_semantics?.reference_impl?.snippet,
        relevant_dsl_examples: dsl_examples,
        relevant_isa_primitives: isa_primitives,
      },
      prior_attempt_diagnostic: input.prior_attempt_diagnostic,
    },
    prompt_hash: promptHash,
    prompt,
    expected_response_shape: {
      code: 'string -- generated kernel source code, complete and compilable',
      references_used: 'string[] -- corpus ids the LLM cited (DSL example ids, ISA primitive ids, etc.)',
      review_notes: 'string[] -- caveats the human reviewer should know',
      llm_model_used: 'string -- e.g. claude-sonnet-4-7, gpt-5, etc',
    },
  };
}

export async function writeHostLlmRequest(
  request: HostLlmRequest,
  options: HostLlmExchangeOptions = {},
): Promise<string> {
  const dir = options.exchange_dir ?? defaultExchangeDir();
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${request.request_id}.request.json`);
  await writeFile(file, JSON.stringify(request, null, 2));
  return file;
}

// ─────────────────────────────────────────────────────────────────────────
// Await response
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_POLL_INTERVAL_MS = 500;

/**
 * Block until `<exchange_dir>/<request_id>.response.json` appears (or
 * timeout). Returns the parsed HostLlmResponse, or throws.
 *
 * The poll-file pattern is intentionally low-tech: works across any host
 * runtime (CC slash command writing the file, Codex tool exec writing it,
 * a test fixture writing it ahead of time, etc.) without needing a
 * long-running daemon or socket.
 */
export async function awaitHostLlmResponse(
  request_id: string,
  options: HostLlmExchangeOptions = {},
): Promise<HostLlmResponse> {
  const dir = options.exchange_dir ?? defaultExchangeDir();
  const timeout_ms = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const poll_interval_ms = options.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS;
  const response_file = path.join(dir, `${request_id}.response.json`);

  const deadline = Date.now() + timeout_ms;
  while (Date.now() < deadline) {
    if (existsSync(response_file)) {
      try {
        const raw = await readFile(response_file, 'utf-8');
        const parsed = JSON.parse(raw) as HostLlmResponse;
        if (parsed.request_id !== request_id) {
          throw new Error(
            `Response file request_id mismatch (expected "${request_id}", got "${parsed.request_id}")`,
          );
        }
        if (parsed.error) {
          throw new Error(`Host LLM reported error: ${parsed.error}`);
        }
        return parsed;
      } catch (e) {
        // Could be partial write — treat like "not yet" and retry once.
        if ((e as Error).message.includes('Unexpected') || (e as Error).message.includes('JSON')) {
          await sleep(poll_interval_ms);
          continue;
        }
        throw e;
      }
    }
    await sleep(poll_interval_ms);
  }

  throw new HostLlmTimeoutError(request_id, timeout_ms, response_file);
}

// ─────────────────────────────────────────────────────────────────────────
// Convert HostLlmResponse → ProductionKernelOutput
// ─────────────────────────────────────────────────────────────────────────

export function responseToOutput(
  request: HostLlmRequest,
  response: HostLlmResponse,
  filename: string,
): ProductionKernelOutput {
  return {
    filename,
    language: request.generation.language,
    code: response.code,
    source: 'llm-generated',
    llm_model: response.llm_model_used,
    generated_at: response.responded_at,
    prompt_hash: request.prompt_hash,
    references_used: response.references_used ?? [],
    review_notes: [
      'Generated via host-llm exchange (no external Anthropic API call).',
      `Host LLM: ${response.llm_model_used}.`,
      ...(response.review_notes ?? []),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

export class HostLlmTimeoutError extends Error {
  readonly request_id: string;
  readonly timeout_ms: number;
  readonly response_file: string;
  constructor(request_id: string, timeout_ms: number, response_file: string) {
    super(
      `[host-llm-adapter] No response received for request "${request_id}" within ${timeout_ms}ms.\n` +
        `  Expected file: ${response_file}\n` +
        `  Hint: ensure the host LLM (Claude Code session, Codex tool, or test fixture) is\n` +
        `        consuming the .request.json and writing back the .response.json.`,
    );
    this.name = 'HostLlmTimeoutError';
    this.request_id = request_id;
    this.timeout_ms = timeout_ms;
    this.response_file = response_file;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stable hash for a request_id collision check (used by tests). */
export function hashRequestForCollisionCheck(req: HostLlmRequest): string {
  return createHash('sha256')
    .update(JSON.stringify({ op: req.generation.op, arch: req.generation.target_arch, hash: req.prompt_hash }))
    .digest('hex')
    .slice(0, 16);
}
