/**
 * @cds/cli — CLI entry points and MCP server for claude-dev-stack.
 *
 * Phase 37: MCP server (MCP-01/02) lives in `./mcp-server.ts` and is
 * dispatched via `bin/cli.mjs` `case 'mcp': if (args[1] === 'serve')`.
 */
export const CDS_CLI_VERSION = '0.0.0-stub';

// Phase 37 MCP-01: expose the MCP server main() so bin/cli.mjs can
// dynamic-import and run it on `claude-dev-stack mcp serve`.
export { main as mcpServerMain, createServer as createMcpServer } from './mcp-server.js';

// Phase 48 DX-01: dashboard server exports.
export { startDashboard, stopDashboard } from './dashboard.js';
