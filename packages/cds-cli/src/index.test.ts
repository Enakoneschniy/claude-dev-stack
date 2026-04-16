import { describe, it, expect } from 'vitest';
import { CDS_CLI_VERSION } from './index.js';

describe('@cds/cli', () => {
  it('package loads without error', () => {
    expect(CDS_CLI_VERSION).toBe('0.0.0-stub');
  });
});
