# Phase 41 Context

**Phase:** 41 — v1.0 Alpha UAT & Sandbox
**Mode:** auto-discussion
**Created:** 2026-04-17
**Source:** ROADMAP.md `### Phase 41`

## Goal recap

Validate the v1.0.0-alpha.1 build end-to-end in a sandboxed environment that cannot touch the maintainer's working Claude Code setup. Produce Docker-based UAT harness, run verification, document the procedure.

After this phase, the alpha is certified ready for `npm publish --tag alpha`.

## Canonical refs

- `.planning/ROADMAP.md` — Phase 41 entry
- `.planning/phases/39-cds-quick-demo-alpha-release/39-05-publish-release-SUMMARY.md` — publish pipeline + tarball shape
- `.planning/phases/40-v1-0-alpha-polish-and-blockers/40-06-REVIEW.md` — code review findings (all resolved)
- `docs/migration-v0-to-v1-alpha.md` — migration guide (wizard exercises this)
- `.github/workflows/publish.yml` — the pipeline UAT validates against
- `package.json` — version 1.0.0-alpha.1, files array, engines

## Decisions (locked)

### D-133: Docker for headless UAT (no real Claude Code session)

**Decision:** Use Docker (Node 20 + git base image) to validate everything that does NOT require a real Claude Code session:
- `npm install -g ./tarball` (global install from pack'd tgz)
- Wizard (`claude-dev-stack`) invocation in non-interactive mode (pipe empty stdin → tests wizard defaults / bail-on-no-input)
- Every CLI subcommand: `claude-dev-stack help`, `version`, `doctor`, `skills`, `projects`, `docs`, `stats`
- `claude-dev-stack migrate sessions --dry-run` against a synthetic vault fixture
- `.claude/settings.json` shape verification after wizard run (hooks + MCP entries)
- Tarball contents audit (dist/, skills/, hooks/, CHANGELOG.md present; packages/, tests/, .planning/ absent)

**What Docker CANNOT validate:** real Claude Code Stop hook firing (requires CC binary + auth), live `/cds-quick` dispatch (requires ANTHROPIC_API_KEY), actual MCP tool invocation from inside CC session.

**Why Docker over VM/Codespace:** zero-cost, runs locally, reproducible, < 30s build, no auth setup.

### D-134: Docker image spec

**Decision:**
- Base: `node:20-slim` (matches engines.node >=20, smallest official Node image)
- Install: `git` (needed for wizard vault git init), `python3` + `make` + `g++` (for better-sqlite3 fallback compile if prebuild missing)
- Working dir: `/app`
- Mount: local tarball via `COPY` (not live mount — isolated from host)
- No network during tests (optional: `--network none` to guarantee no API calls leak)

### D-135: Smoke test script (`docker/uat/run-smoke.sh`)

**Decision:** Shell script inside container, exit 0 = all pass, exit 1 = any failure. Each check is a function with descriptive name. Output format:

```
[PASS] npm install -g from tarball
[PASS] claude-dev-stack --version returns 1.0.0-alpha.1
[PASS] claude-dev-stack help exits 0
[FAIL] claude-dev-stack doctor exits 0
...
N/M checks passed
```

Checks (ordered):
1. `npm install -g ./claude-dev-stack-*.tgz` → exit 0
2. `claude-dev-stack --version` → output matches `1.0.0-alpha.1`
3. `claude-dev-stack help` → exit 0 + stdout contains "Setup"
4. `claude-dev-stack doctor` → exit 0 (may have warnings, no crashes)
5. `claude-dev-stack doctor --gsd-permissions` → creates `.claude/settings.local.json`
6. `claude-dev-stack skills` → exit 0
7. `claude-dev-stack version` → same as --version
8. Tarball audit: `tar tzf` → contains dist/core/index.js, skills/cds-quick/SKILL.md, CHANGELOG.md, hooks/session-end-capture.sh
9. Tarball audit: `tar tzf` → does NOT contain packages/, tests/, .planning/
10. SQL migrations: `dist/core/001-initial.sql` present in tarball
11. `node -e "import('./dist/core/index.js')"` → no crash (ESM importable)

### D-136: `pnpm uat` integration

**Decision:** Add `"uat"` script to root `package.json`:
```json
"uat": "docker build -t cds-uat -f docker/uat/Dockerfile . && docker run --rm cds-uat"
```
Single command runs everything. Devs can also `docker run -it cds-uat bash` for interactive debugging.

### D-137: CLAUDE_CONFIG_DIR audit — defer to docs only

**Decision:** Claude Code's `CLAUDE_CONFIG_DIR` (or `CLAUDE_HOME`) is NOT documented as a stable env override. Instead of relying on it:
- Docker UAT is fully isolated (container has its own `/root/.claude/`)
- `docs/uat.md` documents: "Never run the wizard on your real machine outside Docker for UAT. The Docker container provides full isolation."
- If a developer MUST test on host, they create a dedicated macOS user account — not env-var hackery.

### D-138: /gsd-verify-work deferred to post-Docker

**Decision:** Phase 41's formal `/gsd-verify-work` runs AFTER Docker UAT passes. If Docker smoke fails, there's no point running formal verification. Order:
1. Docker build + smoke (automated, `pnpm uat`)
2. If green → `/gsd-verify-work 39` + `/gsd-verify-work 40` (manual, formal)
3. If all green → GitHub release ready

### D-139: docs/uat.md scope

**Decision:** Concise procedure doc (not a tutorial). Sections:
1. Prerequisites (Docker installed, `pnpm build` done)
2. Quick run: `pnpm uat`
3. What it checks (1-paragraph summary)
4. Debugging failures (`docker run -it cds-uat bash`)
5. Manual host smoke (NEVER on your active setup — dedicated user or VM only)

## Plan structure (preview)

| # | Plan | Wave | Tasks |
|---|------|------|-------|
| 01 | Docker UAT harness (Dockerfile + run-smoke.sh + pnpm uat) | 1 | 4 |
| 02 | docs/uat.md + run UAT + verify-work | 2 | 3 |

2 plans, 2 waves, ~7 tasks total. Compact phase.

## Deferred

- Real Claude Code session testing → requires CC binary + auth in container, out of scope for v1.0 alpha
- Live `/cds-quick` dispatch → requires ANTHROPIC_API_KEY, covered by existing INTEGRATION=1 gated test
- Automated nightly UAT via GitHub Actions → v1.1
