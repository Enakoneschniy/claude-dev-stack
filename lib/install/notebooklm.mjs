// lib/install/notebooklm.mjs — NotebookLM installation wizard step
// D-08..D-11: detect → install via pipx/pip → notebooklm login (interactive OAuth)
//             → auth check verify → first sync prompt.

import { c, ok, fail, warn, info, prompt, step, hasCommand, runCmd, spawnSync } from '../shared.mjs';

export async function installNotebookLM(pipCmd, stepNum, totalSteps) {
  step(stepNum, totalSteps, '📚 Setting up NotebookLM');
  info('NotebookLM lets Claude ground answers in your vault history.');
  info('Requires notebooklm-py (Python package) + one-time Google OAuth login.');

  // Step 1: Detect if notebooklm binary is already available (idempotent re-run).
  if (hasCommand('notebooklm')) {
    ok('notebooklm binary already in PATH — skipping install');
  } else {
    // Step 2: Choose install method — pipx first (D-09), pip --user fallback.
    let installCmd = null;
    if (hasCommand('pipx')) {
      installCmd = 'pipx install "notebooklm-py[browser]"';
    } else if (runCmd('python3 -m pip --version') !== null) {
      installCmd = 'python3 -m pip install --user "notebooklm-py[browser]"';
    }

    if (!installCmd) {
      warn('Neither pipx nor python3 detected.');
      info('To install manually later: pipx install "notebooklm-py[browser]"');
      return false;
    }

    // Show exact command before running (user consent).
    console.log(`  ${c.dim}Will run: ${installCmd}${c.reset}`);
    const { proceed } = await prompt({
      type: 'confirm',
      name: 'proceed',
      message: 'Install notebooklm-py now?',
      initial: true,
    });
    if (!proceed) {
      info('Skipped — you can install later with: ' + installCmd);
      return false;
    }

    info('Installing notebooklm-py (this may take a minute)...');
    const installResult = runCmd(`${installCmd} 2>&1`);
    if (installResult === null) {
      fail('Install failed.');
      info(`Try manually: ${installCmd}`);
      return false;
    }

    // Re-check after install (PATH edge cases can silently fail).
    if (!hasCommand('notebooklm')) {
      fail('notebooklm binary still not in PATH after install.');
      info('You may need to restart your shell or adjust PATH.');
      return false;
    }
    ok('notebooklm-py installed');
  }

  // Step 3: Run `notebooklm login` interactively (D-10).
  // spawnSync with stdio: 'inherit' blocks the wizard while the user completes
  // browser-based Google OAuth and presses ENTER in the terminal.
  info('Launching notebooklm login — browser will open for Google OAuth.');
  info('After signing in, return to this terminal and press ENTER.');
  const loginResult = spawnSync('notebooklm', ['login'], { stdio: 'inherit' });

  if (loginResult.signal === 'SIGINT') {
    info('Login cancelled. Run "notebooklm login" manually to complete setup.');
    return false;
  }
  if (loginResult.error) {
    fail(`Login subprocess failed: ${loginResult.error.message}`);
    return false;
  }
  if (loginResult.status !== 0) {
    warn('Login may not have completed. You can re-run "notebooklm login" later.');
    // Continue anyway — auth check will confirm actual state.
  }

  // Step 4: Verify with auth check (D-10 post-login).
  const authOk = runCmd('notebooklm auth check 2>/dev/null') !== null;
  if (!authOk) {
    warn('notebooklm auth check — not authenticated.');
    info('You can retry with: notebooklm login');
    return false;
  }
  ok('notebooklm authenticated');

  // Step 5: Offer first sync (D-11).
  const { runFirstSync } = await prompt({
    type: 'confirm',
    name: 'runFirstSync',
    message: 'Run first NotebookLM sync now? (recommended)',
    initial: true,
  });
  if (runFirstSync) {
    info('Running first sync — this may take 30-60 seconds on a populated vault...');
    try {
      const { syncVault } = await import('../notebooklm-sync.mjs');
      const stats = await syncVault({});
      ok(`First sync complete: ${stats.uploaded} uploaded, ${stats.skipped} skipped, ${stats.failed} failed (${stats.durationMs}ms)`);
      if (stats.errors && stats.errors.length > 0) {
        warn(`${stats.errors.length} file(s) had errors — run 'claude-dev-stack notebooklm sync' to retry.`);
      }
    } catch (err) {
      warn(`First sync failed: ${err.message}`);
      info("You can run sync later with: claude-dev-stack notebooklm sync");
    }
  } else {
    info("You can run sync later with: claude-dev-stack notebooklm sync");
  }

  return true;
}
