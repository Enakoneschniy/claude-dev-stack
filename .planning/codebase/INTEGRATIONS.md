# External Integrations

**Analysis Date:** 2026-04-10

## APIs & External Services

**npm Registry:**
- Service: npm package registry (registry.npmjs.org)
- What it's used for: Package installation, skill installation, GSD updates
- SDK/Client: `npx` (built into Node.js ecosystem)
- Auth: `.npmrc` token (optional, for private packages)
- Files: `lib/update.mjs` (line 242: `npx get-shit-done-cc@latest`)

**GitHub:**
- Service: GitHub API + Git protocol
- What it's used for: Skill installation from git repos, vault sync
- SDK/Client: `git` CLI (spawned via `spawnSync`)
- Auth: `GIT_SSH_KEY` or `~/.ssh` (implicit)
- Files: `lib/skills.mjs` (skill installation via git clone), `lib/update.mjs` (git pull for skills)

**GitHub Actions:**
- Service: Continuous Integration
- What it's used for: Test matrix (Node 18/20/22), publish to npm
- Configuration: `.github/workflows/ci.yml`, `.github/workflows/publish.yml`
- Auth: OIDC trusted publishing (no npm token stored)
- Trust model: GitHub OIDC → npm trusted publishing

**Claude Code CLI:**
- Service: Local Anthropic Claude Code application
- What it's used for: MCP server management, plugin management, skill registration
- SDK/Client: `claude` command-line tool (must be installed separately)
- Detection: `hasCommand('claude')` checks `which claude`
- Files:
  - `lib/mcp.mjs` — MCP server list/install/remove (spawns `claude mcp` commands)
  - `lib/plugins.mjs` — Plugin list/install (spawns `claude plugin` commands)
  - `lib/update.mjs` (line 254: `claude update` check)

## MCP Servers Catalog

**18 MCP Servers** (curated catalog in `lib/mcp.mjs` lines 8-30):

**HTTP-based (hosted, no local setup):**
1. `sentry` — https://mcp.sentry.dev/mcp — Error tracking and performance monitoring
2. `linear` — https://mcp.linear.app/sse — Issue tracking and project management
3. `browserbase` — https://mcp.browserbase.com — Cloud browser automation

**NPX-based (local, no API key needed):**
4. `filesystem` — @anthropic-ai/mcp-filesystem — Read/write files outside project
5. `memory` — @anthropic-ai/mcp-memory — Persistent memory store across sessions
6. `fetch` — @anthropic-ai/mcp-fetch — HTTP fetch for web content
7. `playwright` — @anthropic-ai/mcp-playwright — Browser automation via Playwright
8. `puppeteer` — @anthropic-ai/mcp-puppeteer — Browser automation via Puppeteer
9. `postgres` — @anthropic-ai/mcp-postgres — PostgreSQL database access (needs DATABASE_URL)
10. `sqlite` — @anthropic-ai/mcp-sqlite — SQLite database access
11. `github` — @anthropic-ai/mcp-github — GitHub API integration (needs GITHUB_TOKEN)
12. `gitlab` — @anthropic-ai/mcp-gitlab — GitLab API integration (needs GITLAB_TOKEN)
13. `slack` — @anthropic-ai/mcp-slack — Slack workspace access (needs SLACK_TOKEN)
14. `google-drive` — @anthropic-ai/mcp-google-drive — Google Drive file access
15. `google-maps` — @anthropic-ai/mcp-google-maps — Google Maps API (needs GOOGLE_MAPS_API_KEY)
16. `brave-search` — @anthropic-ai/mcp-brave-search — Web search via Brave (needs BRAVE_API_KEY)
17. `exa` — @anthropic-ai/mcp-exa — AI-powered web search (needs EXA_API_KEY)
18. `everart` — @anthropic-ai/mcp-everart — AI image generation

## Plugin Marketplaces

**19 Third-party Plugin Marketplaces** (in `lib/plugins.mjs` lines 55-80):

**Core / Official:**
1. `superpowers-marketplace` (obra/superpowers-marketplace) — Curated plugins: TDD, debugging, episodic memory, Chrome control
2. `superpowers-dev` (obra/superpowers) — Superpowers core skills: TDD, debugging, collaboration
3. `anthropic-agent-skills` (anthropics/skills) — Official Anthropic skills: document processing, examples

**Subagent Collections:**
4. `voltagent-subagents` (VoltAgent/awesome-claude-code-subagents) — VoltAgent specialized subagents (core-dev, research, infra, lang)
5. `cc-marketplace` (ananddtyagi/cc-marketplace) — 50+ agents: backend, frontend, security, analytics, devops
6. `claude-night-market` (athola/claude-night-market) — Attune, memory-palace, sanctum, spec-kit plugins

**Domain-specific:**
7. `supabase-agent-skills` (supabase/agent-skills) — Supabase Postgres best practices
8. `payload-marketplace` (payloadcms/payload) — Payload CMS: collections, hooks, access control
9. `microsoft-docs-mcp` (MicrosoftDocs/mcp) — Microsoft docs: Azure, .NET, Windows API
10. `claude-marketplace-elixir` (bradleygolden/claude-marketplace-elixir) — Elixir/Phoenix: Credo, Dialyzer, Sobelow
11. `claude-code-lsps` (Piebald-AI/claude-code-lsps) — LSP servers for 20+ languages (Rust, Go, Java)

