---
plan_id: 36-01-capture-core-module
phase: 36
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/cds-core/src/capture/index.ts
  - packages/cds-core/src/capture/types.ts
  - packages/cds-core/src/capture/prompts.ts
  - packages/cds-core/src/capture/transcript.ts
  - packages/cds-core/src/capture/transcript.test.ts
  - packages/cds-core/src/capture/prompts.test.ts
  - packages/cds-core/src/capture/index.test.ts
  - packages/cds-core/src/capture/fixtures/small-session.jsonl
  - packages/cds-core/src/capture/fixtures/large-session.jsonl
  - packages/cds-core/src/capture/fixtures/edge-empty.jsonl
  - packages/cds-core/src/capture/fixtures/edge-tool-only.jsonl
  - packages/cds-core/src/index.ts
autonomous: true
requirements:
  - CAPTURE-05
user_setup: []
must_haves:
  truths:
    - "`@cds/core/capture` package export surface exposes `loadTranscript`, `buildExtractionPrompt`, `emitObservationsTool`, `SYSTEM_PROMPT`, and `OBSERVATION_TYPES` (D-55..D-62)"
    - "`loadTranscript(sessionId, projectSlug)` reads the Claude Code jsonl transcript at `~/.claude/projects/{slug}/{sessionId}.jsonl` and returns user messages, assistant text, and tool-use summaries (D-60..D-61)"
    - "`buildExtractionPrompt(messages)` applies tier-2 head+tail truncation (20 first + 30 last) when estimated tokens exceed 40_000 and inserts a `... [M messages elided for cost] ...` marker (D-61)"
    - "Tool-result truncation cap of 200 chars applies to Read/Grep/Bash; Edit/Write/MultiEdit results kept in full (D-61)"
    - "`emitObservationsTool.input_schema` is a JSON Schema draft-07 object with `additionalProperties: false` on all object types and the six observation types from D-55 enum (`decision`, `blocker`, `todo`, `file-touch`, `user-intent`, `pattern-learned`)"
    - "Unit tests cover: empty jsonl, malformed lines (graceful skip), small session shape, large session truncation, schema validation (good + 3 malformed cases)"
  artifacts:
    - path: "packages/cds-core/src/capture/index.ts"
      provides: "Barrel export for the capture subpackage"
      contains: "export "
    - path: "packages/cds-core/src/capture/types.ts"
      provides: "ObservationType union + EmitObservationsInput interface"
      contains: "OBSERVATION_TYPES"
    - path: "packages/cds-core/src/capture/prompts.ts"
      provides: "SYSTEM_PROMPT string + emitObservationsTool with input_schema"
      contains: "emit_observations"
    - path: "packages/cds-core/src/capture/transcript.ts"
      provides: "loadTranscript + buildExtractionPrompt"
      contains: "loadTranscript"
    - path: "packages/cds-core/src/capture/transcript.test.ts"
      provides: "Transcript parser + truncation unit tests"
      min_lines: 60
    - path: "packages/cds-core/src/capture/prompts.test.ts"
      provides: "Schema validation unit tests"
      min_lines: 40
    - path: "packages/cds-core/src/capture/index.test.ts"
      provides: "Barrel export surface test"
      min_lines: 10
    - path: "packages/cds-core/src/capture/fixtures/small-session.jsonl"
      provides: "Fixture: ~20 line jsonl, typical session"
    - path: "packages/cds-core/src/capture/fixtures/large-session.jsonl"
      provides: "Fixture: 200+ line jsonl for tier-2 truncation test"
    - path: "packages/cds-core/src/capture/fixtures/edge-empty.jsonl"
      provides: "Fixture: empty file"
    - path: "packages/cds-core/src/capture/fixtures/edge-tool-only.jsonl"
      provides: "Fixture: only tool_use/tool_result, no text"
  key_links:
    - from: "packages/cds-core/src/index.ts"
      to: "packages/cds-core/src/capture/index.js"
      via: "re-export"
      pattern: "export \\* as capture from './capture/index\\.js'"
    - from: "packages/cds-core/src/capture/transcript.ts"
      to: "packages/cds-core/src/capture/prompts.ts"
      via: "SYSTEM_PROMPT import"
      pattern: "import .* SYSTEM_PROMPT .* from ['\"]\\./prompts"
    - from: "packages/cds-core/src/capture/prompts.ts"
      to: "packages/cds-core/src/capture/types.ts"
      via: "OBSERVATION_TYPES import"
      pattern: "import .* OBSERVATION_TYPES .* from ['\"]\\./types"
