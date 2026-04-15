# Phase 26 Wave 0 — `claude -p` subprocess contract

**Purpose.** Resolve the open questions from plan 26-01 (Haiku invocation shape, fallback
binary, JSONL field layout) so Plans 01 implementation and Plan 03 SKILL.md wiring can
hard-code the right flags.

## Confirmed flags

Verified with `claude --help` (Claude Code 2.1.104) on 2026-04-15:

| Flag                    | Supported | Notes                                                                                   |
| ----------------------- | --------- | --------------------------------------------------------------------------------------- |
| `-p` / `--print`        | yes       | non-interactive one-shot mode                                                           |
| `--model <name>`        | yes       | accepts aliases like `haiku`, `sonnet`, `opus` or full IDs (`claude-haiku-4-5-20251001`) |
| `--output-format text`  | yes (default) | raw stdout — what the bridge uses (we extract `<decisions>…</decisions>` with regex)  |
| `--output-format json`  | yes       | envelope with `{result, session_id, usage, …}`; the model's answer lives in `result`    |
| `--bare`                | yes       | skips hooks, CLAUDE.md auto-discovery, LSP — recommended for bridge to avoid recursion  |
| `--max-tokens`          | **NO**    | not a top-level flag; tokens are controlled by model defaults                           |
| `--session-id <uuid>`   | yes       | used by caller; bridge does NOT spawn with this — we only READ the caller's JSONL       |
| `--dangerously-skip-permissions` | yes | not required for `-p` since no tools are invoked                                       |

**Canonical bridge invocation (text mode):**

```bash
claude -p --model haiku --bare
```

Prompt is piped to stdin via `execFileSync(..., { input: prompt })`. The bridge
reads raw stdout and extracts the `<decisions>…</decisions>` block. No JSON wrapper
parsing needed in text mode — keeps parsing simple and matches the Haiku schema
defined in 26-01 `<interfaces>`.

**Rationale for `--bare`:** Avoids re-triggering SessionStart hooks / skills / CLAUDE.md
discovery inside the subprocess. The subprocess is a pure LLM call — no tool use needed.

## Live sanity invocation (2026-04-15)

```
echo "Reply with ONLY: <decisions>{\"decisions\":[]}</decisions>" | \
  claude -p --model haiku --output-format json
```

Exit code: `0`. Duration: `~5.5s`. The `result` field contained exactly
`<decisions>{"decisions":[]}</decisions>` — confirms Haiku can be constrained to the
tagged envelope and that parseHaikuResponse's regex extraction works against both
text and json output modes (in json mode we'd extract from `JSON.parse(stdout).result`;
we choose text mode for simplicity).

## Fallback binary path

`which claude` resolves to `/Applications/cmux.app/Contents/Resources/bin/claude` on this
machine (cmux overlay). `CLAUDE_CODE_EXECPATH` is NOT set by default in the shell the
SKILL.md bash block inherits, but **it IS set inside Claude Code subprocesses** — when
SKILL.md bash runs, `CLAUDE_CODE_EXECPATH` points to the same binary.

Fallback ladder for `callHaikuDefault` in `lib/adr-bridge-session.mjs`:

1. Try `claude` on PATH (what the user has).
2. On ENOENT, try `$CLAUDE_CODE_EXECPATH` (set inside Claude Code sessions).
3. On second ENOENT → throw; bridgeSession catches and returns fail-open `{error}`.

No hardcoded paths.

## Fixture notes

`tests/fixtures/session-transcript-sample.jsonl` contains 6 lines:

1. `type: "permission-mode"` — non-message metadata; `extractTranscriptText` skips.
2. `type: "user"`, `isSidechain: false`, string `content` — includes in transcript.
3. `type: "assistant"`, `isSidechain: false`, array `content` with `{type:"text"}` — includes.
4. `type: "user"`, `isSidechain: true` — **filtered out** by the bridge (test 9 asserts this).
5. `type: "system"` — skipped (not user/assistant).
6. `type: "user"`, `isSidechain: false` — included.

The transcript explicitly mentions "use pino for structured logging … decision made"
so mocked Haiku tests can claim to have extracted a `logging-strategy` decision from it
and the extraction context makes semantic sense.

UUIDs and session IDs are deterministic placeholders (no real session data). `cwd` is
`/tmp/project` to avoid looking like real host state.

## JSONL field layout (real Claude Code 2.1.104)

Verified against a real session log:

- `user` entries: `{type:"user", message:{role:"user", content: string}, isSidechain, ...}`.
  `content` is a plain string for user-typed prompts.
- `assistant` entries: `{type:"assistant", message:{role:"assistant", content: [{type:"text"|"thinking"|"tool_use", ...}]}, ...}`.
  `content` is an ARRAY — bridge must iterate and pick `type:"text"` entries.
- `attachment`, `permission-mode`, `system` — non-message metadata; skip.
- `isSidechain:true` flags subagent transcripts; skip (per plan truth #4 of 26-01).

## Open items / deferred

- **No `--max-tokens` flag.** Model defaults control output length (Haiku 4.5 max
  output is 32000). The bridge does NOT need explicit max-tokens — transcript cap
  `maxChars=600_000` bounds input; Haiku's own limit bounds output.
- `--session-id` is for the CALLER's session, not the bridge. The bridge always
  starts a fresh isolated one-shot; there's no re-entrancy.
