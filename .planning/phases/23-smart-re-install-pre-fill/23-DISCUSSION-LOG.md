# Phase 23: Smart Re-install Pre-fill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 23-smart-re-install-pre-fill
**Areas discussed:** Profile persistence, Skip vs confirm UX, Version check strategy, NotebookLM auth check

---

## Profile Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| vault/meta/profile.json | Alongside project-map.json, syncs via git | ✓ |
| ~/.claude/dev-stack-profile.json | Global outside vault, no cross-machine sync | |
| vault/meta/install-state.json | One file for all install state | |

**User's choice:** vault/meta/profile.json
**Notes:** Recommended — natural location next to existing vault metadata files.

| Option | Description | Selected |
|--------|-------------|----------|
| Only lang + codeLang | Minimal — DX-07 only, useCase separate | ✓ |
| lang + codeLang + useCase + projectsDir | Full wizard state in one file | |

**User's choice:** Only lang + codeLang
**Notes:** Then asked about useCase separately — decided to add useCase to same profile.json.

| Option | Description | Selected |
|--------|-------------|----------|
| Also in profile.json | Add useCase field to same file | ✓ |
| Detect from installed plugins | Infer use-case from plugins — unreliable | |

**User's choice:** Also in profile.json

---

## Skip vs Confirm UX

| Option | Description | Selected |
|--------|-------------|----------|
| Select: Keep / Change | Unified select prompt for all pre-filled values | ✓ |
| Silent skip + info line | Just show info, no opportunity to change | |
| Text initial (pre-filled editable) | Pre-filled text input with Enter to accept | |

**User's choice:** Select: Keep / Change
**Notes:** Aligns with UX-07 feedback — consistent select style throughout wizard.

| Option | Description | Selected |
|--------|-------------|----------|
| Same prompt as fresh install | Show original prompt with initial=current | ✓ |
| Inline editing in select | More complex with prompts library | |

**User's choice:** Same prompt as fresh install

| Option | Description | Selected |
|--------|-------------|----------|
| Silent skip | Auto-add registered projects + info line | ✓ |
| Info + Keep/Rename option | Show current name with rename option | |

**User's choice:** Silent skip for DX-09

---

## Version Check Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| npx --version + npm view | Run local and compare to registry | ✓ |
| Check local version file | Read without npm — no update detection | |
| Skip check, show installed | Just show version without latest check | |

**User's choice:** npx --version + npm view

| Option | Description | Selected |
|--------|-------------|----------|
| Info + auto-skip | "GSD: up to date ✔" and move on | ✓ |
| Select: Skip / Reinstall | Always ask even if latest | |

**User's choice:** Info + auto-skip

---

## NotebookLM Auth Check

| Option | Description | Selected |
|--------|-------------|----------|
| storage_state.json exists | Quick file existence check | ✓ |
| notebooklm-py status command | Real validation but slow — opens browser | |
| Check file age | Treat >30 days as expired | |

**User's choice:** storage_state.json exists

| Option | Description | Selected |
|--------|-------------|----------|
| Info + select: Skip / Re-login / Sync now | Shows auth status + 3 options | ✓ |
| Info + auto-skip | Just show status and move on | |

**User's choice:** Info + select: Skip / Re-login / Sync now

---

## Claude's Discretion

- Projects directory pre-fill source (DX-08)
- Profile.json schema versioning

## Deferred Ideas

None
