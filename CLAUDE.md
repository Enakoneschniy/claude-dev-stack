# CLAUDE.md — Project Intelligence Layer

## Language
Общение на русском. Код и коммиты на английском.

## Auto-Routing (IMPORTANT)
Do NOT ask which tool to use. Determine automatically:
- First message in session → load context (session-manager)
- Development task → GSD (/gsd:quick for small, /gsd:plan-phase for large)
- Research/comparison → deep-research
- Different project mentioned → project-switcher
- End of work ("done", "всё", "хватит") → session-manager /end
If .planning/ exists → project uses GSD, respect its state.

## Knowledge Base
Before starting, ALWAYS read:
1. `cat /Users/eugenenakoneschniy/vault/projects/claude-dev-stack/context.md`
2. Last 3 session logs from `/Users/eugenenakoneschniy/vault/projects/claude-dev-stack/sessions/`

## Session Protocol
- Start: read context + propose continuation from last TODO
- During: ADR for decisions, Known Issues for bugs, shared/patterns.md for reusables
- End ("done"/"всё"/"хватит"): create session log, update context.md

## Code Style
- Commits: conventional commits (feat:, fix:, chore:)
- Code and comments in en
- Communication in ru

## Rules
- Do NOT delete code without explicit request
- On .env change → update .env.example
- On new dependency → explain in session log
- **TeamCreate worktrees**: agents in worktrees must NOT modify `.planning/` files (STATE.md, ROADMAP.md, REQUIREMENTS.md). Only commit code (lib/, tests/, hooks/, templates/, skills/, bin/). Team lead updates `.planning/` on main after merge.

## References
- Vault: `/Users/eugenenakoneschniy/vault/`
- Registry: `/Users/eugenenakoneschniy/vault/meta/project-registry.md`
- Patterns: `/Users/eugenenakoneschniy/vault/shared/patterns.md`
- Skills: `/Users/eugenenakoneschniy/.claude/skills/`

<!-- @claude-dev-stack:start -->
## Claude Dev Stack Skills

These project-level skills auto-trigger based on context. Do NOT ask which to use.

### session-manager
Auto-load project context at session start, log sessions at end

- **Triggers:** "hi", "привет", "let's continue", "done", "всё", "хватит", "на сегодня всё"
- **Invoke:** `Skill(skill: "session-manager")`

### project-switcher
Switch between development projects while preserving context

- **Triggers:** "switch to", "переключись", "другой проект", project name mentions
- **Invoke:** `Skill(skill: "project-switcher")`

### dev-router
Route user messages to the correct skill or workflow automatically

- **Triggers:** ANY message — decides which skill to use
- **Invoke:** `Skill(skill: "dev-router")`

### dev-research
Use NotebookLM for docs-grounded research

- **Triggers:** "check docs", "по документации", "ask notebooklm", "найди в нотбуке"
- **Invoke:** `Skill(skill: "dev-research")`

## Workflow Rules

1. **Session start** — Always invoke `session-manager` on first message to load vault context
2. **Before coding** — Check if task matches a skill trigger, invoke it
3. **Session end** — Invoke `session-manager` to log session when user says "done" / "всё"
4. **Different project mentioned** — Invoke `project-switcher`
5. **Docs/research questions** — Invoke `dev-research` if NotebookLM is set up

## Vault Location

Default: `~/vault/`. Override with `VAULT_PATH` env variable.

Project context: `~/vault/projects/{name}/context.md`
Session logs: `~/vault/projects/{name}/sessions/`
ADRs: `~/vault/projects/{name}/decisions/`
Docs: `~/vault/projects/{name}/docs/`

<!-- @claude-dev-stack:end -->

<!-- GSD:project-start source:PROJECT.md -->
## Project

**claude-dev-stack**

CLI tool that sets up a complete Claude Code development environment in one command — vault for cross-session memory, skills for auto-invocation, hooks for lifecycle logging, plus MCP servers, plugins, and stack templates. Solves Claude Code's #1 problem: total amnesia between sessions. Distributed as `npx claude-dev-stack`.

Target user: individual developers using Claude Code seriously across multiple projects who want persistent context, reproducible setup, and consistent workflow across machines.

