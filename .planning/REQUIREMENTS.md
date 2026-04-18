# Requirements: claude-dev-stack v1.0

**Defined:** 2026-04-17
**Core Value:** Claude Code can resume work across sessions as if it remembered everything.

## v1.0 Requirements

Requirements for v1.0 Full-Stack Evolution + GSD Independence. Each maps to roadmap phases.

### Production Hardening

- [x] **HARD-01**: User can configure S3 as vault backend via `cds vault setup --backend s3`
- [x] **HARD-02**: Vault data syncs to/from S3 with merge-on-download conflict resolution (no silent data loss)
- [x] **HARD-03**: WAL checkpoint executes before any S3 upload to prevent incomplete database transfer
- [x] **HARD-04**: `/cds-quick` dispatches through CLI `quick.ts` with cost_usd display (closes DEMO-01 partial)
- [x] **HARD-05**: Credential resolver supports OAuth token, API key, and environment variable fallback chain
- [ ] **HARD-06**: `claude-dev-stack@1.0.0` published to npm `@latest` tag with staged rollout (@next first)
- [ ] **HARD-07**: `cds-migrate` handles schema migration from 1.0.0-alpha.1 → 1.0.0 (not a stub)
- [ ] **HARD-08**: Docker UAT validates clean upgrade path from 1.0.0-alpha.1

### Memory Intelligence

- [x] **MEM-01**: User can search across all project vaults with `cds search --global <query>`
- [x] **MEM-02**: Cross-project search uses SQLite ATTACH with batching (groups of 9) for correctness
- [x] **MEM-03**: MCP adapter exposes `sessions.searchAll` tool for cross-project queries
- [x] **MEM-04**: Entity relationship graph computed via `getEntityGraph()` in @cds/core
- [x] **MEM-05**: MCP adapter exposes `memory.graph` tool returning entity-relation data
- [x] **MEM-06**: SessionStart hook auto-surfaces relevant past observations based on current project context
- [x] **MEM-07**: Auto-suggestion uses MiniSearch fuzzy matching + FTS5 exact search combination

### Developer Experience

- [x] **DX-01**: Web dashboard serves session analytics at `localhost` via `cds dashboard` command
- [x] **DX-02**: Dashboard displays session timeline, token usage, and cost breakdown per project
- [x] **DX-03**: Dashboard renders interactive entity relationship graph visualization
- [x] **DX-04**: Dashboard server manages its own lifecycle (PID file, clean shutdown, no stale processes)
- [x] **DX-05**: Plugin SDK defines manifest-only interface for third-party integrations (@cds/plugin-sdk)
- [x] **DX-06**: Stop hook supports plugin extension points for custom post-session actions
- [ ] **DX-07**: @cds/mcp-adapter listed on Smithery marketplace
- [ ] **DX-08**: @cds/mcp-adapter listed on official MCP Registry

### Core Infrastructure

- [x] **INFRA-01**: VaultBackend interface defined in @cds/core with `pull()`/`push()` methods
- [x] **INFRA-02**: FsBackend implements VaultBackend as no-op default (current behavior preserved)
- [x] **INFRA-03**: S3Backend implements VaultBackend in @cds/s3-backend package (AWS SDK isolated)

### GSD Independence

- [ ] **GSD-01**: GSD workflow engine forked/vendored into CDS codebase, upstream npm dependency removed
- [ ] **GSD-02**: `.planning/` directory relocated out of project git into vault (e.g., `vault/projects/X/planning/`)
- [ ] **GSD-03**: `cds.config.json` pointer in project repo references planning location in vault
- [ ] **GSD-04**: CDS CLI commands (`/cds-*`) replace all `/gsd-*` commands with mapping layer
- [ ] **GSD-05**: Deprecation notices on `/gsd-*` commands pointing to `/cds-*` equivalents
- [ ] **GSD-06**: Unified config system via `cds.config.json` with per-project override layers
- [ ] **GSD-07**: CDS update notification via `npm view` + cache file + statusline integration
- [ ] **GSD-08**: CDS statusline fully replaces GSD statusline (no dual display)

## v1.1 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Platform Expansion

- **PLAT-01**: RuntimeAdapter interface abstracts agent dispatch across AI runtimes
- **PLAT-02**: Gemini CLI runtime adapter via Vercel AI SDK + @ai-sdk/google
- **PLAT-03**: GitHub Copilot runtime adapter via @ai-sdk/openai (OpenAI-compatible endpoint)
- **PLAT-04**: Codex CLI runtime adapter via @ai-sdk/openai

### Advanced Storage

- **STOR-01**: S3 encryption-at-rest via KMS
- **STOR-02**: Cross-region replication for vault buckets
- **STOR-03**: S3-compatible alternative backends (R2, B2) documented

### Advanced Intelligence

- **INTEL-01**: Vector embeddings for semantic session search
- **INTEL-02**: Auto-bidirectional sync between vault and external sources

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Gemini/Copilot/Codex runtime adapters | Design-heavy, needs live validation. Deferred to v1.1. |
| Plugin sandboxing (vm2, isolated-vm) | Manifest-only model for v1.0 eliminates arbitrary code execution risk. |
| Vector embeddings | FTS5 BM25 is 95% as good at this data scale. MiniSearch covers fuzzy/suggest gap. |
| Cloud-hosted dashboard | Local-only dashboard for v1.0. Cloud hosting adds auth, hosting costs, security surface. |
| Real-time sync | Merge-on-download sufficient for single-user. Real-time = team feature. |
| S3 encryption via KMS | Default S3 SSE-S3 sufficient. KMS adds cost + config complexity. |
| Full GSD rewrite | Fork/vendor approach — keep working parts, fix pain points only (SEED-002 strategy). |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 43 | Complete |
| INFRA-02 | Phase 43 | Complete |
| INFRA-03 | Phase 44 | Complete |
| HARD-01 | Phase 44 | Complete |
| HARD-02 | Phase 44 | Complete |
| HARD-03 | Phase 44 | Complete |
| HARD-04 | Phase 46 | Complete |
| HARD-05 | Phase 46 | Complete |
| HARD-06 | Phase 55 | Pending |
| HARD-07 | Phase 55 | Pending |
| HARD-08 | Phase 55 | Pending |
| MEM-01 | Phase 45 | Complete |
| MEM-02 | Phase 43 | Complete |
| MEM-03 | Phase 45 | Complete |
| MEM-04 | Phase 43 | Complete |
| MEM-05 | Phase 45 | Complete |
| MEM-06 | Phase 45 | Complete |
| MEM-07 | Phase 45 | Complete |
| DX-01 | Phase 48 | Complete |
| DX-02 | Phase 48 | Complete |
| DX-03 | Phase 48 | Complete |
| DX-04 | Phase 48 | Complete |
| DX-05 | Phase 47 | Complete |
| DX-06 | Phase 47 | Complete |
| DX-07 | Phase 55 | Pending |
| DX-08 | Phase 55 | Pending |
| GSD-01 | Phase 50 | Pending |
| GSD-02 | Phase 51 | Pending |
| GSD-03 | Phase 51 | Pending |
| GSD-04 | Phase 52 | Pending |
| GSD-05 | Phase 52 | Pending |
| GSD-06 | Phase 53 | Pending |
| GSD-07 | Phase 54 | Pending |
| GSD-08 | Phase 54 | Pending |

**Coverage:**
- v1.0 requirements: 34 total
- Mapped to phases: 34
- Complete: 22
- Pending: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-18 — renamed v1.1→v1.0, added GSD Independence requirements (GSD-01..08), marked Phases 43-48 as Complete, renumbered Release to Phase 55*
