import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { findSymbolIndexFile } from '../../config';

const nm = mkdtempSync(join(tmpdir(), 'dndev-index-'));
const put = (rel: string) => {
  const file = join(nm, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, '{}');
  return file;
};

describe('findSymbolIndexFile', () => {
  afterAll(() => rmSync(nm, { recursive: true, force: true }));

  it('finds the index at the root of a flattened package (published core)', () => {
    expect(findSymbolIndexFile(nm, '@donotdev/core')).toBeNull();
    const root = put('@donotdev/core/symbol-index.json');
    expect(findSymbolIndexFile(nm, '@donotdev/core')).toBe(root);
  });

  it('prefers dist/ over the other locations', () => {
    put('@donotdev/ui/src/symbol-index.json');
    const dist = put('@donotdev/ui/dist/symbol-index.json');
    expect(findSymbolIndexFile(nm, '@donotdev/ui')).toBe(dist);
  });
});
