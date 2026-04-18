# Phase 50: GSD Fork + Vendor — Research

**Researched:** 2026-04-17
**Domain:** File system vendoring, Node.js cpSync, npm package bundling, path rewriting
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** GSD fork lives at `vendor/cds-workflow/` in the CDS repo root. NOT in `packages/` (it's not a TS monorepo package), NOT in `~/.claude/` (that's user-level, not under CDS version control).
- **D-02:** `vendor/cds-workflow/` is committed to git and included in the npm package via `package.json` `files` field.
- **D-03:** Bundled in npm — `vendor/` is included in the published `claude-dev-stack` package. `npx claude-dev-stack` installs everything in one step.
- **D-04:** CDS install wizard (`bin/install.mjs`) copies `vendor/cds-workflow/` to `~/.claude/cds-workflow/` during setup. This is the user-level working copy that Claude Code reads.
- **D-05:** `cds update` command updates `~/.claude/cds-workflow/` from the installed npm package's `vendor/` directory (not from upstream GSD).
- **D-06:** Full copy: `workflows/`, `bin/`, `templates/`, `references/`, `contexts/`, `VERSION`. Everything that's in `~/.claude/get-shit-done/` today.
- **D-07:** GSD skills (`~/.claude/skills/gsd-*`) stay separate — they're already managed by CDS install wizard, not by GSD itself.
- **D-08:** GSD agents (`~/.claude/agents/gsd-*`) — also copy these. They're referenced by workflow files.
- **D-09:** `NOTICES.md` in repo root with MIT attribution: "Workflow engine based on get-shit-done by TÂCHES (MIT License)".
- **D-10:** Preserve original `LICENSE` file inside `vendor/cds-workflow/`.
- **D-11:** After vendor copy, all paths in CDS codebase that reference `~/.claude/get-shit-done/` update to `~/.claude/cds-workflow/`. This includes skills, hooks, CLAUDE.md references.
- **D-12:** `bin/gsd-tools.cjs` stays as the entry point (renamed later in Phase 52 when CDS CLI commands replace GSD).
- **D-13:** Backward compat: if `~/.claude/get-shit-done/` still exists (user hasn't re-run install), commands still work. New install creates `~/.claude/cds-workflow/` instead.

### Claude's Discretion

- Whether to add a `.npmignore` for vendor/ test files (if any)
- Exact `NOTICES.md` formatting
- Whether `cds update` shows a diff of what changed vs previous version
- How to handle the gsd-patches mechanism (Phase 27 workaround) — probably dissolves since we own the code now

### Deferred Ideas (OUT OF SCOPE)

- **Renaming `/gsd-*` to `/cds-*`** — that's Phase 52, not this phase
- **TypeScript rewrite of gsd-tools.cjs** — deferred, works as-is
- **Cherry-picking upstream GSD improvements** — evaluate case-by-case after fork stabilizes
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GSD-01 | GSD workflow engine forked/vendored into CDS codebase, upstream npm dependency removed | File copy (cpSync), path rewrite (sed/replace), package.json files update, installGSD rewrite — all researched and documented below |
</phase_requirements>

---

## Summary

Phase 50 is a mechanical vendoring operation with four distinct concerns: (1) copying the GSD source tree into `vendor/cds-workflow/`, (2) rewriting all `get-shit-done` path references inside those files to `cds-workflow`, (3) updating the CDS install wizard to copy from `vendor/` instead of calling `npx get-shit-done-cc@latest`, and (4) updating all downstream path references in skills, hooks, and the patches mechanism.

The vendoring scope is larger than it might appear. GSD is not a single directory — the `npx get-shit-done-cc` install writes to THREE distinct locations: `~/.claude/get-shit-done/` (core), `~/.claude/skills/gsd-*/` (73 skill files), and `~/.claude/agents/gsd-*.md` (31 agent files). D-06/D-08 require vendoring the core AND agents directories. The skills stay separate per D-07 but contain 71 SKILL.md files that hardcode `$HOME/.claude/get-shit-done/` paths — these 71 files must be updated when skills are installed.

The path rewrite is the highest-risk element: 60 of 71 workflow files, all 31 agents, 71 skill files, and 14+ references/templates files reference `get-shit-done` by name. A bulk `sed` replacement in the vendor copy at copy time (Approach A) is the correct strategy — it keeps the vendor source self-consistent and avoids runtime install-time rewriting complexity.

**Primary recommendation:** Copy GSD core + agents into `vendor/cds-workflow/`, run a bulk string replacement (`get-shit-done` → `cds-workflow`) across all vendored text files, update `installGSD()` to use `cpSync`, update `lib/update.mjs` to copy from vendor, update all 71 GSD skills at install time, update hooks, dissolve the patches mechanism. The patches directory becomes unnecessary after this phase because CDS now owns the source.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vendor source copy | CDS repo (git-committed) | — | `vendor/cds-workflow/` is the canonical source; committed to git like any other source |
| Install-time deploy | CDS install wizard (`lib/install/gsd.mjs`) | `lib/update.mjs` | Wizard and update flow both copy from `vendor/` to `~/.claude/cds-workflow/` |
| Path rewriting | Vendor source (build-time / one-time) | — | Rewrite at vendor copy time, not at install time; keeps install logic simple |
| Skill path updates | `lib/install/gsd.mjs` | — | When installing GSD skills, wizard must rewrite `get-shit-done` → `cds-workflow` in each SKILL.md |
| Agent path updates | Vendor source | — | Agents go into `vendor/cds-workflow/agents/`; paths rewritten there |
| Backward compatibility | Install wizard (detect step) | — | `detectInstallState()` must detect `~/.claude/cds-workflow/` as the new canonical path |
| Patch dissolution | Source edit (Phase 50) | — | patches/ mechanism becomes unnecessary; files can be simplified or removed |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` `cpSync` | Node 16.7+ (project uses Node 20) | Recursive directory copy | Built-in, no dependency needed; `cpSync({ recursive: true })` is the standard pattern [VERIFIED: Node 20 ships cpSync] |
| `node:fs` `readFileSync` / `writeFileSync` | Node 20 | Bulk string replacement in files | Same — inline replacement during vendor copy |
| `node:path` | Node 20 | Path manipulation | Built-in |

### No New npm Dependencies Required

The entire Phase 50 implementation uses only Node.js built-ins. No new packages needed. [VERIFIED: codebase already uses cpSync in `lib/install/skills.mjs` and `lib/update.mjs`]

### Installation

No new packages to install — existing infrastructure is sufficient.

---

## Architecture Patterns

### System Architecture Diagram

```
COPY PHASE (one-time, done by executor / developer):
  ~/.claude/get-shit-done/         → vendor/cds-workflow/ (cpSync, recursive)
    bin/gsd-tools.cjs                  bin/gsd-tools.cjs
    bin/lib/*.cjs (23 files)           bin/lib/*.cjs
    workflows/ (71 files)              workflows/ (71 files)
    references/ (36 files)             references/
    templates/ (35+ files)             templates/
    contexts/ (3 files)                contexts/
    VERSION                            VERSION
    [no LICENSE in source install]     LICENSE (fetch from GSD npm/GitHub)

  ~/.claude/agents/gsd-*.md       → vendor/cds-workflow/agents/ (cpSync)
    (31 agent files)

AFTER COPY — bulk path rewrite (sed on vendor/):
  "get-shit-done" → "cds-workflow"  (in all .md and .cjs files in vendor/)
  "get-shit-done-cc" stays as-is     (references to upstream npm package name,
                                      e.g. in version-check workflows — leave intact
                                      unless specifically a path reference)

INSTALL PHASE (npx claude-dev-stack):
  vendor/cds-workflow/              → ~/.claude/cds-workflow/   (cpSync, wizard)
  vendor/cds-workflow/agents/       → ~/.claude/agents/ (merge, not replace)

CDS UPDATE PHASE (cds update):
  npm package vendor/cds-workflow/  → ~/.claude/cds-workflow/   (cpSync, update.mjs)

SKILLS INSTALL PHASE (installCustomSkills + new installGsdSkills):
  [source: where do gsd-* skills come from? — see Critical Finding below]
```

### Critical Finding: GSD Skills Source

[VERIFIED: codebase inspection] The 73 `gsd-*` SKILL.md files in `~/.claude/skills/` are NOT shipped in the current CDS `skills/` directory. CDS only ships 7 skills: `session-manager`, `dev-research`, `cds-quick`, `budget-continue`, `notion-importer`, `cds-search`, `cds-stats`. The `gsd-*` skills were installed by `npx get-shit-done-cc` on Apr 15 18:01 (same timestamp as `~/.claude/get-shit-done/`).

This creates a planning decision: after Phase 50, when `installGSD()` no longer calls `npx get-shit-done-cc@latest`, where do the `gsd-*` skills come from?

**Two options:**

| Option | Approach | Effort |
|--------|----------|--------|
| A: Vendor skills too | Copy `~/.claude/skills/gsd-*/` into `vendor/cds-workflow/skills/`, install wizard copies them | Larger vendor/, full control |
| B: Skills from GSD npm (transitional) | Keep calling `npx get-shit-done-cc@latest` for skills only | Defeats independence goal |

D-07 says skills "stay separate — already managed by CDS install wizard, not by GSD itself." This implies **Option A**: the CDS install wizard should ship and install the skills, using the vendored copies. The planner must decide whether to include `~/.claude/skills/gsd-*/` in the vendor copy or as a separate `skills/gsd-*/` directory in the CDS repo.

**Recommendation (Claude's discretion):** Add `vendor/cds-workflow/skills/` containing all 73 `gsd-*` SKILL.md files. The install wizard copies them to `~/.claude/skills/` with path replacement. This makes `npx claude-dev-stack` fully self-contained.

### Recommended Project Structure After Phase 50

```
vendor/
└── cds-workflow/          # committed to git, included in npm files
    ├── bin/
    │   ├── gsd-tools.cjs  # entry point (renamed in Phase 52)
    │   └── lib/           # 23 .cjs module files
    ├── workflows/          # 71 workflow .md files (paths rewritten)
    ├── references/         # 36 reference .md files (paths rewritten)
    ├── templates/          # 35+ template .md files (paths rewritten)
    ├── contexts/           # 3 context .md files
    ├── agents/             # 31 gsd-*.md agent files (paths rewritten)
    ├── skills/             # 73 gsd-*/SKILL.md files (paths rewritten)
    ├── VERSION             # "1.36.0-cds.1"
    └── LICENSE             # MIT (fetch from GSD GitHub)
```

### Pattern 1: cpSync Recursive Copy

**What:** Copy an entire directory tree recursively using Node.js built-ins.
**When to use:** Vendor copy step — one-time copy from GSD source.

```javascript
// Source: Node.js 20 docs / existing usage in lib/install/skills.mjs [VERIFIED]
import { cpSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Copy GSD core into vendor/
cpSync(
  join(homedir(), '.claude', 'get-shit-done'),
  join(PKG_ROOT, 'vendor', 'cds-workflow'),
  { recursive: true }
);

// Copy agents into vendor/agents/
cpSync(
  join(homedir(), '.claude', 'agents'),   // source: only gsd-* files
  join(PKG_ROOT, 'vendor', 'cds-workflow', 'agents'),
  { recursive: true }
);
```

**Note:** `cpSync` overwrites existing files. For the initial vendor copy this is correct.

### Pattern 2: Bulk String Replacement in Text Files

**What:** Replace all occurrences of `get-shit-done` with `cds-workflow` across text files.
**When to use:** After vendor copy, before committing to git.

```javascript
// Source: Node.js built-ins [VERIFIED: pattern used in lib/update.mjs, lib/install/]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

function rewritePaths(dir, from, to) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      rewritePaths(full, from, to);
    } else if (['.md', '.cjs', '.json', '.sh', ''].includes(extname(entry.name))) {
      const content = readFileSync(full, 'utf8');
      if (content.includes(from)) {
        writeFileSync(full, content.replaceAll(from, to));
      }
    }
  }
}

