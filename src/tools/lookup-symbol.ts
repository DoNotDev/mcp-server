// packages/mcp-server/src/tools/lookup-symbol.ts

import { readFileSync } from 'fs';

import {
  findNodeModules,
  findSymbolIndexFile,
  getProtocol,
  saveProtocol,
  getSymbolIndex,
  assertString,
} from '../config';
import type { SymbolEntry, ToolResult } from '../config';

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
  const symbol = args?.symbol;
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
  const pkgArg = args?.package;
  const preferredPkg =
    typeof pkgArg === 'string'
      ? `@donotdev/${pkgArg.replace(/^@donotdev\//, '')}`
      : null;

  // Build combined result: symbol + its props in one response
  const parts: string[] = [];

  const entry = resolveEntry(index, nodeModules, symbol, preferredPkg);
  if (entry) {
    parts.push(
      `**Import:** \`import { ${symbol} } from '${entry.pkg}';\`\n\n` +
        `${entry.definition}`
    );
  }

  // A component lookup also returns its props. Polymorphic components declare
  // `XProps = XOwnProps & Omit<native props>`: XOwnProps holds the real props.
  if (!symbol.endsWith('Props')) {
    for (const propsName of [`${symbol}Props`, `${symbol}OwnProps`]) {
      const propsEntry = resolveEntry(index, nodeModules, propsName, preferredPkg);
      if (propsEntry) parts.push(`\n\n---\n\n${propsEntry.definition}`);
    }
  } else if (!symbol.endsWith('OwnProps')) {
    const ownName = `${symbol.slice(0, -'Props'.length)}OwnProps`;
    const ownEntry = resolveEntry(index, nodeModules, ownName, preferredPkg);
    if (ownEntry) parts.push(`\n\n---\n\n${ownEntry.definition}`);
  }

  if (parts.length > 0) {
    return { content: [{ type: 'text', text: parts.join('') }] };
  }

  return {
    content: [{ type: 'text', text: `Not found: ${symbol}` }],
    isError: true,
  };
}

/**
 * Index entry for `name`. The merged index is first-write-wins across
 * packages; when the caller names a package, that package's own index wins.
 */
function resolveEntry(
  index: Map<string, SymbolEntry>,
  nodeModules: string,
  name: string,
  preferredPkg: string | null
): SymbolEntry | undefined {
  const entry = index.get(name);
  if (!preferredPkg || (entry && entry.pkg === preferredPkg)) return entry;
  const idxPath = findSymbolIndexFile(nodeModules, preferredPkg);
  if (idxPath) {
    try {
      const raw = JSON.parse(readFileSync(idxPath, 'utf-8')) as Record<string, string>;
      if (raw[name]) return { pkg: preferredPkg, definition: raw[name] };
    } catch {
      /* fall through to the merged entry */
    }
  }
  return entry;
}
