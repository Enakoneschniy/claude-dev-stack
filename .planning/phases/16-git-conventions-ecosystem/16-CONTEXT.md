# Phase 16: Git Conventions Ecosystem — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 16 extends the existing git-conventions infrastructure (introduced in v0.9, Phases 6–9) with four targeted additions:

1. **GIT-01** — Error path for `scopes init` when prerequisites (git, Node) are missing; surfaces a clear diagnostic instead of a cryptic failure.
2. **GIT-02** — Gitmoji opt-in: `--gitmoji` flag on `scopes init`, mapping stored in `git-scopes.json`, skill reads and applies emoji prefixes.
3. **GIT-03** — New top-level command `claude-dev-stack git-action` that writes `.github/workflows/commitlint.yml` to the current project.
4. **GIT-04** — New top-level command `claude-dev-stack migrate-claude-md` that parses a prose CLAUDE.md, extracts scopes/conventions, and writes `git-scopes.json` after an interactive review.

**What this phase does NOT touch:**
- Existing `scopes list / add / remove / refresh` subcommands — no behavior changes
- `lib/notebooklm.mjs`, `lib/analytics.mjs`, or any non-git module
- SKILL.md template content (may extend tokens, see D-09)

**Files in scope:**
- `lib/git-conventions.mjs` — add `--gitmoji` flag handling to `cmdInit`; add `cmdGitAction` and `cmdMigrateClaude` (invoked via new CLI top-level cases)
- `lib/git-scopes.mjs` — add `checkPrereqs()`, `buildCommitlintYml()`, `parseClauda()`, `applyGitmoji()`
- `bin/cli.mjs` — add `case 'git-action'` and `case 'migrate-claude-md'` routes
- `templates/skills/git-conventions/SKILL.md.tmpl` — add `{{GITMOJI_SECTION}}` token (conditional block)
- `tests/git-scopes.test.mjs` — extend with prereq, gitmoji, yml-gen, and parse tests
- `tests/git-conventions.test.mjs` — CLI integration tests for new subcommands

</domain>

<decisions>
## Implementation Decisions

---

### GIT-01: Prerequisite Error Path

- **D-01:** Add `checkPrereqs(projectDir)` to `lib/git-scopes.mjs`. Returns `{ ok: boolean, missing: string[] }`. Checks for `git` (via `hasCommand('git')`) and verifies the directory is a git repo (`existsSync(join(projectDir, '.git'))`). Does NOT check Node version — Node is already running.

- **D-02:** `cmdInit` calls `checkPrereqs(cwd)` as the very first step, before any `detectStack` or prompts. If `missing.length > 0`, print a formatted error block and `return` — no stack trace, no crash.

- **D-03:** Error message format (mirrors existing `fail`/`info` helpers):
  ```
      ✘ git-conventions requires: git
      ℹ  Install git: https://git-scm.com/downloads
      ℹ  Then re-run from a git repository root.
  ```
  One `fail()` line per missing prereq, followed by one `info()` install hint per prereq.

- **D-04:** If `git` is present but cwd is not a git repo (no `.git`), the error is:
  ```
      ✘ Not a git repository.
      ℹ  Run: git init
  ```
  This is the most common real-world failure case.

- **D-05:** `checkPrereqs` is also exported — downstream modules (e.g. future wizard steps) can call it independently.

---

### GIT-02: Gitmoji Support

- **D-06:** Gitmoji mapping is stored directly in `git-scopes.json` under an optional top-level key `gitmoji`. When absent or `false`, gitmoji is disabled. When present, it is an object mapping commit type to emoji string:
  ```json
  {
    "version": 1,
    "gitmoji": {
      "feat":     "✨",
      "fix":      "🐛",
      "refactor": "♻️",
      "test":     "✅",
      "docs":     "📝",
      "ci":       "👷",
      "chore":    "🔧"
    }
  }
  ```
  Default mapping covers the 7 standard types defined in `createDefaultConfig`. Users can extend it freely.

