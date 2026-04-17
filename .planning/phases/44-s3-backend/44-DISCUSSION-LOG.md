# Phase 44: S3 Backend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 44-s3-backend
**Areas discussed:** Merge strategy, S3 credentials, Sync triggers, AWS SDK packaging

---

## Merge Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Download → merge → upload (Recommended) | pull(): download remote → INSERT OR IGNORE → replace local. push(): WAL checkpoint → upload. | ✓ |
| Append-only log | Never overwrite, versioned snapshots. No merge needed but grows storage. | |
| You decide | Claude picks based on research. | |

**User's choice:** Download → merge → upload (Recommended)
**Notes:** Simple, deterministic. UUID primary keys make INSERT OR IGNORE safe.

---

## S3 Credentials

| Option | Description | Selected |
|--------|-------------|----------|
| AWS defaults only (Recommended) | Delegate to AWS SDK credential chain. Store only bucket/region/profile in cds config. | ✓ |
| CDS config + AWS | Store access_key_id + secret in cds config. Less secure. | |
| You decide | Claude picks. | |

**User's choice:** AWS defaults only (Recommended)
**Notes:** CDS never stores AWS keys. Config only has bucket, region, profile name.

---

## Sync Triggers

| Option | Description | Selected |
|--------|-------------|----------|
| Manual only (Recommended) | `cds vault sync` — user runs explicitly. No hooks, no background. | ✓ |
| Manual + session-end | Manual + automatic push on Stop hook. Pull stays manual. | |
| Fully automatic | Pull on SessionStart, push on session end. Transparent. | |

**User's choice:** Manual only (Recommended)
**Notes:** Simplest for v1.1. Can add auto-sync later.

---

## AWS SDK Packaging

| Option | Description | Selected |
|--------|-------------|----------|
| Regular dep of @cds/s3-backend (Recommended) | Direct dependency. Package is already isolated. No dynamic import complexity. | ✓ |
| Peer dependency | User installs separately. Extra step. | |
| You decide | Claude picks. | |

**User's choice:** Regular dep of @cds/s3-backend (Recommended)
**Notes:** Single-dep constraint preserved because @cds/s3-backend is a separate workspace package.

---

## Claude's Discretion

- S3 object key structure
- Multipart upload threshold
- Progress indicator for sync
- Test strategy (mocked vs localstack)
- Error message formatting

## Deferred Ideas

- Automatic sync (session start/end) — v1.2
- S3-compatible alternatives (R2, B2) — v1.2
- KMS encryption — v1.2
