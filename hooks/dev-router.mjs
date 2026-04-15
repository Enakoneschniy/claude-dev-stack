#!/usr/bin/env node
/**
 * hooks/dev-router.mjs — UserPromptSubmit hook (SKL-01)
 *
 * Replaces the dev-router skill. Reads JSON payload from stdin, regex-matches
 * dev/research/session/end keywords against payload.prompt, and writes a short
 * routing hint (≤200 chars) to stdout. Claude Code prepends that text to the
 * model's context as additionalContext.
 *
 * Design:
 *   - Fail-silent (exit 0, no stdout) on empty stdin / malformed JSON / missing key
 *   - No npm dependencies
 *   - ReDoS-safe: simple anchored alternations, no nested quantifiers
 *   - Hard length cap (4096 chars) before regex testing — prevents pathological input
 *
 * NOTE ON CYRILLIC:
 *   JavaScript's `\b` word-boundary is ASCII-only — it treats Cyrillic letters as
 *   non-word characters, so `\bсделай\b` does NOT behave like `\bfix\b` does for
 *   English. We use:
 *     - ASCII keywords: `/\b(build|fix|...)\b/i` (standard word boundary)
 *     - Cyrillic keywords: `/(^|[\s.,!?;:()"'])(сделай|исправь|...)($|[\s.,!?;:()"'])/i`
 *       (explicit boundary class — start-of-string, end-of-string, or punctuation/whitespace)
 */

const MAX_PROMPT_LEN = 4096;

// ── ASCII keyword groups ──────────────────────────────────────────
const DEV_ASCII = /\b(build|implement|fix|refactor|deploy|ship|plan|phase|hotfix)\b/i;
const RESEARCH_ASCII = /\b(research|compare|investigate|what options|check docs)\b/i;
const SESSION_ASCII = /\b(resume|handoff|what did we do|where stopped|continue where)\b/i;
const END_ASCII = /\b(done|end|finish)\b/i;

// ── Cyrillic keyword groups (explicit word-boundary class) ────────
const CYR_BOUNDARY = "(?:^|[\\s.,!?;:()\"'«»—-])";
const CYR_TAIL = "(?:$|[\\s.,!?;:()\"'«»—-])";

const DEV_CYR = new RegExp(
  `${CYR_BOUNDARY}(сделай|исправь|рефактори|деплой|внедри|внедрить|почини|запили|реализуй|сделать)${CYR_TAIL}`,
  'i'
);
const RESEARCH_CYR = new RegExp(
  `${CYR_BOUNDARY}(исследуй|сравни|по документации|по докам)${CYR_TAIL}`,
  'i'
);
const SESSION_CYR = new RegExp(
  `${CYR_BOUNDARY}(продолжи|что делали|где остановились|передай контекст)${CYR_TAIL}`,
  'i'
);
const END_CYR = new RegExp(
  `${CYR_BOUNDARY}(всё|хватит|на сегодня)${CYR_TAIL}`,
  'i'
);

async function main() {
  let payload;
  try {
    const chunks = [];
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      process.stdin.on('data', (c) => chunks.push(c));
      process.stdin.on('end', () => { clearTimeout(timer); resolve(); });
      process.stdin.on('error', () => { clearTimeout(timer); resolve(); });
    });
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return;
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
  if (!prompt) return;

  // ReDoS guard: truncate very long input before regex testing (T-31-04)
  const text = prompt.length > MAX_PROMPT_LEN ? prompt.slice(0, MAX_PROMPT_LEN) : prompt;

  // Priority order: dev > research > session > end
  // (dev is most actionable; other categories emit only when no dev keyword matched)
  if (DEV_ASCII.test(text) || DEV_CYR.test(text)) {
    process.stdout.write(
      'ROUTING HINT: dev keyword detected — consider GSD (/gsd:quick for small, /gsd-plan-phase for multi-file). Skip if user already named a tool.'
    );
    return;
  }
  if (RESEARCH_ASCII.test(text) || RESEARCH_CYR.test(text)) {
    process.stdout.write(
      'ROUTING HINT: research keyword detected — consider the deep-research skill for multi-source synthesis. Skip if user already chose a tool.'
    );
    return;
  }
  if (SESSION_ASCII.test(text) || SESSION_CYR.test(text)) {
    process.stdout.write(
      'ROUTING HINT: session-resume keyword detected — context already loaded at SessionStart. Offer brief status from last TODO.'
    );
    return;
  }
  if (END_ASCII.test(text) || END_CYR.test(text)) {
    process.stdout.write(
      'ROUTING HINT: session-end keyword detected — run /end (session-manager skill) to log the session and update context.md.'
    );
    return;
  }
  // No match → silent
}

main().catch(() => {}).finally(() => process.exit(0));
