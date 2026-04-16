# Phase 39: /cds-quick Demo & Alpha Release - Technical Research

**Researched:** 2026-04-16
**Scope:** tsup bundler config, npm `--tag` semantics, GitHub Actions OIDC prerelease detection, Claude Code skill format, synthetic transcript compatibility with Phase 36 capture, pnpm pack size analysis.

---

## Research Summary

Phase 39 is the final integration phase of v1.0. It does NOT introduce new primitives — every primitive was delivered in Phases 34-38. Phase 39's technical risk is concentrated in:

1. **Bundler configuration** (tsup) — getting externals right, keeping output <5 MB.
2. **npm dist-tag semantics** — ensuring `@alpha` does not override `@latest`.
3. **Prerelease detection in GitHub Actions** — event payload parsing.
4. **Claude Code skill dual-entry** — skill body invoking the CLI subcommand via Bash tool (same convention as `dev-research` skill).
5. **Synthetic transcript format** — must match Phase 36 `loadTranscript` parser so `captureStandalone` actually produces observations.

All other work (`/cds-quick` dispatch, cost reporting, migration doc writing, wizard warning strings) is straightforward synthesis of Phase 34-36 primitives.

---

## Pattern 1: tsup config for workspace monorepo with external deps

**Source:** https://tsup.egoist.dev/#typescript-project-references + Phase 33 `tsconfig.base.json` (already exists)

tsup is the established choice for shipping TypeScript CLIs in 2026. It wraps esbuild, emits d.ts via tsc, and handles externals correctly for Node runtime. The key constraint for Phase 39: three deps (`better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`) MUST remain externals because:

- `better-sqlite3` is a native N-API addon. Bundling the prebuild registry breaks cross-platform install.
- `@anthropic-ai/claude-agent-sdk` performs runtime require.resolve for streaming helpers; bundling inlines unreachable code paths.
- `@modelcontextprotocol/sdk` uses dynamic imports for transport adapters (stdio vs http); bundling strips the ability to tree-shake per transport.

**Canonical config for Phase 39** (reference D-115):

```ts
// tsup.config.ts (repo root)
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

**Key findings:**

- `splitting: false` is important for Node CLIs — esbuild's code-splitting produces chunked output that `bin/cli.mjs` would have to know about. Single-file-per-entry keeps `import(path.join(__dirname, '..', 'dist', 'cli', 'quick.js'))` trivial.
- `sourcemap: true` keeps stack traces useful for alpha users reporting bugs; minification is off because bundle is small enough and readability is priority for v1.0 alpha.
- `dts: true` generates `.d.ts` from tsc internally — critical because `@cds/cli` imports `dispatchAgent` from `@cds/core` via workspace resolution. tsup re-runs type resolution for each entry.
- `target: 'node20'` downleveling is minimal because tsc base config already targets ES2022. This sets Node built-in API usage (e.g., `import.meta.resolve` availability).
- Root `package.json` must add `"scripts": { "build": "tsup" }` replacing the old `tsc --build`. The pnpm workspace tsconfigs still run for type-checking (`pnpm tsc --build` kept as separate check).

**Pitfall — `cds-s3-backend`:** CONTEXT.md line 78 notes "cds-s3-backend included only if non-empty at Phase 39 time". At Phase 33's scaffold it's a stub. Plan 01 conditionally includes `'s3-backend/index': 'packages/cds-s3-backend/src/index.ts'` only if that file exports non-stub code. Since v1.0 keeps cds-s3-backend as a stub per SEED-003, plan OMITS it from tsup entries to keep tarball lean.

---

## Pattern 2: npm dist-tag semantics for `--tag alpha`

**Source:** https://docs.npmjs.com/cli/v10/commands/npm-publish + https://docs.npmjs.com/cli/v10/commands/npm-dist-tag

The canonical mechanism for prerelease without disrupting `@latest` users:

1. When `npm publish --tag alpha` is used (and the version is a prerelease per semver — `1.0.0-alpha.1` qualifies because it has the `-alpha.1` suffix), the package is registered at the `alpha` dist-tag.
2. `npm install claude-dev-stack` (with no tag) → resolves via `@latest` → installs whatever is tagged `latest` (0.12.x in our case).
3. `npm install claude-dev-stack@alpha` → resolves via `@alpha` dist-tag → installs 1.0.0-alpha.1.
4. `npm install claude-dev-stack@1.0.0-alpha.1` → version-exact install, works regardless of tag.

**Critical rule:** publishing a prerelease version (semver `-alpha.N`) WITHOUT `--tag` does NOT register `latest` — npm correctly skips auto-tagging of prereleases under `latest`. But `--tag alpha` is still required to put the publish under the `alpha` dist-tag so `@alpha` queries resolve.

**Verification strategy (Plan 05 smoke test):**

```sh
npm pack                                   # produces claude-dev-stack-1.0.0-alpha.1.tgz
npm install -g ./claude-dev-stack-1.0.0-alpha.1.tgz
claude-dev-stack --version                 # must print 1.0.0-alpha.1
```

This validates the tarball locally BEFORE the real publish. Running this in the publish workflow AFTER `npm publish` would also pass, but pre-publish catches tarball issues earlier.

**Rollback via `npm deprecate`** (D-126 fallback):

```sh
npm deprecate claude-dev-stack@1.0.0-alpha.1 "Critical bug — install 1.0.0-alpha.2 instead"
```

This is a metadata change, does not unpublish (which has a 24-hour window and can leave cache gaps). Users attempting to install the deprecated version see a console warning but the install still succeeds — critical for reproducibility of existing installs.

---

## Pattern 3: GitHub Actions OIDC + prerelease detection

**Source:** https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-npm-registry + existing `.github/workflows/publish.yml`

The existing publish.yml (v0.12 era) already uses OIDC trusted publishing:

```yaml
permissions:
  id-token: write
  contents: read
