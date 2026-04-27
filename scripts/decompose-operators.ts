// Auto-fill operator_decomposition (per-token FLOPs and bytes) for a model yaml.
// Reads model.architecture, computes approximate per-token cost for matmul-ffn,
// attention, optional moe-routing, and rmsnorm, and writes the result back.
//
// Usage:
//   pnpm tsx scripts/decompose-operators.ts data/models/<lab>/<id>.yaml
//
// Numbers are forward-only approximations meant for Roofline ceilings, not
// exact training cost. They will be refined by community calibration over time.

import fs from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { ModelSchema } from '@evokernel/schemas';

const path = process.argv[2];
if (!path) {
  console.error('Usage: pnpm tsx scripts/decompose-operators.ts <model.yaml>');
  process.exit(1);
}

const text = await fs.readFile(path, 'utf-8');
const model = ModelSchema.parse(parse(text));
const a = model.architecture;

const seqAvg = 4096;
const heads = a.num_attention_heads;
const kvHeads = a.num_kv_heads;
const hidden = a.hidden_size;
const ffn = a.ffn_size;
const layers = a.layers;

// FFN: 3 matmuls per layer (gate, up, down), each ~ 2 * hidden * ffn FLOPs per token
const matmulFfnFlops = layers * 2 * (3 * hidden * ffn);
// Attention: Q/K/V/O proj (4 matmuls of hidden*hidden) + scaled-dot-prod ~ 2*heads*seq*head_dim
const attnFlops = layers * (4 * hidden * hidden + 2 * heads * seqAvg * (hidden / heads));
// MoE routing: per-token gating cost
const moeRoutingFlops = a.moe ? layers * a.moe.num_experts * hidden : 0;
// RMSNorm: 5 ops per element * 2 norms per layer
const normFlops = layers * 2 * 5 * hidden;

// Bytes (BF16 weights = 2 bytes per param)
const bytesPerWeight = 2;
const matmulFfnBytes = layers * (3 * hidden * ffn) * bytesPerWeight;
const attnBytes =
  layers * (4 * hidden * hidden) * bytesPerWeight +
  layers * 2 * kvHeads * (hidden / heads) * seqAvg * bytesPerWeight; // K + V cache per token
const moeBytes = a.moe ? layers * a.moe.top_k * a.moe.expert_hidden_size * hidden * bytesPerWeight : 0;
const normBytes = layers * 2 * hidden * bytesPerWeight;

const decomp: Array<{ operator: string; flops_per_token: number; bytes_per_token: number }> = [
  { operator: 'matmul', flops_per_token: matmulFfnFlops, bytes_per_token: matmulFfnBytes },
  { operator: 'attention', flops_per_token: attnFlops, bytes_per_token: attnBytes },
  { operator: 'rmsnorm', flops_per_token: normFlops, bytes_per_token: normBytes }
];
if (a.moe) decomp.splice(2, 0, { operator: 'moe-gate', flops_per_token: moeRoutingFlops, bytes_per_token: moeBytes });

(model as { operator_decomposition: typeof decomp }).operator_decomposition = decomp;
await fs.writeFile(path, stringify(model, { lineWidth: 100 }), 'utf-8');

const totalFlops = decomp.reduce((s, d) => s + d.flops_per_token, 0);
const totalBytes = decomp.reduce((s, d) => s + d.bytes_per_token, 0);
console.log(`✓ ${model.id}: total ${totalFlops.toExponential(2)} FLOPs/token, ${totalBytes.toExponential(2)} bytes/token`);
