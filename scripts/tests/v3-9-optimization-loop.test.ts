/**
 * v3.9 — Continuous optimization loop unit tests.
 *
 * Tests the perf-cliff retry trigger (in feedback.ts) + auto-PR aggregation
 * (in auto-pr.ts).
 */

import { describe, expect, it } from 'vitest';
import { detectPerfCliff } from '../agent-deploy/feedback';
import { aggregateLearnings, type AgentLearning } from '../agent-deploy/auto-pr';
import type { VerifyResult } from '../agent-deploy/verify';

// ─────────────────────────────────────────────────────────────────────────
// Perf-cliff detection
// ─────────────────────────────────────────────────────────────────────────

const fakeVerifyWithPerf = (measured?: number): VerifyResult => ({
  overall: 'pass',
  mode: 'execution',
  v1_build: { status: 'pass', message: 'ok', structural_checks: [], duration_ms: 0 },
  v2_correctness: { status: 'pass', message: 'ok', checks: [], duration_ms: 0 },
  v3_perf: {
    status: 'pass',
    message: 'ok',
    checks: [],
    delta: measured !== undefined
      ? { predicted_tok_s: 100, measured_tok_s: measured, delta_pct: ((100 - measured) / 100) * 100, passed: true }
      : undefined,
    profiler_output: 'mock NCU output: SM utilization 30%',
    duration_ms: 0,
  },
  summary_md: '',
  duration_ms: 0,
});

