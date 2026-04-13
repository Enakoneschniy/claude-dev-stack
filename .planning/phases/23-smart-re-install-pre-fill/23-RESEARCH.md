# Phase 23: Smart Re-install Pre-fill - Research

**Researched:** 2026-04-13
**Domain:** Wizard UX — stateful re-install pre-fill, profile persistence, version checks
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Store wizard profile in `vault/meta/profile.json` — alongside project-map.json. Syncs via vault git sync.
**D-02:** Profile contains `lang`, `codeLang`, `useCase` fields. Wizard writes on first install, reads on re-install.
**D-03:** `detectInstallState()` reads profile.json and returns profile object instead of `null`.
**D-04:** Unified select prompt for all pre-filled values: "Language: ru — Keep current / Change". Consistent with UX-07 feedback (select over y/N).
**D-05:** When user selects "Change" — show original prompt with `initial` set to current value. Same flow as fresh install.
**D-06:** Already-registered projects (DX-09) — silent skip with info line. Prompt only for NEWLY selected dirs.
**D-07:** GSD version check via `npx get-shit-done-cc --version` compared against `npm view get-shit-done-cc version`.
**D-08:** If already latest — auto-skip with info line "GSD: up to date (v1.34.2)". No prompt.
**D-09:** If outdated — show "GSD: v1.33.0 → v1.34.2 available. Update / Skip" select.
**D-10:** Check `~/.notebooklm/storage_state.json` existence. If exists — considered authenticated.
**D-11:** When authenticated — show "NotebookLM: authenticated" then select: "Skip / Re-login / Run sync now".
**D-12:** Replace "First sync" text with "Run sync now?" for re-installs.
**D-13:** loop.md and git-conventions use "Install for all N projects? (Y/n)" bulk prompt instead of per-project confirms.

### Claude's Discretion
- Projects directory pre-fill (DX-08): Claude decides best source — `project-map.json` paths common prefix or stored in profile.json.
- Profile.json schema version: Claude decides if versioning is needed.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DX-07 | Re-install wizard pre-fills communication language and code language from vault profile. Shows "Language: ru (change? y/N)" instead of blank prompt. | D-01..D-05; profile.json persistence pattern; select prompt pattern from existing vault/hooks steps |
| DX-08 | Re-install wizard pre-fills projects directory from existing project-map.json. | D-03 + detectProjectsDir() from b2fe143; project-map.json structure confirmed (`{ "projects": { path: name } }`) |
| DX-09 | Already-registered projects skip the "Project name for X" prompt entirely. Wizard only asks names for newly selected projects. | D-06; _registeredPaths() must become Map, not Set; registeredPaths.get(dirPath) for existing name |
| DX-10 | Use case selection pre-filled from previous install. Shows current value with change option instead of blank selector. | D-02 `useCase` field in profile; plugins.mjs receives detectedUseCase param; `initial` index on select |
| DX-11 | GSD install checks installed version against latest — skips npx if already up to date. | D-07..D-09; version read from ~/.claude/get-shit-done/package.json; npm view get-shit-done-cc version |
| DX-12 | NotebookLM login checks ~/.notebooklm/storage_state.json — skips browser OAuth if already authenticated. | D-10..D-12; storage_state.json confirmed present at this location; notebooklmAuthenticated in installState |
| DX-13 | Bulk prompts (loop.md per project, git-conventions per project) use "Install for all N projects?" instead of N individual y/N prompts. | D-13; installLoopMd + git-conventions both have per-project loops |

</phase_requirements>

---

## Summary

Phase 23 adds stateful pre-fill to the wizard re-install flow. All seven requirements (DX-07 through DX-13) have a prior implementation attempt in commit `b2fe143` (reverted in `139c6a9`). The DX feature code was technically complete and all 34 new tests passed — the revert was caused by a **bundled unrelated change** (CLAUDE.md template overwrite, same antipattern as BUG-07) that wiped ~349 lines from the project's CLAUDE.md. The Phase 23 DX code itself is sound and can be re-implemented by cherry-picking the relevant file changes from `b2fe143`.

Two key corrections are needed vs. the reverted attempt: (1) the profile file name must be `profile.json` (CONTEXT D-01), not `install-profile.json` as used in b2fe143; (2) the language-change prompt must be `type: 'select'` with "Keep current / Change" choices (CONTEXT D-04), not `type: 'confirm'` as used in b2fe143.