// After cpSync:
rewritePaths(
  join(PKG_ROOT, 'vendor', 'cds-workflow'),
  'get-shit-done',
  'cds-workflow'
);
```

**Critical nuance:** `get-shit-done-cc` (the npm package name) appears in some workflow files as version-check commands (e.g., `npm view get-shit-done-cc version`). These ARE still valid references to the upstream npm package for version comparison purposes. However, `$HOME/.claude/get-shit-done/` path references must become `$HOME/.claude/cds-workflow/`. A simple global replace of `get-shit-done` → `cds-workflow` will corrupt `get-shit-done-cc` → `cds-workflow-cc` which is wrong.

**Correct replacement strategy:**
1. Replace `get-shit-done/` (with trailing slash) → `cds-workflow/` (covers all path references)
2. Replace `get-shit-done"` (with trailing quote) → `cds-workflow"` (covers quoted paths)
3. Leave `get-shit-done-cc` intact (npm package name references)

OR simpler: replace `/.claude/get-shit-done` → `/.claude/cds-workflow` globally — this is unambiguous and covers all path uses.

### Pattern 3: Install Wizard — Copy from Vendor

**What:** Replace `npx get-shit-done-cc@latest` with `cpSync from vendor/`.
**When to use:** `lib/install/gsd.mjs` rewrite.

```javascript
// Replace current installGSD() — new implementation
export async function installGSD(stepNum, totalSteps, pkgRoot) {
  step(stepNum, totalSteps, 'Installing CDS Workflow Engine');

  const vendorSrc = join(pkgRoot, 'vendor', 'cds-workflow');
  const dest = join(homedir(), '.claude', 'cds-workflow');

  if (!existsSync(vendorSrc)) {
    warn('vendor/cds-workflow not found in package — skipping');
    return false;
  }

  const installed = _installedCdsWorkflowVersion(dest);
  const bundled = _bundledVersion(vendorSrc);

  if (installed === bundled) {
    ok(`CDS workflow engine: up to date (v${installed})`);
    return true;
  }

  info(`Installing CDS workflow engine v${bundled}...`);
  mkdirp(join(homedir(), '.claude'));
  cpSync(vendorSrc, dest, { recursive: true });

  // Install agents separately (merge into ~/.claude/agents/)
  const agentsSrc = join(vendorSrc, 'agents');
  if (existsSync(agentsSrc)) {
    const agentsDest = join(homedir(), '.claude', 'agents');
    mkdirp(agentsDest);
    // Copy individual gsd-*.md files
    for (const f of readdirSync(agentsSrc)) {
      cpSync(join(agentsSrc, f), join(agentsDest, f));
    }
  }

  // Install skills (merge into ~/.claude/skills/)
  const skillsSrc = join(vendorSrc, 'skills');
  if (existsSync(skillsSrc)) {
    const skillsDest = join(homedir(), '.claude', 'skills');
    mkdirp(skillsDest);
    cpSync(skillsSrc, skillsDest, { recursive: true });
  }

  ok(`CDS workflow engine installed (v${bundled})`);
  return true;
}

