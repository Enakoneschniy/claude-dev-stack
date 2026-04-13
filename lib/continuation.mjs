/**
 * lib/continuation.mjs — 4-option continuation prompt for budget warnings (LIMIT-02)
 *
 * When the session budget warning fires, the user can run:
 *   claude-dev-stack budget continue
 *
 * This module presents 4 options and handles each one.
 *
 * Note: CronCreate, Desktop task, and Cloud task are Claude Code agent tools.
 * They can only be invoked from within a Claude Code session (skill context),
 * not from bare Node.js. The handlers print instructions; the /budget-continue
 * skill running inside a session can act on those instructions directly.
 */

import { spawnSync } from 'node:child_process';
import { c, ok, info, warn, prompt } from './shared.mjs';

// ── Options ──────────────────────────────────────────────────────────────────

const OPTIONS = [
  {
    title: '  Remind me later  (CronCreate — fires in your Claude Code session)',
    value: 'remind',
  },
  {
    title: '  Auto-continue locally  (Desktop task — machine must be on)',
    value: 'local',
  },
  {
    title: '  Auto-continue in cloud  (Cloud task — works when machine is off)',
    value: 'cloud',
  },
  {
    title: '  Continue now  (accept extra usage)',
    value: 'now',
  },
];

// ── Main prompt ───────────────────────────────────────────────────────────────

/**
 * Show the 4-option continuation prompt interactively.
 * Falls back to handleNow() if no TTY or prompt is cancelled.
 */
export async function showContinuationPrompt() {
  console.log('');
  console.log(`  ${c.yellow}${c.bold}Session budget is low.${c.reset} Choose how to continue:`);
  console.log('');

  let choice;
  try {
    const result = await prompt({
      type: 'select',
      name: 'choice',
      message: 'What would you like to do?',
      choices: OPTIONS,
    });
    choice = result.choice;
  } catch {
    choice = undefined;
  }

  if (!choice) {
    await handleNow();
    return;
  }

  switch (choice) {
    case 'remind': {
      const { delay } = await prompt({
        type: 'select',
        name: 'delay',
        message: 'Remind me in:',
        choices: [
          { title: '1 hour', value: '+1h' },
          { title: '2 hours', value: '+2h' },
          { title: '4 hours', value: '+4h' },
        ],
        initial: 0,
      });
      await handleRemind(delay || '+1h');
      break;
    }

    case 'local': {
      const { schedule } = await prompt({
        type: 'select',
        name: 'schedule',
        message: 'Auto-continue in:',
        choices: [
          { title: '1 hour', value: '+1h' },
          { title: '2 hours', value: '+2h' },
          { title: '4 hours', value: '+4h' },
        ],
        initial: 0,
      });
      await handleLocal(schedule || '+1h');
      break;
    }

    case 'cloud': {
      const repoUrl = getGitRemoteUrl();
      const { schedule } = await prompt({
        type: 'select',
        name: 'schedule',
        message: 'Auto-continue in:',
        choices: [
          { title: '1 hour', value: '+1h' },
          { title: '2 hours', value: '+2h' },
          { title: '4 hours', value: '+4h' },
        ],
        initial: 0,
      });
      await handleCloud(schedule || '+1h', repoUrl);
      break;
    }

    case 'now':
    default:
      await handleNow();
      break;
  }
}

// ── Option handlers ───────────────────────────────────────────────────────────

/**
 * Option 1: Remind me later via CronCreate.
 * Prints instructions for creating a CronCreate reminder inside a Claude Code session.
 */
export async function handleRemind(delay = '+1h') {
  console.log('');
  info('To create a reminder, run this inside a Claude Code session:');
  console.log('');
  console.log(`  ${c.cyan}Use CronCreate to set a reminder:${c.reset}`);
  console.log(`    Title:    "Resume GSD session — budget warning"`);
  console.log(`    Prompt:   "/budget-continue"`);
  console.log(`    Schedule: "${delay}"`);
  console.log(`    Repeat:   false`);
  console.log('');
  console.log(`  Or invoke the ${c.bold}/budget-continue${c.reset} skill in Claude Code.`);
  console.log('');
  ok(`Reminder instructions printed (schedule: ${delay})`);
}

/**
 * Option 2: Auto-continue locally via Desktop task.
 * Prints instructions for creating a Desktop task in a Claude Code session.
 */
export async function handleLocal(schedule = '+1h') {
  console.log('');
  info('To schedule a local Desktop task, run this inside a Claude Code session:');
  console.log('');
  console.log(`  ${c.cyan}Use the Desktop task tool:${c.reset}`);
  console.log(`    Prompt:   "/gsd-resume-work"`);
  console.log(`    Schedule: "${schedule}"`);
  console.log(`    Note: Your machine must be on when the task fires.`);
  console.log('');
  console.log(`  Or invoke the ${c.bold}/budget-continue${c.reset} skill in Claude Code.`);
  console.log('');
  ok(`Local Desktop task instructions printed (schedule: ${schedule})`);
}

/**
 * Option 3: Auto-continue in cloud via Cloud task.
 * Prints instructions for creating a Cloud task in a Claude Code session.
 * Uses spawnSync with args array (no shell injection) to get the git remote URL.
 */
export async function handleCloud(schedule = '+1h', repoUrl = null) {
  const url = repoUrl || getGitRemoteUrl();
  console.log('');
  info('To schedule a Cloud task, run this inside a Claude Code session:');
  console.log('');
  console.log(`  ${c.cyan}Use the Cloud task tool:${c.reset}`);
  console.log(`    Repo:     "${url || '(git remote origin URL)'}"`);
  console.log(`    Prompt:   "/gsd-resume-work"`);
  console.log(`    Schedule: "${schedule}"`);
  console.log(`    Note: Cloud tasks run on Anthropic infra (fresh git clone).`);
  console.log(`          All state must be committed to git (GSD guarantees this).`);
  console.log('');
  console.log(`  Or invoke the ${c.bold}/budget-continue${c.reset} skill in Claude Code.`);
  console.log('');
  ok(`Cloud task instructions printed (schedule: ${schedule}${url ? ', repo: ' + url : ''})`);
}

/**
 * Option 4: Continue now — no scheduling action.
 * Prints a message and returns without error.
 */
export async function handleNow() {
  console.log('');
  info('Continuing with current session. Consider compressing context soon.');
  console.log('');
  console.log(`  ${c.dim}Tip: Run ${c.reset}${c.bold}claude-dev-stack budget continue${c.reset}${c.dim} again`);
  console.log(`  if you change your mind about scheduling.${c.reset}`);
  console.log('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get git remote origin URL using spawnSync with args array (no shell injection).
 * Returns null if not in a git repo or remote not configured.
 */
function getGitRemoteUrl() {
  try {
    const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // not in a git repo or git not available
  }
  return null;
}
