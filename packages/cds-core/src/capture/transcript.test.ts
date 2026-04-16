import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadTranscript,
  parseTranscriptText,
  buildExtractionPrompt,
  truncateToolResult,
  summarizeToolCall,
  TOOL_TRUNCATE_CAP,
  TIER_2_MAX_TOKENS,
  TIER_2_HEAD,
  TIER_2_TAIL,
  type ParsedMessage,
} from './transcript.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

let cleanupPaths: string[] = [];

afterEach(() => {
  for (const p of cleanupPaths) {
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  cleanupPaths = [];
});

/**
 * loadTranscript resolves `~/.claude/projects/{slug}/{id}.jsonl`. In tests we
 * synthesize a throwaway HOME dir and point to it via the HOME env var so the
 * parser sees our fixture at the expected path.
 */
async function stageTranscript(
  sessionId: string,
  projectSlug: string,
  source: string,
): Promise<string> {
  const fakeHome = mkdtempSync(join(tmpdir(), 'cds-capture-home-'));
  cleanupPaths.push(fakeHome);
  const dir = join(fakeHome, '.claude', 'projects', projectSlug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sessionId}.jsonl`);
  writeFileSync(path, source);
  return fakeHome;
}

describe('parseTranscriptText — shape + filters', () => {
  it('parses small fixture into mixed roles', async () => {
    const raw = await readFile(join(FIXTURES_DIR, 'small-session.jsonl'), 'utf8');
    const messages = parseTranscriptText(raw);
    expect(messages.length).toBeGreaterThanOrEqual(10);
    expect(messages.some((m) => m.role === 'user')).toBe(true);
    expect(messages.some((m) => m.role === 'assistant')).toBe(true);
    expect(messages.some((m) => m.role === 'tool_summary')).toBe(true);
  });

  it('tool summaries carry the [ToolName] prefix', async () => {
    const raw = await readFile(join(FIXTURES_DIR, 'small-session.jsonl'), 'utf8');
    const messages = parseTranscriptText(raw);
    const summaries = messages.filter((m) => m.role === 'tool_summary');
    expect(summaries.some((s) => s.content.startsWith('[Read'))).toBe(true);
    expect(summaries.some((s) => s.content.startsWith('[Grep'))).toBe(true);
  });

  it('empty transcript returns empty array', async () => {
    const raw = await readFile(join(FIXTURES_DIR, 'edge-empty.jsonl'), 'utf8');
    expect(parseTranscriptText(raw)).toEqual([]);
  });

  it('tool-only transcript has no user/assistant roles', async () => {
    const raw = await readFile(join(FIXTURES_DIR, 'edge-tool-only.jsonl'), 'utf8');
    const messages = parseTranscriptText(raw);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => m.role === 'tool_summary')).toBe(true);
  });

  it('skips malformed jsonl lines silently', () => {
    const raw = [
      '{not valid json',
      '{"type":"user","message":{"content":"hello"}}',
      '',
      '{"type":"user","message":{"content":"world"}}',
      '{still bad',
    ].join('\n');
    const messages = parseTranscriptText(raw);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('hello');
    expect(messages[1]?.content).toBe('world');
  });
});

describe('loadTranscript — filesystem wiring', () => {
  it('propagates ENOENT when the file is missing', async () => {
    const origHome = process.env.HOME;
    const fakeHome = mkdtempSync(join(tmpdir(), 'cds-capture-empty-'));
    cleanupPaths.push(fakeHome);
    process.env.HOME = fakeHome;
    try {
      await expect(loadTranscript('nope', 'no-project')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      if (origHome !== undefined) process.env.HOME = origHome;
      else delete process.env.HOME;
    }
  });

  it('reads a staged jsonl file under fake HOME', async () => {
    const origHome = process.env.HOME;
    const fake = await stageTranscript(
      'session-abc',
      '-Users-test-project',
      '{"type":"user","message":{"content":"hi"}}\n',
    );
    process.env.HOME = fake;
    try {
      const messages = await loadTranscript('session-abc', '-Users-test-project');
      expect(messages).toEqual([{ role: 'user', content: 'hi' }]);
    } finally {
      if (origHome !== undefined) process.env.HOME = origHome;
      else delete process.env.HOME;
    }
  });
});

describe('buildExtractionPrompt', () => {
  it('wraps messages in <role> tags and reports token estimate (no elision)', () => {
    const messages: ParsedMessage[] = [
      { role: 'user', content: 'fix the bug' },
      { role: 'assistant', content: 'will do' },
    ];
    const out = buildExtractionPrompt(messages);
    expect(out.userPrompt).toContain('<user>');
    expect(out.userPrompt).toContain('</user>');
    expect(out.userPrompt).toContain('<assistant>');
    expect(out.userPrompt).not.toMatch(/elided for cost/);
    expect(out.estimatedTokens).toBeGreaterThan(0);
  });

  it('applies tier-2 head+tail truncation when over token budget', async () => {
    const raw = await readFile(join(FIXTURES_DIR, 'large-session.jsonl'), 'utf8');
    const messages = parseTranscriptText(raw);
    expect(messages.length).toBeGreaterThan(TIER_2_HEAD + TIER_2_TAIL);
    const out = buildExtractionPrompt(messages);
    expect(out.userPrompt).toMatch(/\.\.\. \[\d+ messages elided for cost\] \.\.\./);
    // Estimate stays bounded — after truncation we should only have HEAD+TAIL messages.
    // Allow a reasonable margin above the max for the preserved messages + system prompt.
    expect(out.estimatedTokens).toBeLessThan(TIER_2_MAX_TOKENS * 2);
  });

  it('backfill mode prepends a preamble to the system prompt', () => {
    const messages: ParsedMessage[] = [{ role: 'user', content: 'hi' }];
    const transcriptOut = buildExtractionPrompt(messages, 'transcript');
    const backfillOut = buildExtractionPrompt(messages, 'backfill');
    expect(backfillOut.systemPrompt.length).toBeGreaterThan(transcriptOut.systemPrompt.length);
    expect(backfillOut.systemPrompt.toLowerCase()).toContain('backfill');
  });
});

describe('truncateToolResult + summarizeToolCall', () => {
  it('caps Read results at TOOL_TRUNCATE_CAP chars and adds ellipsis', () => {
    const long = 'a'.repeat(500);
    const out = truncateToolResult(long, 'Read');
    expect(out).not.toBeNull();
    // Format is "[Read result] <snippet>…"; snippet is exactly TOOL_TRUNCATE_CAP.
    const snippet = out!.replace(/^\[Read result\] /, '').replace(/…$/, '');
    expect(snippet).toHaveLength(TOOL_TRUNCATE_CAP);
    expect(out!.endsWith('…')).toBe(true);
  });

  it('keeps Write/Edit/MultiEdit results in full (no cap)', () => {
    const long = 'b'.repeat(500);
    for (const tool of ['Write', 'Edit', 'MultiEdit']) {
      const out = truncateToolResult(long, tool);
      expect(out).toBe(`[${tool} result] ${long}`);
    }
  });

  it('summarizeToolCall slices first 80 chars of first arg', () => {
    const sum = summarizeToolCall('Bash', { command: 'echo ' + 'x'.repeat(200) });
    expect(sum.startsWith('[Bash] ')).toBe(true);
    expect(sum.length).toBeLessThanOrEqual('[Bash] '.length + 80);
  });

  it('returns null for empty tool_result content', () => {
    expect(truncateToolResult('', 'Read')).toBeNull();
    expect(truncateToolResult(null, 'Read')).toBeNull();
    expect(truncateToolResult([], 'Read')).toBeNull();
  });
});
