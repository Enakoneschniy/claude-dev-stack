/**
 * ADR Bridge (session) — extracts architectural decisions from a Claude Code
 * session JSONL transcript via a Haiku subprocess call and writes them as
 * standardized ADR files in `vault/projects/{project}/decisions/`.
 *
 * Phase 26 / ADR-02. Complements lib/adr-bridge.mjs (which extracts decisions
 * from GSD CONTEXT.md files). This module handles the "any session" case.
 *
 * Design guarantees:
 *   - Fail-open (D-06): any error is captured into `{error}` and no files are
 *     written. The caller (SKILL.md /end bash block) treats a non-JSON or
 *     non-zero exit as a silent skip. /end never blocks.
 *   - Idempotent via topic match (D-07, D-08): duplicate topics update the
 *     existing ADR and append a Superseded note.
 *   - Fresh numbering (D-09) via `nextAdrNumber` reuse from adr-bridge.mjs.
 *   - YAML frontmatter format (D-10) with `source:` block (D-11).
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { nextAdrNumber, atomicWrite } from './adr-bridge.mjs';

// ── Constants ─────────────────────────────────────────────────────

const MAX_TRANSCRIPT_CHARS = 600_000;
const HAIKU_TIMEOUT_MS = 60_000;
const PROJECT_NAME_TRAVERSAL_RE = /[/\\]|\.\./;
const TOPIC_SANITIZE_RE = /[^a-z0-9-]/g;

// ── extractTranscriptText ─────────────────────────────────────────

/**
 * Read a Claude Code session JSONL transcript and return a single string
 * containing user + assistant text entries.
 *
 * Filters:
 *   - skips non-user/non-assistant types (attachment, system, permission-mode, ...)
 *   - skips `isSidechain: true` entries (subagent transcripts)
 *
 * For assistant entries with array `content`, only `{type:"text", text}` parts
 * are included — thinking/tool_use blocks are skipped.
 *
 * Tail-truncates to `maxChars` when the concatenated text exceeds it. Truncation
 * from the HEAD so the most recent exchanges (likely where decisions were made)
 * are preserved.
 */
export function extractTranscriptText(jsonlPath, maxChars = MAX_TRANSCRIPT_CHARS) {
  if (!jsonlPath || !existsSync(jsonlPath)) return '';
  let raw;
  try { raw = readFileSync(jsonlPath, 'utf8'); } catch { return ''; }
  const parts = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.isSidechain === true) continue;
    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    const msg = obj.message;
    if (!msg || typeof msg !== 'object') continue;
    const content = msg.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      const textParts = [];
      for (const part of content) {
        if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
          textParts.push(part.text);
        }
      }
      text = textParts.join('\n');
    }
    if (!text) continue;
    parts.push(`[${obj.type}]: ${text}`);
  }
  const joined = parts.join('\n\n');
  if (joined.length <= maxChars) return joined;
  // Tail-truncate: keep last `maxChars` characters so most recent exchange is preserved.
  return joined.slice(joined.length - maxChars);
}

// ── parseHaikuResponse ────────────────────────────────────────────

/**
 * Extract the `<decisions>{json}</decisions>` block from raw Haiku output.
 * Never throws — returns `{ decisions: [] }` for any parse failure.
 */
export function parseHaikuResponse(rawOutput) {
  if (typeof rawOutput !== 'string') return { decisions: [] };
  const m = rawOutput.match(/<decisions>([\s\S]*?)<\/decisions>/);
  if (!m) return { decisions: [] };
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed || !Array.isArray(parsed.decisions)) return { decisions: [] };
    return parsed;
  } catch {
    return { decisions: [] };
  }
}

// ── sanitizeTopicSlug ─────────────────────────────────────────────

