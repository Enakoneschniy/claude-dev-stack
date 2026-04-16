// Phase 38 Plan 02 Task 38-02-02 — token + cost estimation helpers.
//
// Model pricing (Haiku 4.5, per Phase 34 D-28):
//   Input:  $1.00 per million tokens
//   Output: $5.00 per million tokens
//
// Tokenizer weights are empirical:
//   Latin + misc:   ~1 token per 4 characters
//   Cyrillic:       ~1 token per 2.5 characters
//
// Estimates err on the HIGH side — users prefer underspending over sticker shock.

const CYRILLIC_RANGE = /[\u0400-\u04FF]/g;
const LATIN_CHARS_PER_TOKEN = 4;
const CYRILLIC_CHARS_PER_TOKEN = 2.5;

const INPUT_USD_PER_TOKEN = 0.000001; // $1 / 1M tokens
const OUTPUT_USD_PER_TOKEN = 0.000005; // $5 / 1M tokens
const OUTPUT_TOKENS_UPPER_BOUND = 200;

/** Estimate Haiku input-token count for a markdown string. */
export function estimateTokens(markdown: string): number {
  if (markdown === '') return 0;
  const cyrillic = (markdown.match(CYRILLIC_RANGE) ?? []).length;
  const latinAndOther = markdown.length - cyrillic;
  return Math.ceil(
    cyrillic / CYRILLIC_CHARS_PER_TOKEN +
      latinAndOther / LATIN_CHARS_PER_TOKEN,
  );
}

/**
 * Estimate the total Haiku dispatch cost in USD for one markdown input.
 * Input tokens: caller-supplied. Output tokens: fixed upper bound per D-98
 * (emit_observations payloads are compact — 200 tokens is conservative).
 */
export function estimateCost(inputTokens: number): number {
  return (
    inputTokens * INPUT_USD_PER_TOKEN +
    OUTPUT_TOKENS_UPPER_BOUND * OUTPUT_USD_PER_TOKEN
  );
}

/** Format a USD cost as `$X.XXX` with 3-decimal precision (rounded UP). */
export function formatCost(usd: number): string {
  const rounded = Math.ceil(usd * 1000) / 1000;
  return '$' + rounded.toFixed(3);
}

/** Format bytes as `X B` or `X.X KB` for the dry-run table. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}
