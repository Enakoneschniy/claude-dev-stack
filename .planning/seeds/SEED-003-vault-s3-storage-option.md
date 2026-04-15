---
id: SEED-003
status: dormant
planted: 2026-04-15
planted_during: v0.12 Hooks & Limits (shipped — captured retroactively from 2026-04-14 conversation that went unrecorded)
trigger_when: "After v0.12 release; when planning vault architecture refactor; when milestone scope mentions storage, backup, sync simplification, multi-machine, or NotebookLM sync optimization"
scope: Medium
---

# SEED-003: Vault S3 Storage Option

## Why This Matters

Current vault lives on the local filesystem (`~/vault/` by default). This creates friction:

- **Auto-sync overhead:** Multiple mechanisms (git, rsync, Dropbox) each with drift failure modes. We've spent multiple phases (Phase 7-8, Phase 16, Phase 17) working around sync semantics.
- **Multi-machine pain:** Context doesn't transfer cleanly between laptop/desktop/cloud environments — user has to manually pull vault state or rebuild it.
- **NotebookLM sync complexity:** `lib/notebooklm-sync.mjs` + `hooks/notebooklm-sync-trigger.mjs` re-upload files on every sync because NotebookLM's import API doesn't support "update from URL" natively. If vault lives in S3 with versioned objects, NotebookLM's upcoming "import from URL" path could read directly — zero local side of the pipeline.
- **Cloud scheduled tasks (SEED-001):** Claude Managed Agents / Cloud tasks do a fresh git clone on each run. Vault in S3 means scheduled tasks can read vault state directly via `aws s3 cp` without the repo knowing about vault — cleaner separation.

**User's original framing (2026-04-14 21:35):**
> "возникла мысль что если добавить опцию хранения vault в s3? в этом случае исчезает необходимость автосинка и т.д. и возмодно это еще как то может помочь с синком и для NotebookLM"

Translation: *add option to store vault in S3 → eliminates need for auto-sync, possibly also helps with NotebookLM sync.*

## When to Surface

**Trigger:** After v0.12 release; when planning vault architecture refactor; when milestone scope mentions: storage, backup, sync simplification, multi-machine, or NotebookLM sync optimization.

This seed should be presented during `/gsd-new-milestone` when the milestone scope matches any of these conditions:
- Milestone title or scope mentions "vault", "storage", "backup", "sync", "multi-machine", "cloud vault"
- Milestone targets NotebookLM sync improvements (likely v0.13+ if SEED-002 CDS-Core refactor lands first)
- User mentions pain with manual vault sync between machines
- CDS-Core-Independence milestone (SEED-002) is being planned — Target Refactor #1 (`.planning/` → `vault/projects/X/planning/`) would directly benefit from S3-backed vault

## Scope Estimate

**Medium** — A phase or two. Involves:

1. **Backend abstraction:** Introduce `VaultBackend` interface with `fs` (current) and `s3` implementations in `lib/vault-backend.mjs`. All `fs.readFile`/`fs.writeFile` in vault-touching code (notebooklm-*, session-manager, context.md updates) routes through the backend.
2. **Config:** `cds.config.json` → `vault.backend: "fs" | "s3"`, `vault.s3: { bucket, prefix, region, credentialsSource }`. Wizard prompts for S3 details during install if user opts in.
3. **Credential strategy:** Must NOT store AWS creds in CDS config — delegate to `~/.aws/credentials` profile or env vars or IAM role (for cloud tasks). Wizard surfaces profile options.
4. **Atomic writes:** S3 doesn't have filesystem-level atomicity. Need etag-based optimistic concurrency for session-log writes and ADR creation to prevent concurrent-session corruption.
5. **NotebookLM path:** When NotebookLM supports "import from URL" (currently uses multipart upload), wire `notebooklm-sync.mjs` to use S3 presigned URLs instead of local file upload. Big reduction in egress + latency.
6. **Versioning:** Enable S3 versioning on the bucket → time-travel recovery for accidental vault edits. Cheaper than git-based vault versioning.
7. **Cost ceiling:** Document expected costs (small vault ~1-10 MB × PUT/GET costs) — negligible for individual users, but needs upfront warning in wizard.

**Not in scope (defer further):**
- S3-compatible alternatives (R2, B2) — out-of-the-box with same SDK if credentials configured right
- Encryption-at-rest via KMS (default S3 SSE is fine for MVP)
- Cross-region replication (nice-to-have, not core)

## Tradeoffs

