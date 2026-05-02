#!/usr/bin/env tsx
/**
 * v3.18 — `pnpm agent:install` — install the EvoKernel productized agent
 * harness as a real plugin into Codex CLI or Claude Code.
 *
 * Pre-v3.18 the plugins/ directory had only markdown describing how a user
 * would integrate. v3.18 makes installation one command:
 *
 *   pnpm agent:install -- --target codex
 *     - Symlinks plugins/codex-productized/bin/evokernel-deploy → ~/.local/bin/
 *     - Writes ~/.config/evokernel/codex.json with EVOKERNEL_REPO_ROOT
 *     - Optionally appends ~/.config/codex/mcp.json with the MCP server entry
 *
 *   pnpm agent:install -- --target claude-code
 *     - Symlinks .claude/commands/agent-deploy.md → ~/.claude/commands/
 *       (so the slash command is available in any Claude Code session, not
 *       just sessions started in this repo)
 *
 *   pnpm agent:install -- --target both
 *     - Both of the above.
 *
 *   pnpm agent:install -- --target codex --dry-run
 *     - Print what would be done, take no action.
 *
 *   pnpm agent:install -- --target codex --uninstall
 *     - Reverse of install.
 */
import { mkdir, readFile, writeFile, symlink, unlink, access, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

interface Flags {
  target: 'codex' | 'claude-code' | 'both';
  dry_run: boolean;
  uninstall: boolean;
  bin_dir: string;
  cc_commands_dir: string;
}

function parseFlags(argv: string[]): Flags {
  let target: Flags['target'] = 'both';
  let dry_run = false;
  let uninstall = false;
  let bin_dir = path.join(os.homedir(), '.local/bin');
  let cc_commands_dir = path.join(os.homedir(), '.claude/commands');
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target' && argv[i + 1]) {
      const next = argv[++i];
      if (next !== 'codex' && next !== 'claude-code' && next !== 'both') {
        die(`--target must be codex | claude-code | both (got "${next}")`);
      }
      target = next as Flags['target'];
    } else if (a === '--dry-run') dry_run = true;
    else if (a === '--uninstall') uninstall = true;
    else if (a === '--bin-dir' && argv[i + 1]) bin_dir = argv[++i];
    else if (a === '--cc-commands-dir' && argv[i + 1]) cc_commands_dir = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return { target, dry_run, uninstall, bin_dir, cc_commands_dir };
}

function printHelp() {
  console.log(`agent:install — install productized agent into Codex / Claude Code

USAGE
  pnpm agent:install [-- --target <codex|claude-code|both>] [--dry-run] [--uninstall]

FLAGS
  --target <kind>       codex | claude-code | both (default: both)
  --dry-run             Print actions, take no effect.
  --uninstall           Reverse a prior install.
  --bin-dir <dir>       Where to symlink the Codex binary (default: ~/.local/bin).
  --cc-commands-dir <dir>
                        Where to symlink the Claude Code slash command
                        (default: ~/.claude/commands).

WHAT IT DOES
  Codex target:
    1. Ensures ~/.local/bin exists (or --bin-dir).
    2. Symlinks <repo>/plugins/codex-productized/bin/evokernel-deploy
       into the bin dir so 'evokernel-deploy' works system-wide.
    3. Writes ~/.config/evokernel/codex.json with EVOKERNEL_REPO_ROOT so the
       binary can find this repo from any cwd.

  Claude-Code target:
    1. Ensures ~/.claude/commands/ exists.
    2. Symlinks <repo>/.claude/commands/agent-deploy.md so /agent-deploy is
       available in any Claude Code session (not just ones started in this
       repo).

  Both: runs both of the above.
`);
}

function die(msg: string): never {
  process.stderr.write(`agent:install: ${msg}\n`);
  process.exit(2);
}

async function ensureDir(dir: string, dry_run: boolean): Promise<void> {
  if (dry_run) {
    process.stderr.write(`[dry-run] would mkdir -p ${dir}\n`);
    return;
  }
  await mkdir(dir, { recursive: true });
}

