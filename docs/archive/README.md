# Archived Documents

These files describe earlier eras of the project (v1.x and v2.x) and are kept
for historical reference. They are **NOT** authoritative for the current
state — see [`README.md`](../../README.md) and [`ROADMAP.md`](../ROADMAP.md)
in their current locations.

## Index

| File | Era | Why archived |
|---|---|---|
| `V1.2-VISION.md` | v1.2 (2025-Q4) | Vision doc from early v1 — corpus-first phase. Superseded by v3.x productized-agent vision. |
| `RELEASE-v1.2.3.md` | v1.2.3 release | Pre-GA release notes. CHANGELOG.md carries forward. |
| `RELEASE-v2.0.md` | v2.0 GA (2026-05-02) | First public-API GA. CHANGELOG.md carries forward. |
| `ROADMAP.archived-v1.5.1.md` | v1.5.1 | Already labelled "archived" — moved here in v3.24. |
| `2026-04-28-evokernel-spec-design.md` | v0 design (2026-04-28) | Original schema-first design doc. v3.x harness specs (in `docs/superpowers/specs/`) supersede the architecture sections. The schema choices here are still mostly authoritative for the data layer. |

## Why we archive instead of delete

This repo deliberately preserves the project's release history because:

1. The CHANGELOG.md references release notes by version — keeping them on disk
   means broken links don't accumulate.
2. The v0/v1/v2 design docs document **why** certain entity shapes exist —
   future schema changes need this context.
3. The Ralph-loop development pattern produces many small spec docs; pruning
   them removes the trail of decisions.

If a doc here is genuinely wrong + harmful (not just outdated), delete it
and note in CHANGELOG. Otherwise, leave it.
