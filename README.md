# Claude Dev Stack

**One command to give Claude Code persistent memory, git conventions, and a complete dev workflow.**

```bash
npx claude-dev-stack
```

Claude Code is powerful — but it forgets everything between sessions. Claude Dev Stack fixes that.

[![npm version](https://img.shields.io/npm/v/claude-dev-stack)](https://www.npmjs.com/package/claude-dev-stack)
[![CI](https://github.com/Enakoneschniy/claude-dev-stack/actions/workflows/ci.yml/badge.svg)](https://github.com/Enakoneschniy/claude-dev-stack/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/enakoneschniy)

---

## The Problem

If you use Claude Code seriously, you've hit these walls:

- **Total amnesia.** Every session starts from zero. Claude doesn't remember what you worked on yesterday, what decisions you made, or what's left to do.
- **No git discipline.** Claude writes commit messages like `fix stuff` or `update code`. No scopes, no conventional commits, no branch conventions — unless you manually instruct it every time.
- **Manual setup per project.** You copy-paste the same CLAUDE.md, install the same plugins, configure the same MCP servers. Every. Single. Project.
- **Scattered documentation.** Session notes, architecture decisions, project context — all lost in chat history that Claude can't access next time.

## The Solution

Claude Dev Stack sets up an Obsidian-compatible vault that stores everything Claude needs to resume work across sessions — context, decisions, session logs, git conventions — and auto-loads it every time.

### Before vs After

| Without Claude Dev Stack | With Claude Dev Stack |
|---|---|
| "What were we working on?" — Claude has no idea | "Let's continue" — Claude loads context, shows last TODO, proposes next steps |
| Commits: `fix bug`, `update stuff`, `changes` | Commits: `fix(auth): resolve token refresh race condition` |
| You explain the same architecture every session | Architecture is in `context.md`, loaded automatically |
| Decisions lost in chat history | ADRs saved in `decisions/`, searchable in Obsidian |
| Manual plugin/MCP setup per machine | One wizard configures everything, `update` keeps it current |
| Notion docs manually pasted into projects | `notion add <url>` + auto-import with overwrite protection |

---

## Quick Start

### 1. Install

```bash
npx claude-dev-stack
```

The interactive wizard walks you through:
- Vault creation (where Claude stores memory)
- Project discovery and mapping
- Component selection (skills, hooks, plugins, MCP servers)
- Git conventions setup per project
- Stack-specific context.md generation

### 2. Fill in context.md

This is the single most important step. Claude reads this file at the start of every session.

```bash
cd ~/Projects/my-project && claude
> "help me fill in context.md for this project"
```

Describe your project's purpose, tech stack, architecture, current state, and known issues. The more specific you are, the better Claude performs across sessions.

### 3. Start working

```bash
cd ~/Projects/my-project && claude
> "let's continue"
```

Claude automatically loads your project context, shows what was done last session, and proposes next steps. When you're done:

```
> "done for today"
```

Claude creates a session log with what was done, decisions made, and TODO for next time.

---

## Use Cases

### Session Continuity

You close your laptop Friday evening. Monday morning:

```
> "let's continue"

Project: my-saas-app
Last session (2026-04-11): Implemented user auth flow, added JWT refresh.
TODO: Wire up email verification endpoint, add rate limiting.

Suggested next step: Email verification — the auth flow is complete
but unverified users can still access protected routes.
```

No context lost. No "remind me what we were doing."

### Git Conventions

Claude Dev Stack detects your monorepo structure and generates scopes automatically:

```bash
claude-dev-stack scopes init --quick
# Detected: pnpm-workspace (apps/web, apps/api, packages/ui)
# Generated .claude/git-scopes.json with scopes: web, api, ui
```

Now when you say "commit this as a fix":

```
fix(api): resolve database connection timeout on cold start
```

Not `fix stuff`. Supports 7 monorepo types: pnpm, npm/yarn workspaces, Nx, Turborepo, Lerna, Cargo workspaces, Go multi-module, and Python uv.

### NotebookLM Research

Sync your vault to Google NotebookLM for docs-grounded research:

```bash
claude-dev-stack notebooklm sync
# Syncing 3 projects to per-project notebooks...
# cds__my-saas-app: 12 sources (3 new, 9 unchanged)
# cds__mobile-app: 5 sources (1 updated)
# cds__shared-lib: 2 sources (all current)
```

Each project gets its own `cds__{slug}` notebook. Hash-based delta sync — only changed files are re-uploaded. **Sync runs automatically on every session end** — your notebooks stay current without manual intervention.

Query your notebooks directly from Claude:

```
> "ask notebooklm what we decided about the auth flow"

Answer: In session 2026-04-11, you decided to use JWT with refresh tokens...
Citations: [sessions/2026-04-11-auth-flow.md, decisions/0003-jwt-auth.md]
```

Or from the CLI:

```bash
claude-dev-stack notebooklm ask "what's our API rate limiting strategy?"
claude-dev-stack notebooklm generate report    # AI-generated summary of your project
claude-dev-stack notebooklm generate mind-map  # Visual mind map of project knowledge
```

Upgrading from v0.8? Migrate existing sources safely:

```bash
claude-dev-stack notebooklm migrate           # dry-run — shows what would move
claude-dev-stack notebooklm migrate --execute  # two-phase-commit: upload+verify, then delete from shared
```

### Notion Auto-Import

Pull Notion docs into your vault without leaving the terminal:

```bash
claude-dev-stack notion add https://www.notion.so/workspace/API-Spec-abc123
claude-dev-stack notion import
```

Imported files land in `vault/projects/{slug}/docs/notion/` with provenance stamps. If you edit the imported file locally and Notion gets updated, re-import writes a `.notion-update.md` sibling instead of overwriting your changes.

In a live Claude session, you can also trigger imports via the `notion-importer` skill using MCP — no CLI needed.

### Multi-Project Workflow

Working across multiple projects in a session:

```
> "switch to mobile-app"
# Saves current context, loads mobile-app context

> "what did we decide about the auth flow?"
# Reads from mobile-app/decisions/ — finds ADR-003

> "switch back to my-saas-app"
# Restores previous context seamlessly
```

---

## What's Included

| Component | What it does |
|-----------|-------------|
| **Knowledge Vault** | Obsidian-compatible markdown vault — project context, session logs, ADRs, docs |
| **Session Hooks** | Auto-loads context at session start, reminds to log at session end |
| **Git Conventions** | Per-project `.claude/git-scopes.json` — auto-detected scopes, commit formats, branch conventions |
| **NotebookLM Sync + Query** | Per-project notebooks with auto-sync on session end, hash-based delta, query API (ask + generate), two-phase migration |
| **Notion Import** | Declare pages in `.claude/notion_pages.json`, import via CLI or MCP skill with overwrite protection |
| **Skills** | Session manager, project switcher, auto-router, dev-research, git-conventions, notion-importer |
| **GSD Workflow** | Spec-driven development with subagent orchestration (optional) |
| **Deep Research** | Structured web research — outlines, investigation, reports |
| **Plugins** | 98+ Claude Code plugins with use-case recommendations |
| **MCP Servers** | 18 pre-configured servers (GitHub, Postgres, Playwright, Slack, etc.) |
| **Templates** | Context.md generation for 14 stacks |
| **Doctor** | Health check for all components — prereqs, vault, skills, plugins, git-scopes, NotebookLM, Notion MCP |

---

## CLI Reference

### Setup

```bash
claude-dev-stack                           # Full interactive setup wizard
```

### Projects

```bash
claude-dev-stack projects                  # List projects with status
claude-dev-stack projects add              # Add a project to vault
claude-dev-stack projects remove           # Remove project from vault
```

### Git Conventions

```bash
claude-dev-stack scopes init               # Initialize git-scopes.json (--quick or --full mode)
claude-dev-stack scopes list               # Show current scopes and config
claude-dev-stack scopes add <name>         # Add a scope
claude-dev-stack scopes remove <name>      # Remove a scope
claude-dev-stack scopes refresh            # Re-detect scopes from project structure
```

### Notion Import

```bash
claude-dev-stack notion list               # Show configured Notion pages
claude-dev-stack notion add <url>          # Add Notion page to import config
claude-dev-stack notion import             # Import all configured pages (or --page <id>)
```

### NotebookLM

```bash
claude-dev-stack notebooklm sync           # Sync vault to per-project NotebookLM notebooks
claude-dev-stack notebooklm status         # Show sync status, file counts, stale files
claude-dev-stack notebooklm ask "question" # Query your notebook — returns answer + citations
claude-dev-stack notebooklm generate report     # Generate AI summary of project knowledge
claude-dev-stack notebooklm generate mind-map   # Generate visual mind map
claude-dev-stack notebooklm migrate        # Dry-run migration from shared to per-project notebooks
claude-dev-stack notebooklm migrate --execute  # Execute migration (two-phase-commit)
```

### Documents

```bash
claude-dev-stack docs                      # List documents per project
claude-dev-stack docs add                  # Add from files, Notion export, or paste
```

### Skills

```bash
claude-dev-stack skills                    # List installed skills
claude-dev-stack skills install            # Install from catalog or Git URL
claude-dev-stack skills remove             # Remove installed skills
```

### Plugins

```bash
claude-dev-stack plugins                   # List installed plugins
claude-dev-stack plugins install           # Install via preset or browse all 98+
claude-dev-stack plugins presets           # Install curated set (fullstack, frontend, backend, etc.)
claude-dev-stack plugins marketplaces      # Add third-party marketplaces (19 available)
```

### MCP Servers

```bash
claude-dev-stack mcp                       # List configured MCP servers
claude-dev-stack mcp install               # Install from catalog (18 servers)
claude-dev-stack mcp remove                # Remove MCP servers
```

### Templates

```bash
claude-dev-stack new                       # Generate context.md from stack template
```

14 stacks: Next.js, Nuxt, SvelteKit, Astro, React+Vite, FastAPI, Express, Laravel, Spring Boot, Rails, Django, Flutter, Go, Blank.

### Import & Export

```bash
claude-dev-stack import                    # Import AI configs from a project directory
```

Supports: `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `copilot-instructions.md`, `.clinerules`, `.aider.conf.yml`.

```bash
claude-dev-stack export                    # Export vault as .tar.gz
claude-dev-stack sync init                 # Initialize vault as git repo
claude-dev-stack sync push                 # Commit and push vault
claude-dev-stack sync pull                 # Pull latest from remote
```

### Maintenance

```bash
claude-dev-stack doctor                    # Health check for all components
claude-dev-stack update                    # Update skills, hooks, GSD, CLI
claude-dev-stack stats                     # Analytics dashboard
claude-dev-stack help                      # Show all commands
claude-dev-stack version                   # Show version
```

---

## Vault Structure

```
~/vault/
├── meta/
│   ├── project-registry.md          # All mapped projects
│   └── session-protocol.md          # Session conventions
├── shared/
│   ├── patterns.md                  # Reusable patterns across projects
│   └── infra.md                     # Infrastructure notes
├── research/                        # Deep Research outputs
├── projects/
│   ├── my-project/
│   │   ├── context.md               # ★ Project context (the most important file)
│   │   ├── sessions/                # Auto-generated session logs
│   │   ├── decisions/               # Architecture Decision Records
│   │   └── docs/                    # Documentation
│   │       └── notion/              # Notion auto-imports (with provenance stamps)
│   └── _template/
└── CLAUDE.md.template
```

| Folder | Content | Who creates it |
|--------|---------|---------------|
| `context.md` | Project overview, stack, architecture, current state | **You** (with Claude's help) |
| `sessions/` | Session logs: what was done, decisions, TODO | **Claude** (automatically via hooks) |
| `decisions/` | ADRs: why we chose X over Y | **Claude** (when decisions are made) |
| `docs/` | Documentation, specs, plans | **You** (via `docs add`) |
| `docs/notion/` | Notion page imports with provenance stamps | **Claude** (via `notion import` or skill) |

---

## How Skills Work

Skills are markdown files that tell Claude how to behave in specific situations. They auto-trigger based on what you say — no slash commands needed.

| Skill | Triggers on | What it does |
|-------|------------|-------------|
| **session-manager** | "hi", "let's continue", "done", "all set" | Loads context at start, creates session log at end |
| **project-switcher** | "switch to X", project name mentions | Saves current context, loads target project |
| **dev-router** | Any message | Routes to the right skill automatically |
| **git-conventions** | "commit this", "create a branch" | Reads `.claude/git-scopes.json`, produces `type(scope): subject` |
| **notion-importer** | "import notion docs" | Calls Notion MCP tools directly from session |
| **dev-research** | "check docs", "ask notebooklm" | Queries NotebookLM for docs-grounded answers |

Two hooks run at the Claude Code level for reliability (skills can be ignored by Claude, but hooks always fire):

| Hook | When | What |
|------|------|------|
| **session-start-context** | Session starts | Loads `context.md` + outstanding TODOs |
| **session-end-check** | Session ends | Reminds to create session log, auto-syncs vault to NotebookLM, auto-pushes vault git |

---

## For Teams

Every team member runs:

```bash
npx claude-dev-stack
```

To share the vault:

```bash
claude-dev-stack sync init     # Initialize vault as git repo
# Add remote, push to shared repo
# Each team member clones/pulls the vault
```

Session logs, ADRs, and context stay in sync. Each developer's Claude sessions contribute to a shared knowledge base.

---

## Dev Containers

Works inside VS Code dev containers and GitHub Codespaces. See [`examples/devcontainer/`](examples/devcontainer/) for a complete configuration.

```json
{
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22",
  "mounts": [
    "source=${localEnv:HOME}/.ssh,target=/home/node/.ssh,type=bind,readonly",
    "source=${localEnv:HOME}/.claude,target=/home/node/.claude,type=bind"
  ],
  "postCreateCommand": "npm install -g @anthropic-ai/claude-code && npx --yes claude-dev-stack"
}
```

With vault git sync, your context follows you between host and container automatically.

---

## Updating

```bash
npx claude-dev-stack update
```

Updates built-in skills, hooks, git-based skills (Obsidian, Deep Research), GSD, and Claude Code CLI.

---

## Requirements

- **Node.js 18+** — runtime
- **Git** — for vault sync and skill installation
- **Claude Code CLI** — for plugins and MCP server configuration
- **Python 3.10+** (optional) — for Deep Research and NotebookLM sync (`notebooklm-py`)

The wizard detects missing tools and shows install commands:
```
✘ node — not found
  ℹ Install: brew install node
```

---

## Credits

Built on top of:
- [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done) by TÂCHES — spec-driven development
- [Obsidian Skills](https://github.com/kepano/obsidian-skills) by kepano — vault file format support
- [Deep Research Skills](https://github.com/Weizhena/Deep-Research-skills) by Weizhena — structured research
- [notebooklm-py](https://github.com/teng-lin/notebooklm-py) by teng-lin — NotebookLM CLI wrapper

---

## Support

If this saves you time, consider buying me a coffee:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/enakoneschniy)

---

## License

MIT
