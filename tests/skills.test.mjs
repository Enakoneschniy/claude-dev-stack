import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

import { getInstalledSkills } from '../lib/skills.mjs';

describe('skills module', () => {
  const testSkillsDir = `/tmp/claude-test-skills-${process.pid}`;

  describe('getInstalledSkills', () => {
    it('returns array', () => {
      const skills = getInstalledSkills();
      assert.ok(Array.isArray(skills));
    });

    it('each skill has name, path, description', () => {
      const skills = getInstalledSkills();
      if (skills.length > 0) {
        const skill = skills[0];
        assert.ok(typeof skill.name === 'string');
        assert.ok(typeof skill.path === 'string');
        assert.ok(typeof skill.description === 'string');
      }
    });
  });
});

describe('builtin skills', () => {
  const skillsDir = join(new URL('..', import.meta.url).pathname, 'skills');
  const builtinSkills = ['session-manager', 'dev-research'];

  for (const name of builtinSkills) {
    describe(name, () => {
      const skillPath = join(skillsDir, name, 'SKILL.md');

      it('SKILL.md exists', () => {
        assert.ok(existsSync(skillPath), `${skillPath} should exist`);
      });

      it('has YAML frontmatter with name and description', () => {
        const content = readFileSync(skillPath, 'utf8');
        assert.ok(content.startsWith('---'), 'should start with ---');
        assert.ok(content.includes('name:'), 'should have name field');
        assert.ok(content.includes('description:'), 'should have description field');
      });

      it('does not contain hardcoded project names', () => {
        const content = readFileSync(skillPath, 'utf8');
        // These were the old hardcoded names
        const hardcoded = ['crypto-portal', 'ai-news-portal', 'bikotrading', 'ai-real-estate'];
        for (const name of hardcoded) {
          assert.ok(!content.includes(name), `should not contain hardcoded "${name}"`);
        }
      });
    });
  }
});

describe('session-manager — SKL-02 migration (Phase 31)', () => {
  const skillsDir = join(new URL('..', import.meta.url).pathname, 'skills');
  const skillPath = join(skillsDir, 'session-manager', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf8');

  it('start-path body is removed (D-04)', () => {
    assert.ok(
      !content.includes('### /resume or /start'),
      'should not contain combined /resume+/start auto-loader heading'
    );
    assert.ok(
      !content.includes('## Automatic Behavior'),
      'should not contain Automatic Behavior section'
    );
    assert.ok(
      !content.includes('Auto-run /resume logic'),
      'should not describe auto-running resume on first message'
    );
  });

  it('contains D-06 note pointing to SessionStart hook', () => {
    assert.ok(
      content.includes('Context is loaded at SessionStart'),
      'should contain D-06 note line'
    );
    assert.ok(
      content.includes('session-start-context.sh'),
      'should reference the hook by filename'
    );
  });

  it('retains /end + /handoff + ADR sections (D-05)', () => {
    assert.ok(content.includes('### /end'), '/end command retained');
    assert.ok(content.includes('### /handoff'), '/handoff command retained');
    assert.ok(content.includes('## ADR Creation'), 'ADR section retained');
  });
});
