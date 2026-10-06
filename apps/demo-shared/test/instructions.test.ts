import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildInstructions, editorName, type ImplementOptions } from '../src/instructions.ts';

const base: ImplementOptions = {
  type: 'BranchAndFinancialInstitutionIdentification8',
  isMessageRoot: false,
  module: 'pain001',
  react: false,
  vue: false,
  svelte: false,
  other: false,
  tailwind: false,
  output: false,
  packageManager: 'npm',
};
const apps = resolve(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(resolve(apps, p), 'utf8');
const snippet = (steps: ReturnType<typeof buildInstructions>, file: string) => steps.flatMap((s) => s.snippets).find((s) => s.file === file)?.code;
const N = editorName(base.type);

describe('instructions', () => {
  it('give nothing until a stack is chosen', () => {
    expect(buildInstructions(base)).toEqual([]);
  });

  it('React: install, component named after the type, usage', () => {
    const steps = buildInstructions({ ...base, react: true });
    expect(steps.map((s) => s.title)).toEqual(['stepInstall', 'stepComponent', 'stepUse', 'stepServe']);
    expect(steps[0]!.snippets[0]!.code).toBe('npm install @beneficial-strategies/iso20022-react-ui @beneficial-strategies/iso20022-validate zod');
    expect(snippet(steps, `${N}.tsx`)).toContain(`export function ${N}()`);
    expect(steps[2]!.snippets[0]!.code).toContain(`<${N} />`);
  });

  it('ends with how to serve the built files, for every stack', () => {
    for (const stack of [{ react: true }, { vue: true }, { svelte: true }, { other: true }]) {
      const steps = buildInstructions({ ...base, ...stack });
      expect(steps.at(-1)!.title).toBe('stepServe');
      expect(steps.at(-1)!.snippets[0]!.code).toContain('Cache-Control: public, max-age=31536000, immutable');
    }
  });

  it('uses the package manager chosen', () => {
    expect(buildInstructions({ ...base, react: true, packageManager: 'pnpm' })[0]!.snippets[0]!.code).toMatch(/^pnpm add /);
    expect(buildInstructions({ ...base, react: true, packageManager: 'yarn' })[0]!.snippets[0]!.code).toMatch(/^yarn add /);
  });

  it('adds the Tailwind lines only when asked', () => {
    expect(buildInstructions({ ...base, react: true }).some((s) => s.title === 'stepStyles')).toBe(false);
    const steps = buildInstructions({ ...base, react: true, tailwind: true });
    expect(steps.some((s) => s.title === 'stepStyles')).toBe(true);
    expect(snippet(steps, `${N}.tsx`)).toContain('skin={tailwindSkin}');
  });

  it('serializes a sub-type as a fragment and a whole message with its wrapper', () => {
    const sub = snippet(buildInstructions({ ...base, react: true, output: true }), `${N}.tsx`)!;
    expect(sub).toContain('serializeFragment(typeDescriptors, TYPE, value)');
    const root = buildInstructions({ ...base, type: 'CustomerCreditTransferInitiationV13', isMessageRoot: true, react: true, output: true });
    expect(snippet(root, 'CustomerCreditTransferInitiationV13Editor.tsx')).toContain('serializeToXml(pain001Message, value)');
  });

  it('other stacks get validation, messages and output, and one install step even beside React', () => {
    const both = buildInstructions({ ...base, react: true, vue: true, svelte: true, other: true });
    expect(both.filter((s) => s.title === 'stepInstall')).toHaveLength(1);
    expect(snippet(both, `${N}.vue`)).toContain('reactive(newValue())');
    expect(snippet(both, `${N}.svelte`)).toContain('$state(newValue())');
    const alone = buildInstructions({ ...base, vue: true });
    expect(alone[0]!.title).toBe('stepInstall');
    expect(alone[0]!.snippets[0]!.code).not.toContain('react-ui');
  });
});

describe('the quickstart apps are exactly what the instructions say', () => {
  it('React with no CSS setup', () => {
    expect(read(`quickstart-react/src/${N}.tsx`)).toBe(snippet(buildInstructions({ ...base, react: true }), `${N}.tsx`));
  });

  it('React with Tailwind and output, plus the CSS', () => {
    const steps = buildInstructions({ ...base, react: true, tailwind: true, output: true });
    expect(read(`quickstart-tailwind/src/${N}.tsx`)).toBe(snippet(steps, `${N}.tsx`));
    expect(read('quickstart-tailwind/src/index.css')).toBe(snippet(steps, 'src/index.css'));
  });

  it('the framework-neutral model compiles (it is typechecked as part of quickstart-react)', () => {
    expect(read(`quickstart-react/src/core/${N}.ts`)).toBe(snippet(buildInstructions({ ...base, other: true, output: true }), `${N}.ts`));
  });
});