---

<objective>
Create the `@cds/core/capture` subpackage that provides the transcript parser, extraction prompt, and `emit_observations` tool schema. This is the pure-logic, unit-testable foundation of Phase 36 — no I/O beyond reading a jsonl file, no dependencies on `@cds/core/vault` or the agent dispatcher.

Purpose: Satisfy D-55..D-62 from CONTEXT.md (versioned prompts, typed tool schema, transcript parser, tier-2 truncation) inside the `@cds/core` package so they can be unit-tested in isolation and consumed by Plan 02's Stop hook.

Output: A new `packages/cds-core/src/capture/` directory with six source files, four jsonl fixtures, and three test files. Updates `packages/cds-core/src/index.ts` to re-export the capture subpackage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/36-auto-session-capture/36-CONTEXT.md
@.planning/phases/36-auto-session-capture/36-RESEARCH.md
@.planning/phases/36-auto-session-capture/36-VALIDATION.md
@./CLAUDE.md
@packages/cds-core/src/index.ts

<interfaces>
<!-- The capture module's public API surface (to be exported from `packages/cds-core/src/capture/index.ts`): -->

```typescript
// From types.ts
export const OBSERVATION_TYPES: readonly ['decision', 'blocker', 'todo', 'file-touch', 'user-intent', 'pattern-learned'];
export type ObservationType = typeof OBSERVATION_TYPES[number];

export interface EmitObservationsInput {
  session_summary: string;
  observations: Array<{
    type: ObservationType;
    content: string;
    entities: string[];
  }>;
  entities: Array<{ name: string; type: string }>;
  relations: Array<{ from: string; to: string; type: string }>;
}

// From prompts.ts
export const SYSTEM_PROMPT: string;

// The Tool type is imported from `@cds/core` (re-exported from Phase 34 agent-dispatcher.ts per D-20).
// If Phase 34 has not yet exported `Tool`, Plan 01 MUST define a local structural type:
//   type Tool = { name: string; description?: string; input_schema: unknown };
// and use it rather than blocking on Phase 34.
export const emitObservationsTool: Tool;

// From transcript.ts
export interface ParsedMessage {
  role: 'user' | 'assistant' | 'tool_summary';
  content: string;
}

export function loadTranscript(sessionId: string, projectSlug: string): Promise<ParsedMessage[]>;

export function buildExtractionPrompt(messages: ParsedMessage[]): {
  systemPrompt: string;
  userPrompt: string;
  estimatedTokens: number;
};
```
</interfaces>

<context_for_reader>
- **D-55 enum** MUST match exactly: `['decision', 'blocker', 'todo', 'file-touch', 'user-intent', 'pattern-learned']`. These six types are the initial set; the schema rejects others. DB-level (Phase 35) keeps `observations.type` as open TEXT per D-56, so future additions only require a prompts.ts bump.
- **Tier-2 truncation constants** are locked: `TIER_2_HEAD = 20`, `TIER_2_TAIL = 30`, `TIER_2_MAX_TOKENS = 40_000` (D-61).
- **Token estimator** uses `chars / 3.5` heuristic per Research Pitfall 7 (accepted imprecision for English prose).
- **Tool-result truncation cap**: `TOOL_TRUNCATE_CAP = 200` chars; full-keep set is `{ 'Edit', 'Write', 'MultiEdit' }` (D-61).
- **jsonl row shape** (from Claude Code docs referenced in CONTEXT.md canonical_refs):
  - `{ "type": "user", "message": { "content": "text" | [...] } }` for user messages (string for plain text, array for tool_result).
  - `{ "type": "assistant", "message": { "content": [{ type: "text" | "tool_use", ... }] } }` for assistant messages.
  - The parser MUST tolerate unknown row types, malformed JSON lines, and empty lines — skip silently, never throw.
