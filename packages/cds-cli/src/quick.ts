// packages/cds-cli/src/quick.ts
// /cds-quick CLI body — one-shot agent dispatch with cost reporting + standalone capture.
// Source: .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §D-112
import { dispatchAgent, CostTracker, resolveModel } from '@cds/core';
import crypto from 'node:crypto';
import { captureStandalone } from './capture-standalone.js';

export interface QuickFlags {
  json: boolean;
  model: string;
  maxCost?: number;
}

function extractValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

export function parseFlags(args: string[]): QuickFlags {
  const maxCostRaw = extractValue(args, '--max-cost');
  return {
    json: args.includes('--json'),
    model: extractValue(args, '--model') ?? 'haiku',
    maxCost: maxCostRaw !== undefined ? Number(maxCostRaw) : undefined,
  };
}

function printUsage(): void {
  const lines = [
    'Usage: claude-dev-stack quick "<task>" [flags]',
    '',
    'Flags:',
    '  --json              Emit machine-readable JSON { output, cost, sessionId }',
    '  --model <name>      Override model (haiku, sonnet, opus); default: haiku',
    '  --max-cost <usd>    Soft cap in USD (warning only, not enforced)',
    '',
    'Example: claude-dev-stack quick "summarize current planning state"',
  ];
  console.error(lines.join('\n'));
}

export async function main(args: string[]): Promise<void> {
  const task = args[0];
  if (!task || task.startsWith('-')) {
    printUsage();
    process.exit(1);
  }

  const opts = parseFlags(args.slice(1));
  const sessionId = process.env.CLAUDE_SESSION_ID ?? crypto.randomUUID();
  const tracker = new CostTracker(sessionId);

  let result: { output: string; tokens: { input: number; output: number }; stop_reason: string };
  try {
    result = await dispatchAgent({
      model: opts.model,
      prompt: task,
      session_id: sessionId,
    });
    // Use the resolved model name so CostTracker can find it in the pricing table.
    // (CostTracker throws UnknownModelError for aliases like 'haiku'; it needs the
    // full model ID like 'claude-haiku-4-5' which resolveModel returns.)
    tracker.record({ model: resolveModel(opts.model), tokens: result.tokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`dispatch error: ${msg}`);
    process.exit(1);
  }

  // Standalone mode: no Claude Code Stop hook will fire. Trigger capture manually.
  if (!process.env.CLAUDE_SESSION_ID) {
    try {
      await captureStandalone({
        task,
        output: result.output,
        sessionId,
        projectPath: process.cwd(),
      });
    } catch {
      // Fail-silent (matches Phase 36 D-66 behavior)
    }
  }

  const cost = tracker.total();
  if (opts.json) {
    console.log(JSON.stringify({ output: result.output, cost, sessionId }));
  } else {
    console.log(result.output);
    console.log(`\n── cost: $${cost.cost_usd.toFixed(4)} · session: ${sessionId}`);
  }
}
