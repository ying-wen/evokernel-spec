# Data Tiering Policy

> The canonical rules for assigning evidence tiers in EvoKernel Spec.
> Every quantitative claim on the site carries a tier; this document
> defines what each tier means, what sources qualify, and what
> reviewers look for during PR triage.

## The Three Tiers

| Tier | Symbol | Meaning | Examples |
|---|---|---|---|
| **`official`** | 🏷 | Authoritative source from the manufacturer or governing body | Vendor whitepaper / datasheet / product page; MLPerf submission with the manufacturer's signature; a peer-reviewed paper from the manufacturer's research arm |
| **`measured`** | ✅ | Independently observed by running the workload on real hardware | A deployment case YAML with reproducible recipe; a third-party benchmark publication; a reproduced GitHub gist with logs |
| **`estimated`** | ⚠️ | Derived, inferred, or extrapolated; calibrated against reality but not directly observed | Architecture details inferred from die photos; throughput projected via Roofline against vendor-claimed peaks; cross-vendor analogy ("similar to H100 family") |

## How tiering decisions work

The tier on a given field reflects the **strongest** evidence supporting
that specific number — not the average reliability of the document it
came from.

Concrete consequences:

- A vendor product page may list 80 hardware specs. Some (`fp8_tflops`)
  are vendor-attested → `tier: official`. Others (`l2_cache_mb`) might
  be inferred from a die photo on the same page → `tier: estimated`.
  Same source, different tiers per field.
- An MLPerf submission is `tier: measured` for the exact workload it
  ran on. Citing it for an unrelated workload demotes to `estimated`.
- A 3rd-party benchmark blog with logs + reproducible code is
  `tier: measured`. The same blog without source code or logs is
  `estimated`.

## Source-type → tier matrix

This is the conservative default. PR reviewers can request elevation
if the specific evidence is unusually strong, or demotion if it's
unusually weak.

| Source type | Default tier | Notes |
|---|---|---|
| `vendor-whitepaper` | `official` | Whitepapers carry vendor-attested numbers; cite paragraph in citation. |
| `vendor-datasheet` | `official` | The narrowest-claim form. Prefer over vendor product pages. |
| `vendor-product-page` | `official` | Web pages drift; capture `accessed` date. Contradicting whitepaper → use whitepaper. |
| `vendor-press-release` | `official` for headline; `estimated` for derived | Often introduces unverifiable hero numbers. |
| `mlperf-submission` | `measured` | The benchmarks specifically submitted; not extrapolated. |
| `community-benchmark` | `measured` if reproducible | Logs + commit hash + reproduction script required. |
| `paper` | `measured` for results; `official` for claims by manufacturer's lab | Peer review ≠ peer reproduction. |
| `conference-talk` | `estimated` (default) | Slides drift; verify against transcript. |
| `third-party-review` | `estimated` (default) | Often analytical / extrapolated. |
| `other` | `estimated` (default) | Should be rare; describe in citation. |

## Discrepancy resolution

When two sources contradict for the same field:

1. **Prefer most recent** — datasheets are revised; pick the latest
   bearing the same generation.
2. **Prefer narrowest claim** — datasheet beats product page beats
   press release.
3. **Prefer measured over claimed** — a case with logs disputing a
   vendor product page wins.
4. **Document both** — the YAML can carry multiple `evidence` entries
   with explanatory `citation` fields. The site renders the highest-
   confidence one and surfaces the conflict in `/quality`.

Keep both sources cited even when one wins. Future researchers
benefit from seeing the contested point.

## What about Chinese vendor specs?

Many Chinese accelerators (Ascend, MUSA, BIRENSUPA, etc.) lack the
vendor-whitepaper tier of disclosure that NVIDIA / AMD provide. Their
data tends to come from:

- Press releases (`vendor-press-release` → tier varies)
- Conference talks (`conference-talk` → `estimated` default)
- Government procurement documents (rare; `other` + citation)
- Reverse-engineering reports (`third-party-review` → `estimated`)

This is **not** a quality problem with the data — it's a transparency
gap that downstream evidence (`measured` cases) closes over time. The
Calibration Map automatically narrows the gap as more cases land.

If you're a Chinese vendor reading this: open a PR upgrading any
`tier: estimated` field on your products to `tier: official` with a
whitepaper or datasheet citation. Same review process, same standard.

## When to demote a tier

Reviewers downgrade tiers when:

- The cited URL no longer renders or lacks the claim (use the weekly
  `check-evidence-links.yml` cron — broken links auto-create issues).
- The claim is at odds with measured cases (gap >30% triggers demotion
  of the `official` claim to `estimated` until reconciled).
- The vendor's own subsequent disclosure contradicts an earlier one.

When to elevate:

- An independent reproduction of a `tier: estimated` claim makes it
  `tier: measured`.
- A vendor whitepaper publishes a number that was previously
  inferred — the YAML evidence list grows; tier on the field
  upgrades.

## How this interacts with the Calculator

- **Tier 0** (case lookup) uses ONLY `tier: measured` cases.
- **Tier 1** (Roofline upper bound) accepts any tier; lower-tier
  inputs surface a yellow warning band.
- **Calibration map** weights cases by reproduction count — see
  `apps/web/src/lib/calculator/calibration.ts`.

## How this interacts with `/quality`

The `/quality` dashboard shows live tier distribution per entity
type. A healthy corpus has a long tail of `official` (broad coverage),
a healthy middle of `measured` (deep verification), and `estimated` only
where unavoidable (announced-not-shipped products, China specs).

If the `estimated` fraction creeps above 25% for any entity class,
treat it as a **data debt** signal and prioritize closing the gap in
the next release.

## See also

- [CONTRIBUTING.md](../CONTRIBUTING.md) — DCO, PR flow, bilingual norms
- [docs/DEVELOPMENT.md](DEVELOPMENT.md) — schema layout, recipes for
  adding hardware/models/cases
- [SECURITY.md](../SECURITY.md) — reporting tier-fraud (false `official`
  claims) as integrity bugs
