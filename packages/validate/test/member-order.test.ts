import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * The order of a type's members is the XSD's: an XML message that lists them in another order is not valid. The MCP snapshot lists
 * members alphabetically, so the order comes from ISO's XSDs (fixtures/member-order.tsv, made by `spec-extract order`).
 */
const file = readFileSync(resolve(import.meta.dirname, '../../../fixtures/member-order.tsv'), 'utf8');
const xsd = new Map(file.split('\n').slice(1).filter(Boolean).map((l) => { const [t, tags] = l.split('\t'); return [t!, tags!.split(',')] as const; }));

describe('member order follows the XSD', () => {
  const multi = Object.values(allTypeDescriptors).filter((t) => (t.kind === 'component' || t.kind === 'choice') && (t.fields ?? t.choiceOptions ?? []).length >= 2);

  it('every component and choice with two or more members has an XSD order', () => {
    expect(multi.filter((t) => !xsd.has(t.name)).map((t) => t.name)).toEqual([]);
  });

  it('every one lists its members in exactly that order', () => {
    const wrong = multi.filter((t) => (t.fields ?? t.choiceOptions ?? []).map((f) => f.xmlTag).join() !== xsd.get(t.name)?.join()).map((t) => t.name);
    expect(wrong).toEqual([]);
  });

  it('a case assignment starts with its identification, as the XSD does (it used to list Assignee first)', () => {
    expect(allTypeDescriptors.CaseAssignment6!.fields!.map((f) => f.name)).toEqual(['Identification', 'Assigner', 'Assignee', 'CreationDateTime']);
  });
});
