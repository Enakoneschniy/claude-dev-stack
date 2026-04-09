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

## v0.4 — Import & Migration
- [ ] Import existing CLAUDE.md into vault context
- [ ] Import from other AI dev tools (Cursor rules, Windsurf, etc.)
- [ ] Export vault to share with team members
- [ ] Sync vault via git (team collaboration)

## v0.5 — Plugin Ecosystem
- [ ] Third-party marketplace support (voltagent, supabase, payload, etc.)
- [ ] Plugin presets (e.g. "fullstack", "data-science", "devops")
- [ ] Per-project plugin configuration
- [ ] MCP server management (install, configure, list)

## v0.6 — Templates & Starters
- [ ] Project templates (Next.js, FastAPI, etc.) with pre-configured context.md
- [ ] CLAUDE.md templates for common stacks
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
