# Feature Research — v0.9 Milestone

**Domain:** Claude Code developer tooling — per-project git policy enforcement, per-project NotebookLM notebooks with migration, intent-triggered Notion import
**Researched:** 2026-04-11
**Confidence:** MEDIUM-HIGH (Context7 not consulted — library choices already locked in PROJECT.md; research draws from reference implementation, ecosystem conventions, and official docs)

**Scope note:** This is a SUBSEQUENT milestone on existing claude-dev-stack v0.8.1. Only features for the 3 v0.9 targets are analyzed. Existing capabilities (`lib/project-setup.mjs`, `lib/notebooklm*.mjs`, `lib/docs.mjs`, 4 built-in skills, 14 stack templates, doctor/analytics/update flows) are treated as dependencies, not as features to research.

---

## Feature 1 — git-conventions Skill Ecosystem

### Reference Implementation Analysis (NMP)

Read: `~/Work/NMP/.claude/skills/git-conventions/SKILL.md` (181 lines)

**What NMP has:**
- Commit format: `type(scope): description; TICKET` — 7 types (feat/fix/refactor/test/docs/ci/chore)
- Hardcoded scope list (`ca`, `nmp-app`, `sso`, `ui`, `domain`, `infra`) — **project-specific, not parameterized**
- Branch naming: `TICKET-NUMBER-short-description` derived from `staging` base branch
- Main branch explicitly named (`staging`, not `main`)
- HEREDOC commit pattern
- Pre-commit hook failure recovery (re-stage + NEW commit, never `--amend`)
- Safety rules (never `--force`, `--hard`, `--amend` after hook fail)
- Pre-commit stack documented: Husky + lint-staged + ESLint + Stylelint + Prettier
- Cross-skill reference: `feature-development` skill Phase 9 calls `git-conventions` (per `~/Work/NMP/.claude/skills/feature-development/SKILL.md` line 173-188)
- **Contradiction:** NMP's skill says "Co-Authored-By line included" in its checklist (line 147), but claude-dev-stack's CLAUDE.md and MEMORY.md explicitly forbid Co-Authored-By. **The template MUST make Co-Authored-By configurable, defaulting to OFF for claude-dev-stack and ON for NMP-style projects.**

**What NMP is missing (gaps to fill):**
- No scope auto-detection — scopes are hand-maintained in the skill file
- No ticket format validation (regex) — `RI-123` is convention but not enforced
- No emoji support (gitmoji)
- No subject length limit note (commitlint default: 100 chars)
- No body/footer line length rules
- No link to external `git-scopes.json` — skill is literal markdown, not parameterized
- No mention of ticket extraction from branch name (automation opportunity)

### What commitlint / gitmoji / czg provide that NMP doesn't

| Feature | commitlint | czg (commitizen) | gitmoji | NMP skill |
|---------|-----------|------------------|---------|-----------|
| Scope enum validation | ✓ `scope-enum` rule | ✓ interactive pick | — | — |
| Auto-detect pnpm workspace scopes | ✓ `@commitlint/config-pnpm-scopes` | ✓ | — | — |
| Subject case/length | ✓ | ✓ | — | — |
| Body/footer rules | ✓ | ✓ | — | — |
| Interactive commit wizard | — | ✓ | — | — |
| Emoji prefix | — | — | ✓ | — |
| Git hook integration | via husky | via husky | via husky | manual docs |
| Human-readable policy doc | — | — | — | ✓ (only NMP) |

**Key insight:** The v0.9 `git-conventions` skill sits in a different space from commitlint — it's **a prompt for Claude**, not a lint rule. It teaches Claude to construct correct commits. Commitlint is a downstream verification. Both can coexist: skill generates commit → husky/commitlint verifies it. They are complementary, not competitive.

### Auto-Detection Heuristics (for `claude-dev-stack scopes`)

Research into scope auto-detection shows a consistent set of signals across ecosystems:

| Stack Type | Detection Signal | Scopes Emitted |
|------------|------------------|----------------|
| **pnpm workspace** | `pnpm-workspace.yaml` exists | each `packages/*` dir name → scope |
| **npm/yarn workspaces** | `package.json` `workspaces` field | each workspace glob-resolved dir → scope |
| **Turborepo** | `turbo.json` exists | same as underlying pnpm/npm workspace |
| **Nx monorepo** | `nx.json` + `apps/`/`libs/` | each subdir name → scope (e.g., `apps/ca` → `ca`) |
| **Lerna** | `lerna.json` exists | `packages/*` dir names → scope |
| **Rust workspace** | `Cargo.toml` has `[workspace]` with `members` | each member crate name → scope |
| **Go multi-module** | multiple `go.mod` files | each module last-path-segment → scope |
| **Python (hatch/uv)** | `pyproject.toml` with `[tool.uv.workspace]` or `hatch envs` | env/pkg name → scope |
| **Single-package** | single `package.json` / `Cargo.toml` / etc. | fallback: DDD layer names (`domain`, `app`, `infra`, `ui`) OR top-level `src/*` dirs |
| **No manifest** | neither of above | fallback: top-level dirs (excluding `node_modules`, `.git`, `dist`, `build`, `target`) |

**Layer detection (orthogonal to package detection):** If `src/domain/`, `src/app/`, `src/infra/`, `src/ui/` all exist → flag as DDD project → add layer names as valid scopes alongside package scopes.

**Complexity note:** Naively detecting 7 stack types is LOW-MEDIUM. What's HIGH complexity is **scope merging rules** — how to combine `ca` (app from Nx) with `domain` (layer) without exploding into a cross-product of 50 fake scopes. Design choice: emit them as a **flat list with source attribution** in `.claude/git-scopes.json`, let the skill render them grouped.

### Expected `.claude/git-scopes.json` Shape

Based on existing v0.8 conventions (`notebooklm-manifest.mjs` uses JSON, `lib/docs.mjs` uses config-by-convention):

```json
{
  "$schema": "https://claude-dev-stack.dev/schemas/git-scopes.v1.json",
  "version": 1,
  "commit": {
    "format": "type(scope): description",
    "types": ["feat", "fix", "chore", "docs", "refactor", "test", "ci"],
    "scopes": [
      { "name": "cli", "source": "detected:dir", "description": "bin/cli.mjs router" },
      { "name": "notebooklm", "source": "detected:prefix", "description": "lib/notebooklm*.mjs" }
    ],
    "ticketPattern": null,
    "ticketRequired": false,
    "coAuthoredBy": false,
    "subjectMaxLength": 72,
    "subjectCase": "lower"
  },
  "branch": {
    "base": "main",
    "namePattern": "{type}/{slug}",
    "quickBranchTemplate": "chore/{slug}"
  },
  "safety": {
    "forbidden": ["--force", "--hard", "reset --hard", "checkout .", "clean -f"],
    "allowAmend": false,
    "requireClean": true
  }
}
```

