/**
 * Bottleneck → Pattern recommendation map.
 *
 * Each Bottleneck classification maps to the patterns that *materially*
 * address that bound. The mapping is hand-curated rather than derived —
 * patterns target specific machine constraints (memory-BW, compute, comm)
 * and not all patterns help every bound.
 *
 * Used by case detail pages to surface "your case is X-bound; consider
 * patterns Y" — closing the diagnosis loop between concrete measurement
 * and the optimization knowledge graph.
 */

import type { Bottleneck, Pattern, Playbook, Case } from '@evokernel/schemas';

export type BottleneckRecommendation = {
  bottleneck: Bottleneck;
  /** Why this bottleneck happens at the architecture level. */
  diagnosis_zh: string;
  /** Pattern ids that materially address this bottleneck. */
  pattern_ids: string[];
  /** Pipeline stages most relevant to fixing this bottleneck. */
  stage_ids: string[];
  /** Brief actionable advice. */
  advice_zh: string;
};

export const BOTTLENECK_MAP: Record<Bottleneck, Omit<BottleneckRecommendation, 'bottleneck'>> = {
  'memory-bandwidth': {
    diagnosis_zh: 'Decode 阶段 attention + GEMM 都需要从 HBM 读全部权重一次, 算力空闲. 算术强度 (FLOP/byte) 远低于 ridge point.',
    pattern_ids: [
      'memory-bound-decode-prefer-int8',
      'kv-cache-int8',
      'fp4-weight-only-quant',
      'kv-cache-cpu-offload',
      'speculative-decoding',
      'mtp-multi-token-prediction',
      'flashattention-v3',
      'paged-attention'
    ],
    stage_ids: ['quantize', 'compile', 'serve'],
    advice_zh: '量化 (FP8/INT8/FP4) 是最直接路径; spec decode 把空闲算力填回; 长会话用 KV CPU offload 释放 HBM.'
  },
  compute: {
    diagnosis_zh: 'Prefill 阶段 long context attention + 大 batch GEMM 撑满 tensor cores. 算术强度高于 ridge point.',
    pattern_ids: [
      'flashattention-v3',
      'sliding-window-attention',
      'ring-attention-long-context',
      'fp4-weight-only-quant',
      'prefix-radix-cache',
      'disaggregated-prefill-decode'
    ],
    stage_ids: ['compile', 'shard', 'serve'],
    advice_zh: 'Compute-bound 时主要看是否能升级到更新硬件 (Hopper→Blackwell) 或更激进量化. 启用 prefix-radix-cache 减少重复 prefill 计算.'
  },
  interconnect: {
    diagnosis_zh: 'TP/EP 跨卡 all-reduce / all-gather 占大比例时间. Fabric (NVLink / HCCS / RoCE) 是瓶颈, 不是计算或内存.',
    pattern_ids: [
      'disaggregated-prefill-decode',
      'moe-expert-routing-on-domestic',
      'paged-attention'
    ],
    stage_ids: ['shard', 'serve'],
    advice_zh: '检查 NCCL/HCCL 拓扑; 是否启用 SHARP (NVSwitch reduce-in-network); 跨节点 EP 改成 intra-node-only 大幅降通信. 升级 fabric (NVLink-4 → NVLink-5 / RoCE-200G → -400G).'
  },
  software: {
    diagnosis_zh: '硬件未饱和 (GPU SM% < 80%, HBM% < 70%), 软件栈在调度 / kernel launch / 同步 / 缺 fused kernel 上有瓶颈.',
    pattern_ids: [
      'continuous-batching',
      'paged-attention',
      'flashattention-v3',
      'prefix-radix-cache',
      'prefix-caching'
    ],
    stage_ids: ['compile', 'serve', 'observe'],
    advice_zh: '升级引擎版本 (vLLM 0.5+ → 0.6+ → 0.7+, SGLang 同理); 检查是否启用 CUDA Graph capture; 跑 nsys profile 找具体软件 bottleneck.'
  },
  mixed: {
    diagnosis_zh: '多个维度同时受限 — 通常意味着配置失衡 (TP/EP 选错 / quant 选错 / engine 配置不当).',
    pattern_ids: [
      'memory-bound-decode-prefer-int8',
      'flashattention-v3',
      'continuous-batching',
      'paged-attention'
    ],
    stage_ids: ['quantize', 'compile', 'shard', 'serve'],
    advice_zh: 'Mixed bottleneck 往往是 engineering 问题 — 先做 nsys / rocprof profiling 隔离主导 bound, 再针对性优化.'
  },
  unknown: {
    diagnosis_zh: '未做 profiling, 或测量不全. 不知道瓶颈在哪.',
    pattern_ids: [],
    stage_ids: ['observe'],
    advice_zh: '部署诊断必备: 1) nsys / rocprof profile, 2) GPU SM% + HBM% + NVLink% 监控, 3) 与 ridge point 对比定位 bound.'
  }
};

/**
 * Get pattern recommendation for a case based on its bottleneck.
 */
export function recommendPatternsForCase(
  caseEntity: Case,
  allPatterns: Pattern[]
): { recommendation: BottleneckRecommendation; matchedPatterns: Pattern[] } {
  const map = BOTTLENECK_MAP[caseEntity.bottleneck];
  const matchedPatterns = allPatterns.filter((p) => map.pattern_ids.includes(p.id));
  return {
    recommendation: { bottleneck: caseEntity.bottleneck, ...map },
    matchedPatterns
  };
}

/**
 * Get cases grouped by bottleneck for distribution view.
 */
export function groupCasesByBottleneck(cases: Case[]): Record<Bottleneck, Case[]> {
  const groups: Record<Bottleneck, Case[]> = {
    'memory-bandwidth': [],
    compute: [],
    interconnect: [],
    software: [],
    mixed: [],
    unknown: []
  };
  for (const c of cases) {
    groups[c.bottleneck].push(c);
  }
  return groups;
}

/** Localized labels for bottlenecks (zh). */
export const BOTTLENECK_LABEL_ZH: Record<Bottleneck, string> = {
  'memory-bandwidth': '内存带宽 (Memory-BW)',
  compute: '算力 (Compute)',
  interconnect: '互联 (Interconnect)',
  software: '软件 / 调度 (Software)',
  mixed: '混合 (Mixed)',
  unknown: '未知 (Unknown)'
};

/** Color hint per bottleneck for visual differentiation. */
export const BOTTLENECK_COLOR: Record<Bottleneck, string> = {
  'memory-bandwidth': 'var(--color-tier-estimated)',  // amber
  compute: 'var(--color-accent)',                      // primary
  interconnect: 'var(--color-tier-measured)',          // green
  software: 'var(--color-tier-official)',              // blue
  mixed: 'var(--color-text-muted)',                    // gray
  unknown: 'var(--color-text-muted)'
};