- **D-07:** `scopes init` behavior:
  - If `--gitmoji` flag is present in args → add gitmoji mapping to config, skip the interactive prompt.
  - In interactive (non-quick) mode → add a prompt: `"Enable gitmoji prefixes? (y/N)"` after the co-authored-by prompt (prompt 7 in full mode, appended after prompt 4 in quick mode as prompt 5).
  - `--quick` mode does NOT ask about gitmoji unless `--gitmoji` flag is explicit.
  - Parser: `const isGitmoji = args.includes('--gitmoji')` in `cmdInit`.

- **D-08:** The git-conventions SKILL.md template gains a `{{GITMOJI_SECTION}}` token. When gitmoji is enabled, `installSkill` renders:
  ```
  ## Gitmoji Prefixes
  Prepend the emoji to the commit subject:
  - feat → ✨ feat(scope): subject
  - fix  → 🐛 fix(scope): subject
  ...
  ```
  When disabled, token is replaced with an empty string (same pattern as `{{CO_AUTHORED_BY_SECTION}}`).

- **D-09:** `installSkill` in `lib/git-scopes.mjs` already replaces tokens via `replaceAll`. Add one more `replaceAll('{{GITMOJI_SECTION}}', rendered)` call. The safety check `if (content.includes('{{'))` will catch any missed token automatically.

- **D-10:** `validateScopes` is NOT changed — `gitmoji` is an optional field, validator ignores unknown fields. No schema version bump needed.

---

### GIT-03: GitHub Action Generation (`git-action`)

- **D-11:** New CLI command: `claude-dev-stack git-action`. Routes to `lib/git-conventions.mjs#cmdGitAction()` via a new `case 'git-action'` in `bin/cli.mjs`.

- **D-12:** `cmdGitAction` reads `git-scopes.json` from cwd (via `readScopes`). If missing, prints error + hint to run `scopes init` first, then returns.

- **D-13:** Output file: `.github/workflows/commitlint.yml` relative to cwd. `mkdirp` creates `.github/workflows/` if it doesn't exist.

- **D-14:** Overwrite protection: if the file already exists, prompt `"commitlint.yml already exists. Overwrite? (y/N)"`. Default is NO. If user declines, print `warn('Skipped — existing file preserved')` and return.

- **D-15:** Generated YAML content (hardcoded template string, no external template file):
  ```yaml
  name: Commitlint

  on:
    pull_request:
      branches:
        - {main_branch}

  jobs:
    commitlint:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 0
        - uses: actions/setup-node@v4
          with:
            node-version: 20
        - name: Install commitlint
          run: |
            npm install --save-dev @commitlint/cli@^19 @commitlint/config-conventional@^19
        - name: Validate commit messages
          run: |
            npx --no -- commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
  ```
  `{main_branch}` is replaced with `config.main_branch` from git-scopes.json.

- **D-16:** `buildCommitlintYml(config)` in `lib/git-scopes.mjs` returns the YAML string. This keeps the generator testable without file I/O. `cmdGitAction` calls it then writes the file.

- **D-17:** After writing, print:
  ```
      ✔ Wrote .github/workflows/commitlint.yml
      ℹ  Add commitlint.config.mjs to your project root to enforce custom scopes.
  ```
  Then call `printCommitlintInstructions(config)` to show the install commands (already implemented in `lib/git-scopes.mjs`).

---

### GIT-04: CLAUDE.md Migration (`migrate-claude-md`)

- **D-18:** New CLI command: `claude-dev-stack migrate-claude-md`. Routes to `lib/git-conventions.mjs#cmdMigrateClaude()` via `case 'migrate-claude-md'` in `bin/cli.mjs`.

- **D-19:** Input resolution order:
  1. Explicit path from args: `args[1]` (e.g. `migrate-claude-md ./CLAUDE.md`)
  2. `CLAUDE.md` in cwd
  3. `.claude/CLAUDE.md` in cwd
  If none found → `fail('No CLAUDE.md found')` + `info('Usage: claude-dev-stack migrate-claude-md [path]')` + return.

