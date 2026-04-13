# Phase 15: DX — Auto-Approve & Smart Re-install - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two user-facing DX improvements to the install wizard:

1. **DX-01** — Write `allowedTools` patterns into `.claude/settings.json` during install so session-manager can read `context.md` and write session logs without triggering permission prompts.
2. **DX-02** — Make `bin/install.mjs` idempotent: detect existing install state and offer skip/reconfigure per section, with existing values pre-filled as defaults.

Both changes are confined to `bin/install.mjs` and `lib/install/` modules. No public CLI commands change. No user data is lost or migrated.

</domain>

<decisions>
## Implementation Decisions

### DX-01: Auto-Approve allowedTools in settings.json

- **D-01:** Write `allowedTools` array into `~/.claude/settings.json` during `installSessionHook()` in `lib/install/hooks.mjs`. This is the correct file — hooks.mjs already owns settings.json read/write.
- **D-02:** Approved tool patterns cover the three vault operations session-manager performs:
  - `Read` on `context.md` — pattern: `Read(~/vault/**/context.md)` and `Read(~/vault/**/sessions/*.md)`
  - `Write` on session logs — pattern: `Write(~/vault/**/sessions/*.md)`
  - `Read` on shared patterns — pattern: `Read(~/vault/shared/**)`
  Rendered with the actual vault path substituted (e.g. `Read(/home/user/vault/**/context.md)`).
- **D-03:** `allowedTools` entries are glob strings following Claude Code's `allowedTools` format: `ToolName(glob)`. Example: `"Read(/Users/alice/vault/**/context.md)"`. Use the resolved absolute vault path, not `~/`.
- **D-04:** If `allowedTools` already exists in settings.json, append new entries — do not overwrite existing ones. Deduplicate by exact string match before writing.
- **D-05:** The vault path is available at the time `installSessionHook()` is called (it is resolved in step 6 of `main()` in `bin/install.mjs` and passed to `installVault()`). Pass vaultPath as a parameter to `installSessionHook()`. Current signature: `installSessionHook(stepNum, totalSteps, pkgRoot)` → new signature: `installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath)`.
- **D-06:** Approved tool list (final, conservative — only what session-manager needs):
  ```
  Read(<vaultPath>/**/context.md)
  Read(<vaultPath>/**/sessions/*.md)
  Write(<vaultPath>/**/sessions/*.md)
  Read(<vaultPath>/shared/patterns.md)
  Read(<vaultPath>/meta/project-registry.md)
  ```
- **D-07:** After writing, call `ok('Auto-approve configured for vault read/write')` and `info('Inspect: ~/.claude/settings.json → allowedTools')` to satisfy success criterion 5.

### DX-02: Smart Re-install Wizard (Idempotent)

- **D-08:** Detection logic runs at the very start of `main()` in `bin/install.mjs`, before any step prompts. A new helper `detectInstallState(vaultPath)` in a new file `lib/install/detect.mjs` returns a state object indicating what is already configured:
  ```js
  {
    vaultExists: bool,        // vaultPath dir has meta/ and projects/ subdirs
    vaultPath: string|null,   // resolved vault path if found
    hooksInstalled: bool,     // settings.json has SessionStart + Stop hooks
    gitRemote: string|null,   // git remote origin url from vault .git/config
    projects: Array,          // {name, path} from vault/meta/project-registry.md
    profile: { lang, codeLang }|null,  // from ~/.claude/CLAUDE.md frontmatter or null
  }
  ```
- **D-09:** Vault path detection order (same as `findVault()` in `lib/projects.mjs`):
  1. `~/vault`
  2. `~/Vault`
  3. `~/.vault`
  4. `~/obsidian-vault`
  5. `~/Documents/vault`
  Valid vault = has `meta/` AND `projects/` subdirectories.
- **D-10:** If existing install is detected, show a summary banner before the step prompts:
  ```
    ℹ Existing install detected:
      ✔ Vault: ~/vault  (3 projects)
      ✔ Hooks: installed
      ✔ Git remote: git@github.com:user/vault.git
      ✘ Profile: not set
  ```
  Then ask: `Reconfigure everything from scratch? [y/N]`. If N (default), enter skip-aware mode.
- **D-11:** Per-section skip UX. Each wizard section that has a complete state offers a choice prompt before running:
  ```
  ? Vault setup — already at ~/vault [3 projects]. (skip / reconfigure)
  ```
  Choice options: `skip` (default) | `reconfigure`. If skip → section returns cached values without prompting. If reconfigure → section runs normally with existing values as `initial` defaults.
