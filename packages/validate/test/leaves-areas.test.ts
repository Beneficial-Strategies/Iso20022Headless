import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { messageIndex } from '../src/index.ts';

// Every business area has its own leaf test file (see leaves-lib.ts): a message of a new area would otherwise not be checked at all.
describe('the leaf tests cover every business area', () => {
  it('has a leaves-<area>.test.ts for each area of the registry', () => {
    const files = new Set(readdirSync(new URL('.', import.meta.url)));
    const missing = [...new Set(messageIndex.map((m) => m.area))].filter((a) => !files.has(`leaves-${a}.test.ts`));
    expect(missing, 'add test/leaves-<area>.test.ts (copy another one) for each of these areas').toEqual([]);
  });
});
