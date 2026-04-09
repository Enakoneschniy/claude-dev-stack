# Contributing to Claude Dev Stack

Thanks for your interest in contributing! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/Enakoneschniy/claude-dev-stack.git
cd claude-dev-stack
npm install
node bin/cli.mjs help    # verify it works
```

## Project Structure

```
bin/cli.mjs          — CLI entry point, subcommand routing
bin/install.mjs      — Full setup wizard
lib/                 — Feature modules (one per command group)
hooks/               — Claude Code hooks (bash scripts)
skills/              — Builtin SKILL.md files
templates/           — Vault file templates
```

## How to Contribute

### Bug Fixes
1. Fork the repo
2. Create a branch: `git checkout -b fix/description`
3. Fix the bug, test locally with `node bin/cli.mjs <command>`
4. Commit with conventional commits: `fix: description`
5. Open a PR

### New Features
1. Open an issue first to discuss the idea
2. Fork and create a branch: `git checkout -b feat/description`
3. Implement the feature
4. Test locally
5. Commit: `feat: description`
6. Open a PR

### New Stack Templates
Add your template to `lib/templates.mjs` in the `STACK_TEMPLATES` object. Follow the existing format.

### New MCP Servers
Add to the `MCP_CATALOG` array in `lib/mcp.mjs`.

### New Marketplaces
Add to the `KNOWN_MARKETPLACES` array in `lib/plugins.mjs`.

### New Skill Sources
Add to the `SKILL_CATALOG` array in `lib/skills.mjs`.

## Code Style

- JavaScript ESM (.mjs files)
- No linter — keep it simple and readable
- Single dependency: `prompts`
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`

## Testing

```bash
node bin/cli.mjs help           # CLI works
node bin/cli.mjs doctor         # Health check
node bin/cli.mjs skills         # Skills list
node bin/cli.mjs plugins        # Plugins list
node --check bin/cli.mjs        # Syntax check
node --check lib/*.mjs          # Syntax check all modules
```

## Release Process

1. Bump version in `package.json`
2. Commit: `chore: release vX.Y.Z`
3. `npm publish --access public`
4. Create GitHub release with changelog
