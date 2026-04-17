# Pitfalls Research

**Domain:** Adding cloud sync, graph visualization, web dashboard, plugin system, and multi-runtime AI support to an existing Node.js CLI tool (claude-dev-stack v1.1)
**Researched:** 2026-04-17
**Confidence:** HIGH (codebase inspected, issues verified against existing implementation)

---

## Critical Pitfalls

### Pitfall 1: WAL file left open blocks S3 upload consistency

**What goes wrong:**
`better-sqlite3` with `journal_mode = WAL` (already set in `db.ts`) produces a `sessions.db-wal` sidecar file alongside `sessions.db`. If the WAL file is not checkpointed before the S3 upload, the uploaded `.db` is in a broken/partial state. When another device downloads only the `.db` and opens it, SQLite either replays stale WAL data or sees a logically incomplete database. The existing `busy_timeout = 5000` does not force a checkpoint before close.

**Why it happens:**
The natural impulse is to `aws s3 cp sessions.db s3://...` immediately after the session ends. WAL checkpointing is lazy by default — the WAL file only merges back on a clean connection close or explicit PRAGMA. If the process exits without an explicit `PRAGMA wal_checkpoint(TRUNCATE)`, the main `.db` file is never fully up to date on disk.

**How to avoid:**
Before any S3 upload, call `db.pragma('wal_checkpoint(TRUNCATE)')` via `better-sqlite3`'s sync API, then close the connection, then upload. Upload ONLY `sessions.db` after a confirmed checkpoint so no WAL sidecar exists at upload time. Add `wal_checkpoint(TRUNCATE)` to `closeSessionsDB()` in `sessions.ts` before S3 integration begins. Write a test that verifies `sessions.db-wal` is 0 bytes or absent after close.

**Warning signs:**
- `sessions.db-wal` is non-zero bytes at upload time
- Downloaded `sessions.db` on a second device has fewer rows than the source
- `better-sqlite3` throws "file is not a database" or "database disk image is malformed" on download

**Phase to address:**
S3 vault backend phase (first phase touching SEED-003). The checkpoint call must be in place before any upload code is written.

---

### Pitfall 2: S3 sync with no conflict model means last-write-wins and silent data loss

**What goes wrong:**
Two devices each write sessions to their local `sessions.db`. When device B uploads, it overwrites device A's data in S3. When device A subsequently uploads, it overwrites device B's data. Neither device detects the conflict. Sessions from one device are permanently lost with no error or warning.

**Why it happens:**
S3 is not a database. It has no row-level merge semantics. Treating it as a remote backup target and overwriting the object on every upload is the obvious implementation that works for single-device use but silently destroys data in the multi-device case this feature is intended to solve.

**How to avoid:**
Use a merge-on-download strategy: on upload, first `GetObject` the current S3 version, merge row-sets by UUID primary key, then `PutObject` the merged result. Alternatively, shard per device (`s3://bucket/vault/{device-id}/sessions.db`) and merge only on explicit `cds sync pull`. Never overwrite the remote wholesale from one device without reading it first. Define the conflict strategy in an ADR before writing any upload code.

**Warning signs:**
- Upload function calls `PutObject` without a prior `GetObject`
- No conflict detection or merge logic in the S3 adapter
- Feature tests only cover single-device upload/download

**Phase to address:**
S3 vault backend design. Write the ADR first, then implement merge. Two-device simulation test is required before shipping.

---

### Pitfall 3: Adding AWS SDK violates the single-dependency constraint and bloats npx install

**What goes wrong:**
`@aws-sdk/client-s3` brings 200+ transitive packages. Adding it as a dependency of `cds-cli` breaks the project's strict single-dep constraint (`prompts` only on the CLI surface). Even if scoped to `@cds/s3-backend`, `npx claude-dev-stack` still pulls in everything `cds-cli` depends on if the backend package is bundled. Install time jumps from seconds to 30+ seconds, and the principle that motivated the constraint (fast `npx` installs, minimal attack surface) is gone.

**Why it happens:**
AWS SDK is the natural choice for S3. The single-dep constraint was written for the old non-monorepo structure. Without explicit architectural guidance, the feature author adds `@aws-sdk/client-s3` to `cds-cli/package.json` rather than keeping it fully isolated, and it lands in the default install path.

