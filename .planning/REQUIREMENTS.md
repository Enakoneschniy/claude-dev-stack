# Requirements: claude-dev-stack v1.1

**Defined:** 2026-04-17
**Core Value:** Claude Code can resume work across sessions as if it remembered everything.

## v1.1 Requirements

Requirements for v1.1 Full-Stack Evolution. Each maps to roadmap phases.

### Production Hardening

- [ ] **HARD-01**: User can configure S3 as vault backend via `cds vault setup --backend s3`
- [ ] **HARD-02**: Vault data syncs to/from S3 with merge-on-download conflict resolution (no silent data loss)
- [ ] **HARD-03**: WAL checkpoint executes before any S3 upload to prevent incomplete database transfer
- [ ] **HARD-04**: `/cds-quick` dispatches through CLI `quick.ts` with cost_usd display (closes DEMO-01 partial)
- [ ] **HARD-05**: Credential resolver supports OAuth token, API key, and environment variable fallback chain
- [ ] **HARD-06**: `claude-dev-stack@1.1.0` published to npm `@latest` tag with staged rollout (@next first)
- [ ] **HARD-07**: `cds-migrate` handles schema migration from 0.12.x → 1.1.0 (not a stub)
- [ ] **HARD-08**: Docker UAT validates clean upgrade path from 0.12.x and 1.0.0-alpha.1

### Memory Intelligence

- [ ] **MEM-01**: User can search across all project vaults with `cds search --global <query>`
- [ ] **MEM-02**: Cross-project search uses SQLite ATTACH with batching (groups of 9) for correctness
- [ ] **MEM-03**: MCP adapter exposes `sessions.searchAll` tool for cross-project queries
- [ ] **MEM-04**: Entity relationship graph computed via `getEntityGraph()` in @cds/core
- [ ] **MEM-05**: MCP adapter exposes `memory.graph` tool returning entity-relation data
- [ ] **MEM-06**: SessionStart hook auto-surfaces relevant past observations based on current project context
- [ ] **MEM-07**: Auto-suggestion uses MiniSearch fuzzy matching + FTS5 exact search combination

### Developer Experience

- [ ] **DX-01**: Web dashboard serves session analytics at `localhost` via `cds dashboard` command
- [ ] **DX-02**: Dashboard displays session timeline, token usage, and cost breakdown per project
- [ ] **DX-03**: Dashboard renders interactive entity relationship graph visualization
- [ ] **DX-04**: Dashboard server manages its own lifecycle (PID file, clean shutdown, no stale processes)
- [ ] **DX-05**: Plugin SDK defines manifest-only interface for third-party integrations (@cds/plugin-sdk)
- [ ] **DX-06**: Stop hook supports plugin extension points for custom post-session actions
- [ ] **DX-07**: @cds/mcp-adapter listed on Smithery marketplace
- [ ] **DX-08**: @cds/mcp-adapter listed on official MCP Registry

### Core Infrastructure

- [ ] **INFRA-01**: VaultBackend interface defined in @cds/core with `pull()`/`push()` methods
- [ ] **INFRA-02**: FsBackend implements VaultBackend as no-op default (current behavior preserved)
- [ ] **INFRA-03**: S3Backend implements VaultBackend in @cds/s3-backend package (AWS SDK isolated)

## v1.2 Requirements

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
| Gemini/Copilot/Codex runtime adapters | Design-heavy, needs live validation. Deferred to v1.2 per research recommendation. |
| Plugin sandboxing (vm2, isolated-vm) | Manifest-only model for v1.1 eliminates arbitrary code execution risk. Revisit if demand arises. |
| Vector embeddings | FTS5 BM25 is 95% as good at this data scale. MiniSearch covers fuzzy/suggest gap. |
| Cloud-hosted dashboard | Local-only dashboard for v1.1. Cloud hosting adds auth, hosting costs, security surface. |
| Real-time sync | Merge-on-download (pull before push) is sufficient for single-user cross-device. Real-time = team feature. |
| S3 encryption via KMS | Default S3 SSE-S3 is sufficient for v1.1. KMS adds cost + config complexity. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 43 | Pending |
| INFRA-02 | Phase 43 | Pending |
| INFRA-03 | Phase 44 | Pending |
| HARD-01 | Phase 44 | Pending |
| HARD-02 | Phase 44 | Pending |
| HARD-03 | Phase 44 | Pending |
| HARD-04 | Phase 46 | Pending |
| HARD-05 | Phase 46 | Pending |
| HARD-06 | Phase 49 | Pending |
| HARD-07 | Phase 49 | Pending |
| HARD-08 | Phase 49 | Pending |
| MEM-01 | Phase 45 | Pending |
| MEM-02 | Phase 43 | Pending |
| MEM-03 | Phase 45 | Pending |
| MEM-04 | Phase 43 | Pending |
| MEM-05 | Phase 45 | Pending |
| MEM-06 | Phase 45 | Pending |
| MEM-07 | Phase 45 | Pending |
| DX-01 | Phase 48 | Pending |
| DX-02 | Phase 48 | Pending |
| DX-03 | Phase 48 | Pending |
| DX-04 | Phase 48 | Pending |
| DX-05 | Phase 47 | Pending |
| DX-06 | Phase 47 | Pending |
| DX-07 | Phase 49 | Pending |
| DX-08 | Phase 49 | Pending |

**Coverage:**
- v1.1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 — traceability section completed after roadmap creation*
