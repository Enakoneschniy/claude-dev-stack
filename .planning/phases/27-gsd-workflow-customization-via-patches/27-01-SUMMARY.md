# 27-01-SUMMARY.md

## What changed

- New file: `tests/gsd-auto-reapply-patches.test.mjs` (121 lines)

## Test runner output

```
# tests 5
# suites 1
# pass 5
# fail 0
```

All five cases pass:
1. applies patch when target SHA differs
2. is silent and does not copy when SHAs match (idempotent)
3. prefers `~/.claude/gsd-local-patches/` over other resolution paths when `PATCHES_DIR` unset
4. exits 0 silently when `GSD_DIR` does not exist
5. exits 0 silently when no patches source resolves

## Bugs discovered

None in the hook itself. The initial test-case-5 implementation had a test
bug: it did not suppress npm global lookup, and because claude-dev-stack is
actually installed globally on the dev machine, the resolver correctly
found the npm-global `patches/` dir. Fix: pass a minimal
`PATH=/bin:/usr/bin` so `npm` is not resolvable — test asserts true
no-source behavior.

## Notes

- `execFileSync('bash', [hookPath], { env: { PATH, ... } })` pattern mirrors
  `tests/hooks.test.mjs`.
- Each test uses `mkdtempSync` for fixture isolation. `after()` uses
  `rmSync(..., { force: true })` for robust cleanup.
