/**
 * v3.27 -- Fuzzy-intent clarification loop (first input-flexibility surface).
 *
 * Pre-v3.27 the harness required canonical (model, hardware) inputs (or
 * v3.25's synthesized fallback). v3.27 adds `--description "natural
 * language intent"` for users who don't know the exact slug and want to
 * describe the deployment in prose.
 *
 * Workflow:
 *   1. User passes `--description "port SageAttention to Ascend 910B
 *      and validate with CogVideoX1.5-5B"` (no --model / --hardware /
 *      --technique flags)
 *   2. clarifyIntent() emits a structured host-llm-adapter request asking
 *      the host LLM to extract: { model, hardware, technique?, requirements? }
 *      from the description, OR list missing pieces if ambiguous
 *   3. Host LLM returns either:
 *      - A complete structured intent → harness re-runs main flow with
 *        canonical args
 *      - A list of clarifying questions → harness prints them, exits with
 *        a helpful "re-run with --description '... <answers>'" hint
 *
 * v3.27 ships the SCAFFOLD: the prompt builder + the structured-extraction
 * shape + integration with --description CLI flag. v3.28+ wires the
 * iterative loop where the harness re-prompts on partial responses.
 *
 * Why not just LLM-extract always: keeping --model / --hardware as
 * canonical flags is faster + more reproducible. --description is the
 * "I don't know the slug, just figure it out" escape hatch.
 */

import type {
  HostLlmRequest,
  HostLlmResponse,
} from './host-llm-adapter';

export interface ClarifyIntentInput {
  /** Natural-language description from user. */
  description: string;
  /** What the user already provided (helps the LLM ask better questions). */
  partial_args?: {
    model?: string;
    hardware?: string;
    technique?: string;
    workload?: string;
  };
  /** List of available techniques + bundles for the LLM to ground in. */
  context: {
    available_hardware: string[];   // first 30 from data/hardware/
    available_techniques: string[]; // from data/techniques/
    bundle_count: number;           // total pre-built bundles
  };
}

export interface IntentClarificationRequest {
  /** Structured prompt for the host LLM. */
  prompt: string;
  /** Bundle excerpt the LLM needs to ground its extraction. */
  context_excerpt: ClarifyIntentInput['context'];
  /** Schema the LLM is asked to return. */
  expected_response_shape: {
    extracted_intent: 'object | null -- structured (model, hardware, technique?, workload?) or null if ambiguous';
    confidence: '0..1 -- how confident the extraction is';
    clarifying_questions: 'string[] -- 1-3 sharp questions when ambiguous';
    notes: 'string -- caveats / assumptions made';
  };
}

export interface ClarifiedIntent {
  /**
   * If the LLM extracted a complete intent, the canonical args ready to
   * route back into the main agent:deploy flow.
   */
  resolved?: {
    model: string;
    hardware: string;
    technique?: string;
    workload?: string;
  };
  /** Confidence in the extraction (0..1). */
  confidence: number;
  /** Sharp questions for the user when intent is ambiguous. */
  clarifying_questions: string[];
  /** Notes (assumptions made, caveats). */
  notes: string;
}

/**
 * Build the host-llm-adapter request that asks the host model to
 * extract structured intent from a natural-language description.
 *
 * The LLM is given:
 *   - The user's description (free text)
 *   - Anything the user already provided via flags (partial canonical)
 *   - A small context: available hardware ids, available technique ids,
 *     bundle count (so it knows the search space)
 * The LLM is asked to return either a complete extracted intent or a
 * structured list of clarifying questions.
 */