- **D-12:** Pre-fill strategy per section:
  - **Vault path** (`getVaultPath`): `initial` = detected `vaultPath` or `~/vault`
  - **Git remote** (inline in `main()`): `initial` = detected `gitRemote` or `''`
  - **Profile** (`collectProfile`): `initial.lang` = detected `profile.lang` or `'en'`
  - **Projects** (`collectProjects`): Pre-select existing projects in multiselect; append new ones
- **D-13:** "Already installed" state is NOT stored in a separate file. Detection reads live filesystem state each run (vault dirs, settings.json hooks, git remote). This avoids stale state files and is always accurate.
- **D-14:** Skip returns the cached value so downstream steps still receive valid data. Example: skipping vault step returns `{ vaultPath: detectedVaultPath }` without re-prompting.
- **D-15:** `collectProjects()` in skip-aware mode: reads `vault/meta/project-registry.md` to extract existing project names and paths (markdown table `| name | status | path |`). These become the pre-selected choices in the multiselect. New directories in the base dir are unselected by default (user can add them).
- **D-16:** Hooks section skip condition: `settings.hooks.SessionStart` array contains an entry with `session-start-context` in the command string. This is the same check already in `installSessionHook()` (`hasStart` variable).
- **D-17:** If user selects "reconfigure" on a completed section, the section runs in full with detected values as `initial` (defaults). No section state is locked — user can always re-run a step.
- **D-18:** New file `lib/install/detect.mjs` isolates detection logic. It imports from `lib/shared.mjs` only. No circular deps. Exported: `detectInstallState()` → returns state object (D-08 shape).

### Module Interface Changes

- **D-19:** `getVaultPath(totalSteps, detectedPath)` — add optional `detectedPath` param; if provided, use as `initial` in `askPath()`.
- **D-20:** `collectProfile(totalSteps, detectedProfile)` — add optional `detectedProfile` param; pre-fill `initial` values.
- **D-21:** `collectProjects(totalSteps, detectedProjects, detectedBaseDir)` — add optional params; pre-select detected projects.
- **D-22:** `installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath)` — add required `vaultPath` param for DX-01 auto-approve patterns.

### Testing

- **D-23:** New `tests/detect.test.mjs` — unit tests for `detectInstallState()` using temp directories to simulate installed/uninstalled states. Cover: vault missing, vault present + no hooks, vault present + hooks installed, git remote present/missing.
- **D-24:** Existing `tests/install.test.mjs` (if present) — add tests for modified function signatures. If no test file exists, create `tests/install-detect.test.mjs`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Entry Point
- `bin/install.mjs` — full wizard orchestrator (108 lines). Read to understand step ordering, how vaultPath flows between steps, where to inject detection logic.

### Install Modules (lib/install/)
- `lib/install/hooks.mjs` — owns settings.json read/write. DX-01 writes `allowedTools` here. Read current `installSessionHook()` signature.
- `lib/install/vault.mjs` — `getVaultPath()` collects vault path (step 6). DX-02 pre-fills detected path here.
- `lib/install/profile.mjs` — `collectProfile()` collects lang settings. DX-02 pre-fills here.
- `lib/install/projects.mjs` — `collectProjects()` collects project list. DX-02 pre-selects detected projects here.

### Shared Utilities
- `lib/shared.mjs` — `c`, `ok`, `warn`, `info`, `prompt`, `askPath`, `existsSync`, `homedir`, `atomicWriteJson`. Use these; no new deps.

### Settings.json Format
- `lib/install/hooks.mjs` lines 10–19 — read/parse/write pattern for `~/.claude/settings.json`. Follow exactly (existsSync guard, JSON.parse try/catch, JSON.stringify with 2-space indent + newline).

### Existing Vault Detection (reference)
- `lib/projects.mjs` — `findVault()` searches candidate paths. `detectInstallState()` should use the same candidate list (D-09).

### Claude Code allowedTools Format
- String pattern: `"ToolName(glob)"` where glob is absolute path with `**` and `*` wildcards.
- Example: `"Read(/Users/alice/vault/**/context.md)"`, `"Write(/Users/alice/vault/**/sessions/*.md)"`.
- Key in settings.json: `allowedTools` (array of strings at top level, not nested under hooks).

</canonical_refs>

<code_context>
## Existing Code Insights

