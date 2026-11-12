// packages/mcp-server/src/tools/search-framework.ts

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import {
  MCP_GUIDELINES_DIR,
  WAI_WAY_DIR,
  getPackageGuidelineDirs,
  findNodeModules,
  getSymbolIndex,
  assertString,
  appendFrameworkRecoverHint,
} from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'search_framework',
  description:
    'Search package guidelines, MCP-shipped setup docs, WAI-WAY templates, and public symbols for a keyword.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keyword or phrase' },
    },
    required: ['query'],
  },
};

function scanMarkdownTree(
  root: string,
  label: string,
  query: string,
  results: string[],
  maxDepth: number
) {
  if (!existsSync(root)) return;
  const walk = (dir: string, depth: number) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) {
          if (depth < maxDepth) walk(p, depth + 1);
          continue;
        }
        if (name.endsWith('.md') || name.endsWith('.md.example')) {
          if (readFileSync(p, 'utf-8').toLowerCase().includes(query)) {
            const rel = relative(root, p);
            results.push(`[${label}] ${rel}`);
          }
        }
      } catch {
        /* skip */
      }
    }
  };
  walk(root, 0);
}

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  assertString(args?.query, 'query');
  const query = args?.query.toLowerCase();
  const results: string[] = [];

  scanMarkdownTree(MCP_GUIDELINES_DIR, 'MCP', query, results, 2);
  scanMarkdownTree(WAI_WAY_DIR, 'WAI-WAY', query, results, 3);

  for (const { dir, pkg } of getPackageGuidelineDirs()) {
    const mdFiles = readdirSync(dir).filter(
      (f) => f.endsWith('.md') || f.endsWith('.md.example')
    );
    for (const file of mdFiles) {
      if (readFileSync(join(dir, file), 'utf-8').toLowerCase().includes(query))
        results.push(`[GUIDELINE] ${pkg}/${file}`);
    }
  }

  const nodeModules = findNodeModules();
  if (nodeModules) {
    const index = getSymbolIndex(nodeModules);
    const byPkg = new Map<string, string[]>();
    for (const [sym, entry] of index) {
      if (sym.toLowerCase().includes(query)) {
        const list = byPkg.get(entry.pkg) ?? [];
        list.push(sym);
        byPkg.set(entry.pkg, list);
      }
    }
    for (const [pkg, syms] of byPkg) {
      results.push(`[SYMBOL] ${pkg}: ${syms.join(', ')}`);
    }
  }

  return {
    content: [
      {
        type: 'text',
        text:
          results.length > 0
            ? `Results:\n${results.join('\n')}`
            : appendFrameworkRecoverHint('No results found.'),
      },
    ],
  };
}
