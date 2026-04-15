# 27-02-SUMMARY.md

## What changed

- New file: `tests/install-patches-copy.test.mjs` (85 lines)

## Test runner output

```
# tests 2
# suites 1
# pass 2
# fail 0
```

Both cases pass:
1. copies `patches/*.md` to `<HOME>/.claude/gsd-local-patches/` (byte-for-byte
   content match)
2. respected HOME override — destination is under fake HOME

## Approach

Used in-process HOME override (`process.env.HOME = fakeHome` before dynamic
`await import('../lib/install/hooks.mjs')`). This works because the install
module calls `homedir()` at invocation time (not at import time), and Node's
`os.homedir()` re-reads `$HOME` per call on Unix.

No child-process fallback needed.

Seeded a minimal pkgRoot with `patches/`, `hooks/` (all scripts the wizard
tries to copy), and `lib/budget.mjs` so `installSessionHook()` completes its
full copy block without errors.

## Notes

- `projectsData: { projects: [] }` triggers the "no projects found — fallback
  to global settings.json" branch, which is NOT part of what we test. The
  patches copy happens BEFORE that branch and is what this test locks.
