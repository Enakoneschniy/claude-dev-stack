# 🧠 Claude Dev Stack

**One command to set up a complete AI-powered development workflow with Claude Code.**

Solves the #1 problem: Claude Code forgets everything between sessions.

```bash
npx claude-dev-stack
```

Works on Mac, Linux, and Windows (WSL).

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/enakoneschniy)

---

## What It Does

An interactive wizard that installs and configures everything you need:

| Component | What it does |
|-----------|-------------|
| **Knowledge Vault** | Obsidian-compatible markdown vault — project context, session logs, ADRs, docs |
| **Session Hooks** | Auto-loads context at session start, auto-logs at session end |
| **GSD (Get Shit Done)** | Spec-driven development with subagent orchestration |
| **Obsidian Skills** | Official skills from Obsidian's CEO — vault file format support |
| **Custom Skills** | Session manager, project switcher, auto-router, dev-research |
| **Deep Research** | Structured web research from terminal — outlines, investigation, reports |
| **NotebookLM** | Docs-grounded research via Google NotebookLM |
| **Plugins** | 98+ Claude Code plugins with use-case based recommendations |
| **MCP Servers** | 18 pre-configured servers (GitHub, Postgres, Playwright, etc.) |

## How It Works

You just talk to Claude Code naturally:

| You say | Claude does |
|---------|------------|
| "hi, let's continue" | Loads project context + last session TODO |
| "build user auth with email" | GSD plans → executes → commits |
| "research best CMS options" | Deep Research → structured report |
| "switch to my-other-project" | Saves context, loads other project |
| "done for today" | Creates session log, updates context |

**No slash commands needed.** Skills activate automatically. Hooks guarantee session logging.

---

## Quick Start

### 1. Install

```bash
npx claude-dev-stack
```

The wizard will guide you through:
1. Language preferences
2. Project directory scanning
3. Component selection (multiselect with arrows)
4. Plugin installation (with recommendations for your stack)
5. Vault creation and CLAUDE.md installation

### 2. Fill in context.md

This is the **most important step**. Open each project's context.md and describe:
- What the project does
- Tech stack
- Architecture
- Current state

```bash
# Let Claude help you fill it in:
cd ~/Projects/my-project && claude
> "help me fill in context.md for this project"
```

### 3. Open vault in Obsidian

