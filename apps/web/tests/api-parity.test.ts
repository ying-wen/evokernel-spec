import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const WEB_ROOT = path.resolve(path.dirname(__filename), '..');
const API_PAGES_DIR = path.join(WEB_ROOT, 'src/pages/api');
const API_PARITY_TIMEOUT_MS = 15000;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    if (entry.isFile()) return [full];
    return [];
  });
}

function apiRouteForFile(file: string): string {
  const rel = path.relative(API_PAGES_DIR, file).replaceAll(path.sep, '/');
  const withoutExt = rel.replace(/\.ts$/, '').replace(/\[([^\]]+)\]/g, '{$1}');
  return `/api/${withoutExt}`;
}

function sourceApiRoutes(): string[] {
  return listFiles(API_PAGES_DIR).map(apiRouteForFile).sort();
}

const SOURCE_API_ROUTES = sourceApiRoutes();

function endpointPath(value: string): string {
  const match = value.match(/^https?:\/\/[^/]+(?<path>\/.*)$/);
  return match?.groups?.path ?? value;
}

describe('public API descriptor parity', () => {
  it('/api/index.json lists every source API route and no missing API route', async () => {
    const mod = await import('../src/pages/api/index.json');
    const response = await mod.GET({ site: new URL('https://example.test/') } as never);
    const body = await response.json();

    const declaredRoutes = Object.values(body.endpoints as Record<string, string>)
      .map(endpointPath)
      .filter((p) => p.startsWith('/api/'))
      .sort();

    expect(declaredRoutes).toEqual(SOURCE_API_ROUTES);
  }, API_PARITY_TIMEOUT_MS);

  it('/api/openapi.json path inventory matches every source API route', async () => {
    const mod = await import('../src/pages/api/openapi.json');
    const response = await mod.GET({ site: new URL('https://example.test/') } as never);
    const spec = await response.json();

    const openApiRoutes = Object.keys(spec.paths as Record<string, unknown>)
      .filter((p) => p.startsWith('/api/'))
      .sort();

    expect(openApiRoutes).toEqual(SOURCE_API_ROUTES);
    expect(spec.paths).toHaveProperty('/cases.xml');
    expect(spec.info.version).toBe('3.32.0');
  }, API_PARITY_TIMEOUT_MS);
});