- **SYSTEM_PROMPT** drafts the extraction job for Haiku in plain English, references the tool name `emit_observations`, lists the six types with 1-line definitions each, and instructs "call the tool exactly once, no free-form text output." Keep it under 1500 chars (snapshot-tested for stability).
</context_for_reader>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create types.ts with ObservationType union and EmitObservationsInput interface</name>
  <files>packages/cds-core/src/capture/types.ts</files>
  <read_first>packages/cds-core/src/index.ts, .planning/phases/36-auto-session-capture/36-CONTEXT.md, .planning/phases/36-auto-session-capture/36-RESEARCH.md</read_first>
  <action>
    Create `packages/cds-core/src/capture/types.ts` with exactly this shape:
    ```typescript
    export const OBSERVATION_TYPES = [
      'decision',
      'blocker',
      'todo',
      'file-touch',
      'user-intent',
      'pattern-learned',
    ] as const;

    export type ObservationType = (typeof OBSERVATION_TYPES)[number];

    export interface EmitObservationsInput {
      session_summary: string;
      observations: Array<{
        type: ObservationType;
        content: string;
        entities: string[];
      }>;
      entities: Array<{ name: string; type: string }>;
      relations: Array<{ from: string; to: string; type: string }>;
    }
    ```
    Do NOT add any other types here — `Tool` is imported from the parent `@cds/core` package in prompts.ts, not re-declared.
  </action>
  <verify>File exists and `pnpm tsc --noEmit` passes.</verify>
  <acceptance_criteria>
    - File exists at `packages/cds-core/src/capture/types.ts`
    - File contains the exact array literal `['decision', 'blocker', 'todo', 'file-touch', 'user-intent', 'pattern-learned']` (order matters for snapshot stability)
    - File contains `as const` after the array (for readonly tuple inference)
    - File exports `OBSERVATION_TYPES`, `ObservationType`, and `EmitObservationsInput`
    - `pnpm tsc --noEmit` exits 0 (covered by Plan 01 full suite run)
  </acceptance_criteria>
  <done>Types file is importable and tsc passes.</done>
</task>