The implementation touches 8 files plus `bin/install.mjs` (orchestration) and `tests/install.test.mjs`. No new npm dependencies are needed — all functionality uses existing `fs`, `path`, `os`, `child_process` Node builtins and the project's own `lib/shared.mjs` helpers.

**Primary recommendation:** Re-implement the b2fe143 DX changes cleanly, applying the two corrections above, in a focused branch with NO CLAUDE.md template changes bundled.

---

## Prior Attempt Analysis (CRITICAL)

### What b2fe143 implemented (correctly)

[VERIFIED: git show b2fe143]

| Requirement | File | Approach | Status |
|-------------|------|----------|--------|
| DX-07 | `lib/install/profile.mjs` | `saveInstallProfile()` + `readInstallProfile()` + change confirm prompt | Correct logic, wrong UX (confirm vs select) |
| DX-08 | `lib/install/detect.mjs` | `detectProjectsDir()` — common path prefix from project-map.json | Correct |
| DX-09 | `lib/install/projects.mjs` | `_registeredPaths()` upgraded Set→Map; `registeredPaths.get(dirPath)` skip | Correct |
| DX-10 | `lib/install/plugins.mjs` | `detectedUseCase` param; `initial` index pre-select + info line | Correct |
| DX-11 | `lib/install/gsd.mjs` | Read `~/.claude/get-shit-done/package.json`, `npm view get-shit-done-cc version` | Correct |
| DX-12 | `lib/install/notebooklm.mjs` | `alreadyAuthenticated` param, skip login, "Run sync now?" prompt text | Correct |
| DX-13 | `lib/install/components.mjs` | Bulk "Install for all N?" confirm for new + installed project sets | Correct |

### Why it was reverted

[VERIFIED: git show 139c6a9]

The PR (`b2fe143`) bundled two internal commits:
1. `fix: add TeamCreate single-phase rule to CLAUDE.md template and project` — this overwrote ~349 lines from the project's CLAUDE.md (writeFileSync-style overwrite, the same antipattern as BUG-07).
2. `feat(phase-23): smart re-install pre-fill for all wizard steps` — the actual DX feature code (correct).

The revert message was `Revert "feat(phase-23): smart re-install pre-fill for all wizard steps"` and reverted commit `bcc92392` (the inner feature commit from the squash-merge). The DX feature code itself had no bugs — the sole trigger was the CLAUDE.md overwrite.

### Corrections needed vs b2fe143

**Correction 1 — Profile filename:**
- b2fe143 used: `vault/meta/install-profile.json`
- CONTEXT D-01 requires: `vault/meta/profile.json`
- Impact: `readInstallProfile()`, `saveInstallProfile()` functions and all test assertions must use `profile.json`

**Correction 2 — Language change prompt UX:**
- b2fe143 used: `type: 'confirm', message: 'Change language settings?'`
- CONTEXT D-04 requires: `type: 'select', choices: ['Keep current', 'Change']`
- Impact: `collectProfile()` in `lib/install/profile.mjs`

**Correction 3 — Do NOT bundle CLAUDE.md changes:**
- Phase 23 must only touch the 8 DX files + install.mjs + tests
- Any CLAUDE.md template corrections are separate concerns

---

## Standard Stack

### Core (no new dependencies needed)
[VERIFIED: package.json in project root; STATE.md constraint "single-dep constraint preserved: prompts@^2.4.2 only"]

| Module | Version | Purpose |
|--------|---------|---------|
| `fs` (Node built-in) | Node 20.x | profile.json read/write, file existence checks |
| `path` (Node built-in) | Node 20.x | path joining, common prefix computation |
| `os` (Node built-in) | Node 20.x | `homedir()` for storage_state.json path |
| `child_process` (Node built-in) | Node 20.x | `spawnSync` for `npm view get-shit-done-cc version` |
| `prompts@^2.4.2` | 2.4.2 | `type: 'select'` and `type: 'confirm'` prompts (already installed) |

**Installation:** No new packages needed. [VERIFIED: npm test baseline — project runs on existing deps]

---

## Architecture Patterns

### Profile Persistence Pattern
[VERIFIED: lib/install/detect.mjs HEAD + b2fe143 diff]

**Write** (end of wizard, after vaultPath is known):
```javascript
// lib/install/profile.mjs
export function saveInstallProfile(vaultPath, profile) {
  if (!vaultPath) return;
  const metaDir = join(vaultPath, 'meta');
  if (!existsSync(metaDir)) mkdirSync(metaDir, { recursive: true });
  writeFileSync(join(metaDir, 'profile.json'), JSON.stringify(profile, null, 2));
}
```

