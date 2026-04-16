# Phase 35: Tiered Vault — Tier 2 SQLite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 35-tiered-vault-tier-2-sqlite
**Areas discussed:** Node baseline + prebuild strategy, Schema migration mechanics, VAULT-03 boundary enforcement, Entity/relation schema normalization

---

## Pre-Discussion Investigation

- `better-sqlite3@12.9.0` (latest) engines: Node 20.x–25.x — INCOMPATIBLE with CDS Node 18 baseline
- `better-sqlite3@^11.10.0` — no engines restriction, supports Node 18
- Prebuild binaries available via `prebuild-install`, fallback is `node-gyp rebuild` (requires C++ toolchain)
- MIT license confirmed
- Node 18 EOL: 2025-04-30 (already passed)

---

## Gray Area Selection

**Question:** Какие gray areas обсудим для Phase 35?

| Option | Description | Selected |
|--------|-------------|----------|
| Node baseline + prebuild strategy (CRITICAL) | better-sqlite3@12 needs Node 20+ — conflicts with Node 18 baseline | ✓ |
| Schema migration mechanics | File naming, auto-run vs explicit, transactions | ✓ |
| VAULT-03 boundary enforcement | How to make raw db handle impossible to import | ✓ |
| Entity/relation schema normalization | JSON FK vs inline copy, open strings vs enum | ✓ |

**User's choice:** All four.

---

## Node Baseline + Prebuild Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Pin better-sqlite3@^11.10.0 + Node 18 | Keep baseline, older major of driver | |
| Bump CDS minimum to Node 20+ (breaking) (Recommended) | Align with Node LTS, use better-sqlite3@^12 | ✓ |
| Optional dep + graceful degrade | Complex, partial v1.0 functionality | |

**User's choice:** Bump CDS minimum to Node 20+ (breaking).
**Notes:** Node 18 already EOL. Alpha tag shields v0.12.x @latest users. v1.0 migration guide documents the bump. Additional task added to Phase 35 scope: amend Phase 33 Plan 04 CI matrix to drop Node 18, update root `package.json` engines.

---

## Schema Migration Mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Numbered .sql files + auto-migrate (Recommended) | `001-initial.sql` etc., run inside transaction on openSessionsDB | ✓ |
| .ts migration files + explicit migrate() | Data transforms possible but explicit call = footgun | |
| Hybrid: .sql for schema + .ts optional | 2 code paths | |

**User's choice:** Numbered .sql files + auto-migrate.
**Notes:** File naming `001-initial.sql`, `002-*.sql`. Runner reads `schema_version` table, applies pending in order inside single transaction. Forward-only. Files ship in npm tarball via `dist/vault/migrations/` (no bundler step needed).

---

## VAULT-03 Boundary Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Folder convention + no-reexport (Recommended) | `vault/internal/db.ts` + `vault/sessions.ts` + `vault/index.ts` | ✓ |
| package.json exports map (stricter) | Useful cross-package, overkill within private package | |
| Branded types without write methods | Casts bypass in 5 seconds — cosmetic only | |

**User's choice:** Folder convention + no-reexport.
**Notes:** `vault/internal/db.ts` (raw db, not exported), `vault/sessions.ts` (only writer), `vault/index.ts` (public facade). Regression test scans consumers for internal imports.

---

## Entity/Relation Schema Normalization

| Option | Description | Selected |
|--------|-------------|----------|
| FK refs in JSON + open-string types (Recommended) | `[entity_id, ...]` array in JSON, types as open strings | ✓ |
| Inline entity copy in JSON + closed enum | Denormalized, type-safe but brittle | |
| Full normalization + junction table | More joins, slower writes, diverges from REQ VAULT-02 | |

**User's choice:** FK refs in JSON + open-string types.
**Notes:** `observations.entities` = JSON array of integer entity IDs. `entities.type` / `relations.relation_type` = open string (LLM extraction flexibility). `CANONICAL_ENTITY_TYPES` exported as autocomplete hint only. FTS5 virtual table uses external-content pattern with denormalized `session_summary` column.

---

## Claude's Discretion

- Exact PRAGMA settings (journal_mode=WAL, synchronous=NORMAL, foreign_keys=ON, cache_size)
- `CANONICAL_ENTITY_TYPES` shape (readonly string[] vs branded union type)
- Interface shapes for `Session`, `Observation`, `Entity`, `Relation`
- Error class hierarchy (`VaultError` base + subtypes)
- `sessions.search` options (limit, filters)
- `sessions.timeline` default window size

## Deferred Ideas

- **Phase 36:** First consumer of `createSession`, `appendObservation`, `upsertEntity`
- **Phase 37:** MCP tools `sessions.search`, `sessions.timeline`, `sessions.get_observations`
- **Phase 38:** Backfill markdown → SQLite via Haiku extraction
- **v1.1+:** `reverseProjectMap` integration, encryption at rest, node:sqlite migration

---

*Generated: 2026-04-16*
