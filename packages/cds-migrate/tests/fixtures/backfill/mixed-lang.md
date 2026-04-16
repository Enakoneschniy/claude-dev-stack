# Session: 2026-04-11 — OIDC + monorepo prep

## Done
- Switched GitHub Actions to OIDC (no more npm tokens)
- Prepared `packages/cds-core/` scaffold — PR #55
- Updated `bin/cli.mjs` to dispatch to `packages/*/dist/cli.js` dynamically

## Решения
- pnpm workspaces лучше npm workspaces — лучше caching
- better-sqlite3 над bun:sqlite (мы на Node)

## TODO
- [ ] Написать migration guide для v0 → v1 пользователей
