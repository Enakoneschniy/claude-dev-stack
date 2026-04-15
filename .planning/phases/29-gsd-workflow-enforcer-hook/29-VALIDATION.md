# Phase 29 — Validation

**Framework:** `node:test` (Node built-in test runner)
**Baseline before Phase 29:** 716+ tests green (v0.11.0 baseline was 558; phases 14–28 additions bring it to ~716+).

---

## Quick verification (per plan)

```bash
# Plan 01 — hook behavior
node --test tests/workflow-enforcer.test.mjs

# Plan 02 — wizard install wiring
node --test tests/hooks.test.mjs tests/install.test.mjs
```

## Full verification

```bash
npm test
```

Expected: all pre-existing tests green + ~20 new cases added by Phase 29 (13 from Plan 01, ~7 from Plan 02).

---

## Task → test mapping

| Plan | Task | Test file(s) | Cases |
|------|------|--------------|-------|
| 01 | Task 1: Implement hooks/gsd-workflow-enforcer.mjs | `tests/workflow-enforcer.test.mjs` | 13 cases (silent filters, 3 output paths, decimal phase numbers, regex-DoS guard, line cap, single-line newline) |
| 02 | Task 1: Extend lib/install/hooks.mjs | `tests/hooks.test.mjs` (3 cases: exists/shebang/node --check) + `tests/install.test.mjs` (4 cases: copy, register, idempotent, skip-on-missing-source) | 7 cases |

---

## Manual smoke tests (WF-01 SC mapping)

| SC | Manual check | Expected |
|----|--------------|----------|
| SC#1 | `echo '{"tool_name":"Skill","tool_input":{"skill":"gsd-plan-phase"}}' \| node hooks/gsd-workflow-enforcer.mjs` from repo root | stdout starts with `NEXT: /gsd-discuss-phase ` + a phase number + ` — do NOT run /gsd-execute-phase; use /gsd-manager only after all pending phases are planned\n` |
| SC#2 | Same command from repo root — confirms ROADMAP parse works against real `.planning/ROADMAP.md` | Output contains a valid pending-phase number (21, 22, 24, 26, 27, 30, or 31) |
| SC#3 | From repo root, observe ROADMAP has 2+ unplanned pending phases | Output uses `/gsd-discuss-phase` path |
| SC#4 | `cd /tmp && mkdir test-1plan && cd test-1plan && mkdir -p .planning && echo "- [ ] **Phase 99:** only one" > .planning/ROADMAP.md` → run hook | Empty stdout, exit 0 |
| SC#5 | Run hook from `/tmp` (no `.planning/ROADMAP.md`) | Empty stdout, exit 0 |
| SC#6 | Run wizard in a fresh tmp project; inspect `.claude/settings.json` | `hooks.PostToolUse` entry with `matcher: "Skill"` and command `node <...>/.claude/hooks/gsd-workflow-enforcer.mjs` |

---

## Security/threat validation

- **T-29-01 regex DoS**: Test case 11 + 12 in `tests/workflow-enforcer.test.mjs` assert completion under 500 ms with adversarial input (20_000 lines, overflow phase numbers).
- **T-29-02 output injection**: Test case 11 asserts malformed phase numbers are NOT echoed to stdout — only strictly-validated digit+decimal strings reach the output.
- **T-29-07/08 install path safety**: Test case "skips registration when source missing" validates existsSync guard prevents crashes.

---

## Gate summary

Phase 29 completion gate: both plans' automated commands must pass AND at least one manual smoke test per SC must succeed. `npm test` full suite must stay green.
