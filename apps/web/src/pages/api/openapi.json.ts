import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://evokernel.dev')).toString().replace(/\/$/, '');

  // Hand-curated OpenAPI 3.1 spec describing the static JSON endpoints.
  // The detailed entity schemas are intentionally summarized — full Zod schemas
  // live at /github.com/evokernel/evokernel-spec/tree/main/schemas.
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'EvoKernel Spec Open Data API',
      version: '2.4.0',
      description:
        'Open data API for AI inference deployment knowledge — hardware, models, cases, operators, fused kernels, playbooks, plus a constraint-solver endpoint for agents (/api/solve.json). Static endpoints regenerated on every site build. Data licensed under CC-BY-SA-4.0.',
      license: { name: 'CC-BY-SA-4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
      contact: { url: 'https://github.com/evokernel/evokernel-spec' }
    },
    servers: [{ url: base }],
    paths: {
      '/api/index.json': {
        get: {
          summary: 'API descriptor',
          description: 'Top-level metadata, entity counts, and links to all endpoints.',
          responses: {
            '200': {
              description: 'API descriptor',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiDescriptor' } } }
            }
          }
        }
      },
      '/api/hardware.json': {
        get: {
          summary: 'All hardware (accelerator cards) with resolved vendor',
          responses: {
            '200': {
              description: 'List response',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/HardwareList' } } }
            }
          }
        }
      },
      '/api/models.json': {
        get: {
          summary: 'All frontier open-source models with operator decomposition',
          responses: {
            '200': {
              description: 'List response',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ModelList' } } }
            }
          }
        }
      },
      '/api/cases.json': {
        get: {
          summary: 'All deployment cases with resolved stack (hardware/server/model/engine/quantization)',
          responses: {
            '200': {
              description: 'List response',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/CaseList' } } }
            }
          }
        }
      },
      '/cases.xml': {
        get: {
          summary: 'RSS feed of newest cases',
          responses: {
            '200': { description: 'RSS 2.0 XML', content: { 'application/rss+xml': { schema: { type: 'string' } } } }
          }
        }
      },
      '/api/operators.json': {
        get: {
          summary: 'All operators with FLOPs/byte formulas, arithmetic intensity, and engine implementations (v2.4)',
          description:
            'Each operator carries its FLOPs and bytes formulas (currently as text — evolving to evaluable expressions in v2.5), arithmetic intensity range, fusion targets, and per-engine kernel implementations tagged with hardware_arch. Primary input for agent kernel-codegen.',
          responses: {
            '200': {
              description: 'List response',
              content: { 'application/json': { schema: { type: 'object' } } }
            }
          }
        }
      },
      '/api/fused-kernels.json': {
        get: {
          summary: 'All fused kernels (FlashAttention-3, PagedAttention, FusedMoE-DeepEP, etc.) (v2.4)',
          description:
            'Production-grade kernels that fold multiple atomic ops. Each entry lists the operators folded, engines that ship it, and hardware archs covered.',
          responses: {
            '200': { description: 'List response', content: { 'application/json': { schema: { type: 'object' } } } }
          }
        }
      },
      '/api/playbooks.json': {
        get: {
          summary: '(model archetype × hardware class) recipes (v2.4)',
          description:
            'Pre-encoded recipes giving recommended quantization, parallelism, engine, and expected $/M-token range for each (model archetype × hardware class) cell. Use as a prior before constraint solving.',
          responses: {
            '200': { description: 'List response', content: { 'application/json': { schema: { type: 'object' } } } }
          }
        }
      },
      '/api/solve.json': {
        get: {
          summary: 'Flat enumeration of all configurations (cases + playbooks) for client-side filtering (v2.4)',
          description:
            'Static endpoint returning every measured case and every playbook recommendation as a unified `Configuration` shape with derived `dollars_per_m_tokens_estimate` and `default_score` fields. Consumers filter client-side. Includes `query_examples` showing common filter idioms. SSG limitation: no query params; clients filter the array.',
          responses: {
            '200': { description: 'Solve response', content: { 'application/json': { schema: { type: 'object' } } } }
          }
        }
      }
    },
    components: {
      schemas: {
        ApiDescriptor: {
          type: 'object',
          required: ['name', 'license', 'version', 'counts', 'endpoints'],
          properties: {
            name: { type: 'string' },
            license: { type: 'string', example: 'CC-BY-SA-4.0' },
            code_license: { type: 'string', example: 'Apache-2.0' },
            version: { type: 'string', example: 'v1' },
            description: { type: 'string' },
            generated: { type: 'string', format: 'date-time' },
            counts: { type: 'object', additionalProperties: { type: 'integer' } },
            endpoints: { type: 'object', additionalProperties: { type: 'string', format: 'uri' } },
            contribution: { type: 'string', format: 'uri' }
          }
        },
        Tier: { type: 'string', enum: ['official', 'measured', 'estimated'] },
        Evidence: {
          type: 'object',
          required: ['id', 'tier', 'source_type', 'url', 'accessed', 'citation'],
          properties: {
            id: { type: 'string', pattern: '^ev-[a-z0-9-]+$' },
            tier: { $ref: '#/components/schemas/Tier' },
            source_type: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            accessed: { type: 'string', format: 'date' },
            citation: { type: 'string' },
            raw_data_url: { type: 'string', format: 'uri' },
            contributor_attestation: { type: 'string' }
          }
        },
        ValueWithEvidence: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              required: ['value', 'evidence_ref'],
              properties: { value: { type: 'number' }, evidence_ref: { type: 'string', pattern: '^ev-[a-z0-9-]+$' } }
            }
          ]
        },
        Vendor: {
          type: 'object',
          required: ['id', 'name', 'country', 'type', 'website'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            chinese_names: { type: 'array', items: { type: 'string' } },
            country: { type: 'string', example: 'CN' },
            type: { type: 'string', enum: ['hardware', 'model-lab', 'both'] },
            website: { type: 'string', format: 'uri' }
          }
        },
        Hardware: {
          type: 'object',
          required: ['id', 'name', 'vendor', 'compute', 'memory', 'scale_up', 'scale_out', 'evidence'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            vendor: { $ref: '#/components/schemas/Vendor' },
            generation: { type: 'string' },
            status: { type: 'string', enum: ['in-production', 'discontinued', 'taping-out', 'announced'] },
            release_year: { type: 'integer' },
            form_factor: { type: 'string', enum: ['sxm', 'oam', 'pcie', 'nvl', 'proprietary'] },
            compute: {
              type: 'object',
              properties: {
                fp4_tflops: { $ref: '#/components/schemas/ValueWithEvidence' },
                fp8_tflops: { $ref: '#/components/schemas/ValueWithEvidence' },
                bf16_tflops: { $ref: '#/components/schemas/ValueWithEvidence' },
                fp16_tflops: { $ref: '#/components/schemas/ValueWithEvidence' },
                int8_tops: { $ref: '#/components/schemas/ValueWithEvidence' }
              }
            },
            memory: {
              type: 'object',
              properties: {
                capacity_gb: { $ref: '#/components/schemas/ValueWithEvidence' },
                bandwidth_gbps: { $ref: '#/components/schemas/ValueWithEvidence' },
                type: { type: 'string' }
              }
            },
            scale_up: { type: 'object', properties: { protocol: { type: 'string' }, bandwidth_gbps: { type: 'number' }, world_size: { type: 'integer' } } },
            scale_out: { type: 'object', properties: { protocol: { type: 'string' }, bandwidth_gbps_per_card: { type: 'number' } } },
            evidence: { type: 'array', items: { $ref: '#/components/schemas/Evidence' } }
          }
        },
        Model: {
          type: 'object',
          required: ['id', 'name', 'lab', 'release_date', 'license', 'architecture'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            lab: { type: 'string' },
            release_date: { type: 'string', format: 'date' },
            license: { type: 'string' },
            architecture: { type: 'object' },
            operator_decomposition: { type: 'array', items: { type: 'object' } }
          }
        },
        Case: {
          type: 'object',
          required: ['id', 'title', 'submitted_at', 'stack', 'scenario', 'results', 'evidence'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            submitted_at: { type: 'string', format: 'date' },
            stack: { type: 'object' },
            scenario: { type: 'object' },
            results: { type: 'object' },
            bottleneck: { type: 'string' },
            evidence: { type: 'array', items: { $ref: '#/components/schemas/Evidence' } },
            resolved: {
              type: 'object',
              description: 'Cross-references inlined for convenience',
              properties: {
                hardware: { $ref: '#/components/schemas/Hardware' },
                model: { $ref: '#/components/schemas/Model' }
              }
            }
          }
        },
        HardwareList: {
          type: 'object',
          required: ['count', 'items'],
          properties: { count: { type: 'integer' }, items: { type: 'array', items: { $ref: '#/components/schemas/Hardware' } } }
        },
        ModelList: {
          type: 'object',
          required: ['count', 'items'],
          properties: { count: { type: 'integer' }, items: { type: 'array', items: { $ref: '#/components/schemas/Model' } } }
        },
        CaseList: {
          type: 'object',
          required: ['count', 'items'],
          properties: { count: { type: 'integer' }, items: { type: 'array', items: { $ref: '#/components/schemas/Case' } } }
        }
      }
    }
  };

  return new Response(JSON.stringify(spec, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
};
