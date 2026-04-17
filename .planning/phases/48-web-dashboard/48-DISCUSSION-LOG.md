# Phase 48: Web Dashboard - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-17
**Phase:** 48-web-dashboard
**Areas discussed:** SPA strategy, Dashboard views, Server lifecycle

---

## SPA Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Plain HTML + CDN (Recommended) | Single index.html, Chart.js + cytoscape from CDN. No build step. | ✓ |
| Vite + React | Pre-bundled SPA. Richer but adds build complexity. | |
| You decide | | |

**User's choice:** Plain HTML + CDN (Recommended)
**Notes:** Resolves ARCHITECTURE.md vs STACK.md contradiction.

## Dashboard Views

| Option | Description | Selected |
|--------|-------------|----------|
| Single page with tabs (Recommended) | One index.html, JS tab switching: Sessions / Costs / Graph. | ✓ |
| Multi-page | Separate HTML files, server-side routing. | |
| You decide | | |

**User's choice:** Single page with tabs (Recommended)

## Server Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Foreground + PID (Recommended) | Foreground, Ctrl-C to stop, PID file, auto-open browser. | |
| Background daemon | Start and return. `cds dashboard stop` to kill. | ✓ |
| You decide | | |

**User's choice:** Background daemon

## Deferred Ideas

- Cloud-hosted dashboard — v1.2
- Real-time updates via WebSocket — v1.2
- Authentication — local only, not needed
