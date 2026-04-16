/**
 * CostTracker — in-memory per-session token + USD aggregation.
 *
 * CONTEXT.md D-27..D-30 contract:
 *   - record({ model, tokens }) append to calls; throw UnknownModelError for unpriced
 *   - total() recomputes from bundled+override pricing table
 *   - dump() returns human-readable multi-line report (D-30 format)
 *   - Per-session only; no cross-session aggregation (D-30 defers)
 *   - Bundled pricing + ~/.claude/anthropic-pricing.json override (D-28)
 */

import { loadPricingSync, type PricingEntry } from './pricing.js';
import { UnknownModelError } from './errors.js';

interface Call {
  model: string;
  tokens: { input: number; output: number };
}

interface Totals {
  calls: number;
  tokens: { input: number; output: number };
  cost_usd: number;
}

export class CostTracker {
  readonly sessionId: string;
  private readonly _calls: Call[] = [];
  private readonly _pricing: Record<string, PricingEntry>;

  /**
   * @param sessionId - optional threading ID (D-31); defaults to env > '' if unset
   * @param pricing - DI for tests; production path uses loadPricingSync() (bundled + override)
   */
  constructor(sessionId?: string, pricing?: Record<string, PricingEntry>) {
    this.sessionId = sessionId ?? process.env.CLAUDE_SESSION_ID ?? '';
    this._pricing = pricing ?? loadPricingSync();
  }

  /**
   * Record a dispatchAgent call's usage. Throws UnknownModelError (D-29) if
   * the model is not in the bundled+override pricing table — silent zero-cost
   * is unacceptable; callers should update their pricing override or catch
   * the error and fall back to an estimate.
   */
  record(call: Call): void {
    if (!this.resolvePricing(call.model)) {
      throw new UnknownModelError(call.model);
    }
    this._calls.push({
      model: call.model,
      tokens: { input: call.tokens.input, output: call.tokens.output },
    });
  }

  /** Aggregate totals across all recorded calls. */
  total(): Totals {
    const tokens = this._calls.reduce(
      (acc, c) => ({ input: acc.input + c.tokens.input, output: acc.output + c.tokens.output }),
      { input: 0, output: 0 },
    );
    const cost_usd = this._calls.reduce((acc, c) => {
      const entry = this.resolvePricing(c.model);
      if (!entry) return acc;              // already validated at record(); defensive
      return acc
        + (c.tokens.input / 1_000_000) * entry.input_usd_per_million
        + (c.tokens.output / 1_000_000) * entry.output_usd_per_million;
    }, 0);
    return { calls: this._calls.length, tokens, cost_usd };
  }

  /**
   * Human-readable summary report. Format matches CONTEXT.md D-30 example:
   *   Session: abc-123
   *   Calls: 14
   *   Input tokens:  123,456
   *   Output tokens: 45,678
   *   Cost:          $0.87
   */
  dump(): string {
    const t = this.total();
    return [
      `Session: ${this.sessionId || '(no session id)'}`,
      `Calls: ${t.calls}`,
      `Input tokens:  ${t.tokens.input.toLocaleString('en-US')}`,
      `Output tokens: ${t.tokens.output.toLocaleString('en-US')}`,
      `Cost:          $${t.cost_usd.toFixed(2)}`,
    ].join('\n');
  }

  /**
   * Resolve a model ID to a pricing entry. Tries exact match first, then any
   * pattern key ending in '*' whose prefix matches the model ID.
   */
  private resolvePricing(model: string): PricingEntry | undefined {
    const exact = this._pricing[model];
    if (exact) return exact;
    for (const [key, entry] of Object.entries(this._pricing)) {
      if (key.endsWith('-*') && model.startsWith(key.slice(0, -1))) {
        return entry;
      }
      // Also allow bare '*' suffix without '-' separator if user writes that in override
      if (key.endsWith('*') && !key.endsWith('-*') && model.startsWith(key.slice(0, -1))) {
        return entry;
      }
    }
    return undefined;
  }
}
