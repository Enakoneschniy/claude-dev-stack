# Phase 39: /cds-quick Demo & Alpha Release - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 23 new/modified files
**Analogs found:** 19/23 (most files have direct Phase 33-38 analogs; 4 net-new files are bundler + migration guide + release-notes template + cds-quick skill)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tsup.config.ts` | config | build-time | none (first bundler in repo) | no analog — RESEARCH §Pattern 1 |
| `package.json` (root — modified) | config | — | itself (existing) | exact |
| `package.json` (root — scripts) | config | — | existing `scripts` object | partial |
| `bin/cli.mjs` | entrypoint | request-dispatch | itself (existing — add `case 'quick':`, update `case 'mcp':` + `case 'migrate':` imports) | partial |
| `packages/cds-cli/src/quick.ts` | business | request-response | `packages/cds-migrate/src/cli.ts` (Phase 38 `case 'migrate':` pattern) | exact |
| `packages/cds-cli/src/quick.test.ts` | test | request-response | `packages/cds-migrate/src/cli.test.ts` | exact |
| `packages/cds-cli/src/quick.integration.test.ts` | test | request-response | `packages/cds-migrate/src/sessions-md-to-sqlite.integration.test.ts` | exact |
| `packages/cds-cli/tests/fixtures/synthetic-transcript.jsonl` | fixture | — | `packages/cds-migrate/tests/fixtures/backfill/*.md` | partial |
| `packages/cds-cli/tests/helpers/mock-dispatch-agent.ts` | helper | — | `packages/cds-migrate/tests/helpers/mock-dispatch-agent.ts` (Phase 38) | exact |
| `packages/cds-cli/tests/helpers/temp-home.ts` | helper | — | `packages/cds-migrate/tests/helpers/temp-vault.ts` | partial |
| `skills/cds-quick/SKILL.md` | skill | user-facing | `.claude/skills/dev-research/SKILL.md` (existing) | partial |
| `docs/migration-v0-to-v1-alpha.md` | docs | — | none (first migration guide) | no analog — RESEARCH §Pattern 7 |
| `docs/release-notes-template.md` | docs | — | none (first release template) | no analog — CONTEXT D-123 |
| `CHANGELOG.md` | docs | — | none (first CHANGELOG) | no analog — RESEARCH §Pattern 7 |
| `lib/install/hooks.mjs` | wizard | — | existing (modified in-place for D-121) | exact |
| `lib/install/node-check.mjs` | wizard | — | `lib/install/hooks.mjs` (similar installer pattern) | partial |
| `bin/install.mjs` | wizard | pipeline | existing (add nodeCheck call before other steps) | exact |
| `.github/workflows/publish.yml` | config | event-driven | itself (existing — replaced per D-124) | exact |
| `tests/tsup-config.test.mjs` | test | — | `tests/cli-mcp-dispatch.test.mjs` (Phase 37 YAML-file shape test) | partial |
| `tests/tsup-build.test.mjs` | test | build-time | Phase 33 `tests/monorepo-structure.test.mjs` (similar structural assertion pattern) | partial |
| `tests/version-bump.test.mjs` | test | — | `tests/detect.test.mjs` package.json reading | partial |
| `tests/pack-size.test.mjs` | test | — | none — new pattern | no analog — RESEARCH §Pattern 6 |
| `tests/pack-files-array.test.mjs` | test | — | `tests/detect.test.mjs` package.json reading | partial |
| `tests/publish-workflow.test.mjs` | test | — | `tests/cli-mcp-dispatch.test.mjs` (yaml/structural assertion) | partial |
| `tests/cli-dispatch.test.mjs` | test | — | `tests/cli-mcp-dispatch.test.mjs` (Phase 37), extend | exact |
| `tests/node-version-scan.test.mjs` | test | — | none — new pattern | partial |
| `tests/skill-cds-quick.test.mjs` | test | — | `tests/hooks.test.mjs` (structural YAML check) | partial |
| `tests/migration-guide.test.mjs` | test | — | none — new pattern | partial |
| `tests/install-node-check.test.mjs` | test | — | `tests/install.test.mjs` (wizard flow mock) | partial |
| `tests/install-hook-migration.test.mjs` | test | — | `tests/hooks.test.mjs` (hook-entry idempotency) | exact |
| `tests/changelog.test.mjs` | test | — | none — simple content check | partial |
| `tests/release-notes-template.test.mjs` | test | — | none — simple content check | partial |

---

## Pattern Assignments

### `tsup.config.ts` (new config — no codebase analog)

**Analog:** none
**Source:** RESEARCH.md §Pattern 1

**Complete file pattern** (enforced literally by Plan 01 task 1):

```ts
// tsup.config.ts
// Source: RESEARCH.md §Pattern 1 — https://tsup.egoist.dev
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'core/index': 'packages/cds-core/src/index.ts',
    'cli/index': 'packages/cds-cli/src/index.ts',
    'cli/quick': 'packages/cds-cli/src/quick.ts',
    'cli/mcp-server': 'packages/cds-cli/src/mcp-server.ts',
    'migrate/index': 'packages/cds-migrate/src/index.ts',
    'migrate/cli': 'packages/cds-migrate/src/cli.ts',
  },
  format: ['esm'],
  target: 'node20',
  external: [
    'better-sqlite3',
    '@anthropic-ai/claude-agent-sdk',
    '@modelcontextprotocol/sdk',
  ],
  dts: true,
  clean: true,
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: false,
});
```

---

### `packages/cds-cli/src/quick.ts` (Phase 38 cli.ts analog)

**Analog:** `packages/cds-migrate/src/cli.ts` (Phase 38, to-be-created)
**Why match:** same dual-invocation pattern (called from `bin/cli.mjs` via dynamic import, exports `main(args: string[]): Promise<void>`, reads env for session_id threading, formats output for TTY vs piped).

**Shared shape:**

```ts
// packages/cds-cli/src/quick.ts
// Analog: packages/cds-migrate/src/cli.ts §main
import { dispatchAgent, CostTracker } from '@cds/core';
import crypto from 'node:crypto';
import { captureStandalone } from './capture-standalone.js';

export interface QuickFlags {
  json: boolean;
  model: string;
  maxCost?: number;
}

export function parseFlags(args: string[]): QuickFlags {
  return {
    json: args.includes('--json'),
    model: extractValue(args, '--model') ?? 'haiku',
    maxCost: extractValue(args, '--max-cost') ? Number(extractValue(args, '--max-cost')) : undefined,
  };
}

function extractValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
}

function printUsage(): void {
  console.error(`Usage: claude-dev-stack quick "<task>" [--json] [--model haiku|sonnet|opus] [--max-cost $N]`);
}

export async function main(args: string[]): Promise<void> {
  const task = args[0];
  if (!task || task.startsWith('-')) { printUsage(); process.exit(1); }
  const opts = parseFlags(args.slice(1));

  const sessionId = process.env.CLAUDE_SESSION_ID ?? crypto.randomUUID();
  const tracker = new CostTracker(sessionId);

  let result: { output: string; tokens: { input: number; output: number } };
  try {
    result = await dispatchAgent({ model: opts.model, prompt: task, session_id: sessionId });
    tracker.record({ model: opts.model, tokens: result.tokens });
  } catch (err: any) {
    console.error(`dispatch error: ${err?.message ?? err}`);
    process.exit(1);
  }

  if (!process.env.CLAUDE_SESSION_ID) {
    await captureStandalone({ task, output: result.output, sessionId, projectPath: process.cwd() });
  }

  const cost = tracker.total();
  if (opts.json) {
    console.log(JSON.stringify({ output: result.output, cost, sessionId }));
  } else {
    console.log(result.output);
    console.log(`\n── cost: $${cost.cost_usd.toFixed(4)} · session: ${sessionId}`);
  }
}
```

The `captureStandalone` helper is a sibling module `packages/cds-cli/src/capture-standalone.ts` — extracted because it's testable in isolation.

---

### `packages/cds-cli/src/capture-standalone.ts` (new helper — synthesizes transcript)

**Analog:** Phase 36 transcript-writer inverse operation
**Source:** RESEARCH.md §Pattern 5 + CONTEXT D-113

```ts
// packages/cds-cli/src/capture-standalone.ts
// Writes a synthetic transcript + fires session-end-capture.sh detached.
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface StandaloneParams {
  task: string;
  output: string;
  sessionId: string;
  projectPath: string;
}

export async function captureStandalone(p: StandaloneParams): Promise<void> {
  // Derive Claude-Code-style project slug (dashes-for-slashes, same as Phase 36 D-60)
  const slug = p.projectPath.replaceAll(path.sep, '-').replace(/^-/, '');
  const transcriptDir = path.join(homedir(), '.claude', 'projects', slug);
  const transcriptPath = path.join(transcriptDir, `${p.sessionId}.jsonl`);

  await mkdir(transcriptDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: 'user', uuid: 'u1', session_id: p.sessionId, content: { role: 'user', content: [{ type: 'text', text: p.task }] } }),
    JSON.stringify({ type: 'assistant', uuid: 'a1', session_id: p.sessionId, content: { role: 'assistant', content: [{ type: 'text', text: p.output }] } }),
  ];
  await writeFile(transcriptPath, lines.join('\n') + '\n', 'utf8');

  // Spawn session-end-capture.sh detached; fail-silent per Phase 36 D-66
  const hookScript = path.join(homedir(), '.claude', 'hooks', 'session-end-capture.sh');
  const child = spawn(hookScript, [], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: p.sessionId,
      CLAUDE_PROJECT_DIR: p.projectPath,
    },
  });
  child.unref();
}
```

---

### `bin/cli.mjs` dispatch update (modify in-place)

**Analog:** existing `bin/cli.mjs` — Phase 37 planned the `case 'mcp':` update; Phase 38 planned `case 'migrate':`. Phase 39 consolidates paths to `dist/*/*.js` layout.

**Key modifications** (Plan 01 task 5):

```js
// Helper added at top of cli.mjs
function resolveDistPath(subPath) {
  const devRoot = process.env.CDS_DEV === '1'
    ? path.join(__dirname, '..', 'packages', 'cds-' + subPath.split('/')[0], 'dist')
    : path.join(__dirname, '..', 'dist', subPath.split('/')[0]);
  return path.join(devRoot, subPath.split('/').slice(1).join('/'));
}

