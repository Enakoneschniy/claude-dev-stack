---
plan_id: 34-01-sdk-dependency-notices
phase: 34
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/cds-core/package.json
  - pnpm-lock.yaml
  - NOTICES.md
  - packages/cds-core/src/errors.ts
  - .planning/REQUIREMENTS.md
autonomous: true
requirements:
  - SDK-01
user_setup: []
must_haves:
  truths:
    - "NOTICES.md at repo root lists @anthropic-ai/claude-agent-sdk under Anthropic Commercial ToS (ROADMAP SC#1 per D-13/D-14)"
    - "NOTICES.md enumerates every transitive runtime dependency with its SPDX license (D-14)"
    - "No transitive runtime dependency is GPL/AGPL/SSPL/UNKNOWN (Pitfall 6)"
    - "packages/cds-core/package.json declares @anthropic-ai/claude-agent-sdk as a dependency (SDK-01)"
    - "Root package.json dependencies remain {prompts: ^2.4.2} only (D-03 single-dep lock preserved)"
    - "REQUIREMENTS.md SDK-01 carries a D-15 correction note with Anthropic Commercial ToS wording"
    - "packages/cds-core/src/errors.ts exports DispatchError and LicenseKeyError (scaffold for Plans 02/04)"
  artifacts:
    - path: "NOTICES.md"
      provides: "Repo-root license disclosure for redistributed runtime deps"
      contains: "@anthropic-ai/claude-agent-sdk"
    - path: "packages/cds-core/package.json"
      provides: "@cds/core manifest with SDK dep"
      contains: '"@anthropic-ai/claude-agent-sdk"'
    - path: "packages/cds-core/src/errors.ts"
      provides: "Error hierarchy base — DispatchError + LicenseKeyError"
      contains: "class DispatchError"
    - path: ".planning/REQUIREMENTS.md"
      provides: "SDK-01 correction note per D-15"
      contains: "Anthropic Commercial ToS"
    - path: "pnpm-lock.yaml"
      provides: "Updated lockfile with SDK + transitive deps + integrity hashes"
  key_links:
    - from: "packages/cds-core/package.json dependencies"
      to: "@anthropic-ai/claude-agent-sdk@^0.2.110"
      via: "pnpm install"
      pattern: '"@anthropic-ai/claude-agent-sdk":\s*"\^0\.'
    - from: "NOTICES.md §Runtime Dependencies"
      to: "Every transitive runtime package in cds-core's prod tree"
      via: "pnpm licenses list --prod --filter @cds/core"
      pattern: "## Runtime Dependencies"
---

<objective>
Deliver the licensing foundation for Phase 34 before any SDK code lands. Install `@anthropic-ai/claude-agent-sdk@^0.2.110` into `@cds/core`, create repo-root `NOTICES.md` enumerating every redistributed runtime dependency with its license (including transitive SDK deps), block on GPL/AGPL/SSPL/UNKNOWN transitive licenses, scaffold `packages/cds-core/src/errors.ts` with the `DispatchError` + `LicenseKeyError` base hierarchy, and append the D-15 correction note to REQUIREMENTS.md SDK-01.

Purpose: satisfy SDK-01 in a documentation-plus-install form that is a hard prerequisite for Plans 02-04 (all of which import the SDK and the errors module). This plan is Wave 0 — all downstream plans in this phase block on its completion.

Output: repo-root `NOTICES.md` (new), `packages/cds-core/package.json` (modified — new `dependencies` key), `pnpm-lock.yaml` (updated), `packages/cds-core/src/errors.ts` (new), `.planning/REQUIREMENTS.md` (appended correction note), all committed on branch `gsd/phase-34-sdk-integration-core-primitives`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md
@.planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md
@.planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md
@.planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md
@./CLAUDE.md
@./package.json
@./packages/cds-core/package.json

<interfaces>
<!-- Root package.json fields that MUST stay untouched (Phase 33 D-03 lock). -->
<!-- Executor MUST NOT modify root package.json dependencies or files[]. Only packages/cds-core/package.json is modified for SDK dep. -->

From root `package.json` (preserved byte-for-byte post-Phase-33):
```json
{
  "dependencies": { "prompts": "^2.4.2" },
  "files": ["bin/", "lib/", "hooks/", "patches/", "skills/", "templates/", "README.md", "LICENSE"]
}
```

`NOTICES.md` is auto-included in `npm pack` per npm docs (Assumption A4, VERIFIED) — no `"files"` array change needed.

