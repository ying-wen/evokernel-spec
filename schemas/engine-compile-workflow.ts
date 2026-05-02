import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9.-]+$/);

/**
 * EngineCompileWorkflow (v2.12).
 *
 * Captures the build-step BEFORE serving for engines that require model
 * compilation. Different engines have radically different compile-time
 * requirements:
 *
 *   - vLLM / SGLang: no compile (load HF weights → serve)
 *   - TensorRT-LLM:  trtllm-build → engine.bin (45-90 min, per-arch, per-precision)
 *   - MindIE:        ATB-models conversion → MindIE-format weights
 *   - lmdeploy:      lmdeploy convert → TurboMind format (fast, ~5 min)
 *   - llama.cpp:     llama-quantize → GGUF (CPU/edge inference)
 *
 * This entity captures: prerequisites, command, inputs/outputs, expected
 * duration, gotchas. Critical for production deployment because compile
 * step often surprises engineers ("why did Llama 4 take 90 min to start?").
 */

export const CompileTriggerSchema = z.enum([
  'one-time-build',           // build once, deploy artifact
  'first-load',               // engine compiles JIT on first model load
  'always-jit',               // every restart triggers JIT compile
  'optional-aot',             // AOT compile is optional perf optimization
  'never'                     // engine never requires compile (vLLM eager)
]);

const CompileStepSchema = z.object({
  step: z.string().min(1),
  command: z.string().optional(),
  duration_estimate: z.string().optional(),  // "5-10 min" / "60-90 min"
  notes: z.string().optional()
});

export const EngineCompileWorkflowSchema = z.object({
  id: Slug,
  engine_id: Slug,                          // references data/engines/<id>
  name: z.string().min(1),
  trigger: CompileTriggerSchema,

  /** Cards / archs this workflow applies to. */
  target_archs: z.array(z.string()).default([]),

  /** Prerequisites — what must be installed/configured first. */
  prerequisites: z.array(z.string()).default([]),

  /** Ordered build steps. */
  steps: z.array(CompileStepSchema).min(1),

  /** Inputs (model checkpoint / config / calibration data). */
  inputs: z.array(z.object({
    type: z.string(),                         // 'hf-checkpoint' | 'gguf' | 'safetensors' | 'calibration-set'
    description: z.string()
  })).default([]),

  /** Outputs (engine binary / quantized weights / calibration cache). */
  outputs: z.array(z.object({
    type: z.string(),
    description: z.string(),
    size_estimate: z.string().optional()      // "70 GB" / "200 MB"
  })).default([]),

  /** Total expected build wall-clock time. */
  total_duration_estimate: z.string(),

  /** Common pitfalls / gotchas. */
  gotchas: z.array(z.string()).default([]),

  /** Cache strategy — how to avoid rebuilding. */
  cache_strategy: z.string().optional(),

  /** Whether this workflow is reproducible bit-exactly. */
  reproducibility_notes: z.string().optional(),

  docs_url: z.string().url().optional(),
  source_url: z.string().url().optional(),
  evidence: z.array(EvidenceSchema).default([])
});

export type EngineCompileWorkflow = z.infer<typeof EngineCompileWorkflowSchema>;
