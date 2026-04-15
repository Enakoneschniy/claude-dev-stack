---
status: testing
phase: 24-wizard-ux-polish
source: [24-01-SUMMARY.md]
started: 2026-04-15
updated: 2026-04-15
---

# Phase 24 — Wizard UX Polish UAT

Covers UX-01 through UX-07 end-to-end. Nine test cases: seven requirement-focused
scenarios plus two full-flow integration scenarios (fresh install + re-install).

Test result values: `pass` / `fail` / `pending`. Initial state: all `pending`.

## Current Test

- test: 1 (UX-02 — loop.md bulk prompt on fresh install)
- awaiting: user response (human wizard run)

## Tests

### 1. UX-02 — loop.md bulk prompt on fresh install

expected: На wizard run с >=2 projects и GSD selected — шаг loop.md показывает один bulk select prompt "Install loop.md for all N new projects?" вместо per-project y/N.

result: pending

### 2. UX-03 — git-conventions bulk prompt on fresh install

expected: На wizard run с >=2 projects — шаг git conventions показывает один bulk select prompt "Configure git conventions for all N projects?" (Yes all / Choose per project / Skip all) вместо per-project y/N.

result: pending

### 3. UX-01 — Git sync detection with existing remote

expected: Wizard с уже настроенным origin в vault показывает "✓ Git sync: configured (origin → {url})" и select с Skip / Reconfigure / Remove. Не предлагает "Set up vault git sync?" confirm.

result: pending

### 4. UX-04 — Git sync select when no remote

expected: Wizard без remote в vault показывает select prompt "Set up vault git sync? (backup + team sharing)" с вариантами "Yes, set up now" / "Skip". Не использует type: confirm.

result: pending

### 5. UX-05 — Step counter accuracy

expected: Во всех путях wizard (fresh install, re-install, с/без GSD, с/без loop.md, skip hooks) строка "Step N of M" никогда не показывает N больше M. Все шаги, которые реально выполняются, нумеруются последовательно 1..M без дыр.

result: pending

### 6. UX-06 — Project count single source

expected: Detect banner ("✔ Vault: ~/vault (N projects)") и vault step ("Vault setup — already at ~/vault (N projects)") показывают одинаковое число N. Оба читают из installState.projects.length.

result: pending

### 7. UX-07 — No type confirm in wizard scope

expected: grep -rn для type confirm по bin/install.mjs и lib/install/ возвращает ноль совпадений. Все prompts в wizard — type select.

result: pending

### 8. Full wizard end-to-end (fresh install)

expected: Wizard запускается с нуля на чистой системе (или удалённым vault), проходит все шаги без ошибок, создаёт vault + projects + hooks + CLAUDE.md. Summary в конце показывает все installed компоненты.

result: pending

### 9. Full wizard end-to-end (re-install)

expected: Wizard запускается повторно на уже установленной системе, корректно определяет installState, pre-selects компоненты, offers skip/reconfigure на каждом шаге где применимо. Не дублирует конфигурацию.

result: pending

## Summary

- total: 9
- passed: 0
- issues: 0
- pending: 9
- skipped: 0

## Gaps

[none yet]
