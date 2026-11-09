#!/usr/bin/env node
// packages/mcp-server/src/index.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  PKG_VERSION,
  flushSessionToCaptainLog,
  flushProtocol,
  trackToolCall,
  findNodeModules,
} from './config';

// --- Tool modules ---
import * as approvePhase from './tools/approve-phase';
import * as completePhase from './tools/complete-phase';
import * as getGuideline from './tools/get-guideline';
import * as getPhaseStatus from './tools/get-phase-status';
import * as getProgress from './tools/get-progress';
import * as getProjectHistory from './tools/get-project-history';
import * as initImplementation from './tools/init-implementation';
import * as listFeatures from './tools/list-features';
import * as lookupSymbol from './tools/lookup-symbol';
import * as recordLesson from './tools/record-lesson';
import * as reload from './tools/reload';
import * as runTypecheck from './tools/run-typecheck';
import * as scoreLesson from './tools/score-lesson';
import * as searchFramework from './tools/search-framework';
import * as setupCoach from './tools/setup-coach';
import * as startPhase from './tools/start-phase';
import * as updateProgress from './tools/update-progress';

// Handle --version / -v before anything else
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(PKG_VERSION);
  process.exit(0);
}

// --- Tool Registry ---
const tools = [
  startPhase,
  completePhase,
  approvePhase,
  getPhaseStatus,
  reload,
  lookupSymbol,
  getGuideline,
  searchFramework,
  listFeatures,
  initImplementation,
  updateProgress,
  getProgress,
  getProjectHistory,
  runTypecheck,
  recordLesson,
  scoreLesson,
  setupCoach,
];

const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

/** Tools that don't require node_modules — phase tracking, captain's log,
 *  memory, implementation, typecheck, setup coach, and guide tools
 *  (guides can partially function without node_modules). */
const NODEMODULES_EXEMPT = new Set([
  'get_guideline',
  'search_framework',
  'start_phase',
  'complete_phase',
  'approve_phase',
  'get_phase_status',
  'get_project_history',
  'run_typecheck',
  'record_lesson',
  'score_lesson',
  'setup_coach',
  'init_implementation',
  'update_progress',
  'get_progress',
]);

// --- Flush session data + cached protocol when MCP server process exits ---
process.on('exit', () => {
  try {
    flushSessionToCaptainLog();
    flushProtocol();
  } catch {
    /* best-effort on exit */
  }
});
process.on('SIGINT', () => {
  process.exit(0);
});
process.on('SIGTERM', () => {
  process.exit(0);
});

// --- Server ---
const server = new Server(
  { name: 'donotdev-mcp', version: PKG_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => t.definition),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    // Track every tool call during active phase (lightweight — just counter increment)
    if (name !== 'start_phase' && name !== 'approve_phase') {
      trackToolCall(name);
    }

    if (!findNodeModules() && !NODEMODULES_EXEMPT.has(name)) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: node_modules not found. Run bun install first.',
          },
        ],
        isError: true,
      };
    }

    const tool = toolMap.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    return await tool.handler(args as Record<string, unknown> | undefined);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`DoNotDev MCP Server v${PKG_VERSION} running`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
