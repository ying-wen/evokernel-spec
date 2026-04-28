#!/usr/bin/env tsx
/**
 * pack-dist.ts — package the static build for offline / air-gapped delivery.
 *
 * Produces:
 *   .runtime/evokernel-spec-{sha}-{timestamp}.tar.gz
 *
 * The tarball contains the entire `apps/web/dist/` plus a top-level
 * MANIFEST.json with provenance fields (build SHA, built_at, page count,
 * entity counts, sha256 of the tar contents). This makes the artifact
 * self-describing — the receiver doesn't need to trust the filename to
 * know what they got.
 *
 * Usage:
 *   pnpm build && pnpm pack:dist
 *   # → .runtime/evokernel-spec-abc1234-20260429.tar.gz
 *
 * Why this exists:
 *   For users who can't reach Cloudflare/GitHub Pages (air-gapped lab,
 *   internal network, USB-only transfer), they want one self-contained
 *   bundle they can `tar -xzf && nginx -s reload` against.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DIST_DIR = join(REPO_ROOT, 'apps/web/dist');
const RUNTIME_DIR = join(REPO_ROOT, '.runtime');

function fail(msg: string): never {
  console.error(`\x1b[31m[pack-dist]\x1b[0m ${msg}`);
  process.exit(1);
}

function log(msg: string) { console.log(`\x1b[1m[pack-dist]\x1b[0m ${msg}`); }
function ok(msg: string) { console.log(`\x1b[32m[ ok ]\x1b[0m ${msg}`); }

if (!existsSync(DIST_DIR)) {
  fail(`apps/web/dist not found — run 'pnpm build' first`);
}
if (!existsSync(RUNTIME_DIR)) mkdirSync(RUNTIME_DIR, { recursive: true });

// ---- collect provenance ----
let sha = 'unknown';
try {
  sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {/* not a git repo / dirty checkout */}

let dirty = false;
try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  dirty = status.length > 0;
} catch {/* same */}

const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const builtAt = new Date().toISOString();

// page count from index.json if available
let entityCounts: Record<string, number> = {};
let pageCount = 0;
const apiDescriptor = join(DIST_DIR, 'api/index.json');
if (existsSync(apiDescriptor)) {
  try {
    const j = JSON.parse(readFileSync(apiDescriptor, 'utf8'));
    entityCounts = j.counts ?? {};
  } catch {/* malformed, skip */}
}

function countHtmlFiles(dir: string): number {
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) n += countHtmlFiles(join(dir, ent.name));
    else if (ent.name.endsWith('.html')) n++;
  }
  return n;
}
pageCount = countHtmlFiles(DIST_DIR);

// dist size
function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) total += dirSizeBytes(p);
    else total += statSync(p).size;
  }
  return total;
}
const distSize = dirSizeBytes(DIST_DIR);

// ---- write MANIFEST.json INTO dist before packing ----
const manifest = {
  product: 'evokernel-spec',
  version: 'v1.1',
  build: { sha, dirty, built_at: builtAt },
  contents: {
    pages: pageCount,
    bytes: distSize,
    entities: entityCounts
  },
  served_via: 'static (any HTTP server: nginx, caddy, npx serve, python -m http.server)',
  health_endpoints: ['/api/healthz', '/api/health.json'],
  unpack: 'tar -xzf <tarball>; serve apps/web/dist/',
  license: { code: 'Apache-2.0', data: 'CC-BY-SA-4.0' }
};
const manifestPath = join(DIST_DIR, 'MANIFEST.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
ok(`wrote ${manifestPath} (sha=${sha}${dirty ? '-dirty' : ''}, ${pageCount} pages, ${(distSize / 1024 / 1024).toFixed(1)} MB)`);

// ---- pack ----
const outName = `evokernel-spec-${sha}${dirty ? '-dirty' : ''}-${timestamp}.tar.gz`;
const outPath = join(RUNTIME_DIR, outName);

log(`packing ${DIST_DIR} → ${outPath}`);
try {
  // -C cd to apps/web first so tarball entries start with `dist/...`
  execSync(`tar -czf ${outPath} -C ${join(REPO_ROOT, 'apps/web')} dist`, { stdio: 'inherit' });
} catch (err) {
  fail(`tar failed: ${err instanceof Error ? err.message : err}`);
}

// ---- compute tarball sha256 ----
const tarBytes = readFileSync(outPath);
const tarSha = createHash('sha256').update(tarBytes).digest('hex');
const tarSizeMb = (tarBytes.length / 1024 / 1024).toFixed(1);

// ---- write sidecar checksum file ----
const checksumPath = `${outPath}.sha256`;
writeFileSync(checksumPath, `${tarSha}  ${outName}\n`);

// ---- summary ----
console.log('');
console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
console.log(`  \x1b[32m✓\x1b[0m  packed evokernel-spec\n`);
console.log(`  Tarball:    ${outPath}`);
console.log(`  Size:       ${tarSizeMb} MB`);
console.log(`  SHA256:     ${tarSha}`);
console.log(`  Checksum:   ${checksumPath}\n`);
console.log(`  To deploy on a fresh host:`);
console.log(`    tar -xzf ${outName}`);
console.log(`    npx serve dist  # or any static host`);
console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
