/**
 * index.test.ts — Public surface smoke test.
 *
 * Verifies every Phase 34 primitive, type, error class, and utility is exported
 * from @cds/core's main barrel. Does NOT exercise runtime behavior — that's
 * covered by each primitive's own *.test.ts.
 */

import { describe, it, expect } from 'vitest';
import * as cdsCore from './index.js';

describe('@cds/core public surface (Phase 34)', () => {
  it('exports the three primitives', () => {
    expect(typeof cdsCore.dispatchAgent).toBe('function');
    expect(typeof cdsCore.Context).toBe('function');       // class constructor
    expect(typeof cdsCore.CostTracker).toBe('function');   // class constructor
  });

  it('exports the error hierarchy', () => {
    expect(typeof cdsCore.DispatchError).toBe('function');
    expect(typeof cdsCore.LicenseKeyError).toBe('function');
    expect(typeof cdsCore.UnknownModelError).toBe('function');

    // Hierarchy check — LicenseKeyError and UnknownModelError extend DispatchError
    const le = new cdsCore.LicenseKeyError();
    expect(le).toBeInstanceOf(cdsCore.DispatchError);
    const ume = new cdsCore.UnknownModelError('test');
    expect(ume).toBeInstanceOf(cdsCore.DispatchError);
  });

  it('exports the model alias table and resolver', () => {
    expect(typeof cdsCore.MODEL_ALIASES).toBe('object');
    expect(cdsCore.MODEL_ALIASES.haiku).toBe('claude-haiku-4-5');
    expect(cdsCore.MODEL_ALIASES.sonnet).toBe('claude-sonnet-4-6');
    expect(cdsCore.MODEL_ALIASES.opus).toBe('claude-opus-4-6');
    expect(typeof cdsCore.resolveModel).toBe('function');
    expect(cdsCore.resolveModel('haiku')).toBe('claude-haiku-4-5');
    expect(cdsCore.resolveModel('unknown-passthrough')).toBe('unknown-passthrough');
  });

  it('exports the pricing helpers', () => {
    expect(typeof cdsCore.PRICING_TABLE).toBe('object');
    expect(cdsCore.PRICING_TABLE['claude-haiku-4-5']).toBeDefined();
    expect(typeof cdsCore.loadPricingSync).toBe('function');
    expect(typeof cdsCore.pricingOverridePath).toBe('function');
    expect(cdsCore.pricingOverridePath()).toContain('.claude');
    expect(cdsCore.pricingOverridePath()).toContain('anthropic-pricing.json');
  });

  it('exports the context-file path helper', () => {
    expect(typeof cdsCore.contextFilePath).toBe('function');
    expect(cdsCore.contextFilePath('abc-123')).toContain('cds-context-abc-123.json');
  });

  it('exports the CDS_CORE_VERSION constant (non-stub value)', () => {
    expect(typeof cdsCore.CDS_CORE_VERSION).toBe('string');
    expect(cdsCore.CDS_CORE_VERSION).not.toBe('0.0.0-stub');        // Phase 33 stub replaced
    expect(cdsCore.CDS_CORE_VERSION).toMatch(/phase34/);            // Phase 34 marker
  });

  it('a minimal Context construction works (smoke)', () => {
    const ctx = new cdsCore.Context('smoke-sid');
    expect(ctx.sessionId).toBe('smoke-sid');
    expect(ctx.messages).toHaveLength(0);
  });

  it('a minimal CostTracker construction works (smoke, bundled pricing)', () => {
    const tracker = new cdsCore.CostTracker('smoke-sid', cdsCore.PRICING_TABLE);
    tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1, output: 1 } });
    expect(tracker.total().calls).toBe(1);
  });
});
