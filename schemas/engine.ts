import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const EngineMaintainerSchema = z.enum(['community', 'vendor', 'commercial', 'mixed']);

/**
 * Quantization formats an engine can serve at inference time.
 * Roughly maps to the discriminator in `data/quantizations/`, but
 * declared as a flat enum here so engine YAML stays self-describing.
 */
export const EngineQuantSchema = z.enum([
  'fp32',
  'fp16',
  'bf16',
  'fp8-e4m3',
  'fp8-e5m2',
  'fp4-nvfp4',
  'fp4-mxfp4',
  'int8',
  'int4-gptq',
  'int4-awq',
  'int4-fp4-mixed',
  'int3'
]);

export const EngineParallelismSchema = z.enum([
  'tp', // tensor parallel
  'pp', // pipeline parallel
  'ep', // expert parallel (MoE)
  'sp', // sequence parallel
  'dp', // data parallel
  'cp' // context parallel (long-context)
]);

export const EngineServingFeatureSchema = z.enum([
  'paged-attention',
  'continuous-batching',
  'chunked-prefill',
  'prefix-cache',
  'speculative-decoding',
  'multi-lora',
  'structured-output',
  'tool-calling',
  'kv-cache-quant',
  'disaggregated-prefill-decode',
  'kv-cache-offload-cpu',
  'kv-cache-offload-disk',
  'multi-modal-vision',
  'multi-modal-audio',
  'tensor-rt-graph',
  'cuda-graphs',
  'flash-attention-v2',
  'flash-attention-v3',
  'radix-attention',
  'mooncake-disagg',
  'pd-disagg-router',
  'beam-search',
  'guided-decoding',
  'logit-bias',
  'logprobs',
  'streaming'
]);

export const EngineSpecDecodingSchema = z.enum([
  'draft-model',
  'medusa',
  'eagle',
  'eagle-2',
  'eagle-3',
  'lookahead',
  'mtp', // multi-token-prediction
  'self-speculative',
  'spec-infer'
]);

export const EngineFrontendProtocolSchema = z.enum([
  'openai-compat',
  'tgi-compat',
  'triton-tensorrt',
  'mlserver',
  'grpc-custom',
  'rest-custom',
  'websocket'
]);

export const EngineDeploymentTargetSchema = z.enum([
  'single-node',
  'multi-node',
  'k8s-operator',
  'ray-serve',
  'docker',
  'bare-metal',
  'cloud-managed'
]);

export const EngineProductionReadinessSchema = z.enum([
  'experimental',
  'beta',
  'stable',
  'production',
  'unknown'
]);

export const EngineSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  maintainer: EngineMaintainerSchema,
  source_url: z.string().url(),
  documentation_url: z.string().url().optional(),
  supported_hardware_vendors: z.array(Slug).min(1),
  latest_version: z.string().min(1),
  notes: z.string().optional(),

  // v1.42 capability matrix fields (all optional during migration)
  quantization_formats: z.array(EngineQuantSchema).optional(),
  parallelism_modes: z.array(EngineParallelismSchema).optional(),
  serving_features: z.array(EngineServingFeatureSchema).optional(),
  speculative_decoding: z.array(EngineSpecDecodingSchema).optional(),
  frontend_protocols: z.array(EngineFrontendProtocolSchema).optional(),
  deployment_targets: z.array(EngineDeploymentTargetSchema).optional(),
  production_readiness: EngineProductionReadinessSchema.optional(),

  // Optional: hand-written summary of strengths / weaknesses
  // shown on /engines/[slug]/ and the compare matrix
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  best_for: z.array(z.string()).optional(),

  // Optional: links to authoritative docs
  evidence: z.array(EvidenceSchema).optional()
});
export type Engine = z.infer<typeof EngineSchema>;
