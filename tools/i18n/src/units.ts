import { hashOf, type Unit } from './catalog.ts';
import { allTypeDescriptors as typeDescriptors } from '../../../packages/validate/src/generated/all.ts';
import { codeDefinitions, codeSetDefinitions, fieldDefinitions, typeDefinitions } from '../../../packages/validate/src/generated/definitions.ts';
import { displayName } from '../../../packages/validate/src/runtime.ts';

/** The messages whose text the catalog covers (all generated messages). */
export const MESSAGE = 'pain.001.001.13, pain.002.001.15, pain.007.001.13, pain.008.001.12, pain.009.001.08, pain.010.001.08, pain.011.001.08, pain.012.001.08, pain.013.001.12, pain.014.001.12, pain.017.001.04, pain.018.001.04, pacs.002.001.16, pacs.003.001.12, pacs.004.001.15, pacs.007.001.14, pacs.008.001.14, pacs.009.001.13, pacs.010.001.06, pacs.028.001.07, pacs.029.001.02';

/** Every translatable string of the message, from the generated descriptors and definitions. English only. */
export function extractUnits(): Unit[] {
  const units: Unit[] = [];
  const add = (kind: Unit['kind'], id: string | undefined, text: string | undefined, context: string): void => {
    if (!id || !text) return;
    units.push({ key: `${kind}:${id}`, kind, id, text, context, hash: hashOf(text) });
  };

  for (const t of Object.values(typeDescriptors)) {
    add('type', t.isoId, t.isoId ? typeDefinitions[t.isoId] : undefined, `Definition of the type ${t.name}`);
    if (t.kind === 'code') {
      add('codeSet', t.isoId, t.isoId ? codeSetDefinitions[t.isoId] : undefined, `Definition of the code set ${t.name}`);
      for (const o of t.options ?? []) {
        add('code', o.isoId, o.isoId ? codeDefinitions[o.isoId] : undefined, `Definition of code ${o.value} (${o.name}) in ${t.name}`);
        add('codeName', o.isoId, o.name, `Name of code ${o.value} in ${t.name}; shown in a dropdown as "${o.value} — <name>". CamelCase in the source.`);
      }
    }
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
      const where = `${t.name}.${f.name} (XML tag ${f.xmlTag})`;
      add('field', f.isoId, f.isoId ? fieldDefinitions[f.isoId] : undefined, `Definition of the element ${where}`);
      add('label', f.isoId, f.isoId ? displayName(f.name) : undefined, `Form label for the element ${where}`);
    }
    for (const r of t.rules ?? []) add('rule', r.isoId, r.text, `Business rule ${r.name} of ${t.name}`);
  }
  // ids can repeat only if a type is reused: keep the first
  return [...new Map(units.map((u) => [u.key, u])).values()];
}
