/**
 * Analytics — session statistics, context quality, stale detection.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, SKILLS_DIR, CLAUDE_DIR } from './shared.mjs';
import { findVault } from './projects.mjs';
import { readManifest } from './notebooklm-manifest.mjs';
import { readQueryStats } from './notebooklm-stats.mjs';

// ── Session stats ────────────────────────────────────────────────
function getSessionStats(vaultPath) {
  const projectsDir = join(vaultPath, 'projects');
  if (!existsSync(projectsDir)) return [];

  const projects = readdirSync(projectsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template');

  return projects.map(p => {
    const dir = join(projectsDir, p.name);
    const sessionsDir = join(dir, 'sessions');
    const decisionsDir = join(dir, 'decisions');

    const sessions = existsSync(sessionsDir)
      ? readdirSync(sessionsDir).filter(f => f.endsWith('.md'))
      : [];

    const decisions = existsSync(decisionsDir)
      ? readdirSync(decisionsDir).filter(f => f.endsWith('.md'))
      : [];

    // Analyze session dates
    let lastSession = null;
    let firstSession = null;
    const sessionDates = [];

    for (const file of sessions) {
      // Try to parse date from filename (e.g. 2026-04-09-session.md)
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        sessionDates.push(dateMatch[1]);
      } else {
        // Fall back to file mtime
        try {
          const stat = statSync(join(sessionsDir, file));
          sessionDates.push(stat.mtime.toISOString().split('T')[0]);
        } catch {}
      }
    }

    sessionDates.sort();
    if (sessionDates.length > 0) {
      firstSession = sessionDates[0];
      lastSession = sessionDates[sessionDates.length - 1];
    }

    // Context quality
    const contextPath = join(dir, 'context.md');
    let contextScore = 0;
    let contextSize = 0;

    if (existsSync(contextPath)) {
      const content = readFileSync(contextPath, 'utf8');
      contextSize = content.length;
      contextScore = scoreContext(content);
    }

    return {
      name: p.name,
      sessions: sessions.length,
      decisions: decisions.length,
      firstSession,
      lastSession,
      contextSize,
      contextScore,
    };
  });
}

function scoreContext(content) {
  let score = 0;
  const lower = content.toLowerCase();

  // Has overview filled (not just placeholder)
  if (lower.includes('## overview') && content.length > 200) score += 20;

  // Has stack info
  if (lower.includes('## stack') && (lower.includes('framework') || lower.includes('language'))) score += 20;

  // Has architecture info
  if (lower.includes('## architecture') || lower.includes('## structure')) score += 15;

  // Has conventions
  if (lower.includes('## convention') || lower.includes('## code style')) score += 15;

  // Has current state
  if (lower.includes('## current state') || lower.includes('## status')) score += 10;

  // Length-based bonus
  if (content.length > 500) score += 10;
  if (content.length > 1000) score += 10;

  // Penalty for unfilled placeholders
  const placeholders = (content.match(/<!--.*-->/g) || []).length;
  score -= placeholders * 5;

  return Math.max(0, Math.min(100, score));
}

function formatAge(dateStr) {
  if (!dateStr) return 'never';
  const date = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function scoreBar(score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  let color = c.red;
  if (score >= 70) color = c.green;
  else if (score >= 40) color = c.yellow;
  return `${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset} ${score}%`;
}

// ── Dashboard ────────────────────────────────────────────────────
async function showDashboard() {
  console.log('');
  console.log(`  ${c.magenta}${c.bold}Claude Dev Stack — Analytics${c.reset}`);
  console.log('');

  let vaultPath = findVault();
  if (!vaultPath) {
    warn('Vault not found');
    info('Run setup first: claude-dev-stack');
    console.log('');
    return;
  }

  info(`Vault: ${vaultPath.replace(homedir(), '~')}`);
  console.log('');

  const stats = getSessionStats(vaultPath);

  if (stats.length === 0) {
    warn('No projects in vault');
    console.log('');
    return;
  }

  // ── Project overview table ──
  console.log(`  ${c.bold}Projects${c.reset}`);
  console.log('');

  const totalSessions = stats.reduce((sum, s) => sum + s.sessions, 0);
  const totalDecisions = stats.reduce((sum, s) => sum + s.decisions, 0);

  for (const s of stats) {
    const lastStr = formatAge(s.lastSession);
    const stale = s.lastSession && (new Date() - new Date(s.lastSession)) > 30 * 24 * 60 * 60 * 1000;

    console.log(`    ${c.bold}${s.name}${c.reset}`);
    console.log(`      Context:  ${scoreBar(s.contextScore)}`);
    console.log(`      Sessions: ${s.sessions}${s.sessions > 0 ? ` ${c.dim}(last: ${lastStr})${c.reset}` : ''}`);
    if (s.decisions > 0) {
      console.log(`      ADRs:     ${s.decisions}`);
    }
    if (stale) {
      console.log(`      ${c.yellow}⚠ Stale — no sessions in 30+ days${c.reset}`);
    }
    console.log('');
  }

  // ── Summary ──
  console.log(`  ${c.bold}Summary${c.reset}`);
  console.log('');
  console.log(`    Projects:  ${stats.length}`);
  console.log(`    Sessions:  ${totalSessions}`);
  console.log(`    ADRs:      ${totalDecisions}`);

  // Context quality average
  const avgScore = Math.round(stats.reduce((sum, s) => sum + s.contextScore, 0) / stats.length);
  console.log(`    Avg context quality: ${scoreBar(avgScore)}`);

  // Skills count
  if (existsSync(SKILLS_DIR)) {
    const skillCount = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory()).length;
    console.log(`    Skills:    ${skillCount}`);
  }

  // Stale projects
  const staleProjects = stats.filter(s =>
    s.lastSession && (new Date() - new Date(s.lastSession)) > 30 * 24 * 60 * 60 * 1000
  );
  const emptyContext = stats.filter(s => s.contextScore < 20);

  // ── NotebookLM section (D-17) ──
  console.log(`  ${c.bold}NotebookLM${c.reset}`);
  console.log('');

  const manifest = readManifest(vaultPath);
  const isConfigured = manifest && Object.keys(manifest.projects || {}).length > 0;

  if (!isConfigured) {
    console.log(`    ${c.dim}NotebookLM not configured — run: claude-dev-stack notebooklm sync${c.reset}`);
  } else {
    const syncAge = formatAge(manifest.generated_at);
    const sourceCount = Object.values(manifest.projects)
      .reduce((sum, p) => sum + Object.keys(p.files || {}).length, 0);

    const queryStats = readQueryStats(vaultPath);

    console.log(`    Sync:       ${syncAge}`);
    console.log(`    Sources:    ${sourceCount}`);
    console.log(`    Questions:  ${queryStats.questions_asked}`);
    console.log(`    Artifacts:  ${queryStats.artifacts_generated}`);
  }
  console.log('');

  // ── Recommendations ──
  if (staleProjects.length > 0 || emptyContext.length > 0) {
    console.log(`  ${c.bold}Recommendations${c.reset}`);
    console.log('');

    if (emptyContext.length > 0) {
      warn(`${emptyContext.length} project(s) with empty/thin context.md:`);
      for (const p of emptyContext) {
        console.log(`      ${c.dim}→ ${p.name} (${p.contextScore}%)${c.reset}`);
      }
      info('Fill in context.md or use: claude-dev-stack new');
      console.log('');
    }

    if (staleProjects.length > 0) {
      warn(`${staleProjects.length} stale project(s) (no sessions in 30+ days):`);
      for (const p of staleProjects) {
        console.log(`      ${c.dim}→ ${p.name} (last: ${formatAge(p.lastSession)})${c.reset}`);
      }
      info('Consider archiving or updating context for stale projects');
      console.log('');
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────
export async function main(args = []) {
  await showDashboard();
}
