---
name: dev-router
description: >
  Meta-skill that routes user messages to the correct tool/skill automatically.
  This skill is ALWAYS active and helps decide which workflow to use.
  
  Trigger on ANY user message to determine the right approach:
  
  SESSION & CONTEXT (→ session-manager):
  - First message in a session, "привет", "начинаем", "hi", greeting
  - "всё", "хватит", "заканчиваем", "done", "end", "конец"
  - "что мы делали", "где остановились", "what did we do", "last time"
  - "handoff", "передать", "продолжить", "resume"
  
  PROJECT SWITCHING (→ project-switcher):
  - Mentions different project: "crypto", "крипто", "portal", "портал"
  - "bikotrading", "biko", "webflow", "landing"
  - "ai news", "новостной", "tech news"
  - "real estate", "недвижимость"
  - "switch", "переключись", "другой проект", "работаем над"
  
  DEVELOPMENT / BUILDING (→ GSD):
  - "сделай", "реализуй", "implement", "build", "create feature"
  - "fix", "почини", "исправь", "баг", "bug", "broken"
  - "новый проект", "new project", "с нуля", "from scratch"
  - "план", "plan", "roadmap", "фаза", "phase"
  - "задеплой", "deploy", "ship", "release"
  - "рефактор", "refactor", "optimize", "оптимизируй"
  - Any coding task, feature request, or bug fix
  
  RESEARCH - WEB (→ deep-research):
  - "исследуй", "research", "найди варианты", "сравни", "compare"
  - "какие есть", "what options", "best practices", "как другие делают"
  - "обзор", "overview", "market research", "конкуренты", "competitors"
  - "выбери стек", "choose stack", "что лучше X или Y"
  - Questions about technologies, tools, approaches needing web search
  
  RESEARCH - DOCS (→ dev-research / NotebookLM):
  - "спроси в документации", "check docs", "ask notebooklm"
  - "как это работает в Payload", "how does X work in Y"
  - "по нашим записям", "in our notes", "что мы решили про"
  - "загрузи доки", "load docs", "add to notebook"
  - Questions about specific frameworks where grounded answers matter
  
  QUICK TASK (→ /gsd:quick or /gsd:fast):
  - Small, self-contained requests: "добавь кнопку", "поменяй цвет"
  - "быстро", "quick", "just do it", "просто сделай"
  - Changes that don't need planning: typo fixes, config changes
  
  STATUS / OVERVIEW (→ project-switcher /projects or /gsd:progress):
  - "статус", "status", "что у нас", "progress", "как дела с проектами"
  - "покажи проекты", "list projects", "overview"
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
│       Read ~/vault/projects/{current}/context.md + last 3 sessions
│       Present status, then handle the actual request
│
├── Does it mention a DIFFERENT project than current?
│   └── YES → Run project-switcher /switch logic
│       Save current context, load new project, then handle request
│
├── Is it a DEVELOPMENT task? (build, fix, implement, create)
│   ├── Small/trivial? → /gsd:fast or /gsd:quick
│   ├── New project? → /gsd:new-project (or /gsd:map-codebase first if code exists)
│   ├── Continuing existing? → Check /gsd:progress, then /gsd:next
│   └── Complex feature? → Full GSD cycle: discuss → plan → execute
│
├── Is it a RESEARCH question?
│   ├── Needs current web info? → deep-research /research
│   ├── About specific framework docs? → dev-research /docs-query
│   └── Comparing options? → dev-research /compare OR deep-research
│
├── Is it about STATUS/OVERVIEW?
│   └── → project-switcher /projects + /gsd:progress
│
├── Is it END OF SESSION?
│   └── → session-manager /end logic
│       Create session log, update context.md
│
└── None of the above?
    └── → Handle normally, use vault context if relevant
```

## Auto-Detection Rules

### Language Detection
User communicates in Russian. Code and commits in English.
Skill outputs (session logs, ADR, context.md) in Russian.
Code comments, variable names, commit messages in English.

### Project Detection
Detect current project from:
1. `git rev-parse --show-toplevel` → basename
2. `pwd` → match against known project names
3. User's explicit mention

Map natural language to projects:
- "крипто", "crypto", "портал" → crypto-portal
- "новости", "news", "ai news", "tech" → ai-news-portal
- "недвижимость", "real estate" → ai-real-estate
- "biko", "bikotrading", "webflow", "лендинг" → bikotrading-webflow

### Task Size Detection
FAST (no planning needed):
- Single file change
- Config update
- Typo/text fix
- "просто сделай X"

QUICK (light planning):
- Feature touching 2-3 files
- Bug fix requiring investigation
- "добавь X"

FULL GSD (full planning cycle):
- New feature spanning multiple modules
- Architecture changes
- "новый проект", "с нуля"
- Anything touching database schema, API contracts, auth

### Research Type Detection
DEEP RESEARCH (web search, current info):
- "какие есть варианты для..."
- "что лучше X или Y"
- "тренды", "trends", "best in 2026"
- Unknown technology/tool

DOCS QUERY (NotebookLM, grounded):
- "как в Payload CMS сделать..."
- "по документации Next.js..."
- "что мы решили про..."
- Known technology, need specific API/config answer

## Composability

Skills can chain. Example flows:

1. "Сравни Strapi и Payload CMS и сделай портал на лучшем"
   → deep-research /compare → user picks winner → /gsd:new-project

2. "Продолжи работу над крипто-порталом"
   → project-switcher /switch crypto → session-manager /resume → /gsd:resume-work

3. "Заканчиваем, но сначала запиши что нужно доделать"
   → /gsd:pause-work → session-manager /end

## Important

- NEVER ask "which tool should I use?" — just use the right one
- NEVER list available commands unless user asks "help" or "что умеешь"
- If uncertain between two skills, prefer the one that gives faster results
- Always load project context before doing anything (vault + GSD state)
- If GSD STATE.md exists in .planning/ — respect GSD workflow state
- If no .planning/ exists — this is either a new project or non-GSD work
