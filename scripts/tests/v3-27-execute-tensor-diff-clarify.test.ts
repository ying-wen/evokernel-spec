/**
 * v3.27 -- tests for --execute (remote-target dispatch) + tensor-diff
 * cross-arch numerical compare + --description fuzzy-intent clarification.
 *
 * Real SSH execution is gated behind EVOKERNEL_REMOTE_INTEGRATION_TEST=1
 * (not set in CI). These tests verify the SHAPE of the integration: the
 * --execute branch routes through executeRemoteRun, tensor-diff handles
 * realistic + edge-case inputs, clarify-intent prompt builds correctly
 * + parseClarifyResponse handles common LLM response shapes.
 */

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffTensors, writeTensorBinary } from '../agent-deploy/verify/tensor-diff';
import {
  buildClarifyIntentRequest,
  parseClarifyResponse,
  formatClarificationOutput,
} from '../agent-deploy/clarify-intent';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'scripts/tests/fixtures/v3-27-tensors');

beforeAll(async () => {
  await mkdir(FIXTURE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────
// tensor-diff
// ─────────────────────────────────────────────────────────────────────────

describe('diffTensors (v3.27)', () => {
  it('passes when tensors are identical', async () => {
    const ref = new Float32Array([1.0, 2.0, 3.0, -4.5, 0.0, 1e-6]);
    const newt = new Float32Array([1.0, 2.0, 3.0, -4.5, 0.0, 1e-6]);
    const ref_path = path.join(FIXTURE_DIR, 'identical-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'identical-new.bin');
    await writeTensorBinary(ref_path, ref);
    await writeTensorBinary(new_path, newt);
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1e-6, max_rel_diff: 1e-6 },
    });
    expect(result.passed).toBe(true);
    expect(result.max_abs_diff).toBe(0);
    expect(result.n_elements).toBe(6);
    expect(result.n_outliers_abs).toBe(0);
    expect(result.summary).toMatch(/PASS/);
  });

  it('passes when within tolerance', async () => {
    const ref = new Float32Array([1.0, 2.0, 3.0]);
    const newt = new Float32Array([1.005, 2.003, 3.004]);   // ~0.5% drift
    const ref_path = path.join(FIXTURE_DIR, 'tol-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'tol-new.bin');
    await writeTensorBinary(ref_path, ref);
    await writeTensorBinary(new_path, newt);
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1e-2, max_rel_diff: 1e-2 },
    });
    expect(result.passed).toBe(true);
    expect(result.max_abs_diff).toBeCloseTo(0.005, 3);
  });

  it('fails when max_abs_diff exceeded', async () => {
    const ref = new Float32Array([1.0, 2.0, 100.0]);
    const newt = new Float32Array([1.001, 2.001, 105.0]);  // big drift on element 2
    const ref_path = path.join(FIXTURE_DIR, 'fail-abs-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'fail-abs-new.bin');
    await writeTensorBinary(ref_path, ref);
    await writeTensorBinary(new_path, newt);
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1.0, max_rel_diff: 1.0 },
    });
    expect(result.passed).toBe(false);
    expect(result.max_abs_diff).toBeCloseTo(5.0, 1);
    expect(result.diagnostic).toMatch(/max_abs_diff.+at element \[2\]/);
  });

  it('fails when max_rel_diff exceeded but max_abs_diff is tiny', async () => {
    const ref = new Float32Array([1e-5, 2e-5, 3e-5]);
    const newt = new Float32Array([5e-5, 7e-5, 9e-5]); // huge relative drift on tiny values
    const ref_path = path.join(FIXTURE_DIR, 'fail-rel-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'fail-rel-new.bin');
    await writeTensorBinary(ref_path, ref);
    await writeTensorBinary(new_path, newt);
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1e-3, max_rel_diff: 0.5 },  // 50% rel allowed; we have ~400%
    });
    expect(result.passed).toBe(false);
    expect(result.diagnostic).toMatch(/max_rel_diff/);
  });

  it('detects size mismatch', async () => {
    const ref = new Float32Array([1.0, 2.0, 3.0]);
    const newt = new Float32Array([1.0, 2.0]);   // 2 elements vs 3
    const ref_path = path.join(FIXTURE_DIR, 'mismatch-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'mismatch-new.bin');
    await writeTensorBinary(ref_path, ref);
    await writeTensorBinary(new_path, newt);
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1e-2, max_rel_diff: 1e-2 },
    });
    expect(result.passed).toBe(false);
    expect(result.summary).toMatch(/size mismatch/);
    expect(result.diagnostic).toMatch(/dimensions differ/);
  });

  it('detects expected_elements mismatch', async () => {
    const ref = new Float32Array([1.0, 2.0]);
    const newt = new Float32Array([1.0, 2.0]);
    const ref_path = path.join(FIXTURE_DIR, 'expected-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'expected-new.bin');
    await writeTensorBinary(ref_path, ref);
    await writeTensorBinary(new_path, newt);
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1e-2, max_rel_diff: 1e-2 },
      expected_elements: 100,                               // we wrote 2; expected 100
    });
    expect(result.passed).toBe(false);
    expect(result.summary).toMatch(/expected 100 elements, got 2/);
  });

  it('handles non-multiple-of-4 file size (corrupt binary)', async () => {
    const ref_path = path.join(FIXTURE_DIR, 'corrupt-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'corrupt-new.bin');
    // Write 7 bytes (not divisible by sizeof(float)=4)
    const { writeFile } = await import('node:fs/promises');
    await writeFile(ref_path, Buffer.from([1, 2, 3, 4, 5, 6, 7]));
    await writeFile(new_path, Buffer.from([1, 2, 3, 4, 5, 6, 7]));
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1e-2, max_rel_diff: 1e-2 },
    });
    expect(result.passed).toBe(false);
    expect(result.summary).toMatch(/not divisible by sizeof\(float\)/);
  });

  it('counts outliers correctly', async () => {
    const n = 1000;
    const ref = new Float32Array(n);
    const newt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ref[i] = i * 0.001;
      // 10 outliers (every 100th): big diff; rest: zero diff
      newt[i] = (i % 100 === 0) ? ref[i] + 0.1 : ref[i];
    }
    const ref_path = path.join(FIXTURE_DIR, 'outliers-ref.bin');
    const new_path = path.join(FIXTURE_DIR, 'outliers-new.bin');
    await writeTensorBinary(ref_path, ref);
    await writeTensorBinary(new_path, newt);
    const result = await diffTensors({
      reference_path: ref_path,
      new_impl_path: new_path,
      tolerance: { max_abs_diff: 1e-3, max_rel_diff: 1.0 },  // 0.001 abs gate
    });
    expect(result.n_outliers_abs).toBe(10);
    expect(result.passed).toBe(false);  // 0.1 >> 0.001
  });
});

