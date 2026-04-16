import { describe, it, expect } from 'vitest';
import { CDS_MIGRATE_VERSION } from './index.js';

describe('@cds/migrate', () => {
  it('package loads without error', () => {
    expect(CDS_MIGRATE_VERSION).toBe('0.0.0-stub');
  });
});