<task type="auto">
  <name>Task 2: Create prompts.ts with SYSTEM_PROMPT string and emitObservationsTool definition</name>
  <files>packages/cds-core/src/capture/prompts.ts</files>
  <read_first>packages/cds-core/src/capture/types.ts, packages/cds-core/src/index.ts, .planning/phases/36-auto-session-capture/36-RESEARCH.md</read_first>
  <action>
    Create `packages/cds-core/src/capture/prompts.ts`. Import `OBSERVATION_TYPES` and `EmitObservationsInput` from `./types.js` (ESM import path — note the `.js` suffix even in TS, per Phase 33 D-05 NodeNext module mode).

    Export `SYSTEM_PROMPT` as a `const` string. Content outline (draft; planner may refine wording, but the structure is fixed):
    ```text
    You are a session observer. Your job is to read a Claude Code development session
    transcript and emit structured observations into a single call of the
    `emit_observations` tool. Do not produce any free-form text output — call the tool
    exactly once.

    Observation types (use these values only):
    - `decision`: The developer made a concrete choice with rationale.
    - `blocker`: An obstacle surfaced that prevented progress or requires external input.
    - `todo`: An action item for a future session.
    - `file-touch`: A file was created, modified, or deleted as part of the work.
    - `user-intent`: A goal, preference, or high-level directive from the user.
    - `pattern-learned`: A reusable insight, idiom, or gotcha discovered.

    Entities are names (classes, files, packages, people, concepts) referenced by
    observations. Relations capture how entities connect (e.g. `{ from: 'Phase 36',
    to: '@cds/core', type: 'depends_on' }`).

    Keep session_summary to 1-3 sentences. Each observation content field is 1-2
    sentences. Prefer concrete facts over opinions. If the transcript is empty or has
    no substance, emit an empty observations array with a session_summary of "No
    substantive activity in this session."
    ```

    Export `emitObservationsTool` as an object literal with `name`, `description`, and `input_schema` (JSON Schema draft-07 shape). The `input_schema` MUST:
    - Have `type: 'object'`, `additionalProperties: false`, and `required` listing all four fields.
    - Define `session_summary` with `type: 'string'`, `minLength: 1`, `maxLength: 1000`.
    - Define `observations` as array with `maxItems: 40`, items with `type: 'string', enum: OBSERVATION_TYPES` (use `[...OBSERVATION_TYPES]` to strip readonly).
    - Define `entities` as array with `maxItems: 50`, items with `name` and `type` required strings.
    - Define `relations` as array with `maxItems: 40`, items with `from`, `to`, `type` required strings.

    The `Tool` type should be imported from the parent `@cds/core` package IF it's exported from `packages/cds-core/src/index.ts` (from Phase 34's agent-dispatcher). If not (check by reading `packages/cds-core/src/index.ts`), define a local structural type at the top of the file:
    ```typescript
    // Structural type — mirrors Phase 34 D-20's re-export of the SDK Tool shape.
    // Replace with `import type { Tool } from '../index.js'` once Phase 34 exports it.
    type Tool = { name: string; description?: string; input_schema: unknown };
    ```
    Do not block on Phase 34 execution; Plan 02's hook will dovetail once the SDK type is re-exported.
  </action>
  <verify>`pnpm tsc --noEmit` passes and `emitObservationsTool.name === 'emit_observations'`.</verify>
  <acceptance_criteria>
    - File exists at `packages/cds-core/src/capture/prompts.ts`
    - File contains literal string `'emit_observations'` (tool name)
    - File imports `OBSERVATION_TYPES` from `./types.js`
    - `emitObservationsTool.input_schema` contains literal `additionalProperties: false` (grep finds this pattern)
    - `emitObservationsTool.input_schema.properties.observations.items.properties.type.enum` derived from `OBSERVATION_TYPES` (readable via `grep -A 2 'enum:' prompts.ts`)
    - `SYSTEM_PROMPT` is a single exported const string of ≥500 chars and ≤1500 chars
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>prompts.ts exports SYSTEM_PROMPT and emitObservationsTool, schema validates on good input.</done>
</task>

