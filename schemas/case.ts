import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9.-]+$/);
const Pct = z.number().min(0).max(100);

export const BottleneckSchema = z.enum([
  'compute', 'memory-bandwidth', 'interconnect', 'software', 'mixed', 'unknown'
]);

const StackSchema = z.object({
  hardware: z.object({
    id: Slug,
    count: z.number().int().positive(),
    topology: z.string().default('single-node')
  }),
  server: z.object({ id: Slug }).optional(),
  interconnect: z.object({
    intra_node: z.string().min(1),
    inter_node: z.string().min(1)
  }),
  model: z.object({ id: Slug, weight_format: z.string().min(1) }),
  engine: z.object({ id: Slug, version: z.string().min(1) }),
  quantization: Slug,
  parallel: z.object({
    tp: z.number().int().positive(),
    pp: z.number().int().positive(),
    ep: z.number().int().positive(),
    sp: z.number().int().positive().default(1),
    disaggregated: z.boolean().default(false),
    disaggregated_split: z
      .object({
        prefill_cards: z.number().int().positive(),
        decode_cards: z.number().int().positive()
      })
      .optional()
  }),
  driver: z.string().min(1),
  os: z.string().min(1)
});

const ScenarioSchema = z.object({
  prefill_seq_len: z.number().int().positive(),
  decode_seq_len: z.number().int().positive(),
  batch_size: z.number().int().positive(),
  max_concurrent_requests: z.number().int().positive()
});

const ResultsSchema = z.object({
  throughput_tokens_per_sec: z.object({
    decode: z.number().nonnegative(),
    prefill: z.number().nonnegative()
  }),
  latency_ms: z.object({
    ttft_p50: z.number().nonnegative(),
    ttft_p99: z.number().nonnegative(),
    tbt_p50: z.number().nonnegative(),
    tbt_p99: z.number().nonnegative()
  }),
  memory_per_card_gb: z.number().nonnegative(),
  power_per_card_w: z.number().nonnegative(),
  utilization: z.object({ compute_pct: Pct, memory_bw_pct: Pct })
});

export const CaseSchema = z.object({
  id: Slug,
  title: z.string().min(1),
  submitted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  submitter: z.object({
    github: z.string().regex(/^@[a-zA-Z0-9-]+$/),
    affiliation: z.string().optional()
  }),
  stack: StackSchema,
  scenario: ScenarioSchema,
  results: ResultsSchema,
  bottleneck: BottleneckSchema,
  reproduction: z.object({
    startup_command: z.string().min(1),
    config_files: z.array(z.string()).default([]),
    benchmark_tool: z.string().min(1),
    notes_md: z.string().optional()
  }),
  issues_encountered: z.array(z.string()).default([]),
  patterns: z.array(Slug).default([]),
  evidence: z.array(EvidenceSchema).min(1)
});

export type Case = z.infer<typeof CaseSchema>;
