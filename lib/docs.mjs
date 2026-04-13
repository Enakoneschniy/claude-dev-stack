/**
 * Docs management — add documents to project vault.
 *
 * Import from:
 * - Local files/folders (markdown, txt, pdf notes)
 * - Notion export (markdown zip)
 * - Manual paste
 *
 * Docs go to: vault/projects/{name}/docs/
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, cpSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import { homedir } from 'os';
import { c, ok, fail, warn, info, prompt, askPath, mkdirp } from './shared.mjs';
import { findVault } from './projects.mjs';
import { toSlug } from './project-naming.mjs';

function getProjects(vaultPath) {
  const projectsDir = join(vaultPath, 'projects');
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_template')
    .map(e => e.name)
    .sort();
}

function countDocs(docsDir) {
  if (!existsSync(docsDir)) return 0;
  return readdirSync(docsDir).filter(f =>
    ['.md', '.txt', '.pdf', '.html'].includes(extname(f).toLowerCase())
  ).length;
}

// ── List docs for a project ──────────────────────────────────────
async function listDocs() {
  console.log('');
  console.log(`  ${c.bold}Project documents${c.reset}`);
  console.log('');

  const vaultPath = findVault();
  if (!vaultPath) {
    warn('Vault not found');
    return;
  }

  const projects = getProjects(vaultPath);

  for (const name of projects) {
    const docsDir = join(vaultPath, 'projects', name, 'docs');
    const count = countDocs(docsDir);

    if (count > 0) {
      console.log(`    ${c.bold}${name}${c.reset} ${c.dim}(${count} docs)${c.reset}`);
      const files = readdirSync(docsDir).filter(f =>
        ['.md', '.txt', '.pdf', '.html'].includes(extname(f).toLowerCase())
      );
      for (const f of files) {
        const stat = statSync(join(docsDir, f));
        const size = stat.size > 1024 ? `${Math.round(stat.size / 1024)}KB` : `${stat.size}B`;
        console.log(`      ${c.dim}${f} (${size})${c.reset}`);
      }
    } else {
      console.log(`    ${c.dim}${name} — no docs${c.reset}`);
    }
  }
  console.log('');
}

// ── Add docs to a project ────────────────────────────────────────
async function addDocs() {
  console.log('');
  console.log(`  ${c.bold}Add documents to project${c.reset}`);
  console.log('');

  const vaultPath = findVault();
  if (!vaultPath) {
    warn('Vault not found. Run setup first: claude-dev-stack');
    return;
  }

  const projects = getProjects(vaultPath);
  if (projects.length === 0) {
    warn('No projects in vault');
    return;
  }

  // Pick project
  const { project } = await prompt({
    type: 'select',
    name: 'project',
    message: 'Which project?',
    choices: projects.map(p => ({ title: p, value: p })),
  });
  if (!project) return;

  const docsDir = join(vaultPath, 'projects', project, 'docs');
  mkdirp(docsDir);

  // Pick source type
  const { source } = await prompt({
    type: 'select',
    name: 'source',
    message: 'Import from?',
    choices: [
      { title: `Files or folder ${c.dim}(copy markdown/txt files)${c.reset}`, value: 'files' },
      { title: `Notion export ${c.dim}(unzipped markdown folder)${c.reset}`, value: 'notion' },
      { title: `Paste text ${c.dim}(create a new doc from clipboard/input)${c.reset}`, value: 'paste' },
    ],
  });

  if (source === 'files') {
    await importFiles(docsDir);
  } else if (source === 'notion') {
    await importNotion(docsDir);
  } else if (source === 'paste') {
    await createDoc(docsDir);
  }
}

async function importFiles(docsDir) {
  console.log('');
  console.log(`    ${c.dim}Tab to autocomplete. Can be a file or a folder.${c.reset}`);
  const path = await askPath('Path to file or folder', '');
  const resolved = path.replace(/^~/, homedir()).replace(/\/+$/, '');

  if (!existsSync(resolved)) {
    fail('Path not found');
    return;
  }

  const stat = statSync(resolved);

  if (stat.isFile()) {
    const name = basename(resolved);
    cpSync(resolved, join(docsDir, name));
    ok(`Copied ${name}`);
  } else if (stat.isDirectory()) {
    const files = readdirSync(resolved).filter(f => {
      const ext = extname(f).toLowerCase();
      return ['.md', '.txt', '.html', '.pdf', '.csv'].includes(ext);
    });

    if (files.length === 0) {
      warn('No supported files found (.md, .txt, .html, .pdf, .csv)');
      return;
    }

    for (const f of files) {
      cpSync(join(resolved, f), join(docsDir, f));
    }
    ok(`Copied ${files.length} file(s)`);
  }

  console.log(`    ${c.dim}Docs: ${docsDir.replace(homedir(), '~')}${c.reset}`);
  console.log('');
}

async function importNotion(docsDir) {
  console.log('');
  console.log(`    ${c.bold}How to export from Notion:${c.reset}`);
  console.log(`    ${c.dim}1. In Notion: click ••• on a page → Export → Markdown & CSV${c.reset}`);
  console.log(`    ${c.dim}2. Unzip the downloaded file${c.reset}`);
  console.log(`    ${c.dim}3. Point to the unzipped folder below${c.reset}`);
  console.log('');
  console.log(`    ${c.dim}Tab to autocomplete path.${c.reset}`);

  const path = await askPath('Path to unzipped Notion export', join(homedir(), 'Downloads'));
  const resolved = path.replace(/^~/, homedir()).replace(/\/+$/, '');

  if (!existsSync(resolved)) {
    fail('Path not found');
    return;
  }

  // Notion exports have .md files, possibly in subdirectories
  const allFiles = [];

  function scanDir(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scanDir(join(dir, entry.name), prefix + entry.name + '_');
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.csv')) {
        allFiles.push({
          src: join(dir, entry.name),
          // Notion filenames have UUIDs, clean them up
          dest: cleanNotionFilename(prefix + entry.name),
        });
      }
    }
  }

  scanDir(resolved);

  if (allFiles.length === 0) {
    warn('No markdown files found in export');
    return;
  }

  info(`Found ${allFiles.length} file(s)`);

  // Let user pick which to import
  const { selected } = await prompt({
    type: 'multiselect',
    name: 'selected',
    message: 'Select files to import',
    choices: allFiles.map(f => ({
      title: f.dest,
      value: f.src,
      selected: true,
    })),
    instructions: false,
    hint: '↑↓ navigate, space toggle, enter confirm',
  });

  if (!selected || selected.length === 0) {
    info('Nothing selected');
    return;
  }

  for (const src of selected) {
    const file = allFiles.find(f => f.src === src);
    cpSync(src, join(docsDir, file.dest));
  }
  ok(`Imported ${selected.length} file(s)`);
  console.log(`    ${c.dim}Docs: ${docsDir.replace(homedir(), '~')}${c.reset}`);
  console.log('');
}

export function cleanNotionFilename(name) {
  // Notion adds UUIDs like "Page Name abc123def456.md"
  // Remove the UUID part
  return name
    .replace(/\s+[a-f0-9]{32}\.md$/, '.md')
    .replace(/\s+[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.md$/, '.md')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

async function createDoc(docsDir) {
  const { title } = await prompt({
    type: 'text',
    name: 'title',
    message: 'Document title',
  });
  if (!title) return;

  const slug = toSlug(title);
  const filePath = join(docsDir, `${slug}.md`);

  const { content } = await prompt({
    type: 'text',
    name: 'content',
    message: 'Paste content (or type — single line for now)',
  });

  writeFileSync(filePath, `# ${title}\n\n${content || ''}\n`);
  ok(`Created ${slug}.md`);
  info(`Edit: ${filePath.replace(homedir(), '~')}`);
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────
export async function main(args = []) {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
    case 'ls':
      await listDocs();
      break;
    case 'add':
    case 'import':
      await addDocs();
      break;
    default:
      console.log('');
      console.log(`  ${c.bold}Document management${c.reset}`);
      console.log('');
      console.log(`    ${c.white}claude-dev-stack docs${c.reset}              ${c.dim}List documents per project${c.reset}`);
      console.log(`    ${c.white}claude-dev-stack docs add${c.reset}          ${c.dim}Add docs from files, Notion export, or paste${c.reset}`);
      console.log('');
      console.log(`  ${c.dim}Documents are stored in vault/projects/{name}/docs/${c.reset}`);
      console.log(`  ${c.dim}Claude reads them when working on that project.${c.reset}`);
      console.log('');
  }
}
