import { VaultError } from '@cds/core';

export class S3SyncError extends VaultError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'S3SyncError';
  }
}

export class S3AccessDeniedError extends S3SyncError {
  constructor(bucket: string, options?: ErrorOptions) {
    super(
      `Access denied to S3 bucket "${bucket}". Check IAM permissions for s3:GetObject, s3:PutObject, s3:DeleteObject.`,
      options,
    );
    this.name = 'S3AccessDeniedError';
  }
}

export class S3BucketNotFoundError extends S3SyncError {
  constructor(bucket: string, region: string, options?: ErrorOptions) {
    super(
      `S3 bucket "${bucket}" not found in region "${region}". Verify bucket name and region.`,
      options,
    );
    this.name = 'S3BucketNotFoundError';
  }
}

export class S3SchemaVersionError extends S3SyncError {
  constructor(localVersion: number, remoteVersion: number, options?: ErrorOptions) {
    super(
      `Remote schema version (${remoteVersion}) is newer than local (${localVersion}). Update your local installation before syncing.`,
      options,
    );
    this.name = 'S3SchemaVersionError';
  }
}
