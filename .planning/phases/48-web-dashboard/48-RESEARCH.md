# Phase 48: Web Dashboard — Research

**Researched:** 2026-04-17
**Phase Goal:** Users can open a local web dashboard to explore session analytics, token costs, and the entity relationship graph — all without leaving their machine.

## 1. SPA Strategy Decision (Research Flag)

**Contradiction:** ROADMAP flags "Resolve SPA strategy contradiction (Vite+React vs plain HTML+CDN) before planning starts."

**Recommendation: Plain HTML + CDN (no build step)**

| Criterion | Vite+React | Plain HTML+CDN |
|-----------|-----------|----------------|
| Bundle size | ~150KB+ (React + ReactDOM) | 0 (HTML served as-is) |
| Build step | Required (vite build) | None |
| New dependencies | react, react-dom, vite, @vitejs/plugin-react | None (CDN scripts) |
| Shipping complexity | Must bundle frontend assets in npm package | Embed HTML files directly in package |
| Maintenance | React version upgrades, build tooling drift | Minimal — static HTML + vanilla JS |
| Developer familiarity | Higher ceiling for complex UIs | Sufficient for analytics dashboard |
| Consistency with project | Project uses no frontend framework | Stays framework-free |

**Decision rationale:** This is a local analytics dashboard, not a SaaS app. The three views (session timeline, cost breakdown, entity graph) are read-only data displays. Plain HTML with Chart.js (CDN) for charts and Cytoscape.js (CDN) for the graph provides everything needed without adding a build step or frontend framework to a CLI tool.

## 2. HTTP Server: Hono + @hono/node-server

**Why Hono:**
- Already in the Node.js ecosystem, lightweight (~14KB)
- `@hono/node-server` provides static file serving via `serveStatic` middleware
- Supports API routes for JSON data endpoints alongside static files
- No Express-level dependency weight
- Works with Node 18+ (project minimum)

**Architecture:**
```
cds dashboard
  → starts Hono server on localhost:{port}
  → serves static HTML/CSS/JS from embedded assets
  → exposes JSON API routes that query sessions.db
  → opens browser via `open` package (or platform-native)
```

**Dependencies to add to @cds/cli:**
- `hono` — HTTP framework
- `@hono/node-server` — Node.js adapter + serveStatic

**No new package needed** — the dashboard server lives in `@cds/cli` since it's a CLI command that consumes `@cds/core` APIs.

## 3. Frontend Stack (CDN, No Build)

### Charts: Chart.js via CDN
- `<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>`
- Lightweight (~65KB gzipped), canvas-based
- Supports: bar charts (token usage), line charts (session timeline), doughnut (cost breakdown)
- No build step required

### Entity Graph: Cytoscape.js via CDN
- `<script src="https://cdn.jsdelivr.net/npm/cytoscape@3/dist/cytoscape.min.js"></script>`
- Built-in CoSE force-directed layout (no extra plugin needed for basic use)
- Works with plain HTML div container
- Supports click events, tooltips, zoom/pan out of the box
- Data format maps directly to our `EntityGraph` types: `{ nodes: [{data: {id, label, type}}], edges: [{data: {source, target, label}}] }`

### Styling: Minimal CSS (no framework)
- Single CSS file with CSS custom properties for theming
- Responsive grid layout for dashboard panels
- Dark/light mode via `prefers-color-scheme` media query

## 4. API Routes Design

The Hono server exposes JSON endpoints that the frontend fetches:

| Route | Method | Source | Returns |
|-------|--------|--------|---------|
| `/api/sessions` | GET | `openSessionsDB().listSessions()` | Session list with timestamps |
| `/api/sessions/:id/observations` | GET | `openSessionsDB().listObservations()` | Observations for a session |
| `/api/stats` | GET | `countObservationsByType()`, `countEntities()`, `topEntities()` | Aggregate statistics |
| `/api/costs` | GET | Parse session observations for cost data | Token usage + cost breakdown |
| `/api/graph` | GET | `getEntityGraph(projectPath)` | Entity-relation graph data |