export function buildClarifyIntentRequest(
  input: ClarifyIntentInput,
): IntentClarificationRequest {
  const lines: string[] = [];
  lines.push(`You are an intent extractor for the EvoKernel productized agent harness.`);
  lines.push(`The user wants to deploy a model to hardware. Their natural-language description:`);
  lines.push('');
  lines.push(`> "${input.description.replace(/"/g, '\\"')}"`);
  lines.push('');
  if (input.partial_args && Object.keys(input.partial_args).some((k) => (input.partial_args as Record<string, string | undefined>)[k])) {
    lines.push(`The user has also provided these canonical args (treat as authoritative; do NOT override):`);
    for (const [k, v] of Object.entries(input.partial_args)) {
      if (v) lines.push(`  --${k} ${v}`);
    }
    lines.push('');
  }
  lines.push(`Available hardware ids in corpus (first ${input.context.available_hardware.length}):`);
  lines.push(`  ${input.context.available_hardware.slice(0, 30).join(', ')}`);
  if (input.context.available_hardware.length > 30) lines.push(`  ... (and ${input.context.available_hardware.length - 30} more)`);
  lines.push('');
  lines.push(`Available techniques in corpus:`);
  lines.push(`  ${input.context.available_techniques.join(', ') || '(none)'}`);
  lines.push('');
  lines.push(`Total pre-built (model, hardware) bundles: ${input.context.bundle_count}.`);
  lines.push('');
  lines.push(`Please extract the user's intent into one of two shapes:`);
  lines.push('');
  lines.push(`Shape A (complete extraction — confidence >= 0.7):`);
  lines.push(`{`);
  lines.push(`  "extracted_intent": {`);
  lines.push(`    "model": "<HF id or kebab slug>",`);
  lines.push(`    "hardware": "<one of the available_hardware ids above>",`);
  lines.push(`    "technique": "<one of available_techniques, or null>",`);
  lines.push(`    "workload": "chat | rag | code | math | long-context"`);
  lines.push(`  },`);
  lines.push(`  "confidence": 0.85,`);
  lines.push(`  "clarifying_questions": [],`);
  lines.push(`  "notes": "Mapped 'speed up SageAttention' to technique=sageattention; assumed long-context workload from CogVideoX context."`);
  lines.push(`}`);
  lines.push('');
  lines.push(`Shape B (ambiguous — confidence < 0.7):`);
  lines.push(`{`);
  lines.push(`  "extracted_intent": null,`);
  lines.push(`  "confidence": 0.4,`);
  lines.push(`  "clarifying_questions": [`);
  lines.push(`    "Which Ascend SKU should I target — 910B (HBM2e) or 910C (HBM3)? (Both in corpus.)",`);
  lines.push(`    "What's the priority — minimize TTFT, maximize throughput, or hit a specific tok/s target?"`);
  lines.push(`  ],`);
  lines.push(`  "notes": "Description doesn't disambiguate Ascend SKU; please clarify."`);
  lines.push(`}`);
  lines.push('');
  lines.push(`Be terse. Return ONLY the JSON, no preamble.`);

  return {
    prompt: lines.join('\n'),
    context_excerpt: input.context,
    expected_response_shape: {
      extracted_intent: 'object | null -- structured (model, hardware, technique?, workload?) or null if ambiguous',
      confidence: '0..1 -- how confident the extraction is',
      clarifying_questions: 'string[] -- 1-3 sharp questions when ambiguous',
      notes: 'string -- caveats / assumptions made',
    },
  };
}

/**
 * Parse the host LLM's response into a structured ClarifiedIntent. Robust
 * to common LLM response patterns (with/without ```json fences, with/
 * without preamble despite the "no preamble" instruction).
 */
export function parseClarifyResponse(response_text: string): ClarifiedIntent {
  // Strip ```json fences if present
  let cleaned = response_text.trim();
  const fence_match = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence_match) cleaned = fence_match[1].trim();
  // Find the first { ... } block
  const obj_start = cleaned.indexOf('{');
  const obj_end = cleaned.lastIndexOf('}');
  if (obj_start === -1 || obj_end === -1 || obj_end < obj_start) {
    return {
      confidence: 0,
      clarifying_questions: ['LLM response did not contain a parseable JSON object.'],
      notes: `Raw response:\n${response_text.slice(0, 500)}`,
    };
  }
  cleaned = cleaned.slice(obj_start, obj_end + 1);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    return {
      confidence: 0,
      clarifying_questions: [`LLM response was not valid JSON: ${(e as Error).message}`],
      notes: `Raw response:\n${response_text.slice(0, 500)}`,
    };
  }

  const extracted = parsed.extracted_intent as
    | { model?: string; hardware?: string; technique?: string; workload?: string }
    | null
    | undefined;
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  const questions = Array.isArray(parsed.clarifying_questions)
    ? (parsed.clarifying_questions as string[])
    : [];
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';

  if (extracted && extracted.model && extracted.hardware && confidence >= 0.5) {
    return {
      resolved: {
        model: extracted.model,
        hardware: extracted.hardware,
        technique: extracted.technique,
        workload: extracted.workload,
      },
      confidence,
      clarifying_questions: questions,
      notes,
    };
  }
  return { confidence, clarifying_questions: questions, notes };
}

/**
 * Format a ClarifiedIntent for terminal output when the harness needs to
 * surface clarifying questions to the user. Returns the text the agent
 * prints + an exit code (0 if resolved, 2 if questions remain).
 */
export function formatClarificationOutput(intent: ClarifiedIntent): {
  text: string;
  exit_code: number;
} {
  if (intent.resolved) {
    return {
      exit_code: 0,
      text:
        `\n✓ Intent extracted (confidence: ${intent.confidence.toFixed(2)}):\n` +
        `    --model    ${intent.resolved.model}\n` +
        `    --hardware ${intent.resolved.hardware}\n` +
        (intent.resolved.technique ? `    --technique ${intent.resolved.technique}\n` : '') +
        (intent.resolved.workload ? `    --workload ${intent.resolved.workload}\n` : '') +
        (intent.notes ? `\n  ${intent.notes}\n` : '') +
        `\nRe-run with the canonical flags above to deploy. (v3.28 will auto-route this in a single call.)\n`,
    };
  }
  return {
    exit_code: 2,
    text:
      `\n? Intent ambiguous (confidence: ${intent.confidence.toFixed(2)}). Please clarify:\n\n` +
      intent.clarifying_questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n') +
      (intent.notes ? `\n\n  ${intent.notes}\n` : '') +
      `\nRe-run with --description "<your original description, plus answers to the questions above>".\n`,
  };
}
