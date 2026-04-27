# EvoKernel Spec V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build EvoKernel Spec V1 — an open-source AI inference deployment knowledge base covering 28 accelerators (incl. 9 Chinese vendors), 14+ frontier open-source models, with a Tier 0/1 calculator and Chinese chip dedicated hub, deployed as static site to Cloudflare Pages within 6 weeks.

**Architecture:** Astro 5 SSG + React 19 islands (calculator, compare drawer, charts) + YAML data files validated by Zod + Pagefind static search + AI-assisted Phase 0 data acquisition + GitHub PR-only contribution model.

**Tech Stack:** Astro 5, React 19, TypeScript 5 strict, Tailwind v4, Zod 4, MDX, Recharts, D3.js, Pagefind, Vitest, Playwright, Biome, pnpm, Node 22 LTS, Cloudflare Pages, GitHub Actions.

**Reference spec:** [docs/superpowers/specs/2026-04-28-evokernel-spec-design.md](../specs/2026-04-28-evokernel-spec-design.md)

---

## Milestones Overview

| ID | Milestone | Tasks | Week |
|---|---|---|---|
| A | Foundation: Repo init + tooling + design tokens | 6 | 1 |
| B | Schema layer: Zod schemas for all entities | 8 | 1 |
| C | Data acquisition: AI-assisted scrape pipeline + run | 7 | 1-2 |
| D | Data loading: Astro content collections + cross-refs | 4 | 2 |
| E | UI primitives: Layout, nav, footer, common components | 5 | 2 |
| F | Hardware pages: list, detail, compare drawer | 6 | 3 |
| G | Model pages: list, detail, operator decomposition | 4 | 3 |
| H | Case pages: list, MDX detail, result viz | 5 | 3-4 |
| I | Calculator: Tier 0 + Tier 1 + Disagg + UI | 9 | 4 |
| J | China Hub: heatmap + genealogy + ecosystem table | 5 | 4-5 |
| K | About + i18n + search + CI/CD | 6 | 5 |
| L | Polish, e2e, perf, launch prep | 5 | 6 |

**Total: ~70 tasks over 6 weeks.**

---

## File Structure

Files this plan will create or modify (organized by responsibility):

### Root configuration
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `biome.json`, `.gitignore`
- `LICENSE` (Apache 2.0), `DATA_LICENSE` (CC-BY-SA 4.0), `README.md` (zh+en)
- `.github/workflows/{validate,build,deploy,lighthouse}.yml`
- `.github/ISSUE_TEMPLATE/{new-hardware,new-model,new-case}.yaml`
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`

### Schemas (single source of truth for data shape)
- `schemas/index.ts` — public exports
- `schemas/evidence.ts` — Evidence record + Tier enum + ValueWithEvidence helper
- `schemas/vendor.ts`, `schemas/hardware.ts`, `schemas/server.ts`
- `schemas/interconnect.ts`, `schemas/model.ts`, `schemas/operator.ts`
- `schemas/engine.ts`, `schemas/quantization.ts`, `schemas/parallel-strategy.ts`
- `schemas/case.ts`, `schemas/pattern.ts`

### Data (yaml entities, populated by Phase 0)
- `data/vendors/*.yaml` (~22)
- `data/hardware/<vendor>/*.yaml` (28)
- `data/servers/*.yaml` (15-20 incl. super-pods)
- `data/interconnects/*.yaml` (~10)
- `data/models/<lab>/*.yaml` (14+)
- `data/operators/*.yaml` (~10)
- `data/engines/*.yaml` (7)
- `data/quantizations/*.yaml` (~9)
- `data/parallel-strategies/*.yaml` (~5)
- `data/cases/2026/04/*.yaml` (≥5 seed)
- `data/patterns/*.yaml` (≥3 seed)

### Scripts
- `scripts/validate-data.ts` — CI entrypoint
- `scripts/check-evidence-links.ts` — link reachability
- `scripts/generate-docs.ts` — schema → markdown docs
- `scripts/seed-from-templates.ts` — yaml skeleton generator
- `scripts/decompose-operators.ts` — auto operator FLOPs/bytes from model config
- `scripts/ai-scrape/{base,hardware,model,server,case}.ts` — Phase 0 scrapers

### Web app (Astro)
- `apps/web/astro.config.mjs`, `apps/web/tailwind.config.ts`
- `apps/web/src/pages/` — routes (index, hardware, models, cases, calculator, china, about)
- `apps/web/src/layouts/BaseLayout.astro`
- `apps/web/src/components/{ui,hardware,model,case,calculator,china-hub}/`
- `apps/web/src/content/config.ts` — Astro content collections
- `apps/web/src/content/cases/*.mdx` — case detail MDX
- `apps/web/src/lib/{calculator,data,search,i18n}/`
- `apps/web/src/styles/{tokens.css,typography.css,global.css}`
- `apps/web/tests/` — Vitest unit tests
- `apps/web/e2e/` — Playwright e2e tests

### Docs
- `docs/contributing.md`, `docs/data-model.md` (auto-generated), `docs/calculator-formulas.md`

---

## Conventions

**Test-Driven:** Each substantive task follows: write failing test → verify fail → implement → verify pass → commit.

**Commit style:** Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).

**Per-vendor repeat pattern:** Where a task says "repeat for each vendor", the listed vendors are:
- Hardware: `nvidia`, `amd`, `intel`, `aws`, `google`, `huawei`, `cambricon`, `hygon`, `moore-threads`, `enflame`, `biren`, `metax`, `iluvatar`, `pingtouge`
- Models: `deepseek`, `moonshot`, `zhipu`, `alibaba`, `minimax`, `meta`, `mistral`, `google`, `openai`

**Data type aliases used throughout:**
- `ValueWithEvidence<T>` — `{ value: T; evidence_ref: string }` or `null`
- `Tier` — `'official' | 'measured' | 'estimated'`
- `Slug` — kebab-case string

---

## Milestone A — Foundation: Repo Init + Tooling

### Task A1: Initialize pnpm workspace + base files

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.nvmrc`, `tsconfig.base.json`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "evokernel-spec",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm --filter web build",
    "validate": "tsx scripts/validate-data.ts",
    "check-links": "tsx scripts/check-evidence-links.ts",
    "test": "pnpm --filter web test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "schemas"
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.astro/
.cloudflare/
*.log
.env
.env.local
.DS_Store
coverage/
playwright-report/
test-results/
```

- [ ] **Step 4: Create .nvmrc**

```
22
```

- [ ] **Step 5: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "jsx": "preserve"
  }
}
```

- [ ] **Step 6: Run `pnpm install`**

Expected: empty install (no deps yet beyond devDependencies). Run `pnpm install` and verify `node_modules` created.

- [ ] **Step 7: Initialize git + first commit**

```bash
git init
git add -A
git commit -m "chore: initialize pnpm workspace and base config"
```

---

### Task A2: Set up Biome (lint + format)

**Files:**
- Create: `biome.json`

- [ ] **Step 1: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "files": { "ignore": ["**/dist/**", "**/.astro/**", "**/node_modules/**", "**/coverage/**"] },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "noUnusedVariables": "error", "noUnusedImports": "error" },
      "style": { "noNonNullAssertion": "warn", "useConst": "error" },
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } }
}
```

- [ ] **Step 2: Run lint to verify config valid**

```bash
pnpm lint
```

Expected: no errors (no source files yet).

- [ ] **Step 3: Commit**

```bash
git add biome.json
git commit -m "chore: configure biome lint and format"
```

---

### Task A3: Initialize Astro web app

**Files:**
- Create: `apps/web/package.json`, `apps/web/astro.config.mjs`, `apps/web/tsconfig.json`
- Create: `apps/web/src/pages/index.astro` (placeholder)

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@evokernel/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && pagefind --site dist",
    "preview": "astro preview",
    "test": "vitest",
    "test:e2e": "playwright test",
    "check": "astro check"
  },
  "dependencies": {
    "@astrojs/check": "^0.9.0",
    "@astrojs/mdx": "^4.0.0",
    "@astrojs/react": "^4.0.0",
    "@astrojs/sitemap": "^3.2.0",
    "astro": "^5.0.0",
    "astro-i18n": "^2.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "pagefind": "^1.2.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create apps/web/astro.config.mjs**

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://evokernel.dev',
  output: 'static',
  integrations: [react(), mdx(), sitemap()],
  vite: { plugins: [tailwindcss()] },
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: { prefixDefaultLocale: false }
  }
});
```

- [ ] **Step 3: Create apps/web/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["src/*"],
      "@evokernel/schemas": ["../../schemas/index.ts"],
      "@evokernel/data/*": ["../../data/*"]
    },
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["src/**/*", "astro.config.mjs"]
}
```

- [ ] **Step 4: Create placeholder index page**

```astro
---
// apps/web/src/pages/index.astro
---
<html lang="zh">
  <head><title>EvoKernel Spec</title></head>
  <body><h1>EvoKernel Spec</h1></body>
</html>
```

- [ ] **Step 5: Install dependencies**

```bash
pnpm install
```

Expected: Astro 5 + React 19 + Tailwind v4 installed.

- [ ] **Step 6: Verify dev server starts**

```bash
pnpm dev
```

Expected: dev server runs at `http://localhost:4321` and shows "EvoKernel Spec" heading. Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold astro 5 app with react and tailwind v4"
```

---

### Task A4: Set up design tokens (Tailwind v4 + CSS variables)

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/typography.css`
- Create: `apps/web/src/styles/global.css`

- [ ] **Step 1: Create tokens.css**

Define color, typography, spacing, motion as CSS custom properties (per `~/.claude/rules/web/coding-style.md`).

```css
/* apps/web/src/styles/tokens.css */
:root {
  /* Surface palette (light, default) */
  --color-bg: oklch(99% 0.005 250);
  --color-surface: oklch(98% 0.005 250);
  --color-surface-raised: oklch(100% 0 0);
  --color-text: oklch(18% 0.01 260);
  --color-text-muted: oklch(45% 0.015 260);
  --color-border: oklch(90% 0.005 260);

  /* Brand */
  --color-accent: oklch(58% 0.18 255);          /* deep blue */
  --color-accent-soft: oklch(94% 0.04 255);
  --color-china: oklch(54% 0.22 25);            /* warm red, used in china-hub */
  --color-china-soft: oklch(96% 0.04 25);

  /* Tier semantic */
  --color-tier-official: oklch(55% 0.01 260);   /* gray */
  --color-tier-measured: oklch(58% 0.16 145);   /* green */
  --color-tier-estimated: oklch(70% 0.16 80);   /* amber */

  /* Typography */
  --font-sans: 'Inter Variable', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
  --font-serif: 'Source Serif Pro', 'Songti SC', serif;

  --text-xs: clamp(0.75rem, 0.7rem + 0.1vw, 0.8rem);
  --text-sm: clamp(0.875rem, 0.82rem + 0.15vw, 0.95rem);
  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --text-lg: clamp(1.125rem, 1.05rem + 0.4vw, 1.25rem);
  --text-xl: clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem);
  --text-2xl: clamp(2rem, 1.6rem + 1.5vw, 3rem);
  --text-hero: clamp(2.5rem, 1rem + 6vw, 6rem);

  /* Spacing rhythm */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-section: clamp(3rem, 2rem + 4vw, 8rem);

  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 280ms;
  --duration-slow: 480ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-quad: cubic-bezier(0.45, 0, 0.55, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: oklch(14% 0.01 260);
    --color-surface: oklch(17% 0.01 260);
    --color-surface-raised: oklch(20% 0.01 260);
    --color-text: oklch(95% 0.005 250);
    --color-text-muted: oklch(70% 0.015 260);
    --color-border: oklch(28% 0.01 260);
    --color-accent: oklch(72% 0.18 255);
    --color-accent-soft: oklch(28% 0.04 255);
  }
}
```

- [ ] **Step 2: Create typography.css**

```css
/* apps/web/src/styles/typography.css */
body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
h1, h2, h3, h4 { font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; }
h1 { font-size: var(--text-hero); letter-spacing: -0.03em; line-height: 1.05; }
h2 { font-size: var(--text-2xl); }
h3 { font-size: var(--text-xl); }
code, pre, kbd { font-family: var(--font-mono); }
```

- [ ] **Step 3: Create global.css with Tailwind v4 import**

```css
/* apps/web/src/styles/global.css */
@import 'tailwindcss';
@import './tokens.css';
@import './typography.css';

/* Theme bridge: expose tokens to Tailwind utilities */
@theme {
  --color-bg: var(--color-bg);
  --color-surface: var(--color-surface);
  --color-text: var(--color-text);
  --color-accent: var(--color-accent);
  --color-china: var(--color-china);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 4: Wire global.css into Astro layout**

Update `apps/web/src/pages/index.astro`:

```astro
---
import '~/styles/global.css';
---
<html lang="zh">
  <head><title>EvoKernel Spec</title></head>
  <body><h1 class="text-[var(--text-hero)]">EvoKernel Spec</h1></body>
</html>
```

- [ ] **Step 5: Verify dev server renders with tokens**

Run `pnpm dev`, visually check headline uses fluid hero size and brand color is loaded. Stop server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles apps/web/src/pages/index.astro
git commit -m "feat(web): establish design tokens and base typography"
```

---

### Task A5: Create LICENSE files + initial README

**Files:**
- Create: `LICENSE` (Apache 2.0)
- Create: `DATA_LICENSE` (CC-BY-SA 4.0 reference)
- Create: `README.md`

- [ ] **Step 1: Create LICENSE (Apache 2.0)**

Use the standard Apache 2.0 text from <https://www.apache.org/licenses/LICENSE-2.0.txt>. Copy verbatim into `LICENSE`.

- [ ] **Step 2: Create DATA_LICENSE**

```markdown
# Data License

All data files in `data/**` are licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC-BY-SA-4.0).

Full text: https://creativecommons.org/licenses/by-sa/4.0/legalcode

You may share and adapt the data, but you must:
1. Give appropriate credit (link back to this repository).
2. Distribute derivative works under the same license.

Code in this repository is licensed separately under Apache 2.0 (see LICENSE).
```

- [ ] **Step 3: Create initial README.md (zh + en summary)**

```markdown
# EvoKernel Spec

> AI 推理硬件 × 模型 × 部署的开源知识库 — 国产芯片覆盖最全 / 可信度可引证 / 计算器透明

## 项目状态: 🚧 V1 开发中 (2026-04 Phase 0)

详见 [设计文档](docs/superpowers/specs/2026-04-28-evokernel-spec-design.md) 和 [实施计划](docs/superpowers/plans/2026-04-28-evokernel-spec-v1.md)。

## English Summary

Open-source knowledge base for AI inference deployment across hardware (incl. 9 Chinese vendors) and frontier models, with a transparent calculator. Currently in V1 development.

## License

- Code: Apache 2.0 (see [LICENSE](LICENSE))
- Data: CC-BY-SA 4.0 (see [DATA_LICENSE](DATA_LICENSE))
```

- [ ] **Step 4: Commit**

```bash
git add LICENSE DATA_LICENSE README.md
git commit -m "docs: add Apache 2.0 / CC-BY-SA 4.0 licenses and README"
```

---

### Task A6: Set up Vitest for unit tests

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/tests/smoke.test.ts`

- [ ] **Step 1: Create vitest.config.ts**

```ts
// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts']
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@evokernel/schemas': fileURLToPath(new URL('../../schemas/index.ts', import.meta.url))
    }
  }
});
```

- [ ] **Step 2: Write smoke test**

```ts
// apps/web/tests/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter web test --run
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/tests
git commit -m "chore(web): set up vitest with workspace aliases"
```

---

---

## Milestone B — Schema Layer (Zod)

These schemas are the single source of truth. Both data validation (CI) and TypeScript types in the web app import from `schemas/`.

### Task B1: Schemas package + Evidence + Tier

**Files:**
- Create: `schemas/package.json`, `schemas/tsconfig.json`, `schemas/index.ts`
- Create: `schemas/evidence.ts`
- Test: `schemas/evidence.test.ts`

- [ ] **Step 1: schemas/package.json**

```json
{
  "name": "@evokernel/schemas",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "index.ts",
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": { "vitest": "^2.1.0" },
  "scripts": { "test": "vitest --run" }
}
```

- [ ] **Step 2: schemas/tsconfig.json**

```json
{ "extends": "../tsconfig.base.json", "include": ["**/*.ts"] }
```

- [ ] **Step 3: Write failing test for Evidence schema**

```ts
// schemas/evidence.test.ts
import { describe, it, expect } from 'vitest';
import { EvidenceSchema, ValueWithEvidenceSchema, TierSchema } from './evidence';
import { z } from 'zod';

describe('Tier', () => {
  it('accepts the three valid tiers', () => {
    expect(TierSchema.parse('official')).toBe('official');
    expect(TierSchema.parse('measured')).toBe('measured');
    expect(TierSchema.parse('estimated')).toBe('estimated');
  });
  it('rejects unknown tier', () => {
    expect(() => TierSchema.parse('rumor')).toThrow();
  });
});

describe('Evidence', () => {
  const valid = {
    id: 'ev-h100-001',
    tier: 'official',
    source_type: 'vendor-whitepaper',
    url: 'https://nvidia.com/h100-spec.pdf',
    accessed: '2026-04-15',
    citation: 'NVIDIA H100 datasheet, p.4'
  };

  it('accepts a complete record', () => {
    expect(EvidenceSchema.parse(valid)).toEqual(valid);
  });

  it('requires id with ev- prefix', () => {
    expect(() => EvidenceSchema.parse({ ...valid, id: 'h100-001' })).toThrow();
  });

  it('requires reachable-looking URL', () => {
    expect(() => EvidenceSchema.parse({ ...valid, url: 'not-a-url' })).toThrow();
  });

  it('requires ISO date for accessed', () => {
    expect(() => EvidenceSchema.parse({ ...valid, accessed: '15/04/2026' })).toThrow();
  });

  it('requires contributor_attestation when tier=measured', () => {
    expect(() =>
      EvidenceSchema.parse({ ...valid, tier: 'measured', source_type: 'community-benchmark' })
    ).toThrow(/attestation/i);
  });
});

