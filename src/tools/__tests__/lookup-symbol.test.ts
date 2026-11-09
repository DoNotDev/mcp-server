import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const root = mkdtempSync(join(tmpdir(), 'dndev-lookup-'));
const nodeModules = join(root, 'node_modules');

const INDEX: Record<string, string> = {
  Section: 'declare const Section: ForwardRefExoticComponent<SectionProps>;',
  SectionProps:
    'export type SectionProps<T> = SectionOwnProps & Omit<ComponentPropsWithRef<T>, keyof SectionOwnProps>;',
  SectionOwnProps: 'export interface SectionOwnProps { contentWidth?: ContentWidth; }',
  Card: 'declare function Card(props: CardProps): JSX.Element;',
  CardProps: 'export interface CardProps { title?: string; }',
};

vi.mock('../../config', async () => {
  const { readFileSync } = await import('node:fs');
  const { join: joinPath } = await import('node:path');
  return {
    findNodeModules: () => nodeModules,
    findSymbolIndexFile: () => null,
    getProtocol: () => ({ lookedUpSymbols: [] as string[] }),
    saveProtocol: () => {},
    assertString: () => {},
    getSymbolIndex: (nm: string) => {
      const raw = JSON.parse(
        readFileSync(joinPath(nm, '@donotdev/components/dist/symbol-index.json'), 'utf-8')
      ) as Record<string, string>;
      return new Map(
        Object.entries(raw).map(([k, definition]) => [k, { pkg: '@donotdev/components', definition }])
      );
    },
  };
});

const { handler } = await import('../lookup-symbol');

const textOf = (symbol: string) =>
  (handler({ symbol }).content[0] as { text: string }).text;

describe('lookup_symbol props', () => {
  beforeAll(() => {
    const dist = join(nodeModules, '@donotdev/components/dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'symbol-index.json'), JSON.stringify(INDEX));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('returns the own props of a polymorphic component', () => {
    const text = textOf('Section');
    expect(text).toContain(INDEX.SectionProps);
    expect(text).toContain(INDEX.SectionOwnProps);
  });

  it('returns the own props when the props alias is looked up', () => {
    expect(textOf('SectionProps')).toContain(INDEX.SectionOwnProps);
  });

  it('keeps plain components unchanged', () => {
    const text = textOf('Card');
    expect(text).toContain(INDEX.CardProps);
    expect(text).not.toContain('OwnProps');
  });
});