From `packages/cds-core/package.json` (Phase 33 state — modified ONLY by adding `dependencies` key):
```json
{
  "name": "@cds/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": { "build": "tsc --build", "test": "vitest run" }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify SDK version, engines, license, and transitive license compliance</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"SDK License Policy (D-13 … D-16)"
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Standard Stack" (Installation + Version verification block), §"Pitfall 6"
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"NOTICES.md"
  </read_first>
  <files>
    - /tmp/sdk-meta.json (scratch — not committed)
    - /tmp/sdk-licenses.json (scratch — not committed)
  </files>
  <action>
  Run a sequence of `npm view` / `pnpm` commands to (a) verify the SDK's latest published version matches or exceeds `^0.2.110`, (b) confirm its `engines.node` meets CDS's `>=18` baseline, (c) capture its license field (expected: `SEE LICENSE IN LICENSE.md` per D-13 verification), and (d) pre-audit the full dependency tree for forbidden licenses (GPL*/AGPL*/SSPL*/UNKNOWN).

  **Steps:**

  1. Capture current SDK metadata:
  ```bash
  npm view @anthropic-ai/claude-agent-sdk version engines license dependencies --json > /tmp/sdk-meta.json
  cat /tmp/sdk-meta.json
  ```
  Expected (approximate — actual may have advanced since 2026-04-16):
  ```json
  {
    "version": "0.2.110",              // or higher
    "engines": { "node": ">=18" },     // must include 18 per CDS baseline
    "license": "SEE LICENSE IN LICENSE.md",
    "dependencies": { /* transitive deps */ }
  }
  ```

  2. Assert published version satisfies `^0.2.110`:
  ```bash
  node -e 'const m=require("/tmp/sdk-meta.json"); const [maj,min,pat]=m.version.split(".").map(Number); if (maj!==0 || min<2 || (min===2 && pat<110)) { console.error("FAIL sdk-version="+m.version+" does not satisfy ^0.2.110"); process.exit(1); } console.log("OK version="+m.version);'
  ```

  3. Assert Node engines includes 18:
  ```bash
  node -e 'const m=require("/tmp/sdk-meta.json"); const n=m.engines && m.engines.node; if (!n || !n.includes(">=18") && !n.includes(">= 18") && !n.includes(">=16")) { console.error("FAIL sdk-engines.node="+n+" may not cover Node 18"); process.exit(1); } console.log("OK engines.node="+n);'
  ```
  (Permit `>=16` — CDS baseline is Node 18; any SDK floor <= 18 works. If the SDK ever bumps to `>=20`, this assertion fails and Plan 01 escalates per Assumption A5.)

  4. Record the license string exactly (will be cross-checked against NOTICES.md in Task 2):
  ```bash
  jq -r '.license' /tmp/sdk-meta.json > /tmp/sdk-license.txt
  cat /tmp/sdk-license.txt
  ```
  Expected: `SEE LICENSE IN LICENSE.md` (meaning the license is documented in the SDK's own LICENSE.md — the Anthropic Commercial ToS). If the string is `MIT` or `Apache-2.0`, escalate: CONTEXT.md D-13 must be revised (npm metadata changed).

  5. **Do NOT `pnpm install` yet** — transitive license audit runs AFTER install in Task 3. Task 1 is pre-install verification only.
  </action>
  <verify>
    <automated>test -s /tmp/sdk-meta.json && jq -r '.version' /tmp/sdk-meta.json | grep -qE '^0\.[0-9]+\.[0-9]+$' && jq -r '.engines.node' /tmp/sdk-meta.json | grep -qE '>=\s*1[68]|>=\s*20' && jq -r '.license' /tmp/sdk-meta.json | grep -qiE 'commercial|see license|anthropic' && echo 'OK verification'</automated>
  </verify>
  <acceptance_criteria>
    - `test -s /tmp/sdk-meta.json` exits 0
    - `jq -r '.version' /tmp/sdk-meta.json` returns a semver ≥ `0.2.110`
    - `jq -r '.engines.node' /tmp/sdk-meta.json` contains `>=16`, `>=18`, OR `>=20` (any of these is compatible with CDS's `>=18` baseline)
    - `jq -r '.license' /tmp/sdk-meta.json` does NOT return `MIT` or `Apache-2.0` (confirms D-13 — if this ever fails, CONTEXT.md D-13 needs revisiting)
    - No `pnpm install` invocation in this task (install happens in Task 3)
  </acceptance_criteria>
  <done>
  SDK version ≥ 0.2.110 verified, Node engines compatible with `>=18`, license confirms non-MIT/Apache (per D-13). Metadata captured for Task 2 NOTICES.md body generation.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create NOTICES.md at repo root (runtime deps section, placeholder for transitive)</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"SDK License Policy (D-13 … D-16)"
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Pattern 5: NOTICES.md convention"
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"NOTICES.md"
    - /tmp/sdk-meta.json (from Task 1 — SDK version constraint + license string)
    - ./package.json (verify "prompts": "^2.4.2" is the only runtime dep in root)
  </read_first>
  <files>
    - NOTICES.md (new — repo root)
  </files>
  <action>
  Create `NOTICES.md` at repo root with the exact content below. The Transitive Runtime Dependencies subsection contains an HTML comment placeholder that Task 3 fills in after `pnpm install` resolves the tree.

  **File: `NOTICES.md`** (copy verbatim):

  ```markdown
  # NOTICES

  This project redistributes the following third-party software. Each dependency
  listed below retains its original license. Claude Dev Stack itself is MIT-licensed
  (see `LICENSE`).

  ## Runtime Dependencies

  ### @anthropic-ai/claude-agent-sdk
  - **Version constraint:** `^0.2.110`
  - **License:** Anthropic Commercial Terms of Service
  - **License URL:** https://www.anthropic.com/legal/commercial-terms
  - **Redistribution basis:** Anthropic Commercial ToS permits redistribution of the SDK within products. CDS embeds the SDK as an internal infrastructure dependency of `@cds/core`; end users who run CDS are also subject to the SDK's terms via their own `ANTHROPIC_API_KEY` usage.
  - **Used by:** `@cds/core` (internal infrastructure; not exposed directly to the CLI surface).

  ### prompts
  - **Version constraint:** `^2.4.2`
  - **License:** MIT
  - **License URL:** https://github.com/terkelg/prompts/blob/master/license
  - **Used by:** root `claude-dev-stack` CLI (interactive setup wizard) — single-runtime-dep constraint on CLI surface is preserved.

  ### Transitive runtime dependencies (pulled via `@anthropic-ai/claude-agent-sdk`)

  <!-- TRANSITIVE_RUNTIME_DEPS_BEGIN -->
  <!-- Populated by Plan 01 Task 3 after `pnpm install`. Format per entry: -->
  <!--   - `<name>@<version>` — <SPDX license> -->
  <!-- TRANSITIVE_RUNTIME_DEPS_END -->

  ## Development Dependencies

  Development tooling (`vitest`, `typescript`, `@types/node`) is **not redistributed**
  in the published `claude-dev-stack` npm tarball (these are `devDependencies` only).
  See `package.json` and `packages/*/package.json` for the full development toolchain.

  ## License Compliance Policy

  - **Permitted:** MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Python-2.0, Unlicense, 0BSD
  - **Permitted with documentation (as here):** Anthropic Commercial Terms of Service (SDK only)
  - **Not permitted in runtime deps:** GPL-*, AGPL-*, SSPL-*, UNKNOWN/unreviewed

  If a future transitive dependency lands under a not-permitted license, `pnpm licenses list --prod --filter @cds/core` will flag it and the CI license audit (future Phase) will block the commit. For Phase 34, Plan 01 Task 3 performs this audit manually and fails the task if any forbidden license appears.

  ## Questions

  Report license concerns to the `claude-dev-stack` maintainers via GitHub issues. This NOTICES.md is kept in sync with `pnpm-lock.yaml` — each runtime dependency bump MUST be accompanied by a NOTICES.md update.
  ```

  Write this file via the `Write` tool. Do NOT use heredoc/cat — match `<execution_context>` rules.
  </action>
  <verify>
    <automated>test -f NOTICES.md && grep -q '^# NOTICES$' NOTICES.md && grep -q '@anthropic-ai/claude-agent-sdk' NOTICES.md && grep -q 'Anthropic Commercial Terms of Service' NOTICES.md && grep -q 'prompts' NOTICES.md && grep -q 'TRANSITIVE_RUNTIME_DEPS_BEGIN' NOTICES.md && grep -q 'TRANSITIVE_RUNTIME_DEPS_END' NOTICES.md && grep -q 'License Compliance Policy' NOTICES.md && grep -qE 'GPL|AGPL|SSPL' NOTICES.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f NOTICES.md` exits 0
    - `head -1 NOTICES.md` returns exactly `# NOTICES`
    - `grep -c '@anthropic-ai/claude-agent-sdk' NOTICES.md` returns ≥ 1
    - `grep -c 'Anthropic Commercial Terms of Service' NOTICES.md` returns ≥ 1
    - `grep -c '^### prompts$' NOTICES.md` returns `1`
    - `grep -c 'TRANSITIVE_RUNTIME_DEPS_BEGIN' NOTICES.md` returns `1` (placeholder for Task 3)
    - `grep -c 'TRANSITIVE_RUNTIME_DEPS_END' NOTICES.md` returns `1`
    - `grep -c 'License Compliance Policy' NOTICES.md` returns `1`
    - `grep -c 'MIT' NOTICES.md` returns ≥ 2 (prompts license + permitted list)
    - `grep -cE 'GPL-|AGPL-|SSPL-' NOTICES.md` returns ≥ 3 (listed in Not Permitted section)
    - `wc -l NOTICES.md` returns ≥ 30 (minimum file length sanity check)
  </acceptance_criteria>
  <done>
  NOTICES.md created at repo root. SDK + prompts documented in full. Transitive section has begin/end markers for Task 3 to populate. License Compliance Policy clarifies forbidden licenses. File exists and passes structural grep checks.
  </done>
