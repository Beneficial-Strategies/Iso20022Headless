import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm, SkinProvider, isoTypeUrl, plainSkin, tailwindSkin, type FieldExtraContext, type Skin } from '@beneficial-strategies/iso20022-react-ui';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

interface Props {
  skin?: Skin;
  specLink?: false | ((type: string) => string | undefined);
  fieldExtra?: (e: FieldExtraContext) => React.ReactNode;
}
function Form({ skin = tailwindSkin, specLink, fieldExtra }: Props) {
  const form = useZodForm({ schema: schemas.PaymentInstruction51 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'PaymentInstruction51' });
  return (
    <SkinProvider value={skin}>
      <SchemaForm form={form} {...(specLink !== undefined ? { specLink } : {})} {...(fieldExtra ? { fieldExtra } : {})} />
    </SkinProvider>
  );
}
const specs = () => [...document.querySelectorAll<HTMLAnchorElement>('a[data-spec-link]')];
const BASE = 'https://www.iso20022.org/standardsrepository/type/';

describe('the spec button after each "i" (from the library)', () => {
  it('is there by default, for every element that has an "i", and for the form title', () => {
    render(<Form />);
    const infos = screen.getAllByRole('button', { name: /^About / });
    expect(specs()).toHaveLength(infos.length);
    const title = screen.getByRole('heading', { level: 2 });
    expect(title.querySelector('a[data-spec-link]')!.getAttribute('data-spec-link')).toBe('PaymentInstruction51');
  });

  it('opens ISO\'s page for the element\'s type in a new window, safely', () => {
    render(<Form />);
    const method = specs().find((a) => a.dataset.specLink === 'PaymentMethod3Code')!;
    expect(method.href).toBe(`${BASE}PaymentMethod3Code`);
    expect(method.target).toBe('_blank');
    expect(method.rel).toBe('noopener noreferrer');
    expect(method.getAttribute('aria-label')).toBe('View ISO 20022 official documentation for PaymentMethod3Code');
  });

  it('says on hover which type, in words', async () => {
    const user = userEvent.setup();
    render(<Form />);
    const link = specs().find((a) => a.dataset.specLink === 'PaymentMethod3Code')!;
    await user.hover(link);
    expect(screen.getByRole('tooltip').textContent).toBe('View ISO 20022 official documentation for PaymentMethod3Code');
    expect(link.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    await user.unhover(link);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('sits right after the "i", before whatever the host adds', () => {
    render(<Form fieldExtra={(e) => (e.name === 'PaymentMethod' ? <button type="button">Mine</button> : null)} />);
    const i = screen.getByRole('button', { name: 'About Payment Method' });
    const spec = specs().find((a) => a.dataset.specLink === 'PaymentMethod3Code')!;
    const mine = screen.getByRole('button', { name: 'Mine' });
    expect(i.compareDocumentPosition(spec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(spec.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('can be left out: specLink={false} shows no spec buttons, and the "i" is unchanged', () => {
    const { container } = render(<Form specLink={false} />);
    expect(specs()).toHaveLength(0);
    expect(container.textContent).not.toMatch(/official documentation/);
    expect(screen.getAllByRole('button', { name: /^About / }).length).toBeGreaterThan(0);
  });

  it('can point somewhere else, and can leave out a type by answering nothing', () => {
    render(<Form specLink={(type) => (type.startsWith('Max') ? undefined : `https://registry.example/types/${type}.html`)} />);
    const all = specs();
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(a.href).toBe(`https://registry.example/types/${a.dataset.specLink}.html`);
      expect(a.dataset.specLink).not.toMatch(/^Max/);
    }
    expect(screen.getAllByRole('button', { name: /^About / }).length).toBeGreaterThan(all.length);
  });

  it('the address is built from the type name, and escapes it', () => {
    expect(isoTypeUrl('CashAccount24')).toBe(`${BASE}CashAccount24`);
    expect(isoTypeUrl('A b/c')).toBe(`${BASE}A%20b%2Fc`);
  });

  it('the plain skin has an ordinary link, with no classes', () => {
    const { container } = render(<Form skin={plainSkin} />);
    const link = document.querySelector<HTMLAnchorElement>('a[href*="standardsrepository"]')!;
    expect(link.target).toBe('_blank');
    expect(link.title).toMatch(/^View ISO 20022 official documentation for /);
    expect(link.textContent?.trim()).toBe('↗');
    expect(container.querySelectorAll('[class]')).toHaveLength(0);
  });
});
