# Phase 13: GSD Infrastructure - Research

**Researched:** 2026-04-13
**Domain:** GSD workflow automation — ADR bridge (CONTEXT.md to vault) and parallel phase execution (TeamCreate)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### ADR Bridge (INFRA-03)
- **D-01:** Bridge fires during phase transition — after verification passes and phase is marked complete. Integrated into the execute-phase workflow's `update_roadmap` step or a new post-completion step.
- **D-02:** ADR format matches existing vault convention — `NNNN-slug.md` with YAML frontmatter (date, status, context, decision, consequences). Consistent with `vault/projects/{slug}/decisions/` structure.
- **D-03:** ADR numbering auto-increments from highest existing NNNN in `vault/decisions/` for the project. If no ADRs exist, starts at 0001.
- **D-04:** Provenance marking via YAML frontmatter fields: `source: gsd-bridge`, `phase: {N}`, `decision_ids: [D-01, D-02, ...]`. Machine-readable, allows filtering auto-generated vs manual ADRs.
- **D-05:** Idempotent — skip if ADR with same phase+decision ID combination already exists. Re-running bridge on same phase produces no duplicates.
- **D-06:** One ADR per CONTEXT.md, not one per D-XX entry. Each ADR aggregates all decisions from a single phase discussion into one file.
- **D-07:** Bridge reads vault path from existing `findVault()` in `lib/projects.mjs` — no new vault discovery logic.

#### Parallel Phase Execution (INFRA-04)
- **D-08:** Detection parses ROADMAP.md `depends_on` fields. Two or more phases with no shared `depends_on` overlap AND both in "pending" status qualify for parallel execution.
- **D-09:** Cost estimate shows: number of parallel phases, estimated token usage per phase (based on plan count times average executor cost), total estimated cost. Presented before consent prompt.
- **D-10:** Explicit consent required every time — `AskUserQuestion` with "Run N phases in parallel (est. Xk tokens)" / "Run sequentially (default)". No config to auto-approve.
- **D-11:** If one parallel phase fails, other phases continue. Failed phase is reported with options: retry, skip, or investigate. Partial success is valid.
- **D-12:** Sequential execution (decline parallel) preserves existing GSD behavior exactly. This is the default and must never break.
- **D-13:** Uses Claude Code's `TeamCreate` tool for spawning parallel executors. Each team member gets its own worktree via `isolation: "worktree"`.

### Claude's Discretion
- ADR slug generation algorithm (from phase name or decision content)
- Cost estimation heuristics (can be rough — used for user information, not billing)
- Where in GSD workflow to surface parallel execution option (likely in execute-phase or a new transition step)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-03 | ADR bridge — vault/decisions auto-populated from `.planning/CONTEXT.md` locked decisions (D-XX entries) during GSD workflow. Each decision becomes an ADR file with standardized format. | D-XX extraction pattern documented; vault ADR format analyzed from 12 existing ADRs; integration point identified in transition.md `update_roadmap_and_state` step; `findVault()` reuse confirmed |
| INFRA-04 | GSD parallel phase execution via `TeamCreate` — when ROADMAP shows independent phases (no `depends_on` overlap), GSD presents option to run them in parallel with cost estimate. User consent required before spawning. | ROADMAP.md `depends_on` field format documented; `TeamCreate` tool confirmed available in Claude Code runtime; `AskUserQuestion` consent pattern confirmed in existing execute-phase workflow; worktree isolation pattern understood from execute-phase |
</phase_requirements>

---

## Summary

Phase 13 delivers two pure GSD workflow improvements that do not touch CLI code or NotebookLM. INFRA-03 is a file-system bridge: a new `lib/adr-bridge.mjs` module that reads CONTEXT.md, extracts D-XX decisions from the `<decisions>` block, and writes one aggregated ADR file into `vault/projects/{slug}/decisions/`. The bridge fires during the GSD transition workflow — specifically after `gsd-tools phase complete` marks the phase done. INFRA-04 is a GSD orchestrator enhancement: detection logic that parses ROADMAP.md `depends_on` fields to identify independent pending phases, presents a cost estimate via `AskUserQuestion`, and either spawns parallel `TeamCreate` members or falls back to sequential execution.

