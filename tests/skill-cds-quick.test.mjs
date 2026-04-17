// tests/skill-cds-quick.test.mjs
// Structural tests on skills/cds-quick/SKILL.md.
// Source: Phase 39 VALIDATION §Task 39-03-01, 39-03-02
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

  it('body references the claude-dev-stack quick CLI command', () => {
    expect(content).toMatch(/claude-dev-stack quick\s+"\$ARGUMENTS"\s+--json/);
  });

  it('body uses $ARGUMENTS placeholder', () => {
    expect(content).toMatch(/\$ARGUMENTS/);
  });

  it('body references session-end-capture (auto-capture explanation)', () => {
    expect(content).toMatch(/session-end-capture/);
  });

  it('body instructs to NOT trigger capture manually', () => {
    expect(content).toMatch(/Do NOT trigger capture manually/i);
  });

  it('body mentions cost output format ($ USD + tokens)', () => {
    expect(content).toMatch(/cost_usd/);
    expect(content).toMatch(/tokens/);
  });

  it('body has a bash code fence for the CLI invocation', () => {
    expect(content).toMatch(/```bash[\s\S]+claude-dev-stack quick[\s\S]+```/);
  });

  it('body notes alpha status and issue tracker link', () => {
    expect(content).toMatch(/1\.0\.0-alpha\.1/);
    expect(content).toMatch(/github\.com\/Enakoneschniy\/claude-dev-stack/);
  });
});
