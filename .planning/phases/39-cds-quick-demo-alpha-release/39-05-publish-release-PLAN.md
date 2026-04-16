---
plan_id: 39-05-publish-release
phase: 39
plan: 05
type: execute
wave: 4
depends_on: ["01", "02", "03", "04"]
files_modified:
  - .github/workflows/publish.yml
  - docs/release-notes-template.md
  - tests/publish-workflow.test.mjs
  - tests/release-notes-template.test.mjs
autonomous: true
requirements:
  - RELEASE-01
user_setup:
  - "Human creates GitHub release manually: tag v1.0.0-alpha.1, MUST check 'Set as a pre-release' checkbox before publishing. Workflow fires on release:published."
must_haves:
  truths:
    - "`.github/workflows/publish.yml` replaced in-place with full Phase 39 pipeline: checkout + pnpm setup + Node 22 + install --frozen-lockfile + tsup build + pnpm test + tarball-size assertion + smoke install + prerelease detection + npm publish"
    - "Workflow preserves `id-token: write` + `contents: read` permissions for OIDC Trusted Publishing"
    - "Prerelease detection step sets `tag=alpha` when `github.event.release.prerelease == 'true'`, else `tag=latest`"
    - "Publish step uses `npm publish --tag ${{ steps.meta.outputs.tag }} --access public --provenance`"
    - "Tarball-size assertion fails the job if tarball > 5_242_880 bytes"
    - "Smoke install step: `npm pack && npm install -g ./claude-dev-stack-1.0.0-alpha.1.tgz && claude-dev-stack --version | grep -q '1.0.0-alpha.1'`"
    - "`docs/release-notes-template.md` contains the D-123 Markdown template with highlights + breaking changes + alpha caveats + changelog link"
    - "`tests/publish-workflow.test.mjs` asserts YAML structure: permissions, prerelease step, publish step flags, preflight steps in correct order"
    - "`tests/release-notes-template.test.mjs` asserts template file exists + has required sections"
  artifacts:
    - path: ".github/workflows/publish.yml"
      provides: "Publish pipeline with prerelease-aware dist-tag + preflight + smoke install"
      contains: "github.event.release.prerelease"
      min_lines: 45
    - path: "docs/release-notes-template.md"
      provides: "D-123 release notes template for manual GitHub release drafting"
      contains: "1.0.0-alpha.1"
      min_lines: 25
    - path: "tests/publish-workflow.test.mjs"
      provides: "YAML parse + structural checks on publish.yml"
      contains: "prerelease"
    - path: "tests/release-notes-template.test.mjs"
      provides: "Structural checks on release-notes-template.md"
      contains: "release-notes"
  key_links:
    - from: ".github/workflows/publish.yml prerelease-detection step"
      to: ".github/workflows/publish.yml publish step"
      via: "steps.meta.outputs.tag output"
      pattern: "steps.meta.outputs.tag"
    - from: ".github/workflows/publish.yml"
      to: "package.json version field (1.0.0-alpha.1)"
      via: "smoke install grep asserts literal version string"
      pattern: "1.0.0-alpha.1"
    - from: "docs/release-notes-template.md"
      to: "docs/migration-v0-to-v1-alpha.md"
      via: "markdown link in Breaking Changes section"
      pattern: "migration-v0-to-v1-alpha"
    - from: "docs/release-notes-template.md"
      to: "CHANGELOG.md"
      via: "markdown link at bottom"
      pattern: "CHANGELOG"
---

<objective>
Finalize the RELEASE-01 pipeline: replace `.github/workflows/publish.yml` with the full Phase 39 prerelease-aware pipeline (D-124 + D-125), add the manual release-notes template (D-123), and lock both in with YAML-structural + content tests.

Purpose: satisfy RELEASE-01 end-to-end — GitHub release creation auto-publishes under correct dist-tag with OIDC + provenance + smoke-install + size-budget enforcement.

Output: replaced publish.yml + new release-notes-template.md + 2 test files. This is the FINAL plan of the FINAL phase of v1.0 milestone.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md
@./.github/workflows/publish.yml

