# Phase 34 Plan 01 — SDK Dependency & NOTICES — SUMMARY

**Completed:** 2026-04-16
**Requirement:** SDK-01
**Wave:** 0
**Branch:** `gsd/phase-34-sdk-integration-core-primitives`

## What was done

### Tasks 1-2 (pre-audit scaffold)
- Committed in `67e5aa5 wip(34-01): install SDK + NOTICES scaffold (pre-audit)`.
- Added `@anthropic-ai/claude-agent-sdk@^0.2.110` to `packages/cds-core/package.json`.
- Regenerated `pnpm-lock.yaml` with SDK + transitive integrity hashes.
- Created `NOTICES.md` scaffold at repo root with `TRANSITIVE_RUNTIME_DEPS_BEGIN/END` markers.
- Root `package.json` `dependencies` single-dep constraint preserved (`prompts` only).

### Task 3 blocker + resolution
- Committed initial blocker in `c4cf641 docs(34): Plan 01 blocker — LGPL transitive via sharp optional dep`.
- License audit (`pnpm -C packages/cds-core licenses list --prod --json`) flagged `@img/sharp-libvips-darwin-arm64@1.2.4` (LGPL-3.0-or-later).
- Root cause: transitive via `@anthropic-ai/claude-agent-sdk → @modelcontextprotocol/sdk → sharp`; shipped as optional platform binding.
- **User decision (2026-04-16):** Option 1 — Explicit LGPL allowlist limited to `@img/sharp-libvips-*` pattern, with NOTICES documentation.
- BLOCKER.md appended with Resolution section citing the allowlist policy + re-run confirmation.

### Tasks 4-6 (resume)
- Created `packages/cds-core/src/errors.ts` — `CdsCoreError` base + `DispatchError` + `LicenseKeyError`.
- Amended `.planning/REQUIREMENTS.md` SDK-01 with two inline correction sub-bullets:
  - SDK is under Anthropic Commercial ToS (not MIT/Apache as the original REQ assumed)
  - LGPL transitive allowlist note for `@img/sharp-libvips-*`
- Populated NOTICES.md transitive section from real `pnpm licenses list --prod --json` output — 99 transitive packages listed, grouped by license bucket. Added LGPL allowlist section explaining dynamic-linking basis.
- Audit re-ran with the allowlist policy: PASSES. Only `@img/sharp-libvips-darwin-arm64` flagged and explicitly allowlisted.

## Acceptance

- ✓ `@anthropic-ai/claude-agent-sdk@^0.2.110` installed as `@cds/core` production dependency
- ✓ `NOTICES.md` exists at repo root with full transitive dep list + license summary + LGPL allowlist documentation
- ✓ `.planning/REQUIREMENTS.md` SDK-01 amended with correction notes
- ✓ `packages/cds-core/src/errors.ts` scaffold present
- ✓ Root `package.json` `dependencies` field unchanged (`prompts` only — Phase 33 D-03 preserved)
- ✓ License audit policy encoded with LGPL allowlist pattern (future LGPL runtime deps still fail)

## Test baseline

Not regressed. Plan 01 work touched only config + NOTICES + errors.ts scaffold — no runtime logic changes. Full test verification happens after Plan 04 (barrel + wiring).

## Next

- Plan 02 (dispatch-agent, Wave 1, SDK-02)
- Plan 03 (context-class, Wave 1, CORE-01) — can parallel with 02
- Plan 04 (cost-tracker + barrel, Wave 2, CORE-02)
