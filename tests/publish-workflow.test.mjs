// tests/publish-workflow.test.mjs
// Structural assertions on .github/workflows/publish.yml.
// Source: Phase 39 VALIDATION §Task 39-05-01..04
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'publish.yml');

describe('.github/workflows/publish.yml', () => {
  it('file exists', () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  const content = existsSync(workflowPath) ? readFileSync(workflowPath, 'utf8') : '';

  describe('triggers + permissions', () => {
    it('triggers on release:published', () => {
      expect(content).toMatch(/on:\s*\n\s*release:\s*\n\s*types:\s*\[published\]/);
    });

    it('oidc: preserves id-token: write + contents: read', () => {
      expect(content).toMatch(/id-token:\s*write/);
      expect(content).toMatch(/contents:\s*read/);
    });
  });

  describe('setup', () => {
    it('uses actions/checkout@v5', () => {
      expect(content).toMatch(/actions\/checkout@v5/);
    });

    it('uses pnpm/action-setup@v4 with version: 10', () => {
      expect(content).toMatch(/pnpm\/action-setup@v4/);
      expect(content).toMatch(/version:\s*10/);
    });

    it('uses actions/setup-node@v5 with Node 22', () => {
      expect(content).toMatch(/actions\/setup-node@v5/);
      expect(content).toMatch(/node-version:\s*22/);
    });

    it('registry-url is set for npm publish', () => {
      expect(content).toMatch(/registry-url:\s*'https:\/\/registry\.npmjs\.org'/);
    });
  });

  describe('preflight steps', () => {
    it('runs pnpm install --frozen-lockfile', () => {
      expect(content).toMatch(/pnpm install --frozen-lockfile/);
    });

    it('runs pnpm tsup', () => {
      expect(content).toMatch(/pnpm tsup/);
    });

    it('runs pnpm test', () => {
      expect(content).toMatch(/pnpm test/);
    });

    it('has tarball size assertion with 5 MB budget', () => {
      expect(content).toMatch(/pnpm pack --json/);
      expect(content).toMatch(/5242880/);
    });

    it('has smoke install step asserting version 1.0.0-alpha.1', () => {
      expect(content).toMatch(/npm pack/);
      expect(content).toMatch(/npm install -g \.\/claude-dev-stack-1\.0\.0-alpha\.1\.tgz/);
      expect(content).toMatch(/claude-dev-stack --version/);
      expect(content).toMatch(/1\.0\.0-alpha\.1/);
    });
  });

  describe('prerelease detection', () => {
    it('has a step with id: meta', () => {
      expect(content).toMatch(/id:\s*meta/);
    });

    it('reads github.event.release.prerelease (via env binding)', () => {
      expect(content).toMatch(/github\.event\.release\.prerelease/);
    });

    it('sets tag=alpha for prerelease, tag=latest otherwise', () => {
      expect(content).toMatch(/echo "tag=alpha"/);
      expect(content).toMatch(/echo "tag=latest"/);
      expect(content).toMatch(/"\$GITHUB_OUTPUT"/);
    });
  });

  describe('publish step', () => {
    it('uses npm publish with --tag bound from steps.meta.outputs.tag (via env DIST_TAG)', () => {
      // Env-var pattern (security best practice): DIST_TAG: ${{ steps.meta.outputs.tag }}
      // then `npm publish --tag "$DIST_TAG"`. Both sides verified.
      expect(content).toMatch(/DIST_TAG:\s*\$\{\{\s*steps\.meta\.outputs\.tag\s*\}\}/);
      expect(content).toMatch(/npm publish --tag "\$DIST_TAG"/);
    });

    it('uses --access public', () => {
      expect(content).toMatch(/--access public/);
    });

    it('uses --provenance', () => {
      expect(content).toMatch(/--provenance/);
    });
  });

  describe('step ordering', () => {
    it('preflight steps come BEFORE prerelease detection which comes BEFORE publish', () => {
      const installIdx = content.indexOf('pnpm install --frozen-lockfile');
      const tsupIdx = content.indexOf('pnpm tsup');
      const testIdx = content.indexOf('pnpm test');
      const packSizeIdx = content.indexOf('Assert tarball size');
      const smokeIdx = content.indexOf('Smoke install');
      const detectIdx = content.indexOf('Detect dist-tag');
      const publishIdx = content.indexOf('npm publish --tag');

      expect(installIdx).toBeGreaterThan(0);
      expect(tsupIdx).toBeGreaterThan(installIdx);
      expect(testIdx).toBeGreaterThan(tsupIdx);
      expect(packSizeIdx).toBeGreaterThan(testIdx);
      expect(smokeIdx).toBeGreaterThan(packSizeIdx);
      expect(detectIdx).toBeGreaterThan(smokeIdx);
      expect(publishIdx).toBeGreaterThan(detectIdx);
    });
  });
});