**How to avoid:**
Options ranked by preference: (A) Use `node:https` + manual AWS Signature V4 — complex but feasible for the three operations needed (GetObject, PutObject, HeadObject), zero new dependencies. (B) Make `@cds/s3-backend` a peer/optional dependency that users install explicitly (`npm install @cds/s3-backend`). (C) Accept AWS SDK but update the project constraint in an ADR to "single dep on CLI surface, optional workspace packages allowed." Decide in an ADR before writing any S3 code.

**Warning signs:**
- `pnpm ls --depth 0 cds-cli` shows `@aws-sdk/*` in its dependency list
- `npx claude-dev-stack` install time increases by more than 5 seconds
- `packages/cds-cli/package.json` lists AWS SDK directly

**Phase to address:**
First task of S3 backend phase must be an architectural ADR on the dependency constraint. No S3 code until this is decided.

---

### Pitfall 4: `better-sqlite3` prebuilt binary gaps on Node 24 and musl/ARM64

**What goes wrong:**
`better-sqlite3` ships prebuilt binaries for specific LTS Node.js versions. Node 24 and musl (Alpine Linux) have open issues showing 404s during prebuild download, causing a compile-from-source fallback. Without `python3` and `node-gyp` available, install fails entirely. The project already uses `better-sqlite3` in `@cds/core` — this affects every user on Node 24 or Alpine Linux, not just S3 backend users.

**Why it happens:**
`better-sqlite3` issue #1384 confirms missing prebuilts for Node 24 N-API 137 as of early 2026. The project's CI matrix uses Node 18/20/22, but the publishing workflow uses Node 24. Users who install on Node 24 as their daily driver hit this immediately after v1.1 is published.

**How to avoid:**
Before publishing v1.1: pin `better-sqlite3` to the most recent version confirmed to have Node 24 prebuilts. Add Node 24 to the CI test matrix. Add Alpine Linux Docker test to the publishing workflow. Specify `engines.node` in `package.json` to surface the constraint clearly. If upstream lag persists beyond the v1.1 release window, evaluate `better-sqlite3-with-prebuilds` as a drop-in replacement.

**Warning signs:**
- CI matrix does not include Node 24
- `npm install` log shows "No prebuilt binaries found" followed by `node-gyp rebuild` output
- Fresh install on ARM64 macOS fails without Xcode Command Line Tools

**Phase to address:**
npm publish / GA release phase. Run the full install test on Node 24 + ARM64 macOS + Alpine Linux Docker before any `@latest` tag promotion.

---

### Pitfall 5: Web dashboard / graph server spawns an unreleased background process

**What goes wrong:**
Graph visualization and session analytics both require a running HTTP server to render in the browser. If `cds dashboard` spawns an Express/Fastify server without a shutdown mechanism, the port stays occupied on the next invocation. `EADDRINUSE: address already in use :::3000` becomes the user-facing error with no actionable explanation. On macOS, Node processes survive their parent terminal session unless explicitly cleaned up.

**Why it happens:**
The natural implementation is `app.listen(3000)`. There is no mechanism to detect when the user is "done." The project already has detached background processes (session-end sync hook chain) — this pattern could accidentally be reapplied here, making the dashboard a permanent background process.

**How to avoid:**
Register `SIGINT`/`SIGTERM` handlers that call `server.close()`. Write a PID file to `~/.claude-dev-stack/dashboard.pid` and check it on startup — kill the stale process if the port is already bound. Use `--port` flag with auto-increment on `EADDRINUSE`. For graph visualization specifically: prefer a static HTML export (D3.js renders from a JSON dump with no server needed for read-only views) over a persistent server.

**Warning signs:**
- Dashboard implementation spawns server without a SIGINT handler
- No port availability check before `listen()`
- `cds dashboard` called twice produces `EADDRINUSE` instead of reattaching or reusing

**Phase to address:**
Web dashboard phase. PID-file + shutdown handler must be in the initial implementation, not retrofitted after the first user bug report.

---

### Pitfall 6: Cross-project FTS search opens N simultaneous `better-sqlite3` connections

