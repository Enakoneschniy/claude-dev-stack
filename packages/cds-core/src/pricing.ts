/**
 * Bundled pricing table for CostTracker.
 *
 * Values in USD per million tokens, per Anthropic's public pricing page.
 * Retrieved: 2026-04-16 — re-verify against https://www.anthropic.com/pricing
 * when bumping @anthropic-ai/claude-agent-sdk or publishing @cds/core releases.
 *
 * Users override by writing `~/.claude/anthropic-pricing.json` with the same schema.
 * Override is merged atop defaults at CostTracker construction (D-28).
 *
 * Unknown models (not matching any key or pattern) cause CostTracker.record()
 * to throw UnknownModelError (D-29) — silent zero-cost is NOT acceptable.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PricingEntry {
  input_usd_per_million: number;
  output_usd_per_million: number;
}

/**
 * Bundled default pricing.
 *
 * Key patterns ending in '*' match any model ID starting with the prefix
 * (e.g. 'claude-haiku-4-5-*' matches 'claude-haiku-4-5-20260301').
 * Exact keys (no trailing '*') match only exact model IDs.
 */
export const PRICING_TABLE: Record<string, PricingEntry> = {
  // Haiku 4.5 family — $1 / $5 per MTok (current Anthropic prices as of 2026-04-16)
  'claude-haiku-4-5':   { input_usd_per_million: 1.00, output_usd_per_million: 5.00 },
  'claude-haiku-4-5-*': { input_usd_per_million: 1.00, output_usd_per_million: 5.00 },
  // Sonnet 4.5 / 4.6 — $3 / $15 per MTok
  'claude-sonnet-4-5':   { input_usd_per_million: 3.00, output_usd_per_million: 15.00 },
  'claude-sonnet-4-5-*': { input_usd_per_million: 3.00, output_usd_per_million: 15.00 },
  'claude-sonnet-4-6':   { input_usd_per_million: 3.00, output_usd_per_million: 15.00 },
  'claude-sonnet-4-6-*': { input_usd_per_million: 3.00, output_usd_per_million: 15.00 },
  // Opus 4.6 — $15 / $75 per MTok (frontier model)
  'claude-opus-4-6':   { input_usd_per_million: 15.00, output_usd_per_million: 75.00 },
  'claude-opus-4-6-*': { input_usd_per_million: 15.00, output_usd_per_million: 75.00 },
};

/** Path to the optional user override file (~/.claude/anthropic-pricing.json). */
export function pricingOverridePath(): string {
  return join(homedir(), '.claude', 'anthropic-pricing.json');
}

/**
 * Load bundled PRICING_TABLE merged with optional user override.
 *
 * Reads `~/.claude/anthropic-pricing.json` synchronously if present and merges
 * entries atop the bundled defaults. Unknown keys in the override are kept
 * (extends the bundled table). Malformed JSON falls back to bundled with a
 * warning on stderr (non-fatal per D-28 "best effort" semantics).
 *
 * Synchronous read is acceptable here: called once per CostTracker construction;
 * file is small (<10 KB); blocking the event loop briefly at setup time is fine.
 */
export function loadPricingSync(): Record<string, PricingEntry> {
  const overridePath = pricingOverridePath();
  if (!existsSync(overridePath)) return { ...PRICING_TABLE };
  try {
    const raw = readFileSync(overridePath, 'utf8');
    const override = JSON.parse(raw) as Record<string, PricingEntry>;
    // Minimal shape validation — every entry must have both USD fields
    for (const [key, entry] of Object.entries(override)) {
      if (
        typeof entry?.input_usd_per_million !== 'number' ||
        typeof entry?.output_usd_per_million !== 'number'
      ) {
        throw new Error(
          `Invalid pricing entry for "${key}": expected { input_usd_per_million: number, output_usd_per_million: number }`,
        );
      }
    }
    return { ...PRICING_TABLE, ...override };
  } catch (err) {
    // Non-fatal: warn on stderr and fall back to bundled values
    // eslint-disable-next-line no-console
    console.warn(
      `[@cds/core] Failed to load pricing override from ${overridePath}: ${(err as Error).message}. Using bundled defaults.`,
    );
    return { ...PRICING_TABLE };
  }
}
