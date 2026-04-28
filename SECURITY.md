# Security Policy

## Reporting a Vulnerability

EvoKernel Spec is a fully static site (no server-side runtime, no
database, no user accounts). The attack surface is correspondingly
narrow, but please still report any concern privately rather than
filing a public issue.

**Where to send:** Open a [private security advisory](https://github.com/evokernel/evokernel-spec/security/advisories/new)
on GitHub. Do **NOT** open a public issue for security concerns.

We aim to:
- Acknowledge within **72 hours**.
- Triage within **7 days**.
- Patch CRITICAL findings within **14 days** of triage.

## Scope

In scope (we want to know):

- **XSS or HTML injection** in any user-facing route. All YAML
  user-supplied content is rendered through Astro's escape semantics, but
  if you find a way to bypass that, report it.
- **Data integrity attacks** — e.g. a YAML file in `data/` that breaks
  the build but isn't caught by `pnpm validate`. We treat
  validate-bypass as a security-adjacent issue because it lets bad
  data ship.
- **Supply-chain concerns** — known-vulnerable transitive deps where
  upgrading is non-trivial. We run Dependabot / `pnpm audit` but
  fast-track manual reports.
- **Spoofed `evidence` citations** — if you can submit a PR where a
  `tier: official` claim points at a URL that doesn't say what the
  citation claims, that's an integrity bug.

Out of scope:

- DoS via "submit a 100,000-row YAML file" — we have file-size and
  schema bounds; pathological inputs are caught at validate time.
- Hosted infrastructure (Cloudflare Pages, GitHub Pages) — those have
  their own bug bounty programs.
- Issues only reproducible in development mode (`pnpm dev`).

## Secrets

We don't ship secrets. The site is static and stateless. If you find a
hardcoded credential, API key, or token, that's a P0 — please report
immediately.

## Crypto / hashing

The offline tarball ships with a sha256 sidecar. Verify before unpacking:

```bash
sha256sum -c evokernel-spec-vX.Y.Z.tar.gz.sha256
```

Anything failing that check should NOT be unpacked or served — open a
GitHub Issue with the corrupted artifact's full filename and your
download source.

## Disclosure timeline

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure).
After a patch ships, we publish a CVE-style note in the next release's
notes. Reporters who request credit get acknowledged in
`docs/SECURITY-CREDITS.md`.

## Out-of-band contact

If GitHub Security Advisories are unavailable to you (e.g. you don't
have a GitHub account), email the maintainers via the address listed
in [README.md](README.md). Encrypt with the maintainer's public key if
the issue warrants it.
