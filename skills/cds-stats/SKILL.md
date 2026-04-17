---
name: cds-stats
description: |
  Show project memory statistics: session count, observation counts by type,
  entity count, top entities, and project planning status.
trigger_phrases:
  - /cds-stats
  - cds-stats
---

# /cds-stats -- Project memory dashboard

Display a summary of the project's session memory and planning status.

## How to execute

1. **Get planning status (MCP tool):**
   ```
   mcp__cds__planning.status()
   ```
   This returns the current ROADMAP phase counts and STATE position.

2. **Get session memory stats:**
   Use Bash to call the mem-stats CLI command:
   ```
   Bash("npx claude-dev-stack mem-stats")
   ```
   This returns: project name, session count (total + this week), observation counts by type, entity count + top entities (most referenced), last activity.

3. **Combine and present:**
   Format both outputs into a single dashboard:
   ```
   Project Memory Dashboard
   ========================

   [planning.status output -- phase progress, current position]

   [mem-stats output -- session count, observations, entities, last activity]
   ```

   The mem-stats output includes entity data per D-143/D-145:
   - Total entity count
   - Top entities (most referenced across observations)

## Fallback

If `mcp__cds__planning.status` is not available, skip the planning section and show only the mem-stats CLI output.

## Output format

The combined dashboard shows:
- Planning: phase progress, current position (from MCP)
- Sessions: total count + this week count
- Observations: total + breakdown by type (decision, bug, pattern, etc.)
- Entities: total count + top referenced entities
- Last activity: date of most recent session

## When to use

- User asks "how's the project going"
- User asks about session/memory statistics
- User asks about top entities or most referenced concepts
- User wants to see project health overview
- User explicitly invokes `/cds-stats`