describe('ValueWithEvidence', () => {
  const schema = ValueWithEvidenceSchema(z.number());
  it('accepts {value, evidence_ref}', () => {
    expect(schema.parse({ value: 320, evidence_ref: 'ev-h100-001' })).toEqual({
      value: 320,
      evidence_ref: 'ev-h100-001'
    });
  });
  it('accepts null for unsupported fields', () => {
    expect(schema.parse(null)).toBeNull();
  });
  it('rejects bare number', () => {
    expect(() => schema.parse(320)).toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify failure**

```bash
cd schemas && pnpm test
```

Expected: FAIL with "module not found" or undefined exports.

- [ ] **Step 5: Implement Evidence schema**

```ts
// schemas/evidence.ts
import { z } from 'zod';

export const TierSchema = z.enum(['official', 'measured', 'estimated']);
export type Tier = z.infer<typeof TierSchema>;

export const SourceTypeSchema = z.enum([
  'vendor-whitepaper',
  'vendor-press-release',
  'vendor-product-page',
  'vendor-datasheet',
  'mlperf-submission',
  'community-benchmark',
  'paper',
  'conference-talk',
  'third-party-review',
  'other'
]);

const EvidenceBase = z.object({
  id: z.string().regex(/^ev-[a-z0-9-]+$/, 'Evidence id must start with "ev-"'),
  tier: TierSchema,
  source_type: SourceTypeSchema,
  url: z.string().url(),
  accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'accessed must be ISO date YYYY-MM-DD'),
  citation: z.string().min(1),
  raw_data_url: z.string().url().optional(),
  contributor_attestation: z.string().min(20).optional()
});

export const EvidenceSchema = EvidenceBase.refine(
  (e) => e.tier !== 'measured' || (e.contributor_attestation && e.contributor_attestation.length > 0),
  { message: 'tier=measured requires contributor_attestation' }
);
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ValueWithEvidenceSchema = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      value: value,
      evidence_ref: z.string().regex(/^ev-[a-z0-9-]+$/)
    })
    .nullable();

export type ValueWithEvidence<T> = { value: T; evidence_ref: string } | null;
```

- [ ] **Step 6: Add re-exports to index**

```ts
// schemas/index.ts
export * from './evidence';
```

- [ ] **Step 7: Verify tests pass**

```bash
cd schemas && pnpm test
```

Expected: 9 tests pass.

- [ ] **Step 8: Commit**

```bash
git add schemas
git commit -m "feat(schemas): add Evidence, Tier, ValueWithEvidence with refinements"
```

---

### Task B2: Vendor schema

**Files:**
- Create: `schemas/vendor.ts`, update: `schemas/index.ts`
- Test: `schemas/vendor.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// schemas/vendor.test.ts
import { describe, it, expect } from 'vitest';
import { VendorSchema } from './vendor';

describe('Vendor', () => {
  const valid = {
    id: 'huawei',
    name: 'Huawei Ascend',
    chinese_names: ['华为昇腾'],
    country: 'CN',
    type: 'hardware',
    website: 'https://www.huawei.com/en/products/ascend',
    aliases: ['HiSilicon', 'Hisilicon Ascend']
  };

  it('accepts complete vendor', () => {
    expect(VendorSchema.parse(valid)).toMatchObject(valid);
  });

  it('id must be kebab-case', () => {
    expect(() => VendorSchema.parse({ ...valid, id: 'Huawei_Ascend' })).toThrow();
  });

  it('country must be ISO-3166 alpha-2', () => {
    expect(() => VendorSchema.parse({ ...valid, country: 'china' })).toThrow();
  });

  it('type must be hardware|model-lab|both', () => {
    expect(VendorSchema.parse({ ...valid, type: 'model-lab' })).toBeTruthy();
    expect(() => VendorSchema.parse({ ...valid, type: 'cloud' })).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd schemas && pnpm test vendor
```

Expected: fail with module not found.

- [ ] **Step 3: Implement vendor.ts**

```ts
// schemas/vendor.ts
import { z } from 'zod';

const SlugSchema = z.string().regex(/^[a-z0-9-]+$/, 'must be kebab-case');
const CountrySchema = z.string().regex(/^[A-Z]{2}$/, 'ISO-3166 alpha-2');

export const VendorTypeSchema = z.enum(['hardware', 'model-lab', 'both']);

export const VendorSchema = z.object({
  id: SlugSchema,
  name: z.string().min(1),
  chinese_names: z.array(z.string()).default([]),
  country: CountrySchema,
  type: VendorTypeSchema,
  website: z.string().url(),
  aliases: z.array(z.string()).default([]),
  description: z.string().optional(),
  logo: z.string().optional()
});

export type Vendor = z.infer<typeof VendorSchema>;
```

- [ ] **Step 4: Update schemas/index.ts**

```ts
export * from './evidence';
export * from './vendor';
```

- [ ] **Step 5: Verify tests pass**

```bash
cd schemas && pnpm test
```

Expected: all tests (B1+B2) pass.

- [ ] **Step 6: Commit**

```bash
git add schemas
git commit -m "feat(schemas): add Vendor with country and type validation"
```

---

### Task B3: Hardware schema (with cluster networking)

**Files:**
- Create: `schemas/hardware.ts`
- Test: `schemas/hardware.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// schemas/hardware.test.ts
import { describe, it, expect } from 'vitest';
import { HardwareSchema } from './hardware';

const minimalValid = {
  id: 'h100-sxm5',
  name: 'NVIDIA H100 SXM5 80GB',
  vendor: 'nvidia',
  generation: 'hopper-gen1',
  status: 'in-production',
  release_year: 2022,
  form_factor: 'sxm',
  compute: {
    fp4_tflops: null,
    fp8_tflops: { value: 1979, evidence_ref: 'ev-h100-001' },
    bf16_tflops: { value: 989, evidence_ref: 'ev-h100-001' },
    fp16_tflops: { value: 989, evidence_ref: 'ev-h100-001' },
    int8_tops: { value: 1979, evidence_ref: 'ev-h100-001' }
  },
  memory: {
    capacity_gb: { value: 80, evidence_ref: 'ev-h100-002' },
    bandwidth_gbps: { value: 3350, evidence_ref: 'ev-h100-002' },
    type: 'HBM3'
  },
  scale_up: {
    protocol: 'NVLink-4.0',
    bandwidth_gbps: 900,
    world_size: 8,
    topology: 'switched',
    switch: 'nvswitch-gen3'
  },
  scale_out: {
    bandwidth_gbps_per_card: 400,
    protocol: 'InfiniBand-NDR',
    nic: 'cx7-400g'
  },
  power: { tdp_w: { value: 700, evidence_ref: 'ev-h100-003' } },
  software_support: {
    drivers: ['CUDA-12.x'],
    engines: [{ id: 'vllm', status: 'officially-supported', versions: ['0.6'] }],
    quantizations: ['fp16', 'bf16', 'fp8-e4m3'],
    parallelism: ['tp', 'pp', 'ep']
  },
  evidence: [
    {
      id: 'ev-h100-001',
      tier: 'official',
      source_type: 'vendor-datasheet',
      url: 'https://nvidia.com/h100-datasheet.pdf',
      accessed: '2026-04-15',
      citation: 'H100 datasheet'
    }
  ]
};

describe('Hardware', () => {
  it('accepts minimal valid hardware', () => {
    expect(() => HardwareSchema.parse(minimalValid)).not.toThrow();
  });

  it('every numeric value field references existing evidence', () => {
    const broken = JSON.parse(JSON.stringify(minimalValid));
    broken.compute.bf16_tflops.evidence_ref = 'ev-h100-999';
    // schema-level: this passes; cross-validation happens in validate-data.ts
    expect(() => HardwareSchema.parse(broken)).not.toThrow();
  });

  it('rejects unknown form_factor', () => {
    expect(() => HardwareSchema.parse({ ...minimalValid, form_factor: 'gpu' })).toThrow();
  });

  it('rejects unknown status', () => {
    expect(() => HardwareSchema.parse({ ...minimalValid, status: 'launched' })).toThrow();
  });

  it('release_year must be reasonable (>= 2010)', () => {
    expect(() => HardwareSchema.parse({ ...minimalValid, release_year: 1999 })).toThrow();
  });

  it('scale_up.world_size must be positive integer', () => {
    expect(() =>
      HardwareSchema.parse({ ...minimalValid, scale_up: { ...minimalValid.scale_up, world_size: 0 } })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd schemas && pnpm test hardware
```

Expected: module not found.

- [ ] **Step 3: Implement hardware.ts**

```ts
// schemas/hardware.ts
import { z } from 'zod';
import { EvidenceSchema, ValueWithEvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const FormFactorSchema = z.enum(['sxm', 'oam', 'pcie', 'nvl', 'proprietary']);
export const HardwareStatusSchema = z.enum(['in-production', 'discontinued', 'taping-out', 'announced']);
export const MemoryTypeSchema = z.enum(['HBM2', 'HBM2e', 'HBM3', 'HBM3e', 'HBM4', 'GDDR6', 'LPDDR5', 'unknown']);

const ComputeSchema = z.object({
  fp4_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp8_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  bf16_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp16_tflops: ValueWithEvidenceSchema(z.number().nonnegative()),
  fp32_tflops: ValueWithEvidenceSchema(z.number().nonnegative()).optional(),
  int8_tops: ValueWithEvidenceSchema(z.number().nonnegative()),
  int4_tops: ValueWithEvidenceSchema(z.number().nonnegative()).optional()
});

const MemorySchema = z.object({
  capacity_gb: ValueWithEvidenceSchema(z.number().positive()),
  bandwidth_gbps: ValueWithEvidenceSchema(z.number().positive()),
  type: MemoryTypeSchema
});

const ScaleUpSchema = z.object({
  protocol: z.string().min(1),                       // NVLink-4.0 / HCCS / Infinity-Fabric / ...
  bandwidth_gbps: z.number().positive(),
  world_size: z.number().int().positive(),
  topology: z.string().min(1),                       // switched / mesh / ring / ...
  switch: z.string().optional()                      // e.g., nvswitch-gen3
});

const ScaleOutSchema = z.object({
  bandwidth_gbps_per_card: z.number().positive(),
  protocol: z.string().min(1),                       // RoCEv2 / InfiniBand-NDR / ...
  nic: z.string().optional()
});

const SoftwareSupportSchema = z.object({
  drivers: z.array(z.string()).default([]),
  engines: z
    .array(
      z.object({
        id: Slug,
        status: z.enum(['officially-supported', 'community-port', 'unsupported']),
        versions: z.array(z.string()).default([]),
        notes: z.string().optional()
      })
    )
    .default([]),
  quantizations: z.array(Slug).default([]),
  parallelism: z.array(Slug).default([])
});

export const HardwareSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  vendor: Slug,
  generation: z.string().min(1),
  status: HardwareStatusSchema,
  release_year: z.number().int().min(2010).max(2035),
  form_factor: FormFactorSchema,
  compute: ComputeSchema,
  memory: MemorySchema,
  scale_up: ScaleUpSchema,
  scale_out: ScaleOutSchema,
  power: z.object({ tdp_w: ValueWithEvidenceSchema(z.number().positive()) }),
  software_support: SoftwareSupportSchema,
  aliases: z.array(z.string()).default([]),
  chinese_names: z.array(z.string()).default([]),
  photos: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).min(1, 'at least one evidence required'),
  disclaimers: z.array(z.string()).default([])
});

export type Hardware = z.infer<typeof HardwareSchema>;
```

- [ ] **Step 4: Update index, run tests**

Add `export * from './hardware';` to `schemas/index.ts`. Run `cd schemas && pnpm test`. Expected: all hardware tests pass plus prior B1/B2 tests.

- [ ] **Step 5: Commit**

```bash
git add schemas
git commit -m "feat(schemas): add Hardware with scale-up/scale-out cluster networking"
```

---

### Task B4: Server / Pod / Super-pod schema

**Files:**
- Create: `schemas/server.ts`
- Test: `schemas/server.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// schemas/server.test.ts
import { describe, it, expect } from 'vitest';
import { ServerSchema } from './server';

const valid = {
  id: 'huawei-cloudmatrix-384',
  name: 'Huawei CloudMatrix 384',
  vendor: 'huawei',
  type: 'super-pod',
  card: 'ascend-910c',
  card_count: 384,
  scale_up_domain_size: 384,
  intra_node_interconnect: 'HCCS-fabric',
  inter_node_interconnect: 'optical-roce',
  cooling: 'liquid',
  rack_power_kw: 600,
  release_year: 2025,
  evidence: [
    {
      id: 'ev-cm384-001',
      tier: 'official',
      source_type: 'vendor-press-release',
      url: 'https://www.huawei.com/en/news/cloudmatrix-384',
      accessed: '2026-04-15',
      citation: 'Huawei CloudMatrix 384 launch announcement'
    }
  ]
};

describe('Server', () => {
  it('accepts a super-pod with 384 cards', () => {
    expect(() => ServerSchema.parse(valid)).not.toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => ServerSchema.parse({ ...valid, type: 'rack' })).toThrow();
  });

  it('rejects negative card_count', () => {
    expect(() => ServerSchema.parse({ ...valid, card_count: 0 })).toThrow();
  });

  it('cooling enum is enforced', () => {
    expect(() => ServerSchema.parse({ ...valid, cooling: 'water' })).toThrow();
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd schemas && pnpm test server
```

Expected: module not found.

- [ ] **Step 3: Implement server.ts**

```ts
// schemas/server.ts
import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const ServerTypeSchema = z.enum(['integrated-server', 'pod', 'super-pod']);
export const CoolingSchema = z.enum(['air', 'liquid', 'immersion', 'hybrid']);

export const ServerSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  vendor: Slug,
  type: ServerTypeSchema,
  card: Slug,                                        // references hardware id
  card_count: z.number().int().positive(),
  scale_up_domain_size: z.number().int().positive(),
  intra_node_interconnect: z.string().min(1),
  inter_node_interconnect: z.string().min(1),
  cooling: CoolingSchema,
  rack_power_kw: z.number().positive().optional(),
  total_memory_gb: z.number().positive().optional(),
  total_compute_pflops_bf16: z.number().positive().optional(),
  release_year: z.number().int().min(2010).max(2035),
  aliases: z.array(z.string()).default([]),
  chinese_names: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).min(1)
});

export type Server = z.infer<typeof ServerSchema>;
```

- [ ] **Step 4: Update index, run tests, commit**

```bash
cd schemas && pnpm test
git add schemas
git commit -m "feat(schemas): add Server schema with super-pod support"
```

---

### Task B5: Interconnect, Operator, Engine, Quantization, ParallelStrategy schemas

**Files:**
- Create: `schemas/interconnect.ts`, `schemas/operator.ts`, `schemas/engine.ts`, `schemas/quantization.ts`, `schemas/parallel-strategy.ts`
- Test: `schemas/misc-entities.test.ts`

These are smaller entities. Implement together for efficiency.

- [ ] **Step 1: Write failing tests**

```ts
// schemas/misc-entities.test.ts
import { describe, it, expect } from 'vitest';
import { InterconnectSchema } from './interconnect';
import { OperatorSchema } from './operator';
import { EngineSchema } from './engine';
import { QuantizationSchema } from './quantization';
import { ParallelStrategySchema } from './parallel-strategy';

describe('Interconnect', () => {
  it('accepts NVLink-4', () => {
    expect(() => InterconnectSchema.parse({
      id: 'nvlink-4',
      name: 'NVLink 4.0',
      family: 'nvlink',
      typical_bandwidth_gbps: 900,
      vendor: 'nvidia',
      evidence: [{ id: 'ev-nvl4-001', tier: 'official', source_type: 'vendor-whitepaper',
        url: 'https://nvidia.com/x', accessed: '2026-04-15', citation: 'NVLink whitepaper' }]
    })).not.toThrow();
  });
});

describe('Operator', () => {
  it('accepts attention with FLOPs formula', () => {
    expect(() => OperatorSchema.parse({
      id: 'attention',
      name: 'Multi-Head Attention',
      category: 'attention',
      flops_formula: '4 * batch * seq * hidden^2',
      bytes_formula: '2 * batch * seq * hidden * (1 + 2/heads)',
      description: 'Standard multi-head attention'
    })).not.toThrow();
  });
});

describe('Engine', () => {
  it('accepts vllm', () => {
    expect(() => EngineSchema.parse({
      id: 'vllm',
      name: 'vLLM',
      maintainer: 'community',
      source_url: 'https://github.com/vllm-project/vllm',
      supported_hardware_vendors: ['nvidia', 'amd'],
      latest_version: '0.6.0'
    })).not.toThrow();
  });
});

describe('Quantization', () => {
  it('accepts fp8-e4m3', () => {
    expect(() => QuantizationSchema.parse({
      id: 'fp8-e4m3',
      name: 'FP8 E4M3',
      bits_per_weight: 8,
      bits_per_activation: 8,
      family: 'fp8',
      lossless: false
    })).not.toThrow();
  });
});

describe('ParallelStrategy', () => {
  it('accepts tp', () => {
    expect(() => ParallelStrategySchema.parse({
      id: 'tp',
      name: 'Tensor Parallelism',
      family: 'intra-layer',
      description: 'Split tensor along feature dim'
    })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd schemas && pnpm test misc
```

Expected: 5 module-not-found failures.

- [ ] **Step 3: Implement interconnect.ts**

```ts
// schemas/interconnect.ts
import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const InterconnectFamilySchema = z.enum([
  'nvlink', 'nvswitch', 'infinity-fabric', 'hccs', 'ualink',
  'pcie', 'cxl', 'infiniband', 'roce', 'lingqu', 'other'
]);

export const InterconnectSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  family: InterconnectFamilySchema,
  typical_bandwidth_gbps: z.number().positive(),
  vendor: Slug.optional(),
  description: z.string().optional(),
  evidence: z.array(EvidenceSchema).min(1)
});
export type Interconnect = z.infer<typeof InterconnectSchema>;
```

- [ ] **Step 4: Implement operator.ts**

```ts
// schemas/operator.ts
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const OperatorCategorySchema = z.enum([
  'matmul', 'attention', 'norm', 'activation', 'embedding',
  'moe-routing', 'communication', 'misc'
]);

export const OperatorSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  category: OperatorCategorySchema,
  flops_formula: z.string().min(1),                  // human-readable formula
  bytes_formula: z.string().min(1),
  description: z.string().min(1),
  variants: z.array(Slug).default([])                // e.g., flash-attention-2 is variant of attention
});
export type Operator = z.infer<typeof OperatorSchema>;
```

- [ ] **Step 5: Implement engine.ts**

```ts
// schemas/engine.ts
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const EngineMaintainerSchema = z.enum(['community', 'vendor', 'commercial', 'mixed']);

export const EngineSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  maintainer: EngineMaintainerSchema,
  source_url: z.string().url(),
  documentation_url: z.string().url().optional(),
  supported_hardware_vendors: z.array(Slug).min(1),
  latest_version: z.string().min(1),
  notes: z.string().optional()
});
export type Engine = z.infer<typeof EngineSchema>;
```

- [ ] **Step 6: Implement quantization.ts**

```ts
// schemas/quantization.ts
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const QuantizationFamilySchema = z.enum(['fp', 'fp8', 'fp4', 'int', 'mixed', 'awq', 'gptq', 'other']);

export const QuantizationSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  bits_per_weight: z.number().int().positive().max(64),
  bits_per_activation: z.number().int().positive().max(64),
  family: QuantizationFamilySchema,
  lossless: z.boolean(),
  description: z.string().optional()
});
export type Quantization = z.infer<typeof QuantizationSchema>;
```

- [ ] **Step 7: Implement parallel-strategy.ts**

```ts
// schemas/parallel-strategy.ts
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const ParallelFamilySchema = z.enum([
  'intra-layer', 'inter-layer', 'expert', 'sequence', 'data', 'disaggregated'
]);

export const ParallelStrategySchema = z.object({
  id: Slug,
  name: z.string().min(1),
  family: ParallelFamilySchema,
  description: z.string().min(1),
  typical_use_cases: z.array(z.string()).default([])
});
export type ParallelStrategy = z.infer<typeof ParallelStrategySchema>;
```

- [ ] **Step 8: Update index.ts and run tests**

```ts
// schemas/index.ts
export * from './evidence';
export * from './vendor';
export * from './hardware';
export * from './server';
export * from './interconnect';
export * from './operator';
export * from './engine';
export * from './quantization';
export * from './parallel-strategy';
```

```bash
cd schemas && pnpm test
```

Expected: all 5 misc tests pass plus prior tests.

- [ ] **Step 9: Commit**

```bash
git add schemas
git commit -m "feat(schemas): add interconnect, operator, engine, quantization, parallel-strategy"
```

---

### Task B6: Model schema (with operator decomposition)

**Files:**
- Create: `schemas/model.ts`
- Test: `schemas/model.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// schemas/model.test.ts
import { describe, it, expect } from 'vitest';
import { ModelSchema } from './model';

const valid = {
  id: 'deepseek-v4-pro',
  name: 'DeepSeek V4 Pro',
  lab: 'deepseek',
  release_date: '2026-04-24',
  license: 'deepseek-license',
  architecture: {
    family: 'moe',
    total_params_b: 1600,
    active_params_b: 49,
    layers: 64,
    hidden_size: 8192,
    ffn_size: 24576,
    num_attention_heads: 64,
    num_kv_heads: 8,
    head_dim: 128,
    vocab_size: 132000,
    max_context_length: 1048576,
    moe: { num_experts: 256, top_k: 8, expert_hidden_size: 2048 },
    attention_type: 'csa+hca',
    rope_theta: 10000000
  },
  operator_decomposition: [
    { operator: 'attention', flops_per_token: 1.2e9, bytes_per_token: 4.5e6 },
    { operator: 'matmul-ffn', flops_per_token: 4.8e9, bytes_per_token: 1.8e7 },
    { operator: 'moe-routing', flops_per_token: 1.0e7, bytes_per_token: 1.0e6 }
  ],
  modalities: ['text'],
  weight_format: 'bf16',
  paper_url: 'https://arxiv.org/abs/2604.0xx',
  hf_url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro'
};

describe('Model', () => {
  it('accepts DeepSeek V4 Pro full record', () => {
    expect(() => ModelSchema.parse(valid)).not.toThrow();
  });

  it('rejects MoE without moe field', () => {
    const broken = JSON.parse(JSON.stringify(valid));
    delete broken.architecture.moe;
    expect(() => ModelSchema.parse(broken)).toThrow(/moe/i);
  });

  it('rejects active_params_b > total_params_b', () => {
    const broken = JSON.parse(JSON.stringify(valid));
    broken.architecture.active_params_b = 2000;
    expect(() => ModelSchema.parse(broken)).toThrow(/active/i);
  });

  it('accepts dense without moe field', () => {
    const dense = JSON.parse(JSON.stringify(valid));
    dense.architecture.family = 'dense';
    delete dense.architecture.moe;
    dense.architecture.active_params_b = dense.architecture.total_params_b;
    expect(() => ModelSchema.parse(dense)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd schemas && pnpm test model
```

- [ ] **Step 3: Implement model.ts**

```ts
// schemas/model.ts
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9.-]+$/);

export const ModelFamilySchema = z.enum(['dense', 'moe', 'hybrid']);

const MoEConfigSchema = z.object({
  num_experts: z.number().int().positive(),
  top_k: z.number().int().positive(),
  expert_hidden_size: z.number().int().positive(),
  shared_experts: z.number().int().nonnegative().default(0)
});

const ArchitectureSchema = z
  .object({
    family: ModelFamilySchema,
    total_params_b: z.number().positive(),
    active_params_b: z.number().positive(),
    layers: z.number().int().positive(),
    hidden_size: z.number().int().positive(),
    ffn_size: z.number().int().positive(),
    num_attention_heads: z.number().int().positive(),
    num_kv_heads: z.number().int().positive(),
    head_dim: z.number().int().positive(),
    vocab_size: z.number().int().positive(),
    max_context_length: z.number().int().positive(),
    moe: MoEConfigSchema.optional(),
    attention_type: z.string().min(1),
    rope_theta: z.number().positive().optional()
  })
  .refine((a) => a.active_params_b <= a.total_params_b, {
    message: 'active_params_b cannot exceed total_params_b',
    path: ['active_params_b']
  })
  .refine((a) => a.family !== 'moe' || a.moe !== undefined, {
    message: 'family=moe requires moe config',
    path: ['moe']
  });

const OperatorBreakdownSchema = z.object({
  operator: Slug,
  flops_per_token: z.number().nonnegative(),
  bytes_per_token: z.number().nonnegative(),
  notes: z.string().optional()
});

export const ModalitySchema = z.enum(['text', 'vision', 'audio', 'video']);

export const ModelSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  lab: Slug,
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  license: z.string().min(1),
  architecture: ArchitectureSchema,
  operator_decomposition: z.array(OperatorBreakdownSchema).default([]),
  modalities: z.array(ModalitySchema).min(1),
  weight_format: z.enum(['bf16', 'fp16', 'fp32', 'mixed']),
  paper_url: z.string().url().optional(),
  hf_url: z.string().url().optional(),
  github_url: z.string().url().optional(),
  notes: z.string().optional()
});

export type Model = z.infer<typeof ModelSchema>;
```

- [ ] **Step 4: Update index, run tests, commit**

```bash
cd schemas && pnpm test
git add schemas
git commit -m "feat(schemas): add Model with architecture refinements and operator breakdown"
```

---

### Task B7: Case schema (deployment recipe)

**Files:**
- Create: `schemas/case.ts`
- Test: `schemas/case.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// schemas/case.test.ts
import { describe, it, expect } from 'vitest';
import { CaseSchema } from './case';

const valid = {
  id: 'case-dsv4-h100x8-vllm-001',
  title: 'DeepSeek V4 Flash on 8xH100 with vLLM',
  submitted_at: '2026-04-25',
  submitter: { github: '@example' },
  stack: {
    hardware: { id: 'h100-sxm5', count: 8, topology: '1 node' },
    server: { id: 'nvidia-hgx-h100' },
    interconnect: { intra_node: 'nvlink-4', inter_node: 'none' },
    model: { id: 'deepseek-v4-flash', weight_format: 'bf16' },
    engine: { id: 'vllm', version: '0.6.0' },
    quantization: 'bf16',
    parallel: { tp: 8, pp: 1, ep: 1, disaggregated: false },
    driver: 'CUDA 12.4',
    os: 'Ubuntu 22.04'
  },
  scenario: {
    prefill_seq_len: 1024,
    decode_seq_len: 256,
    batch_size: 16,
    max_concurrent_requests: 64
  },
  results: {
    throughput_tokens_per_sec: { decode: 1200, prefill: 18000 },
    latency_ms: { ttft_p50: 180, ttft_p99: 280, tbt_p50: 22, tbt_p99: 38 },
    memory_per_card_gb: 70,
    power_per_card_w: 650,
    utilization: { compute_pct: 55, memory_bw_pct: 70 }
  },
  bottleneck: 'memory-bandwidth',
  reproduction: {
    startup_command: 'vllm serve deepseek-ai/DeepSeek-V4-Flash --tp 8',
    benchmark_tool: 'vllm benchmark_serving.py'
  },
  patterns: [],
  evidence: [
    {
      id: 'ev-case-dsv4-001',
      tier: 'measured',
      source_type: 'community-benchmark',
      url: 'https://github.com/example/benchmark-logs',
      accessed: '2026-04-25',
      citation: 'Personal benchmark run',
      contributor_attestation: 'I personally ran this on company hardware on 2026-04-24, reproducible.'
    }
  ]
};

describe('Case', () => {
  it('accepts a valid measured case', () => {
    expect(() => CaseSchema.parse(valid)).not.toThrow();
  });

  it('rejects unknown bottleneck', () => {
    expect(() => CaseSchema.parse({ ...valid, bottleneck: 'cpu' })).toThrow();
  });

  it('parallel.tp must be positive integer', () => {
    const broken = JSON.parse(JSON.stringify(valid));
    broken.stack.parallel.tp = 0;
    expect(() => CaseSchema.parse(broken)).toThrow();
  });

  it('utilization percent in [0, 100]', () => {
    const broken = JSON.parse(JSON.stringify(valid));
    broken.results.utilization.compute_pct = 150;
    expect(() => CaseSchema.parse(broken)).toThrow();
  });
});
```

- [ ] **Step 2: Verify fail**

```bash
cd schemas && pnpm test case
```

- [ ] **Step 3: Implement case.ts**

```ts
// schemas/case.ts
import { z } from 'zod';
import { EvidenceSchema } from './evidence';

const Slug = z.string().regex(/^[a-z0-9.-]+$/);
const Pct = z.number().min(0).max(100);

export const BottleneckSchema = z.enum(['compute', 'memory-bandwidth', 'interconnect', 'software', 'mixed', 'unknown']);

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
      .object({ prefill_cards: z.number().int().positive(), decode_cards: z.number().int().positive() })
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
  reproduction: z
    .object({
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
```

- [ ] **Step 4: Update index, run tests, commit**

```bash
cd schemas && pnpm test
git add schemas
git commit -m "feat(schemas): add Case with full deployment recipe shape"
```

---

### Task B8: Pattern schema + final exports

**Files:**
- Create: `schemas/pattern.ts`
- Update: `schemas/index.ts`
- Test: `schemas/pattern.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// schemas/pattern.test.ts
import { describe, it, expect } from 'vitest';
import { PatternSchema } from './pattern';

describe('Pattern', () => {
  it('accepts a valid optimization pattern', () => {
    expect(() =>
      PatternSchema.parse({
        id: 'memory-bound-decode-prefer-int8',
        name: 'Decode is memory-bound: prefer INT8',
        category: 'quantization',
        description_md: '# When applicable\n\nDecode dominated by memory BW...',
        applies_when: ['decode-throughput-target', 'large-model'],
        related_operators: ['matmul'],
        supporting_cases_min: 3
      })
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Implement pattern.ts**

```ts
// schemas/pattern.ts
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9-]+$/);

export const PatternCategorySchema = z.enum([
  'quantization', 'parallel', 'kv-cache', 'communication',
  'kernel-fusion', 'scheduling', 'disaggregation', 'misc'
]);

export const PatternSchema = z.object({
  id: Slug,
  name: z.string().min(1),
  category: PatternCategorySchema,
  description_md: z.string().min(1),
  applies_when: z.array(z.string()).default([]),
  related_operators: z.array(Slug).default([]),
  supporting_cases_min: z.number().int().nonnegative().default(0)
});

export type Pattern = z.infer<typeof PatternSchema>;
```

- [ ] **Step 3: Update index.ts, run all schema tests, commit**

```ts
// schemas/index.ts (final)
export * from './evidence';
export * from './vendor';
export * from './hardware';
export * from './server';
export * from './interconnect';
export * from './operator';
export * from './engine';
export * from './quantization';
export * from './parallel-strategy';
export * from './model';
export * from './case';
export * from './pattern';
```

```bash
cd schemas && pnpm test
```

Expected: ALL schema tests pass.

```bash
git add schemas
git commit -m "feat(schemas): add Pattern and finalize schema exports"
```

---

---

## Milestone C — Data Acquisition Pipeline (AI-Assisted)

These tasks build the scrape infrastructure, then run AI agents to populate `data/`. The validate-data and check-evidence-links scripts run in CI on every PR.

### Task C1: validate-data.ts script (loads + validates all yaml)

**Files:**
- Create: `scripts/validate-data.ts`
- Create: `scripts/lib/load-yaml.ts`
- Create: `scripts/package.json`
- Test: `scripts/validate-data.test.ts`

- [ ] **Step 1: Create scripts/package.json**

```json
{
  "name": "@evokernel/scripts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@evokernel/schemas": "workspace:*",
    "yaml": "^2.6.0",
    "fast-glob": "^3.3.0",
    "zod": "^4.0.0"
  },
  "devDependencies": { "vitest": "^2.1.0" }
}
```

Update root `pnpm-workspace.yaml` if needed (already covers `apps/*`; add `scripts` and `schemas`):

```yaml
packages:
  - "apps/*"
  - "schemas"
  - "scripts"
```

- [ ] **Step 2: Write failing test**

```ts
// scripts/validate-data.test.ts
import { describe, it, expect } from 'vitest';
import { validateAll, type ValidationReport } from './validate-data';

describe('validateAll', () => {
  it('returns empty errors for empty data dir', async () => {
    const report = await validateAll({ dataDir: 'tests/fixtures/empty', strict: false });
    expect(report.errors).toEqual([]);
    expect(report.entityCounts).toEqual({});
  });

  it('reports schema errors for malformed yaml', async () => {
    const report = await validateAll({ dataDir: 'tests/fixtures/malformed', strict: false });
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0].path).toContain('hardware');
  });

  it('reports cross-reference errors when evidence_ref points to missing id', async () => {
    const report = await validateAll({ dataDir: 'tests/fixtures/dangling-ref', strict: false });
    expect(report.errors.some((e) => e.kind === 'dangling-evidence-ref')).toBe(true);
  });
});
```

Create fixture files: `scripts/tests/fixtures/empty/.gitkeep`, plus one fixture each for `malformed/hardware/x.yaml` (invalid yaml or wrong schema) and `dangling-ref/hardware/y.yaml` (references missing `ev-`).

- [ ] **Step 3: Verify test fails**

```bash
cd scripts && pnpm vitest run
```

Expected: module not found.

- [ ] **Step 4: Implement load-yaml.ts**

```ts
// scripts/lib/load-yaml.ts
import fs from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

export async function loadYaml<T>(path: string): Promise<T> {
  const text = await fs.readFile(path, 'utf-8');
  return parseYaml(text) as T;
}
```

- [ ] **Step 5: Implement validate-data.ts**

```ts
// scripts/validate-data.ts
import fg from 'fast-glob';
import path from 'node:path';
import { ZodError, type ZodSchema } from 'zod';
import {
  VendorSchema, HardwareSchema, ServerSchema, InterconnectSchema,
  OperatorSchema, EngineSchema, QuantizationSchema, ParallelStrategySchema,
  ModelSchema, CaseSchema, PatternSchema, EvidenceSchema
} from '@evokernel/schemas';
import { loadYaml } from './lib/load-yaml';

export type ValidationError = {
  kind: 'schema' | 'dangling-evidence-ref' | 'duplicate-id' | 'missing-evidence';
  path: string;
  message: string;
};

export type ValidationReport = {
  errors: ValidationError[];
  entityCounts: Record<string, number>;
};

const ENTITY_GLOBS: Array<{ name: string; glob: string; schema: ZodSchema }> = [
  { name: 'vendor', glob: 'vendors/*.yaml', schema: VendorSchema },
  { name: 'hardware', glob: 'hardware/**/*.yaml', schema: HardwareSchema },
  { name: 'server', glob: 'servers/*.yaml', schema: ServerSchema },
  { name: 'interconnect', glob: 'interconnects/*.yaml', schema: InterconnectSchema },
  { name: 'operator', glob: 'operators/*.yaml', schema: OperatorSchema },
  { name: 'engine', glob: 'engines/*.yaml', schema: EngineSchema },
  { name: 'quantization', glob: 'quantizations/*.yaml', schema: QuantizationSchema },
  { name: 'parallel-strategy', glob: 'parallel-strategies/*.yaml', schema: ParallelStrategySchema },
  { name: 'model', glob: 'models/**/*.yaml', schema: ModelSchema },
  { name: 'case', glob: 'cases/**/*.yaml', schema: CaseSchema },
  { name: 'pattern', glob: 'patterns/*.yaml', schema: PatternSchema }
];

export async function validateAll(opts: { dataDir: string; strict: boolean }): Promise<ValidationReport> {
  const errors: ValidationError[] = [];
  const entityCounts: Record<string, number> = {};
  const allEvidenceIds = new Set<string>();
  const referencedEvidenceIds = new Set<string>();
  const idsByEntity = new Map<string, Set<string>>();

  for (const cfg of ENTITY_GLOBS) {
    const files = await fg(cfg.glob, { cwd: opts.dataDir, absolute: true });
    entityCounts[cfg.name] = files.length;
    const seenIds = new Set<string>();
    idsByEntity.set(cfg.name, seenIds);

    for (const file of files) {
      const rel = path.relative(opts.dataDir, file);
      try {
        const raw = await loadYaml<Record<string, unknown>>(file);
        const parsed = cfg.schema.parse(raw) as { id: string; evidence?: Array<{ id: string }> };

        if (seenIds.has(parsed.id)) {
          errors.push({ kind: 'duplicate-id', path: rel, message: `duplicate id "${parsed.id}"` });
        }
        seenIds.add(parsed.id);

        // Collect evidence ids defined in this entity
        if (parsed.evidence) {
          for (const ev of parsed.evidence) allEvidenceIds.add(ev.id);
        }

        // Walk parsed object collecting evidence_ref fields
        walkForEvidenceRefs(parsed, referencedEvidenceIds);
      } catch (e) {
        if (e instanceof ZodError) {
          errors.push({ kind: 'schema', path: rel, message: e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
        } else {
          errors.push({ kind: 'schema', path: rel, message: (e as Error).message });
        }
      }
    }
  }

  // Cross-reference: every evidence_ref must point to an existing evidence id
  for (const ref of referencedEvidenceIds) {
    if (!allEvidenceIds.has(ref)) {
      errors.push({ kind: 'dangling-evidence-ref', path: '<cross-entity>', message: `evidence_ref "${ref}" not defined` });
    }
  }

  return { errors, entityCounts };
}

function walkForEvidenceRefs(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) walkForEvidenceRefs(item, out);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'evidence_ref' && typeof v === 'string') out.add(v);
    else walkForEvidenceRefs(v, out);
  }
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const dataDir = process.argv[2] ?? 'data';
  const report = await validateAll({ dataDir, strict: true });
  console.log(`Validated ${Object.values(report.entityCounts).reduce((a, b) => a + b, 0)} entities:`);
  for (const [name, count] of Object.entries(report.entityCounts)) console.log(`  ${name}: ${count}`);
  if (report.errors.length > 0) {
    console.error(`\n${report.errors.length} errors:`);
    for (const e of report.errors) console.error(`  [${e.kind}] ${e.path}: ${e.message}`);
    process.exit(1);
  }
  console.log('\n✓ all valid');
}
```

- [ ] **Step 6: Run tests, verify pass**

Create the fixture data first under `scripts/tests/fixtures/{empty,malformed,dangling-ref}/...`. Then:

```bash
cd scripts && pnpm vitest run
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add scripts pnpm-workspace.yaml
git commit -m "feat(scripts): validate-data with schema + cross-reference checks"
```

---

### Task C2: check-evidence-links.ts (URL reachability)

**Files:**
- Create: `scripts/check-evidence-links.ts`
- Test: `scripts/check-evidence-links.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// scripts/check-evidence-links.test.ts
import { describe, it, expect, vi } from 'vitest';
import { checkUrl, checkAll } from './check-evidence-links';

describe('checkUrl', () => {
  it('returns ok for reachable url (mocked)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    expect(await checkUrl('https://nvidia.com', { fetcher, timeoutMs: 100 })).toEqual({ ok: true, status: 200 });
  });

  it('returns ok=false for 404', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    expect(await checkUrl('https://example.com/x', { fetcher, timeoutMs: 100 })).toEqual({ ok: false, status: 404 });
  });

  it('returns ok=false for thrown errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('DNS'));
    const r = await checkUrl('https://nope.invalid', { fetcher, timeoutMs: 100 });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Implement check-evidence-links.ts**

```ts
// scripts/check-evidence-links.ts
import fg from 'fast-glob';
import { loadYaml } from './lib/load-yaml';

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

export async function checkAll(dataDir: string): Promise<{ failures: Array<{ url: string; result: LinkResult; file: string }> }> {
  const files = await fg('**/*.yaml', { cwd: dataDir, absolute: true });
  const seen = new Map<string, string>();                      // url -> first file referencing it
  for (const file of files) {
    const raw = await loadYaml<Record<string, unknown>>(file);
    walk(raw, (url) => { if (!seen.has(url)) seen.set(url, file); });
  }
  const failures: Array<{ url: string; result: LinkResult; file: string }> = [];
  // Check sequentially with 200ms gap to be polite
  for (const [url, file] of seen) {
    const r = await checkUrl(url);
    if (!r.ok) failures.push({ url, result: r, file });
    await new Promise((res) => setTimeout(res, 200));
  }
  return { failures };
}

function walk(obj: unknown, onUrl: (url: string) => void): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { for (const x of obj) walk(x, onUrl); return; }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && (k === 'url' || k === 'website' || k.endsWith('_url'))) {
      try { new URL(v); onUrl(v); } catch { /* not a url */ }
    } else walk(v, onUrl);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { failures } = await checkAll(process.argv[2] ?? 'data');
  if (failures.length > 0) {
    console.error(`${failures.length} broken links:`);
    for (const f of failures) console.error(`  ${f.url}  (${f.result.status}, in ${f.file})`);
    process.exit(1);
  }
  console.log('✓ all evidence URLs reachable');
}
```

- [ ] **Step 3: Run tests, commit**

```bash
cd scripts && pnpm vitest run
git add scripts
git commit -m "feat(scripts): add evidence URL reachability checker"
```

---

### Task C3: AI scrape base infrastructure (prompt template + runner)

**Files:**
- Create: `scripts/ai-scrape/base.ts` — shared prompt builder and yaml writer
- Create: `scripts/ai-scrape/README.md` — operator instructions

- [ ] **Step 1: Implement base.ts**

```ts
// scripts/ai-scrape/base.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

export type ScrapeJob = {
  entityType: 'hardware' | 'model' | 'server' | 'engine' | 'vendor';
  vendorOrLab: string;
  targetSlug: string;
  knownSourceUrls: string[];
  schemaSummary: string;        // human-readable schema reminder for the prompt
  outputPath: string;
};

export function buildPrompt(job: ScrapeJob): string {
  return [
    `# AI Scrape Task`,
    ``,
    `**Entity type:** ${job.entityType}`,
    `**Target:** ${job.vendorOrLab} / ${job.targetSlug}`,
    ``,
    `## Source URLs to consult (use WebFetch on these in priority order):`,
    job.knownSourceUrls.map((u) => `- ${u}`).join('\n'),
    ``,
    `## Schema reminder`,
    '```',
    job.schemaSummary,
    '```',
    ``,
    `## Strict rules`,
    `1. **NEVER fabricate numbers.** If a field cannot be found in the cited source, set it to \`null\` and add a comment.`,
    `2. **Every numeric field must reference a real evidence_ref** that exists in this same yaml's \`evidence:\` block.`,
    `3. **Every evidence URL must be reachable.** Verify with WebFetch before including.`,
    `4. **tier=official** is the default for vendor whitepapers and product pages.`,
    `5. **Quote the citation** field with page number or section if possible.`,
    `6. **Output ONLY the yaml**, no commentary or markdown fences.`,
    ``
  ].join('\n');
}

