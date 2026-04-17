# Code Review — Phase 39+40

**Reviewed:** 2026-04-16
**Files:** 14 (10 production, 4 test)
**Depth:** standard

---

## Summary

| Severity | Count |
|----------|-------|
| Blocking | 1     |
| High     | 2     |
| Medium   | 2     |
| Low      | 2     |
| Total    | 7     |

One blocking bug prevents the published package from working at all: SQL migration files are not copied into the tsup bundle output, so the SQLite schema is never applied at runtime. All other findings are self-contained and do not compound.

---

## Findings

### [BLOCKING] SQL migration files absent from tsup bundle — DB schema never applied

- **File:** `tsup.config.ts` + `packages/cds-core/src/vault/internal/migrations/runner.ts:12`
- **Issue:** The migration runner resolves `MIGRATIONS_DIR` as `dirname(import.meta.url)` — which after tsup bundling resolves to `dist/core/` (location of the bundled `index.js`). The `.sql` files that define the database schema live in `packages/cds-core/src/vault/internal/migrations/` and are never copied to `dist/core/`. `pnpm tsup` (used in CI and publish) does not have an `onSuccess` or assets hook to do this. The existing `copy-migrations.mjs` copies to `packages/cds-core/dist/` (the sub-package tsc output), not to the root `dist/core/` that ships in the npm tarball.

  At runtime on a fresh install: `readdirSync(dist/core/)` finds only `index.js` — no `.sql` matches — `scanMigrations()` returns `[]` — `runPendingMigrations` exits early after creating `schema_version` but applying zero migrations. Any subsequent call that touches `sessions`, `entities`, or any other table throws `SqliteError: no such table: sessions`.

- **Impact:** Every feature that writes to or reads from the vault DB is broken after `npm install -g claude-dev-stack@alpha`. Session capture, analytics, migration command — all fail with an unrecoverable SQLite error. This is a publish-blocking regression.
- **Fix:** Add a root-level asset-copy step to `tsup.config.ts`:

  ```ts
  // tsup.config.ts
  import { cpSync, mkdirSync } from 'node:fs';

  export default defineConfig({
    // ...existing config...
    async onSuccess() {
      // Copy SQL migration files alongside the bundled runner.
      const SRC = path.join(__dirname, 'packages/cds-core/src/vault/internal/migrations');
      const DEST = path.join(__dirname, 'dist/core');
      mkdirSync(DEST, { recursive: true });
      cpSync(SRC, DEST, {
        recursive: true,
        filter: (src) => src.endsWith('.sql') || !src.includes('.'),
      });
      console.log('[tsup] SQL migrations copied to dist/core/');
    },
  });
  ```

  Alternatively, change `runner.ts` to embed the SQL at build time via `?raw` imports (esbuild supports this with a plugin), removing the runtime filesystem dependency entirely.

---

### [HIGH] `--max-cost` flag is parsed but never used — silent no-op misleads users

- **File:** `packages/cds-cli/src/quick.ts:11,21,25`
- **Issue:** `parseFlags` reads `--max-cost` and stores it in `opts.maxCost`. After that, `opts.maxCost` is never referenced. The flag is documented as a "soft cap in USD (warning only, not enforced)" but even the warning is absent. A user running `claude-dev-stack quick "..." --max-cost 0.05` gets zero feedback and no guard if the task costs $2.
- **Impact:** User trust issue and potential uncontrolled cost for long-running tasks. The discrepancy between documented behavior ("warning only") and actual behavior (completely ignored) is high confidence at 100%.
- **Fix:** After `tracker.total()` at line 85, add:

  ```ts
  if (opts.maxCost !== undefined && cost.cost_usd > opts.maxCost) {
    console.error(
      `\n  warning: task cost $${cost.cost_usd.toFixed(4)} exceeded --max-cost $${opts.maxCost.toFixed(4)}`,
    );
  }
  ```

---

### [HIGH] Smoke install test hardcodes package version — breaks on next version bump

- **File:** `.github/workflows/publish.yml:49-50`
- **Issue:** The smoke test step hardcodes the tarball filename and version string:
  ```yaml
  npm install -g ./claude-dev-stack-1.0.0-alpha.1.tgz
  claude-dev-stack --version | grep -q '1.0.0-alpha.1'
  ```
  When `package.json` is bumped to `1.0.0` (or any later prerelease), `npm pack` produces a different filename, `npm install -g` fails with `ENOENT`, and the entire publish pipeline is blocked silently — even for a correct build.

- **Impact:** The pipeline will fail on every release after this one, preventing any future publish.
- **Fix:**
  ```yaml
  - name: Smoke install test
    run: |
      VERSION=$(node -p "require('./package.json').version")
      TARBALL="claude-dev-stack-${VERSION}.tgz"
      npm pack
      npm install -g "./${TARBALL}"
      claude-dev-stack --version | grep -q "${VERSION}"
  ```

---

### [MEDIUM] `registerCaptureHook` writes `~/.claude/hooks/...` as a tilde literal — inconsistent with rest of hooks config and potentially fragile

- **File:** `lib/install/hooks.mjs:392`
- **Issue:** `registerCaptureHook` builds the hook command as:
  ```js
  command: '~/.claude/hooks/session-end-capture.sh'
  ```
  No `bash` prefix. The rest of the install path (`_writeSettingsFile` line 175) uses:
  ```js
  command: `bash ${endCaptureDest}`   // e.g. bash /Users/foo/.claude/hooks/session-end-capture.sh
  ```
  with a fully-resolved absolute path. Claude Code hooks are spawned by CC itself. Whether CC runs them through a shell (expanding `~`) or `execFile`-style (no tilde expansion) depends on CC internals. If CC uses `execFile`, the `~` literal is not expanded and the hook silently never fires. Additionally, `registerCaptureHook` is a "pure helper" that never writes to disk — it is exported but has no production caller (only used in tests). Any wizard re-installation flow that calls this function would mutate the in-memory object but never persist it.

