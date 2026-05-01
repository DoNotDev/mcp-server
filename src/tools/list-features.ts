// packages/mcp-server/src/tools/list-features.ts

import { join } from 'path';

import { findNodeModules, PACKAGES, extractReadmeSummary } from '../config';

import type { ToolResult } from '../config';

export const definition = {
  name: 'list_features',
  description:
    'List all framework packages with a one-line summary from each README. Call in Phase 0 before designing custom solutions.',
  inputSchema: { type: 'object', properties: {} },
};

export function handler(): ToolResult {
  const nodeModules = findNodeModules();
  if (!nodeModules) {
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

  const lines: string[] = ['## Available Framework Features\n'];
  for (const pkg of PACKAGES) {
    const readmePath = join(nodeModules, pkg, 'README.md');
    const summary = extractReadmeSummary(readmePath);
    lines.push(`- **${pkg}** — ${summary || '(no description available)'}`);
  }
  lines.push(
    `\nUse \`search_framework("topic")\` or \`get_guideline("topic")\` to go deeper on any package.`
  );

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
