/**
 * Instructions for adding one ISO 20022 type to an existing app. Plain text and code, no generation:
 * the snippets are templates filled with the type's name. They are what the "Implement!" dialog shows.
 * `apps/quickstart-react` and `apps/quickstart-tailwind` are real apps that follow the React steps exactly.
 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface ImplementOptions {
  /** The ISO type being edited, e.g. `BranchAndFinancialInstitutionIdentification8`. */
  type: string;
  /** True when `type` is the message itself (its root), which serializes with the message's own wrapper. */
  isMessageRoot: boolean;
  /** Entry point under the validate package, e.g. `pain001`. */
  module: string;
  react: boolean;
  /** Vue, Svelte, Angular or plain TypeScript: no ready-made renderer, validation and messages only. */
  vue: boolean;
  svelte: boolean;
  other: boolean;
  tailwind: boolean;
  output: boolean;
  packageManager: PackageManager;
}

export type StepTitle =
  | 'stepInstall'
  | 'stepComponent'
  | 'stepUse'
  | 'stepStyles'
  | 'stepCore'
  | 'stepCoreVue'
  | 'stepCoreSvelte'
  | 'stepServe';

export interface Snippet {
  /** File name to suggest, when the snippet is a file. */
  file?: string;
  lang: 'bash' | 'tsx' | 'ts' | 'css' | 'vue' | 'svelte' | 'http';
  code: string;
}

export interface Step {
  title: StepTitle;
  /** A line of explanation shown under the title, as a message key. */
  note?: 'noteRenderer' | 'noteLanguage' | 'noteTailwind' | 'noteCoreFields' | 'noteServe';
  snippets: Snippet[];
}

const PKG = '@beneficial-strategies';
const install = (pm: PackageManager, pkgs: string[]): string => `${pm === 'npm' ? 'npm install' : `${pm} add`} ${pkgs.join(' ')}`;

export const editorName = (type: string): string => `${type}Editor`;

function output(o: ImplementOptions): { imports: string; names: string; lines: string } {
  const root = o.module + 'Message';
  const xml = o.isMessageRoot ? `serializeToXml(${root}, value)` : `serializeFragment(typeDescriptors, TYPE, value)`;
  const json = o.isMessageRoot ? `serializeToIsoJson(${root}, value)` : `serializeFragmentIsoJson(typeDescriptors, TYPE, value)`;
  const fns = o.isMessageRoot ? 'serializeToXml, serializeToIsoJson' : 'serializeFragment, serializeFragmentIsoJson';
  return {
    imports: `import { ${fns} } from '${PKG}/iso20022-serialize';`,
    names: o.isMessageRoot ? `, ${root}` : '',
    lines: `      const xml = ${xml};\n      const json = ${json};`,
  };
}

function reactComponent(o: ImplementOptions): string {
  const out = o.output ? output(o) : undefined;
  const skin = o.tailwind ? `import { Iso20022Form, tailwindSkin } from '${PKG}/iso20022-react-ui';` : `import { Iso20022Form } from '${PKG}/iso20022-react-ui';`;
  return [
    skin,
    `import { schemas, typeDescriptors${out?.names ?? ''} } from '${PKG}/iso20022-validate/${o.module}';`,
    ...(out ? [out.imports] : []),
    '',
    ...(out ? [`const TYPE = '${o.type}';`, ''] : []),
    `export function ${editorName(o.type)}() {`,
    '  return (',
    '    <Iso20022Form',
    `      type="${o.type}"`,
    '      schemas={schemas}',
    '      typeDescriptors={typeDescriptors}',
    ...(o.tailwind ? ['      skin={tailwindSkin}'] : []),
    '      // Called on every change. Save, send or transform the value here.',
    '      onChange={(value, { valid }) => {',
    ...(out ? ['        if (valid) {', ...out.lines.split('\n').map((l) => `    ${l}`), '          console.log(xml, json);', '        }'] : ['        console.log(valid, value);']),
    '      }}',
    '    />',
    '  );',
    '}',
    '',
  ].join('\n');
}

const TAILWIND_CSS = `@import "tailwindcss";
@import "${PKG}/iso20022-react-ui/theme.css";
@source "../node_modules/${PKG}/iso20022-react-ui/src";
`;