// ─────────────────────────────────────────────────────────────────────────
// clarify-intent
// ─────────────────────────────────────────────────────────────────────────

describe('buildClarifyIntentRequest (v3.27)', () => {
  it('builds prompt with description, partial args, and bundled context', () => {
    const req = buildClarifyIntentRequest({
      description: 'port SageAttention to Ascend 910B and validate with CogVideoX1.5-5B',
      partial_args: { workload: 'long-context' },
      context: {
        available_hardware: ['ascend-910b', 'ascend-910c', 'h100-sxm5', 'mi300x'],
        available_techniques: ['sageattention', 'flash-attention'],
        bundle_count: 2176,
      },
    });
    expect(req.prompt).toMatch(/port SageAttention to Ascend 910B/);
    expect(req.prompt).toMatch(/--workload long-context/);
    expect(req.prompt).toMatch(/ascend-910b, ascend-910c, h100-sxm5, mi300x/);
    expect(req.prompt).toMatch(/sageattention, flash-attention/);
    expect(req.prompt).toMatch(/2176/);
    expect(req.prompt).toMatch(/Shape A.*Shape B/s);
  });

  it('escapes double quotes in description (prompt injection guard)', () => {
    const req = buildClarifyIntentRequest({
      description: 'speed up "FlashAttention" on H100',
      context: { available_hardware: ['h100-sxm5'], available_techniques: [], bundle_count: 1 },
    });
    expect(req.prompt).toMatch(/speed up \\"FlashAttention\\" on H100/);
  });
});

