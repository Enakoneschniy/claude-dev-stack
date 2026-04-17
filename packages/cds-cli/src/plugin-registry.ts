/**
 * plugin-registry.ts — Plugin discovery and lifecycle management.
 *
 * Phase 47 (DX-06): Reads ~/.claude-dev-stack/plugins.json, loads
 * enabled plugin manifests, validates SDK version compatibility,
 * and provides a method to invoke onSessionEnd handlers.
 *
 * Trust model: manifest-only. Plugins are npm packages loaded by
 * package name from the config file. No arbitrary path imports.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  PluginManifest,
  PluginHookContext,
  StopHookResult,
} from '@cds/plugin-sdk';
import { SDK_VERSION } from '@cds/plugin-sdk';

/** Configuration file path for registered plugins */
const PLUGINS_CONFIG_PATH =
  process.env.CDS_PLUGINS_CONFIG ??
  join(homedir(), '.claude-dev-stack', 'plugins.json');

/** Maximum time (ms) a single plugin handler is allowed to run */
const HANDLER_TIMEOUT_MS = 5_000;

/** Shape of an entry in plugins.json */
interface PluginConfigEntry {
  package: string;
  enabled: boolean;
}

/** Shape of plugins.json */
interface PluginsConfig {
  plugins: PluginConfigEntry[];
}

/** Result of invoking all plugin handlers */
export interface PluginRunResults {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    pluginName: string;
    status: 'success' | 'failed' | 'timeout' | 'skipped';
    message?: string;
    error?: string;
  }>;
}

/**
 * Compare semver strings (major.minor.patch) for compatibility.
 * Returns true if the installed SDK version >= the required version.
 */
export function isVersionCompatible(required: string, installed: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [rMajor = 0, rMinor = 0, rPatch = 0] = parse(required);
  const [iMajor = 0, iMinor = 0, iPatch = 0] = parse(installed);

  if (iMajor !== rMajor) return iMajor > rMajor;
  if (iMinor !== rMinor) return iMinor > rMinor;
  return iPatch >= rPatch;
}

/**
 * Read plugins.json and return the list of enabled plugin entries.
 * Returns empty array if config doesn't exist or is malformed.
 */
export function readPluginConfig(): PluginConfigEntry[] {
  const configPath = PLUGINS_CONFIG_PATH;
  if (!existsSync(configPath)) return [];

  try {
    const raw = readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw) as PluginsConfig;
    if (!Array.isArray(config?.plugins)) return [];
    return config.plugins.filter(
      (p) => p && typeof p.package === 'string' && p.enabled === true,
    );
  } catch {
    return [];
  }
}

/**
 * Load a plugin manifest from an npm package.
 * Returns null if the package cannot be loaded or doesn't export a valid manifest.
 */
async function loadPluginManifest(
  packageName: string,
): Promise<PluginManifest | null> {
  try {
    // Dynamic import of the npm package by name.
    // This is safe because packageName comes from plugins.json (user-controlled config),
    // not from arbitrary user input. The package must be npm-installed.
    const mod = await import(packageName) as { default?: PluginManifest };
    const manifest: PluginManifest = mod.default ?? (mod as unknown as PluginManifest);

    // Validate required fields
    if (
      typeof manifest?.name !== 'string' ||
      typeof manifest?.version !== 'string' ||
      typeof manifest?.sdkVersion !== 'string'
    ) {
      return null;
    }

    // SDK version compatibility check
    if (!isVersionCompatible(manifest.sdkVersion, SDK_VERSION)) {
      return null;
    }

    return manifest;
  } catch {
    return null;
  }
}

/**
 * Run a single handler with a timeout.
 * Returns the handler result or a timeout/error result.
 */
async function runHandlerWithTimeout(
  handler: (context: PluginHookContext) => Promise<StopHookResult> | StopHookResult,
  context: PluginHookContext,
  timeoutMs: number = HANDLER_TIMEOUT_MS,
): Promise<StopHookResult & { timedOut?: boolean }> {
  return Promise.race([
    Promise.resolve(handler(context)).then((result) => result),
    new Promise<StopHookResult & { timedOut: boolean }>((resolve) =>
      setTimeout(
        () => resolve({ success: false, message: 'Handler timed out', timedOut: true }),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Invoke all registered onSessionEnd handlers in order.
 *
 * - Loads plugins from config
 * - Validates each manifest
 * - Calls onSessionEnd handlers sequentially
 * - Each handler gets a 5-second timeout
 * - Failures are caught and recorded (never propagated)
 *
 * Returns a summary of all plugin invocations.
 */
export async function invokeSessionEndPlugins(
  context: PluginHookContext,
): Promise<PluginRunResults> {
  const entries = readPluginConfig();
  const results: PluginRunResults = {
    total: entries.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  for (const entry of entries) {
    const manifest = await loadPluginManifest(entry.package);

    if (!manifest) {
      results.skipped++;
      results.results.push({
        pluginName: entry.package,
        status: 'skipped',
        message: 'Failed to load or incompatible SDK version',
      });
      continue;
    }

    const handler = manifest.hooks?.onSessionEnd;
    if (!handler) {
      results.skipped++;
      results.results.push({
        pluginName: manifest.name,
        status: 'skipped',
        message: 'No onSessionEnd handler registered',
      });
      continue;
    }

    try {
      const result = await runHandlerWithTimeout(handler, context);

      if ('timedOut' in result && result.timedOut) {
        results.failed++;
        results.results.push({
          pluginName: manifest.name,
          status: 'timeout',
          message: `Handler exceeded ${HANDLER_TIMEOUT_MS}ms timeout`,
        });
      } else if (result.success) {
        results.succeeded++;
        results.results.push({
          pluginName: manifest.name,
          status: 'success',
          message: result.message,
        });
      } else {
        results.failed++;
        results.results.push({
          pluginName: manifest.name,
          status: 'failed',
          message: result.message,
        });
      }
    } catch (err) {
      results.failed++;
      results.results.push({
        pluginName: manifest.name,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
