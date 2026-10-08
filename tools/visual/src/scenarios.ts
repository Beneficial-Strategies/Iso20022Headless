import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Page } from 'puppeteer-core';

export interface Scenario {
  name: string;
  app: 'demo-form' | 'demo-zod' | 'quickstart-react' | 'quickstart-tailwind';
  /** Query string, e.g. `?theme=dark&lang=es`. Settings live in the URL, so no clicking is needed for them. */
  query?: string;
  viewport: { width: number; height: number };
  /** Clipboard for the page: `granted` allows reading it (without a prompt), `denied` blocks it; `text` is put on it after load. */
  clipboard?: { access: 'granted' | 'denied'; text?: string };
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

const openType = async (page: Page): Promise<void> => {
  await page.click('[data-type-picker]');
  await settle();
};
const openDisplay = (page: Page) => clickText(page, 'header button', /display|pantalla|affichage|anzeige|exibi/);
async function addPaymentAndOpenMethod(page: Page): Promise<void> {
  await clickText(page, 'button', /add payment information|añadir información del pago/);
  await page.locator('#PaymentInformation-0-PaymentMethod').click();
  await settle();
}

const popupText = (page: Page): Promise<string> => page.evaluate(() => document.querySelector('[data-placement]')?.textContent ?? '');

// ---------------------------------------------------------------------------- paste from the clipboard

const NS = (id: string): string => `urn:iso:std:iso:20022:tech:xsd:${id}`;
// the message a user pasted when reporting a bug: group status ABCD with additional information
const USER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${NS('pain.002.001.15')}">
  <CstmrPmtStsRpt>
    <GrpHdr><MsgId>87787878878778877</MsgId><CreDtTm>2026-10-06T15:44:55-05:00</CreDtTm></GrpHdr>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>54465464646554</OrgnlMsgId><OrgnlMsgNmId>hhhjjjjjj</OrgnlMsgNmId><GrpSts>ABCD</GrpSts>
      <StsRsnInf><AddtlInf>It just failed.</AddtlInf></StsRsnInf>
    </OrgnlGrpInfAndSts>
  </CstmrPmtStsRpt>
</Document>`;
const PAIN001_XML = `<Document xmlns="${NS('pain.001.001.13')}"><CstmrCdtTrfInitn><GrpHdr><MsgId>FROM-001</MsgId></GrpHdr></CstmrCdtTrfInitn></Document>`;
const PAIN002_JSON = JSON.stringify({ Document: { CstmrPmtStsRpt: { GrpHdr: { MsgId: 'JSON-1' }, OrgnlGrpInfAndSts: { OrgnlMsgId: 'O1', GrpSts: 'RJCT' } } } });

/** The paste button's label and whether it is disabled, after giving the clipboard check a moment. */
async function pasteButton(page: Page, wantLabel?: RegExp): Promise<{ label: string; disabled: boolean; title: string }> {
  for (let i = 0; i < 20; i++) {
    const b = await page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="XML preview"] button')].find((x) => /^(Paste|Pegar)/.test(x.textContent ?? ''));
      return { label: el?.textContent ?? '', disabled: el?.disabled ?? true, title: el?.title ?? '' };
    });
    if (!wantLabel || wantLabel.test(b.label)) return b;
    await settle(250);
  }
  return page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="XML preview"] button')].find((x) => /^(Paste|Pegar)/.test(x.textContent ?? ''));
    return { label: el?.textContent ?? '', disabled: el?.disabled ?? true, title: el?.title ?? '' };
  });
}
const reportText = (page: Page): Promise<string> => page.evaluate(() => document.querySelector('[data-paste-report]')?.textContent ?? '');
const fieldValue = (page: Page, id: string): Promise<string> => page.evaluate((i) => (document.getElementById(i) as HTMLInputElement | null)?.value ?? 'NO FIELD', id);

function pasteScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 1000 } };
  const click = async (page: Page): Promise<void> => {
    await clickText(page, '[aria-label="XML preview"] button', /^(Paste)/);
    await settle(900);
  };
  const all: Scenario[] = [
    {
      ...base,
      name: 'paste-user-message',
      query: '?message=pain.002.001.15',
      clipboard: { access: 'granted', text: USER_XML },
      steps: async (page) => {
        await pasteButton(page, /^Paste XML$/);
        await click(page);
      },
      expect: async (page) => {
        const problems: string[] = [];
        if ((await fieldValue(page, 'OriginalGroupInformationAndStatus-GroupStatus')) !== 'ABCD') problems.push('GroupStatus was not loaded');
        if ((await fieldValue(page, 'GroupHeader-MessageIdentification')) !== '87787878878778877') problems.push('MessageIdentification was not loaded');
        if (!/Loaded XML/.test(await reportText(page))) problems.push(`report is "${await reportText(page)}"`);
        const rules = await page.evaluate(() => [...document.querySelectorAll('details > summary')].map((e) => e.textContent ?? '').find((x) => /Business rules/.test(x)) ?? '');
        if (!/1 violated/.test(rules)) problems.push(`the status reason rule should be violated by the pasted message: "${rules}"`);
        return problems;
      },
    },
    {
      ...base,
      name: 'paste-switches-message-by-namespace',
      query: '?message=pain.002.001.15',
      clipboard: { access: 'granted', text: PAIN001_XML },
      steps: async (page) => {
        await pasteButton(page, /^Paste XML$/);
        await click(page);
      },
      expect: async (page) => {
        const problems: string[] = [];
        const picker = await page.evaluate(() => document.querySelector('#message-picker')?.textContent ?? '');
        if (!/pain\.001\.001\.13/.test(picker)) problems.push(`the message was not switched: picker says "${picker}"`);
        if ((await fieldValue(page, 'GroupHeader-MessageIdentification')) !== 'FROM-001') problems.push('the pasted value was not loaded into the new message');
        if (!/Switched to pain\.001\.001\.13/.test(await reportText(page))) problems.push(`report is "${await reportText(page)}"`);
        return problems;
      },
    },
    {
      ...base,
      name: 'paste-unknown-namespace',
      query: '?message=pain.002.001.15',
      clipboard: { access: 'granted', text: USER_XML.replace('pain.002.001.15', 'pain.999.001.01') },
      steps: async (page) => {
        await pasteButton(page, /^Paste XML$/);
        await click(page);
      },
      expect: async (page) => {
        const problems: string[] = [];
        if (!/No message in this library uses the namespace/.test(await reportText(page))) problems.push(`no clear error: "${await reportText(page)}"`);
        if ((await fieldValue(page, 'OriginalGroupInformationAndStatus-GroupStatus')) !== '') problems.push('something was loaded even though the paste was refused');
        const picker = await page.evaluate(() => document.querySelector('#message-picker')?.textContent ?? '');
        if (!/pain\.002\.001\.15/.test(picker)) problems.push('the message changed');
        return problems;
      },
    },
    {
      ...base,
      name: 'paste-json',
      query: '?message=pain.002.001.15',
      clipboard: { access: 'granted', text: PAIN002_JSON },
      steps: async (page) => {
        await pasteButton(page, /^Paste JSON$/);
        await click(page);
      },
      expect: async (page) => ((await fieldValue(page, 'GroupHeader-MessageIdentification')) === 'JSON-1' && /Loaded JSON/.test(await reportText(page)) ? [] : [`JSON not loaded: "${await reportText(page)}"`]),
    },
    {
      ...base,
      name: 'paste-disabled-without-xml-or-json',
      query: '?message=pain.002.001.15',
      clipboard: { access: 'granted', text: 'just some words, not XML' },
      steps: async (page) => {
        await pasteButton(page, /^Paste$/);
        await settle(1800); // let the clipboard check run
      },
      expect: async (page) => {
        const b = await pasteButton(page);
        return b.disabled && b.label === 'Paste' && /no XML or JSON/.test(b.title) ? [] : [`expected a disabled "Paste": ${JSON.stringify(b)}`];
      },
    },
    {
      ...base,
      name: 'paste-disabled-when-clipboard-blocked',
      query: '?message=pain.002.001.15',
      clipboard: { access: 'denied' },
      steps: async (page) => {
        await settle(1200);
      },
      expect: async (page) => {
        const b = await pasteButton(page);
        return b.disabled && /blocked/i.test(b.title) ? [] : [`expected a disabled button explaining the block: ${JSON.stringify(b)}`];
      },
    },
    {
      ...base,
      name: 'paste-error-spanish',
      query: '?message=pain.002.001.15&lang=es',
      clipboard: { access: 'granted', text: USER_XML.replace('pain.002.001.15', 'pain.999.001.01') },
      steps: async (page) => {
        await pasteButton(page, /^Pegar XML$/);
        await clickText(page, '[aria-label="XML preview"] button', /^Pegar/);
        await settle(900);
      },
      expect: async (page) => (/Ningún mensaje de esta biblioteca usa el espacio de nombres/.test(await reportText(page)) ? [] : [`not in Spanish: "${await reportText(page)}"`]),
    },
  ];
  // the Zod-only demo uses a hand-written form hook: the same paste must work there
  const first = all.find((x) => x.name === 'paste-user-message')!;
  return [...all, { ...first, name: 'paste-user-message-zod-demo', app: 'demo-zod' }];
}

// ---------------------------------------------------------------------------- saving and loading files

const scratch = (): string => mkdtempSync(join(tmpdir(), 'iso20022-visual-'));
const writeScratch = (name: string, content: string | Buffer): string => {
  const p = join(scratch(), name);
  writeFileSync(p, content);
  return p;
};
/** Send downloads to a folder we can read, so a saved file can be checked. */
async function downloadsTo(page: Page): Promise<string> {
  const dir = scratch();
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  return dir;
}
async function savedFile(dir: string, name: string): Promise<string | undefined> {
  for (let i = 0; i < 30; i++) {
    if (existsSync(join(dir, name)) && !readdirSync(dir).some((f) => f.endsWith('.crdownload'))) return readFileSync(join(dir, name), 'utf8');
    await settle(200);
  }
  return undefined;
}
async function chooseFile(page: Page, path: string): Promise<void> {
  const input = await page.$('input[data-load-file]');
  if (!input) throw new Error('no file input');
  await input.uploadFile(path);
  await settle(1000);
}

function fileScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 1000 } };
  const saveButton = (page: Page, label: RegExp): Promise<void> => clickText(page, '[aria-label="XML preview"] button', label);
  // the data a saved-and-reloaded round trip leaves behind, for the checks that run after the steps
  const trip: { saved?: string; after?: { id: string; status: string; fresh: string } } = {};
  return [
    {
      ...base,
      name: 'file-load-user-message',
      query: '?message=pain.002.001.15',
      steps: async (page) => chooseFile(page, writeScratch('user-message.xml', USER_XML)),
      expect: async (page) => {
        const problems: string[] = [];
        if ((await fieldValue(page, 'OriginalGroupInformationAndStatus-GroupStatus')) !== 'ABCD') problems.push('GroupStatus was not loaded');
        if (!/Loaded XML from user-message\.xml/.test(await reportText(page))) problems.push(`report is "${await reportText(page)}"`);
        return problems;
      },
    },
    {
      ...base,
      app: 'demo-zod',
      name: 'file-load-user-message-zod-demo',
      query: '?message=pain.002.001.15',
      steps: async (page) => chooseFile(page, writeScratch('user-message.xml', USER_XML)),
      expect: async (page) => ((await fieldValue(page, 'GroupHeader-MessageIdentification')) === '87787878878778877' ? [] : ['not loaded in the Zod-only demo']),
    },
    {
      ...base,
      name: 'file-save-then-load-back',
      query: '?message=pain.002.001.15',
      steps: async (page) => {
        const dir = await downloadsTo(page);
        await page.locator('#GroupHeader-MessageIdentification').fill('SAVED-1');
        await page.locator('#OriginalGroupInformationAndStatus-GroupStatus').fill('RJCT');
        await settle(400);
        await saveButton(page, /^Save XML$/);
        trip.saved = await savedFile(dir, 'pain.002.001.15.xml');
        // a fresh page has nothing in it; load the file we just saved
        await page.goto(page.url(), { waitUntil: 'networkidle0' });
        const fresh = await fieldValue(page, 'GroupHeader-MessageIdentification');
        if (trip.saved) await chooseFile(page, join(dir, 'pain.002.001.15.xml'));
        trip.after = { id: await fieldValue(page, 'GroupHeader-MessageIdentification'), status: await fieldValue(page, 'OriginalGroupInformationAndStatus-GroupStatus'), fresh };
      },
      expect: async () => {
        const problems: string[] = [];
        if (!trip.saved) problems.push('no file was saved');
        else if (!/<MsgId>SAVED-1<\/MsgId>/.test(trip.saved) || !/<GrpSts>RJCT<\/GrpSts>/.test(trip.saved)) problems.push('the saved file does not hold what was typed');
        if (trip.after?.fresh !== '') problems.push('the fresh page was not empty');
        if (trip.after?.id !== 'SAVED-1' || trip.after?.status !== 'RJCT') problems.push(`loading the saved file did not restore the values: ${JSON.stringify(trip.after)}`);
        return problems;
      },
    },
    {
      ...base,
      name: 'file-save-json',
      query: '?message=pain.002.001.15&format=json',
      steps: async (page) => {
        const dir = await downloadsTo(page);
        await page.locator('#GroupHeader-MessageIdentification').fill('JSON-SAVED');
        await settle(400);
        await saveButton(page, /^Save JSON$/);
        trip.saved = await savedFile(dir, 'pain.002.001.15.json');
      },
      expect: async () => {
        try {
          const j = JSON.parse(trip.saved ?? '');
          return j.Document?.CstmrPmtStsRpt?.GrpHdr?.MsgId === 'JSON-SAVED' ? [] : ['the saved JSON does not hold what was typed'];
        } catch {
          return ['no valid JSON file was saved'];
        }
      },
    },
    {
      ...base,
      name: 'file-load-switches-message-by-namespace',
      query: '?message=pain.002.001.15',
      steps: async (page) => chooseFile(page, writeScratch('other.xml', PAIN001_XML)),
      expect: async (page) => {
        const picker = await page.evaluate(() => document.querySelector('#message-picker')?.textContent ?? '');
        return /pain\.001\.001\.13/.test(picker) && (await fieldValue(page, 'GroupHeader-MessageIdentification')) === 'FROM-001' && /Switched to pain\.001\.001\.13/.test(await reportText(page))
          ? []
          : [`not switched and loaded: picker "${picker}", report "${await reportText(page)}"`];
      },
    },
    {
      ...base,
      name: 'file-load-not-xml-spanish',
      query: '?message=pain.002.001.15&lang=es',
      steps: async (page) => chooseFile(page, writeScratch('notes.txt', 'just some words')),
      expect: async (page) => (/El archivo no contiene XML ni JSON/.test(await reportText(page)) ? [] : [`report is "${await reportText(page)}"`]),
    },
    {
      ...base,
      name: 'file-load-too-large',
      query: '?message=pain.002.001.15',
      steps: async (page) => chooseFile(page, writeScratch('huge.xml', Buffer.alloc(21 * 1024 * 1024, 'a'))),
      expect: async (page) => (/too large/.test(await reportText(page)) ? [] : [`report is "${await reportText(page)}"`]),
    },
  ];
}

// ---------------------------------------------------------------------------- the area dropdown (pain, pacs, caam)

const optionsOf = (page: Page): Promise<string[]> => page.evaluate(() => [...document.querySelectorAll('[role=option]')].map((o) => o.textContent ?? ''));
const messageIs = (page: Page, id: string): Promise<boolean> => page.evaluate((i) => (document.querySelector('#message-picker')?.textContent ?? '').includes(i), id);

// ---------------------------------------------------------------------------- field mode: editable, label or hidden, per element

const modeSwitch = (label: string, es = false) => `button[aria-label^='${es ? 'Modo de campo de' : 'Field mode of'} ${label}:']`;
async function setMode(page: Page, label: string, mode: 'editable' | 'label' | 'hidden', es = false): Promise<void> {
  await page.click(modeSwitch(label, es));
  await page.waitForSelector('[role=menu]');
  await settle(150);
  await page.click(`[role=menuitemradio][data-mode=${mode}]`);
  await settle(250);
}
const setPreview = async (page: Page, on: boolean): Promise<void> => {
  const now = await page.$eval('[data-preview-as-designed]', (e) => (e as HTMLInputElement).checked);
  if (now !== on) await page.click('[data-preview-as-designed]');
  await settle(300);
};
const xmlShown = (page: Page) => page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');
const present = (page: Page, sel: string) => page.evaluate((x) => document.querySelector(x) !== null, sel);

function fieldModeScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 1000 } };
  return [
    {
      ...base,
      name: 'fieldmode-switch-menu',
      steps: async (page) => {
        await page.click(modeSwitch('Message Identification'));
        await page.waitForSelector('[role=menu]');
        await settle(300);
      },
      expect: async (page) => {
        const r = await page.evaluate(() => {
          const items = [...document.querySelectorAll('[role=menuitemradio]')].map((e) => [e.getAttribute('data-mode'), e.getAttribute('aria-checked')]);
          const sw = document.querySelector("button[aria-label^='Field mode of Message Identification:']")!;
          const info = sw.parentElement!.parentElement!.querySelector("button[aria-label^='About']");
          const zoomNeighbour = sw.parentElement!.parentElement!.querySelector("button[aria-label^='Zoom']");
          return { items, focused: document.activeElement?.getAttribute('data-mode'), besideInfo: !!info, zoomOnLeaf: !!zoomNeighbour, title: sw.getAttribute('title') };
        });
        const problems: string[] = [];
        if (JSON.stringify(r.items) !== JSON.stringify([['editable', 'true'], ['label', 'false'], ['hidden', 'false']])) problems.push(`menu is ${JSON.stringify(r.items)}`);
        if (r.focused !== 'editable') problems.push(`focus is on "${r.focused}", not the current mode`);
        if (!r.besideInfo) problems.push('the switch is not beside the "i"');
        if (r.title !== null) problems.push(`the button still has a browser tooltip: "${r.title}"`);
        return problems;
      },
    },
    {
      ...base,
      name: 'fieldmode-hover-help',
      steps: async (page) => {
        await page.hover(modeSwitch('Message Identification'));
        await settle(500);
      },
      expect: async (page) => {
        const t = await popupText(page);
        const problems: string[] = [];
        if (!t.startsWith('Field mode: Editable')) problems.push(`the hover help starts "${t.slice(0, 40)}"`);
        for (const w of ['Editable: the usual control', 'Label: shown as text, not editable', 'Hidden: not shown', 'stays in the message as its default', 'Click to choose']) if (!t.includes(w)) problems.push(`the hover help lacks "${w}"`);
        const r = await page.evaluate(() => {
          const sw = document.querySelector("button[aria-label^='Field mode of Message Identification:']")!;
          const tip = document.querySelector('[role=tooltip]');
          return { described: sw.getAttribute('aria-describedby') === tip?.id, role: tip?.getAttribute('role') };
        });
        if (!r.described) problems.push('the button is not described by the help');
        // opening the menu takes the help away
        await page.click(modeSwitch('Message Identification'));
        await page.waitForSelector('[role=menu]');
        await settle(300);
        if (await present(page, '[role=tooltip]')) problems.push('the help stays over the open menu');
        return problems;
      },
    },
    {
      ...base,
      name: 'fieldmode-hover-help-spanish',
      query: '?lang=es',
      steps: async (page) => {
        await page.hover(modeSwitch('Identificación del mensaje', true));
        await settle(500);
      },
      expect: async (page) => {
        const t = await popupText(page);
        return t.startsWith('Modo de campo: Editable') && t.includes('Haga clic para elegir') ? [] : [`the hover help is "${t.slice(0, 80)}"`];
      },
    },
    {
      ...base,
      name: 'fieldmode-keyboard',
      steps: async (page) => {
        await page.focus(modeSwitch('Message Identification'));
        await page.keyboard.press('Enter');
        await page.waitForSelector('[role=menu]');
        await settle(250);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter'); // hidden
        await settle(400);
      },
      expect: async (page) => {
        const mode = await page.$eval(modeSwitch('Message Identification').replace(':', ':'), (e) => e.getAttribute('data-field-mode-switch')).catch(() => null);
        const marked = await present(page, '[data-field-mode=hidden] #GroupHeader-MessageIdentification');
        return [...(marked ? [] : ['the keyboard did not set the element to hidden']), ...(mode === 'hidden' || mode === null ? [] : [`switch says ${mode}`])];
      },
    },
    {
      ...base,
      name: 'fieldmode-hidden-is-marked-not-removed',
      steps: async (page) => {
        await page.locator('#GroupHeader-MessageIdentification').fill('DEFAULT-1');
        await setMode(page, 'Message Identification', 'hidden');
      },
      expect: async (page) => {
        const r = await page.evaluate(() => {
          const input = document.querySelector<HTMLInputElement>('#GroupHeader-MessageIdentification');
          const wrap = input?.closest('[data-field-mode]');
          const bg = wrap ? getComputedStyle(wrap).backgroundImage : '';
          return { value: input?.value, mode: wrap?.getAttribute('data-field-mode'), bg, dashed: wrap ? getComputedStyle(wrap).outlineStyle : '' };
        });
        const problems: string[] = [];
        if (r.value !== 'DEFAULT-1') problems.push('the default value is gone from the editing screen');
        if (r.mode !== 'hidden') problems.push('the element is not marked hidden');
        if (!/repeating-linear-gradient/.test(r.bg)) problems.push('the hidden element is not hatched');
        if (r.dashed !== 'dashed') problems.push('the hidden element has no dashed outline');
        if (!(await xmlShown(page)).includes('<MsgId>DEFAULT-1</MsgId>')) problems.push('the default is not in the XML');
        return problems;
      },
    },
    {
      ...base,
      name: 'fieldmode-preview-applies-the-modes',
      steps: async (page) => {
        await page.locator('#GroupHeader-MessageIdentification').fill('DEFAULT-1');
        await page.locator('#GroupHeader-NumberOfTransactions').fill('3');
        await page.locator('#GroupHeader-InitiatingParty-Name').fill('Acme Ltd');
        await setMode(page, 'Message Identification', 'hidden');
        await setMode(page, 'Number Of Transactions', 'label');
        await setMode(page, 'Initiating Party', 'label');
        (globalThis as unknown as { __xml: string }).__xml = await xmlShown(page);
        await setPreview(page, true);
      },
      expect: async (page) => {
        const problems: string[] = [];
        const form = await page.evaluate(() => {
          const area = document.querySelector('[data-form-area]')!;
          const text = area.textContent ?? '';
          return {
            msgId: !!area.querySelector('input#GroupHeader-MessageIdentification'),
            msgLabel: text.includes('Message Identification'),
            nbInput: !!area.querySelector('input#GroupHeader-NumberOfTransactions'),
            nbText: [...area.querySelectorAll('p')].some((p) => p.textContent === '3'),
            partyInputs: area.querySelectorAll('input[id^="GroupHeader-InitiatingParty-"], select[id^="GroupHeader-InitiatingParty-"]').length,
            partyName: [...area.querySelectorAll('p')].some((p) => p.textContent === 'Acme Ltd'),
            partyToggles: area.querySelectorAll('[id^="include-GroupHeader-InitiatingParty"]').length,
            marks: area.querySelectorAll('[data-field-mode]').length,
            creationInput: !!area.querySelector('input#GroupHeader-CreationDateTime'),
          };
        });
        if (form.msgId || form.msgLabel) problems.push('the hidden element is still shown in the preview');
        if (form.nbInput || !form.nbText) problems.push('the label element is not shown as text "3"');
        if (form.partyInputs > 0 || !form.partyName) problems.push('the section in label mode still has inputs, or lost its value');
        if (form.partyToggles > 0) problems.push('a label section still has boxes to tick');
        if (form.marks > 0) problems.push('the preview still shades elements');
        if (!form.creationInput) problems.push('an element in no mode lost its input');
        // the message is the same, however it is shown
        if ((await xmlShown(page)) !== (globalThis as unknown as { __xml: string }).__xml) problems.push('the preview changed the XML');
        if (!(await xmlShown(page)).includes('<MsgId>DEFAULT-1</MsgId>')) problems.push('the hidden default is not in the XML');
        // and back
        await setPreview(page, false);
        if (!(await present(page, 'input#GroupHeader-MessageIdentification'))) problems.push('turning the preview off did not bring the hidden element back');
        if ((await page.$eval('#GroupHeader-MessageIdentification', (e) => (e as HTMLInputElement).value)) !== 'DEFAULT-1') problems.push('the default was lost');
        return problems;
      },
    },
    {
      ...base,
      name: 'fieldmode-section-and-reset',
      steps: async (page) => {
        await setMode(page, 'Initiating Party', 'hidden');
        await setMode(page, 'Initiating Party', 'editable'); // back
      },
      expect: async (page) => ((await present(page, '[data-field-mode]')) ? ['an element set back to editable is still marked'] : []),
    },
    {
      ...base,
      name: 'fieldmode-dark-spanish',
      query: '?theme=dark&lang=es',
      steps: async (page) => {
        await setMode(page, 'Identificación del mensaje', 'hidden', true);
        await setMode(page, 'Parte iniciadora', 'label', true);
        await page.click("button[aria-label^='Modo de campo de Número de operaciones:']");
        await page.waitForSelector('[role=menu]');
        await settle(300);
      },
      expect: async (page) => {
        const items = await page.evaluate(() => [...document.querySelectorAll('[role=menuitemradio]')].map((e) => e.textContent ?? ''));
        const label = await page.$eval('[data-preview-as-designed]', (e) => e.parentElement?.textContent ?? '');
        return [
          ...(items.join('|').includes('Etiqueta') && items.join('|').includes('Oculto') ? [] : [`the menu is not in Spanish: ${JSON.stringify(items)}`]),
          ...(/Vista previa del diseño/.test(label) ? [] : [`the preview toggle says "${label}"`]),
          ...((await present(page, '[data-field-mode=hidden]')) && (await present(page, '[data-field-mode=label]')) ? [] : ['the shading is missing']),
        ];
      },
    },
    {
      ...base,
      name: 'fieldmode-plain-skin',
      query: '?skin=plain',
      steps: async (page) => {
        await page.select("select[aria-label^='Field mode of Message Identification:']", 'hidden');
        await settle(300);
        await setPreviewPlain(page);
      },
      expect: async (page) => {
        const r = await page.evaluate(() => ({ marked: document.querySelectorAll('[data-field-mode]').length, classes: document.querySelectorAll('[data-schema-form] [class]').length }));
        return [...(r.classes === 0 ? [] : [`the plain skin has ${r.classes} class attributes`]), ...(r.marked === 1 ? [] : [`expected one marked element, found ${r.marked}`])];
      },
    },
    {
      ...base,
      name: 'fieldmode-copies-follow-the-modes',
      clipboard: { access: 'granted' as const },
      steps: async (page) => {
        await page.locator('#GroupHeader-MessageIdentification').fill('DEFAULT-1');
        await page.locator('#GroupHeader-NumberOfTransactions').fill('3');
        await page.locator('#GroupHeader-InitiatingParty-Name').fill('Acme Ltd');
        await setMode(page, 'Message Identification', 'hidden');
        await setMode(page, 'Number Of Transactions', 'label');
        await setMode(page, 'Initiating Party', 'label');
        const g = globalThis as unknown as { __md: string; __tsv: string };
        await copyAs(page, 'markdown');
        g.__md = await clipText(page);
        await copyAs(page, 'spreadsheet');
        g.__tsv = await clipText(page);
        await copyAs(page, 'figma');
      },
      expect: async (page) => {
        const g = globalThis as unknown as { __md: string; __tsv: string };
        const problems: string[] = [];
        if (!g.__md.includes('- **Message Identification** (required, hidden): DEFAULT-1')) problems.push('Markdown does not say the hidden element and its default');
        if (!g.__md.includes('- **Initiating Party** (required, label)')) problems.push('Markdown does not say the label section');
        const rows = g.__tsv.replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
        if (rows[0]![8] !== 'Mode') problems.push('the spreadsheet has no Mode column');
        const msg = rows.find((r) => r[1] === 'GroupHeader.MessageIdentification');
        if (!msg || msg[8] !== 'Hidden' || msg[9] !== 'DEFAULT-1') problems.push(`the hidden element's row is ${JSON.stringify(msg)}`);
        const svg = await clipText(page);
        const r = await page.evaluate((text) => {
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          const t1 = (id: string) => doc.getElementById(id)?.textContent ?? null;
          return {
            hiddenDrawn: doc.getElementById('GroupHeader.MessageIdentification') !== null,
            labelValue: t1('GroupHeader.NumberOfTransactions.value'),
            labelBox: doc.getElementById('GroupHeader.NumberOfTransactions.input.box') !== null,
            partyName: t1('GroupHeader.InitiatingParty.Name.value'),
            partyBoxes: doc.querySelectorAll('[id^="GroupHeader.InitiatingParty."][id$=".box"]').length,
            creationBox: doc.getElementById('GroupHeader.CreationDateTime.input.box') !== null,
          };
        }, svg);
        if (r.hiddenDrawn) problems.push('the Figma drawing contains the hidden element');
        if (r.labelValue !== '3' || r.labelBox) problems.push(`the label is drawn as value "${r.labelValue}", box ${r.labelBox}`);
        if (r.partyName !== 'Acme Ltd' || r.partyBoxes > 0) problems.push('the label section is not drawn as text');
        if (!r.creationBox) problems.push('an editable element lost its box');
        // the drawing and the preview agree on what is shown
        await setPreview(page, true);
        const shown = await page.evaluate(() => ({ msg: !!document.querySelector('[data-form-area] input#GroupHeader-MessageIdentification'), nb: !!document.querySelector('[data-form-area] input#GroupHeader-NumberOfTransactions') }));
        if (shown.msg || shown.nb) problems.push('the preview and the drawing disagree');
        return problems;
      },
    },
    { ...base, name: 'fieldmode-narrow', viewport: { width: 480, height: 900 }, steps: async (page) => { await setMode(page, 'Message Identification', 'hidden'); } },
  ];
}
async function setPreviewPlain(_page: Page): Promise<void> {
  // the preview toggle is the page's own, in every skin; this state checks the marked view, so it is left off
}

