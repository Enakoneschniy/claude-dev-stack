# Codebase Structure

**Analysis Date:** 2026-04-10

## Directory Layout

```
claude-dev-stack/
├── bin/                        # CLI entry points
│   ├── cli.mjs                 # Main router + help text
│   └── install.mjs             # Interactive setup wizard
├── lib/                        # Feature modules (14 .mjs files)
│   ├── shared.mjs              # Shared utilities (colors, prompts, paths)
│   ├── projects.mjs            # Project management (list, add, remove)
│   ├── add-project.mjs         # Project creation wizard
│   ├── project-setup.mjs       # Project environment setup
│   ├── docs.mjs                # Document management (list, add)
│   ├── skills.mjs              # Skill management (list, install, remove)
│   ├── plugins.mjs             # Plugin management (list, install, presets)
│   ├── mcp.mjs                 # MCP server management (list, add, remove)
│   ├── templates.mjs           # Stack templates (Next.js, Django, etc.)
│   ├── import.mjs              # Import from .cursorrules, CLAUDE.md, etc.
│   ├── export.mjs              # Export vault as .tar.gz, git sync
│   ├── analytics.mjs           # Statistics dashboard
│   ├── doctor.mjs              # Health check diagnostics
│   └── update.mjs              # Update skills, GSD, Claude CLI
├── hooks/                      # Optional shell scripts
│   ├── session-start-context.sh
│   ├── session-end-check.sh
│   └── vault-auto-push.sh
├── skills/                     # Built-in skill definitions
│   ├── session-manager/SKILL.md
│   ├── project-switcher/SKILL.md
│   ├── dev-router/SKILL.md
│   └── dev-research/SKILL.md
├── templates/                  # Vault file templates
│   ├── context-template.md     # Template for context.md
│   ├── project-registry.md     # Vault registry template
│   ├── patterns.md             # Shared patterns template
│   ├── infra.md                # Infrastructure template
│   ├── session-protocol.md     # Session workflow docs
│   └── project-map.json        # Stack catalogs metadata
├── tests/                      # Node test runner tests
│   ├── cli.test.mjs
│   ├── shared.test.mjs
│   ├── skills.test.mjs
│   ├── project-setup.test.mjs
│   ├── hooks.test.mjs
│   └── templates.test.mjs
├── examples/                   # Usage examples
│   └── devcontainer/README.md
├── .claude/                    # Project-level skills (auto-installed)
│   └── skills/
├── .planning/                  # GSD planning documents
│   └── codebase/               # This directory
├── .github/                    # GitHub configs
│   ├── pull_request_template.md
│   └── ISSUE_TEMPLATE/
├── package.json                # npm metadata
├── package-lock.json
├── CLAUDE.md                   # Project instructions (reads context, routing rules)
├── README.md                   # User documentation
├── ROADMAP.md                  # Feature roadmap
├── CONTRIBUTING.md             # Contribution guidelines
└── LICENSE
```

## Directory Purposes

**`bin/`:**
- Purpose: Command-line entry points and setup wizard
- Contains: Executable .mjs files with shebang
- Key files: `bin/cli.mjs` (main dispatcher), `bin/install.mjs` (setup)

**`lib/`:**
- Purpose: Feature implementation modules
- Contains: One .mjs file per subcommand, all export `main(args)` function
- Naming: kebab-case.mjs (e.g., `add-project.mjs`, `skills.mjs`)
- Dependencies: All import from `shared.mjs`, some import from `projects.mjs`

**`hooks/`:**
- Purpose: Optional bash scripts for shell integration
- Contains: Executable shell scripts
- Usage: Source in shell init files (not invoked by CLI)

**`skills/`:**
- Purpose: Built-in skill definitions
- Contains: Directories per skill, each with SKILL.md
- Format: YAML frontmatter + markdown documentation

**`templates/`:**
- Purpose: Boilerplate content for vault initialization
- Contains: Markdown templates, JSON metadata
- Used by: `lib/templates.mjs` when creating new projects

**`tests/`:**
- Purpose: Node test runner test files
- Contains: .test.mjs files
- Framework: Node.js built-in `node:test` module
- Run: `npm test`

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Contains: ARCHITECTURE.md, STRUCTURE.md, etc.
- Created by: GSD mappers, consumed by GSD planners

## Key File Locations

**Entry Points:**
- `bin/cli.mjs` (line 1-210): Main CLI router, command dispatch logic, help text
- `bin/install.mjs` (line 1-1300+): Interactive setup wizard for new users

**CLI Routing Logic:**
- `bin/cli.mjs` lines 77-204: switch statement routes commands to lib modules
- Pattern: Each case imports and calls `lib/{feature}.mjs`'s main() function
- Default case (line 198): If no command matched, run setup wizard

**Configuration:**
- `package.json`: Defines bin field, node version requirement, dependencies
- CLAUDE.md: Project-level instructions and routing rules for Claude Code
- `.env` files: Not committed; vault path can be overridden with VAULT_PATH env var

**Core Logic:**