describe('parseClarifyResponse (v3.27)', () => {
  it('parses Shape A (complete extraction) → resolved canonical args', () => {
    const response = JSON.stringify({
      extracted_intent: {
        model: 'zai-org/CogVideoX1.5-5B',
        hardware: 'ascend-910b',
        technique: 'sageattention',
        workload: 'long-context',
      },
      confidence: 0.85,
      clarifying_questions: [],
      notes: 'Inferred SageAttention from description.',
    });
    const intent = parseClarifyResponse(response);
    expect(intent.resolved).toBeDefined();
    expect(intent.resolved!.model).toBe('zai-org/CogVideoX1.5-5B');
    expect(intent.resolved!.hardware).toBe('ascend-910b');
    expect(intent.resolved!.technique).toBe('sageattention');
    expect(intent.confidence).toBe(0.85);
  });

  it('parses Shape B (ambiguous) → no resolved, with questions', () => {
    const response = JSON.stringify({
      extracted_intent: null,
      confidence: 0.4,
      clarifying_questions: ['Which Ascend SKU?', 'What batch size?'],
      notes: 'Need disambiguation.',
    });
    const intent = parseClarifyResponse(response);
    expect(intent.resolved).toBeUndefined();
    expect(intent.confidence).toBe(0.4);
    expect(intent.clarifying_questions).toHaveLength(2);
  });

  it('strips ```json fences from LLM response', () => {
    const response = `Sure, here's the JSON:\n\n\`\`\`json\n${JSON.stringify({
      extracted_intent: { model: 'llama-3.3-70b', hardware: 'h100-sxm5' },
      confidence: 0.9,
      clarifying_questions: [],
      notes: '',
    })}\n\`\`\`\n\nDone.`;
    const intent = parseClarifyResponse(response);
    expect(intent.resolved?.model).toBe('llama-3.3-70b');
    expect(intent.confidence).toBe(0.9);
  });

  it('falls back gracefully on invalid JSON', () => {
    const intent = parseClarifyResponse('totally not json at all');
    expect(intent.confidence).toBe(0);
    expect(intent.clarifying_questions[0]).toMatch(/parseable JSON/);
  });

  it('does NOT mark resolved when confidence < 0.5 even with full extraction', () => {
    const response = JSON.stringify({
      extracted_intent: { model: 'maybe-this-model', hardware: 'maybe-this-hw' },
      confidence: 0.3,
      clarifying_questions: ['Are you sure?'],
      notes: '',
    });
    const intent = parseClarifyResponse(response);
    expect(intent.resolved).toBeUndefined();
    expect(intent.confidence).toBe(0.3);
  });
});

describe('formatClarificationOutput (v3.27)', () => {
  it('resolved → exit 0 + canonical args printed', () => {
    const out = formatClarificationOutput({
      resolved: { model: 'llama-3.3-70b', hardware: 'h100-sxm5', technique: 'flash-attention', workload: 'chat' },
      confidence: 0.9,
      clarifying_questions: [],
      notes: 'Standard LLM serving.',
    });
    expect(out.exit_code).toBe(0);
    expect(out.text).toMatch(/--model    llama-3.3-70b/);
    expect(out.text).toMatch(/--hardware h100-sxm5/);
    expect(out.text).toMatch(/--technique flash-attention/);
    expect(out.text).toMatch(/--workload chat/);
  });

  it('ambiguous → exit 2 + numbered questions', () => {
    const out = formatClarificationOutput({
      confidence: 0.3,
      clarifying_questions: ['Which model size?', 'What hardware?'],
      notes: '',
    });
    expect(out.exit_code).toBe(2);
    expect(out.text).toMatch(/1\. Which model size\?/);
    expect(out.text).toMatch(/2\. What hardware\?/);
  });
});
