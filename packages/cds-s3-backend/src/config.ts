export interface S3BackendConfig {
  /** S3 bucket name */
  bucket: string;
  /** AWS region (e.g., 'us-east-1') */
  region: string;
  /** Optional key prefix (default: 'vault/projects/') */
  prefix: string;
  /** Optional AWS profile name for credential resolution */
  profile?: string;
}

export const DEFAULT_PREFIX = 'vault/projects/';

/**
 * Build the S3 object key for a project's sessions.db.
 * Example: vault/projects/claude-dev-stack/sessions.db
 */
export function buildObjectKey(config: S3BackendConfig, project: string): string {
  const prefix = config.prefix.endsWith('/') ? config.prefix : `${config.prefix}/`;
  return `${prefix}${project}/sessions.db`;
}
