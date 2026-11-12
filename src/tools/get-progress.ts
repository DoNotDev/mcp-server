// packages/mcp-server/src/tools/get-progress.ts

import { readImplementation, parseProgress, expectString } from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'get_progress',
  description:
    'Read .dndev/implementation.md with progress stats. Optionally filter to a section.',
  inputSchema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description:
          'Filter to section containing this text (e.g., "Phase 1", "SCAFFOLD")',
      },
    },
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  const section =
    args?.section != null
      ? expectString(args.section, 'section')
      : undefined;

  const content = readImplementation();
  if (!content) {
    return {
      content: [
        {
          type: 'text',
          text: 'No implementation.md found. Call init_implementation() first.',
        },
      ],
      isError: true,
    };
  }

  const { stats, sections, filtered } = parseProgress(content, section);

  const parts = [
    `## Implementation Progress`,
    `**Overall:** ${stats.done}/${stats.total} (${stats.percent}%)`,
    '',
  ];

  if (sections.length > 0) {
    parts.push('### By Section');
    for (const s of sections) {
      const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
      parts.push(`- **${s.title}:** ${s.done}/${s.total} (${pct}%)`);
    }
    parts.push('');
  }

  parts.push('---', '', filtered);

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
