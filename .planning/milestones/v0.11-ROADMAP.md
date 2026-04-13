1	# Roadmap: claude-dev-stack
2	
3	## Milestones
4	
5	- ✅ **v0.8 NotebookLM Sync** - Phases 1–5 (shipped 2026-04-10)
6	- ✅ **v0.9 Git Conventions & NotebookLM Per-Project** - Phases 6–9 (shipped 2026-04-11)
7	- ✅ **v0.10 Query, Sync Automation & Quality** - Phases 10–13 (shipped 2026-04-13)
8	- 🚧 **v0.11 DX Polish & Ecosystem** - Phases 14–18 (in progress)
9	
10	---
11	
12	<details>
13	<summary>✅ v0.8–v0.10 (Phases 1–13) - SHIPPED 2026-04-13</summary>
14	
15	### v0.8 — NotebookLM Sync (Phases 1–5)
16	
17	4 phases completed. NotebookLM sync pipeline, manifest change detection, CLI integration, session-context fix.
18	
19	### v0.9 — Git Conventions & NotebookLM Per-Project (Phases 6–9)
20	
21	4 phases completed. Git conventions skill ecosystem, per-project notebook manifest v2, migration script, Notion auto-import via MCP.
22	
23	### v0.10 — Query, Sync Automation & Quality (Phases 10–13)
24	
25	4 phases completed. Bugfixes, NotebookLM Query API, sync automation + install.mjs refactor, GSD infrastructure (ADR bridge + parallel execution).
26	
27	Archive: `.planning/milestones/v0.10-ROADMAP.md`
28	
29	</details>
30	
31	---
32	
33	## 🚧 v0.11 — DX Polish & Ecosystem (In Progress)
34	
35	**Milestone Goal:** Improve developer experience with auto-approve for vault operations, idempotent re-install wizard, git-conventions enhancements, NotebookLM cross-notebook search, Notion whole-database import, analytics integration, and path→slug centralization.
36	
37	**Phase numbering:** continues from v0.10 (last phase: 13) → starts at Phase 14
38	**Granularity:** standard
39	**Test baseline:** 483 (v0.10.0)
40	**Branching:** `phase` → `gsd/phase-{phase}-{slug}`
41	
42	## Phases
43	
44	- [x] **Phase 14: Code Review Fixes + Quality Refactor** — Fix 4 Phase 11 code review warnings and consolidate path-to-slug mapping into a single module (completed 2026-04-13)
45	- [x] **Phase 15: DX — Auto-Approve & Smart Re-install** — Configure auto-approve for vault operations and make the install wizard idempotent with pre-filled values (completed 2026-04-13)
46	- [x] **Phase 16: Git Conventions Ecosystem** — Add error handling, gitmoji support, GitHub Action generation, and CLAUDE.md migration helper to git-conventions (completed 2026-04-13)
47	- [x] **Phase 17: NotebookLM Cross-Notebook Search** — Enable querying across all project notebooks simultaneously from a single CLI command (completed 2026-04-13)
48	- [x] **Phase 18: Notion Database Import + Analytics Integration** — Import full Notion databases into vault and surface NotebookLM sync stats in the analytics dashboard (completed 2026-04-13)
49	
50	---
51	
52	## Phase Details
53	
54	### Phase 14: Code Review Fixes + Quality Refactor
55	**Goal**: Codebase is clean — Phase 11 warnings are fixed and path-to-slug mapping is centralized so future modules have one import to call instead of reinventing the same slug logic.
56	**Depends on**: Nothing (starts off main; all changes are to shipped code)
57	**Requirements**: REVIEW-01, QUALITY-01
58	**Success Criteria** (what must be TRUE):
59	  1. `npm test` passes with 0 failures and the 4 Phase 11 warnings (WR-01..WR-04: unused tmpdir, missing null check, shell quoting, silent flag discard) are gone from `lib/notebooklm.mjs` and `lib/notebooklm-cli.mjs`.
60	  2. A new `lib/project-naming.mjs` module exists and exports `toSlug(name)` and `fromSlug(slug)`.
61	  3. `add-project.mjs`, `projects.mjs`, `project-setup.mjs`, and `docs.mjs` all import slug utilities from `lib/project-naming.mjs` — no local duplicate implementations remain.
62	  4. All existing tests pass with the refactored imports — no behavior change observable by users.
63	**Plans:** 2/2 plans complete
64	Plans:
65	- [x] 14-01-PLAN.md — Fix 4 Phase 11 code review warnings (WR-01..WR-04) in notebooklm.mjs and notebooklm-cli.mjs
66	- [x] 14-02-PLAN.md — Centralize slug logic into lib/project-naming.mjs and update all consumer files
67	
68	---
69	
70	### Phase 15: DX — Auto-Approve & Smart Re-install
71	**Goal**: Running `claude-dev-stack` on a machine with existing config pre-fills known values and skips completed steps, and session-manager vault operations no longer trigger permission prompts.
72	**Depends on**: Phase 14 (clean baseline — slug module available for wizard to use when detecting existing projects)
73	**Requirements**: DX-01, DX-02
74	**Success Criteria** (what must be TRUE):
75	  1. User running `claude-dev-stack` on a machine with existing vault sees vault path, git remote, and project list pre-filled — they do not have to retype values they already configured.
76	  2. Each wizard section (vault setup, git sync, profiles, projects) shows a "skip" option when that section is already complete — user can skip all complete sections in one pass.
77	  3. User who selects "reconfigure" on a completed section sees the wizard re-run that section with existing values as defaults (not blank fields).
78	  4. Session-manager reads `context.md` and writes session logs without triggering permission prompts — `allowedTools` patterns are added to `.claude/settings.json` covering vault read/write paths.
79	  5. User can inspect `.claude/settings.json` and see the auto-approve allowlist patterns that were written during wizard setup.
80	**Plans:** 2/3 plans complete
81	Plans:
82	- [x] 15-01-PLAN.md — Create lib/install/detect.mjs (detectInstallState) and add allowedTools to lib/install/hooks.mjs (DX-01)
83	- [x] 15-02-PLAN.md — Extend vault.mjs, profile.mjs, projects.mjs with optional detected-state params (DX-02 pre-fill)
84	- [ ] 15-03-PLAN.md — Wire detection + skip-aware flow into bin/install.mjs and write tests/detect.test.mjs
85	
86	---
87	
88	### Phase 16: Git Conventions Ecosystem
89	**Goal**: Git-conventions skill is production-ready — missing prerequisites surface a clear error, gitmoji is opt-in, a GitHub Action enforces conventions in CI, and existing prose CLAUDE.md can be migrated to `git-scopes.json` automatically.
90	**Depends on**: Phase 14 (slug refactor in place; git-conventions tooling may use slug for file naming)
91	**Requirements**: GIT-01, GIT-02, GIT-03, GIT-04
92	**Success Criteria** (what must be TRUE):
93	  1. User running `scopes init` without git or Node installed sees a formatted error message with install instructions — no cryptic stack trace or silent failure.
94	  2. User who ran `scopes init --gitmoji` (or selected gitmoji in the interactive prompt) sees emoji prefixes applied to their commits — the mapping is stored in `git-scopes.json` and the skill reads it.
95	  3. User running `claude-dev-stack git-action` gets a `.github/workflows/commitlint.yml` file written to their project — the file is valid YAML that runs commitlint on every PR.
96	  4. User running `claude-dev-stack migrate-claude-md` sees an interactive review of extracted scopes/conventions before any file is written — they can accept, edit, or cancel before `git-scopes.json` is created.
97	**Plans:** 2/2 plans complete
98	Plans:
99	- [x] 16-01-PLAN.md — Add checkPrereqs (GIT-01) and gitmoji opt-in support (GIT-02) to git-scopes.mjs and cmdInit
100	- [x] 16-02-PLAN.md — Add cmdGitAction (GIT-03) and cmdMigrateClaude (GIT-04) with bin/cli.mjs routing
101	
102	---
103	
104	### Phase 17: NotebookLM Cross-Notebook Search
105	**Goal**: Users can search across all their project notebooks with a single command — results are attributed to the right project so they know where each answer came from.
106	**Depends on**: Nothing (independent of Phases 15–16; builds on existing `lib/notebooklm.mjs` askNotebook from Phase 11)
107	**Requirements**: NBLM-01
108	**Success Criteria** (what must be TRUE):
109	  1. User running `claude-dev-stack notebooklm search "query"` sees results from all project notebooks — each result shows the project name, source title, and a relevant excerpt.
110	  2. Search runs notebooks in parallel — a query to 5 notebooks does not take 5× longer than a single-notebook query.
111	  3. If one notebook query fails, the command still returns results from the other notebooks — partial results are shown with a warning for the failed project.
112	  4. User with zero configured notebooks sees a clear message ("no notebooks configured") instead of an empty result or an error.
113	**Plans:** 2/2 plans complete
114	Plans:
115	- [x] 17-01-PLAN.md — Implement runSearch() in lib/notebooklm-cli.mjs (parallel fan-out, --json flag, partial results)
116	- [x] 17-02-PLAN.md — Test suite for runSearch in tests/notebooklm-search.test.mjs (5 cases with injectable deps)
117	
118	---
119	
120	### Phase 18: Notion Database Import + Analytics Integration
121	**Goal**: Users can import an entire Notion database into vault with one command, and the analytics dashboard shows NotebookLM sync stats alongside existing session metrics.
122	**Depends on**: Phase 14 (slug module needed for database page file naming in vault)
123	**Requirements**: NOTION-01, ANALYTICS-01
124	**Success Criteria** (what must be TRUE):
125	  1. User running `claude-dev-stack notion import --database <id>` sees all pages from the Notion database saved as individual markdown files in `vault/projects/{name}/docs/notion/` — databases with more than 100 pages are fully imported (pagination handled).
126	  2. User running `claude-dev-stack analytics` sees NotebookLM sync stats (last sync time, source count, sync duration) in the dashboard output alongside existing session and context quality metrics.
127	  3. User running `claude-dev-stack analytics` sees query usage stats (questions asked, artifacts generated) — these counts update after each `notebooklm ask` or `notebooklm generate` call.
128	  4. User with no NotebookLM configured sees analytics dashboard without errors — NotebookLM section shows "not configured" instead of crashing or showing undefined values.
129	**Plans:** 2/2 plans complete
130	Plans:
131	- [x] 18-01-PLAN.md — Notion database import: importDatabase() in lib/notion-import.mjs + --database routing in lib/notion-cli.mjs
132	- [x] 18-02-PLAN.md — Analytics integration: lib/notebooklm-stats.mjs + NotebookLM section in lib/analytics.mjs
133	
134	---
135	
136	## Coverage Table
137	
138	All 11 v1 requirements mapped to exactly one owning phase:
139	
140	| REQ-ID | Phase | Description |
141	|--------|-------|-------------|
142	| REVIEW-01 | 14 | Fix 4 Phase 11 code review warnings (WR-01..WR-04) |
143	| QUALITY-01 | 14 | Centralize path-to-slug into lib/project-naming.mjs |
144	| DX-01 | 15 | Auto-approve allowlist for vault read/write in settings.json |
145	| DX-02 | 15 | Smart re-install wizard with pre-fill + skip/reconfigure |
146	| GIT-01 | 16 | GIT-09 error path — clear error for missing prerequisites |
147	| GIT-02 | 16 | Gitmoji opt-in via --gitmoji flag or interactive prompt |
148	| GIT-03 | 16 | GitHub Action generation for commitlint CI enforcement |
149	| GIT-04 | 16 | Migration helper from prose CLAUDE.md to git-scopes.json |
150	| NBLM-01 | 17 | Cross-notebook search with parallel execution + attribution |
151	| NOTION-01 | 18 | Notion database import with pagination handling |
152	| ANALYTICS-01 | 18 | NotebookLM sync stats + query usage in analytics dashboard |
153	
154	**Coverage check**: 11/11 requirements mapped (100%), 0 orphaned.
155	
156	- Phase 14: 2 requirements (REVIEW-01, QUALITY-01)
157	- Phase 15: 2 requirements (DX-01, DX-02)
158	- Phase 16: 4 requirements (GIT-01, GIT-02, GIT-03, GIT-04)
159	- Phase 17: 1 requirement (NBLM-01)
160	- Phase 18: 2 requirements (NOTION-01, ANALYTICS-01)
161	
162	Total: 2 + 2 + 4 + 1 + 2 = 11 ✓
163	
164	---
165	
166	## Dependency Graph
167	
168	```
169	Phase 14 — Code Review Fixes + Quality Refactor (LOW risk)
170	  ├─ fixes shipped Phase 11 warnings (notebooklm.mjs, notebooklm-cli.mjs)
171	  ├─ extracts slug logic into lib/project-naming.mjs
172	  └─ no upstream deps — starts fresh off main
173	
174	Phase 15 — DX: Auto-Approve & Smart Re-install (MEDIUM risk)
175	  ├─ depends on Phase 14: slug module available for wizard project detection
176	  └─ largest feature in milestone — wizard refactor touches bin/install.mjs
177	
178	Phase 16 — Git Conventions Ecosystem (LOW risk)
179	  ├─ depends on Phase 14: slug module (file naming)
180	  ├─ independent of Phase 15 — can run in parallel with 15
181	  └─ extends existing git-conventions skill infrastructure
182	
183	Phase 17 — NotebookLM Cross-Notebook Search (LOW-MEDIUM risk)
184	  ├─ no upstream deps — independent of Phases 15, 16
185	  ├─ builds on lib/notebooklm.mjs askNotebook() from Phase 11
186	  └─ can execute in parallel with Phases 15 and 16 after Phase 14 completes
187	
188	Phase 18 — Notion Database Import + Analytics Integration (LOW risk)
189	  ├─ depends on Phase 14: slug module for file naming
190	  ├─ independent of Phases 15, 16, 17 — can run in parallel with them
191	  └─ ANALYTICS-01 extends lib/analytics.mjs; NOTION-01 extends lib/notion-import.mjs
192	```
193	
194	**Parallel opportunities** (after Phase 14):
195	- Phases 15, 16, 17, 18 are all independent of each other
196	- All depend only on Phase 14 (slug module)
197	- Maximum parallelism: run 15+16+17+18 concurrently after 14 completes
198	
199	---
200	
201	## Progress
202	
203	| Phase | Milestone | Plans Complete | Status | Completed |
204	|-------|-----------|----------------|--------|-----------|
205	| 10. Bugfixes | v0.10 | 2/2 | Complete | 2026-04-12 |
206	| 11. NotebookLM Query API | v0.10 | 2/2 | Complete | 2026-04-12 |
207	| 12. Sync Automation + install.mjs Refactor | v0.10 | 3/3 | Complete | 2026-04-13 |
208	| 13. GSD Infrastructure | v0.10 | 2/2 | Complete | 2026-04-13 |
209	| 14. Code Review Fixes + Quality Refactor | v0.11 | 2/2 | Complete    | 2026-04-13 |
210	| 15. DX — Auto-Approve & Smart Re-install | v0.11 | 2/3 | Complete    | 2026-04-13 |
211	| 16. Git Conventions Ecosystem | v0.11 | 2/2 | Complete    | 2026-04-13 |
212	| 17. NotebookLM Cross-Notebook Search | v0.11 | 2/2 | Complete    | 2026-04-13 |
213	| 18. Notion Database Import + Analytics Integration | v0.11 | 2/2 | Complete    | 2026-04-13 |
214	
215	---
216	
217	*Roadmap updated: 2026-04-13 — Phase 16 planned: 2 plans, 2 waves. GIT-01, GIT-02, GIT-03, GIT-04 fully covered.*
218	
219	### Phase 18.1: Always-on TeamCreate execution (INSERTED)
220	
221	**Goal:** Replace the "detect parallel → offer TeamCreate" model in transition.md Route A with an "always TeamCreate" model — all pending phases are spawned as team members with dependency-aware scheduling via TaskCreate blockedBy.
222	**Requirements**: INFRA-04 improvement (no new requirement IDs)
223	**Depends on:** Phase 18
224	**Plans:** 1/1 plans complete
225	
226	Plans:
227	- [x] 18.1-01-PLAN.md — Replace parallel detection block in transition.md Route A with always-on TeamCreate spawning
