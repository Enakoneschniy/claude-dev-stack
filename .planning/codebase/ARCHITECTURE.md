# Architecture

**Analysis Date:** 2026-04-10

## Pattern Overview

**Overall:** Modular CLI dispatcher with feature-based lib modules

**Key Characteristics:**
- Single entry point routes commands to feature modules
- Each lib module exports a `main()` function matching one subcommand
- Shared utilities centralized in `lib/shared.mjs` (prompts, colors, path helpers)
- Binary script (`bin/cli.mjs`) handles argument parsing and dynamic imports
- External processes called via `spawnSync` with safe stdio handling
- Built-in skills bundled in `skills/` directory (session-manager, project-switcher, dev-router, dev-research)

## Layers

**CLI Router (`bin/cli.mjs`):**
- Purpose: Parse command-line arguments, dispatch to appropriate lib module, handle errors
- Location: `bin/cli.mjs`
- Contains: Command matching logic, inline help text, version lookup from package.json
- Depends on: Dynamic imports from `lib/*.mjs`, Node.js builtins (fs, path, url)
- Used by: User terminal, installed as `claude-dev-stack` global command (package.json bin field)

**Feature Modules (`lib/*.mjs`):**
- Purpose: Implement individual features (projects, skills, docs, plugins, MCP, templates, export, import, analytics, update, doctor)
- Location: `lib/` (14 modules)
- Contains: Business logic for each subcommand domain
- Depends on: `lib/shared.mjs` for utilities, `projects.mjs` for vault discovery
- Used by: CLI router via dynamic imports

**Shared Utilities (`lib/shared.mjs`):**
- Purpose: Provide common abstractions used across all feature modules
- Location: `lib/shared.mjs`
- Contains:
  - **Colors:** ANSI color codes (c object)
  - **Output helpers:** ok(), fail(), warn(), info() functions
  - **Prompts wrapper:** async prompt() with Ctrl+C handling
  - **Shell helpers:** runCmd() (execSync wrapper), hasCommand()
  - **Path helpers:** askPath() with tab completion, askPathAutocomplete(), getDirSuggestions()
  - **Filesystem:** mkdirp(), mkdirpKeep() (creates with .gitkeep)
  - **Constants:** SKILLS_DIR, AGENTS_DIR, CLAUDE_DIR paths
  - **Re-exports:** spawnSync, existsSync, homedir from Node.js
- Depends on: Node.js (fs, path, os, child_process), prompts npm package
- Used by: All feature modules

**Skills Definitions (`skills/*/SKILL.md`):**
- Purpose: Define Claude Code skill metadata and usage (consumed by Claude, not by CLI)
- Location: `skills/{skill-name}/SKILL.md`
- Contains: YAML frontmatter (name, description) + markdown documentation
- Depends on: None (static files)
- Used by: Claude Code when invoking skills, session-manager for skill lifecycle

**Templates (`templates/`):**
- Purpose: Provide boilerplate context.md and CLAUDE.md for common stacks
- Location: `templates/` (markdown templates + project-map.json)
- Contains: Stack templates (Next.js, React, FastAPI, Django, etc.), vault structure templates
- Depends on: None (static files read by templates.mjs)
- Used by: `templates.mjs` module for project creation

**Shell Hooks (`hooks/`):**
- Purpose: Optional shell scripts for development workflow integration
- Location: `hooks/` (bash scripts)
- Contains: session-start-context.sh, session-end-check.sh, vault-auto-push.sh
- Depends on: Bash, git, find commands
- Used by: Manual sourcing in shell init (bashrc/zshrc), not invoked by CLI

## Data Flow

**Command Dispatch Flow:**

```
user terminal
    ↓
bin/cli.mjs (parse args, extract subcommand)
    ↓
switch statement routes to lib module
    ↓
lib/*.mjs main() function
    ├── Calls lib/shared.mjs helpers for UI/IO
    ├── Finds vault via projects.mjs::findVault()
    ├── Reads/writes files to vault or user home
    ├── Spawns external commands (git, npm, tar, etc.) via spawnSync
    └── Returns control to CLI (or calls process.exit)
    ↓
CLI error handler (catch block in run() function)
    ↓
console output to user
```

**Example: Add Project Flow:**

1. User: `claude-dev-stack add`
2. CLI routes to `lib/add-project.mjs`
3. Module prompts for project name, path, vault location
4. Module creates `vault/projects/{name}/` structure with .gitkeep directories
5. Module scaffolds `context.md` from template
6. Returns to user

**Vault Interaction Pattern:**

Each feature module that interacts with vault:
1. Calls `projects.mjs::findVault()` to locate vault (checks standard paths + VAULT_PATH env)
2. Validates vault has `meta/` and `projects/` directories
3. Reads/writes project subdirectories:
   - `{vault}/projects/{name}/context.md` — project metadata
   - `{vault}/projects/{name}/sessions/` — session logs
   - `{vault}/projects/{name}/decisions/` — ADRs
   - `{vault}/projects/{name}/docs/` — imported documentation
4. Returns results to user

## Key Abstractions