/** Validation, messages and (optionally) output with no UI library: the part every framework shares. */
function coreModel(o: ImplementOptions): string {
  const out = o.output ? output(o) : undefined;
  return [
    `import { schemas, typeDescriptors${out?.names ?? ''} } from '${PKG}/iso20022-validate/${o.module}';`,
    `import { createMessages, formatIssues, initialValue, pruneForValidation } from '${PKG}/iso20022-validate';`,
    ...(out ? [out.imports] : []),
    '',
    `export const TYPE = '${o.type}';`,
    "const messages = createMessages('en'); // or 'es'",
    '',
    '/** An empty value of the right shape: use it as your form state. */',
    'export const newValue = () => initialValue(typeDescriptors, TYPE);',
    '',
    '/** Validation messages by field path, e.g. errors["FinancialInstitutionIdentification.BICFI"]. */',
    'export function check(value: unknown): Record<string, string> {',
    '  const result = schemas[TYPE]!.safeParse(pruneForValidation(typeDescriptors, TYPE, value));',
    '  return result.success ? {} : formatIssues(result.error, messages);',
    '}',
    ...(out
      ? [
          '',
          '/** The value as ISO 20022 XML or JSON. Call it when check(value) returns no errors. */',
          'export function toOutput(value: unknown) {',
          out.lines.replace(/^ {6}/gm, '  '),
          '  return { xml, json };',
          '}',
        ]
      : []),
    '',
  ].join('\n');
}

const VUE = `<script setup lang="ts">
import { computed, reactive } from 'vue';
import { newValue, check } from './${'MODEL'}';

const model = reactive(newValue());
const errors = computed(() => check(model));
</script>

<!-- Bind each input to the matching path of "model" and show errors["That.Path"] beside it. -->
`;

const SVELTE = `<script lang="ts">
  import { newValue, check } from './${'MODEL'}';

  let model = $state(newValue());
  const errors = $derived(check(model));
</script>

<!-- Bind each input to the matching path of "model" and show errors["That.Path"] beside it. -->
`;

export function buildInstructions(o: ImplementOptions): Step[] {
  const steps: Step[] = [];
  const name = editorName(o.type);
  const core = o.vue || o.svelte || o.other;

  if (o.react) {
    const pkgs = [`${PKG}/iso20022-react-ui`, `${PKG}/iso20022-validate`, 'zod', ...(o.output ? [`${PKG}/iso20022-serialize`] : [])];
    steps.push({ title: 'stepInstall', snippets: [{ lang: 'bash', code: install(o.packageManager, pkgs) }] });
    steps.push({ title: 'stepComponent', note: 'noteLanguage', snippets: [{ file: `${name}.tsx`, lang: 'tsx', code: reactComponent(o) }] });
    steps.push({ title: 'stepUse', snippets: [{ lang: 'tsx', code: `import { ${name} } from './${name}';\n\n// anywhere in your app:\n<${name} />\n` }] });
    if (o.tailwind) steps.push({ title: 'stepStyles', note: 'noteTailwind', snippets: [{ file: 'src/index.css', lang: 'css', code: TAILWIND_CSS }] });
  }

  if (core) {
    const pkgs = [`${PKG}/iso20022-validate`, 'zod', ...(o.output ? [`${PKG}/iso20022-serialize`] : [])];
    if (!o.react) steps.push({ title: 'stepInstall', snippets: [{ lang: 'bash', code: install(o.packageManager, pkgs) }] });
    steps.push({ title: 'stepCore', note: 'noteRenderer', snippets: [{ file: `${name}.ts`, lang: 'ts', code: coreModel(o) }] });
    if (o.vue) steps.push({ title: 'stepCoreVue', snippets: [{ file: `${name}.vue`, lang: 'vue', code: VUE.replace('MODEL', name) }] });
    if (o.svelte) steps.push({ title: 'stepCoreSvelte', snippets: [{ file: `${name}.svelte`, lang: 'svelte', code: SVELTE.replace('MODEL', name) }] });
  }
  // every stack: how to serve the built files so browsers download them once
  if (steps.length > 0) {
    steps.push({ title: 'stepServe', note: 'noteServe', snippets: [{ file: 'response header for your built assets', lang: 'http', code: 'Cache-Control: public, max-age=31536000, immutable\n' }] });
  }
  return steps;
}
