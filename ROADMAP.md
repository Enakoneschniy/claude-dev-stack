# Roadmap — Claude Dev Stack

## v0.2 — Setup & UX ✅
- [x] Interactive setup wizard (npx)
- [x] Knowledge Vault with project context
- [x] GSD, Obsidian Skills, Deep Research, NotebookLM
- [x] Custom skills (session manager, project switcher, auto-router)
- [x] Arrow-key multiselect for components
- [x] Smart project directory scanning
- [x] Tab completion for all path inputs
- [x] Claude Code plugin installation (official + external)
- [x] Install hints for missing prerequisites
- [x] Dynamic plugin list from marketplace
- [x] Getting Started guide after setup

## v0.3 — Project & Skills Management ✅
- [x] `claude-dev-stack projects` — list projects with status (context filled, sessions, ADRs)
- [x] `claude-dev-stack projects add` / `add-project` — add project to vault
- [x] `claude-dev-stack projects remove` / `remove-project` — remove from vault
- [x] `claude-dev-stack skills` — list installed skills
- [x] `claude-dev-stack skills install` — install from catalog + custom Git URL
- [x] `claude-dev-stack skills remove` — remove installed skills
- [x] `claude-dev-stack doctor` — health check (prereqs, vault, skills, plugins, settings)
- [x] `claude-dev-stack update` — update git-based skills, GSD, Claude CLI
- [x] `claude-dev-stack help` — structured command reference
- [x] Use-case based plugin recommendations (fullstack, frontend, backend, etc.)

## v0.4 — Import & Migration ✅
- [x] `claude-dev-stack import` — scan project for AI configs, import into vault
  - Supports: CLAUDE.md, .cursorrules, .windsurfrules, copilot-instructions.md, .clinerules, .aider.conf.yml
  - Auto-detects, multiselect, generates context.md, saves raw imports
- [x] `claude-dev-stack export` — export vault as .tar.gz
- [x] `claude-dev-stack sync init` — initialize vault as git repo with .gitignore
- [x] `claude-dev-stack sync push` — commit and push vault
- [x] `claude-dev-stack sync pull` — pull latest from remote
- [x] `claude-dev-stack sync status` — show uncommitted changes

## v0.5 — Plugin Ecosystem ✅
- [x] `claude-dev-stack plugins` — list installed plugins
- [x] `claude-dev-stack plugins install` — install via preset or browse all
- [x] `claude-dev-stack plugins presets` — curated sets (fullstack, frontend, backend, mobile, data, devops)
- [x] `claude-dev-stack plugins marketplaces` — add 19 third-party marketplaces
  - superpowers, voltagent, cc-marketplace, claude-night-market, supabase, payload,
    microsoft-docs, elixir, LSPs, terraform, n8n, SAP, obsidian, and more
- [x] `claude-dev-stack mcp` — list, install, remove MCP servers from curated catalog
  - 18 servers: filesystem, memory, fetch, playwright, postgres, sqlite, github,
    gitlab, slack, google-drive, brave-search, sentry, linear, and more
- [ ] Per-project plugin configuration

## v0.6 — Templates & Starters ✅
- [x] `claude-dev-stack new` — generate context.md from stack template
  - Stacks: Next.js, React+Vite, FastAPI, Express, Rails, Django, Flutter, Go, Blank
  - Save to vault, current directory, or print to console
- [ ] ADR templates by project type
- [ ] Custom skill scaffolding

## v0.7 — Analytics & Insights
- [ ] Session statistics (time, tokens, commits per project)
- [ ] Context quality score for vault files
- [ ] Stale context detection (outdated context.md)
- [ ] Recommendations based on usage patterns

## Ideas / Backlog
- Interactive TUI dashboard for vault browsing
- Obsidian plugin for vault visualization
- VS Code extension integration
- CI/CD integration (auto-update context on deploy)
- Multi-vault support (work + personal)
- Encrypted vault for sensitive projects
- Webhook notifications on session end
