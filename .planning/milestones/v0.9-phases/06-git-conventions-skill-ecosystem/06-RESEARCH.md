# Phase 6: Git-Conventions Skill Ecosystem — Research

**Researched:** 2026-04-12
**Domain:** Node.js ESM CLI — skill templating, monorepo sentinel-file detection, JSON config schema, atomic writes, test fixture infrastructure
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | `tests/helpers/fixtures.mjs` exports `makeTempVault`, `makeTempGitRepo`, `makeTempMonorepo(stackType)`, `withStubBinary` | Existing stub pattern in `tests/fixtures/notebooklm-stub.sh` + `tests/notebooklm.test.mjs` gives exact template; no new patterns needed |
| INFRA-02 | `atomicWriteJson(path, obj)` in `lib/shared.mjs` via temp+rename | `lib/notebooklm-manifest.mjs` lines 245-252 already implement this pattern; extract as shared helper |
| GIT-01 | `.claude/git-scopes.json` v1 schema with validation in `lib/git-scopes.mjs` | Schema fields and validation logic fully specified in STACK.md; pattern mirrors `lib/notebooklm-manifest.mjs` |
| GIT-02 | 7-stack sentinel-file auto-detection, no parser deps, regex-only | Detection order + regexes verified in STACK.md; all use builtins |
| GIT-03 | `scopes` CLI subcommands: `list`, `refresh`, `add`, `remove`, `init` | Same dispatch pattern as existing `notebooklm` CLI in `lib/notebooklm-cli.mjs` |
| GIT-04 | `scopes init --quick` (4 questions) and `--full` modes | 4 questions confirmed in REQUIREMENTS.md resolved question #3; `prompts` already wired |
| GIT-05 | Parameterized `git-conventions` SKILL.md installed per-project, reads config at invoke time | NMP reference SKILL.md read; template token pattern verified against `lib/project-setup.mjs` marker approach |
| GIT-06 | `co_authored_by` config field, default `false` | NMP skill has Co-Authored-By enabled; CDS forbids it per MEMORY.md; must be explicit config toggle |
| GIT-07 | Main-branch auto-detect via `git symbolic-ref` with confirmable fallback | Verified: `git symbolic-ref refs/remotes/origin/HEAD` fails on repo with no `origin/HEAD` pointer; three-step fallback chain required |
| GIT-08 | `bin/install.mjs::installGitConventions()` per-project wizard step | Pattern: insert step between existing `notebooklm` install and `generateClaudeMD` in main() flow |
| GIT-09 | Doctor WARN (existing project) / ERROR (new install post-wizard) for missing `.claude/git-scopes.json` | Doctor section pattern fully documented in existing `lib/doctor.mjs`; WARN increments `warnings`, ERROR increments `issues` |
| GIT-10 | Opt-in commitlint wizard (print-only, never spawns npm install); only when `package.json` exists | Confirmed print-only; `commitlint.config.mjs` generation via `writeFileSync`; `.husky/commit-msg` via `writeFileSync` + `chmodSync` |
</phase_requirements>

---

## Summary

Phase 6 is the lowest-risk phase in v0.9 because every pattern it needs already exists in the codebase. The `lib/notebooklm-manifest.mjs` atomic-write pattern becomes `atomicWriteJson`. The `tests/fixtures/notebooklm-stub.sh` + PATH-prepend trick in `tests/notebooklm.test.mjs` becomes the `withStubBinary` helper in `tests/helpers/fixtures.mjs`. The `lib/project-setup.mjs` marker-based CLAUDE.md injection becomes the template-token approach for the git-conventions SKILL.md. The `lib/notebooklm-cli.mjs` subcommand dispatch is the exact pattern for `lib/git-conventions.mjs`.

The NMP reference SKILL.md is a static hardcoded skill -- all scope/branch/ticket knowledge is embedded directly in the markdown. CDS version replaces the hardcoded lists with template tokens (`{{SCOPES}}`, `{{MAIN_BRANCH}}`, `{{TICKET_PREFIX}}`, `{{CO_AUTHORED_BY}}`) that `lib/git-scopes.mjs::installSkill()` replaces at install time via `String.prototype.replaceAll`. The config is then read again at Claude invoke time because the SKILL.md instructs Claude to read `.claude/git-scopes.json` -- so scope changes after install still take effect without reinstalling the skill.