```

This is a prerequisite for `npm publish --provenance` with no stored npm token. It STAYS in Phase 39 — no change to authn.

**New step — prerelease detection** (D-124):

```yaml
- name: Detect dist-tag
  id: meta
  run: |
    if [ "${{ github.event.release.prerelease }}" = "true" ]; then
      echo "tag=alpha" >> "$GITHUB_OUTPUT"
    else
      echo "tag=latest" >> "$GITHUB_OUTPUT"
    fi

- name: Publish with OIDC
  run: npm publish --tag ${{ steps.meta.outputs.tag }} --access public --provenance
```

**Key findings:**

- `github.event.release.prerelease` is a boolean. The shell comparison uses literal `"true"` because GitHub serializes booleans as strings in the event payload.
- If `on: release: types: [published]` fires and the human-drafted release has the "pre-release" checkbox set, `prerelease` is `true`. Otherwise `false`. This is 1:1 with the D-127 manual release creation flow.
- Dual-tag safety: if someone accidentally publishes 1.0.0 (stable) as a release NOT marked prerelease, the tag becomes `latest` — the v0.12.x users get bumped. This is the correct behavior for GA, but during alpha we rely on the checkbox. Plan 05 documents "ALWAYS tick the pre-release checkbox for `1.0.0-alpha.*` and `1.0.0-beta.*` tags" in D-123 release notes template.

**Pitfall — `npm publish` requires `publishConfig.provenance` OR `--provenance` flag.** The existing root package.json has:

```json
"publishConfig": { "provenance": true, "access": "public" }
```

Phase 39 preserves this. The `--provenance` flag in the workflow is belt-and-suspenders — if `publishConfig.provenance` is removed accidentally, the CLI flag still enforces it.

---

## Pattern 4: Claude Code skill with CLI subcommand backend

**Source:** `.claude/skills/dev-research/SKILL.md` (existing), Claude Code skill docs, Phase 38's CLI routing

Claude Code skills are Markdown files under `skills/<name>/SKILL.md` with YAML frontmatter. The skill description and trigger phrases drive auto-invocation via the `dev-router` hook. Skill BODY is executed as a system prompt to Claude when triggered.

**Skill body pattern for `/cds-quick`** (D-110, D-111):

```markdown
---
name: cds-quick
description: |
  Run a quick one-shot task via Claude Agent SDK and auto-capture the session to SQLite.
  Triggers on: "/cds-quick <task>", "cds-quick <task>", "quick task: <task>".
  Single-dispatch agent run. Returns summary + cost. For multi-turn work, use Claude Code normally.
trigger_phrases:
  - /cds-quick
  - cds-quick
  - quick task:
---

# /cds-quick — One-shot agent dispatch with cost reporting