**Core Value:** **Claude Code can resume work across sessions as if it remembered everything.**

Everything else — plugins, templates, MCP catalog, stack detection — is supporting infrastructure for this one thing. If memory/context restoration breaks, the product fails even if all other features work.

### Constraints

- **Runtime**: Node.js 18+ — do not use APIs that require Node 20+ (e.g., `fetch` is OK, `navigator` is not)
- **Dependencies**: Stay single-dep (`prompts` only) — NotebookLM client must use `node:https` or `fetch`, NOT `axios`/`node-fetch`
- **Distribution**: Must install via `npx` with no post-install step — cannot require compilation or native bindings
- **Style**: Conventional commits (feat/fix/chore/docs), no Co-Authored-By, no linter but consistent ESM + destructuring + template literals + `c.X` color strings (NOT functions)
- **Comms**: Code and commits in English; user-facing CLI output in English; communication (issues, PRs, chat) in Russian
- **Testing**: Every new `lib/*.mjs` module needs a matching `tests/*.test.mjs` file; tests use `node:test` only, no external frameworks
- **Backward compatibility**: Project already shipped v0.7.8 to real users — breaking changes to public commands/flags require major bump and migration notes
- **Secrets**: NotebookLM API tokens must NEVER be committed; read from env (`NOTEBOOKLM_API_KEY`) or user's Claude config; no `.env` files in repo
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (ESM) — CLI application and all library modules
## Runtime
- Node.js 18+ (specified in `package.json` engines)
- ESM (ECMAScript modules) — `.mjs` file extension throughout
- Shebang entry: `#!/usr/bin/env node` in `bin/cli.mjs`
- npm
- Lockfile: `package-lock.json` (managed by npm ci in CI)
## Frameworks & Core Libraries
- `prompts` v2.4.2 — Interactive command-line prompts (ONLY production dependency)
- Custom in-house — `bin/cli.mjs` (210 lines)
- `fs` — file system operations (synchronous and async)
- `path` — path utilities
- `child_process` — `spawnSync`, `execSync` for shell command execution
- `os` — `homedir()` for user home directory
- `url` — `fileURLToPath` for ESM file paths
## Testing Framework
- `node:test` (Node.js native)
- Command: `npm test` → `node --test tests/*.test.mjs`
- No external test framework dependency
- Assertion via `node:assert` or similar built-ins
## Build & Development
- No build step (native ESM, direct execution)
- Syntax validation in CI: `node --check` for each `.mjs` file
- None explicitly declared (no dev dependencies)
- Linting: Not configured
- Formatting: Not configured
## Distribution
- NPM Registry (`npmjs.org`)
- Package name: `claude-dev-stack`
- Current version: `0.7.8`
- Publication: GitHub Actions → npm publish with OIDC trusted publishing
- Provenance: Enabled (`publishConfig.provenance: true`)
- Triggered on GitHub release published event (`.github/workflows/publish.yml`)
- Node 24 for publishing
- Runs tests before publish
- Command: `npm publish --access public --provenance`
## CI/CD Pipeline
- GitHub Actions (`.github/workflows/ci.yml`)
- Triggers: push to main, pull requests to main
- Matrix testing: Node 18, 20, 22
- Steps:
- GitHub Actions (`.github/workflows/publish.yml`)
- Trigger: release published
- Node 24 for consistency
- Permissions: `id-token: write` (OIDC)
- Publishes with npm provenance (supply chain security)
## Configuration Files
- `package.json` — ESM config, bin entry, engines, minimal dependencies
- No other config files (tsconfig.json, .eslintrc, etc.)
- Vault path: `$VAULT_PATH` env var (default `~/vault/`)
- Home directory: Uses `os.homedir()`
- Claude CLI: Detected via `which claude` command
- No `.env` file required (system-level configuration)
## File Distribution
- `bin/` — CLI entry point
- `lib/` — Core command modules
- `hooks/` — Shell scripts for Claude Code integration
- `skills/` — Built-in skill definitions
- `templates/` — Context.md templates for project stacks
- `README.md`, `LICENSE`
## External Command Dependencies
- `claude` (Claude Code CLI) — Detected via `hasCommand('claude')`
- `git` — For skill installation from GitHub
- `npx` — For GSD and skill installation
- `node` — For syntax checking and test execution
## Platform Requirements
- Node.js 18+ (18, 20, 22 tested in CI)
- npm (for lockfile and ci)
- bash/sh (for shell commands, spawnSync)
- Node.js 18+ installed globally
- npm installed (for global install via `npm install -g claude-dev-stack`)
- Accessible via PATH as `claude-dev-stack` command
## Dependency Vulnerability Profile
- `prompts@2.4.2` — Mature library, widely used
- Last update: Check npm registry for latest patch
- OIDC trusted publishing prevents token leakage
- No external API keys embedded in code
- Vault directory is user-local (not cloud-synced by default)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Kebab-case (all lowercase with hyphens): `add-project.mjs`, `project-setup.mjs`, `session-manager.mjs`
- Test files: `*.test.mjs` (e.g., `shared.test.mjs`, `cli.test.mjs`)
- Extension: `.mjs` (ECMAScript modules)
- camelCase: `getInstalledSkills()`, `setupAllProjects()`, `detectSources()`, `extractSections()`
- Private functions: no prefix (convention is underscore prefix not used)
- Exported functions: explicitly declared with `export`
- camelCase: `vaultPath`, `projectDir`, `sessionCount`, `skillsDir`, `testDir`
- Constants: camelCase with uppercase style (e.g., `SKILLS_DIR`, `AGENTS_DIR`, `CLAUDE_DIR`)
- Loop variables: conventional short names (`e`, `i`, `f`, `d`)
- Destructured imports: `{ existsSync, mkdirSync, readdirSync }` - common pattern for `fs` module
- Object keys: camelCase or conventional abbreviations
- Color object: `c.reset`, `c.bold`, `c.red`, `c.green`, `c.yellow`, `c.blue`, `c.cyan`, `c.magenta`, `c.white`, `c.dim`
## Code Style
- No linter, no formatter configured
- 2-space indentation (inferred from codebase)
- Semicolons: used consistently throughout
- ESM syntax only: `import { x } from 'module'`
- Top-level imports at file start
- Standard library imports before local imports:
- Used for string interpolation: `` `path: ${value}` ``
- Used for ANSI color codes: `` `  ${c.cyan}${c.bold}Title${c.reset}` ``
- `c` is an object with ANSI escape codes (strings, not functions)
- Example: `c.reset = '\x1b[0m'`, `c.bold = '\x1b[1m'`, `c.red = '\x1b[31m'`
- Usage: `` console.log(`${c.green}✔${c.reset} ${msg}`) ``
- File location: `lib/shared.mjs` exports the color object
## Export & Module Structure
- Each `.mjs` file is a module with explicit exports
- Barrel files not used
- Main function: `export async function main(args = [])` for CLI modules
- Common utilities: `{ c, ok, fail, warn, info, prompt, askPath, runCmd, hasCommand, mkdirp, listDirs }`
- Path exports: `{ SKILLS_DIR, AGENTS_DIR, CLAUDE_DIR }`
- FS/OS re-exports: `{ spawnSync, existsSync, homedir }`
## Error Handling
- `warn(msg)` — Yellow warning icon, for issues that don't stop execution
- `info(msg)` — Blue info icon, for guidance or next steps
- `ok(msg)` — Green checkmark icon, for successful actions
- `fail(msg)` — Red failure icon, for failures
## Comments & Documentation
- Block comments at module/function level (minimal)
- File-level docstring:
- Sparse — only for non-obvious logic
- Start with `//` followed by space
- Often used for section headers (decorative):
- All code and comments in English
- No comments in Russian (per CLAUDE.md rules)
## Function Design
- Default parameters: `function askPath(message, defaultVal) { ... }`
- Destructuring for options: `function runCmd(command, opts = {}) { ... }`
- Nullish returns on error: `return null` for single value, `return []` for arrays
- No exceptions thrown from utility functions — errors are handled internally
- `async function name() { }` or `export async function main(args = []) { }`
- `await` used for promises
## Import Aliasing
- Always use `path.join()` for cross-platform compatibility
- Path resolution: `join(__dirname, '..', 'bin', 'cli.mjs')`
## Commit Style
- Format: `{type}: {description}`
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`
- Example: `feat: add project-level skills installation`
- **CRITICAL:** Do NOT include `Co-Authored-By` in commit messages (per CLAUDE.md and project memory)
## String Formatting
- UI output consistently indented 4 spaces: `` `    ${c.green}...` ``
- Vertical spacing between sections: `console.log('')`
- Success: `${c.green}✔${c.reset}`
- Failure: `${c.red}✘${c.reset}`
- Warning: `${c.yellow}⚠${c.reset}`
- Info: `${c.blue}ℹ${c.reset}`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Single entry point routes commands to feature modules
- Each lib module exports a `main()` function matching one subcommand
- Shared utilities centralized in `lib/shared.mjs` (prompts, colors, path helpers)
- Binary script (`bin/cli.mjs`) handles argument parsing and dynamic imports
- External processes called via `spawnSync` with safe stdio handling
- Built-in skills bundled in `skills/` directory (session-manager, project-switcher, dev-router, dev-research)
## Layers
- Purpose: Parse command-line arguments, dispatch to appropriate lib module, handle errors
- Location: `bin/cli.mjs`
- Contains: Command matching logic, inline help text, version lookup from package.json
- Depends on: Dynamic imports from `lib/*.mjs`, Node.js builtins (fs, path, url)
- Used by: User terminal, installed as `claude-dev-stack` global command (package.json bin field)
- Purpose: Implement individual features (projects, skills, docs, plugins, MCP, templates, export, import, analytics, update, doctor)
- Location: `lib/` (14 modules)
- Contains: Business logic for each subcommand domain
- Depends on: `lib/shared.mjs` for utilities, `projects.mjs` for vault discovery
- Used by: CLI router via dynamic imports
- Purpose: Provide common abstractions used across all feature modules
- Location: `lib/shared.mjs`
- Contains:
- Depends on: Node.js (fs, path, os, child_process), prompts npm package
- Used by: All feature modules
- Purpose: Define Claude Code skill metadata and usage (consumed by Claude, not by CLI)
- Location: `skills/{skill-name}/SKILL.md`
- Contains: YAML frontmatter (name, description) + markdown documentation
- Depends on: None (static files)
- Used by: Claude Code when invoking skills, session-manager for skill lifecycle
- Purpose: Provide boilerplate context.md and CLAUDE.md for common stacks
- Location: `templates/` (markdown templates + project-map.json)
- Contains: Stack templates (Next.js, React, FastAPI, Django, etc.), vault structure templates
- Depends on: None (static files read by templates.mjs)
- Used by: `templates.mjs` module for project creation
- Purpose: Optional shell scripts for development workflow integration
- Location: `hooks/` (bash scripts)
- Contains: session-start-context.sh, session-end-check.sh, vault-auto-push.sh
- Depends on: Bash, git, find commands
- Used by: Manual sourcing in shell init (bashrc/zshrc), not invoked by CLI
## Data Flow
```
```
## Key Abstractions
- Purpose: Get file/directory paths from user with intelligent suggestions
- Implementation: Uses `prompts` npm package with custom autocomplete suggest function
- Pattern: `getDirSuggestions()` reads directory entries and filters by prefix
- Used by: docs.mjs, export.mjs, import.mjs, projects.mjs (every module that needs user input)
- Purpose: Locate user's vault across common locations
- Implementation: Check predefined candidates in order (~/vault, ~/Vault, ~/.vault, ~/obsidian-vault, ~/Documents/vault)
- Validation: Requires `meta/` AND `projects/` directories OR CLAUDE.md.template
- Used by: Every module that reads from vault (projects.mjs::findVault exported, imported by docs, export, import, etc.)
- Purpose: Consistent terminal styling with ANSI codes
- Pattern: Define all colors once in shared.mjs, use via `c.red`, `c.bold`, etc.
- Used by: Every output line (ok, fail, warn, info helpers + inline messages)
- Purpose: Run external commands (git, npm, tar, claude CLI) safely
- Pattern: 
- Used by: skills.mjs (git clone), mcp.mjs (claude mcp commands), export.mjs (tar), update.mjs (git pull, npx)
- No try/catch in feature modules — errors propagate to CLI error handler
- CLI catches errors and prints formatted message: `Error: {message}`
- Graceful degradation: If command fails, return null or empty array, inform user via fail()
## Entry Points
- Location: `bin/cli.mjs` (shebang line 1: `#!/usr/bin/env node`)
- Triggers: User runs `claude-dev-stack [command] [args]`
- Responsibilities:
- Location: `lib/{feature}.mjs`
- Export: `export async function main(args) { ... }`
- Triggers: Called from CLI when user invokes that subcommand
- Responsibilities:
- Location: `skills/{skill-name}/SKILL.md`
- Contains: Metadata (name, description) and implementation docs in markdown
- Triggers: Claude invokes skill based on user intent matching triggers in frontmatter
- Responsibilities: Define behavior that Claude should execute (e.g., load context on session start)
## Error Handling
## Cross-Cutting Concerns
- ok/fail/warn/info prefix output with colored symbols
- All user-facing text passes through these helpers
- existsSync() before readFileSync()
- mkdirp() before writeFileSync()
- Vault structure validation (meta/ and projects/ subdirs required)
- Delegates to external tools: git (SSH keys), claude CLI (API key), npm (.npmrc)
- MCP and Claude CLI integration relies on existing Claude authentication
- Never pass user input directly to shell
- Always use stdio: 'pipe' to avoid TTY inheritance issues
- Timeout long operations (export tar defaults to 60s)
- Check exit status and capture output/error separately
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| dev-research | > Use NotebookLM for grounded research — documentation queries, stack comparisons, session log search. Trigger when user needs answers FROM SPECIFIC DOCUMENTATION or FROM PAST SESSIONS: "по документации", "check docs", "как в Payload", "как в Next.js", "что мы решили про", "when did we decide", "по нашим записям", "спроси в нотбуке", "ask notebooklm", "query notebook", "загрузи доки", "load docs", "add to notebook", "найди в сессиях", "search sessions", "когда мы делали". Also for structured comparisons: "сравни X и Y по документации", "compare based on docs". Requires notebooklm-py. For WEB research (current info, trends), use deep-research skill instead. | `.claude/skills/dev-research/SKILL.md` |
| dev-router | > Meta-skill that routes user messages to the correct tool/skill automatically. This skill is ALWAYS active and helps decide which workflow to use.  Trigger on ANY user message to determine the right approach:  SESSION & CONTEXT (→ session-manager): - First message in a session, greetings, "hi", "привет" - "done", "end", "всё", "хватит", "на сегодня всё" - "что мы делали", "resume", "continue", "продолжи"  PROJECT SWITCHING (→ project-switcher): - "switch to", "переключись на", "другой проект", "работаем над" - Mentions any project name that exists in vault/projects/  DEVELOPMENT / BUILDING (→ GSD): - "build", "implement", "fix", "сделай", "исправь", "create feature" - "refactor", "deploy", "ship", "plan", "phase" - Any coding task, feature request, or bug fix  RESEARCH (→ deep-research or dev-research): - "research", "compare", "исследуй", "сравни", "what options" - "check docs", "по документации", "ask notebooklm"  STATUS (→ project-switcher /projects): - "status", "статус", "list projects", "покажи проекты" | `.claude/skills/dev-router/SKILL.md` |
| project-switcher | > Switch between development projects while preserving context. Trigger when user mentions switching projects or asks about other projects: "switch to", "переключись на", "работаем над", "давай с", "другой проект", "покажи проекты", "list projects", "статус проектов", "all projects", "что у нас есть". Also trigger when user mentions a project name that exists in the vault project registry. Silently saves current context before switching. | `.claude/skills/project-switcher/SKILL.md` |
| session-manager | > Automatically manage development session lifecycle. Load context at start, log sessions at end. ALWAYS trigger on first message in any session (greetings, "привет", "hi", "начинаем"). ALWAYS trigger on session end signals: "всё", "хватит", "заканчиваем", "done", "end", "конец", "на сегодня всё", "finish". Also trigger on: "что делали", "где остановились", "last time", "resume", "продолжи", "handoff", "передай контекст", "what did we do", "continue where we left off". Auto-activates silently — reads context and presents status without being asked. | `.claude/skills/session-manager/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
