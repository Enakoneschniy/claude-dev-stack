---
name: cds-quick
description: |
  Run a quick one-shot task via the Claude Agent SDK and auto-capture the session to SQLite.
  Single-dispatch agent run (no multi-turn). Returns a structured result summary with cost
  and session ID. For multi-turn work, use Claude Code normally instead of /cds-quick.
trigger_phrases:
  - /cds-quick
  - cds-quick
  - quick task:
---

# /cds-quick — One-shot agent dispatch with cost reporting

**Task:** $ARGUMENTS

Run the quick CLI and capture its JSON output. Use the Bash tool:

```bash
claude-dev-stack quick "$ARGUMENTS" --json
```

Parse the JSON output. It has three fields:

- `output` — the agent's text response. Display this verbatim to the user, preserving
  formatting. Do not paraphrase.
- `cost` — an object `{ cost_usd: number, tokens: { input: number, output: number } }`.
  Format as a short footer line:
  `── cost: $<cost_usd to 4 decimals> · input <input> tokens · output <output> tokens`
- `sessionId` — a UUID. Display as: `session: <uuid>`

## Output format

Show the response to the user as:

```
<output field verbatim>

── cost: $0.0041 · input 50 tokens · output 25 tokens · session: abc-123
```

## Capture behavior

When this skill runs inside Claude Code, session auto-capture fires on the next session-end
via the Stop hook (`~/.claude/hooks/session-end-capture.sh`, installed by the
`claude-dev-stack` wizard). **Do NOT trigger capture manually** from this skill body.
The capture writes structured observations to `~/vault/projects/<project>/sessions.db` and
makes them queryable via the `sessions.search` MCP tool.

## When to use vs not

Use `/cds-quick` for:
- Short one-shot questions that don't need follow-up ("summarize X", "what's in this file",
  "draft a commit message")
- Cost-conscious prompts where Haiku is sufficient
- Demoing the claude-dev-stack pipeline end-to-end

Do NOT use for:
- Multi-turn debugging conversations (use Claude Code normally)
- Code edits that need file context (use Claude Code with the Edit/Write tools)
- Long-running analysis that benefits from tool use (use the full agent loop)

## Alpha notes

This skill is part of `claude-dev-stack@1.0.0-alpha.1`. Feedback welcomed at
[github.com/Enakoneschniy/claude-dev-stack/issues](https://github.com/Enakoneschniy/claude-dev-stack/issues).
