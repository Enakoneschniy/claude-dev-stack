---
name: cds-quick
description: |
  Run a quick one-shot task using a fast model (Haiku). Single-dispatch,
  no multi-turn. For complex work, use Claude Code normally instead.
trigger_phrases:
  - /cds-quick
  - cds-quick
  - quick task:
---

# /cds-quick — One-shot quick task

Execute this task using the Agent tool with Haiku model. Do NOT use Bash.

```
Agent({
  description: "cds-quick one-shot task",
  model: "haiku",
  prompt: "$ARGUMENTS"
})
```

Display the agent's response verbatim to the user. Do not paraphrase or summarize.

## When to use vs not

Use `/cds-quick` for:
- Short one-shot questions that don't need follow-up
- Cost-conscious prompts where Haiku is sufficient
- Quick lookups, summaries, drafts

Do NOT use for:
- Multi-turn debugging (use Claude Code normally)
- Code edits requiring file context (use Edit/Write tools directly)
- Tasks that need tools (Haiku agent has no tool access)
