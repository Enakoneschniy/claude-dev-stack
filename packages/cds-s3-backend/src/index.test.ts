import { describe, it, expect } from 'vitest';
import { CDS_S3_BACKEND_VERSION } from './index.js';

describe('@cds/s3-backend', () => {
  it('package loads without error', () => {
    expect(CDS_S3_BACKEND_VERSION).toBe('0.0.0-stub');
  });
});
