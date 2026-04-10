# Testing Patterns

**Analysis Date:** 2026-04-10

## Test Framework

**Runner:**
- `node:test` (built-in Node.js test module)
- Config: none (tests run directly with `node --test`)
- Version: Node 18+ (per package.json engines)

**Assertion Library:**
- `node:assert/strict` (built-in)
- Strict equality and error checking

**Run Commands:**
```bash
npm test              # Run all tests in tests/*.test.mjs
node --test tests/*.test.mjs  # Direct invocation
```

**Test Output:**
- Formats: TAP (Test Anything Protocol)
- Last run: 54 passing tests, 0 failures

## Test File Organization

**Location:**
- Separate `tests/` directory (not co-located with source)
- Pattern: `tests/{module}.test.mjs`

**Test Files:**
- `tests/cli.test.mjs` — CLI help, version, subcommands
- `tests/hooks.test.mjs` — Bash hook validation
- `tests/shared.test.mjs` — Utility functions from `lib/shared.mjs`
- `tests/skills.test.mjs` — Skills module and catalog
- `tests/templates.test.mjs` — Vault templates
- `tests/project-setup.test.mjs` — Project setup functions

**Naming Convention:**
- `*.test.mjs` suffix
- Descriptive module names matching `lib/{name}.mjs`

## Test Structure

**Basic Suite Pattern:**
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('module name', () => {
  describe('sub-feature', () => {
    it('specific behavior', () => {
      // arrange
      const result = functionUnderTest();
      // assert
      assert.ok(result);
      assert.equal(result, expected);
    });
  });
});
```

**Nested describes:**
- Tests organized hierarchically: `describe('feature') { describe('sub') { it(...) } }`
- Example from `shared.test.mjs`:
  ```javascript
  describe('shared utilities', () => {
    describe('colors', () => { ... });
    describe('runCmd', () => { ... });
  });
  ```

## Test Lifecycle Hooks

**Setup/Teardown:**
```javascript
import { describe, it, before, after } from 'node:test';

describe('setupAllProjects', () => {
  const tmpBase = join(tmpdir(), `claude-test-setup-${process.pid}`);

  before(() => {
    // Fresh sandbox
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    mkdirSync(vaultPath, { recursive: true });
  });

  after(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
  });

  it('test case', () => { ... });
});
```

**Common Pattern:**
- `before()` — Create temp directories, reset state
- `after()` — Clean up test artifacts (`rmSync()`)
- PID-based temp directories: `/tmp/claude-test-{feature}-${process.pid}`

## Temp Directory Pattern

**Isolation via PID:**
- Test directories use `process.pid` to avoid conflicts
- Examples:
  - `/tmp/claude-test-setup-${process.pid}`
  - `/tmp/claude-listdirs-${process.pid}`
  - `/tmp/claude-test-skills-${process.pid}`

**Cleanup Strategy:**
```javascript
const testDir = join('/tmp', `claude-test-${process.pid}`, 'a', 'b', 'c');
mkdirp(testDir);
// ... run tests ...
runCmd(`rm -rf /tmp/claude-test-${process.pid}`);
```

## Assertion Patterns

**Equality Testing:**
```javascript
assert.equal(result, 'hello');          // ===
assert.deepEqual(dirs, []);              // deep equality
```

**Existence & Truthiness:**
```javascript
assert.ok(existsSync(testDir));          // truthy
assert.ok(!names.includes('.hidden'));   // negation
```

**String Matching:**
```javascript
assert.match(output.trim(), /^\d+\.\d+\.\d+$/);  // regex
assert.ok(output.includes('text'));              // substring
```

**Error Expectations:**
- Tests do not explicitly assert errors — errors in try-catch return fallback values
- Bash hook validation: `execFileSync('bash', ['-n', hookPath])` validates syntax

## Mocking Strategy

**Approach:**
- No external mocking framework (no Jest, Sinon)
- Mock via temporary file system (`tmpdir()`)
- Mock via `process.env` overrides:
  ```javascript
  const result = execFileSync('bash', [hookPath], {
    env: { ...process.env, VAULT_PATH: '/nonexistent/vault/path' },
  });
  ```

**What to Mock:**
- Filesystem (via `/tmp` directories with unique PIDs)
- Environment variables (via `process.env` spread + override)

**What NOT to Mock:**
- Standard library functions — test real behavior
- Command execution — use real `execFileSync`, `execSync`

## CLI Testing

**Pattern: execFileSync for External Commands**
```javascript
function run(args = []) {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (err) {
    return err.stdout || err.message;
  }
}

describe('CLI', () => {
  it('shows help text', () => {
    const output = run(['help']);
    assert.ok(output.includes('Claude Dev Stack'));
  });
});
```

**Key Options:**
- `encoding: 'utf8'` — String output instead of Buffer
- `timeout: 10000` — 10-second timeout for CLI commands
- `env: { ...process.env, NO_COLOR: '1' }` — Disable ANSI colors for assertion
- `stdio: ['pipe', 'pipe', 'pipe']` — Capture all streams

## File System Testing

**Bash Hook Validation:**
```javascript
it('is valid bash syntax', () => {
  const result = execFileSync('bash', ['-n', hookPath], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // bash -n returns empty on success
});
```

**File Content Testing:**
```javascript
const content = readFileSync(hookPath, 'utf8');
assert.ok(content.startsWith('#!/bin/bash'));
assert.ok(content.includes('VAULT_PATH'));
```

## Dynamic Test Generation

**Iteration Pattern:**
```javascript
const hookFiles = ['session-start-context.sh', 'session-end-check.sh'];

for (const file of hookFiles) {
  describe(file, () => {
    it('file exists', () => {
      assert.ok(existsSync(hookPath));
    });
  });
}
```

**Use Case:** Validate multiple hook files or templates with same test suite

## Test Coverage

**Current Test Count:** 54 tests
- Breakdown:
  - `cli.test.mjs`: 9 tests (help, version, subcommands)
  - `shared.test.mjs`: 20+ tests (colors, runCmd, mkdirp, listDirs, paths)
  - `hooks.test.mjs`: 6 tests (file existence, bash syntax, env vars)
  - `skills.test.mjs`: 8+ tests (installed skills, catalog, builtin skills)
  - `templates.test.mjs`: 6 tests (template files, sections, placeholders)
  - `project-setup.test.mjs`: 3+ tests (setup, missing projects)

**Coverage Approach:**
- No coverage tool configured (no nyc, no c8)
- Focus on happy path and error scenarios
- Integration tests for CLI and filesystem operations

## Async Testing

**Pattern:**
```javascript
it('test name', async () => {
  const result = await functionAsync();
  assert.ok(result);
});
```

**Not used in current codebase (most tests are synchronous)**
- Hooks and CLI tests use `execFileSync` (blocks until done)
- No promise chains or complex async flows being tested

## Specific Test Patterns

**Shell Command Testing:**
```javascript
const result = runCmd('echo hello');
assert.equal(result, 'hello');

const result = runCmd('command_that_does_not_exist');
assert.equal(result, null);  // Error returns null, not throws
```

**Directory Listing:**
```javascript
const dirs = listDirs(testBase);
const names = dirs.map(d => d.name);
assert.ok(names.includes('project-a'));
assert.ok(!names.includes('.hidden'));
```

**Object Shape Validation:**
```javascript
const result = setupAllProjects(vaultPath);
assert.ok(Array.isArray(result.results));
assert.ok(Array.isArray(result.missing));
assert.equal(typeof result.projects, 'number');
```

---

*Testing analysis: 2026-04-10*