### settings.json write pattern (hooks.mjs lines 10–19, 109–112)
```js
const settingsPath = join(homedir(), '.claude', 'settings.json');
let settings = {};
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    warn(`settings.json is corrupt or invalid JSON — skipping hook installation`);
    return;
  }
}
// ... mutate settings ...
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
```
DX-01 adds `allowedTools` mutation before the final `writeFileSync`.

### prompt() pattern for skip/reconfigure choice
```js
const { action } = await prompt({
  type: 'select',
  name: 'action',
  message: 'Vault setup — already at ~/vault (3 projects)',
  choices: [
    { title: 'Skip (keep existing)', value: 'skip' },
    { title: 'Reconfigure', value: 'reconfigure' },
  ],
  initial: 0,
});
if (action === 'skip') return cachedValue;
```

### askPath() with pre-filled default
```js
// existing: const raw = await askPath('Vault path', join(homedir(), 'vault'));
// new: const raw = await askPath('Vault path', detectedPath || join(homedir(), 'vault'));
```

### detectInstallState() outline
```js
// lib/install/detect.mjs
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

const VAULT_CANDIDATES = [
  join(homedir(), 'vault'),
  join(homedir(), 'Vault'),
  join(homedir(), '.vault'),
  join(homedir(), 'obsidian-vault'),
  join(homedir(), 'Documents', 'vault'),
];

export function detectInstallState() {
  // 1. Find vault
  const vaultPath = VAULT_CANDIDATES.find(p =>
    existsSync(join(p, 'meta')) && existsSync(join(p, 'projects'))
  ) || null;

  // 2. Check hooks in settings.json
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let hooksInstalled = false;
  if (existsSync(settingsPath)) {
    try {
      const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
      hooksInstalled = (s.hooks?.SessionStart || []).some(e =>
        e.hooks?.some(h => h.command?.includes('session-start-context'))
      );
    } catch {}
  }

  // 3. Read git remote from vault
  let gitRemote = null;
  if (vaultPath && existsSync(join(vaultPath, '.git'))) {
    const r = spawnSync('git', ['remote', 'get-url', 'origin'],
      { cwd: vaultPath, encoding: 'utf8', stdio: 'pipe' });
    if (r.status === 0) gitRemote = r.stdout.trim();
  }

  // 4. Parse projects from project-registry.md
  const projects = [];
  if (vaultPath) {
    const regPath = join(vaultPath, 'meta', 'project-registry.md');
    if (existsSync(regPath)) {
      // parse markdown table rows
    }
  }

  return { vaultExists: !!vaultPath, vaultPath, hooksInstalled, gitRemote, projects, profile: null };
}
```

### Established Patterns
- All `lib/install/` modules use named exports, no default export.
- `step(num, total, title)` from `lib/shared.mjs` for section headers.
- `ok()`, `warn()`, `info()` for feedback lines.
- `prompt()` wrapper from `lib/shared.mjs` (handles Ctrl+C gracefully).
- ESM `.mjs` extension, 2-space indent, semicolons throughout.

### Integration Point in bin/install.mjs
Detection runs at line ~38 (after `printHeader()`, before step 2):
```js
import { detectInstallState } from '../lib/install/detect.mjs';
// ...
const installState = detectInstallState();
// show banner if installState.vaultExists
// pass installState down to collectProfile, collectProjects, getVaultPath
```

</code_context>

<specifics>
## Specific Ideas

- Per success criterion 5: after writing allowedTools, print the settings.json path so user can inspect: `info('Inspect: ' + settingsPath + ' → allowedTools')`.
- Per success criterion 1–3: detection banner should display project count from vault, not just vault path, so user immediately knows what was found.
- The 999.1-smart-re-install-wizard placeholder directory in `.planning/phases/` confirms this feature was already planned as a future item — Phase 15 delivers it.

</specifics>

<deferred>
## Deferred Ideas

- **DX-FUT-01**: Granular per-tool auto-approve (Read / Write / Bash separately configurable). Deferred to v0.12 per REQUIREMENTS.md.
- Profile detection from `~/.claude/CLAUDE.md` frontmatter: if CLAUDE.md parsing is complex, skip profile pre-fill in v1 — pre-fill vault path and projects only (which are filesystem-verifiable). Profile can remain manual.
- Per-project `allowedTools` (project-scoped settings.json in `~/.claude/projects/`): out of scope for Phase 15, use global `~/.claude/settings.json` only.

</deferred>

---

*Phase: 15-dx-auto-approve-smart-re-install*
*Context gathered: 2026-04-13*