function _installedCdsWorkflowVersion(dest) {
  const versionPath = join(dest, 'VERSION');
  return existsSync(versionPath) ? readFileSync(versionPath, 'utf8').trim() : null;
}

function _bundledVersion(vendorSrc) {
  const versionPath = join(vendorSrc, 'VERSION');
  return existsSync(versionPath) ? readFileSync(versionPath, 'utf8').trim() : 'unknown';
}
```

### Anti-Patterns to Avoid

- **Calling `npx get-shit-done-cc@latest` from the new installGSD():** Defeats the independence goal entirely. Use `cpSync` from `vendor/`.
- **Simple global replace of `get-shit-done` → `cds-workflow`:** Corrupts npm package name references like `get-shit-done-cc`. Use `/.claude/get-shit-done` pattern instead.
- **Copying agents into `vendor/cds-workflow/agents/` then also copying them to `~/.claude/cds-workflow/agents/`:** The install wizard should copy agents to `~/.claude/agents/` (global Claude agents dir), not inside `~/.claude/cds-workflow/`. Keep the install structure matching what `npx get-shit-done-cc` did.
- **Modifying `~/.claude/get-shit-done/` directly:** Phase 50 is read-only from the GSD source. The vendor copy is the new canonical source; the old install just provides the initial content.
- **Forgetting detect.mjs:** `gsdInstalled` in `detectInstallState()` checks for `~/.claude/get-shit-done`. After Phase 50, it must also check for `~/.claude/cds-workflow` to detect existing CDS installs correctly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive directory copy | Custom walk-and-copy loop | `cpSync({ recursive: true })` | Built into Node 20, already used in codebase, handles symlinks correctly |
| String replacement across files | Custom multi-pass replacer | `readFileSync` + `.replaceAll()` + `writeFileSync` | Simple, reliable; the pattern is already used throughout `lib/` |
| Version file parsing | Semver library | `readFileSync(...).trim()` | VERSION file contains a plain version string; no parsing complexity |

**Key insight:** This phase is fundamentally a file system operation. All needed primitives are already in Node.js built-ins and already used in the codebase.

---

## Runtime State Inventory

This is a path rename/refactor phase. All runtime state categories explicitly answered:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `~/.claude/get-shit-done/` — 186 files in core GSD install; `~/.claude/agents/gsd-*.md` — 31 agent files; `~/.claude/skills/gsd-*/SKILL.md` — 73 skill files | **New install:** wizard writes to `~/.claude/cds-workflow/` instead; existing `~/.claude/get-shit-done/` left in place per D-13 (backward compat) |
| Live service config | `~/.claude/settings.json` — hooks reference `session-start-context.sh`, `session-end-check.sh`, `vault-auto-push.sh` — none reference `get-shit-done` paths directly | No action required (hooks point to CDS hook files, not GSD) |
| OS-registered state | None — GSD is not a daemon, scheduled task, or OS service | None |
| Secrets/env vars | None — GSD uses no secrets; CDS env vars (`ANTHROPIC_API_KEY`, etc.) are unaffected by this rename | None |
| Build artifacts | `patches/` directory in CDS repo: `gsd-execute-phase-bypassperms.patch`, `execute-phase.md`, `manager.md`, `transition.md` — these exist because GSD patches were needed. After fork, the `patches/` mechanism dissolves. | Code edit: remove or simplify `patches/`, update `hooks/gsd-auto-reapply-patches.sh`, update tests in `tests/install-gsd-patches.test.mjs` and `tests/gsd-auto-reapply-patches.test.mjs` |

**Existing users with `~/.claude/get-shit-done/`:** Per D-13, the old directory is NOT deleted. Commands continue to work for users who haven't re-run `npx claude-dev-stack`. This means no migration needed for current user — only new installs get `~/.claude/cds-workflow/`.

---

## Common Pitfalls

### Pitfall 1: `get-shit-done-cc` vs `get-shit-done` in Path Replacement

**What goes wrong:** Simple `replaceAll('get-shit-done', 'cds-workflow')` turns `npx get-shit-done-cc@latest` into `npx cds-workflow-cc@latest` — a broken npm package reference.

**Why it happens:** The npm package is named `get-shit-done-cc` (with `-cc` suffix) but the install directory is `get-shit-done` (without). A naive global replace hits both.

**How to avoid:** Replace `/.claude/get-shit-done` (path fragment with leading slash) instead of bare `get-shit-done`. This only hits filesystem path references and leaves npm package name references intact.

**Warning signs:** After replacement, grep for `cds-workflow-cc` — should return zero results.

### Pitfall 2: Agents Install Location Mismatch

**What goes wrong:** Agents from vendor are copied into `~/.claude/cds-workflow/agents/` instead of `~/.claude/agents/`. Claude Code reads agents from `~/.claude/agents/` globally; it does NOT look inside `~/.claude/cds-workflow/agents/`.

**Why it happens:** D-08 says to copy agents into `vendor/cds-workflow/agents/` for versioning purposes — but the INSTALL TARGET is still `~/.claude/agents/`, not `~/.claude/cds-workflow/agents/`.

**How to avoid:** The vendor structure stores them; the install step copies them to the correct user-level location. Two distinct operations.

**Warning signs:** After install, `ls ~/.claude/agents/gsd-executor.md` should exist and be current.

### Pitfall 3: detect.mjs Misses New Install Path

**What goes wrong:** `detectInstallState()` checks `existsSync(join(homedir(), '.claude', 'get-shit-done'))` for `gsdInstalled`. After Phase 50, fresh installs create `~/.claude/cds-workflow/` not `~/.claude/get-shit-done/`. The wizard thinks GSD is not installed and offers to re-install.

**Why it happens:** The detection logic hardcodes the old path.

**How to avoid:** Update `gsdInstalled` detection to check BOTH paths: `get-shit-done` (legacy) OR `cds-workflow` (new). Return a structured object `{ installed: bool, path: string, isLegacy: bool }` for downstream use.

**Warning signs:** Running wizard a second time after fresh Phase 50 install offers to "install GSD" again.

### Pitfall 4: pack-size.test.mjs Fails After vendor/ Added

**What goes wrong:** `vendor/cds-workflow/` adds ~2.4 MB to the package. Total tarball was 512 KB before; combined estimate ~2.9 MB. The pack-size test enforces < 5 MB. This is safe, but if skills (73 × ~2-4 KB each) are also included, growth could approach the limit.

**Why it happens:** GSD core is 2.4 MB uncompressed. npm tarball uses gzip compression — actual tarball growth will be less (~600-900 KB compressed for text-heavy markdown).

**How to avoid:** Run `pnpm pack --json` after adding vendor/ and check the size. The existing `tests/pack-size.test.mjs` will catch violations automatically.

**Warning signs:** `tests/pack-size.test.mjs` failure with "tarball size is under 5 MB" assertion.

### Pitfall 5: patches/ Test Suite Fails After Patches Dissolved

**What goes wrong:** Two test files (`tests/install-gsd-patches.test.mjs`, `tests/gsd-auto-reapply-patches.test.mjs`) and one hook (`hooks/gsd-auto-reapply-patches.sh`) exist specifically for the patches mechanism. If patches/ is removed or emptied without updating these tests, the test suite breaks.

**Why it happens:** The patches mechanism was Phase 27 workaround for GSD upstream changes breaking local customizations. After Phase 50, CDS owns the source and patches are unnecessary.

**How to avoid:** Either (a) remove patches/ and update all 3 test files + hook, or (b) keep patches/ structure but empty the patch files (tests check structural properties like size bounds). Option (b) is lower risk for Phase 50; patches can be cleaned up in a follow-up.

**Warning signs:** `vitest run tests/install-gsd-patches.test.mjs` or `tests/gsd-auto-reapply-patches.test.mjs` fail.

### Pitfall 6: GSD Skills Not Installed on Fresh Install

**What goes wrong:** After Phase 50, `installGSD()` no longer calls `npx get-shit-done-cc@latest`. But `gsd-*` skills in `~/.claude/skills/` were previously installed by that npm command. Fresh CDS install now copies `vendor/cds-workflow/` but 73 `gsd-*` SKILL.md files end up missing from `~/.claude/skills/`.

**Why it happens:** The skills were never shipped in `vendor/` — they need to be added explicitly.

**How to avoid:** Include `~/.claude/skills/gsd-*/` in the vendor copy under `vendor/cds-workflow/skills/`. The install wizard's `installGSD()` step copies them to `~/.claude/skills/`.

**Warning signs:** After fresh install, `/gsd-plan-phase` returns "Unknown skill" in Claude Code.

---

## Code Examples

### Copy GSD Core to Vendor (One-Time Setup Script)

```javascript
// Source: Node.js 20 cpSync docs [VERIFIED: cpSync available in Node 20.12.2]
// This is a one-time developer script, not part of the npm package
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const GSD_SOURCE = join(homedir(), '.claude', 'get-shit-done');
const AGENTS_SOURCE = join(homedir(), '.claude', 'agents');
const SKILLS_SOURCE = join(homedir(), '.claude', 'skills');
const VENDOR_DEST = join(process.cwd(), 'vendor', 'cds-workflow');

