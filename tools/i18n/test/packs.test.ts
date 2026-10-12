import { describe, expect, it } from 'vitest';
import { messageIndex } from '../../../packages/validate/src/generated/registry.ts';
import { expandTextPack } from '../../../packages/validate/src/text-pack.ts';
import { labelsFor, loadCatalog, messagePack } from '../src/packsLib.ts';

/**
 * Text packs (proof of concept): a pack is built from a catalog and expanded back to the id-keyed catalog the form reads. For one message
 * the round trip must give the catalog's own text, except for labels, which are one per element name and so may differ where the catalog
 * had several translations of the same name.
 */
describe('text packs', () => {
  const ID = 'pain.001.001.13';
  it('round-trips the definitions, code names and rules of a message exactly, and its labels but for the names the catalog was inconsistent about', async () => {
    const cat = loadCatalog('fr');
    const { typeDescriptors } = await messageIndex.find((m) => m.identifier === ID)!.load();
    const { labels, conflicts } = labelsFor(cat, 'fr');
    const expanded = expandTextPack(typeDescriptors, labels, [await messagePack(cat, 'fr', ID)]);
    const text = (e: unknown): string | undefined => (typeof e === 'string' ? e : (e as { text: string } | undefined)?.text);
    const wrong: string[] = [];
    let checked = 0;
    for (const t of Object.values(typeDescriptors)) {
      if (t.isoId && cat[`type:${t.isoId}`]) (checked++, text(expanded.types?.[t.isoId]) !== cat[`type:${t.isoId}`]!.text && wrong.push(`type ${t.name}`));
      for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
        if (!f.isoId) continue;
        if (cat[`field:${f.isoId}`]) (checked++, text(expanded.fields?.[f.isoId]) !== cat[`field:${f.isoId}`]!.text && wrong.push(`field ${t.name}.${f.name}`));
        if (cat[`label:${f.isoId}`] && !conflicts[f.name]) (checked++, text(expanded.labels?.[f.isoId]) !== cat[`label:${f.isoId}`]!.text && wrong.push(`label ${t.name}.${f.name}`));
      }
      for (const o of t.options ?? []) {
        if (!o.isoId) continue;
        if (cat[`code:${o.isoId}`]) (checked++, text(expanded.codes?.[o.isoId]) !== cat[`code:${o.isoId}`]!.text && wrong.push(`code ${t.name}.${o.value}`));
        if (cat[`codeName:${o.isoId}`]) (checked++, text(expanded.codeNames?.[o.isoId]) !== cat[`codeName:${o.isoId}`]!.text && wrong.push(`codeName ${t.name}.${o.value}`));
      }
      for (const r of t.rules ?? []) if (r.isoId && cat[`rule:${r.isoId}`]) (checked++, text(expanded.rules?.[r.isoId]) !== cat[`rule:${r.isoId}`]!.text && wrong.push(`rule ${t.name}.${r.name}`));
    }
    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThan(2500);
  });

  it('has one label per element name, and names the ones the catalog translated more than one way', () => {
    const { labels, conflicts } = labelsFor(loadCatalog('de'), 'de');
    expect(Object.keys(labels.labels)).toHaveLength(4107);
    expect(Object.keys(conflicts)).toHaveLength(150);
    for (const [name, c] of Object.entries(conflicts)) expect(Object.keys(c.candidates), name).toContain(c.chosen);
  });
});
