import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync } from 'node:fs';
import type { S3BackendConfig } from './config.js';
import { buildObjectKey } from './config.js';
import { S3SyncError, S3AccessDeniedError, S3BucketNotFoundError } from './errors.js';

export function createS3Client(config: S3BackendConfig): S3Client {
  return new S3Client({
    region: config.region,
  });
}

export async function downloadObject(
  client: S3Client,
  config: S3BackendConfig,
  project: string,
  destPath: string,
): Promise<boolean> {
  const key = buildObjectKey(config, project);
  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    writeFileSync(destPath, Buffer.concat(chunks));
    return true;
  } catch (err: unknown) {
    if (isNotFoundError(err)) return false;
    throw wrapS3Error(err, config);
  }
}

export async function uploadObject(
  client: S3Client,
  config: S3BackendConfig,
  project: string,
  sourcePath: string,
): Promise<void> {
  const key = buildObjectKey(config, project);
  const body = readFileSync(sourcePath);
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/x-sqlite3',
    }));
  } catch (err: unknown) {
    throw wrapS3Error(err, config);
  }
}

export async function checkObjectExists(
  client: S3Client,
  config: S3BackendConfig,
  project: string,
): Promise<boolean> {
  const key = buildObjectKey(config, project);
  try {
    await client.send(new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }));
    return true;
  } catch (err: unknown) {
    if (isNotFoundError(err)) return false;
    throw wrapS3Error(err, config);
  }
}

export async function deleteObject(
  client: S3Client,
  config: S3BackendConfig,
  key: string,
): Promise<void> {
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }));
  } catch (err: unknown) {
    throw wrapS3Error(err, config);
  }
}

function isNotFoundError(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  return e.name === 'NotFound' || e.name === 'NoSuchKey' ||
    (e.$metadata as Record<string, unknown>)?.httpStatusCode === 404;
}

function wrapS3Error(err: unknown, config: S3BackendConfig): S3SyncError {
  const e = err as Record<string, unknown>;
  if (e.name === 'AccessDenied' || e.name === 'AllAccessDisabled') {
    return new S3AccessDeniedError(config.bucket, { cause: err as Error });
  }
  if (e.name === 'NoSuchBucket') {
    return new S3BucketNotFoundError(config.bucket, config.region, { cause: err as Error });
  }
  return new S3SyncError(
    `S3 operation failed: ${(err as Error).message ?? String(err)}`,
    { cause: err as Error },
  );
}