**Prompt System (`askPath`, `askPathAutocomplete`):**
- Purpose: Get file/directory paths from user with intelligent suggestions
- Implementation: Uses `prompts` npm package with custom autocomplete suggest function
- Pattern: `getDirSuggestions()` reads directory entries and filters by prefix
- Used by: docs.mjs, export.mjs, import.mjs, projects.mjs (every module that needs user input)

**Vault Discovery (`findVault`):**
- Purpose: Locate user's vault across common locations
- Implementation: Check predefined candidates in order (~/vault, ~/Vault, ~/.vault, ~/obsidian-vault, ~/Documents/vault)
- Validation: Requires `meta/` AND `projects/` directories OR CLAUDE.md.template
- Used by: Every module that reads from vault (projects.mjs::findVault exported, imported by docs, export, import, etc.)

**Color Output (`c` object):**
- Purpose: Consistent terminal styling with ANSI codes
- Pattern: Define all colors once in shared.mjs, use via `c.red`, `c.bold`, etc.
- Used by: Every output line (ok, fail, warn, info helpers + inline messages)

**Process Spawning (`spawnSync`):**
- Purpose: Run external commands (git, npm, tar, claude CLI) safely
- Pattern: 
  - Always use stdio: 'pipe' to prevent inheriting parent TTY
  - Check result.status === 0 for success
  - Capture stdout/stderr from result object
  - Use timeout for long operations (e.g., export uses 60000ms)
- Used by: skills.mjs (git clone), mcp.mjs (claude mcp commands), export.mjs (tar), update.mjs (git pull, npx)

**Error Handling Pattern:**
- No try/catch in feature modules — errors propagate to CLI error handler
- CLI catches errors and prints formatted message: `Error: {message}`
- Graceful degradation: If command fails, return null or empty array, inform user via fail()

## Entry Points

**CLI Entry Point:**
- Location: `bin/cli.mjs` (shebang line 1: `#!/usr/bin/env node`)
- Triggers: User runs `claude-dev-stack [command] [args]`
- Responsibilities:
  1. Extract subcommand from args[0]
  2. Display help text or route to appropriate lib module
  3. Call module's main(args.slice(1)) function
  4. Catch and format errors
  5. Exit process (success: 0, error: 1)

**Feature Module Pattern:**
- Location: `lib/{feature}.mjs`
- Export: `export async function main(args) { ... }`
- Triggers: Called from CLI when user invokes that subcommand
- Responsibilities:
  1. Parse subcommand arguments (if any)
  2. Prompt user for inputs (prompts library)
  3. Perform file I/O and external command execution
  4. Output results via shared helpers (ok, fail, warn, info)

**Builtin Skills:**
- Location: `skills/{skill-name}/SKILL.md`
- Contains: Metadata (name, description) and implementation docs in markdown
- Triggers: Claude invokes skill based on user intent matching triggers in frontmatter
- Responsibilities: Define behavior that Claude should execute (e.g., load context on session start)

## Error Handling

**Strategy:** Defensive programming with early validation and informative messages

**Patterns:**

1. **Early Exit:** Module checks preconditions (vault exists, project exists) before proceeding
   ```javascript
   const vaultPath = findVault();
   if (!vaultPath) {
     warn('Vault not found');
     return;
   }
   ```

2. **Graceful Degradation:** Commands that might fail return null/empty instead of throwing
   ```javascript
   function runCmd(command, opts = {}) {
     try {
       return execSync(command, ...).trim();
     } catch { return null; }
   }
   ```

3. **Try-Catch at Top Level:** Only CLI's run() function has try-catch, formats error for display
   ```javascript
   run().catch((err) => {
     console.error(`Error: ${err.message}`);
     process.exit(1);
   });
   ```

4. **Informative Output:** Every operation provides feedback via ok/fail/warn/info helpers
   - ok(): Green checkmark — operation succeeded
   - fail(): Red X — required operation failed
   - warn(): Yellow warning — non-fatal issue
   - info(): Blue info — neutral status update

## Cross-Cutting Concerns

**Logging:** No centralized logging — use console.log via shared helpers
- ok/fail/warn/info prefix output with colored symbols
- All user-facing text passes through these helpers

**Validation:** File-existence checks before read/write operations
- existsSync() before readFileSync()
- mkdirp() before writeFileSync()
- Vault structure validation (meta/ and projects/ subdirs required)

**Authentication:** No authentication in CLI itself
- Delegates to external tools: git (SSH keys), claude CLI (API key), npm (.npmrc)
- MCP and Claude CLI integration relies on existing Claude authentication

**Configuration:** Reads from multiple sources in priority order
1. Command-line arguments (where applicable)
2. Environment variables (VAULT_PATH, NO_COLOR)
3. Detected via discovery (findVault for vault, hasCommand for tool availability)
4. Hardcoded defaults (paths like ~/.claude/skills)

**Safe Process Spawning:** All external command execution goes through spawnSync helper
- Never pass user input directly to shell
- Always use stdio: 'pipe' to avoid TTY inheritance issues
- Timeout long operations (export tar defaults to 60s)
- Check exit status and capture output/error separately

---

*Architecture analysis: 2026-04-10*