Both requirements have excellent code reuse opportunities: `findVault()` from `lib/projects.mjs` handles vault discovery for the ADR bridge; existing ROADMAP.md `depends_on` field format is established and consistent; `AskUserQuestion` consent pattern is already used in `execute-phase.md` for regression decisions; the `TeamCreate` + worktree isolation pattern is fully documented in `execute-phase.md` for intra-phase parallel execution.

**Primary recommendation:** Build `lib/adr-bridge.mjs` as a pure ESM module with a single exported `bridgeDecisions({ phaseName, phaseNumber, contextPath, vaultPath })` function — no side effects, fully testable. Integrate into the GSD `transition.md` workflow as a new step after `update_roadmap_and_state`. For INFRA-04, add the parallel detection logic directly into the `transition.md` `offer_next_phase` step, extending Route A (more phases remain) with a dependency analysis sub-step.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` | built-in | Read CONTEXT.md, write ADR files, list decisions dir | No external deps allowed; already used throughout |
| `node:path` | built-in | Path joining, file naming | Standard project pattern |
| `node:os` | built-in | `homedir()` for vault path resolution | Already used in `lib/projects.mjs` |
| `node:test` | built-in | Unit tests for `adr-bridge.mjs` | Project's mandated test framework |
| `node:assert` | built-in | Test assertions | Paired with `node:test` throughout project |

[VERIFIED: codebase grep — every existing lib module uses node builtins only, no npm packages except `prompts`]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/projects.mjs::findVault()` | local | Vault path discovery | ADR bridge needs vault root — reuse locked by D-07 |
| `lib/shared.mjs` | local | `ok`, `fail`, `warn`, `info`, `c` color helpers | Any user-facing output from bridge CLI integration |

**Installation:** No new packages — zero npm installs. Single-dep constraint (`prompts@^2.4.2`) preserved. [VERIFIED: CONTEXT.md D-07, STATE.md single-dep constraint note]

---

## Architecture Patterns

### Recommended Project Structure

New files for this phase:
```
lib/
  adr-bridge.mjs           # INFRA-03: pure extraction + write function
tests/
  adr-bridge.test.mjs      # INFRA-03: unit tests (required by project convention)
```

GSD workflow modifications (not project files — live in ~/.claude/get-shit-done/):
```
workflows/
  transition.md            # Add bridge_decisions step + parallel detection step
```

### Pattern 1: ADR Bridge Module (`lib/adr-bridge.mjs`)

**What:** Pure function that reads a CONTEXT.md file, extracts all D-XX decisions from the `<decisions>` block, and writes one aggregated ADR file to the vault.

**When to use:** Called from GSD `transition.md` after `gsd-tools phase complete` succeeds.

**CONTEXT.md D-XX parsing:**

The `<decisions>` block in all phase CONTEXT.md files consistently contains lines like:
```
- **D-01:** Bridge fires during phase transition — ...
- **D-02:** ADR format matches existing vault convention — ...
```

Pattern confirmed across phases 11, 12, 13 CONTEXT.md files. [VERIFIED: codebase inspection of 11-CONTEXT.md and 13-CONTEXT.md]

Regex to extract: `/^- \*\*D-(\d+):\*\* (.+)$/gm` — captures number and description.

Extraction must operate on the content between `<decisions>` and `</decisions>` tags only, to avoid false matches in other sections.

**ADR file naming convention:**

From 12 existing ADR files in `vault/projects/claude-dev-stack/decisions/`:
- Format: `NNNN-slug.md` (zero-padded 4 digits + kebab-case slug)
- Examples: `0001-notebooklm-integration-via-cli-wrapper.md`, `0002-session-lifecycle-hooks-node-wrapper-dual-invocation.md`

[VERIFIED: `ls /Users/eugenenakoneschniy/vault/projects/claude-dev-stack/decisions/`]

**ADR content format:**

Existing ADRs use markdown headers with Russian-language sections (Контекст, Решение, Альтернативы, Последствия). They do not use YAML frontmatter — provenance is expressed via `**Принято в**` narrative text.

The locked decision D-04 adds machine-readable provenance. Since existing ADRs don't have a YAML block, bridge-created ADRs should include a distinct frontmatter-style block immediately after the `#` title header:

