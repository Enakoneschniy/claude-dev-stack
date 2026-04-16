/**
 * @cds/core — public surface for Phase 34.
 *
 * Primitives:
 *   - dispatchAgent (SDK-02) — thin wrapper around @anthropic-ai/claude-agent-sdk's query()
 *   - Context (CORE-01) — in-memory conversation state with explicit persistence
 *   - CostTracker (CORE-02) — per-session token + USD aggregation
 *
 * Supporting types:
 *   - DispatchOptions / DispatchResult
 *   - ConversationMessage
 *   - PricingEntry
 *   - Tool (SDK-native pass-through per D-20)
 *
 * Errors (all extend DispatchError):
 *   - DispatchError (base)
 *   - LicenseKeyError (missing ANTHROPIC_API_KEY)
 *   - UnknownModelError (CostTracker hits unpriced model)
 *
 * Utilities:
 *   - MODEL_ALIASES / resolveModel
 *   - PRICING_TABLE / loadPricingSync / pricingOverridePath
 *   - contextFilePath
 */

// Primitive: dispatchAgent
export { dispatchAgent } from './agent-dispatcher.js';
export type { DispatchOptions, DispatchResult } from './agent-dispatcher.js';

// Primitive: Context
export { Context, contextFilePath } from './context.js';
export type { ConversationMessage } from './context.js';

// Primitive: CostTracker
export { CostTracker } from './cost-tracker.js';

// Pricing helpers
export { PRICING_TABLE, loadPricingSync, pricingOverridePath } from './pricing.js';
export type { PricingEntry } from './pricing.js';

// Error hierarchy (D-18 JS-idiomatic throws)
export { DispatchError, LicenseKeyError, UnknownModelError } from './errors.js';

// Model alias helpers (D-21)
export { MODEL_ALIASES, resolveModel } from './models.js';

// SDK type re-export (D-20 — SDK-native Tool pass-through).
// SDK 0.2.111 exposes tool *definitions* as `SdkMcpToolDefinition`; we
// re-export it under the `Tool` alias for consumer ergonomics (the plan
// spec used `Tool` as the canonical name).
export type { SdkMcpToolDefinition as Tool } from '@anthropic-ai/claude-agent-sdk';

// Version constant — useful for diagnostic output (replaces Phase 33 stub).
export const CDS_CORE_VERSION = '0.1.0-phase34';
export * from "./vault/index.js";