**Read** (in detect.mjs, returned in installState.profile):
```javascript
// lib/install/detect.mjs
export function readInstallProfile(vaultPath) {
  if (!vaultPath) return null;
  const profilePath = join(vaultPath, 'meta', 'profile.json');
  if (!existsSync(profilePath)) return null;
  try { return JSON.parse(readFileSync(profilePath, 'utf8')); }
  catch { return null; }
}
```

Profile schema (D-02):
```json
{ "lang": "ru", "codeLang": "en", "useCase": "fullstack" }
```

Schema versioning decision (Claude's Discretion): Not needed for v1. Profile fields are optional/additive — missing fields fall back to defaults. No version field required.

### Select Prompt Pre-fill Pattern (D-04 requirement)
[VERIFIED: install.mjs lines 89-108 — existing vault/hooks skip/reconfigure pattern; CONTEXT D-04]

The CONTEXT.md explicitly specifies `type: 'select'` with "Keep current / Change" for all pre-filled values. This is consistent with existing skip patterns in install.mjs:

```javascript
// Correct pattern for DX-07 language pre-fill (D-04 compliant)
if (detectedProfile?.lang) {
  info(`Current: lang=${c.bold}${detectedProfile.lang}${c.reset}, code=${c.bold}${detectedProfile.codeLang || 'en'}${c.reset}`);
  const { action } = await prompt({
    type: 'select',
    name: 'action',
    message: `Language: ${detectedProfile.lang} — keep or change?`,
    choices: [
      { title: 'Keep current', value: 'keep' },
      { title: 'Change', value: 'change' },
    ],
    initial: 0,
  });
  if (action === 'keep') {
    ok(`Language: ${detectedProfile.lang}, code: ${detectedProfile.codeLang || 'en'} (kept)`);
    return { ...detectedProfile, name: detectedProfile.name || '', company: detectedProfile.company || '' };
  }
  // Falls through to original prompt with initial pre-filled (D-05)
}
```

### Common Path Prefix Algorithm
[VERIFIED: b2fe143 diff for detectProjectsDir()]

**Input:** `{ "projects": { "/Users/x/Projects/foo": "foo", "/Users/x/Projects/bar": "bar" } }`
**Output:** `/Users/x/Projects`

```javascript
export function detectProjectsDir(vaultPath) {
  if (!vaultPath) return null;
  const mapPath = join(vaultPath, 'project-map.json');
  if (!existsSync(mapPath)) return null;
  try {
    const data = JSON.parse(readFileSync(mapPath, 'utf8'));
    const paths = Object.keys(data.projects || {}).filter(Boolean);
    if (paths.length === 0) return null;
    const parts = paths[0].split('/');
    let common = parts.slice(0, -1);
    for (const p of paths.slice(1)) {
      const pparts = p.split('/');
      const parent = pparts.slice(0, -1);
      while (common.length > 0 && common.join('/') !== parent.slice(0, common.length).join('/')) {
        common = common.slice(0, -1);
      }
    }
    const result = common.join('/');
    return result.length > 1 ? result : null;
  } catch { return null; }
}
```

**Verified with real data:** vault/project-map.json has 8 projects all under `/Users/eugenenakoneschniy/Projects/` — algorithm produces correct prefix. [VERIFIED: cat vault/project-map.json]

### Registered Paths Map Pattern (DX-09)
[VERIFIED: b2fe143 projects.mjs diff]

Change `_registeredPaths()` from returning `Set<path>` to `Map<path, name>`. The existing code at HEAD already uses `registeredPaths.has(d.path)` for BUG-03 pre-selection — extending to Map preserves that check while enabling `registeredPaths.get(dirPath)` for the name lookup.

```javascript
// lib/install/projects.mjs — upgrade from Set to Map
function _readRegisteredPaths(vaultPath) {
  if (!vaultPath) return new Map();
  const mapPath = join(vaultPath, 'project-map.json');
  if (!fsExistsSync(mapPath)) return new Map();
  try {
    const data = JSON.parse(readFileSync(mapPath, 'utf8'));
    return new Map(Object.entries(data.projects || {}));
  } catch { return new Map(); }
}
```

**Note:** project-map.json structure is `{ projects: { path: name } }` — confirmed by `vault/project-map.json` inspection. [VERIFIED]

### GSD Version Check Pattern (DX-11)
[VERIFIED: b2fe143 gsd.mjs diff; npm view get-shit-done-cc version output]

```javascript
function _installedGSDVersion() {
  const pkgPath = join(homedir(), '.claude', 'get-shit-done', 'package.json');
  if (!existsSync(pkgPath)) return null;
  try { return JSON.parse(readFileSync(pkgPath, 'utf8')).version || null; }
  catch { return null; }
}

function _latestGSDVersion() {
  const result = spawnSync('npm', ['view', 'get-shit-done-cc', 'version'], {
    stdio: 'pipe', encoding: 'utf8', timeout: 10000,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}
```

**D-09 requirement:** When outdated, must show `type: 'select'` with "Update / Skip" (not a confirm). b2fe143 showed an `info()` line but kept `npx` unconditional when outdated — the new plan must implement the select prompt for the outdated case.

### NotebookLM Auth Detection (DX-12)
[VERIFIED: ls ~/.notebooklm — storage_state.json confirmed present]

```javascript
// In detectInstallState() — detect.mjs
const notebooklmAuthenticated = existsSync(join(homedir(), '.notebooklm', 'storage_state.json'));
```

**D-11 requirement:** When authenticated, show select with 3 choices: "Skip / Re-login / Run sync now". The b2fe143 implementation used `runCmd('notebooklm auth check 2>/dev/null')` to validate the stored session — this is correct but adds a subprocess call during detection. The simpler file-existence check is sufficient per CONTEXT D-10.

### Bulk Prompt Pattern (DX-13)
[VERIFIED: components.mjs HEAD; b2fe143 components.mjs diff]

Split projects into two groups: `newProjects` (no loop.md) and `installedProjects` (loop.md exists). Apply bulk prompt to each group separately when N > 1, individual prompt when N === 1.

Same pattern applies to `git-conventions.mjs` — the per-project loop must be preceded by a "Configure for all N projects? (Y/n)" bulk prompt.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| JSON persistence | Custom serialization | `JSON.stringify(obj, null, 2)` + `writeFileSync` |
| Atomic writes | Temp-file swap | Not needed — profile.json is non-critical, corruption recovers to null |
| npm version query | Custom HTTP client | `spawnSync('npm', ['view', 'get-shit-done-cc', 'version'])` |
| Path prefix computation | Recursive common-ancestor tree | Simple split+compare loop (b2fe143 algorithm — verified correct) |

---

## Common Pitfalls

### Pitfall 1: Bundling unrelated CLAUDE.md changes
**What goes wrong:** Phase 23 implementation gets reverted because a bundled CLAUDE.md template fix overwrites the project's rich CLAUDE.md (exact failure of b2fe143).
**Why it happens:** Generator applies CLAUDE.md template update alongside feature code.
**How to avoid:** Phase 23 branch must NOT touch `CLAUDE.md`, `templates/CLAUDE.md.template`, or any template-related code. Any such changes belong in a separate fix.
**Warning signs:** Git diff includes `CLAUDE.md` — reject immediately.

### Pitfall 2: Wrong profile filename
**What goes wrong:** Profile written as `install-profile.json` (b2fe143 approach) instead of `profile.json` (CONTEXT D-01). Tests pass but CONTEXT constraint violated; profile not found on re-install.
**How to avoid:** Every reference must be `profile.json`. Tests must assert `profile.json`.

### Pitfall 3: confirm instead of select for pre-fill prompts
**What goes wrong:** `type: 'confirm'` used for language/use-case skip — violates CONTEXT D-04 and UX-07 feedback. Creates inconsistent UX.
**How to avoid:** All pre-fill skip prompts must be `type: 'select'` with explicit "Keep current / Change" choices.

### Pitfall 4: GSD outdated path missing select prompt
**What goes wrong:** When GSD is outdated (v_installed < v_latest), the wizard just shows an `info()` line and runs `npx` anyway — CONTEXT D-09 requires a select "Update / Skip".
**How to avoid:** The outdated branch in `installGSD()` must show a `type: 'select'` prompt before calling `npx`.

### Pitfall 5: `_registeredPaths()` returns Set but DX-09 needs Map
**What goes wrong:** Silent break — `registeredPaths.get(dirPath)` returns `undefined` instead of the project name, so all registered projects get `undefined` as their name.
**How to avoid:** Rename function to `_readRegisteredPaths()`, return `Map`, update all call sites. The `registeredPaths.has(d.path)` check for BUG-03 pre-selection still works on Map.

### Pitfall 6: saveInstallProfile called before vaultPath is known
**What goes wrong:** `saveInstallProfile()` is called at wizard start (before vault step), so `vaultPath` is `undefined` and profile never persists.
**How to avoid:** Profile must be saved after `vaultPath` is resolved — see b2fe143 `bin/install.mjs` patch where save happens after the vault skip/reconfigure block (line ~108).

### Pitfall 7: DX-12 `alreadyAuthenticated` validation adds subprocess during init
**What goes wrong:** b2fe143 ran `notebooklm auth check` to validate stored session — this adds ~1s subprocess call during `detectInstallState()`. CONTEXT D-10 says file existence is sufficient.
**How to avoid:** Keep detection as pure file existence check. Validity check (if desired) should happen inside `installNotebookLM()` only, not in `detectInstallState()`.

---

## Code Examples

### Verified: bin/install.mjs orchestration changes needed
[VERIFIED: b2fe143 bin/install.mjs diff]

```javascript
// 1. Import saveInstallProfile
import { collectProfile, saveInstallProfile } from '../lib/install/profile.mjs';

// 2. Pass projectsDir pre-fill to collectProjects (DX-08)
const projectsData = await collectProjects(
  earlyTotal,
  installState.projects.length > 0 ? installState.projects : null,
  installState.projectsDir || null,  // DX-08
  installState.vaultPath,
);

// 3. Pass detectedUseCase to plugins (DX-10)
const pluginResults = await selectAndInstallPlugins(5, totalSteps, installState.profile?.useCase);

// 4. Save profile after vaultPath is resolved (DX-07 / DX-10)
saveInstallProfile(vaultPath, { ...profile, useCase: pluginResults.useCase || null });

// 5. Pass notebooklmAuthenticated to installNotebookLM (DX-12)
if (components.notebooklm) (await installNotebookLM(pipCmd, stepNum++, totalSteps, installState.notebooklmAuthenticated))
  ? installed.push('NotebookLM') : failed.push('NotebookLM');
```

### Verified: detectInstallState() additions needed
[VERIFIED: b2fe143 detect.mjs diff]

```javascript
// At end of detectInstallState(), replace the existing return:
const profile = readInstallProfile(vaultPath);
const projectsDir = detectProjectsDir(vaultPath);
const registeredPaths = detectRegisteredPaths(vaultPath);
const notebooklmAuthenticated = existsSync(join(homedir(), '.notebooklm', 'storage_state.json'));

return {
  vaultExists: !!vaultPath, vaultPath, hooksInstalled, gitRemote, projects,
  profile,              // was: profile: null
  projectsDir,          // new (DX-08)
  registeredPaths,      // new (DX-09, as plain object { path: name })
  gsdInstalled, loopMdByProject,
  notebooklmAuthenticated,  // new (DX-12)
};
```

**Note:** b2fe143 exported `detectRegisteredPaths()` separately; the planner can decide whether to export it or keep internal. The key value is having `registeredPaths` in `installState` so other modules don't re-read `project-map.json`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert` |
| Config file | `package.json` → `"test": "node --test tests/*.test.mjs"` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Current Test Baseline
[VERIFIED: npm test output]

- **668 tests passing**, 1 failing (BUG-02 in hooks.mjs — pre-existing, not Phase 23)
- Phase 23 tests from b2fe143 were **+34 tests** (702 total) — all passed
- Test file: `tests/install.test.mjs` (567 lines currently)

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | File | Status |
|--------|----------|-----------|------|--------|
| DX-07 | `saveInstallProfile` exported + writes to `profile.json` | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-07 | `readInstallProfile` exported + reads `profile.json` | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-07 | `collectProfile` shows select with Keep/Change when profile detected | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-08 | `detectProjectsDir` exported + reads project-map.json + returns common prefix | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-08 | `collectProjects` accepts `detectedBaseDir` param | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-09 | `projects.mjs` uses `registeredPaths.has(dirPath)` + `registeredPaths.get(dirPath)` | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-09 | Shows "(already registered)" indicator | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-10 | `selectAndInstallPlugins` accepts `detectedUseCase` + returns `useCase` | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-11 | `gsd.mjs` reads `~/.claude/get-shit-done/package.json` for installed version | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-11 | `gsd.mjs` runs `npm view get-shit-done-cc version` for latest | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-12 | `notebooklmAuthenticated` returned by `detectInstallState` | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-12 | `installNotebookLM` accepts `alreadyAuthenticated` param | structural | `tests/install.test.mjs` | Wave 0 gap |
| DX-13 | `installLoopMd` shows bulk "Install for all N?" instead of per-project | structural | `tests/install.test.mjs` | Wave 0 gap |

**Sampling rate:**
- Per task commit: `npm test`
- Per wave merge: `npm test`
- Phase gate: Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
All DX-07..DX-13 tests must be written in Wave 0 before implementation. The b2fe143 tests are a verified starting point but must be updated for:
- `profile.json` instead of `install-profile.json`
- `type: 'select'` with "Keep current" choice instead of `type: 'confirm'` with "Change language settings?"

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V5 Input Validation | Minimal | Profile fields (lang, codeLang) are user-provided strings; stored in local vault only. No injection risk — no SQL or shell interpolation. |
| V6 Cryptography | No | No credentials or secrets stored in profile.json |
| All others | No | Local CLI tool, no network auth, no session management |

**No security concerns** for this phase — profile.json contains non-sensitive preferences (language codes, use case enum) stored in the user's local vault directory.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v20.12.2 | — |
| npm | DX-11 version check | Yes | 10.5.0 | Skip version check |
| get-shit-done-cc (global) | DX-11 | Yes | 1.34.2 (installed and latest) | Skip silently |
| ~/.notebooklm/storage_state.json | DX-12 | Yes | exists | Skip auth check gracefully |
| vault/project-map.json | DX-08, DX-09 | Yes | 8 projects | Return null/empty Map |
| vault/meta/profile.json | DX-07, DX-10 | No (to be created) | — | Fresh install flow |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** `vault/meta/profile.json` — created on first wizard run (this is expected).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `~/.claude/get-shit-done/package.json` is the authoritative source for installed GSD version | GSD version check | If GSD installs differently, version check silently falls back to running npx (safe) |
| A2 | `notebooklm auth check` command exists and exits 0 when authenticated | DX-12 | If command missing, auth check fails gracefully; file existence check is the primary gate |
| A3 | Common path prefix algorithm handles single-project vault (no loop needed) | detectProjectsDir | Single path → parts.slice(0,-1) → parent dir returned directly — correct |

---

## Open Questions

1. **DX-13 git-conventions bulk prompt**
   - What we know: `installGitConventions()` loops per-project asking scopes/branch confirmation (multiple prompts per project, not just one y/N)
   - What's unclear: D-13 says bulk "Install for all N?" — but git-conventions has multi-step per-project flow (scopes + branch). Should bulk prompt skip ALL per-project prompts, or only the initial "configure?" gate?
   - Recommendation: Bulk prompt as the first gate — "Configure git conventions for all N projects? (Y/n)". When "Y", auto-accept detected scopes (no per-project prompts). When "N", run existing per-project flow. This satisfies D-13 while preserving the ability to customize per project.

2. **Profile.json schema versioning**
   - What we know: CONTEXT D-02 specifies 3 fields (lang, codeLang, useCase). Claude's Discretion.
   - What's unclear: Future fields may be added; old profile.json won't have them.
   - Recommendation: No version field needed — all field reads use `profile?.field || default` pattern (optional-chaining already in b2fe143). Adding new fields in future is backward-compatible.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: git show b2fe143] — Complete prior implementation, all 7 requirements, verified working code
- [VERIFIED: git show 139c6a9] — Revert reason confirmed: CLAUDE.md overwrite, not DX code
- [VERIFIED: cat vault/project-map.json] — Real project-map.json structure confirmed (`{ projects: { path: name } }`)
- [VERIFIED: ls ~/.notebooklm/] — storage_state.json confirmed present at expected path
- [VERIFIED: npm view get-shit-done-cc version] — Returns `1.34.2`, confirms npm registry lookup works
- [VERIFIED: npm test] — Current baseline: 668 tests, 1 pre-existing failure (BUG-02 hooks.mjs)

### Secondary (MEDIUM confidence)
- [CITED: lib/install/detect.mjs HEAD] — Current `detectInstallState()` returns `profile: null` at line 82; all other fields confirmed
- [CITED: lib/install/projects.mjs HEAD] — `_registeredPaths()` returns Set (confirmed), needs Map upgrade
- [CITED: bin/install.mjs HEAD lines 89-108, 133-152] — Existing skip/reconfigure select pattern confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps, all built-in Node modules
- Architecture: HIGH — b2fe143 provides verified working patterns; corrections are small and localized
- Pitfalls: HIGH — root cause of revert verified from git history; all 7 pitfalls have evidence

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable codebase)
