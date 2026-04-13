# CLAUDE.md — Project Intelligence Layer

## Language
Communication in  ru. Code in English.

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
- Code and comments in  en
- Communication in  ru

## Rules
- Do NOT delete code without explicit request
- On .env change → update .env.example
- On new dependency → explain in session log
- **TeamCreate worktrees**: do NOT modify shared `.planning/` root files (STATE.md, ROADMAP.md, REQUIREMENTS.md) from worktrees. Phase dirs OK. Team lead updates shared state after merge.
- **TeamCreate only for 2+ phases**: single phase = regular Agent, no TeamCreate overhead.

## References
- Vault: `/Users/eugenenakoneschniy/vault/`
- Registry: `/Users/eugenenakoneschniy/vault/meta/project-registry.md`
- Patterns: `/Users/eugenenakoneschniy/vault/shared/patterns.md`
- Skills: `/Users/eugenenakoneschniy/.claude/skills/`