// Replace Phase 37's case 'mcp':
case 'mcp': {
  if (args[1] === 'serve') {
    const mcp = await import(resolveDistPath('cli/mcp-server.js'));
    await mcp.main(args.slice(2));
  } else {
    const { main } = await import('../lib/mcp.mjs');
    await main(args.slice(1));
  }
  break;
}

// Replace Phase 38's case 'migrate':
case 'migrate': {
  const migrate = await import(resolveDistPath('migrate/cli.js'));
  await migrate.main(args.slice(1));
  break;
}

// New case 'quick':
case 'quick': {
  const quick = await import(resolveDistPath('cli/quick.js'));
  await quick.main(args.slice(1));
  break;
}
```

Plus at the TOP of the file, add `__dirname` derivation:

```js
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

---

### `skills/cds-quick/SKILL.md` (analog: `.claude/skills/dev-research/SKILL.md`)

**Analog:** existing `dev-research` skill — same pattern (frontmatter + description + trigger phrases + body calling a CLI).

**Shape:**

```markdown
---
name: cds-quick
description: |
  Run a quick one-shot task via Claude Agent SDK and auto-capture the session to SQLite.
  Invokes: claude-dev-stack quick "<task>" --json
  Returns: structured result + cost + session ID.
trigger_phrases:
  - /cds-quick
  - cds-quick
  - quick task:
---

# /cds-quick — One-shot agent dispatch with cost reporting

Task: `$ARGUMENTS`

Run the quick CLI and display its JSON output:

```bash
claude-dev-stack quick "$ARGUMENTS" --json
```

Parse the JSON. Fields:
- `output`: agent's text response — display verbatim
- `cost`: `{ cost_usd: number, tokens: { input: number, output: number } }` — format as `── cost: $X.XXXX · input N tokens · output M tokens`
- `sessionId`: UUID — display as `session: <uuid>`

After printing, the Claude Code Stop hook auto-captures the session into SQLite.
For multi-turn work, use Claude Code normally instead of /cds-quick.
```

