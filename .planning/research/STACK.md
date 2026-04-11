# Stack Research — v0.9 (Git Conventions & NotebookLM Per-Project)

**Domain:** CLI tool (Node.js ESM, single-dep) — subsequent milestone
**Researched:** 2026-04-11
**Confidence:** HIGH

---

## TL;DR

**No new npm dependencies required.** Every v0.9 feature can ship using Node.js builtins, the existing `prompts@^2.4.2` dep, the existing `notebooklm-py` system dep (still pinned at `>= 0.3.4` — no upgrade target available), and the `claude.ai Notion` hosted MCP server (zero code dep — MCP is invoked by Claude itself, not by claude-dev-stack at runtime).

The single-dep constraint (`prompts` only) is **preserved unchanged**. The `notebooklm-py >= 0.3.4` system dep stays the sole non-JS dependency, and the only new *optional* system dependency is `@commitlint/cli` (installed only if the user opts in via the `scopes` wizard — per-project, never a claude-dev-stack dep).

Three integration surfaces get extended but no new runtime dependencies:
1. **git-conventions**: pure Node builtins (`fs`, `path`) read `.claude/git-scopes.json` and auto-detect monorepo structures from well-known files; the skill itself is a markdown template parameterized at install time.
2. **NotebookLM per-project**: reuse existing `lib/notebooklm.mjs` functions (`listNotebooks`, `createNotebook`, `listSources`, `uploadSource`, `deleteSource`, `deleteSourceByTitle`). Migration uses the already-shipped primitives — no new CLI commands or `notebooklm-py` version bump needed. Confirmation: **the CLI wrapper already uses `source list -n {id} --json` in production (lib/notebooklm.mjs:346) — the command works, the upstream docs are just incomplete.**
3. **Notion auto-import**: delegates to the `claude.ai Notion` hosted MCP server which is invoked by Claude Code itself (not by our CLI). Our CLI only reads/writes `.claude/notion_pages.json` config and the resulting vault markdown files. Notion-flavored markdown is returned natively — no HTML→md conversion library needed.

---

## Recommended Stack

### Core Technologies (v0.9 additions)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js builtins (`fs`, `path`, `crypto`) | Node 18+ | Monorepo detection, config read/write, `.claude/git-scopes.json` parsing, SHA-256 for change tracking | Already the house style — lib/notebooklm-manifest.mjs proves this pattern works for structured JSON state. Zero new deps. |
| `prompts@^2.4.2` | pinned | `claude-dev-stack scopes` interactive wizard (confirm detected scopes, add custom, pick commitlint) | Already the only dep; the setup wizard for this milestone reuses `askPath`/`prompt` helpers from `lib/shared.mjs`. |
| `notebooklm-py` (system) | `>= 0.3.4` | Per-project notebook creation, source listing, migration source-by-source | Already required since v0.8; latest on PyPI is **still 0.3.4** (released 2026-03-12, confirmed 2026-04-11) — no new features upstream for v0.9. `lib/notebooklm.mjs` already exposes every primitive needed for migration. |
| `claude.ai Notion` (hosted MCP) | — | `notion-fetch` / `notion-search` invocation for auto-import | Official Notion-hosted MCP server; no code dependency since Claude Code invokes MCP tools directly. OAuth one-click auth, Notion-flavored markdown responses. Zero runtime cost for claude-dev-stack — we only read the markdown files that Claude writes into vault. |

### Supporting Libraries (NEW — all OPTIONAL and USER-INSTALLED, NOT claude-dev-stack deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@commitlint/cli` + `@commitlint/config-conventional` | `^19.x` | Hard enforcement layer for conventional commit format in git `commit-msg` hook | Opt-in during `claude-dev-stack scopes` wizard. Installed **per user project** (not into claude-dev-stack itself) via `npm install --save-dev` printed to the user. We never `spawnSync npm install` it ourselves. |
| `husky` (or native `.git/hooks/commit-msg` script) | `^9.x` | Wire commitlint into git hooks | Only if user picks the commitlint path AND the project doesn't already have husky. We print the install commands; user runs them. |

**Critical boundary**: none of these appear in `package.json` of claude-dev-stack. They are documented install commands output by the `scopes` wizard when the user answers "yes" to the "install commitlint enforcement?" prompt. Analogous to how v0.8 handles `notebooklm-py` (print `pipx install notebooklm-py`, never auto-install).

### Development Tools (unchanged from v0.8)

