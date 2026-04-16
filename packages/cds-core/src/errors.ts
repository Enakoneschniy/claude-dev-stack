/**
 * Error class hierarchy for @cds/core.
 * Scaffold for Phase 34 — Plan 01 Task 4.
 *
 * Per CONTEXT.md D-17..D-21 and D-29 error semantics:
 * - dispatchAgent throws on failure (no Result type wrapping)
 * - CostTracker.record() throws UnknownModelError for unknown models
 * - Callers wrap in try/catch for fail-silent semantics (e.g., Phase 36 Stop hook)
 */

export class CdsCoreError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
    if (cause && typeof cause === 'object' && 'stack' in cause) {
      this.cause = cause;
    }
  }
}

export class DispatchError extends CdsCoreError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class LicenseKeyError extends DispatchError {
  constructor(message = 'ANTHROPIC_API_KEY is missing or invalid') {
    super(message);
  }
}
