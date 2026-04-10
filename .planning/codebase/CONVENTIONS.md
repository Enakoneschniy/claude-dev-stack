# Coding Conventions

**Analysis Date:** 2026-04-10

## Naming Patterns

**Files:**
- Kebab-case (all lowercase with hyphens): `add-project.mjs`, `project-setup.mjs`, `session-manager.mjs`
- Test files: `*.test.mjs` (e.g., `shared.test.mjs`, `cli.test.mjs`)
- Extension: `.mjs` (ECMAScript modules)

**Functions:**
- camelCase: `getInstalledSkills()`, `setupAllProjects()`, `detectSources()`, `extractSections()`
- Private functions: no prefix (convention is underscore prefix not used)
- Exported functions: explicitly declared with `export`

**Variables:**
- camelCase: `vaultPath`, `projectDir`, `sessionCount`, `skillsDir`, `testDir`
- Constants: camelCase with uppercase style (e.g., `SKILLS_DIR`, `AGENTS_DIR`, `CLAUDE_DIR`)
- Loop variables: conventional short names (`e`, `i`, `f`, `d`)

**Types & Objects:**
- Destructured imports: `{ existsSync, mkdirSync, readdirSync }` - common pattern for `fs` module
- Object keys: camelCase or conventional abbreviations
- Color object: `c.reset`, `c.bold`, `c.red`, `c.green`, `c.yellow`, `c.blue`, `c.cyan`, `c.magenta`, `c.white`, `c.dim`

## Code Style

**Formatting:**
- No linter, no formatter configured
- 2-space indentation (inferred from codebase)
- Semicolons: used consistently throughout

**Imports:**
- ESM syntax only: `import { x } from 'module'`
- Top-level imports at file start
- Standard library imports before local imports:
  ```javascript
  import { execSync } from 'child_process';
  import { existsSync, mkdirSync } from 'fs';
  import { join, dirname } from 'path';
  import { homedir } from 'os';
  import { fileURLToPath } from 'url';
  import { c, ok, fail, warn, info } from './shared.mjs';
  ```

**Template Literals:**
- Used for string interpolation: `` `path: ${value}` ``
- Used for ANSI color codes: `` `  ${c.cyan}${c.bold}Title${c.reset}` ``

**Color Usage Pattern:**
- `c` is an object with ANSI escape codes (strings, not functions)
- Example: `c.reset = '\x1b[0m'`, `c.bold = '\x1b[1m'`, `c.red = '\x1b[31m'`
- Usage: `` console.log(`${c.green}✔${c.reset} ${msg}`) ``
- File location: `lib/shared.mjs` exports the color object

## Export & Module Structure

**Module Pattern:**
- Each `.mjs` file is a module with explicit exports
- Barrel files not used
- Main function: `export async function main(args = [])` for CLI modules

**Imports from `lib/shared.mjs`:**
- Common utilities: `{ c, ok, fail, warn, info, prompt, askPath, runCmd, hasCommand, mkdirp, listDirs }`
- Path exports: `{ SKILLS_DIR, AGENTS_DIR, CLAUDE_DIR }`
- FS/OS re-exports: `{ spawnSync, existsSync, homedir }`

## Error Handling

**Pattern 1: Try-Catch with Fallback Return**
```javascript
function runCmd(command, opts = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
  } catch { return null; }
}

function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name, path: join(dir, e.name) }));
  } catch {
    return [];
  }
}
```

**Pattern 2: Warn + Info for User-Facing Errors**
```javascript
let vaultPath = findVault();
if (!vaultPath) {
  warn('Vault not found');
  info('Run setup first: claude-dev-stack');
  return null;
}
```

**Warnings and Information:**
- `warn(msg)` — Yellow warning icon, for issues that don't stop execution
- `info(msg)` — Blue info icon, for guidance or next steps
- `ok(msg)` — Green checkmark icon, for successful actions
- `fail(msg)` — Red failure icon, for failures

## Comments & Documentation

**JSDoc Style:**
- Block comments at module/function level (minimal)
- File-level docstring:
  ```javascript
  /**
   * Module name — one-line description
   *
   * Additional context or functionality list
   */
  ```

**Inline Comments:**
- Sparse — only for non-obvious logic
- Start with `//` followed by space
- Often used for section headers (decorative):
  ```javascript
  // ── Find vault ──────────────────────────────────────────────────
  export function findVault() { ... }
  ```

**Language:**
- All code and comments in English
- No comments in Russian (per CLAUDE.md rules)

## Function Design

**Parameter Style:**
- Default parameters: `function askPath(message, defaultVal) { ... }`
- Destructuring for options: `function runCmd(command, opts = {}) { ... }`

**Return Values:**
- Nullish returns on error: `return null` for single value, `return []` for arrays
- No exceptions thrown from utility functions — errors are handled internally

**Async Functions:**
- `async function name() { }` or `export async function main(args = []) { }`
- `await` used for promises

## Import Aliasing

**__dirname in ESM:**
```javascript
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
```

**Path construction:**
- Always use `path.join()` for cross-platform compatibility
- Path resolution: `join(__dirname, '..', 'bin', 'cli.mjs')`

## Commit Style

**Conventional Commits** (per CLAUDE.md):
- Format: `{type}: {description}`
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`
- Example: `feat: add project-level skills installation`
- **CRITICAL:** Do NOT include `Co-Authored-By` in commit messages (per CLAUDE.md and project memory)

## String Formatting

**Leading Spacing:**
- UI output consistently indented 4 spaces: `` `    ${c.green}...` ``
- Vertical spacing between sections: `console.log('')`

**Symbols:**
- Success: `${c.green}✔${c.reset}`
- Failure: `${c.red}✘${c.reset}`
- Warning: `${c.yellow}⚠${c.reset}`
- Info: `${c.blue}ℹ${c.reset}`

---

*Convention analysis: 2026-04-10*
