---
phase: 29-gsd-workflow-enforcer-hook
plan: 02
subsystem: install
tags: [wizard, install, hooks, workflow, gsd]

requires:
  - phase: 29-gsd-workflow-enforcer-hook
    provides: hooks/gsd-workflow-enforcer.mjs (Plan 01 output — wizard copies and registers it)
provides:
  - Wizard install wiring for PostToolUse Skill → gsd-workflow-enforcer registration
  - Idempotent re-runs (dedup via .command?.includes('gsd-workflow-enforcer'))
  - Guard skipping registration when source missing in pkgRoot (no throw)
affects: [all wizard-configured projects — each gets the enforcer hook registered on next install]

tech-stack:
  added: []
  patterns:
    - "Wizard hook registration pattern (mirror of Hook 5 budget-check) — existsSync guard + duplicate check + push into settings.hooks.PostToolUse"

key-files:
  created: []
  modified:
    - lib/install/hooks.mjs (copy loop + Hook 8 block)
    - tests/hooks.test.mjs (file-level describe block)
    - tests/install.test.mjs (4 new install fixture tests)

key-decisions:
  - "Registration goes into PROJECT .claude/settings.json (BUG-01 compliant) — fallback global path unchanged"
  - "Hook 8 placement after Hook 5 (budget-check) and BEFORE permissions.allow block"
  - "Duplicate detection keyed to 'gsd-workflow-enforcer' substring in command (not the matcher) — safe even if Phase 25 later adds Hook 6/7 with same matcher"
  - "When source missing in pkgRoot (existsSync(workflowEnforcerDest) === false) skip registration silently — install never crashes"

patterns-established:
  - "Hook X additive extension pattern: (1) append filename to copy-loop array, (2) insert guarded registration block in _writeSettingsFile(), (3) test at file level + install level"

requirements-completed:
  - WF-01 (SC#6 — wizard install wiring; combined with Plan 01 SC#1..SC#5, WF-01 fully satisfied)

duration: ~25min
completed: 2026-04-14
---

# Plan 29-02 Summary

**Install wizard now copies hooks/gsd-workflow-enforcer.mjs to ~/.claude/hooks/ and idempotently registers PostToolUse Skill → enforcer into every configured project's .claude/settings.json.**

## Performance

- **Tasks:** 1 of 1 complete
- **Files modified:** 3
- **Tests added:** 7 (3 file-level + 4 install-fixture) — all passing

## Accomplishments

### lib/install/hooks.mjs

1. Copy loop extension (line 31):
   - Appended `'gsd-workflow-enforcer.mjs'` to the hook-copy filename array
   - Reuses existing chmod 0755 + warn-on-failure wrapper (Phase 19 WR-02 pattern)

2. Hook 8 registration block (inserted after Hook 5, before permissions.allow):
   ```js
   const workflowEnforcerDest = join(hooksDir, 'gsd-workflow-enforcer.mjs');
   if (existsSync(workflowEnforcerDest)) {
     if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
     const hasEnforcer = settings.hooks.PostToolUse.some(entry =>
       entry.hooks?.some(h => h.command?.includes('gsd-workflow-enforcer'))
     );
     if (!hasEnforcer) {
       settings.hooks.PostToolUse.push({
         matcher: 'Skill',
         hooks: [{ type: 'command', command: `node ${workflowEnforcerDest}`, timeout: 10 }],
       });
       changed = true;
     }
   }
   ```

### tests/hooks.test.mjs (+3 cases)

New `describe('gsd-workflow-enforcer.mjs')` block:
- `exists in hooks/` → existsSync assertion
- `has node shebang` → regex match on first line
- `passes node --check` → execFileSync doesNotThrow

### tests/install.test.mjs (+4 cases)

Inside the existing `describe('lib/install/hooks.mjs — project-level hooks (BUG-01/BUG-02)')` block:
- `copies gsd-workflow-enforcer.mjs into hooksDir (WF-01)`
- `registers PostToolUse Skill → gsd-workflow-enforcer in project settings.json (WF-01)` — asserts matcher === 'Skill' and timeout === 10
- `is idempotent — running twice does not duplicate gsd-workflow-enforcer entry (WF-01)` — count === 1 after double install
- `skips gsd-workflow-enforcer registration when source missing in pkgRoot (WF-01)` — uses a fresh tmp pkgRoot without hooks/

## Verification

### Automated

- `node --test tests/hooks.test.mjs tests/install.test.mjs` → 151/153 pass on phase-29 branch
- The 2 remaining failures are pre-existing (`session-end-check.sh integration` — verified before Phase 29 work began, unrelated to WF-01)
- All 7 new Plan 02 tests pass cleanly

### Acceptance criteria grep checks

- `grep -c "gsd-workflow-enforcer" lib/install/hooks.mjs` → 4 (≥ 2 required)
- `grep -c "Hook 8" lib/install/hooks.mjs` → 1 (≥ 1 required)
- `grep -c "matcher: 'Skill'" lib/install/hooks.mjs` → 1 (≥ 1 required)
- `grep -c "timeout: 10" lib/install/hooks.mjs` → 2 (≥ 1 required for new block)
- `node --check lib/install/hooks.mjs` → passes

## Known Issues

- Concurrent branch churn observed during execution — external process switched branches between commands several times. Plan artifacts survived because they were committed to gsd/phase-29-gsd-workflow-enforcer-hook branch before the switches took effect. No work lost.
- Pre-existing `session-end-check.sh integration` failures in tests/hooks.test.mjs:274 and :308 remain — out of scope for Phase 29, baseline-verified.

## Phase 29 Delivery

Plan 01 + Plan 02 together fully satisfy WF-01:
- SC#1..SC#5 (runtime behavior): Plan 01
- SC#6 (wizard install): Plan 02

After wizard run, every project the user configures gains:
- `~/.claude/hooks/gsd-workflow-enforcer.mjs` (chmod 0755)
- `.claude/settings.json`: PostToolUse Skill matcher pointing to that script

Next time `/gsd-plan-phase` completes, Claude's prompt stream receives a `NEXT:` directive when 2+ pending phases still need work — preventing premature `/gsd-execute-phase` suggestions mid-batch.
