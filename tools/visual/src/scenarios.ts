import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const openType = (page: Page) => clickText(page, 'header button', /type:|tipo:/);
const openDisplay = (page: Page) => clickText(page, 'header button', /display|pantalla/);
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

// ---------------------------------------------------------------------------- the link to the published specification

const specLink = (page: Page): Promise<{ href: string; target: string; rel: string; text: string } | null> =>
  page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>('header a[href*="standardsrepository"]');
    return a ? { href: a.href, target: a.target, rel: a.rel, text: a.textContent ?? '' } : null;
  });

// ---------------------------------------------------------------------------- zoom into a component type

const ZOOM = (type: string) => `button[aria-label='Zoom in to ${type}']`;
const typeButtonText = (page: Page): Promise<string> => page.evaluate(() => document.querySelector<HTMLElement>('header button[aria-haspopup=listbox][title]')?.textContent ?? '');

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
          const title = document.querySelector('[data-schema-form] h2');
          return {
            found: !!z && !!i,
            toTheRight: !!a && !!b && b.left >= a.right - 1 && b.left - a.right < 12,
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
          spec: document.querySelector<HTMLAnchorElement>('header a[href*=standardsrepository]')?.href ?? '',
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

function specLinkScenarios(): Scenario[] {
  const check = (type: string, text: RegExp) => async (page: Page): Promise<string[]> => {
    const l = await specLink(page);
    if (!l) return ['no View Specification link in the header'];
    const problems: string[] = [];
    if (l.href !== `https://www.iso20022.org/standardsrepository/type/${type}`) problems.push(`href is ${l.href}`);
    if (l.target !== '_blank') problems.push(`target is "${l.target}", not a separate window`);
    if (!/noopener/.test(l.rel)) problems.push(`rel is "${l.rel}"`);
    if (!text.test(l.text)) problems.push(`text is "${l.text}"`);
    return problems;
  };
  return [
    { name: 'spec-link', app: 'demo-form', viewport: { width: 1440, height: 900 }, expect: check('CustomerCreditTransferInitiationV13', /View Specification/) },
    { name: 'spec-link-spanish-caam', app: 'demo-form', query: '?message=caam.001.001.05&lang=es', viewport: { width: 1440, height: 900 }, expect: check('ATMDeviceReportV05', /Ver especificación/) },
    { name: 'spec-link-narrow', app: 'demo-form', viewport: { width: 480, height: 900 }, expect: check('CustomerCreditTransferInitiationV13', /View Specification/) },
    {
      name: 'spec-link-follows-the-chosen-type',
      app: 'demo-form',
      viewport: { width: 1440, height: 900 },
      steps: async (page) => {
        await openType(page);
        await page.keyboard.type('BranchAndFinancialInstitutionIdentification8');
        await settle();
        await clickText(page, '[cmdk-item]', /^BranchAndFinancialInstitutionIdentification8/);
        await settle(600);
      },
      expect: check('BranchAndFinancialInstitutionIdentification8', /View Specification/),
    },
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
  ...specLinkScenarios(),
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