| Tool | Purpose | Notes |
|------|---------|-------|
| `node --test` (builtin) | Test runner for new modules (`lib/git-scopes.mjs`, `lib/notion-import.mjs`, migration script) | Continue the pattern: every new `lib/*.mjs` gets a matching `tests/*.test.mjs`. Bash stub on `PATH` for `notebooklm` already established in v0.8. |
| `node --check` (builtin, CI) | Syntax validation of `.mjs` files | No change — already part of the GitHub Actions matrix. |

---

## Installation

**claude-dev-stack package.json — NO CHANGES to dependencies.** Stays at:

```json
{
  "dependencies": { "prompts": "^2.4.2" },
  "engines": { "node": ">=18" }
}
```

**System dependencies (unchanged from v0.8, feature-scoped):**

```bash
# Still required only for NotebookLM sync feature
pipx install notebooklm-py          # primary
pip install --user notebooklm-py    # fallback
```

**User-project opt-in (printed by `claude-dev-stack scopes` wizard, never executed by us):**

```bash
# Only if user accepts the "install commitlint enforcement?" prompt
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
npx husky init
echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

**Notion MCP auth (user-driven, one-time):**

The user runs `claude mcp add notion` (or clicks the connector in Claude Code settings). OAuth flow is handled entirely by Claude Code + Notion. claude-dev-stack **never** reads a Notion integration token, never stores credentials, never touches `~/.config/claude/mcp_settings.json`. Mirrors the v0.8 posture on NotebookLM credentials per ADR-0001.

---

## Feature-by-Feature Stack Decisions

### 1. git-conventions skill ecosystem

**Problem shape:** Ship a per-project skill (`{project}/.claude/skills/git-conventions/SKILL.md`) whose commit-format scope list is parameterized from a `.claude/git-scopes.json` file, auto-generated by inspecting the project structure.

#### Skill templating — NO template engine

**Decision:** String-replace placeholder tokens (`{{SCOPES}}`, `{{TICKET_PREFIX}}`, `{{MAIN_BRANCH}}`, `{{TYPES}}`) in a static `templates/skills/git-conventions/SKILL.md.tmpl` via plain `String.prototype.replaceAll`.

**Why not handlebars / mustache / ejs / nunjucks:**
- All violate single-dep.
- `lib/project-setup.mjs` already demonstrates the pattern: read template, replace markers, write to target. Existing marker convention `<!-- @claude-dev-stack:start/end -->` for idempotent updates. Reuse this.
- Template has no loops/conditions complex enough to justify a template engine — it's a scope list and a handful of substitutions. If we ever need loops, `Array.prototype.join('\n- ')` solves them.

**Confidence:** HIGH — direct extrapolation of v0.7.8 `lib/project-setup.mjs` pattern.

#### Monorepo auto-detection — lookup table of sentinel files

**Decision:** A pure-Node `lib/git-scopes.mjs` module with a single exported function `detectScopes(projectDir)` that reads a hardcoded ordered list of sentinel files and returns `{ scopes: string[], confidence: 'high'|'medium'|'low', source: string }`.

**Detection order (highest-signal first):**

| # | Sentinel | Parse strategy | Scope extraction |
|---|----------|---------------|------------------|
| 1 | `pnpm-workspace.yaml` | Regex-only (no yaml parser). Match `^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$` under `packages:` | Each glob expanded via `readdirSync` — basenames become scopes. |
| 2 | `package.json` with `"workspaces"` field | `JSON.parse` then read `workspaces` (array) or `workspaces.packages` (object form) | Same glob-to-basename expansion. |
| 3 | `lerna.json` with `"packages"` | `JSON.parse` | Same. |
| 4 | `apps/` + `packages/` directory pair | `readdirSync(apps)` + `readdirSync(packages)` | Union of subdirectory basenames. Medium confidence (heuristic). |
| 5 | `Cargo.toml` with `[workspace]` members | Regex on `members\s*=\s*\[(.*?)\]` (single-line and multi-line) | Members → basenames. |
| 6 | `pom.xml` with `<modules>` | Regex `<module>([^<]+)</module>` | Each module path → basename. |
| 7 | `settings.gradle` / `settings.gradle.kts` with `include` | Regex `include[\s(]+['"]([^'"]+)['"]` | Split on `:`, take last segment. |
| 8 | Single-package fallback | — | `['core']` (single sentinel scope so the skill still has a valid list). |

**Why regex not proper YAML/TOML/XML parsers:**
- **YAML parser** (e.g. `yaml`, `js-yaml`) → violates single-dep.
- **TOML parser** (e.g. `@iarna/toml`) → violates single-dep.
- **XML parser** (e.g. `fast-xml-parser`) → violates single-dep.
- The alternative — shelling out to `python -c 'import tomllib; ...'` or `yq`/`xmllint` — adds a system-dep per stack type. Unacceptable. The reference implementation (`~/Work/NMP/.claude/skills/git-conventions/SKILL.md`) uses a **hardcoded** scope list; auto-detection is an enhancement, not a correctness requirement. A 90% regex is strictly better than 0% hardcoded.
- If a regex miss happens, the `scopes` wizard shows the user the detected list and asks them to add missing ones. The wizard is the failsafe, not the regex.

**Why not `git ls-files` + path heuristics:**
- Works, but produces noisy results on large repos (all files, not packages).
- Fails on fresh repos pre-first-commit.
- Sentinel-file approach is deterministic and fast (<10ms on cold fs).

**Confidence:** HIGH on 1–4 (covers >80% of target users per modern JS monorepo conventions), MEDIUM on 5–7 (rare in target-user population but cheap to include), HIGH on the regex approach over parser deps.

#### `.claude/git-scopes.json` format

**Decision:** Minimal JSON schema, versioned, hand-editable:

```json
{
  "version": 1,
  "scopes": ["core", "ui", "api"],
  "types": ["feat", "fix", "refactor", "test", "docs", "ci", "chore"],
  "ticket_prefix": "RI-",
  "main_branch": "main",
  "commitlint_enforced": false
}
```

Parsed by `JSON.parse`. Written atomically via `writeFileSync` to `.tmp` then `renameSync` — same pattern as `lib/notebooklm-manifest.mjs` (which is already a proven atomic-write template in the codebase).

**Why version field:** mirrors the manifest pattern (D-02 in notebooklm-manifest decisions) — lets v0.10+ evolve the schema without breaking existing installs.

**Confidence:** HIGH.

#### Optional commitlint layer

**Decision:** At `scopes` wizard end, prompt:

> "Install commitlint to enforce this format at commit time? (y/N)"

If yes: **print** the four install commands above, write a stub `.husky/commit-msg` (using `writeFileSync` and `chmod +x`), write a `commitlint.config.mjs` that matches the generated scopes list, set `commitlint_enforced: true` in `git-scopes.json`. **Never invoke `npm install` from our process.**

**Why not auto-install:** would pull npm from our CLI into the user's project, risk changing their lockfile, violate the "no post-install step" distribution constraint. Print-commands posture is the same stance we take on `notebooklm-py` and is well-established in the codebase.

**commitlint.config.mjs generated content** (minimal, extends conventional like `~/Work/NMP/commitlint.config.mjs` which just re-exports a shared config — we generate an inline config instead of an external import since the user doesn't have a shared config package):

```javascript
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['core', 'ui', 'api']],  // from git-scopes.json
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'test', 'docs', 'ci', 'chore']],
  },
};
```

**Confidence:** HIGH — `@commitlint/cli@19.x` is the current stable major, Node 18+ compatible, widely adopted.

---

### 2. NotebookLM per-project notebooks + 27-source migration

#### Is there a newer `notebooklm-py` version? — NO

**Finding (verified 2026-04-11):**
- PyPI latest: **0.3.4** (released 2026-03-12)
- No newer release on GitHub. Release notes for 0.3.4 added `notebooklm metadata --json` (notebook metadata + simplified source list), `notebooklm generate video --format cinematic`, and `notebooklm source delete-by-title`.
- **No batch migration commands, no `source move`, no `source copy`, no cross-notebook operations.**

**Implication for migration:** we build a pure-JS migration script in `lib/notebooklm-migrate.mjs` that orchestrates existing primitives:

1. `listNotebooks()` → find `claude-dev-stack-vault` by title.
2. `listSources(sharedId)` → enumerate 27 sources.
3. For each source, parse the title prefix (`biko-pro__2026-04-11-session.md` → project = `biko-pro`, basename = `2026-04-11-session.md`).
4. `createNotebook(`{project}`)` if not already created this run.
5. **Re-upload from vault** (`uploadSource(newNotebookId, absPathInVault, { title: originalTitle })`) — NOT a cross-notebook copy (impossible upstream).
6. `deleteSourceByTitle(sharedId, originalTitle)` — remove from shared notebook after successful upload.
7. Update `~/vault/.notebooklm-sync.json` manifest entries with new `notebook_source_id` and the new notebook ID mapping.

**Critical detail**: the migration re-uploads **from vault files**, not from NotebookLM. This is only possible because the vault is the canonical source of truth (stated in v0.8 ADRs). If a vault file was deleted after the original sync but still exists in the shared notebook, the migration **cannot** recover it — it gets logged and skipped. This is acceptable per "vault is canonical."

#### `source list --json` — already works despite docs gap

**Finding:** The upstream CLI reference doesn't explicitly document `--json` for `source list`, BUT the claude-dev-stack production code already uses it successfully at `lib/notebooklm.mjs:346`:

```javascript
const args = ['source', 'list', '-n', notebookId, '--json'];
```

and this has been shipping in v0.8 since 2026-04 with 247 tests passing. **Conclusion:** the flag works, the docs are incomplete. Do not switch to `notebooklm metadata --json` unless we find a bug with `source list --json` during Phase 6 implementation.

**Fallback option if needed:** `notebooklm metadata --notebook {id} --json` per the 0.3.4 release notes — confirmed alternative documented path, returns metadata + simplified source list. Keep in back pocket.

**Confidence:** HIGH on `source list --json` working (already in production), MEDIUM on the docs gap being permanent (not clear if 0.4.x will formalize it).

#### Per-notebook naming scheme

**Decision:** Notebook titles become `claude-dev-stack-{projectSlug}` (e.g. `claude-dev-stack-biko-pro`, `claude-dev-stack-claude-dev-stack`). Source titles **drop the `{project}__` prefix** since the notebook name already scopes them.

**Why keep `claude-dev-stack-` prefix on notebook names:**
- Collision safety — the user may have non-CDS notebooks in the same account.
- Makes `listNotebooks()` filtering trivial (`.startsWith('claude-dev-stack-')`).
- Migration can identify "is this a CDS-managed notebook?" without extra state.

**Why drop `{project}__` from source titles:**
- Redundant: notebook scope already provides project identity.
- `dev-research` skill's per-project filter becomes trivial (just pick the right notebook; no filename regex).
- Cleaner UI in NotebookLM web view.

**Migration title rewrite:** during migration, the function `rewriteTitleForPerProject(oldTitle)` strips the `{project}__` prefix. `lib/notebooklm-sync.mjs::buildTitle` (already a single source of truth per D-06 in the v0.8 decisions) gets a **second branch** keyed on a `scheme` parameter: `'shared'` (legacy) vs `'per-project'` (v0.9+). Migration runs in `'per-project'` mode.

**Confidence:** HIGH on the decision, MEDIUM on whether existing v0.8 users will have non-CDS notebooks to worry about (low probability based on user description — "user has no existing NotebookLM notebook yet" per PROJECT.md context).

#### Manifest schema bump

**Decision:** Bump `MANIFEST_VERSION` from `1` to `2`. New shape:

```json
{
  "version": 2,
  "generated_at": "2026-04-11T12:00:00.000Z",
  "notebooks": {
    "biko-pro": "nb_abc123",
    "claude-dev-stack": "nb_def456"
  },
  "files": {
    "projects/biko-pro/context.md": {
      "hash": "...",
      "notebook_source_id": "src_xyz",
      "notebook_id": "nb_abc123",
      "uploaded_at": "2026-04-11T12:00:00.000Z"
    }
  }
}
```

**Why add `notebook_id` per file**: lets migration verify "this file's source lives in `nb_abc123`" before issuing a delete/re-upload. Belt and braces.

**Migration path (automatic):** `readManifest` in `lib/notebooklm-manifest.mjs` already has the `version !== MANIFEST_VERSION` → `recoverCorruptManifest` branch. We **replace** that branch with a dedicated `migrateV1toV2` function that preserves `files` entries and builds an empty `notebooks` map. Users running the migration script afterwards populate `notebooks`.

**Confidence:** HIGH — the versioned manifest was designed for exactly this.

#### No new dependencies for migration

- SHA-256: `node:crypto` (already used in manifest).
- File copy: `node:fs/cp` or `copyFileSync` (already used in `uploadSource` cp-to-tmp workaround).
- Atomic writes: same `.tmp + renameSync` pattern already in `writeManifest`.
- Logging: `lib/shared.mjs::info/warn/ok/fail`.
- Rate-limit handling: existing `NotebooklmRateLimitError` + `syncVault`'s abort pattern. Migration **must** respect rate limits (27 sources × 2 operations = up to 54 API calls; NotebookLM rate limits are strict).

**Rate-limit posture for migration:** unlike `syncVault` which aborts on rate limit, migration should **pause and resume**. Strategy:
- Sleep 60 seconds on rate-limit error (via `setTimeout` in a promise — no lib needed).
- Retry up to 3 times per source.
- If still rate-limited, abort with a clear "N/27 sources migrated, re-run `claude-dev-stack notebooklm migrate` to continue" message.
- Migration is idempotent: if a source already exists in the per-project notebook (checked via `listSources`), skip upload.

**Confidence:** HIGH on approach, MEDIUM on the exact sleep duration (tune during Phase 6 implementation based on observed behavior).

---

### 3. Notion auto-import via `claude.ai Notion` MCP

#### MCP server availability — CONFIRMED

**Finding (verified 2026-04-11):**
- Official: `@notionhq/notion-mcp-server` (local) and `https://mcp.notion.com/mcp` (hosted, recommended).
- **Claude Code integration path:** user adds the Notion connector in Claude Code Settings → Connectors, or via `claude mcp add`. One-click OAuth. No PAT, no integration token, no env var.
- **17+ tools** supported: `notion-search`, `notion-fetch`, `notion-create-pages`, `notion-update-page`, `notion-move-pages`, `notion-duplicate-page`, `notion-create-database`, `notion-update-data-source`, `notion-create-view`, `notion-update-view`, `notion-query-data-sources`, `notion-query-database-view`, `notion-create-comment`, `notion-get-comments`, `notion-get-teams`, `notion-get-users`, `notion-get-user`, `notion-get-self`.
- **For our use case we only need `notion-fetch` and `notion-search`.** Both available on the hosted server, both require Notion AI plan access for cross-tool search; plain workspace fetch is free-tier compatible.

