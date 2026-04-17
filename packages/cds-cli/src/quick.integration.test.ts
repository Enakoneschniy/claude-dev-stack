// packages/cds-cli/src/quick.integration.test.ts
// Live-Haiku end-to-end test. Gated behind INTEGRATION=1.
// Writes a real transcript + (if wiring is complete) triggers a real capture.
// Source: Phase 39 VALIDATION §Task 39-05-06
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTempHome, type TempHome } from '../tests/helpers/temp-home.js';

const SHOULD_RUN = process.env.INTEGRATION === '1' && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!SHOULD_RUN)('quick.ts integration (live Haiku)', () => {
  let tempHome: TempHome;

  beforeEach(() => {
    tempHome = setupTempHome();
  });

  afterEach(() => {
    tempHome.restore();
  });

  it('dispatches a real one-shot call, captures cost, writes transcript', async () => {
    const { main } = await import('./quick.js');

    const originalLog = console.log;
    const originalErr = console.error;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    console.log = (...args: unknown[]) => { stdoutChunks.push(args.map(String).join(' ')); };
    console.error = (...args: unknown[]) => { stderrChunks.push(args.map(String).join(' ')); };

    try {
      await main(['say hello in exactly 3 words', '--json']);
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }

    const stdout = stdoutChunks.join('\n');
    const parsed = JSON.parse(stdout);
    expect(parsed.output).toBeTruthy();
    expect(parsed.cost.cost_usd).toBeGreaterThan(0);
    expect(parsed.cost.cost_usd).toBeLessThan(0.01);
    expect(parsed.sessionId).toMatch(/^[0-9a-f-]{36}$/i);

    const { readFileSync, existsSync } = await import('node:fs');
    const { homedir } = await import('node:os');
    const path = await import('node:path');
    const { deriveSlug } = await import('./capture-standalone.js');

    const slug = deriveSlug(process.cwd());
    const transcriptPath = path.join(homedir(), '.claude', 'projects', slug, `${parsed.sessionId}.jsonl`);
    expect(existsSync(transcriptPath)).toBe(true);

    const content = readFileSync(transcriptPath, 'utf8').trim().split('\n');
    expect(content.length).toBe(2);
    const user = JSON.parse(content[0]);
    expect(user.content.content[0].text).toBe('say hello in exactly 3 words');
  }, 30_000);
});