// ---------------------------------------------------------------------------- "Copy as": what the screen shows, for documents and tools

const COPY_OUT = join(dirname(fileURLToPath(import.meta.url)), '../out');
const copyAsButton = '[data-copy-as]';
async function openCopyAs(page: Page): Promise<void> {
  await page.click(copyAsButton);
  await page.waitForSelector('[role=menu]', { timeout: 5000 });
  await settle(200);
}
async function copyAs(page: Page, format: string): Promise<void> {
  await openCopyAs(page);
  await page.click(`[role=menuitem][data-format=${format}]`);
  for (let i = 0; i < 40; i++) {
    if ((await page.$eval('[data-copy-status]', (e) => e.textContent ?? '')) !== '') break;
    await settle(150);
  }
}
const clipText = (page: Page): Promise<string> => page.evaluate(() => navigator.clipboard.readText());
const clipTypes = (page: Page) =>
  page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const item of await navigator.clipboard.read()) {
      for (const type of item.types) {
        const blob = await item.getType(type);
        out[type] = type.startsWith('image/') ? `${blob.size}` : await blob.text();
      }
    }
    return out;
  });
const copyStatus = (page: Page): Promise<string> => page.$eval('[data-copy-status]', (e) => e.textContent ?? '');
const optionIn = (page: Page, which: string): Promise<boolean> => page.$eval(`[data-option=${which}]`, (e) => e.getAttribute('aria-checked') === 'true');
async function toggleOption(page: Page, which: string): Promise<void> {
  await openCopyAs(page);
  await page.click(`[data-option=${which}]`);
  await page.keyboard.press('Escape');
  await settle(150);
}
async function includeSection(page: Page, id: string): Promise<void> {
  await page.click(`#${id}`);
  await settle(300);
}

function copyAsScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 1000 }, clipboard: { access: 'granted' as const } };
  const fill = async (page: Page) => {
    await page.locator('#GroupHeader-MessageIdentification').fill('MSG-1');
    await page.locator('#GroupHeader-NumberOfTransactions').fill('2');
    await page.locator('#GroupHeader-InitiatingParty-Name').fill('Acme Ltd');
    await settle(300);
  };
  return [
    {
      ...base,
      name: 'copyas-menu-open',
      steps: openCopyAs,
      expect: async (page) => {
        const r = await page.evaluate(() => {
          const btn = document.querySelector<HTMLElement>('[data-copy-as]')!.getBoundingClientRect();
          const form = document.querySelector<HTMLElement>('[data-form-area]')!.getBoundingClientRect();
          const xml = document.querySelector<HTMLElement>('[aria-label="XML preview"]')!.getBoundingClientRect();
          const menu = document.querySelector('[role=menu]');
          return {
            above: btn.bottom <= form.top + 1,
            left: btn.left < xml.left && btn.left >= form.left - 1,
            items: [...(menu?.querySelectorAll('[role=menuitem]') ?? [])].map((e) => e.getAttribute('data-format')),
            checks: [...(menu?.querySelectorAll('[role=menuitemcheckbox]') ?? [])].map((e) => e.getAttribute('data-option')),
            focused: document.activeElement?.getAttribute('role'),
          };
        });
        const problems: string[] = [];
        if (!r.above) problems.push('the button is not above the left panel');
        if (!r.left) problems.push('the button is not at the left');
        if (JSON.stringify(r.items) !== JSON.stringify(['word', 'markdown', 'spreadsheet', 'outline', 'json', 'image', 'figma', 'svgfile'])) problems.push(`menu items are ${JSON.stringify(r.items)}`);
        if (JSON.stringify(r.checks) !== JSON.stringify(['definitions', 'excluded', 'emptyOptional'])) problems.push(`options are ${JSON.stringify(r.checks)}`);
        if (r.focused !== 'menuitem') problems.push(`focus is on "${r.focused}", not the first item`);
        if (await optionIn(page, 'definitions')) problems.push('definitions should be off by default');
        if (!(await optionIn(page, 'excluded')) || !(await optionIn(page, 'emptyOptional'))) problems.push('the other two options should be on by default');
        return problems;
      },
    },
    {
      ...base,
      name: 'copyas-keyboard',
      steps: async (page) => {
        await page.focus(copyAsButton);
        await page.keyboard.press('Enter');
        await page.waitForSelector('[role=menu]');
        await settle(200);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter'); // the third item: spreadsheet
        await settle(1200);
      },
      expect: async (page) => {
        const text = await clipText(page);
        return [
          ...(text.startsWith('Level\tPath\tElement') ? [] : [`the keyboard did not copy the spreadsheet: "${text.slice(0, 60)}"`]),
          ...((await page.evaluate(() => document.activeElement?.hasAttribute('data-copy-as'))) ? [] : ['focus did not return to the button']),
          ...((await page.$('[role=menu]')) ? ['the menu stayed open'] : []),
        ];
      },
    },
    {
      ...base,
      name: 'copyas-markdown-follows-the-screen',
      query: '?lang=en', // ISO English: the export carries the standard's own labels
      steps: async (page) => {
        await fill(page);
        await includeSection(page, 'include-GroupHeader-InitiatingParty-PostalAddress');
        await page.locator('#GroupHeader-InitiatingParty-PostalAddress-TownName').fill('Berlin');
        await settle(300);
        await copyAs(page, 'markdown');
      },
      expect: async (page) => {
        const md = await clipText(page);
        const problems: string[] = [];
        for (const line of [
          '# Customer Credit Transfer Initiation V13',
          '`pain.001.001.13` · CustomerCreditTransferInitiationV13',
          '- **Group Header** (required)',
          '  - **Message Identification** (required): MSG-1',
          '  - **Number Of Transactions** (required): 2',
          '    - **Name** (optional): Acme Ltd'.replace(/^ {4}/, '    '),
          '      - **Town Name** (optional): Berlin',
          '    - **Identification** (optional): *not included*',
          '  - **Forwarding Agent** (optional): *not included*',
        ])
          if (!md.includes(line)) problems.push(`missing: ${line}`);
        if (!/^- \*\*Payment Information\*\* \(list 1\.\.∞, required\)/m.test(md)) problems.push('the payment information list is not described');
        if (!/Copied as Markdown/.test(await copyStatus(page))) problems.push(`status is "${await copyStatus(page)}"`);
        // what the screen shows: the included address is open, the others are not
        const shown = await page.evaluate(() => ({
          address: !!document.querySelector('#GroupHeader-InitiatingParty-PostalAddress-TownName'),
          identification: !!document.querySelector('#GroupHeader-InitiatingParty-Identification-OrganisationIdentification-AnyBIC, [id^="GroupHeader-InitiatingParty-Identification"]:not([id^="include"])'),
        }));
        if (!shown.address) problems.push('the screen does not show the address the copy says is included');
        if (shown.identification) problems.push('the screen shows an identification the copy says is not included');
        return problems;
      },
    },
    {
      ...base,
      name: 'copyas-options',
      steps: async (page) => {
        await fill(page);
        await toggleOption(page, 'excluded'); // off: leave out sections that are not included
        await toggleOption(page, 'emptyOptional'); // off: leave out optional elements left empty
        await toggleOption(page, 'definitions'); // on
        await copyAs(page, 'markdown');
      },
      expect: async (page) => {
        const md = await clipText(page);
        const problems: string[] = [];
        if (/Forwarding Agent|Initiation Source|Postal Address/.test(md)) problems.push('sections that are not included were not left out');
        if (/Control Sum/.test(md)) problems.push('an optional element left empty was not left out');
        if (!/Creation Date Time\*\* \(required\): \*\(empty\)\*/.test(md)) problems.push('a required element left empty must still show');
        if (!/- _Point to point reference/.test(md)) problems.push('definitions were not added');
        // the menu remembers its options
        await openCopyAs(page);
        if ((await optionIn(page, 'excluded')) || (await optionIn(page, 'emptyOptional')) || !(await optionIn(page, 'definitions'))) problems.push('the menu did not keep the options');
        return problems;
      },
    },
    {
      ...base,
      name: 'copyas-word',
      steps: async (page) => {
        await fill(page);
        await copyAs(page, 'word');
      },
      expect: async (page) => {
        const c = await clipTypes(page);
        const problems: string[] = [];
        const html = c['text/html'] ?? '';
        if (!/<table[^>]*>/.test(html) || !html.includes('<h2>Customer Credit Transfer Initiation V13</h2>')) problems.push('no table with a heading on the clipboard as HTML');
        if (!html.includes('MSG-1') || !html.includes('Acme Ltd')) problems.push('the values are missing from the HTML');
        if (/class=/.test(html)) problems.push('the HTML carries classes, which word processors drop');
        const text = c['text/plain'] ?? '';
        if (!text.startsWith('Customer Credit Transfer Initiation V13 (pain.001.001.13)') || !text.includes('Message Identification (required): MSG-1')) problems.push(`the plain-text form is "${text.slice(0, 80)}"`);
        // pasted into an editable area, as a word processor would take it: a real table appears
        const pasted = await page.evaluate((h) => {
          const box = document.createElement('div');
          box.contentEditable = 'true';
          document.body.appendChild(box);
          box.innerHTML = h;
          const r = { tables: box.querySelectorAll('table').length, rows: box.querySelectorAll('tr').length };
          box.remove();
          return r;
        }, html);
        if (pasted.tables !== 1 || pasted.rows < 10) problems.push(`the HTML does not make a table of rows: ${JSON.stringify(pasted)}`);
        return problems;
      },
    },
    {
      ...base,
      name: 'copyas-spreadsheet-and-outline-and-json',
      steps: async (page) => {
        await fill(page);
        await copyAs(page, 'spreadsheet');
        (globalThis as unknown as { __tsv: string }).__tsv = await clipText(page);
        await copyAs(page, 'outline');
        (globalThis as unknown as { __outline: string }).__outline = await clipText(page);
        await copyAs(page, 'json');
      },
      expect: async (page) => {
        const g = globalThis as unknown as { __tsv: string; __outline: string };
        const problems: string[] = [];
        const rows = g.__tsv.replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
        if (rows[0]![0] !== 'Level' || !rows.some((r) => r[1] === 'GroupHeader.MessageIdentification' && r[8] === 'MSG-1')) problems.push('the spreadsheet rows are wrong');
        if (new Set(rows.map((r) => r.length)).size !== 1) problems.push('the spreadsheet rows differ in width');
        if (!g.__outline.includes('    Message Identification (required): MSG-1')) problems.push('the outline is wrong');
        const json = JSON.parse(await clipText(page));
        if (json.identifier !== 'pain.001.001.13' || json.elements[0].name !== 'GroupHeader') problems.push('the JSON is wrong');
        if (json.elements[0].children?.[0]?.value !== 'MSG-1') problems.push('the JSON lacks the value');
        return problems;
      },
    },
    {
      ...base,
      name: 'copyas-image',
      steps: async (page) => {
        await fill(page);
        await copyAs(page, 'image');
        await settle(500);
      },
      expect: async (page) => {
        const problems: string[] = [];
        const png = await page.evaluate(async () => {
          for (const item of await navigator.clipboard.read()) {
            if (!item.types.includes('image/png')) continue;
            const blob = await item.getType('image/png');
            const bitmap = await createImageBitmap(blob);
            const buffer = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            for (const b of buffer) binary += String.fromCharCode(b);
            return { width: bitmap.width, height: bitmap.height, base64: btoa(binary) };
          }
          return undefined;
        });
        if (!png) return [`no image on the clipboard (status "${await copyStatus(page)}")`];
        const form = await page.evaluate(() => {
          const r = document.querySelector('[data-schema-form]')!.getBoundingClientRect();
          return { width: r.width, height: r.height };
        });
        if (png.width < form.width * 1.8) problems.push(`the picture is ${png.width}px wide for a ${Math.round(form.width)}px form`);
        if (png.height < form.height * 1.8) problems.push(`the picture is ${png.height}px high for a ${Math.round(form.height)}px form (the form scrolls: all of it must be in the picture)`);
        writeFileSync(join(COPY_OUT, 'copyas-image-clipboard.png'), Buffer.from(png.base64, 'base64'));
        if (!/Copied as Image/.test(await copyStatus(page))) problems.push(`status is "${await copyStatus(page)}"`);
        return problems;
      },
    },
    {
      ...base,
      name: 'copyas-zoomed-part',
      steps: async (page) => {
        await openType(page);
        await page.keyboard.type('GroupHeader114');
        await settle();
        await clickText(page, '[cmdk-item]', /^GroupHeader114/);
        await settle(700);
        await page.locator('#MessageIdentification').fill('MSG-9');
        await settle(300);
        await copyAs(page, 'markdown');
      },
      expect: async (page) => {
        const md = await clipText(page);
        return [
          ...(md.startsWith('# Group Header114\n\n`pain.001.001.13` · GroupHeader114') ? [] : [`heading is "${md.slice(0, 80)}"`]),
          ...(md.includes('- **Message Identification** (required): MSG-9') ? [] : ['the zoomed part\'s value is missing']),
          ...(/Payment Information/.test(md) ? ['the rest of the message is in the copy'] : []),
        ];
      },
    },
    {
      ...base,
      name: 'copyas-spanish',
      query: '?lang=es',
      steps: async (page) => {
        await page.locator('#GroupHeader-MessageIdentification').fill('MSG-1');
        await settle(300);
        await copyAs(page, 'markdown');
      },
      expect: async (page) => {
        const md = await clipText(page);
        const label = await page.$eval(copyAsButton, (e) => e.textContent ?? '');
        return [
          ...(/Copiar como/.test(label) ? [] : [`the button says "${label}"`]),
          ...(md.includes('- **Identificación del mensaje** (obligatorio): MSG-1') ? [] : [`not in Spanish: ${md.slice(0, 200)}`]),
          ...(/Copiado como Markdown/.test(await copyStatus(page)) ? [] : [`status is "${await copyStatus(page)}"`]),
        ];
      },
    },
    {
      ...base,
      name: 'copyas-json-output-mode',
      query: '?format=json',
      steps: async (page) => {
        await page.locator('#GroupHeader-MessageIdentification').fill('MSG-1');
        await settle(300);
        await copyAs(page, 'markdown');
      },
      expect: async (page) => ((await clipText(page)).includes('- **Message Identification** (required): MSG-1') ? [] : ['the copy depends on the XML/JSON output setting']),
    },
    {
      ...base,
      name: 'copyas-figma-svg',
      steps: async (page) => {
        await fill(page);
        await includeSection(page, 'include-GroupHeader-InitiatingParty-PostalAddress');
        await page.locator('#GroupHeader-InitiatingParty-PostalAddress-TownName').fill('Berlin');
        await page.locator('#GroupHeader-NumberOfTransactions').fill('2x');
        await page.keyboard.press('Tab');
        await settle(300);
        await copyAs(page, 'figma');
      },
      expect: async (page) => {
        const svg = await clipText(page);
        const problems: string[] = [];
        if (!svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"')) problems.push(`not SVG: ${svg.slice(0, 80)}`);
        if (/<style|class=|foreignObject|<use|href=|<image/.test(svg)) problems.push('the SVG uses something a design tool drops');
        // the browser must read it as a picture, with the size it declares, and every id unique
        const r = await page.evaluate(async (text) => {
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
          const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
          const img = new Image();
          await new Promise<void>((ok, bad) => {
            img.onload = () => ok();
            img.onerror = () => bad(new Error('the browser could not read the SVG'));
            img.src = url;
          });
          const text1 = (id: string) => doc.getElementById(id)?.textContent ?? null;
          return {
            parseError: doc.querySelector('parsererror') !== null,
            unique: new Set(ids).size === ids.length,
            width: img.naturalWidth,
            height: img.naturalHeight,
            title: text1('Title'),
            msg: text1('GroupHeader.MessageIdentification.input.value'),
            town: text1('GroupHeader.InitiatingParty.PostalAddress.TownName.input.value'),
            err: text1('GroupHeader.NumberOfTransactions.error'),
            excluded: text1('GroupHeader.ForwardingAgent.include.label'),
            payment: doc.getElementById('PaymentInformation') !== null,
            count: ids.length,
          };
        }, svg);
        if (r.parseError) problems.push('the SVG is not well-formed');
        if (!r.unique) problems.push('ids are not unique');
        if (r.width !== 760 || r.height < 1500) problems.push(`the picture is ${r.width}x${r.height}`);
        if (r.title !== 'Customer Credit Transfer Initiation V13') problems.push(`title "${r.title}"`);
        if (r.msg !== 'MSG-1' || r.town !== 'Berlin') problems.push(`values ${r.msg} / ${r.town}`);
        if (!/^Error: /.test(r.err ?? '')) problems.push(`the error is "${r.err}"`);
        if (r.excluded !== 'Include Forwarding Agent') problems.push(`left-out section is "${r.excluded}"`);
        if (!r.payment) problems.push('the payment information list is missing');
        if (!/Copied as SVG for Figma/.test(await copyStatus(page))) problems.push(`status is "${await copyStatus(page)}"`);
        // a picture to look at
        const shot = await page.browser().newPage();
        try {
          await shot.setViewport({ width: r.width, height: r.height });
          await shot.goto(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
          await shot.screenshot({ path: join(COPY_OUT, 'copyas-figma-svg-render.png'), fullPage: true });
        } finally {
          await shot.close();
        }
        return problems;
      },
    },
    {
      ...base,
      name: 'copyas-svg-file',
      steps: async (page) => {
        await fill(page);
        const dir = await downloadsTo(page);
        (globalThis as unknown as { __dir: string }).__dir = dir;
        await openCopyAs(page);
        await page.click('[role=menuitem][data-format=svgfile]');
        await settle(1200);
      },
      expect: async (page) => {
        const dir = (globalThis as unknown as { __dir: string }).__dir;
        const files = readdirSync(dir);
        const problems: string[] = [];
        if (!files.includes('pain.001.001.13.svg')) return [`no SVG saved; the folder holds ${JSON.stringify(files)}`];
        const saved = readFileSync(join(dir, 'pain.001.001.13.svg'), 'utf8');
        if (!saved.startsWith('<?xml') || !saved.includes('id="MessageIdentification"') && !saved.includes('GroupHeader.MessageIdentification')) problems.push('the saved file is not the drawing');
        if (!saved.includes('>MSG-1<')) problems.push('the saved file lacks the value');
        if (!/Saved SVG file/.test(await copyStatus(page))) problems.push(`status is "${await copyStatus(page)}"`);
        return problems;
      },
    },
    { ...base, name: 'copyas-narrow', viewport: { width: 480, height: 900 }, steps: openCopyAs },
    { ...base, name: 'copyas-menu-dark-spanish', query: '?theme=dark&lang=es', steps: openCopyAs },
  ];
}

// ---------------------------------------------------------------------------- XSD validation

// A reduced stand-in for ISO's pain.001.001.13 schema (see the file). ISO's own site sends no cross-origin permission, so
// the page cannot fetch the real one: a state like the deployed page's, where the schema must be loaded from a file.
const TEST_XSD = decodeURIComponent(new URL('../xsd/pain.001.001.13.test.xsd', import.meta.url).pathname);
const ISO_XSD = 'https://www.iso20022.org/sites/default/files/documents/messages/pain/schemas/pain.001.001.13.xsd';

const xsdButton = (page: Page) =>
  page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="XML preview"] button')].find((x) => /XSD Validate|Validar XSD/.test(x.textContent ?? ''));
    const load = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="XML preview"] button')].find((x) => /Load file|Cargar archivo/.test(x.textContent ?? ''));
    const r = b?.getBoundingClientRect();
    const l = load?.getBoundingClientRect();
    return {
      found: !!b,
      state: b?.dataset.xsdState ?? '',
      disabled: b?.getAttribute('aria-disabled') ?? '',
      title: b?.title ?? '',
      leftOfLoad: !!r && !!l && r.right <= l.left + 1 && Math.abs(r.top - l.top) < 3,
    };
  });