// 1. Copy GSD core
cpSync(GSD_SOURCE, VENDOR_DEST, { recursive: true });

// 2. Copy agents (gsd-* only)
const agentsDest = join(VENDOR_DEST, 'agents');
for (const f of readdirSync(AGENTS_SOURCE).filter(f => f.startsWith('gsd-'))) {
  cpSync(join(AGENTS_SOURCE, f), join(agentsDest, f));
}

// 3. Copy skills (gsd-* only)
const skillsDest = join(VENDOR_DEST, 'skills');
for (const d of readdirSync(SKILLS_SOURCE).filter(d => d.startsWith('gsd-'))) {
  cpSync(join(SKILLS_SOURCE, d), join(skillsDest, d), { recursive: true });
}

// 4. Rewrite paths in all vendored files
rewritePaths(VENDOR_DEST, '/.claude/get-shit-done', '/.claude/cds-workflow');
```

### package.json files Update

```json
// Source: existing package.json + D-02 [VERIFIED: current files field inspected]
"files": [
  "bin/",
  "dist/",
  "hooks/",
  "lib/",
  "patches/",
  "skills/",
  "templates/",
  "vendor/",
  "README.md",
  "LICENSE",
  "NOTICES.md",
  "CHANGELOG.md"
]
```

Note: `tests/pack-files-array.test.mjs` currently asserts that `patches/` is in `files`. If patches are dissolved, that test needs updating. The test also does NOT yet assert `vendor/` — add that assertion.

### NOTICES.md Addition

```markdown
## Workflow Engine

