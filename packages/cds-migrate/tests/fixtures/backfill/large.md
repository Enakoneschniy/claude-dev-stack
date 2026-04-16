# Session: 2026-04-13 — Long multi-topic synthesis

## Что сделано
- Переписали session-start-context.sh на Node.js, чтобы избавиться от хрупкой shell-экранизации и связать хук с общей библиотекой форматирования.
- Убрали дублирование переменных окружения — теперь всё централизовано в `lib/session-context.mjs`. Конфиг читается один раз, результат кешируется в памяти процесса на время сессии.
- PR #42 замерджен после двухдневного код-ревью. В процессе всплыли три edge-кейса, которые ранее приводили к тихому пропуску контекста (race на Stop hook, пустой CLAUDE.md, кривой сим-линк в `.claude/`).
- Switched GitHub Actions to OIDC (no more npm tokens, rotated credentials everywhere).
- Prepared `packages/cds-core/` scaffold — PR #55 — with TypeScript strict mode, Vitest, and a minimal `agent-dispatcher.ts` stub that the Phase 34 plan later turned into a real wrapper.
- Updated `bin/cli.mjs` to dispatch to `packages/*/dist/cli.js` dynamically so new packages (cds-migrate, cds-mcp, cds-cli) can register commands without touching the root entry.
- Verified end-to-end flow against a staging vault: session-start loads context, session-end saves, and the Stop hook appends observations.

## Решения
- pnpm workspaces лучше npm workspaces — лучше caching, детерминированный lockfile и fewer footguns around phantom dependencies.
- better-sqlite3 над bun:sqlite — мы на Node, bun:sqlite требует Bun runtime, которого у пользователей может не быть.
- Оставляем shell-версию session-start-context как fallback до v1.0 — upgrade path: users can point at the Node version when they upgrade @cds/core globally.
- В CLAUDE.md задокументировано переключение между shell и Node-версиями хука, включая сравнительную таблицу и troubleshooting.
- Haiku 4.5 выбрана как дефолтная модель для extraction: самая дешёвая, structured-output стабилен, latency ~1.5s на средний transcript.
- Per-session transactions — если Haiku извлечение сломается на одном файле, это не должно откатывать уже замигрированные сессии.

## Проблемы
- На macOS readline себя ведёт иначе, чем в Linux — раскопали неделю назад. Workaround через `readline-sync` добавлен, но долгосрочно надо переходить на Inquirer/Prompts.
- GitHub Actions matrix (18/20/22) иногда флейкает на Windows из-за разного line-endings поведения — disabled на Windows пока не разберёмся.
- `npm pack --dry-run` показывает неожиданные файлы в тарболе (старые .DS_Store), прошлись по `.npmignore`.

## TODO
- [ ] Написать migration guide для v0 → v1 пользователей с примерами up/downgrade.
- [ ] Добавить `claude-dev-stack doctor --deep` который проверяет schema integrity и orphan observations.
- [ ] Посмотреть, как сделать `--all-projects` флаг для миграции — итерирует по каждому vault/projects/*.
- [ ] Research: что делать с decisions/*.md (отдельный тип документа, не сессии).
- [ ] Verify on a fresh install that `claude-dev-stack migrate sessions --dry-run` works before `--apply`.
- [ ] Consider adding a `--max-cost` flag that asks for confirmation if estimated spend exceeds some threshold.

## Notes for future self
The backfill migration phase is intentionally limited to per-project invocation to keep the mental model simple. Batching across projects means thinking about partial failures at a different scope — deferred to v1.1. Also worth remembering that the source markdown is frozen (read-only) — SQLite is a derived view. If we ever want to write back into markdown we need a separate phase with careful merge logic.

Claude Code quirks observed during this session:
- Stop hook fires twice sometimes when the session ends with `/exit` — defensive idempotency via sessions.id UNIQUE prevents double-insert but wastes one Haiku call.
- `CLAUDE_SESSION_ID` env var not always present on the Stop hook invocation — depends on how Claude Code was launched (VSCode extension vs CLI vs background task). Fallback to a UUID if missing.
- Tool-use blocks from the transcript sometimes have truncated input when output exceeds the SDK's internal cap — we handle via `[ToolName] {truncated}` summary.

Cost tracking sanity check for today:
- 18 Haiku calls @ avg $0.013 = $0.234
- 3 Sonnet calls for code review @ avg $0.09 = $0.27
- Total session cost ~$0.50 which is within budget.

Random additional English content to make sure we hit the 500-char Latin minimum: the quick brown fox jumps over the lazy dog; all work and no play makes Jack a dull boy; we the people of the United States in order to form a more perfect union establish justice insure domestic tranquility provide for the common defense promote the general welfare and secure the blessings of liberty to ourselves and our posterity do ordain and establish this Constitution for the United States of America.
