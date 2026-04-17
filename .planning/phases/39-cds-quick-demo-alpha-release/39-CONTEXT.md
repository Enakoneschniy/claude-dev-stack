# Phase 39: /cds-quick Demo & Alpha Release - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning (FINAL phase of v1.0 milestone)

<domain>
## Phase Boundary

Prove the full v1.0 pipeline end-to-end with a user-facing demo (`/cds-quick`) and ship `claude-dev-stack@1.0.0-alpha.1` to npm under the `alpha` tag so existing v0.12.x users on `@latest` are not disrupted.

**Deliverables:**
1. **`/cds-quick` Claude Code skill** (`skills/cds-quick/SKILL.md`) — takes one-line task description, orchestrates the full write-and-read pipeline: dispatchAgent → session capture to SQLite → summary + cost output.
2. **`claude-dev-stack quick 'task'` CLI subcommand** — standalone runner for use outside Claude Code (triggers capture manually since there's no Claude Code Stop hook to fire in a standalone invocation).
3. **`bin/cli.mjs` surgical addition** — `case 'quick':` routes to `packages/cds-cli/dist/quick.js`.
4. **`packages/cds-cli/src/quick.ts`** — shared logic used by both the skill and CLI subcommand; handles dispatch, capture, output formatting.
5. **tsup bundler configuration** — `tsup.config.ts` at repo root. Bundles @cds/core, @cds/cli, @cds/migrate, @cds/s3-backend into root `dist/` with `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk` marked external. Root `package.json` adds those as real `dependencies`.
6. **`.github/workflows/publish.yml` update** — detects prerelease via `github.event.release.prerelease == true`, runs `npm publish --tag alpha --provenance` for prereleases, else `--tag latest`. OIDC preserved.
7. **`docs/migration-v0-to-v1-alpha.md`** — tiered guide: quick checklist + breaking change detail + rollback instructions.
8. **Wizard warnings** — install flow detects Node version + MCP server registration drift + hook registration drift, prints actionable messages.
9. **GitHub release draft** — manual release notes linking migration guide + alpha caveats (auto-capture canonical writer, `/end` skill = fallback).
10. **Root `package.json` bumps** — `"version": "1.0.0-alpha.1"`, `"engines": { "node": ">=20" }` (from Phase 35 D-33), add bundled-dep `"dependencies"` for externals, update `"files"` to include `dist/` (from bundler) and remove raw `packages/` from tarball.

**Explicitly NOT in scope for Phase 39:**
- npm deprecation of v0.12.x (stays published, users opt in to alpha explicitly)
- Automated publish on version-field-contains-alpha (uses GitHub prerelease flag instead — more controllable)
- `/cds-quick` streaming output (full-buffer in v1.0; streaming variant deferred per Phase 34 D-19)
- Cross-platform smoke tests beyond macOS + Linux × Node 20/22 (Windows deferred to v1.1+)

</domain>

<decisions>
## Implementation Decisions

### `/cds-quick` Design (D-110 … D-114)
- **D-110:** **Dual entry** — `skills/cds-quick/SKILL.md` (auto-invokes inside Claude Code on `/cds-quick`, `cds-quick`, "quick task" triggers) AND `claude-dev-stack quick 'task'` CLI subcommand (standalone). Both paths converge on `packages/cds-cli/src/quick.ts`.
- **D-111:** **Skill body orchestration:**
  1. Parse user task from skill args (slash-command style)
  2. Call `claude-dev-stack quick '<task>' --json` via `!` prefix or inline Bash tool
  3. Display the JSON result as a pretty summary block (observation count, cost, sessionId, top 3 observations)
  4. Session capture happens via the normal Phase 36 Stop hook when Claude Code session exits — skill does NOT trigger capture manually from within Claude Code.
- **D-112:** **CLI body (`packages/cds-cli/src/quick.ts`):**
  ```ts
  export async function main(args: string[]): Promise<void> {
    const task = args[0];
    if (!task) { printUsage(); process.exit(1); }
    const opts = parseFlags(args);  // --json, --model, --max-cost

    const sessionId = process.env.CLAUDE_SESSION_ID ?? crypto.randomUUID();
    const tracker = new CostTracker(sessionId);
    const result = await dispatchAgent({ model: opts.model ?? 'haiku', prompt: task, session_id: sessionId });
    tracker.record({ model: 'haiku', tokens: result.tokens });

    // Standalone mode: no Claude Code Stop hook will fire. Trigger capture manually.
    if (!process.env.CLAUDE_SESSION_ID) {
      await captureStandalone({ task, result, sessionId, projectPath: process.cwd() });
    }

    if (opts.json) {
      console.log(JSON.stringify({ output: result.output, cost: tracker.total(), sessionId }));
    } else {
      console.log(result.output);
      console.log(`\n── cost: $${tracker.total().cost_usd.toFixed(4)} · session: ${sessionId}`);
    }
  }
  ```
- **D-113:** **Standalone capture** (`captureStandalone`) — spawns the same `hooks/session-end-capture.sh` detached wrapper from Phase 36 with env `CLAUDE_SESSION_ID=${sessionId}` + `CLAUDE_PROJECT_DIR=${projectPath}` + a synthetic transcript written to `/tmp/cds-quick-{sessionId}.jsonl` containing the task + agent output as 2 messages. Wrapper fires, Node script ingests the synthetic transcript. Fail-silent inherited from Phase 36.
- **D-114:** **`/cds-quick` deliberately uses `dispatchAgent` directly** (not a full multi-turn agent loop). One shot, one response. If user needs multi-turn, they use Claude Code normally. This keeps the demo tight and the alpha pipeline validation clean.

### Bundler & Distribution (D-115 … D-119)
- **D-115:** **tsup** is the bundler. `tsup.config.ts` at repo root:
  ```ts
  import { defineConfig } from 'tsup';
  export default defineConfig({
    entry: {
      'core/index': 'packages/cds-core/src/index.ts',
      'cli/index': 'packages/cds-cli/src/index.ts',
      'migrate/index': 'packages/cds-migrate/src/index.ts',
      // cds-s3-backend included only if non-empty at Phase 39 time
    },
    format: ['esm'],
    target: 'node20',
    external: ['better-sqlite3', '@anthropic-ai/claude-agent-sdk', '@modelcontextprotocol/sdk'],
    dts: true,
    clean: true,
    outDir: 'dist',
    splitting: false,
  });
  ```
- **D-116:** **External deps in root `package.json`:**
  ```json
  {
    "dependencies": {
      "prompts": "^2.4.2",
      "better-sqlite3": "^12.9.0",
      "@anthropic-ai/claude-agent-sdk": "^0.2.110",
      "@modelcontextprotocol/sdk": "^1.29.0"
    }
  }
  ```
  The single-dep constraint from PROJECT.md is relaxed for v1.0: `prompts` covers the CLI's interactive surface; the three new deps are internal infrastructure required for core capability (SQLite persistence, SDK agent dispatch, MCP protocol). Document the relaxation in the migration guide.
- **D-117:** **`"files"` array update:**
  ```json
  {
    "files": [
      "bin/",
      "dist/",
      "hooks/",
      "lib/",
      "patches/",
      "skills/",
      "templates/",
      "README.md",
      "LICENSE",
      "NOTICES.md"
    ]
  }
  ```
  `lib/` still ships unchanged (root feature modules, per Phase 33 D-01). `dist/` ships bundled packages. `packages/` is NOT in `"files"` — source lives in workspaces but bundled output is what users consume.
- **D-118:** **bin/cli.mjs imports** update from `packages/cds-*/dist/` to `dist/cli/` etc.:
  ```js
  case 'mcp': {
    const mcp = await import(path.join(__dirname, '..', 'dist', 'cli', 'mcp-server.js'));
    await mcp.main(args);
    break;
  }
  case 'migrate': {
    const migrate = await import(path.join(__dirname, '..', 'dist', 'migrate', 'cli.js'));
    await migrate.main(args);
    break;
  }
  case 'quick': {
    const quick = await import(path.join(__dirname, '..', 'dist', 'cli', 'quick.js'));
    await quick.main(args);
    break;
  }
  ```
  In dev (pnpm workspace), an env var `CDS_DEV=1` switches imports back to `packages/cds-*/dist/` for faster iteration without repeat bundling. Planner implements as single `resolveDistPath(subPath)` helper.
- **D-119:** **Tarball target size: < 5 MB** unpacked. `pnpm pack --dry-run` in CI asserts size budget. If exceeded, build fails — forces investigation before release.

### Migration Guide & Breaking Change Communication (D-120 … D-123)
- **D-120:** **`docs/migration-v0-to-v1-alpha.md` structure** (3 sections):
  1. **Quick checklist (top of doc, < 2 min read):** 6 bullets — Node 20+, `npm install claude-dev-stack@alpha`, re-run wizard on each project, expect Stop hook replacement, expect new MCP `cds` entry, run `claude-dev-stack migrate sessions --dry-run` optionally
  2. **Breaking changes detail (each with: what changed, why, what to do):**
     - Node 18 → Node 20+ (Node 18 EOL + better-sqlite3 requires 20+)
     - `session-end-check.sh` → `session-end-capture.mjs` (auto-capture replaces manual /end)
     - `.claude/settings.json` `mcp.servers.cds` new entry (query tools)
     - `@cds/*` workspace internals (transparent to users, but vendored deps now visible in node_modules)
     - Manual `/end` skill fallback-only (auto-capture replaces routine use)
     - Native compile for better-sqlite3 (prebuilds cover common platforms)
  3. **Rollback instructions:** `npm install claude-dev-stack@latest` reverts to 0.12.x (last `@latest` version); remove `packages/` from settings if auto-added by wizard; keep markdown sessions as source of truth (SQLite is derived).
- **D-121:** **Wizard warnings** at install time:
  ```
  (Node check) ⚠ Detected Node 18.20.1 — claude-dev-stack@1.0.0-alpha.1 requires Node 20+.
    Options:
      1. Upgrade Node: nvm install 20
      2. Install v0.12.x: npm install -g claude-dev-stack@latest
    Aborting install. See docs/migration-v0-to-v1-alpha.md#node-version.

  (Already-installed project) ℹ Detected Stop hook `session-end-check.sh` in {project}/.claude/settings.json.
    v1.0 auto-capture replaces this hook. Replacement will:
      - Remove: session-end-check.sh registration
      - Add: session-end-capture.sh + session-end-capture.mjs
      - Preserve: context.md updates, NotebookLM sync, vault auto-push (consolidated into new hook)
    Proceed? (Y/n)
  ```
- **D-122:** **No npm deprecate on v0.12.x** — breaks Node 18 users' ability to install without noise. v0.12.x stays `@latest` until alpha graduates to stable (v1.0.0) in a future phase (outside v1.0 scope).
- **D-123:** **GitHub release notes template** (manual draft at release time):
  ```markdown
  # claude-dev-stack 1.0.0-alpha.1

  First alpha of v1.0 CDS-Core Independence.

  > **This is a prerelease.** `npm install claude-dev-stack@latest` still installs 0.12.x.
  > To install: `npm install claude-dev-stack@alpha`

  ## Highlights
  - pnpm monorepo + TypeScript project references
  - Claude Agent SDK integration (replaces `claude -p` subprocess pattern)
  - Tiered vault: SQLite session memory with FTS5 search
  - Auto session capture — `/end` no longer required for routine sessions
  - MCP adapter exposes sessions + docs + planning state to Claude Code
  - Backfill command ports historical markdown sessions to SQLite

  ## Breaking Changes
  Node 20+ required. See [migration guide](./docs/migration-v0-to-v1-alpha.md).

  ## Alpha Caveats
  - Auto-capture is canonical; manual `/end` kept as fallback only.
  - Feedback welcomed on the Stop hook, MCP tools, and migrate command.

  Full changelog: [CHANGELOG.md](./CHANGELOG.md#1.0.0-alpha.1)
  ```

### Release Mechanics (D-124 … D-127)
- **D-124:** **`.github/workflows/publish.yml` update:**
  ```yaml
  - name: Detect prerelease
    id: meta
    run: |
      if [ "${{ github.event.release.prerelease }}" = "true" ]; then
        echo "tag=alpha" >> $GITHUB_OUTPUT
      else
        echo "tag=latest" >> $GITHUB_OUTPUT
      fi

  - name: Publish
    run: npm publish --tag ${{ steps.meta.outputs.tag }} --access public --provenance
  ```
  OIDC Trusted Publishing preserved. No local npm token ever stored.
- **D-125:** **Pre-flight build+test+pack** (added to the workflow BEFORE publish):
  ```yaml
  - run: pnpm install --frozen-lockfile
  - run: pnpm tsup build
  - run: pnpm test                                      # all 928+ tests across packages
  - run: pnpm pack --dry-run                            # tarball size sanity
  - name: Smoke install test
    run: |
      npm pack
      npm install -g claude-dev-stack-1.0.0-alpha.1.tgz
      claude-dev-stack --version | grep -q '1.0.0-alpha.1'
  ```
- **D-126:** **Rollback strategy:** publish `1.0.0-alpha.2` with fix. Avoid `npm unpublish` (community frowns, 24h window, leaves gap that users may have cached). If a published alpha has a critical bug (data corruption, install crash), use `npm deprecate claude-dev-stack@1.0.0-alpha.1 "Critical bug — install 1.0.0-alpha.2 instead"` for visible warning.
- **D-127:** **GitHub release is manual** — user (Enakoneschniy) clicks "Create release" in GitHub UI, writes release notes per D-123 template, marks "This is a pre-release" checkbox. CI fires on `release:published` event.

### Phase 33 Follow-Through (D-128)
- **D-128:** Phase 35 already committed to drop Node 18 from CI matrix (D-33). Phase 39 ALSO verifies the root `package.json` `engines.node` is `>=20` before publish. If any branch inconsistency remains (e.g., some phase's Plan file still references `node: 18`), Phase 39 executor fixes it.

### Claude's Discretion
- Exact tsup config options (source maps, minification, etc.) — planner picks defaults, likely no minification for debuggability, sourcemaps YES
- `--model` flag default for `/cds-quick` — likely `'haiku'` (cheap demo) with optional `--model sonnet`/`--model opus` override
- Wizard's Stop-hook migration confirmation UX details (e.g., whether to show before/after diff)
- Migration guide "Rollback to v0.12.x" exact commands (planner verifies on current state)
- Release note wording tweaks
- Whether CI runs the smoke install test on all Node versions or just the publish runner's Node 24 (likely just 24 — the install semantics don't change by Node version)
- Whether to include a CHANGELOG.md section update in Phase 39 scope (likely yes, brief)

### Folded Todos
- **"Week 7-8: docs + ship `claude-dev-stack@1.0.0-alpha.1` via `--tag alpha`"** (from session TODO): folded into Phase 39 scope in full. This IS that deliverable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §DEMO-01, RELEASE-01 — acceptance criteria (quick command + cost output + npm publish --tag alpha + migration guide)
- `.planning/ROADMAP.md` §"Phase 39: `/cds-quick` Demo & Alpha Release" — Success Criteria 1-4
- `.planning/PROJECT.md` §Constraints — single-dep relaxation note for v1.0 (prompts + 3 new externals per D-116)

### Prior Phase Contexts (carry-forward) — MANDATORY reads
- `.planning/phases/33-monorepo-foundation/33-CONTEXT.md` — scaffold layout, root `"files"` / `"bin"` preserved (D-03 adjusted per Phase 39 D-117 for bundler output)
- `.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md` — dispatchAgent API, CostTracker, NOTICES.md structure
- `.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md` — Node 20+ baseline, better-sqlite3 (also confirms D-128 CI matrix already adjusted)
- `.planning/phases/36-auto-session-capture/36-CONTEXT.md` — capture hook contract, session_id threading, synthetic transcript format for standalone mode (D-113 extends this)
- `.planning/phases/37-mcp-adapter/37-CONTEXT.md` — MCP server registration in wizard, `cds` key
- `.planning/phases/38-backfill-migration/38-CONTEXT.md` — migrate subcommand routing pattern (same as Phase 39 D-118)

### External / Live Docs (research phase)
- https://tsup.egoist.dev — tsup configuration reference
- https://docs.npmjs.com/cli/v10/commands/npm-publish — `--tag` semantics
- https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-npm-registry — OIDC trusted publishing (already used in current publish.yml)
- https://docs.npmjs.com/cli/v10/commands/npm-deprecate — deprecation UX (reference for rollback D-126)

### Existing Files (Phase 39 modifies)
- `.github/workflows/publish.yml` — add prerelease detection step (D-124)
- `package.json` — version bump, engines, dependencies, files array (D-115..D-119)
- `bin/cli.mjs` — update dynamic import paths from packages/* to dist/ (D-118), add `case 'quick':`
- `lib/install/hooks.mjs` — wizard Stop-hook confirmation flow (D-121)
- `lib/install/*.mjs` — wizard Node check (D-121)

### New Files (Phase 39)
- `tsup.config.ts` — bundler config
- `skills/cds-quick/SKILL.md` — Claude Code skill
- `packages/cds-cli/src/quick.ts` — CLI logic
- `packages/cds-cli/src/quick.test.ts` — unit tests (mock dispatchAgent)
- `docs/migration-v0-to-v1-alpha.md` — migration guide
- `CHANGELOG.md` section — if maintained, add 1.0.0-alpha.1 entry

</canonical_refs>

<code_context>
## Existing Code Insights

### Primitives consumed
- `@cds/core/dispatchAgent` (Phase 34) — `/cds-quick` core invocation
- `@cds/core/CostTracker` (Phase 34) — cost accounting per `/cds-quick` run
- `hooks/session-end-capture.sh` + `.mjs` (Phase 36) — Stop hook, also invoked by `captureStandalone` (D-113)
- `packages/cds-cli/src/mcp-server.ts` (Phase 37) — showcased but NOT invoked directly by /cds-quick (user queries via Claude Code MCP tool auto-invocation)
- `packages/cds-migrate/src/cli.ts` (Phase 38) — routing pattern replicated by quick.ts

### New entry points
- Skill: `/cds-quick` → `claude-dev-stack quick 'task'` (via Bash tool `!` prefix)
- CLI: `claude-dev-stack quick 'task'` (standalone, triggers captureStandalone)

### Integration Points
- `bin/cli.mjs` — `case 'quick':` dynamic import to dist/cli/quick.js
- Root `package.json` — version, engines, dependencies, files all adjusted
- `.github/workflows/publish.yml` — prerelease detection
- Wizard (`lib/install/*.mjs`) — Node check + Stop hook migration prompts

### Constraints to Factor Into Planning
- Pre-flight pack size < 5 MB (D-119)
- Publish MUST retain OIDC provenance (D-124)
- `--tag latest` MUST route correctly for non-prerelease future stable releases (e.g., 1.0.0 when it lands)
- Manual GitHub release creation — workflow MUST NOT auto-create releases
- Smoke install test asserts version string exactly `1.0.0-alpha.1` (D-125)
- Alpha caveats in release notes MUST mention `/end` fallback behavior (avoid user confusion)
- `pnpm test` runs ALL packages' tests + root tests via workspace (Phase 33 vitest config)
- Phase 36 `session-end-capture` hook works in standalone mode via synthetic transcript (D-113) — tested in `quick.test.ts`

</code_context>

<specifics>
## Specific Ideas

- Dual entry (D-110) is the simplest path to satisfy DEMO-01 ("slash command") AND provide standalone value. The skill is a thin wrapper over the CLI.
- Bundler externals (D-115) are a deliberate tradeoff: less bundle complexity vs more install-time deps. Users already trust these 3 ecosystems (Anthropic, MCP spec, SQLite).
- No npm deprecate on v0.12.x (D-122) because Node 18 users CAN'T upgrade to v1.0 and would see angry noise every install.
- GitHub prerelease flag (D-124) as the publish-tag signal is explicit and human-controllable — beats sniffing version strings that might get fat-fingered.
- Rollback via new alpha (D-126) is the npm community norm; `unpublish` is nuclear and leaves cache-coherence problems.
- Wizard Stop-hook confirmation (D-121) preserves user agency for those who customized their hooks — the new consolidated hook gracefully absorbs the 3 legacy behaviors (context.md, NotebookLM, vault push) but user-added custom lines are flagged for manual review.

</specifics>

<deferred>
## Deferred Ideas

### For v1.0 GA (graduating from alpha)
- Promote `@alpha` to `@latest` once community validation confirms stability
- Automate CHANGELOG.md generation from commit history
- Smoke test matrix expands to Windows + Node 24 native compile coverage

### For v1.1+
- `/cds-quick --stream` streaming variant (requires Phase 34 deferred `dispatchAgentStream`)
- Multi-turn quick mode (follow-up prompts within one quick session)
- Tarball size optimization — defer non-critical assets (templates) to post-install fetch
- `/cds-query "question"` skill that wraps `sessions.search` MCP tool in a friendlier UX
- npm package metadata improvements (keywords, categories)
- Homebrew formula / Scoop manifest for non-npm installs

### Reviewed Todos (not folded)
- None — all Phase 39 todos folded.

</deferred>

---

*Phase: 39-cds-quick-demo-alpha-release*
*Context gathered: 2026-04-16*
*FINAL phase of v1.0 milestone — after this, `npm install claude-dev-stack@alpha` works.*
