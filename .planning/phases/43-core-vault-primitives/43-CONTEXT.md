# Phase 43: Core Vault Primitives - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the `VaultBackend` interface in `@cds/core`, implement `FsBackend` as the no-op default, add `getEntityGraph()` for entity-relation data extraction, and add `searchAllProjects()` for cross-project search via SQLite ATTACH batching. These primitives are consumed by Phase 44 (S3 Backend), Phase 45 (Search + Graph + MCP Tools), and Phase 48 (Web Dashboard).

</domain>

<decisions>
## Implementation Decisions

### VaultBackend Interface
- **D-01:** VaultBackend defines `pull()` and `push()` methods that sync the **entire `sessions.db` file** (whole-file sync). No row-level or record-level sync — atomic file transfer is the abstraction unit.
- **D-02:** VaultBackend interface defines a `ConflictStrategy` enum (at minimum: `merge-by-uuid`, `last-write-wins`). Backends implement the chosen strategy. This keeps conflict handling consistent across all backends rather than being implementation-specific.
- **D-03:** `FsBackend` implements VaultBackend as a no-op — `pull()` and `push()` return immediately since the file is already local. This preserves zero-regression on existing behavior.

### Graph Data API
- **D-04:** `getEntityGraph()` returns **generic, framework-agnostic types**: `GraphNode { id, name, type, displayName }` and `GraphEdge { from, to, relationType, weight }`. NOT cytoscape-native JSON. Dashboard (Phase 48) is responsible for adapting to cytoscape format.
- **D-05:** Graph data is computed from the existing `entities` and `relations` tables in `sessions.db`. No new tables needed — it's a read-only aggregation.

### Cross-Project Search
- **D-06:** `searchAllProjects()` discovers project databases via **filesystem scan**: `~/vault/projects/*/sessions.db`. No registry lookup. Vault path comes from env var `VAULT_PATH` or default discovery chain (same as existing vault discovery).
- **D-07:** Uses SQLite `ATTACH` with batching in groups of 9 (per SQLite's per-connection ATTACH limit). Each batch is a separate query; results are merged and re-ranked in TypeScript.

### Code Organization
- **D-08:** New APIs go in **separate files**: `vault/graph.ts` (getEntityGraph) and `vault/multi-search.ts` (searchAllProjects). `sessions.ts` stays focused on single-project operations — no modifications needed.
- **D-09:** New files are re-exported through `vault/index.ts` (the existing public facade) and then through `src/index.ts` for consumer access.
- **D-10:** VaultBackend interface goes in a new `vault/backend.ts` file with `FsBackend` implementation alongside. S3Backend (Phase 44) will import the interface from here.

### Claude's Discretion
- Graph edge `weight` computation method (frequency-based, recency-based, or combined)
- Exact TypeScript generic signatures for VaultBackend methods
- Whether `searchAllProjects()` returns a combined `SearchHit[]` or a project-keyed `Map<string, SearchHit[]>`
- Test strategy (unit tests for graph/multi-search, integration test for ATTACH batching)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vault Architecture
- `packages/cds-core/src/vault/sessions.ts` — Existing SessionsDB interface, Entity/Relation types, openSessionsDB factory
- `packages/cds-core/src/vault/index.ts` — Public facade (barrel export). New files must be re-exported here.
- `packages/cds-core/src/vault/internal/db.ts` — Raw DB factory, PRAGMA tuning, FTS5 check, WAL mode
- `packages/cds-core/src/index.ts` — Package public surface. New vault exports flow through here.

### S3 Backend Stub
- `packages/cds-s3-backend/src/index.ts` — Current stub (7 lines). Phase 44 will implement VaultBackend here.

### Research
- `.planning/research/STACK.md` — cytoscape ^3.33.2, minisearch ^7.2.0 recommended
- `.planning/research/ARCHITECTURE.md` — VaultBackend as structural keystone, ATTACH batching pattern
- `.planning/research/PITFALLS.md` — WAL checkpoint before S3 upload, ATTACH limit of 10

### Seeds
- `.planning/seeds/SEED-003-vault-s3-storage-option.md` — S3 backend design (VaultBackend interface concept)
- `.planning/seeds/SEED-004-tiered-vault-sessions-auto-capture.md` — Tiered vault architecture, SQLite schema

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SessionsDB` interface (`sessions.ts:105-145`) — Established pattern for DB facade with typed methods. VaultBackend follows the same pattern.
- `openSessionsDB()` factory with per-path cache (`sessions.ts:166-168`) — Module-level `Map<string, SessionsDB>`. Multi-search needs to open multiple DBs; can reuse this cache.
- `Entity` and `Relation` types (`sessions.ts:76-97`) — Already defined; graph.ts reads these, no new types for DB rows.
- `searchObservations()` method — Existing FTS5 search on single DB; multi-search extends this pattern across DBs.

### Established Patterns
- **Barrel exports**: `vault/index.ts` re-exports from `sessions.ts` only. New files follow the same pattern.
- **Error hierarchy**: `VaultError > SchemaVersionError | FtsUnavailableError | DbOpenError`. New errors extend `VaultError`.
- **PRAGMA tuning**: All done in `internal/db.ts`. No PRAGMA changes needed for graph/search.
- **UUID primary keys**: Sessions use `randomUUID()`. Entities use auto-increment `id`. Relations use composite key.

### Integration Points
- `vault/index.ts` — Must add re-exports for `graph.ts` and `multi-search.ts` types and functions
- `src/index.ts` — Already does `export * from "./vault/index.js"` — new exports flow automatically
- `packages/cds-mcp-adapter/` — Phase 45 will add MCP tools that call these primitives (not in Phase 43 scope)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Research recommends cytoscape for headless graph computation and minisearch for fuzzy search, but those are Phase 45 consumer concerns. Phase 43 focuses on the data primitives that feed them.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 43-core-vault-primitives*
*Context gathered: 2026-04-17*
