// packages/cds-cli/src/capture-standalone.test.ts
// Unit tests for captureStandalone: writes synthetic transcript, spawns hook.
// Source: Phase 39 VALIDATION §Task 39-02-05
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { setupTempHome, type TempHome } from '../tests/helpers/temp-home.js';
import { captureStandalone, deriveSlug } from './capture-standalone.js';

describe('captureStandalone', () => {
  let tempHome: TempHome;

  beforeEach(() => {
    tempHome = setupTempHome();
  });

  afterEach(() => {
    tempHome.restore();
  });

  it('deriveSlug: strips leading separator, joins with dashes', () => {
    expect(deriveSlug('/Users/foo/Projects/my-app')).toBe('Users-foo-Projects-my-app');
    expect(deriveSlug('/tmp/x')).toBe('tmp-x');
  });

  it('writes synthetic transcript at $HOME/.claude/projects/{slug}/{sessionId}.jsonl', async () => {
    const sessionId = '00000000-0000-0000-0000-000000000001';
    const projectPath = path.join(tempHome.tempHome, 'projects', 'demo-app');
    await captureStandalone({
      task: 'demo task',
      output: 'demo output',
      sessionId,
      projectPath,
    });

    const slug = deriveSlug(projectPath);
    const expectedPath = path.join(homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
    expect(existsSync(expectedPath)).toBe(true);

    const content = readFileSync(expectedPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);

    const userMsg = JSON.parse(lines[0]);
    expect(userMsg.type).toBe('user');
    expect(userMsg.session_id).toBe(sessionId);
    expect(userMsg.content.role).toBe('user');
    expect(userMsg.content.content[0].text).toBe('demo task');

    const assistantMsg = JSON.parse(lines[1]);
    expect(assistantMsg.type).toBe('assistant');
    expect(assistantMsg.session_id).toBe(sessionId);
    expect(assistantMsg.content.role).toBe('assistant');
    expect(assistantMsg.content.content[0].text).toBe('demo output');
  });

  it('does not throw if session-end-capture.sh missing (fail-silent)', async () => {
    await expect(
      captureStandalone({
        task: 't',
        output: 'o',
        sessionId: '00000000-0000-0000-0000-000000000002',
        projectPath: path.join(tempHome.tempHome, 'p'),
      }),
    ).resolves.toBeUndefined();
  });
});
