import { describe, expect, it } from 'vitest';
import { closureOf, kindOf, messageJson, writeStructure, type MessageSpec } from '../src/extract.ts';
import { addSnapshot, emptySpec } from '../src/snapshot.ts';

const tsv = (...rows: string[][]): string => rows.map((r) => r.join('\t')).join('\n');

const snapshot = tsv(
  ['# Section: components | Page 1 of 1 | Total items in section: 3'],
  ['MSGDEF', 'ThingV01', 'm1', 'pain', 'Registered', '—', 'CHK', 'Scope|A thing.|Usage|Used.'],
  ['MSGBLOCK', 'ThingV01', 'b1', 'GroupHeader', 'GrpHdr', 'Header1', '1', '1', 'Registered', 'The header.'],
  ['MSGBLOCK', 'ThingV01', 'b2', 'Item', 'Itm', 'Item1', '0', '*', 'Registered', 'The items.'],
  ['MSGCOMP', 'Header1', 'c1', 'Registered', '—', 'AAAA', 'Header def.'],
  ['MSGELEMENT', 'Header1', 'e1', 'Id', 'Id', 'Max35Text', '1', '1', 'Registered', 'The id.'],
  ['MSGELEMENT', 'Header1', 'e2', 'Method', 'Mtd', 'Method1Code', '', '', 'Registered', 'How.'],
  ['MSGCOMP', 'Item1', 'c2', 'Registered', '—', 'BBBB', 'Item def.'],
  ['MSGELEMENT', 'Item1', 'e3', 'Party', 'Pty', 'Party1Choice', '1', '1', 'Registered', 'Who.'],
  ['MSGELEMENT', 'Item1', 'e4', 'Amount', 'Amt', 'Amt1', '1', '1', 'Registered', 'How much.'],
  ['MSGELEMENT', 'Item1', 'e5', 'Header', 'Hdr', 'Header1', '0', '1', 'Registered', 'Cycle back to a shared type.'],
  ['CHOICE', 'Party1Choice', 'ch1', 'Registered', '—', 'CCCC', 'Choice def.'],
  ['VARIANT', 'Party1Choice', 'v1', 'Org', 'Org', 'Header1', 'Registered', 'An organisation.'],
  ['VARIANT', 'Party1Choice', 'v2', 'Name', 'Nm', 'Max35Text', 'Registered', 'A name.'],
  ['AMOUNT', 'Amt1', 'a1', 'Registered', '—', 'DDDD', 'Amount def.'],
  ['SIMPLETYPE', 'Max35Text', 's1', 'Registered', '—', 'EEEE', 'Text def.'],
  ['CODESET', 'Method1Code', 'cs1', 'Registered', '—', 'FFFF', 'Code set def.'],
);

const spec = emptySpec();
addSnapshot(spec, snapshot);
const message: MessageSpec = { name: 'ThingV01', id: 'm1', identifier: 'pain.999.001.01', bodyTag: 'Thng', out: 'pain999', dir: 'pain999-v01' };

describe('spec extraction', () => {
  it('reads the section header and the records', () => {
    expect(spec.loaded).toEqual(['components 1/1']);
    expect(kindOf(spec, 'Header1')).toBe('Component');
    expect(kindOf(spec, 'Party1Choice')).toBe('Choice');
    expect(kindOf(spec, 'Amt1')).toBe('Amount');
    expect(kindOf(spec, 'Method1Code')).toBe('Codeset');
    expect(kindOf(spec, 'Max35Text')).toBe('Attribute');
    expect(kindOf(spec, 'Nope')).toBeUndefined();
  });

  it('follows blocks, elements and choice variants, visiting a type reached from several places once', () => {
    const c = closureOf(spec, message);
    expect(c.components.sort()).toEqual(['Header1', 'Item1']);
    expect(c.choices).toEqual(['Party1Choice']);
    expect(c.amounts).toEqual(['Amt1']);
    expect(c.simpleTypes).toEqual(['Max35Text']);
    expect(c.codeSets).toEqual(['Method1Code']);
    expect(c.unresolved).toEqual([]);
  });

  it('reports a type the snapshot does not define', () => {
    const s = emptySpec();
    addSnapshot(s, snapshot + '\n' + tsv(['MSGELEMENT', 'Header1', 'e9', 'Ghost', 'Gh', 'Missing1', '1', '1', 'Registered', 'x']));
    expect(closureOf(s, message).unresolved).toEqual(['Missing1']);
  });

  it('refuses a message whose id is not the named message', () => {
    expect(() => closureOf(spec, { ...message, name: 'OtherV01' })).toThrow(/is ThingV01, not OtherV01/);
    expect(() => closureOf(spec, { ...message, id: 'zzz' })).toThrow(/not in the snapshot/);
  });

  it('writes message.json: namespace, blocks with 0/1/unbounded bounds, and the definition text', () => {
    const j = messageJson(spec, message);
    expect(j.namespace).toBe('urn:iso:std:iso:20022:tech:xsd:pain.999.001.01');
    expect(j.isoId).toBe('m1');
    expect(j.definition).toBe('Scope|A thing.|Usage|Used.');
    expect(j.blocks).toEqual([
      { name: 'GroupHeader', isoId: 'b1', xmlTag: 'GrpHdr', type: 'Header1', min: 1, max: 1 },
      { name: 'Item', isoId: 'b2', xmlTag: 'Itm', type: 'Item1', min: 0, max: null },
    ]);
  });

  it('writes DATATYPE and MEMBER rows, with blank bounds as 0 and *, and choice variants as members', () => {
    const w = writeStructure(spec, closureOf(spec, message), () => true);
    expect(w.complexTypes).toContain('DATATYPE\tHeader1\tc1\tMessageComponent\tRegistered\tAAAA\tHeader def.');
    expect(w.complexTypes).toContain('MEMBER\tHeader1\te2\tMethod\tMtd\tCodeset\tMethod1Code\t0\t*\tHow.');
    expect(w.complexTypes).toContain('MEMBER\tParty1Choice\tv2\tName\tNm\tAttribute\tMax35Text\t1\t1\tA name.');
    expect(w.choiceDefs).toContain('Party1Choice\tv1\tOrg\tAn organisation.');
    expect(w.codeSetDefs).toContain('Method1Code\tcs1\tCode set def.');
  });

  it('writes only the types it is told are new', () => {
    const w = writeStructure(spec, closureOf(spec, message), (n) => n !== 'Header1');
    expect(w.complexTypes).not.toContain('DATATYPE\tHeader1');
    expect(w.complexTypes).toContain('DATATYPE\tItem1');
  });

  it('warns about duplicate names instead of silently picking one', () => {
    const s = emptySpec();
    addSnapshot(s, tsv(['SIMPLETYPE', 'Max35Text', 's1', 'Registered', '—', 'x', 'a'], ['SIMPLETYPE', 'Max35Text', 's2', 'Registered', '—', 'y', 'b']));
    expect(s.warnings).toEqual(['duplicate simple type name Max35Text']);
    expect(s.simpleTypes.get('Max35Text')!.isoId).toBe('s1');
  });
});