---

### `.github/workflows/publish.yml` (modify in-place)

**Analog:** existing workflow (v0.12 era) — already has OIDC + provenance. Phase 39 adds prerelease-detection + tsup build + smoke-install.

**Full replacement:**

```yaml
name: Publish to npm

on:
  release:
    types: [published]

permissions:
  id-token: write
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v5
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Build bundles
        run: pnpm tsup

      - name: Run tests
        run: pnpm test

      - name: Verify tarball size (<5MB)
        run: |
          pnpm pack --json > /tmp/pack.json
          SIZE=$(node -e 'const d=require("/tmp/pack.json");console.log(d[0].size)')
          if [ "$SIZE" -gt 5242880 ]; then
            echo "Tarball $SIZE bytes exceeds 5 MB budget"
            exit 1
          fi
          echo "Tarball size OK: $SIZE bytes"

      - name: Smoke install test
        run: |
          npm pack
          npm install -g ./claude-dev-stack-1.0.0-alpha.1.tgz
          claude-dev-stack --version | grep -q '1.0.0-alpha.1'

      - name: Detect dist-tag (prerelease → alpha, stable → latest)
        id: meta
        run: |
          if [ "${{ github.event.release.prerelease }}" = "true" ]; then
            echo "tag=alpha" >> "$GITHUB_OUTPUT"
          else
            echo "tag=latest" >> "$GITHUB_OUTPUT"
          fi

      - name: Publish with OIDC + provenance
        run: npm publish --tag ${{ steps.meta.outputs.tag }} --access public --provenance
```

---