- **D-20:** `parseClauda(content)` in `lib/git-scopes.mjs` — pure function, no file I/O. Returns `{ scopes: string[], types: string[], mainBranch: string|null, ticketPrefix: string|null }`.

  Extraction strategy (regex on raw markdown, no parser dependency):
  - **Scopes**: look for lines matching `/^[-*]\s+`?(\w[\w-]*)` ?/` inside sections named `scopes`, `packages`, `modules`, `services`, or `components` (case-insensitive heading). Also match inline: `scope(s): word1, word2` patterns.
  - **Types**: look for lines matching conventional commit type keywords (`feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`) inside sections named `commit`, `conventions`, or `git`.
  - **Main branch**: look for `main branch:? (main|master|develop|\w+)` or `branch.*(main|master|develop)` patterns (case-insensitive).
  - **Ticket prefix**: look for `[A-Z]{2,6}-` patterns used consistently (e.g. `PROJ-123`) or explicit `ticket prefix:? PROJ-`.

- **D-21:** Minimum viable extraction: if `parseClauda` finds 0 scopes, print `warn('No scopes found in CLAUDE.md')` and offer to enter scopes manually (same prompt as `cmdInit` prompt 2 manual entry). If user cancels, return without writing.

- **D-22:** Interactive review UX — after extraction, display a summary table before any write:
  ```
      ℹ  Extracted from CLAUDE.md:
         Scopes:       api, web, shared
         Types:        feat, fix, docs, chore
         Main branch:  main
         Ticket:       PROJ-

      ? Accept and write .claude/git-scopes.json? (Y/n)
      ? Accept scopes? (Y/n) [individual field confirms if user rejects full accept]
  ```
  Offer two-level review: full accept (Y) writes immediately; partial review (n) cycles through each field with individual confirm/edit prompts.

- **D-23:** Overwrite protection for `git-scopes.json`: if `.claude/git-scopes.json` exists → prompt `"git-scopes.json already exists. Overwrite? (y/N)"`, default NO.

- **D-24:** On write: call `writeScopes(cwd, config)` then `installSkill(cwd, config)` — same as `cmdInit`. Print `ok('Wrote .claude/git-scopes.json')` and `ok('Installed git-conventions skill')`.

- **D-25:** `parseClauda` is exported from `lib/git-scopes.mjs` so it can be unit-tested independently.

---

### Cross-Cutting Decisions

- **D-26:** No new npm dependencies. Regex-based CLAUDE.md parsing (D-20) avoids a markdown parser. YAML generation (D-15) uses a template string — no yaml library.

- **D-27:** All new CLI commands added to `printHelp()` in `bin/cli.mjs` under the existing `Git Conventions` section:
  ```
      claude-dev-stack git-action           Generate .github/workflows/commitlint.yml
      claude-dev-stack migrate-claude-md    Migrate prose CLAUDE.md to git-scopes.json
  ```

- **D-28:** Tests: extend `tests/git-scopes.test.mjs` with unit tests for `checkPrereqs`, `buildCommitlintYml`, and `parseClauda`. Extend or create `tests/git-conventions.test.mjs` for CLI-level tests of `cmdGitAction` and `cmdMigrateClaude` (using temp dirs and fixture CLAUDE.md files).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these files before planning or implementing.**

### Existing Implementation
- `lib/git-conventions.mjs` — current `cmdInit`, `cmdList`, `cmdAdd`, `cmdRemove`, `cmdRefresh`; add new commands here
- `lib/git-scopes.mjs` — add `checkPrereqs`, `buildCommitlintYml`, `parseClauda`, extend `installSkill` with `{{GITMOJI_SECTION}}`
- `bin/cli.mjs` lines 159–165 — current `scopes` / `scope` case; add `git-action` and `migrate-claude-md` cases nearby
- `templates/skills/git-conventions/SKILL.md.tmpl` — add `{{GITMOJI_SECTION}}` token

### Shared Utilities
- `lib/shared.mjs` — `c`, `ok`, `fail`, `warn`, `info`, `prompt`, `hasCommand`, `runCmd`, `mkdirp`, `atomicWriteJson`
- `lib/git-scopes.mjs` — `readScopes`, `writeScopes`, `validateScopes`, `installSkill`, `printCommitlintInstructions`, `createDefaultConfig`

### Test Infrastructure
- `tests/git-scopes.test.mjs` — extend this file; uses `node:test` + `node:assert/strict`

### Phase 14 Output (prerequisite)
- `lib/project-naming.mjs` — available if slug logic needed in file naming (not expected for this phase)

</canonical_refs>

