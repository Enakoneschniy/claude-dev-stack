import { describe, it } from 'node:test';
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
  const builtinSkills = ['session-manager', 'project-switcher', 'dev-router', 'dev-research'];

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
