# Technology Stack

**Analysis Date:** 2026-04-10

## Languages

**Primary:**
- JavaScript (ESM) — CLI application and all library modules

## Runtime

**Environment:**
- Node.js 18+ (specified in `package.json` engines)
- ESM (ECMAScript modules) — `.mjs` file extension throughout
- Shebang entry: `#!/usr/bin/env node` in `bin/cli.mjs`

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (managed by npm ci in CI)

## Frameworks & Core Libraries

**CLI Framework:**
- `prompts` v2.4.2 — Interactive command-line prompts (ONLY production dependency)
  - Used throughout: `lib/shared.mjs` exports prompt wrapper
  - Provides: multi-select, confirmation, text input, autocomplete for directory paths

**CLI Router:**
- Custom in-house — `bin/cli.mjs` (210 lines)
  - Routes 35+ subcommands to lib modules
  - Uses dynamic imports for lazy loading: `await import('../lib/{command}.mjs')`
  - Returns help text, version, or routes to setup wizard

**Node.js Built-in APIs:**
- `fs` — file system operations (synchronous and async)
- `path` — path utilities
- `child_process` — `spawnSync`, `execSync` for shell command execution
- `os` — `homedir()` for user home directory
- `url` — `fileURLToPath` for ESM file paths

## Testing Framework

**Test Runner:**
- `node:test` (Node.js native)
- Command: `npm test` → `node --test tests/*.test.mjs`
- No external test framework dependency
- Assertion via `node:assert` or similar built-ins

## Build & Development

**Build System:**
- No build step (native ESM, direct execution)
- Syntax validation in CI: `node --check` for each `.mjs` file

**Development Tools:**
- None explicitly declared (no dev dependencies)
- Linting: Not configured
- Formatting: Not configured

## Distribution

**Package Distribution:**
- NPM Registry (`npmjs.org`)
- Package name: `claude-dev-stack`
- Current version: `0.7.8`
- Publication: GitHub Actions → npm publish with OIDC trusted publishing
- Provenance: Enabled (`publishConfig.provenance: true`)

**Release Process:**
- Triggered on GitHub release published event (`.github/workflows/publish.yml`)
- Node 24 for publishing
- Runs tests before publish
- Command: `npm publish --access public --provenance`

## CI/CD Pipeline

**Continuous Integration:**
- GitHub Actions (`.github/workflows/ci.yml`)
- Triggers: push to main, pull requests to main
- Matrix testing: Node 18, 20, 22
- Steps:
  1. Checkout code
  2. Setup Node.js (matrix version)
  3. Install dependencies (`npm ci`)
  4. Syntax check: `node --check` on `bin/*.mjs` and `lib/*.mjs`
  5. Run tests: `npm test`

**Continuous Deployment:**
- GitHub Actions (`.github/workflows/publish.yml`)
- Trigger: release published
- Node 24 for consistency
- Permissions: `id-token: write` (OIDC)
- Publishes with npm provenance (supply chain security)

## Configuration Files

**Package Metadata:**
- `package.json` — ESM config, bin entry, engines, minimal dependencies
- No other config files (tsconfig.json, .eslintrc, etc.)

**Environment:**
- Vault path: `$VAULT_PATH` env var (default `~/vault/`)
- Home directory: Uses `os.homedir()`
- Claude CLI: Detected via `which claude` command
- No `.env` file required (system-level configuration)

## File Distribution

**Published Files (from `package.json` files array):**
- `bin/` — CLI entry point
- `lib/` — Core command modules
- `hooks/` — Shell scripts for Claude Code integration
- `skills/` — Built-in skill definitions
- `templates/` — Context.md templates for project stacks
- `README.md`, `LICENSE`

## External Command Dependencies

**Optional Runtime Dependencies (not in package.json):**
- `claude` (Claude Code CLI) — Detected via `hasCommand('claude')`
  - Used by: MCP server management, plugin management, skill registration
  - Not required for basic functionality
- `git` — For skill installation from GitHub
  - Used by: Skill installation, vault sync
  - Fallback via `spawnSync('git', ['pull'])`
- `npx` — For GSD and skill installation
  - Used by: GSD updates, dynamic package installations
- `node` — For syntax checking and test execution

## Platform Requirements

**Development:**
- Node.js 18+ (18, 20, 22 tested in CI)
- npm (for lockfile and ci)
- bash/sh (for shell commands, spawnSync)

**Production:**
- Node.js 18+ installed globally
- npm installed (for global install via `npm install -g claude-dev-stack`)
- Accessible via PATH as `claude-dev-stack` command

## Dependency Vulnerability Profile

**Production Dependencies:** 1 (prompts)
- `prompts@2.4.2` — Mature library, widely used
- Last update: Check npm registry for latest patch

**Security Scanning:**
- OIDC trusted publishing prevents token leakage
- No external API keys embedded in code
- Vault directory is user-local (not cloud-synced by default)

---

*Stack analysis: 2026-04-10*
