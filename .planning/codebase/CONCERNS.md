# Codebase Concerns

**Analysis Date:** 2026-04-10

## Tech Debt

**Large monolithic install script:**
- Issue: `bin/install.mjs` is 1,287 lines with duplicated helper functions (colors, CLI prompts, path input) that are also in `lib/shared.mjs`
- Files: `bin/install.mjs`, `lib/shared.mjs`
- Impact: Maintenance burden when updating CLI patterns (must update in two places), harder to onboard new commands
- Fix approach: Refactor install.mjs to import helpers from shared.mjs instead of redefining them (eliminate ~150 lines of duplication). Consider splitting install.mjs into logical modules (vault setup, plugin installation, skills installation, GSD setup).

**No type safety on internal APIs:**
- Issue: Pure ESM + Node.js without TypeScript means no type-checking across module boundaries
- Files: All files in `lib/*.mjs`, `bin/*.mjs`
- Impact: Silent breakage when function signatures change (e.g., if `setupAllProjects` return shape changes, callers won't be caught); cross-module refactoring requires manual inspection
- Fix approach: (1) Add JSDoc type annotations across all exports, or (2) migrate to TypeScript for better IDE support and compile-time checking

**No linting or formatting enforced:**
- Issue: No ESLint, Prettier, or Biome configured; code style is informal and inconsistent
- Files: All .mjs files
- Impact: As codebase grows (currently 14 lib modules, 1,287 in install.mjs), inconsistent patterns make code harder to read; new contributors won't have style guidance; drift from Node.js best practices possible
- Fix approach: Add ESLint config (eslint.config.mjs) with flat config, Prettier for formatting, and pre-commit hook to enforce

**Path→Project mapping scattered across codebase:**
- Issue: Logic to map directory path ↔ project name/slug exists in multiple places: `lib/add-project.mjs`, `lib/projects.mjs`, `lib/project-setup.mjs`, `bin/install.mjs` (separate slug generation for docs)
- Files: `lib/add-project.mjs` (updateProjectMap), `lib/projects.mjs` (getProjects, reverseProjectMap), `lib/project-setup.mjs` (setupAllProjects reads project-map.json), `lib/docs.mjs` (line 247 generates slug independently)
- Impact: Project slug generation in `lib/docs.mjs` uses different logic than project names in project-map.json, creating potential for mismatches; refactoring project naming is error-prone
- Fix approach: Create centralized module `lib/project-naming.mjs` with: `slugify(name)`, `denormalize(slug)`, `readProjectMap(vaultPath)`, `writeProjectMap(vaultPath, map)`, `reverseMap(map)`

## Known Bugs

**Vault duplication on macOS case-insensitive filesystem:**
- Symptoms: Both `~/vault/` and `~/Vault/` can exist, causing ambiguity in `findVault()` behavior (returns whichever is checked first)
- Files: `lib/projects.mjs` (lines 11-30), `lib/add-project.mjs` (lines 34-58)
- Trigger: User creates vault in mixed case, then searches for it; `findVault()` checks `homedir()/vault` before `homedir()/Vault`
- Current mitigation: Code checks both candidates and returns first match; `resolveVault()` lets user pick if auto-detect fails
- Workaround: Users must manually remove one duplicate or it won't be picked up consistently

**spawnSync pipe buffer truncation (8KB documented limit, ~64KB practical):**
- Symptoms: Large JSON output from `claude plugin list --available --json` silently truncates
- Files: `bin/install.mjs` (lines 451-474), `lib/plugins.mjs` (lines 108-115), `lib/mcp.mjs` (lines 35-39)
- Trigger: User runs install on system with many Claude plugins installed; stdout exceeds buffer size
- Current mitigation: `bin/install.mjs` has fallback to temp file (`/tmp/claude-plugins-{pid}.json`); `lib/plugins.mjs` has similar workaround
- Workaround: Falls back to shell redirect to file, then reads file. Temp files are cleaned up manually (no explicit cleanup in code).

**setupAllProjects silently skipped missing project-map entries (FIXED in e4a03ad):**
- Symptoms: project-map.json entries pointing to deleted directories were skipped without notification
- Files: `lib/project-setup.mjs` (fixed lines 164-187)
- Trigger: User deletes a project directory while keeping project-map.json entry
- Fix (commit e4a03ad): Now returns `missing` array; both callers (`lib/projects.mjs`, `lib/update.mjs`) surface warnings with hint to clean up stale entries
- Status: FIXED — but older installs still have broken version; recommend update doc

**session-manager context.md auto-update not implemented:**
- Symptoms: `skills/session-manager/SKILL.md` line 80 says "Update context.md 'Session History' section" but there's no code that does this
- Files: `skills/session-manager/SKILL.md` (line 80), `skills/session-manager/` (bash script missing logic)
- Trigger: User ends session with `session-manager /end`; context.md "Session History" section is not updated automatically
- Current mitigation: Session logs are still created correctly in `~/vault/projects/{name}/sessions/{date}-slug.md`; users can manually link them in context.md
- Workaround: Users manually add session history links to context.md; automation doesn't run

## Security Considerations

**Downloading and executing MCP servers without verification:**
- Risk: MCP servers are installed via `npx` with `-y` flag (auto-yes), no signature verification or code review step
- Files: `lib/mcp.mjs` (lines 140-142), `bin/install.mjs` (lines 605-606)
- Current mitigation: Servers are from official registry (`@anthropic-ai/mcp-*` namespace); some require env vars (checked for presence)
- Recommendations: (1) Add warning before installing third-party (non-@anthropic-ai) MCP servers, (2) Document security implications in README, (3) Consider allowlist for third-party servers

**Shell hooks execution without user review:**
- Risk: `.claude/hooks/` scripts are copied from package and run automatically on session start/end, no review possible
- Files: `lib/update.mjs` (lines 92-104), `bin/install.mjs` (hook setup during initial wizard)
- Current mitigation: Only our own scripts from the package are installed; users can inspect in `.claude/hooks/`
- Recommendations: (1) Document hook behavior in CLAUDE.md, (2) Add optional hook-signing/verification if shared hooks added

**Running arbitrary shell commands via spawnSync:**
- Risk: `spawnSync('sh', ['-c', command])` pattern with user input could be injection vector
- Files: `lib/plugins.mjs`, `lib/mcp.mjs`, `lib/export.mjs` use `spawnSync('sh', ['-c', ...])` for file redirection
- Current mitigation: Commands constructed from package templates (hardcoded), not user input; only hardcoded plugin names/paths used
- Recommendations: (1) Use file APIs instead of shell for file operations where possible, (2) Validate all user inputs before passing to shell

## Performance Bottlenecks

**API calls to find vault blocking UI:**
- Problem: `findVault()` checks 5 candidate directories synchronously; if all missing, slow on network mounts
- Files: `lib/projects.mjs` (lines 11-30), `lib/add-project.mjs` (lines 34-58), `bin/install.mjs` (~line 230)
- Cause: `existsSync()` for each candidate; network delays block user interaction
- Improvement path: (1) Cache vault path in `~/.claude/vault.cache` (invalidate when dirs change), (2) Check home-relative paths first (faster), (3) Use parallel checks if network mounts involved

**No test infrastructure for integration scenarios:**
- Problem: Only unit tests exist (409 lines total); no integration tests for common workflows
- Files: `tests/` directory has 6 test files but covers only isolated modules
- Cause: Integration tests would need real filesystem/vault setup; currently tests stub dependencies
- Improvement path: Add `tests/integration/` with fixtures; test end-to-end workflows (vault creation → add project → enable skills)

## Fragile Areas

**Manual project-map.json maintenance:**
- Files: `lib/add-project.mjs`, `lib/projects.mjs`, `lib/project-setup.mjs`
- Why fragile: JSON file is source of truth for project discovery, but no validation logic; typos in paths break everything; no format version field
- Safe modification: (1) Always use `updateProjectMap()` function instead of direct writes, (2) Test after modifying by running `claude projects list`, (3) Consider adding `"version": 1` field and validation schema
- Test coverage: Only `tests/project-setup.test.mjs` covers this (64 lines); missing tests for corrupt/missing project-map scenarios

**ESM + npm package dependencies in mono-architecture:**
- Files: `bin/install.mjs` (many spawnSync calls to npx), `lib/skills.mjs`, `lib/update.mjs`
- Why fragile: Installing packages via `npx get-shit-done-cc@latest` is version-pinning via npm, not lockfile; unexpected major version bumps possible; ESM import edge cases with optional dependencies
- Safe modification: (1) Test any new skill/plugin installation after major npm/Node.js updates, (2) Pin get-shit-done-cc version if major breaking changes expected, (3) Document Node.js version requirements (currently >=18)
- Test coverage: Only smoke tests; `tests/cli.test.mjs` doesn't verify actual installation workflows

**Plugin list parsing is regex-based and brittle:**
- Files: `lib/mcp.mjs` (lines 43-50), `lib/plugins.mjs` (plugin parsing)
- Why fragile: Regex `/^\s*(\S+):/` assumes fixed output format from `claude mcp list` or `claude plugin list --json`; any CLI output change breaks parsing
- Safe modification: (1) Prefer `--json` output and parse as JSON, (2) Add fallback empty list if parsing fails, (3) Add tests with real CLI output samples
- Test coverage: `tests/mcp.test.mjs` doesn't exist; parsing logic is untested

## Scaling Limits

**Single entry point (bin/install.mjs) handling all workflows:**
- Current capacity: Works for one-time setup; becomes bottleneck when adding new features (1,287 lines already)
- Limit: Becomes unmaintainable at ~2000 lines; hard to onboard new subcommands
- Scaling path: Refactor to use subcommand pattern: `install`, `update`, `doctor`, `projects`, `plugins`, `mcp`, `skills` as separate entry points delegating to lib modules (already structured correctly, just need CLI router)

**No caching of vault discovery or project list:**
- Current capacity: Fine for single CLI invocation; repeated runs (e.g., `projects list` → `projects enable`) re-discover vault each time
- Limit: If vault on network mount or with thousands of projects, repeated checks get slow
- Scaling path: (1) Cache vault path in `~/.claude/vault.cache` with TTL, (2) Lazy-load project list only when needed, (3) Support `--vault` flag override

## Dependencies at Risk

**prompts ^2.4.2 is single interactive input library:**
- Risk: Unmaintained dependency (last update Aug 2021); no alternative available without major refactor
- Impact: Any breaking change in prompts or Node.js incompatibility blocks CLI; no graceful fallback
- Migration plan: (1) Monitor for breaking Node.js incompatibilities, (2) Keep test suite passing on latest Node.js LTS, (3) Consider written alternative using readline if needed (low priority, prompts is stable)

## Missing Critical Features

**No validation of CLAUDE.md after update:**
- Problem: `updateProjectClaudeMd()` writes file without checking syntax or Markdown validity
- Blocks: Users can't detect broken CLAUDE.md until they try to use it; error messages are unhelpful
- Fix: Add basic YAML/Markdown structure validation after write; test round-trip

**No rollback mechanism for failed installs:**
- Problem: If installation fails mid-process, vault/project is partially initialized
- Blocks: Users must manually clean up; no easy way to retry from where it failed
- Fix: (1) Add cleanup script, (2) Consider checkpoint/rollback mechanism for multi-step installs

**No dry-run mode for wizard:**
- Problem: Users can't preview what will be installed before committing
- Blocks: Advanced users want to inspect changes before running install
- Fix: Add `--dry-run` flag that shows what will be done without writing files

## Test Coverage Gaps

**Project management module untested:**
- What's not tested: `lib/projects.mjs` (475 lines) has no test file
- Files: `lib/projects.mjs`
- Risk: Project listing, filtering, removal logic could break unnoticed
- Priority: High — projects are core to the entire system

**Skills installation and update workflows untested:**
- What's not tested: `lib/skills.mjs` (475 lines) covers git clone, install from catalog, shell execution; only 58 lines of tests (`tests/skills.test.mjs`)
- Files: `lib/skills.mjs`, `tests/skills.test.mjs`
- Risk: Git/network failures, version conflicts, skill activation logic not covered
- Priority: High — skills are user-facing feature

**MCP server installation untested:**
- What's not tested: `lib/mcp.mjs` (244 lines) no test file exists; parsing installed servers, http vs npx installation paths not covered
- Files: `lib/mcp.mjs`
- Risk: MCP list parsing is brittle regex; installation failure modes unknown
- Priority: Medium — installation should fail obviously, but silent truncation possible

**Plugin list loading with fallback untested:**
- What's not tested: Temp file fallback in `bin/install.mjs` lines 451-474 never executes in tests (mocked to null)
- Files: `bin/install.mjs`, `lib/plugins.mjs`
- Risk: Buffer truncation edge case could cause corrupted state in production
- Priority: Medium — test with large plugin lists to verify fallback works

**Vault discovery with duplicate paths untested:**
- What's not tested: `findVault()` when both `~/vault/` and `~/Vault/` exist; which wins not specified
- Files: `lib/projects.mjs` lines 11-30
- Risk: Non-deterministic behavior on macOS case-insensitive filesystems
- Priority: High — macOS users affected

**Shell hook execution untested:**
- What's not tested: `hooks/*.sh` scripts installed and called by install process; only `tests/hooks.test.mjs` (56 lines) exists with minimal coverage
- Files: `hooks/`, `lib/update.mjs`, `bin/install.mjs`
- Risk: Hook bugs silent until user actually runs hooks; no way to test before deploying
- Priority: Medium — hooks are critical but simple

---

*Concerns audit: 2026-04-10*
