/**
 * Unit tests for /api/health.json — exercises both the happy path AND
 * the degraded (HTTP 503) branch by mocking the data loaders.
 *
 * The degraded branch is critical: it's the difference between a
 * uptime-monitor reporting "OK" while the corpus is silently broken,
 * vs. correctly flagging the issue. E2E can only assert the happy
 * path against the live corpus, so this is the only place we cover
 * the failure semantics.
 *
 * Strategy:
 *   - vi.mock('~/lib/data', ...) overrides each loader with a stub.
 *   - vi.mock('~/lib/build-meta', ...) returns a deterministic SHA so
 *     assertions don't depend on git state.
 *   - We import the route AFTER mocks are registered so its closures
 *     pick up the stubs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/build-meta', () => ({
  buildMeta: () => ({ sha: 'test123', builtAt: '2026-04-29T00:00:00.000Z' })
}));

// Mutable refs — each test rewrites the implementations before importing the route.
const loaderStubs = {
  getVendors:           vi.fn(async () => [] as unknown[]),
  getHardware:          vi.fn(async () => [] as unknown[]),
  getServers:           vi.fn(async () => [] as unknown[]),
  getOperators:         vi.fn(async () => [] as unknown[]),
  getEngines:           vi.fn(async () => [] as unknown[]),
  getQuantizations:     vi.fn(async () => [] as unknown[]),
  getParallelStrategies: vi.fn(async () => [] as unknown[]),
  getModels:            vi.fn(async () => [] as unknown[]),
  getCases:             vi.fn(async () => [] as unknown[]),
  getPatterns:          vi.fn(async () => [] as unknown[])
};

vi.mock('~/lib/data', () => loaderStubs);

beforeEach(() => {
  Object.values(loaderStubs).forEach((fn) => fn.mockReset());
  // Sensible default: empty arrays so tests must opt in to richer payloads
  for (const fn of Object.values(loaderStubs)) fn.mockResolvedValue([]);
});

async function callHealth(): Promise<{ status: number; body: Record<string, unknown> }> {
  // Bust the module cache so the route picks up the latest mocks per test.
  vi.resetModules();
  const mod = await import('../src/pages/api/health.json');
  const response = await mod.GET({} as never);
  return { status: response.status, body: await response.json() };
}

describe('/api/health.json — happy path', () => {
  it('returns 200 + status:ok when corpus is fully loaded', async () => {
    loaderStubs.getHardware.mockResolvedValue(new Array(31).fill({}));
    loaderStubs.getModels.mockResolvedValue(new Array(17).fill({}));
    loaderStubs.getCases.mockResolvedValue(new Array(22).fill({}));
    loaderStubs.getVendors.mockResolvedValue(new Array(22).fill({}));

    const { status, body } = await callHealth();
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.name).toBe('evokernel-spec');
    expect((body.build as { sha: string }).sha).toBe('test123');
    expect((body.data_loaded as { hardware: number }).hardware).toBe(31);
    expect((body.data_loaded as { models: number }).models).toBe(17);
    expect(body).not.toHaveProperty('degraded_reason');
  });
});

describe('/api/health.json — degraded paths', () => {
  it('returns 503 + status:degraded when hardware corpus is empty', async () => {
    // models/cases/etc could load fine, but if hardware is empty we're broken
    loaderStubs.getModels.mockResolvedValue(new Array(17).fill({}));
    loaderStubs.getHardware.mockResolvedValue([]);

    const { status, body } = await callHealth();
    expect(status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.degraded_reason).toMatch(/core corpus.*empty/i);
  });

  it('returns 503 + status:degraded when models corpus is empty', async () => {
    loaderStubs.getHardware.mockResolvedValue(new Array(10).fill({}));
    loaderStubs.getModels.mockResolvedValue([]);

    const { status, body } = await callHealth();
    expect(status).toBe(503);
    expect(body.status).toBe('degraded');
  });

  it('returns 503 + status:degraded when a loader throws', async () => {
    loaderStubs.getHardware.mockRejectedValue(new Error('YAML parse error in hardware/foo.yaml'));

    const { status, body } = await callHealth();
    expect(status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.degraded_reason).toMatch(/YAML parse error/);
    // No data_loaded section — we never got there
    expect(body).not.toHaveProperty('data_loaded');
  });

  it('still returns build SHA even when degraded — needed to identify "what version is broken"', async () => {
    loaderStubs.getHardware.mockRejectedValue(new Error('disk full'));

    const { status, body } = await callHealth();
    expect(status).toBe(503);
    expect((body.build as { sha: string }).sha).toBe('test123');
  });

  it('always sets cache-control: no-cache so probes never see stale degraded state', async () => {
    vi.resetModules();
    const mod = await import('../src/pages/api/health.json');
    const response = await mod.GET({} as never);
    const cacheControl = response.headers.get('cache-control') ?? '';
    expect(cacheControl).toMatch(/no-cache|no-store/);
  });
});
