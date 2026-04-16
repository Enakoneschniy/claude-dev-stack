/**
 * cost-tracker.test.ts — Unit tests for CostTracker (CORE-02).
 *
 * Most tests use the DI constructor (pass pricing table directly) for determinism.
 * The override-file tests use a tmp-HOME redirect to verify loadPricingSync()
 * picks up ~/.claude/anthropic-pricing.json without touching the real home dir.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CostTracker } from './cost-tracker.js';
import { UnknownModelError, DispatchError } from './errors.js';
import { PRICING_TABLE, pricingOverridePath, type PricingEntry } from './pricing.js';

const HOME_BACKUP = process.env.HOME;
const SESSION_BACKUP = process.env.CLAUDE_SESSION_ID;

describe('CostTracker — bundled pricing + aggregation (D-27, D-29)', () => {
  beforeEach(() => {
    delete process.env.CLAUDE_SESSION_ID;
  });
  afterEach(() => {
    if (SESSION_BACKUP !== undefined) process.env.CLAUDE_SESSION_ID = SESSION_BACKUP;
    else delete process.env.CLAUDE_SESSION_ID;
  });

  it('record() + total() aggregates tokens across calls', () => {
    const tracker = new CostTracker('test-agg', PRICING_TABLE);
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 100, output: 50 } });
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 200, output: 100 } });
    tracker.record({ model: 'claude-sonnet-4-6', tokens: { input: 500, output: 250 } });

    const t = tracker.total();
    expect(t.calls).toBe(3);
    expect(t.tokens).toEqual({ input: 800, output: 400 });
    // At $1/$5 Haiku, $3/$15 Sonnet:
    // Haiku: (300/M * $1) + (150/M * $5) = 0.0003 + 0.00075 = 0.00105
    // Sonnet: (500/M * $3) + (250/M * $15) = 0.0015 + 0.00375 = 0.00525
    // Total: ~0.0063
    expect(t.cost_usd).toBeGreaterThan(0.006);
    expect(t.cost_usd).toBeLessThan(0.007);
  });

  it('resolves haiku pattern to 4.5 pricing (exact match)', () => {
    const tracker = new CostTracker('test-haiku', PRICING_TABLE);
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
    // 1M input * $1/M = $1.00
    expect(tracker.total().cost_usd).toBeCloseTo(1.00, 4);
  });

  it('resolves dated haiku IDs via pattern-suffix match', () => {
    const tracker = new CostTracker('test-dated', PRICING_TABLE);
    tracker.record({ model: 'claude-haiku-4-5-20260301', tokens: { input: 1_000_000, output: 0 } });
    expect(tracker.total().cost_usd).toBeCloseTo(1.00, 4);
  });

  it('resolves sonnet and opus correctly', () => {
    const tracker = new CostTracker('test-so', PRICING_TABLE);
    tracker.record({ model: 'claude-sonnet-4-6', tokens: { input: 1_000_000, output: 0 } });
    tracker.record({ model: 'claude-opus-4-6', tokens: { input: 0, output: 1_000_000 } });
    const t = tracker.total();
    // Sonnet input 1M * $3 + Opus output 1M * $75
    expect(t.cost_usd).toBeCloseTo(3.00 + 75.00, 2);
  });

  it('throws UnknownModelError at record() for unknown model', () => {
    const tracker = new CostTracker('test-unknown', PRICING_TABLE);
    expect(() =>
      tracker.record({ model: 'gpt-5-turbo', tokens: { input: 100, output: 50 } }),
    ).toThrow(UnknownModelError);
  });

  it('UnknownModelError extends DispatchError (single catch surface)', () => {
    const tracker = new CostTracker('test-hierarchy', PRICING_TABLE);
    try {
      tracker.record({ model: 'unknown-model', tokens: { input: 1, output: 1 } });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownModelError);
      expect(err).toBeInstanceOf(DispatchError);
      expect((err as UnknownModelError).model).toBe('unknown-model');
    }
  });

  it('UnknownModelError message surfaces the offending model name', () => {
    const tracker = new CostTracker('test-msg', PRICING_TABLE);
    expect(() => tracker.record({ model: 'nonsense', tokens: { input: 1, output: 1 } })).toThrow(
      /nonsense/,
    );
    expect(() => tracker.record({ model: 'nonsense', tokens: { input: 1, output: 1 } })).toThrow(
      /anthropic-pricing\.json/,
    );
  });

  it('sessionId resolution: explicit arg > env > empty string', () => {
    // explicit arg wins
    expect(new CostTracker('explicit', PRICING_TABLE).sessionId).toBe('explicit');

    // env fallback
    process.env.CLAUDE_SESSION_ID = 'from-env';
    expect(new CostTracker(undefined, PRICING_TABLE).sessionId).toBe('from-env');
    delete process.env.CLAUDE_SESSION_ID;

    // empty fallback (CostTracker is more permissive than Context — sessionId is
    // a label here, not a primary key)
    expect(new CostTracker(undefined, PRICING_TABLE).sessionId).toBe('');
  });
});

describe('CostTracker — dump() format (D-27, D-30)', () => {
  it('renders human-readable multi-line report', () => {
    const tracker = new CostTracker('my-session', PRICING_TABLE);
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 123_456, output: 45_678 } });
    const output = tracker.dump();
    expect(output).toContain('Session: my-session');
    expect(output).toContain('Calls: 1');
    expect(output).toContain('Input tokens:  123,456');
    expect(output).toContain('Output tokens: 45,678');
    expect(output).toMatch(/Cost:\s+\$[0-9]+\.[0-9]{2}/);
  });

  it('dump() handles empty tracker', () => {
    const tracker = new CostTracker('empty', PRICING_TABLE);
    const output = tracker.dump();
    expect(output).toContain('Session: empty');
    expect(output).toContain('Calls: 0');
    expect(output).toContain('Input tokens:  0');
    expect(output).toContain('$0.00');
  });

  it('dump() labels missing sessionId gracefully', () => {
    const tracker = new CostTracker('', PRICING_TABLE);
    const output = tracker.dump();
    expect(output).toContain('Session: (no session id)');
  });
});

describe('CostTracker — ~/.claude/anthropic-pricing.json override (D-28)', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), 'cds-cost-'));
    process.env.HOME = tmpHome;
    await mkdir(join(tmpHome, '.claude'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
    if (HOME_BACKUP !== undefined) process.env.HOME = HOME_BACKUP;
  });

  it('override file merges atop bundled defaults', async () => {
    const override: Record<string, PricingEntry> = {
      'claude-haiku-4-5': { input_usd_per_million: 0.50, output_usd_per_million: 2.50 }, // half bundled
    };
    await writeFile(pricingOverridePath(), JSON.stringify(override), 'utf8');

    const tracker = new CostTracker('test-override');  // loadPricingSync from disk
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
    // 1M input * $0.50/M = $0.50 (override wins over bundled $1.00)
    expect(tracker.total().cost_usd).toBeCloseTo(0.50, 2);
  });

  it('override can add entirely new models', async () => {
    const override: Record<string, PricingEntry> = {
      'gpt-5-turbo': { input_usd_per_million: 1.00, output_usd_per_million: 4.00 },
    };
    await writeFile(pricingOverridePath(), JSON.stringify(override), 'utf8');

    const tracker = new CostTracker('test-newmodel');
    tracker.record({ model: 'gpt-5-turbo', tokens: { input: 1_000_000, output: 1_000_000 } });
    expect(tracker.total().cost_usd).toBeCloseTo(5.00, 2);  // 1 + 4
  });

  it('malformed JSON falls back to bundled (non-fatal)', async () => {
    await writeFile(pricingOverridePath(), '{not valid json', 'utf8');

    // Should NOT throw at construction
    const tracker = new CostTracker('test-malformed');
    // Bundled table still works — Haiku at $1/M input
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
    expect(tracker.total().cost_usd).toBeCloseTo(1.00, 4);
  });

  it('invalid override entry shape throws (via loadPricingSync warn+fallback)', async () => {
    // Missing required field
    await writeFile(
      pricingOverridePath(),
      JSON.stringify({ 'test-bad': { input_usd_per_million: 1 } }),  // missing output_usd_per_million
      'utf8',
    );

    // CostTracker should still construct (loadPricingSync warn+fallback to bundled);
    // bundled Haiku still priced correctly at $1/M input
    const tracker = new CostTracker('test-bad-override');
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
    expect(tracker.total().cost_usd).toBeCloseTo(1.00, 4);
  });
});
