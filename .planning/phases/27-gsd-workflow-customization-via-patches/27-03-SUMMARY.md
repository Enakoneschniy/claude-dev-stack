# 27-03-SUMMARY.md

## What changed

- `/Users/eugenenakoneschniy/vault/shared/patterns.md` — appended
  `## GSD Local Patches (claude-dev-stack)` section (~75 lines).

## Verification

```
$ grep "^## " /Users/eugenenakoneschniy/vault/shared/patterns.md
## Docker / DevContainer
## MCP Configurations
## AI Content Pipeline Pattern
## Common Mistakes to Avoid
## Useful Prompts for Claude Code
## GSD Local Patches (claude-dev-stack)
```

All 5 pre-existing sections intact. New section appended at the end.

## Anchor heading used for idempotent re-runs

`## GSD Local Patches (claude-dev-stack)` — unique string, safe to grep
for in future idempotent updates.

## Sub-sections included

- Layout
- Resolution precedence (BUG-06 D-07)
- Interaction with `/gsd-update`
- When upstream GSD changes the patched workflow
- Testing
- References

## Notes

- The vault is a separate git repo (not this repo). This edit does NOT
  appear in `claude-dev-stack` git diff. Vault changes are committed via
  the vault's own session-end workflow.
- If the vault edit needs to be reverted, grep for the heading anchor
  above and delete from there to EOF.