</task>

<task type="auto">
  <name>Task 3: Install SDK into @cds/core, audit transitive licenses, populate NOTICES.md transitive section</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"SDK License Policy (D-14)"
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Common Pitfalls" (Pitfall 6), §"Standard Stack" (Transitive dependencies)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/package.json"
    - ./packages/cds-core/package.json (current state — Phase 33 scaffold, no dependencies key)
    - ./NOTICES.md (from Task 2 — has placeholder to fill)
  </read_first>
  <files>
    - packages/cds-core/package.json (modified — add dependencies key)
    - pnpm-lock.yaml (regenerated by pnpm install)
    - NOTICES.md (modified — populate TRANSITIVE_RUNTIME_DEPS placeholder)
  </files>
  <action>
  Install `@anthropic-ai/claude-agent-sdk@^0.2.110` into `@cds/core`, audit the transitive runtime license tree, populate the NOTICES.md transitive section, and block the plan if any GPL/AGPL/SSPL/UNKNOWN license is detected.

  **Steps:**

  1. Add the SDK dependency to `packages/cds-core/package.json`. Use `pnpm` to edit the manifest + install atomically:
  ```bash
  pnpm --filter @cds/core add @anthropic-ai/claude-agent-sdk@^0.2.110
  ```

  Expected outcome:
  - `packages/cds-core/package.json` gains a `"dependencies": { "@anthropic-ai/claude-agent-sdk": "^0.2.110" }` key.
  - `pnpm-lock.yaml` at repo root is updated with the new resolution + every transitive integrity hash.
  - `node_modules/` contains the SDK + its transitive deps (linked via pnpm's content-addressed store).

  2. Verify root `package.json` was NOT modified (D-03 single-dep lock):
  ```bash
  node -e 'const p=require("./package.json"); if (Object.keys(p.dependencies).length !== 1 || !p.dependencies.prompts) { console.error("FAIL root deps="+JSON.stringify(p.dependencies)); process.exit(1); } console.log("OK root dependencies single-dep preserved");'
  ```

  3. Run the transitive license audit filtered to `@cds/core`'s prod tree. `pnpm licenses list` outputs a JSON of license → [packages]:
  ```bash
  pnpm --filter @cds/core licenses list --prod --json > /tmp/sdk-licenses.json
  cat /tmp/sdk-licenses.json | jq 'keys'
  ```

  4. Block on forbidden licenses. Exit non-zero if any GPL/AGPL/SSPL/UNKNOWN is present:
  ```bash
  node -e '
    const l = require("/tmp/sdk-licenses.json");
    const forbidden = ["GPL-3.0", "GPL-2.0", "LGPL-3.0", "LGPL-2.1", "AGPL-3.0", "SSPL-1.0", "UNKNOWN", "UNLICENSED"];
    let bad = [];
    for (const key of Object.keys(l)) {
      for (const fb of forbidden) {
        if (key.toUpperCase().includes(fb.toUpperCase())) {
          const pkgs = (l[key] || []).map(p => p.name + "@" + p.version);
          bad.push(key + ": " + pkgs.join(", "));
        }
      }
    }
    if (bad.length) {
      console.error("FAIL forbidden licenses in @cds/core prod tree:\n" + bad.join("\n"));
      process.exit(1);
    }
    console.log("OK license audit: " + Object.keys(l).length + " license buckets, all permitted");
  '
  ```

  5. Generate the transitive runtime deps markdown block from `pnpm licenses list` output. Write to a scratch file:
  ```bash
  node -e '
    const l = require("/tmp/sdk-licenses.json");
    const lines = [];
    for (const license of Object.keys(l).sort()) {
      for (const pkg of (l[license] || []).sort((a,b) => a.name.localeCompare(b.name))) {
        // Skip workspace packages (@cds/*) and the SDK itself (already listed above placeholder)
        if (pkg.name.startsWith("@cds/")) continue;
        if (pkg.name === "@anthropic-ai/claude-agent-sdk") continue;
        if (pkg.name === "prompts") continue;
        lines.push("- \`" + pkg.name + "@" + pkg.version + "\` — " + license);
      }
    }
    require("node:fs").writeFileSync("/tmp/transitive-block.md", lines.join("\n") + "\n");
    console.log("Wrote " + lines.length + " transitive entries to /tmp/transitive-block.md");
  '
  ```

  6. Substitute the `/tmp/transitive-block.md` content between `<!-- TRANSITIVE_RUNTIME_DEPS_BEGIN -->` and `<!-- TRANSITIVE_RUNTIME_DEPS_END -->` in `NOTICES.md`:
  ```bash
  node -e '
    const fs = require("node:fs");
    const notices = fs.readFileSync("NOTICES.md", "utf8");
    const block = fs.readFileSync("/tmp/transitive-block.md", "utf8").trim();
    const begin = "<!-- TRANSITIVE_RUNTIME_DEPS_BEGIN -->";
    const end = "<!-- TRANSITIVE_RUNTIME_DEPS_END -->";
    const beginIdx = notices.indexOf(begin);
    const endIdx = notices.indexOf(end);
    if (beginIdx < 0 || endIdx < 0) { console.error("FAIL markers missing"); process.exit(1); }
    const newContent =
      notices.slice(0, beginIdx + begin.length) +
      "\n\n" + block + "\n\n" +
      notices.slice(endIdx);
    fs.writeFileSync("NOTICES.md", newContent, "utf8");
    console.log("OK transitive section populated");
  '
  ```

  7. Smoke-check that `NOTICES.md` is auto-included in `npm pack`:
  ```bash
  npm pack --dry-run 2>&1 | grep -q 'NOTICES.md' || { echo 'FAIL NOTICES.md not in pack manifest'; exit 1; }
  echo "OK npm pack includes NOTICES.md"
  ```

  8. Commit lockfile + NOTICES.md + packages/cds-core/package.json via the normal commit flow (Task 6 handles git).

  **If any step fails:**
  - Pitfall 6 (GPL transitive): stop plan, escalate to user. Do NOT proceed to Plans 02/04.
  - Step 1 fails (`pnpm add` errors): check `pnpm --version` matches `packageManager` in root `package.json` (`pnpm@10.6.3`). Run `corepack enable` if needed.
  - Step 7 fails (NOTICES.md not in pack): Assumption A4 incorrect; append `"NOTICES.md"` to root `package.json` `"files"` array as last-resort fix (touches D-03 lock — document in SUMMARY).
  </action>
  <verify>
    <automated>jq -e '.dependencies["@anthropic-ai/claude-agent-sdk"]' packages/cds-core/package.json && test -f pnpm-lock.yaml && grep -q 'claude-agent-sdk' pnpm-lock.yaml && [ "$(jq -r '.dependencies | keys | length' package.json)" = "1" ] && jq -e '.dependencies.prompts' package.json && grep -q 'TRANSITIVE_RUNTIME_DEPS_BEGIN' NOTICES.md && awk '/TRANSITIVE_RUNTIME_DEPS_BEGIN/,/TRANSITIVE_RUNTIME_DEPS_END/' NOTICES.md | grep -qE '^- \`' && npm pack --dry-run 2>&1 | grep -q 'NOTICES.md'</automated>
  </verify>
  <acceptance_criteria>
    - `jq -r '.dependencies["@anthropic-ai/claude-agent-sdk"]' packages/cds-core/package.json` returns a semver starting with `^0.2` (or later if SDK advanced)
    - `test -f pnpm-lock.yaml` exits 0
    - `grep -q 'claude-agent-sdk' pnpm-lock.yaml` exits 0 (SDK is pinned in lockfile)
    - `jq -r '.dependencies | keys | length' package.json` returns `1` (D-03 preserved)
    - `jq -e '.dependencies.prompts' package.json` returns truthy (`prompts` still there)
    - `awk '/TRANSITIVE_RUNTIME_DEPS_BEGIN/,/TRANSITIVE_RUNTIME_DEPS_END/' NOTICES.md | grep -cE '^- \`'` returns ≥ 1 (at least one transitive dep listed; could be higher depending on SDK tree)
    - `npm pack --dry-run 2>&1 | grep -q 'NOTICES.md'` exits 0
    - `pnpm --filter @cds/core licenses list --prod --json` JSON keys do NOT contain `GPL-3.0`, `AGPL-3.0`, `SSPL-1.0`, `UNKNOWN`, or `UNLICENSED`
    - `pnpm audit --prod --audit-level high` for `@cds/core` reports 0 high/critical advisories (low/moderate accepted)
  </acceptance_criteria>
  <done>
  SDK installed into `@cds/core`. Lockfile updated with integrity hashes. No forbidden transitive licenses. NOTICES.md transitive section populated. Root `package.json` untouched. `npm pack --dry-run` confirms NOTICES.md ships in the tarball. Root single-dep constraint preserved.
  </done>
</task>

<task type="auto">
  <name>Task 4: Scaffold packages/cds-core/src/errors.ts with DispatchError and LicenseKeyError</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Common Pitfalls" (Pitfall 1 — LicenseKeyError for missing ANTHROPIC_API_KEY)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/errors.ts"
    - ./packages/cds-core/src/index.ts (Phase 33 stub — check it still exports CDS_CORE_VERSION before we add errors)
  </read_first>
  <files>
    - packages/cds-core/src/errors.ts (new)
  </files>
  <action>
  Create `packages/cds-core/src/errors.ts` with the `DispatchError` base class and `LicenseKeyError` subclass. Plans 02 and 04 will append `UnknownModelError` and any other subtypes to this same file (single source of truth for `@cds/core` error hierarchy).

  **File: `packages/cds-core/src/errors.ts`** (write exactly):

  ```typescript
  /**
   * Error hierarchy for @cds/core primitives.
   *
   * Base: DispatchError — anything the agent dispatcher surfaces.
   * Subtypes:
   *   - LicenseKeyError (this file) — missing/invalid ANTHROPIC_API_KEY at dispatch time.
   *   - UnknownModelError (added by Plan 04) — CostTracker cannot price a model.
   *
   * All consumer-facing errors extend DispatchError so callers can use a single
   * `catch (e) { if (e instanceof DispatchError) ... }` guard.
   */

  export class DispatchError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
      super(message);
      this.name = 'DispatchError';
    }
  }

  export class LicenseKeyError extends DispatchError {
    constructor(message = 'ANTHROPIC_API_KEY is not set or invalid. Set the environment variable before calling dispatchAgent().') {
      super(message);
      this.name = 'LicenseKeyError';
    }
  }

  // UnknownModelError is added by Plan 04 Task 3 — do NOT add here.
  // Plan 04 appends the subclass below this comment; keep this placeholder in place.
  ```

  **Concrete file content** — paste exactly. Do NOT alter indentation or add blank lines at EOF beyond a single trailing newline.

  After writing:
  - Compile-check: run `pnpm --filter @cds/core tsc --noEmit` (Phase 33 Plan 02 Task 2 should have wired this up). If tsconfig is not yet set for `@cds/core` individually, fall through — Plan 02 will exercise the compiler path. Minimum check here is: file parses as valid TS via `node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/errors.ts", "utf8"), { compilerOptions: { module: "NodeNext" } })'`.
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/errors.ts && grep -q 'export class DispatchError extends Error' packages/cds-core/src/errors.ts && grep -q 'export class LicenseKeyError extends DispatchError' packages/cds-core/src/errors.ts && grep -q 'Plan 04 Task 3' packages/cds-core/src/errors.ts && node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/errors.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022" } })'</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/errors.ts` exits 0
    - `grep -c 'export class DispatchError extends Error' packages/cds-core/src/errors.ts` returns `1`
    - `grep -c 'export class LicenseKeyError extends DispatchError' packages/cds-core/src/errors.ts` returns `1`
    - `grep -c 'ANTHROPIC_API_KEY' packages/cds-core/src/errors.ts` returns ≥ 1
    - `grep -c 'public readonly cause' packages/cds-core/src/errors.ts` returns `1` (ES2022 Error.cause pattern)
    - `grep -c "this\.name = 'DispatchError'" packages/cds-core/src/errors.ts` returns `1`
    - `grep -c "this\.name = 'LicenseKeyError'" packages/cds-core/src/errors.ts` returns `1`
    - `grep -c 'Plan 04 Task 3' packages/cds-core/src/errors.ts` returns `1` (placeholder comment for append-point)
    - TS transpile via `require("typescript").transpileModule` succeeds (file is valid TypeScript)
    - `wc -l packages/cds-core/src/errors.ts` returns a count ≥ 20
  </acceptance_criteria>
  <done>
  errors.ts exists with DispatchError base + LicenseKeyError subclass. Placeholder comment marks where Plan 04 Task 3 appends UnknownModelError. File is valid TypeScript and compiles under @cds/core's tsconfig (NodeNext/ES2022).
  </done>
</task>

<task type="auto">
  <name>Task 5: Append SDK-01 correction note to .planning/REQUIREMENTS.md per D-15</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"SDK License Policy" (D-15)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §".planning/REQUIREMENTS.md SDK-01 correction"
    - .planning/REQUIREMENTS.md (current state — find the SDK-01 bullet; do NOT modify other requirements)
  </read_first>
  <files>
    - .planning/REQUIREMENTS.md (modified in-place — append sub-bullet to SDK-01 only)
  </files>
  <action>
  Append a nested correction sub-bullet directly beneath the existing SDK-01 bullet in `.planning/REQUIREMENTS.md`. Do NOT rewrite the bullet body (matches Phase 33 D-11/D-12 correction precedent on MONO-03 — documentation trail preserved).

  **Steps:**

  1. Read the existing SDK-01 line (line 27 in current REQUIREMENTS.md as of phase start):
  ```
  - [ ] **SDK-01**: `@anthropic-ai/claude-agent-sdk` license verified (Apache-2.0 or MIT confirmed compatible with CDS distribution model). License compatibility documented in a new `NOTICES.md` at the repo root listing every runtime dependency and its license. SDK is added to `packages/cds-core/package.json` dependencies (NOT `prompts` — `prompts` stays single-dep for the CLI surface).
  ```

  2. Use the `Edit` tool (not sed) to change this exact line from:

  ```
  - [ ] **SDK-01**: `@anthropic-ai/claude-agent-sdk` license verified (Apache-2.0 or MIT confirmed compatible with CDS distribution model). License compatibility documented in a new `NOTICES.md` at the repo root listing every runtime dependency and its license. SDK is added to `packages/cds-core/package.json` dependencies (NOT `prompts` — `prompts` stays single-dep for the CLI surface).
  ```

  to (existing line + nested sub-bullet on the next line, 2-space indent):

  ```
  - [ ] **SDK-01**: `@anthropic-ai/claude-agent-sdk` license verified (Apache-2.0 or MIT confirmed compatible with CDS distribution model). License compatibility documented in a new `NOTICES.md` at the repo root listing every runtime dependency and its license. SDK is added to `packages/cds-core/package.json` dependencies (NOT `prompts` — `prompts` stays single-dep for the CLI surface).
    - **Correction note (Phase 34, 2026-04-16 per CONTEXT.md D-13/D-15):** The SDK is licensed under Anthropic Commercial Terms of Service, not Apache-2.0/MIT. Accepted as internal infrastructure dependency; `NOTICES.md` documents redistribution basis. Read as: "license confirmed compatible with CDS distribution model (Anthropic Commercial ToS for claude-agent-sdk, documented in NOTICES.md)".
  ```

  The only change is one new line appended immediately after the SDK-01 bullet.

  3. Verify the rest of REQUIREMENTS.md is byte-identical. Run a diff check:
  ```bash
  # Before and after this task, every other line in REQUIREMENTS.md must match.
  # This task's acceptance criterion greps for the correction note.
  ```

  **Important:** Do NOT touch any other requirement (SDK-02, CORE-01, CORE-02, MONO-0X, etc.). Do NOT reflow whitespace. The Edit tool's exact-string-match guarantees this.
  </action>
  <verify>
    <automated>grep -q 'Correction note (Phase 34' .planning/REQUIREMENTS.md && grep -q 'Anthropic Commercial Terms of Service' .planning/REQUIREMENTS.md && grep -q 'CONTEXT.md D-13/D-15' .planning/REQUIREMENTS.md && grep -cE '\*\*SDK-01\*\*' .planning/REQUIREMENTS.md | grep -qE '^1$' ; test $? -eq 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'Correction note (Phase 34' .planning/REQUIREMENTS.md` returns `1`
    - `grep -c 'Anthropic Commercial Terms of Service' .planning/REQUIREMENTS.md` returns ≥ 1
    - `grep -c 'CONTEXT.md D-13/D-15' .planning/REQUIREMENTS.md` returns `1`
    - `grep -cE '\*\*SDK-01\*\*' .planning/REQUIREMENTS.md` returns `1` (the ORIGINAL SDK-01 line is still the only top-level SDK-01 bullet — we added a nested bullet, not a replacement)
    - The original SDK-01 bullet body (the full paragraph starting with `` - [ ] **SDK-01**: `@anthropic-ai/ ``) is preserved byte-for-byte (grep the original phrase `Apache-2.0 or MIT confirmed compatible` returns `1` — the correction is ADDITIVE, not a rewrite)
    - `grep -c 'Read as:' .planning/REQUIREMENTS.md` returns `1` (the replaced phrasing is explicit)
    - Other requirements (SDK-02, CORE-01, CORE-02) lines are byte-identical to pre-task state (verify by spot-check: `grep -c '\*\*SDK-02\*\*' .planning/REQUIREMENTS.md` still returns `1`)
  </acceptance_criteria>
  <done>
  REQUIREMENTS.md SDK-01 carries a nested correction note per D-15. The original bullet body is preserved (documentation trail). Correction note references CONTEXT.md decision IDs and dates. No other requirements were touched.
  </done>
