/**
 * @cds/core/capture — transcript parser + extraction-prompt builder.
 *
 * Phase 36 D-60..D-63: reads a Claude Code session transcript (jsonl) and
 * reshapes the messages into the structure Haiku consumes. Applies inclusion
 * filters (D-61) and tier-2 head+tail truncation (D-61) before prompt build.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { buildSystemPrompt, SYSTEM_PROMPT, type CaptureMode } from './prompts.js';

/**
 * Truncate long tool results (Read/Grep/Bash etc.) to this many characters.
 * Edit/Write/MultiEdit results are kept in full — they carry authoritative
 * change data the observer may need verbatim.
 */
export const TOOL_TRUNCATE_CAP = 200;

/** Chars → tokens heuristic (English prose). Accepted imprecision per Research Pitfall 7. */
export const TOKEN_ESTIMATE_DIVISOR = 3.5;

/** Number of leading messages kept when tier-2 truncation fires. */
export const TIER_2_HEAD = 20;

/** Number of trailing messages kept when tier-2 truncation fires. */
export const TIER_2_TAIL = 30;

/** Prompt token budget; exceeding this triggers tier-2 head+tail truncation. */
export const TIER_2_MAX_TOKENS = 40_000;

/** Tools whose result content is kept in full (no 200-char cap). */
const FULL_KEEP_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write', 'MultiEdit']);

export interface ParsedMessage {
  role: 'user' | 'assistant' | 'tool_summary';
  content: string;
}

/**
 * Read + parse the Claude Code transcript for `sessionId` under `projectSlug`.
 *
 * Path: `~/.claude/projects/{projectSlug}/{sessionId}.jsonl`.
 *
 * Tolerates malformed lines (silently skips), unknown row types (skips),
 * empty lines (skips). Propagates `ENOENT` when the file does not exist —
 * the caller (Stop hook) classifies that as silent tier per D-66.
 */
export async function loadTranscript(
  sessionId: string,
  projectSlug: string,
): Promise<ParsedMessage[]> {
  const path = join(homedir(), '.claude', 'projects', projectSlug, `${sessionId}.jsonl`);
  const raw = await readFile(path, 'utf8');
  return parseTranscriptText(raw);
}

/**
 * Parse an already-loaded jsonl transcript string. Exposed for tests that
 * synthesize fixtures inline (no filesystem round-trip needed).
 */
export function parseTranscriptText(raw: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object') continue;

    const r = row as { type?: string; message?: { content?: unknown } };

    // User plain-text message
    if (r.type === 'user' && typeof r.message?.content === 'string') {
      messages.push({ role: 'user', content: r.message.content });
      continue;
    }

    // Assistant message (text blocks + tool_use blocks)
    if (r.type === 'assistant' && Array.isArray(r.message?.content)) {
      const blocks = r.message.content as Array<{
        type?: string;
        text?: string;
        name?: string;
        input?: unknown;
      }>;
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
          messages.push({ role: 'assistant', content: block.text });
        } else if (block.type === 'tool_use' && typeof block.name === 'string') {
          messages.push({
            role: 'tool_summary',
            content: summarizeToolCall(block.name, block.input),
          });
        }
      }
      continue;
    }

    // User message carrying tool_result blocks
    if (r.type === 'user' && Array.isArray(r.message?.content)) {
      const blocks = r.message.content as Array<{
        type?: string;
        content?: unknown;
        tool_use_id?: string;
        name?: string;
      }>;
      for (const block of blocks) {
        if (block.type === 'tool_result') {
          // The SDK flavour of tool_result does not always carry the originating
          // tool name; we default to 'Tool' and apply the truncate cap. The
          // observer doesn't strictly need the name — the preceding tool_use
          // summary already carried it.
          const toolName = typeof block.name === 'string' ? block.name : 'Tool';
          const truncated = truncateToolResult(block.content, toolName);
          if (truncated) messages.push({ role: 'tool_summary', content: truncated });
        }
      }
    }
  }

  return messages;
}

/**
 * Produce a single-line summary of a tool_use block for inclusion in the
 * prompt: `[ToolName] first-80-chars-of-first-arg`.
 */
export function summarizeToolCall(name: string, input: unknown): string {
  const firstArg =
    typeof input === 'object' && input !== null
      ? Object.values(input as Record<string, unknown>)[0]
      : input;
  const head = String(firstArg ?? '').slice(0, 80);
  return `[${name}] ${head}`;
}

/**
 * Shape a tool_result content field into a prompt-safe string. Applies the
 * 200-char cap for Read/Grep/Bash etc.; keeps Edit/Write/MultiEdit in full.
 *
 * Returns `null` when the input has no extractable text (parser skips it).
 */
export function truncateToolResult(content: unknown, toolName: string): string | null {
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? (content as Array<{ type?: string; text?: string }>)
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('')
        : '';
  if (!text) return null;
  if (FULL_KEEP_TOOLS.has(toolName)) {
    return `[${toolName} result] ${text}`;
  }
  const snippet = text.slice(0, TOOL_TRUNCATE_CAP);
  const suffix = text.length > TOOL_TRUNCATE_CAP ? '…' : '';
  return `[${toolName} result] ${snippet}${suffix}`;
}

/**
 * Build the extraction prompt pair (system + user) from parsed messages.
 *
 * Applies tier-2 truncation (D-61) when the estimated token count exceeds
 * `TIER_2_MAX_TOKENS` AND the transcript is long enough that head+tail
 * elision still leaves something meaningful.
 *
 * Phase 38 rename: this is the ParsedMessage[]-shaped builder for the live
 * Stop-hook pathway. The flat-string `buildExtractionPrompt({mode, input})`
 * helper in `./prompts.ts` is the canonical entry for Phase 38's backfill
 * migrator. Both paths share the same underlying system prompt + tool schema.
 *
 * `mode` defaults to `'transcript'`; Phase 38 callers with raw markdown use
 * `buildExtractionPrompt` from `./prompts.js` instead.
 */
export function buildExtractionPromptFromMessages(
  messages: ParsedMessage[],
  mode: CaptureMode = 'transcript',
): { systemPrompt: string; userPrompt: string; estimatedTokens: number } {
  const systemPrompt = buildSystemPrompt(mode);

  let userPrompt = messages
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join('\n\n');

  let estimatedTokens = Math.ceil(
    (systemPrompt.length + userPrompt.length) / TOKEN_ESTIMATE_DIVISOR,
  );

  if (
    estimatedTokens > TIER_2_MAX_TOKENS &&
    messages.length > TIER_2_HEAD + TIER_2_TAIL
  ) {
    const head = messages.slice(0, TIER_2_HEAD);
    const tail = messages.slice(-TIER_2_TAIL);
    const elided = messages.length - head.length - tail.length;
    userPrompt = [
      ...head.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`),
      `\n... [${elided} messages elided for cost] ...\n`,
      ...tail.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`),
    ].join('\n\n');
    estimatedTokens = Math.ceil(
      (systemPrompt.length + userPrompt.length) / TOKEN_ESTIMATE_DIVISOR,
    );
  }

  return { systemPrompt, userPrompt, estimatedTokens };
}

// Re-export SYSTEM_PROMPT for callers that still import from transcript.ts (back-compat).
export { SYSTEM_PROMPT };
