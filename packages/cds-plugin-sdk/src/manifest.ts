/**
 * manifest.ts — Plugin manifest interface for @cds/plugin-sdk.
 *
 * A plugin is an npm package that default-exports an object conforming
 * to this interface. The host reads the manifest to discover plugin
 * capabilities and register hook handlers.
 *
 * IMPORTANT: This file must NOT import from @cds/core or any other
 * internal package. Only imports from within @cds/plugin-sdk are allowed.
 */

import type { StopHookHandler } from './hooks.js';

/**
 * Plugin manifest — the stable contract between plugins and the host.
 *
 * Example usage by a third-party plugin:
 *
 * ```typescript
 * import type { PluginManifest, PluginHookContext } from '@cds/plugin-sdk';
 *
 * const plugin: PluginManifest = {
 *   name: '@cds-plugin/my-notifier',
 *   version: '1.0.0',
 *   description: 'Sends a notification when a session ends',
 *   sdkVersion: '0.1.0',
 *   hooks: {
 *     onSessionEnd: async (ctx) => {
 *       // ctx.projectName, ctx.sessionId, etc.
 *       return { success: true, message: 'Notification sent' };
 *     },
 *   },
 * };
 *
 * export default plugin;
 * ```
 */
export interface PluginManifest {
  /** Unique plugin identifier — typically the npm package name */
  name: string;

  /** Semver version of the plugin */
  version: string;

  /** Human-readable plugin description (shown in plugin listings) */
  description: string;

  /**
   * Minimum @cds/plugin-sdk version this plugin requires.
   * The host checks this against the installed SDK version and
   * skips plugins that require a newer SDK.
   */
  sdkVersion: string;

  /**
   * Hook handler registrations. Each key maps to a lifecycle event.
   * v1.1 supports only `onSessionEnd`. Future versions may add
   * `onSessionStart`, `onObservation`, etc.
   */
  hooks?: {
    /** Called after session capture completes (Stop hook extension point) */
    onSessionEnd?: StopHookHandler;
  };

  /**
   * Freeform metadata for display in plugin listings and diagnostics.
   * Examples: { author: "...", homepage: "...", tags: ["notification"] }
   */
  metadata?: Record<string, unknown>;
}