1. Download [Obsidian](https://obsidian.md) (free)
2. File → Open Vault → `~/vault`
3. Browse projects, session logs, and decisions visually

### 4. Start working

```bash
cd ~/Projects/my-project && claude
> "let's continue"   # loads context automatically
# ... work ...
> "done for today"    # logs session automatically
```

---

## CLI Commands

### Setup

```bash
claude-dev-stack                        # Full interactive setup wizard
```

### Projects

```bash
claude-dev-stack projects               # List projects with status
claude-dev-stack projects add           # Add a project to vault
claude-dev-stack projects remove        # Remove project from vault
```

### Documents

```bash
claude-dev-stack docs                   # List documents per project
claude-dev-stack docs add               # Add docs from files, Notion export, or paste
```

Import from Notion:
1. In Notion: click `•••` → Export → Markdown & CSV
2. Unzip the downloaded file
3. `claude-dev-stack docs add` → select project → Notion export → point to folder

### Skills

```bash
claude-dev-stack skills                 # List installed skills
claude-dev-stack skills install         # Install from catalog or custom Git URL
claude-dev-stack skills remove          # Remove installed skills
```

### Plugins

```bash
claude-dev-stack plugins                # List installed plugins
claude-dev-stack plugins install        # Install via preset or browse all 98+
claude-dev-stack plugins presets        # Install curated set (fullstack, frontend, etc.)
claude-dev-stack plugins marketplaces   # Add third-party marketplaces (19 available)
```

**Presets:** fullstack, frontend, backend, mobile, data, devops — each pre-selects relevant plugins.

### MCP Servers

```bash
claude-dev-stack mcp                    # List configured MCP servers
claude-dev-stack mcp install            # Install from catalog (18 servers)
claude-dev-stack mcp remove             # Remove MCP servers
```

Available: filesystem, memory, playwright, postgres, sqlite, github, gitlab, slack, google-drive, sentry, linear, brave-search, and more.

### Templates

```bash
claude-dev-stack new                    # Generate context.md from stack template
```

Stacks: Next.js, React+Vite, FastAPI, Express, Rails, Django, Flutter, Go, Blank.

### Import & Export

```bash
claude-dev-stack import                 # Import AI configs from a project directory
```

Supports: `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `copilot-instructions.md`, `.clinerules`, `.aider.conf.yml`.

```bash
claude-dev-stack export                 # Export vault as .tar.gz
claude-dev-stack sync init              # Initialize vault as git repo
claude-dev-stack sync push              # Commit and push vault
claude-dev-stack sync pull              # Pull latest vault from remote
claude-dev-stack sync status            # Show uncommitted changes
```

### Maintenance

```bash
claude-dev-stack doctor                 # Health check (prereqs, vault, skills, plugins)
claude-dev-stack update                 # Update all components (skills, hooks, GSD, CLI)
claude-dev-stack stats                  # Analytics dashboard
claude-dev-stack help                   # Show all commands
claude-dev-stack version                # Show version
```

---

## Vault Structure

```
~/vault/
├── meta/
│   ├── project-registry.md       # All projects
│   └── session-protocol.md       # Session conventions
├── shared/
│   ├── patterns.md               # Reusable patterns across projects
│   └── infra.md                  # Infrastructure notes
├── research/                     # Deep Research outputs
├── projects/
│   ├── my-project/
│   │   ├── context.md            # ★ Project context (fill this in!)
│   │   ├── sessions/             # Auto-generated session logs
│   │   ├── decisions/            # Architecture Decision Records
│   │   └── docs/                 # Documentation, plans, specs
│   ├── another-project/
│   └── _template/
└── CLAUDE.md.template
```

### What goes where

| Folder | Content | Who creates it |
|--------|---------|---------------|
| `context.md` | Project overview, stack, architecture, current state | **You** (with Claude's help) |
| `sessions/` | Session logs: what was done, decisions, TODO | **Claude** (automatically) |
| `decisions/` | ADRs: why we chose X over Y | **Claude** (when architectural decisions are made) |
| `docs/` | Documentation, Notion exports, plans, specs | **You** (via `claude-dev-stack docs add`) |
| `shared/` | Cross-project patterns, infra notes | **You** or **Claude** |

---

## Automatic Hooks

Two hooks are installed into Claude Code settings to ensure reliability:

| Hook | Event | What it does |
|------|-------|-------------|
| **session-start-context** | SessionStart | Loads project context.md + shows outstanding TODOs |
| **session-end-check** | Stop | If no session log exists for today → reminds Claude to create one |

These work at the Claude Code level — skills can be ignored by Claude, but hooks always fire.

---

## For Teams

Every team member runs:

```bash
npx claude-dev-stack
```

To share vault across the team:

```bash
claude-dev-stack sync init    # Initialize vault as git repo
# Add remote, push to shared repo
# Each team member pulls the vault
```

---

## Updating

When new versions are released with bug fixes and improvements:

```bash
npx claude-dev-stack update
```

This updates:
- Builtin skills (session-manager, dev-router, project-switcher)
- Hooks (session start/end)
- Git-based skills (obsidian, deep-research)
- GSD
- Claude Code CLI

---

## Requirements

- Node.js 18+
- Git
- Python 3.10+ (optional, for Deep Research and NotebookLM)
- [Claude Code CLI](https://docs.claude.com) (for plugins and MCP)

Missing something? The wizard shows install commands:
```
✘ node — not found
  ℹ Install: brew install node
```

---

## Credits

Built on top of:
- [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done) by TÂCHES
- [Obsidian Skills](https://github.com/kepano/obsidian-skills) by kepano
- [Deep Research Skills](https://github.com/Weizhena/Deep-Research-skills) by Weizhena
- [notebooklm-py](https://github.com/teng-lin/notebooklm-py) by teng-lin

---

## Support

If this saves you time, consider buying me a coffee:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/enakoneschniy)

---

## License

MIT
