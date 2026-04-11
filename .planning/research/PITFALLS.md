# Pitfalls Research — Milestone v0.9

**Domain:** CLI tool integration — git-conventions skill, NotebookLM per-project migration, Notion auto-import via MCP
**Researched:** 2026-04-11
**Confidence:** HIGH (grounded in real codebase history: ADR-0001 pivot, v0.8.1 hotfix, PRs #19/#20)

> Scope: pitfalls SPECIFIC to adding these 3 features to the existing claude-dev-stack v0.8.1 codebase. Generic "write tests" advice is excluded. Each pitfall cites the real history pattern it derives from where applicable.

---

## Critical Pitfalls

These cause data loss, rewrites, or public-release breakage. Must be prevented before the relevant phase merges.

### Pitfall C-1: NotebookLM migration data loss from partial run

**What goes wrong:**
Migration script moves 27 sources from shared `claude-dev-stack-vault` notebook into per-project notebooks. The script's "move" is not actually atomic — it's (a) create per-project notebook, (b) upload file into new notebook, (c) delete from old notebook. If the script crashes, loses network, or hits a rate limit between (b) and (c), or between (a) and (b), partial state results: sources in both notebooks, or sources in neither, or manifest entries pointing to deleted IDs. The user's 27 sources represent weeks of vault history that cannot be trivially re-synced — if corrupted manifest masks reality, re-running regular `sync` won't notice drift and will silently skip rebuild.

**Why it happens:**
`notebooklm-py` has no transactional API. Phase 4 sync pipeline never had to move existing sources; it only tracked new/changed hashes. The manifest schema has no concept of "in-flight migration" — it's a flat `files: { path: { hash, notebook_source_id, uploaded_at } }` where `notebook_source_id` assumes one notebook. A migration changes the notebook identity AND the source ID atomically, and nothing in the v0.8 contract anticipates this.

**How to avoid:**
1. **Two-phase commit with explicit migration log.** Before touching any source: write `~/vault/.notebooklm-migration.json` recording `{ source_id, old_notebook_id, new_notebook_id, target_project, status: 'pending' }` for all 27 sources. Set status → `uploaded` after new-notebook upload succeeds, → `deleted` after old-notebook delete succeeds, → `verified` after round-trip check. Resume from log on re-run; finalize manifest only when all 27 are `verified`.
2. **Dry-run required by default.** First invocation of `claude-dev-stack notebooklm migrate` prints a plan (27 → 7 notebooks, mapped by `{project}__` prefix), writes nothing. User must re-run with `--execute` to actually touch the API. Matches `dryRun` semantics already in `lib/notebooklm-sync.mjs::syncVault`.
3. **Never delete from old notebook before verifying new upload.** Upload first, round-trip verify via `listSources(newNotebookId)` title match, only then `deleteSourceByTitle(oldNotebookId, title)`. The `uploadSource` title bug from v0.8.1 (see history link) proves round-trip verification catches what direct-call tests miss.
4. **Backup the old notebook ID in the manifest schema bump.** New `{version: 2}` manifest MUST preserve the old v1 manifest as `~/vault/.notebooklm-sync.v1.backup.json` for 1 milestone (v0.9 → v0.10) so rollback is possible by `cp backup original + downgrade CLI`.

**Warning signs:**
- Dry-run shows source count ≠ 27 (vault drifted or stub parser is wrong)
- Migration log has any `pending` status at end of run (means the loop exited mid-way without re-queueing)
- `listSources` count on old notebook post-migration ≠ 0
- Hash mismatches between old and new notebook sources of the same filename (rename ≠ copy)

**Phase to address:**
Phase 7 (or wherever NotebookLM v2 migration lands). Must have its own **discuss-phase gray area** for migration atomicity and rollback before `/gsd-plan-phase`. Reference: ADR-0001 set the precedent that NotebookLM integration always needs a dedicated discuss-phase for upstream API unknowns.

**Real history reference:**
v0.8.1 hotfix (`8f5a46e`) — `{project}__` prefix missing was a round-trip-only bug. Individual unit tests passed (27/27 stub calls succeeded), but the real notebook had 7 × `context.md` title collisions after the first production sync. A similar silent failure in migration would destroy user vault history. ADR-0001 also explicitly warns: "Google периодически ломает RPC — когда `notebooklm-py` ломается, claude-dev-stack тоже ломается" — mid-migration RPC break is realistic.

---

### Pitfall C-2: Manifest schema v1 → v2 unsafe migration

**What goes wrong:**
`lib/notebooklm-manifest.mjs` has `MANIFEST_VERSION = 1` as a hard-coded constant, and `isValidManifestShape()` rejects any other version by dropping into the **corrupt-recovery path** — which renames the manifest to `.corrupt-<timestamp>` and returns an empty object. When the user upgrades to v0.9 and the first sync runs, if the schema bump isn't handled, the v1 manifest is treated as corrupt, **all 27 tracked file entries disappear**, and the next sync re-uploads everything as "new," creating 27 duplicate sources in whatever notebooks currently exist. The old corrupt file is still on disk, but a non-technical user may not realize to restore it.

**Why it happens:**
The D-11 decision from Phase 3 made version mismatch = corrupt. That was correct for v0.8 (no forward compat needed), but v0.9 MUST introduce a migration branch. If the developer adds `MANIFEST_VERSION = 2` without adding a `migrateV1ToV2(parsed)` branch in `readManifest`, the corrupt path eats the data.

**How to avoid:**
1. **Explicit test that fails loudly if migration is missing.** Add `tests/notebooklm-manifest-migration.test.mjs` that writes a v1 manifest with 3 fake entries, bumps the constant to 2, calls `readManifest`, and asserts the result has exactly 3 entries (migrated, not corrupt-recovered). This test MUST be added in the same commit that bumps `MANIFEST_VERSION` — no exceptions.
2. **Backup-before-migrate rule in code.** Before `writeManifest` writes the first v2 shape to disk, it must first `copyFileSync(manifestPath, manifestPath + '.v1.backup')` if the source was v1. Kept for 1 milestone, documented in a comment referencing v0.10 cleanup.
3. **Corrupt-recovery branch distinguishes "unknown version" from "malformed JSON".** Update `isValidManifestShape` to return `{valid: false, reason: 'unknown-version'|'malformed'}`. The unknown-version branch triggers migration, not corrupt-recovery.
4. **Version bump gate in pre-submission checklist for the phase PR.** Reviewer checks: "If MANIFEST_VERSION changed, does readManifest have a migration branch? Does a test cover the old→new transition?"

**Warning signs:**
- Diff touches `MANIFEST_VERSION` without touching `readManifest` corrupt branch
- A test is renamed from `corrupt` to `migration` but the assertion wasn't updated
- First post-upgrade sync run reports `uploaded: 27, skipped: 0` instead of `uploaded: 0, skipped: 27` (meaning hash detection broke because manifest was discarded)
- `.corrupt-<timestamp>` file appears in vault root after a clean upgrade

**Phase to address:**
Phase 7 (NotebookLM v2 migration). Prevention gate: schema-migration test REQUIRED before the PR can merge.

**Real history reference:**
`lib/notebooklm-manifest.mjs` lines 136-141 — the current `isValidManifestShape` literally returns `false` for any non-1 version. Line 210 returns `recoverCorruptManifest(path, 'manifest shape invalid')` which renames and empties the file. This is a loaded gun pointed at the user's data the moment anyone sets `MANIFEST_VERSION = 2`.

---

### Pitfall C-3: NotebookLM per-project naming collision — silent duplicate notebooks

**What goes wrong:**
`ensureNotebook()` in `lib/notebooklm-sync.mjs` (lines 193-213) explicitly throws `NotebooklmCliError` when >= 2 notebooks match a title — this was the Phase 4 research finding #3 resolution. With per-project notebooks, the migration and subsequent syncs create notebook names like `claude-dev-stack`, `biko-pro`, `car-search`, etc. But what if the user already has a notebook literally named `biko-pro` from some unrelated experiment? Migration blindly picks it up as the project notebook, uploads 27 sources into it, and pollutes a pre-existing user notebook. Conversely, if the migration script creates a new `biko-pro` notebook without checking, and there's already one, Phase 4's `ensureNotebook` will throw on the next regular sync — user sees a "multiple notebooks" error they have no context for.

**Why it happens:**
v0.8 had ONE notebook with a unique-ish name (`claude-dev-stack-vault`). v0.9 creates 7+ notebooks with names that look like ordinary project titles, which is exactly the namespace most users already have stuff in. There's no namespace prefix strategy for the notebooks themselves.

**How to avoid:**
1. **Namespace per-project notebooks with a constant prefix.** `cds__{project}` (mirroring `{project}__` source title pattern). So: `cds__claude-dev-stack`, `cds__biko-pro`. Not pretty, but unambiguous. Document in ADR.
2. **Pre-migration conflict scan.** Before creating any new notebook, list all existing notebooks, check for name collisions with the target set, and abort migration with explicit message: `"Notebook 'cds__biko-pro' already exists. Delete it first or use --force-adopt."` The `--force-adopt` flag is only for the pilot user (Yevhenii) who knows what he's doing.
3. **Add notebook naming to the migration log schema.** Record `target_notebook_name: 'cds__biko-pro'` in `.notebooklm-migration.json` so re-runs know exactly which notebook to use.

**Warning signs:**
- Dry-run reports `ensureNotebook: will create` when user expected `will reuse`
- `notebooklm list` post-migration shows 8+ notebooks (drift from expected 7)
- Regular post-migration sync throws `NotebooklmCliError: multiple notebooks found`

**Phase to address:**
Phase 7 (migration). Naming ADR must be merged before migration script is written.

**Real history reference:**
`lib/notebooklm-sync.mjs` line 208: `throw new NotebooklmCliError('ensureNotebook: multiple notebooks found...')` — this is a latent bomb. It's defensive code for Phase 4's single-notebook case, but v0.9's per-project world trips it much more easily.

---

### Pitfall C-4: Notion auto-import overwrites user vault edits

**What goes wrong:**
`notion-import.mjs` pulls Notion page X into `vault/projects/{project}/docs/page-x.md`. User then edits that file directly in the vault (adds a note, fixes a typo, adds context Claude needs). Next `update notion` run blindly overwrites the file with a fresh Notion export, **losing the user's edits silently**. NotebookLM then re-uploads the overwritten version, and the user's vault-canonical edits vanish from their searchable history. This violates PROJECT.md's explicit constraint: "vault is canonical source of truth."

**Why it happens:**
Notion auto-import treats the flow as one-way Notion → vault, which is correct by decision. But "one-way" ≠ "stomp on local changes." The naive implementation compares Notion timestamp vs. local file mtime or just always overwrites.

**How to avoid:**
1. **Track content provenance.** Every Notion-imported file gets a frontmatter stamp: `notion_page_id`, `notion_last_synced`, `notion_content_hash` (hash of the last-imported content). On re-import, compute three hashes: (a) new Notion content, (b) stamped `notion_content_hash` from last import, (c) current local file content minus frontmatter. If (c) ≠ (b), the user edited the file locally — **do NOT overwrite**. Instead, write the new content to `page-x.notion-update.md` and `warn()` the user: "Local edits detected — review and merge manually."
2. **Frontmatter is source of truth for the conflict check**, not file mtime (mtimes are unreliable across tar-unpack, git clones, VM clocks).
3. **Three-way merge is out of scope for v0.9.** "Detect and refuse" is sufficient. The goal is to prevent silent loss, not automate resolution.
4. **Gate: unit test with fixture.** Create a fixture file with stamped frontmatter, mutate body, run import against a stub that returns new content, assert the original body is preserved and `.notion-update.md` sibling exists.

**Warning signs:**
- `git diff vault/projects/*/docs/` after a Notion sync shows deletions of user-added lines
- User reports "Where did my note go?"
- `.notion-update.md` files accumulate (indicates user isn't reviewing them — separate UX problem)

**Phase to address:**
Phase 8 (or whichever lands Notion import). Prevention: frontmatter stamp MUST ship in the first version, never retrofitted.

**Real history reference:**
PROJECT.md line 99: "**Two-way Notion sync** (vault → Notion) — rejected; vault is canonical source of truth." The scope decision explicitly names vault as canonical — which means a one-way Notion→vault import that clobbers vault edits violates the core scope decision.

---

### Pitfall C-5: git-conventions commit format blocks NotebookLM migration commit

**What goes wrong:**
The new git-conventions skill installs a commitlint hook (optional per scope decision, but default-on for "full" install). The enforced format is strict: `type(scope): description`. The NotebookLM migration script runs during development and commits its own progress files — `~/vault/.notebooklm-migration.json` — via some auto-commit path (hook, executor, or manual). The commit message doesn't satisfy commitlint format → pre-commit hook rejects → migration progress is unrecoverable from git history → user has to manually bypass with `--no-verify` (which project policy forbids).

Alternatively: CI runs commitlint on every commit in a PR. The migration script's fixtures include sample commit messages in test data. A plain string `"migrate 27 sources"` inside a `.md` fixture gets picked up by some overly-enthusiastic commitlint setup and fails CI.

**Why it happens:**
git-conventions skill enforcement runs on `pre-commit`, `commit-msg`, and potentially CI. NotebookLM migration and other v0.9 features don't know about the skill's existence at design time. Cross-feature contract collision.

**How to avoid:**
1. **commitlint install is opt-in via explicit prompt during `claude-dev-stack scopes init`.** Default = OFF. The skill's SKILL.md tells Claude the rules; commitlint is for humans, and the user must say yes to install it. PROJECT.md constraint already says "Conventional commits (feat/fix/chore/docs)" at the human level — this is documentation, not tooling.
2. **If commitlint opted in, the installer writes a `.commitlintrc` scoped ONLY to `rules.type-enum` and `rules.scope-enum`, NOT to body/footer rules.** Restrict the strictness surface.
3. **Test: run the full `npm test` + `node bin/cli.mjs notebooklm migrate --dry-run` chain on a machine with git-conventions-full installed.** Verify no hook rejects. This is a phase-boundary integration test, not a unit test.
4. **Document the interaction in a new ADR:** "git-conventions commitlint install is opt-in. claude-dev-stack's own scripts must use `type(scope): description` conventional format — `chore(notebooklm): migrate v1 manifest to v2` is the shape — and this is already the project's own commit style (see git log)."
5. **Never install commitlint for non-Node.js projects.** Auto-detection: `package.json` must exist and must contain a `devDependencies` section. Otherwise skip the commitlint step with `info()` message. This also addresses the "commitlint integration breaking projects that don't use Node.js" concern.

**Warning signs:**
- CI step "commitlint" fails on a PR where author didn't change any commits
- `git commit` in a freshly-installed test project errors out with "commitlint config not found"
- Migration script test suite passes locally but fails on CI (different git-conventions install state)
- Python-only project has `.commitlintrc` created after running `claude-dev-stack scopes init`

**Phase to address:**
Phase 6 (git-conventions). commitlint-install path must be feature-flagged AND detection-guarded before the skill ships.

**Real history reference:**
PR #20 (`3725def`) — GSD's `branching_strategy: "milestone"` collided with the `cmdCommit` auto-branch bug. The **third+ occurrence** of the same bug. Feature-interaction bugs are the hardest to catch because each feature's tests pass in isolation. The v0.8.1 hotfix session log (`2026-04-11-v0.8.1-hotfix-shipped.md` lines 21-23) names this explicitly as "worth investigating upstream" and it still isn't fixed upstream — it's a workaround in our repo. Same class of problem now risks repeating across three features simultaneously.

---

## Moderate Pitfalls

These cause delays, UX pain, or test flakiness. Prevent via phase-specific gates.

### Pitfall M-1: git-conventions wizard overwhelms with 12 questions

**What goes wrong:**
The full git-conventions wizard asks: project name, ticket tracker prefix (RI-, JIRA-, none), commit types to allow, commit scopes list, branch naming template, main branch name, default base branch, auto-detect stack (y/n), commitlint install (y/n), pre-push rules, squash-on-merge policy, PR template... A new user sees 12 prompts and either (a) answers blindly, (b) bails out, (c) gets stuck on "what's a ticket prefix" and abandons. Discovery cost dominates activation cost.

**Why it happens:**
Reference implementation at `~/Work/NMP/.claude/skills/git-conventions/SKILL.md` is hand-authored for the NMP project and has hard-coded values. "Full ecosystem" version must parameterize all of these, so the wizard is the logical home. But wizard-shaped UIs always tempt maximalism.

**How to avoid:**
1. **Two-tier UX: `--quick` vs `--full`.** `scopes init --quick` asks 3 questions: "Project name?" "Stack auto-detected = [pnpm monorepo]. Correct? y/N" "Install commitlint? y/N". Writes a good-default `.claude/git-scopes.json` and exits. `scopes init --full` asks the 12.
2. **`--quick` is the default when invoked with no flag.** Only power users read `--help` and find `--full`.
3. **Auto-detection results are ALWAYS editable post-init.** `scopes edit` re-opens the file in `$EDITOR`. The wizard is not the only path to correctness.
4. **Test: walk the quick wizard with a set of 5 canned answer vectors** (pnpm monorepo, single-package Node, empty repo, Python-with-package.json, no-git-dir). Assert each produces a valid `.claude/git-scopes.json` AND the skill loads correctly.
5. **Schema versioning in `git-scopes.json` from day 1.** `{ version: 1, project: ..., scopes: [...], ...}`. Mirrors the hard-won lesson from `notebooklm-sync.json`.

**Warning signs:**
- User tester abandons wizard before completion in dogfood test
- `--full` is invoked less than 10% of time over a week of pilot usage
- Issues report "what does scope mean" — means wizard didn't self-explain
- New `.claude/git-scopes.json` schema changes require a migration path

**Phase to address:**
Phase 6 (git-conventions). Must have explicit `--quick` vs `--full` decision in phase discuss before plan is written.

**Real history reference:**
`bin/install.mjs` is 1381 lines — the god-file — precisely because the install wizard evolved incrementally. Adding git-conventions wizard to this monolith without a `--quick` escape path will compound the problem. See PROJECT.md line 112: "one god-file `bin/install.mjs` (1287 lines) that remains monolithic because wizard flow benefits from linear top-down read" — which is a pragmatic rationalization, not a green light to grow it unbounded.

---

### Pitfall M-2: Auto-detection false positives for scopes

**What goes wrong:**
Stack auto-detect scans `lib/`, `packages/`, `apps/`, `src/` and emits them as scopes. But:
- `lib/` in claude-dev-stack is the actual source; the "scope" would be `lib/projects` — too granular
- `node_modules/` inside a weird monorepo shape gets slurped as scope
- A `lib/` folder that's actually an arbitrary user folder (e.g., `lib/legacy-migrations` with 3 md files) becomes a scope
- pnpm workspace with 40 packages → 40 scopes, commit message now has a 40-entry dropdown, pointless
- Git submodules or `.gitmodules` references pick up external repos' scopes

**Why it happens:**
Auto-detection is shallow (directory names) when the real signal is configuration (`package.json` workspaces, `lerna.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`). Directory-name heuristic is seductive because it works for 3 out of 7 stacks.

**How to avoid:**
1. **Config-first detection, directory-name as fallback only.** Order: `pnpm-workspace.yaml` → `lerna.json` → `package.json#workspaces` → `turbo.json` → `nx.json` → `Cargo.toml[workspace]` → directory-name heuristic (lowest confidence). Each tier emits different default scopes.
2. **Cap at 10 auto-detected scopes.** More than 10 → drop into manual-curation mode with a message: "Detected 40 workspace packages. Edit `.claude/git-scopes.json` manually to pick the ~10 that matter for commit-message scoping."
3. **Every detected scope MUST be confirmed by user in non-`--quick` mode.** `--quick` uses the top 5 by package count.
4. **Test: fixture `tests/fixtures/scopes-detection/` with 7 sample repo shapes** (pnpm-monorepo, lerna, turbo, nx, single-package-js, single-package-rust, no-workspace-just-src-folder). Snapshot the detected scopes list, fail on drift.
5. **Log a dry-run line for every detected scope showing which signal caused it.** `info('scopes: "ui" — from pnpm-workspace.yaml')`. Transparency by default.

**Warning signs:**
- Test fixture run produces a scope list with > 10 entries
- `git-scopes.json` contains scopes named `legacy`, `old`, `archive`, `tmp` — these are never valid scopes, always false positives
- User reports "it picked up `.git/` as a scope" (means detection isn't filtering hidden dirs)

**Phase to address:**
Phase 6 (git-conventions). Detection fixture test must be part of plan-01 (the module landing), not deferred to plan-02.

---

### Pitfall M-3: Notion MCP server unavailable — unclear degradation

**What goes wrong:**
`claude.ai Notion` MCP server is installed globally, not per-project. User runs `claude-dev-stack notion import` on a machine where Notion MCP was never authenticated, or the token expired, or the server config was deleted. What does the command do?
- Option A: Fails with cryptic MCP-layer error message the user doesn't understand
- Option B: Silent skip (worst option — user thinks it worked)
- Option C: Falls through to REST API (rejected per scope decision — MCP-only)
- Option D: Clear prompt: "Notion MCP not reachable. Install via `claude mcp add notion`. Skipping." + exit 1

v0.9 scope says "graceful degradation vs hard error?" without answering it.

**Why it happens:**
MCP server availability is a runtime concern, not a compile-time one. `claude-dev-stack` has no handle on whether the Claude CLI's MCP config has `notion` active at the moment of invocation.

**How to avoid:**
1. **Decision in discuss-phase: hard error with clear remediation, NOT silent skip.** Option D above. Fail fast with actionable message.
2. **Pre-flight check in `doctor`.** Add a line to `lib/doctor.mjs` that runs `claude mcp list --json` (already used in `lib/mcp.mjs` — pattern exists), filters for `notion`, reports `ok` / `warn: notion MCP not installed — run 'claude mcp add notion'`. Mirrors the NotebookLM binary detection pattern from v0.8.
3. **Import script's first action: call MCP preflight.** If `notion` not in `claude mcp list`, `fail()` and exit 1 before reading any config.
4. **Auth expiry is a runtime failure, not startup.** Separate handling: during per-page import loop, catch auth-error responses from MCP, surface a single consolidated "Notion auth expired, re-authenticate with `claude mcp auth notion`" message at end of loop, don't 429-bomb the user with 30 duplicate errors.

**Warning signs:**
- `doctor` output doesn't mention Notion MCP status but user tries to import
- Import command fails with MCP JSON-RPC internal error instead of actionable message
- Multiple expiry errors in same run (should collapse to one)

**Phase to address:**
Phase 8 (Notion import). Pre-flight check is plan-01; runtime error collapse is plan-02.

**Real history reference:**
PR #19 (`288ec69`) — output-style hijack was a case where a plugin (output-style) silently broke claude-dev-stack behavior. The resolution was a **doctor check** plus **CLAUDE.md template override**. The pattern — when an external dependency can silently degrade the product, doctor must catch it — directly applies to Notion MCP. Reuse the PR #19 pattern.

---

### Pitfall M-4: Notion markdown conversion edge cases

**What goes wrong:**
Notion's export is lossy for a dozen features: synced blocks (shared content), embedded files (images, PDFs with signed URLs), formula columns in databases, relation columns, rollup columns, nested toggles, callouts with custom icons, mentions (`@user`, `@date`), sub-pages, and database views. MCP server's `getPage` returns markdown that silently drops or mangles these. A user maintaining architecture notes in Notion with embedded diagrams finds their vault docs are broken references.

**Why it happens:**
Notion is a structured database masquerading as markdown. Any serializer has to make lossy decisions. MCP server's decisions are not ours, and they may change between versions.

**How to avoid:**
1. **Document a "known unsupported" list in the Notion import module.** Module header comment lists what's known-lossy. User sees it when investigating weird output.
2. **Post-import sanity scan.** After writing the markdown file, run a regex pass for known-bad patterns: `![image](data:`, `<file>` HTML tags, `@mention:` unresolved, `={{formula}}`. If any found, append a `<!-- NOTION-IMPORT: X unsupported features detected — see docs -->` marker at top of file. User can `rg` for it.
3. **One fixture per known edge case in `tests/fixtures/notion/`.** Each fixture is a stub MCP response (JSON) + expected output `.md`. Snapshot-style test. Run against the real MCP server occasionally (not in CI) to catch upstream drift.
4. **Scope decision: DO NOT attempt to re-implement rich block conversion.** If MCP returns broken markdown, it's broken markdown. Vault is a text-grep tool, not a Notion viewer. Reference stays in Notion.

**Warning signs:**
- Imported doc has raw `{{mention}}` or `data:base64` strings
- Imported doc is suspiciously short (synced blocks were dropped)
- Diff between two imports of the same page is large (probably whitespace churn from upstream, not user-meaningful)

**Phase to address:**
Phase 8 (Notion import). Fixture test suite is plan-02.

---

### Pitfall M-5: Test infrastructure can't scale to 350+ tests

**What goes wrong:**
v0.9 adds ~50-100 new tests (estimated per STATE.md: 264 → 314-364). Current test runner is `node --test tests/*.test.mjs` — sequential, no parallelism, no test-isolation beyond process-level. New tests for migration, Notion import, and git-conventions all need filesystem fixtures (temp vaults, fake git repos, fake `package.json` shapes). If each fixture is created in `/tmp` without proper cleanup, test runs leak ~100s of tmp directories per run. CI time grows from 40s (v0.8 baseline) to 3-4 min. Flakiness sneaks in when tests share global state via `PATH` env mutation for stubs.

**Why it happens:**
`node:test` is minimal by design — that's why we picked it (single-dep constraint). But minimal means no fixture helpers, no parallel isolation, no cleanup-after-all hooks beyond what the developer writes.

**How to avoid:**
1. **Shared fixture helper module at `tests/helpers/fixtures.mjs`.** Exports `makeTempVault()`, `makeTempGitRepo()`, `makeTempMonorepo(shape)`. Each returns `{ path, cleanup }`. All callers MUST call cleanup in `after()` or `afterEach()` or it's a lint failure in code review.
2. **PATH mutation wrapped in a scope helper.** `withStubBinary(name, content, async () => { ... })` — sets PATH, runs, restores in finally. Nothing leaks PATH mutations across tests.
3. **CI timeout budget: 3 minutes max for test suite.** If exceeded, bail and force the developer to split a test file or use a smaller fixture. Hard budget prevents slow creep.
4. **`tests/README.md` documents the fixture patterns.** One page. Read by any contributor adding a new test.
5. **`tmp/` cleanup assertion in CI.** After tests pass, `ls /tmp/cds-*` must return nothing. If it returns anything, tests leaked fixtures — fail CI. Cheap canary.

**Warning signs:**
- Test suite runtime > 90s locally on an M-series Mac
- `/tmp/` has old `cds-*` dirs days after a test run
- CI flakiness on Node 18 but passing on Node 22 (or vice versa) — means process-state leakage
- `beforeEach` / `afterEach` blocks grow duplicate boilerplate across > 3 test files

**Phase to address:**
Phase 6 (first new feature) — fixture helper must ship alongside the first test that needs it, never retrofitted.

**Real history reference:**
v0.8 grew tests from 54 to 247 in one milestone without a fixture helper, and it's visible in the commit history as copy-pasted `mkdtempSync` + `PATH` mutation boilerplate across 5 files. v0.8.1 hotfix (`2148066`) introduced the `NOTEBOOKLM_STUB_ARGV_LOG` env-var pattern for stub inter-process communication — a clever but project-specific trick. Scaling that pattern to 3 new features without extracting the helper = maintenance nightmare.

---

### Pitfall M-6: Node 18 compatibility regression in new code

**What goes wrong:**
CI matrix is 18/20/22. Developer on local Node 22 uses newer APIs: `structuredClone` (18.17+), `import.meta.dirname` (20.11+), top-level `await fetch` with `keepalive` option (20+), `fs.promises.cp` with `recursive` (16.7+ but flaky in 18). Code passes local and 20/22 CI but fails on Node 18 tests — either hard error or subtle behavior difference. Fix is pushed after first report from a Node 18 user.

**Why it happens:**
Single-dep constraint means relying on Node builtins, which means constantly tempting edge-of-compat APIs. Developer doesn't remember which API landed when.

**How to avoid:**
1. **CI runs Node 18 FIRST in the matrix, not last.** Fail-fast on oldest supported.
2. **`engines.node: ">=18.17.0"` in package.json stays frozen for v0.9.** Don't bump to 20 just because "we're on April 2026." Check if user base includes 18.
3. **No `import.meta.dirname` — use `fileURLToPath(import.meta.url)` + `dirname()` pattern.** Document in a one-line `// Node 18 compat:` comment at the top of any new `.mjs` that deals with module paths.
4. **`npm run test:node18` local script via `nvm use 18 && npm test`.** Run before every feature-complete commit during v0.9 development. Takes 30s.
5. **Pre-submission PR checklist has a "Node 18 verified" line** — ticked only after CI green or local nvm check.

**Warning signs:**
- CI passes on Node 20/22 but fails on Node 18 with `TypeError: ... is not a function`
- Developer says "I only have 22 locally"
- New code uses any API added after April 2023 (conservative cut)
- Code has `?.` optional chaining assignment (`a?.b = c`) — Node 18 supports it but some tooling doesn't

**Phase to address:**
Every phase. Gate: PR cannot merge with red Node 18 job.

---

## Minor Pitfalls

These are manageable annoyances or theoretical risks worth noting.

### Pitfall m-1: Migration script needs real `notebooklm-py` fixtures, not just stubs

**What goes wrong:**
Unit tests use bash-stub `notebooklm` binaries returning canned JSON. They test the claude-dev-stack logic, not actual upstream behavior. Migration script passes unit tests, fails on real notebook because stub didn't simulate a specific upstream quirk (e.g., `--json` output has different shape for `source upload` vs `source list`).

**How to avoid:**
- Checklist item for Phase 7: **"Manual smoke test on a throwaway real notebook before merging migration PR."** Not automated — just human verification on a burner notebook, documented in PR body.
- v0.8.1 hotfix session retro (lines 80-84) already flagged "Phase verifier should require real-world smoke test when phase touches external API." v0.9 should institutionalize this for NotebookLM phases.

**Phase to address:** Phase 7. Checklist item in phase discuss-phase.

---

### Pitfall m-2: `notebooklm-py` upstream version drift breaks migration

**What goes wrong:**
User has `notebooklm-py 0.3.4` (pinned in ADR-0001). Upstream releases 0.4.0 with a breaking `--json` output change (e.g., `sourceId` → `source_id`). claude-dev-stack `spawnSync`-parses the old shape, migration fails mid-run with "unexpected JSON key." User's 27 sources are now in partial state.

**How to avoid:**
- Pre-flight `notebooklm --version` check in migration entry point. If not in known-good range (e.g., `>= 0.3.4 < 0.4.0`), abort with clear message and pin instruction: `pipx install 'notebooklm-py==0.3.4'`.
- Add `.notebooklm-supported-versions.json` listing known-good versions, updated in each milestone.

**Phase to address:** Phase 7, before migration starts. Minor because abort-on-mismatch fails safely.

---

### Pitfall m-3: Notion page-not-found on refresh

**What goes wrong:**
User's `notion_pages.json` lists page ID `abc123`. User deletes the page upstream in Notion. Next import loop sees page-not-found from MCP, but the existing `docs/abc123.md` in vault is now stale — no upstream to refresh. What's the behavior?

**How to avoid:**
- Decision: leave the vault file intact, `warn()` that "page abc123 no longer found in Notion; local copy retained." Don't delete vault content based on upstream deletion (vault is canonical).
- Add `notion_last_seen` to frontmatter — helps user audit which files are orphaned.

**Phase to address:** Phase 8. Cheap to implement alongside C-4 frontmatter stamping.

---

### Pitfall m-4: `gsd-tools commit` branch hijack re-triggers on v0.9 phase work

**What goes wrong:**
PR #20 workaround (`branching_strategy: "none"` + `quick_branch_template: "chore/{slug}"`) only works for `/gsd-quick` tasks. Regular phase work via `/gsd-execute-phase` still goes through `cmdCommit` — the original hijack path. If the upstream bug isn't fixed, v0.9 phase commits may land on auto-created `gsd/v0.9-milestone` branches 5+ more times during the milestone.

**How to avoid:**
- Carry the same workaround pattern across to `/gsd-execute-phase` path: executor always uses `gsd-tools commit --files <list>` with explicit file staging, and verifies HEAD branch is the intended feature branch pre- and post-commit. 
- The `(Memory note)` TODO in STATE.md line 101 about `gsd-tools commit --files` flag requirement becomes a HARD requirement, not a memory note.
- If it fires once in v0.9, open upstream issue. If it fires twice, monkey-patch locally.

**Phase to address:** All phases. Operational hygiene, not feature work.

**Real history reference:** STATE.md line 101 + v0.8.1 session log line 84. Third+ occurrence pattern directly identified.

---

### Pitfall m-5: GitHub Actions v5 nice, but branch protection + self-review still blocks

**What goes wrong:**
v0.9 phases land as feature branches + PRs. Branch protection requires 1 review. Pilot user = only developer. Each phase merge requires `gh pr merge --admin --squash` to bypass, which is noisy and requires admin privileges. The v0.8.1 hotfix session (line 50) confirms this is already the working pattern, but it's not documented.

**How to avoid:**
- Document in `.planning/milestones/v0.9-ROADMAP.md` (or STATE.md) that admin-merge is the accepted pattern for a single-developer milestone.
- Don't auto-enable branch protection changes in v0.9 — inherited from v0.8.

**Phase to address:** Operational; no phase owns it. Note in STATE.md.

---

## Phase-Specific Warnings

Mapping pitfalls to the expected phase structure (per STATE.md line 58: expected 6-8 phases, starting at Phase 6).

| Phase Topic | Critical Pitfalls | Moderate Pitfalls | Must-Have Gates |
|---|---|---|---|
| **Phase 6: git-conventions core skill + wizard** | C-5 (commitlint × NotebookLM commit format) | M-1 (wizard 12Q overwhelm), M-2 (scope auto-detect false positives), M-5 (test infra), M-6 (Node 18 compat) | `--quick` vs `--full` discuss decision before plan; fixture helper module shipped with first test; scopes schema versioned; commitlint install opt-in AND Node-detected |
| **Phase 6b: git-conventions scopes subcommand + commitlint installer** | C-5 | M-1, M-2 | Node.js detection before commitlint install; scopes-detection fixture with 7 stack shapes |
| **Phase 7: NotebookLM per-project migration (DRY-RUN first)** | C-1 (partial migration), C-2 (schema v1→v2), C-3 (notebook name collision) | M-5, M-6, m-1, m-2 | Migration log schema ADR; dry-run default; backup v1 manifest; schema-migration test required; naming prefix decided (`cds__{project}`); manual smoke test on burner notebook |
| **Phase 7b: NotebookLM migration execute + verify** | C-1, C-3 | m-1, m-2 | Round-trip verification step; rollback path documented; pre-flight `notebooklm --version` check |
| **Phase 8: Notion MCP pre-flight + import module** | C-4 (vault edit clobber) | M-3 (MCP unavailable UX), M-4 (markdown edge cases), M-5, M-6 | Doctor check for Notion MCP; frontmatter stamp in first version; fixture suite for markdown edge cases; hard-error on MCP unavailable |
| **Phase 8b: Notion auto-import wiring + intent trigger** | C-4 | M-3, M-4, m-3 (page-not-found) | Three-hash content check for local edits; `.notion-update.md` conflict output; auth-error collapse |
| **All phases (cross-cutting)** | C-5 | M-5, M-6, m-4 (gsd-tools hijack), m-5 (admin merge) | Node 18 CI first; fixture helper module; gsd-tools commit explicit `--files`; real-world smoke test for external-API phases |

---

## Cross-Cutting Prevention Gates

Concrete, actionable gates that should apply across all v0.9 phases regardless of feature:

1. **Schema version bump gate.** Any PR that changes a `version:` constant in a JSON-backed schema (`notebooklm-sync.json`, `git-scopes.json`, `notebooklm-migration.json`, `notion_pages.json`) MUST include a migration-path test in the same commit. Reviewer checklist item.

2. **External-API smoke-test gate.** Any PR that touches `lib/notebooklm*.mjs`, `lib/notion-import.mjs`, or adds a new MCP client MUST document a manual smoke-test run in the PR body (what notebook/page/repo was touched, what was observed). Lesson from v0.8.1 hotfix retro, line 80-84 of session log. Make it a habit.

3. **Feature-interaction integration test.** Once per milestone: set up a clean vault, install all 3 v0.9 features, run `scopes init --quick` + `notebooklm migrate --execute` + `notion update` in sequence on a throwaway project. Assert no errors, git log is clean, all commits satisfy conventional-commits format. This is the PR #20 / PR #19 pattern applied to the whole v0.9.

4. **Data-loss review for any write to vault content.** Any code path that does `writeFileSync` into `vault/projects/*/docs/` must be reviewed for user-edit clobbering. Frontmatter stamp or skip-if-modified check required.

5. **Node 18 CI runs first in matrix.** Fail-fast on oldest supported version.

6. **Fixture cleanup assertion.** `/tmp/cds-*` must be empty after test suite runs. Tests with leaks fail CI.

7. **Commit-format sanity when git-conventions ships.** Before merging Phase 6, rebase main onto the branch and verify no historical commit triggers a commitlint error. If any do, the scope-enum is too strict — loosen it.

8. **Corrupt-recovery path must not be a "silent data loss" gate for any v2 schema.** Update `lib/notebooklm-manifest.mjs::isValidManifestShape` to distinguish "malformed" from "newer version" — the latter triggers migration, not recovery. Gate: this is the first commit of Phase 7.

---

## Sources

- `.planning/PROJECT.md` — Current Milestone section (v0.9 scope), Key Decisions table, Out of Scope
- `.planning/STATE.md` — Risks to monitor (v0.9-specific), Quick Tasks Completed (hijack history)
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — ADR-0001 (pivot rationale, upstream fragility)
- `~/vault/projects/claude-dev-stack/sessions/2026-04-11-v0.8.1-hotfix-shipped.md` — round-trip verification lesson, gsd-tools hijack third+ occurrence, phase-verifier-should-require-real-world-smoke-test proposal
- `lib/notebooklm-manifest.mjs` (lines 40-214) — schema v1 contract, corrupt-recovery path, atomic write pattern
- `lib/notebooklm-sync.mjs` (lines 193-213) — `ensureNotebook` multiple-match throw, Phase 4 research finding #3
- `lib/notebooklm-sync.mjs` (lines 243-347) — `syncOneFile` error handling pattern, manifest-per-file-write contract
- `lib/docs.mjs` — existing Notion manual-import flow (pattern reference for auto-import)
- `~/Work/NMP/.claude/skills/git-conventions/SKILL.md` — reference implementation (hard-coded for NMP, must be parameterized)
- PR #19 (`288ec69`) — output-style hijack defense pattern (doctor check + CLAUDE.md override) — reusable for Notion MCP availability
- PR #20 (`3725def`) — gsd-tools branch hijack workaround (local config flip; upstream still broken)
- PR #16 (`8f5a46e`) — v0.8.1 uploadSource title hotfix, cp-to-tmp workaround precedent for upstream CLI quirks

**Confidence level: HIGH.** Every pitfall is grounded in a specific line of existing code, a specific PR, a specific ADR, or an explicit scope decision from PROJECT.md. No generic advice. Each pitfall names a real test, gate, or ADR as its prevention mechanism.