**Auth setup for claude-dev-stack**: we ship **zero auth code**. The skill `dev-research` already demonstrates the pattern — relies on Claude Code's MCP layer, tells Claude "use notion-fetch to get page X", Claude either has the connector or errors out. Our `notion-import` skill does the same.

**Confidence:** HIGH — confirmed against docs 2026-04-11.

#### Response format — Notion-flavored markdown (already)

**Finding:** Notion's hosted MCP server returns content in **Notion-flavored markdown** natively. Per docs: "Notion MCP tools are built with Notion-flavored Markdown in mind, with tool descriptions and responses tailored for agentic workflows". `notion-fetch` returns markdown, not block JSON, in the hosted server.

**Implication:** **we do not need a HTML→markdown or block-JSON→markdown conversion library.** The `lib/docs.mjs` module from v0.5 already handles writing markdown into `vault/projects/{name}/docs/` — we reuse it verbatim.

**What we lose compared to building our own converter:**
- Non-markdown blocks (databases, embeds, synced blocks) are rendered by Notion's server using their own mapping. If a user has a block type that doesn't round-trip well, we inherit Notion's decision. Acceptable tradeoff for zero-dep.

**Confidence:** HIGH on markdown-by-default, MEDIUM on edge-case block fidelity (only discoverable on real user content — flag in PITFALLS.md).

