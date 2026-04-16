/**
 * Model alias table for @cds/core dispatchAgent.
 *
 * Callers pass friendly aliases ('haiku', 'sonnet', 'opus') OR full Anthropic model IDs.
 * The dispatcher resolves aliases to the latest stable ID at call time.
 * Full model IDs pass through unchanged — the Claude Agent SDK validates them.
 *
 * Last updated: 2026-04-16 — re-verify against https://docs.anthropic.com/claude/docs/models
 * when bumping @anthropic-ai/claude-agent-sdk version.
 *
 * D-21 (CONTEXT.md): accept both friendly names and full IDs.
 */

export const MODEL_ALIASES: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

/**
 * Resolve a model alias OR pass through a full model ID.
 *
 * @param modelOrAlias - Either 'haiku' | 'sonnet' | 'opus' OR a full Anthropic
 *                      model ID like 'claude-haiku-4-5-20260301'.
 * @returns The resolved full model ID (or the input unchanged if not an alias).
 */
export function resolveModel(modelOrAlias: string): string {
  return MODEL_ALIASES[modelOrAlias] ?? modelOrAlias;
}
