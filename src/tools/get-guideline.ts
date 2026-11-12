// packages/mcp-server/src/tools/get-guideline.ts

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import {
  MCP_GUIDELINES_DIR,
  WAI_WAY_DIR,
  getPackageGuidelineDirs,
  escapeRegExp,
  assertString,
  appendFrameworkRecoverHint,
} from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'get_guideline',
  description:
    'Fetch framework guidelines: package `guidelines/` topics plus MCP-shipped setup docs (SETUP_*). Use search_framework to discover filenames.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description:
          'Topic with optional section (e.g., "styling", "styling:colors")',
      },
    },
    required: ['topic'],
  },
};

function listMarkdownFiles(root: string, maxDepth: number): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string, depth: number) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) {
          if (depth < maxDepth) walk(p, depth + 1);
          continue;
        }
        if (name.endsWith('.md') || name.endsWith('.md.example')) out.push(p);
      } catch {
        /* skip */
      }
    }
  };
  walk(root, 0);
  return out;
}

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  assertString(args?.topic, 'topic');
  const fullTopic = args?.topic;
  const [topic, section] = fullTopic.split(':');
  const sources: Array<{ dir: string; type: string }> = [
    { dir: MCP_GUIDELINES_DIR, type: 'MCP' },
    { dir: WAI_WAY_DIR, type: 'WAI-WAY' },
    ...getPackageGuidelineDirs().map((d) => ({
      dir: d.dir,
      type: 'GUIDELINE',
    })),
  ];
  for (const source of sources) {
    if (!existsSync(source.dir)) continue;
    let paths: string[];
    if (source.dir === WAI_WAY_DIR) paths = listMarkdownFiles(source.dir, 3);
    else if (source.dir === MCP_GUIDELINES_DIR)
      paths = listMarkdownFiles(source.dir, 2);
    else
      paths = readdirSync(source.dir)
        .filter((f) => f.endsWith('.md') || f.endsWith('.md.example'))
        .map((f) => join(source.dir, f));
    for (const filePath of paths) {
      const file = relative(source.dir, filePath) || filePath;
      if (topic && file.toLowerCase().includes(topic.toLowerCase())) {
        const content = readFileSync(filePath, 'utf-8');
        if (!section) {
          return {
            content: [
              {
                type: 'text',
                text: `[${source.type}] ${file}:\n\n${content.trim()}`,
              },
            ],
          };
        }
        const escapedSection = escapeRegExp(section);
        const match = content.match(
          new RegExp(`##\\s+.*${escapedSection}.*\\n([\\s\\S]*?)(?=##|$)`, 'i')
        );
        if (match && match[1]) {
          return {
            content: [
              {
                type: 'text',
                text: `[${source.type}] ${topic} > ${section}:\n\n${match[1].trim()}`,
              },
            ],
          };
        }
      }
    }
  }
  return {
    content: [
      {
        type: 'text',
        text: appendFrameworkRecoverHint(
          `No guideline found for: ${fullTopic}`
        ),
      },
    ],
    isError: true,
  };
}
