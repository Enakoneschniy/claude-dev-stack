---
id: SEED-001
status: dormant
planted: 2026-04-13
planted_during: v0.11 milestone (Phase 14 shipped, 15-18 pending)
trigger_when: after v0.11 ships, when planning v0.12+ scope
scope: Large
---

# SEED-001: Smart Limit Management & Execution Delegation

Integrate Claude's existing scheduling/delegation primitives (Managed Agents, Dispatch, /schedule) into claude-dev-stack so users get limit-aware execution out of the box. Agent detects budget exhaustion → offers continuation options → work continues unattended → user picks up results.

## Positioning

**claude-dev-stack is an integration layer, not a platform.** The goal is NOT to build a custom execution service — Anthropic already ships Managed Agents, Dispatch, Channels, /schedule. The goal is:
- **Discovery:** Most users don't know these features exist. Our install wizard + skills surface them automatically.
- **Configuration:** Set up scheduling, remote execution, limit monitoring as part of `npx claude-dev-stack` setup — zero manual config.
- **Orchestration:** GSD workflow detects low budget and offers smart continuation using existing primitives. The 4-option UX is our value-add, not the infra.
- **Works from the box:** Install our package → get limit awareness, scheduled continuation, remote delegation. No reading docs, no manual setup.

## Why This Matters

Claude Max subscribers hit session limits mid-phase. Anthropic ships the primitives (Managed Agents, Dispatch, /schedule, CronCreate) but users must discover, configure, and integrate them manually. claude-dev-stack bridges this gap — same philosophy as vault/skills/hooks: powerful features that "just work" after one install command.

The core UX is the **4-option decision point** when budget runs low:
1. Wait for reset → remind me to continue manually (notification)
2. Wait for reset → auto-continue on local machine (/schedule + CronCreate)
3. Wait for reset → auto-continue via Managed Agents (computer can be off)
4. Continue now (accept extra usage)

## When to Surface

**Trigger:** After v0.11 ships, when planning v0.12+ scope

This seed should be presented during `/gsd-new-milestone` when the milestone scope matches any of these conditions:
- Milestone includes "remote execution", "scheduling", "delegation", or "limit management"
- Milestone targets v0.12 or later
- User mentions session limits, budget, or unattended execution

## Scope Estimate

**Large** — A full milestone with multiple phases. Involves:
- Session budget detection + proactive warnings
- Local scheduling (cron/launchd integration)
- Remote execution service (server infra, sandbox, auth forwarding)
- Web dashboard for monitoring
- State sync protocol (git-based)
- Billing/subscription model

## Key Research Findings (2026-04-13)

Deep web research conducted with 45+ sources. Critical findings:

### Auth & Credential Forwarding
- `CLAUDE_CODE_OAUTH_TOKEN` — 1-year OAuth token via `claude setup-token`, can be forwarded as env var to containers
- Token does NOT work with `--bare` mode — needs full CLI environment

### Budget Detection
- **API users:** `anthropic-ratelimit-unified-*` headers return remaining budget on every response
- **Max subscribers:** `/cost`, `/context`, `/stats` commands show usage; 5-hour ROLLING window (not fixed reset)
- Token-weighted messages: single long-context prompt can consume 10+ "messages" worth
- Community tools: Claude-Code-Usage-Monitor (real-time predictions), ccusage (post-hoc analysis)

### Anthropic's Own Offerings (evaluate build vs platform)
- **Claude Managed Agents** (April 2026) — hosted execution with sandboxing, checkpointing, credential management. $0.08/session-hour + standard token costs. Early adopters: Notion, Rakuten, Sentry
- **Claude Dispatch** (March 2026) — programmatic task routing/scheduling, dependency chaining, auto-mode
- **Claude Channels** (March 2026) — persistent bidirectional streaming for real-time observability

### Sandbox Platforms (for remote execution)
- **E2B** — AI-focused, Firecracker, Claude Code integration documented, 24hr max session
- **Fly.io Sprites** — Firecracker, persistent NVMe, checkpoint/restore in 300ms, $0.07/CPU-hour
- **Blaxel** — perpetual standby at zero compute cost, 25ms resume, SOC2/HIPAA/ISO
- **Docker Sandboxes** — own Docker daemon per agent, 300+ MCP servers via Docker MCP Toolkit
- **Vercel Sandbox** — Firecracker, direct Claude Agent SDK integration
- **Cloudflare Dynamic Workers** — V8 isolates, <5ms cold start, Cap'n Web RPC for credential injection

### Competitive Landscape
- **Devin** — full cloud dev environment, accepts tasks from Linear/Jira, 659 PRs/week at enterprises
- **OpenAI Codex Automations** — scheduled tasks + cloud subagents (GA March 2026)
- **Manus AI** — scheduled + event-triggered tasks, $20/mo standard plan, acquired by Meta
- **runCLAUDErun** — macOS native scheduler for Claude Code tasks (free, local only)
- **claude-agent-server** — OSS: Claude Agent in E2B sandbox with WebSocket API

### Key Architecture Decision
**Integrate, don't rebuild.** Managed Agents handle isolation, checkpointing, and scaling. Dispatch handles task routing. /schedule + CronCreate handle local scheduling. claude-dev-stack's role is to wire these together into a seamless UX where the user installs one package and gets limit-aware execution with smart continuation — no manual discovery or configuration of Anthropic's primitives. Custom sandbox only needed if Managed Agents don't cover a specific use case.

## Breadcrumbs

Related code and decisions in current codebase:
- `$HOME/.claude/get-shit-done/workflows/transition.md` — parallel execution offer (INFRA-04, Phase 13) — same UX pattern of "consent before spawning"
- `lib/adr-bridge.mjs` — state sync via vault/git pattern
- `hooks/notebooklm-sync-trigger.mjs` — detached background process pattern (fire-and-forget)
- `hooks/notebooklm-sync-runner.mjs` — non-blocking execution with log file
- `.planning/seeds/` — this seed system itself
- GSD STATE.md — session continuity protocol (stopped_at, resume_file)
- Handoff plugin (thepushkarp) — YAML-based context transfer between sessions

## Notes

- User's primary pain: Claude Max session limits force stopping mid-phase, losing momentum
- Paid feature potential — SaaS revenue for coremind s.r.o.
- Security is paramount: ephemeral environments, zero credential retention, user's auth only
- Start with local scheduling (cron) as MVP, add remote execution as paid tier
- Consider: does GSD's git-based state make this easier than for other tools? All work is in commits → git push/pull is natural sync