### get-shit-done (vendored as cds-workflow)
- **Version:** 1.36.0 (forked at this version, April 2026)
- **License:** MIT
- **Copyright:** TÂCHES
- **Source:** https://github.com/gsd-build/get-shit-done
- **Vendored at:** `vendor/cds-workflow/`
- **Modifications:** Path references updated from `~/.claude/get-shit-done/` to `~/.claude/cds-workflow/`. No functional changes.
- **Redistribution basis:** MIT license permits copying, modification, and redistribution with attribution. Original LICENSE file preserved at `vendor/cds-workflow/LICENSE`.
```

### detect.mjs gsdInstalled Update

```javascript
// Source: lib/install/detect.mjs current code [VERIFIED: line 118]
// Before:
const gsdInstalled = existsSync(join(homedir(), '.claude', 'get-shit-done'));

// After (backward compat: detect either install):
const legacyGsdPath = join(homedir(), '.claude', 'get-shit-done');
const cdsWorkflowPath = join(homedir(), '.claude', 'cds-workflow');
const gsdInstalled = existsSync(legacyGsdPath) || existsSync(cdsWorkflowPath);
const gsdIsLegacy = existsSync(legacyGsdPath) && !existsSync(cdsWorkflowPath);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `npx get-shit-done-cc@latest --claude --global` | `cpSync(vendor/cds-workflow → ~/.claude/cds-workflow)` | Phase 50 | No upstream dependency; deterministic install |
| Patches mechanism (SHA-diff re-apply on update) | Direct source edit in vendor/ | Phase 50 | patches/ directory and associated hook/tests become obsolete |
| `~/.claude/get-shit-done/` as user-level install | `~/.claude/cds-workflow/` | Phase 50 (new installs only) | Both paths work during transition (D-13) |

