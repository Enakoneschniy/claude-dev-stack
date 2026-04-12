# Phase 11: NotebookLM Query API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 11-notebooklm-query-api
**Areas discussed:** askNotebook response shape, generateArtifact scope, CLI output & --save, Error handling, Notebook ID resolution, CLI generate output

---

## askNotebook Response Shape

### Citation Format

| Option | Description | Selected |
|--------|-------------|----------|
| Parsed citations array | Return {answer, citations: [{index, sourceId, sourceTitle, snippet}]} — parse from JSON output | ✓ |
| Raw answer text only | Return {answer} with inline [1] [2] markers left in text | |
| You decide | Claude's discretion on citation format | |

**User's choice:** Parsed citations array (Recommended)

### Conversation Support

| Option | Description | Selected |
|--------|-------------|----------|
| Single question only | askNotebook(notebookId, question) — always starts fresh | ✓ |
| Optional conversation ID | askNotebook(notebookId, question, {conversationId}) | |
| You decide | Claude's discretion | |

**User's choice:** Single question only (Recommended)

### Source Filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Optional sourceIds param | askNotebook(notebookId, question, {sourceIds}) | ✓ |
| Skip for v1 | No source filtering | |
| You decide | Claude's discretion | |

**User's choice:** Optional sourceIds param

---

## generateArtifact Scope

### Artifact Types

| Option | Description | Selected |
|--------|-------------|----------|
| All types | Support all 11 notebooklm-py types | ✓ |
| Only report/mind-map/quiz | Match QUERY-03 literally | |
| You decide | Claude's discretion | |

**User's choice:** All types (Recommended)

### Wait Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Always wait (--wait) | Block until artifact ready | ✓ |
| Return immediately + poll helper | Return {artifactId, status}, separate pollArtifact() | |
| You decide | Claude's discretion | |

**User's choice:** Always wait (Recommended)

### Return Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Unified {artifactId, content, type} | content is text for text types, null for binary | ✓ |
| Auto-download binary types | Automatically download to temp path | |
| You decide | Claude's discretion | |

**User's choice:** Unified {artifactId, content, type}

---

## CLI Output & --save

### Citation Display

| Option | Description | Selected |
|--------|-------------|----------|
| Answer + numbered citations list | Print answer, separator, numbered citations | ✓ |
| Inline only | Answer with [1] [2] markers, titles at bottom | |
| You decide | Claude's discretion | |

**User's choice:** Answer + numbered citations list (Recommended)

### --save Filename

| Option | Description | Selected |
|--------|-------------|----------|
| {timestamp}-{question-slug}.md | Sortable by time, identifiable by content | ✓ |
| {timestamp}.md | Simpler, question in content only | |
| You decide | Claude's discretion | |

**User's choice:** {timestamp}-{question-slug}.md (Recommended)

### Generate CLI

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add notebooklm generate CLI | Expose all artifact types via CLI | ✓ |
| Library only, no CLI | generateArtifact() in lib only | |

**User's choice:** Yes, add notebooklm generate CLI (Recommended)

---

## Error Handling

### Retry Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Retry 2x with exponential backoff | 1s→2s, matches existing pattern | ✓ |
| No retry, fail immediately | Caller decides retry policy | |
| You decide | Claude's discretion | |

**User's choice:** Retry 2x with exponential backoff (Recommended)

### Generate Retry

| Option | Description | Selected |
|--------|-------------|----------|
| Delegate to notebooklm-py --retry | Pass --retry 2 to CLI command | ✓ |
| Wrapper-level retry too | Both levels retry | |
| You decide | Claude's discretion | |

**User's choice:** Delegate to notebooklm-py --retry (Recommended)

---

## Notebook ID Resolution

### Library API

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit ID required | askNotebook(notebookId, question) — caller provides | ✓ |
| Auto-resolve from project | Lib reads manifest itself | |
| You decide | Claude's discretion | |

**User's choice:** Explicit ID required (Recommended)

### CLI Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Read from sync manifest | Detect project, read manifest for notebook ID | ✓ |
| Use notebooklm-py 'current' context | Rely on `notebooklm use` state | |
| You decide | Claude's discretion | |

**User's choice:** Read from sync manifest (Recommended)

---

## CLI Generate Output

### Progress Display

| Option | Description | Selected |
|--------|-------------|----------|
| Simple waiting message | "Generating {type}..." then result | ✓ |
| Spinner/dots | Animated progress | |
| You decide | Claude's discretion | |

**User's choice:** Simple waiting message (Recommended)

### Binary Download Location

| Option | Description | Selected |
|--------|-------------|----------|
| vault/projects/{slug}/docs/notebooklm-artifacts/ | Same pattern as --save answers | ✓ |
| Current directory | Download to cwd | |
| Print URL only | No download | |

**User's choice:** vault/projects/{slug}/docs/notebooklm-artifacts/ (Recommended)

---

## Claude's Discretion

- JSON parsing details for `notebooklm ask --json` response structure
- Exact retry backoff timing implementation
- Question slug generation algorithm for --save filenames
- Progress message formatting during --wait
- Test approach (fake binary vs mock responses)

## Deferred Ideas

None — discussion stayed within phase scope.
