# Codex CLI Integration

Use **EvoKernel Spec** as a knowledge base for OpenAI Codex CLI / similar tools.

## Option A: MCP server (recommended)

Codex CLI 0.6+ supports MCP. Add to `~/.config/codex/mcp.json`:

```json
{
  "mcpServers": {
    "evokernel-spec": {
      "command": "npx",
      "args": ["@evokernel/mcp-server"],
      "env": {
        "EVOKERNEL_API_BASE": "https://yingwen.io/evokernel-spec/api"
      }
    }
  }
}
```

Then in Codex:

```
> Plan deployment of Llama 4 Scout on MI300X for chat workload
[Codex calls evokernel_plan_deployment via MCP]
```

## Option B: Slash command shortcut

If MCP isn't yet wired in your Codex version, add a slash command. Drop the
following into `~/.config/codex/prompts/deploy.md`:

```markdown
---
name: deploy
description: Plan deployment of any HuggingFace model on any hardware
---

You are a deployment-planning assistant with access to the EvoKernel Spec
knowledge base. The user will provide a HuggingFace model id and a hardware
target. Generate a complete production-grade deployment plan.

Run this command to generate the plan:
\`\`\`bash
pnpm tsx scripts/agent-deploy/index.ts \\
  --model {{model}} \\
  --hardware {{hardware}} \\
  --workload {{workload|chat}} \\
  --output ./agent-output
\`\`\`

Then summarize:
- Recommended engine + quantization + card count
- Expected throughput + cost
- Kernel gaps (if any)
- Critical items from production-checklist.md
```

Use as: `> /deploy meta-llama/Llama-4-Scout-17B-16E h100-sxm5 chat`

## Option C: System prompt seed

Add to your Codex system prompt / context:

```
You have access to the EvoKernel Spec corpus at https://yingwen.io/evokernel-spec/
including 6 JSON API endpoints. For any deployment question, query these APIs
or run scripts/agent-deploy/index.ts in the evokernel-spec repo. Validation
matrix proves 35/35 (model × hardware) combinations work end-to-end including
4 Chinese vendors (Huawei / Cambricon / Hygon / Moore Threads / Biren).
```

## What you get

Same 13 production-grade artifacts as the MCP server / Claude Code skill paths:
deployment_plan.json, launch.sh, kernel_gaps.md, verification_plan.md,
Dockerfile, kubernetes/deployment.yaml, monitoring/prometheus-rules.yaml,
runbook.md, rollback-plan.md, provenance.json, license-audit.md,
production-checklist.md, sbom.json.

See `/agents/integrations/` for the full integration matrix.
