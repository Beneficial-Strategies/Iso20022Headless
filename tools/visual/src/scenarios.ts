import type { Page } from 'puppeteer-core';

export interface Scenario {
  name: string;
  app: 'demo-form' | 'demo-zod' | 'quickstart-react' | 'quickstart-tailwind';
  /** Query string, e.g. `?theme=dark&lang=es`. Settings live in the URL, so no clicking is needed for them. */
  query?: string;
  viewport: { width: number; height: number };
  /** Interact with the page before it is checked and photographed. */
  steps?: (page: Page) => Promise<void>;
  /** Extra assertions specific to this state. Return a list of problems. */
  expect?: (page: Page) => Promise<string[]>;
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

async function clickText(page: Page, selector: string, pattern: RegExp): Promise<void> {
  const ok = await page.evaluate(
    (sel, src) => {
      const re = new RegExp(src, 'i');
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => re.test(e.textContent ?? '') || re.test(e.getAttribute('aria-label') ?? ''));
      el?.click();
      return Boolean(el);
    },
    selector,
    pattern.source,
  );
  if (!ok) throw new Error(`nothing matching ${selector} / ${pattern}`);
  await settle();
}

const openType = (page: Page) => clickText(page, 'header button', /type:|tipo:/);
const openDisplay = (page: Page) => clickText(page, 'header button', /display|pantalla/);
async function addPaymentAndOpenMethod(page: Page): Promise<void> {
  await clickText(page, 'button', /add payment information|añadir información del pago/);
  await page.locator('#PaymentInformation-0-PaymentMethod').click();
  await settle();
}

const popupText = (page: Page): Promise<string> => page.evaluate(() => document.querySelector('[data-placement]')?.textContent ?? '');