**Workflow & Templates:**
12. `claude-code-templates` (davila7/claude-code-templates) — DevOps, testing, project management, Next.js templates
13. `awesome-claude-skills` (ComposioHQ/awesome-claude-skills) — 107+ skills: business, dev, productivity integrations
14. `claude-skills-marketplace` (adrianpuiu/claude-skills-marketplace) — Community skill marketplace with validation
15. `happy-claude-skills` (iamzhihuix/happy-claude-skills) — Browser automation, video processing, WeChat writing

**Niche:**
16. `obsidian-skills` (kepano/obsidian-skills) — Obsidian vault format support
17. `hcp-terraform-skills` (hashicorp/hcp-terraform-skills) — HashiCorp Terraform Cloud skills
18. `n8n-skills` (czlonkowski/n8n-skills) — n8n workflow automation skills
19. `sap-skills` (secondsky/sap-skills) — SAP development skills

Management: `lib/plugins.mjs` lines 301-372 — Add/list marketplaces via `claude-dev-stack plugins marketplaces`

## Built-in Skills

**4 Built-in Skills** (in `lib/skills.mjs` lines 44-70, distributed via package):

1. `session-manager` (builtin) — Auto-manage session lifecycle (start, log, end)
2. `project-switcher` (builtin) — Switch between projects with context preservation
3. `dev-router` (builtin) — Auto-route messages to the right skill based on intent
4. `dev-research` (builtin) — NotebookLM integration for docs-grounded research

**Source:** `skills/{name}/SKILL.md` in package
**Installed to:** `~/.claude/skills/{name}/`
**Update mechanism:** `lib/update.mjs` copies from package to user directory

## External Skill Sources

**Known Skill Repositories** (in `lib/skills.mjs` lines 19-71):

1. `obsidian-skills` (kepano/obsidian-skills) — Obsidian vault format support
2. `deep-research` (Weizhena/Deep-Research-skills) — Web research, outlines, investigation, reports
3. `gsd` (npx:get-shit-done-cc@latest) — Get Shit Done spec-driven dev with subagent orchestration
   - Installation: via npx (not git clone)
   - Update command: `npx get-shit-done-cc@latest --claude --global` (lib/update.mjs:242)

## GSD Integration

**Get Shit Done (GSD):**
- Service: Spec-driven development subagent orchestrator
- Installation: `npx get-shit-done-cc@latest`
- CLI commands exposed: `/gsd-*` commands available when GSD installed
- Context: Loaded via `import('get-shit-done-cc')` when needed
- Files: `lib/skills.mjs` (GSD listed in catalog)

**GSD Subcommands mentioned:**
- `/gsd-map-codebase` — Analyze codebase for architecture/tech/quality/concerns
- `/gsd-plan-phase` — Create implementation plans from codebase analysis
- `/gsd-execute-phase` — Write code following conventions and patterns

## Data Import/Export Integrations

**Notion Export:**
- Format: Markdown .zip export
- Supported in: `lib/docs.mjs` (line 100+)
- Function: Parse and import project documentation

**AI Tool Config Imports:**
- Cursor: `.cursorrules`, `.cursor/rules`
- Windsurf: `.windsurfrules`
- GitHub Copilot: `.github/copilot-instructions.md`
- Cline: `.clinerules`
- Aider: `.aider.conf.yml`
- Import logic: `lib/import.mjs` lines 19-47

## Vault Sync & Git Integration

**Vault Repository:**
- Local directory: `$VAULT_PATH` (default `~/vault/`)
- Structure: `projects/{name}/`, `sessions/`, `decisions/`, `docs/`, `research/`
- Git integration: Optional (`claude-dev-stack sync init|push|pull`)
- Commands in: `lib/export.mjs` (sync subcommand routing)

## File Format Support

**Documents:**
- Markdown (`.md`) — Primary format
- Text (`.txt`)
- PDF (`.pdf`)
- HTML (`.html`)

**Supported in:** `lib/docs.mjs` line 30

## Authentication & Environment Variables

**Required Environment Variables:**

For MCP servers that need API keys:
- `DATABASE_URL` — For postgres MCP server
- `GITHUB_TOKEN` — For github MCP server
- `GITLAB_TOKEN` — For gitlab MCP server
- `SLACK_TOKEN` — For slack MCP server
- `GOOGLE_MAPS_API_KEY` — For google-maps MCP server
- `BRAVE_API_KEY` — For brave-search MCP server
- `EXA_API_KEY` — For exa MCP server

**Git Authentication:**
- SSH keys in `~/.ssh/` for git operations (implicit)

**npm Configuration:**
- `.npmrc` in home directory (optional, for private packages)

## CLI Tools Integration

**Commands spawned via spawnSync:**
- `which {name}` — Check if command exists
- `node --check {file}` — Syntax validation
- `node --test tests/*.test.mjs` — Test execution
- `claude mcp list|add|remove` — MCP server management
- `claude plugin list|install` — Plugin management
- `claude update` — Claude CLI update check
- `git clone|pull` — Skill and vault management
- `npx {package}` — Package execution (GSD, skills)

---

*Integration audit: 2026-04-10*