**Cost data source:** Session observations contain cost/token data captured by the Stop hook. The `/api/costs` endpoint aggregates this from the observations table. Note: `CostTracker` is per-session in-memory only (no persistence today), so historical cost data comes from session observation content that contains token/cost mentions.

## 5. Dashboard Server Lifecycle (DX-04)

### PID File Management
- PID file at `~/.cds/dashboard.pid` (or `~/.claude-dev-stack/dashboard.pid`)
- Write PID on server start, delete on clean shutdown
- On `cds dashboard`: check PID file first — if process alive, show URL and exit

### Clean Shutdown
- Register `SIGINT` and `SIGTERM` handlers
- On signal: close HTTP server, close any open DB handles, delete PID file, `process.exit(0)`
- `cds dashboard stop`: read PID file, send SIGTERM, verify process exited, clean up PID file if stale

### Stale Process Detection
- On start: if PID file exists, check if process is actually running (`process.kill(pid, 0)`)
- If not running: delete stale PID file, start normally
- If running: print existing dashboard URL, exit with info message

## 6. CLI Command Structure

```
cds dashboard              # Start dashboard server (default port 3456)
cds dashboard --port 8080  # Custom port
cds dashboard stop         # Stop running dashboard
```

**Implementation in @cds/cli:**
- New file: `packages/cds-cli/src/dashboard.ts` — server setup, lifecycle, API routes
- New directory: `packages/cds-cli/src/dashboard-assets/` — static HTML/CSS/JS files
- Update: `bin/cli.mjs` — add `dashboard` command routing

### Browser Opening
- Use `open` package (cross-platform) or fallback to platform-native commands
- `open` is a devDependency-free ESM package, ~3KB
- Opens default browser to `http://localhost:{port}`

## 7. Static Asset Embedding Strategy

Static HTML/CSS/JS files are embedded in the npm package:
- Located at `packages/cds-cli/src/dashboard-assets/`
- TypeScript build copies them to `dist/dashboard-assets/`
- `serveStatic` serves from the `dist/dashboard-assets/` directory at runtime
- Alternative: inline HTML as template literals in TypeScript (avoids copy step but harder to maintain)

**Recommendation:** Use a `copy-dashboard-assets.mjs` post-build script (similar to existing `copy-migrations.mjs`) that copies `src/dashboard-assets/**` to `dist/dashboard-assets/`.

## 8. Validation Architecture

### Testability
- API routes are testable with Hono's built-in test client (`app.request()`)
- No browser testing needed for API layer
- Frontend HTML is static — visual testing is manual or via Playwright (out of scope for v1.1)

### Key Test Scenarios
1. Server starts and responds on configured port
2. API routes return valid JSON with expected shapes
3. PID file created on start, deleted on stop
4. Stale PID file detected and cleaned up
5. `cds dashboard stop` sends SIGTERM and cleans up
6. Server handles SIGINT (Ctrl+C) gracefully

## 9. Pitfalls and Mitigations

| Pitfall | Impact | Mitigation |
|---------|--------|------------|
| CDN unavailable offline | Charts/graph won't render | Bundle minified copies as fallback in dashboard-assets/ |
| Port conflict | Server won't start | Try configured port, show clear error with `--port` suggestion |
| sessions.db locked by other process | API errors | Open DB in readonly mode (already done in graph.ts) |
| Large entity graphs | Browser performance | Limit nodes to top 200 by relation count; paginate if needed |
| Windows PID file race | Stale file on crash | Check process liveness before trusting PID file |
| `open` package ESM import | Build issues | Use dynamic import() since it's only needed at runtime |

## 10. Dependency Summary

**New runtime dependencies for @cds/cli:**
- `hono` — HTTP framework (~14KB)
- `@hono/node-server` — Node.js adapter for Hono
- `open` — cross-platform browser opener (~3KB)

**No new dependencies for @cds/core** — dashboard consumes existing APIs.

**CDN (loaded by browser, not npm):**
- Chart.js v4 — charts
- Cytoscape.js v3 — entity graph

---

## RESEARCH COMPLETE