**Deprecated/outdated after this phase:**
- `patches/gsd-execute-phase-bypassperms.patch`: Patch targets `~/.claude/get-shit-done/workflows/execute-phase.md`. After Phase 50, CDS owns `vendor/cds-workflow/workflows/execute-phase.md` directly — the `bypassPermissions` change should be committed directly to the vendor copy, not as a patch.
- `hooks/gsd-auto-reapply-patches.sh`: Only needed because GSD updates would wipe patches. After Phase 50, there are no upstream GSD updates to worry about.
- `tests/install-gsd-patches.test.mjs` and `tests/gsd-auto-reapply-patches.test.mjs`: Both test the patches mechanism. Either update or remove.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GSD `LICENSE` file must be sourced from GSD GitHub repo (not present in `~/.claude/get-shit-done/`) — the npm install does not copy it | Don't Hand-Roll / vendor copy | D-10 requires preserving original LICENSE inside vendor; if LICENSE isn't in the installed files, it must be fetched separately from GitHub or npm tarball |
| A2 | Skills should be vendored in `vendor/cds-workflow/skills/` (73 gsd-* SKILL.md files) — D-07 says skills "stay separate" which I interpret as "separate from GSD core" not "excluded from vendor" | Critical Finding / Pitfall 6 | If planner disagrees and skills are excluded, fresh installs will be missing all 73 gsd-* skills with no fallback |
| A3 | The agents in `~/.claude/agents/gsd-*.md` should be deployed to `~/.claude/agents/` (not to `~/.claude/cds-workflow/agents/`) at install time | Architecture Patterns | Claude Code reads agents from `~/.claude/agents/` only; if deployed wrong, no agent skills work |
| A4 | Replacing `/.claude/get-shit-done` → `/.claude/cds-workflow` (with leading slash) correctly handles all path references without corrupting npm package name references | Pitfall 1 | A missed reference means some command fails at runtime pointing to non-existent `~/.claude/get-shit-done/` |

