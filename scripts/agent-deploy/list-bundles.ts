#!/usr/bin/env tsx
/**
 * v3.17 — `pnpm agent:list-bundles` discovery helper.
 *
 * Lists all (model, hardware) pairs that have pre-built agent-context bundles
 * in the local `apps/web/dist/api/agent-context/`. Useful before invoking
 * `agent:deploy` to verify a target pair is in the corpus.
 *
 * Usage:
 *   pnpm agent:list-bundles                # all bundles
 *   pnpm agent:list-bundles -- --model llama-3.3-70b
 *   pnpm agent:list-bundles -- --hardware h100-sxm5
 */
import { listBundles } from './fetch-bundle';

function parseFilters(argv: string[]): { model?: string; hardware?: string } {
  const out: { model?: string; hardware?: string } = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' && argv[i + 1]) out.model = argv[++i];
    else if (a === '--hardware' && argv[i + 1]) out.hardware = argv[++i];
  }
  return out;
}

async function main() {
  const filters = parseFilters(process.argv);
  const all = await listBundles();
  const filtered = all.filter(
    (p) =>
      (!filters.model || p.model === filters.model) &&
      (!filters.hardware || p.hardware === filters.hardware)
  );

  if (filtered.length === 0) {
    console.error(
      `No bundles match (model=${filters.model ?? '*'}, hardware=${filters.hardware ?? '*'}).\n` +
        `Hint: run \`pnpm --filter @evokernel/web build\` to build local bundles.`
    );
    process.exit(1);
  }

  console.log(
    `${filtered.length} agent-context bundle${filtered.length !== 1 ? 's' : ''} (of ${all.length} total):`
  );
  // Group by hardware for readability when no filter applied.
  if (!filters.hardware) {
    const byHw = new Map<string, string[]>();
    for (const p of filtered) {
      const list = byHw.get(p.hardware) ?? [];
      list.push(p.model);
      byHw.set(p.hardware, list);
    }
    const sortedHw = [...byHw.keys()].sort();
    for (const hw of sortedHw) {
      const models = byHw.get(hw)!;
      console.log(`\n  ${hw}  (${models.length} model${models.length !== 1 ? 's' : ''})`);
      for (const m of models.slice(0, 12)) console.log(`    - ${m}`);
      if (models.length > 12) console.log(`    ... (+${models.length - 12} more)`);
    }
  } else {
    for (const p of filtered) console.log(`  ${p.model} on ${p.hardware}`);
  }
}

main().catch((err) => {
  console.error('list-bundles failed:', err.message);
  process.exit(1);
});
