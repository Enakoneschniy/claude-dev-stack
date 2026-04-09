---
name: project-switcher
description: >
  Switch between development projects while preserving context.
  Trigger when user mentions a different project by name or alias:
  "crypto", "крипто", "портал", "crypto portal",
  "ai news", "новостной", "tech news", "news portal",
  "bikotrading", "biko", "webflow", "лендинг", "landing",
  "real estate", "недвижимость", "realestate".
  Also trigger on: "switch to", "переключись на", "работаем над", "давай с", "другой проект",
  "покажи проекты", "list projects", "статус проектов", "all projects", "что у нас есть".
  Silently saves current context before switching.
---

# Project Switcher Skill

Manages context switching between multiple development projects. Ensures no context is lost when jumping between projects.

## Vault Location
Default: `~/vault/`

## Project Registry
```bash
cat ~/vault/meta/project-registry.md
```

## Commands

### /switch PROJECT_NAME
Switch active project context.

Steps:
1. **Save current context** — if there's active work, create a quick session checkpoint:
   ```bash
   VAULT=${VAULT_PATH:-~/vault}
   CURRENT=$(basename $(git rev-parse --show-toplevel 2>/dev/null || pwd))
   
   # Quick checkpoint for current project
   echo "## Checkpoint $(date +%H:%M) — switching to $NEW_PROJECT" >> \
     "$VAULT/projects/$CURRENT/sessions/$(date +%Y-%m-%d)-session.md"
   ```

2. **Load new project context**:
   ```bash
   NEW_PROJECT="$1"
   cat "$VAULT/projects/$NEW_PROJECT/context.md"
   
   # Last session
   last=$(ls -t "$VAULT/projects/$NEW_PROJECT/sessions/"*.md 2>/dev/null | head -1)
   [ -n "$last" ] && cat "$last"
   ```

3. **Present brief status** of new project and suggest what to work on.

### /projects
List all projects with status.

```bash
VAULT=${VAULT_PATH:-~/vault}
for dir in "$VAULT/projects"/*/; do
  [ "$(basename $dir)" = "_template" ] && continue
  name=$(basename "$dir")
  status=$(grep "^\\*\\*Статус\\*\\*:" "$dir/context.md" 2>/dev/null | head -1)
  last=$(ls -t "$dir/sessions/"*.md 2>/dev/null | head -1)
  last_date=$([ -n "$last" ] && basename "$last" | cut -d'-' -f1-3 || echo "no sessions")
  echo "• $name — $status (last: $last_date)"
done
```

### /new-project NAME
Scaffold a new project in the vault.

```bash
VAULT=${VAULT_PATH:-~/vault}
PROJECT="$1"

cp -r "$VAULT/projects/_template/" "$VAULT/projects/$PROJECT/"
sed -i "s/{{PROJECT_NAME}}/$PROJECT/g" "$VAULT/projects/$PROJECT/context.md"
sed -i "s/{{DATE}}/$(date +%Y-%m-%d)/g" "$VAULT/projects/$PROJECT/context.md"

echo "Created vault entry for $PROJECT"
echo "→ Edit $VAULT/projects/$PROJECT/context.md to fill in details"
```

## Project Name Aliases

Map natural language to project directory names:
- "crypto portal", "crypto", "крипто" → crypto-portal
- "ai news", "news portal", "tech news", "новостной" → ai-news-portal
- "real estate", "недвижимость", "realestate" → ai-real-estate
- "bikotrading", "biko", "webflow" → bikotrading-webflow

## Cross-Project Awareness

When working on one project and a task affects another:
1. Note the cross-project impact in the session log
2. Add a TODO to the affected project's context.md
3. Inform the user: "This change may affect [other project] — noted in their context.md"

## Relationship Awareness

Some projects share code or patterns:
- crypto-portal ↔ ai-news-portal: same stack, shared patterns
- All projects: shared infra in ~/vault/shared/

When making changes to shared patterns:
- Update ~/vault/shared/patterns.md
- Note which projects are affected