<code_context>
## Existing Code Insights

### git-conventions.mjs patterns
- `cmdInit` follows: detect → prompt loop → `writeScopes` → `installSkill` → optional `printCommitlintInstructions`
- All prompt calls use `prompt()` from `lib/shared.mjs` with `onCancel` handler (exits cleanly on Ctrl+C)
- Flag parsing is inline: `args.includes('--quick')`, `args.includes('--full')` — follow same pattern for `--gitmoji`
- The `main(args)` dispatcher uses a `switch (sub)` — new subcommand entries fit cleanly in both `lib/git-conventions.mjs` (for `scopes`-namespaced commands) and `bin/cli.mjs` (for top-level commands)

### git-scopes.mjs patterns
- Functions are pure where possible (`validateScopes`, `createDefaultConfig`, `detectStack`)
- Side effects isolated to `readScopes`, `writeScopes`, `installSkill`
- `installSkill` uses `replaceAll` for template tokens; safety check at end catches misses
- `runCmd` (from shared) returns `null` on failure — use this pattern for git detection

### SKILL.md.tmpl token conventions
- `{{TOKEN}}` placeholders replaced via `content.replaceAll('{{TOKEN}}', value)`
- Conditional sections: when disabled, replace with empty string `''`
- Existing conditional: `{{CO_AUTHORED_BY_SECTION}}` — gitmoji section follows the same pattern

### CLI routing (bin/cli.mjs)
- New top-level commands are `case` entries in the `switch (command)` block
- Each case does a dynamic `import('../lib/...')` then calls `await main(args.slice(1))`
- For `git-action` and `migrate-claude-md`, the handler function lives in `lib/git-conventions.mjs` (exported alongside `main`)
- `printHelp()` in `bin/cli.mjs` has a `Git Conventions` section — add two new lines there

### hasCommand usage
- `lib/shared.mjs` exports `hasCommand(name)` — uses `spawnSync('which', [name])`, returns boolean
- This is the correct way to check for `git` binary existence (D-01)

### atomicWriteJson
- `lib/shared.mjs` exports `atomicWriteJson(path, obj)` — write-to-temp then rename
- `writeScopes` already uses it — `buildCommitlintYml` output is a string, so use `writeFileSync` directly

</code_context>

<specifics>
## Specific Implementation Notes

### Gitmoji default mapping (canonical)
Use these exact emoji per type (Unicode, not :shortcode:):
| Type | Emoji |
|------|-------|
| feat | ✨ |
| fix | 🐛 |
| refactor | ♻️ |
| test | ✅ |
| docs | 📝 |
| ci | 👷 |
| chore | 🔧 |

### commitlint.yml template substitution
`{main_branch}` → string replace (not `{{}}` to avoid clash with GitHub Actions `${{ }}` syntax that must be preserved literally).

### parseClauda regex priority
Order of scope extraction attempts:
1. Fenced code block with explicit scope list (highest signal)
2. Bullet list under a heading matching `scopes|packages|modules|services|components`
3. Inline `scopes: word1, word2` pattern
4. Fallback: collect all backtick-quoted identifiers matching `\w[\w-]{1,20}` that appear multiple times

Return deduplicated, lowercased, hyphenated scope names. Max 30 scopes returned (trim silently if exceeded).

### Error message formatting reference
Following existing patterns in `lib/git-conventions.mjs`:
```js
fail('git-conventions requires: git');
info('Install git: https://git-scm.com/downloads');
```
No `console.error`, no thrown errors — use `fail()`/`info()` helpers only.

</specifics>

<deferred>
## Deferred Ideas

- **Gitmoji scope-level mapping** (type + scope → emoji) — current design is type-only; scope-level overrides deferred to v0.12.
- **CLAUDE.md round-trip export** (git-scopes.json → generate CLAUDE.md conventions section) — inverse of GIT-04; deferred.
- **commitlint.yml with custom scope-enum** — current template does not embed scope names in the YAML (commitlint.config.mjs handles that); embedding them directly in the workflow is deferred.
- **Dry-run flag for migrate-claude-md** — print extracted config without writing; deferred to v0.12.

</deferred>

---

*Phase: 16-git-conventions-ecosystem*
*Context gathered: 2026-04-13*