Given the user's task description `$ARGUMENTS`, run:

```bash
claude-dev-stack quick "$ARGUMENTS" --json
```

Then parse the JSON output, which contains `{ output, cost, sessionId, observations? }`. Display:

1. The agent's text output verbatim (the `output` field).
2. A short cost summary block: `cost: $0.0041 · session: abc-123 · model: haiku`.
3. If `observations` is present (standalone mode), list the top 3 observation summaries.

The session is auto-captured into SQLite by the Stop hook when Claude Code exits. You do NOT need to trigger capture manually from within the skill.
```

**Key findings:**

- Skill `$ARGUMENTS` is the raw text after the slash command. `"$ARGUMENTS"` with shell quotes is the standard pattern (existing `dev-research/SKILL.md` uses it).
- Bash tool execution within a skill body uses `!` prefix for inline commands OR markdown code fences (Claude auto-invokes Bash tool for fenced `bash` blocks inside skill bodies).
- Skill registration is automatic — if `skills/cds-quick/SKILL.md` ships in the tarball under the `"files"` array, the wizard copies it to `~/.claude/skills/cds-quick/` during install.

**Pitfall — skill vs slash-command distinction:**

In Claude Code, `/skill-name` invokes a skill if one exists; otherwise falls through to built-in slash commands. Since Claude Code's built-in commands are fixed (`/end`, `/clear`, etc.) and `/cds-quick` is not reserved, the skill claim succeeds. No collision risk.

---

## Pattern 5: Synthetic transcript for `captureStandalone`

**Source:** Phase 36 `packages/cds-core/src/capture/transcript.ts` (to-be-created per Phase 36 D-62), D-113 in this phase

Phase 36's `loadTranscript(sessionId, projectSlug)` reads from `~/.claude/projects/{slug}/{session_id}.jsonl`. For standalone CLI invocation (no Claude Code wrapping), no such file exists — we must fabricate it.

**Synthetic transcript format** (matches Claude Code jsonl convention):

```jsonl
{"type":"user","uuid":"u1","session_id":"<sessionId>","content":{"role":"user","content":[{"type":"text","text":"<task>"}]}}
{"type":"assistant","uuid":"a1","session_id":"<sessionId>","content":{"role":"assistant","content":[{"type":"text","text":"<result.output>"}]}}
```

Writing path per D-113: `/tmp/cds-quick-{sessionId}.jsonl` OR (preferred) directly into the Claude Code projects directory to keep a single source of truth:

```
$HOME/.claude/projects/{derived_slug}/{sessionId}.jsonl
```

`derived_slug` comes from `process.cwd()` slash-to-dash (same logic as Phase 36 D-60). `captureStandalone` writes this file, then spawns `hooks/session-end-capture.sh` with env:

```sh
CLAUDE_SESSION_ID=<sessionId> CLAUDE_PROJECT_DIR=<projectPath> hooks/session-end-capture.sh
```

The capture hook reads the synthetic transcript, runs Haiku extraction, writes SQLite, exits. Fail-silent inherited from Phase 36 D-66.

**Key findings:**

- Using `$HOME/.claude/projects/{slug}/` avoids a separate "standalone" code path in `loadTranscript` — the parser is agnostic to who wrote the file.
- The 2-message transcript is minimal but valid. Phase 36's truncation tier-2 doesn't fire at this size.
- Cost of standalone capture: <$0.001 per invocation (Haiku processes ~500 tokens of synthetic transcript). Acceptable.

**Pitfall — concurrent session file creation:**

If a real Claude Code session is active and its jsonl is at `{slug}/{sessionId}.jsonl`, the synthetic write could collide. Mitigation: `sessionId = crypto.randomUUID()` for standalone invocations per D-112. Claude Code's session_id is also a UUID but allocated from a different pool; collision probability is ~0.

---

## Pattern 6: pnpm pack size budget enforcement

**Source:** pnpm docs + npm docs

`pnpm pack --dry-run` outputs file list + sizes. To assert the tarball stays <5 MB (D-119):

```sh
pnpm pack --dry-run 2>&1 | awk '/tarball size/ { print $NF }'
# prints "1.2 kB" or "4.8 MB" depending on size
```

Plan 05 wraps this in CI assertion:

```yaml
- name: Assert tarball size <5MB
  run: |
    SIZE_BYTES=$(pnpm pack --json 2>&1 | node -e 'process.stdin.on("data",d=>{try{const j=JSON.parse(d);console.log(j[0].size)}catch{process.exit(1)}})')
    if [ "$SIZE_BYTES" -gt 5242880 ]; then
      echo "Tarball exceeds 5 MB budget: $SIZE_BYTES bytes"
      exit 1
    fi
    echo "Tarball size OK: $SIZE_BYTES bytes"