const waitForXsd = async (page: Page, state: string): Promise<void> => {
  for (let i = 0; i < 40; i++) {
    if ((await xsdButton(page)).state === state) return;
    await settle(250);
  }
};
const loadSchemaFile = async (page: Page, path: string): Promise<void> => {
  const input = await page.$('input[data-load-schema]');
  if (!input) throw new Error('no schema file input');
  await input.uploadFile(path);
  await settle(700);
};
const clickXsd = (page: Page) => clickText(page, '[aria-label="XML preview"] button', /^(XSD Validate|Validar XSD)$/);
const panel = (page: Page) =>
  page.evaluate(() => {
    const p = document.querySelector('[data-xsd-panel]');
    return { open: !!p, count: p?.querySelector('[data-xsd-count]')?.textContent ?? '', text: p?.textContent ?? '', lines: [...(p?.querySelectorAll('li') ?? [])].map((li) => li.textContent ?? '') };
  });
const waitForPanel = async (page: Page, until: (p: Awaited<ReturnType<typeof panel>>) => boolean): Promise<void> => {
  for (let i = 0; i < 60; i++) {
    if (until(await panel(page))) return;
    await settle(250);
  }
};
const xmlText = (page: Page) => page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');
/** The ids of the group header's fields: with the whole message shown they start with "GroupHeader-", shown on its own they do not. */
async function fillGroupHeader(page: Page, prefix = 'GroupHeader-'): Promise<void> {
  await page.locator(`#${prefix}MessageIdentification`).fill('MSG-1');
  await clickText(page, 'button', /^now$|^ahora$/);
  await page.locator(`#${prefix}NumberOfTransactions`).fill('1');
  await page.locator(`#${prefix}InitiatingParty-Name`).fill('Acme Ltd');
  await settle(700);
}

function xsdScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 1000 } };
  return [
    {
      ...base,
      name: 'xsd-button-without-schema',
      steps: async (page) => waitForXsd(page, 'unavailable'),
      expect: async (page) => {
        const b = await xsdButton(page);
        const problems: string[] = [];
        if (!b.found) return ['no XSD Validate button'];
        if (!b.leftOfLoad) problems.push('the button is not to the left of Load file…, on the same line');
        if (b.state !== 'unavailable') problems.push(`state is "${b.state}", expected the schema to be unavailable (ISO sends no cross-origin permission)`);
        if (b.disabled !== 'true') problems.push('the button is not disabled');
        if (b.title !== `Could not load schema from ${ISO_XSD}. Right-click to load from local file.`) problems.push(`hover text is "${b.title}"`);
        // a click does nothing while it is disabled
        await clickXsd(page);
        if ((await panel(page)).open) problems.push('clicking the disabled button opened the validation window');
        return problems;
      },
    },
    {
      ...base,
      name: 'xsd-right-click-opens-the-file-chooser',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        await page.evaluate(() => {
          (window as unknown as { __chooser: number }).__chooser = 0;
          document.querySelector<HTMLInputElement>('input[data-load-schema]')!.addEventListener('click', (e) => {
            e.preventDefault(); // no native dialog in a headless run
            (window as unknown as { __chooser: number }).__chooser++;
          });
        });
        const b = [...(await page.$$('[aria-label="XML preview"] button'))];
        for (const h of b) if (/XSD Validate/.test(await h.evaluate((e) => e.textContent ?? ''))) await h.click({ button: 'right' });
        await settle(300);
      },
      expect: async (page) => ((await page.evaluate(() => (window as unknown as { __chooser: number }).__chooser)) === 1 ? [] : ['right-clicking the disabled button did not open the file chooser']),
    },
    {
      ...base,
      name: 'xsd-load-from-file-then-validate',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        await loadSchemaFile(page, TEST_XSD);
      },
      expect: async (page) => {
        const b = await xsdButton(page);
        const problems: string[] = [];
        if (b.state !== 'ready' || b.disabled !== 'false') problems.push(`after loading the file the state is "${b.state}", disabled="${b.disabled}"`);
        if (b.title !== 'Validate the text of the message below using pain.001.001.13.test.xsd (loaded from your computer)') problems.push(`hover text is "${b.title}"`);
        await clickXsd(page);
        await waitForPanel(page, (p) => p.open && /error/.test(p.count));
        const first = await panel(page);
        if (!first.open) return [...problems, 'the validation window did not open'];
        if (!/Validation Errors/.test(first.text)) problems.push('the window has no title');
        if (!first.lines.some((l) => /MsgId|CreDtTm|Missing child/.test(l))) problems.push(`no complaint about the empty group header: ${JSON.stringify(first.lines)}`);
        if (!first.lines.every((l) => /^Line \d+/.test(l))) problems.push(`some errors carry no line number: ${JSON.stringify(first.lines)}`);
        const n = first.lines.length;
        // correcting the data refreshes the window, and the errors go away
        await fillGroupHeader(page);
        await waitForPanel(page, (p) => p.count === '✓');
        const last = await panel(page);
        if (last.count !== '✓') problems.push(`after filling the group header the window says "${last.count}" ${JSON.stringify(last.lines)} (it had ${n} errors)`);
        if (!/conforms to the schema/.test(last.text)) problems.push('no "valid" message');
        return problems;
      },
    },
    {
      ...base,
      name: 'xsd-errors-follow-the-edits',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        await loadSchemaFile(page, TEST_XSD);
        await clickXsd(page);
        await fillGroupHeader(page);
        await waitForPanel(page, (p) => p.count === '✓');
        await page.locator('#GroupHeader-NumberOfTransactions').fill('12ab'); // the schema wants digits only
        await waitForPanel(page, (p) => /error/.test(p.count));
      },
      expect: async (page) => {
        const p = await panel(page);
        const problems: string[] = [];
        if (!/NbOfTxs/.test(p.text) || !/pattern/.test(p.text)) problems.push(`the bad number of transactions is not reported: ${JSON.stringify(p.lines)}`);
        if (p.count !== '1 error') problems.push(`expected exactly "1 error", got "${p.count}"`);
        if (/\{urn:/.test(p.text)) problems.push('the message still carries the namespace noise');
        return problems;
      },
    },
    {
      ...base,
      name: 'xsd-panel-below-the-xml',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        await loadSchemaFile(page, TEST_XSD);
        await clickXsd(page);
        await waitForPanel(page, (p) => /error/.test(p.count));
      },
      expect: async (page) => {
        const r = await page.evaluate(() => {
          const pane = document.querySelector('.cm-editor')?.getBoundingClientRect();
          const p = document.querySelector('[data-xsd-panel]')?.getBoundingClientRect();
          return { below: !!pane && !!p && p.top >= pane.bottom - 1, inside: !!p && p.bottom <= window.innerHeight + 1, small: !!p && p.height < window.innerHeight * 0.4 };
        });
        return [...(r.below ? [] : ['the window is not below the XML']), ...(r.inside ? [] : ['the window runs off the page']), ...(r.small ? [] : ['the window is not small'])];
      },
    },
    {
      ...base,
      name: 'xsd-wrong-schema-file',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        const dir = mkdtempSync(join(tmpdir(), 'xsd-'));
        const other = join(dir, 'pain.002.xsd');
        writeFileSync(other, readFileSync(TEST_XSD, 'utf8').replaceAll('pain.001.001.13', 'pain.002.001.15'));
        await loadSchemaFile(page, other);
      },
      expect: async (page) => {
        const b = await xsdButton(page);
        const note = await page.evaluate(() => document.querySelector('[data-xsd-notice]')?.textContent ?? '');
        return [
          ...(b.state === 'unavailable' ? [] : [`a schema for another message was accepted (state "${b.state}")`]),
          ...(/is a schema for urn:iso:std:iso:20022:tech:xsd:pain\.002\.001\.15, not for urn:iso:std:iso:20022:tech:xsd:pain\.001\.001\.13/.test(note) ? [] : [`the notice is "${note}"`]),
        ];
      },
    },
    {
      ...base,
      name: 'xsd-not-a-schema-file',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        const dir = mkdtempSync(join(tmpdir(), 'xsd-'));
        const bad = join(dir, 'notes.xsd');
        writeFileSync(bad, '<hello>not a schema</hello>');
        await loadSchemaFile(page, bad);
      },
      expect: async (page) => {
        const note = await page.evaluate(() => document.querySelector('[data-xsd-notice]')?.textContent ?? '');
        return /notes\.xsd is not an XML Schema/.test(note) ? [] : [`the notice is "${note}"`];
      },
    },
    {
      ...base,
      name: 'xsd-zoomed-part-gets-the-namespace',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        await loadSchemaFile(page, TEST_XSD); // loaded while the whole message is shown
        await openType(page);
        await page.keyboard.type('GroupHeader114');
        await settle();
        await clickText(page, '[cmdk-item]', /^GroupHeader114/);
        await settle(900);
        await clickXsd(page); // the schema is still there: only the type changed
        await waitForPanel(page, (p) => /error/.test(p.count));
      },
      expect: async (page) => {
        const problems: string[] = [];
        const first = await panel(page);
        if (!first.open) return ['the schema did not survive choosing another type of the same message'];
        if (!first.lines.some((l) => /MsgId|Missing child/.test(l))) problems.push(`the part was not validated: ${JSON.stringify(first.lines)}`);
        const shown = await xmlText(page);
        if (/xmlns/.test(shown)) problems.push('the namespace was inserted into the XML shown');
        if (!/^\s*<GroupHeader114>/.test(shown.replace(/^<\?xml[^>]*\?>\s*/, ''))) problems.push(`the XML shown starts with "${shown.slice(0, 40)}"`);
        await fillGroupHeader(page, '');
        await waitForPanel(page, (p) => p.count === '✓');
        if ((await panel(page)).count !== '✓') problems.push('the zoomed group header never became valid');
        return problems;
      },
    },
    {
      ...base,
      name: 'xsd-schema-reset-by-another-message',
      steps: async (page) => {
        await waitForXsd(page, 'unavailable');
        await loadSchemaFile(page, TEST_XSD);
        await clickXsd(page);
        await waitForPanel(page, (p) => p.open);
        await page.locator('#message-picker').click();
        await settle(300);
        await clickText(page, '[role=option]', /^pain\.002\.001\.15/);
        await settle(1200);
        await waitForXsd(page, 'unavailable');
      },
      expect: async (page) => {
        const b = await xsdButton(page);
        const p = await panel(page);
        return [
          ...(b.state === 'unavailable' ? [] : [`the schema of the previous message is still in use ("${b.state}")`]),
          ...(b.title.includes('pain.002.001.15.xsd') ? [] : [`hover text does not name the new message's schema: "${b.title}"`]),
          ...(p.open ? ['the validation window stayed open'] : []),
        ];
      },
    },
    {
      ...base,
      name: 'xsd-json-output',
      query: '?format=json',
      steps: async () => {
        await settle(1500);
      },
      expect: async (page) => {
        const b = await xsdButton(page);
        return [...(b.disabled === 'true' ? [] : ['the button should be disabled for JSON output']), ...(b.title === 'XSD validation checks XML. Switch the output to XML to use it.' ? [] : [`hover text is "${b.title}"`])];
      },
    },
    {
      ...base,
      name: 'xsd-spanish-dark',
      query: '?lang=es&theme=dark',
      steps: async (page) => {
        await settle(1500);
        await loadSchemaFile(page, TEST_XSD);
        await clickXsd(page);
        await waitForPanel(page, (p) => p.open);
      },
      expect: async (page) => {
        const b = await xsdButton(page);
        const p = await panel(page);
        return [
          ...(b.title === 'Validar el texto del mensaje de abajo con pain.001.001.13.test.xsd (cargado desde su equipo)' ? [] : [`hover text is "${b.title}"`]),
          ...(/Errores de validación/.test(p.text) ? [] : ['the window is not in Spanish']),
        ];
      },
    },
    // Optional: with VISUAL_ISO_XSD=/path/to/pain.001.001.13.xsd (ISO's own file) the real schema is used. Not run by default: ISO's file is not in the repository.
    ...(process.env.VISUAL_ISO_XSD
      ? [
          {
            ...base,
            name: 'xsd-real-iso-schema',
            steps: async (page: Page) => {
              await waitForXsd(page, 'unavailable');
              await loadSchemaFile(page, process.env.VISUAL_ISO_XSD!);
              await clickXsd(page);
              await waitForPanel(page, (p) => /error/.test(p.count));
            },
            expect: async (page: Page) => {
              const p = await panel(page);
              return p.lines.some((l) => /GrpHdr|MsgId|Missing child/.test(l)) ? [] : [`the real schema's complaints are missing: ${JSON.stringify(p.lines)}`];
            },
          } satisfies Scenario,
        ]
      : []),
    { name: 'xsd-narrow', app: 'demo-form', viewport: { width: 480, height: 900 }, steps: async (page) => { await waitForXsd(page, 'unavailable'); await loadSchemaFile(page, TEST_XSD); await clickXsd(page); await settle(2000); } },
  ];
}

// ---------------------------------------------------------------------------- the banner and the "about" window