---

## Open Questions

1. **GSD LICENSE file**
   - What we know: `~/.claude/get-shit-done/` does NOT contain a `LICENSE` file. The npm package is MIT-licensed per `npm view get-shit-done-cc license`.
   - What's unclear: Where to get the canonical LICENSE text — download from GSD GitHub (`https://raw.githubusercontent.com/gsd-build/get-shit-done/main/LICENSE`) or extract from the npm tarball?
   - Recommendation: Fetch from GitHub at vendor-copy time using `curl` or `fetch` in the setup script. Alternatively, write the MIT license text directly since it's standard.

2. **patches/ directory fate**
   - What we know: `patches/` contains 4 files including `gsd-execute-phase-bypassperms.patch` which applies `bypassPermissions` to the execute-phase workflow. After Phase 50, this change should live in `vendor/cds-workflow/workflows/execute-phase.md` directly.
   - What's unclear: Should we remove patches/ entirely in Phase 50 or just note it's dissolved and leave cleanup to a subsequent PR?
   - Recommendation: In Phase 50, apply the bypassPermissions patch content directly to the vendored `execute-phase.md`, remove the `.patch` file, and update both test files. The hook can be removed or made a no-op. This is in scope for Phase 50 since it's part of the vendor cutover.

3. **Skills: include in vendor or exclude?**
   - What we know: 73 gsd-* SKILL.md files exist at `~/.claude/skills/gsd-*/`. D-07 says they "stay separate." CDS currently doesn't ship them. [ASSUMED: A2]
   - What's unclear: D-07 means "separate from GSD core in vendor" (still shipped) or "not in vendor at all" (user must install separately)?
   - Recommendation: Include in vendor. The phrase "managed by CDS install wizard, not by GSD itself" points to CDS shipping them — which requires them to be IN the CDS package. Raise with user if planner is uncertain.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `cpSync` | Vendor copy, install wizard | ✓ | Node 20.12.2 (requires 16.7+) | — |
| `~/.claude/get-shit-done/` | Initial vendor copy source | ✓ | 1.36.0 | If missing: fetch from npm tarball |
| `~/.claude/agents/gsd-*.md` | Agent vendor copy source | ✓ | 31 files present | If missing: fetch from npm tarball |
| `~/.claude/skills/gsd-*/` | Skills vendor copy source | ✓ | 73 dirs present | If missing: fetch from npm tarball |
| GSD LICENSE (from GitHub/npm) | `vendor/cds-workflow/LICENSE` | ✗ (not in local install) | — | Write standard MIT text manually |

**Missing dependencies with no fallback:**
- None that block execution.

