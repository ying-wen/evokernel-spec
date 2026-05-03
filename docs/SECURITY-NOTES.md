# Security Notes — What NEVER goes into the public repo

> Contributor convention. Read before adding test hosts, deploy targets,
> or anything that contacts a private machine.

This is a public open-source repo. Anything committed here is mirrored to
GitHub forks, archived by the Wayback Machine, ingested by training datasets,
and indexed by GitHub code search within hours. Treat **every commit as
permanently public**.

## Never commit (hard rules)

| Category | Examples | Where to put it instead |
|---|---|---|
| **Real API keys** | `sk-ant-...`, `OPENAI_API_KEY=sk-...`, HF tokens, GH PATs, AWS access keys, GCP service-account JSONs | `~/.config/evokernel/secrets.json` (git-ignored) or env vars set in your shell, NEVER in repo files |
| **Real SSH host IPs / hostnames** for private test machines | `root@10.x.x.x`, `user@private-cluster-1.example.com`, `1.95.x.x` | `~/.config/evokernel/targets.yaml` (git-ignored). Use `<ASCEND_910B_HOST>` / `<your-host>` placeholders in docs. |
| **Real database/queue/cache URLs** with credentials | `postgres://user:pw@host/db`, `redis://...` | `.env` (git-ignored) |
| **PII in agent-learnings or test fixtures** | real user emails, real customer kernels, internal-product names | sanitize before committing |
| **Internal-only doc snippets** that name a private repo or service | "see internal repo X" | extract just the technical content; drop the internal reference |
| **Generated deploy artifacts / local worktrees** | `out/<run>/`, `agent-deploy-output/<run>/`, `.claude/worktrees/` | Keep local. Commit only reviewed corpus updates such as sanitized `data/agent-learnings/*.yaml`. |

## Placeholder conventions in docs

When a doc needs to **describe** an SSH/host/target without giving the actual identity:

```yaml
# good — uses placeholder
- id: ascend-910b-test
  hardware: ascend-910b
  ssh: root@<ASCEND_910B_HOST>      # real host in ~/.config/evokernel/targets.yaml
  toolchain:
    cann_version: 8.0.RC1

# bad — leaks real IP/host
- id: ascend-910b-test
  hardware: ascend-910b
  ssh: root@<REAL_PRIVATE_IP>       # NEVER
```

Common placeholders:
- `<ASCEND_910B_HOST>` / `<H100_HOST>` / `<MI300X_HOST>` for SSH targets
- `sk-ant-...` / `sk-...` / `hf_...` (with literal `...` ellipsis) for API key shape examples
- `<your-org>` / `<your-cluster>` for organization-specific names

## Pre-commit checks

Before staging:

```bash
# Quick scan for IP-shaped content + common API key prefixes
git diff --staged | grep -E '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b|sk-(ant|proj|live)-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{30,}|hf_[A-Za-z0-9]{30,}'
```

If the grep matches **anything** that isn't a placeholder shape (literal `sk-ant-...`
with the ellipsis, or 0.0.0.0 / 127.0.0.1 / 192.168.x.x ranges in docs), STOP
and replace before committing.

## What if a real secret already landed in a commit

1. **Do not** simply remove it in a follow-up commit — it's still in git history.
2. Rotate the secret immediately (kill the API key, change the SSH key on the host, etc.).
3. Use `git filter-branch` or `git filter-repo` to scrub from local history.
4. Force-push (with team coordination) — but assume any forks already mirrored the secret.

The cheapest fix is **never let it land in the first place**.

## Reporting suspected leakage

If you spot a leaked secret in this repo's history or anywhere downstream
(forks, cached pages, etc.), open a private security advisory rather than a
public issue — see [`SECURITY.md`](../SECURITY.md).

## What this project does NOT collect

The harness is **client-side only**. It:
- Does not send your code to any external service except (optionally) the
  host LLM inside Codex/Claude Code or the Anthropic API in standalone
  real-mode (you must explicitly opt into those paths).
- Does not phone home — no telemetry, no usage analytics.
- Does not store SSH credentials (it reads `~/.ssh/config` but never copies keys).
- Does not log API responses to disk by default (cache mode under
  `EVOKERNEL_OFFLINE_ONLY=true` writes only the **prompt hash**, not the prompt
  contents, by design).

If you discover an exception to any of the above, that's a bug — please report it.
