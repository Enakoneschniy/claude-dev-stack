# 🧠 Claude Dev Stack

**One command to set up a complete AI-powered development workflow with Claude Code.**

Solves the #1 problem: Claude Code forgets everything between sessions.

```bash
npx claude-dev-stack
```

Works on Mac, Linux, and Windows (WSL).

---

## What It Does

An interactive wizard that installs and configures:

| Component | What it does |
|-----------|-------------|
| **Knowledge Vault** | Obsidian-compatible markdown vault that stores project context, session logs, and architecture decisions across all your projects |
| **GSD (Get Shit Done)** | Spec-driven development system with subagent orchestration — plans, executes in fresh contexts, verifies |
| **Obsidian Skills** | Official skills from Obsidian's CEO — teaches Claude Code correct vault file formats |
| **Custom Skills** | Session manager (auto-log sessions), project switcher (multi-project), auto-router (intent-based skill selection) |
| **Deep Research** | Structured web research from terminal — outlines, deep investigation, markdown reports |
| **NotebookLM** | Docs-grounded research via Google NotebookLM — no hallucinations, citation-backed answers |

## How It Works After Setup

You just talk to Claude Code naturally:

| You say | Claude does |
|---------|------------|
| "hi, let's continue" | Loads project context + last session TODO |
| "build user auth with email" | GSD plans → executes in clean contexts → commits |
| "research best CMS options for 2026" | Deep Research → structured report |
| "switch to my-other-project" | Saves context, loads other project |
| "done for today" | Creates session log, updates context |

**No slash commands needed.** Skills activate automatically based on what you say.

## Requirements

- Node.js 18+
- Git
- Python 3.10+ (for Deep Research and NotebookLM)
- [Claude Code CLI](https://docs.claude.com) (recommended)

## What Gets Installed

```
~/vault/                          ← Knowledge vault (Obsidian-compatible)
├── meta/                         ← Project registry, session protocol
├── shared/                       ← Cross-project patterns, infra notes
├── projects/
│   ├── your-project/
│   │   ├── context.md            ← Live project context (YOU fill this in)
│   │   ├── decisions/            ← Architecture Decision Records
│   │   └── sessions/             ← Auto-generated session logs
│   └── _template/
└── CLAUDE.md.template

~/.claude/skills/                 ← Claude Code skills
├── obsidian/                     ← kepano/obsidian-skills
├── gsd-*/                        ← GSD skills
├── session-manager/              ← Auto session logging
├── project-switcher/             ← Multi-project support
├── dev-router/                   ← Intent-based auto-routing
├── dev-research/                 ← NotebookLM integration
└── research-*/                   ← Deep Research

~/projects/your-project/
└── CLAUDE.md                     ← Per-project instructions for Claude Code
```

## After Setup

**The most important step:** fill in `context.md` for each project. This is what Claude Code reads to understand your project. Without it, everything else is useless.

```bash
# Open in your editor
code ~/vault/projects/my-project/context.md

# Or let Claude Code do it
cd ~/projects/my-project
claude
> "help me fill in context.md for this project"
```

## For Teams

Every team member runs the same command:

```bash
npx claude-dev-stack
```

Each person gets their own vault with personalized CLAUDE.md. Share the vault structure via git if you want synchronized context across the team.

## Credits

Built on top of:
- [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done) by TÂCHES
- [Obsidian Skills](https://github.com/kepano/obsidian-skills) by kepano
- [Deep Research Skills](https://github.com/Weizhena/Deep-Research-skills) by Weizhena
- [notebooklm-py](https://github.com/teng-lin/notebooklm-py) by teng-lin

## License

MIT