<task type="auto">
  <name>Task 3: Create transcript.ts with loadTranscript + buildExtractionPrompt</name>
  <files>packages/cds-core/src/capture/transcript.ts</files>
  <read_first>packages/cds-core/src/capture/types.ts, packages/cds-core/src/capture/prompts.ts, .planning/phases/36-auto-session-capture/36-RESEARCH.md</read_first>
  <action>
    Create `packages/cds-core/src/capture/transcript.ts`. Use the exact code from 36-RESEARCH.md §Code Examples §"Transcript parser with inclusion filter + truncation" as the starting point. Key requirements:

    - ESM import paths with `.js` suffix: `import { SYSTEM_PROMPT } from './prompts.js'`.
    - Import from `node:fs/promises`, `node:os`, `node:path` (prefix mandatory per Phase 33 conventions).
    - Constants exported as named exports so tests can import them:
      ```typescript
      export const TOOL_TRUNCATE_CAP = 200;
      export const TOKEN_ESTIMATE_DIVISOR = 3.5;
      export const TIER_2_HEAD = 20;
      export const TIER_2_TAIL = 30;
      export const TIER_2_MAX_TOKENS = 40_000;
      ```
    - `ParsedMessage` interface exported.
    - `loadTranscript(sessionId: string, projectSlug: string): Promise<ParsedMessage[]>` — reads jsonl at `~/.claude/projects/{projectSlug}/{sessionId}.jsonl`, returns filtered/shaped messages. Tolerates:
      - File-not-found → propagates `ENOENT` (caller handles as silent tier per D-66).
      - Malformed lines → `try { JSON.parse(line) } catch { continue }` — skip silently.
      - Unknown row types → skip.
      - Empty/whitespace-only lines → skip.
    - `summarizeToolCall(name, input)` helper — slices first 80 chars of the first arg.
    - `truncateToolResult(content, toolName)` helper — 200-char cap except `{'Edit','Write','MultiEdit'}`.
    - `buildExtractionPrompt(messages)` — returns `{ systemPrompt, userPrompt, estimatedTokens }`. Applies tier-2 head+tail truncation when `estimatedTokens > TIER_2_MAX_TOKENS` and `messages.length > TIER_2_HEAD + TIER_2_TAIL`. Inserts `\n... [N messages elided for cost] ...\n` marker.

    Do NOT introduce any other new exports. Keep the file under 200 lines.
  </action>
  <verify>`pnpm tsc --noEmit` passes. Unit tests in Task 5 validate behavior.</verify>
  <acceptance_criteria>
    - File exists at `packages/cds-core/src/capture/transcript.ts`
    - File exports `loadTranscript`, `buildExtractionPrompt`, `ParsedMessage`, and the 5 truncation constants
    - File imports `SYSTEM_PROMPT` from `./prompts.js` (matches regex `import .* SYSTEM_PROMPT .* from ['"]\./prompts`)
    - `grep -c 'TIER_2_MAX_TOKENS = 40_000' transcript.ts` returns 1
    - `grep -c 'TOOL_TRUNCATE_CAP = 200' transcript.ts` returns 1
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>transcript.ts parses jsonl and truncates per D-61 constants.</done>
</task>