function bannerScenarios(): Scenario[] {
  const base = { viewport: { width: 1440, height: 900 } };
  const bannerInfo = (page: Page) =>
    page.evaluate(() => {
      const header = document.querySelector('header');
      const logo = header?.querySelector<HTMLAnchorElement>('a[href^="https://beneficialstrategies.com"]');
      const img = logo?.querySelector('img');
      const q = header?.querySelector<HTMLButtonElement>('button[aria-haspopup=dialog][aria-label]:not([aria-label=""])');
      const about = [...(header?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => b.textContent?.trim() === '?');
      const l = logo?.getBoundingClientRect();
      const r = about?.getBoundingClientRect();
      return {
        h1: header?.querySelector('h1')?.textContent ?? '',
        titleSize: parseFloat(getComputedStyle(header?.querySelector('h1') ?? document.body).fontSize),
        titleCentre: (() => {
          const e = header?.querySelector('h1');
          if (!e) return -1;
          const range = document.createRange();
          range.selectNodeContents(e);
          const rr = range.getBoundingClientRect();
          return Math.abs((rr.left + rr.right) / 2 - window.innerWidth / 2);
        })(),
        // the largest text on the page other than the banner title
        otherMax: Math.max(
          0,
          ...[...document.querySelectorAll<HTMLElement>('body *')]
            .filter((e) => e !== header?.querySelector('h1') && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))
            .filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')
            .map((e) => parseFloat(getComputedStyle(e).fontSize)),
        ),
        titleBold: Number(getComputedStyle(header?.querySelector('h1') ?? document.body).fontWeight) >= 700,
        href: logo?.getAttribute('href') ?? '',
        target: logo?.target ?? '',
        rel: logo?.rel ?? '',
        src: img?.getAttribute('src') ?? '',
        loaded: !!img && img.complete && img.naturalWidth > 0,
        logoLeft: l ? l.left : -1,
        qRight: r ? window.innerWidth - r.right : -1,
        qSize: r ? Math.round(r.width) : 0,
        hasQ: !!about && !!q,
      };
    });
  const dialogText = (page: Page) => page.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '');
  return [
    {
      ...base,
      name: 'banner-default',
      app: 'demo-form',
      expect: async (page) => {
        const b = await bannerInfo(page);
        const problems: string[] = [];
        if (/TanStack/.test(b.h1)) problems.push(`the original banner is shown ("${b.h1}")`);
        if (b.h1 !== 'ISO 20022 Message Explorer') problems.push(`banner title is "${b.h1}"`);
        if (!b.titleBold) problems.push('the banner title is not bold');
        if (!(b.titleSize > b.otherMax)) problems.push(`the banner title (${b.titleSize}px) is not larger than all other text (${b.otherMax}px)`);
        if (b.titleCentre > 6) problems.push(`the banner title is ${Math.round(b.titleCentre)}px off the centre`);
        if (b.href !== 'https://beneficialstrategies.com') problems.push(`logo links to "${b.href}"`);
        if (b.target !== '_blank' || !/noopener/.test(b.rel)) problems.push(`logo link opens with target="${b.target}" rel="${b.rel}"`);
        if (b.src !== 'https://beneficialstrategies.com/img/Beneficial%20Strategies%20Logo.svg') problems.push(`logo source is "${b.src}"`);
        if (!b.loaded) problems.push('the logo image did not load');
        if (b.logoLeft < 0 || b.logoLeft > 24) problems.push(`the logo is not at the left (${b.logoLeft}px)`);
        if (!b.hasQ) problems.push('no question mark button');
        if (b.qRight < 0 || b.qRight > 24) problems.push(`the question mark is not at the far right (${b.qRight}px from the edge)`);
        if (b.qSize < 36) problems.push(`the question mark is only ${b.qSize}px`);
        return problems;
      },
    },
    { ...base, name: 'banner-default-zod', app: 'demo-zod', expect: async (page) => ((await bannerInfo(page)).h1 === 'ISO 20022 Message Explorer' ? [] : ['no new banner in the Zod demo']) },
    { ...base, name: 'banner-title-spanish', app: 'demo-form', query: '?lang=es&theme=dark', expect: async (page) => ((await bannerInfo(page)).h1 === 'Explorador de mensajes ISO 20022' ? [] : ['the banner title is not in Spanish']) },
    { ...base, name: 'banner-dark', app: 'demo-form', query: '?theme=dark', expect: async (page) => ((await bannerInfo(page)).loaded ? [] : ['logo did not load in dark mode']) },
    { name: 'banner-narrow', app: 'demo-form', viewport: { width: 400, height: 800 } },
    {
      ...base,
      name: 'banner-implementation',
      app: 'demo-form',
      query: '?ImplementationBanner=true',
      expect: async (page) => {
        const b = await bannerInfo(page);
        const problems: string[] = [];
        if (!/TanStack Form hook/.test(b.h1)) problems.push(`the original banner is missing ("${b.h1}")`);
        if (b.href) problems.push('the new banner is shown too');
        if (b.h1 === 'ISO 20022 Message Explorer') problems.push('the new title is shown too');
        return problems;
      },
    },
    {
      ...base,
      name: 'banner-implementation-zod',
      app: 'demo-zod',
      query: '?ImplementationBanner=true',
      expect: async (page) => (/TanStack|Zod/.test((await bannerInfo(page)).h1) ? [] : ['the original banner is missing in the Zod demo']),
    },
    {
      ...base,
      name: 'banner-implementation-false',
      app: 'demo-form',
      query: '?ImplementationBanner=false',
      expect: async (page) => ((await bannerInfo(page)).hasQ ? [] : ['ImplementationBanner=false should show the new banner']),
    },
    {
      ...base,
      name: 'banner-implementation-survives-changes',
      app: 'demo-form',
      query: '?ImplementationBanner=true',
      steps: async (page) => {
        await clickText(page, 'header button', /display|pantalla/);
        await settle(300);
        await clickText(page, '[role=dialog] label', /dark/i);
        await settle(400);
      },
      expect: async (page) => {
        const url = await page.evaluate(() => window.location.search);
        const h1 = (await bannerInfo(page)).h1;
        return [...(/ImplementationBanner=true/.test(url) ? [] : [`the parameter was dropped from the URL: ${url}`]), ...(/TanStack/.test(h1) ? [] : ['the original banner disappeared after a setting changed'])];
      },
    },
    {
      ...base,
      name: 'about-open',
      app: 'demo-form',
      steps: async (page) => {
        await clickText(page, 'header button', /^\?$/);
        await settle(500);
      },
      expect: async (page) => {
        const t = await dialogText(page);
        const problems: string[] = [];
        for (const w of ['Explore ISO 20022 messages', 'Explore the format and the content', 'Create a new message', 'Save it and come back later', 'illustrations for your analysis documents', 'in your own application', 'Start exploring'])
          if (!t.includes(w)) problems.push(`the about window lacks "${w}"`);
        // exploring first, the programmer's part last
        if (t.indexOf('Explore the format') > t.indexOf('in your own application')) problems.push('the sections are not in the intended order');
        return problems;
      },
    },
    {
      ...base,
      name: 'about-open-dark-spanish',
      app: 'demo-form',
      query: '?theme=dark&lang=es',
      steps: async (page) => {
        await clickText(page, 'header button', /^\?$/);
        await settle(500);
      },
      expect: async (page) => ((await dialogText(page)).includes('Explore los mensajes ISO 20022') ? [] : ['the about window is not in Spanish']),
    },
    {
      ...base,
      name: 'about-close',
      app: 'demo-form',
      steps: async (page) => {
        await clickText(page, 'header button', /^\?$/);
        await settle(400);
        await clickText(page, 'dialog button', /start exploring/i);
        await settle(400);
      },
      expect: async (page) => ((await dialogText(page)) === '' ? [] : ['the about window did not close']),
    },
    { name: 'about-open-narrow', app: 'demo-form', viewport: { width: 400, height: 800 }, steps: async (page) => { await clickText(page, 'header button', /^\?$/); await settle(500); } },
  ];
}

// ---------------------------------------------------------------------------- zoom into a component type

const ZOOM = (type: string) => `button[aria-label='Zoom in to ${type}']`;
const typeButtonText = (page: Page): Promise<string> => page.evaluate(() => document.querySelector<HTMLElement>('[data-type-picker]')?.textContent ?? '');

function zoomScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 900 } };
  return [
    {
      ...base,
      name: 'zoom-button-beside-help',
      expect: async (page) => {
        const r = await page.evaluate(() => {
          const z = document.querySelector<HTMLElement>("[data-schema-form] button[aria-label='Zoom in to PartyIdentification272']");
          const i = z?.parentElement?.parentElement?.querySelector<HTMLElement>("button[aria-label^='About']");
          const a = i?.getBoundingClientRect();
          const b = z?.getBoundingClientRect();
          // the spec button sits between the "i" and the zoom button
          const spec = z?.parentElement?.parentElement?.querySelector<HTMLElement>('a[data-spec-link]')?.getBoundingClientRect();
          const left = spec ?? a;
          const title = document.querySelector('[data-schema-form] h2');
          return {
            found: !!z && !!i,
            toTheRight: !!left && !!b && b.left >= left.right - 1 && b.left - left.right < 12 && (!spec || !a || spec.left >= a.right - 1),
            sameRow: !!a && !!b && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < 2,
            sameSize: !!a && !!b && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1,
            titleZoom: title?.querySelector("[aria-label^='Zoom']") !== null,
          };
        });
        const problems: string[] = [];
        if (!r.found) problems.push('no zoom button beside an "i"');
        if (!r.toTheRight) problems.push('the zoom button is not just to the right of the "i"');
        if (!r.sameRow) problems.push('the zoom button is not on the same line as the "i"');
        if (!r.sameSize) problems.push('the zoom button is not the size of the "i"');
        if (r.titleZoom) problems.push('the form title has a zoom button');
        return problems;
      },
    },
    {
      ...base,
      name: 'zoom-hover-popup',
      steps: async (page) => {
        await page.locator(ZOOM('PartyIdentification272')).hover();
        await settle();
      },
      expect: async (page) => {
        const t = await popupText(page);
        const problems: string[] = [];
        if (!t.includes('based upon the ISO 20022 type PartyIdentification272')) problems.push(`hover text is "${t}"`);
        if (!t.includes('Click Zoom to zoom in to that data type in isolation from the outer message.')) problems.push('the Click Zoom sentence is missing');
        return problems;
      },
    },
    {
      ...base,
      name: 'zoom-hover-popup-spanish',
      query: '?lang=es',
      steps: async (page) => {
        await page.locator("button[aria-label='Hacer zoom en PartyIdentification272']").hover();
        await settle();
      },
      expect: async (page) => ((await popupText(page)).includes('Haga clic en Zoom para acercarse') ? [] : [`not in Spanish: "${await popupText(page)}"`]),
    },
    {
      ...base,
      name: 'zoom-click-selects-the-type',
      steps: async (page) => {
        await page.locator(ZOOM('PartyIdentification272')).click();
        await settle(800);
      },
      expect: async (page) => {
        const r = await page.evaluate(() => ({
          title: document.querySelector('[data-schema-form] h2')?.textContent ?? '',
          spec: document.querySelector<HTMLAnchorElement>('[data-schema-form] h2 a[data-spec-link]')?.href ?? '',
          popup: document.querySelector('[data-placement]') !== null,
        }));
        const problems: string[] = [];
        const picker = await typeButtonText(page);
        if (!/PartyIdentification272/.test(picker)) problems.push(`the type picker shows "${picker}"`);
        if (!/Party Identification\s?272/.test(r.title)) problems.push(`the form title is "${r.title}"`);
        if (!r.spec.endsWith('/type/PartyIdentification272')) problems.push(`the specification link is ${r.spec}`);
        if (r.popup) problems.push('the zoom popup is still open after the click');
        return problems;
      },
    },
    {
      ...base,
      name: 'zoom-into-branch-data',
      steps: async (page) => {
        await openType(page);
        await page.keyboard.type('BranchAndFinancialInstitutionIdentification8');
        await settle();
        await clickText(page, '[cmdk-item]', /^BranchAndFinancialInstitutionIdentification8/);
        await settle(600);
        await page.locator(ZOOM('BranchData5')).click();
        await settle(800);
      },
      expect: async (page) => {
        const picker = await typeButtonText(page);
        return /BranchData5/.test(picker) ? [] : [`the type picker shows "${picker}"`];
      },
    },
  ];
}

const SPEC = 'https://www.iso20022.org/standardsrepository/type/';
const specInfo = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const a = document.querySelector<HTMLAnchorElement>(sel);
    if (!a) return null;
    const row = a.parentElement!.parentElement!;
    const i = row.querySelector("button[aria-label^='About'], button[aria-label^='Acerca']");
    const zoom = row.querySelector("button[aria-label^='Zoom'], button[aria-label^='Hacer zoom']");
    const r = a.getBoundingClientRect();
    const ri = i?.getBoundingClientRect();
    const rz = zoom?.getBoundingClientRect();
    return {
      href: a.href,
      target: a.target,
      rel: a.rel,
      label: a.getAttribute('aria-label') ?? '',
      afterInfo: !!ri && r.left >= ri.right - 1 && Math.abs(r.top - ri.top) < 2,
      beforeZoom: !rz || r.right <= rz.left + 1,
      sameSize: !!ri && Math.abs(r.width - ri.width) < 1 && Math.abs(r.height - ri.height) < 1,
      header: document.querySelector('header a[href*="standardsrepository"]') !== null,
      big: document.body.textContent?.includes('View Specification') ?? false,
    };
  }, selector);

