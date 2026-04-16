/**
 * @cds/core/capture — extraction prompt + emit_observations tool schema.
 *
 * Phase 36 D-55..D-59:
 *   - Typed JSON schema for the `emit_observations` tool_use the Haiku observer calls.
 *   - Stable SYSTEM_PROMPT (snapshot-tested to prevent accidental wording drift).
 *   - `mode` parameter on the prompt builder (Phase 38 backfill reuses this with
 *     `mode: 'backfill'`; Phase 36 ships `'transcript'` only, but the API accepts both).
 */

import { OBSERVATION_TYPES } from './types.js';

/**
 * Structural type for the Claude API tool shape consumed by `dispatchAgent`.
 *
 * Kept local (not imported from `@cds/core`) to avoid coupling the capture
 * subpackage to the SDK's `SdkMcpToolDefinition` alias — that alias describes
 * MCP *server* tools (with a `handler` fn). For plain API tool_use we want the
 * raw `{ name, description, input_schema }` shape the Anthropic API accepts.
 */
type Tool = { name: string; description?: string; input_schema: unknown };

/**
 * Mode passed to `buildExtractionPrompt` / `buildSystemPrompt`.
 *
 * `'transcript'` — Phase 36 Stop-hook pathway. Extracts observations from the
 * current session's jsonl transcript.
 * `'backfill'` — Phase 38 pathway. Runs over historical session logs; adds a
 * preamble noting the transcript is past-tense and may lack context.
 */
export type CaptureMode = 'transcript' | 'backfill';

/**
 * Base system prompt. Phase 36 exports this directly for backwards-compat with
 * code that imports `SYSTEM_PROMPT` as a constant. Use `buildSystemPrompt(mode)`
 * to get the mode-aware variant (Phase 38 will prepend a backfill preamble).
 */
export const SYSTEM_PROMPT = `You are a session observer. Your job is to read a Claude Code development session transcript and emit structured observations into a single call of the \`emit_observations\` tool. Do not produce any free-form text output — call the tool exactly once.

Observation types (use these values only):
- \`decision\`: The developer made a concrete choice with rationale.
- \`blocker\`: An obstacle surfaced that prevented progress or requires external input.
- \`todo\`: An action item for a future session.
- \`file-touch\`: A file was created, modified, or deleted as part of the work.
- \`user-intent\`: A goal, preference, or high-level directive from the user.
- \`pattern-learned\`: A reusable insight, idiom, or gotcha discovered.

Entities are names (classes, files, packages, people, concepts) referenced by observations. Their \`type\` field is a free-form string — prefer values like \`file\`, \`project\`, \`concept\`, \`decision\`, \`commit\`, \`person\`, \`api\`, \`skill\` when they fit.

Relations capture how entities connect (e.g. \`{ from: 'Phase 36', to: '@cds/core', type: 'depends_on' }\`).

Keep session_summary to 1-3 sentences. Each observation content field is 1-2 sentences. Prefer concrete facts over opinions. If the transcript is empty or has no substance, emit an empty observations array with a session_summary of "No substantive activity in this session."`;

/**
 * Build the system prompt for a given capture mode.
 *
 * Phase 36 returns `SYSTEM_PROMPT` verbatim for `mode: 'transcript'`.
 * Phase 38 will prepend a short preamble when `mode: 'backfill'`.
 */
export function buildSystemPrompt(mode: CaptureMode = 'transcript'): string {
  if (mode === 'backfill') {
    // Phase 36 ships a conservative backfill preamble; Phase 38 may refine.
    return (
      `You are reconstructing observations from an older session log (backfill mode). ` +
      `The transcript may be abbreviated or lack moment-to-moment detail; focus on the ` +
      `decisions, blockers, and outcomes that are explicit in the text. ` +
      `Skip anything speculative.\n\n` +
      SYSTEM_PROMPT
    );
  }
  return SYSTEM_PROMPT;
}

/**
 * Phase 38 D-92: verbatim backfill preamble prepended to the user prompt when
 * `mode === 'backfill'`. Do not edit the text — it is snapshot-tested for
 * bit-exact match against the D-92 contract.
 */
export const BACKFILL_PREAMBLE = `You are processing a human-written session summary, not a live transcript.
The author has already distilled the session into prose. Extract ONLY decisions,
blockers, todos, and entities that are EXPLICITLY stated. Do not infer file touches
from casual prose mentions. Do not fabricate observations. If the summary is thin,
return few observations — low recall is acceptable; low precision is not.`;

/**
 * Shape returned by {@link buildExtractionPrompt} when called with a flat
 * string input (Phase 38 backfill migrator pathway).
 *
 * The sibling overload in `transcript.ts` that accepts `ParsedMessage[]`
 * returns a different shape (`{ systemPrompt, userPrompt, estimatedTokens }`)
 * because it applies tier-2 head+tail truncation under a token budget. The
 * flat-string entry defined here skips tier-2 (markdown inputs are small)
 * and includes the tool schema bundle directly for convenience at the
 * `dispatchAgent` boundary.
 */
export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  tools: Tool[];
}

/**
 * Phase 38 D-91/D-93: the flat-string extraction prompt builder.
 *
 * Returns `{ systemPrompt, userPrompt, tools }`. The core tool schema
 * (`emit_observations`) and system prompt are identical across modes —
 * only the user prompt differs:
 *   - `mode: 'transcript'` → `input` passed through verbatim.
 *   - `mode: 'backfill'`   → {@link BACKFILL_PREAMBLE} prepended before `input`.
 *
 * This is the entry point consumed by the Phase 38 backfill migrator. The
 * Phase 36 live-capture Stop hook uses the ParsedMessage[]-shaped
 * `buildExtractionPrompt` re-exported from `./transcript.ts`.
 *
 * Both entry points share the same underlying system prompt + tool schema
 * so sessions.db stays consistent across pathways (D-91).
 */
export function buildExtractionPrompt(opts: {
  mode: CaptureMode;
  input: string;
}): BuiltPrompt {
  const systemPrompt = buildSystemPrompt(opts.mode);
  const userPrompt =
    opts.mode === 'backfill'
      ? `${BACKFILL_PREAMBLE}\n\n${opts.input}`
      : opts.input;
  return {
    systemPrompt,
    userPrompt,
    tools: [emitObservationsTool],
  };
}

/**
 * The `emit_observations` tool schema. Passed as `tools: [emitObservationsTool]`
 * to `dispatchAgent`. `additionalProperties: false` on every object type rejects
 * schema drift at the API boundary rather than silently accepting extra fields.
 */
export const emitObservationsTool: Tool = {
  name: 'emit_observations',
  description:
    'Emit the structured observations extracted from a Claude Code session transcript. Call this tool exactly once.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['session_summary', 'observations', 'entities', 'relations'],
    properties: {
      session_summary: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
        description: '1-3 sentence summary of the session.',
      },
      observations: {
        type: 'array',
        maxItems: 40,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'content', 'entities'],
          properties: {
            type: { type: 'string', enum: [...OBSERVATION_TYPES] },
            content: { type: 'string', minLength: 1, maxLength: 1000 },
            entities: {
              type: 'array',
              maxItems: 20,
              items: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
        },
      },
      entities: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'type'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            type: { type: 'string', minLength: 1, maxLength: 40 },
          },
        },
      },
      relations: {
        type: 'array',
        maxItems: 40,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to', 'type'],
          properties: {
            from: { type: 'string', minLength: 1, maxLength: 200 },
            to: { type: 'string', minLength: 1, maxLength: 200 },
            type: { type: 'string', minLength: 1, maxLength: 40 },
          },
        },
      },
    },
  },
};