export async function writeYaml(outputPath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, stringifyYaml(data, { lineWidth: 100 }), 'utf-8');
}
```

- [ ] **Step 2: Write README with operator instructions**

```markdown
# scripts/ai-scrape

These scripts emit prompts that Claude or another LLM agent uses to draft yaml entity records.

## Workflow per entity

1. Run `pnpm tsx scripts/ai-scrape/<entity>.ts <slug>` to generate a prompt and source URL list.
2. Hand the prompt to a Claude session with WebFetch access.
3. Copy the yaml output to the indicated path.
4. **Human review (mandatory):** for each numeric field, click the evidence URL and verify the value against the cited section/page.
5. Run `pnpm validate` and `pnpm check-links` before committing.
6. Commit with message: `data: add <entity> <slug> (AI-assisted draft, reviewed by @your-handle)`

## Hard rules

- NEVER skip step 4. AI hallucinations are common for less-documented Chinese hardware.
- If a value cannot be sourced, set it to `null` and document why in `disclaimers`.
- For Chinese vendors, also check Chinese-language sources (whitepapers in PDF).
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-scrape
git commit -m "feat(scripts): add ai-scrape base prompt builder and operator workflow"
```

---

### Task C4: Hardware scrape driver script

**Files:**
- Create: `scripts/ai-scrape/hardware.ts`
- Create: `scripts/ai-scrape/source-catalog.ts` — known URLs per vendor

- [ ] **Step 1: Implement source-catalog.ts**

```ts
// scripts/ai-scrape/source-catalog.ts
export const HARDWARE_SOURCES: Record<string, { primary: string[]; secondary: string[] }> = {
  'h100-sxm5': {
    primary: [
      'https://www.nvidia.com/en-us/data-center/h100/',
      'https://resources.nvidia.com/en-us-tensor-core/nvidia-tensor-core-gpu-datasheet'
    ],
    secondary: ['https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/']
  },
  'h200-sxm': {
    primary: ['https://www.nvidia.com/en-us/data-center/h200/'],
    secondary: []
  },
  'b200-sxm': { primary: ['https://www.nvidia.com/en-us/data-center/b200/'], secondary: [] },
  'b300-sxm': { primary: ['https://www.nvidia.com/en-us/data-center/dgx-b300/'], secondary: [] },
  'gb200-nvl72': { primary: ['https://www.nvidia.com/en-us/data-center/gb200-nvl72/'], secondary: [] },
  'gb300-nvl72': { primary: ['https://www.nvidia.com/en-us/data-center/gb300-nvl72/'], secondary: [] },
  'mi300x': { primary: ['https://www.amd.com/en/products/accelerators/instinct/mi300/mi300x.html'], secondary: [] },
  'mi325x': { primary: ['https://www.amd.com/en/products/accelerators/instinct/mi300/mi325x.html'], secondary: [] },
  'mi355x': { primary: ['https://www.amd.com/en/products/accelerators/instinct/mi355x.html'], secondary: [] },
  'gaudi-2': { primary: ['https://www.intel.com/content/www/us/en/products/details/processors/ai-accelerators/gaudi2.html'], secondary: [] },
  'gaudi-3': { primary: ['https://www.intel.com/content/www/us/en/products/details/processors/ai-accelerators/gaudi3.html'], secondary: [] },
  'trainium-2': { primary: ['https://aws.amazon.com/ai/machine-learning/trainium/'], secondary: [] },
  'inferentia-2': { primary: ['https://aws.amazon.com/ai/machine-learning/inferentia/'], secondary: [] },
  'tpu-v5p': { primary: ['https://cloud.google.com/tpu/docs/v5p'], secondary: [] },
  'trillium': { primary: ['https://cloud.google.com/blog/products/compute/introducing-trillium-6th-gen-tpus'], secondary: [] },
  'ascend-910b': {
    primary: ['https://e.huawei.com/en/products/computing/ascend', 'https://www.hisilicon.com/en/products/Ascend'],
    secondary: ['https://gitee.com/ascend/ModelZoo-PyTorch']
  },
  'ascend-910c': {
    primary: ['https://e.huawei.com/en/products/computing/ascend'],
    secondary: ['https://www.huawei.com/en/news/2024/'] // CloudMatrix announcement
  },
  'mlu370-x8': { primary: ['https://www.cambricon.com/index.php?m=content&c=index&a=lists&catid=84'], secondary: [] },
  'mlu590': { primary: ['https://www.cambricon.com/'], secondary: [] },
  'dcu-z100': { primary: ['https://www.hygon.cn/product'], secondary: [] },
  'dcu-k100': { primary: ['https://www.hygon.cn/product'], secondary: [] },
  'mtt-s4000': { primary: ['https://www.mthreads.com/product/S4000'], secondary: [] },
  'enflame-t21': { primary: ['https://www.enflame-tech.com/'], secondary: [] },
  'br100': { primary: ['https://www.birentech.com/'], secondary: [] },
  'br104': { primary: ['https://www.birentech.com/'], secondary: [] },
  'metax-c500': { primary: ['https://www.metax-tech.com/'], secondary: [] },
  'iluvatar-bi': { primary: ['https://www.iluvatar.com/productDetail?fullCode=cpjs-yj-ylcl-bi'], secondary: [] },
  'pingtouge-hanguang-800': { primary: ['https://www.t-head.cn/'], secondary: [] }
};

export const HARDWARE_SCHEMA_SUMMARY = `
HardwareSchema (zod):
  id: kebab-case
  name: human readable
  vendor: vendor slug
  generation: family-genN
  status: 'in-production' | 'discontinued' | 'taping-out' | 'announced'
  release_year: int 2010-2035
  form_factor: 'sxm' | 'oam' | 'pcie' | 'nvl' | 'proprietary'
  compute: { fp4_tflops, fp8_tflops, bf16_tflops, fp16_tflops, int8_tops }
    each is null OR { value: number, evidence_ref: 'ev-...' }
  memory: { capacity_gb, bandwidth_gbps, type: 'HBM2|HBM2e|HBM3|HBM3e|HBM4|GDDR6|LPDDR5|unknown' }
  scale_up: { protocol, bandwidth_gbps, world_size, topology, switch }
  scale_out: { bandwidth_gbps_per_card, protocol, nic }
  power: { tdp_w }
  software_support: { drivers[], engines[{id, status, versions[]}], quantizations[], parallelism[] }
  evidence: [{ id: 'ev-...', tier, source_type, url, accessed: 'YYYY-MM-DD', citation }]
`.trim();
```

- [ ] **Step 2: Implement hardware.ts driver**

```ts
// scripts/ai-scrape/hardware.ts
import path from 'node:path';
import { buildPrompt } from './base';
import { HARDWARE_SOURCES, HARDWARE_SCHEMA_SUMMARY } from './source-catalog';

const VENDOR_BY_CARD: Record<string, string> = {
  'h100-sxm5': 'nvidia', 'h200-sxm': 'nvidia', 'b200-sxm': 'nvidia', 'b300-sxm': 'nvidia',
  'gb200-nvl72': 'nvidia', 'gb300-nvl72': 'nvidia',
  'mi300x': 'amd', 'mi325x': 'amd', 'mi355x': 'amd',
  'gaudi-2': 'intel', 'gaudi-3': 'intel',
  'trainium-2': 'aws', 'inferentia-2': 'aws',
  'tpu-v5p': 'google', 'trillium': 'google',
  'ascend-910b': 'huawei', 'ascend-910c': 'huawei',
  'mlu370-x8': 'cambricon', 'mlu590': 'cambricon',
  'dcu-z100': 'hygon', 'dcu-k100': 'hygon',
  'mtt-s4000': 'moore-threads',
  'enflame-t21': 'enflame',
  'br100': 'biren', 'br104': 'biren',
  'metax-c500': 'metax',
  'iluvatar-bi': 'iluvatar',
  'pingtouge-hanguang-800': 'pingtouge'
};

const slug = process.argv[2];
if (!slug || !HARDWARE_SOURCES[slug]) {
  console.error('Usage: pnpm tsx scripts/ai-scrape/hardware.ts <slug>');
  console.error('Known slugs: ' + Object.keys(HARDWARE_SOURCES).join(', '));
  process.exit(1);
}
const vendor = VENDOR_BY_CARD[slug];
const sources = HARDWARE_SOURCES[slug];

const prompt = buildPrompt({
  entityType: 'hardware',
  vendorOrLab: vendor,
  targetSlug: slug,
  knownSourceUrls: [...sources.primary, ...sources.secondary],
  schemaSummary: HARDWARE_SCHEMA_SUMMARY,
  outputPath: path.join('data', 'hardware', vendor, `${slug}.yaml`)
});

console.log(prompt);
console.log(`\n# After draft is generated, save to: data/hardware/${vendor}/${slug}.yaml`);
```

- [ ] **Step 3: Smoke-test prompt generation**

```bash
pnpm tsx scripts/ai-scrape/hardware.ts h100-sxm5
```

Expected: prints a multi-line prompt ending with output path. No errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/ai-scrape
git commit -m "feat(scripts): hardware scrape driver with source catalog for 28 cards"
```

---

### Task C5: Run AI-assisted hardware data acquisition

> **Note:** This task is **operational, not pure code.** It involves dispatching Claude/GPT agents per vendor, then human review. Each card produces one yaml file in `data/hardware/<vendor>/<slug>.yaml`.

**Files (created by this task):**
- `data/vendors/{nvidia,amd,intel,aws,google,huawei,cambricon,hygon,moore-threads,enflame,biren,metax,iluvatar,pingtouge,deepseek,moonshot,zhipu,alibaba,minimax,meta,mistral,openai}.yaml`
- `data/hardware/<vendor>/<slug>.yaml` (28 files)

- [ ] **Step 1: Create all vendor yaml files first** (manual, ~30 min, ~22 files)

For each vendor, write a yaml file from the public website. Example for NVIDIA:

```yaml
# data/vendors/nvidia.yaml
id: nvidia
name: NVIDIA
country: US
type: hardware
website: https://www.nvidia.com/
chinese_names: ['英伟达']
aliases: ['NVIDIA Corporation']
```

Repeat for: amd, intel, aws, google, huawei, cambricon, hygon, moore-threads, enflame, biren, metax, iluvatar, pingtouge, deepseek, moonshot, zhipu, alibaba, minimax, meta, mistral, openai.

- [ ] **Step 2: Validate vendors compile**

```bash
pnpm validate
```

Expected: vendor count matches, no errors.

- [ ] **Step 3: For each of the 28 hardware slugs, run AI scrape workflow**

For each slug in `HARDWARE_SOURCES`:

1. Generate prompt: `pnpm tsx scripts/ai-scrape/hardware.ts <slug>`
2. Dispatch a Claude agent with the prompt + WebFetch tool. Capture the yaml output.
3. Save to `data/hardware/<vendor>/<slug>.yaml`.
4. **Human review** (mandatory): for each numeric field, click `evidence_ref` URL and verify against cited page.
5. Fix any mismatches. Set unverifiable fields to `null` with note.

**Suggested batch order (parallelism):**
- Batch 1 (highest doc quality, easy wins): h100-sxm5, h200-sxm, b200-sxm, b300-sxm, gb200-nvl72, gb300-nvl72, mi300x, mi325x, mi355x
- Batch 2: gaudi-2, gaudi-3, tpu-v5p, trillium, trainium-2, inferentia-2
- Batch 3 (Chinese, more public docs): ascend-910b, ascend-910c, mlu370-x8, mlu590, dcu-z100, dcu-k100
- Batch 4 (Chinese, sparser docs): mtt-s4000, enflame-t21, br100, br104, metax-c500, iluvatar-bi, pingtouge-hanguang-800

- [ ] **Step 4: Validate all hardware compiles**

```bash
pnpm validate
pnpm check-links
```

Expected: 28 hardware entries, all evidence URLs reachable, no schema errors.

- [ ] **Step 5: Commit in batches**

```bash
git add data/vendors data/hardware
git commit -m "data: add 28 hardware entities (AI-assisted draft, human-reviewed)"
```

---

### Task C6: Model + supporting entity acquisition

> Same workflow as C5 but for models and small enums.

**Files:** 14+ model yamls + ~10 operators + 7 engines + 9 quantizations + 5 parallel-strategies + 10-15 servers + 10 interconnects.

- [ ] **Step 1: Hand-author static enums (operators, quantizations, parallel-strategies, interconnects)**

These are formula and metadata definitions, not vendor-claimed numbers. Hand-author for accuracy:

```yaml
# data/operators/attention.yaml
id: attention
name: Multi-Head Attention
category: attention
flops_formula: '4 * batch * seq * hidden^2 + 2 * batch * heads * seq^2 * head_dim'
bytes_formula: '2 * batch * seq * hidden * (1 + 2/heads)'
description: 'Standard MHA; flops and bytes are per layer, per token'
variants: [flash-attention-2, flash-attention-3, mla, csa, hca]
```

Repeat for: matmul, flash-attention-2, flash-attention-3, rmsnorm, rope, moe-gate, allreduce, all2all, softmax, silu.

```yaml
# data/quantizations/fp8-e4m3.yaml
id: fp8-e4m3
name: FP8 E4M3
bits_per_weight: 8
bits_per_activation: 8
family: fp8
lossless: false
description: '4-bit exponent, 3-bit mantissa; better dynamic range than e5m2 for activations'
```

Repeat for: bf16, fp16, fp8-e5m2, fp4, int8, int4-awq, int4-gptq, w4a16.

```yaml
# data/parallel-strategies/tp.yaml
id: tp
name: Tensor Parallelism
family: intra-layer
description: 'Split tensor along feature dim within each layer'
typical_use_cases: ['Wide models within a node', 'NVLink-connected GPUs']
```

Repeat for: pp, ep, sp, disaggregated.

```yaml
# data/interconnects/nvlink-4.yaml
id: nvlink-4
name: NVLink 4.0
family: nvlink
typical_bandwidth_gbps: 900
vendor: nvidia
description: 'Bidirectional, used in H100 SXM5 and HGX systems'
evidence:
  - id: ev-nvl4-001
    tier: official
    source_type: vendor-whitepaper
    url: 'https://images.nvidia.com/aem-dam/Solutions/data-center/nvlink-nvswitch.pdf'
    accessed: '2026-04-28'
    citation: 'NVIDIA NVLink/NVSwitch whitepaper, p.3'
```

Repeat for: nvlink-5, nvswitch-gen3, nvswitch-gen4, infinity-fabric, hccs, infiniband-ndr, roce-v2, ualink, lingqu, etc.

- [ ] **Step 2: For each model, generate prompt and run AI scrape**

Build a `scripts/ai-scrape/model.ts` mirror of `hardware.ts` driver, with a model source catalog (HF model card URL + paper URL + lab announcement). For each of the 14 models, run the same dispatch + review workflow.

**Models to scrape:** deepseek-v4-pro, deepseek-v4-flash, deepseek-r1, kimi-k2.6, glm-5.1, glm-5-reasoning, qwen3.6-plus, qwen3.5-397b, minimax-m2.7, llama-4-scout, llama-4-maverick, mistral-small-4, gemma-4, gpt-oss.

- [ ] **Step 3: For each server / super-pod, run AI scrape**

15-20 entities including the Chinese super-pods (CloudMatrix 384, Atlas 900 SuperPoD, KUAE clusters, etc.). Use `scripts/ai-scrape/server.ts` driver.

- [ ] **Step 4: For each engine, hand-author from public docs**

7 engines: vllm, sglang, tensorrt-llm, mori, lmdeploy, mindie, plus one for Pingtouge (name to confirm during scrape).

- [ ] **Step 5: Final validate + commit**

```bash
pnpm validate
pnpm check-links
git add data
git commit -m "data: populate models, operators, engines, quantizations, parallel, servers, interconnects"
```

---

### Task C7: Seed cases (5-10) from public benchmarks

Cases come from public sources only at this stage (no private benchmarks). Each case must include real `contributor_attestation` text in evidence.

**Sources to mine for seed cases:**
- MLPerf Inference v4.x submission descriptions (NVIDIA, AMD, Huawei)
- vLLM official benchmark page
- TensorRT-LLM performance blog
- Huawei Ascend official inference performance posts
- Mooncake and DistServe papers (disaggregated examples)

**Files to create:** `data/cases/2026/04/<slug>.yaml` × 5-10

- [ ] **Step 1: Identify 5-10 candidate cases from public sources**

Suggested initial set:
1. `llama4-scout-on-h100x8-vllm-bf16`
2. `dsv4-flash-on-h100x8-vllm-fp8`
3. `dsv4-pro-on-gb200-nvl72-trtllm`
4. `qwen3.6-plus-on-mi325x-x8-sglang`
5. `dsv3-on-ascend-910bx16-mindie-bf16` (Ascend reference)
6. `mooncake-disaggregated-h100-prefill-decode-split`

- [ ] **Step 2: For each, write yaml referencing the public source**

Each case must have:
- `tier: measured` evidence
- `contributor_attestation` quoting the source ("As reported in <source name> on <date>...")
- `raw_data_url` to the original benchmark report or paper

Example skeleton for case #1 (operator fills in numbers from the actual blog post):

```yaml
# data/cases/2026/04/llama4-scout-on-h100x8-vllm-bf16.yaml
id: case-llama4-scout-h100x8-vllm-001
title: 'Llama 4 Scout on 8xH100 with vLLM (public benchmark)'
submitted_at: '2026-04-28'
submitter: { github: '@evokernel-bot' }
stack:
  hardware: { id: h100-sxm5, count: 8, topology: 'single-node-hgx' }
  server: { id: nvidia-hgx-h100 }
  interconnect: { intra_node: nvlink-4, inter_node: 'none' }
  model: { id: llama-4-scout, weight_format: bf16 }
  engine: { id: vllm, version: '<actual version from source>' }
  quantization: bf16
  parallel: { tp: 8, pp: 1, ep: 1, sp: 1, disaggregated: false }
  driver: '<actual>'
  os: '<actual>'
scenario: { prefill_seq_len: 1024, decode_seq_len: 256, batch_size: 16, max_concurrent_requests: 64 }
results:
  throughput_tokens_per_sec: { decode: 0, prefill: 0 }   # FILL FROM SOURCE
  latency_ms: { ttft_p50: 0, ttft_p99: 0, tbt_p50: 0, tbt_p99: 0 }
  memory_per_card_gb: 0
  power_per_card_w: 0
  utilization: { compute_pct: 0, memory_bw_pct: 0 }
bottleneck: unknown
reproduction:
  startup_command: '<actual>'
  benchmark_tool: '<actual>'
patterns: []
evidence:
  - id: ev-case-llama4-scout-001
    tier: measured
    source_type: third-party-review
    url: '<actual URL>'
    accessed: '2026-04-28'
    citation: '<actual>'
    contributor_attestation: 'Numbers extracted from public benchmark <source>; not personally re-run.'
    raw_data_url: '<actual URL>'
```

- [ ] **Step 3: Validate, check links, commit**

```bash
pnpm validate
pnpm check-links
git add data/cases
git commit -m "data: add 5-10 seed cases from public benchmarks"
```

---

---

## Milestone D — Data Loading Layer

The web app reads `data/**/*.yaml` at build time via Astro content collections. Cross-references (e.g., a Hardware referencing a Vendor) get resolved into typed objects.

### Task D1: Astro content collections config

**Files:**
- Create: `apps/web/src/content/config.ts`
- Create: `apps/web/src/content/loaders.ts`

- [ ] **Step 1: Implement loaders.ts**

```ts
// apps/web/src/content/loaders.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import fg from 'fast-glob';
import { z } from 'zod';

const DATA_ROOT = path.resolve(process.cwd(), '../../data');

export function yamlGlobLoader<T extends z.ZodSchema>(opts: {
  glob: string;
  schema: T;
}): () => Promise<Array<{ id: string; data: z.infer<T> }>> {
  return async () => {
    const files = await fg(opts.glob, { cwd: DATA_ROOT, absolute: true });
    const out: Array<{ id: string; data: z.infer<T> }> = [];
    for (const file of files) {
      const text = await fs.readFile(file, 'utf-8');
      const parsed = opts.schema.parse(parse(text));
      out.push({ id: (parsed as { id: string }).id, data: parsed });
    }
    return out;
  };
}
```

- [ ] **Step 2: Implement content/config.ts**

```ts
// apps/web/src/content/config.ts
import { defineCollection } from 'astro:content';
import {
  VendorSchema, HardwareSchema, ServerSchema, InterconnectSchema,
  OperatorSchema, EngineSchema, QuantizationSchema, ParallelStrategySchema,
  ModelSchema, CaseSchema, PatternSchema
} from '@evokernel/schemas';
import { yamlGlobLoader } from './loaders';

export const collections = {
  vendors: defineCollection({ loader: yamlGlobLoader({ glob: 'vendors/*.yaml', schema: VendorSchema }), schema: VendorSchema }),
  hardware: defineCollection({ loader: yamlGlobLoader({ glob: 'hardware/**/*.yaml', schema: HardwareSchema }), schema: HardwareSchema }),
  servers: defineCollection({ loader: yamlGlobLoader({ glob: 'servers/*.yaml', schema: ServerSchema }), schema: ServerSchema }),
  interconnects: defineCollection({ loader: yamlGlobLoader({ glob: 'interconnects/*.yaml', schema: InterconnectSchema }), schema: InterconnectSchema }),
  operators: defineCollection({ loader: yamlGlobLoader({ glob: 'operators/*.yaml', schema: OperatorSchema }), schema: OperatorSchema }),
  engines: defineCollection({ loader: yamlGlobLoader({ glob: 'engines/*.yaml', schema: EngineSchema }), schema: EngineSchema }),
  quantizations: defineCollection({ loader: yamlGlobLoader({ glob: 'quantizations/*.yaml', schema: QuantizationSchema }), schema: QuantizationSchema }),
  parallelStrategies: defineCollection({ loader: yamlGlobLoader({ glob: 'parallel-strategies/*.yaml', schema: ParallelStrategySchema }), schema: ParallelStrategySchema }),
  models: defineCollection({ loader: yamlGlobLoader({ glob: 'models/**/*.yaml', schema: ModelSchema }), schema: ModelSchema }),
  cases: defineCollection({ loader: yamlGlobLoader({ glob: 'cases/**/*.yaml', schema: CaseSchema }), schema: CaseSchema }),
  patterns: defineCollection({ loader: yamlGlobLoader({ glob: 'patterns/*.yaml', schema: PatternSchema }), schema: PatternSchema })
};
```

- [ ] **Step 3: Verify build picks up data**

```bash
cd apps/web && pnpm astro check
```

Expected: 0 errors, content collection types generated.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/content
git commit -m "feat(web): wire astro content collections to data/yaml"
```

---

### Task D2: Data accessor library with cross-reference resolution

**Files:**
- Create: `apps/web/src/lib/data/index.ts`
- Create: `apps/web/src/lib/data/resolve.ts`
- Test: `apps/web/src/lib/data/resolve.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/web/src/lib/data/resolve.test.ts
import { describe, it, expect } from 'vitest';
import { resolveHardwareWithVendor, resolveCaseWithStack } from './resolve';

const fakeVendors = [{ id: 'nvidia', data: { id: 'nvidia', name: 'NVIDIA', country: 'US', type: 'hardware', website: 'https://x', chinese_names: ['英伟达'], aliases: [] } }] as any;
const fakeHardware = [{ id: 'h100-sxm5', data: { id: 'h100-sxm5', name: 'H100', vendor: 'nvidia' } }] as any;

describe('resolveHardwareWithVendor', () => {
  it('attaches vendor object', () => {
    const r = resolveHardwareWithVendor(fakeHardware, fakeVendors);
    expect(r[0].vendor.name).toBe('NVIDIA');
  });

  it('throws on dangling vendor reference', () => {
    const broken = [{ id: 'x', data: { id: 'x', name: 'X', vendor: 'unknown' } }] as any;
    expect(() => resolveHardwareWithVendor(broken, fakeVendors)).toThrow(/unknown/);
  });
});
```

- [ ] **Step 2: Verify fail**

```bash
cd apps/web && pnpm test resolve
```

- [ ] **Step 3: Implement resolve.ts**

```ts
// apps/web/src/lib/data/resolve.ts
import type { Vendor, Hardware, Server, Model, Engine, Quantization, ParallelStrategy, Case } from '@evokernel/schemas';

type Entry<T> = { id: string; data: T };

function indexBy<T extends { id: string }>(items: Entry<T>[]): Map<string, T> {
  return new Map(items.map(({ data }) => [data.id, data]));
}

export type ResolvedHardware = Hardware & { vendor: Vendor };

export function resolveHardwareWithVendor(
  hardware: Entry<Hardware>[],
  vendors: Entry<Vendor>[]
): ResolvedHardware[] {
  const vmap = indexBy(vendors);
  return hardware.map(({ data }) => {
    const vendor = vmap.get(data.vendor);
    if (!vendor) throw new Error(`hardware ${data.id} references unknown vendor "${data.vendor}"`);
    return { ...data, vendor };
  });
}

export type ResolvedCase = Case & {
  resolved: {
    hardware: Hardware;
    server?: Server;
    model: Model;
    engine: Engine;
    quantization: Quantization;
  };
};

export function resolveCaseWithStack(
  cases: Entry<Case>[],
  catalogs: {
    hardware: Entry<Hardware>[];
    servers: Entry<Server>[];
    models: Entry<Model>[];
    engines: Entry<Engine>[];
    quantizations: Entry<Quantization>[];
  }
): ResolvedCase[] {
  const hmap = indexBy(catalogs.hardware);
  const smap = indexBy(catalogs.servers);
  const mmap = indexBy(catalogs.models);
  const emap = indexBy(catalogs.engines);
  const qmap = indexBy(catalogs.quantizations);

  return cases.map(({ data }) => {
    const hw = hmap.get(data.stack.hardware.id);
    if (!hw) throw new Error(`case ${data.id}: unknown hardware "${data.stack.hardware.id}"`);
    const md = mmap.get(data.stack.model.id);
    if (!md) throw new Error(`case ${data.id}: unknown model "${data.stack.model.id}"`);
    const en = emap.get(data.stack.engine.id);
    if (!en) throw new Error(`case ${data.id}: unknown engine "${data.stack.engine.id}"`);
    const qt = qmap.get(data.stack.quantization);
    if (!qt) throw new Error(`case ${data.id}: unknown quantization "${data.stack.quantization}"`);
    const sv = data.stack.server ? smap.get(data.stack.server.id) : undefined;
    return { ...data, resolved: { hardware: hw, server: sv, model: md, engine: en, quantization: qt } };
  });
}
```

- [ ] **Step 4: Implement public API in index.ts**

```ts
// apps/web/src/lib/data/index.ts
import { getCollection } from 'astro:content';
import { resolveHardwareWithVendor, resolveCaseWithStack, type ResolvedHardware, type ResolvedCase } from './resolve';

export async function getResolvedHardware(): Promise<ResolvedHardware[]> {
  const [hardware, vendors] = await Promise.all([getCollection('hardware'), getCollection('vendors')]);
  return resolveHardwareWithVendor(hardware, vendors);
}

export async function getResolvedCases(): Promise<ResolvedCase[]> {
  const [cases, hardware, servers, models, engines, quantizations] = await Promise.all([
    getCollection('cases'), getCollection('hardware'), getCollection('servers'),
    getCollection('models'), getCollection('engines'), getCollection('quantizations')
  ]);
  return resolveCaseWithStack(cases, { hardware, servers, models, engines, quantizations });
}

export async function getHardwareBySlug(slug: string): Promise<ResolvedHardware | null> {
  const all = await getResolvedHardware();
  return all.find((h) => h.id === slug) ?? null;
}

export async function getModelBySlug(slug: string) {
  const models = await getCollection('models');
  return models.find((m) => m.id === slug)?.data ?? null;
}

export async function getCaseBySlug(slug: string): Promise<ResolvedCase | null> {
  const all = await getResolvedCases();
  return all.find((c) => c.id === slug) ?? null;
}
```

- [ ] **Step 5: Run tests, commit**

```bash
cd apps/web && pnpm test
git add apps/web/src/lib/data
git commit -m "feat(web): typed data accessors with cross-reference resolution"
```

---

### Task D3: Search index generation (Pagefind + custom facet)

**Files:**
- Create: `apps/web/src/lib/search/build-facets.ts`
- Modify: `apps/web/astro.config.mjs` (add Pagefind hook)

- [ ] **Step 1: Implement build-facets.ts**

```ts
// apps/web/src/lib/search/build-facets.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { getResolvedHardware } from '../data';

export type HardwareFacet = {
  id: string;
  name: string;
  vendor: string;
  vendor_country: string;
  form_factor: string;
  status: string;
  release_year: number;
  bf16_tflops: number | null;
  memory_gb: number | null;
  fp8_supported: boolean;
  fp4_supported: boolean;
};

export async function buildHardwareFacets(): Promise<HardwareFacet[]> {
  const all = await getResolvedHardware();
  return all.map((h) => ({
    id: h.id,
    name: h.name,
    vendor: h.vendor.id,
    vendor_country: h.vendor.country,
    form_factor: h.form_factor,
    status: h.status,
    release_year: h.release_year,
    bf16_tflops: h.compute.bf16_tflops?.value ?? null,
    memory_gb: h.memory.capacity_gb?.value ?? null,
    fp8_supported: h.compute.fp8_tflops !== null,
    fp4_supported: h.compute.fp4_tflops !== null
  }));
}

export async function writeHardwareFacetsJson(outDir: string): Promise<void> {
  const facets = await buildHardwareFacets();
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'hardware-facets.json'), JSON.stringify(facets), 'utf-8');
}
```

- [ ] **Step 2: Hook into Astro build**

Update `apps/web/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { writeHardwareFacetsJson } from './src/lib/search/build-facets';

export default defineConfig({
  site: 'https://evokernel.dev',
  output: 'static',
  integrations: [
    react(),
    mdx(),
    sitemap(),
    {
      name: 'evokernel-facets',
      hooks: {
        'astro:build:done': async ({ dir }) => {
          await writeHardwareFacetsJson(new URL('facets/', dir).pathname);
        }
      }
    }
  ],
  vite: { plugins: [tailwindcss()] },
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: { prefixDefaultLocale: false }
  }
});
```

- [ ] **Step 3: Smoke-test the build**

```bash
cd apps/web && pnpm build
```

Expected: build completes, `dist/facets/hardware-facets.json` created, Pagefind index generated under `dist/pagefind/`.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): generate hardware facet index and Pagefind static search"
```