</task>

<task type="auto">
  <name>Task 6: Commit Plan 01 deliverables and write 34-01-SUMMARY.md</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md (check all Plan 01 verification rows are pending, ready to mark ✅ on commit)
    - ./CLAUDE.md §"Rules" (conventional commits; code/commits in English; no Co-Authored-By)
    - $HOME/.claude/get-shit-done/templates/summary.md (for SUMMARY.md shape)
  </read_first>
  <files>
    - .planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md (new)
  </files>
  <action>
  Stage and commit Plan 01's deliverables in one atomic commit, then write `34-01-SUMMARY.md` documenting what was shipped.

  **Commit ordering:** use `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit` if available — it handles conventional commits + phase metadata. Otherwise standard `git add` + `git commit` with the conventional message.

  **Staged files:**
  - `NOTICES.md` (new)
  - `packages/cds-core/package.json` (modified — adds dependencies)
  - `pnpm-lock.yaml` (modified — SDK + transitive resolutions)
  - `packages/cds-core/src/errors.ts` (new)
  - `.planning/REQUIREMENTS.md` (modified — appended correction note)
  - `.planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md` (new — this task writes it)

  **Do NOT stage:**
  - `/tmp/*` scratch files
  - `node_modules/` (gitignored)

  **Commit message (conventional, English, no Co-Authored-By per user memory `feedback_no_coauthor.md`):**
  ```
  feat(34-01): integrate claude-agent-sdk + NOTICES.md licensing disclosure

  Ships the licensing foundation for Phase 34:
  - @cds/core: add @anthropic-ai/claude-agent-sdk@^0.2.110 dependency
  - NOTICES.md (repo root, auto-included in npm pack): enumerate runtime
    deps incl. SDK under Anthropic Commercial ToS and every transitive dep
  - packages/cds-core/src/errors.ts: DispatchError base + LicenseKeyError
    (Plans 02/04 append UnknownModelError etc.)
  - REQUIREMENTS.md SDK-01: nested correction note per CONTEXT.md D-15
    (SDK is Commercial ToS, not Apache-2.0/MIT as originally drafted)

  License audit: pnpm licenses list --prod --filter @cds/core passes
  permitted-only check; no GPL/AGPL/SSPL/UNKNOWN in the tree. Root
  package.json single-runtime-dep constraint preserved (prompts only).

  Satisfies SDK-01. Prerequisite for Plans 02/03/04.
  ```

  **Write `34-01-SUMMARY.md`:**

  ```markdown
  # Plan 34-01 — SDK Dependency + NOTICES.md — Summary

  **Completed:** 2026-04-16 (TBD — fill with actual)
  **Requirement:** SDK-01
  **Commit:** {hash-fragment TBD — short SHA}

  ## What shipped

  - `NOTICES.md` at repo root — documents `@anthropic-ai/claude-agent-sdk`
    (Anthropic Commercial ToS), `prompts` (MIT), and every transitive runtime dep
    pulled via `@cds/core`. Includes a "License Compliance Policy" section listing
    permitted vs forbidden licenses.
  - `packages/cds-core/package.json` — now declares
    `"@anthropic-ai/claude-agent-sdk": "^0.2.110"` in `dependencies`.
  - `pnpm-lock.yaml` — regenerated with SDK + transitive integrity hashes.
  - `packages/cds-core/src/errors.ts` — new module with `DispatchError` base class
    + `LicenseKeyError` subclass. Placeholder comment marks where Plan 04 Task 3
    appends `UnknownModelError`.
  - `.planning/REQUIREMENTS.md` — nested correction sub-bullet appended to SDK-01
    (original bullet body preserved byte-for-byte per Phase 33 D-11/D-12 precedent).

  ## License audit results

  (Fill from `pnpm --filter @cds/core licenses list --prod --json`)
  - License buckets detected: TBD
  - Forbidden licenses (GPL/AGPL/SSPL/UNKNOWN): 0
  - Permitted licenses only: ✅

  ## Assumptions verified in execution

  - A4 (NOTICES.md auto-included in `npm pack`): ✅ verified via `npm pack --dry-run`.
  - A5 (SDK engines.node covers >=18): ✅ verified at Task 1.
  - A6 (`pnpm licenses list` detects transitive copyleft): ✅ exercised at Task 3.

  ## Any deviation from spec

  {TBD — should be zero; record any pivots here}

  ## Ready for downstream plans

  Plans 02 (agent-dispatcher), 03 (Context), 04 (CostTracker) can now import
  `DispatchError` / `LicenseKeyError` from `./errors.js` and rely on the SDK
  being present in `@cds/core`'s `dependencies`. Plan 04 Task 3 appends
  `UnknownModelError` to the same `errors.ts` file.
  ```

  Execute the commit AFTER the summary is written so both land in one commit.
  </action>
  <verify>
    <automated>git log -1 --pretty=%B | grep -q 'feat(34-01)' && git log -1 --pretty=%B | grep -q 'claude-agent-sdk' && git log -1 --pretty=%B | grep -q 'SDK-01' && git log -1 --pretty=%B | grep -qvi 'co-authored-by' && test -f .planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md && git show --stat HEAD | grep -q 'NOTICES.md' && git show --stat HEAD | grep -q 'packages/cds-core/src/errors.ts'</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --pretty=%B` starts with `feat(34-01):`
    - `git log -1 --pretty=%B | grep -q 'Co-Authored-By'` returns NON-ZERO (i.e., no Co-Authored-By line — per user memory `feedback_no_coauthor.md`)
    - `git log -1 --pretty=%B | grep -q 'SDK-01'` returns 0
    - `git show --stat HEAD` lists: `NOTICES.md`, `packages/cds-core/package.json`, `pnpm-lock.yaml`, `packages/cds-core/src/errors.ts`, `.planning/REQUIREMENTS.md`, `.planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md`
    - `test -f .planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md` exits 0
    - `grep -c '## What shipped' .planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md` returns `1`
    - `git status --porcelain` returns empty (working tree clean)
    - Current branch is `gsd/phase-34-sdk-integration-core-primitives` (verify via `git branch --show-current`)
  </acceptance_criteria>
  <done>
  All Plan 01 changes committed in one atomic `feat(34-01)` commit on branch `gsd/phase-34-sdk-integration-core-primitives`. SUMMARY.md documents what shipped + license audit results. Working tree clean. Ready for Plans 02/03/04 to branch off this commit.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry → `pnpm-lock.yaml` integrity hashes | SDK + transitive tarballs cross here on `pnpm install`. |
| User's ANTHROPIC_API_KEY env → SDK → api.anthropic.com | Not in scope for Plan 01 (Plan 02 owns this path); but Plan 01 scaffolds the `LicenseKeyError` thrown when the key is absent. |
| Anthropic Commercial ToS license text → NOTICES.md disclosure | Compliance boundary — wrong disclosure would misrepresent redistribution terms. |
| Root `package.json` single-dep lock (Phase 33 D-03) → CLI surface constraint | Protected — Plan 01 adds SDK only to `@cds/core`, not root. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-S1 | Spoofing | NOTICES.md license claim | mitigate | Task 2 wording references the Anthropic Commercial ToS URL verbatim; Task 1 captures the npm `license` field exactly (expected `SEE LICENSE IN LICENSE.md`) — any drift surfaces before Plan 01 commits. If Anthropic ever relicenses to MIT/Apache-2.0, Task 1's assertion that `license !== MIT && license !== Apache-2.0` will loudly fail, forcing a conscious update to CONTEXT.md D-13 + NOTICES.md. |
| T-34-L1 | Compliance / License | transitive runtime deps | mitigate | Task 3 runs `pnpm licenses list --prod --filter @cds/core` with a hard-fail on GPL/AGPL/SSPL/UNKNOWN. License buckets surfaced in NOTICES.md transitive block. Acceptance criterion blocks the commit if any forbidden license is detected. |
| T-34-S2 | Information Disclosure | NOTICES.md shipped in npm tarball | mitigate | npm's default `files` rules auto-include `NOTICES.md` (Assumption A4 VERIFIED via npm docs); Task 3 Step 7 smoke-tests via `npm pack --dry-run`. If ever untrue, `files` array is updated as a last-resort remediation (documented in SUMMARY). |
| T-34-T1 | Tampering / Supply chain | SDK + transitive tarballs | mitigate | `pnpm-lock.yaml` records exact integrity hashes; Task 3 commits the lockfile. `pnpm audit --prod --audit-level high` in acceptance runs a supply-chain CVE check and fails on HIGH/CRITICAL advisories. |
| T-34-R1 | Repudiation / Audit trail | REQUIREMENTS.md SDK-01 edit history | mitigate | Task 5 appends a nested sub-bullet with ISO date + decision IDs (D-13/D-15) rather than rewriting the original bullet body. The original wording stays in git blame forever; the correction is dated and attributed. Matches Phase 33 D-11/D-12 precedent. |
</threat_model>

<verification>
Phase-level checks for Plan 01 contribution to SDK-01:

1. `NOTICES.md` exists at repo root, lists SDK + Commercial ToS + `prompts` + transitive deps.
2. `npm pack --dry-run` output includes `NOTICES.md`.
3. `pnpm --filter @cds/core licenses list --prod --json` has no GPL/AGPL/SSPL/UNKNOWN keys.
4. `packages/cds-core/package.json` dependencies include `@anthropic-ai/claude-agent-sdk`.
5. Root `package.json` dependencies is still `{ "prompts": "^2.4.2" }` (single-dep lock preserved).
6. `packages/cds-core/src/errors.ts` exports `DispatchError` + `LicenseKeyError`.
7. `.planning/REQUIREMENTS.md` SDK-01 has a nested correction note referencing D-13/D-15.
8. One atomic `feat(34-01)` commit on `gsd/phase-34-sdk-integration-core-primitives`; no Co-Authored-By.
</verification>

<success_criteria>
SDK-01 satisfied: "`@anthropic-ai/claude-agent-sdk` license verified + NOTICES.md at repo root listing every runtime dep + license. SDK added to `packages/cds-core/package.json` (NOT `prompts` — prompts stays single-dep on CLI surface)." Plan 01 contributes the entirety of SDK-01. Plans 02/03/04 build on top but do not re-do any Plan 01 work.
</success_criteria>

<output>
After completion, `34-01-SUMMARY.md` (written during Task 6) documents:
- Files created (NOTICES.md, errors.ts, SUMMARY.md) and modified (packages/cds-core/package.json, pnpm-lock.yaml, .planning/REQUIREMENTS.md)
- License audit results (bucket counts from `pnpm licenses list`; confirmed 0 forbidden)
- Assumption verification status (A4/A5/A6)
- Any deviation from spec (should be zero)
- Green-light status for Plans 02 (agent-dispatcher), 03 (Context), 04 (CostTracker) to run in parallel Wave 1
</output>
