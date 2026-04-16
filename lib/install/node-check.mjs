// lib/install/node-check.mjs
// Wizard startup guard — assert runtime Node major version >= minMajor.
// Source: .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §D-121
//
// Throws a descriptive error if the runtime is too old, routing users to either upgrade
// Node or install the legacy @latest (v0.12.x) which still supports Node 18.

/**
 * Parse the current Node runtime's major version.
 * @returns {number} major version integer, e.g. 20
 */
export function currentNodeMajor() {
  const full = process.versions.node;
  const major = Number(full.split('.')[0]);
  if (!Number.isFinite(major)) {
    throw new Error(`Unable to parse Node version: ${full}`);
  }
  return major;
}

/**
 * Assert that the runtime Node major version is at least `minMajor`.
 * Prints a help-text error message to stderr and throws so the wizard aborts cleanly.
 *
 * @param {number} minMajor - e.g. 20
 * @throws {Error} if runtime major < minMajor
 */
export function assertNodeVersion(minMajor) {
  const current = currentNodeMajor();
  if (current >= minMajor) return;

  const msg = [
    '',
    `  \x1b[31m⚠ Node ${process.versions.node} is too old for claude-dev-stack@1.0.0-alpha.1\x1b[0m`,
    `  Required: Node ${minMajor}+`,
    '',
    '  Options:',
    `    1. Upgrade Node: \x1b[36mnvm install ${minMajor}\x1b[0m`,
    `    2. Install legacy: \x1b[36mnpm install -g claude-dev-stack@latest\x1b[0m (v0.12.x, supports Node 18)`,
    '',
    '  See: docs/migration-v0-to-v1-alpha.md#node-18--node-20',
    '',
  ].join('\n');

  process.stderr.write(msg);
  throw new Error(`Node ${minMajor}+ required, got ${process.versions.node}`);
}
