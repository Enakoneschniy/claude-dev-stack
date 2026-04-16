/**
 * @cds/migrate — Phase 38 Backfill Migration surface.
 *
 * Public entry points:
 *   - `migrateMarkdownSessions` — library function (MIGRATE-01).
 *   - `hashFile` / `estimateTokens` / `estimateCost` — utilities used by the
 *     Plan 03 CLI for the dry-run table + cost preview.
 *
 * Plan 03 additionally exports `cliMain` from `./cli.js`.
 */
export { migrateMarkdownSessions } from './sessions-md-to-sqlite.js';
export type {
  DispatchAgentFn,
  DispatchResultLike,
  FileInput,
  MigrateOptions,
  MigrationFileResult,
  MigrationFileStatus,
  MigrationReport,
} from './types.js';
export { hashFile, hashString } from './file-hash.js';
export {
  estimateCost,
  estimateTokens,
  formatCost,
  formatSize,
} from './token-estimate.js';

// Plan 03 addition — CLI entry for programmatic use:
export { main as cliMain } from './cli.js';