export const scenarios: Scenario[] = [
  { name: 'default', app: 'demo-form', viewport: { width: 1440, height: 900 } },
  {
    name: 'pain002',
    app: 'demo-form',
    query: '?message=pain.002.001.15',
    viewport: { width: 1440, height: 900 },
    expect: async (page) => {
      const r = await page.evaluate(() => ({ group: Boolean(document.querySelector('#GroupHeader-MessageIdentification')), xml: document.querySelector('.cm-content')?.textContent ?? '' }));
      const problems: string[] = [];
      if (!r.group) problems.push('pain.002 form did not render its GroupHeader');
      if (!/pain\.002\.001\.15/.test(r.xml)) problems.push('XML pane does not use the pain.002 namespace');
      return problems;
    },
  },
  {
    name: 'editor-title',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await page.locator("button[aria-label='About Customer Credit Transfer Initiation V13']").click();
      await settle();
    },
    expect: async (page) => {
      const r = await page.evaluate(() => {
        const h = document.querySelector<HTMLElement>('[data-schema-form] h2');
        const legend = document.querySelector<HTMLElement>('[data-schema-form] legend');
        const size = (e: Element | null) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
        const first = document.querySelector('[data-schema-form]')?.firstElementChild?.firstElementChild;
        return { title: h?.textContent ?? '', h: size(h), legend: size(legend), first: first === h };
      });
      const problems: string[] = [];
      if (!/Customer Credit Transfer Initiation V13/.test(r.title)) problems.push(`title is "${r.title}"`);
      if (!(r.h > r.legend)) problems.push(`title font (${r.h}px) is not larger than the group heading (${r.legend}px)`);
      if (!r.first) problems.push('the title is not the first thing in the form');
      if (!(await popupText(page)).includes('sent by the initiating party')) problems.push('the message description is missing from the help note');
      return problems;
    },
  },
  {
    name: 'editor-title-spanish-plain',
    app: 'demo-form',
    query: '?lang=es&skin=plain&message=pain.002.001.15',
    viewport: { width: 1440, height: 900 },
    expect: async (page) => {
      const r = await page.evaluate(() => document.querySelector('[data-schema-form] h2')?.textContent ?? '');
      return /Customer Payment Status Report V15/.test(r) ? [] : [`title is "${r}"`];
    },
  },
  { name: 'pain002-dark-spanish', app: 'demo-zod', query: '?message=pain.002.001.15&theme=dark&lang=es', viewport: { width: 1440, height: 900 } },
  // every other pain message loads and renders (generated, so a new message only needs its identifier added here)
  ...['pain.007.001.13', 'pain.008.001.12', 'pain.009.001.08', 'pain.010.001.08', 'pain.011.001.08', 'pain.012.001.08', 'pain.013.001.12', 'pain.014.001.12', 'pain.017.001.04', 'pain.018.001.04'].map(
    (id): Scenario => ({
      name: `message-${id}`,
      app: 'demo-form',
      query: `?message=${id}`,
      viewport: { width: 1440, height: 900 },
      expect: async (page) => {
        const r = await page.evaluate(() => ({
          fields: document.querySelectorAll('[data-schema-form] input, [data-schema-form] select, [data-schema-form] button[aria-haspopup]').length,
          xml: document.querySelector('.cm-content')?.textContent ?? '',
          title: document.querySelector('[data-schema-form] h2')?.textContent ?? '',
        }));
        const problems: string[] = [];
        if (r.fields === 0) problems.push('the form has no fields');
        if (!r.xml.includes(`xsd:${id}`)) problems.push(`XML does not use the ${id} namespace`);
        if (!r.title) problems.push('no heading');
        return problems;
      },
    }),
  ),
  { name: 'message-pain013-dark-spanish', app: 'demo-zod', query: '?message=pain.013.001.12&theme=dark&lang=es', viewport: { width: 1440, height: 900 } },
  { name: 'dark', app: 'demo-form', query: '?theme=dark', viewport: { width: 1440, height: 900 } },
  { name: 'large-text', app: 'demo-form', query: '?size=large', viewport: { width: 1440, height: 900 } },
  { name: 'xlarge-spanish', app: 'demo-form', query: '?size=xlarge&lang=es', viewport: { width: 1440, height: 900 } },
  { name: 'compact', app: 'demo-form', query: '?density=compact', viewport: { width: 1440, height: 900 } },
  {
    name: 'plain-skin',
    app: 'demo-form',
    query: '?skin=plain',
    viewport: { width: 1440, height: 900 },
    expect: async (page) => {
      const classes = await page.evaluate(() => document.querySelectorAll('[data-schema-form] [class]').length);
      return classes === 0 ? [] : [`the plain skin should carry no class attributes, found ${classes}`];
    },
  },
  { name: 'plain-skin-dark-spanish', app: 'demo-form', query: '?skin=plain&theme=dark&lang=es', viewport: { width: 1440, height: 900 } },
  { name: 'narrow', app: 'demo-form', viewport: { width: 480, height: 900 } },
  {
    name: 'type-picker-open',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: openType,
    expect: async (page) => {
      const w = await page.evaluate(() => document.querySelector('[data-placement]')?.getBoundingClientRect().width ?? 0);
      return w >= 440 ? [] : [`type list is only ${Math.round(w)}px wide`];
    },
  },
  {
    name: 'format-hint',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await openType(page);
      await page.keyboard.type('BranchAndFinancialInstitutionIdentification8');
      await settle();
      await clickText(page, '[cmdk-item]', /^BranchAndFinancialInstitutionIdentification8/);
      await settle(600);
      await page.locator('#FinancialInstitutionIdentification-BICFI').fill('deutdeff');
      await page.locator('#FinancialInstitutionIdentification-LEI').fill('123');
      await page.keyboard.press('Tab');
      await settle();
    },
    expect: async (page) => {
      const text = await page.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.textContent ?? '').join(' | '));
      const problems: string[] = [];
      if (!/Not a valid BIC \(8 or 11 characters\)\. Expected: 4 uppercase letters or digits/.test(text)) problems.push(`BIC error is not explanatory: ${text}`);
      if (!/Not a valid LEI \(20 characters\)/.test(text)) problems.push(`LEI error is not explanatory: ${text}`);
      return problems;
    },
  },
  {
    name: 'implement-dialog',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await clickText(page, 'button', /^Implement!$/);
      await settle(500);
    },
    expect: async (page) => {
      const r = await page.evaluate(() => {
        const d = document.querySelector('dialog');
        return { open: Boolean(d?.open), text: d?.textContent ?? '' };
      });
      const problems: string[] = [];
      if (!r.open) problems.push('the Implement! dialog did not open');
      if (!/not published to npm yet/.test(r.text)) problems.push('the not-yet-published note is missing');
      if (!/npm install @beneficial-strategies\/iso20022-react-ui/.test(r.text)) problems.push('the install command is missing');
      if (!/export function CustomerCreditTransferInitiationV13Editor/.test(r.text)) problems.push('the component is not named after the edited type');
      return problems;
    },
  },
  {
    name: 'implement-dialog-all-options',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await clickText(page, 'button', /^Implement!$/);
      await settle(400);
      for (const label of [/^Vue$/, /^Svelte$/, /Angular or plain/, /Tailwind CSS v4/, /XML or ISO JSON/]) await clickText(page, 'dialog label', label);
      await clickText(page, 'dialog label', /^pnpm$/);
    },
    expect: async (page) => {
      const text = await page.evaluate(() => document.querySelector('dialog')?.textContent ?? '');
      const problems: string[] = [];
      for (const [re, what] of [
        [/pnpm add @beneficial-strategies\/iso20022-react-ui/, 'pnpm install command'],
        [/skin=\{tailwindSkin\}/, 'Tailwind skin in the component'],
        [/@source "\.\.\/node_modules/, 'Tailwind CSS lines'],
        [/serializeToXml/, 'XML output for the whole message'],
        [/newValue = \(\) => initialValue/, 'framework-neutral model'],
        [/reactive\(newValue\(\)\)/, 'Vue snippet'],
        [/\$state\(newValue\(\)\)/, 'Svelte snippet'],
      ] as const) if (!re.test(text)) problems.push(`missing ${what}`);
      return problems;
    },
  },
  { name: 'implement-dialog-spanish-narrow', app: 'demo-form', query: '?lang=es', viewport: { width: 480, height: 900 }, steps: async (page) => { await clickText(page, 'button', /^¡Implementar!$/); await settle(400); } },
  {
    name: 'quickstart-react',
    app: 'quickstart-react',
    viewport: { width: 900, height: 700 },
    steps: async (page) => {
      await page.locator('#FinancialInstitutionIdentification-BICFI').fill('deutdeff');
      await page.keyboard.press('Tab');
      await settle();
    },
    expect: async (page) => {
      const r = await page.evaluate(() => ({ h2: document.querySelector('h2')?.textContent ?? '', alert: document.querySelector('[role=alert]')?.textContent ?? '' }));
      const problems: string[] = [];
      if (!/Branch And Financial Institution Identification8/.test(r.h2)) problems.push(`heading is "${r.h2}"`);
      if (!/Not a valid BIC/.test(r.alert)) problems.push(`BIC error is "${r.alert}"`);
      return problems;
    },
  },
  {
    name: 'quickstart-tailwind',
    app: 'quickstart-tailwind',
    viewport: { width: 900, height: 700 },
    steps: async (page) => {
      await page.locator('#FinancialInstitutionIdentification-BICFI').fill('deutdeff');
      await page.keyboard.press('Tab');
      await settle();
    },
    expect: async (page) => {
      const r = await page.evaluate(() => {
        const input = document.querySelector('#FinancialInstitutionIdentification-BICFI');
        return { radius: input ? getComputedStyle(input).borderRadius : '', alert: document.querySelector('[role=alert]')?.textContent ?? '' };
      });
      const problems: string[] = [];
      if (r.radius === '0px' || r.radius === '') problems.push('Tailwind styles are not applied to the input');
      if (!/Not a valid BIC/.test(r.alert)) problems.push(`BIC error is "${r.alert}"`);
      return problems;
    },
  },
  // For each message-level status rule of pain.002: enter a violating pair and require the rules panel to show a violation.
  ...[
    { rule: 'GroupStatusAcceptedRule', group: 'ACCP', payment: 'RJCT' },
    { rule: 'GroupStatusPendingRule', group: 'PDNG', payment: 'RJCT' },
    { rule: 'GroupStatusRejectedRule', group: 'RJCT', payment: 'ACCP' },
    { rule: 'GroupStatusReceivedRule', group: 'RCVD', payment: 'RCVD' },
  ].map(
    (c): Scenario => ({
      name: `rules-pain002-${c.rule}`,
      app: 'demo-form',
      query: '?message=pain.002.001.15',
      viewport: { width: 1440, height: 1200 },
      steps: async (page) => {
        await page.locator('#OriginalGroupInformationAndStatus-GroupStatus').fill(c.group);
        await clickText(page, 'button', /add original payment information and status/i);
        await settle(400);
        await page.locator('#OriginalPaymentInformationAndStatus-0-PaymentInformationStatus').fill(c.payment);
        await settle(600);
      },
      expect: async (page) => {
        const r = await page.evaluate((rule) => {
          const panel = [...document.querySelectorAll('details')].find((e) => /Business rules|Reglas de negocio/i.test(e.querySelector(':scope > summary')?.textContent ?? ''));
          const item = [...(panel?.querySelectorAll('li') ?? [])].find((li) => li.textContent?.includes(rule));
          return { summary: panel?.querySelector(':scope > summary')?.textContent ?? 'NO PANEL', item: (item?.textContent ?? 'NOT LISTED').slice(0, 90) };
        }, c.rule);
        return /^\W*(Failed|Fail)/i.test(r.item) || /✗|Failed|violat/i.test(r.item) ? [] : [`${c.rule} should fail for group ${c.group} + payment ${c.payment}: panel says "${r.summary.slice(0, 80)}"; rule row "${r.item}"`];
      },
    }),
  ),
  {
    // reported by a user: status ABCD (not RJCT/PDNG) with additional information must violate StatusReasonInformationRule
    name: 'rules-pain002-StatusReasonInformationRule',
    app: 'demo-form',
    query: '?message=pain.002.001.15',
    viewport: { width: 1440, height: 1200 },
    steps: async (page) => {
      await page.locator('#OriginalGroupInformationAndStatus-GroupStatus').fill('ABCD');
      await clickText(page, 'button', /^\+ add status reason information$/i);
      await settle(300);
      await clickText(page, 'button', /^\+ add additional information$/i);
      await settle(300);
      await page.locator('[id*="AdditionalInformation"]').fill('It just failed.');
      await settle(600);
    },
    expect: async (page) => {
      const r = await page.evaluate(() => {
        const panel = [...document.querySelectorAll('details')].find((e) => /Business rules|Reglas de negocio/i.test(e.querySelector(':scope > summary')?.textContent ?? ''));
        const item = [...(panel?.querySelectorAll('li') ?? [])].find((li) => li.textContent?.includes('StatusReasonInformationRule'));
        return { summary: panel?.querySelector(':scope > summary')?.textContent ?? 'NO PANEL', item: (item?.textContent ?? 'NOT LISTED').slice(0, 90) };
      });
      return /✗|Failed|violat/i.test(r.item) ? [] : [`StatusReasonInformationRule should fail: panel says "${r.summary.slice(0, 80)}"; row "${r.item}"`];
    },
  },
  { name: 'type-picker-open-narrow', app: 'demo-form', viewport: { width: 480, height: 900 }, steps: openType },
  { name: 'display-open', app: 'demo-form', viewport: { width: 1440, height: 900 }, steps: openDisplay },
  { name: 'display-open-narrow-spanish', app: 'demo-form', query: '?lang=es', viewport: { width: 480, height: 900 }, steps: openDisplay },
  {
    name: 'dropdown-open',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: addPaymentAndOpenMethod,
    expect: async (page) => {
      const t = await popupText(page);
      const missing = ['CHK — Cheque', 'TRA — TransferAdvice', 'TRF — CreditTransfer', 'Written order to a bank', 'in the books of the account servicer'].filter((s) => !t.includes(s));
      return missing.length ? [`dropdown is missing: ${missing.join('; ')}`] : [];
    },
  },
  { name: 'dropdown-open-short-window', app: 'demo-form', viewport: { width: 1100, height: 560 }, steps: addPaymentAndOpenMethod },
  {
    name: 'dropdown-open-spanish',
    app: 'demo-form',
    query: '?lang=es',
    viewport: { width: 1440, height: 900 },
    steps: addPaymentAndOpenMethod,
    expect: async (page) => {
      const t = await popupText(page);
      return /Orden escrita dirigida a un banco/.test(t) ? [] : ['Spanish code descriptions are not shown in the dropdown'];
    },
  },
  {
    name: 'help-note-open',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await page.locator("button[aria-label='About Creation Date Time']").click();
      await settle();
    },
    expect: async (page) => ((await popupText(page)).includes('Date and time at which the message was created') ? [] : ['help note text is missing']),
  },
  {
    name: 'required-error',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await page.locator('#GroupHeader-MessageIdentification').click();
      await page.keyboard.press('Tab');
      await settle();
    },
    expect: async (page) => {
      const r = await page.evaluate(() => {
        const input = document.querySelector('#GroupHeader-MessageIdentification');
        return { alerts: document.querySelectorAll('[role=alert]').length, invalid: input?.getAttribute('aria-invalid'), described: input && document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent };
      });
      return r.alerts > 0 && r.invalid === 'true' && r.described === 'Required' ? [] : [`expected a "Required" alert linked to the field, got ${JSON.stringify(r)}`];
    },
  },
  {
    name: 'json-output',
    app: 'demo-form',
    query: '?format=json',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await page.locator('#GroupHeader-MessageIdentification').fill('MSG-1');
      await settle();
    },
    expect: async (page) => {
      const r = await page.evaluate(() => ({
        text: document.querySelector('.cm-content')?.textContent ?? '',
        header: [...document.querySelectorAll('section[aria-label] span.font-semibold')].map((e) => e.textContent).join('|'),
        copy: [...document.querySelectorAll('button')].some((b) => b.textContent === 'Copy JSON'),
      }));
      const problems: string[] = [];
      if (!/"Document"/.test(r.text) || !/"CstmrCdtTrfInitn"/.test(r.text)) problems.push('JSON pane does not show the Document / CstmrCdtTrfInitn structure');
      if (!/"MsgId":\s*"MSG-1"/.test(r.text)) problems.push('typing a message id does not appear as "MsgId" in the JSON');
      if (/<Document/.test(r.text)) problems.push('XML is still shown in JSON mode');
      if (!r.copy) problems.push('the copy button does not say "Copy JSON"');
      return problems;
    },
  },
  { name: 'json-output-dark-spanish', app: 'demo-form', query: '?format=json&theme=dark&lang=es', viewport: { width: 1440, height: 900 } },
  {
    name: 'xml-output',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    expect: async (page) => {
      const text = await page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');
      return /<Document/.test(text) && !/"Document"/.test(text) ? [] : ['XML is not the default output'];
    },
  },
  { name: 'zod-demo', app: 'demo-zod', viewport: { width: 1440, height: 900 } },
  { name: 'zod-demo-plain-dark', app: 'demo-zod', query: '?skin=plain&theme=dark', viewport: { width: 1440, height: 900 } },
];
