# Phase 37 Plan 04 — Summary

**Commit:** d762bd2
**Tasks completed:** 6 of 6

## bin/cli.mjs `case 'mcp':` diff (annotated)

```diff
 case 'mcp': {
-  const { main } = await import('../lib/mcp.mjs');
-  await main(args.slice(1));
+  if (args[1] === 'serve') {
+    // Phase 37 MCP-02: route to the CDS MCP server under packages/cds-cli/
+    const { main } = await import('../packages/cds-cli/dist/mcp-server.js');
+    await main(args.slice(2));
+  } else {
+    // Existing third-party MCP catalog (install/remove/list/bare)
+    const { main } = await import('../lib/mcp.mjs');
+    await main(args.slice(1));
+  }
   break;
 }
```

`printHelp()` gained one row:

```
claude-dev-stack mcp serve             Run the CDS MCP server (stdio, for Claude Code integration)
```

Root `package.json` `bin` field is byte-identical (verified by reviewer: single entry `claude-dev-stack`).

## Wizard step placement (bin/install.mjs)

Imported:

```js
import { installCdsMcpServer } from '../lib/install/mcp.mjs';
```

Step pushed **unconditionally** after the session-hooks step (which is
itself behind `hookAction === 'install'`). Rationale: users who skip the
hooks wizard still benefit from MCP-tool exposure to Claude Code.

```js
steps.push({ label: 'CDS MCP server', run: async (n, t) => {
  installCdsMcpServer(n, t, projectsData);
}});
```

## Idempotency verified

Both in unit tests (`install-mcp.test.ts`) and manually:

| Scenario                                                   | Outcome         | Change? |
|-------------------------------------------------------------|-----------------|---------|
| settings.json missing                                       | `added`         | yes     |
| settings.json has matching `cds` entry                      | `no-op`         | **no**  |
| settings.json has `cds` with different command/args         | `updated`       | yes     |
| settings.json missing `mcp.servers` key but has `hooks`     | `added`         | yes; `hooks` preserved |
| settings.json has `github` alongside no `cds`               | `added`         | yes; `github` preserved byte-for-byte |
| Second sequential run (after `added`)                       | `no-op`         | **no** (byte-equal)    |
| Corrupt JSON (`{ not valid`)                                | `skipped-corrupt` | **no** (byte-equal)  |
| `{}` empty object                                           | `added`         | yes     |

The "no-op" case compares Buffer bytes before and after the call — not just
equivalent JSON — so trailing-newline or key-ordering drift would fail.

## Command shape decision (direct vs npx)

Per RESEARCH §4.4 we picked **`command: 'claude-dev-stack'`** directly. The
wizard runs only after the user installed `claude-dev-stack` globally or
invoked via `npx`; the binary is present on PATH in both cases. npx-wrapped
dispatch (`npx -y claude-dev-stack mcp serve`) would add 2–5s of
resolution-startup latency per MCP tool call — unacceptable for interactive
workflows. PATH requirement is documented in NOTICES.md entry.

## mcp-server.ts wiring

Added helpers at module scope:

```ts
function resolveSessionsDBPath(): string {
  const base =
    process.env['CDS_TEST_VAULT'] ??
    join(homedir(), 'vault', 'projects', basename(process.cwd()));
  const dbPath = join(base, 'sessions.db');
  try { statSync(dbPath); } catch {
    throw new VaultNotFoundError(`Sessions DB not found at ${dbPath}`);
  }
  return dbPath;
}

function textEnvelope(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}
```

CallTool switch body now has 5 real-dispatch branches; stubs deleted.

`mcp-server.test.ts`:
- Removed the Plan 01 stub-phase test (`'throws InternalError (stub phase)'`).
- Added 2 new cases — one round-trips `sessions.search` via
  `CDS_TEST_VAULT` pointing at a fixture sessions.db (asserts
  `result.content[0].text` parses as `{ hits: [...] }` with ≥1 hit); the
  other asserts `planning.status` on a stubbed empty vault throws
  `McpError` with `data.kind === 'NotAGsdProjectError'`.

## Verification

| Check                                                | Result                                  |
|------------------------------------------------------|-----------------------------------------|
| `pnpm --filter @cds/cli exec tsc --noEmit`           | clean                                   |
| `pnpm --filter @cds/cli test`                        | **80 passed, 1 skipped** (rg-only)      |
| `pnpm --filter @cds/cli build`                       | emits `dist/mcp-server.js`              |
| `pnpm exec vitest run` (full monorepo)                | **1170 passed, 3 failed (pre-existing detect.test.mjs), 4 skipped** |
| Root `package.json` `bin` key count                  | 1 (unchanged)                           |

Pre-existing failures in `tests/detect.test.mjs` match the phase brief's
"3 pre-existing detect.test.mjs failures preserved" — they were already
failing on main before Phase 37 touched anything.

## Deviations from plan

- **CLI dispatch test** — the plan's original "bare `mcp` routes to
  catalog" case hung because `lib/mcp.mjs` `list` path goes to
  interactive territory when `claude` CLI is missing. Pivoted to
  `mcp foobar-unknown-subcommand`, which hits the `switch default:`
  branch in `lib/mcp.mjs` — prints the catalog help banner and exits
  immediately. Equivalent coverage (confirms the fall-through path)
  without the stdin-wait hang.
- **`install-mcp.test.ts` import of `_writeMcpEntry`** uses a
  `@ts-expect-error` comment since `lib/install/mcp.mjs` ships without a
  `.d.ts`. Vitest resolves it at runtime. Plan acknowledged this
  workaround explicitly.
- **`mcp-server.test.ts` sessions.search test** uses
  `CDS_TEST_VAULT=<tmpdir containing sessions.db>` rather than the
  plan's `/tmp/...` literal — the `buildFixtureSessionsDB` helper already
  provides a clean tmpdir, so we pointed the env at its parent.
- **Wizard step is unconditional** (plan wavered on this in Task
  37-04-04). Users who opt out of hooks still get MCP registered —
  independent concern, smaller blast radius on re-runs.
