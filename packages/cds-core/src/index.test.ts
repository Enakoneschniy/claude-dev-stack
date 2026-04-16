import { describe, it, expect } from 'vitest';
import { CDS_CORE_VERSION } from './index.js';

describe('@cds/core', () => {
  it('package loads without error', () => {
    expect(CDS_CORE_VERSION).toBe('0.0.0-stub');
  });
});
