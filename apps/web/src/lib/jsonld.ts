// Generates Schema.org JSON-LD blobs for Google rich results / knowledge panels.
// We use Product for hardware (manufacturer + ProductGroup-like attributes),
// SoftwareApplication for models, and TechArticle for cases/learn.

import type { Hardware, Vendor, Model, Case, Server } from '@evokernel/schemas';

const SITE = 'https://evokernel.dev';

export function organizationLD() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'EvoKernel Spec',
    url: SITE,
    logo: `${SITE}/og-default.svg`,
    description:
      'Open knowledge base for AI inference hardware, models, and deployment cases.',
    license: 'https://creativecommons.org/licenses/by-sa/4.0/'
  };
}

type ResolvedHw = Omit<Hardware, 'vendor'> & { vendor: Vendor };

export function hardwareLD(h: ResolvedHw, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url,
    name: h.name,
    sku: h.id,
    category: 'AI Accelerator',
    brand: { '@type': 'Brand', name: h.vendor.name },
    manufacturer: { '@type': 'Organization', name: h.vendor.name, url: h.vendor.website },
    description: `${h.vendor.name} ${h.name}, released ${h.release_year}, ${h.form_factor.toUpperCase()} form factor. Memory: ${h.memory.capacity_gb?.value ?? '?'}GB ${h.memory.type}.`,
    additionalProperty: [
      h.compute.bf16_tflops?.value
        ? { '@type': 'PropertyValue', name: 'BF16 TFLOPS', value: h.compute.bf16_tflops.value, unitText: 'TFLOPS' }
        : null,
      h.compute.fp8_tflops?.value
        ? { '@type': 'PropertyValue', name: 'FP8 TFLOPS', value: h.compute.fp8_tflops.value, unitText: 'TFLOPS' }
        : null,
      h.memory.capacity_gb?.value
        ? { '@type': 'PropertyValue', name: 'Memory', value: h.memory.capacity_gb.value, unitText: 'GB' }
        : null,
      h.memory.bandwidth_gbps?.value
        ? { '@type': 'PropertyValue', name: 'Memory Bandwidth', value: h.memory.bandwidth_gbps.value, unitText: 'GB/s' }
        : null,
      h.power.tdp_w?.value
        ? { '@type': 'PropertyValue', name: 'TDP', value: h.power.tdp_w.value, unitText: 'W' }
        : null,
      { '@type': 'PropertyValue', name: 'Form factor', value: h.form_factor.toUpperCase() },
      { '@type': 'PropertyValue', name: 'Release year', value: h.release_year }
    ].filter(Boolean),
    url
  };
}

export function modelLD(m: Model, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': url,
    name: m.name,
    applicationCategory: 'AI Model',
    applicationSubCategory: m.architecture.family.toUpperCase(),
    softwareVersion: m.id,
    operatingSystem: 'GPU/Accelerator',
    creator: { '@type': 'Organization', name: m.lab },
    datePublished: m.release_date,
    license: m.license,
    description: `${m.architecture.total_params_b}B params (${m.architecture.active_params_b}B active), ${m.architecture.layers} layers, ${m.architecture.max_context_length / 1024}k context. ${m.architecture.family.toUpperCase()} architecture.`,
    url
  };
}

export function caseLD(c: Case, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': url,
    headline: c.title,
    datePublished: c.submitted_at,
    author: { '@type': 'Person', name: c.submitter.github },
    keywords: [c.stack.hardware.id, c.stack.model.id, c.stack.engine.id, c.stack.quantization, c.bottleneck].join(', '),
    description: `Deployment of ${c.stack.model.id} on ${c.stack.hardware.count}× ${c.stack.hardware.id} via ${c.stack.engine.id} ${c.stack.engine.version} (${c.stack.quantization}). Decode: ${c.results.throughput_tokens_per_sec.decode} tok/s, TTFT p50: ${c.results.latency_ms.ttft_p50}ms.`,
    url,
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/licenses/by-sa/4.0/'
  };
}

export function serverLD(s: Server, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': url,
    name: s.name,
    sku: s.id,
    category: 'AI Server / Pod',
    brand: { '@type': 'Brand', name: s.vendor },
    description: `${s.name} — ${s.type}, ${s.card_count} × ${s.card}, scale-up domain ${s.scale_up_domain_size}, ${s.cooling}-cooled.`,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Card count', value: s.card_count },
      { '@type': 'PropertyValue', name: 'Scale-up domain', value: s.scale_up_domain_size },
      s.total_memory_gb ? { '@type': 'PropertyValue', name: 'Total memory', value: s.total_memory_gb, unitText: 'GB' } : null,
      s.rack_power_kw ? { '@type': 'PropertyValue', name: 'Rack power', value: s.rack_power_kw, unitText: 'kW' } : null,
      { '@type': 'PropertyValue', name: 'Cooling', value: s.cooling }
    ].filter(Boolean),
    url
  };
}

export function breadcrumbLD(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url
    }))
  };
}

/** Render a JSON-LD <script> tag as a string for direct insertion into <head>. */
export function ldScript(json: object): string {
  return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
}