```markdown
# ADR-NNNN: Phase {N} — {Phase Name}

---
source: gsd-bridge
phase: {N}
decision_ids: [D-01, D-02, ...]
---

**Date**: YYYY-MM-DD
**Status**: accepted
**Generated by**: gsd-bridge from .planning/phases/{slug}/CONTEXT.md

## Context

GSD phase discussion for "{Phase Name}" produced {count} locked decisions.
Source: .planning/phases/{slug}/CONTEXT.md

## Decisions

### D-01: {text}

### D-02: {text}

## Consequences

Decisions captured automatically from GSD discuss-phase. Individual decisions
may be superseded by later phases or manual ADRs.
```

[ASSUMED] The exact ADR format above is a recommendation — not mandated by existing manual ADRs. User should confirm if they want bridge-generated ADRs to match the Russian-language style of existing ADRs.

**Idempotency check (D-05):**

Before writing, scan existing ADR files in the decisions dir for frontmatter containing `phase: {N}`. A simple string search in each file's content. If match found, return `{ action: 'noop' }`.

**Numbering (D-03):**

```javascript
// Scan decisions dir, extract NNNN prefix, find max, increment
const files = readdirSync(decisionsDir).filter(f => /^\d{4}-/.test(f) && f.endsWith('.md'));
const maxNum = files.reduce((max, f) => {
  const n = parseInt(f.slice(0, 4), 10);
  return n > max ? n : max;
}, 0);
const nextNum = String(maxNum + 1).padStart(4, '0');
```

[VERIFIED: pattern derived from `lib/projects.mjs` decisionCount logic and actual files in vault/decisions/]