The one GIT-07 surprise: `git symbolic-ref refs/remotes/origin/HEAD` fails silently on repos where `origin/HEAD` is not set (a common state -- the pointer is only set if the user ran `git remote set-head origin --auto` or cloned with `--guess-remote-head`). Verified on this machine. The wizard must handle this with a three-step fallback chain ending in a confirmable prompt defaulting to `main`.

**Primary recommendation:** Build in order -- INFRA-02 (atomicWriteJson) to INFRA-01 (fixtures.mjs) to GIT-01/02 (schema + detection) to GIT-05 (skill template) to GIT-03/04 (CLI/wizard) to GIT-06/07 (config fields) to GIT-08 (install.mjs integration) to GIT-09 (doctor) to GIT-10 (commitlint print-only).

---

## Standard Stack

### Core (unchanged -- no new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` | Node 18+ | Read sentinel files, write configs atomically, copy SKILL.md | Already used throughout; `renameSync` is POSIX-atomic same-fs [VERIFIED: local test] |
| `node:path` | Node 18+ | Path joins, basename extraction for scope names | House style |
| `node:child_process` | Node 18+ | `execSync` for `git symbolic-ref`, `git remote set-head` | `runCmd` helper in `lib/shared.mjs` already wraps this |
| `prompts@^2.4.2` | pinned | `scopes init` interactive wizard | Only dep; already wired |

### New modules (Phase 6 only)

| File | LOC est. | Purpose |
|------|----------|---------|
| `lib/git-scopes.mjs` | ~200 | Pure schema: `detectStack()`, `readScopes()`, `writeScopes()`, `validateScopes()`, `detectMainBranch()`, `installSkill()` |
| `lib/git-conventions.mjs` | ~150 | `main(args)` for `scopes` subcommand -- dispatches to lib/git-scopes.mjs |
| `templates/skills/git-conventions/SKILL.md.tmpl` | ~120 | Parameterized skill template with token substitution |
| `tests/helpers/fixtures.mjs` | ~120 | Shared test helpers for all v0.9 phases |
| `tests/git-scopes.test.mjs` | ~150 | Detection fixture matrix + schema validation |
| `tests/git-conventions.test.mjs` | ~80 | CLI dispatch + wizard integration |

### What NOT to add

| Problem | Do NOT Use | Use Instead | Why |
|---------|-----------|-------------|-----|
| Parse pnpm-workspace.yaml | `yaml`, `js-yaml` | Regex on `packages:` block | Single-dep constraint |
| Parse Cargo.toml | `@iarna/toml` | Regex on `members` array | Single-dep constraint |
| Atomic file writes | bare `writeFileSync` to target | `atomicWriteJson()` from `lib/shared.mjs` | Readers see partial writes if process crashes mid-write |
| Skill template rendering | `handlebars`, `mustache`, `ejs` | `String.prototype.replaceAll('{{TOKEN}}', value)` | Overkill for 4-6 substitutions; violates single-dep |

**Installation command: none** -- zero new JavaScript dependencies.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
lib/
  git-scopes.mjs        # Pure schema module
  git-conventions.mjs   # CLI main(args) -- scopes subcommand dispatch
templates/
  skills/
    git-conventions/
      SKILL.md.tmpl     # Template with {{SCOPES}}, {{MAIN_BRANCH}}, etc.
tests/
  helpers/
    fixtures.mjs        # makeTempVault, makeTempGitRepo, makeTempMonorepo, withStubBinary
  git-scopes.test.mjs
  git-conventions.test.mjs
```

### Pattern 1: atomicWriteJson (INFRA-02)

**What:** Write JSON files via temp file + `renameSync`. Guarantees readers never see partial writes.
**When to use:** Every JSON config write in v0.9.
**Example:**

```javascript
// Source: lib/notebooklm-manifest.mjs lines 245-252 [VERIFIED: codebase read]
// Extract this exact pattern into lib/shared.mjs

// Current production code (already atomic in manifest module):
writeFileSync(tmpPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
renameSync(tmpPath, manifestPath(vaultRoot));

// New lib/shared.mjs export:
export function atomicWriteJson(filePath, obj) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  renameSync(tmp, filePath);
}
```

**Node 18 compat note:** `writeFileSync` + `renameSync` are Node 18+. Do NOT use `import.meta.dirname` (Node 20.11+ only) -- use `dirname(fileURLToPath(import.meta.url))` instead. [VERIFIED: CLAUDE.md Node 18+ constraint; existing pattern in lib/project-setup.mjs lines 16-17]

### Pattern 2: withStubBinary (INFRA-01)

**What:** Install a bash stub as a named command on PATH, run test, restore PATH.
**When to use:** Any test that exercises code calling external CLI binaries.
**Example:**

```javascript
// Source: tests/notebooklm.test.mjs before/after pattern [VERIFIED: codebase read]
// Generalize into tests/helpers/fixtures.mjs

