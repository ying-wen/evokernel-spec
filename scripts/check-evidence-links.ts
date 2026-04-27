import fg from 'fast-glob';
import path from 'node:path';
import { loadYaml } from './lib/load-yaml.ts';

export type LinkResult = { ok: boolean; status: number; error?: string };

type Fetcher = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>;

export async function checkUrl(
  url: string,
  opts: { fetcher?: Fetcher; timeoutMs?: number } = {}
): Promise<LinkResult> {
  const fetcher = opts.fetcher ?? (((u, init) => fetch(u, init)) as Fetcher);
  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetcher(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

export async function checkAll(
  dataDir: string
): Promise<{ failures: Array<{ url: string; result: LinkResult; file: string }> }> {
  const files = await fg('**/*.yaml', { cwd: dataDir, absolute: true });
  const seen = new Map<string, string>();
  for (const file of files) {
    const raw = await loadYaml<Record<string, unknown>>(file);
    walk(raw, (url) => {
      if (!seen.has(url)) seen.set(url, file);
    });
  }
  const failures: Array<{ url: string; result: LinkResult; file: string }> = [];
  for (const [url, file] of seen) {
    const r = await checkUrl(url);
    if (!r.ok) failures.push({ url, result: r, file });
    await new Promise((res) => setTimeout(res, 200));
  }
  return { failures };
}

function walk(obj: unknown, onUrl: (url: string) => void): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const x of obj) walk(x, onUrl);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && (k === 'url' || k === 'website' || k.endsWith('_url'))) {
      try {
        new URL(v);
        onUrl(v);
      } catch {
        // not a url
      }
    } else walk(v, onUrl);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = path.resolve(process.argv[2] ?? 'data');
  const { failures } = await checkAll(dataDir);
  if (failures.length > 0) {
    console.error(`${failures.length} broken links:`);
    for (const f of failures) console.error(`  ${f.url}  (${f.result.status}, in ${f.file})`);
    process.exit(1);
  }
  console.log('✓ all evidence URLs reachable');
}