/** The small spec buttons beside each "i", from the library: they replace the old big button at the top. */
function specLinkScenarios(): Scenario[] {
  const check = (selector: string, type: string, label: string) => async (page: Page): Promise<string[]> => {
    const l = await specInfo(page, selector);
    if (!l) return [`no spec button ${selector}`];
    const problems: string[] = [];
    if (l.href !== `${SPEC}${type}`) problems.push(`href is ${l.href}`);
    if (l.target !== '_blank') problems.push(`target is "${l.target}", not a separate window`);
    if (!/noopener/.test(l.rel)) problems.push(`rel is "${l.rel}"`);
    if (l.label !== label) problems.push(`label is "${l.label}"`);
    if (!l.afterInfo) problems.push('the button is not right after the "i"');
    if (!l.beforeZoom) problems.push('the button is after the zoom button');
    if (!l.sameSize) problems.push('the button is not the size of the "i"');
    if (l.header || l.big) problems.push('the old big specification button is still at the top');
    return problems;
  };
  const title = '[data-schema-form] h2 a[data-spec-link]';
  return [
    {
      name: 'spec-buttons',
      app: 'demo-form',
      viewport: { width: 1440, height: 900 },
      expect: async (page) => [
        ...(await check(title, 'CustomerCreditTransferInitiationV13', 'View ISO 20022 official documentation for CustomerCreditTransferInitiationV13')(page)),
        ...(await check("a[data-spec-link='GroupHeader114']", 'GroupHeader114', 'View ISO 20022 official documentation for GroupHeader114')(page)),
        ...(await check("a[data-spec-link='Max35Text']", 'Max35Text', 'View ISO 20022 official documentation for Max35Text')(page)),
        // one for every element that has an "i"
        ...(await page.evaluate(() => {
          const infos = document.querySelectorAll("[data-schema-form] button[aria-label^='About']").length;
          const specs = document.querySelectorAll('[data-schema-form] a[data-spec-link]').length;
          return infos === specs ? [] : [`${infos} "i" buttons but ${specs} spec buttons`];
        })),
      ],
    },
    {
      name: 'spec-button-hover-text',
      app: 'demo-form',
      viewport: { width: 1440, height: 900 },
      steps: async (page) => {
        await page.hover("a[data-spec-link='GroupHeader114']");
        await settle(500);
      },
      expect: async (page) => {
        const t = await popupText(page);
        return t === 'View ISO 20022 official documentation for GroupHeader114' ? [] : [`hover text is "${t}"`];
      },
    },
    { name: 'spec-buttons-spanish-caam', app: 'demo-form', query: '?message=caam.001.001.05&lang=es', viewport: { width: 1440, height: 900 }, expect: check(title, 'ATMDeviceReportV05', 'Ver la documentación oficial de ISO 20022 de ATMDeviceReportV05') },
    { name: 'spec-buttons-narrow', app: 'demo-form', viewport: { width: 480, height: 900 }, expect: check(title, 'CustomerCreditTransferInitiationV13', 'View ISO 20022 official documentation for CustomerCreditTransferInitiationV13') },
    {
      name: 'spec-button-follows-the-chosen-type',
      app: 'demo-form',
      viewport: { width: 1440, height: 900 },
      steps: async (page) => {
        await openType(page);
        await page.keyboard.type('BranchAndFinancialInstitutionIdentification8');
        await settle();
        await clickText(page, '[cmdk-item]', /^BranchAndFinancialInstitutionIdentification8/);
        await settle(600);
      },
      expect: check(title, 'BranchAndFinancialInstitutionIdentification8', 'View ISO 20022 official documentation for BranchAndFinancialInstitutionIdentification8'),
    },
    {
      name: 'spec-button-with-the-plain-skin',
      app: 'demo-form',
      query: '?skin=plain',
      viewport: { width: 1440, height: 900 },
      expect: async (page) => {
        const r = await page.evaluate(() => {
          const a = document.querySelector<HTMLAnchorElement>('[data-schema-form] a[href*="standardsrepository"]');
          return { href: a?.href ?? '', target: a?.target ?? '', classes: document.querySelectorAll('[data-schema-form] [class]').length };
        });
        return [...(r.href.startsWith(SPEC) && r.target === '_blank' ? [] : [`the plain skin's spec link is ${JSON.stringify(r)}`]), ...(r.classes === 0 ? [] : [`${r.classes} class attributes`])];
      },
    },
  ];
}

/** Languages: the dropdown, each shipped language laid out (long German words, accents), and American spelling. */
function languageScenarios(): Scenario[] {
  const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);
  const openLang = async (page: Page) => {
    await openDisplay(page);
  };
  const shows = (...needles: RegExp[]) => async (page: Page): Promise<string[]> => {
    const text = await bodyText(page);
    return needles.filter((n) => !n.test(text)).map((n) => `the page does not show ${n}`);
  };
  const lacks = (...needles: RegExp[]) => async (page: Page): Promise<string[]> => {
    const text = await bodyText(page);
    return needles.filter((n) => n.test(text)).map((n) => `the page still shows ${n}`);
  };
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 900 } };
  return [
    {
      ...base,
      name: 'language-dropdown',
      query: '?lang=de',
      steps: openLang,
      expect: async (page) => {
        const facts = await page.evaluate(() => {
          const sel = document.querySelector<HTMLSelectElement>('[role=dialog] select');
          const a = [...document.querySelectorAll<HTMLAnchorElement>('[role=dialog] a')].find((x) => /issues\/new/.test(x.href));
          return { values: sel ? [...sel.options].map((o) => `${o.value}=${o.textContent}`) : [], selected: sel?.value, href: a?.href ?? '', target: a?.target };
        });
        const problems: string[] = [];
        const want = ['auto=Automatisch (Browser)', 'en=English (ISO)', 'en-US=English (US)', 'es=Español', 'fr=Français', 'de=Deutsch', 'pt=Português'];
        if (JSON.stringify(facts.values) !== JSON.stringify(want)) problems.push(`the language list is ${JSON.stringify(facts.values)}`);
        if (facts.selected !== 'de') problems.push(`the dropdown shows ${facts.selected}, not de`);
        if (!/title=Wording\+%28de%29/.test(facts.href)) problems.push(`the report link does not name the language: ${facts.href}`);
        if (facts.target !== '_blank') problems.push('the report link does not open a new window');
        return problems;
      },
    },
    { ...base, name: 'language-french', query: '?lang=fr', expect: shows(/Copier le XML|Enregistrer le XML/, /Explorateur de messages ISO 20022/) },
    { ...base, name: 'language-german-narrow', query: '?lang=de&size=large', viewport: { width: 480, height: 900 }, expect: shows(/Anzeige/) },
    { ...base, name: 'language-german-dark', query: '?lang=de&theme=dark', expect: shows(/XML speichern|Datei laden/, /ISO 20022 Message Explorer/) },
    { ...base, name: 'language-portuguese-dark', query: '?lang=pt&theme=dark', expect: shows(/Guardar XML/, /Explorador de mensagens ISO 20022/) },
    { ...base, name: 'language-portuguese-brazil-tag', query: '?lang=pt', expect: shows(/Guardar XML/) },
    { ...base, name: 'language-iso-english-keeps-iso-spelling', query: '?lang=en', expect: shows(/Authorisation/i) },
    { ...base, name: 'language-american-english-spelling', query: '?lang=en-US', expect: async (page) => [...(await shows(/Authorization/i)(page)), ...(await lacks(/Authoris|Organis/i)(page))] },
  ];
}

/** What a browser tab shows: the title, and icons that really load. */
export const headFacts = (page: Page) =>
  page.evaluate(async () => {
    const icons = [...document.querySelectorAll<HTMLLinkElement>('link[rel=icon], link[rel=apple-touch-icon]')].map((l) => l.href);
    const loaded = await Promise.all(icons.map(async (href) => {
      const r = await fetch(href);
      const b = await r.blob();
      return { href: href.split('/').pop(), ok: r.ok, type: r.headers.get('content-type') ?? '', bytes: b.size };
    }));
    return { title: document.title, loaded, ogTitle: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ?? '' };
  });

function headScenarios(): Scenario[] {
  const check = (title: string) => async (page: Page): Promise<string[]> => {
    const h = await headFacts(page);
    const problems: string[] = [];
    if (h.title !== title) problems.push(`the tab says "${h.title}"`);
    if (h.ogTitle !== title) problems.push(`the link preview says "${h.ogTitle}"`);
    if (h.loaded.length !== 3) problems.push(`${h.loaded.length} icons are declared, expected 3`);
    for (const i of h.loaded) if (!i.ok || i.bytes < 200 || !/image\//.test(i.type)) problems.push(`the icon ${i.href} did not load as an image: ${JSON.stringify(i)}`);
    return problems;
  };
  return [
    { name: 'head-form-demo', app: 'demo-form', viewport: { width: 1000, height: 600 }, expect: check('Beneficial Strategies ISO 20022 Message Explorer') },
    { name: 'head-zod-demo', app: 'demo-zod', viewport: { width: 1000, height: 600 }, expect: check('Beneficial Strategies ISO 20022 Message Explorer (Zod only)') },
  ];
}

/** Field widths: controls are as wide as their type needs, generously, and never cut text off. */
function fieldWidthScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 1000 } };
  const measure = (page: Page) =>
    page.evaluate(() => {
      const area = document.querySelector<HTMLElement>('[data-form-area]')!.getBoundingClientRect();
      const w = (sel: string) => document.querySelector<HTMLElement>(sel)?.getBoundingClientRect().width ?? 0;
      return {
        panel: area.width - 8,
        id: w('#GroupHeader-MessageIdentification'),
        count: w('#GroupHeader-NumberOfTransactions'),
        sum: w('#GroupHeader-ControlSum'),
        name: w('#GroupHeader-InitiatingParty-Name'),
        country: w('#GroupHeader-InitiatingParty-CountryOfResidence'),
        date: w('#GroupHeader-CreationDateTime'),
        now: (() => {
          const b = [...document.querySelectorAll<HTMLElement>('[data-form-area] button')].find((x) => x.textContent === 'Now');
          const d = document.querySelector<HTMLElement>('#GroupHeader-CreationDateTime')?.getBoundingClientRect();
          const r = b?.getBoundingClientRect();
          return r && d ? { gap: r.left - d.right, right: r.right - area.left } : null;
        })(),
      };
    });
  /** For every text box with a length limit: would that many wide capital letters fit? (An M is about as wide as text gets.) */
  const capacity = (page: Page) =>
    page.evaluate(() => {
      const canvas = document.createElement('canvas').getContext('2d')!;
      const problems: string[] = [];
      let checked = 0;
      for (const input of document.querySelectorAll<HTMLInputElement>('[data-form-area] input[type=text][maxlength]')) {
        const max = Number(input.getAttribute('maxlength'));
        if (!input.offsetParent || max > 80) continue;
        // a box that already fills its panel cannot be made wider: only boxes the sizing narrowed are in question
        if (input.clientWidth >= 0.9 * (input.parentElement?.clientWidth ?? Infinity)) continue;
        const cs = getComputedStyle(input);
        canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const need = canvas.measureText('M'.repeat(max)).width;
        const have = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        checked++;
        if (need > have) problems.push(`${input.id}: ${max} wide capitals need ${Math.round(need)}px, the box holds ${Math.round(have)}px`);
      }
      return { checked, problems };
    });
  return [
    {
      ...base,
      name: 'fieldwidth-proportions',
      expect: async (page) => {
        const m = await measure(page);
        const problems: string[] = [];
        if (!(m.id > 200 && m.id < 0.8 * m.panel)) problems.push(`a 35-character identifier is ${Math.round(m.id)}px in a ${Math.round(m.panel)}px panel`);
        if (!(m.count < m.id)) problems.push('a 15-digit field is not narrower than a 35-character one');
        if (!(m.sum < m.id)) problems.push('an 18-digit amount is not narrower than a 35-character identifier');
        if (!(m.country < 0.3 * m.panel)) problems.push(`a country code is ${Math.round(m.country)}px wide`);
        if (!(m.name > 0.9 * m.panel)) problems.push(`a name that can be 140 characters is only ${Math.round(m.name)}px in a ${Math.round(m.panel)}px panel`);
        if (!m.now || m.now.gap > 16 || m.now.right > 0.8 * (m.panel + 8)) problems.push(`the Now button is not next to the date-time box: ${JSON.stringify(m.now)}`);
        return problems;
      },
    },
    {
      ...base,
      name: 'fieldwidth-datetime-does-not-jump',
      steps: async (page) => {
        (globalThis as unknown as { __w: number }).__w = (await measure(page)).date;
        await clickText(page, 'button', /^now$/i);
        await settle(300);
      },
      expect: async (page) => {
        const before = (globalThis as unknown as { __w: number }).__w;
        const after = (await measure(page)).date;
        return Math.abs(after - before) <= 14 ? [] : [`the date-time box changed from ${Math.round(before)}px to ${Math.round(after)}px when it was filled`];
      },
    },
    ...(['normal', 'large', 'xlarge'] as const).flatMap((size): Scenario[] =>
      ['PostalAddress27', 'PartyIdentification272'].map((type) => ({
        ...base,
        name: `fieldwidth-nothing-cut-off-${type}-${size}`,
        query: size === 'normal' ? '' : `?size=${size}`,
        steps: async (page: Page) => {
          await openType(page);
          await page.keyboard.type(type);
          await settle();
          await clickText(page, '[cmdk-item]', new RegExp(`^${type}`));
          await settle(700);
          if (type === 'PartyIdentification272') for (const id of ['include-PostalAddress', 'include-Identification', 'include-ContactDetails']) await page.click(`#${id}`).catch(() => undefined);
          await settle(300);
        },
        expect: async (page: Page) => {
          const r = await capacity(page);
          return [...(r.checked >= (size === 'xlarge' ? 2 : 3) ? [] : [`only ${r.checked} boxes were checked`]), ...r.problems];
        },
      })),
    ),
    {
      ...base,
      name: 'fieldwidth-whole-message-nothing-cut-off',
      query: '?message=pacs.008.001.14',
      expect: async (page) => {
        const r = await capacity(page);
        return r.problems;
      },
    },
    { ...base, name: 'fieldwidth-narrow', viewport: { width: 480, height: 900 } },
    {
      ...base,
      name: 'fieldwidth-plain-skin',
      query: '?skin=plain',
      expect: async (page) => {
        const r = await page.evaluate(() => ({ sized: document.querySelectorAll('[data-form-area] input[size], [data-form-area] input[style]').length }));
        return r.sized === 0 ? [] : [`the plain skin set sizes on ${r.sized} boxes`];
      },
    },
  ];
}