**Why this shape:**
- `source` field on each scope makes the auto-detection transparent and user-editable — they can see why `notebooklm` became a scope and either keep or delete it
- `coAuthoredBy: false` resolves the NMP/claude-dev-stack contradiction
- `branch.base` is explicit — solves the `main` vs `master` vs `staging` variance (NMP uses `staging`)
- `quickBranchTemplate` aligns with PR #20 cleanup (`chore/{slug}` default)
- `ticketPattern: null` means ticket prefix is optional by default — projects like NMP that require `RI-\d+` can override

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| Conventional Commits format enforcement in skill text | Industry standard since 2017; 5 of 6 AI tool imports (`.cursorrules` etc.) already assume it | LOW | Static skill template section — no runtime logic |
| Scope list parameterized per-project (not hardcoded like NMP) | User can't reasonably edit a global skill for each project | MEDIUM | Skill template reads `.claude/git-scopes.json` at invoke time — Claude loads JSON as context; **depends on** existing `lib/project-setup.mjs` copy flow |
| `claude-dev-stack scopes` subcommand to generate/edit `git-scopes.json` | Parallels existing `docs`, `skills`, `mcp` subcommand UX | MEDIUM | New `lib/scopes.mjs` module; **depends on** `lib/shared.mjs` (`prompts`, `c`, `ok/fail/info`), `findVault()` from `projects.mjs` |
| Auto-detection for at least pnpm/npm workspaces + single-package fallback | These cover ~80% of Node projects — claude-dev-stack's primary audience | MEDIUM | New `lib/scope-detect.mjs`; pure-function (reads FS, returns scope list); **reuses** `existsSync`/`readdirSync` pattern from `notebooklm-sync.mjs` |
| Main branch auto-detect (`main` / `master` / `staging`) | Users don't want to hand-specify; GitHub default is `main`, legacy is `master`, some teams use `staging` | LOW | `git symbolic-ref refs/remotes/origin/HEAD` or fallback to `git branch -a` — one `spawnSync` call |
| Co-Authored-By toggle (default OFF) | claude-dev-stack MEMORY.md forbids, NMP requires; must be configurable | LOW | Field in `git-scopes.json`; skill template reads it |
| Branch naming pattern configurable | Variance across teams: `feature/FOO-123`, `FOO-123-description`, `user/name/branch` | LOW | Template string in `git-scopes.json` with `{type}`, `{slug}`, `{ticket}` placeholders |
| Safety rules section (never `--force`, etc.) | Universally agreed; bug-for-bug match with NMP's SKILL.md block | LOW | Static template section |
| Pre-commit hook failure recovery instructions | Captured as critical by NMP's skill; valuable teaching for Claude when husky blocks a commit | LOW | Static template section |
| Integration with existing GSD `/gsd-quick` and `/gsd-execute-phase` flows | v0.8 cleanup PR #20 already set `quick_branch_template: chore/{slug}` — skill must honor the same template | LOW-MEDIUM | Read `.claude/get-shit-done/config.json` if present, sync `quickBranchTemplate` |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **Per-project parameterization with per-run Claude context** | No existing "skill" in Claude Code ecosystem reads JSON config at invoke time — unique to this stack's project-level skill pattern | MEDIUM | Skill file includes instruction: "Read `.claude/git-scopes.json` before constructing commit messages." No runtime code — Claude loads file via Read tool |
| **One-shot detection + edit loop** (`claude-dev-stack scopes`) | Users can inspect/correct auto-detection once at setup, then forget; no CI step required | MEDIUM | Wizard: detect → preview table → confirm/edit → write JSON. Mirror `lib/docs.mjs` interactive flow |
| **Auto-detection for 7+ stacks, not just Node** | commitlint-config-monorepo is pnpm-only; we cover Rust, Go, Python, Nx, Lerna, Turborepo | MEDIUM | Pure FS detection; extensible via small per-stack functions |
| **Wizard integration at setup time** (`bin/install.mjs`) | Scopes auto-detected during first `npx claude-dev-stack` run — zero manual step | LOW-MEDIUM | Call `lib/scope-detect.mjs` from `bin/install.mjs` per-project loop; **depends on** `lib/project-setup.mjs` being called first so `.claude/skills/git-conventions/` exists |
| **Doctor check** for missing/stale `git-scopes.json` | Surfaces drift when user adds a new workspace package but forgets to re-run `scopes` | LOW | `lib/doctor.mjs` adds 3-line section following v0.8 ADR-0012 severity discipline |
| **Ticket extraction from current branch** | Claude reads `git rev-parse --abbrev-ref HEAD`, matches `ticketPattern`, auto-fills `TICKET-NUMBER` in commit — no manual copy-paste | LOW | Skill instruction only, no CLI code |
| **Layer detection for DDD projects** | NMP has DDD but skill scopes are manual; auto-detect `src/domain/`, `src/app/`, `src/infra/`, `src/ui/` and add as layer scopes | LOW-MEDIUM | Orthogonal function in `lib/scope-detect.mjs` |
| **Optional commitlint installer** (`claude-dev-stack scopes --install-lint`) | Bridges the "Claude writes correct commits" and "CI enforces" gap without bundling 50 deps | MEDIUM | Writes `commitlint.config.js` generated from `git-scopes.json`; runs `pnpm add -D @commitlint/cli @commitlint/config-conventional` via `spawnSync`; idempotent |
| **Doesn't bundle husky** — just documents it | Respects single-dep rule; doesn't impose workflow | LOW | Skill text includes "Optional: `pnpm add -D husky`" |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Bundle commitlint/husky as dependencies** | "Just install everything for me" appeal | Breaks single-dep constraint; many projects already have their own lint setup and would get duplicate rules | Optional `--install-lint` subcommand with explicit confirmation; never auto-install |
| **Real-time commit linting via Claude hook** | Feels magical (type → instant validation) | Hooks fire too often; adds startup latency to every Claude message; hook output pollutes UX | Skill is invoked only at commit time (via Skill tool); validation happens at `git commit` via husky, not during chat |
| **Force CI enforcement via GitHub Action generation** | "Ship the whole stack" | Out of scope for a local dev tool; GitHub Actions vary per-repo; would break non-GitHub users | Document in README + link to `.github/workflows/commitlint.yml` snippet, no generation |
| **Two-way sync between `git-scopes.json` and `commitlint.config.js`** | "Keep them aligned" | Merge conflict city; both files evolve independently; user edits commitlint rules, JSON overwrite destroys customization | One-direction: `git-scopes.json` generates `commitlint.config.js` on demand only |
| **Emoji/gitmoji support** | Gitmoji has a cult following | Teams split 50/50; mixing emoji with `type(scope):` is controversial; adds parsing complexity | Out of scope for v0.9; defer to v0.10 as optional `commit.emoji: true` field if requested |
| **Interactive commit wizard (like czg)** | "Make commits easier" | Duplicates what Claude already does via skill; adds prompts npm dep usage; breaks "Claude writes commits" flow | Claude IS the interactive wizard — skill teaches Claude what questions to ask |
| **Auto-push and PR creation from commit** | "One-shot workflow" | Conflates concerns; existing `commit-commands:commit-push-pr` from NMP is a separate skill for a reason | Keep `git-conventions` scoped to commit construction only |
| **Scope validation against remote repo state** | "Fail fast if scope doesn't exist" | Requires network; git-scopes.json IS the source of truth by design; network dep breaks offline workflow | JSON is authoritative; user re-runs `scopes` to refresh |
| **Squash-merge opinions in skill** | "Standardize merge strategy" | Highly team-specific; beyond skill scope; GitHub repo settings are the right place | Out of scope; document in README as "configure at repo level" |

