---
phase: 42-living-memory
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - bin/cli.mjs
  - hooks/session-start-context.sh
  - lib/install/claude-md.mjs
  - packages/cds-cli/src/memory.ts
  - packages/cds-cli/src/memory.test.ts
  - packages/cds-cli/src/search.ts
  - packages/cds-cli/src/search.test.ts
  - packages/cds-cli/src/stats.ts
  - packages/cds-cli/src/stats.test.ts
  - packages/cds-core/src/vault/sessions.ts
  - skills/cds-search/SKILL.md
  - skills/cds-stats/SKILL.md
  - tsup.config.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-04-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The Living Memory phase adds three new CLI subcommands (`memory`, `search`, `mem-stats`), two skill files, and related build config. The overall architecture is sound and the code is well-structured. Three logic bugs were found — none are security issues or crashes, but two silently return incorrect or misleadingly incomplete data to the user.

---

## Warnings

### WR-01: `searchObservations` post-filters after SQL LIMIT, can silently under-return

**File:** `packages/cds-core/src/vault/sessions.ts:343-358`

**Issue:** The SQL query fetches up to `limit` rows from the FTS index, then applies `sessionId` and `type` filters in JavaScript. If the caller passes `limit: 3` and the top 3 FTS hits all belong to a different session, the returned array will be empty even when matching observations exist. The filters should be pushed into SQL (or the SQL pre-fetch limit should be raised to compensate), otherwise callers cannot rely on receiving up to N matching results.

This directly affects `memory.ts` which calls `searchObservations('session', { sessionId: s.id, limit: 3 })` and expects up to 3 per-session hits.

**Fix:** Push the `sessionId` filter into the SQL WHERE clause:

```sql
-- replace the current searchStmt with a parameterised variant
SELECT o.id, o.session_id, o.type, o.content, o.entities, o.created_at,
       s.summary AS session_summary, bm25(observations_fts) AS rank
FROM observations_fts
JOIN observations o ON o.id = observations_fts.rowid
LEFT JOIN sessions s ON s.id = o.session_id
WHERE observations_fts MATCH ?
  AND (? IS NULL OR o.session_id = ?)
  AND (? IS NULL OR o.type = ?)
ORDER BY rank
LIMIT ?
```

Or, as a minimal in-TypeScript workaround, pre-fetch `limit * 10` from SQL before applying the JS filter when `sessionId` or `type` is set.

---

### WR-02: `topEntities` SQL counts entity table rows, not observation references — always returns count = 1 per entity

**File:** `packages/cds-core/src/vault/sessions.ts:279-281`

**Issue:** The prepared statement is:

```sql
SELECT name, COUNT(*) AS count FROM entities GROUP BY name ORDER BY count DESC LIMIT @limit
```

Because `name` is a UNIQUE column, every group has exactly one row, so `count` is always `1` and the `ORDER BY count DESC` ranking is meaningless. The stat advertised by D-145 ("top entities — most referenced") implies counting how many times each entity appears in observations (via the `entities` JSON array or the `relations` table), not counting entity table rows.

**Fix:** Count observation linkages. A straightforward approach uses the `relations` table or the JSON `entities` arrays in `observations`. Example using `relations`:

```sql
SELECT e.name, COUNT(*) AS count
FROM entities e
JOIN relations r ON r.from_entity = e.id OR r.to_entity = e.id
GROUP BY e.id
ORDER BY count DESC
LIMIT @limit
```

Alternatively, if entities are primarily tracked via the `observations.entities` JSON column, use:

```sql
SELECT e.name, COUNT(*) AS count
FROM entities e
JOIN json_each(o.entities) je ON je.value = e.id
JOIN observations o
GROUP BY e.id
ORDER BY count DESC
LIMIT @limit
```

Until fixed, the `cds-stats` dashboard and the `mem-stats` CLI will always display all entities tied at rank 1, making the "top entities" output misleading.

---

### WR-03: `memory.ts` uses literal `'session'` as FTS query — only surfaces observations containing the word "session"

**File:** `packages/cds-cli/src/memory.ts:24`

**Issue:**

```ts
const obs = db.searchObservations('session', { sessionId: s.id, limit: 3 });
```

`'session'` is passed as the FTS MATCH query. This restricts results to observations whose content includes the word "session". Any decision, bug, or pattern observation that does not contain that word will be silently excluded, so the topic excerpts injected into the Claude context at session start are not representative of what actually happened in that session.

**Fix:** Use a wildcard or broad FTS query to retrieve the most recent observations regardless of content, then limit by `sessionId`. The easiest correct approach is to bypass FTS entirely for per-session listing and use a direct SQL query ordered by `id DESC`:

```ts
// In SessionsDB interface, add:
listObservations(options: { sessionId: string; limit?: number }): Observation[];

// Implementation:
const listObsStmt = db.prepare(
  'SELECT id, session_id, type, content, entities, created_at ' +
  'FROM observations WHERE session_id = ? ORDER BY id DESC LIMIT ?'
);
```

Then in `memory.ts`:

```ts
const obs = db.listObservations({ sessionId: s.id, limit: 3 });
```

If adding a new DB method is out of scope, the minimal fix is to pass `'*'` as the FTS query (SQLite FTS5 wildcard) instead of `'session'`, though that changes ranking semantics. The cleanest fix is a dedicated `listObservations` method.

---

## Info

### IN-01: Commented-out `_project` parameter in `buildSessionsHandle` — minor dead code smell

**File:** `packages/cds-core/src/vault/sessions.ts:225`

**Issue:**

```ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildSessionsHandle(db: RawDatabase, _project: string): SessionsDB {
```

The `_project` parameter was introduced but is never used inside the function body. The eslint-disable comment acknowledges this. If the parameter has no planned future use it can be removed to reduce interface noise.

**Fix:** Remove the `_project` parameter and update the single call site at line 181:

```ts
const handle = buildSessionsHandle(raw);
```

If there is a planned future use (e.g., per-project prepared statement caching), add a brief comment explaining the intent.

---

_Reviewed: 2026-04-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
