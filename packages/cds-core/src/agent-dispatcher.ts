/**
 * dispatchAgent — @cds/core primitive wrapping @anthropic-ai/claude-agent-sdk's
 * query() async generator into a typed DispatchOptions → DispatchResult surface.
 *
 * Contract (CONTEXT.md D-17):
 *   dispatchAgent({ model, prompt, system?, tools?, signal?, session_id? })
 *     -> Promise<{ output: string, tokens: { input, output }, cost_usd: number }>
 *
 * Threading (CONTEXT.md D-31):
 *   - The dispatcher does NOT mutate caller-provided Context or CostTracker.
 *   - session_id is accepted for caller convenience but NOT forwarded to SDK options
 *     (if the SDK gains session threading later, a follow-up plan wires it).
 *
 * Errors (CONTEXT.md D-18):
 *   - Thrown, not returned. LicenseKeyError when ANTHROPIC_API_KEY is absent.
 *     DispatchError when SDK returns a non-success result subtype.
 *
 * No streaming (CONTEXT.md D-19): output is full assistant text after loop completes.
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'node:child_process';
import { resolveModel } from './models.js';
import { DispatchError, LicenseKeyError } from './errors.js';

export interface DispatchOptions {
  /** Model alias ('haiku' | 'sonnet' | 'opus') or full Anthropic model ID. */
  model: 'haiku' | 'sonnet' | 'opus' | string;
  /** User prompt text sent to the agent. */
  prompt: string;
  /** Optional system prompt appended to the preset. */
  system?: string;
  /** Optional tools — SDK-native Tool[] pass-through (D-20). */
  tools?: unknown[];
  /** Optional AbortSignal; dispatcher bridges to SDK AbortController. */
  signal?: AbortSignal;
  /**
   * Optional caller-provided session ID. Accepted for caller convenience and
   * logging/correlation, but NOT forwarded to SDK options (D-31).
   */
  session_id?: string;
}

/**
 * A tool_use block extracted from an assistant message. Populated when the
 * caller passes `tools` and the model chooses to invoke one of them.
 *
 * Phase 36 depends on this for structured observation extraction — the Stop
 * hook reads `result.toolUses[0].input` after calling `dispatchAgent` with
 * `tools: [emitObservationsTool]`.
 */
export interface ToolUseBlock {
  id: string;
  name: string;
  input: unknown;
}

export interface DispatchResult {
  /** Concatenated assistant text output across all assistant messages. */
  output: string;
  /** Token usage from SDK's terminal result event. */
  tokens: { input: number; output: number };
  /** Cost in USD from SDK's total_cost_usd field. */
  cost_usd: number;
  /**
   * Tool-use blocks emitted by the assistant (in emit order). Empty array
   * when the caller passed no tools or the model emitted no tool calls.
   */
  toolUses: ToolUseBlock[];
}

/**
 * Bridge a caller-provided AbortSignal to the SDK's expected AbortController.
 * Returns undefined if no signal is provided.
 */
function signalToAbortController(signal?: AbortSignal): AbortController | undefined {
  if (!signal) return undefined;
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort(signal.reason);
  } else {
    signal.addEventListener(
      'abort',
      () => controller.abort(signal.reason),
      { once: true },
    );
  }
  return controller;
}

/**
 * Dispatch a prompt to the Anthropic agent loop via @anthropic-ai/claude-agent-sdk.
 *
 * Consumes the SDK's async iterator to completion (no `break` — Pitfall 2 mitigation)
 * aggregating assistant text output and extracting token usage + cost from the
 * terminal `result` event.
 *
 * @throws LicenseKeyError when ANTHROPIC_API_KEY is not set.
 * @throws DispatchError when the SDK returns a non-success result (max_turns / execution error).
 * @throws any error the SDK itself throws (network, model access, invalid input) — caller wraps.
 */
export async function dispatchAgent(opts: DispatchOptions): Promise<DispatchResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Fallback: when running inside Claude Code (OAuth session), use `claude -p`
    // subprocess which inherits the session auth. No API key needed.
    if (isInsideClaudeCode()) {
      return dispatchViaClaude(opts);
    }
    throw new LicenseKeyError();
  }

  const resolvedModel = resolveModel(opts.model);
  const abortController = signalToAbortController(opts.signal);

  const iterator = query({
    prompt: opts.prompt,
    options: {
      model: resolvedModel,
      systemPrompt: opts.system
        ? { type: 'preset', preset: 'claude_code', append: opts.system }
        : undefined,
      abortController,
      // tools pass-through per D-20; SDK's Tool[] type opaque to @cds/core
      ...(opts.tools ? { tools: opts.tools as never } : {}),
    } as never,
    // (Cast to `never` used at SDK boundary where SDK .d.ts may not expose
    // every option shape; tightens when SDK types stabilize.)
  });

  const textParts: string[] = [];
  const toolUses: ToolUseBlock[] = [];
  let tokens = { input: 0, output: 0 };
  let cost_usd = 0;

  // CRITICAL (Pitfall 2): iterate to completion; NEVER break early.
  for await (const msg of iterator as AsyncIterable<SDKMessage>) {
    if (msg.type === 'assistant') {
      const content = (msg as { message?: { content?: unknown[] } }).message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as {
            type?: string;
            text?: string;
            id?: string;
            name?: string;
            input?: unknown;
          };
          if (b.type === 'text' && typeof b.text === 'string') {
            textParts.push(b.text);
          } else if (
            b.type === 'tool_use' &&
            typeof b.id === 'string' &&
            typeof b.name === 'string'
          ) {
            toolUses.push({ id: b.id, name: b.name, input: b.input });
          }
        }
      }
    } else if (msg.type === 'result') {
      const r = msg as {
        subtype?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
        total_cost_usd?: number;
      };
      if (r.subtype === 'success') {
        tokens = {
          input: r.usage?.input_tokens ?? 0,
          output: r.usage?.output_tokens ?? 0,
        };
        cost_usd = r.total_cost_usd ?? 0;
      } else {
        throw new DispatchError(
          `Agent returned non-success result: ${r.subtype ?? 'unknown'}`,
          msg,
        );
      }
    }
    // Other message types (system, user, tool_use, tool_result) are
    // intentionally ignored at the dispatcher boundary — the SDK handles
    // the inner loop. We only care about aggregating assistant text + the
    // terminal result event.
  }

  return { output: textParts.join(''), tokens, cost_usd, toolUses };
}

/**
 * Detect if we're running inside a Claude Code session.
 * Claude Code sets CLAUDE_SESSION_ID for child processes spawned by tools.
 */
function isInsideClaudeCode(): boolean {
  return !!(process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_PROJECT_DIR);
}

/**
 * Fallback dispatcher using `claude -p` subprocess — inherits Claude Code's
 * session auth (OAuth). Used when ANTHROPIC_API_KEY is absent but we're inside
 * a Claude Code session.
 *
 * Output is plain text (no structured tokens/cost — those aren't available
 * from `claude -p`). cost_usd defaults to 0.
 */
async function dispatchViaClaude(opts: DispatchOptions): Promise<DispatchResult> {
  const model = resolveModel(opts.model);
  const args = ['-p', '--model', model, '--output-format', 'text'];
  if (opts.system) {
    args.push('--system-prompt', opts.system);
  }

  try {
    const output = execFileSync('claude', args, {
      input: opts.prompt,
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      output: output.trim(),
      tokens: { input: 0, output: 0 },
      cost_usd: 0,
      toolUses: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DispatchError(`claude -p subprocess failed: ${msg}`, err);
  }
}