---

## Feature 2 — NotebookLM Per-Project Notebooks (with Migration)

### Current State (from `lib/notebooklm-sync.mjs`)

- **Single shared notebook:** `claude-dev-stack-vault` (or env override `NOTEBOOKLM_NOTEBOOK_NAME`)
- **Filename prefix scheme:** `{project}__{basename}` — e.g., `claude-dev-stack__2026-04-10-session.md`, `biko-pro__ADR-0001-something.md`
- **Manifest:** single `~/vault/.notebooklm-manifest.json` tracking all files across all projects
- **`ensureNotebook` logic:** strict `title === notebookName` match, creates if 0, throws if ≥2 (duplicate protection)
- **Sync decisions:**
  - D-01 sessions: pass-through prefix
  - D-02 ADRs: regex-parsed `NNNN-slug.md`
  - D-03 docs: `doc-` sub-prefix
  - D-04 context: `context.md` fixed
  - D-06 `buildTitle` single source of truth
  - D-12 sessions: upload-once (no re-upload on content change)
  - D-13 non-sessions: hash delta → delete-then-upload

### NotebookLM Platform Capabilities (2026)

Per web research (confidence: MEDIUM — multiple sources converge):
- **Notebook limits:** 100 notebooks/user on free tier, 500 on Pro/Ultra
- **Sources per notebook:** 50 (Standard), 300 (Pro), 600 (Ultra)
- **Cross-notebook search:** Added early 2026 — mount notebooks as data sources in Gemini App, then query across mounted notebooks
- **Per-source limits:** 500K words or 200MB per local upload
- **Current user state for this project:** 27 sources in single shared notebook (confirmed in PROJECT.md) — nowhere near any limit

### Per-Project Notebook UX Impact

**Query flow BEFORE (single notebook):**
1. User opens `claude-dev-stack-vault` notebook
2. Types "only look at biko-pro__ files, when did we decide X"
3. NotebookLM returns answer citing `biko-pro__ADR-0005-xxx.md`
- **Friction:** Requires prefix awareness; answers can leak across projects if user forgets filter

