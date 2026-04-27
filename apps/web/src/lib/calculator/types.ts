export type Precision = 'fp4' | 'fp8' | 'bf16' | 'fp16' | 'int8';

export interface CalcInput {
  modelId: string;
  hardware: { id: string; count: number };
  scenario: {
    prefillSeqLen: number;
    decodeSeqLen: number;
    batchSize: number;
    concurrency: number;
  };
  precision: Precision;
  parallel: { tp: number; pp: number; ep: number; sp: number };
  engineId: string;
  disaggregated: { enabled: boolean; prefillCards?: number; decodeCards?: number };
}

export interface RooflineOutput {
  arithmeticIntensity: number;
  peakComputeTflops: number;
  peakMemoryBwGbps: number;
  ridgePoint: number;
  isComputeBound: boolean;
  utilizationCeiling: number;
  decodeThroughputUpperBound: number;
  prefillThroughputUpperBound: number;
}

export interface CaseMatch {
  caseId: string;
  caseTitle: string;
  throughputDecode: number;
  throughputPrefill: number;
  matchScore: number;
}

export interface CalcOutput {
  tier0Cases: CaseMatch[];
  tier1Roofline: RooflineOutput;
  configCheck: {
    feasible: boolean;
    warnings: string[];
    memoryRequiredGb: number;
    memoryAvailableGb: number;
    weightsGb: number;
    kvCacheGb: number;
  };
  recommendations: string[];
  formulaTrace: string[];
}