| Aspect | Current (FS vault) | S3 vault |
|--------|--------------------|----------|
| Setup friction | Zero (works anywhere) | AWS account + bucket + creds |
| Cost | Free | Small but non-zero |
| Multi-machine | Manual sync (git/rsync/Dropbox) | Automatic — pull latest on read |
| Offline | Works | Degrades (read cached copy?) |
| NotebookLM sync | Upload on each change | Potentially import-from-URL |
| Scheduled tasks | Fresh clone re-builds | Direct S3 read |
| Corruption recovery | Git history (if vault is git repo) | S3 versioning |
| Privacy | Local only | Goes to AWS (user accepts risk) |

**Offline concern** is the biggest UX question — probably need local read-through cache (`~/.cache/cds-vault/`) with write-through to S3 on change + eventual-consistency warnings.

## Relationship to Other Seeds

- **SEED-001 (Execution Delegation)** — Cloud scheduled tasks need vault state. S3 backend is a natural fit here. Without S3 (or equivalent), cloud tasks must `git clone` a repo that contains vault (which we've explicitly avoided to keep project git clean).
- **SEED-002 (CDS-Core Independence)** — Target Refactor #1 moves `.planning/` into vault. If vault is S3, `.planning/` is S3. Aligns perfectly with the `vault/projects/X/planning/` strategy.

Recommend: evaluate as **Phase 3 or later** of the CDS-Core milestone (after vendoring + vault path refactor land), not as standalone milestone.

## Breadcrumbs

Related code in current codebase:

- `lib/notebooklm-sync.mjs` — main sync engine; would route through VaultBackend
- `lib/notebooklm-manifest.mjs` — manifest read/write; backend-agnostic after refactor
- `lib/notebooklm-migrate.mjs` — migration script pattern (relevant for FS→S3 migration tool)
- `hooks/notebooklm-sync-trigger.mjs` — detached sync runner; becomes much simpler if S3 path is native
- `hooks/notebooklm-sync-runner.mjs` — background sync; may not be needed at all if S3 import-from-URL works
- `hooks/session-start-context.sh` — reads vault context.md; becomes `aws s3 cp` under S3 backend
- `hooks/update-context.mjs` — writes to vault; needs atomic-write wrapper
- `lib/adr-bridge-session.mjs` — writes ADRs to vault; same atomic-write concern
- `SEED-001-delegated-execution-service.md` — cloud tasks consumer
- `SEED-002-cds-core-independence.md` — Target Refactor #1 synergy
- `.planning/milestones/v0.9-phases/07-notebooklm-manifest-v2-per-project-sync-loop/` — past sync architecture decisions worth consulting

External references:
- AWS SDK v3 for Node.js — `@aws-sdk/client-s3` (tree-shakeable, smaller than v2)
- NotebookLM API docs — check "import from URL" status before assuming the benefit materializes
- R2/B2 compatibility — document in config schema that `s3` backend works for any S3-compatible endpoint

## Open Questions (Resolve During Planning)

- **Opt-in vs default?** Free-tier-friendly option: FS default, S3 opt-in via wizard question. Consistent with current single-dep philosophy — no forced AWS dependency.
- **AWS SDK footprint:** `@aws-sdk/client-s3` is not small (~2MB). Accept the hit, or make S3 backend a separate optional install (`npm install -g claude-dev-stack-s3-backend`)? Lean: separate package, keeps core lean.
- **Credential prompt UX:** Wizard asks for profile name, or assumes `default` profile? Profile name with default = `default`.
- **Region selection:** Prompt user or auto-detect from aws config? Use aws config, fall back to prompt.
- **Migration command:** `cds vault migrate --from fs --to s3 --bucket X` — one-shot migration tool. Needed for early adopters.

## Notes

- This seed was captured **retroactively** on 2026-04-15. The original conversation was 2026-04-14 21:35 during v0.12 work. The idea sat in transcript and never made it to `.planning/seeds/` or `ROADMAP.md` backlog — caught only when user explicitly asked "а еще я там про s3 писал. где это потерялось?". **Lesson:** idea-capture needs to be more aggressive during normal work. See related backlog items: "`/gsd-note` should auto-trigger on trigger-phrases (пока не забыл, кстати, мысль)" and "gsd-session-end ADR bridge should also scan for non-ADR ideas and offer seed/note creation".
- S3 is representative — same architecture could support Azure Blob, GCS, or any object store with an adapter. "S3" is shorthand for "remote object store backend".
- Cost sanity check: 10 MB vault × $0.023/GB/mo = $0.0002/mo storage. Even 10k PUT/mo = $0.05/mo. Trivial for individual use.