<task type="auto">
  <name>Task 4: Create index.ts barrel + update root @cds/core export</name>
  <files>packages/cds-core/src/capture/index.ts, packages/cds-core/src/index.ts</files>
  <read_first>packages/cds-core/src/capture/types.ts, packages/cds-core/src/capture/prompts.ts, packages/cds-core/src/capture/transcript.ts, packages/cds-core/src/index.ts</read_first>
  <action>
    Create `packages/cds-core/src/capture/index.ts` as a barrel that re-exports from `types.js`, `prompts.js`, and `transcript.js`:
    ```typescript
    export * from './types.js';
    export * from './prompts.js';
    export * from './transcript.js';
    ```

    Then update `packages/cds-core/src/index.ts` to re-export the capture namespace:
    ```typescript
    export * as capture from './capture/index.js';
    ```
    Append this line at an appropriate location — do NOT reorder existing exports. If `packages/cds-core/src/index.ts` does not yet exist (Phase 34/35 blocking), create it with just this line + a module comment explaining it will be extended by Phase 34.

    Verify the capture namespace is reachable via `import { capture } from '@cds/core'` AND directly via `import { loadTranscript } from '@cds/core/capture'` (the latter requires the package.json `exports` field to list `./capture` — if it doesn't, update `packages/cds-core/package.json` `exports` map:
    ```json
    {
      "exports": {
        ".": "./dist/index.js",
        "./capture": "./dist/capture/index.js"
      }
    }
    ```
    Preserve existing entries. Read `packages/cds-core/package.json` first to know its current shape (Phase 33 created it).
  </action>
  <verify>`pnpm tsc --noEmit` passes. `pnpm -w vitest run packages/cds-core/src/capture/index.test.ts` passes (after Task 5).</verify>
  <acceptance_criteria>
    - File exists at `packages/cds-core/src/capture/index.ts` with 3 `export *` lines
    - `packages/cds-core/src/index.ts` contains `export * as capture from './capture/index.js'`
    - `packages/cds-core/package.json` `exports` map contains an entry for `./capture` mapping to the built output
    - `pnpm tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Capture subpackage reachable via both namespace and subpath imports.</done>
</task>

<task type="auto">
  <name>Task 5: Create fixtures directory with 4 jsonl fixture files</name>
  <files>packages/cds-core/src/capture/fixtures/small-session.jsonl, packages/cds-core/src/capture/fixtures/large-session.jsonl, packages/cds-core/src/capture/fixtures/edge-empty.jsonl, packages/cds-core/src/capture/fixtures/edge-tool-only.jsonl</files>
  <read_first>.planning/phases/36-auto-session-capture/36-RESEARCH.md</read_first>
  <action>
    Create four fixture jsonl files under `packages/cds-core/src/capture/fixtures/`:

    **small-session.jsonl** — Write ~15-20 rows mixing user/assistant messages + a couple tool_use + tool_result pairs. One-line JSON per row. Example schema rows:
    ```
    {"type":"user","message":{"content":"help me fix the auth bug"}}
    {"type":"assistant","message":{"content":[{"type":"text","text":"I'll look at the auth module"}]}}
    {"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"src/auth.ts"}}]}}
    {"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"function verifyToken..."}]}}
    ...
    ```

    **large-session.jsonl** — 250 user+assistant alternating rows, each with ~200 chars of content, to exercise tier-2 truncation. Content can be repetitive lorem-ipsum-style but realistic (not just `"msg 1"`). Total file size ~60 KB to ensure token estimate pushes over 40k.

    **edge-empty.jsonl** — Zero bytes (empty file).

    **edge-tool-only.jsonl** — 10 rows of only `tool_use` + `tool_result` pairs (Read/Grep), NO user messages, NO assistant text blocks. Exercises the "only tool summaries" path.

    All fixtures must be valid line-delimited JSON — each line is a parseable JSON object (except empty lines which parsers MUST skip).

    Do NOT commit real session data. Make up plausible-looking but clearly-synthetic content (e.g., `"fix auth bug"`, `"run pnpm test"`).
  </action>
  <verify>Each fixture file exists. `node -e "const raw=require('fs').readFileSync('packages/cds-core/src/capture/fixtures/small-session.jsonl','utf8'); raw.split('\\n').filter(Boolean).forEach(l => JSON.parse(l))"` does NOT throw.</verify>
  <acceptance_criteria>
    - 4 files exist in `packages/cds-core/src/capture/fixtures/`
    - `small-session.jsonl` has between 15 and 25 non-empty lines
    - `large-session.jsonl` has at least 200 non-empty lines AND file size > 40 KB
    - `edge-empty.jsonl` has file size 0
    - `edge-tool-only.jsonl` has only tool_use/tool_result blocks (no `"type":"text"` substring)
    - All 4 files pass JSON.parse validation line-by-line
  </acceptance_criteria>
  <done>4 fixtures ready, all valid jsonl, sized to exercise truncation path.</done>
</task>

<task type="auto">
  <name>Task 6: Write transcript.test.ts unit tests</name>
  <files>packages/cds-core/src/capture/transcript.test.ts</files>
  <read_first>packages/cds-core/src/capture/transcript.ts, packages/cds-core/src/capture/fixtures/small-session.jsonl, packages/cds-core/src/capture/fixtures/large-session.jsonl</read_first>
  <action>
    Write vitest tests covering:

    1. **`loadTranscript` with small fixture**: returns ≥10 messages, contains at least one `'user'` role and at least one `'assistant'` role, tool-summary roles prefixed `[Read]`, `[Grep]`, etc.
    2. **`loadTranscript` with empty fixture**: returns `[]`.
    3. **`loadTranscript` with tool-only fixture**: returns only `'tool_summary'` roles, no `'user'` or `'assistant'`.
    4. **`loadTranscript` with malformed jsonl**: construct an inline fixture with `"{not valid json"` mixed in — parser skips bad lines, returns valid ones.
    5. **`loadTranscript` with missing file**: throws an error whose `.code === 'ENOENT'` (caller handles silently; this test ensures the parser does NOT swallow it).
    6. **`buildExtractionPrompt` with small set**: returns `estimatedTokens` consistent with `chars/3.5`, `userPrompt` contains the `<user>`/`<assistant>` wrapper tags, NO elision marker present.
    7. **`buildExtractionPrompt` with large set (from large-session fixture)**: returns `estimatedTokens <= TIER_2_MAX_TOKENS + small_margin`, `userPrompt` contains the elision marker regex `/\.\.\. \[\d+ messages elided for cost\] \.\.\./`.
    8. **Tool-result truncation**: feed a synthesized `ParsedMessage` with 500-char Read result through a helper (or re-call `loadTranscript` on a fixture with a long Read result), assert the captured content is exactly `TOOL_TRUNCATE_CAP` chars + `…` marker.
    9. **Tool-result full-keep for Write/Edit**: same-shape test with `tool_use.name === 'Write'` — full content preserved.

    Use `describe` blocks per function, `it` per assertion. Do NOT mock file I/O — read real fixtures via `loadTranscript`. Use `__dirname`-equivalent in ESM: `import { dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; const __dirname = dirname(fileURLToPath(import.meta.url));`.

    Tests 4-5 MAY need helper functions that write temp fixtures — use `mkdtempSync` from `node:fs` and clean up in `afterEach`.
  </action>
  <verify>`pnpm -w vitest run packages/cds-core/src/capture/transcript.test.ts` — all assertions pass (≥9 test cases).</verify>
  <acceptance_criteria>
    - File exists at `packages/cds-core/src/capture/transcript.test.ts` with ≥60 lines
    - Contains at least 9 `it(` or `test(` blocks
    - `pnpm -w vitest run packages/cds-core/src/capture/transcript.test.ts` exits 0 with ≥9 passing
    - Contains regex literal `/elided for cost/` in at least one assertion
    - Contains `TOOL_TRUNCATE_CAP` imported from `./transcript.js` (verified structural)
  </acceptance_criteria>
  <done>Transcript parser behavior locked by tests.</done>
</task>

<task type="auto">
  <name>Task 7: Write prompts.test.ts schema validation tests</name>
  <files>packages/cds-core/src/capture/prompts.test.ts</files>
  <read_first>packages/cds-core/src/capture/prompts.ts, packages/cds-core/src/capture/types.ts</read_first>
  <action>
    Write vitest tests covering the `emitObservationsTool.input_schema` validation. Since `@cds/core` does not yet ship a JSON Schema validator, use a lightweight inline validator: install `ajv` as a devDependency of `@cds/core` (it's widely used and has no heavy transitive deps), OR write a narrow validator that only checks the cases we care about (required fields, enum membership, string length bounds, additionalProperties rejection).

    Recommended: use `ajv` (add to `packages/cds-core/devDependencies` via `pnpm add -D -F @cds/core ajv`).

    Test cases:

    1. **Good payload validates**: a full `EmitObservationsInput` with session_summary + 2 observations of different types + 3 entities + 1 relation. `ajv.validate(tool.input_schema, good)` returns `true`.
    2. **Missing session_summary**: `ajv.validate(schema, { ...good, session_summary: undefined })` returns `false`.
    3. **Invalid observation type**: `observations[0].type = 'invalid-type'` → schema rejects (`enum` violation).
    4. **Over-long session_summary**: 1001-char string → schema rejects (maxLength).
    5. **Empty session_summary**: `''` → schema rejects (minLength 1).
    6. **Extra top-level property**: `{ ...good, extra: 1 }` → schema rejects (additionalProperties: false).
    7. **Over-max observations**: array of 41 items → schema rejects (maxItems 40).
    8. **SYSTEM_PROMPT snapshot**: `expect(SYSTEM_PROMPT).toMatchInlineSnapshot(...)` — snapshot the full string; this locks it against accidental wording drift. Planner may replace inline snapshot with `.toMatchSnapshot()` + separate `.snap` file if preferred.
    9. **Observation types enum matches D-55**: `expect(OBSERVATION_TYPES).toEqual(['decision', 'blocker', 'todo', 'file-touch', 'user-intent', 'pattern-learned'])`.

    If adding `ajv` is undesirable, write a minimal manual validator as a helper inside the test file that checks: required fields present, type matches basic shape, enum membership, string length bounds, additionalProperties is honored.
  </action>
  <verify>`pnpm -w vitest run packages/cds-core/src/capture/prompts.test.ts` — all assertions pass (≥9 test cases).</verify>
  <acceptance_criteria>
    - File exists at `packages/cds-core/src/capture/prompts.test.ts` with ≥40 lines
    - Contains at least 9 `it(` or `test(` blocks
    - `pnpm -w vitest run packages/cds-core/src/capture/prompts.test.ts` exits 0 with ≥9 passing
    - Contains literal string `'additionalProperties'` in at least one assertion (negative test)
    - Contains snapshot or inline-snapshot of SYSTEM_PROMPT
  </acceptance_criteria>
  <done>Schema + prompt drift locked by tests.</done>
</task>

<task type="auto">
  <name>Task 8: Write index.test.ts barrel export surface test</name>
  <files>packages/cds-core/src/capture/index.test.ts</files>
  <read_first>packages/cds-core/src/capture/index.ts, packages/cds-core/package.json</read_first>
  <action>
    Write a single vitest file that asserts the public export surface of `./capture/index.js`:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import * as capture from './index.js';

    describe('@cds/core/capture barrel', () => {
      it('exports loadTranscript function', () => {
        expect(typeof capture.loadTranscript).toBe('function');
      });
      it('exports buildExtractionPrompt function', () => {
        expect(typeof capture.buildExtractionPrompt).toBe('function');
      });
      it('exports emitObservationsTool object with name emit_observations', () => {
        expect(capture.emitObservationsTool.name).toBe('emit_observations');
      });
      it('exports SYSTEM_PROMPT string', () => {
        expect(typeof capture.SYSTEM_PROMPT).toBe('string');
        expect(capture.SYSTEM_PROMPT.length).toBeGreaterThan(500);
      });
      it('exports OBSERVATION_TYPES tuple of 6', () => {
        expect(capture.OBSERVATION_TYPES).toHaveLength(6);
      });
      it('exports ParsedMessage + EmitObservationsInput as type-only (runtime undefined)', () => {
        // Type-only exports don't exist at runtime — this is a smoke test
        // that the barrel doesn't accidentally export type aliases as values.
        expect((capture as any).ParsedMessage).toBeUndefined();
      });
    });
    ```
  </action>
  <verify>`pnpm -w vitest run packages/cds-core/src/capture/index.test.ts` passes (6 assertions).</verify>
  <acceptance_criteria>
    - File exists at `packages/cds-core/src/capture/index.test.ts` with ≥10 lines
    - Contains at least 6 `it(` blocks
    - `pnpm -w vitest run packages/cds-core/src/capture/index.test.ts` exits 0 with ≥6 passing
  </acceptance_criteria>
  <done>Barrel export surface locked by tests.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `pnpm tsc --noEmit` succeeds at repo root (no type errors introduced)
- [ ] `pnpm -w vitest run packages/cds-core/src/capture` exits 0 (all 24+ assertions pass)
- [ ] `node -e "import('@cds/core/capture').then(m => { if (!m.loadTranscript) process.exit(1); })"` exits 0 (after `pnpm tsc --build`)
- [ ] `.planning/STATE.md` Known Gaps unchanged — Plan 01 does not touch the Stop hook itself (that's Plan 02)
</verification>

<success_criteria>
- All 8 tasks completed with acceptance criteria met
- `@cds/core/capture` subpackage is a self-contained, unit-tested module
- No dependencies introduced beyond `ajv` (test-scoped devDependency)
- No changes to hooks/, lib/, skills/, or any other package — pure additions under packages/cds-core/src/capture/
- 928/931 root test baseline preserved (Phase 33 D-06): no root-level test files touched
- All tests run in <10s locally
</success_criteria>

<output>
After completion, create `.planning/phases/36-auto-session-capture/36-01-SUMMARY.md` documenting:
- Files created (list)
- Test count + pass count
- Any deviations from the planned schema (e.g., if `ajv` was rejected)
- Confirmed: `Tool` type resolved from `@cds/core` OR local structural type (note which)
- Next: Plan 02 consumes this module from the Stop hook
</output>