| Feature | File | Purpose |
|---------|------|---------|
| Projects | `lib/projects.mjs` | List, manage vault projects |
| Vault Discovery | `lib/projects.mjs::findVault()` | Locate user's vault |
| Docs | `lib/docs.mjs` | Add/list project documents |
| Skills | `lib/skills.mjs` | Manage Claude Code skills |
| Plugins | `lib/plugins.mjs` | Manage plugins and presets |
| MCP | `lib/mcp.mjs` | Manage MCP servers |
| Templates | `lib/templates.mjs` | Create projects from stacks |
| Import | `lib/import.mjs` | Import .cursorrules, CLAUDE.md, etc. |
| Export | `lib/export.mjs` | Export vault as .tar.gz, git sync |
| Analytics | `lib/analytics.mjs` | Statistics dashboard |
| Doctor | `lib/doctor.mjs` | Health check |
| Update | `lib/update.mjs` | Update tools |

**Utilities:**
- `lib/shared.mjs`: All shared helpers (prompts, colors, path input, shell commands)

## Naming Conventions

**Files:**
- CLI modules: kebab-case (e.g., `add-project.mjs`, `project-setup.mjs`)
- Skills: lowercase-name/SKILL.md (e.g., `session-manager/SKILL.md`)
- Tests: kebab-case.test.mjs (e.g., `cli.test.mjs`, `shared.test.mjs`)
- Shell scripts: kebab-case.sh (e.g., `session-start-context.sh`)

**Directories:**
- Feature modules: `lib/`
- Skill definitions: `skills/{skill-name}/`
- Test files: `tests/`
- Shell scripts: `hooks/`
- Templates: `templates/` (flat, not nested)

**Functions:**
- Module entry: `export async function main(args) { ... }`
- Internal functions: camelCase (e.g., `findVault()`, `getProjects()`)
- Helpers: camelCase (e.g., `askPath()`, `mkdirp()`, `ok()`)
- Constants: UPPER_SNAKE_CASE (e.g., `SKILLS_DIR`, `CLAUDE_DIR`)

**Variables:**
- User input: camelCase (e.g., `vaultPath`, `projectName`)
- File paths: camelCase ending with `Path` (e.g., `vaultPath`, `contextPath`)
- Config objects: camelCase (e.g., `settings`, `installed`)

## Where to Add New Code

**New Subcommand:**
1. Create `lib/{feature-name}.mjs`
2. Export `async function main(args) { ... }`
3. Import utilities from `lib/shared.mjs`
4. Add case in `bin/cli.mjs` switch statement:
   ```javascript
   case 'feature-name': {
     const { main } = await import('../lib/feature-name.mjs');
     await main(args.slice(1));
     break;
   }
   ```
5. Add help text in `printHelp()` function (before run() function)
6. Add test file: `tests/feature-name.test.mjs`

**New Utility/Helper:**
- Add to `lib/shared.mjs` if used by multiple modules
- Export it in the shared.mjs export list
- Import it in modules that need it: `import { helperName } from './shared.mjs'`

**New Skill:**
1. Create `skills/{skill-name}/` directory
2. Create `SKILL.md` file with YAML frontmatter and markdown content
3. Frontmatter format:
   ```yaml
   ---
   name: skill-name
   description: One-line description
   triggers: [comma, separated, trigger, words]
   ---
   ```
4. Note: Skills are typically not modified by CLI — they're consumed by Claude Code

**New Template:**
1. Add to `templates/{stack-name}.md`
2. Use `{{NAME}}` placeholder for project name
3. Include sections: Overview, Stack, Architecture, Conventions, Current State
4. Update `lib/templates.mjs` STACK_TEMPLATES object if needed

**New Test:**
1. Create `tests/{feature}.test.mjs`
2. Use Node.js built-in test framework: `import { describe, it } from 'node:test'`
3. Use assert module: `import assert from 'node:assert/strict'`
4. Pattern:
   ```javascript
   describe('Feature', () => {
     it('does something', () => {
       assert.ok(result);
     });
   });
   ```
5. Run: `npm test`

## Special Directories

**`.claude/` (Project-level Skills):**
- Purpose: Auto-installed skills bundled with this repo
- Created: By `bin/install.mjs` during setup
- Contents: Copies of `skills/` directory
- Committed: No (generated)

**`.planning/codebase/`:**
- Purpose: GSD mapper output (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Created: By GSD mappers
- Committed: Yes
- Used by: GSD planners when creating implementation plans

**`.github/`:**
- Purpose: GitHub-specific configs (PR template, issue templates)
- Committed: Yes

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: `npm install`
- Committed: No (.gitignored)

## External Process Patterns

All external commands (git, npm, tar, claude) spawned via `spawnSync` from `lib/shared.mjs`:

**Git operations:**
- `skills.mjs`: git clone (skill installation), git pull (skill updates)
- `export.mjs`: git remote check, git push/pull (vault sync)
- `update.mjs`: git pull (skill updates)

**npm operations:**
- `skills.mjs`: npx get-shit-done-cc@latest (GSD installation)
- `update.mjs`: npx get-shit-done-cc@latest (GSD update)

**Claude CLI integration:**
- `mcp.mjs`: claude mcp list, claude mcp add, claude mcp remove
- `update.mjs`: claude update

**Archive operations:**
- `export.mjs`: tar czf (create .tar.gz), tar xzf (extract)

**Pattern used everywhere:**
```javascript
const result = spawnSync('command', ['arg1', 'arg2'], {
  stdio: 'pipe',
  timeout: 30000,
  cwd: working_dir  // optional
});
if (result.status === 0) {
  ok('Success');
  console.log(result.stdout.toString());
} else {
  fail('Failed');
  console.log(result.stderr.toString());
}
```

---

*Structure analysis: 2026-04-10*