```

**Key findings:**

- `pnpm pack --json` outputs a JSON array with `[{ name, version, size, filename, ... }]`. `size` is in bytes.
- Current v0.12 tarball (no bundled deps, just lib/hooks/skills/templates) is ~300 KB. Adding `dist/` (bundled core + cli + migrate, externals excluded) adds ~1-2 MB. Budget is comfortable.
- Non-essential files to keep OUT of `"files"` array: `patches/` is already there (legacy GSD patches — keep, per D-117), but `.planning/` MUST NOT be there (tested via grep in acceptance criteria).

---

## Pattern 7: CHANGELOG.md structure for alpha release

**Source:** https://keepachangelog.com/en/1.1.0/ + existing repo (no CHANGELOG.md yet)

Phase 39 D-238 ("Whether to include a CHANGELOG.md section update in Phase 39 scope — likely yes, brief"). Decision: YES, include a minimal CHANGELOG.md with just the 1.0.0-alpha.1 entry. Rationale:

1. npm-provenance audit trails reference CHANGELOG.md when present.
2. The release notes (D-123) link to CHANGELOG.md anchor.
3. Future alpha.2+/beta.1+/1.0.0 releases can append without retrofit.

**Format** (Keep-a-Changelog):

```markdown
# Changelog

All notable changes to `claude-dev-stack` are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.1] — 2026-04-16

### Added
- pnpm monorepo with `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend` (SEED-002)
- Claude Agent SDK integration via `dispatchAgent` (replaces `claude -p --bare` subprocess)
- Tiered vault: SQLite Tier 2 with FTS5 search (SEED-004)
- Auto session capture — `hooks/session-end-capture.mjs` Stop hook
- MCP adapter exposing `sessions.search`, `sessions.timeline`, `sessions.get_observations`,
  `docs.search`, `planning.status`
- `claude-dev-stack migrate sessions` CLI subcommand (backfill of v0.12 markdown sessions)
- `/cds-quick "<task>"` Claude Code skill + CLI subcommand for one-shot agent dispatch
- tsup bundler producing `dist/` with three externals: `better-sqlite3`,
  `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`

### Changed
- BREAKING: Node 18 → Node 20+ (Node 18 EOL + better-sqlite3 native requirement)
- BREAKING: `session-end-check.sh` → `session-end-capture.sh` (new consolidated hook)
- Manual `/end` skill description updated to "fallback only"
- Install wizard now registers `mcp.servers.cds` in each project's `.claude/settings.json`
- Root `package.json` single-dep constraint relaxed: adds `better-sqlite3`,
  `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`
- Root `package.json` `"files"` array ships `dist/` instead of `packages/`

### Deprecated
- Nothing — v0.12.x remains `@latest` until 1.0.0 GA.

### Removed
- Nothing in this release.

### Security
- Migration preserves existing markdown sessions as source of truth;
  SQLite is derived, rebuildable from markdown.

