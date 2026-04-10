# Claude Dev Stack in Dev Containers

Example configuration for using Claude Dev Stack inside VS Code / GitHub Codespaces dev containers.

## Setup

1. Copy `devcontainer.json` to `.devcontainer/devcontainer.json` in your project
2. Open in VS Code → "Reopen in Container"
3. On first start, `postCreateCommand` will install Claude Code CLI and run the setup wizard

## How it works

### Mounts
- **~/.ssh** — mounted read-only so you can git push/pull vault using host's SSH keys
- **~/.claude** — mounted read-write so Claude Code settings, skills, plugins, and hooks persist across container rebuilds

### Environment
- **VAULT_PATH** — points to `/home/node/vault` inside the container

### Auto-sync
If you set up vault sync (`claude-dev-stack sync init` with a remote), hooks will:
- **On Claude start** → `git pull` latest vault from remote
- **On file write** → auto-commit and `git push`
- **On session end** → auto-log session and push

This means your vault stays synchronized between host and container automatically.

## Vault location options

### Option A: Vault on host (recommended for single user)
Add this mount:
```json
"source=${localEnv:HOME}/vault,target=/home/node/vault,type=bind,consistency=cached"
```

Remove `VAULT_PATH` from `containerEnv`.

### Option B: Vault in its own git repo (recommended for team)
Don't mount vault. Instead, let Claude Dev Stack clone it:
```bash
git clone git@github.com:your-team/vault.git ~/vault
```

Or automate in `postCreateCommand`:
```bash
"postCreateCommand": "git clone git@github.com:your-team/vault.git ~/vault && npx --yes claude-dev-stack"
```

### Option C: Vault inside the container (isolated per project)
Default — vault lives at `/home/node/vault` and is recreated each time container rebuilds. Use `sync init` with a private repo to persist it.

## Troubleshooting

**Permission denied on SSH:**
Make sure your host SSH keys exist at `~/.ssh/id_ed25519` or `~/.ssh/id_rsa`.

**Claude Code not found:**
The `postCreateCommand` installs it globally. If it fails, run manually:
```bash
npm install -g @anthropic-ai/claude-code
```

**Hooks not firing:**
Check `~/.claude/settings.json` inside the container. Run:
```bash
npx --yes claude-dev-stack doctor
```
