// packages/mcp-server/src/tools/init-implementation.ts

import { existsSync } from 'fs';

import {
  IMPLEMENTATION_FILE,
  readImplementation,
  writeImplementation,
  parseProgress,
  generateImplementationContent,
  generateFromSpec,
} from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'init_implementation',
  description:
    'Create .dndev/implementation.md to track progress across sessions. Pass sections manually or use from_spec to auto-generate from spec_template.md.',
  inputSchema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description:
                'Section heading (e.g., "Phase 1: SCAFFOLD", "Auth Module")',
            },
            items: {
              type: 'array',
              items: { type: 'string' },
              description: 'Checklist items for this section',
            },
          },
          required: ['title', 'items'],
        },
        description: 'Manual sections with checklist items',
      },
      from_spec: {
        type: 'boolean',
        description:
          'Auto-generate sections from spec_template.md (entities → Phase 2, pages → Phase 1/3)',
      },
      force: {
        type: 'boolean',
        description: 'Overwrite existing implementation.md without warning',
      },
    },
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  const sections = args?.sections;
  const fromSpec = args?.from_spec;
  const force = args?.force;

  // Runtime validation
  if (fromSpec !== undefined && typeof fromSpec !== 'boolean') {
    throw new Error('from_spec must be a boolean');
  }
  if (force !== undefined && typeof force !== 'boolean') {
    throw new Error('force must be a boolean');
  }
  if (sections !== undefined) {
    if (!Array.isArray(sections)) throw new Error('sections must be an array');
    for (const s of sections) {
      if (!s || typeof s !== 'object')
        throw new Error('each section must be an object');
      if (typeof (s as Record<string, unknown>).title !== 'string')
        throw new Error('section.title must be a string');
      if (!Array.isArray((s as Record<string, unknown>).items))
        throw new Error('section.items must be an array');
    }
  }

  // Check if file already exists
  if (existsSync(IMPLEMENTATION_FILE) && !force) {
    const existing = readImplementation()!;
    const { stats } = parseProgress(existing);
    return {
      content: [
        {
          type: 'text',
          text: `implementation.md already exists (${stats.done}/${stats.total} items done, ${stats.percent}%).\nPass force: true to overwrite, or use update_progress/get_progress to work with existing file.`,
        },
      ],
    };
  }

  let finalSections: { title: string; items: string[] }[];

  if (fromSpec) {
    const generated = generateFromSpec();
    if (!generated) {
      return {
        content: [
          {
            type: 'text',
            text: 'Could not generate from spec: spec_template.md not found in guides/wai-way/.',
          },
        ],
        isError: true,
      };
    }
    finalSections = generated;
  } else if (sections && (sections as any[]).length > 0) {
    finalSections = sections as { title: string; items: string[] }[];
  } else {
    return {
      content: [
        {
          type: 'text',
          text: 'Provide sections (array of {title, items}) or set from_spec: true.',
        },
      ],
      isError: true,
    };
  }

  const content = generateImplementationContent(finalSections);
  writeImplementation(content);

  const { stats } = parseProgress(content);
  return {
    content: [
      {
        type: 'text',
        text: `implementation.md created with ${stats.total} items across ${finalSections.length} sections.\n\n${content}`,
      },
    ],
  };
}
