---
name: session-manager
description: >
  Log development sessions at end and generate handoffs. Triggers on end-of-session
  signals ("всё", "хватит", "заканчиваем", "done", "end", "конец", "на сегодня всё", "finish")
  and explicit resume/handoff/status requests ("resume", "продолжи", "handoff",
  "передай контекст", "what did we do", "где остановились"). Does NOT auto-activate
  on greetings or first-message — project context is loaded silently at SessionStart
  by hooks/session-start-context.sh.
---

# Session Manager Skill

> Context is loaded at SessionStart by `hooks/session-start-context.sh`.
> This skill only handles end-of-session logging (`/end`) and explicit resume requests (`/resume`).

Manage development session lifecycle for multi-project work. Eliminates Claude Code "amnesia" by maintaining session logs and project context in an Obsidian vault.

## Vault Location
Default: `~/vault/`
Override with env var: `VAULT_PATH`

## Commands

### /resume
Explicit re-load of project context. The SessionStart hook (`hooks/session-start-context.sh`)
already loads context at session start — use this command only to force a re-read
mid-session (e.g., after manually editing `context.md` or after switching projects).

```bash
VAULT="${VAULT_PATH:-$HOME/vault}"
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
PROJECT_DIR="$VAULT/projects/$PROJECT_NAME"

cat "$PROJECT_DIR/context.md" 2>/dev/null || echo "No context.md found for $PROJECT_NAME"

# Last 3 session logs
for f in $(ls -t "$PROJECT_DIR/sessions/"*.md 2>/dev/null | head -3); do
  echo "=== $(basename "$f") ==="
  cat "$f"
  echo ""
done
```

### /end or /done
Create session log and update context.

```bash
PROJECT_NAME=$(basename $(git rev-parse --show-toplevel 2>/dev/null || pwd))
VAULT=${VAULT_PATH:-~/vault}
PROJECT_DIR="$VAULT/projects/$PROJECT_NAME"
SESSION_FILE="$PROJECT_DIR/sessions/$(date +%Y-%m-%d)-SESSION_SLUG.md"

# Create session log
cat > "$SESSION_FILE" << 'EOF'
# Session: DATE — DESCRIPTION

## Что сделано
- (list concrete changes: files modified, features added, bugs fixed)

## Решения
- (architectural decisions made, if any)

## TODO на следующую сессию
- [ ] (specific actionable items)

## Проблемы
- (bugs encountered, workarounds used, tech debt noted)

## Изменённые файлы
- (list key files that were modified)

## Зависимости
- (new packages added, version changes)
EOF

# Update context.md "Session History" section (D-01, D-02)
# Invokes the same Node wrapper the Stop hook uses — idempotent by filename.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && pwd)"
UPDATER="$REPO_ROOT/hooks/update-context.mjs"
if [ -f "$UPDATER" ]; then
  VAULT_PATH="$VAULT" CDS_PROJECT_NAME="$PROJECT_NAME" \
    node "$UPDATER" "$(basename "$SESSION_FILE")" 2>/dev/null || true
fi
```

Replace SESSION_SLUG with a kebab-case summary (e.g., "fix-auth-flow", "add-telegram-pipeline").
Replace placeholders with actual session data.

### /handoff
Generate a comprehensive handoff document for continuing work in a new session or by another developer.

```bash
PROJECT_NAME=$(basename $(git rev-parse --show-toplevel 2>/dev/null || pwd))
VAULT=${VAULT_PATH:-~/vault}

# Generate handoff
echo "# Handoff: $PROJECT_NAME — $(date +%Y-%m-%d)"
echo ""
echo "## Current State"
cat "$VAULT/projects/$PROJECT_NAME/context.md"
echo ""
echo "## Recent Changes (git)"
git log --oneline -10 2>/dev/null
echo ""
echo "## Uncommitted Changes"
git diff --stat 2>/dev/null
echo ""
echo "## Active TODO"
grep -r "TODO" "$VAULT/projects/$PROJECT_NAME/sessions/" 2>/dev/null | tail -20
```

### /status
Quick overview of all projects.

```bash
VAULT=${VAULT_PATH:-~/vault}
echo "# Project Status Overview"
echo ""
for dir in "$VAULT/projects"/*/; do
  [ "$(basename $dir)" = "_template" ] && continue
  project=$(basename "$dir")
  last_session=$(ls -t "$dir/sessions/"*.md 2>/dev/null | head -1)
  if [ -n "$last_session" ]; then
    last_date=$(basename "$last_session" | cut -d'-' -f1-3)
    echo "## $project (last: $last_date)"
    grep "^- \[ \]" "$last_session" 2>/dev/null | head -5
  else
    echo "## $project (no sessions yet)"
  fi
  echo ""
done
```

## ADR Creation

When an architectural decision is made during the session:

```bash
VAULT=${VAULT_PATH:-~/vault}
PROJECT_NAME=$(basename $(git rev-parse --show-toplevel 2>/dev/null || pwd))
ADR_DIR="$VAULT/projects/$PROJECT_NAME/decisions"
NEXT_NUM=$(printf "%04d" $(($(ls "$ADR_DIR"/*.md 2>/dev/null | wc -l) + 1)))

cat > "$ADR_DIR/${NEXT_NUM}-DECISION_SLUG.md" << 'EOF'
# ADR-NNNN: Title

**Дата**: YYYY-MM-DD
**Статус**: accepted

## Контекст
Why the question arose

## Решение
What we chose

## Альтернативы
What we considered and why we rejected it

## Последствия
What this changes in the project
EOF
```

## Best Practices
1. Context loads automatically at SessionStart — use /resume only to force a re-read mid-session
2. Always use /end at session end — future you will thank you
3. ADRs are cheap to write and expensive to not have
4. Session logs should be specific: file names, function names, not vague descriptions
5. TODOs should be actionable: "implement X in file Y" not "finish feature"