<interfaces>
Existing `.github/workflows/publish.yml` (pre-phase-39):
```yaml
name: Publish to npm
on:
  release:
    types: [published]
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - run: npm ci
      - run: npm test
      - name: Publish with OIDC trusted publishing
        run: npm publish --access public --provenance
```

Phase 39 replaces the job body entirely (preserves name + triggers + permissions) with:
1. Setup pnpm + Node 22 (matches packages engines; Node 24 unnecessary)
2. `pnpm install --frozen-lockfile`
3. `pnpm tsup` (produces dist/)
4. `pnpm test`
5. Tarball size assertion via pnpm pack --json
6. Smoke install: npm pack + npm install -g + version grep
7. Prerelease detection: github.event.release.prerelease -> tag=alpha|latest
8. npm publish --tag ${tag} --access public --provenance

Test strategy:
- `tests/publish-workflow.test.mjs` parses publish.yml as YAML (via js-yaml if available, else regex fallback) and asserts required steps in correct order.
- No execution of the actual workflow (GitHub Actions only runs in CI); shape-only verification.

Release notes template (manual drafting):
- Located at `docs/release-notes-template.md`
- Maintainer copies into the GitHub release UI when creating the tag
- Static text; no workflow substitution
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace .github/workflows/publish.yml</name>
  <read_first>
    - ./.github/workflows/publish.yml (current — v0.12-era)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §".github/workflows/publish.yml"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-124, D-125"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 3
  </read_first>
  <files>
    - .github/workflows/publish.yml (replaced in-place)
  </files>
  <action>
  REPLACE `.github/workflows/publish.yml` with EXACTLY the following content:

  ```yaml
  name: Publish to npm

  on:
    release:
      types: [published]

  permissions:
    id-token: write
    contents: read

  jobs:
    publish:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5

        - uses: pnpm/action-setup@v4
          with:
            version: 10

        - uses: actions/setup-node@v5
          with:
            node-version: 22
            registry-url: 'https://registry.npmjs.org'
            cache: 'pnpm'

        - name: Install deps (frozen lockfile)
          run: pnpm install --frozen-lockfile

        - name: Build bundles via tsup
          run: pnpm tsup

        - name: Run tests (all packages + root)
          run: pnpm test

        - name: Assert tarball size < 5 MB
          run: |
            pnpm pack --json > /tmp/pack.json
            SIZE=$(node -e 'const d=require("/tmp/pack.json");console.log(d[0].size)')
            if [ "$SIZE" -gt 5242880 ]; then
              echo "::error::Tarball $SIZE bytes exceeds 5 MB budget"
              exit 1
            fi
            echo "Tarball size OK: $SIZE bytes"

        - name: Smoke install test
          run: |
            npm pack
            npm install -g ./claude-dev-stack-1.0.0-alpha.1.tgz
            claude-dev-stack --version | grep -q '1.0.0-alpha.1'

        - name: Detect dist-tag (prerelease -> alpha, stable -> latest)
          id: meta
          run: |
            if [ "${{ github.event.release.prerelease }}" = "true" ]; then
              echo "tag=alpha" >> "$GITHUB_OUTPUT"
            else
              echo "tag=latest" >> "$GITHUB_OUTPUT"
            fi

        - name: Publish with OIDC + provenance
          run: npm publish --tag ${{ steps.meta.outputs.tag }} --access public --provenance
  ```

  Key details:
  - `actions/checkout@v5` preserved
  - `pnpm/action-setup@v4` added (Phase 33 baseline uses pnpm 10)
  - Node 22 (not 24 — tighter to packages engines.node >=20)
  - `registry-url` set so `npm publish` resolves correctly
  - `cache: 'pnpm'` speeds up subsequent runs
  - Smoke install asserts literal version `1.0.0-alpha.1` — will fail when bumping to `alpha.2`, forcing a workflow update (intentional safety net)
  - OIDC permissions + `--provenance` flag preserved (RELEASE-01 trust chain)

  DO NOT use `actions/setup-node@v4` — must be v5 for OIDC npm publish support in 2026.
  </action>
  <verify>
    <automated>test -f .github/workflows/publish.yml && grep -q "github.event.release.prerelease" .github/workflows/publish.yml && grep -q "echo \"tag=alpha\"" .github/workflows/publish.yml && grep -q "echo \"tag=latest\"" .github/workflows/publish.yml && grep -q "npm publish --tag" .github/workflows/publish.yml && grep -q -- "--provenance" .github/workflows/publish.yml && grep -q "id-token: write" .github/workflows/publish.yml && grep -q "pnpm tsup" .github/workflows/publish.yml && grep -q "Assert tarball size" .github/workflows/publish.yml && grep -q "Smoke install" .github/workflows/publish.yml && grep -q "1.0.0-alpha.1" .github/workflows/publish.yml</automated>
  </verify>
  <acceptance_criteria>
    - `test -f .github/workflows/publish.yml` -> exits 0
    - `grep -c "github.event.release.prerelease" .github/workflows/publish.yml` -> 1
    - `grep -c "echo \"tag=alpha\"" .github/workflows/publish.yml` -> 1
    - `grep -c "echo \"tag=latest\"" .github/workflows/publish.yml` -> 1
    - `grep -c "npm publish --tag" .github/workflows/publish.yml` -> 1
    - `grep -c -- "--provenance" .github/workflows/publish.yml` -> 1
    - `grep -c "id-token: write" .github/workflows/publish.yml` -> 1
    - `grep -c "pnpm tsup" .github/workflows/publish.yml` -> 1
    - `grep -c "pnpm test" .github/workflows/publish.yml` -> 1
    - `grep -c "Assert tarball size" .github/workflows/publish.yml` -> 1
    - `grep -c "Smoke install" .github/workflows/publish.yml` -> 1
    - `grep -c "1.0.0-alpha.1" .github/workflows/publish.yml` -> 1
    - `grep -c "node-version: 22" .github/workflows/publish.yml` -> 1
    - `grep -c "pnpm/action-setup@v4" .github/workflows/publish.yml` -> 1
    - `grep -c "actions/checkout@v5" .github/workflows/publish.yml` -> 1
    - `grep -c "actions/setup-node@v5" .github/workflows/publish.yml` -> 1
    - YAML valid: `node -e 'const y=require("fs").readFileSync(".github/workflows/publish.yml","utf8"); if(y.split("\n").filter(l=>/^\s*-/.test(l)).length<8)process.exit(1)'` (sanity: at least 8 steps/list items)
  </acceptance_criteria>
  <done>
  publish.yml replaced with full Phase 39 pipeline. Prerelease detection, OIDC, provenance, preflight, smoke install all in place.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create docs/release-notes-template.md</name>
  <read_first>
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-123"
  </read_first>
  <files>
    - docs/release-notes-template.md (new)
  </files>
  <action>
  Create `docs/release-notes-template.md` with EXACTLY:

  ```markdown
  # Release Notes Template — claude-dev-stack 1.0.0-alpha.1

  > This is the manual-draft template for the GitHub release body when creating
  > `v1.0.0-alpha.1` (and by extension future `-alpha.N`, `-beta.N` prereleases).
  >
  > **IMPORTANT:** When creating the GitHub release, you MUST check the
  > "Set as a pre-release" checkbox. The `publish.yml` workflow uses
  > `github.event.release.prerelease` to decide between `--tag alpha` and
  > `--tag latest`. Missing the checkbox will publish the alpha as `latest` and
  > clobber v0.12.x users on the `@latest` dist-tag.

  ---

  # claude-dev-stack 1.0.0-alpha.1

  First alpha of v1.0 — "CDS-Core Independence."

  > **This is a prerelease.** `npm install claude-dev-stack@latest` still installs the
  > stable v0.12.x branch.
  > To install this alpha: `npm install claude-dev-stack@alpha`

  ## Highlights

  - pnpm monorepo with `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`
  - Claude Agent SDK integration via `dispatchAgent` — replaces the v0.12 `claude -p` subprocess
  - Tiered vault: SQLite Tier 2 session memory with FTS5 search
  - Auto session capture — `/end` no longer required for routine sessions
  - MCP adapter exposing `sessions.*`, `docs.search`, `planning.status` to Claude Code
  - Backfill: `claude-dev-stack migrate sessions` ports historical markdown sessions to SQLite
  - `/cds-quick "<task>"` Claude Code skill + CLI subcommand — one-shot agent dispatch with cost

  ## Breaking Changes

  Node 20+ required. Full details in the
  [migration guide](./docs/migration-v0-to-v1-alpha.md).

  Summary:
  - Node 18 -> Node 20+ (Node 18 EOL + `better-sqlite3` 12.x N-API 9 requirement)
  - Stop hook `session-end-check.sh` -> `session-end-capture.sh` (wizard prompts for migration)
  - `/end` skill is fallback-only (auto-capture is the canonical session writer now)
  - Root `package.json` adds 3 runtime deps: `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`,
    `@modelcontextprotocol/sdk` (single-dep constraint relaxed for v1.0)
  - `"files"` array ships `dist/` (bundled output); `packages/` is not distributed

  ## Alpha Caveats

  - **Auto-capture is canonical.** Manual `/end` remains as a fallback when auto-capture fails.
  - **MCP tools are new.** `sessions.search`, `sessions.timeline`, `sessions.get_observations`,
    `docs.search`, `planning.status` — filing issues at
    [github.com/Enakoneschniy/claude-dev-stack/issues](https://github.com/Enakoneschniy/claude-dev-stack/issues)
    is appreciated.
  - **Migration cost.** `claude-dev-stack migrate sessions --dry-run` estimates Haiku cost
    (~$0.01 per session) before you commit to `--apply`. Always dry-run first.
  - **Platform coverage.** macOS (arm64/x64), Linux (x64), Windows (x64) on Node 20/22.
    Windows user testing is thin — reports welcome.

  ## Full Changelog

  See [CHANGELOG.md](./CHANGELOG.md#100-alpha1) for the full list of Added / Changed / Deprecated /
  Removed / Security changes.

  ---

  **Feedback:** open issues at
  [github.com/Enakoneschniy/claude-dev-stack/issues](https://github.com/Enakoneschniy/claude-dev-stack/issues)
  or reach out in the relevant channels. Alpha feedback directly shapes the 1.0.0 GA.
  ```
  </action>
  <verify>
    <automated>test -f docs/release-notes-template.md && grep -q "1.0.0-alpha.1" docs/release-notes-template.md && grep -q "Set as a pre-release" docs/release-notes-template.md && grep -q "migration-v0-to-v1-alpha" docs/release-notes-template.md && grep -q "CHANGELOG" docs/release-notes-template.md && grep -q "@alpha" docs/release-notes-template.md && grep -q "@latest" docs/release-notes-template.md && grep -q "Alpha Caveats" docs/release-notes-template.md</automated>
  </verify>
  <acceptance_criteria>
    - `test -f docs/release-notes-template.md` -> exits 0
    - `grep -c "1.0.0-alpha.1" docs/release-notes-template.md` -> >= 2
    - `grep -c "Set as a pre-release" docs/release-notes-template.md` -> 1
    - `grep -c "migration-v0-to-v1-alpha" docs/release-notes-template.md` -> 1
    - `grep -c "CHANGELOG" docs/release-notes-template.md` -> >= 1
    - `grep -c "@alpha" docs/release-notes-template.md` -> 1
    - `grep -c "@latest" docs/release-notes-template.md` -> 1
    - `grep -c "Alpha Caveats" docs/release-notes-template.md` -> 1
    - `grep -c "Highlights" docs/release-notes-template.md` -> 1
    - `grep -c "Breaking Changes" docs/release-notes-template.md` -> 1
    - `wc -l docs/release-notes-template.md | awk '{print $1}'` -> >= 25
  </acceptance_criteria>
  <done>
  Release notes template exists with instructions for pre-release checkbox + highlights + breaking changes + alpha caveats + changelog link.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create tests/publish-workflow.test.mjs</name>
  <read_first>
    - ./.github/workflows/publish.yml (replaced in Task 1)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-05-01..04
  </read_first>
  <files>
    - tests/publish-workflow.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/publish-workflow.test.mjs
  // Structural assertions on .github/workflows/publish.yml.
  // Source: Phase 39 VALIDATION §Task 39-05-01..04
  import { describe, it, expect } from 'vitest';
  import { readFileSync, existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'publish.yml');

  describe('.github/workflows/publish.yml', () => {
    it('file exists', () => {
      expect(existsSync(workflowPath)).toBe(true);
    });

    const content = existsSync(workflowPath) ? readFileSync(workflowPath, 'utf8') : '';

    describe('triggers + permissions', () => {
      it('triggers on release:published', () => {
        expect(content).toMatch(/on:\s*\n\s*release:\s*\n\s*types:\s*\[published\]/);
      });

      it('oidc: preserves id-token: write + contents: read', () => {
        expect(content).toMatch(/id-token:\s*write/);
        expect(content).toMatch(/contents:\s*read/);
      });
    });

    describe('setup', () => {
      it('uses actions/checkout@v5', () => {
        expect(content).toMatch(/actions\/checkout@v5/);
      });

      it('uses pnpm/action-setup@v4 with version: 10', () => {
        expect(content).toMatch(/pnpm\/action-setup@v4/);
        expect(content).toMatch(/version:\s*10/);
      });

      it('uses actions/setup-node@v5 with Node 22', () => {
        expect(content).toMatch(/actions\/setup-node@v5/);
        expect(content).toMatch(/node-version:\s*22/);
      });

      it('registry-url is set for npm publish', () => {
        expect(content).toMatch(/registry-url:\s*'https:\/\/registry\.npmjs\.org'/);
      });
    });

    describe('preflight steps', () => {
      it('runs pnpm install --frozen-lockfile', () => {
        expect(content).toMatch(/pnpm install --frozen-lockfile/);
      });

      it('runs pnpm tsup', () => {
        expect(content).toMatch(/pnpm tsup/);
      });

      it('runs pnpm test', () => {
        expect(content).toMatch(/pnpm test/);
      });

      it('has tarball size assertion with 5 MB budget', () => {
        expect(content).toMatch(/pnpm pack --json/);
        expect(content).toMatch(/5242880/);
      });

      it('has smoke install step asserting version 1.0.0-alpha.1', () => {
        expect(content).toMatch(/npm pack/);
        expect(content).toMatch(/npm install -g \.\/claude-dev-stack-1\.0\.0-alpha\.1\.tgz/);
        expect(content).toMatch(/claude-dev-stack --version/);
        expect(content).toMatch(/1\.0\.0-alpha\.1/);
      });
    });

    describe('prerelease detection', () => {
      it('has a step with id: meta', () => {
        expect(content).toMatch(/id:\s*meta/);
      });

      it('reads github.event.release.prerelease', () => {
        expect(content).toMatch(/github\.event\.release\.prerelease/);
      });

      it('sets tag=alpha for prerelease, tag=latest otherwise', () => {
        expect(content).toMatch(/echo "tag=alpha"/);
        expect(content).toMatch(/echo "tag=latest"/);
        expect(content).toMatch(/"\$GITHUB_OUTPUT"/);
      });
    });

    describe('publish step', () => {
      it('uses npm publish with --tag ${{ steps.meta.outputs.tag }}', () => {
        expect(content).toMatch(/npm publish --tag \$\{\{\s*steps\.meta\.outputs\.tag\s*\}\}/);
      });

      it('uses --access public', () => {
        expect(content).toMatch(/--access public/);
      });

      it('uses --provenance', () => {
        expect(content).toMatch(/--provenance/);
      });
    });

    describe('step ordering', () => {
      it('preflight steps come BEFORE prerelease detection which comes BEFORE publish', () => {
        const installIdx = content.indexOf('pnpm install --frozen-lockfile');
        const tsupIdx = content.indexOf('pnpm tsup');
        const testIdx = content.indexOf('pnpm test');
        const packSizeIdx = content.indexOf('Assert tarball size');
        const smokeIdx = content.indexOf('Smoke install');
        const detectIdx = content.indexOf('Detect dist-tag');
        const publishIdx = content.indexOf('npm publish --tag');

        expect(installIdx).toBeGreaterThan(0);
        expect(tsupIdx).toBeGreaterThan(installIdx);
        expect(testIdx).toBeGreaterThan(tsupIdx);
        expect(packSizeIdx).toBeGreaterThan(testIdx);
        expect(smokeIdx).toBeGreaterThan(packSizeIdx);
        expect(detectIdx).toBeGreaterThan(smokeIdx);
        expect(publishIdx).toBeGreaterThan(detectIdx);
      });
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/publish-workflow.test.mjs && pnpm -w vitest run --project root tests/publish-workflow.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/publish-workflow.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/publish-workflow.test.mjs` -> exits 0 + all tests pass (~18 tests)
  </acceptance_criteria>
  <done>
  publish.yml structure validated: triggers, OIDC, setup, preflight, prerelease detection, publish flags, step ordering.
  </done>
</task>

<task type="auto">
  <name>Task 4: Create tests/release-notes-template.test.mjs</name>
  <read_first>
    - ./docs/release-notes-template.md (created in Task 2)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-05-05
  </read_first>
  <files>
    - tests/release-notes-template.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/release-notes-template.test.mjs
  // Structural assertions on docs/release-notes-template.md.
  // Source: Phase 39 VALIDATION §Task 39-05-05
  import { describe, it, expect } from 'vitest';
  import { readFileSync, existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const templatePath = path.join(__dirname, '..', 'docs', 'release-notes-template.md');

  describe('docs/release-notes-template.md', () => {
    it('file exists', () => {
      expect(existsSync(templatePath)).toBe(true);
    });

    const content = existsSync(templatePath) ? readFileSync(templatePath, 'utf8') : '';

    it('warns about the pre-release checkbox', () => {
      expect(content).toMatch(/Set as a pre-release/);
    });

    it('has 1.0.0-alpha.1 version reference', () => {
      expect(content).toMatch(/1\.0\.0-alpha\.1/);
    });

    it('has @alpha and @latest references explaining the distinction', () => {
      expect(content).toMatch(/@alpha/);
      expect(content).toMatch(/@latest/);
    });

    it('has top-level "Highlights" section', () => {
      expect(content).toMatch(/^## Highlights/m);
    });

    it('has top-level "Breaking Changes" section linking to migration guide', () => {
      expect(content).toMatch(/^## Breaking Changes/m);
      expect(content).toMatch(/migration-v0-to-v1-alpha/);
    });

    it('has top-level "Alpha Caveats" section', () => {
      expect(content).toMatch(/^## Alpha Caveats/m);
    });

    it('has "Full Changelog" section linking CHANGELOG.md', () => {
      expect(content).toMatch(/Full Changelog/);
      expect(content).toMatch(/CHANGELOG\.md/);
    });

    it('mentions feedback channel / GitHub issues', () => {
      expect(content).toMatch(/github\.com\/Enakoneschniy\/claude-dev-stack\/issues/);
    });

    it('explains auto-capture canonical / /end fallback', () => {
      expect(content).toMatch(/auto-capture/i);
      expect(content).toMatch(/\/end/);
      expect(content).toMatch(/fallback/i);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/release-notes-template.test.mjs && pnpm -w vitest run --project root tests/release-notes-template.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/release-notes-template.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/release-notes-template.test.mjs` -> exits 0 + all 10 tests pass
  </acceptance_criteria>
  <done>
  Release notes template tests validate the D-123 shape.
  </done>
</task>

<task type="auto">
  <name>Task 5: Full-phase regression — all Plan 01..05 tests pass</name>
  <read_first>
    - All 4 prior plan files
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §entire file
  </read_first>
  <files>
    - (none — verification task)
  </files>
  <action>
  Run the complete Phase 39 test suite to confirm no regressions were introduced by Plan 05:

  ```sh
  pnpm install --frozen-lockfile
  pnpm typecheck                                                    # tsc --build, all packages
  pnpm tsup                                                         # rebuild dist/
  pnpm --filter @cds/cli vitest run                                 # Plan 02 tests
  pnpm -w vitest run --project root tests/tsup-config.test.mjs      # Plan 01
  pnpm -w vitest run --project root tests/tsup-build.test.mjs       # Plan 01 (runs tsup again)
  pnpm -w vitest run --project root tests/version-bump.test.mjs     # Plan 01
  pnpm -w vitest run --project root tests/pack-files-array.test.mjs # Plan 01
  pnpm -w vitest run --project root tests/cli-dispatch.test.mjs     # Plan 01
  pnpm -w vitest run --project root tests/node-version-scan.test.mjs # Plan 01
  pnpm -w vitest run --project root tests/pack-size.test.mjs        # Plan 01 (now passes — Plan 03 SKILL.md exists)
  pnpm -w vitest run --project root tests/skill-cds-quick.test.mjs  # Plan 03
  pnpm -w vitest run --project root tests/migration-guide.test.mjs  # Plan 04
  pnpm -w vitest run --project root tests/changelog.test.mjs        # Plan 04
  pnpm -w vitest run --project root tests/install-node-check.test.mjs # Plan 04
  pnpm -w vitest run --project root tests/install-hook-migration.test.mjs # Plan 04
  pnpm -w vitest run --project root tests/publish-workflow.test.mjs # Plan 05
  pnpm -w vitest run --project root tests/release-notes-template.test.mjs # Plan 05

  pnpm pack --dry-run                                               # final tarball sanity
  ```

  Run `pnpm test` as a final all-in-one sweep. This invokes vitest across all configured projects (packages + root) and MUST be green.

  Verify tarball contents one last time:
  ```sh
  pnpm pack --json > /tmp/final-pack.json
  node -e 'const d=require("/tmp/final-pack.json")[0];
    const files = d.files.map(f => f.path);
    if (!files.includes("dist/cli/quick.js")) throw new Error("missing dist/cli/quick.js");
    if (!files.includes("skills/cds-quick/SKILL.md")) throw new Error("missing SKILL.md");
    if (!files.includes("hooks/session-end-capture.sh")) throw new Error("missing capture hook wrapper");
    if (!files.includes("CHANGELOG.md")) throw new Error("missing CHANGELOG.md");
    if (files.some(f => f.startsWith("packages/"))) throw new Error("packages/ in tarball");
    if (files.some(f => f.startsWith(".planning/"))) throw new Error(".planning/ in tarball");
    console.log(`OK — ${files.length} files, ${d.size} bytes (${(d.size/1024).toFixed(1)} KB)`);
  '
  ```

  If any test fails, fix the specific artifact (not the test), re-run the suite, commit the fix. If the tarball-content assertion fails, inspect which of Plans 01/03/04 missed a dependency.
  </action>
  <verify>
    <automated>pnpm install --frozen-lockfile && pnpm typecheck 2>&1 | tail -3 && pnpm tsup 2>&1 | tail -3 && pnpm test 2>&1 | tail -10 && pnpm pack --dry-run 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm install --frozen-lockfile` -> exits 0
    - `pnpm typecheck` -> exits 0
    - `pnpm tsup` -> exits 0
    - `pnpm test` -> exits 0 (all packages + root suites green)
    - `pnpm pack --dry-run` -> exits 0 and reports tarball size < 5 MB
    - Tarball contents include: `dist/cli/quick.js`, `skills/cds-quick/SKILL.md`, `hooks/session-end-capture.sh`, `CHANGELOG.md`
    - Tarball contents EXCLUDE: `packages/`, `.planning/`, `tests/`
  </acceptance_criteria>
  <done>
  All 5 plans' tests pass. Tarball is well-formed, size-budget compliant, contains all expected files, excludes source + dev artifacts. Phase 39 is READY FOR RELEASE.
  </done>
</task>

</tasks>

<verification>
Before marking this plan AND this phase complete, executor MUST:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm tsup
pnpm test                                              # ALL suites — packages + root
pnpm pack --dry-run                                    # must report size < 5 MB
```

Plus spot verification:
- `cat .github/workflows/publish.yml` — visually confirm all 8+ steps present
- `cat docs/release-notes-template.md` — visually confirm readable

After Plan 05 completes:
1. Phase 39 is DONE.
2. User creates GitHub release manually: tag `v1.0.0-alpha.1`, CHECK pre-release checkbox.
3. Workflow fires, runs preflight, publishes under `@alpha`.
4. Post-publish manual smoke: `npm info claude-dev-stack@alpha version` should return `1.0.0-alpha.1`.
5. Post-publish manual smoke: `npm info claude-dev-stack@latest version` should still return `0.12.x` (UNCHANGED — critical).

This is the FINAL phase of v1.0 milestone. After merging, Phase 39 SUMMARY.md is created and the v1.0 alpha is SHIPPED.
</verification>