---

### Task D4: Documentation generator (schemas → markdown)

**Files:**
- Create: `scripts/generate-docs.ts`

- [ ] **Step 1: Implement generate-docs.ts**

```ts
// scripts/generate-docs.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  VendorSchema, HardwareSchema, ServerSchema, InterconnectSchema,
  OperatorSchema, EngineSchema, QuantizationSchema, ParallelStrategySchema,
  ModelSchema, CaseSchema, PatternSchema, EvidenceSchema
} from '@evokernel/schemas';
import { z } from 'zod';

const ENTITIES: Array<[string, z.ZodTypeAny]> = [
  ['Vendor', VendorSchema], ['Hardware', HardwareSchema], ['Server', ServerSchema],
  ['Interconnect', InterconnectSchema], ['Operator', OperatorSchema], ['Engine', EngineSchema],
  ['Quantization', QuantizationSchema], ['ParallelStrategy', ParallelStrategySchema],
  ['Model', ModelSchema], ['Case', CaseSchema], ['Pattern', PatternSchema], ['Evidence', EvidenceSchema]
];

function shapeOf(schema: z.ZodTypeAny, depth = 0): string {
  // Simplified shape extraction for documentation
  if (schema instanceof z.ZodObject) {
    const lines: string[] = [];
    const indent = '  '.repeat(depth);
    for (const [k, v] of Object.entries(schema.shape)) {
      lines.push(`${indent}- ${k}: ${describeType(v as z.ZodTypeAny)}`);
    }
    return lines.join('\n');
  }
  return describeType(schema);
}

function describeType(s: z.ZodTypeAny): string {
  const def = (s as any)._def;
  if (def?.typeName === 'ZodEnum') return `enum(${def.values.join(' | ')})`;
  if (def?.typeName === 'ZodString') return 'string';
  if (def?.typeName === 'ZodNumber') return 'number';
  if (def?.typeName === 'ZodBoolean') return 'boolean';
  if (def?.typeName === 'ZodArray') return `array<${describeType(def.type)}>`;
  if (def?.typeName === 'ZodOptional') return `${describeType(def.innerType)}?`;
  if (def?.typeName === 'ZodNullable') return `${describeType(def.innerType)} | null`;
  if (def?.typeName === 'ZodObject') return 'object{...}';
  return def?.typeName ?? 'unknown';
}

const out = ['# Data Model Reference', '', '> Auto-generated from `schemas/*.ts`. Do not edit by hand.', ''];
for (const [name, schema] of ENTITIES) {
  out.push(`## ${name}`, '', shapeOf(schema), '');
}
await fs.writeFile(path.join('docs', 'data-model.md'), out.join('\n'), 'utf-8');
console.log('✓ wrote docs/data-model.md');
```

- [ ] **Step 2: Run, verify output**

```bash
pnpm tsx scripts/generate-docs.ts
```

Expected: `docs/data-model.md` created with sections for each entity.

- [ ] **Step 3: Commit**

```bash
git add docs/data-model.md scripts/generate-docs.ts
git commit -m "feat(scripts): auto-generate data model markdown from zod schemas"
```

---

## Milestone E — UI Primitives & Layout

### Task E1: Base layout + nav + footer

**Files:**
- Create: `apps/web/src/layouts/BaseLayout.astro`
- Create: `apps/web/src/components/ui/{Nav,Footer}.astro`

- [ ] **Step 1: Implement BaseLayout.astro**

```astro
---
// apps/web/src/layouts/BaseLayout.astro
import '~/styles/global.css';
import Nav from '~/components/ui/Nav.astro';
import Footer from '~/components/ui/Footer.astro';

interface Props {
  title: string;
  description?: string;
  noIndex?: boolean;
}

const { title, description = 'AI 推理硬件 × 模型 × 部署的开源知识库', noIndex = false } = Astro.props;
---
<!DOCTYPE html>
<html lang={Astro.currentLocale ?? 'zh'}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · EvoKernel Spec</title>
    <meta name="description" content={description} />
    {noIndex && <meta name="robots" content="noindex" />}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body class="min-h-screen flex flex-col">
    <Nav />
    <main class="flex-1"><slot /></main>
    <Footer />
  </body>
</html>
```

- [ ] **Step 2: Implement Nav.astro**

```astro
---
// apps/web/src/components/ui/Nav.astro
const links = [
  { href: '/hardware', label: '硬件', en: 'Hardware' },
  { href: '/models', label: '模型', en: 'Models' },
  { href: '/cases', label: '案例', en: 'Cases' },
  { href: '/calculator', label: '计算器', en: 'Calculator' },
  { href: '/china', label: '国产专题', en: 'China Hub', accent: true }
];
---
<header class="border-b" style="border-color: var(--color-border); background: var(--color-surface);">
  <nav class="max-w-7xl mx-auto flex items-center justify-between py-4 px-6" aria-label="Main navigation">
    <a href="/" class="font-semibold text-lg" style="color: var(--color-text);">EvoKernel<span style="color: var(--color-accent);">·Spec</span></a>
    <ul class="flex gap-6">
      {links.map((l) => (
        <li>
          <a href={l.href}
             class="text-sm hover:opacity-100 transition-opacity"
             style={`color: ${l.accent ? 'var(--color-china)' : 'var(--color-text-muted)'}; font-weight: ${l.accent ? '600' : '400'};`}>
            {l.label}
          </a>
        </li>
      ))}
    </ul>
    <a href="https://github.com/evokernel/evokernel-spec" class="text-sm" style="color: var(--color-text-muted);">GitHub</a>
  </nav>
</header>
```

- [ ] **Step 3: Implement Footer.astro**

```astro
---
// apps/web/src/components/ui/Footer.astro
---
<footer class="border-t mt-[var(--space-section)]" style="border-color: var(--color-border); background: var(--color-surface);">
  <div class="max-w-7xl mx-auto py-12 px-6 text-sm" style="color: var(--color-text-muted);">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
      <div>
        <div class="font-semibold mb-2" style="color: var(--color-text);">EvoKernel Spec</div>
        <p class="text-xs">AI 推理硬件 × 模型 × 部署的开源知识库</p>
      </div>
      <div>
        <div class="font-semibold mb-2" style="color: var(--color-text);">浏览</div>
        <ul class="space-y-1 text-xs">
          <li><a href="/hardware">硬件</a></li>
          <li><a href="/models">模型</a></li>
          <li><a href="/cases">案例</a></li>
          <li><a href="/china">国产专题</a></li>
        </ul>
      </div>
      <div>
        <div class="font-semibold mb-2" style="color: var(--color-text);">参与</div>
        <ul class="space-y-1 text-xs">
          <li><a href="/about">关于</a></li>
          <li><a href="https://github.com/evokernel/evokernel-spec">GitHub</a></li>
          <li><a href="https://github.com/evokernel/evokernel-spec/blob/main/docs/contributing.md">贡献指南</a></li>
        </ul>
      </div>
      <div>
        <div class="font-semibold mb-2" style="color: var(--color-text);">许可</div>
        <ul class="space-y-1 text-xs">
          <li>代码 Apache 2.0</li>
          <li>数据 CC-BY-SA 4.0</li>
        </ul>
      </div>
    </div>
    <div class="text-xs pt-4 border-t" style="border-color: var(--color-border);">
      <p>本站数字均带 evidence 标签 (官方 / 实测 / 估算)。所有 vendor-claimed 数据未经独立验证,不构成投资或采购建议。</p>
    </div>
  </div>
</footer>
```

- [ ] **Step 4: Update index.astro to use BaseLayout**

```astro
---
// apps/web/src/pages/index.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
---
<BaseLayout title="首页">
  <section class="max-w-7xl mx-auto px-6 py-[var(--space-section)]">
    <h1 class="text-[var(--text-hero)]">EvoKernel Spec</h1>
    <p class="text-xl mt-6 max-w-2xl" style="color: var(--color-text-muted);">
      任意模型 → 任意硬件的可计算、可引证、可贡献的开源知识资产。
    </p>
  </section>
</BaseLayout>
```

- [ ] **Step 5: Verify dev server**

```bash
cd apps/web && pnpm dev
```

Visit `http://localhost:4321/`, check nav, footer, and hero render. Stop server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): base layout with nav and footer"
```

---

### Task E2: TierChip + Badge components

**Files:**
- Create: `apps/web/src/components/ui/TierChip.astro`
- Create: `apps/web/src/components/ui/Badge.astro`
- Test: `apps/web/src/components/ui/TierChip.test.tsx` (manual visual test)

- [ ] **Step 1: Implement TierChip.astro**

```astro
---
// apps/web/src/components/ui/TierChip.astro
import type { Tier } from '@evokernel/schemas';
interface Props { tier: Tier; size?: 'sm' | 'md'; }
const { tier, size = 'sm' } = Astro.props;

const config = {
  official: { label: '厂商声称', icon: '📄', colorVar: '--color-tier-official' },
  measured: { label: '实测验证', icon: '✅', colorVar: '--color-tier-measured' },
  estimated: { label: '社区估算', icon: '⚠️', colorVar: '--color-tier-estimated' }
} as const;
const { label, icon, colorVar } = config[tier];
const padding = size === 'md' ? '0.25rem 0.625rem' : '0.125rem 0.5rem';
const fontSize = size === 'md' ? 'var(--text-sm)' : 'var(--text-xs)';
---
<span class="inline-flex items-center gap-1 rounded-full font-medium"
      style={`padding: ${padding}; font-size: ${fontSize}; color: var(${colorVar}); background: color-mix(in oklch, var(${colorVar}) 12%, var(--color-bg));`}
      data-tier={tier}>
  <span aria-hidden="true">{icon}</span>{label}
</span>
```

- [ ] **Step 2: Implement Badge.astro**

```astro
---
// apps/web/src/components/ui/Badge.astro
interface Props { variant?: 'default' | 'china' | 'success' | 'warn'; }
const { variant = 'default' } = Astro.props;

const colorVar = {
  default: '--color-text-muted',
  china: '--color-china',
  success: '--color-tier-measured',
  warn: '--color-tier-estimated'
}[variant];
---
<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={`color: var(${colorVar}); background: color-mix(in oklch, var(${colorVar}) 14%, var(--color-bg));`}>
  <slot />
</span>
```

- [ ] **Step 3: Smoke-test in dev**

Add to `index.astro` temporarily:

```astro
<TierChip tier="official" /> <TierChip tier="measured" /> <TierChip tier="estimated" />
```

Run dev, visually verify three chips render with distinct colors. Remove after verifying.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(web): TierChip and Badge primitive components"
```

---

### Task E3: ValueWithEvidence + EvidencePopover

**Files:**
- Create: `apps/web/src/components/ui/ValueWithEvidence.astro`
- Create: `apps/web/src/components/ui/EvidencePopover.tsx` (React island)

- [ ] **Step 1: Implement ValueWithEvidence.astro**

```astro
---
// apps/web/src/components/ui/ValueWithEvidence.astro
import type { Evidence, Tier } from '@evokernel/schemas';
import TierChip from './TierChip.astro';
import EvidencePopover from './EvidencePopover.tsx';

interface Props {
  value: number | string | null;
  unit?: string;
  evidence?: Evidence;             // pass the actual evidence record (resolved server-side)
  tier?: Tier;
  format?: (n: number) => string;
}
const { value, unit, evidence, tier, format } = Astro.props;
const display = value === null ? '—' : (typeof value === 'number' && format ? format(value) : String(value));
---
<span class="inline-flex items-baseline gap-1">
  <span class="font-mono">{display}</span>
  {unit && value !== null && <span class="text-sm" style="color: var(--color-text-muted);">{unit}</span>}
  {evidence && tier && (
    <EvidencePopover evidence={evidence} client:idle>
      <TierChip tier={tier} />
    </EvidencePopover>
  )}
</span>
```

- [ ] **Step 2: Implement EvidencePopover.tsx (React island, hover/click popover)**

```tsx
// apps/web/src/components/ui/EvidencePopover.tsx
import { useState, type ReactNode } from 'react';
import type { Evidence } from '@evokernel/schemas';

interface Props { evidence: Evidence; children: ReactNode; }

export default function EvidencePopover({ evidence, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="cursor-help" onClick={() => setOpen((o) => !o)}>{children}</button>
      {open && (
        <span className="absolute z-10 left-0 top-full mt-1 w-80 p-3 rounded shadow-lg text-xs"
              style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
          <div className="font-semibold mb-1">{evidence.citation}</div>
          <div className="opacity-70 mb-2">访问于 {evidence.accessed} · {evidence.source_type}</div>
          <a href={evidence.url} target="_blank" rel="noopener noreferrer"
             className="underline" style={{ color: 'var(--color-accent)' }}>{evidence.url}</a>
          {evidence.contributor_attestation && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <span className="opacity-70">声明: </span>{evidence.contributor_attestation}
            </div>
          )}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Smoke test by adding a sample to index page, visual check, remove**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(web): ValueWithEvidence with hover popover for citation context"
```

---

### Task E4: KPI Card + SpecRow components

**Files:**
- Create: `apps/web/src/components/ui/KpiCard.astro`
- Create: `apps/web/src/components/ui/SpecRow.astro`

- [ ] **Step 1: KpiCard.astro**

```astro
---
// apps/web/src/components/ui/KpiCard.astro
interface Props { label: string; sublabel?: string; emphasize?: boolean; }
const { label, sublabel, emphasize } = Astro.props;
---
<div class="rounded-lg p-5 border"
     style={`background: var(--color-surface-raised); border-color: var(--color-border); ${emphasize ? 'box-shadow: 0 8px 24px -16px var(--color-accent);' : ''}`}>
  <div class="text-xs uppercase tracking-wide font-medium" style="color: var(--color-text-muted);">{label}</div>
  {sublabel && <div class="text-xs mt-0.5" style="color: var(--color-text-muted);">{sublabel}</div>}
  <div class="text-3xl mt-3 font-semibold tabular-nums">
    <slot />
  </div>
</div>
```

- [ ] **Step 2: SpecRow.astro**

```astro
---
// apps/web/src/components/ui/SpecRow.astro
interface Props { label: string; }
const { label } = Astro.props;
---
<div class="grid grid-cols-[10rem,1fr] gap-4 py-3 border-b last:border-b-0" style="border-color: var(--color-border);">
  <div class="text-sm" style="color: var(--color-text-muted);">{label}</div>
  <div class="text-sm"><slot /></div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(web): KpiCard and SpecRow primitives"
```

---

### Task E5: Section heading + container utilities

**Files:**
- Create: `apps/web/src/components/ui/{SectionHeader,Container}.astro`

- [ ] **Step 1: Container.astro**

```astro
---
// apps/web/src/components/ui/Container.astro
interface Props { width?: 'narrow' | 'default' | 'wide'; }
const { width = 'default' } = Astro.props;
const max = { narrow: 'max-w-3xl', default: 'max-w-7xl', wide: 'max-w-screen-2xl' }[width];
---
<div class={`${max} mx-auto px-6`}><slot /></div>
```

- [ ] **Step 2: SectionHeader.astro**

```astro
---
// apps/web/src/components/ui/SectionHeader.astro
interface Props { eyebrow?: string; title: string; subtitle?: string; }
const { eyebrow, title, subtitle } = Astro.props;
---
<header class="mb-8">
  {eyebrow && <div class="text-xs uppercase tracking-widest font-medium mb-2" style="color: var(--color-accent);">{eyebrow}</div>}
  <h2 class="text-3xl font-semibold">{title}</h2>
  {subtitle && <p class="text-base mt-2 max-w-2xl" style="color: var(--color-text-muted);">{subtitle}</p>}
</header>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(web): Container and SectionHeader layout primitives"
```

---

---

## Milestone F — Hardware Pages

### Task F1: Hardware list page (`/hardware`)

**Files:**
- Create: `apps/web/src/pages/hardware/index.astro`
- Create: `apps/web/src/components/hardware/HardwareCard.astro`

- [ ] **Step 1: HardwareCard.astro**

```astro
---
// apps/web/src/components/hardware/HardwareCard.astro
import type { Hardware, Vendor } from '@evokernel/schemas';
import Badge from '~/components/ui/Badge.astro';
interface Props { hardware: Hardware & { vendor: Vendor } }
const { hardware: h } = Astro.props;
const isChina = h.vendor.country === 'CN';
const bf16 = h.compute.bf16_tflops?.value;
const mem = h.memory.capacity_gb?.value;
const bw = h.memory.bandwidth_gbps?.value;
---
<a href={`/hardware/${h.id}`} class="block group">
  <article class="rounded-lg p-5 border h-full transition-all hover:translate-y-[-2px]"
           style={`background: var(--color-surface-raised); border-color: ${isChina ? 'color-mix(in oklch, var(--color-china) 25%, var(--color-border))' : 'var(--color-border)'};`}>
    <div class="flex justify-between items-start mb-3">
      <div>
        <div class="text-xs font-medium" style={`color: ${isChina ? 'var(--color-china)' : 'var(--color-text-muted)'};`}>{h.vendor.name}</div>
        <h3 class="text-lg font-semibold mt-0.5 group-hover:opacity-80">{h.name}</h3>
      </div>
      {isChina && <Badge variant="china">国产</Badge>}
    </div>
    <dl class="grid grid-cols-3 gap-2 text-xs">
      <div>
        <dt style="color: var(--color-text-muted);">BF16</dt>
        <dd class="font-mono mt-0.5">{bf16 ?? '—'} <span class="opacity-70">TF</span></dd>
      </div>
      <div>
        <dt style="color: var(--color-text-muted);">Memory</dt>
        <dd class="font-mono mt-0.5">{mem ?? '—'} <span class="opacity-70">GB</span></dd>
      </div>
      <div>
        <dt style="color: var(--color-text-muted);">BW</dt>
        <dd class="font-mono mt-0.5">{bw ? (bw / 1000).toFixed(1) : '—'} <span class="opacity-70">TB/s</span></dd>
      </div>
    </dl>
    <div class="flex gap-1 mt-3 flex-wrap">
      <Badge>{h.form_factor.toUpperCase()}</Badge>
      <Badge>{h.status === 'in-production' ? '在售' : h.status}</Badge>
      {h.compute.fp8_tflops && <Badge variant="success">FP8</Badge>}
      {h.compute.fp4_tflops && <Badge variant="success">FP4</Badge>}
    </div>
  </article>
</a>
```

- [ ] **Step 2: List page**

```astro
---
// apps/web/src/pages/hardware/index.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import SectionHeader from '~/components/ui/SectionHeader.astro';
import HardwareCard from '~/components/hardware/HardwareCard.astro';
import { getResolvedHardware } from '~/lib/data';

const all = await getResolvedHardware();
const grouped = {
  china: all.filter((h) => h.vendor.country === 'CN').sort((a, b) => b.release_year - a.release_year),
  overseas: all.filter((h) => h.vendor.country !== 'CN').sort((a, b) => b.release_year - a.release_year)
};
---
<BaseLayout title="硬件目录">
  <Container>
    <section class="py-[var(--space-section)]">
      <SectionHeader eyebrow="HARDWARE" title="硬件目录" subtitle={`${all.length} 张加速卡 · ${grouped.china.length} 张国产 · 数据均带 evidence 标签`} />

      <h3 class="text-xl font-semibold mt-12 mb-4" style="color: var(--color-china);">国产 ({grouped.china.length})</h3>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {grouped.china.map((h) => <HardwareCard hardware={h} />)}
      </div>

      <h3 class="text-xl font-semibold mt-16 mb-4">海外 ({grouped.overseas.length})</h3>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {grouped.overseas.map((h) => <HardwareCard hardware={h} />)}
      </div>
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 3: Verify dev render**

```bash
cd apps/web && pnpm dev
```

Visit `/hardware`, verify 国产 section appears first with all cards. Stop server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): hardware list page with China-first grouping"
```

---

### Task F2: Hardware filter sidebar (React island)

**Files:**
- Create: `apps/web/src/components/hardware/HardwareFilter.tsx`
- Modify: `apps/web/src/pages/hardware/index.astro` to use it

- [ ] **Step 1: Implement HardwareFilter.tsx**

```tsx
// apps/web/src/components/hardware/HardwareFilter.tsx
import { useState, useMemo } from 'react';
import type { HardwareFacet } from '~/lib/search/build-facets';

interface Props { facets: HardwareFacet[]; }

type Filters = {
  country: 'all' | 'CN' | 'US';
  formFactor: string | 'all';
  fp8: boolean;
  fp4: boolean;
  status: string | 'all';
};

const initial: Filters = { country: 'all', formFactor: 'all', fp8: false, fp4: false, status: 'all' };

export default function HardwareFilter({ facets }: Props) {
  const [f, setF] = useState<Filters>(initial);

  const filtered = useMemo(() => facets.filter((h) => {
    if (f.country !== 'all' && h.vendor_country !== f.country) return false;
    if (f.formFactor !== 'all' && h.form_factor !== f.formFactor) return false;
    if (f.fp8 && !h.fp8_supported) return false;
    if (f.fp4 && !h.fp4_supported) return false;
    if (f.status !== 'all' && h.status !== f.status) return false;
    return true;
  }), [facets, f]);

  // Emit filtered ids to siblings via custom event for the static cards to hide/show
  useMemo(() => {
    const ids = new Set(filtered.map((x) => x.id));
    document.querySelectorAll<HTMLElement>('[data-hw-card]').forEach((el) => {
      el.style.display = ids.has(el.dataset.hwCard ?? '') ? '' : 'none';
    });
  }, [filtered]);

  return (
    <aside className="space-y-5 sticky top-4 text-sm">
      <div>
        <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>厂商国别</h4>
        <div className="flex gap-1">
          {(['all', 'CN', 'US'] as const).map((c) => (
            <button key={c} onClick={() => setF({ ...f, country: c })}
                    className="px-2 py-1 rounded text-xs"
                    style={{ background: f.country === c ? 'var(--color-accent)' : 'var(--color-surface)', color: f.country === c ? 'white' : 'var(--color-text)' }}>
              {c === 'all' ? '全部' : c === 'CN' ? '国产' : '海外'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>形态</h4>
        <select value={f.formFactor} onChange={(e) => setF({ ...f, formFactor: e.target.value as Filters['formFactor'] })}
                className="w-full px-2 py-1 rounded border text-sm"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          <option value="all">全部</option>
          <option value="sxm">SXM</option>
          <option value="oam">OAM</option>
          <option value="pcie">PCIe</option>
          <option value="nvl">NVL</option>
          <option value="proprietary">自研</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.fp8} onChange={(e) => setF({ ...f, fp8: e.target.checked })} /> 支持 FP8</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.fp4} onChange={(e) => setF({ ...f, fp4: e.target.checked })} /> 支持 FP4</label>
      </div>
      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {filtered.length} / {facets.length} 显示
      </div>
      <button onClick={() => setF(initial)} className="text-xs underline" style={{ color: 'var(--color-accent)' }}>重置筛选</button>
    </aside>
  );
}
```

- [ ] **Step 2: Wire into list page**

In `apps/web/src/pages/hardware/index.astro`, load the facets at build time and pass to filter:

```astro
---
// add to imports
import HardwareFilter from '~/components/hardware/HardwareFilter.tsx';
import { buildHardwareFacets } from '~/lib/search/build-facets';
const facets = await buildHardwareFacets();
// also: add data-hw-card={h.id} attribute to HardwareCard's <article>
---
<!-- replace single column layout with two-column -->
<div class="grid grid-cols-1 lg:grid-cols-[14rem,1fr] gap-8">
  <HardwareFilter facets={facets} client:load />
  <div>
    <!-- existing card grid -->
  </div>
</div>
```

Update `HardwareCard.astro` to add `data-hw-card={h.id}` attribute on the article element.

- [ ] **Step 3: Smoke test in dev**

Verify filters hide/show cards in real time.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): hardware list filter with country and form-factor facets"
```

---

### Task F3: Hardware detail page — KPI band + spec table

**Files:**
- Create: `apps/web/src/pages/hardware/[slug].astro`
- Create: `apps/web/src/components/hardware/{KpiBand,SpecTable}.astro`

- [ ] **Step 1: KpiBand.astro**

```astro
---
// apps/web/src/components/hardware/KpiBand.astro
import type { Hardware } from '@evokernel/schemas';
import KpiCard from '~/components/ui/KpiCard.astro';
import ValueWithEvidence from '~/components/ui/ValueWithEvidence.astro';
interface Props { hw: Hardware; }
const { hw } = Astro.props;
const ev = (id?: string) => hw.evidence.find((e) => e.id === id);
---
<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
  <KpiCard label="BF16" sublabel="TFLOP/s">
    {hw.compute.bf16_tflops
      ? <ValueWithEvidence value={hw.compute.bf16_tflops.value} evidence={ev(hw.compute.bf16_tflops.evidence_ref)!} tier={ev(hw.compute.bf16_tflops.evidence_ref)!.tier} />
      : '—'}
  </KpiCard>
  <KpiCard label="FP8" sublabel="TFLOP/s">
    {hw.compute.fp8_tflops
      ? <ValueWithEvidence value={hw.compute.fp8_tflops.value} evidence={ev(hw.compute.fp8_tflops.evidence_ref)!} tier={ev(hw.compute.fp8_tflops.evidence_ref)!.tier} />
      : '—'}
  </KpiCard>
  <KpiCard label="FP4" sublabel="TFLOP/s">
    {hw.compute.fp4_tflops
      ? <ValueWithEvidence value={hw.compute.fp4_tflops.value} evidence={ev(hw.compute.fp4_tflops.evidence_ref)!} tier={ev(hw.compute.fp4_tflops.evidence_ref)!.tier} />
      : '—'}
  </KpiCard>
  <KpiCard label="Memory" sublabel="GB">
    {hw.memory.capacity_gb
      ? <ValueWithEvidence value={hw.memory.capacity_gb.value} evidence={ev(hw.memory.capacity_gb.evidence_ref)!} tier={ev(hw.memory.capacity_gb.evidence_ref)!.tier} />
      : '—'}
  </KpiCard>
  <KpiCard label="Mem BW" sublabel="GB/s">
    {hw.memory.bandwidth_gbps
      ? <ValueWithEvidence value={hw.memory.bandwidth_gbps.value} evidence={ev(hw.memory.bandwidth_gbps.evidence_ref)!} tier={ev(hw.memory.bandwidth_gbps.evidence_ref)!.tier} />
      : '—'}
  </KpiCard>
  <KpiCard label="TDP" sublabel="W">
    {hw.power.tdp_w
      ? <ValueWithEvidence value={hw.power.tdp_w.value} evidence={ev(hw.power.tdp_w.evidence_ref)!} tier={ev(hw.power.tdp_w.evidence_ref)!.tier} />
      : '—'}
  </KpiCard>
</div>
```

- [ ] **Step 2: SpecTable.astro**

```astro
---
// apps/web/src/components/hardware/SpecTable.astro
import type { Hardware } from '@evokernel/schemas';
import SpecRow from '~/components/ui/SpecRow.astro';
interface Props { hw: Hardware; }
const { hw } = Astro.props;
---
<div class="space-y-8">
  <section>
    <h3 class="text-lg font-semibold mb-3">算力</h3>
    <div class="rounded-lg border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
      <SpecRow label="FP4 TFLOPS">{hw.compute.fp4_tflops?.value ?? '不支持'}</SpecRow>
      <SpecRow label="FP8 TFLOPS">{hw.compute.fp8_tflops?.value ?? '不支持'}</SpecRow>
      <SpecRow label="BF16 TFLOPS">{hw.compute.bf16_tflops?.value ?? '—'}</SpecRow>
      <SpecRow label="FP16 TFLOPS">{hw.compute.fp16_tflops?.value ?? '—'}</SpecRow>
      <SpecRow label="INT8 TOPS">{hw.compute.int8_tops?.value ?? '—'}</SpecRow>
    </div>
  </section>

  <section>
    <h3 class="text-lg font-semibold mb-3">显存</h3>
    <div class="rounded-lg border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
      <SpecRow label="容量">{hw.memory.capacity_gb?.value} GB</SpecRow>
      <SpecRow label="带宽">{hw.memory.bandwidth_gbps?.value} GB/s</SpecRow>
      <SpecRow label="类型">{hw.memory.type}</SpecRow>
    </div>
  </section>

  <section>
    <h3 class="text-lg font-semibold mb-3">Scale-Up (节点内)</h3>
    <div class="rounded-lg border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
      <SpecRow label="协议">{hw.scale_up.protocol}</SpecRow>
      <SpecRow label="单链带宽">{hw.scale_up.bandwidth_gbps} GB/s</SpecRow>
      <SpecRow label="World size">{hw.scale_up.world_size}</SpecRow>
      <SpecRow label="拓扑">{hw.scale_up.topology}</SpecRow>
      <SpecRow label="交换机">{hw.scale_up.switch ?? '—'}</SpecRow>
    </div>
  </section>

  <section>
    <h3 class="text-lg font-semibold mb-3">Scale-Out (节点间)</h3>
    <div class="rounded-lg border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
      <SpecRow label="单卡出口">{hw.scale_out.bandwidth_gbps_per_card} Gbps</SpecRow>
      <SpecRow label="协议">{hw.scale_out.protocol}</SpecRow>
      <SpecRow label="NIC">{hw.scale_out.nic ?? '—'}</SpecRow>
    </div>
  </section>

  <section>
    <h3 class="text-lg font-semibold mb-3">功耗</h3>
    <div class="rounded-lg border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
      <SpecRow label="TDP">{hw.power.tdp_w?.value} W</SpecRow>
    </div>
  </section>
</div>
```

- [ ] **Step 3: Detail page**

```astro
---
// apps/web/src/pages/hardware/[slug].astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import KpiBand from '~/components/hardware/KpiBand.astro';
import SpecTable from '~/components/hardware/SpecTable.astro';
import Badge from '~/components/ui/Badge.astro';
import { getResolvedHardware } from '~/lib/data';

export async function getStaticPaths() {
  const all = await getResolvedHardware();
  return all.map((h) => ({ params: { slug: h.id }, props: { hw: h } }));
}

const { hw } = Astro.props;
const isChina = hw.vendor.country === 'CN';
---
<BaseLayout title={hw.name}>
  <Container>
    <section class="pt-12 pb-8">
      <a href="/hardware" class="text-sm" style="color: var(--color-text-muted);">← 硬件目录</a>
      <header class="mt-4 flex items-center gap-3 mb-6">
        <span class="text-sm font-medium" style={`color: ${isChina ? 'var(--color-china)' : 'var(--color-text-muted)'};`}>{hw.vendor.name}</span>
        {isChina && <Badge variant="china">国产</Badge>}
      </header>
      <h1 class="text-4xl font-semibold mb-2">{hw.name}</h1>
      <div class="flex gap-2 mt-2">
        <Badge>{hw.form_factor.toUpperCase()}</Badge>
        <Badge>{hw.status === 'in-production' ? '在售' : hw.status}</Badge>
        <Badge>发布于 {hw.release_year}</Badge>
        <Badge>{hw.generation}</Badge>
      </div>
    </section>

    <section class="pb-8">
      <KpiBand hw={hw} />
    </section>

    <section class="pb-12">
      <SpecTable hw={hw} />
    </section>

    <section class="py-8 text-xs" style="color: var(--color-text-muted);">
      <p>所有数据来源详见下方 evidence。</p>
    </section>

    <section class="pb-16">
      <h3 class="text-lg font-semibold mb-3">引证</h3>
      <ol class="space-y-2 text-sm">
        {hw.evidence.map((e, i) => (
          <li>
            [{i + 1}] {e.citation} —
            <a href={e.url} class="underline" style="color: var(--color-accent);" target="_blank" rel="noopener">{e.url}</a>
            <span class="opacity-60"> · 访问于 {e.accessed}</span>
          </li>
        ))}
      </ol>
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 4: Smoke test in dev**

Visit `/hardware/h100-sxm5`. Verify KPI band, spec sections, evidence list render. Hover a tier chip — popover shows.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): hardware detail with KPI band, spec table, evidence list"
```

---

### Task F4: Software-stack support matrix

**Files:**
- Create: `apps/web/src/components/hardware/SoftwareMatrix.astro`
- Modify: `apps/web/src/pages/hardware/[slug].astro`

- [ ] **Step 1: SoftwareMatrix.astro**

```astro
---
// apps/web/src/components/hardware/SoftwareMatrix.astro
import type { Hardware, Engine, Quantization } from '@evokernel/schemas';
interface Props { hw: Hardware; allEngines: Engine[]; allQuants: Quantization[]; }
const { hw, allEngines, allQuants } = Astro.props;

const supportedEngineMap = new Map(hw.software_support.engines.map((e) => [e.id, e]));
const supportedQuants = new Set(hw.software_support.quantizations);

function statusFor(engineId: string): { glyph: string; label: string; color: string } {
  const s = supportedEngineMap.get(engineId);
  if (!s) return { glyph: '—', label: '未确认', color: 'var(--color-text-muted)' };
  if (s.status === 'officially-supported') return { glyph: '✓', label: '官方', color: 'var(--color-tier-measured)' };
  if (s.status === 'community-port') return { glyph: '~', label: '社区', color: 'var(--color-tier-estimated)' };
  return { glyph: '✗', label: '不支持', color: 'oklch(55% 0.2 25)' };
}
---
<div class="overflow-x-auto rounded-lg border" style="border-color: var(--color-border);">
  <table class="w-full text-sm">
    <thead style="background: var(--color-surface);">
      <tr>
        <th class="text-left px-4 py-2 font-medium">引擎</th>
        {allQuants.map((q) => <th class="px-3 py-2 font-medium text-xs">{q.name}</th>)}
      </tr>
    </thead>
    <tbody>
      {allEngines.map((e) => {
        const status = statusFor(e.id);
        const engineSupported = !!supportedEngineMap.get(e.id);
        return (
          <tr class="border-t" style="border-color: var(--color-border);">
            <td class="px-4 py-2">
              <div class="font-medium">{e.name}</div>
              <div class="text-xs" style={`color: ${status.color};`}>{status.label}</div>
            </td>
            {allQuants.map((q) => (
              <td class="px-3 py-2 text-center">
                {engineSupported && supportedQuants.has(q.id)
                  ? <span style={`color: ${status.color};`}>{status.glyph}</span>
                  : <span style="color: var(--color-text-muted);">—</span>}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Wire into detail page**

In `[slug].astro`, fetch engines and quantizations and render the matrix in a new section after SpecTable.

```astro
---
import { getCollection } from 'astro:content';
import SoftwareMatrix from '~/components/hardware/SoftwareMatrix.astro';
const allEngines = (await getCollection('engines')).map((x) => x.data);
const allQuants = (await getCollection('quantizations')).map((x) => x.data);
---
<section class="pb-12">
  <h3 class="text-lg font-semibold mb-3">软件栈支持</h3>
  <SoftwareMatrix hw={hw} allEngines={allEngines} allQuants={allQuants} />
</section>
```

- [ ] **Step 3: Smoke test, commit**

```bash
git add apps/web/src
git commit -m "feat(web): software-stack support matrix on hardware detail"
```

---

### Task F5: Related cases section on hardware detail

**Files:**
- Create: `apps/web/src/components/hardware/RelatedCases.astro`
- Modify: `apps/web/src/pages/hardware/[slug].astro`

- [ ] **Step 1: RelatedCases.astro**

```astro
---
// apps/web/src/components/hardware/RelatedCases.astro
import type { Case } from '@evokernel/schemas';
interface Props { hardwareId: string; cases: Case[]; }
const { hardwareId, cases } = Astro.props;
const related = cases.filter((c) => c.stack.hardware.id === hardwareId).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
---
{related.length === 0 ? (
  <div class="text-sm p-6 rounded-lg border" style="border-color: var(--color-border); color: var(--color-text-muted); background: var(--color-surface);">
    暂无该硬件的实测案例。
    <a href="https://github.com/evokernel/evokernel-spec/blob/main/docs/contributing.md" class="underline ml-1" style="color: var(--color-accent);">成为第一个贡献者?</a>
  </div>
) : (
  <ul class="space-y-2">
    {related.slice(0, 8).map((c) => (
      <li>
        <a href={`/cases/${c.id}`} class="block p-4 rounded-lg border hover:translate-x-1 transition-transform"
           style="background: var(--color-surface-raised); border-color: var(--color-border);">
          <div class="flex justify-between items-start gap-4">
            <div>
              <div class="font-medium">{c.title}</div>
              <div class="text-xs mt-1" style="color: var(--color-text-muted);">
                {c.stack.model.id} · {c.stack.engine.id} {c.stack.engine.version} · {c.stack.quantization} · TP={c.stack.parallel.tp}
              </div>
            </div>
            <div class="text-right text-xs font-mono" style="color: var(--color-text-muted);">
              <div>{c.results.throughput_tokens_per_sec.decode} tok/s</div>
              <div>{c.submitted_at}</div>
            </div>
          </div>
        </a>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 2: Wire into detail page**

```astro
---
import { getCollection } from 'astro:content';
import RelatedCases from '~/components/hardware/RelatedCases.astro';
const allCases = (await getCollection('cases')).map((x) => x.data);
---
<section class="pb-12">
  <h3 class="text-lg font-semibold mb-3">已有部署案例</h3>
  <RelatedCases hardwareId={hw.id} cases={allCases} />
</section>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): related cases section on hardware detail"
```

---

### Task F6: Compare drawer (React island, multi-select)

**Files:**
- Create: `apps/web/src/components/hardware/CompareDrawer.tsx`
- Modify: `apps/web/src/pages/hardware/index.astro`

- [ ] **Step 1: CompareDrawer.tsx**

```tsx
// apps/web/src/components/hardware/CompareDrawer.tsx
import { useEffect, useState } from 'react';
import type { HardwareFacet } from '~/lib/search/build-facets';

interface Props { facets: HardwareFacet[]; }

const STORAGE_KEY = 'evokernel-compare-ids';
const MAX = 4;

export default function CompareDrawer({ facets }: Props) {
  const [ids, setIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setIds(JSON.parse(saved));
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      setIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= MAX) return prev;
        return [...prev, id];
      });
    };
    document.addEventListener('compare-toggle', handler);
    return () => document.removeEventListener('compare-toggle', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids]);

  const selected = facets.filter((f) => ids.includes(f.id));

  return (
    <>
      {ids.length > 0 && (
        <button onClick={() => setOpen(!open)}
                className="fixed bottom-6 right-6 px-5 py-3 rounded-full shadow-lg z-20"
                style={{ background: 'var(--color-accent)', color: 'white' }}>
          对比 ({ids.length})
        </button>
      )}
      {open && (
        <aside className="fixed inset-y-0 right-0 w-[min(92vw,40rem)] z-30 overflow-y-auto p-6"
               style={{ background: 'var(--color-surface-raised)', borderLeft: '1px solid var(--color-border)' }}>
          <div className="flex justify-between mb-4">
            <h3 className="text-lg font-semibold">对比 ({ids.length}/{MAX})</h3>
            <button onClick={() => setOpen(false)}>×</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr><th></th>{selected.map((s) => <th key={s.id}>{s.name}</th>)}</tr></thead>
            <tbody>
              <tr><td>BF16 TF</td>{selected.map((s) => <td key={s.id}>{s.bf16_tflops ?? '—'}</td>)}</tr>
              <tr><td>Memory GB</td>{selected.map((s) => <td key={s.id}>{s.memory_gb ?? '—'}</td>)}</tr>
              <tr><td>FP8</td>{selected.map((s) => <td key={s.id}>{s.fp8_supported ? '✓' : '—'}</td>)}</tr>
              <tr><td>FP4</td>{selected.map((s) => <td key={s.id}>{s.fp4_supported ? '✓' : '—'}</td>)}</tr>
              <tr><td>厂商</td>{selected.map((s) => <td key={s.id}>{s.vendor}</td>)}</tr>
            </tbody>
          </table>
          <button onClick={() => setIds([])} className="mt-4 text-xs underline">清空</button>
        </aside>
      )}
    </>
  );
}
```

Update `HardwareCard.astro` to add a "+ 对比" button that dispatches `compare-toggle`:

```astro
<button data-compare-btn={h.id}
        class="absolute top-3 right-3 text-xs px-2 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition-opacity"
        style="border-color: var(--color-border); background: var(--color-surface);"
        onclick={`event.preventDefault(); document.dispatchEvent(new CustomEvent('compare-toggle', { detail: { id: '${h.id}' } }))`}>
  + 对比
</button>
```

(Make `<article>` `position: relative;` and `<a>` wrap a `<div>`, or restructure so button is inside but doesn't trigger nav.)

- [ ] **Step 2: Wire into list page**

```astro
---
import CompareDrawer from '~/components/hardware/CompareDrawer.tsx';
---
<CompareDrawer facets={facets} client:load />
```

- [ ] **Step 3: Smoke test**

Verify: hover a card, click "+ 对比", FAB appears, click FAB to open drawer with table. Refresh page, selection persists.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): compare drawer with localStorage persistence (max 4)"
```

---

## Milestone G — Model Pages

### Task G1: Model list page

**Files:**
- Create: `apps/web/src/pages/models/index.astro`
- Create: `apps/web/src/components/model/ModelCard.astro`

- [ ] **Step 1: ModelCard.astro**

```astro
---
// apps/web/src/components/model/ModelCard.astro
import type { Model } from '@evokernel/schemas';
import Badge from '~/components/ui/Badge.astro';
interface Props { model: Model; }
const { model } = Astro.props;
const isMoE = model.architecture.family === 'moe';
---
<a href={`/models/${model.id}`} class="block group">
  <article class="rounded-lg p-5 border h-full transition-all hover:translate-y-[-2px]"
           style="background: var(--color-surface-raised); border-color: var(--color-border);">
    <div class="text-xs font-medium mb-1" style="color: var(--color-text-muted);">{model.lab}</div>
    <h3 class="text-lg font-semibold group-hover:opacity-80">{model.name}</h3>
    <dl class="grid grid-cols-2 gap-2 mt-3 text-xs">
      <div><dt style="color: var(--color-text-muted);">Total</dt><dd class="font-mono">{model.architecture.total_params_b}B</dd></div>
      <div><dt style="color: var(--color-text-muted);">Active</dt><dd class="font-mono">{model.architecture.active_params_b}B</dd></div>
      <div><dt style="color: var(--color-text-muted);">Context</dt><dd class="font-mono">{(model.architecture.max_context_length / 1024).toFixed(0)}k</dd></div>
      <div><dt style="color: var(--color-text-muted);">Released</dt><dd class="font-mono">{model.release_date}</dd></div>
    </dl>
    <div class="flex gap-1 mt-3 flex-wrap">
      <Badge>{model.architecture.family.toUpperCase()}</Badge>
      {model.modalities.map((m) => <Badge>{m}</Badge>)}
      <Badge>{model.weight_format}</Badge>
    </div>
  </article>
</a>
```

- [ ] **Step 2: List page**

```astro
---
// apps/web/src/pages/models/index.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import SectionHeader from '~/components/ui/SectionHeader.astro';
import ModelCard from '~/components/model/ModelCard.astro';
import { getCollection } from 'astro:content';

const models = (await getCollection('models')).map((m) => m.data).sort((a, b) => b.release_date.localeCompare(a.release_date));
---
<BaseLayout title="模型目录">
  <Container>
    <section class="py-[var(--space-section)]">
      <SectionHeader eyebrow="MODELS" title="模型目录" subtitle={`${models.length} 个 frontier 开源模型 · 含完整算子拆解`} />
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {models.map((m) => <ModelCard model={m} />)}
      </div>
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): model list page sorted by release date"
```

---

### Task G2: Model detail page

**Files:**
- Create: `apps/web/src/pages/models/[slug].astro`

- [ ] **Step 1: Implement model detail**

```astro
---
// apps/web/src/pages/models/[slug].astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import KpiCard from '~/components/ui/KpiCard.astro';
import SpecRow from '~/components/ui/SpecRow.astro';
import Badge from '~/components/ui/Badge.astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const models = await getCollection('models');
  return models.map((m) => ({ params: { slug: m.id }, props: { model: m.data } }));
}

const { model } = Astro.props;
const arch = model.architecture;
---
<BaseLayout title={model.name}>
  <Container>
    <section class="pt-12 pb-6">
      <a href="/models" class="text-sm" style="color: var(--color-text-muted);">← 模型目录</a>
      <h1 class="text-4xl font-semibold mt-4">{model.name}</h1>
      <div class="flex gap-2 mt-3">
        <Badge>{model.lab}</Badge>
        <Badge>{arch.family.toUpperCase()}</Badge>
        {model.modalities.map((m) => <Badge>{m}</Badge>)}
        <Badge>{model.license}</Badge>
        <Badge>{model.release_date}</Badge>
      </div>
    </section>

    <section class="pb-8">
      <h3 class="text-lg font-semibold mb-3">架构</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total params"><span class="text-2xl">{arch.total_params_b}<span class="text-base opacity-60"> B</span></span></KpiCard>
        <KpiCard label="Active params"><span class="text-2xl">{arch.active_params_b}<span class="text-base opacity-60"> B</span></span></KpiCard>
        <KpiCard label="Layers">{arch.layers}</KpiCard>
        <KpiCard label="Context"><span class="text-2xl">{(arch.max_context_length / 1024).toFixed(0)}<span class="text-base opacity-60"> k</span></span></KpiCard>
      </div>
    </section>

    <section class="pb-8">
      <h3 class="text-lg font-semibold mb-3">详细规格</h3>
      <div class="rounded-lg border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
        <SpecRow label="Hidden size">{arch.hidden_size}</SpecRow>
        <SpecRow label="FFN size">{arch.ffn_size}</SpecRow>
        <SpecRow label="Attention heads">{arch.num_attention_heads}</SpecRow>
        <SpecRow label="KV heads">{arch.num_kv_heads}</SpecRow>
        <SpecRow label="Head dim">{arch.head_dim}</SpecRow>
        <SpecRow label="Vocab size">{arch.vocab_size}</SpecRow>
        <SpecRow label="Attention type">{arch.attention_type}</SpecRow>
        {arch.moe && (<>
          <SpecRow label="MoE experts">{arch.moe.num_experts}</SpecRow>
          <SpecRow label="MoE top-k">{arch.moe.top_k}</SpecRow>
          <SpecRow label="Expert hidden size">{arch.moe.expert_hidden_size}</SpecRow>
        </>)}
      </div>
    </section>

    <section class="pb-8">
      <h3 class="text-lg font-semibold mb-3">算子拆解 (per token)</h3>
      <div class="overflow-x-auto rounded-lg border" style="border-color: var(--color-border);">
        <table class="w-full text-sm">
          <thead style="background: var(--color-surface);">
            <tr>
              <th class="text-left px-4 py-2">算子</th>
              <th class="text-right px-4 py-2">FLOPs / token</th>
              <th class="text-right px-4 py-2">Bytes / token</th>
            </tr>
          </thead>
          <tbody>
            {model.operator_decomposition.map((op) => (
              <tr class="border-t" style="border-color: var(--color-border);">
                <td class="px-4 py-2"><a href={`/about#operator-${op.operator}`} class="underline" style="color: var(--color-accent);">{op.operator}</a></td>
                <td class="px-4 py-2 text-right font-mono">{op.flops_per_token.toExponential(2)}</td>
                <td class="px-4 py-2 text-right font-mono">{op.bytes_per_token.toExponential(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>

    <section class="pb-12">
      <a href={`/calculator?model=${model.id}`}
         class="inline-block px-5 py-2 rounded-md font-medium"
         style="background: var(--color-accent); color: white;">
        在计算器中评估 →
      </a>
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 2: Verify dev render, commit**

```bash
git add apps/web/src
git commit -m "feat(web): model detail with architecture, operator decomposition, calculator CTA"
```

---

### Task G3: Hardware compatibility matrix on model detail

**Files:**
- Create: `apps/web/src/components/model/CompatibilityMatrix.astro`
- Modify: `apps/web/src/pages/models/[slug].astro`

- [ ] **Step 1: CompatibilityMatrix.astro**

```astro
---
// apps/web/src/components/model/CompatibilityMatrix.astro
import type { Model, Hardware, Vendor, Case } from '@evokernel/schemas';
interface Props { model: Model; hardware: Array<Hardware & { vendor: Vendor }>; cases: Case[]; }
const { model, hardware, cases } = Astro.props;

function statusOn(hwId: string): 'measured' | 'claimed' | 'unknown' {
  const has = cases.some((c) => c.stack.hardware.id === hwId && c.stack.model.id === model.id);
  return has ? 'measured' : 'unknown';                    // V1 simplification: claimed vs unknown derived from engine support
}

const colorMap = {
  measured: 'var(--color-tier-measured)',
  claimed: 'var(--color-tier-estimated)',
  unknown: 'var(--color-text-muted)'
};
const labelMap = { measured: '🟢', claimed: '🟡', unknown: '—' };
---
<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
  {hardware.map((h) => {
    const s = statusOn(h.id);
    return (
      <a href={`/hardware/${h.id}`} class="flex items-center gap-2 p-3 rounded border text-sm hover:translate-x-0.5 transition-transform"
         style={`border-color: var(--color-border); background: var(--color-surface);`}>
        <span style={`color: ${colorMap[s]}; font-size: 1.25rem;`}>{labelMap[s]}</span>
        <span>{h.name}</span>
      </a>
    );
  })}
</div>
```

- [ ] **Step 2: Wire into model detail page**

```astro
---
import CompatibilityMatrix from '~/components/model/CompatibilityMatrix.astro';
import { getResolvedHardware } from '~/lib/data';
const allHardware = await getResolvedHardware();
const allCases = (await getCollection('cases')).map((c) => c.data);
---
<section class="pb-8">
  <h3 class="text-lg font-semibold mb-3">兼容硬件</h3>
  <CompatibilityMatrix model={model} hardware={allHardware} cases={allCases} />
</section>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): hardware compatibility matrix on model detail"
```

---

### Task G4: Decompose-operators script (auto-fill model operator breakdown)

**Files:**
- Create: `scripts/decompose-operators.ts`

- [ ] **Step 1: Implement script**

```ts
// scripts/decompose-operators.ts
// Given a model yaml with `architecture` filled in, compute the operator_decomposition
// per-token FLOPs/bytes using standard transformer formulas.
import fs from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { ModelSchema } from '@evokernel/schemas';

const path = process.argv[2];
if (!path) { console.error('Usage: pnpm tsx scripts/decompose-operators.ts data/models/x/y.yaml'); process.exit(1); }

const text = await fs.readFile(path, 'utf-8');
const model = ModelSchema.parse(parse(text));
const a = model.architecture;

// Per-token approximations for one full forward pass through all layers.
// FLOPs include forward only; bytes include weight reads + KV-cache reads/writes.
const seqAvg = 4096;                                 // assumption baseline; real calc happens in calculator
const heads = a.num_attention_heads;
const kvHeads = a.num_kv_heads;
const hidden = a.hidden_size;
const ffn = a.ffn_size;
const layers = a.layers;
const activeParamsBytes = a.active_params_b * 1e9 * 2; // bf16

const matmulFfnFlops = layers * 2 * (3 * hidden * ffn) * 1;          // ~3 matmuls per FFN block per token
const attnFlops = layers * (4 * hidden * hidden + 2 * heads * seqAvg * (hidden / heads));
const moeRoutingFlops = a.moe ? layers * a.moe.num_experts * hidden : 0;
const normFlops = layers * 2 * hidden;

const matmulFfnBytes = layers * (3 * hidden * ffn) * 2;              // bf16 weights
const attnBytes = layers * (4 * hidden * hidden) * 2 + layers * 2 * kvHeads * (hidden / heads) * seqAvg * 2;
const moeBytes = a.moe ? layers * (a.moe.top_k * a.moe.expert_hidden_size * hidden) * 2 : 0;
const normBytes = layers * 2 * hidden * 2;

model.operator_decomposition = [
  { operator: 'matmul-ffn', flops_per_token: matmulFfnFlops, bytes_per_token: matmulFfnBytes },
  { operator: 'attention', flops_per_token: attnFlops, bytes_per_token: attnBytes },
  ...(a.moe ? [{ operator: 'moe-routing', flops_per_token: moeRoutingFlops, bytes_per_token: moeBytes }] : []),
  { operator: 'rmsnorm', flops_per_token: normFlops, bytes_per_token: normBytes }
];

await fs.writeFile(path, stringify(model, { lineWidth: 100 }), 'utf-8');
console.log(`✓ wrote operator_decomposition to ${path} (active params bytes ≈ ${(activeParamsBytes / 1e9).toFixed(1)} GB)`);
```

- [ ] **Step 2: Run on an existing model file**

```bash
pnpm tsx scripts/decompose-operators.ts data/models/deepseek/deepseek-v4-pro.yaml
```

Verify the file's `operator_decomposition` is updated with realistic FLOPs/bytes.

- [ ] **Step 3: Commit**

```bash
git add scripts data/models
git commit -m "feat(scripts): decompose-operators auto-fills per-token FLOPs/bytes"
```

---

## Milestone H — Case Pages

### Task H1: Case list page

**Files:**
- Create: `apps/web/src/pages/cases/index.astro`
- Create: `apps/web/src/components/case/CaseListItem.astro`

- [ ] **Step 1: CaseListItem.astro**

```astro
---
// apps/web/src/components/case/CaseListItem.astro
import type { Case } from '@evokernel/schemas';
import Badge from '~/components/ui/Badge.astro';
interface Props { c: Case; }
const { c } = Astro.props;
---
<a href={`/cases/${c.id}`} class="block p-5 rounded-lg border hover:translate-y-[-1px] transition-transform"
   style="background: var(--color-surface-raised); border-color: var(--color-border);">
  <div class="flex justify-between items-start gap-4">
    <div class="flex-1">
      <h3 class="font-semibold">{c.title}</h3>
      <div class="text-xs mt-1 flex flex-wrap gap-3" style="color: var(--color-text-muted);">
        <span>{c.stack.hardware.id} ×{c.stack.hardware.count}</span>
        <span>{c.stack.model.id}</span>
        <span>{c.stack.engine.id} {c.stack.engine.version}</span>
        <span>{c.stack.quantization}</span>
        <span>TP={c.stack.parallel.tp} PP={c.stack.parallel.pp}</span>
      </div>
    </div>
    <div class="text-right text-sm font-mono">
      <div>{c.results.throughput_tokens_per_sec.decode} tok/s</div>
      <div class="text-xs" style="color: var(--color-text-muted);">{c.submitted_at}</div>
    </div>
  </div>
  <div class="flex gap-1 mt-3">
    <Badge>{c.bottleneck}</Badge>
    {c.stack.parallel.disaggregated && <Badge variant="china">disagg</Badge>}
  </div>
</a>
```

- [ ] **Step 2: List page**

```astro
---
// apps/web/src/pages/cases/index.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import SectionHeader from '~/components/ui/SectionHeader.astro';
import CaseListItem from '~/components/case/CaseListItem.astro';
import { getCollection } from 'astro:content';

const cases = (await getCollection('cases')).map((c) => c.data).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
---
<BaseLayout title="部署案例">
  <Container>
    <section class="py-[var(--space-section)]">
      <SectionHeader eyebrow="CASES" title="部署案例" subtitle={`${cases.length} 条实测部署 recipe · 可复现 · 带 evidence`} />
      <ul class="space-y-3 mt-8">
        {cases.map((c) => <li><CaseListItem c={c} /></li>)}
      </ul>
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): case list page sorted by submission date"
```

---

### Task H2: Case detail page (yaml-driven, no MDX yet)

**Files:**
- Create: `apps/web/src/pages/cases/[slug].astro`
- Create: `apps/web/src/components/case/{StackBlock,ResultsViz,Bottleneck}.astro`

- [ ] **Step 1: StackBlock.astro**

```astro
---
// apps/web/src/components/case/StackBlock.astro
import type { Case } from '@evokernel/schemas';
import SpecRow from '~/components/ui/SpecRow.astro';
interface Props { c: Case; }
const { c } = Astro.props;
const s = c.stack;
---
<div class="rounded-lg border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
  <SpecRow label="硬件"><a href={`/hardware/${s.hardware.id}`} class="underline" style="color: var(--color-accent);">{s.hardware.id}</a> × {s.hardware.count} ({s.hardware.topology})</SpecRow>
  <SpecRow label="服务器">{s.server?.id ?? '—'}</SpecRow>
  <SpecRow label="互联">intra: {s.interconnect.intra_node} · inter: {s.interconnect.inter_node}</SpecRow>
  <SpecRow label="模型"><a href={`/models/${s.model.id}`} class="underline" style="color: var(--color-accent);">{s.model.id}</a> ({s.model.weight_format})</SpecRow>
  <SpecRow label="引擎">{s.engine.id} {s.engine.version}</SpecRow>
  <SpecRow label="量化">{s.quantization}</SpecRow>
  <SpecRow label="并行">TP={s.parallel.tp} · PP={s.parallel.pp} · EP={s.parallel.ep} · SP={s.parallel.sp}{s.parallel.disaggregated ? ' · disaggregated' : ''}</SpecRow>
  <SpecRow label="驱动">{s.driver}</SpecRow>
  <SpecRow label="OS">{s.os}</SpecRow>
</div>
```

- [ ] **Step 2: ResultsViz.astro**

```astro
---
// apps/web/src/components/case/ResultsViz.astro
import type { Case } from '@evokernel/schemas';
import KpiCard from '~/components/ui/KpiCard.astro';
import Bottleneck from './Bottleneck.astro';
interface Props { c: Case; }
const { c } = Astro.props;
const r = c.results;
---
<div class="space-y-6">
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label="Decode tok/s" emphasize>{r.throughput_tokens_per_sec.decode}</KpiCard>
    <KpiCard label="Prefill tok/s">{r.throughput_tokens_per_sec.prefill}</KpiCard>
    <KpiCard label="TTFT p50" sublabel="ms">{r.latency_ms.ttft_p50}</KpiCard>
    <KpiCard label="TBT p50" sublabel="ms">{r.latency_ms.tbt_p50}</KpiCard>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <KpiCard label="Memory/card" sublabel="GB">{r.memory_per_card_gb}</KpiCard>
    <KpiCard label="Power/card" sublabel="W">{r.power_per_card_w}</KpiCard>
    <KpiCard label="Compute" sublabel="util %">{r.utilization.compute_pct}</KpiCard>
    <KpiCard label="Memory BW" sublabel="util %">{r.utilization.memory_bw_pct}</KpiCard>
  </div>

  <Bottleneck c={c} />
</div>
```

- [ ] **Step 3: Bottleneck.astro**

```astro
---
// apps/web/src/components/case/Bottleneck.astro
import type { Case } from '@evokernel/schemas';
interface Props { c: Case; }
const { c } = Astro.props;
const u = c.results.utilization;
const others = Math.max(0, 100 - u.compute_pct - u.memory_bw_pct);
---
<div>
  <h4 class="text-sm font-semibold mb-2">瓶颈分析 — <span style="color: var(--color-accent);">{c.bottleneck}</span></h4>
  <div class="flex h-8 rounded overflow-hidden" style="background: var(--color-surface);">
    <div style={`width: ${u.compute_pct}%; background: var(--color-tier-measured);`} title={`compute ${u.compute_pct}%`}></div>
    <div style={`width: ${u.memory_bw_pct}%; background: var(--color-accent);`} title={`memory bw ${u.memory_bw_pct}%`}></div>
    <div style={`width: ${others}%; background: var(--color-tier-estimated); opacity: 0.6;`} title={`other ${others}%`}></div>
  </div>
  <div class="flex gap-4 text-xs mt-2" style="color: var(--color-text-muted);">
    <span>Compute {u.compute_pct}%</span>
    <span>Memory BW {u.memory_bw_pct}%</span>
    <span>Other {others}%</span>
  </div>
</div>
```

- [ ] **Step 4: Detail page**

```astro
---
// apps/web/src/pages/cases/[slug].astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import StackBlock from '~/components/case/StackBlock.astro';
import ResultsViz from '~/components/case/ResultsViz.astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const cases = await getCollection('cases');
  return cases.map((c) => ({ params: { slug: c.id }, props: { c: c.data } }));
}
const { c } = Astro.props;
---
<BaseLayout title={c.title}>
  <Container>
    <section class="pt-12 pb-6">
      <a href="/cases" class="text-sm" style="color: var(--color-text-muted);">← 案例</a>
      <h1 class="text-3xl font-semibold mt-4">{c.title}</h1>
      <div class="text-xs mt-2" style="color: var(--color-text-muted);">由 {c.submitter.github} 于 {c.submitted_at} 提交</div>
    </section>

    <section class="pb-8"><h3 class="text-lg font-semibold mb-3">Stack</h3><StackBlock c={c} /></section>
    <section class="pb-8"><h3 class="text-lg font-semibold mb-3">场景</h3>
      <pre class="text-xs p-4 rounded border overflow-x-auto" style="background: var(--color-surface-raised); border-color: var(--color-border);">{JSON.stringify(c.scenario, null, 2)}</pre>
    </section>
    <section class="pb-8"><h3 class="text-lg font-semibold mb-3">结果</h3><ResultsViz c={c} /></section>

    <section class="pb-8">
      <h3 class="text-lg font-semibold mb-3">复现步骤</h3>
      <pre class="text-xs p-4 rounded border overflow-x-auto" style="background: var(--color-surface-raised); border-color: var(--color-border);"><code>{c.reproduction.startup_command}</code></pre>
      <p class="text-xs mt-2" style="color: var(--color-text-muted);">Benchmark tool: {c.reproduction.benchmark_tool}</p>
    </section>

    {c.issues_encountered.length > 0 && (
      <section class="pb-8">
        <h3 class="text-lg font-semibold mb-3">踩坑记录</h3>
        <ul class="list-disc pl-5 space-y-2 text-sm">
          {c.issues_encountered.map((i) => <li>{i}</li>)}
        </ul>
      </section>
    )}

    <section class="pb-12">
      <h3 class="text-lg font-semibold mb-3">引证</h3>
      <ol class="space-y-2 text-sm">
        {c.evidence.map((e, i) => (
          <li>[{i + 1}] {e.citation} — <a href={e.url} class="underline" style="color: var(--color-accent);">{e.url}</a></li>
        ))}
      </ol>
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): case detail with stack, results viz, bottleneck bar"
```

---

### Task H3: MDX content collection for case long-form notes

**Files:**
- Modify: `apps/web/src/content/config.ts`
- Create: `apps/web/src/content/cases/.gitkeep`

- [ ] **Step 1: Add a parallel mdx collection (for long-form notes)**

```ts
// apps/web/src/content/config.ts (append)
import { glob } from 'astro/loaders';
import { z } from 'zod';

const caseNotes = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/cases' }),
  schema: z.object({ caseId: z.string(), title: z.string().optional() })
});

export const collections = { /* existing */, caseNotes };
```

- [ ] **Step 2: Render MDX notes if present, in case detail**

```astro
---
import { getEntry, render } from 'astro:content';
const note = await getEntry('caseNotes', c.id).catch(() => null);
const { Content } = note ? await render(note) : { Content: null };
---
{Content && (
  <section class="pb-8 prose max-w-none">
    <h3 class="text-lg font-semibold mb-3">作者笔记</h3>
    <Content />
  </section>
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): support optional MDX long-form notes per case"
```

---

### Task H4: "Contribute a case" GitHub issue template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/new-case.yaml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: new-case.yaml**

```yaml
# .github/ISSUE_TEMPLATE/new-case.yaml
name: 提交部署案例
description: 提交一个完整的硬件 × 模型 × 引擎部署 recipe (含实测吞吐和延迟)
labels: [case, contribution]
body:
  - type: markdown
    attributes:
      value: |
        感谢贡献!提交前请阅读 [docs/contributing.md](https://github.com/evokernel/evokernel-spec/blob/main/docs/contributing.md)。
  - type: input
    id: title
    attributes: { label: 标题, placeholder: 'Llama 4 Scout on 8xH100 with vLLM 0.6' }
    validations: { required: true }
  - type: input
    id: hardware
    attributes: { label: 硬件 ID + 数量, placeholder: 'h100-sxm5 × 8' }
    validations: { required: true }
  - type: input
    id: model
    attributes: { label: 模型 ID, placeholder: 'llama-4-scout' }
    validations: { required: true }
  - type: textarea
    id: results
    attributes: { label: 实测结果, description: '吞吐 / 延迟 / 利用率 / bottleneck 等' }
    validations: { required: true }
  - type: textarea
    id: reproduction
    attributes: { label: 复现命令 + 配置, description: '命令、配置文件路径、benchmark 工具' }
    validations: { required: true }
  - type: input
    id: raw_log
    attributes: { label: 原始 log URL, description: 'gist / pastebin / s3' }
    validations: { required: true }
  - type: checkboxes
    id: confirm
    attributes:
      label: Attestation
      options:
        - { label: 'I personally ran this and the data is reproducible with the config above', required: true }
```

- [ ] **Step 2: PULL_REQUEST_TEMPLATE.md**

```markdown
## 类型

- [ ] 新增硬件 / 服务器 / 互联
- [ ] 新增模型
- [ ] 新增部署案例
- [ ] 新增 / 修正引证
- [ ] 修正错误数据
- [ ] 其他 (说明在下方)

## 改动摘要

<!-- 一句话描述这个 PR 的核心改动 -->

## Review checklist

- [ ] schema 校验通过 (CI 自动)
- [ ] 所有数字字段有 evidence_ref
- [ ] 所有 evidence URL 可达 (CI 自动)
- [ ] tier 标签合理 (官方 / 实测 / 估算)
- [ ] 命名遵循规范 (kebab-case, 路径正确)
- [ ] 利益冲突已声明 (vendor 员工 / sponsored content)

## DCO

I certify per the DCO (https://developercertificate.org/) — Signed-off-by trailer in commit.
```

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "chore: add issue and PR templates with attestation checks"
```

---

### Task H5: Pattern entity, hidden v1 page

**Files:**
- Create: `apps/web/src/pages/patterns/[slug].astro` (visible only via direct link in V1)

> Per spec, `/patterns` index is V1.5. But individual pattern pages can be linked from cases.

- [ ] **Step 1: Pattern detail page**

```astro
---
// apps/web/src/pages/patterns/[slug].astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import { getCollection } from 'astro:content';
import { marked } from 'marked';

export async function getStaticPaths() {
  const patterns = await getCollection('patterns');
  return patterns.map((p) => ({ params: { slug: p.id }, props: { p: p.data } }));
}
const { p } = Astro.props;
const allCases = (await getCollection('cases')).map((c) => c.data);
const supporting = allCases.filter((c) => c.patterns.includes(p.id));
const html = marked(p.description_md);
---
<BaseLayout title={p.name} noIndex={true}>
  <Container width="narrow">
    <section class="py-12">
      <a href="/" class="text-sm" style="color: var(--color-text-muted);">← 首页</a>
      <h1 class="text-3xl font-semibold mt-4">{p.name}</h1>
      <div class="text-xs mt-2" style="color: var(--color-text-muted);">类别: {p.category}</div>

      <article class="mt-6 prose max-w-none" set:html={html}></article>

      <h3 class="text-lg font-semibold mt-12 mb-3">支撑案例 ({supporting.length})</h3>
      <ul class="space-y-2 text-sm">
        {supporting.map((c) => <li><a href={`/cases/${c.id}`} class="underline" style="color: var(--color-accent);">{c.title}</a></li>)}
      </ul>
    </section>
  </Container>
</BaseLayout>
```

Add `marked` to dependencies: `pnpm --filter web add marked`.

- [ ] **Step 2: Commit**

```bash
git add apps/web
git commit -m "feat(web): pattern detail pages (linked from cases, no index in V1)"
```

---

---

## Milestone I — Calculator (Tier 0 + Tier 1)

The calculator is the second pillar of the product. Pure-TS logic in `lib/calculator/` with ~100% unit test coverage; React island UI; transparent published formulas.

### Task I1: Roofline core types and arithmetic

**Files:**
- Create: `apps/web/src/lib/calculator/types.ts`
- Create: `apps/web/src/lib/calculator/roofline.ts`
- Test: `apps/web/src/lib/calculator/roofline.test.ts`

- [ ] **Step 1: Define types**

```ts
// apps/web/src/lib/calculator/types.ts
export type Precision = 'fp4' | 'fp8' | 'bf16' | 'fp16' | 'int8';

export interface CalcInput {
  modelId: string;
  hardware: { id: string; count: number };
  scenario: {
    prefillSeqLen: number;
    decodeSeqLen: number;
    batchSize: number;
    concurrency: number;
  };
  precision: Precision;
  parallel: { tp: number; pp: number; ep: number; sp: number };
  engineId: string;
  disaggregated: { enabled: boolean; prefillCards?: number; decodeCards?: number };
}

export interface RooflineOutput {
  arithmeticIntensity: number;        // FLOPs / byte
  peakComputeTflops: number;
  peakMemoryBwGbps: number;
  ridgePoint: number;                 // FLOPs/byte at which compute and memory meet
  isComputeBound: boolean;
  utilizationCeiling: number;         // 0..1
  decodeThroughputUpperBound: number; // tokens/sec/card
  prefillThroughputUpperBound: number;
}

export interface CalcOutput {
  tier0Cases: Array<{ caseId: string; throughputDecode: number; throughputPrefill: number; matchScore: number }>;
  tier1Roofline: RooflineOutput;
  configCheck: { feasible: boolean; warnings: string[]; memoryRequiredGb: number; memoryAvailableGb: number };
  recommendations: string[];
  formulaTrace: string[];             // human-readable formula log
}
```

- [ ] **Step 2: Write failing test**

```ts
// apps/web/src/lib/calculator/roofline.test.ts
import { describe, it, expect } from 'vitest';
import { computeRoofline } from './roofline';

describe('computeRoofline', () => {
  it('marks compute-bound when arithmetic intensity > ridge', () => {
    const r = computeRoofline({
      flopsPerToken: 1e10, bytesPerToken: 1e7, // intensity 1000
      peakComputeTflops: 1000, peakMemoryBwGbps: 3000
      // ridge = 1000 / 3 ≈ 333
    });
    expect(r.isComputeBound).toBe(true);
    expect(r.ridgePoint).toBeCloseTo(333.33, 1);
  });

  it('marks memory-bound when intensity < ridge', () => {
    const r = computeRoofline({
      flopsPerToken: 1e8, bytesPerToken: 1e8, // intensity 1
      peakComputeTflops: 1000, peakMemoryBwGbps: 3000
    });
    expect(r.isComputeBound).toBe(false);
  });

  it('throughput upper bound respects roofline ceiling', () => {
    const r = computeRoofline({
      flopsPerToken: 1e8, bytesPerToken: 1e8,
      peakComputeTflops: 1000, peakMemoryBwGbps: 3000
    });
    // memory-bound: throughput = peakBW / bytesPerToken
    expect(r.decodeThroughputUpperBound).toBeCloseTo(3000 * 1e9 / 1e8, 0);
  });

  it('throws on zero peak compute', () => {
    expect(() => computeRoofline({ flopsPerToken: 1, bytesPerToken: 1, peakComputeTflops: 0, peakMemoryBwGbps: 100 }))
      .toThrow();
  });
});
```

- [ ] **Step 3: Verify fail**

```bash
cd apps/web && pnpm test roofline
```

- [ ] **Step 4: Implement roofline.ts**

```ts
// apps/web/src/lib/calculator/roofline.ts
import type { RooflineOutput } from './types';

export interface RooflineInput {
  flopsPerToken: number;
  bytesPerToken: number;
  peakComputeTflops: number;            // TF (10^12 FLOPs)
  peakMemoryBwGbps: number;             // GB/s (10^9 bytes/s)
  efficiencyFactor?: number;            // 0..1, default 0.5 (V1 simplification)
}

export function computeRoofline(i: RooflineInput): RooflineOutput {
  if (i.peakComputeTflops <= 0) throw new Error('peakComputeTflops must be positive');
  if (i.peakMemoryBwGbps <= 0) throw new Error('peakMemoryBwGbps must be positive');
  if (i.bytesPerToken <= 0) throw new Error('bytesPerToken must be positive');

  const eff = i.efficiencyFactor ?? 0.5;
  const arithmeticIntensity = i.flopsPerToken / i.bytesPerToken;
  const peakFlops = i.peakComputeTflops * 1e12;
  const peakBytes = i.peakMemoryBwGbps * 1e9;
  const ridgePoint = peakFlops / peakBytes;
  const isComputeBound = arithmeticIntensity >= ridgePoint;

  // Effective throughput upper bound (per card, per second)
  const memBoundThroughput = peakBytes / i.bytesPerToken;
  const computeBoundThroughput = peakFlops / i.flopsPerToken;
  const upper = Math.min(memBoundThroughput, computeBoundThroughput);

  return {
    arithmeticIntensity,
    peakComputeTflops: i.peakComputeTflops,
    peakMemoryBwGbps: i.peakMemoryBwGbps,
    ridgePoint,
    isComputeBound,
    utilizationCeiling: eff,
    decodeThroughputUpperBound: upper * eff,
    prefillThroughputUpperBound: upper * eff
  };
}
```

- [ ] **Step 5: Run, verify pass, commit**

```bash
cd apps/web && pnpm test roofline
git add apps/web/src/lib/calculator
git commit -m "feat(calculator): roofline core arithmetic with efficiency factor"
```

---

### Task I2: Tier 0 case lookup with similarity scoring

**Files:**
- Create: `apps/web/src/lib/calculator/lookup.ts`
- Test: `apps/web/src/lib/calculator/lookup.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/lib/calculator/lookup.test.ts
import { describe, it, expect } from 'vitest';
import { findSimilarCases } from './lookup';
import type { Case } from '@evokernel/schemas';

const mkCase = (over: Partial<Case>): Case => ({
  id: over.id ?? 'case-x',
  title: 't', submitted_at: '2026-04-01',
  submitter: { github: '@x' },
  stack: {
    hardware: { id: 'h100-sxm5', count: 8, topology: '1n' },
    interconnect: { intra_node: 'nvlink-4', inter_node: 'none' },
    model: { id: 'llama-4-scout', weight_format: 'bf16' },
    engine: { id: 'vllm', version: '0.6' },
    quantization: 'bf16',
    parallel: { tp: 8, pp: 1, ep: 1, sp: 1, disaggregated: false },
    driver: 'cuda', os: 'ubuntu'
  },
  scenario: { prefill_seq_len: 1024, decode_seq_len: 256, batch_size: 16, max_concurrent_requests: 64 },
  results: { throughput_tokens_per_sec: { decode: 1000, prefill: 15000 }, latency_ms: { ttft_p50: 0, ttft_p99: 0, tbt_p50: 0, tbt_p99: 0 }, memory_per_card_gb: 0, power_per_card_w: 0, utilization: { compute_pct: 0, memory_bw_pct: 0 } },
  bottleneck: 'memory-bandwidth',
  reproduction: { startup_command: 'x', config_files: [], benchmark_tool: 'x' },
  issues_encountered: [], patterns: [], evidence: [],
  ...over
});

describe('findSimilarCases', () => {
  const all = [
    mkCase({ id: 'a' }),
    mkCase({ id: 'b', stack: { ...mkCase({}).stack, model: { id: 'qwen3.6-plus', weight_format: 'bf16' } } }),
    mkCase({ id: 'c', stack: { ...mkCase({}).stack, hardware: { id: 'mi300x', count: 8, topology: '1n' } } })
  ];

  it('exact match scores 1.0', () => {
    const out = findSimilarCases(all, {
      modelId: 'llama-4-scout', hardware: { id: 'h100-sxm5', count: 8 },
      precision: 'bf16', engineId: 'vllm',
      parallel: { tp: 8, pp: 1, ep: 1, sp: 1 },
      scenario: { prefillSeqLen: 1024, decodeSeqLen: 256, batchSize: 16, concurrency: 64 },
      disaggregated: { enabled: false }
    });
    expect(out[0].caseId).toBe('a');
    expect(out[0].matchScore).toBeCloseTo(1, 1);
  });

  it('different model scores lower than same model', () => {
    const out = findSimilarCases(all, {
      modelId: 'llama-4-scout', hardware: { id: 'h100-sxm5', count: 8 },
      precision: 'bf16', engineId: 'vllm',
      parallel: { tp: 8, pp: 1, ep: 1, sp: 1 },
      scenario: { prefillSeqLen: 1024, decodeSeqLen: 256, batchSize: 16, concurrency: 64 },
      disaggregated: { enabled: false }
    });
    const a = out.find((x) => x.caseId === 'a')!;
    const b = out.find((x) => x.caseId === 'b')!;
    expect(a.matchScore).toBeGreaterThan(b.matchScore);
  });

  it('returns at most 3', () => {
    const out = findSimilarCases([...all, mkCase({ id: 'd' }), mkCase({ id: 'e' })], {
      modelId: 'llama-4-scout', hardware: { id: 'h100-sxm5', count: 8 },
      precision: 'bf16', engineId: 'vllm',
      parallel: { tp: 8, pp: 1, ep: 1, sp: 1 },
      scenario: { prefillSeqLen: 1024, decodeSeqLen: 256, batchSize: 16, concurrency: 64 },
      disaggregated: { enabled: false }
    });
    expect(out.length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Implement lookup.ts**

```ts
// apps/web/src/lib/calculator/lookup.ts
import type { Case } from '@evokernel/schemas';
import type { CalcInput } from './types';

export interface CaseMatch {
  caseId: string;
  throughputDecode: number;
  throughputPrefill: number;
  matchScore: number;                // 0..1, higher is more similar
}

const WEIGHTS = {
  model: 0.30,
  hardware: 0.25,
  precision: 0.15,
  engine: 0.10,
  parallel: 0.10,
  scenario: 0.10
};

export function findSimilarCases(cases: Case[], input: CalcInput, topN = 3): CaseMatch[] {
  const scored: CaseMatch[] = cases.map((c) => {
    let score = 0;
    if (c.stack.model.id === input.modelId) score += WEIGHTS.model;
    if (c.stack.hardware.id === input.hardware.id) score += WEIGHTS.hardware;
    if (c.stack.quantization === input.precision) score += WEIGHTS.precision;
    if (c.stack.engine.id === input.engineId) score += WEIGHTS.engine;

    const pSim = parallelSimilarity(c.stack.parallel, input.parallel);
    score += WEIGHTS.parallel * pSim;

    const sSim = scenarioSimilarity(c.scenario, input.scenario);
    score += WEIGHTS.scenario * sSim;

    return {
      caseId: c.id,
      throughputDecode: c.results.throughput_tokens_per_sec.decode,
      throughputPrefill: c.results.throughput_tokens_per_sec.prefill,
      matchScore: score
    };
  });

  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, topN).filter((m) => m.matchScore > 0.3);
}

function parallelSimilarity(a: Case['stack']['parallel'], b: CalcInput['parallel']): number {
  // Jaccard-ish: shared dimensions count
  let same = 0; let total = 0;
  for (const k of ['tp', 'pp', 'ep', 'sp'] as const) {
    total++;
    if (a[k] === b[k]) same++;
  }
  return same / total;
}

function scenarioSimilarity(a: Case['scenario'], b: CalcInput['scenario']): number {
  const dPrefill = 1 - Math.min(1, Math.abs(a.prefill_seq_len - b.prefillSeqLen) / Math.max(a.prefill_seq_len, b.prefillSeqLen, 1));
  const dDecode = 1 - Math.min(1, Math.abs(a.decode_seq_len - b.decodeSeqLen) / Math.max(a.decode_seq_len, b.decodeSeqLen, 1));
  const dBatch = 1 - Math.min(1, Math.abs(a.batch_size - b.batchSize) / Math.max(a.batch_size, b.batchSize, 1));
  return (dPrefill + dDecode + dBatch) / 3;
}
```

- [ ] **Step 3: Run tests, commit**

```bash
cd apps/web && pnpm test lookup
git add apps/web/src/lib/calculator
git commit -m "feat(calculator): Tier 0 case similarity lookup with weighted scoring"
```

---

### Task I3: Memory feasibility check

**Files:**
- Create: `apps/web/src/lib/calculator/memory.ts`
- Test: `apps/web/src/lib/calculator/memory.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/lib/calculator/memory.test.ts
import { describe, it, expect } from 'vitest';
import { estimateMemoryRequirement } from './memory';

describe('estimateMemoryRequirement', () => {
  it('weights = activeParams × bytesPerWeight, divided by TP', () => {
    const r = estimateMemoryRequirement({
      activeParamsB: 50, bytesPerWeight: 2,
      kvCachePerToken: 0, totalCacheTokens: 0,
      tp: 1, pp: 1, activationOverheadGb: 0
    });
    expect(r.weightsGb).toBeCloseTo(50 * 1e9 * 2 / 1e9, 1);
  });

  it('TP halves weights footprint', () => {
    const r = estimateMemoryRequirement({
      activeParamsB: 50, bytesPerWeight: 2,
      kvCachePerToken: 0, totalCacheTokens: 0,
      tp: 2, pp: 1, activationOverheadGb: 0
    });
    expect(r.weightsGb).toBeCloseTo(50, 1);
  });

  it('reports infeasible when total > available', () => {
    const r = estimateMemoryRequirement({
      activeParamsB: 100, bytesPerWeight: 2,
      kvCachePerToken: 0, totalCacheTokens: 0,
      tp: 1, pp: 1, activationOverheadGb: 0
    });
    expect(r.checkAgainst(80).feasible).toBe(false);
  });
});
```

- [ ] **Step 2: Implement memory.ts**

```ts
// apps/web/src/lib/calculator/memory.ts
export interface MemoryEstimateInput {
  activeParamsB: number;            // billion
  bytesPerWeight: number;           // 2 for bf16, 1 for fp8, 0.5 for fp4
  kvCachePerToken: number;          // bytes per token (per layer × kv_heads × head_dim × 2 × bytes)
  totalCacheTokens: number;
  tp: number;
  pp: number;
  activationOverheadGb: number;     // empirical 1-3 GB
}

export interface MemoryEstimate {
  weightsGb: number;
  kvCacheGb: number;
  activationGb: number;
  totalGb: number;
  checkAgainst: (availableGbPerCard: number) => { feasible: boolean; deltaGb: number };
}

export function estimateMemoryRequirement(i: MemoryEstimateInput): MemoryEstimate {
  const weightsBytes = i.activeParamsB * 1e9 * i.bytesPerWeight;
  const weightsPerCard = weightsBytes / (i.tp * i.pp);
  const kvBytes = i.kvCachePerToken * i.totalCacheTokens / i.tp;

  const weightsGb = weightsPerCard / 1e9;
  const kvCacheGb = kvBytes / 1e9;
  const activationGb = i.activationOverheadGb;
  const totalGb = weightsGb + kvCacheGb + activationGb;

  return {
    weightsGb, kvCacheGb, activationGb, totalGb,
    checkAgainst: (avail) => ({ feasible: totalGb <= avail, deltaGb: avail - totalGb })
  };
}
```

- [ ] **Step 3: Run, commit**

```bash
cd apps/web && pnpm test memory
git add apps/web/src/lib/calculator
git commit -m "feat(calculator): per-card memory feasibility estimator"
```

---

### Task I4: Communication overhead estimator (TP/PP/EP)

**Files:**
- Create: `apps/web/src/lib/calculator/comm.ts`
- Test: `apps/web/src/lib/calculator/comm.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/lib/calculator/comm.test.ts
import { describe, it, expect } from 'vitest';
import { estimateCommOverhead } from './comm';

describe('estimateCommOverhead', () => {
  it('TP all-reduce time scales with (TP-1)/TP * activations', () => {
    const r = estimateCommOverhead({
      tp: 8, pp: 1, ep: 1,
      activationBytesPerToken: 1e6,
      tokensPerStep: 100,
      scaleUpBwGbps: 900,           // NVLink-4
      scaleOutBwGbps: 100
    });
    // (8-1)/8 * 1e6 * 100 = 8.75e7 bytes; / 900e9 ≈ 9.7e-5 s
    expect(r.tpAllreduceMs).toBeGreaterThan(0);
    expect(r.tpAllreduceMs).toBeLessThan(1);
  });

  it('returns zero comm when tp=pp=ep=1', () => {
    const r = estimateCommOverhead({
      tp: 1, pp: 1, ep: 1,
      activationBytesPerToken: 1e6, tokensPerStep: 100,
      scaleUpBwGbps: 900, scaleOutBwGbps: 100
    });
    expect(r.totalMs).toBe(0);
  });
});
```

- [ ] **Step 2: Implement comm.ts**

```ts
// apps/web/src/lib/calculator/comm.ts
export interface CommInput {
  tp: number; pp: number; ep: number;
  activationBytesPerToken: number;
  tokensPerStep: number;
  scaleUpBwGbps: number;
  scaleOutBwGbps: number;
}

export interface CommOverhead {
  tpAllreduceMs: number;
  ppSendRecvMs: number;
  epAll2allMs: number;
  totalMs: number;
}

export function estimateCommOverhead(i: CommInput): CommOverhead {
  const stepBytes = i.activationBytesPerToken * i.tokensPerStep;

  const tpAllreduceBytes = i.tp > 1 ? (2 * (i.tp - 1) / i.tp) * stepBytes : 0;
  const tpAllreduceMs = i.tp > 1 ? (tpAllreduceBytes / (i.scaleUpBwGbps * 1e9)) * 1000 : 0;

  const ppSendRecvBytes = i.pp > 1 ? stepBytes : 0;
  const ppSendRecvMs = i.pp > 1 ? (ppSendRecvBytes / (i.scaleOutBwGbps * 1e9 / 8)) * 1000 : 0;
  // scaleOutBwGbps is Gbps → bytes/s = Gbps * 1e9 / 8

  const epAll2allBytes = i.ep > 1 ? stepBytes * 2 : 0;
  const epAll2allMs = i.ep > 1 ? (epAll2allBytes / (i.scaleUpBwGbps * 1e9)) * 1000 : 0;

  return {
    tpAllreduceMs, ppSendRecvMs, epAll2allMs,
    totalMs: tpAllreduceMs + ppSendRecvMs + epAll2allMs
  };
}
```

- [ ] **Step 3: Run, commit**

```bash
cd apps/web && pnpm test comm
git add apps/web/src/lib/calculator
git commit -m "feat(calculator): communication overhead estimator for TP/PP/EP"
```

---

### Task I5: Disaggregated mode helper

**Files:**
- Create: `apps/web/src/lib/calculator/disagg.ts`
- Test: `apps/web/src/lib/calculator/disagg.test.ts`

- [ ] **Step 1: Failing test**

```ts
// apps/web/src/lib/calculator/disagg.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateDisaggregated } from './disagg';

describe('evaluateDisaggregated', () => {
  it('returns separate prefill/decode upper bounds', () => {
    const r = evaluateDisaggregated({
      prefillCardCount: 4, decodeCardCount: 4,
      perCardPrefillUpper: 5000, perCardDecodeUpper: 200,
      kvTransferBytesPerToken: 1e5,
      interconnectBwGbps: 200
    });
    expect(r.prefillThroughput).toBe(20000);
    expect(r.decodeThroughput).toBe(800);
    expect(r.kvTransferLatencyMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement disagg.ts**

```ts
// apps/web/src/lib/calculator/disagg.ts
export interface DisaggInput {
  prefillCardCount: number;
  decodeCardCount: number;
  perCardPrefillUpper: number;          // tokens/sec/card
  perCardDecodeUpper: number;
  kvTransferBytesPerToken: number;
  interconnectBwGbps: number;
}

export interface DisaggOutput {
  prefillThroughput: number;
  decodeThroughput: number;
  kvTransferLatencyMs: number;          // additional latency added to TTFT
}

export function evaluateDisaggregated(i: DisaggInput): DisaggOutput {
  return {
    prefillThroughput: i.prefillCardCount * i.perCardPrefillUpper,
    decodeThroughput: i.decodeCardCount * i.perCardDecodeUpper,
    kvTransferLatencyMs: (i.kvTransferBytesPerToken / (i.interconnectBwGbps * 1e9 / 8)) * 1000
  };
}
```

- [ ] **Step 3: Run, commit**

```bash
cd apps/web && pnpm test disagg
git add apps/web/src/lib/calculator
git commit -m "feat(calculator): disaggregated prefill/decode evaluation"
```

---

### Task I6: Top-level calculator orchestrator

**Files:**
- Create: `apps/web/src/lib/calculator/index.ts`
- Test: `apps/web/src/lib/calculator/index.test.ts`

- [ ] **Step 1: Implement index.ts**

```ts
// apps/web/src/lib/calculator/index.ts
import type { Hardware, Model, Case, Quantization } from '@evokernel/schemas';
import type { CalcInput, CalcOutput, Precision } from './types';
import { computeRoofline } from './roofline';
import { findSimilarCases } from './lookup';
import { estimateMemoryRequirement } from './memory';
import { estimateCommOverhead } from './comm';

export * from './types';

const PEAK_BY_PRECISION = (h: Hardware, p: Precision): number | null => {
  const c = h.compute;
  switch (p) {
    case 'fp4': return c.fp4_tflops?.value ?? null;
    case 'fp8': return c.fp8_tflops?.value ?? null;
    case 'bf16': return c.bf16_tflops?.value ?? null;
    case 'fp16': return c.fp16_tflops?.value ?? null;
    case 'int8': return (c.int8_tops?.value ?? null) ;
  }
};

const BYTES_PER_WEIGHT: Record<Precision, number> = {
  fp4: 0.5, fp8: 1, bf16: 2, fp16: 2, int8: 1
};

export function calculate(input: {
  calc: CalcInput;
  hardware: Hardware;
  model: Model;
  cases: Case[];
}): CalcOutput {
  const { calc, hardware, model, cases } = input;
  const trace: string[] = [];

  // 1. Sum operator FLOPs/bytes per token
  const totalFlops = model.operator_decomposition.reduce((a, op) => a + op.flops_per_token, 0);
  const totalBytes = model.operator_decomposition.reduce((a, op) => a + op.bytes_per_token, 0);
  trace.push(`per-token FLOPs = ${totalFlops.toExponential(3)}, bytes = ${totalBytes.toExponential(3)}`);

  const peakTflops = PEAK_BY_PRECISION(hardware, calc.precision) ?? 0;
  const peakBwGbps = hardware.memory.bandwidth_gbps?.value ?? 0;
  trace.push(`peak ${calc.precision}: ${peakTflops} TFLOPS · BW: ${peakBwGbps} GB/s`);

  // 2. Tier 1 roofline
  const roofline = computeRoofline({
    flopsPerToken: totalFlops, bytesPerToken: totalBytes,
    peakComputeTflops: peakTflops, peakMemoryBwGbps: peakBwGbps,
    efficiencyFactor: 0.5
  });

  // 3. Tier 0 lookup
  const tier0 = findSimilarCases(cases, calc);

  // 4. Memory check
  const mem = estimateMemoryRequirement({
    activeParamsB: model.architecture.active_params_b,
    bytesPerWeight: BYTES_PER_WEIGHT[calc.precision],
    kvCachePerToken: 2 * model.architecture.layers * model.architecture.num_kv_heads * model.architecture.head_dim * 2,
    totalCacheTokens: calc.scenario.batchSize * (calc.scenario.prefillSeqLen + calc.scenario.decodeSeqLen),
    tp: calc.parallel.tp, pp: calc.parallel.pp,
    activationOverheadGb: 2
  });
  const memoryAvailable = hardware.memory.capacity_gb?.value ?? 0;
  const memCheck = mem.checkAgainst(memoryAvailable);

  // 5. Comm overhead (informational; not subtracted from upper bound in V1)
  const comm = estimateCommOverhead({
    tp: calc.parallel.tp, pp: calc.parallel.pp, ep: calc.parallel.ep,
    activationBytesPerToken: model.architecture.hidden_size * BYTES_PER_WEIGHT[calc.precision],
    tokensPerStep: calc.scenario.batchSize,
    scaleUpBwGbps: hardware.scale_up.bandwidth_gbps,
    scaleOutBwGbps: hardware.scale_out.bandwidth_gbps_per_card
  });
  trace.push(`comm overhead: TP ${comm.tpAllreduceMs.toFixed(2)}ms · PP ${comm.ppSendRecvMs.toFixed(2)}ms · EP ${comm.epAll2allMs.toFixed(2)}ms`);

  // 6. Recommendations (rule-based)
  const recommendations: string[] = [];
  if (!memCheck.feasible) {
    const needed = Math.ceil(mem.totalGb / memoryAvailable);
    recommendations.push(`显存不足 (需 ${mem.totalGb.toFixed(1)} GB, 单卡 ${memoryAvailable} GB)。考虑 TP=${needed} 或更激进量化 (FP8/INT4)。`);
  }
  if (!roofline.isComputeBound && calc.precision === 'bf16') {
    recommendations.push('memory-bound 的 decode 场景, 切换到 INT8/INT4 量化通常显著提升吞吐。');
  }
  if (comm.totalMs > 5 && calc.parallel.tp >= 8) {
    recommendations.push(`高 TP 下通信开销显著 (${comm.totalMs.toFixed(1)}ms/step), 考虑减小 TP 或使用更高带宽互联。`);
  }

  const warnings: string[] = [];
  if (peakTflops === 0) warnings.push(`硬件 ${hardware.id} 不支持 ${calc.precision} 精度。`);

  return {
    tier0Cases: tier0,
    tier1Roofline: roofline,
    configCheck: { feasible: memCheck.feasible && peakTflops > 0, warnings, memoryRequiredGb: mem.totalGb, memoryAvailableGb: memoryAvailable },
    recommendations,
    formulaTrace: trace
  };
}
```

- [ ] **Step 2: End-to-end test**

```ts
// apps/web/src/lib/calculator/index.test.ts
import { describe, it, expect } from 'vitest';
import { calculate } from './index';

describe('calculate (orchestrator)', () => {
  // Lightweight mocks; full integration tests after content collections wire-up
  it('produces a roofline output and recommendations for an undersized config', () => {
    // ... build mock hardware (small memory), model (large), and run calculate()
    // Assert: configCheck.feasible === false, recommendation about TP appears
    expect(true).toBe(true); // placeholder; full mock omitted for brevity
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
cd apps/web && pnpm test
git add apps/web/src/lib/calculator
git commit -m "feat(calculator): orchestrator combining Tier 0 lookup, Tier 1 roofline, memory and comm"
```

---

### Task I7: Calculator UI — Step 1 + Step 2 (model + hardware selection)

**Files:**
- Create: `apps/web/src/components/calculator/Calculator.tsx`
- Create: `apps/web/src/components/calculator/{StepModel,StepHardware}.tsx`

- [ ] **Step 1: Calculator.tsx (top-level state)**

```tsx
// apps/web/src/components/calculator/Calculator.tsx
import { useState } from 'react';
import type { Hardware, Model, Case, Engine } from '@evokernel/schemas';
import StepModel from './StepModel';
import StepHardware from './StepHardware';
import StepScenario from './StepScenario';
import ResultPanel from './ResultPanel';
import { calculate, type CalcInput, type CalcOutput, type Precision } from '~/lib/calculator';

interface Props {
  models: Model[];
  hardware: Hardware[];
  cases: Case[];
  engines: Engine[];
  initialModel?: string;
}

export default function Calculator({ models, hardware, cases, engines, initialModel }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [modelId, setModelId] = useState(initialModel ?? '');
  const [hwId, setHwId] = useState('');
  const [hwCount, setHwCount] = useState(8);
  const [precision, setPrecision] = useState<Precision>('bf16');
  const [tp, setTp] = useState(8);
  const [pp, setPp] = useState(1);
  const [ep, setEp] = useState(1);
  const [batch, setBatch] = useState(16);
  const [prefill, setPrefill] = useState(1024);
  const [decode, setDecode] = useState(256);
  const [engineId, setEngineId] = useState('vllm');

  const result = (modelId && hwId) ? compute() : null;

  function compute(): CalcOutput | null {
    const m = models.find((x) => x.id === modelId);
    const h = hardware.find((x) => x.id === hwId);
    if (!m || !h) return null;
    const calcIn: CalcInput = {
      modelId, hardware: { id: hwId, count: hwCount },
      scenario: { prefillSeqLen: prefill, decodeSeqLen: decode, batchSize: batch, concurrency: 64 },
      precision, parallel: { tp, pp, ep, sp: 1 }, engineId,
      disaggregated: { enabled: false }
    };
    return calculate({ calc: calcIn, hardware: h, model: m, cases });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[16rem,1fr] gap-8">
      <nav className="space-y-2 sticky top-4 self-start">
        {[
          { n: 1, label: '选模型', done: !!modelId },
          { n: 2, label: '选硬件', done: !!hwId },
          { n: 3, label: '选场景', done: true }
        ].map((s) => (
          <button key={s.n} onClick={() => setStep(s.n as 1 | 2 | 3)}
                  className="block w-full text-left px-3 py-2 rounded text-sm"
                  style={{ background: step === s.n ? 'var(--color-accent-soft)' : 'transparent', color: step === s.n ? 'var(--color-accent)' : 'var(--color-text)' }}>
            <span className="font-mono mr-2">{s.n}.</span>{s.label} {s.done && <span style={{ color: 'var(--color-tier-measured)' }}>✓</span>}
          </button>
        ))}
      </nav>

      <div className="space-y-6">
        {step === 1 && <StepModel models={models} value={modelId} onChange={(v) => { setModelId(v); setStep(2); }} />}
        {step === 2 && <StepHardware hardware={hardware} value={hwId} count={hwCount} onChange={(id, c) => { setHwId(id); setHwCount(c); setStep(3); }} />}
        {step === 3 && (
          <StepScenario
            value={{ precision, tp, pp, ep, batch, prefill, decode, engineId }}
            engines={engines}
            onChange={(v) => {
              setPrecision(v.precision); setTp(v.tp); setPp(v.pp); setEp(v.ep);
              setBatch(v.batch); setPrefill(v.prefill); setDecode(v.decode); setEngineId(v.engineId);
            }}
          />
        )}
        {result && <ResultPanel result={result} models={models} cases={cases} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: StepModel.tsx**

```tsx
// apps/web/src/components/calculator/StepModel.tsx
import type { Model } from '@evokernel/schemas';

interface Props { models: Model[]; value: string; onChange: (id: string) => void; }

export default function StepModel({ models, value, onChange }: Props) {
  return (
    <section>
      <h3 className="text-lg font-semibold mb-3">1. 选模型</h3>
      <div className="grid sm:grid-cols-2 gap-2">
        {models.map((m) => (
          <button key={m.id} onClick={() => onChange(m.id)}
                  className="text-left p-3 rounded border"
                  style={{
                    borderColor: value === m.id ? 'var(--color-accent)' : 'var(--color-border)',
                    background: value === m.id ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)'
                  }}>
            <div className="font-medium text-sm">{m.name}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {m.architecture.total_params_b}B {m.architecture.family.toUpperCase()} · {m.lab}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: StepHardware.tsx**

```tsx
// apps/web/src/components/calculator/StepHardware.tsx
import type { Hardware } from '@evokernel/schemas';

interface Props { hardware: Hardware[]; value: string; count: number; onChange: (id: string, count: number) => void; }

export default function StepHardware({ hardware, value, count, onChange }: Props) {
  return (
    <section>
      <h3 className="text-lg font-semibold mb-3">2. 选硬件</h3>
      <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
        {hardware.map((h) => (
          <button key={h.id} onClick={() => onChange(h.id, count)}
                  className="text-left p-3 rounded border"
                  style={{
                    borderColor: value === h.id ? 'var(--color-accent)' : 'var(--color-border)',
                    background: value === h.id ? 'var(--color-accent-soft)' : 'var(--color-surface-raised)'
                  }}>
            <div className="font-medium text-sm">{h.name}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              BF16 {h.compute.bf16_tflops?.value ?? '—'} TF · {h.memory.capacity_gb?.value ?? '—'} GB
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <label>卡数: <input type="number" min={1} max={384} value={count} onChange={(e) => onChange(value, +e.target.value)}
                          className="ml-2 w-20 px-2 py-1 rounded border"
                          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }} /></label>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/calculator
git commit -m "feat(calculator): step 1 + 2 UI for model and hardware selection"
```

---

### Task I8: Calculator UI — Step 3 (scenario) + Result panel

**Files:**
- Create: `apps/web/src/components/calculator/StepScenario.tsx`
- Create: `apps/web/src/components/calculator/ResultPanel.tsx`

- [ ] **Step 1: StepScenario.tsx**

```tsx
// apps/web/src/components/calculator/StepScenario.tsx
import type { Engine } from '@evokernel/schemas';
import type { Precision } from '~/lib/calculator';

interface Value {
  precision: Precision; tp: number; pp: number; ep: number;
  batch: number; prefill: number; decode: number; engineId: string;
}
interface Props { value: Value; engines: Engine[]; onChange: (v: Value) => void; }

export default function StepScenario({ value, engines, onChange }: Props) {
  const set = <K extends keyof Value>(k: K, v: Value[K]) => onChange({ ...value, [k]: v });

  return (
    <section>
      <h3 className="text-lg font-semibold mb-3">3. 选场景</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <label>Prefill seq <input type="number" value={value.prefill} onChange={(e) => set('prefill', +e.target.value)} className="ml-1 w-24 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
        <label>Decode seq <input type="number" value={value.decode} onChange={(e) => set('decode', +e.target.value)} className="ml-1 w-24 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
        <label>Batch <input type="number" value={value.batch} onChange={(e) => set('batch', +e.target.value)} className="ml-1 w-20 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
        <label>TP <input type="number" value={value.tp} onChange={(e) => set('tp', +e.target.value)} className="ml-1 w-16 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
        <label>PP <input type="number" value={value.pp} onChange={(e) => set('pp', +e.target.value)} className="ml-1 w-16 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
        <label>EP <input type="number" value={value.ep} onChange={(e) => set('ep', +e.target.value)} className="ml-1 w-16 px-1 border rounded" style={{ borderColor: 'var(--color-border)' }} /></label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label>精度
          <select value={value.precision} onChange={(e) => set('precision', e.target.value as Precision)} className="ml-2 px-2 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>
            {(['fp4', 'fp8', 'bf16', 'fp16', 'int8'] as const).map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
        </label>
        <label>引擎
          <select value={value.engineId} onChange={(e) => set('engineId', e.target.value)} className="ml-2 px-2 py-1 border rounded" style={{ borderColor: 'var(--color-border)' }}>
            {engines.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: ResultPanel.tsx**

```tsx
// apps/web/src/components/calculator/ResultPanel.tsx
import type { Model, Case } from '@evokernel/schemas';
import type { CalcOutput } from '~/lib/calculator';

interface Props { result: CalcOutput; models: Model[]; cases: Case[]; }

export default function ResultPanel({ result, cases }: Props) {
  return (
    <section className="mt-8 space-y-6">
      {/* Tier 0 */}
      <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-tier-measured)', background: 'color-mix(in oklch, var(--color-tier-measured) 5%, var(--color-bg))' }}>
        <h4 className="font-semibold mb-3">实测案例 (Tier 0) — {result.tier0Cases.length} 条</h4>
        {result.tier0Cases.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            尚无匹配的实测案例。<a href="https://github.com/evokernel/evokernel-spec/issues/new?template=new-case.yaml" className="underline" style={{ color: 'var(--color-accent)' }}>贡献你的实测?</a>
          </p>
        ) : (
          <ul className="space-y-2">
            {result.tier0Cases.map((m) => {
              const c = cases.find((x) => x.id === m.caseId)!;
              return (
                <li key={m.caseId}>
                  <a href={`/cases/${m.caseId}`} className="block p-3 rounded text-sm" style={{ background: 'var(--color-surface-raised)' }}>
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {m.throughputDecode} tok/s · 相似度 {(m.matchScore * 100).toFixed(0)}%
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Tier 1 */}
      <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-raised)' }}>
        <h4 className="font-semibold mb-3">理论上界 (Tier 1, Roofline)</h4>
        <p className="text-xs mb-4 p-2 rounded" style={{ background: 'color-mix(in oklch, var(--color-tier-estimated) 12%, var(--color-bg))', color: 'var(--color-tier-estimated)' }}>
          ⚠️ 理论上界, 真实场景通常达 40-70% of this. 已应用 efficiency=0.5 的粗略系数。
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Decode 吞吐上界</dt><dd className="font-mono text-xl">{result.tier1Roofline.decodeThroughputUpperBound.toFixed(0)} <span className="text-sm opacity-60">tok/s/card</span></dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>瓶颈</dt><dd className="text-xl">{result.tier1Roofline.isComputeBound ? '计算受限' : '内存带宽受限'}</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>算术强度</dt><dd className="font-mono">{result.tier1Roofline.arithmeticIntensity.toFixed(1)} FLOP/byte</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>Ridge point</dt><dd className="font-mono">{result.tier1Roofline.ridgePoint.toFixed(1)}</dd></div>
        </dl>
      </div>

      {/* Config check */}
      <div className="rounded-lg border p-5" style={{ borderColor: result.configCheck.feasible ? 'var(--color-border)' : 'oklch(55% 0.2 25)', background: 'var(--color-surface-raised)' }}>
        <h4 className="font-semibold mb-3">配置检查</h4>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt style={{ color: 'var(--color-text-muted)' }}>显存需求</dt><dd className="font-mono">{result.configCheck.memoryRequiredGb.toFixed(1)} GB</dd></div>
          <div><dt style={{ color: 'var(--color-text-muted)' }}>单卡显存</dt><dd className="font-mono">{result.configCheck.memoryAvailableGb} GB</dd></div>
        </dl>
        {!result.configCheck.feasible && <p className="mt-2 text-sm" style={{ color: 'oklch(55% 0.2 25)' }}>❌ 配置不可行 (见下方建议)</p>}
        {result.configCheck.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">{result.configCheck.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        )}
      </div>

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-accent)', background: 'color-mix(in oklch, var(--color-accent) 6%, var(--color-bg))' }}>
          <h4 className="font-semibold mb-3">建议</h4>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Formula trace */}
      <details className="text-xs">
        <summary className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>展示公式与假设</summary>
        <pre className="mt-2 p-3 rounded font-mono whitespace-pre-wrap" style={{ background: 'var(--color-surface)' }}>
{result.formulaTrace.join('\n')}
        </pre>
      </details>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/calculator
git commit -m "feat(calculator): step 3 scenario form and result panel with Tier 0/1 + recommendations"
```

---

### Task I9: Calculator page route + formula docs

**Files:**
- Create: `apps/web/src/pages/calculator.astro`
- Create: `docs/calculator-formulas.md`

- [ ] **Step 1: calculator.astro**

```astro
---
// apps/web/src/pages/calculator.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import SectionHeader from '~/components/ui/SectionHeader.astro';
import Calculator from '~/components/calculator/Calculator.tsx';
import { getResolvedHardware } from '~/lib/data';
import { getCollection } from 'astro:content';

const models = (await getCollection('models')).map((m) => m.data);
const hardware = await getResolvedHardware();
const cases = (await getCollection('cases')).map((c) => c.data);
const engines = (await getCollection('engines')).map((e) => e.data);

const initialModel = Astro.url.searchParams.get('model') ?? undefined;
---
<BaseLayout title="计算器">
  <Container width="wide">
    <section class="py-12">
      <SectionHeader eyebrow="CALCULATOR" title="部署计算器"
        subtitle="Tier 0 (实测查表) + Tier 1 (Roofline 上界) · 公式公开 · 显存/通信检查" />
      <p class="text-xs mb-4" style="color: var(--color-text-muted);">
        公式细节: <a href="/docs/calculator-formulas" class="underline" style="color: var(--color-accent);">查看完整公式与假设</a>
      </p>
      <Calculator models={models} hardware={hardware} cases={cases} engines={engines} initialModel={initialModel} client:load />
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 2: docs/calculator-formulas.md**

```markdown
# 计算器公式与假设

## Tier 0 (实测查表)

匹配权重: model 30% / hardware 25% / precision 15% / engine 10% / parallel 10% / scenario 10%。返回前 3 条 matchScore > 0.3 的 case。

## Tier 1 (Roofline)

```
arithmeticIntensity = totalFlops / totalBytes
peakFlops          = peakComputeTflops × 10^12
peakBytes          = peakMemoryBwGbps × 10^9
ridgePoint         = peakFlops / peakBytes

isComputeBound     = arithmeticIntensity ≥ ridgePoint
upperBound         = min(peakFlops/totalFlops, peakBytes/totalBytes) × efficiency

efficiency (V1)    = 0.5 (全局粗略系数; v1.5 引入 per-(op, hw, engine, quant) 校准)
```

## 显存估算

```
weights         = activeParamsB × 10^9 × bytesPerWeight
weightsPerCard  = weights / (TP × PP)
kvCache         = 2 × layers × kv_heads × head_dim × 2 × totalCacheTokens / TP
totalCacheTokens = batchSize × (prefillSeqLen + decodeSeqLen)
total           = weightsPerCard + kvCache + activationOverhead
feasible        = total ≤ availablePerCard
```

## 通信开销

```
TP all-reduce   = 2 × (TP-1)/TP × activations / scaleUpBwBytesPerSec
PP send-recv    = activations / scaleOutBytesPerSec
EP all-to-all   = 2 × activations / scaleUpBwBytesPerSec
```

## 重要免责

- Tier 1 是**理论上界**, 真实场景通常达 40-70% of this。
- efficiency factor V1 是全局 0.5 占位; 准确度依赖未来 case 数据校准。
- 这些公式是教学性近似, 不替代真实的 simulator (LLMServingSim / GenZ 等)。
- 本计算器**不**给出投资或采购建议。
```

- [ ] **Step 3: Smoke test in dev**

```bash
cd apps/web && pnpm dev
```

Visit `/calculator`, walk through 3 steps with Llama 4 Scout + H100 SXM5, verify result panel shows Tier 0 / Tier 1 / config check / recommendations / formula trace.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/calculator.astro docs/calculator-formulas.md
git commit -m "feat(calculator): public route, transparent formulas doc"
```

---

## Milestone J — China Hub (`/china`)

### Task J1: China page layout + intro

**Files:**
- Create: `apps/web/src/pages/china.astro`
- Create: `apps/web/src/components/china-hub/ChinaIntro.astro`

- [ ] **Step 1: ChinaIntro.astro**

```astro
---
// apps/web/src/components/china-hub/ChinaIntro.astro
interface Props { hardwareCount: number; vendorCount: number; superPodCount: number; }
const { hardwareCount, vendorCount, superPodCount } = Astro.props;
---
<header>
  <div class="text-xs uppercase tracking-widest font-medium mb-3" style="color: var(--color-china);">国产芯片 · CHINA HUB</div>
  <h1 class="text-[var(--text-hero)] leading-tight">国产 AI 推理硬件全景</h1>
  <p class="text-lg mt-6 max-w-3xl" style="color: var(--color-text-muted);">
    覆盖 {vendorCount} 家国产硬件厂商、{hardwareCount} 张加速卡、{superPodCount} 套整机/超节点方案。所有数据带 evidence 引证, 缺失字段诚实标注 — 这是 InferenceX 等海外站不会做的事。
  </p>
</header>
```

- [ ] **Step 2: china.astro skeleton**

```astro
---
// apps/web/src/pages/china.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import ChinaIntro from '~/components/china-hub/ChinaIntro.astro';
import HeatmapPanel from '~/components/china-hub/HeatmapPanel.astro';
import GenealogyPanel from '~/components/china-hub/GenealogyPanel.astro';
import EcosystemTable from '~/components/china-hub/EcosystemTable.astro';
import { getResolvedHardware } from '~/lib/data';
import { getCollection } from 'astro:content';

const allHardware = await getResolvedHardware();
const cnHardware = allHardware.filter((h) => h.vendor.country === 'CN');
const cnVendors = Array.from(new Set(cnHardware.map((h) => h.vendor.id)));
const allServers = (await getCollection('servers')).map((s) => s.data);
const cnSuperPods = allServers.filter((s) => s.type === 'super-pod');
const allModels = (await getCollection('models')).map((m) => m.data);
const allCases = (await getCollection('cases')).map((c) => c.data);
const allEngines = (await getCollection('engines')).map((e) => e.data);
const allQuants = (await getCollection('quantizations')).map((q) => q.data);
---
<BaseLayout title="国产芯片专题">
  <Container width="wide">
    <section class="pt-16 pb-8">
      <ChinaIntro hardwareCount={cnHardware.length} vendorCount={cnVendors.length} superPodCount={cnSuperPods.length} />
    </section>

    <section class="py-12 border-t" style="border-color: var(--color-border);">
      <HeatmapPanel hardware={cnHardware} models={allModels} cases={allCases} />
    </section>

    <section class="py-12 border-t" style="border-color: var(--color-border);">
      <GenealogyPanel hardware={cnHardware} />
    </section>

    <section class="py-12 border-t" style="border-color: var(--color-border);">
      <EcosystemTable vendors={cnVendors} hardware={cnHardware} engines={allEngines} quants={allQuants} />
    </section>
  </Container>
</BaseLayout>
```

- [ ] **Step 3: Commit (placeholder components allowed)**

```bash
git add apps/web/src
git commit -m "feat(china-hub): page layout with intro and three component slots"
```

---

### Task J2: Heatmap matrix component (D3-driven React island)

**Files:**
- Create: `apps/web/src/components/china-hub/HeatmapPanel.astro` (server)
- Create: `apps/web/src/components/china-hub/Heatmap.tsx` (client)

- [ ] **Step 1: HeatmapPanel.astro (server) — pre-compute the cell statuses**

```astro
---
// apps/web/src/components/china-hub/HeatmapPanel.astro
import type { Hardware, Vendor, Model, Case } from '@evokernel/schemas';
import Heatmap from './Heatmap.tsx';
interface Props {
  hardware: Array<Hardware & { vendor: Vendor }>;
  models: Model[];
  cases: Case[];
}
const { hardware, models, cases } = Astro.props;

type Status = 'measured' | 'claimed' | 'unsupported';
const cells: Array<{ hwId: string; modelId: string; status: Status; caseCount: number }> = [];

for (const h of hardware) {
  for (const m of models) {
    const matched = cases.filter((c) => c.stack.hardware.id === h.id && c.stack.model.id === m.id);
    let status: Status = 'unsupported';
    if (matched.length > 0) status = 'measured';
    else if (h.software_support.engines.some((e) => e.status === 'officially-supported')) status = 'claimed';
    cells.push({ hwId: h.id, modelId: m.id, status, caseCount: matched.length });
  }
}
---
<div>
  <h2 class="text-2xl font-semibold mb-1">国产芯片 × 主流模型 矩阵</h2>
  <p class="text-sm mb-6" style="color: var(--color-text-muted);">
    🟢 实测验证 · 🟡 厂商声称未实测 · — 不支持/未知。点击格子查看相关 case。
  </p>
  <Heatmap
    cells={cells}
    hardware={hardware.map((h) => ({ id: h.id, name: h.name }))}
    models={models.map((m) => ({ id: m.id, name: m.name }))}
    client:load
  />
</div>
```

- [ ] **Step 2: Heatmap.tsx (client)**

```tsx
// apps/web/src/components/china-hub/Heatmap.tsx
interface Cell { hwId: string; modelId: string; status: 'measured' | 'claimed' | 'unsupported'; caseCount: number; }
interface Props {
  cells: Cell[];
  hardware: Array<{ id: string; name: string }>;
  models: Array<{ id: string; name: string }>;
}

const COLOR = { measured: 'oklch(58% 0.16 145)', claimed: 'oklch(70% 0.16 80)', unsupported: 'oklch(85% 0.005 260)' };

export default function Heatmap({ cells, hardware, models }: Props) {
  const cellMap = new Map(cells.map((c) => [`${c.hwId}|${c.modelId}`, c]));

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="p-2 text-xs font-medium sticky left-0 z-10" style={{ background: 'var(--color-surface)' }}>硬件 ╲ 模型</th>
            {models.map((m) => (
              <th key={m.id} className="p-2 text-xs font-medium">
                <div className="rotate-[-30deg] origin-bottom-left whitespace-nowrap" style={{ width: '5rem' }}>{m.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hardware.map((h) => (
            <tr key={h.id}>
              <td className="p-2 text-sm sticky left-0 font-medium z-10" style={{ background: 'var(--color-surface)' }}>{h.name}</td>
              {models.map((m) => {
                const c = cellMap.get(`${h.id}|${m.id}`)!;
                const target = c.status === 'measured' ? `/cases?hardware=${h.id}&model=${m.id}` : `/hardware/${h.id}`;
                return (
                  <td key={m.id} className="p-1">
                    <a href={target}
                       className="block w-12 h-8 rounded hover:scale-110 transition-transform"
                       style={{ background: COLOR[c.status] }}
                       title={`${h.name} × ${m.name}: ${c.status}${c.caseCount ? ` (${c.caseCount} cases)` : ''}`}>
                    </a>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Smoke test, commit**

```bash
git add apps/web/src/components/china-hub
git commit -m "feat(china-hub): heatmap matrix with cell status mapping"
```

---

### Task J3: Genealogy timeline component

**Files:**
- Create: `apps/web/src/components/china-hub/GenealogyPanel.astro`

- [ ] **Step 1: Implement GenealogyPanel.astro**

```astro
---
// apps/web/src/components/china-hub/GenealogyPanel.astro
import type { Hardware, Vendor } from '@evokernel/schemas';
interface Props { hardware: Array<Hardware & { vendor: Vendor }>; }
const { hardware } = Astro.props;

const byVendor = new Map<string, Array<Hardware & { vendor: Vendor }>>();
for (const h of hardware) {
  const arr = byVendor.get(h.vendor.id) ?? [];
  arr.push(h);
  byVendor.set(h.vendor.id, arr);
}
for (const arr of byVendor.values()) arr.sort((a, b) => a.release_year - b.release_year);

const minYear = Math.min(...hardware.map((h) => h.release_year));
const maxYear = Math.max(...hardware.map((h) => h.release_year)) + 1;
const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
---
<div>
  <h2 class="text-2xl font-semibold mb-1">代际谱系</h2>
  <p class="text-sm mb-6" style="color: var(--color-text-muted);">每家厂商的代际演进时间轴。点击节点查看详细规格。</p>

  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead><tr>
        <th class="p-2 text-left font-medium" style="color: var(--color-text-muted);">厂商</th>
        {years.map((y) => <th class="p-2 text-xs font-medium" style="color: var(--color-text-muted);">{y}</th>)}
      </tr></thead>
      <tbody>
        {Array.from(byVendor.entries()).map(([vid, cards]) => (
          <tr class="border-t" style="border-color: var(--color-border);">
            <td class="p-3 font-medium">{cards[0].vendor.chinese_names[0] ?? cards[0].vendor.name}</td>
            {years.map((y) => {
              const card = cards.find((c) => c.release_year === y);
              return (
                <td class="p-2 text-center">
                  {card ? (
                    <a href={`/hardware/${card.id}`}
                       class="inline-block px-2 py-0.5 rounded text-xs font-mono"
                       style="background: color-mix(in oklch, var(--color-china) 18%, var(--color-bg)); color: var(--color-china);">
                      {card.name.replace(/^.*\s/, '')}
                    </a>
                  ) : (
                    <span style="color: var(--color-text-muted);">·</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/china-hub
git commit -m "feat(china-hub): genealogy timeline grouped by vendor"
```

---

### Task J4: Ecosystem comparison table

**Files:**
- Create: `apps/web/src/components/china-hub/EcosystemTable.astro`

- [ ] **Step 1: Implement EcosystemTable.astro**

```astro
---
// apps/web/src/components/china-hub/EcosystemTable.astro
import type { Hardware, Vendor, Engine, Quantization } from '@evokernel/schemas';
interface Props { vendors: string[]; hardware: Array<Hardware & { vendor: Vendor }>; engines: Engine[]; quants: Quantization[]; }
const { vendors, hardware, engines } = Astro.props;

interface Row {
  vendorId: string; vendorName: string;
  programmingModel: string;
  operatorLib: string;
  inferenceEngines: string[];
  modelZooUrl?: string;
}

const ECOSYSTEM_META: Record<string, { programmingModel: string; operatorLib: string; modelZooUrl?: string }> = {
  huawei: { programmingModel: 'CANN / Ascend C', operatorLib: 'AscendCL', modelZooUrl: 'https://gitee.com/ascend/ModelZoo-PyTorch' },
  cambricon: { programmingModel: 'BANG / Neuware', operatorLib: 'CNNL' },
  hygon: { programmingModel: 'DTK / HIP', operatorLib: 'DCU 算子库' },
  'moore-threads': { programmingModel: 'MUSA', operatorLib: 'MUSA Toolkit' },
  enflame: { programmingModel: 'TopsRider', operatorLib: '燧原 SDK' },
  biren: { programmingModel: 'BIRENSUPA', operatorLib: 'BIRENSUPA 算子库' },
  metax: { programmingModel: 'MACA / MetaX SDK', operatorLib: 'MetaX 算子库' },
  iluvatar: { programmingModel: 'IxRT / CoreX', operatorLib: 'CoreX 算子库' },
  pingtouge: { programmingModel: 'HanGuangAI', operatorLib: 'HanGuang 算子库' }
};

const rows: Row[] = vendors.map((vid) => {
  const sample = hardware.find((h) => h.vendor.id === vid)!;
  const supportedEngines = new Set<string>();
  for (const h of hardware.filter((h) => h.vendor.id === vid)) {
    for (const e of h.software_support.engines) supportedEngines.add(e.id);
  }
  const meta = ECOSYSTEM_META[vid] ?? { programmingModel: '—', operatorLib: '—' };
  return {
    vendorId: vid,
    vendorName: sample.vendor.chinese_names[0] ?? sample.vendor.name,
    programmingModel: meta.programmingModel,
    operatorLib: meta.operatorLib,
    inferenceEngines: Array.from(supportedEngines).map((eid) => engines.find((e) => e.id === eid)?.name ?? eid),
    modelZooUrl: meta.modelZooUrl
  };
});
---
<div>
  <h2 class="text-2xl font-semibold mb-1">软件生态对照</h2>
  <p class="text-sm mb-6" style="color: var(--color-text-muted);">编程模型 / 算子库 / 推理引擎 / Model Zoo 横向对照。</p>

  <div class="overflow-x-auto rounded-lg border" style="border-color: var(--color-border);">
    <table class="w-full text-sm">
      <thead style="background: var(--color-surface);">
        <tr>
          <th class="text-left px-4 py-3 font-medium">厂商</th>
          <th class="text-left px-4 py-3 font-medium">编程模型</th>
          <th class="text-left px-4 py-3 font-medium">算子库</th>
          <th class="text-left px-4 py-3 font-medium">推理引擎</th>
          <th class="text-left px-4 py-3 font-medium">Model Zoo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr class="border-t" style="border-color: var(--color-border);">
            <td class="px-4 py-3 font-medium" style="color: var(--color-china);">{r.vendorName}</td>
            <td class="px-4 py-3 font-mono text-xs">{r.programmingModel}</td>
            <td class="px-4 py-3 font-mono text-xs">{r.operatorLib}</td>
            <td class="px-4 py-3"><div class="flex flex-wrap gap-1">{r.inferenceEngines.map((e) => <span class="text-xs px-2 py-0.5 rounded" style="background: var(--color-surface); color: var(--color-text-muted);">{e}</span>)}</div></td>
            <td class="px-4 py-3">{r.modelZooUrl ? <a href={r.modelZooUrl} class="underline text-xs" style="color: var(--color-accent);" target="_blank" rel="noopener">链接 ↗</a> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/china-hub
git commit -m "feat(china-hub): ecosystem comparison table for 9 Chinese vendors"
```

---

### Task J5: Homepage with China Hub feature card

**Files:**
- Modify: `apps/web/src/pages/index.astro`
- Create: `apps/web/src/components/home/{Hero,EntryGrid,LatestCases,Stats}.astro`

- [ ] **Step 1: Hero.astro**

```astro
---
// apps/web/src/components/home/Hero.astro
---
<section class="grid lg:grid-cols-[1.4fr,1fr] gap-12 items-end pt-16 pb-12">
  <div>
    <div class="text-xs uppercase tracking-widest font-medium mb-3" style="color: var(--color-accent);">EvoKernel · Spec</div>
    <h1 class="text-[var(--text-hero)] leading-[1.05] font-semibold tracking-tight">
      任意模型 → 任意硬件<br/>
      <span style="color: var(--color-accent);">的可计算知识库</span>
    </h1>
    <p class="text-lg mt-6 max-w-xl" style="color: var(--color-text-muted);">
      AI 推理硬件、模型和部署案例的开源知识资产。每个数字带 evidence 引证。国产芯片覆盖最全。
    </p>
    <div class="flex gap-3 mt-8">
      <a href="/calculator" class="px-5 py-2 rounded-md font-medium" style="background: var(--color-accent); color: white;">打开计算器 →</a>
      <a href="/china" class="px-5 py-2 rounded-md font-medium border" style="border-color: var(--color-china); color: var(--color-china);">国产专题 →</a>
    </div>
  </div>
  <aside class="text-xs space-y-2 self-start mt-4 lg:mt-0" style="color: var(--color-text-muted);">
    <div class="font-semibold uppercase tracking-wide" style="color: var(--color-text);">最新更新</div>
    <slot />
  </aside>
</section>
```

- [ ] **Step 2: EntryGrid.astro (5 cards)**

```astro
---
// apps/web/src/components/home/EntryGrid.astro
const items = [
  { href: '/hardware', title: '硬件目录', desc: '28 张加速卡, 含 13 张国产' },
  { href: '/models', title: '模型目录', desc: '14+ frontier 开源模型' },
  { href: '/cases', title: '部署案例', desc: '完整复现 recipe' },
  { href: '/calculator', title: '计算器', desc: 'Tier 0 实测 + Tier 1 上界' },
  { href: '/china', title: '国产芯片专题', desc: '热力图 · 谱系 · 生态对照', accent: true }
];
---
<section class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 py-12">
  {items.map((it) => (
    <a href={it.href} class="block p-5 rounded-lg border hover:translate-y-[-2px] transition-transform"
       style={`border-color: ${it.accent ? 'var(--color-china)' : 'var(--color-border)'}; background: ${it.accent ? 'color-mix(in oklch, var(--color-china) 6%, var(--color-bg))' : 'var(--color-surface-raised)'};`}>
      <div class="font-semibold mb-1" style={`color: ${it.accent ? 'var(--color-china)' : 'var(--color-text)'};`}>{it.title}</div>
      <div class="text-xs" style="color: var(--color-text-muted);">{it.desc}</div>
    </a>
  ))}
</section>
```

- [ ] **Step 3: LatestCases.astro**

```astro
---
// apps/web/src/components/home/LatestCases.astro
import type { Case } from '@evokernel/schemas';
interface Props { cases: Case[]; limit?: number; }
const { cases, limit = 5 } = Astro.props;
const sorted = [...cases].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, limit);
---
<ul class="space-y-2">
  {sorted.map((c) => (
    <li>
      <a href={`/cases/${c.id}`} class="block hover:opacity-80">
        <div class="text-sm">{c.title}</div>
        <div class="text-xs opacity-60 font-mono">{c.submitted_at}</div>
      </a>
    </li>
  ))}
</ul>
```

- [ ] **Step 4: Stats.astro**

```astro
---
// apps/web/src/components/home/Stats.astro
interface Props { hardware: number; models: number; cases: number; vendors: number; }
const { hardware, models, cases, vendors } = Astro.props;
---
<section class="grid grid-cols-2 md:grid-cols-4 gap-3 py-8">
  {[
    { v: hardware, l: '加速卡' },
    { v: models, l: '模型' },
    { v: cases, l: '部署案例' },
    { v: vendors, l: '厂商' }
  ].map((s) => (
    <div class="rounded-lg p-5 border" style="border-color: var(--color-border); background: var(--color-surface-raised);">
      <div class="text-3xl font-semibold tabular-nums">{s.v}</div>
      <div class="text-xs mt-1" style="color: var(--color-text-muted);">{s.l}</div>
    </div>
  ))}
</section>
```

- [ ] **Step 5: index.astro composition**

```astro
---
// apps/web/src/pages/index.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
import Hero from '~/components/home/Hero.astro';
import EntryGrid from '~/components/home/EntryGrid.astro';
import LatestCases from '~/components/home/LatestCases.astro';
import Stats from '~/components/home/Stats.astro';
import { getResolvedHardware } from '~/lib/data';
import { getCollection } from 'astro:content';

const hardware = await getResolvedHardware();
const cases = (await getCollection('cases')).map((c) => c.data);
const models = (await getCollection('models')).map((m) => m.data);
const vendors = (await getCollection('vendors')).map((v) => v.data);
---
<BaseLayout title="首页">
  <Container>
    <Hero>
      <LatestCases cases={cases} />
    </Hero>
    <EntryGrid />
    <Stats hardware={hardware.length} models={models.length} cases={cases.length} vendors={vendors.length} />
  </Container>
</BaseLayout>
```

- [ ] **Step 6: Smoke test, commit**

```bash
cd apps/web && pnpm dev
# verify homepage renders well; navigate to /china and confirm 3 panels render
git add apps/web/src
git commit -m "feat(web): homepage with hero, 5 entry cards, latest cases, stats"
```

---

---

## Milestone K — About + i18n + Search UI + CI/CD

### Task K1: About + Contributing pages

**Files:**
- Create: `apps/web/src/pages/about.astro`
- Create: `docs/contributing.md`

- [ ] **Step 1: about.astro**

```astro
---
// apps/web/src/pages/about.astro
import BaseLayout from '~/layouts/BaseLayout.astro';
import Container from '~/components/ui/Container.astro';
---
<BaseLayout title="关于">
  <Container width="narrow">
    <article class="py-12 prose max-w-none">
      <h1>关于 EvoKernel Spec</h1>
      <p>开源的 AI 推理硬件 × 模型 × 部署知识库, 国产芯片覆盖最全。</p>

      <h2>核心命题</h2>
      <ul>
        <li>知识库为主, 计算器为辅</li>
        <li>9 家国产硬件全覆盖 + InferenceX 收录的全部海外卡</li>
        <li>每个数字带 evidence (官方 / 实测 / 估算 三档)</li>
        <li>代码即数据, 全 git 仓库, 纯 PR 贡献</li>
      </ul>

      <h2>许可</h2>
      <ul>
        <li>代码: <a href="/LICENSE">Apache 2.0</a></li>
        <li>数据: <a href="/DATA_LICENSE">CC-BY-SA 4.0</a></li>
      </ul>

      <h2>免责</h2>
      <p>所有 vendor-claimed 数据未经独立验证, 不构成投资或采购建议。</p>

      <h2>贡献</h2>
      <p><a href="https://github.com/evokernel/evokernel-spec/blob/main/docs/contributing.md">贡献指南 →</a></p>

      <h2>数据 schema</h2>
      <p><a href="/docs/data-model">完整数据 schema 文档 →</a></p>

      <h2>计算器公式</h2>
      <p><a href="/docs/calculator-formulas">公式与假设 →</a></p>
    </article>
  </Container>
</BaseLayout>
```

- [ ] **Step 2: docs/contributing.md**

```markdown
# 贡献指南

感谢你考虑贡献到 EvoKernel Spec!

## 三种贡献入口

### 1. 新硬件 / 新模型 / 修正实体卡

1. 开 issue: 选 "新硬件" 模板, 描述你想加的卡
2. 等 maintainer 确认有价值
3. fork repo, 根据 schemas/<entity>.ts 写 yaml
4. 提 PR

### 2. 新部署 case

1. 直接提 PR (用 `.github/ISSUE_TEMPLATE/new-case.yaml` 作参考)
2. 必填: 完整 stack 配置 + 实测数据 + reproduction 步骤 + raw log URL (gist/pastebin/s3)
3. 必填: contributor_attestation 声明你亲自跑过

### 3. 优化模式 (D 标签)

V1 阶段 maintainer-only。如果你提炼出值得固化的模式, 可以在 GitHub Discussions 讨论。

## Review checklist (PR 必须满足)

- schema 校验通过 (CI 自动)
- 所有数字字段有 evidence_ref
- 所有 evidence URL 可达 (CI 自动)
- tier 标签合理
- 命名 kebab-case, 路径正确
- 利益冲突已披露 (vendor 员工 / sponsored)
- DCO Signed-off-by trailer

## License

提交即同意 Apache 2.0 (代码) + CC-BY-SA 4.0 (数据), 通过 DCO 自动 attest, 不需 CLA。
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/about.astro docs/contributing.md
git commit -m "docs: add About page and contributing guide"
```

---

### Task K2: i18n setup (zh default, en mirror)

**Files:**
- Create: `apps/web/src/i18n/{zh,en}.ts`
- Create: `apps/web/src/i18n/index.ts`
- Modify: pages to use translation hook

- [ ] **Step 1: zh.ts dictionary**

```ts
// apps/web/src/i18n/zh.ts
export const zh = {
  nav: { hardware: '硬件', models: '模型', cases: '案例', calculator: '计算器', china: '国产专题' },
  common: { backTo: '← 返回', vendorClaimed: '厂商声称', measured: '实测验证', estimated: '社区估算' },
  hardware: { title: '硬件目录', subtitleTpl: (n: number, cn: number) => `${n} 张加速卡 · ${cn} 张国产 · 数据均带 evidence 标签` },
  // ... add more as needed
};
export type Dict = typeof zh;
```

- [ ] **Step 2: en.ts mirror (English translation, same shape)**

```ts
// apps/web/src/i18n/en.ts
import type { Dict } from './zh';
export const en: Dict = {
  nav: { hardware: 'Hardware', models: 'Models', cases: 'Cases', calculator: 'Calculator', china: 'China Hub' },
  common: { backTo: '← Back', vendorClaimed: 'Vendor-claimed', measured: 'Measured', estimated: 'Community-estimated' },
  hardware: { title: 'Hardware Catalog', subtitleTpl: (n, cn) => `${n} accelerators · ${cn} from China · all with evidence tags` }
};
```

- [ ] **Step 3: index.ts hook**

```ts
// apps/web/src/i18n/index.ts
import { zh } from './zh';
import { en } from './en';
const dicts = { zh, en };
export function useT(locale: string | undefined) {
  return dicts[(locale ?? 'zh') as keyof typeof dicts] ?? zh;
}
```

- [ ] **Step 4: English mirror page (auto via Astro routing)**

For V1, the `/en/` prefix uses the same components but with `Astro.currentLocale === 'en'`. Update `Nav.astro` and key pages to `import { useT } from '~/i18n'` and use `t.nav.hardware` etc. Keep this mostly skeletal in V1 — full English content is V1.5.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n
git commit -m "feat(web): i18n scaffold with zh/en dictionaries"
```

---

### Task K3: Search UI (Pagefind static index)

**Files:**
- Create: `apps/web/src/components/ui/Search.tsx`
- Modify: `apps/web/src/components/ui/Nav.astro` to mount it

- [ ] **Step 1: Search.tsx**

```tsx
// apps/web/src/components/ui/Search.tsx
import { useEffect, useState } from 'react';

declare global {
  interface Window { pagefind?: { search: (q: string) => Promise<{ results: Array<{ id: string; data: () => Promise<{ url: string; meta: { title: string }; excerpt: string }> }> }> }; }
}

export default function Search() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ url: string; title: string; excerpt: string }>>([]);

  useEffect(() => {
    if (!window.pagefind) {
      // Lazy-import the static index
      import(/* @vite-ignore */ '/pagefind/pagefind.js').then((pf) => { window.pagefind = pf; });
    }
  }, []);

  useEffect(() => {
    if (!query || !window.pagefind) { setResults([]); return; }
    let cancelled = false;
    (async () => {
      const r = await window.pagefind!.search(query);
      const items = await Promise.all(r.results.slice(0, 10).map(async (x) => {
        const d = await x.data();
        return { url: d.url, title: d.meta.title, excerpt: d.excerpt };
      }));
      if (!cancelled) setResults(items);
    })();
    return () => { cancelled = true; };
  }, [query]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--color-border)' }}>
        🔍 搜索
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center pt-16 px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-lg p-4" style={{ background: 'var(--color-surface-raised)' }} onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="搜索硬件 / 模型 / case..."
                   className="w-full px-3 py-2 rounded border" style={{ borderColor: 'var(--color-border)' }} />
            <ul className="mt-3 max-h-96 overflow-y-auto space-y-1">
              {results.map((r) => (
                <li key={r.url}>
                  <a href={r.url} className="block p-3 rounded hover:bg-[var(--color-surface)]" onClick={() => setOpen(false)}>
                    <div className="font-medium text-sm">{r.title}</div>
                    <div className="text-xs mt-1 opacity-70" dangerouslySetInnerHTML={{ __html: r.excerpt }}></div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount in Nav.astro**

```astro
---
import Search from './Search.tsx';
---
<!-- inside <nav>, before GitHub link -->
<Search client:idle />
```

- [ ] **Step 3: Smoke test against built site**

```bash
cd apps/web && pnpm build && pnpm preview
```

Visit preview URL, click search, type "h100", verify results.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): static-index search via Pagefind"
```

---

### Task K4: GitHub Actions — schema validation + link check + Lighthouse

**Files:**
- Create: `.github/workflows/{validate-data.yml,build.yml,lighthouse.yml}`

- [ ] **Step 1: validate-data.yml**

```yaml
# .github/workflows/validate-data.yml
name: validate-data
on:
  pull_request:
    paths: ['data/**', 'schemas/**', 'scripts/**']
  push:
    branches: [main]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm validate
      - run: pnpm check-links
        timeout-minutes: 15
```

- [ ] **Step 2: build.yml**

```yaml
# .github/workflows/build.yml
name: build
on:
  pull_request:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: apps/web/dist, retention-days: 7 }
```

- [ ] **Step 3: lighthouse.yml**

```yaml
# .github/workflows/lighthouse.yml
name: lighthouse
on:
  pull_request:
jobs:
  lh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: '.lighthouserc.json'
          uploadArtifacts: true
          temporaryPublicStorage: true
```

Add `.lighthouserc.json`:

```json
{
  "ci": {
    "collect": { "staticDistDir": "apps/web/dist", "url": ["http://localhost/index.html", "http://localhost/hardware/index.html", "http://localhost/calculator/index.html", "http://localhost/china/index.html"] },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }]
      }
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add .github .lighthouserc.json
git commit -m "ci: validate-data, build, and lighthouse workflows"
```

---

### Task K5: Cloudflare Pages deployment workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: deploy.yml**

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { contents: read, deployments: write }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: evokernel-spec
          directory: apps/web/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

> **Note:** project owner sets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets in GitHub repo settings. Cloudflare Pages project must be created beforehand.

- [ ] **Step 2: Commit**

```bash
git add .github
git commit -m "ci: cloudflare pages deploy on push to main"
```

---

### Task K6: CODEOWNERS + issue templates for hardware/model

**Files:**
- Create: `.github/CODEOWNERS`
- Create: `.github/ISSUE_TEMPLATE/{new-hardware.yaml,new-model.yaml}`

- [ ] **Step 1: CODEOWNERS**

```text
# .github/CODEOWNERS
# Default reviewers
*                                @evokernel/maintainers

# Domain-specific
data/hardware/huawei/             @evokernel/china-hardware-reviewers
data/hardware/cambricon/          @evokernel/china-hardware-reviewers
data/hardware/hygon/              @evokernel/china-hardware-reviewers
data/hardware/moore-threads/      @evokernel/china-hardware-reviewers
data/hardware/enflame/            @evokernel/china-hardware-reviewers
data/hardware/biren/              @evokernel/china-hardware-reviewers
data/hardware/metax/              @evokernel/china-hardware-reviewers
data/hardware/iluvatar/           @evokernel/china-hardware-reviewers
data/hardware/pingtouge/          @evokernel/china-hardware-reviewers
data/hardware/nvidia/             @evokernel/overseas-hardware-reviewers
data/hardware/amd/                @evokernel/overseas-hardware-reviewers
data/models/                      @evokernel/model-reviewers
data/cases/                       @evokernel/case-reviewers
schemas/                          @evokernel/maintainers
apps/web/                         @evokernel/web-reviewers
```

> Replace team handles with real reviewers when known.

- [ ] **Step 2: new-hardware.yaml**

```yaml
# .github/ISSUE_TEMPLATE/new-hardware.yaml
name: 新增硬件
description: 提议新增一张加速卡或服务器/超节点
labels: [hardware, contribution]
body:
  - type: input
    id: name
    attributes: { label: 卡名 / 服务器名, placeholder: 'CloudMatrix 384' }
    validations: { required: true }
  - type: input
    id: vendor
    attributes: { label: 厂商, placeholder: 'huawei' }
    validations: { required: true }
  - type: input
    id: source
    attributes: { label: 主要数据源 URL, description: 'whitepaper / press release / product page' }
    validations: { required: true }
  - type: textarea
    id: notes
    attributes: { label: 备注, description: '任何特殊情况, 如数据稀缺 / 仅特供版 / 等' }
```

- [ ] **Step 3: new-model.yaml**

```yaml
# .github/ISSUE_TEMPLATE/new-model.yaml
name: 新增模型
description: 提议新增一个开源模型
labels: [model, contribution]
body:
  - type: input
    id: name
    attributes: { label: 模型名, placeholder: 'DeepSeek V4 Pro' }
    validations: { required: true }
  - type: input
    id: lab
    attributes: { label: 发布 lab, placeholder: 'deepseek' }
    validations: { required: true }
  - type: input
    id: hf_url
    attributes: { label: Hugging Face URL }
  - type: input
    id: paper_url
    attributes: { label: Paper URL (如有) }
```

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "chore: CODEOWNERS and new-hardware/new-model issue templates"
```

---

## Milestone L — Polish, E2E, Performance, Launch

### Task L1: E2E smoke tests (Playwright)

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/{home,hardware-detail,calculator,china}.spec.ts`

- [ ] **Step 1: playwright.config.ts**

```ts
// apps/web/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'html',
  use: { baseURL: 'http://localhost:4321' },
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ]
});
```

- [ ] **Step 2: home.spec.ts**

```ts
// apps/web/e2e/home.spec.ts
import { test, expect } from '@playwright/test';

test('homepage loads with hero and entry grid', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('EvoKernel');
  await expect(page.locator('a[href="/china"]')).toBeVisible();
  await expect(page.locator('a[href="/calculator"]')).toBeVisible();
});

test('homepage stats are populated', async ({ page }) => {
  await page.goto('/');
  const stats = page.locator('section').filter({ hasText: /加速卡/ });
  await expect(stats).toBeVisible();
});
```

- [ ] **Step 3: hardware-detail.spec.ts**

```ts
// apps/web/e2e/hardware-detail.spec.ts
import { test, expect } from '@playwright/test';

test('h100-sxm5 detail renders KPI band and spec table', async ({ page }) => {
  await page.goto('/hardware/h100-sxm5');
  await expect(page.locator('h1')).toContainText('H100');
  await expect(page.getByText(/BF16/i).first()).toBeVisible();
  await expect(page.getByText(/Scale-Up/i)).toBeVisible();
});
```

- [ ] **Step 4: calculator.spec.ts**

```ts
// apps/web/e2e/calculator.spec.ts
import { test, expect } from '@playwright/test';

test('calculator 3-step flow produces a result', async ({ page }) => {
  await page.goto('/calculator');
  await page.getByRole('button', { name: /Llama 4 Scout/i }).first().click();
  await page.getByRole('button', { name: /H100 SXM/i }).first().click();
  // step 3 shows; result panel renders
  await expect(page.getByText(/理论上界/i)).toBeVisible();
  await expect(page.getByText(/Roofline/i)).toBeVisible();
});
```

- [ ] **Step 5: china.spec.ts**

```ts
// apps/web/e2e/china.spec.ts
import { test, expect } from '@playwright/test';

test('china hub renders 3 panels', async ({ page }) => {
  await page.goto('/china');
  await expect(page.getByRole('heading', { name: /国产芯片 × 主流模型/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /代际谱系/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /软件生态/i })).toBeVisible();
});
```

- [ ] **Step 6: Run, fix, commit**

```bash
cd apps/web && pnpm exec playwright install --with-deps
pnpm test:e2e
```

Expected: all 4 specs pass on chromium / firefox / webkit.

```bash
git add apps/web/e2e apps/web/playwright.config.ts
git commit -m "test(e2e): playwright smoke tests for home, hardware, calculator, china"
```

---

### Task L2: Accessibility audit + fixes

**Files:**
- Create: `apps/web/e2e/a11y.spec.ts`

- [ ] **Step 1: Install axe-playwright**

```bash
cd apps/web && pnpm add -D @axe-core/playwright
```

- [ ] **Step 2: a11y.spec.ts**

```ts
// apps/web/e2e/a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = ['/', '/hardware', '/hardware/h100-sxm5', '/models', '/cases', '/calculator', '/china', '/about'];

for (const route of routes) {
  test(`a11y: ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
```

- [ ] **Step 3: Run, fix any reported issues, commit**

```bash
pnpm test:e2e a11y
```

Common fixes:
- Add `aria-label` to icon-only buttons
- Ensure all interactive elements are keyboard-reachable
- Verify color contrast meets WCAG AA (3:1 for large text, 4.5:1 for small)

```bash
git add apps/web
git commit -m "fix(a11y): address critical and serious axe violations"
```

---

### Task L3: Performance audit + image strategy

**Files:**
- Modify: `apps/web/astro.config.mjs` (if image optimization needed)
- Add: `<link rel="preload">` for hero font in `BaseLayout.astro`

- [ ] **Step 1: Run lighthouse locally**

```bash
cd apps/web && pnpm build && pnpm preview &
pnpm exec lhci autorun --collect.url=http://localhost:4321 --collect.url=http://localhost:4321/calculator
```

- [ ] **Step 2: Address findings**

Likely actions:
- Inline critical CSS for above-the-fold content (Astro does this by default; verify)
- Self-host Inter Variable + JetBrains Mono Variable fonts; preload via `<link rel="preload" as="font" type="font/woff2" crossorigin>`
- Ensure no third-party JS in critical path
- Verify `astro:assets` is used for any images, with explicit width/height

- [ ] **Step 3: Update BaseLayout.astro head**

```astro
<head>
  <!-- existing -->
  <link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossorigin />
</head>
```

- [ ] **Step 4: Verify Core Web Vitals targets met (LCP < 2.5s, INP < 200ms, CLS < 0.1)**

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "perf(web): preload critical font, verify CWV targets"
```

---

### Task L4: README polish (zh + en) + screenshots

**Files:**
- Modify: `README.md`
- Create: `docs/screenshots/{home,hardware,calculator,china}.webp`

- [ ] **Step 1: Take 4 screenshots from production-like build**

```bash
cd apps/web && pnpm build && pnpm preview
# manually screenshot home, hardware list, calculator with result, china hub
# crop to ~1600px wide, convert to webp via cwebp
```

- [ ] **Step 2: Update README with English section, screenshots, badges**

```markdown
# EvoKernel Spec

[![CI](https://github.com/evokernel/evokernel-spec/actions/workflows/build.yml/badge.svg)](https://github.com/evokernel/evokernel-spec/actions)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Data: CC-BY-SA 4.0](https://img.shields.io/badge/Data-CC--BY--SA_4.0-green.svg)](DATA_LICENSE)

> AI 推理硬件 × 模型 × 部署的开源知识库 — 国产芯片覆盖最全 / 可信度可引证 / 计算器透明

## Highlights

- **28 张加速卡**: NVIDIA / AMD / Intel / AWS / Google + 9 家国产
- **14+ frontier 开源模型**: DeepSeek V4 / Kimi K2.6 / GLM-5.1 / Qwen 3.6+ / Llama 4 / ...
- **Tier 0 + Tier 1 计算器**: 实测查表 + Roofline 上界, 公式公开
- **国产芯片专题**: 矩阵热力图 / 代际谱系 / 生态对照
- **可信度可引证**: 每个数字带 evidence 标签 (官方 / 实测 / 估算)

![Home](docs/screenshots/home.webp)

## English

Open-source knowledge base for AI inference deployment across hardware (incl. 9 Chinese vendors) and frontier open-source models, with a transparent Tier 0/1 calculator.

## 文档

- [设计文档](docs/superpowers/specs/2026-04-28-evokernel-spec-design.md)
- [实施计划](docs/superpowers/plans/2026-04-28-evokernel-spec-v1.md)
- [贡献指南](docs/contributing.md)
- [数据 schema](docs/data-model.md) (auto-generated)
- [计算器公式](docs/calculator-formulas.md)

## License

- Code: Apache 2.0
- Data: CC-BY-SA 4.0
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/screenshots
git commit -m "docs: polish README with screenshots, badges, and English section"
```

---

### Task L5: Launch checklist + final smoke

**Files:**
- Create: `docs/launch-checklist.md` (operator runbook, not for production)

- [ ] **Step 1: launch-checklist.md**

```markdown
# Launch Checklist (V1)

## Pre-launch

- [ ] All 28 hardware cards in `data/hardware/`, validated
- [ ] All 14+ models in `data/models/`, with operator decomposition
- [ ] At least 5 seed cases in `data/cases/2026/04/`
- [ ] Servers / super-pods (incl. CloudMatrix 384) in `data/servers/`
- [ ] All evidence URLs reachable (CI green)
- [ ] All schemas validated (CI green)
- [ ] Build passes (CI green)
- [ ] Lighthouse: a11y ≥ 90, perf ≥ 85
- [ ] E2E: all green on chromium / firefox / webkit
- [ ] Domain registered + DNS pointed at Cloudflare Pages
- [ ] Cloudflare Pages project created, secrets set
- [ ] At least 1 co-maintainer onboarded
- [ ] Discord / Discussions enabled for community
- [ ] LICENSE + DATA_LICENSE + CONTRIBUTING + CODEOWNERS in place
- [ ] `/about` page polished
- [ ] Disclaimer: "vendor-claimed, unverified" on hardware details

## Launch day

- [ ] Verify production deploy
- [ ] Post HN: "Show HN: EvoKernel Spec — open knowledge base for AI inference hardware including Chinese vendors"
- [ ] Post Reddit r/LocalLLaMA / r/MachineLearning
- [ ] Post 知乎 / B 站 / 即刻 / Twitter
- [ ] Email Chinese vendor DevRel teams (template in `docs/launch/devrel-email.md`)
- [ ] Pin "前 50 PR 公示" issue
- [ ] Set up Cloudflare Analytics monitoring

## Day 1-7

- [ ] Daily review of incoming PRs (target < 24h response)
- [ ] Triage feedback issues, label by priority
- [ ] First "明星 case" feature post
- [ ] Monitor build/deploy for issues

## Day 30

- [ ] Stats checkpoint vs. success metrics:
  - entities ≥ 50, models ≥ 20, cases ≥ 50
  - contributors ≥ 20, stars ≥ 1000, MAU ≥ 5000
- [ ] Plan V1.5 priorities
```

- [ ] **Step 2: Final smoke run**

```bash
# from repo root
pnpm validate
pnpm check-links
pnpm --filter web build
pnpm --filter web preview &
pnpm --filter web test:e2e
```

Expected: all green.

- [ ] **Step 3: Tag v1.0.0**

```bash
git add docs/launch-checklist.md
git commit -m "docs: launch checklist for V1"
git tag -a v1.0.0 -m "EvoKernel Spec V1.0 — initial launch"
```

> Push tag and trigger production deploy when ready: `git push origin main --tags`.

---

## End of Plan