**What goes wrong:**
A naive cross-project memory search opens one `SessionsDB` handle per project to run FTS5 queries. With 20+ projects, this means 20 concurrent `better-sqlite3` connections each holding a read lock. On macOS the default per-process file descriptor limit (`ulimit -n = 256`) can be exhausted. More subtly: `better-sqlite3` is synchronous — iterating 20 databases serially with large observation tables is slow (300–500ms per project), but opening them all in parallel is not safe because better-sqlite3 connections are not thread-safe across worker threads.

**Why it happens:**
The existing `search.ts` in `@cds/core` searches a single project's DB. Cross-project search is a natural loop: iterate `projectMap()`, open each DB, query, close. The problem is the sheer number of open handles and the fact that "close" is often forgotten when the query throws an exception.

**How to avoid:**
Open-query-close sequentially with a `try/finally` block ensuring the handle is always closed. Use a configurable `maxResults` per project with `LIMIT` in the SQL to bound query time. Add early-exit when `maxResults` total is reached. Consider building a unified cross-project FTS index: materialize observations into a single aggregate `search.db` on `cds sync`, then search it in a single query. The aggregate approach is faster and requires only one open connection.

**Warning signs:**
- Cross-project search opens DBs in a loop without explicit per-iteration close
- No `LIMIT` clause on FTS queries
- `lsof | grep sessions.db` shows >3 open handles during a search

**Phase to address:**
Cross-project memory search phase. The aggregate-index vs. query-per-project design decision must be made before any search UI is built on top of it.

---

### Pitfall 7: Plugin system with `import()` from user-specified paths is an arbitrary code execution vector

**What goes wrong:**
A plugin system that does `await import(userProvidedPath)` or `require(plugin.main)` executes arbitrary JavaScript with full Node.js process permissions. A malicious or compromised plugin gets read/write access to `~/vault`, all environment variables including `ANTHROPIC_API_KEY`, and the ability to exfiltrate session memory silently.

**Why it happens:**
The project already has a plugin system (`lib/plugins.mjs`, 19 presets) — but today it installs files statically into `~/.claude/`. Extending it to "third-party runtime plugins" seems like a natural evolution. The jump from static file installation to `import()` execution seems small but fundamentally changes the trust model from "we know what files we're placing" to "we run arbitrary code."

**How to avoid:**
For v1.1, keep plugins as file-based manifests (YAML/JSON describing what files to install where) rather than executable modules. Do not add runtime `import()` for third-party code. If runtime plugins are ever needed, run them in a subprocess with Node.js `--experimental-permission` flags (`--deny-fs-write=~/vault --deny-env=ANTHROPIC_API_KEY`) rather than the main process. Require plugins to be npm-published with provenance. Record this as an explicit ADR: "Plugin trust model v1.1: manifest-only, no runtime code."

**Warning signs:**
- Plugin loader contains `await import(plugin.path)` or `require(plugin.main)` with user-provided paths
- Plugin manifest spec allows `"source": "git+https://..."`
- No sandboxing between plugin execution and vault write path

**Phase to address:**
Plugin system phase. Write the ADR on plugin trust model before any code. "File-based manifests only for v1.1" is the safe default.

---

### Pitfall 8: OAuth→API key bridge assumes token is always available and never expired

**What goes wrong:**
DEMO-01's resolution requires real SDK dispatch from `cds quick`. The bridge between OAuth (what `claude` CLI uses) and `ANTHROPIC_API_KEY` (what `@cds/core` `dispatchAgent` needs) has three documented failure modes: (1) OAuth tokens expire after ~8 hours and auto-refresh silently fails in headless/CI environments; (2) auth conflict when both `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` are set simultaneously; (3) the `api/oauth/usage` endpoint already polled by `cds-core` for budget detection may return 401 before the session ends, leaving cost display silently broken.

**Why it happens:**
`agent-dispatcher.ts` already depends on `ANTHROPIC_API_KEY` being set. OAuth is a separate credential path. Bridging them requires reading from macOS Keychain — which does not exist on Linux/CI environments where `claude` CLI runs with `CLAUDE_CODE_OAUTH_TOKEN` env var instead. The path that works on the developer's macOS machine fails silently on every other environment.

**How to avoid:**
Implement a credential resolver that tries: (1) `ANTHROPIC_API_KEY` env var, (2) `ANTHROPIC_API_KEY` from `~/.claude/.credentials.json`, (3) OAuth token from Keychain as last resort with explicit expiry check. The resolver must be tested against all three paths and must fail with a clear, actionable error rather than a silent 401. Never block `cds quick` on Keychain availability — degrade gracefully by running without cost display rather than crashing.