**Slug generation (Claude's discretion):**

Generate slug from phase name: lowercase, replace spaces/underscores with hyphens, strip special chars. Example: "GSD Infrastructure" becomes `gsd-infrastructure`. Keep consistent with phase directory naming already in `.planning/phases/`.

**API contract:**

```javascript
// lib/adr-bridge.mjs
export async function bridgeDecisions({ phaseNumber, phaseName, phaseSlug, contextPath, vaultPath, projectName }) {
  // Returns: { action: 'created'|'noop'|'skipped', adrPath, decisionCount }
}
```

`projectName` is the vault project directory name (e.g., `claude-dev-stack`). Detected from git toplevel basename — same pattern as session-manager skill.

### Pattern 2: Integration into GSD `transition.md` (INFRA-03 hook)

**What:** A new `bridge_decisions` step in `transition.md` workflow, inserted after `update_roadmap_and_state`.

**Integration point confirmed:** The `update_roadmap_and_state` step in `transition.md` runs `gsd-tools phase complete` and then extracts the completed phase info. The bridge step fires immediately after this, using the same `completed_phase`, `phase_name`, `phase_slug` variables already available in that workflow context.

[VERIFIED: transition.md `update_roadmap_and_state` step content]

**Step behavior:**
- If vault found and CONTEXT.md has D-XX decisions: write ADR, report success
- If vault not found: skip silently (non-blocking)
- If ADR already exists for this phase: skip silently (idempotent, D-05)
- If CONTEXT.md has no D-XX decisions: skip silently

**This step must be non-blocking.** Bridge failure must never prevent phase transition from completing.

**Invocation mechanism:** Three viable options (planner chooses):
1. Add `bridge-decisions` subcommand to `gsd-tools.cjs` (consistent with existing pattern — gsd-tools handles all state operations)
2. Create a wrapper `lib/adr-bridge-cli.mjs` invoked as `node lib/adr-bridge-cli.mjs` from the workflow step
3. Inline node call with `--input-type=module`

Option 1 keeps the GSD workflow changes minimal and consistent with how gsd-tools is already used in transition.md.

[ASSUMED] The planner should decide which invocation pattern to use. None of the three has been ruled out.

### Pattern 3: Parallel Phase Detection (INFRA-04)

**What:** Extension of `transition.md`'s `offer_next_phase` step (Route A), detecting when multiple pending phases have no `depends_on` overlap.

**ROADMAP.md `depends_on` format:**

From the existing ROADMAP.md:
```
**Depends on**: Phase 10 (clean baseline...)
**Depends on**: Phase 11 (session-end sync...)
**Depends on**: Nothing (pure GSD tooling...)
```

[VERIFIED: `.planning/ROADMAP.md` Phase 10-13 entries]

Parsing: extract `Depends on` line from each Phase Details block. "Nothing" or absent means no dependencies. A phase number dependency is expressed as "Phase N" in the value.

**Detection algorithm (pseudocode):**

```
pending = phases where status == 'pending'
for each pair (A, B) in pending:
  if A.number not in B.depends_on AND B.number not in A.depends_on:
    mark as parallelizable
```

A phase's `depends_on` list is the set of phase numbers it directly depends on. Transitive deps are not tracked in ROADMAP.md — only direct deps.

**`TeamCreate` tool usage:**

TeamCreate is a Claude Code runtime tool — confirmed available from session metadata inspection. [VERIFIED: tool list in session JSONL showing `TeamCreate` among available tools]

The tool creates a team of Claude instances running in parallel. The existing `execute-phase.md` uses `Task()` for intra-phase parallel execution with `isolation="worktree"`. `TeamCreate` provides the cross-phase equivalent — each team member executes a full `/gsd-execute-phase N` for its assigned phase.

Per D-13, each team member uses `isolation: "worktree"`. This prevents file conflicts between phases executing on different branches simultaneously.

[ASSUMED] Exact `TeamCreate` API parameter names are not documented in any GSD workflow file found. The CONTEXT.md specifies `isolation: "worktree"` per member (D-13). Planner must consult Claude Code tool documentation for exact call signature.

**Consent prompt via `AskUserQuestion`:**

`AskUserQuestion` is confirmed in `execute-phase.md` for presenting multi-option decisions to the user (line 885). Same pattern applies for parallel consent.

```
## Parallel Execution Available

Found {N} independent phases that can run concurrently:
- Phase {A}: {name} ({X} plans)
- Phase {B}: {name} ({Y} plans)

Estimated token usage: ~{T}k tokens (same as sequential)
Estimated wall-clock: ~{T/N} minutes vs ~{T} minutes sequential

Run in parallel? (explicit consent required each time)
Options:
- Run in parallel
- Run sequentially (default)
```

[VERIFIED: AskUserQuestion usage in execute-phase.md line 885]

**Cost estimation heuristics (Claude's discretion):**

- Per-phase token estimate: `plan_count x 15k tokens` (rough average for an executor agent)
- Wall-clock: sequential = sum of per-phase estimates, parallel = max of per-phase estimates
- Present as "~Xk tokens" rounded to nearest 5k
- Clearly marked as estimate for planning purposes only

[ASSUMED] The 15k tokens/plan heuristic is directional only. Acceptable given D-09 states it's for user information, not billing.

**Failure handling (D-11):**

When running parallel phases via TeamCreate:
1. Wait for all team members to complete
2. Collect results — distinguish success vs failure per phase
3. Report successes normally (mark phase complete, advance state)
4. For failures: present "Phase X failed. Options: retry, skip, investigate"
5. Partial success is valid — successful phases are not re-run

### Anti-Patterns to Avoid

- **Bridge blocking transitions:** The ADR bridge must be non-blocking. If vault not found or write fails, log a warning and continue.
- **Overwriting existing ADRs:** Idempotency check (D-05) must fire before any write operation.
- **Hard-coding project name:** Project name for vault path must be detected dynamically (git toplevel basename), not hard-coded.
- **Breaking sequential default:** INFRA-04 must treat "run sequentially" as the default. Parallel is an offer, not the new behavior. D-12 is absolute.
- **Re-parsing ROADMAP.md manually for parallel detection:** Use `gsd-tools roadmap analyze` if it exposes `depends_on` data, rather than hand-rolling ROADMAP.md parsing.
- **Writing ADR outside vault decisions dir:** Always construct path as `join(vaultPath, 'projects', projectName, 'decisions', filename)`. No user-controlled path components in the join.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vault discovery | Custom path scanner | `findVault()` from `lib/projects.mjs` | Handles 5 candidate paths + validation — locked by D-07 |
| ROADMAP.md phase status | Manual markdown parser | `gsd-tools roadmap analyze` if it exposes deps | Already returns phase data in JSON |
| Phase transition tracking | Custom state writes | `gsd-tools phase complete "${N}"` | Handles ROADMAP checkbox, STATE.md, plan count atomically |
| Safe file write | Direct writeFileSync | Atomic write via tmp + rename (session-context.mjs pattern) | Prevents partial writes on crash |
| ADR number collision | Complex locking | Sequential: read dir, find max, increment | Transitions are single-threaded; no race condition |

**Key insight:** Both requirements orchestrate existing systems (findVault, gsd-tools, vault filesystem) rather than building new ones. Implementation surface is intentionally small.

---

## Common Pitfalls

### Pitfall 1: CONTEXT.md has no D-XX decisions

**What goes wrong:** A phase was planned without a `discuss-phase` step, or the CONTEXT.md only has "Claude's Discretion" notes with no locked D-XX entries.

**Why it happens:** Not all phases require user discussion. Some phases are research-only or have all decisions deferred to Claude.

**How to avoid:** Count D-XX pattern matches before attempting to write ADR. If count is 0, return `{ action: 'skipped', reason: 'no decisions' }` without writing.

**Warning signs:** decisions block exists but regex `/^- \*\*D-\d+:\*\*/m` finds no matches.

### Pitfall 2: Vault not found on machine running GSD

**What goes wrong:** Developer runs GSD on a machine without a vault set up — `findVault()` returns null — bridge crashes the transition.

**Why it happens:** vault is optional; not every Claude Code user has claude-dev-stack configured.

**How to avoid:** Null-check `findVault()` result before any write. If null, emit `info('ADR bridge: no vault found, skipping')` and return `{ action: 'skipped' }`. Non-blocking.

### Pitfall 3: Decisions block contains nested section tags

**What goes wrong:** The CONTEXT.md `<decisions>` block is siblings with `<deferred>`, `<domain>`, `<code_context>` tags. A naive regex that searches the entire file might match D-XX-like content from wrong sections.

**Why it happens:** GSD CONTEXT.md uses XML-style tags throughout. Phase 13 CONTEXT.md itself demonstrates this structure.

**How to avoid:** Extract content between `<decisions>` and `</decisions>` first, then scan that block only for D-XX lines.

**Warning signs:** ADR contains content from deferred or domain sections.

### Pitfall 4: `TeamCreate` not available in all runtimes

**What goes wrong:** GSD is run in a Copilot, remote, or embedded runtime where `TeamCreate` is not exposed — parallel phase launch crashes.

**Why it happens:** Runtime-specific tool availability — same issue exists for `Task()` per execute-phase.md runtime compatibility notes.

**How to avoid:** Wrap `TeamCreate` call in try/catch or check tool availability first. If unavailable, fall back to sequential execution and note: "Parallel execution not available in this runtime — running sequentially."

### Pitfall 5: ESM module invocation from GSD CJS context

**What goes wrong:** GSD workflows invoke `node gsd-tools.cjs` (CommonJS). Calling `lib/adr-bridge.mjs` (ESM) requires either `--input-type=module` flag or a wrapper. Forgetting this causes "require() of ES Module" errors.

**Why it happens:** Project uses `.mjs` extension throughout for ESM. GSD's gsd-tools.cjs is CJS for compatibility.

**How to avoid:** Create a thin CLI wrapper (Option 1: gsd-tools subcommand, or Option 2: separate runner script) that handles the ESM/CJS boundary cleanly. Avoid inline `node -e` for complex ESM modules.

---

## Code Examples

Verified patterns from existing codebase:

### ADR next number calculation

```javascript
// Derived from lib/projects.mjs decisionCount pattern + vault/decisions/ file listing
import { readdirSync, existsSync } from 'fs';

function nextAdrNumber(decisionsDir) {
  if (!existsSync(decisionsDir)) return '0001';
  const files = readdirSync(decisionsDir)
    .filter(f => /^\d{4}-/.test(f) && f.endsWith('.md'));
  const maxNum = files.reduce((max, f) => {
    const n = parseInt(f.slice(0, 4), 10);
    return n > max ? n : max;
  }, 0);
  return String(maxNum + 1).padStart(4, '0');
}
```

[VERIFIED: pattern confirmed from lib/projects.mjs decisionCount and actual 0001-0012 files in vault]

### Atomic file write (from session-context.mjs)

```javascript
// Source: lib/session-context.mjs atomicWrite() — lines 96-100
import { writeFileSync, renameSync } from 'fs';

function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
```

[VERIFIED: lib/session-context.mjs lines 96-100]

### D-XX extraction from CONTEXT.md

```javascript
// Pattern derived from CONTEXT.md format verified in phases 11, 12, 13
function extractDecisions(contextContent) {
  const blockMatch = contextContent.match(/<decisions>([\s\S]*?)<\/decisions>/);
  if (!blockMatch) return [];

  const block = blockMatch[1];
  const decisions = [];
  const lineRegex = /^- \*\*D-(\d+):\*\* (.+)$/gm;
  let match;
  while ((match = lineRegex.exec(block)) !== null) {
    decisions.push({ id: `D-${match[1]}`, text: match[2].trim() });
  }
  return decisions;
}
```

[VERIFIED: CONTEXT.md format confirmed from 11-CONTEXT.md and 13-CONTEXT.md actual content]

### Path traversal guard (from session-context.mjs)

```javascript
// Source: lib/session-context.mjs lines 126-128
// adr-bridge.mjs must implement the same guard for projectName and phaseSlug
if (/[\/\\]|\.\./.test(projectName)) {
  throw new Error('projectName must not contain path separators or parent refs');
}
```

[VERIFIED: lib/session-context.mjs lines 126-128]

### Test file structure (from session-context.test.mjs)

```javascript
// Source: tests/session-context.test.mjs — structural template for adr-bridge.test.mjs
import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { bridgeDecisions } from '../lib/adr-bridge.mjs';

describe('lib/adr-bridge.mjs', () => {
  const tmpBase = join(tmpdir(), `claude-test-adr-bridge-${process.pid}`);
  const vaultPath = join(tmpBase, 'vault');
  // Tests: creates ADR on first run, noop on second (idempotent),
  //        skips when no decisions, skips when vault missing,
  //        correct NNNN numbering, provenance fields present
});
```

[VERIFIED: tests/session-context.test.mjs structure]

### AskUserQuestion consent pattern (from execute-phase.md)

```
// From execute-phase.md line 885 — use same tool for parallel consent
Use AskUserQuestion:
  question: "Run {N} phases in parallel? (est. ~{X}k tokens, ~{T} min)"
  options:
    - "Run in parallel"
    - "Run sequentially (default)"
```

[VERIFIED: execute-phase.md line 885 confirms AskUserQuestion is used for multi-option user decisions]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual copy-paste decisions to ADR | Automated bridge from CONTEXT.md | Phase 13 (new) | Eliminates ceremony, ensures all D-XX decisions are logged |
| Sequential-only phase execution | Optional parallel via TeamCreate | Phase 13 (new) | Cuts wall-clock time for independent phases |

**No deprecated patterns to migrate** — this is greenfield GSD infrastructure.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bridge-created ADRs use English headings + YAML-style frontmatter block. Existing manual ADRs are Russian-language narrative style. | Architecture Patterns | Bridge ADRs won't match manual ADR style — user may prefer Russian format or pure markdown |
| A2 | `gsd-tools roadmap analyze` returns `depends_on` data per phase in machine-readable form | Don't Hand-Roll | If not, ROADMAP.md parsing must be done inline in transition.md step |
| A3 | `TeamCreate` API accepts `isolation: "worktree"` parameter per member | Architecture Patterns | If API differs, parallel phase spawning needs redesign |
| A4 | Cost estimate heuristic: 15k tokens per plan per executor agent | Architecture Patterns | Heuristic may be off by 2-3x; acceptable since D-09 says informational only |
| A5 | The bridge invocation from GSD workflows is best done via gsd-tools subcommand or a thin runner script, not inline ESM | Architecture Patterns | If inline ESM works cleanly, simpler option is viable |

---

## Open Questions

1. **ADR language/format alignment**
   - What we know: Existing vault ADRs are Russian-language with Russian section headers. Bridge decisions are in English from CONTEXT.md.
   - What's unclear: Should bridge-created ADRs match Russian style, or is English acceptable for GSD-generated artifacts?
   - Recommendation: Default to English (GSD is English-language tooling), note auto-generation in provenance block. User can clarify in discuss-phase if they want Russian.

2. **Bridge invocation mechanism from GSD workflow**
   - What we know: GSD workflows call `gsd-tools.cjs` (CJS). `lib/adr-bridge.mjs` is ESM. Both wrapper script and gsd-tools subcommand are viable.
   - What's unclear: Which approach fits best with GSD's orchestration style.
   - Recommendation: Add `bridge-decisions` subcommand to `gsd-tools.cjs` — consistent with how all state operations (phase complete, roadmap analyze, config-get) are invoked.

3. **`TeamCreate` exact API**
   - What we know: Tool confirmed available. CONTEXT.md specifies `isolation: "worktree"` per member.
   - What's unclear: Exact parameter names, return value structure, timeout handling.
   - Recommendation: Planner should add a Wave 0 task to read Claude Code's `TeamCreate` tool description before implementing the parallel execution step in transition.md.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies identified. Phase 13 is pure file system operations and GSD workflow modifications. No new CLI tools, runtimes, databases, or services required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) |
| Config file | none — `npm test` runs `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/adr-bridge.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-03 | `bridgeDecisions()` writes ADR file to vault decisions dir | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-03 | `bridgeDecisions()` is idempotent — second call on same phase returns noop | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-03 | `bridgeDecisions()` skips gracefully when vault not found | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-03 | `bridgeDecisions()` skips when CONTEXT.md has no D-XX decisions | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-03 | ADR file contains all D-XX entries from CONTEXT.md decisions block | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-03 | ADR file contains provenance fields (source, phase, decision_ids) | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-03 | ADR numbering starts at 0001 when no ADRs exist | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-03 | ADR numbering increments from max existing NNNN | unit | `node --test tests/adr-bridge.test.mjs` | ❌ Wave 0 |
| INFRA-04 | GSD workflow parallel detection step fires in transition | manual | run `/gsd-discuss-phase` + `/gsd-execute-phase` with two independent phases | manual-only — GSD workflow orchestration |
| INFRA-04 | Sequential fallback preserves existing behavior when user declines | manual | run `/gsd-execute-phase` and select "sequential" | manual-only |

### Sampling Rate
- **Per task commit:** `node --test tests/adr-bridge.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/adr-bridge.test.mjs` — covers all 8 INFRA-03 unit test cases listed above
- No framework install needed — `node:test` is built-in

---

## Security Domain

`security_enforcement` key absent from config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local file writes only, no auth required |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Writes to user's own vault only |
| V5 Input Validation | yes | Sanitize phase name for slug; validate NNNN pattern; path traversal guard on projectName |
| V6 Cryptography | no | No secrets or crypto involved |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via phase name or project name | Tampering | Validate using same guard as `session-context.mjs` — reject any value containing `/`, `\`, or `..` |
| Overwriting existing ADR | Tampering | Idempotency check (D-05) — detect existing phase ADR and return noop, never overwrite |
| Writing outside vault decisions dir | Tampering | Construct path as `join(vaultPath, 'projects', projectName, 'decisions', filename)` — no user-controlled path segments |

**Reference implementation:** `lib/session-context.mjs` line 126-128 has the exact path traversal guard to replicate in `adr-bridge.mjs`.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `lib/projects.mjs::findVault()` — vault path discovery, reuse confirmed
- Codebase inspection: `lib/session-context.mjs` — atomic write pattern, idempotency marker, path traversal guard
- Codebase inspection: `tests/session-context.test.mjs` — test structure template
- File inspection: `vault/projects/claude-dev-stack/decisions/0001-*.md`, `0002-*.md` — existing ADR format (Russian markdown, no YAML frontmatter)
- File inspection: `ls vault/decisions/` — 12 existing ADRs with NNNN-slug.md naming (0001-0012)
- File inspection: `.planning/ROADMAP.md` — `depends_on` field format confirmed across phases 10-13
- File inspection: `.planning/phases/11-CONTEXT.md`, `13-CONTEXT.md` — D-XX decision format confirmed
- GSD workflow: `transition.md` — `update_roadmap_and_state` integration point confirmed; step variables available
- GSD workflow: `execute-phase.md` — `AskUserQuestion` usage (line 885), worktree isolation, runtime fallback patterns
- Runtime metadata: session JSONL tool list — `TeamCreate` confirmed in available Claude Code tools

### Secondary (MEDIUM confidence)
- Session JSONL showing `TeamCreate` in tool names — tool exists but API parameters unverified

### Tertiary (LOW confidence)
- `TeamCreate` exact parameter API — not documented in any GSD workflow file; assumed from CONTEXT.md D-13 spec only

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure Node.js builtins, zero new deps, reusing established patterns
- Architecture (INFRA-03): HIGH — all patterns verified from existing code (session-context.mjs, projects.mjs, ADR files)
- Architecture (INFRA-04): MEDIUM — detection logic is clear; TeamCreate API parameters are unverified
- Pitfalls: HIGH — derived from existing code patterns and observed CONTEXT.md format

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable domain — GSD workflows and vault ADR format are stable)
