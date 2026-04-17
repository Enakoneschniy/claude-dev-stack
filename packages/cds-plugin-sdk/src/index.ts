/**
 * @cds/plugin-sdk — Stable interface for third-party CDS plugins.
 *
 * This package contains ONLY TypeScript type definitions and a version constant.
 * Zero runtime dependencies. Plugin authors import these types to build
 * plugins that conform to the CDS plugin contract.
 *
 * Types:
 *   - PluginManifest — Plugin identity and hook registrations
 *   - PluginHookContext — Read-only session data passed to handlers
 *   - StopHookHandler — onSessionEnd handler function type
 *   - StopHookResult — Handler return value
 *
 * Constants:
 *   - SDK_VERSION — Current SDK version for compatibility checks
 */

// Plugin manifest interface
export type { PluginManifest } from './manifest.js';

// Hook types
export type { PluginHookContext, StopHookResult, StopHookHandler } from './hooks.js';

// SDK version constant
export { SDK_VERSION } from './version.js';
