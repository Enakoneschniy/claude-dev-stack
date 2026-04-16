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
export const CDS_CORE_VERSION = '0.0.0-stub';
export * from './vault/index.js';
