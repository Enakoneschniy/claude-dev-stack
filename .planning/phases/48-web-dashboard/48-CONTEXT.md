# Phase 48: Web Dashboard - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Create `@cds/dashboard` package with a local web dashboard for session analytics, token costs, and entity graph visualization. Single-page HTML app served by Hono, no build step. `cds dashboard` runs as a background daemon, `cds dashboard stop` kills it. Dashboard reads from `@cds/core` APIs (sessions, graph, cost tracker).

</domain>

<decisions>
## Implementation Decisions

### SPA Strategy
- **D-01:** Plain HTML + CDN approach. Single `index.html` file with Chart.js and cytoscape loaded from CDN. No React, no Vite, no build step. Served statically by Hono.
- **D-02:** Resolves the ARCHITECTURE.md vs STACK.md contradiction — plain HTML wins. Matches single-dep philosophy.

### Dashboard Views
- **D-03:** Single page with JS-based tab switching. Three tabs: **Sessions** (timeline + search) | **Costs** (token usage + cost breakdown) | **Graph** (interactive entity relationship visualization).
- **D-04:** No client-side routing — tab switching via JS show/hide. URL stays the same.

### Server Lifecycle
- **D-05:** `cds dashboard` starts a background daemon (detached child process), writes PID to `~/.cds/dashboard.pid`, prints URL, and returns immediately.
- **D-06:** `cds dashboard stop` reads PID file, sends SIGTERM, cleans up PID file.
- **D-07:** `cds dashboard` auto-opens browser on start (via `open` on macOS, `xdg-open` on Linux).
- **D-08:** Port selection: default 3847 (`CDS` in phone keypad), configurable via `--port` flag or `CDS_DASHBOARD_PORT` env.
- **D-09:** If port is in use, check if it's our PID — if yes, just open browser (already running). If no, try next port or error.

### Data API
- **D-10:** Hono server exposes REST endpoints for the HTML frontend:
  - `GET /api/sessions` — list sessions with pagination
  - `GET /api/sessions/:id/observations` — observations for a session
  - `GET /api/stats` — aggregate token/cost stats
  - `GET /api/graph` — entity graph data (calls getEntityGraph())
  - `GET /api/search?q=...` — search observations
- **D-11:** All endpoints return JSON. HTML fetches via `fetch()`.

### Claude's Discretion
- Chart.js chart types and colors for cost/token visualizations
- Cytoscape layout algorithm for entity graph
- CSS styling approach (inline styles, <style> block, or separate CSS file)
- Whether to use Web Components or plain DOM manipulation
- Dashboard responsiveness (mobile support level)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core APIs (consumed by dashboard)
- `packages/cds-core/src/vault/sessions.ts` — SessionsDB, Session, Observation types
- `packages/cds-core/src/vault/graph.ts` — getEntityGraph(), GraphNode, GraphEdge (Phase 43)
- `packages/cds-core/src/cost-tracker.ts` — CostTracker for cost data

### Research
- `.planning/research/STACK.md` — hono ^4.12.14 + @hono/node-server, Chart.js from CDN
- `.planning/research/ARCHITECTURE.md` — @cds/dashboard as isolated package
- `.planning/research/PITFALLS.md` — dashboard server lifecycle, stale process pitfall

### Package Template
- `packages/cds-s3-backend/` — template for new monorepo workspace package structure

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@cds/core` vault APIs — sessions, graph, search all already built
- `@cds/s3-backend` package structure — template for `@cds/dashboard` package setup
- `c.X` color constants in `shared.mjs` — for consistent CLI output around dashboard

### Established Patterns
- Workspace package: tsconfig, vitest, barrel exports
- Detached process: `hooks/notebooklm-sync-runner.mjs` uses child_process.spawn with `detached: true`

### Integration Points
- `bin/cli.mjs` — add `dashboard` subcommand routing
- `pnpm-workspace.yaml` — add `@cds/dashboard`
- `~/.cds/dashboard.pid` — PID file location

</code_context>

<specifics>
## Specific Ideas

- Port 3847 = "CDS" on phone keypad — memorable default
- Dashboard should feel like a local dev tool (fast, simple, no auth), not a web app

</specifics>

<deferred>
## Deferred Ideas

- **Cloud-hosted dashboard** — local-only for v1.1
- **Real-time updates** — refresh button or auto-refresh interval, no WebSocket
- **Mobile responsive** — desktop-first, basic mobile support
- **Authentication** — local-only, no auth needed

</deferred>

---

*Phase: 48-web-dashboard*
*Context gathered: 2026-04-17*
