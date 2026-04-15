---
id: SEED-004
status: active-for-v1.0-phase-a
planted: 2026-04-16
planted_during: v0.12.1 post-release planning for v1.0 CDS-Core Independence milestone
trigger_when: "v1.0 Phase A execution (immediate — per D-28 in docs/cds-core-independence-plan.md)"
scope: Large
---

# SEED-004: Tiered Vault Architecture + Auto Session Capture (Phase A scope)

## Why This Matters

Current vault layer stores **everything as markdown**: sessions, decisions, docs, planning. Humans and Claude read the same files. Two problems became visible during v0.12 work:

1. **Sessions are different from docs.** A session log is *conversational memory for Claude* — what the user and Claude worked on, so the next session can pick up. It does NOT need to be human-readable markdown. Humans rarely browse session files directly; they ask Claude "what did we decide last time?" and Claude reads the files. Forcing sessions into markdown is suboptimal storage for AI query.
2. **Decisions, docs, planning ARE human-facing.** Architectural decisions, project docs, planning artifacts are read by humans (in PRs, onboarding, audits) AND by Claude. Markdown is correct for these.

User framing (2026-04-16): *"сессии это не обязательно читаемый файл в vault. это просто память для claude о том о чем общается пользователь. чтоб не забывалось это. а для действительно важных вещей есть decisions и docs. плюс еще и planning будет."*

Translation: *sessions are not necessarily human-readable files in vault — they're just memory for Claude about user conversations so nothing gets forgotten. For truly important things we have decisions, docs, and now planning too.*

## Three-Tier Vault Model

| Tier | Content | Storage | Primary reader | Writability |
|------|---------|---------|----------------|-------------|
| **Tier 1 — Cold docs** | `docs/`, `decisions/`, `planning/` | Markdown + git-synced vault | Human + Claude | Manual + wizard |
| **Tier 2 — Warm memory** | `sessions/` | **SQLite / structured DB** | Claude (via MCP tools) | Auto via Stop hook |
| **Tier 3 — Hot context** | `context.md`, `STATE.md` | Markdown in vault + project | Claude SessionStart hook | Auto every session |

Tier 1 remains exactly as today: human-first markdown under version control. Tier 3 remains as today: markdown loaded automatically at session start. **Tier 2 changes fundamentally** — sessions move out of markdown.

## Why SQLite for Sessions (inspired by claude-mem)

Claude-mem (`@thedotmack/claude-mem`, ~118 versions, AGPL-3.0) already does this: sessions live in SQLite with FTS5 search, served via MCP tools (`search`, `timeline`, `get_observations`, and one more). Claude queries structured data at O(1) instead of reading entire markdown files (expensive in tokens).

We adopt the **pattern**, not the package:
- **Pro pattern:** hooks trigger auto-capture, SDK generates summary, SQLite stores structured observations, MCP exposes query tools.
- **Con adoption:** AGPL-3.0 is incompatible with CDS as a product distribution — strong copyleft taints dependent code. Claude-mem is classified as **inspiration source**, same category as GSD-2 and Pi SDK.

## Components

### 1. Stop hook + `@anthropic-ai/claude-agent-sdk`

Replaces today's manual `/end` skill-based flow. Works automatically when Claude session ends, regardless of user action.

```
Stop hook (detached process):
  → read transcript from Claude Code env
  → extract user messages + key assistant responses
  → call @anthropic-ai/claude-agent-sdk (Haiku) to generate structured summary
  → write structured observations to SQLite
  → update context.md (Tier 3) with session pointer
  → fail silently if SDK unavailable — never block session exit
```

Replaces the current `lib/adr-bridge-session.mjs` subprocess approach (`claude -p`) which has been failing repeatedly during 2026-04-15 / 2026-04-16 sessions.

### 2. SQLite schema

Borrowed structure from claude-mem, minimum viable:

- `sessions` (id, start_time, end_time, project, summary)
- `observations` (id, session_id, type, content, entities, created_at)
- `entities` (id, name, type, first_seen, last_updated) — e.g. "Pi SDK", "GSD-2", "S3 vault"
- `relations` (from_entity, to_entity, relation_type, observed_in_session)

FTS5 index on `observations.content` + `summary` for search.

DB file: `~/vault/projects/<name>/sessions.db` (per project). Stays inside vault → git-synced across machines along with Tier 1 content.

### 3. MCP adapter

Single MCP server exposed by CDS (`@cds/mcp-adapter` or included in `@cds/cli`).

**Tools:**
- `sessions.search(query, filters)` — FTS5 + entity filter
- `sessions.timeline(anchor, window)` — chronological context around an observation
- `sessions.get_observations(ids[])` — fetch full text for IDs
- `docs.search(query)` — markdown search across Tier 1 (simple grep + markdown parse)
- `planning.status(project)` — current ROADMAP/STATE summary

