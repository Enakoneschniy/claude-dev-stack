---
task: 260411-vjl
type: quick
branch: chore/gsd-config-branching-none
files_modified:
  - .planning/config.json
autonomous: true
risk: low
rollback: "git revert HEAD"

must_haves:
  truths:
    - ".planning/config.json parses as valid JSON"
    - "git.branching_strategy equals \"none\""
    - "git.quick_branch_template equals \"chore/{slug}\""
    - "All other config keys are unchanged"
    - "npm test still passes (264 tests)"
  artifacts:
    - path: ".planning/config.json"
      provides: "GSD project config with branching_strategy=none and chore/{slug} quick branches"
      contains: "\"branching_strategy\": \"none\""
  key_links:
    - from: ".planning/config.json git.branching_strategy"
      to: "~/.claude/get-shit-done/bin/lib/commands.cjs::cmdCommit (line 281 early return)"
      via: "gsd-tools config-get"
      pattern: "strategy === 'none'"
---

<objective>
Flip two keys in `.planning/config.json` to stop GSD's `cmdCommit` from hijacking feature branches onto the milestone branch.

Purpose: Align GSD behavior with the user's mandated "feature branch + PR → main" workflow (CLAUDE.md). The current `branching_strategy: "milestone"` setting triggered a known upstream bug in `cmdCommit` three+ times during v0.8 (see `~/vault/projects/claude-dev-stack/sessions/2026-04-11-v0.8.1-hotfix-shipped.md` TODO #3), forcing manual fast-forward recovery each time.

Output: A two-key diff in `.planning/config.json` and one commit on `chore/gsd-config-branching-none`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/config.json
@.planning/STATE.md

# Upstream code the change interacts with (read-only reference, DO NOT modify):
# ~/.claude/get-shit-done/bin/lib/commands.cjs:281-313  (cmdCommit branch hijack bug)
# ~/.claude/get-shit-done/bin/lib/init.cjs:466-471      (quick_branch_template consumer)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Flip branching_strategy and quick_branch_template in .planning/config.json</name>
  <files>.planning/config.json</files>
  <action>
Edit `.planning/config.json` with exactly two key changes inside the `git` object:

1. Change `"branching_strategy": "milestone"` → `"branching_strategy": "none"`
2. Change `"quick_branch_template": null` → `"quick_branch_template": "chore/{slug}"`

Preserve all other keys verbatim — including `phase_branch_template` and `milestone_branch_template` (keep them as-is; they are harmless dead config under strategy=none and leaving them documents prior intent).

Preserve 2-space indentation. Preserve key order. Do NOT touch any key outside the `git` section. Do NOT reformat the file.

Use the Edit tool with two targeted replacements, NOT a full-file rewrite. This keeps the diff minimal and greppable.
  </action>
  <verify>
    <automated>node -e "const c=JSON.parse(require('fs').readFileSync('.planning/config.json','utf8')); if(c.git.branching_strategy!=='none')throw new Error('branching_strategy='+c.git.branching_strategy); if(c.git.quick_branch_template!=='chore/{slug}')throw new Error('quick_branch_template='+c.git.quick_branch_template); if(c.git.phase_branch_template!=='gsd/phase-{phase}-{slug}')throw new Error('phase_branch_template drifted'); if(c.git.milestone_branch_template!=='gsd/{milestone}-{slug}')throw new Error('milestone_branch_template drifted'); console.log('OK');"</automated>
  </verify>
  <done>
  - JSON parses cleanly
  - `git.branching_strategy === "none"`
  - `git.quick_branch_template === "chore/{slug}"`
  - `git.phase_branch_template` and `git.milestone_branch_template` unchanged
  - All top-level keys (model_profile, commit_docs, parallelization, workflow, hooks, etc.) unchanged
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify gsd-tools reads the new config and run test suite</name>
  <files></files>
  <action>
Run three verification commands in sequence:

1. Confirm gsd-tools reads the new `branching_strategy`:
   `node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get git.branching_strategy`
   Expected stdout: `"none"` (or `none` — either is acceptable, just not `"milestone"`).