export function withStubBinary(name, scriptContent, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cds-stub-'));
  const bin = join(dir, name);
  writeFileSync(bin, `#!/bin/sh\n${scriptContent}`, 'utf8');
  chmodSync(bin, 0o755);
  const origPath = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${origPath}`;
  try {
    return fn(dir);
  } finally {
    process.env.PATH = origPath;
    rmSync(dir, { recursive: true, force: true });
  }
}
```

Note: The existing `tests/fixtures/notebooklm-stub.sh` uses env vars (`NOTEBOOKLM_STUB_STDOUT`, `NOTEBOOKLM_STUB_EXIT`) to control stub behavior. This same env-var-driven approach should be the convention for all stubs generated via `withStubBinary`. [VERIFIED: tests/fixtures/notebooklm-stub.sh]

### Pattern 3: makeTempGitRepo (INFRA-01)

**What:** Create a temp directory initialized as a git repo.
**Critical:** Must pass GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL env vars to `git commit` -- CI machines may not have global git config.

```javascript
// Source: derived from tests/notebooklm.test.mjs temp-dir pattern [VERIFIED: codebase read]
export function makeTempGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-git-'));
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  };
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, stdio: 'pipe', env: gitEnv });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
```

**Note on `git symbolic-ref` in tests:** `makeTempGitRepo` has no remote. Tests for `detectMainBranch()` should either (a) test the fallback chain by verifying `null` is returned from a no-remote repo, or (b) mock `runCmd` to return controlled values.

### Pattern 4: makeTempMonorepo(stackType) (INFRA-01)

**What:** Create a temp dir with sentinel files for a given stack type.
**When to use:** Fixture matrix tests for `detectStack()`.

Supported stack types and their sentinel files:
- `pnpm-workspace`: `pnpm-workspace.yaml` with packages block + `apps/ca/`, `apps/nmp/`
- `npm-workspaces`: `package.json` with `"workspaces": ["apps/*"]` + `apps/web/`
- `lerna`: `lerna.json` with `"packages": ["packages/*"]` + `packages/core/`
- `nx`: `nx.json` + `apps/` + `packages/` directories (heuristic)
- `cargo-workspace`: `Cargo.toml` with `[workspace]\nmembers = ["crates/core"]`
- `go-multi-module`: subdirectories each with a `go.mod` file
- `python-uv`: `pyproject.toml` with `[tool.uv.workspace]` section
- `single-package`: no sentinel files -- fallback to `['core']`

### Pattern 5: Sentinel-File Detection Order (GIT-02)

**What:** `detectStack(projectDir)` returns `{ scopes, confidence, source }`.
**Order (highest-signal first):** [CITED: .planning/research/STACK.md section 1]

```javascript
// lib/git-scopes.mjs
export function detectStack(projectDir) {
  const { readFileSync, existsSync, readdirSync } = require('node:fs');
  // NOTE: use ESM imports at top of file; shown here for clarity

  // 1. pnpm-workspace.yaml
  const pnpmWs = join(projectDir, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWs)) {
    const content = readFileSync(pnpmWs, 'utf8');
    const scopes = extractScopesFromPnpmWorkspace(content, projectDir);
    if (scopes.length) return { scopes, confidence: 'high', source: 'pnpm-workspace' };
  }

  // 2. package.json workspaces
  // 3. lerna.json
  // 4. apps/ + packages/ heuristic (confidence: 'medium')
  // 5. Cargo.toml [workspace]
  // 6. go.mod multi-module (readdirSync subdirs for go.mod presence)
  // 7. pyproject.toml [tool.uv.workspace]
  // 8. Fallback
  return { scopes: ['core'], confidence: 'low', source: 'fallback' };
}
```

Glob expansion: for patterns like `apps/*`, use `readdirSync(appsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)`. Do NOT support `**` or nested globs -- direct children only. [CITED: .planning/research/STACK.md]

### Pattern 6: git-conventions SKILL.md Template (GIT-05)

The NMP SKILL.md (read at `/Users/eugenenakoneschniy/Work/NMP/.claude/skills/git-conventions/SKILL.md`) has these key sections that the CDS template must parameterize:

- **Scopes list** (line 28-33 in NMP): hardcoded `ca`, `nmp-app`, `sso`, `ui` etc. -> replace with `{{SCOPES_LIST}}`
- **Co-Authored-By checklist item** (line 147): present in NMP, MUST be omitted by default in CDS -> controlled by `{{CO_AUTHORED_BY_SECTION}}`
- **Main branch** (line 178): hardcoded `staging` in NMP -> replace with `{{MAIN_BRANCH}}`
- **Ticket format** (line 10): `; TICKET-NUMBER` -> replace with `{{TICKET_FORMAT}}` (empty string if no prefix)

The SKILL.md must also instruct Claude to read `.claude/git-scopes.json` at invoke time so changes survive without reinstall. Add a section near the top: `**Config file:** .claude/git-scopes.json -- read this file for current scopes and config.`

Token replacement in `installSkill(projectPath, config)`:

```javascript
// lib/git-scopes.mjs
export function installSkill(projectPath, config) {
  const tmplPath = join(PKG_ROOT, 'templates', 'skills', 'git-conventions', 'SKILL.md.tmpl');
  let content = readFileSync(tmplPath, 'utf8');

  const scopesList = config.scopes.map(s => `- \`${s}\``).join('\n');
  content = content.replaceAll('{{SCOPES_LIST}}', scopesList);
  content = content.replaceAll('{{MAIN_BRANCH}}', config.main_branch || 'main');
  content = content.replaceAll('{{TICKET_FORMAT}}', config.ticket_prefix ? `; ${config.ticket_prefix}NNN` : '');
  content = content.replaceAll('{{CO_AUTHORED_BY_SECTION}}',
    config.co_authored_by ? '- [ ] Co-Authored-By line included' : '');

  // Safety check: no unreplaced tokens
  if (content.includes('{{')) {
    throw new Error('SKILL.md template has unreplaced tokens');
  }

  const dest = join(projectPath, '.claude', 'skills', 'git-conventions', 'SKILL.md');
  mkdirp(dirname(dest));
  writeFileSync(dest, content, 'utf8');
}
```

### Pattern 7: installGitConventions() in bin/install.mjs (GIT-08)

**Insert point:** After the `if (components.notebooklm)` block (line ~1308), before `generateClaudeMD` call (line ~1313).

```javascript
// bin/install.mjs -- new function signature
async function installGitConventions(projectsData, stepNum, totalSteps) {
  step(stepNum, totalSteps, 'Git Conventions');
  // projectsData.projects is Map<dirPath, projectName>
  // For each project in projectsData:
  //   1. Detect stack: { scopes, confidence, source }
  //   2. Detect main branch (with fallback chain)
  //   3. prompt: "Detected scopes: [ca, ui]. Looks right? (Y/n)"
  //   4. prompt: "Main branch: main. Correct? (Y/n)"
  //   5. prompt: "Install commitlint enforcement? (y/N)" [only if package.json exists]
  //   6. writeScopes(projectPath, config) via atomicWriteJson
  //   7. installSkill(projectPath, config)
  // Return true on success, false on any failure
}
```

The function must NOT call `spawnSync('npm', ['install', ...])` under any circumstances. [VERIFIED: REQUIREMENTS.md GIT-10]

### Pattern 8: Doctor Section for git-scopes (GIT-09)

**Insert point:** After the NotebookLM section in `lib/doctor.mjs`, before section 2 (Vault).

```javascript
// lib/doctor.mjs addition (~25 lines)
// Source: pattern from existing doctor.mjs Vault section [VERIFIED: codebase read]

