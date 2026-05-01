// packages/mcp-server/src/tools/reload.ts

import { resetCaches } from '../config';

import type { ToolResult } from '../config';

export const definition = {
  name: 'reload',
  description:
    'Clear cached data and re-read from disk. Call this after upgrading @donotdev/* package versions. If lookup_symbol returns stale or incorrect data, try reload first before reporting a bug.',
  inputSchema: { type: 'object', properties: {} },
};

export function handler(): ToolResult {
  resetCaches();
  return {
    content: [
      {
        type: 'text',
        text: 'Caches cleared. Next lookup_symbol / get_guideline will re-read from disk.',
      },
    ],
  };
}
