---
phase: 7
slug: notebooklm-manifest-v2-per-project-sync-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node.js native) |
| **Config file** | none — native to Node.js 18+ |
| **Quick run command** | `node --test tests/notebooklm-manifest.test.mjs tests/notebooklm-sync.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/notebooklm-manifest.test.mjs tests/notebooklm-sync.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | NBLM-V2-01 | — | v1→v2 migration preserves all entries | unit | `node --test tests/notebooklm-manifest-migration.test.mjs` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | TEST-04 | — | v1 manifest with 3 entries reads as 3 v2 entries | unit | `node --test tests/notebooklm-manifest-migration.test.mjs` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | NBLM-V2-02 | — | Per-project sync loop creates cds__{slug} notebooks | unit | `node --test tests/notebooklm-sync.test.mjs` | ✅ | ⬜ pending |
| 7-02-02 | 02 | 1 | NBLM-V2-03 | — | Pre-flight conflict scan aborts on existing cds__ notebook | unit | `node --test tests/notebooklm-sync.test.mjs` | ✅ | ⬜ pending |
| 7-02-03 | 02 | 1 | NBLM-V2-04 | — | buildTitle projectScoped drops prefix | unit | `node --test tests/notebooklm-sync.test.mjs` | ✅ | ⬜ pending |
| 7-03-01 | 03 | 2 | NBLM-V2-08 | — | Deprecation warning only in doctor | unit | `node --test tests/doctor.test.mjs` | ✅ | ⬜ pending |
| 7-03-02 | 03 | 2 | NBLM-V2-09 | — | Per-project stats in doctor output | unit | `node --test tests/doctor.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/notebooklm-manifest-migration.test.mjs` — v1→v2 migration tests (NBLM-V2-01, TEST-04)

*Existing `tests/notebooklm-sync.test.mjs` and `tests/doctor.test.mjs` cover remaining requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real NotebookLM sync creates per-project notebooks | NBLM-V2-02 | Requires live notebooklm-py + API credentials | Run `claude-dev-stack notebooklm sync` on vault with 2+ projects, verify cds__{slug} notebooks created |
| v0.8.1→v0.9 upgrade preserves manifest | NBLM-V2-01 | Requires real v1 manifest from production use | Copy existing .notebooklm-sync.json, run sync, verify .v1.backup.json + v2 shape |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