### `docs/migration-v0-to-v1-alpha.md` (new — RESEARCH §Pattern 7 reference)

**Shape** (3 required sections per D-120):

```markdown
# Migration Guide: claude-dev-stack v0.12.x → v1.0.0-alpha.1

## Quick checklist

- [ ] Node version is 20 or higher (`node --version`). Node 18 is not supported.
- [ ] Install: `npm install -g claude-dev-stack@alpha`
- [ ] Re-run the wizard on each project: `cd <project> && claude-dev-stack`
- [ ] Expect one-time Stop hook replacement (wizard prompts for confirmation).
- [ ] Expect new MCP entry `cds` in `.claude/settings.json` under `mcp.servers`.
- [ ] Optional: `claude-dev-stack migrate sessions --dry-run` to preview backfill of past sessions into SQLite.

## Breaking Changes

### Node 18 → Node 20+

**What changed:** minimum Node is now 20. `package.json` has `"engines": { "node": ">=20" }`.

**Why:** Node 18 reached EOL April 2025. `better-sqlite3` 12.x requires Node 20+ for N-API 9 prebuilds.

**What to do:**
- Upgrade Node via `nvm install 20 && nvm use 20` (macOS/Linux) or the Node installer (Windows).
- If you cannot upgrade, stay on `claude-dev-stack@0.12.x` (which remains `@latest` on npm).

### Stop hook: `session-end-check.sh` → `session-end-capture.sh`

**What changed:** the old manual-/end Stop hook is replaced by an auto-capture hook that writes session observations to SQLite.

**Why:** The `/end` skill was a fallback workaround for v0.12's limited session memory. v1.0 captures every session automatically.

**What to do:**
- The install wizard detects the old registration and prompts you to replace it.
- Your custom additions to the old hook (if any) are NOT carried over — the wizard shows a warning. Review manually.
- Use `/end` only as a fallback if auto-capture fails (it logs to `~/.claude/cds-capture.log`).

### New MCP server registration: `mcp.servers.cds`

**What changed:** each project's `.claude/settings.json` gets a new `mcp.servers.cds` entry that the wizard writes.

**Why:** enables `sessions.search`, `sessions.timeline`, `sessions.get_observations`, `docs.search`, and `planning.status` MCP tools in Claude Code.

**What to do:**
- Run `claude-dev-stack` in each project to register. The wizard is idempotent.

### New runtime dependencies

**What changed:** v1.0 adds three deps to `package.json`: `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`.

**Why:** SQLite persistence (SEED-004), SDK-based agent dispatch (replaces `claude -p` subprocess), MCP protocol exposure.

**What to do:**
- First install compiles `better-sqlite3` native bindings. Prebuilds cover macOS (arm64/x64), Linux (x64), Windows (x64) on Node 20/22. If your platform lacks a prebuild, install `python3` + `make` + C++ toolchain.
- The single-dep constraint from v0.12 PROJECT.md is relaxed for v1.0 — these three are infrastructure, not user-facing.

### `/end` skill is fallback-only

**What changed:** `skills/session-manager/SKILL.md` description is narrower; `/end` no longer auto-invokes on "done"/"хватит"/etc.

**Why:** auto-capture covers routine usage; `/end` remains for forced captures.

**What to do:** nothing — behavior change is transparent. Invoke `/end` explicitly if auto-capture fails.

## Rollback

To revert to v0.12.x:

```sh
npm install -g claude-dev-stack@latest
```

This installs the last `@latest`-tagged version (0.12.x). Then:

1. Re-run the wizard on each project to remove v1.0 MCP entries (optional — harmless if left).
2. Your markdown sessions under `~/vault/projects/*/sessions/*.md` are intact — SQLite was derived from them.
3. If the SQLite file (`~/vault/projects/*/sessions.db`) was created, you can delete it safely; v0.12.x does not read it.

## Feedback

Alpha caveats:
- Auto-capture is the canonical session writer; manual `/end` is fallback only.
- MCP tools are new — filing issues at https://github.com/Enakoneschniy/claude-dev-stack/issues is appreciated.
- Migration command `claude-dev-stack migrate sessions` has a `--dry-run` mode — always use it first to estimate cost (~$0.01 per session).
```

---

## Completeness Check

- [x] All files in CONTEXT.md `<canonical_refs>` New Files list have an analog or explicit RESEARCH reference.
- [x] All existing files in CONTEXT.md `Existing Files (Phase 39 modifies)` have an exact analog (themselves).
- [x] Each pattern section cites the source (RESEARCH/CONTEXT decision) for traceability.
- [x] Test files map to Phase 37/38 analog tests where possible; net-new tests (`pack-size`, `migration-guide`) have explicit shape guidance.

## PATTERN MAPPING COMPLETE