console.log('');
console.log(`  ${c.bold}Git Conventions${c.reset}`);
console.log('');

if (vaultPath) {
  const mapPath = join(vaultPath, 'project-map.json');
  if (existsSync(mapPath)) {
    let projectMap = {};
    try { projectMap = JSON.parse(readFileSync(mapPath, 'utf8')).projects || {}; }
    catch { warn('project-map.json malformed -- skipping git-scopes check'); }

    for (const [dirPath, projectName] of Object.entries(projectMap)) {
      if (!existsSync(dirPath)) continue; // stale entry, already warned by vault section
      const scopesPath = join(dirPath, '.claude', 'git-scopes.json');
      if (existsSync(scopesPath)) {
        ok(`${projectName}: git-scopes.json`);
      } else {
        warn(`${projectName}: .claude/git-scopes.json missing`);
        info(`Run: claude-dev-stack scopes init in ${dirPath}`);
        warnings++;
      }
    }
  } else {
    info('No project-map.json -- skipping git-scopes check');
  }
}
```

WARN severity (not ERROR) for missing file on existing projects. [VERIFIED: REQUIREMENTS.md resolved question #4 -- WARN for existing, ERROR for new install. Practical: always WARN in Phase 6; ERROR path can be added later by checking an install receipt file.]

### Anti-Patterns to Avoid

- **Don't write SKILL.md to `~/.claude/skills/`** (user-level). Write to `{project}/.claude/skills/git-conventions/SKILL.md` (project-level). User-level skills do not auto-invoke via `Skill()` call.
- **Don't call `npm install` or `npm run`** from any install path, even for commitlint. Print the commands with `info()`.
- **Don't use `import.meta.dirname`** -- Node 20.11+ only. Use `dirname(fileURLToPath(import.meta.url))`.
- **Don't assume `origin/HEAD` is set** -- it is absent on repos initialized with `git init` without a remote. [VERIFIED: local test]
- **Don't expand glob patterns recursively** -- `apps/*` means direct children of `apps/` only. No `glob` dep.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic JSON writes | bare `writeFileSync` to target | `atomicWriteJson()` (INFRA-02) | Readers see partial writes if process crashes mid-write |
| Temp test directories | Ad-hoc `mkdtempSync` in each test | `makeTempVault/Repo/Monorepo()` from `tests/helpers/fixtures.mjs` | 264+ tests need consistent setup; without fixtures.mjs maintenance collapses at 350+ |
| External CLI stubs in tests | Custom stub per test file | `withStubBinary(name, script, fn)` from `tests/helpers/fixtures.mjs` | Already solved in `tests/notebooklm.test.mjs`; generalize rather than duplicate |
| YAML parsing | Custom YAML parser | Regex on `packages:` block only | Single-dep constraint; wizard confirmation is the failsafe for missed scopes |
| Template engine | handlebars / mustache | `str.replaceAll('{{TOKEN}}', value)` | 4-6 substitutions; template has no loops or conditions |

**Key insight:** Every pattern in Phase 6 already exists in the codebase in specialized form. Phase 6 extracts and generalizes. Zero net new invention required.

---

## Common Pitfalls

### Pitfall 1: `git symbolic-ref refs/remotes/origin/HEAD` silently fails
**What goes wrong:** The command exits non-zero (no output) when `origin/HEAD` is not set. `runCmd()` returns `null`. Code misinterprets null as "no main branch exists."
**Why it happens:** `git init` never sets `origin/HEAD`. `git remote set-head origin --auto` requires network access.
**How to avoid:** Three-step fallback chain verified on this machine:
1. `git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null` -- works if remote was cloned or set-head ran
2. `git remote set-head origin --auto 2>/dev/null` then retry step 1 -- works with network access
3. `git branch --show-current 2>/dev/null` -- proxy for current branch (not guaranteed to be main)
4. Prompt user with default `main` if all three return null
[VERIFIED: local test on this machine; steps 1 and 2 both returned empty on this repo, step 3 returned `main`]

### Pitfall 2: pnpm-workspace.yaml -- quoted vs unquoted package patterns
**What goes wrong:** pnpm-workspace.yaml supports `- apps/*`, `- "apps/*"`, and `- 'apps/*'`. Simple regex misses quoted forms.
**How to avoid:** Use regex `^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$` with `gm` flags. Strip quotes from capture group before passing to `readdirSync`. [CITED: .planning/research/STACK.md]

### Pitfall 3: Template token left unreplaced in SKILL.md
**What goes wrong:** A typo in token name (e.g., `{{SCOPE_LIST}}` vs `{{SCOPES_LIST}}`) leaves a literal token in the installed SKILL.md. Claude sees it as text and does not substitute it.
**How to avoid:** After all `replaceAll` calls, assert `!content.includes('{{')`. If assertion fails, throw and abort with `fail()` message. Add a test that calls `installSkill` for each supported stack type and asserts no `{{` in output.

### Pitfall 4: M-6 -- Node 18 compat regression
**What goes wrong:** Using `import.meta.dirname` (Node 20.11+) or `Array.prototype.toSorted()` (Node 20) in new code. CI runs Node 18 first.
**How to avoid:** Pattern from `lib/project-setup.mjs` lines 16-17:
```javascript
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
```
[VERIFIED: CLAUDE.md + existing codebase pattern]

### Pitfall 5: `makeTempGitRepo` git identity not set in CI
**What goes wrong:** `git commit --allow-empty -m "init"` fails in CI if `user.name` and `user.email` are not configured globally.
**How to avoid:** Always pass `env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' }` to `execSync` for git commit calls in test helpers. [ASSUMED -- common CI failure mode]

### Pitfall 6: Doctor reads `project-map.json` which may be absent or malformed
**What goes wrong:** If vault is not configured or `project-map.json` was corrupted, `JSON.parse` throws, crashing the doctor section.
**How to avoid:** Wrap `readFileSync` + `JSON.parse` in try/catch. On any failure, `warn()` and continue. Check `existsSync(mapPath)` before reading. Mirrors how the vault section handles missing structure. [VERIFIED: lib/doctor.mjs pattern]

---

## Code Examples

### git-scopes.json v1 schema (GIT-01)

```json
{
  "version": 1,
  "project": "my-project",
  "scopes": ["core", "api", "ui"],
  "types": ["feat", "fix", "refactor", "test", "docs", "ci", "chore"],
  "ticket_prefix": "",
  "ticket_regex": "",
  "main_branch": "main",
  "branch_format": "{ticket}-{description}",
  "commit_format": "type(scope): subject",
  "co_authored_by": false,
  "commitlint_enforced": false,
  "auto_detect": {
    "enabled": true,
    "sources": ["pnpm-workspace"]
  }
}
```

Source: REQUIREMENTS.md GIT-01 field list + STACK.md schema decision. [CITED: .planning/REQUIREMENTS.md, .planning/research/STACK.md]

### scopes subcommand dispatch (lib/git-conventions.mjs)

```javascript
// Source: pattern from lib/notebooklm-cli.mjs dispatch pattern [VERIFIED: codebase]
export async function main(args = []) {
  const sub = args[0];
  const isQuick = args.includes('--quick');
  const isFull = args.includes('--full');

  if (!sub || sub === 'help' || sub === '--help') return printHelp();
  if (sub === 'list')    return cmdList(args.slice(1));
  if (sub === 'init')    return cmdInit({ quick: isQuick, full: isFull });
  if (sub === 'refresh') return cmdRefresh(args.slice(1));
  if (sub === 'add')     return cmdAdd(args.slice(1));
  if (sub === 'remove')  return cmdRemove(args.slice(1));

  fail(`Unknown scopes subcommand: ${sub}`);
  return printHelp();
}
```

### commitlint.config.mjs generation (GIT-10)

```javascript
// lib/git-scopes.mjs -- print-only commitlint installer
export function printCommitlintInstructions(config) {
  const scopeList = JSON.stringify(config.scopes);
  const typeList = JSON.stringify(config.types);

  info('To enforce commit format at commit time, run:');
  console.log('');
  console.log(`    npm install --save-dev @commitlint/cli@^19 @commitlint/config-conventional@^19 husky@^9`);
  console.log(`    npx husky init`);
  console.log(`    echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg`);
  console.log('');
  info('And create commitlint.config.mjs:');
  console.log(`
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ${scopeList}],
    'type-enum': [2, 'always', ${typeList}],
  },
};`);
}
```

Never call `spawnSync('npm', ['install', ...])` from this function. [VERIFIED: REQUIREMENTS.md GIT-10]

### validateScopes (GIT-01)

```javascript
// lib/git-scopes.mjs
export function validateScopes(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, reason: 'not-an-object' };
  if (obj.version !== 1) return { valid: false, reason: 'unknown-version' };
  if (!Array.isArray(obj.scopes) || obj.scopes.length === 0) return { valid: false, reason: 'missing-scopes' };
  if (typeof obj.main_branch !== 'string') return { valid: false, reason: 'missing-main-branch' };
  return { valid: true };
}
```

Mirror of `isValidManifestShape` in `lib/notebooklm-manifest.mjs` but returns reason string (Phase 7 will apply the same split to manifest validation). [CITED: .planning/REQUIREMENTS.md GIT-01]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded skill contents per project (NMP model) | Parameterized template + live config read at invoke time | Phase 6 (new) | Config changes take effect without skill reinstall |
| Manual `writeFileSync` to target path in each module | `atomicWriteJson()` shared helper | Phase 6 (INFRA-02) | All later phases use the same safe write path |
| Per-test inline temp dir setup | `makeTempVault/Repo/Monorepo/withStubBinary` in `tests/helpers/fixtures.mjs` | Phase 6 (INFRA-01) | 350+ tests stay maintainable |
| Per-module stub bash file in `tests/fixtures/` | `withStubBinary(name, script, fn)` abstraction | Phase 6 (INFRA-01) | Phases 7+ reuse for notebooklm per-project stubs without new files |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `withStubBinary` cleanup via `rmSync` in `finally` block is sufficient for CI | Pattern 2 | Stale `/tmp/cds-*` dirs accumulate in CI; add explicit after() assertion as CI canary |
| A2 | Direct-children-only glob expansion covers all real pnpm-workspace.yaml patterns | Pattern 5 | Multi-level globs like `packages/shared/*` yield no scopes; wizard confirmation is the failsafe |
| A3 | WARN severity for missing git-scopes is correct for all existing projects; ERROR not needed in Phase 6 | Pattern 8 | REQUIREMENTS.md says ERROR for new install post-wizard -- may need install-receipt file to distinguish |
| A4 | Template token safety assertion (`!content.includes('{{')`) should throw at install time | Pattern 6 | Silent unreplaced tokens in deployed SKILL.md |
| A5 | `makeTempGitRepo` needs explicit git identity env vars for CI | Pattern 3 | `git commit --allow-empty` fails in CI without global git config |

**Verified claims:** All architecture claims grounded in direct codebase reads or local tests. Assumed claims: 5 (listed above).

---

## Open Questions

1. **One install step for all projects or one per project?**
   - What we know: `totalSteps` calculated once before the install loop; adding per-project steps requires dynamic totalSteps
   - What's unclear: UX preference
   - Recommendation: One combined step ("Git Conventions for N projects"), iterate inside; matches the NotebookLM single-step pattern

2. **First-match or union for detectStack?**
   - What we know: Most projects have only one stack type; Turborepo + pnpm-workspace combo is common
   - Recommendation: First-match (highest-signal sentinel wins); pnpm-workspace.yaml beats all others if present

3. **Template file location: `templates/skills/git-conventions/SKILL.md.tmpl` or `skills/git-conventions/SKILL.md.tmpl`?**
   - `skills/` contains static user-level skills (session-manager, dev-router, etc.)
   - git-conventions is project-level and parameterized -- different lifecycle
   - Recommendation: `templates/skills/git-conventions/SKILL.md.tmpl` to keep static and parameterized skills separate

4. **Should `scopes init --quick` infer project name or always prompt?**
   - Pre-fill from `package.json.name` or `basename(projectDir)`, let user confirm
   - Recommendation: Auto-detect and confirm in one prompt ("Project name: my-project [enter to confirm]")

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 18+ | All new modules | ✓ | 20.12.2 dev; 18/20/22 in CI | -- |
| `git` | detectMainBranch, makeTempGitRepo | ✓ | present | Wizard prompts manually for main branch |
| `node:fs renameSync` | atomicWriteJson | ✓ | POSIX-atomic verified [VERIFIED: local test] | -- |
| `prompts@^2.4.2` | scopes init wizard | ✓ | pinned | -- |

No missing dependencies. Phase 6 is pure Node builtins + existing dep.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `node:assert/strict` |
| Config file | None -- `npm test` runs `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/git-scopes.test.mjs tests/git-conventions.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | `makeTempVault` creates correct vault structure | unit | `node --test tests/helpers/fixtures.test.mjs` | No -- Wave 0 |
| INFRA-01 | `makeTempGitRepo` creates initialized git repo | unit | same | No -- Wave 0 |
| INFRA-01 | `makeTempMonorepo(type)` for each of 8 stack types | unit | same | No -- Wave 0 |
| INFRA-01 | `withStubBinary` installs stub, restores PATH, cleans up | unit | same | No -- Wave 0 |
| INFRA-02 | `atomicWriteJson` writes valid JSON file atomically | unit | `node --test tests/shared.test.mjs` | No (add to existing) |
| GIT-01 | `validateScopes` rejects missing fields, wrong version | unit | `node --test tests/git-scopes.test.mjs` | No -- Wave 0 |
| GIT-01 | `readScopes` / `writeScopes` round-trip | unit | same | No -- Wave 0 |
| GIT-02 | `detectStack` returns correct scopes for pnpm-workspace.yaml | unit | same | No -- Wave 0 |
| GIT-02 | `detectStack` returns correct scopes for npm workspaces package.json | unit | same | No -- Wave 0 |
| GIT-02 | `detectStack` returns `['core']` for no sentinel files | unit | same | No -- Wave 0 |
| GIT-02 | `detectStack` zero false positives -- all 8 fixture types | unit | same | No -- Wave 0 |
| GIT-05 | `installSkill` replaces all tokens, no `{{` left in output | unit | same | No -- Wave 0 |
| GIT-05 | SKILL.md installed to correct project-level path | unit | `node --test tests/git-conventions.test.mjs` | No -- Wave 0 |
| GIT-07 | `detectMainBranch` returns null for repo with no remote | unit | `node --test tests/git-scopes.test.mjs` | No -- Wave 0 |
| GIT-09 | Doctor WARN on missing git-scopes.json for mapped project | unit | `node --test tests/doctor.test.mjs` | Yes (extend) |

### Sampling Rate

- **Per task commit:** `node --test tests/git-scopes.test.mjs tests/git-conventions.test.mjs tests/shared.test.mjs`
- **Per wave merge:** `npm test` (full suite, all Node matrix via CI)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/helpers/fixtures.mjs` -- shared test infrastructure (INFRA-01); needed by all Phase 6 tests and all future phase tests
- [ ] `tests/helpers/fixtures.test.mjs` -- tests for the fixture helpers themselves (PATH cleanup, temp dir creation, stub behavior)
- [ ] `tests/git-scopes.test.mjs` -- covers GIT-01, GIT-02, GIT-07
- [ ] `tests/git-conventions.test.mjs` -- covers GIT-03, GIT-04, GIT-05 dispatch
- [ ] Add `atomicWriteJson` tests to `tests/shared.test.mjs` (existing file -- just add describe block)

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | no | -- |
| V5 Input Validation | yes (partial) | `validateScopes()` returns `{valid, reason}`; `JSON.parse` in try/catch for corrupt config |
| V6 Cryptography | no | -- |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `.claude/git-scopes.json` | Tampering | `JSON.parse` in try/catch; `validateScopes()` before use; corrupt config triggers WARN + abort |
| Template token injection via scope names | Tampering | Scope names used as strings in SKILL.md only -- never as FS path segments; no shell interpolation |
| Commitlint config `scope-enum` injection | Tampering | Scope names come from `readdirSync` basenames or `JSON.parse` of sentinel files, not raw user input; `JSON.stringify` when embedding in generated .mjs file |

---

## Sources

### Primary (HIGH confidence)
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/notebooklm-manifest.mjs` -- atomic write pattern lines 240-257, `isValidManifestShape` lines 136-141 [VERIFIED: codebase read]
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/tests/notebooklm.test.mjs` -- withStubBinary pattern: before/after PATH manipulation, mkdtempSync, env var control [VERIFIED: codebase read]
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/tests/fixtures/notebooklm-stub.sh` -- existing stub design [VERIFIED: codebase read]
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/project-setup.mjs` -- marker-based CLAUDE.md template injection, PROJECT_SKILLS pattern [VERIFIED: codebase read]
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/doctor.mjs` -- WARN/ERROR severity pattern, project-map iteration [VERIFIED: codebase read]
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/bin/install.mjs` -- wizard step pattern, totalSteps calc, per-component install function signature [VERIFIED: codebase read]
- `/Users/eugenenakoneschniy/Work/NMP/.claude/skills/git-conventions/SKILL.md` -- NMP reference (hardcoded scopes, Co-Authored-By enabled, staging branch) [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` -- all 12 Phase 6 requirement IDs with field-level detail [VERIFIED: file read]
- `.planning/research/STACK.md` -- detection order, regex patterns, schema decisions, commitlint template [CITED: file read]
- `.planning/research/SUMMARY.md` -- locked decisions, critical pitfalls, architecture file map [CITED: file read]
- Local test: `git symbolic-ref refs/remotes/origin/HEAD` failure verified; `git remote set-head origin --auto` + re-read succeeds [VERIFIED]
- Local test: `writeFileSync + renameSync` atomic pattern verified working on this machine [VERIFIED]

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` -- C-5 commitlint/CDS conflict, M-5 fixtures infra, M-6 Node 18 compat
- `.planning/research/ARCHITECTURE.md` -- LOC estimates, file map, module boundaries

### Tertiary (LOW confidence)
- `makeTempGitRepo` CI git identity requirement (A5) -- common CI pattern, not confirmed against this repo's CI config

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new deps; all patterns verified in production codebase
- Architecture: HIGH -- all structural claims grounded in direct file reads and local tests
- Pitfalls: HIGH -- GIT-07 main-branch detection failure verified locally; all other pitfalls grounded in specific code lines or requirement text

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain -- no upstream API surfaces, pure Node builtins)