**Missing dependencies with fallback:**
- `~/.claude/get-shit-done/LICENSE`: Not present in local install. Fetch from `https://raw.githubusercontent.com/gsd-build/get-shit-done/main/LICENSE` or write MIT text directly.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `pnpm vitest run tests/install-gsd.test.mjs` (or new test file) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GSD-01-a | `vendor/cds-workflow/` exists and contains correct structure | unit | `pnpm vitest run tests/vendor-cds-workflow.test.mjs` | ❌ Wave 0 |
| GSD-01-b | No `get-shit-done` path references remain in vendor/ (post-rewrite) | unit | same test file | ❌ Wave 0 |
| GSD-01-c | `package.json` `files` includes `vendor/` | unit | `pnpm vitest run tests/pack-files-array.test.mjs` | ✅ (needs update) |
| GSD-01-d | `installGSD()` no longer calls `npx get-shit-done-cc` | unit | `pnpm vitest run tests/install-gsd.test.mjs` (new) | ❌ Wave 0 |
| GSD-01-e | tarball size < 5 MB after vendor/ added | unit | `pnpm vitest run tests/pack-size.test.mjs` | ✅ (existing — will catch regressions) |
| GSD-01-f | `detectInstallState()` detects `~/.claude/cds-workflow/` as installed | unit | `pnpm vitest run tests/detect.test.mjs` | ✅ (needs new test case) |
| GSD-01-g | NOTICES.md contains GSD attribution entry | unit | `pnpm vitest run tests/vendor-cds-workflow.test.mjs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run tests/vendor-cds-workflow.test.mjs tests/pack-files-array.test.mjs tests/detect.test.mjs`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/vendor-cds-workflow.test.mjs` — covers GSD-01-a, GSD-01-b, GSD-01-g
- [ ] `tests/install-gsd.test.mjs` — covers GSD-01-d (verify no npx call in new installGSD)
- [ ] Update `tests/pack-files-array.test.mjs` — add assertion that `files` includes `vendor/`
- [ ] Update `tests/detect.test.mjs` — add test case for `~/.claude/cds-workflow/` detection

---

## Security Domain

> `security_enforcement` not explicitly disabled in config — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Minimal | Vendor copy is from local filesystem (no user input); no injection surface |
| V6 Cryptography | No | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal in cpSync source | Tampering | Source is always `PKG_ROOT/vendor/cds-workflow/` — no user-controlled path components |
| Malicious content in vendored `.md` files | Tampering | Source is GSD 1.36.0 from a known-good local install; content is static markdown, not executed code |

**Security assessment:** Phase 50 is low security risk. The vendor copy is a one-time operation by the developer using files from their own local GSD install. No user-controlled paths, no network requests during install (beyond the initial `npx claude-dev-stack`), no code execution of vendored files (`.md` files are read by Claude Code, not executed by Node.js).

---

## Sources

### Primary (HIGH confidence)

- Node.js 20 `fs.cpSync` docs — recursive directory copy API confirmed
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/install/gsd.mjs` — current installGSD() implementation inspected
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/install/detect.mjs` — gsdInstalled detection logic at line 118
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/update.mjs` — GSD update path inspected
- `~/.claude/get-shit-done/` — directory structure, file counts, timestamps verified
- `~/.claude/agents/gsd-*.md` — 31 files verified
- `~/.claude/skills/gsd-*/` — 73 directories verified
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/package.json` — current `files` field inspected
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/tests/pack-size.test.mjs` — 5 MB limit confirmed
- `/Users/eugenenakoneschniy/Projects/claude-dev-stack/.planning/phases/50-gsd-fork-vendor/50-CONTEXT.md` — locked decisions D-01 through D-13

### Secondary (MEDIUM confidence)

- `npm view get-shit-done-cc` — confirmed MIT license, confirmed npm package name is `get-shit-done-cc` (not `get-shit-done`)
- GSD workflow file inspection — confirmed 60/71 workflow files contain self-referential `get-shit-done` paths
- Timestamp analysis — confirmed all GSD files (core, agents, skills) installed simultaneously by `npx get-shit-done-cc`

### Tertiary (LOW confidence — see Assumptions Log)

- A1: LICENSE file must be fetched separately — inferred from absence in local install, not verified against GSD npm tarball structure
- A2: Skills should be vendored — inferred from D-07 interpretation, not explicitly confirmed by user

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are Node.js built-ins already used in codebase
- Architecture: HIGH — direct inspection of all source files and install paths
- Pitfalls: HIGH — discovered via source inspection (path rewrite collision, agent location, detect.mjs, pack-size, patches tests, skills gap)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable domain — file system operations, no fast-moving dependencies)