function sanitizeTopicSlug(topic) {
  if (topic == null) return null;
  const slug = String(topic)
    .toLowerCase()
    .replace(TOPIC_SANITIZE_RE, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.length ? slug : null;
}

// ── topicMatchesExistingAdr ───────────────────────────────────────

/**
 * Scan `decisionsDir` for an ADR matching `topic`. Two strategies:
 *   1. New-format: parse YAML frontmatter `topic: <slug>` line.
 *   2. Old-format: filename substring match (strip `NNNN-` prefix + `.md`).
 *
 * Returns `{ matched:true, filePath, isOldFormat }` on match, else `{ matched:false }`.
 */
export function topicMatchesExistingAdr(topic, decisionsDir) {
  if (!topic || !existsSync(decisionsDir)) return { matched: false };
  let files;
  try { files = readdirSync(decisionsDir).filter((f) => f.endsWith('.md')); }
  catch { return { matched: false }; }

  for (const file of files) {
    const fp = join(decisionsDir, file);
    let content;
    try { content = readFileSync(fp, 'utf8'); } catch { continue; }

    // New-format: frontmatter block between first two '---' lines
    if (content.startsWith('---\n')) {
      const second = content.indexOf('\n---', 4);
      if (second !== -1) {
        const fm = content.slice(4, second);
        const topicLine = fm.split('\n').find((l) => /^topic:\s*/.test(l));
        if (topicLine) {
          const val = topicLine.replace(/^topic:\s*/, '').trim();
          if (val === topic) return { matched: true, filePath: fp, isOldFormat: false };
        }
      }
    }

    // Old-format fallback: filename match.
    // Only consider filename-substring matches when the stem is meaningful
    // (>= 4 chars) to avoid false positives like 'c' matching 'new-topic'.
    const fnameStem = file.replace(/^\d+-/, '').replace(/\.md$/, '');
    const minLen = 4;
    const exact = fnameStem === topic;
    const substr = fnameStem.length >= minLen && topic.length >= minLen &&
      (fnameStem.includes(topic) || topic.includes(fnameStem));
    if (exact || substr) {
      // If we already saw frontmatter above and it didn't match, this file's
      // frontmatter wins (don't supersede based on filename when frontmatter disagrees).
      const isOld = !content.startsWith('---\n');
      return { matched: true, filePath: fp, isOldFormat: isOld };
    }
  }
  return { matched: false };
}

// ── buildAdrBody ──────────────────────────────────────────────────

function buildAdrBody({
  number, topic, title, date, sessionLogPath, commit,
  haikuContext, haikuDecision, haikuConsequences, confidence,
}) {
  const padded = String(number).padStart(4, '0');
  const status = confidence === 'medium' ? 'proposed' : 'accepted';

  let frontmatter = `---\nid: ${padded}\ntopic: ${topic}\nstatus: ${status}\ndate: ${date}\nsource:\n  session_log: ${sessionLogPath}\n`;
  if (commit) frontmatter += `  commit: ${commit}\n`;
  frontmatter += `---\n\n`;

  return frontmatter +
    `# ADR ${padded}: ${title}\n\n` +
    `## Context\n\n${haikuContext}\n\n` +
    `## Decision\n\n${haikuDecision}\n\n` +
    `## Consequences\n\n${haikuConsequences}\n`;
}

// ── appendSupersedeNote ───────────────────────────────────────────

/**
 * Given existing ADR file content and the new decision, return updated content:
 *   - If content is new-format (frontmatter present): append a "Superseded by ..."
 *     block to the Consequences section.
 *   - If content is old-format: rewrite entirely as new-format (promoting the
 *     old ADR) with the original title/number preserved.
 */
function appendSupersedeNote(existingContent, {
  filename, haikuContext, haikuDecision, haikuConsequences,
  date, topic, confidence, sessionLogPath, commit,
}) {
  const isNewFormat = existingContent.startsWith('---\n');
  if (isNewFormat) {
    // Append to Consequences section.
    const supersedeBlock = `\n\n---\n**Superseded by revision on ${date}** (topic: ${topic}, confidence: ${confidence})\n\n${haikuConsequences}\n`;
    // If the file has a Consequences section, append to it; else append a new one at end.
    if (/## Consequences\n/.test(existingContent)) {
      return existingContent.replace(/\s*$/, '') + supersedeBlock;
    }
    return existingContent.replace(/\s*$/, '') + `\n\n## Consequences\n${supersedeBlock}`;
  }

  // Old-format promotion: extract number from filename NNNN-slug.md
  const numMatch = filename.match(/^(\d+)-/);
  const number = numMatch ? parseInt(numMatch[1], 10) : 1;
  const padded = String(number).padStart(4, '0');
  // Try to keep original title heading if present
  const titleMatch = existingContent.match(/^#\s*ADR[- ]?\d+:\s*(.+)$/m);
  const originalTitle = titleMatch ? titleMatch[1].trim() : topic;

  let frontmatter = `---\nid: ${padded}\ntopic: ${topic}\nstatus: accepted\ndate: ${date}\nsource:\n  session_log: ${sessionLogPath}\n`;
  if (commit) frontmatter += `  commit: ${commit}\n`;
  frontmatter += `---\n\n`;

  return frontmatter +
    `# ADR ${padded}: ${originalTitle}\n\n` +
    `## Context\n\n${haikuContext}\n\n` +
    `## Decision\n\n${haikuDecision}\n\n` +
    `## Consequences\n\n` +
    `---\n**Superseded by revision on ${date}** (topic: ${topic}, confidence: ${confidence})\n\n` +
    `${haikuConsequences}\n`;
}

// ── buildExtractionPrompt ─────────────────────────────────────────

function buildExtractionPrompt(transcript) {
  return `You are an ADR (Architectural Decision Record) extractor. Scan the session
transcript below and identify ARCHITECTURAL decisions — choices that affect the
codebase structure, dependencies, APIs, data models, or significant workflows.

DO NOT extract:
  - minor code fixes or one-off bug patches (unless they introduce architectural change)
  - conversational pleasantries, status updates, questions, clarifications
  - TODO items or pending choices that weren't committed to

Respond with EXACTLY this format and nothing else:

<decisions>{"decisions":[{"topic":"kebab-case-slug","title":"Human-readable title","context":"Why it came up (1–3 sentences)","decision":"What was chosen","consequences":"Tradeoffs / follow-ups","confidence":"high|medium|low"}]}</decisions>

If NO architectural decisions were made, respond with:
<decisions>{"decisions":[]}</decisions>

Use "high" only when the decision was explicitly confirmed ("let's do X", "decision made", "shipping it"). Use "medium" when the intent is clear but not final. Use "low" for hypothetical or deferred.

SESSION TRANSCRIPT:
${transcript}
`;
}

// ── callHaikuDefault ──────────────────────────────────────────────

function callHaikuDefault(prompt) {
  const args = ['-p', '--model', 'haiku', '--output-format', 'text'];
  const tryBinaries = ['claude'];
  if (process.env.CLAUDE_CODE_EXECPATH) tryBinaries.push(process.env.CLAUDE_CODE_EXECPATH);

  let lastErr;
  for (const bin of tryBinaries) {
    try {
      const out = execFileSync(bin, args, {
        input: prompt,
        encoding: 'utf8',
        timeout: HAIKU_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return out;
    } catch (err) {
      lastErr = err;
      if (err && err.code === 'ENOENT') continue;
      throw err;
    }
  }
  throw lastErr || new Error('claude binary not found');
}

// ── resolveTranscriptPath ─────────────────────────────────────────

function slugifyCwdForClaudeProjects(cwd) {
  // Claude Code names project dirs by replacing '/' with '-' (preserved leading '-').
  // e.g., /Users/foo/repo -> -Users-foo-repo
  return cwd.replace(/[/]/g, '-');
}

function resolveTranscriptPath({ transcriptPath, cwd, sessionId }) {
  if (transcriptPath && existsSync(transcriptPath)) return transcriptPath;
  if (!cwd) return null;
  const projectsDir = join(homedir(), '.claude', 'projects', slugifyCwdForClaudeProjects(cwd));
  if (!existsSync(projectsDir)) return null;
  if (sessionId) {
    const candidate = join(projectsDir, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  // Fallback: most-recent-mtime .jsonl
  let files;
  try { files = readdirSync(projectsDir).filter((f) => f.endsWith('.jsonl')); }
  catch { return null; }
  if (!files.length) return null;
  files.sort((a, b) => statSync(join(projectsDir, b)).mtimeMs - statSync(join(projectsDir, a)).mtimeMs);
  return join(projectsDir, files[0]);
}

// ── bridgeSession ─────────────────────────────────────────────────

export async function bridgeSession({
  transcriptPath,
  cwd,
  sessionId,
  vaultPath,
  projectName,
  sessionLogPath,
  callHaiku,
  now = new Date(),
} = {}) {
  const newAdrs = [];
  const superseded = [];
  try {
    if (!projectName || PROJECT_NAME_TRAVERSAL_RE.test(projectName)) {
      return { newAdrs, superseded, error: `invalid projectName: ${projectName}` };
    }
    if (!vaultPath || !existsSync(vaultPath)) {
      return { newAdrs, superseded, error: 'vault path not found' };
    }

    const decisionsDir = join(vaultPath, 'projects', projectName, 'decisions');
    mkdirSync(decisionsDir, { recursive: true });

    const jsonlPath = resolveTranscriptPath({ transcriptPath, cwd, sessionId });
    if (!jsonlPath) return { newAdrs, superseded, error: 'transcript not found' };

    const transcript = extractTranscriptText(jsonlPath);
    if (!transcript) return { newAdrs, superseded, error: 'empty transcript' };

    const prompt = buildExtractionPrompt(transcript);
    const haikuFn = callHaiku || callHaikuDefault;
    let raw;
    try {
      raw = await haikuFn(prompt);
    } catch (err) {
      return { newAdrs, superseded, error: err && err.message ? err.message : String(err) };
    }

    const parsed = parseHaikuResponse(raw);
    if (!parsed.decisions.length) {
      // Distinguish "no decisions at all" from "malformed output". Raw with no
      // `<decisions>` tag means something went wrong; an empty decisions array
      // inside a valid tag means the transcript truly had nothing.
      if (!/<decisions>[\s\S]*<\/decisions>/.test(raw || '')) {
        return { newAdrs, superseded, error: 'malformed haiku response (no <decisions> block)' };
      }
      return { newAdrs, superseded, error: null };
    }

    // Resolve commit (best-effort)
    let commit = null;
    try {
      const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: cwd || process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (out) commit = out;
    } catch { /* omit */ }

    const date = now.toISOString().slice(0, 10);

    // In-memory counter so consecutive new ADRs in one call get distinct numbers.
    let counter = nextAdrNumber(decisionsDir);
    for (const dec of parsed.decisions) {
      const conf = (dec.confidence || '').toLowerCase();
      if (conf === 'low') continue;
      const topic = sanitizeTopicSlug(dec.topic);
      if (!topic) continue;

      const title = String(dec.title || topic);
      const haikuContext = String(dec.context || '');
      const haikuDecision = String(dec.decision || '');
      const haikuConsequences = String(dec.consequences || '');

      const match = topicMatchesExistingAdr(topic, decisionsDir);
      if (match.matched) {
        const existing = readFileSync(match.filePath, 'utf8');
        const updated = appendSupersedeNote(existing, {
          filename: basename(match.filePath),
          haikuContext, haikuDecision, haikuConsequences,
          date, topic, confidence: conf, sessionLogPath, commit,
        });
        atomicWrite(match.filePath, updated);
        const numMatch = basename(match.filePath).match(/^(\d+)-/);
        const num = numMatch ? parseInt(numMatch[1], 10) : 0;
        superseded.push({ number: num, topic, path: match.filePath });
      } else {
        const number = counter++;
        const padded = String(number).padStart(4, '0');
        const body = buildAdrBody({
          number, topic, title, date, sessionLogPath, commit,
          haikuContext, haikuDecision, haikuConsequences, confidence: conf,
        });
        const outPath = join(decisionsDir, `${padded}-${topic}.md`);
        atomicWrite(outPath, body);
        newAdrs.push({ number, topic, title, path: outPath });
      }
    }

    return { newAdrs, superseded, error: null };
  } catch (err) {
    return { newAdrs, superseded, error: err && err.message ? err.message : String(err) };
  }
}

// ── CLI entrypoint ────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session-log') out.sessionLogPath = argv[++i];
    else if (a === '--cwd') out.cwd = argv[++i];
    else if (a === '--session-id') out.sessionId = argv[++i];
    else if (a === '--transcript') out.transcriptPath = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vaultPath = process.env.VAULT_PATH;
  const projectName = process.env.CDS_PROJECT_NAME;
  const result = await bridgeSession({
    transcriptPath: args.transcriptPath || null,
    cwd: args.cwd || process.cwd(),
    sessionId: args.sessionId || null,
    vaultPath,
    projectName,
    sessionLogPath: args.sessionLogPath || '',
  });
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.log(JSON.stringify({ newAdrs: [], superseded: [], error: err.message || String(err) }));
    process.exit(0);
  });
}
