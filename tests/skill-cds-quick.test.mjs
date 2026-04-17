// tests/skill-cds-quick.test.mjs
// Structural tests on skills/cds-quick/SKILL.md.
// Updated after Phase 39 rewrite: skill now uses Agent tool, not CLI subprocess.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.join(__dirname, '..', 'skills', 'cds-quick', 'SKILL.md');

describe('skills/cds-quick/SKILL.md', () => {
  it('file exists', () => {
    expect(existsSync(skillPath)).toBe(true);
  });

  const content = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';

  it('has YAML frontmatter delimiters', () => {
    const lines = content.split('\n');
    expect(lines[0]).toBe('---');
    const closingIdx = lines.slice(1).findIndex((l) => l === '---');
    expect(closingIdx).toBeGreaterThan(0);
  });

  it('frontmatter declares name: cds-quick', () => {
    expect(content).toMatch(/^name:\s*cds-quick\s*$/m);
  });

  it('frontmatter has description', () => {
    expect(content).toMatch(/^description:/m);
  });

  it('frontmatter declares trigger_phrases list including /cds-quick and "quick task:"', () => {
    expect(content).toMatch(/^trigger_phrases:/m);
    expect(content).toMatch(/-\s*\/cds-quick/);
    expect(content).toMatch(/-\s*quick task:/);
  });

  it('body uses Agent tool with haiku model', () => {
    expect(content).toMatch(/Agent\(/);
    expect(content).toMatch(/model:\s*"haiku"/);
  });

  it('body uses $ARGUMENTS placeholder', () => {
    expect(content).toMatch(/\$ARGUMENTS/);
  });

  it('body instructs to display response verbatim', () => {
    expect(content).toMatch(/verbatim/i);
  });

  it('body has "when to use" guidance', () => {
    expect(content).toMatch(/When to use/i);
    expect(content).toMatch(/Do NOT use for/i);
  });
});