- **Impact:** If called from a future caller, hook commands may silently fail due to tilde; and the settings change is never persisted.
- **Fix:** Use `homedir()` for the path and add `bash` prefix for consistency:
  ```js
  import { homedir } from 'node:os';
  // ...
  const captureEntry = {
    matcher: '*',
    hooks: [{
      type: 'command',
      command: `bash ${join(homedir(), '.claude', 'hooks', 'session-end-capture.sh')}`,
      timeout: 5,
    }],
  };
  ```
  Also: if this function is intended for production use, add a caller in the wizard that reads the settings file, calls `registerCaptureHook`, then writes the mutated object back to disk.

---

### [MEDIUM] `doctor --gsd-permissions` returns `exit 0` even when `setupGsdPermissions` throws (e.g., permission denied on `.claude/`)

- **File:** `lib/doctor.mjs:60-69`
- **Issue:** The `opts.gsdPermissions` branch calls `setupGsdPermissions(process.cwd())` without a try/catch:
  ```js
  if (opts.gsdPermissions) {
    const { setupGsdPermissions } = await import('./install/permission-config.mjs');
    const result = setupGsdPermissions(process.cwd());
    // ...
    return;
  }
  ```
  `setupGsdPermissions` calls `mkdirSync` and `writeFileSync` which throw `EACCES` if the user runs the command in a directory they don't own. The exception propagates to the top-level `run().catch(err => { console.error(...); process.exit(1) })` handler in `bin/cli.mjs`, which is correct for a crash but the error message is generic ("Error: EACCES: permission denied") with no guidance. More critically, partial writes (dir created, file not written) could leave settings in an inconsistent state.
- **Impact:** Poor UX on permission error; partial write risk if `mkdir` succeeds but `writeFile` fails (low probability given same directory, but possible with concurrent processes or revoked permissions between calls).
- **Fix:**
  ```js
  if (opts.gsdPermissions) {
    const { setupGsdPermissions } = await import('./install/permission-config.mjs');
    try {
      const result = setupGsdPermissions(process.cwd());
      // ...
    } catch (err) {
      fail(`Could not write GSD permissions: ${err.message}`);
      fail('Check that you have write access to .claude/ in the current directory');
      process.exit(1);
    }
    return;
  }
  ```

---

### [LOW] `resolveDistPath` silently swallows a malformed `subPath` with no separators

- **File:** `bin/cli.mjs:20-26`
- **Issue:** `resolveDistPath('cli/quick.js')` splits on `/`, takes the first segment as `pkg` and the rest as `file`. If called with a subPath that has no `/` (e.g., `resolveDistPath('quick.js')` — easy to do by mistake in a new case arm), `pkg = 'quick.js'` and `file = ''`. In dev mode this resolves to `packages/cds-quick.js/dist/` and in prod to `dist/quick.js/`, both of which don't exist. The error surfaces only when the dynamic import fails, with a cryptic `ERR_MODULE_NOT_FOUND`.
- **Impact:** Developer mistake in a future `case` arm produces a confusing error. Low severity because current callers are correct.
- **Fix:** Add a guard:
  ```js
  function resolveDistPath(subPath) {
    if (!subPath.includes('/')) {
      throw new Error(`resolveDistPath: subPath must include package prefix, got: "${subPath}"`);
    }
    // ...existing logic
  }
  ```

---

### [LOW] `capture-standalone.test.ts` writes real files to `homedir()` instead of `tempHome`

- **File:** `packages/cds-cli/src/capture-standalone.test.ts:27-55`
- **Issue:** `setupTempHome()` redirects `HOME` to a temp directory so `captureStandalone` writes to `tempHome.tempHome/.claude/...`. However, in the test at line 38, the expected path is constructed using `homedir()`:
  ```ts
  const expectedPath = path.join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
  ```
  If `homedir()` is called after `setupTempHome()` sets `HOME`, and if `homedir()` reads `HOME` dynamically (it does on Linux; on macOS it reads from `getpwuid` which does NOT observe `HOME`), then `homedir()` may return the real home directory while the file is written to the temp home. The test would then check for the file in the wrong location and false-positive if the file happens to exist from a previous test run.

  On macOS (the primary dev platform per `darwin` env), `os.homedir()` ignores `HOME` env var. This means `captureStandalone` itself would write to the real `~/.claude/` rather than the temp dir, polluting the developer's filesystem.

- **Impact:** Test pollution of real `~/.claude/projects/` on macOS. Tests may leave stale JSONL files in the real home directory.
- **Fix:** In `temp-home.ts`, verify that `homedir()` is also mocked (not just `HOME` env var), or use `process.env.HOME` consistently throughout `captureStandalone.ts` instead of `homedir()`, and update the test assertion to use the same env var:
  ```ts
  const expectedPath = path.join(process.env.HOME!, '.claude', 'projects', slug, `${sessionId}.jsonl`);
  ```

---

## Verdict

**BLOCK**

The SQL migration files missing from the tsup bundle (BLOCKING finding) makes the published package non-functional for any vault operation. This must be resolved before publishing `1.0.0-alpha.1`. The two HIGH findings (dead `--max-cost` flag, hardcoded smoke-test version) should also be fixed before publish. Remaining findings are forward-looking.

**Required before publish:**
1. Fix SQL migration asset copy in tsup build
2. Fix smoke test version hardcode in publish.yml

**Recommended before publish:**
3. Implement `--max-cost` warning in `quick.ts`
