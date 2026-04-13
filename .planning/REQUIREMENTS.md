# Milestone v0.11 Requirements — DX Polish & Ecosystem

**Goal**: Improve developer experience with auto-approve for vault operations, idempotent re-install wizard, git-conventions enhancements, NotebookLM cross-notebook search, Notion whole-database import, analytics integration, and path→slug centralization.

**Phase numbering**: continues from v0.10 (last phase: 13) → starts at Phase 14
**Test baseline**: 483 (v0.10.0)
**Total requirements**: 11 v1 requirements + future requirements.

---

## v1 Requirements

### Developer Experience (DX)

- [ ] **DX-01**: User can configure auto-approve for vault read/write operations — session-manager reads context.md and writes session logs without triggering permission prompts. Configurable via `.claude/settings.json` allowlist patterns.
- [ ] **DX-02**: User running `claude-dev-stack` (install wizard) on a machine with existing vault sees pre-filled values (vault path, git remote, profile name, projects) and can skip already-completed steps. Wizard detects existing state and offers "skip" or "reconfigure" per section.

### Code Quality (QUALITY)

- [ ] **QUALITY-01**: Path-to-project-slug mapping consolidated from 4 files (`add-project.mjs`, `projects.mjs`, `project-setup.mjs`, `docs.mjs`) into single `lib/project-naming.mjs` module with `toSlug(name)` and `fromSlug(slug)` exports. All 4 files import from the new module.

### Git Conventions (GIT)

- [ ] **GIT-01**: User running `scopes init` on a project without prerequisites (no git, no Node) sees a clear error message with install instructions instead of a cryptic failure. GIT-09 error path implemented.
- [ ] **GIT-02**: User can opt into gitmoji prefixes for conventional commits via `scopes init --gitmoji` or interactive prompt. Gitmoji mapping stored in `git-scopes.json`, skill reads and applies them.
- [ ] **GIT-03**: User can run `claude-dev-stack git-action` to generate a `.github/workflows/commitlint.yml` file that enforces conventional commits in CI using commitlint.
- [ ] **GIT-04**: User can run `claude-dev-stack migrate-claude-md` to extract structured scopes/conventions from prose CLAUDE.md into `git-scopes.json` format. Interactive review before writing.

### NotebookLM (NBLM)

- [ ] **NBLM-01**: User can run `claude-dev-stack notebooklm search "query"` to search across all project notebooks simultaneously. Results show project name, source title, and relevant excerpt. Uses `notebooklm-py ask` per notebook with parallel execution.

### Notion (NOTION)

- [ ] **NOTION-01**: User can run `claude-dev-stack notion import --database <id>` to import all pages from a Notion database into vault. Pages are saved as individual markdown files in `vault/projects/{name}/docs/notion/`. Handles pagination (Notion API 100-page limit).

### Analytics (ANALYTICS)

- [ ] **ANALYTICS-01**: Analytics dashboard (`claude-dev-stack analytics`) shows NotebookLM sync stats (last sync time, sources count, sync duration) and query usage (questions asked, artifacts generated) alongside existing session/context metrics.

### Phase 11 Code Review (REVIEW)

- [ ] **REVIEW-01**: 4 code review warnings from Phase 11 (WR-01..WR-04: unused tmpdir, missing null check, shell quoting, silent flag discard) fixed in `lib/notebooklm.mjs` and `lib/notebooklm-cli.mjs`.

---

## Future Requirements (v0.12+)

- **DX-FUT-01**: Auto-approve granular per-tool permissions (Read, Write, Bash separately)
- **NBLM-FUT-02**: NotebookLM source fulltext retrieval via `source fulltext` command
- **ANALYTICS-FUT-01**: Analytics export to JSON/CSV for external dashboards

## Out of Scope

- Two-way sync (NotebookLM → vault) — vault is source of truth
- Cron-based periodic sync — session-end is sufficient
- Per-project plugin configuration — deferred
- Real-time streaming of notebooklm ask — batch only
- Notion REST API fallback — MCP-only

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DX-01 | TBD | pending |
| DX-02 | TBD | pending |
| QUALITY-01 | TBD | pending |
| GIT-01 | TBD | pending |
| GIT-02 | TBD | pending |
| GIT-03 | TBD | pending |
| GIT-04 | TBD | pending |
| NBLM-01 | TBD | pending |
| NOTION-01 | TBD | pending |
| ANALYTICS-01 | TBD | pending |
| REVIEW-01 | TBD | pending |