2. Confirm gsd-tools reads the new `quick_branch_template`:
   `node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get git.quick_branch_template`
   Expected stdout: `"chore/{slug}"` (or `chore/{slug}`).

3. Run the full test suite to confirm nothing regressed:
   `npm test`
   Expected: 264 tests pass (no test reads `.planning/config.json` contents — this validates the config change is truly runtime-only and didn't accidentally touch source files).

If any command fails, STOP and report — do NOT proceed to commit.
  </action>
  <verify>
    <automated>node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get git.branching_strategy 2>&1 | grep -q none &amp;&amp; node ~/.claude/get-shit-done/bin/gsd-tools.cjs config-get git.quick_branch_template 2>&1 | grep -q 'chore/{slug}' &amp;&amp; npm test 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
  - gsd-tools config-get returns `none` for branching_strategy
  - gsd-tools config-get returns `chore/{slug}` for quick_branch_template
  - `npm test` exits 0 with all 264 tests passing
  </done>
</task>

<task type="auto">
  <name>Task 3: Commit the config change on chore/gsd-config-branching-none</name>
  <files>.planning/config.json</files>
  <action>
The branch `chore/gsd-config-branching-none` is already checked out (verify with `git branch --show-current` first — if not on that branch, STOP and report).

Stage only the config file:
  `git add .planning/config.json`

Verify the staged diff is exactly the two-key change (no unexpected files, no whitespace drift):
  `git diff --cached --stat` should show `.planning/config.json | 2 +-` or similar (one file, ~2 lines changed).

Commit with this exact message (no Co-Authored-By per project memory):

```
chore(config): switch GSD branching_strategy to none + enable chore/{slug} quick branches

Avoids cmdCommit branch-hijack bug (commands.cjs:281-313) that fired
3+ times during v0.8 milestone. Aligns GSD with the project's mandated
feature-branch + PR workflow (CLAUDE.md). Enables per-task quick branches
via chore/{slug} template so /gsd-quick no longer requires manual
git checkout -b.
```

Use a HEREDOC to pass the message cleanly. Do NOT push — PR creation is outside this plan's scope (user will open it manually or via `gh pr create` after review).
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q 'chore(config): switch GSD branching_strategy' &amp;&amp; git show HEAD --stat | grep -q '.planning/config.json'</automated>
  </verify>
  <done>
  - HEAD commit on `chore/gsd-config-branching-none` contains only `.planning/config.json`
  - Commit message starts with `chore(config): switch GSD branching_strategy to none`
  - No Co-Authored-By footer
  - Working tree clean (`git status` shows nothing)
  </done>
</task>

</tasks>

<verification>
Final sanity checks after all tasks:

1. `git status` — clean working tree
2. `git log -1 --stat` — one commit, one file changed
3. `jq '.git' .planning/config.json` — shows the new values
4. `npm test` — still 264 tests passing

No threat model section: this change touches one local config file with no security, PII, or trust boundary implications. Risk is low — a single `git revert HEAD` restores the previous behavior if anything goes wrong.
</verification>

<success_criteria>
- `.planning/config.json` has `branching_strategy: "none"` and `quick_branch_template: "chore/{slug}"`
- All other config keys byte-identical to pre-change state
- `npm test` passes (264/264)
- One commit on `chore/gsd-config-branching-none` with the specified message
- Rollback path documented and trivial: `git revert HEAD`
</success_criteria>

<rollback>
If the change causes unexpected GSD behavior in the next session:

  git revert HEAD
  git push origin chore/gsd-config-branching-none  # only if already pushed

Or, if uncommitted: `git checkout -- .planning/config.json`.

No data migration, no cleanup — config is runtime-only.
</rollback>

<output>
After completion, write `.planning/quick/260411-vjl-switch-planning-config-json-from-branchi/260411-vjl-SUMMARY.md` documenting:
- The two-key diff
- Test suite result (264 passing)
- Commit SHA
- Link back to today's session log for context on the upstream bug

Also update `.planning/STATE.md`:
- Activity line → "Switched GSD branching_strategy to none (260411-vjl)"
- Quick Tasks Completed table → append `260411-vjl | chore/gsd-config-branching-none | shipped`
</output>