/** The pickers at the top: hover help, and a type box that is no wider than it needs to be. */
function pickerScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 900 } };
  const help = (name: string, selector: string, title: string, includes: string, extra: Partial<Scenario> = {}): Scenario => ({
    ...base,
    name,
    ...extra,
    steps: async (page) => {
      await page.hover(selector);
      await settle(500);
    },
    expect: async (page) => {
      const t = await popupText(page);
      const problems: string[] = [];
      if (!t.startsWith(title)) problems.push(`the help starts "${t.slice(0, 40)}"`);
      if (!t.includes(includes)) problems.push(`the help lacks "${includes}": "${t}"`);
      // pressing the control takes the help away (it must not sit over the control's own list)
      await page.click(selector);
      await settle(400);
      if (await present(page, '[role=tooltip]')) problems.push('the help stays after the control is pressed');
      await page.keyboard.press('Escape');
      return problems;
    },
  });
  return [
    help('picker-help-area', '#area-picker', 'Business area', 'Choose an area to see its messages'),
    help('picker-help-message', '#message-picker', 'Message', 'Choose one to see every element it can hold'),
    help('picker-help-type', '[data-type-picker]', 'What the form shows', 'the same as the magnifier beside an element does'),
    help('picker-help-display', 'header button[aria-haspopup=dialog]:not([aria-label])', 'Display settings', 'the style of the form'),
    help('picker-help-type-spanish', '[data-type-picker]', 'Qué muestra el formulario', 'igual que la lupa', { query: '?lang=es' }),
    {
      ...base,
      name: 'picker-type-compact',
      steps: async (page) => {
        await settle(300);
      },
      expect: async (page) => {
        const r = await page.evaluate(() => {
          const b = document.querySelector<HTMLElement>('[data-type-picker]')!;
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
          const w = b.getBoundingClientRect().width;
          return { text: b.textContent, aria: b.getAttribute('aria-label'), title: b.getAttribute('title'), widthRem: w / rem, truncated: (b.firstElementChild as HTMLElement).scrollWidth > (b.firstElementChild as HTMLElement).clientWidth, prefix: (document.querySelector('header')?.textContent ?? '').includes('Type:') };
        });
        const problems: string[] = [];
        if (r.text !== 'CustomerCreditTransferInitiationV13') problems.push(`the box shows "${r.text}"`);
        if (r.prefix) problems.push('the "Type:" prefix is still shown');
        if (r.aria !== 'Type: CustomerCreditTransferInitiationV13') problems.push(`the accessible name is "${r.aria}"`);
        if (r.title !== null) problems.push('the box still has a browser tooltip');
        if (r.widthRem > 24.5) problems.push(`the box is ${r.widthRem.toFixed(1)}rem wide: about 70% of the old 34rem is enough`);
        if (r.truncated) problems.push('the type name is cut off');
        return problems;
      },
    },
    ...(['large', 'xlarge'] as const).map(
      (size): Scenario => ({
        ...base,
        name: `picker-type-fits-${size}-text`,
        query: `?size=${size}`,
        expect: async (page) => {
          const r = await page.evaluate(() => {
            const b = document.querySelector<HTMLElement>('[data-type-picker]')!;
            const inner = b.firstElementChild as HTMLElement;
            return { truncated: inner.scrollWidth > inner.clientWidth, px: Math.round(b.getBoundingClientRect().width) };
          });
          return r.truncated ? [`the type name is cut off at ${size} text (${r.px}px)`] : [];
        },
      }),
    ),
  ];
}

function areaScenarios(): Scenario[] {
  const base = { app: 'demo-form' as const, viewport: { width: 1440, height: 900 } };
  return [
    {
      ...base,
      name: 'area-dropdown-open',
      steps: async (page) => {
        await page.locator('#area-picker').click();
        await settle(400);
      },
      expect: async (page) => {
        const o = await optionsOf(page);
        const problems: string[] = [];
        if (o.length !== 3) problems.push(`expected three areas, found ${o.length}`);
        if (!o.some((x) => /^pain.*Payments Initiation: Messages that support the initiation of a payment/.test(x))) problems.push(`pain is not described: ${JSON.stringify(o)}`);
        if (!o.some((x) => /^pacs.*Payments Clearing and Settlement: Messages that support the clearing and settlement/.test(x))) problems.push(`pacs is not described: ${JSON.stringify(o)}`);
        if (!o.some((x) => /^caam.*ATM Management: Messages that support card related terminal management/.test(x))) problems.push(`caam is not described: ${JSON.stringify(o)}`);
        return problems;
      },
    },
    {
      ...base,
      name: 'area-dropdown-open-spanish',
      query: '?lang=es',
      steps: async (page) => {
        await page.locator('#area-picker').click();
        await settle(400);
      },
      expect: async (page) => {
        const o = await optionsOf(page);
        return o.some((x) => /Iniciación de pagos: Mensajes que respaldan la iniciación/.test(x)) && o.some((x) => /Compensación y liquidación de pagos: Mensajes que respaldan/.test(x)) && o.some((x) => /Gestión de cajeros automáticos: Mensajes que respaldan/.test(x)) ? [] : [`not in Spanish: ${JSON.stringify(o)}`];
      },
    },
    {
      ...base,
      name: 'area-switch-to-pacs-and-back',
      query: '?message=pain.008.001.12',
      steps: async (page) => {
        await page.locator('#area-picker').click();
        await settle(300);
        await clickText(page, '[role=option]', /^pacs/);
        await settle(900);
      },
      expect: async (page) => {
        const problems: string[] = [];
        if (!(await messageIs(page, 'pacs.002.001.16'))) problems.push('choosing pacs did not select the first pacs message');
        const title = await page.evaluate(() => document.querySelector('[data-schema-form] h2')?.textContent ?? '');
        if (!/FI To FI Payment Status Report/.test(title)) problems.push(`the form is "${title}"`);
        // the message list now holds only pacs messages, each described
        await page.locator('#message-picker').click();
        await settle(300);
        const o = await optionsOf(page);
        if (o.length !== 9 || !o.every((x) => x.startsWith('pacs.'))) problems.push(`message list is ${JSON.stringify(o)}`);
        if (!o.some((x) => /pacs\.003\.001\.12.*FI To FI Customer Direct Debit/.test(x))) problems.push('messages are not described');
        await page.keyboard.press('Escape');
        await settle(200);
        // back to pain: the message used there before is remembered
        await page.locator('#area-picker').click();
        await settle(300);
        await clickText(page, '[role=option]', /^pain/);
        await settle(900);
        if (!(await messageIs(page, 'pain.008.001.12'))) problems.push('going back to pain did not return to pain.008.001.12');
        return problems;
      },
    },
    {
      ...base,
      name: 'area-follows-a-pasted-message',
      query: '?message=pain.002.001.15',
      clipboard: { access: 'granted', text: '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.16"><FIToFIPmtStsRpt><GrpHdr><MsgId>P-1</MsgId></GrpHdr></FIToFIPmtStsRpt></Document>' },
      steps: async (page) => {
        await pasteButton(page, /^Paste XML$/);
        await clickText(page, '[aria-label="XML preview"] button', /^(Paste)/);
        await settle(1000);
      },
      expect: async (page) => {
        const area = await page.evaluate(() => document.querySelector('#area-picker')?.textContent ?? '');
        return /pacs/.test(area) && (await messageIs(page, 'pacs.002.001.16')) && (await fieldValue(page, 'GroupHeader-MessageIdentification')) === 'P-1'
          ? []
          : [`the area did not follow the message: area "${area}"`];
      },
    },
  ];
}

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
        const note = document.querySelector('[data-schema-form] [role=note]')?.textContent ?? '';
        // the title block (heading, then its help text) is the first thing; the heading comes first in it
        return { title: h?.textContent ?? '', h: size(h), legend: size(legend), first: first === h || first?.firstElementChild === h, note };
      });
      const problems: string[] = [];
      if (!/Customer Credit Transfer Initiation V13/.test(r.title)) problems.push(`title is "${r.title}"`);
      if (!(r.h > r.legend)) problems.push(`title font (${r.h}px) is not larger than the group heading (${r.legend}px)`);
      if (!r.first) problems.push('the title is not the first thing in the form');
      if (!r.note.includes('sent by the initiating party')) problems.push(`the message description is missing from the help note: "${r.note}"`);
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
  // every other message (pain and pacs) loads and renders (generated, so a new message only needs its identifier added here)
  ...['pain.007.001.13', 'pain.008.001.12', 'pain.009.001.08', 'pain.010.001.08', 'pain.011.001.08', 'pain.012.001.08', 'pain.013.001.12', 'pain.014.001.12', 'pain.017.001.04', 'pain.018.001.04', 'pacs.002.001.16', 'pacs.003.001.12', 'pacs.004.001.15', 'pacs.007.001.14', 'pacs.008.001.14', 'pacs.009.001.13', 'pacs.010.001.06', 'pacs.028.001.07', 'pacs.029.001.02', 'caam.001.001.05', 'caam.002.001.04', 'caam.003.001.05', 'caam.004.001.05', 'caam.005.001.03', 'caam.006.001.02', 'caam.007.001.01', 'caam.008.001.01', 'caam.009.001.03', 'caam.010.001.03', 'caam.011.001.02', 'caam.012.001.02', 'caam.013.001.01', 'caam.014.001.01', 'caam.015.001.01', 'caam.016.001.01'].map(
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
  ...pasteScenarios(),
  ...fileScenarios(),
  ...areaScenarios(),
  ...fieldModeScenarios(),
  ...copyAsScenarios(),
  ...xsdScenarios(),
  ...bannerScenarios(),
  ...specLinkScenarios(),
  ...pickerScenarios(),
  ...fieldWidthScenarios(),
  ...headScenarios(),
  ...languageScenarios(),
  { name: 'type-picker-open-narrow', app: 'demo-form', viewport: { width: 480, height: 900 }, steps: openType },
  { name: 'display-open', app: 'demo-form', viewport: { width: 1440, height: 900 }, steps: openDisplay },
  { name: 'display-open-narrow-spanish', app: 'demo-form', query: '?lang=es', viewport: { width: 480, height: 900 }, steps: openDisplay },
  {
    name: 'dropdown-open',
    app: 'demo-form',
    query: '?lang=en', // ISO English: the dropdown shows the standard's own words ("Cheque")
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
    name: 'help-hover-popup',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await page.locator("button[aria-label='About Creation Date Time']").hover();
      await settle();
    },
    expect: async (page) => {
      const t = await popupText(page);
      const problems: string[] = [];
      if (!t.includes('Date and time at which the message was created')) problems.push(`hover popup text is missing: "${t}"`);
      if (!t.endsWith('Click to view in form')) problems.push(`the popup does not end with "Click to view in form": "${t}"`);
      return problems;
    },
  },
  {
    name: 'help-hover-popup-spanish',
    app: 'demo-form',
    query: '?lang=es',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await page.locator("button[aria-label='Acerca de Fecha y hora de creación']").hover();
      await settle();
    },
    expect: async (page) => ((await popupText(page)).endsWith('Haga clic para verlo en el formulario') ? [] : [`not in Spanish: "${await popupText(page)}"`]),
  },
  {
    name: 'help-note-open',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      await page.locator("button[aria-label='About Creation Date Time']").click();
      await settle();
    },
    expect: async (page) => {
      const r = await page.evaluate(() => {
        const note = document.querySelector<HTMLElement>('[data-schema-form] [role=note]');
        const label = note?.parentElement?.querySelector('label');
        const optional = [...document.querySelectorAll<HTMLElement>('[data-schema-form] span')].find((e) => /^\(?optional\)?$/.test(e.textContent ?? ''));
        const size = (e: Element | null | undefined) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
        const input = note?.parentElement?.querySelector('input');
        return {
          text: note?.textContent ?? '',
          popup: document.querySelector('[data-placement]') !== null,
          size: size(note),
          optionalSize: size(optional),
          belowLabel: !!label && !!note && label.getBoundingClientRect().bottom <= note.getBoundingClientRect().top + 1,
          aboveInput: !!input && !!note && note.getBoundingClientRect().bottom <= input.getBoundingClientRect().top + 1,
        };
      });
      const problems: string[] = [];
      if (!r.text.includes('Date and time at which the message was created')) problems.push(`inline help text is missing: "${r.text}"`);
      if (r.text.includes('Click to view')) problems.push('the inline note repeats the popup hint');
      if (r.popup) problems.push('the popup is still shown next to the inline note');
      if (!r.belowLabel) problems.push('the note is not below the label');
      if (!r.aboveInput) problems.push('the note is not above the field');
      if (r.optionalSize && Math.abs(r.size - r.optionalSize) > 1) problems.push(`note text is ${r.size}px but "(optional)" is ${r.optionalSize}px`);
      return problems;
    },
  },
  ...zoomScenarios(),
  {
    name: 'help-click-then-leave',
    app: 'demo-form',
    viewport: { width: 1440, height: 900 },
    steps: async (page) => {
      const i = page.locator("button[aria-label='About Creation Date Time']");
      await i.click();
      await i.click(); // text hidden again; the button keeps the focus
      await page.mouse.move(700, 500);
      await settle();
    },
    expect: async (page) => {
      const r = await page.evaluate(() => ({ popup: document.querySelector('[data-placement]') !== null, note: document.querySelector('[data-schema-form] [role=note]') !== null }));
      return [...(r.popup ? ['a click left the popup pinned after the pointer moved away'] : []), ...(r.note ? ['the inline text did not close on the second click'] : [])];
    },
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


