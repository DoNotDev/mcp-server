// packages/mcp-server/src/tools/lookup-symbol.ts

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  findNodeModules,
  getProtocol,
  saveProtocol,
  getSymbolIndex,
  assertString,
} from '../config';

import type { ToolResult } from '../config';

export const definition = {
  name: 'lookup_symbol',
  description:
    'Get JSDoc context, @examples, and TypeScript types for any DoNotDev symbol. MUST be called before using any @donotdev component.',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description:
          'Symbol name (e.g., "defineEntity", "useCrud", "DataTable")',
      },
      package: { type: 'string', description: 'Package name (optional)' },
    },
    required: ['symbol'],
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  assertString(args?.symbol, 'symbol');
  const symbol = args!.symbol as string;
  const nodeModules = findNodeModules();
  if (!nodeModules)
    return {
      content: [
        {
          type: 'text',
          text: 'Error: node_modules not found. Run bun install first.',
        },
      ],
      isError: true,
    };

  // Track the lookup
  const protocol = getProtocol();
  if (!protocol.lookedUpSymbols.includes(symbol)) {
    protocol.lookedUpSymbols.push(symbol);
    saveProtocol(protocol);
  }

  const index = getSymbolIndex(nodeModules);
  const preferredPkg =
    typeof args!.package === 'string'
      ? `@donotdev/${(args!.package as string).replace(/^@donotdev\//, '')}`
      : null;

  // Build combined result: symbol + Props in one response
  const parts: string[] = [];

  // When package is specified, search all entries for a match in that package
  let entry = index.get(symbol);
  if (preferredPkg && entry && entry.pkg !== preferredPkg) {
    // Caller specified a package but the default entry is from another package.
    // Scan the full index for an entry in the preferred package.
    // getSymbolIndex uses first-write-wins, so we need to check the raw source.
    const pkgIndex = join(
      nodeModules,
      preferredPkg,
      'dist',
      'symbol-index.json'
    );
    const pkgSrcIndex = join(
      nodeModules,
      preferredPkg,
      'src',
      'symbol-index.json'
    );
    const idxPath = existsSync(pkgIndex)
      ? pkgIndex
      : existsSync(pkgSrcIndex)
        ? pkgSrcIndex
        : null;
    if (idxPath) {
      try {
        const raw = JSON.parse(readFileSync(idxPath, 'utf-8')) as Record<
          string,
          string
        >;
        if (raw[symbol]) {
          entry = { pkg: preferredPkg, definition: raw[symbol] };
        }
      } catch {
        /* fall through to default entry */
      }
    }
  }

  if (entry) {
    parts.push(
      `**Import:** \`import { ${symbol} } from '${entry.pkg}';\`\n\n` +
        `${entry.definition}`
    );
  }

  // Also include Props if looking up a component (not already a Props lookup)
  if (!symbol.endsWith('Props')) {
    let propsEntry = index.get(`${symbol}Props`);
    // Same package-preference logic for Props
    if (preferredPkg && propsEntry && propsEntry.pkg !== preferredPkg) {
      const pkgIndex = join(
        nodeModules,
        preferredPkg,
        'dist',
        'symbol-index.json'
      );
      const pkgSrcIndex = join(
        nodeModules,
        preferredPkg,
        'src',
        'symbol-index.json'
      );
      const idxPath = existsSync(pkgIndex)
        ? pkgIndex
        : existsSync(pkgSrcIndex)
          ? pkgSrcIndex
          : null;
      if (idxPath) {
        try {
          const raw = JSON.parse(readFileSync(idxPath, 'utf-8')) as Record<
            string,
            string
          >;
          const propsDef = raw[`${symbol}Props`];
          if (propsDef) {
            propsEntry = { pkg: preferredPkg, definition: propsDef };
          }
        } catch {
          /* fall through */
        }
      }
    }
    if (propsEntry) {
      parts.push(`\n\n---\n\n${propsEntry.definition}`);
    }
  }

  if (parts.length > 0) {
    return { content: [{ type: 'text', text: parts.join('') }] };
  }

  return {
    content: [{ type: 'text', text: `Not found: ${symbol}` }],
    isError: true,
  };
}
