// packages/cds-cli/src/capture-standalone.ts
// Standalone-mode session capture: writes a synthetic Claude-Code-style transcript
// then spawns the Phase 36 session-end-capture.sh detached so it can extract observations
// into SQLite via the normal capture pathway.
// Source: .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §D-113
//         .planning/phases/36-auto-session-capture/36-CONTEXT.md §D-60 (transcript format)
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface StandaloneParams {
  task: string;
  output: string;
  sessionId: string;
  projectPath: string;
}

/**
 * Derive Claude Code's project slug from an absolute project path.
 * Matches Phase 36 D-60: dashes-for-slashes, strip leading dash.
 */
export function deriveSlug(projectPath: string): string {
  return projectPath.split(path.sep).filter(Boolean).join('-');
}

/**
 * Write synthetic 2-message transcript + spawn session-end-capture.sh detached.
 * Fail-silent: if the hook wrapper is missing, writes the transcript anyway and returns.
 */
export async function captureStandalone(p: StandaloneParams): Promise<void> {
  const slug = deriveSlug(p.projectPath);
  const transcriptDir = path.join(homedir(), '.claude', 'projects', slug);
  const transcriptPath = path.join(transcriptDir, `${p.sessionId}.jsonl`);

  await mkdir(transcriptDir, { recursive: true });

  const userMsg = {
    type: 'user',
    uuid: 'u1',
    session_id: p.sessionId,
    content: { role: 'user', content: [{ type: 'text', text: p.task }] },
  };
  const assistantMsg = {
    type: 'assistant',
    uuid: 'a1',
    session_id: p.sessionId,
    content: { role: 'assistant', content: [{ type: 'text', text: p.output }] },
  };

  const lines = [JSON.stringify(userMsg), JSON.stringify(assistantMsg)];
  await writeFile(transcriptPath, lines.join('\n') + '\n', 'utf8');

  // Spawn session-end-capture.sh detached; fail-silent per Phase 36 D-66.
  // Node spawn() reports missing binaries via an async 'error' event, not by throwing
  // synchronously, so we attach an error listener BEFORE unref() to swallow ENOENT.
  const hookScript = path.join(homedir(), '.claude', 'hooks', 'session-end-capture.sh');
  try {
    const child = spawn(hookScript, [], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        CLAUDE_SESSION_ID: p.sessionId,
        CLAUDE_PROJECT_DIR: p.projectPath,
      },
    });
    child.on('error', () => {
      // Hook wrapper missing or not executable — best-effort, transcript still written.
    });
    child.unref();
  } catch {
    // Synchronous spawn failure (rare) — best-effort, transcript still written.
  }
}
