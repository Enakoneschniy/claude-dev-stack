---
name: dev-router
description: >
  Meta-skill that routes user messages to the correct tool/skill automatically.
  This skill is ALWAYS active and helps decide which workflow to use.
  
  Trigger on ANY user message to determine the right approach:
  
  SESSION & CONTEXT (→ session-manager):
  - First message in a session, greetings, "hi", "привет"
  - "done", "end", "всё", "хватит", "на сегодня всё"
  - "что мы делали", "resume", "continue", "продолжи"
  
  PROJECT SWITCHING (→ project-switcher):
  - "switch to", "переключись на", "другой проект", "работаем над"
  - Mentions any project name that exists in vault/projects/
  
  DEVELOPMENT / BUILDING (→ GSD):
  - "build", "implement", "fix", "сделай", "исправь", "create feature"
  - "refactor", "deploy", "ship", "plan", "phase"
  - Any coding task, feature request, or bug fix
  
  RESEARCH (→ deep-research or dev-research):
  - "research", "compare", "исследуй", "сравни", "what options"
  - "check docs", "по документации", "ask notebooklm"
  
  STATUS (→ project-switcher /projects):
  - "status", "статус", "list projects", "покажи проекты"
---

# Dev Router — Automatic Skill Selection

You are a routing layer. When a user message arrives, determine the best skill/workflow
and activate it WITHOUT asking the user which tool to use.

## Decision Tree

```
User message arrives
│
├── Is this the FIRST message in the session?
│   └── YES → Run session-manager /resume logic
│       Read vault context + last sessions
│       Present status, then handle the actual request
│
├── Does it mention a DIFFERENT project than current?
│   └── YES → Run project-switcher /switch logic
│       To detect projects, list: ls ~/vault/projects/
│       Save current context, load new project, then handle request
│
├── Is it a DEVELOPMENT task? (build, fix, implement, create)
│   ├── Small/trivial? → /gsd:fast or /gsd:quick
│   ├── New project? → /gsd:new-project
│   ├── Continuing existing? → Check /gsd:progress, then /gsd:next
│   └── Complex feature? → Full GSD cycle: discuss → plan → execute
│
├── Is it a RESEARCH question?
│   ├── Needs current web info? → deep-research
│   ├── About specific framework docs? → dev-research (NotebookLM)
│   └── Comparing options? → deep-research or dev-research
│
├── Is it about STATUS/OVERVIEW?
│   └── → project-switcher /projects
│
├── Is it END OF SESSION?
│   └── → session-manager /end logic
│       Create session log, update context.md
│
└── None of the above?
    └── → Handle normally, use vault context if relevant
```

## Project Detection

Detect current project from:
1. `git rev-parse --show-toplevel` → basename
2. `pwd` → basename
3. User's explicit mention → match against `ls ~/vault/projects/`

Do NOT hardcode project names. Always check the vault dynamically.

## Task Size Detection
FAST (no planning needed):
- Single file change, config update, typo fix
- "просто сделай X", "just do it"

QUICK (light planning):
- Feature touching 2-3 files
- Bug fix requiring investigation

FULL GSD (full planning cycle):
- New feature spanning multiple modules
- Architecture changes, DB schema, API contracts

## Composability

Skills can chain. Example flows:

1. "Compare X and Y, then build with the winner"
   → deep-research → user picks → GSD

2. "Continue working on project-name"
   → project-switcher → session-manager /resume → GSD

3. "Done for today, but note the remaining tasks"
   → session-manager /end (creates session log with TODO)

## Important

- NEVER ask "which tool should I use?" — just use the right one
- NEVER list available commands unless user asks "help"
- If uncertain between two skills, prefer the faster one
- Always load project context before doing anything
- If .planning/ exists → project uses GSD, respect its state
