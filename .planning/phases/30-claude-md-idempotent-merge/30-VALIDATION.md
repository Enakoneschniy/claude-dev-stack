# Phase 30 — UAT Validation: CLAUDE.md Idempotent Merge (BUG-07)

**Date:** {fill on run}
**Tester:** {fill on run}
**Build:** `npm run build` from main with phase-30 commits applied

Covers: BUG-07 SC#1, SC#4, SC#5, SC#6, D-06, D-07, threat T-30-01.

---

## Setup

1. Create a sandbox dir: `mkdir -p /tmp/cds-uat-30 && cd /tmp/cds-uat-30`
2. For each scenario, work in a fresh subdirectory: `mkdir -p ./scenario-{N} && cd ./scenario-{N}`
3. Use a fresh vault per run: `export VAULT_PATH=/tmp/cds-uat-30/vault-{N}` (so scenarios don't share state)
4. Install the locally built CLI once: `npm install -g .` from the repo root with phase-30 commits checked out.

---

## Scenario 1 — Fresh project, no CLAUDE.md (BUG-07 SC#4)

**Pre-state:** Empty project directory. No `CLAUDE.md` present.

**Action:** Run `claude-dev-stack install` and select this project.

**Expected wizard output:** `<project-name> → CLAUDE.md: created` (blue/info color, printed via `printClaudeMdStatus`).

**Expected file state:**
- `CLAUDE.md` exists.
- File contains `<!-- @claude-dev-stack:start -->` and `<!-- @claude-dev-stack:end -->` — exactly one pair.
- Between markers: Language, Auto-Routing, Knowledge Base, Session Protocol, Code Style, Rules, References, Skills sections.
- `THIS_PROJECT` placeholder is substituted with the actual project name.

**Verify:**
```bash
grep -c '@claude-dev-stack:start' CLAUDE.md   # must be 1
grep -c '@claude-dev-stack:end' CLAUDE.md     # must be 1
grep -c 'THIS_PROJECT' CLAUDE.md              # must be 0
grep -c '## Claude Dev Stack Skills' CLAUDE.md # must be 1
```

- [ ] PASS / FAIL — notes: ___________________

---

## Scenario 2 — Re-install on project with markers (BUG-07 SC#5)

**Pre-state:** Project from Scenario 1 (CLAUDE.md exists with markers).

**Action:** Re-run `claude-dev-stack install` selecting the same project.

**Expected wizard output:** `<project-name> → CLAUDE.md: unchanged` (idempotent — content byte-identical) OR `updated` (if any text changed since last run). The line must never say the forbidden BUG-07 verb.

**Expected file state:** File byte-identical to Scenario 1 outcome (assuming no source changes between runs).

**Verify:**
```bash
md5sum CLAUDE.md       # compare against Scenario 1 md5
grep -c '@claude-dev-stack:start' CLAUDE.md   # still 1 — no duplicate markers
```

- [ ] PASS / FAIL — notes: ___________________

---

## Scenario 3 — Existing CLAUDE.md WITHOUT markers, with user content (BUG-07 SC#6, D-07)

**Pre-state:** Project directory with hand-written CLAUDE.md:
```bash
cat > CLAUDE.md <<'EOF'
# My Project

This is my own documentation that MUST survive any wizard run.

## My Custom Section
User-authored notes about deployment, secrets handling, etc.
EOF
```

**Action:** Run `claude-dev-stack install` and select this project.

**Expected wizard output:** `<project-name> → CLAUDE.md: appended (existing content preserved)` (yellow/warn color).

**Expected file state:**
- Original `# My Project`, `This is my own documentation…`, `## My Custom Section`, and `User-authored notes…` lines all present, byte-identical to pre-state, in the same order.
- Our managed section appended at the end, between `<!-- @claude-dev-stack:start -->` and `<!-- @claude-dev-stack:end -->` markers.

**Verify:**
```bash
grep -c 'User-authored notes about deployment' CLAUDE.md  # must be 1
grep -c '@claude-dev-stack:end' CLAUDE.md                 # must be 1
head -1 CLAUDE.md                                         # must be "# My Project"
```

- [ ] PASS / FAIL — notes: ___________________

---

## Scenario 4 — Re-run on appended file (D-07 second-run promotion)

**Pre-state:** Result of Scenario 3 (markers now present, user content preserved).

**Action:** Run `claude-dev-stack install` again on the same project.

**Expected wizard output:** `<project-name> → CLAUDE.md: unchanged` OR `updated` (NOT `appended` — markers exist now, so the path switches to in-place update).

**Expected file state:** User content still present at top. NO duplicate managed section. Single `<!-- @claude-dev-stack:start -->` and single `<!-- @claude-dev-stack:end -->`.

**Verify:**
```bash
grep -c '@claude-dev-stack:start' CLAUDE.md               # must be 1 (NOT 2)
grep -c '@claude-dev-stack:end' CLAUDE.md                 # must be 1 (NOT 2)
grep -c 'User-authored notes about deployment' CLAUDE.md  # must still be 1
```

- [ ] PASS / FAIL — notes: ___________________

---

## Scenario 5 — User content interleaved with markers (BUG-07 SC#1, threat T-30-01)

**Pre-state:** CLAUDE.md with user content BOTH before AND after our markers:
```bash
cat > CLAUDE.md <<'EOF'
# Top header

User notes BEFORE markers — must survive.

<!-- @claude-dev-stack:start -->
## Old managed content (will be replaced)
<!-- @claude-dev-stack:end -->

## User Section AFTER markers — must also survive

More user notes here.
EOF
```

**Action:** Run wizard.

**Expected wizard output:** `<project-name> → CLAUDE.md: updated` (green/ok color).

**Expected file state:**
- `# Top header` present at top.
- `User notes BEFORE markers — must survive.` present.
- `## User Section AFTER markers — must also survive` present.
- `More user notes here.` present.
- `## Old managed content (will be replaced)` GONE — replaced with current managed sections.

**Verify:**
```bash
grep -c 'BEFORE markers' CLAUDE.md    # must be 1
grep -c 'AFTER markers' CLAUDE.md     # must be 1
grep -c 'Old managed content' CLAUDE.md   # must be 0
```

- [ ] PASS / FAIL — notes: ___________________

---

## Cross-cutting Assertion — "forbidden legacy verb" never appears (D-06)

During ALL 5 scenarios, the wizard MUST NEVER print the legacy pre-fix verb (the forbidden word from BUG-07) for CLAUDE.md status. Status text is always one of: `created`, `updated`, `appended`, `unchanged`.

Test-lock: `tests/claude-md-status-line.test.mjs` asserts `formatClaudeMdStatus` never produces the forbidden verb for any input, including unknown future statuses. Run `node --test tests/claude-md-status-line.test.mjs` to confirm before the UAT session.

- [ ] PASS / FAIL — notes: ___________________

---

## Sign-off

All 5 scenarios + cross-cutting assertion PASS → BUG-07 closed.

Tester signature: __________________  Date: __________

---

## Pointers

- REQUIREMENTS.md → BUG-07 row
- `tests/claude-md-idempotent.test.mjs` — scenarios A–F (and T-30-01 threat-acceptance test)
- `tests/claude-md-status-line.test.mjs` — D-06 status-line contract
- `lib/project-setup.mjs` → `updateManagedSection`
- `lib/install/claude-md.mjs` → `formatClaudeMdStatus`, `printClaudeMdStatus`, `generateClaudeMD`