**Client:** any MCP-compliant Claude Code / Desktop session. Registered in `.claude/settings.json` via wizard.

### 4. Tier boundary enforcement

- CDS code writes to SQLite only via `sessions.*` API — never direct `INSERT`.
- Humans never edit SQLite directly — there's a CLI `claude-dev-stack sessions dump --since 2026-04` that exports readable markdown on demand for one-off human review.
- Decisions / docs / planning stay markdown-only. CDS does NOT move them to SQLite. Humans own these files.

## Phase A Scope Expansion

User decision (2026-04-16): **sessions must be in Phase A, not Phase C or later**. Reasoning: sessions are the core memory layer. Every subsequent feature benefits from auto-capture from day one. Deferring means CDS ships without its signature value proposition.

This expands D-12 Phase A exit criteria. See master plan D-28 for the updated Phase A scope.

## Timeline Impact

Original D-12 Phase A: 7-8 weeks (foundation + `/cds-quick`).

Revised Phase A: **10-12 weeks** (foundation + sessions + `/cds-quick`). Breakdown:

- Weeks 1-3: Monorepo scaffolding, Pi SDK integration, agent dispatcher primitive, vitest
- Weeks 4-6: SQLite schema + Stop hook + `@anthropic-ai/claude-agent-sdk` integration + auto-capture end-to-end
- Weeks 7-9: MCP adapter + sessions search/timeline/get_observations tools + integration tests
- Weeks 10-11: `/cds-quick` end-to-end, consuming MCP sessions for cross-task memory
- Week 12: Ship `claude-dev-stack@1.0.0-alpha.1` via npm `@alpha` tag

Accepts 2-3 additional weeks to ship sessions as part of foundation. Pays off from Phase B onward — every workflow written after Phase A auto-generates session memory without retroactive refactor.

## Migration for existing v0.12.x users

- **Backfill script** (one-time): scan existing markdown `sessions/` → call Haiku to generate structured observations → write to SQLite. Existing 30+ session logs get imported so no history is lost.
- **Markdown archive**: existing `vault/projects/<name>/sessions/*.md` stays on disk as frozen archive. Not auto-migrated or deleted — user's choice.
- **Cutover**: from v1.0 onward, Stop hook writes ONLY to SQLite. No dual-write to markdown.

## Out of Scope (for SEED-004)

- Web UI for browsing sessions (claude-mem has port 37777 viewer — skip, CLI dump is enough for v1.0)
- Vector embeddings (FTS5 is sufficient for v1.0; add semantic search later if needed)
- Cross-project session search (per-project scope first)
- Remote SQLite via S3 (SEED-003 handles vault-wide remote; sessions.db rides along)

## Breadcrumbs

- `hooks/update-context.mjs` — current SessionStart reader; will need rewrite to query SQLite-based sessions
- `lib/adr-bridge-session.mjs` — current Phase 26 subprocess approach; replaced by Stop hook + claude-agent-sdk
- `/Users/eugenenakoneschniy/vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md` — master plan D-07, D-10, D-12, D-22
- `.planning/seeds/SEED-001-delegated-execution-service.md` — related (cloud session continuation)
- `.planning/seeds/SEED-002-cds-core-independence.md` — supersedes Target Refactor #7 scope (silent session end)
- `.planning/seeds/SEED-003-vault-s3-storage-option.md` — SQLite db travels with S3 vault
- npm: `@anthropic-ai/claude-agent-sdk` — SDK we'll use
- npm: `@modelcontextprotocol/sdk` — MCP server framework
- Upstream: https://github.com/thedotmack/claude-mem — inspiration source, AGPL-3.0, NOT adopted

## License Consideration (IMPORTANT)

`claude-mem` is AGPL-3.0. Linking to or deriving from AGPL code arguably taints dependent software with AGPL obligations. Since CDS targets productization (SEED-002 positioning), we DO NOT import claude-mem.

We DO study its architecture (public documentation, README, architecture page) and independently implement the pattern using MIT-licensed building blocks:
- `@anthropic-ai/claude-agent-sdk` — Apache-2.0 / MIT (confirm during Phase A planning)
- `@modelcontextprotocol/sdk` — MIT
- `better-sqlite3` or `bun:sqlite` — MIT
- FTS5 (SQLite extension) — public domain

This gives CDS identical capability with compatible license.

## Notes

- User insight about tier separation (2026-04-16) was pivotal: without it, we would have forced sessions into markdown and accepted the inefficiency. Recording this decision so the original reasoning doesn't get lost to future refactor pressure.
- `claude-mem` being AGPL is easy to miss — always check license before any adoption decision. Added to CDS-Core `NOTICES.md` discipline: every inspiration source documented with license.
- Session backfill should include entity extraction from existing markdown sessions. Over 12 months of CDS history has rich cross-session context (SEED-001 research, SEED-002 fork discussion, v0.12 decisions) — this becomes immediately queryable once backfilled.