#### Rate limits — standard Notion API

**Finding:** The hosted MCP server uses the same underlying Notion API rate limit (3 requests per second average, per integration). `notion-search` with cross-tool scope requires Notion AI — no separate rate limit documented for it.

**Implication for Notion import:** intent-triggered imports are naturally paced by user action (not cron, not bulk). For the common case of importing 5–10 pages on first setup, we're well under the limit. Bulk imports (>20 pages) should include a 400ms sleep between fetches. **Still no new dep needed — `setTimeout` + `await new Promise(r => setTimeout(r, 400))`.**

**Confidence:** MEDIUM (Notion rate limits are documented but the exact MCP passthrough isn't — we should degrade gracefully if the MCP server rate-limit-rejects).

#### `.claude/notion_pages.json` format

**Decision:** Same schema family as `git-scopes.json` — versioned, minimal:

```json
{
  "version": 1,
  "pages": [
    {
      "id": "f1a2b3c4-...",
      "title": "Architecture Decisions",
      "vault_path": "docs/notion/architecture.md",
      "last_imported_at": "2026-04-11T12:00:00.000Z"
    }
  ]
}
```

`vault_path` is relative to `vault/projects/{slug}/` so the existing `docs add` and NotebookLM sync paths work unchanged.

**Confidence:** HIGH.

#### Intent-triggered only (not cron)

**Already decided** per PROJECT.md "Out of Scope" — cron-based periodic sync rejected. v0.9 triggers:
- Explicit CLI: `claude-dev-stack notion import`
- Phrase-matched skill invocation: user says "import Architecture Decisions from Notion", skill invokes `notion-fetch`

No new infrastructure, no background process, no new hook.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Regex-based monorepo detection (Node builtins) | `yaml@^2.x` npm dep for `pnpm-workspace.yaml` | If we ever add 5+ more YAML-shaped config files to parse. 1 file = regex wins. |
| Regex-based `Cargo.toml` parse | `@iarna/toml@^2.x` | Never — violates single-dep. |
| Hardcoded scope list fallback | Live `git ls-files` inspection | Fresh repo with no commits, monorepo with non-standard layout. Regex + wizard confirm handles both. |
| Reuse existing `lib/notebooklm.mjs` primitives for migration | Wait for hypothetical `notebooklm source migrate` upstream command | Never — upstream has no roadmap commitment, we'd block v0.9 indefinitely. |
| `claude.ai Notion` hosted MCP (OAuth) | `@notionhq/notion-mcp-server` self-hosted + PAT | User objects to OAuth; wants self-hosted for privacy. Documented in "Alternatives" section of the Notion import skill, not default. |
| `claude.ai Notion` MCP | Notion REST API direct (`@notionhq/client`) | **Rejected** — violates single-dep AND Out of Scope in PROJECT.md. |
| `notion-fetch` returns markdown natively | `turndown@^7.x` HTML→md converter | **Rejected** — `notion-fetch` is already markdown. Only needed if we fetch via REST API, which we're not. |
| Template string replace for `SKILL.md.tmpl` | `handlebars@^4.x` / `mustache@^4.x` | Never — violates single-dep. |
| Print-commands for commitlint install | `spawnSync('npm', ['install', '--save-dev', ...])` | **Rejected** — distribution constraint forbids touching user's lockfile/install. Also matches `notebooklm-py` install posture. |
| Same `.tmp + renameSync` atomic pattern | `write-file-atomic@^5.x` | Never — builtin works, 22 decisions of prior art in `lib/notebooklm-manifest.mjs`. |
| Bump `MANIFEST_VERSION` to 2 with in-place migration | Parallel manifest file `.notebooklm-sync.v2.json` | Parallel file would complicate rollback and doubles the corrupt-recovery surface. Version bump is the designed extension point. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any YAML parser (`yaml`, `js-yaml`) | Violates single-dep | Regex on `pnpm-workspace.yaml` — we only need the `packages:` list |
| Any TOML parser (`@iarna/toml`, `smol-toml`) | Violates single-dep | Regex on `Cargo.toml` `[workspace] members = [...]` |
| Any XML parser (`fast-xml-parser`, `xml2js`) | Violates single-dep | Regex on `pom.xml` `<module>…</module>` |
| `@notionhq/client` (Notion SDK) | Pulls axios/undici transitive deps, requires PAT | Delegate to `claude.ai Notion` hosted MCP server |
| `turndown` (HTML → markdown) | Unneeded: notion-fetch returns markdown already | Nothing — consume markdown directly |
| `yaml-front-matter` parser for SKILL.md | SKILL.md frontmatter is hand-authored and static | N/A — templates hardcode the frontmatter |
| `husky` as a claude-dev-stack dep | Would force husky on every CDS user, including those not using commitlint | Print husky install command in the opt-in wizard |
| `@commitlint/cli` as a claude-dev-stack dep | Same reason as husky | Print install command in the opt-in wizard |
| `simple-git` / `isomorphic-git` for monorepo detection via git tree | Violates single-dep; slower than sentinel-file read | `readdirSync` + sentinel files |
| `notebooklm metadata --json` as primary source-list API | Works but is a different codepath than v0.8 production; docs ambiguous about shape | Keep using `source list -n {id} --json` which is proven in production (lib/notebooklm.mjs:346). `metadata --json` is fallback-only. |
| Notion REST API fallback when MCP unavailable | Already rejected in PROJECT.md Out of Scope | Fail loudly: "Notion MCP not connected — run `claude mcp add notion` and retry" |
| `node-cron` / `croner` for periodic Notion/NotebookLM sync | Rejected in PROJECT.md Out of Scope; violates single-dep | Intent-triggered only |
| `glob@^10.x` for expanding workspace globs | Violates single-dep | `readdirSync` + basic `*` handling (workspace globs are almost always `packages/*` shape) |

---

## Stack Patterns by Variant

**If the project is a single-package (no workspaces):**
- `detectScopes()` returns `['core']` with `confidence: 'low'`, `source: 'fallback'`.
- Wizard explicitly shows "Could not detect multi-package layout — using single 'core' scope. Add custom scopes?".
- User can add arbitrary scopes via the prompt.

**If the project is a pnpm workspace with nested packages (e.g. `packages/ui/*`):**
- `pnpm-workspace.yaml` regex returns the glob `packages/ui/*`.
- Expansion via `readdirSync(packages/ui)` returns each sub-package.
- Scopes list is the union of all expanded dirs.

**If the project already has a `.claude/git-scopes.json`:**
- `scopes` wizard defaults to edit mode: show current scopes, offer "add / remove / keep".
- **NEVER overwrite the file on re-run.** Idempotent like `project-setup.mjs`.

**If the user already has a manually-maintained `git-conventions` skill (e.g. the NMP reference implementation):**
- `scopes` wizard detects an existing `{project}/.claude/skills/git-conventions/SKILL.md` and offers: "[M]erge my detection into your file / [R]eplace with template / [K]eep yours".
- Default: Keep. Opinionated but safe.

**If migration runs on a user with no existing shared notebook:**
- `listNotebooks()` returns zero `claude-dev-stack-vault` entries.
- Migration prints "No legacy shared notebook found — nothing to migrate. Per-project notebooks will be created on next `notebooklm sync`." and exits 0.

**If migration runs on a user with a partially-migrated state (previous run was rate-limited):**
- Re-scan shared notebook; skip sources whose title already exists in the target per-project notebook (checked via `listSources(perProjectId)`).
- Resume from the first unprocessed source.

**If the user enables `commitlint_enforced: true` but doesn't install commitlint:**
- Git `commit-msg` hook fails with a clear error pointing at the install commands.
- `claude-dev-stack doctor` detects the mismatch and warns.

**If `notion-fetch` returns a page with blocks that don't render cleanly to markdown (database, synced block):**
- We consume whatever Notion's server gives us.
- `PITFALLS.md` flags this: "round-trip fidelity for Notion databases is degraded — consider exporting the database as CSV separately."

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `notebooklm-py@0.3.4` | Node 18/20/22/24 wrapper (via `spawnSync`) | No version bump possible — latest upstream. CLI is stable. |
| `@commitlint/cli@19.x` | `@commitlint/config-conventional@19.x` | Major versions aligned; always install as a pair. |
| `@commitlint/cli@19.x` | `husky@9.x` | Recommended pairing; `husky@8.x` also works but lacks `init` command. |
| `@commitlint/cli@19.x` | Node 18 | ESM config loads fine on Node 18; Node 24 has known edge case when package.json is absent (not our problem — we generate `commitlint.config.mjs` in the user's project, which already has a `package.json`). |
| `claude.ai Notion` hosted MCP | Claude Code MCP layer | Server-side. Version managed by Notion. No pinning from our side. |
| `.notebooklm-sync.json@v2` | `lib/notebooklm-sync.mjs` v0.9+ | In-place migration from v1 on first read. |
| `prompts@2.4.2` | Node 18/20/22/24 | Unmaintained but stable. **Do not migrate to `@inquirer/prompts` in v0.9** — explicitly out of scope. |

---

## Integration Points with Existing Code

| Existing Module | v0.9 Extension | Pattern |
|-----------------|----------------|---------|
| `lib/notebooklm.mjs` | No changes — primitives already sufficient | Reuse as-is |
| `lib/notebooklm-sync.mjs` | Add `scheme` param to `buildTitle` (`'shared'` vs `'per-project'`); extend `ensureNotebook` to resolve per-project notebook by slug; update `syncVault` to iterate projects and pick the right notebook ID | Incremental add, preserve v0.8 API |
| `lib/notebooklm-manifest.mjs` | Bump `MANIFEST_VERSION` to 2; add `migrateV1toV2` function; add `notebooks` map to shape validator | Versioned extension per D-02 |
| `lib/project-setup.mjs` | Add git-conventions skill to the bundled-skill copy list; call new `lib/git-scopes.mjs::writeScopesConfig` during project setup | Mirror session-manager copy pattern |
| `lib/doctor.mjs` | Add "git-conventions installed? scopes valid? commitlint wired if enforced?" section; add "per-project notebooks exist? manifest v2?" section | 3-line sections per ADR-0012 severity |
| `bin/install.mjs` | Add `scopes` subcommand dispatch; extend wizard to prompt "set up git conventions?" | Existing wizard pattern |
| `lib/docs.mjs` | No changes — Notion import writes markdown files via existing path | Zero-change reuse |
| **NEW:** `lib/git-scopes.mjs` | Detect, read, write, validate `git-scopes.json`; `lib/scopes-cli.mjs` for wizard | New file, matches lib style |
| **NEW:** `lib/notebooklm-migrate.mjs` | Orchestrate 27-source migration using v0.8 primitives + v2 manifest | New file |
| **NEW:** `lib/notion-import.mjs` | Read `notion_pages.json`, instruct Claude to fetch each page, write results | New file |
| **NEW:** `templates/skills/git-conventions/SKILL.md.tmpl` | Parameterized reference skill based on `~/Work/NMP/.claude/skills/git-conventions/SKILL.md` | Template file |
| **NEW:** `templates/commitlint.config.mjs.tmpl` | Parameterized commitlint config | Template file |

---

## Authentication & Secret Surface (unchanged posture from v0.8)

| System | Who stores credentials | claude-dev-stack code path |
|--------|------------------------|----------------------------|
| NotebookLM | `notebooklm-py` (browser OAuth cookies at `~/.notebooklm/storage_state.json`) | Never read, never written. Delegated per ADR-0001. |
| Notion | Claude Code MCP layer (OAuth token managed by Notion connector) | Never read, never written. Delegated to Claude Code. |
| Git | User's existing git config / SSH keys | Never touched. |
| commitlint | N/A (no auth) | N/A |

**Zero new secrets, zero new env vars, zero new credential files.** This is a strict, intentional continuation of the v0.8 ADR-0001 posture.

---

## Sources

- **PyPI notebooklm-py** — https://pypi.org/project/notebooklm-py/ — verified version 0.3.4 (2026-03-12), no newer release on 2026-04-11. HIGH confidence.
- **notebooklm-py CLI reference** — https://github.com/teng-lin/notebooklm-py/blob/v0.3.4/docs/cli-reference.md — confirms `list`, `source list`, `source delete-by-title`, and `metadata --json` commands. Docs do NOT explicitly show `--json` on `source list`, but the flag works in production (verified against lib/notebooklm.mjs:346 which has been shipping in v0.8). MEDIUM confidence on the docs gap, HIGH on the flag working.
- **notebooklm-py v0.3.4 release notes** — confirmed additions: `notebooklm metadata --json`, `source delete-by-title`, cinematic video, infographic styles. No batch-migration commands. HIGH confidence.
- **Notion MCP docs** — https://developers.notion.com/docs/mcp — confirmed hosted server at `https://mcp.notion.com/mcp`, OAuth one-click auth, Notion-flavored markdown responses. HIGH confidence.
- **Notion MCP supported tools** — https://developers.notion.com/guides/mcp/mcp-supported-tools — confirmed 17+ tools including `notion-search`, `notion-fetch`, `notion-create-pages`, `notion-update-page`. HIGH confidence.
- **Notion hosted MCP blog post** — https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look — confirmed markdown-first response posture, Notion AI requirement for cross-tool search. HIGH confidence.
- **Notion working with markdown content** — https://developers.notion.com/guides/data-apis/working-with-markdown-content — confirmed `GET /v1/pages/:page_id/markdown` endpoint returns enhanced markdown; MCP server uses same underlying format. HIGH confidence on format, MEDIUM on MCP passthrough of all edge cases.
- **@commitlint/cli npm** — https://www.npmjs.com/package/@commitlint/config-conventional — confirmed `@commitlint/cli@19.x` + `@commitlint/config-conventional@19.x` is current stable. HIGH confidence.
- **commitlint guide: CI setup** — https://commitlint.js.org/guides/ci-setup.html — confirmed standalone CLI usage pattern `npx --no -- commitlint --edit "$1"` and Node 24 package.json edge case (non-blocking for our generated configs). HIGH confidence.
- **Reference implementation NMP** — `~/Work/NMP/.claude/skills/git-conventions/SKILL.md` + `~/Work/NMP/commitlint.config.mjs` — read 2026-04-11. Provides the hardcoded scope format our template parameterizes. HIGH confidence.
- **Existing codebase** — `lib/notebooklm.mjs`, `lib/notebooklm-sync.mjs`, `lib/notebooklm-manifest.mjs`, `lib/shared.mjs`, `templates/project-map.json` — read 2026-04-11. All patterns we reuse are already in production. HIGH confidence.

---

*Stack research for: claude-dev-stack v0.9 (Git Conventions & NotebookLM Per-Project)*
*Researched: 2026-04-11*
*Confidence: HIGH overall — no new JS dependencies, existing system deps sufficient, no upstream blockers.*