describe('detectPerfCliff', () => {
  it('returns null when no predicted tok/s provided', () => {
    expect(detectPerfCliff(fakeVerifyWithPerf(50), undefined, 30)).toBeNull();
  });

  it('returns null when V3 measured tok/s is missing (structural mode)', () => {
    expect(detectPerfCliff(fakeVerifyWithPerf(undefined), 100, 30)).toBeNull();
  });

  it('returns null when measured perf is within tolerance', () => {
    // measured 90, predicted 100 → 10% slower → within 30% threshold
    expect(detectPerfCliff(fakeVerifyWithPerf(90), 100, 30)).toBeNull();
  });

  it('returns null when measured perf is above prediction', () => {
    // measured 120, predicted 100 → -20% (faster) → no cliff
    expect(detectPerfCliff(fakeVerifyWithPerf(120), 100, 30)).toBeNull();
  });

  it('returns diagnostic when measured perf is below threshold', () => {
    // measured 50, predicted 100 → 50% slower → cliff (threshold 30)
    const diagnostic = detectPerfCliff(fakeVerifyWithPerf(50), 100, 30);
    expect(diagnostic).toBeTruthy();
    expect(diagnostic).toContain('PERF CLIFF DETECTED');
    expect(diagnostic).toContain('50.0% below prediction');
    expect(diagnostic).toContain('Likely root causes');
  });

  it('respects custom threshold', () => {
    // measured 80, predicted 100 → 20% slower
    expect(detectPerfCliff(fakeVerifyWithPerf(80), 100, 30)).toBeNull(); // 20% < 30%
    expect(detectPerfCliff(fakeVerifyWithPerf(80), 100, 15)).toBeTruthy(); // 20% > 15%
  });

  it('includes profiler hint in diagnostic when available', () => {
    const diagnostic = detectPerfCliff(fakeVerifyWithPerf(40), 100, 30);
    expect(diagnostic).toContain('SM utilization 30%');
  });

  it('handles zero measured (edge case — kernel not actually running)', () => {
    expect(detectPerfCliff(fakeVerifyWithPerf(0), 100, 30)).toBeNull();
  });

  it('handles negative threshold (degenerate input — always trigger)', () => {
    // 0% slower vs threshold -10% → 0 > -10 → cliff
    expect(detectPerfCliff(fakeVerifyWithPerf(100), 100, -10)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Auto-PR aggregation
// ─────────────────────────────────────────────────────────────────────────

const learning1: AgentLearning = {
  id: 'qwen3-on-ascend-2026-05-01',
  agent_run_at: '2026-05-01T10:00:00Z',
  model_id: 'qwen3.6-plus',
  hardware_id: 'ascend-910c',
  engine_id: 'mindie',
  outcome: 'partial',
  observations: [
    {
      kind: 'missing-primitive',
      isa_primitive: 'huawei-ascend-vector-fp32',
      description: 'Vector unit FP32 path missing from corpus',
      proposed_corpus_update: 'Add huawei-ascend-vector-fp32 ISA primitive entry',
    },
  ],
  triage_status: 'open',
};

const learning2: AgentLearning = {
  id: 'llama4-on-ascend-2026-05-02',
  agent_run_at: '2026-05-02T11:00:00Z',
  model_id: 'llama-4-scout',
  hardware_id: 'ascend-910c',
  engine_id: 'mindie',
  outcome: 'partial',
  observations: [
    {
      kind: 'missing-primitive',
      isa_primitive: 'huawei-ascend-vector-fp32',
      description: 'Same FP32 fallback gap encountered for Llama 4',
      proposed_corpus_update: 'Same as qwen3 run; double-confirm priority',
    },
  ],
  triage_status: 'open',
};

const learning3: AgentLearning = {
  id: 'glm5-on-h100-2026-05-03',
  agent_run_at: '2026-05-03T12:00:00Z',
  model_id: 'glm-5.1',
  hardware_id: 'h100-sxm5',
  engine_id: 'vllm',
  outcome: 'shipped',
  observations: [
    {
      kind: 'success-pattern',
      op_or_kernel: 'fused-rope-qkv',
      description: 'Layer G generated working code first attempt',
    },
  ],
  triage_status: 'open',
};

describe('aggregateLearnings', () => {
  it('returns empty clusters when learnings is empty', () => {
    const result = aggregateLearnings([]);
    expect(result.clusters).toEqual([]);
    expect(result.input_summary.total_learnings).toBe(0);
  });

  it('clusters duplicate observations across runs', () => {
    const result = aggregateLearnings([learning1, learning2], { min_signal: 2 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].signal_strength).toBe(2);
    expect(result.clusters[0].kind).toBe('isa-primitive-add');
    expect(result.clusters[0].contributing_learnings).toContain('qwen3-on-ascend-2026-05-01');
    expect(result.clusters[0].contributing_learnings).toContain('llama4-on-ascend-2026-05-02');
  });

  it('filters out single-occurrence observations by default (min_signal=2)', () => {
    const result = aggregateLearnings([learning1]);
    expect(result.clusters).toEqual([]);
  });

  it('honors min_signal=1 to include single-occurrence', () => {
    const result = aggregateLearnings([learning1], { min_signal: 1 });
    expect(result.clusters).toHaveLength(1);
  });

  it('skips success-pattern observations from clustering', () => {
    const result = aggregateLearnings([learning3], { min_signal: 1 });
    expect(result.clusters).toEqual([]);
  });

  it('ignores merged + wont-fix learnings by default', () => {
    const merged: AgentLearning = { ...learning1, triage_status: 'merged' };
    const result = aggregateLearnings([merged, learning2], { min_signal: 2 });
    // learning2 alone is signal_strength 1; doesn't reach min_signal 2
    expect(result.clusters).toEqual([]);
  });

  it('includes merged when only_open=false', () => {
    const merged: AgentLearning = { ...learning1, triage_status: 'merged' };
    const result = aggregateLearnings([merged, learning2], { min_signal: 2, only_open: false });
    expect(result.clusters).toHaveLength(1);
  });

  it('produces well-formed Markdown report', () => {
    const result = aggregateLearnings([learning1, learning2], { min_signal: 2 });
    expect(result.report_md).toContain('# Auto-PR Drafts');
    expect(result.report_md).toContain('Add ISA primitive');
    expect(result.report_md).toContain('huawei-ascend-vector-fp32');
    expect(result.report_md).toContain('## Suggested files to add/modify');
  });

  it('classifies cluster kinds correctly', () => {
    const kernelGap: AgentLearning = {
      ...learning1,
      observations: [
        { kind: 'kernel-gap', op_or_kernel: 'fused-radix-attention', description: 'no SGLang impl on ascend' },
      ],
    };
    const kernelGap2: AgentLearning = { ...learning2, observations: kernelGap.observations };
    const result = aggregateLearnings([kernelGap, kernelGap2], { min_signal: 2 });
    expect(result.clusters[0].kind).toBe('dsl-example-add');
  });

  it('input summary reflects triage_status counts', () => {
    const merged: AgentLearning = { ...learning1, triage_status: 'merged' };
    const wontFix: AgentLearning = { ...learning2, triage_status: 'wont-fix' };
    const result = aggregateLearnings([learning3, merged, wontFix], { only_open: false });
    expect(result.input_summary.total_learnings).toBe(3);
    expect(result.input_summary.open).toBe(1);
    expect(result.input_summary.merged).toBe(1);
    expect(result.input_summary.wont_fix).toBe(1);
  });
});