**Query flow AFTER (per-project):**
1. User opens `biko-pro` notebook (or Claude's `dev-research` skill navigates to it)
2. Types "when did we decide X"
3. NotebookLM returns answer — already scoped
- **Friction:** 5+ notebooks to manage; cross-project queries require cross-notebook search via Gemini App

**For cross-project queries** (e.g., "compare decision in project A vs project B"):
- Pre-2026: impossible in shared-notebook mode unless user manually filtered both prefixes
- Post-2026: Gemini App cross-notebook search mounts all notebooks; user asks Gemini instead of NotebookLM directly
- **Implication:** Per-project is strictly better for single-project queries, and NOT worse for cross-project (use Gemini App layer on top)

### Migration UX — Critical Decisions

**Q: Does the user lose query history / notebook chat threads?**
- YES — NotebookLM chat is per-notebook. Migrating sources to new notebooks = fresh chat threads. Old threads remain in old notebook (which we can delete or leave).
- **Mitigation:** Document this explicitly. Query history is session-scoped; users don't typically cite old chat threads weeks later. Losing chat is acceptable.

**Q: Can we move sources, or must we re-upload?**
- NotebookLM CLI (`notebooklm-py`) has no "move source" primitive. Must re-upload.
- **Cost:** 27 sources × ~2s per upload = ~60s of sync time. Manageable.

**Q: Dry-run mode?**
- Existing `syncVault({ dryRun: true })` returns `planned` array of actions — pattern to mirror in migration.

**Q: What happens to the old shared notebook after migration?**
- Option A: Leave it (user deletes manually)
- Option B: Auto-delete after successful per-project sync
- **Recommendation:** Option A. Auto-delete is risky (bug → data loss). User inspects + deletes via NotebookLM UI.

**Q: Rate limits during migration?**
- Existing `NotebooklmRateLimitError` propagation pattern handles this (ADR-0001, D-08). Migration is just `syncVault` run in new mode, so inherits rate-limit handling for free.

### Dependencies on Existing v0.8 Code

| Component | How Migration Reuses It |
|-----------|-------------------------|
| `lib/notebooklm.mjs` — CLI wrapper | Unchanged; `createNotebook`, `uploadSource`, `deleteSourceByTitle`, `listNotebooks` all used as-is |
| `lib/notebooklm-sync.mjs::walkProjectFiles` | Unchanged — already walks per-project; just consumes its output differently |
| `lib/notebooklm-sync.mjs::buildTitle` | **Needs extension** — remove `{project}__` prefix from title when notebook is already project-scoped. New signature: `buildTitle(category, basename, { projectScoped: true })` or add new `buildTitleForPerProject` to avoid breaking the existing export (D-06 says buildTitle is single source of truth — extending it is OK, renaming breaks tests) |
| `lib/notebooklm-sync.mjs::ensureNotebook` | **Called per-project loop** — `ensureNotebook('biko-pro')`, `ensureNotebook('claude-dev-stack')`, etc. Notebook name = project slug |
| `lib/notebooklm-manifest.mjs` | **Schema extension** — manifest needs per-project notebook ID mapping: `{ files: {...}, notebooks: { 'biko-pro': 'nb_abc123', ... } }`. Current schema has no `notebooks` field; add with migration path (read old schema, upgrade in-place) |
| `lib/notebooklm-sync.mjs::syncVault` | **Refactor to per-project loop** OR add new `syncVaultPerProject()` alongside. Prefer adding new function, deprecate `syncVault` with single-notebook mode at v0.10. Rationale: atomic migration path |
| `lib/doctor.mjs` NotebookLM section | **Extend** — list N notebooks + per-project source counts instead of 1 notebook stat |
| `bin/install.mjs` wizard | **Extend** — wizard prompt: "Create one notebook per project? (recommended) [Y/n]" — for new users defaults to yes; for users with existing shared notebook, prompts migration |
| `hooks/notebooklm-sync-trigger.mjs` + runner | **Unchanged** — still kicks off sync at session end; just reads new config |

### Table Stakes

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| One notebook per project, named = project slug | Natural mental model; matches `vault/projects/{slug}/` structure | LOW-MEDIUM | `ensureNotebook(slug)` per project loop; **depends on** existing `ensureNotebook` duplicate-protection logic |
| Automatic migration of existing 27 sources | Users have content in shared notebook; forcing re-upload without migration is data loss UX | HIGH | New `lib/notebooklm-migrate.mjs`: enumerate shared notebook sources, group by `{project}__` prefix, upload to new per-project notebooks, delete from shared, update manifest; **depends on** `listSources` (needs verification in `notebooklm-py` — may need wrapper addition in `lib/notebooklm.mjs`) |
| Dry-run migration mode | Users need to see "what will happen" before destroying current state | MEDIUM | Mirror existing `syncVault({ dryRun: true })` planned array pattern |
| Migration idempotency (re-run safe) | Network failures mid-migration are expected; re-run must not duplicate | MEDIUM | Use existing `ensureNotebook` → if notebook exists, sync only missing files; manifest tracks per-project notebook IDs |
| Per-project notebook in manifest | Manifest must know which notebook each file lives in | LOW | Schema bump: `manifest.notebooks[projectSlug] = notebookId`; read/write unchanged otherwise |
| Backward compatible config (env var still works for single-notebook mode) | v0.8.1 users with `NOTEBOOKLM_NOTEBOOK_NAME` set shouldn't have setup break | LOW | If env var set → legacy single-notebook mode (warn via doctor: "single-notebook mode is deprecated"); else → per-project |
| Title scheme without project prefix when per-project | `biko-pro__ADR-0001-xxx.md` in a notebook named `biko-pro` is redundant/ugly | LOW | `buildTitle` extension with `projectScoped` flag; titles become `ADR-0001-xxx.md`, `context.md`, `doc-foo.md`, etc. |
| Doctor check shows per-project notebook health | Users need to know which notebooks exist, source counts, manifest drift | LOW | Extend `lib/doctor.mjs` NotebookLM section; 1 line per project |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **Zero-downtime migration** (keep shared notebook until new ones verified) | Prevents data loss from partial migrations | MEDIUM | Migration strategy: create per-project notebooks → upload → verify manifest matches → mark migration complete → user manually deletes old shared notebook via NotebookLM UI |
| **Migration report** shown at end | "Migrated 27 sources across 5 projects in 48s, 0 failed" — users trust what they can verify | LOW | Extend existing stats shape (`uploaded`, `failed`, `errors`, `durationMs`) with `migrated` count |
| **Skip-unchanged optimization during migration** | Don't re-upload files already matching hash in old manifest | LOW-MEDIUM | Read old manifest entries, hash-compare against source, reuse hash if unchanged (no re-download from NotebookLM needed) |
| **`dev-research` skill auto-scopes to current project's notebook** | With 5+ notebooks, the skill must know which one to query — `session-manager` already tracks current project | LOW-MEDIUM | Extend `dev-research` skill to read current project from vault context; query notebook by project slug; **depends on** existing `session-manager` context |
| **One-command migration** (`claude-dev-stack notebooklm migrate`) | No-ceremony single command; dry-run by default with `--execute` to actually run | MEDIUM | New `lib/notebooklm-cli.mjs` subcommand; mirrors existing `notebooklm sync` / `status` pattern |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Hybrid mode** (some projects shared, some per-project) | "Gradual migration" / "special case projects" | Explicitly rejected in PROJECT.md Out of Scope section ("strict per-project from v0.9 migration onwards"); doubles config surface; confuses dev-research skill scoping | Strict per-project; one-shot migration |
| **Auto-delete old shared notebook after migration** | "Clean up after yourself" | Destructive; bug = data loss; NotebookLM has no undelete | User deletes manually after reviewing migration report |
| **Live NotebookLM → vault reverse sync** | "Notes taken in NotebookLM should persist to vault" | Rejected in v0.8 and v0.9 — vault is canonical source of truth (Out of Scope) | User takes notes in vault `docs/`, NotebookLM picks them up on next sync |
| **Per-session notebook** (one per `2026-04-11.md`) | "Absolute isolation" | Explodes notebook count; hits free-tier 100-notebook limit within weeks; kills cross-session query; loses NotebookLM's aggregation value | Per-project is the right granularity |
| **Rename notebook on project slug change** | "Keep sync in sync with rename" | Project rename is rare; NotebookLM rename via API is brittle; easier to delete + re-sync | Document: rename requires `notebooklm migrate` re-run |
| **Sync shared vault files** (`~/vault/shared/patterns.md`) | "Patterns are shared across projects" | Rejected in v0.8 — no natural project owner; would require a "shared" pseudo-notebook with confusing semantics | Out of scope; document manual add |
| **Cross-notebook search via CLI** | "Let us query across notebooks from terminal" | NotebookLM cross-notebook search requires Gemini App UI — not available via `notebooklm-py`; would need reverse-engineering | Document workaround: "Open Gemini App, mount notebooks, query there" |

---

## Feature 3 — Notion Auto-Import via MCP

### Current State (from `lib/docs.mjs`)

- **Existing flow:** User manually exports Notion page → unzips → runs `claude-dev-stack docs add` → selects unzipped folder → CLI scans for `.md`/`.csv` files → user multiselects → copies to `vault/projects/{slug}/docs/`
- **Filename cleanup:** `cleanNotionFilename` strips 32-char UUIDs (`Page Name abc123...def456.md` → `page-name.md`)
- **Path/UX:** Interactive via `askPath` + `prompts.multiselect`
- **Existing integrations with NotebookLM:** Once file lands in `vault/projects/{slug}/docs/`, existing sync (D-03 `doc-` prefix) picks it up automatically at next session end

### Notion MCP Server Ecosystem (2026)

**Three implementations found:**

| Server | Maintainer | Read-only? | Markdown export | Recursive blocks |
|--------|-----------|------------|-----------------|------------------|
| `makenotion/notion-mcp-server` | **Official Notion** | No (write support) | Yes (`NOTION_MARKDOWN_CONVERSION=true`) | Yes via `retrieve block children` |
| `suekou/mcp-notion-server` | Community | No | Yes (env flag) | Yes |
| `awkoy/notion-mcp-server` | Community | No | Yes | **Yes with parallel recursion optimization** |
| `Taewoong1378/notion-readonly-mcp-server` | Community | **Yes** (read-only) | Yes | Yes |

**Key capabilities:**
- Markdown conversion is an env flag, not default (`NOTION_MARKDOWN_CONVERSION=true`)
- Official server is `makenotion/notion-mcp-server` — safest choice for v0.9
- Recursive block fetching is manual: each block with `has_children: true` requires a separate API call; `awkoy` implementation offers auto-traversal
- **Important caveat:** Markdown mode "may cause issues when editing pages" — we only read, so this doesn't affect us

### Notion Page → Markdown Conversion Edge Cases

Research into Obsidian Notion Sync, NocoDB, n8n Notion node shows consistent pain points:

| Edge Case | What Breaks | Mitigation |
|-----------|-------------|------------|
| **Databases vs pages** | Database rows have properties (title, tags, status) — markdown has no structured place for them | Official Notion export writes CSV for databases + markdown for each row. For v0.9: convert DB properties to frontmatter, row content to body |
| **Rich text formatting** (colors, backgrounds, inline mentions) | Standard markdown drops these | Accept loss; colors aren't queryable in NotebookLM anyway |
| **Embedded media** (images, files, videos) | Markdown has `![]()` but Notion URLs are signed and expire | Two options: (a) download to `docs/_media/` and rewrite paths; (b) leave Notion URLs and accept expiry. **Choice for v0.9:** leave URLs; users upload critical images to vault manually |
| **Sub-pages** | A Notion page often contains 5-30 nested sub-pages; recursive fetch can be 100+ API calls | Config specifies which pages to import; sub-pages imported only if `recursive: true` flag set per-config-entry; default `recursive: false` |
| **Child databases in pages** | Page contains inline database view | Treat as separate config entry; requires explicit user action |
| **Synced blocks** | Notion's "synced blocks" reference content from elsewhere | Flatten at read time (MCP handles this) |
| **Toggle blocks, callouts, quotes** | Render reasonably in markdown | No action needed — MCP markdown mode handles |
| **Tables** | Notion tables map to markdown tables OK (if not too wide) | Accept; wide tables become ugly but legible |
| **Equations (LaTeX)** | Map to `$...$` / `$$...$$`; NotebookLM handles these | Accept |
| **Code blocks** | Map perfectly | No action needed |

### Config UX — Page IDs vs URLs vs Share Links vs Database IDs

**Option A: Page IDs** (`abc123def456...`)
- **Pro:** Canonical, unambiguous, never changes
- **Con:** Ugly, hard to get — user must open page, copy from URL, extract last segment, remove hyphens
- **UX:** Bad for humans

**Option B: Share URLs** (`https://www.notion.so/Page-Title-abc123def456...`)
- **Pro:** One copy from browser; human-readable title visible
- **Con:** URL includes title slug which changes if page renamed; MCP must strip and extract ID
- **UX:** Best for humans; server strips title at fetch time

**Option C: Database IDs separate from page IDs**
- **Pro:** Explicit typing of what's being imported
- **Con:** User has to know the distinction; databases and pages use same ID format in Notion
- **UX:** Requires teaching; fragile

**Option D: Notion API object URL** (`https://api.notion.com/v1/pages/...`)
- **Pro:** Unambiguous
- **Con:** Users never see these in the UI
- **UX:** Expert-only

**Recommendation:** Accept share URLs, strip to 32-char page ID, don't distinguish page vs database at config time — MCP `retrieve` call tells us which. Config entry shape:

```json
{
  "$schema": "https://claude-dev-stack.dev/schemas/notion-pages.v1.json",
  "version": 1,
  "pages": [
    {
      "url": "https://www.notion.so/Architecture-Decisions-abc123def456...",
      "destination": "docs/notion-architecture.md",
      "recursive": false,
      "includeSubpages": false,
      "includeDatabases": false
    },
    {
      "url": "https://www.notion.so/Team-Notes-Database-xyz789...",
      "destination": "docs/team-notes/",
      "recursive": true,
      "includeSubpages": true,
      "includeDatabases": true,
      "frontmatter": ["status", "tags", "owner"]
    }
  ]
}
```

**Why this shape:**
- URL field = what users paste; no manual ID extraction
- `destination` supports both flat file (single page) and directory (recursive expansion)
- `recursive`, `includeSubpages`, `includeDatabases` default OFF — opt-in per entry minimizes surprise API costs
- `frontmatter` lists database properties to promote to YAML frontmatter (when database content is imported as rows)
- Per-project file at `.claude/notion_pages.json` (matches `.claude/git-scopes.json` convention)

### Intent-Triggered (No Cron)

Per PROJECT.md Out of Scope: "Cron-based periodic NotebookLM sync — rejected; intent-based and session-end is sufficient"

**Triggering mechanisms for Notion import:**

1. **Explicit CLI:** `claude-dev-stack notion import [--project slug]` — manual one-shot
2. **Intent trigger from dev-research skill:** when user says "refresh Notion docs" or "import latest from Notion", skill invokes `notion-import` CLI
3. **Before NotebookLM sync:** `claude-dev-stack notebooklm sync` could accept `--include-notion` flag to chain Notion → vault → NotebookLM
4. **NOT automatic on session end:** Notion API is rate-limited (3 req/s); automatic would be wasteful for users with many pages

**Recommendation:** Options 1 + 2 for MVP. Defer option 3 to v0.10 if users request chaining.

### Dependencies on Existing Code

| Component | How Notion Import Reuses It |
|-----------|-----------------------------|
| `lib/docs.mjs` | New `notion` source type added to existing `addDocs()` source-picker; OR new top-level `lib/notion-import.mjs` module; **recommendation:** new module, keep `docs.mjs` focused on local file ops |
| `lib/docs.mjs::cleanNotionFilename` | **Reuse directly** — strips UUIDs from filenames; extract to `lib/shared.mjs` or import from docs.mjs |
| `lib/shared.mjs` | Reuse `askPath`, `prompt`, `ok/fail/warn/info`, `mkdirp` |
| `findVault()` from `lib/projects.mjs` | Reuse for project destination resolution |
| `lib/notebooklm-sync.mjs` | **No change** — existing D-03 doc-prefix sync picks up files from `vault/projects/{slug}/docs/` at next session end; Notion import is a writer to the same directory |
| MCP invocation | **NEW** — no existing MCP-calling code in `lib/`. Options: (a) call MCP via `claude mcp` CLI subprocess; (b) spawn Claude itself as a subprocess. **Recommendation:** (a) — matches v0.8 pattern of CLI wrappers (ADR-0001) |
| `lib/mcp.mjs` catalog | **Extend** — add `makenotion/notion-mcp-server` to 18-server catalog if not already present |
| `bin/install.mjs` wizard | Prompt to install Notion MCP if user selects "auto-import Notion pages" preset |

### Migration UX for Existing Manual `docs/` Content

Users who already have Notion content in `vault/projects/{slug}/docs/` (from manual `docs add`) shouldn't be affected:
- Notion import writes to `docs/` using URL-derived filename → collision possible
- **Mitigation:** Import command checks if target file exists; if so, compares content; if identical → skip; if different → prompt (overwrite / skip / rename) OR write to `docs/notion/{slug}.md` subdirectory to avoid collision entirely
- **Recommendation:** Always write to `docs/notion/` subdirectory — separates auto-imported from hand-added content; breaks no existing manual flow

### Table Stakes

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| Accept Notion share URLs (not raw page IDs) | Users copy-paste URLs from browser, not IDs | LOW | Regex extract 32-char ID from `notion.so/...-{id}` URL |
| Convert to markdown with frontmatter | NotebookLM indexes markdown; frontmatter preserves metadata | MEDIUM | Call MCP `retrieve page` in markdown mode; parse response; serialize frontmatter from Notion properties |
| Write to project-scoped vault path | Each project has its own docs; avoid cross-project leak | LOW | Use `findVault()` + project slug from `.planning` or explicit `--project` flag |
| Handle databases (not just pages) | Notion databases are common — product roadmaps, meeting notes | MEDIUM-HIGH | Fetch DB children via MCP `query database`, iterate rows, write one markdown per row with row properties as frontmatter |
| Filename cleanup (strip UUIDs, slugify) | Auto-generated filenames are ugly and non-deterministic | LOW | Reuse existing `cleanNotionFilename` |
| Collision handling | Re-importing a page shouldn't duplicate files | MEDIUM | Hash compare + overwrite policy; or write to `docs/notion/` subdir |
| Rate limit handling | Notion API: 3 req/s; hitting it mid-import is common | MEDIUM | Respect `429` responses from MCP; exponential backoff; or fixed 350ms pause between calls |
| Config file (`.claude/notion_pages.json`) per-project | Parallels `.claude/git-scopes.json`; config-as-code not CLI flags | LOW | JSON file; validation at read time |
| Wizard command (`claude-dev-stack notion add`) | Users add pages via interactive prompt, not hand-editing JSON | MEDIUM | Mirror `docs add` UX: prompt for URL, destination, recursive flag; append to JSON |
| Run command (`claude-dev-stack notion import`) | Users trigger import explicitly | LOW-MEDIUM | Reads JSON config, iterates pages, calls MCP, writes files |
| Doctor check for Notion MCP installed | Users forget MCP install after setup wizard; feature silently fails without it | LOW | Extend `lib/doctor.mjs`: check MCP catalog for Notion MCP, warn if not installed |
| Error if MCP not installed | Clear message, not a cryptic stack trace | LOW | Check MCP availability before any Notion call; fail with install hint |

### Differentiators

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **Config-first approach** (`.claude/notion_pages.json`) | Declarative, reviewable, git-trackable; no "mystery state" | LOW | New file; schema documented inline |
| **Selective import** (page-specific, not workspace-wide) | Notion workspaces have hundreds of pages; users want 3-5 specific ones | LOW | Config lists explicit pages only; no "import all" mode |
| **Subdirectory isolation** (`docs/notion/`) | Hand-added docs survive untouched; Notion-imported content is visibly auto-generated | LOW | Write to `vault/projects/{slug}/docs/notion/{slug}.md` |
| **Frontmatter preservation** from database properties | NotebookLM indexes frontmatter; users preserve Notion metadata without losing it to markdown-only | MEDIUM | Notion properties → YAML frontmatter mapping |
| **Recursive opt-in per entry** | One config entry can be "just this page", another can be "this database + all children" | MEDIUM | Flags in config schema |
| **Incremental import** (skip-unchanged via Notion `last_edited_time`) | Re-running import should be cheap — only fetch pages that changed upstream | MEDIUM | Notion API returns `last_edited_time`; compare against manifest or local file mtime |
| **Integration with NotebookLM sync** | User runs `notion import` → files land in vault → next session end → NotebookLM sync picks them up, no extra step | LOW | Zero new integration code — depends on existing `notebooklm-sync-trigger.mjs` session-end hook |
| **MCP-only architecture** (no REST fallback) | Rejected in PROJECT.md Out of Scope as a simplification; this is our choice, not a gap | LOW | Doctor-surfaces missing MCP clearly; no dual code path |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Whole-workspace import** | "Import all my Notion stuff" | Rejected in PROJECT.md Out of Scope; Notion workspaces easily have 500+ pages; rate limits; noise overwhelms NotebookLM source budget | Page-specific only via `notion_pages.json` |
| **Two-way sync** (vault → Notion) | "Keep Notion updated with vault changes" | Rejected in PROJECT.md Out of Scope; vault is canonical; two-way creates conflict resolution UX nightmare | Vault is SSOT; Notion is read-only source |
| **Notion REST API fallback** | "What if MCP breaks / isn't installed?" | Rejected in PROJECT.md Out of Scope; adds `notionhq/client` dep (breaks single-dep); doubles test surface; maintenance burden | MCP-only; doctor warns on missing MCP |
| **Cron-based periodic import** | "Auto-refresh every hour" | Rejected (PROJECT.md Out of Scope); rate limits; unnecessary for Notion's edit cadence | Intent-triggered only (CLI or skill invocation) |
| **Auto-download Notion media** | "Preserve images locally" | Signed URLs expire; storage grows unbounded; breaks `docs/` model of clean markdown | Leave URLs in markdown; document limitation; users upload critical images manually |
| **Automatic sub-page recursion by default** | "Follow all links" | One page can expand to 50 API calls; blows rate limits; surprising bill for users on Notion paid tiers | `recursive: false` default; explicit opt-in per entry |
| **Notion property → tag extraction for NotebookLM** | "Tag pages by Notion status" | NotebookLM doesn't support tag-scoped queries; frontmatter is the right place | Frontmatter only |
| **Hand-edit MCP config from within `notion import`** | "One-stop shop" | Conflates MCP management (`lib/mcp.mjs`) with Notion import; MCP is user's Claude config, not ours | Doctor points users to `claude-dev-stack mcp` command |
| **Parallel page fetch** (like `awkoy/notion-mcp-server` does) | "Faster imports" | 3 req/s rate limit means parallelism doesn't help; adds complexity for zero gain | Sequential with respectful pacing |

---

## Feature Dependencies

```
git-conventions skill
    ├─requires─> lib/project-setup.mjs (copies skill to .claude/skills/)
    ├─requires─> lib/shared.mjs (prompts, c, ok/fail/info)
    └─enhanced by─> lib/scopes.mjs (new, wizard for .claude/git-scopes.json)
                        └─requires─> lib/scope-detect.mjs (new, FS heuristics)
                                         └─reuses─> existsSync/readdirSync patterns from lib/notebooklm-sync.mjs

NotebookLM per-project (new mode)
    ├─extends─> lib/notebooklm-sync.mjs::buildTitle (add projectScoped flag)
    ├─extends─> lib/notebooklm-manifest.mjs (add notebooks field)
    ├─reuses─> lib/notebooklm.mjs::ensureNotebook, uploadSource, listNotebooks
    ├─requires─> lib/notebooklm-migrate.mjs (new — one-shot migration)
    │               └─requires─> listSources wrapper in lib/notebooklm.mjs (may need addition — verify notebooklm-py supports)
    ├─extends─> lib/doctor.mjs NotebookLM section (per-project stats)
    ├─extends─> bin/install.mjs wizard (new vs existing user migration prompt)
    └─enhances─> dev-research skill (auto-scope queries to current project notebook)

Notion auto-import
    ├─requires─> lib/notion-import.mjs (new module)
    ├─requires─> .claude/notion_pages.json (new config file per project)
    ├─reuses─> lib/docs.mjs::cleanNotionFilename (extract to shared or import)
    ├─reuses─> lib/shared.mjs helpers
    ├─reuses─> findVault() from lib/projects.mjs
    ├─requires─> Notion MCP installed via lib/mcp.mjs catalog
    ├─extends─> lib/mcp.mjs catalog (add makenotion/notion-mcp-server if missing)
    ├─extends─> lib/doctor.mjs (check MCP installed + config valid)
    └─integrates─> lib/notebooklm-sync.mjs (no code change — writes to docs/notion/ which existing sync picks up)

Cross-feature relationships:
  - git-conventions <-> NotebookLM sync: NONE (orthogonal)
  - git-conventions <-> Notion import: NONE (orthogonal)
  - NotebookLM per-project <-> Notion import: Notion writes to vault, NotebookLM picks up automatically
  - All three <-> lib/project-setup.mjs: all create/modify .claude/ files that project-setup copies/manages
```

### Dependency Notes

- **git-conventions scope wizard requires project-setup to run first:** the `.claude/skills/git-conventions/` directory must exist before scopes can be written. Order: `project-setup` → `scopes` in `bin/install.mjs`.
- **NotebookLM migration requires `listSources` capability:** verification needed on whether `notebooklm-py` exposes source enumeration. If not, migration needs to walk vault files and attempt delete-by-title for each (lossy fallback) — significantly worse UX. **This is the #1 validation gate for Phase ordering.**
- **Notion import integrates trivially with NotebookLM sync:** zero new integration code; `docs/notion/` is just another subdirectory the existing walker picks up via D-03 doc-prefix logic. No changes to sync module.
- **Notion import requires MCP management knowledge:** `lib/mcp.mjs` catalog and install flow are prerequisites; if user has never run `claude-dev-stack mcp`, doctor guides them.

---

## MVP Definition for v0.9

### Launch With (v0.9.0)

Based on the above analysis and PROJECT.md's explicit "Target features" list:

**git-conventions skill ecosystem:**
- [ ] Parameterized `git-conventions` SKILL.md template that reads `.claude/git-scopes.json`
- [ ] `lib/scope-detect.mjs` with auto-detection for: single-package Node, pnpm workspaces, npm workspaces, Nx, Turborepo, Cargo, Go multi-module, Python uv — **at least 7 stacks** per PROJECT.md target
- [ ] `lib/scopes.mjs` + `claude-dev-stack scopes` subcommand (interactive wizard: detect → preview → confirm → write JSON)
- [ ] `.claude/git-scopes.json` schema v1 with `commit.types`, `commit.scopes`, `branch.base`, `branch.quickBranchTemplate`, `commit.coAuthoredBy` toggle, `safety` block
- [ ] `bin/install.mjs` wizard integration — auto-run scope detection per project during setup
- [ ] `lib/doctor.mjs` check for `.claude/git-scopes.json` presence + stale detection
- [ ] Optional commitlint installer: `claude-dev-stack scopes --install-lint` (generates `commitlint.config.js` from JSON, installs deps via `spawnSync`)
- [ ] Main branch auto-detect via `git symbolic-ref`
- [ ] Co-Authored-By toggle (default OFF for claude-dev-stack)
- [ ] `tests/scope-detect.test.mjs` + `tests/scopes.test.mjs`

**NotebookLM per-project notebooks:**
- [ ] `buildTitle` extension with `projectScoped` flag (title without `{project}__` prefix when notebook is project-scoped)
- [ ] Manifest schema v2 with `notebooks` field mapping `{ projectSlug → notebookId }`; one-way upgrade from v1 schema
- [ ] `syncVaultPerProject()` in `lib/notebooklm-sync.mjs` (or refactor existing `syncVault` with mode flag — **decision needed at Phase 6 requirements**)
- [ ] `lib/notebooklm-migrate.mjs` — one-shot migration of existing 27 sources from `claude-dev-stack-vault` to per-project notebooks
- [ ] `claude-dev-stack notebooklm migrate` CLI subcommand with dry-run default + `--execute` flag
- [ ] Migration report at end (uploaded / failed / duration / per-project counts)
- [ ] Doctor extension: per-project notebook health
- [ ] `bin/install.mjs` wizard: "Create one notebook per project?" prompt for new users; migration hint for existing users
- [ ] `dev-research` skill update: auto-scope query to current project notebook
- [ ] `tests/notebooklm-migrate.test.mjs` + update existing `notebooklm-sync` tests

**Notion auto-import:**
- [ ] `lib/notion-import.mjs` — new module
- [ ] `.claude/notion_pages.json` schema v1 (URL-based, recursive opt-in, frontmatter list)
- [ ] `claude-dev-stack notion add` — interactive wizard to add pages to config
- [ ] `claude-dev-stack notion import` — read config + invoke MCP + write to `docs/notion/`
- [ ] Notion share URL → page ID extraction regex
- [ ] Database row → markdown conversion with frontmatter
- [ ] Collision handling (skip unchanged via hash; subdir isolation)
- [ ] Rate limit handling (respect 429s or fixed pacing)
- [ ] `lib/doctor.mjs` check: Notion MCP installed + config valid
- [ ] `lib/mcp.mjs` catalog: ensure `makenotion/notion-mcp-server` is present
- [ ] `tests/notion-import.test.mjs` (mock MCP via bash stub per project convention)

### Add After Validation (v0.9.x patches)

- [ ] Notion `last_edited_time` incremental import optimization — trigger: users complain about re-importing unchanged pages
- [ ] Scope wizard "edit existing scopes" mode (add/remove scopes without full re-detect) — trigger: workspace churn
- [ ] Migration rollback command (delete per-project notebooks, restore shared) — trigger: migration goes wrong for a user

### Future Consideration (v0.10+)

- [ ] Gitmoji support in `git-conventions` (if users request)
- [ ] Cross-notebook NotebookLM queries via Gemini App integration (research spike)
- [ ] Notion workspace-wide import with glob filters
- [ ] Ticket auto-extraction from branch name (Claude-side feature, no CLI code)
- [ ] Analytics dashboard NotebookLM integration (deferred in PROJECT.md)
- [ ] `.planning/` structural split (deferred in PROJECT.md)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `git-scopes.json` schema + skill template | HIGH | LOW | **P1** |
| `lib/scope-detect.mjs` (7+ stacks) | HIGH | MEDIUM | **P1** |
| `claude-dev-stack scopes` wizard | HIGH | MEDIUM | **P1** |
| Install-time auto-detection | HIGH | LOW | **P1** |
| Optional commitlint installer | MEDIUM | MEDIUM | **P2** |
| Co-Authored-By toggle | HIGH (for claude-dev-stack) | LOW | **P1** |
| Branch auto-detect | MEDIUM | LOW | **P2** |
| Per-project notebook mode | HIGH | MEDIUM | **P1** |
| 27-source migration script | HIGH | HIGH | **P1** (critical path) |
| Migration dry-run | HIGH | LOW | **P1** |
| Doctor per-project notebook stats | MEDIUM | LOW | **P2** |
| `dev-research` scope-to-project | HIGH | LOW-MEDIUM | **P1** |
| Manifest v2 schema | HIGH | LOW | **P1** |
| Notion MCP import wizard | HIGH | MEDIUM | **P1** |
| Notion database support | MEDIUM | MEDIUM-HIGH | **P2** (or **P1** if user has DB-heavy Notion workspace) |
| Notion subdirectory isolation (`docs/notion/`) | HIGH | LOW | **P1** |
| Notion collision handling | HIGH | MEDIUM | **P1** |
| Notion recursive import | LOW (opt-in) | MEDIUM | **P2** |
| Notion incremental optimization | MEDIUM | MEDIUM | **P2** |

**Priority key:**
- P1: Must ship in v0.9.0 launch
- P2: Should ship in v0.9.0 if schedule allows; otherwise v0.9.x patch
- P3: Defer to v0.10

---

## Competitor / Reference Feature Analysis

| Feature | NMP git-conventions (reference) | commitlint / commitlint-config-monorepo | czg / commitizen | claude-dev-stack v0.9 (target) |
|---------|--------------------------------|------------------------------------------|------------------|-------------------------------|
| Human-readable policy doc | ✓ static markdown | — | — | ✓ parameterized template |
| Scope auto-detection | — | ✓ (pnpm only) | ✓ | ✓ (7+ stacks) |
| Runtime invocation (by AI) | ✓ (Skill tool) | — | ✓ interactive wizard | ✓ (Skill tool + JSON config) |
| CI lint enforcement | — (relies on external husky) | ✓ | — | ✓ optional installer |
| Per-project parameterization | — (hardcoded) | ✓ (config file) | ✓ (config file) | ✓ (.claude/git-scopes.json) |
| Co-Authored-By toggle | — (always on) | ✓ (via body-must-not-match rule) | ✓ | ✓ explicit field |
| Safety rules (never --force) | ✓ prose | — | — | ✓ prose + enforceable list |

| Feature | NotebookLM single-notebook (v0.8) | NotebookLM per-project (v0.9 target) | Cross-notebook via Gemini App |
|---------|-----------------------------------|--------------------------------------|-------------------------------|
| Single-project query | Friction: requires `{project}__` prefix filter | Zero friction | N/A (notebook is a source) |
| Cross-project query | Possible with dual prefix | Requires Gemini App + notebook mounting | Native |
| Source naming | `{project}__file.md` ugly | Clean `file.md` | N/A |
| Duplicate protection | Single notebook: dedup by title within it | Per-notebook dedup + duplicate-notebook throw | N/A |
| 100-notebook free-tier limit | Not close (1 notebook) | Realistic at 5-20 projects (safe) | N/A |

| Feature | Manual `docs add` (v0.8) | Obsidian Notion Sync | n8n Notion node | claude-dev-stack Notion import (v0.9) |
|---------|---------------------------|----------------------|-----------------|---------------------------------------|
| Config-as-code | — (interactive only) | ✓ (plugin settings) | ✓ (workflow JSON) | ✓ `.claude/notion_pages.json` |
| Rich text fidelity | User-controlled (Notion export) | Medium (known lossy) | Medium | Medium (markdown mode) |
| Databases | CSV import partially supported | ✓ | ✓ | ✓ (frontmatter preservation) |
| Sub-page recursion | — (manual) | ✓ (configurable) | Workflow-driven | ✓ opt-in per entry |
| Media download | — | ✓ | Workflow-driven | — (rejected as anti-feature) |
| Incremental | — (full re-export) | ✓ last_edited_time | ✓ | P2 (v0.9.x) |
| MCP-based (AI-native) | — | — | — | ✓ **unique** |

---

## Sources

- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [commitlint - Lint commit messages (conventional-changelog/commitlint)](https://github.com/conventional-changelog/commitlint)
- [commitlint-config-monorepo (pskfyi)](https://github.com/pskfyi/commitlint-config-monorepo)
- [@commitlint/config-pnpm-scopes](https://www.npmjs.com/package/@commitlint/config-pnpm-scopes)
- [commitlint-plugin-workspace-scopes](https://www.npmjs.com/package/commitlint-plugin-workspace-scopes)
- [Commitizen Monorepo guidance](https://commitizen-tools.github.io/commitizen/tutorials/monorepo_guidance/)
- [NotebookLM FAQ (Google)](https://support.google.com/notebooklm/answer/16269187?hl=en)
- [NotebookLM Limits Explained (Elephas)](https://elephas.app/blog/notebooklm-source-limits)
- [NotebookLM Advanced Guide 2026 (shareuhack)](https://www.shareuhack.com/en/posts/notebooklm-advanced-guide-2026)
- [NotebookLM Limitations: 8 Gaps (Atlas Workspace)](https://www.atlasworkspace.ai/blog/notebooklm-limitations)
- [Official Notion MCP Server (makenotion/notion-mcp-server)](https://github.com/makenotion/notion-mcp-server)
- [Notion MCP Supported Tools](https://developers.notion.com/guides/mcp/mcp-supported-tools)
- [Notion hosted MCP server inside look](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look)
- [suekou/mcp-notion-server](https://github.com/suekou/mcp-notion-server)
- [awkoy/notion-mcp-server (parallel recursive retrieval)](https://github.com/awkoy/notion-mcp-server)
- [Notion Retrieve block children API](https://developers.notion.com/reference/get-block-children)
- [Notion working with page content](https://developers.notion.com/docs/working-with-page-content)

**Internal references:**
- `~/Work/NMP/.claude/skills/git-conventions/SKILL.md` (reference implementation)
- `~/Work/NMP/.claude/skills/feature-development/SKILL.md` (cross-skill reference pattern)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/.planning/PROJECT.md` (v0.9 milestone scope)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/docs.mjs` (existing Notion paste flow)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/notebooklm-sync.mjs` (D-01..D-20 sync decisions)
- `~/.claude/projects/-Users-eugenenakoneschniy-Projects-claude-dev-stack/memory/MEMORY.md` (No Co-Authored-By rule)

---

## Confidence Assessment

| Feature Area | Confidence | Reasoning |
|--------------|------------|-----------|
| git-conventions skill structure | **HIGH** | NMP reference implementation read directly; NMP/claude-dev-stack contradiction identified (Co-Authored-By); scope detection heuristics match well-documented ecosystem patterns |
| Scope auto-detection coverage | **MEDIUM-HIGH** | 7-stack matrix is sound for Node/Rust/Go/Python; less certain about exotic cases (Bazel, Pants, Gradle composite builds) — can be added incrementally |
| NotebookLM per-project migration | **MEDIUM** | Existing v0.8 code patterns (D-01..D-20) are well understood; **open question: does `notebooklm-py` expose source enumeration?** If yes → straightforward. If no → migration fallback path needs design |
| NotebookLM notebook limit risk | **HIGH** | 100-notebook free-tier limit confirmed; users with 5-20 projects are safe; flag for users with 50+ projects |
| Notion MCP tool availability | **HIGH** | Official `makenotion/notion-mcp-server` is production-ready; markdown conversion flag documented |
| Notion database → markdown conversion | **MEDIUM** | Edge cases are well-known but the precise MCP response shape needs verification during Phase 6 discovery |
| Notion rate limiting | **MEDIUM** | 3 req/s documented; exact 429 response shape varies by MCP implementation |
| Cross-feature integration | **HIGH** | All three features touch existing well-understood modules (`project-setup`, `notebooklm-sync`, `docs`); no new integration surface |

**Open questions flagged for requirements phase (Phase 6):**
1. Does `notebooklm-py` expose source enumeration (`list sources` in a notebook)? Determines migration complexity.
2. Should `syncVaultPerProject` replace `syncVault` or coexist? Impacts backward compatibility guarantee.
3. For Notion, is the MCP invocation via `claude mcp` CLI subprocess viable, or does the CLI not expose MCP tool calls directly? May require alternative invocation.
4. Does the v0.8 ADR-0012 severity discipline cover "missing `.claude/git-scopes.json`" as ERROR/WARN/INFO? Likely WARN for existing projects, ERROR for new installs that ran the wizard.
5. What happens if a user runs `claude-dev-stack scopes` against a project that has no detectable stack (no package.json, no Cargo.toml, etc.)? Fallback to top-level-dir scopes is MEDIUM complexity — worth confirming the UX at Phase 6.

---

*Feature research for: claude-dev-stack v0.9 milestone (git conventions ecosystem, per-project NotebookLM, Notion MCP auto-import)*
*Researched: 2026-04-11*
