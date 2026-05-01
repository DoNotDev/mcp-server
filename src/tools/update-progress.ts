// packages/mcp-server/src/tools/update-progress.ts

import {
  readImplementation,
  writeImplementation,
  parseProgress,
  assertString,
  assertBoolean,
} from '../config';

import type { ToolResult } from '../config';

export const definition = {
  name: 'update_progress',
  description:
    'Tick or untick an item in .dndev/implementation.md. Matches by substring. Optionally add a note.',
  inputSchema: {
    type: 'object',
    properties: {
      item: {
        type: 'string',
        description:
          'Substring to match the checklist item (e.g., "HomePage", "Product entity")',
      },
      done: {
        type: 'boolean',
        description: 'true = tick [x], false = untick [ ]',
      },
      note: {
        type: 'string',
        description: 'Optional note appended to the Notes section',
      },
    },
    required: ['item', 'done'],
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  assertString(args?.item, 'item');
  assertBoolean(args?.done, 'done');
  const itemMatch = args!.item as string;
  const done = args!.done as boolean;
  const note =
    args?.note != null
      ? (assertString(args.note, 'note'), args.note as string)
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

  const lines = content.split('\n');
  const matchLower = itemMatch.toLowerCase();
  let matched = false;
  let matchedLine = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (
      /^\s*- \[[ x]\]/i.test(line) &&
      line.toLowerCase().includes(matchLower)
    ) {
      if (done) {
        lines[i] = line.replace(/- \[ \]/, '- [x]');
      } else {
        lines[i] = line.replace(/- \[x\]/i, '- [ ]');
      }
      matchedLine = lines[i]!;
      matched = true;
      break;
    }
  }

  if (!matched) {
    return {
      content: [
        {
          type: 'text',
          text: `No checklist item matching "${itemMatch}" found in implementation.md.`,
        },
      ],
      isError: true,
    };
  }

  // Update timestamp
  let updated = lines.join('\n');
  updated = updated.replace(
    /\*\*Last updated:\*\*\s*.*/,
    `**Last updated:** ${new Date().toISOString()}`
  );

  // Append note if provided
  if (note) {
    const noteEntry = `- ${note}`;
    if (updated.includes('## Notes')) {
      updated = updated.replace('## Notes', `## Notes\n${noteEntry}`);
    } else {
      updated += `\n## Notes\n${noteEntry}\n`;
    }
  }

  writeImplementation(updated);

  const { stats } = parseProgress(updated);
  return {
    content: [
      {
        type: 'text',
        text: `Updated: ${matchedLine.trim()}\nProgress: ${stats.done}/${stats.total} (${stats.percent}%)`,
      },
    ],
  };
}
