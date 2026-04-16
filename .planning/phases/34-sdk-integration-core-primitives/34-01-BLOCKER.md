# Plan 34-01 — Blocker: LGPL transitive via sharp platform bindings

**Raised:** 2026-04-16 (Phase 34 execution)
**Status:** execution halted mid-Plan-01 Task 3
**Affects:** Plans 34-02, 34-03, 34-04 (all depend on 34-01)

## What happened

Plan 01 Task 3 ran `pnpm --filter @cds/core add @anthropic-ai/claude-agent-sdk@^0.2.110` followed by the transitive license audit. The audit flagged:

```
LGPL-3.0-or-later: @img/sharp-libvips-darwin-arm64@1.2.4
```

The plan's forbidden-license list (PLAN.md Task 3 step 4) explicitly includes `LGPL-3.0` and `LGPL-2.1`, so the audit script exited non-zero and Plan 01 halted per the plan's Pitfall 6 escalation clause:

> **If any step fails:** Pitfall 6 (GPL transitive): stop plan, escalate to user. Do NOT proceed to Plans 02/04.

## Why this is nuanced (context for decision)

1. **The LGPL dep is optional, not mandatory.** `@anthropic-ai/claude-agent-sdk@0.2.111`'s `package.json` lists `@img/sharp-darwin-*`, `@img/sharp-linux-*`, etc. under `optionalDependencies`, not `dependencies`. pnpm's `licenses list --prod` includes optional deps in the prod tree on supported platforms, which is why it surfaced here.
2. **LGPL is distinct from GPL/AGPL/SSPL.** LGPL-3.0-or-later permits dynamic linking without license propagation — libvips is a classic example of a library designed to be LGPL-dynamic-linked from permissively-licensed applications. RESEARCH.md Pitfall 6 names GPL/AGPL/SSPL specifically; the plan's forbidden list widened this to LGPL by executor's specification.
3. **sharp is MCP SDK transitive.** `@anthropic-ai/claude-agent-sdk` → `@modelcontextprotocol/sdk@1.29.0` → image handling surface pulls sharp. Removing it would require forking or pinning the SDK below a version that uses MCP SDK image support.
4. **Audit output (`pnpm --filter @cds/core licenses list --prod --json`):**
   ```
   License buckets: Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, LGPL-3.0-or-later, MIT, Unknown
   "Unknown" = @anthropic-ai/claude-agent-sdk itself (Anthropic Commercial ToS per D-13, allowlisted in NOTICES.md)
   "LGPL-3.0-or-later" = @img/sharp-libvips-darwin-arm64@1.2.4 (platform-optional, sharp's native libvips binding)
   ```

## What is ready / what is held

**Completed (committed):**
- `NOTICES.md` at repo root (scaffold with transitive placeholder)
- `packages/cds-core/package.json` declares `"@anthropic-ai/claude-agent-sdk": "^0.2.110"`
- `pnpm-lock.yaml` updated with SDK + transitive integrity hashes
- `packages/cds-core/src/errors.ts` scaffold (DispatchError + LicenseKeyError)
- Root `package.json` single-dep constraint preserved (prompts only)

**Held (not yet committed):**
- NOTICES.md `TRANSITIVE_RUNTIME_DEPS_BEGIN` placeholder is still empty (Task 3 step 6 did not run because step 4 blocked).
- `.planning/REQUIREMENTS.md` SDK-01 correction note (Task 5 not yet applied).
- `34-01-SUMMARY.md` not written (Task 6 not yet run).
- Plans 02, 03, 04 not started.

## Decision options for user

1. **Explicit LGPL allowlist with documentation in NOTICES.md.** LGPL via dynamically-linked optional platform binding (libvips, a well-known C library) is industry-standard permissive for MIT-licensed apps. Update Plan 01 Task 3 audit to allowlist LGPL-3.0-or-later for packages matching `@img/sharp-libvips-*` with a documented NOTICES.md entry explaining the dynamic-linking basis. This preserves Pitfall 6's intent (block viral copyleft) while recognizing LGPL is not viral.
2. **Narrow the forbidden list to Pitfall 6 wording only (GPL/AGPL/SSPL), drop LGPL.** Align the plan's audit with its source Pitfall's text. Documented in Plan 01's SUMMARY as a plan amendment.
3. **Drop sharp via SDK exclusion.** Use `pnpm.overrides` or `optionalDependencies: false` to skip `@img/sharp-*` bindings. SDK still functions for non-image workloads. Cost: any downstream CDS usage that needs MCP image tools breaks.
4. **Pin SDK to a pre-sharp version.** Investigate which SDK version added the MCP dep chain that pulls sharp and pin below it. Cost: potentially stale SDK, may miss fixes needed for Plans 02+.
5. **Re-plan Phase 34 with sharp-exclusion built into Task 3.** Treat the optional-dep discovery as a known deviation and replan.

## Recommended disposition (not decided — user choice)

Option 1 (explicit LGPL allowlist with NOTICES documentation) best matches CDS's MIT-licensed-with-Commercial-SDK framing and the actual license semantics of libvips. It keeps the audit honest (LGPL disclosed) while not mis-treating LGPL as viral copyleft.

## What a resumption looks like

1. User chooses option → update Plan 01 Task 3 audit script accordingly.
2. Re-run Task 3 (population step), Task 4 (errors.ts already done, skip or verify), Task 5 (REQUIREMENTS.md), Task 6 (SUMMARY + commit).
3. Continue to Wave 1 (Plans 02+03) and Wave 2 (Plan 04).

## Artifacts left in working tree at time of stop

```
packages/cds-core/package.json           modified (SDK dep added)
pnpm-lock.yaml                           modified
NOTICES.md                               new (transitive section still has placeholder)
packages/cds-core/src/errors.ts          not yet created
.planning/REQUIREMENTS.md                not yet modified
.planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md  not yet created
.planning/phases/34-sdk-integration-core-primitives/34-01-BLOCKER.md  this file (new)
```
