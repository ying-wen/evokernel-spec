/**
 * Operator × Hardware fitness analysis.
 *
 * For each (operator, hardware, precision) cell, determine whether the
 * operator is compute-bound or memory-bound on that hardware by comparing
 * the operator's typical arithmetic intensity range vs the hardware's
 * roofline ridge point at that precision.
 *
 * This is the missing cross-cutting view: given operator X, where does it
 * run efficiently? Answers structural questions like "attention is
 * memory-bound on every GPU/NPU in the corpus except wafer-scale Cerebras".
 */

import type { Hardware, Operator } from '@evokernel/schemas';

export type FitnessClass = 'memory-bound' | 'compute-bound' | 'regime-dependent' | 'unknown';

export interface OperatorFitnessCell {
  hardware: Hardware;
  precision: 'bf16' | 'fp16' | 'fp8-e4m3' | 'fp4' | 'int8';
  /** Hardware compute peak at this precision (TFLOPS). */
  peakTflops: number | null;
  /** Hardware memory bandwidth (GB/s). */
  peakBwGbps: number;
  /** Roofline ridge point: peakFlops / peakBytes (FLOP/byte). */
  ridgePoint: number;
  /** Operator's typical AI range. */
  aiMin: number;
  aiMax: number;
  /** Classification: compute / memory / regime-dependent. */
  fitnessClass: FitnessClass;
  /** Headroom: how far above/below ridge (in FLOP/byte). Negative = memory-bound. */
  ridgeHeadroom: number;
}

/**
 * For an operator on a single hardware at a single precision, classify the bound.
 */
export function classifyOperatorOnHardware(
  op: Operator,
  hw: Hardware,
  precision: OperatorFitnessCell['precision']
): OperatorFitnessCell | null {
  const aiTypical = op.arithmetic_intensity_typical;
  if (!aiTypical) return null;

  const compute = hw.compute as Record<string, { value: number } | null>;
  const peakTflopsKey = (
    precision === 'bf16' ? 'bf16_tflops' :
    precision === 'fp16' ? 'fp16_tflops' :
    precision === 'fp8-e4m3' ? 'fp8_tflops' :
    precision === 'fp4' ? 'fp4_tflops' :
    'int8_tops'
  );
  const peakTflops = compute[peakTflopsKey]?.value ?? null;
  const peakBwGbps = hw.memory.bandwidth_gbps?.value ?? 0;

  if (!peakTflops || !peakBwGbps) return null;

  const ridgePoint = (peakTflops * 1e12) / (peakBwGbps * 1e9);
  const aiMidpoint = (aiTypical.min + aiTypical.max) / 2;
  const ridgeHeadroom = aiMidpoint - ridgePoint;

  let fitnessClass: FitnessClass;
  if (aiTypical.max < ridgePoint * 0.6) {
    fitnessClass = 'memory-bound';
  } else if (aiTypical.min > ridgePoint * 1.5) {
    fitnessClass = 'compute-bound';
  } else {
    fitnessClass = 'regime-dependent';
  }

  return {
    hardware: hw,
    precision,
    peakTflops,
    peakBwGbps,
    ridgePoint,
    aiMin: aiTypical.min,
    aiMax: aiTypical.max,
    fitnessClass,
    ridgeHeadroom
  };
}

/**
 * Build full fitness table for an operator across all hardware at the
 * "natural" precision per hardware (highest-supported precision = the one
 * a real deployment would use).
 */
export function buildOperatorFitnessTable(
  op: Operator,
  hardware: Hardware[]
): OperatorFitnessCell[] {
  const cells: OperatorFitnessCell[] = [];
  for (const hw of hardware) {
    // Pick the lowest-precision (highest-throughput) supported by hardware
    const compute = hw.compute as Record<string, { value: number } | null>;
    let precision: OperatorFitnessCell['precision'];
    if (compute.fp4_tflops?.value) precision = 'fp4';
    else if (compute.fp8_tflops?.value) precision = 'fp8-e4m3';
    else if (compute.bf16_tflops?.value) precision = 'bf16';
    else if (compute.int8_tops?.value) precision = 'int8';
    else continue;

    const cell = classifyOperatorOnHardware(op, hw, precision);
    if (cell) cells.push(cell);
  }
  return cells;
}

/**
 * Aggregate fitness distribution across hardware corpus.
 */
export function summarizeFitness(cells: OperatorFitnessCell[]): {
  memoryBound: number;
  computeBound: number;
  regimeDependent: number;
  total: number;
} {
  const result = { memoryBound: 0, computeBound: 0, regimeDependent: 0, total: cells.length };
  for (const c of cells) {
    if (c.fitnessClass === 'memory-bound') result.memoryBound++;
    else if (c.fitnessClass === 'compute-bound') result.computeBound++;
    else if (c.fitnessClass === 'regime-dependent') result.regimeDependent++;
  }
  return result;
}
