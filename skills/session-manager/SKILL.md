---
name: session-manager
description: >
  Automatically manage development session lifecycle. Load context at start, log sessions at end.
  ALWAYS trigger on first message in any session (greetings, "привет", "hi", "начинаем").
  ALWAYS trigger on session end signals: "всё", "хватит", "заканчиваем", "done", "end", "конец", "на сегодня всё", "finish".
  Also trigger on: "что делали", "где остановились", "last time", "resume", "продолжи", "handoff", "передай контекст", "what did we do", "continue where we left off".
  Auto-activates silently — reads context and presents status without being asked.
---

# Session Manager Skill

Manage development session lifecycle for multi-project work. Eliminates Claude Code "amnesia" by maintaining session logs and project context in an Obsidian vault.

## Vault Location
Default: `~/vault/`
Override with env var: `VAULT_PATH`

## Commands

### /resume or /start
Load project context and recent session history.

```bash
# Detect current project from git or cwd
PROJECT_NAME=$(basename $(git rev-parse --show-toplevel 2>/dev/null || pwd))
VAULT=${VAULT_PATH:-~/vault}
PROJECT_DIR="$VAULT/projects/$PROJECT_NAME"

# Read project context
cat "$PROJECT_DIR/context.md" 2>/dev/null || echo "No context.md found for $PROJECT_NAME"

# Read last 3 session logs
for f in $(ls -t "$PROJECT_DIR/sessions/"*.md 2>/dev/null | head -3); do
  echo "=== $(basename $f) ==="
  cat "$f"
  echo ""
done
```

After reading context, provide a brief status:
1. Current project state (from context.md)
2. Last session summary (what was done, what's TODO)
3. Suggested next steps

Do NOT ask "what should we work on?" — propose based on TODO from last session.

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

# Update context.md "Session History" section
# Add link to new session log
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

## Automatic Behavior

When the skill detects this is the FIRST message in a Claude Code session:
- Auto-run /resume logic (read context + last sessions)
- Present brief status without being asked

When user signals end of work ("всё", "хватит", "заканчиваем", "done", "end"):
- Auto-run /end logic
- Confirm: "Сессия залогирована. TODO: [list]"

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
1. Always use /resume at session start — never work blind
2. Always use /end at session end — future you will thank you
3. ADRs are cheap to write and expensive to not have
4. Session logs should be specific: file names, function names, not vague descriptions
5. TODOs should be actionable: "implement X in file Y" not "finish feature"
