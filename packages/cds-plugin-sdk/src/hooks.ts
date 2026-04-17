/**
 * hooks.ts — Hook-related types for @cds/plugin-sdk.
 *
 * These types define the contract between the host (cds-cli) and plugins.
 * Plugin handlers receive a PluginHookContext (read-only session data)
 * and return a StopHookResult.
 *
 * IMPORTANT: This file must NOT import from @cds/core or any other
 * internal package. All types are self-contained.
 */

/**
 * Read-only context passed to plugin hook handlers.
 * Contains session metadata that plugins can use to perform
 * post-session actions (e.g., notifications, exports, analytics).
 */
export interface PluginHookContext {
  /** Current project name (directory basename or configured name) */
  projectName: string;

  /** Session ID from the vault database (if session was captured) */
  sessionId?: string;

  /** Session duration in seconds */
  sessionDurationSec?: number;

  /** Number of observations captured during the session */
  observationCount?: number;

  /** Absolute path to the project's vault database (read-only access) */
  vaultPath?: string;

  /** ISO 8601 timestamp of when the session ended */
  timestamp: string;
}

/**
 * Result returned by a plugin hook handler.
 */
export interface StopHookResult {
  /** Whether the handler completed successfully */
  success: boolean;

  /** Optional human-readable message (logged by host, not displayed to user) */
  message?: string;
}

/**
 * Handler function type for the onSessionEnd extension point.
 * Called by the host after session capture completes.
 *
 * Contract:
 * - Handler receives read-only context (must not modify session state)
 * - Handler must resolve within 5 seconds (host enforces timeout)
 * - Handler errors are caught by host (must not crash session teardown)
 * - Handlers run sequentially in registration order
 */
export type StopHookHandler = (
  context: PluginHookContext,
) => Promise<StopHookResult> | StopHookResult;
