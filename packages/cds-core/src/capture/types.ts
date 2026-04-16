/**
 * @cds/core/capture — type surface.
 *
 * Phase 36 D-55: the six observation types extracted by the Haiku session observer.
 * The DB-level column (Phase 35) stores `observations.type` as open TEXT per D-56, so
 * additions here require a prompts.ts enum bump + schema bump only — no migration.
 */

export const OBSERVATION_TYPES = [
  'decision',
  'blocker',
  'todo',
  'file-touch',
  'user-intent',
  'pattern-learned',
] as const;

export type ObservationType = (typeof OBSERVATION_TYPES)[number];

/**
 * The JSON shape the Haiku observer emits via the `emit_observations` tool_use.
 *
 * Validated by `emitObservationsTool.input_schema` (JSON Schema draft-07 with
 * `additionalProperties: false` on every object). Mirrored as a TS type so
 * downstream consumers (Stop hook) can narrow after `JSON.parse`.
 */
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