[1.0.0-alpha.1]: https://github.com/Enakoneschniy/claude-dev-stack/releases/tag/v1.0.0-alpha.1
```

---

## Validation Architecture

Phase 39 tests span **package unit tests** (`packages/cds-cli/src/quick.test.ts`), **root tests** (`tests/publish-workflow.test.mjs`, `tests/tsup-build.test.mjs`), and **CI integration** (smoke install in publish.yml).

| Dimension | Coverage Strategy |
|-----------|-------------------|
| **1. Functional correctness** | `quick.test.ts` mocks `dispatchAgent` + verifies summary/cost output shape (--json and text modes), standalone path invokes captureStandalone, Claude Code path does not. |
| **2. Cross-package integration** | `quick.test.ts` + `cli-dispatch.test.mjs` — `bin/cli.mjs case 'quick'` routes to `dist/cli/quick.js` in prod mode and `packages/cds-cli/dist/quick.js` when `CDS_DEV=1`. |
| **3. Bundler output** | `tests/tsup-build.test.mjs` runs `pnpm tsup` + asserts `dist/cli/quick.js`, `dist/cli/mcp-server.js`, `dist/migrate/cli.js` exist and each has zero require/import of the three externals in non-external form (regex-based). |
| **4. Tarball size** | `tests/pack-size.test.mjs` runs `pnpm pack --json`, asserts `.size < 5_242_880`. |
| **5. Version correctness** | `tests/version-bump.test.mjs` asserts `package.json.version === "1.0.0-alpha.1"` and `engines.node === ">=20"`. |
| **6. Workflow syntax** | `.github/workflows/publish.yml` — linted via `actionlint` IF available (soft check, warning if not installed). Hard check: `yq . .github/workflows/publish.yml` parses without error. |
| **7. Skill install** | `tests/skill-cds-quick.test.mjs` — reads `skills/cds-quick/SKILL.md`, asserts frontmatter has `name`, `description`, `trigger_phrases` keys. |
| **8. Synthetic transcript capture** | `quick.test.ts §standalone mode` — uses temp HOME, runs full dispatch, asserts `$HOME/.claude/projects/{slug}/{sessionId}.jsonl` exists with valid 2-message content AND (if INTEGRATION=1) `~/vault/projects/{name}/sessions.db` gains a session row. |
| **9. Migration guide content** | `tests/migration-guide.test.mjs` — asserts `docs/migration-v0-to-v1-alpha.md` contains required section headers: `## Quick checklist`, `## Breaking Changes`, `## Rollback`. |
| **10. Wizard Node check** | `tests/install-node-check.test.mjs` — mocks `process.versions.node = '18.20.1'` → install aborts with exit 1 + stderr contains "Node 20+". |

**Sampling rate:** After each task commit, run the targeted test. After each plan's last task, run `pnpm --filter <pkg> vitest run` OR `pnpm -w vitest run --project root`. Before `/gsd-verify-work`, run full `pnpm test` + `pnpm tsup` + `pnpm pack --dry-run`.

**Real-SDK gate:** `INTEGRATION=1` env var enables one live-Haiku test in `quick.integration.test.ts` — validates end-to-end standalone flow with actual session capture. Skipped in CI by default; run manually before release.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| tsup bundling inlines part of `@anthropic-ai/claude-agent-sdk` dynamic requires | Runtime crash on install | `external: [...]` list verified via `tests/tsup-build.test.mjs` regex scan. |
| Wizard's replace-hook logic clobbers user customizations in settings.json | User trust loss | Phase 36 D-69 + D-121 preserve user customizations (warn + proceed). Plan 04 re-uses Phase 36's idempotency tests, extends with "user-added custom Stop entry" scenario. |
| Published alpha blocks users from installing older v0.12.x due to npm cache weirdness | Install breakage | Verified by smoke test: `npm install claude-dev-stack@0.12.1` in CI post-publish (Plan 05). If fails, alpha is deprecated per D-126. |
| Tarball exceeds 5 MB due to source maps | Hard CI fail | `tsup.config.ts` sourcemap files (~1 MB per bundled package) contribute. Pre-flight estimate: 4 bundled entries × ~200 KB + ~1 MB sourcemaps = ~1.8 MB total. Well under budget. |
| Synthetic transcript path collision with real Claude Code session | Wrong session overwritten | `crypto.randomUUID()` collision probability = 0 in practice; hook has fail-silent (D-66). |
| `github.event.release.prerelease` mis-evaluated (boolean string comparison) | Wrong dist-tag published | Explicit `= "true"` shell comparison (Pattern 3) + Plan 05 YAML parse test. |
| `pnpm pack` vs `npm pack` tarball differs | Install works locally, fails from npm | Plan 05 uses `npm pack` (not pnpm) in the smoke-install test to match real-world install. pnpm is for dev workspace only. |
| D-128 leftover Node 18 references | Build fails on install attempt | Plan 01 task 4 greps all config/workflow files for `node: 18` / `"node": ">=18"` and fixes any remaining references. |

---

## Research Complete

All findings reduce to concrete config snippets, test assertions, or file contents. No open questions — the planner can proceed without ambiguity.

## RESEARCH COMPLETE