async function symlinkOrReplace(target: string, link: string, dry_run: boolean): Promise<void> {
  if (!existsSync(target)) {
    die(`source does not exist: ${target}`);
  }
  if (dry_run) {
    process.stderr.write(`[dry-run] would ln -sf ${target} ${link}\n`);
    return;
  }
  // Replace existing link/file at the target path.
  try {
    const stat = await lstat(link);
    if (stat.isSymbolicLink() || stat.isFile()) await unlink(link);
  } catch { /* missing — fine */ }
  await symlink(target, link);
}

async function unlinkIfExists(link: string, dry_run: boolean): Promise<void> {
  try {
    await access(link);
  } catch { return; }
  if (dry_run) {
    process.stderr.write(`[dry-run] would rm ${link}\n`);
    return;
  }
  await unlink(link);
}

async function writeCodexConfig(dry_run: boolean): Promise<void> {
  const cfg_dir = path.join(os.homedir(), '.config/evokernel');
  const cfg_path = path.join(cfg_dir, 'codex.json');
  await ensureDir(cfg_dir, dry_run);
  const next = { EVOKERNEL_REPO_ROOT: REPO_ROOT };
  let merged = next;
  try {
    const raw = await readFile(cfg_path, 'utf-8');
    merged = { ...JSON.parse(raw), ...next };
  } catch { /* missing — fresh write */ }
  if (dry_run) {
    process.stderr.write(`[dry-run] would write ${cfg_path} with EVOKERNEL_REPO_ROOT=${REPO_ROOT}\n`);
    return;
  }
  await writeFile(cfg_path, JSON.stringify(merged, null, 2));
}

async function installCodex(flags: Flags): Promise<void> {
  const bin_src = path.join(REPO_ROOT, 'plugins/codex-productized/bin/evokernel-deploy');
  const bin_dst = path.join(flags.bin_dir, 'evokernel-deploy');

  await ensureDir(flags.bin_dir, flags.dry_run);
  if (flags.uninstall) {
    await unlinkIfExists(bin_dst, flags.dry_run);
    process.stderr.write(`✓ Uninstalled Codex binary from ${bin_dst}\n`);
  } else {
    await symlinkOrReplace(bin_src, bin_dst, flags.dry_run);
    await writeCodexConfig(flags.dry_run);
    process.stderr.write(`✓ Installed Codex binary at ${bin_dst}\n`);
    process.stderr.write(`  Test:  ${bin_dst} --help\n`);
    process.stderr.write(`  Usage: ${bin_dst} --model <id> --hardware <id> --use-llm-orchestrator\n`);
  }
}

async function installClaudeCode(flags: Flags): Promise<void> {
  const cmd_src = path.join(REPO_ROOT, '.claude/commands/agent-deploy.md');
  const cmd_dst = path.join(flags.cc_commands_dir, 'agent-deploy.md');

  await ensureDir(flags.cc_commands_dir, flags.dry_run);
  if (flags.uninstall) {
    await unlinkIfExists(cmd_dst, flags.dry_run);
    process.stderr.write(`✓ Uninstalled Claude Code slash command from ${cmd_dst}\n`);
  } else {
    await symlinkOrReplace(cmd_src, cmd_dst, flags.dry_run);
    process.stderr.write(`✓ Installed Claude Code /agent-deploy at ${cmd_dst}\n`);
    process.stderr.write(`  Use in any Claude Code session: /agent-deploy <model> <hardware>\n`);
  }
}

async function main() {
  const flags = parseFlags(process.argv);
  if (flags.dry_run) {
    process.stderr.write(`[dry-run mode — no filesystem changes will be made]\n\n`);
  }
  process.stderr.write(`Repo: ${REPO_ROOT}\n`);
  process.stderr.write(`Action: ${flags.uninstall ? 'uninstall' : 'install'} (target: ${flags.target})\n\n`);

  if (flags.target === 'codex' || flags.target === 'both') await installCodex(flags);
  if (flags.target === 'claude-code' || flags.target === 'both') await installClaudeCode(flags);

  if (!flags.uninstall && !flags.dry_run) {
    process.stderr.write(
      `\nNext: confirm PATH includes ${flags.bin_dir} (you may need to add it to ~/.zshrc).\n`
    );
  }
}

main().catch((err) => {
  process.stderr.write(`agent:install failed: ${err.message}\n`);
  process.exit(1);
});
