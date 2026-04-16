# Phase 37 Plan 02 — Summary

**Commit:** 36df2da
**Tasks completed:** 7 of 7

## Per-tool final SQL

### `sessions.search`

```sql
SELECT
  o.id             AS observation_id,
  o.session_id     AS session_id,
  o.type           AS type,
  o.content        AS content,
  o.entities       AS entities,
  o.created_at     AS created_at,
  bm25(observations_fts) AS rank
FROM observations_fts
JOIN observations o ON o.id = observations_fts.rowid
WHERE observations_fts MATCH @match
  AND (@date_from IS NULL OR o.created_at >= @date_from)
  AND (@date_to   IS NULL OR o.created_at <= @date_to)
  AND (@session_id IS NULL OR o.session_id = @session_id)
  AND (@types_json IS NULL OR o.type IN (SELECT value FROM json_each(@types_json)))
ORDER BY rank
LIMIT @limit
```

Named-parameter binding (`@match`, `@date_from`, …) keeps the statement
readable in the face of 6 bindings.

### `sessions.timeline`

Three prepared statements — anchor lookup, before window, after window:

```sql
-- anchor
SELECT id, session_id, type, content, entities, created_at
  FROM observations WHERE id = ?;

-- before (DESC, then reversed in JS)
SELECT ... FROM observations
  WHERE session_id = ?
    AND (created_at < ? OR (created_at = ? AND id < ?))
  ORDER BY created_at DESC, id DESC
  LIMIT ?;

-- after (ASC)
SELECT ... FROM observations
  WHERE session_id = ?
    AND (created_at > ? OR (created_at = ? AND id > ?))
  ORDER BY created_at ASC, id ASC
  LIMIT ?;
```

Tie-break by `id` per RESEARCH §7. `offset` computed in JS after concat
(`-N..-1, 0, 1..+N`).

### `sessions.get_observations`

```sql
SELECT id, session_id, type, content, entities, created_at
  FROM observations
  WHERE id IN (SELECT value FROM json_each(?))
  ORDER BY id ASC;
```

Binding: `JSON.stringify(args.ids.slice(0, 50))`. Missing IDs silently
drop; `ORDER BY id ASC` produces the stable test-friendly output shape
used in VALIDATION §6.3(c).

## BM25 ranking observations

Fixture with two observations that match `'hook'` — one repeats the token
3× and the other once — returned the repetitive one first (lower rank).
Matches the expected FTS5 BM25 behavior.

## Schema duplication vs Phase 35

`__fixtures__/build-sessions-db.ts` re-declares the Phase 35 schema
(tables, indexes, FTS5 virtual table, triggers) inline instead of reusing
`@cds/core/src/vault/internal/migrations/001-initial.sql`. This is
intentional for test isolation but flagged as tech debt:

> Replace with `openSessionsDB(tmpPath)` (or a dedicated
> `migrate(dbPath, version)` helper) once `@cds/core` exposes one of the
> two for test reuse.

Tokenizer chosen: `porter unicode61` (identical to core). Keeps FTS
behaviour in tests equivalent to production.

## Test counts

| File                                                 | Tests passing |
|------------------------------------------------------|---------------|
| `src/mcp-tools/sessions-search.test.ts`              | 12            |
| `src/mcp-tools/sessions-timeline.test.ts`            | 8             |
| `src/mcp-tools/sessions-get-observations.test.ts`    | 8             |

**Plan 02 total: 28 tests.** Together with Plan 01 cases
(`index.test.ts` + `mcp-server.test.ts` + integration = 8), the
`@cds/cli` package now has **36 tests passing**.

## Deviations from plan

- **FTS5 error classification** — plan told us to look for substrings
  `fts5` or `syntax` in the SqliteError message. In practice
  better-sqlite3 surfaces some FTS5 failures as `SQLITE_ERROR` with
  `unterminated string` text that contains neither word. I broadened the
  check to treat **any `SQLITE_ERROR` from the MATCH query as an
  `InvalidFilterError`**, since the only user-controlled binding in the
  SQL is the MATCH expression. `SQLITE_NOTADB` still routes to
  `VaultNotFoundError`; anything else re-throws.
- **Timeline seed size** — plan suggested 10 observations. With
  `anchor_observation_id=6`, `window_before=5`, `window_after=5` that
  yields 10 items (5 + anchor + 4), not the plan's stated 11. Bumped the
  seed to **11 observations** so the default-window test can genuinely
  exercise both sides of the window at their clamps, and adjusted the
  "near end" case to use `anchor=10` (so it stays asymmetric).
- **Summary format returns `{id, type, content, entities}` only** per
  D-79. Test asserts `session_id` and `created_at` are absent from the
  summary payload.
- **No actual statement-cache WeakMap across `dbPath` calls** — each
  call that opens its own handle prepares + discards within the same
  try/finally. Statement cache is used only when callers inject
  `{ db }` (the MCP server path + tests). Documented inline.
- **No watch-mode flags**, all tests exit fast (≤ 4s full suite).