**Warning signs:**
- Credential lookup is macOS Keychain only with no Linux fallback
- No token expiry check before using a cached OAuth token
- `dispatchAgent` called without a preceding credential availability check

**Phase to address:**
Real SDK dispatch / DEMO-01 resolution phase. The credential resolver should be its own module in `@cds/core` with explicit test coverage for all three credential sources.

---

### Pitfall 9: Promoting `1.0.0-alpha.1` to `@latest` breaks users who were on `0.12.x`

**What goes wrong:**
Users who previously ran `npx claude-dev-stack` got the last stable `0.12.x` version (alpha tags don't install as `@latest`). When v1.1 is published as `@latest`, they get a major-version upgrade with a monorepo-restructured CLI, a new SQLite vault schema with FTS5 migrations, and different command entry points — without any migration prompt. If their vault directory structure is incompatible, `openSessionsDB` throws `SchemaVersionError` and every CDS command fails.

**Why it happens:**
The alpha was published with `--tag alpha` to avoid overwriting `@latest`. When v1.1 is ready, running `npm publish` without `--tag` promotes it to `@latest` immediately, affecting all users who run `npx claude-dev-stack` without a pinned version. The `cds-migrate` package exists as a stub — it needs to be real before promotion.

**How to avoid:**
Publish v1.1 as `@next` first. Verify `cds-migrate` handles `0.12.x` vault structures. Add startup detection in `cds-cli`: if vault exists but schema version is pre-v1.0, prompt "Run `cds migrate` to upgrade your vault." Only promote to `@latest` after Docker UAT confirms the migration path works end-to-end. The `publish.yml` GitHub Action must use `--tag next` by default; promote to `@latest` via an explicit manual workflow step.

**Warning signs:**
- `publish.yml` runs `npm publish` without an explicit `--tag next`
- `cds-migrate` is still a stub when v1.1 goes to GA
- Docker UAT does not include a `0.12.x → 1.1.0` upgrade scenario

**Phase to address:**
npm publish / GA release phase. Migration path must be tested in Docker UAT before any `@latest` tag promotion.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Upload raw `sessions.db` without WAL checkpoint | Simple one-liner | Corrupt/partial DB on download; data loss on multi-device | Never |
| Last-write-wins S3 sync | Zero conflict logic to write | Silent session loss when two devices sync | Never for multi-device use case |
| `@aws-sdk/client-s3` added to `cds-cli` directly | Familiar SDK | Breaks single-dep constraint, bloats `npx` install | Only if scoped to optional `@cds/s3-backend` not bundled in CLI |
| Dashboard server without PID file + shutdown handler | Less code | Port conflicts, stale processes on every re-run | Never |
| Cross-project search opening all DBs simultaneously | Appears faster on small data | FD exhaustion, no exception safety, wrong on large vaults | Never beyond 3 projects |
| Plugin runtime via `import()` from user path | Simple extension mechanism | Arbitrary code execution, vault exfiltration risk | Never without subprocess sandboxing |
| Skipping `cds migrate` auto-detection on upgrade | Less code | Silent `SchemaVersionError` for all `0.12.x` users | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| S3 + SQLite WAL | Upload `sessions.db` directly after session end | `PRAGMA wal_checkpoint(TRUNCATE)` + close, then upload single `.db` file |
| S3 multi-device sync | `PutObject` on every session end | `GetObject` first, merge by UUID, then `PutObject` |
| AWS SDK in CLI surface | Add to `cds-cli` dependencies | Scope to `@cds/s3-backend` only; evaluate zero-dep SigV4 alternative |
| OAuth token in `dispatchAgent` | Assume always in Keychain | Try `ANTHROPIC_API_KEY` env first; Keychain as last resort with expiry check |
| Multi-runtime adapters (Gemini/Copilot/Codex) | Single unified interface for all runtimes | Per-runtime adapters sharing a common `DispatchResult` output type — each runtime has different auth, token counting, and tool schemas |
| `better-sqlite3` on Node 24 | Assume prebuilts exist | Pin version with confirmed Node 24 prebuilts; add Node 24 to CI matrix |
| FTS5 via `node:sqlite` (Node 22+ built-in) | Use `node:sqlite` as a lighter alternative | `node:sqlite` is compiled without FTS5 — `better-sqlite3` prebuilts include FTS5 |
| npm `@latest` promotion | `npm publish` without `--tag` | Publish as `@next`, test migration, then explicit `dist-tag add ... latest` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Serial cross-project FTS with no LIMIT | `cds search` takes >5s | Open-query-close per DB with `LIMIT 10`; build aggregate index for scale | >10 projects with >1K observations each |
| S3 download on every `cds` invocation | 100–300ms added to every command | Download only on explicit `cds sync pull` or if local is older than configurable threshold | Immediately — S3 round-trip latency is non-trivial |
| Graph rendering >10K entity nodes | Browser freeze on graph open | Pre-aggregate to top-N entities by recency; cluster nodes; paginate | >5K nodes in D3 force-directed layout |
| Session analytics loading all sessions | Dashboard hangs on large vault | Pagination + date range filters + `LIMIT` in SQL before any render | >500 sessions (~3 months of daily use) |
| Plugin manifest scanning live npm registry | `cds plugin install` is slow | Cache manifest locally with TTL; use known allowlist for suggestions | Any cold cache with network latency |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing AWS credentials in CDS config files | Credentials captured in session context; accidentally committed to vault | Use `~/.aws/credentials` or env vars only; never write AWS keys to any file CDS manages |
| Plugin runtime executing arbitrary npm packages | Full access to `ANTHROPIC_API_KEY`, vault, all session data | Manifest-only plugin model for v1.1; subprocess sandboxing required for runtime plugins |
| OAuth token written to disk by CDS | Token reuse by other local processes | CDS must never write OAuth tokens to disk; read from Keychain/env at call time only |
| S3 bucket ACL set to public | Session memory publicly readable | Add bucket policy check to `cds doctor`; warn clearly if bucket is publicly accessible |
| Dashboard bound to `0.0.0.0` | Any local process or network peer reads session analytics | Bind to `127.0.0.1` only; add random session token to dashboard URL |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `cds sync` with no progress feedback during S3 upload | User Ctrl-C's thinking it hung | Show "Uploading sessions.db (42KB)..." with duration |
| Graph visualization opens nothing / wrong browser | User sees no graph, no error | Use `open` (macOS), `xdg-open` (Linux), `start` (Windows); print URL to terminal as fallback |
| Cross-project search returns hundreds of unranked results | Impossible to find what's relevant | Use FTS5 built-in BM25 rank (`ORDER BY rank`); always rank results |
| Plugin install shows no manifest diff | Users don't know what changed | Print file list before and after installation |
| Multi-runtime options shown to Claude-only users | Wizard feels cluttered and irrelevant | Gate Gemini/Copilot/Codex options behind detection of those tools on PATH |
| Silent major version upgrade from `0.12.x` to `1.1.0` | Users get broken vault with no guidance | Startup version check: if vault schema is pre-v1.0, print upgrade instructions once |

---

## "Looks Done But Isn't" Checklist

- [ ] **S3 backend:** `sessions.db-wal` is 0 bytes or absent after `closeSessionsDB()` — verify in test
- [ ] **S3 backend:** Multi-device merge tested — two simultaneous writes, sync from both, row counts preserved
- [ ] **S3 backend:** AWS credentials never appear in `cds doctor` output, logs, or vault files
- [ ] **Graph visualization:** Server process exits on Ctrl-C and browser close — verify with `ps aux | grep cds`
- [ ] **Graph visualization:** Renders correctly with 0 entities and with >1K entities without browser freeze
- [ ] **Cross-project search:** Every DB handle is closed after query — `lsof | grep sessions.db` shows at most 1 open handle during search
- [ ] **Plugin system:** No `await import(userPath)` in plugin loader — grep for dynamic imports
- [ ] **OAuth bridge:** Credential resolver tested in Alpine Docker (no Keychain) — confirms fallback to env var
- [ ] **npm publish:** `publish.yml` uses `--tag next` and does NOT set `@latest` automatically
- [ ] **npm publish:** Docker UAT includes `0.12.x → 1.1.0` migration scenario before `@latest` promotion

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Corrupt S3 DB from missing WAL checkpoint | MEDIUM | Re-upload from the device that still has the intact local WAL; add checkpoint call to `closeSessionsDB` and republish patch |
| Data loss from last-write-wins sync | HIGH | No automated recovery — only possible from the device whose upload wasn't overwritten; add merge logic and `cds sync --dry-run` before any real data loss occurs |
| `better-sqlite3` install failure on Node 24 | MEDIUM | Pin to version with known prebuilts; publish hotfix within days of user report |
| Stale dashboard port blocking re-launch | LOW | `kill $(cat ~/.claude-dev-stack/dashboard.pid)`; add this check to `cds doctor` |
| Plugin executes malicious code | CRITICAL | Revoke `ANTHROPIC_API_KEY`, rotate credentials, audit vault for unexpected files; add subprocess sandboxing before re-enabling runtime plugins |
| `@latest` upgrade silently breaks `0.12.x` users | HIGH | Immediately republish `0.12.x` as `@latest`; release patch with startup migration detection; add `0.12.x → 1.1.0` scenario to Docker UAT |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WAL not checkpointed before S3 upload | S3 vault backend (Phase 43+) | Test: `sessions.db-wal` absent after `closeSessionsDB()` |
| Last-write-wins silent data loss | S3 sync design (same phase, ADR first) | Test: two-device write simulation preserves all rows |
| AWS SDK violates single-dep constraint | S3 ADR (before any code) | `pnpm ls --depth 0 cds-cli` shows no `@aws-sdk/*` |
| `better-sqlite3` Node 24 prebuilt gap | npm publish / GA phase | CI matrix includes Node 24; Docker install on ARM64 passes |
| Dashboard port not released on exit | Web dashboard phase | `cds dashboard` + Ctrl-C + `cds dashboard` succeeds on second call |
| Cross-project FTS opens N DB handles | Cross-project search phase | `lsof` during search shows at most 1 open `sessions.db` at a time |
| Plugin arbitrary code execution | Plugin system phase | No `await import(userPath)` in codebase; ADR mandates manifest-only for v1.1 |
| OAuth token unavailable on Linux | SDK dispatch / DEMO-01 phase | Credential resolver tested in Alpine Docker with no Keychain |
| `@latest` silent breaking upgrade | npm publish phase | `publish.yml` reviewed; Docker UAT includes `0.12.x → 1.1.0` migration |
| Graph node count performance cliff | Graph visualization phase | Smoke test with 5K synthetic entities renders in <2 seconds |

---

## Sources

- SQLite WAL documentation (official): https://www.sqlite.org/wal.html
- SQLite locking and concurrency (official): https://www.sqlite.org/lockingv3.html
- `better-sqlite3` Node 24 N-API 137 prebuilt gap: https://github.com/WiseLibs/better-sqlite3/issues/1384
- `better-sqlite3` musl/Alpine prebuilt gap: https://github.com/WiseLibs/better-sqlite3/issues/1382
- `better-sqlite3` ARM64 npx binding failure (claude-flow): https://github.com/ruvnet/claude-flow/issues/360
- FTS5 unavailable in `node:sqlite` built-in (Node 22+): https://github.com/openclaw/openclaw/issues/20987
- Anthropic OAuth token expiry in headless/CI: https://github.com/anthropics/claude-code/issues/2633
- Anthropic OAuth auth conflict (token + API key simultaneously): https://github.com/anthropics/claude-code/issues/11587
- npm prerelease promotion pitfalls (Bostock): https://medium.com/@mbostock/prereleases-and-npm-e778fc5e2420
- pnpm workspace dependency leakage: https://github.com/orgs/pnpm/discussions/5066
- Codebase: `packages/cds-core/src/vault/internal/db.ts` (WAL/PRAGMA config confirmed)
- Codebase: `packages/cds-s3-backend/src/index.ts` (confirmed stub state — no S3 logic yet)
- Codebase: `.planning/PROJECT.md` (single-dep constraint, DEMO-01 debt, monorepo structure)

---
*Pitfalls research for: claude-dev-stack v1.1 — adding S3 sync, graph viz, dashboard, plugin system, multi-runtime support to existing Node.js CLI monorepo*
*Researched: 2026-04-17*
