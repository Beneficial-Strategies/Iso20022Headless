import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, SchemaForm, createI18n, type I18nOverrides } from '@beneficial-strategies/iso20022-react-ui';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

function Form({ type, overrides, locale }: { type: keyof typeof schemas; locale: string; overrides?: I18nOverrides }) {
  const i18n = createI18n(locale, overrides);
  const form = useZodForm({ schema: schemas[type] as never, typeDescriptors: pain001Message.typeDescriptors, rootType: type, messages: i18n.validation });
  return (
    <I18nProvider value={i18n}>
      <SchemaForm form={form} />
    </I18nProvider>
  );
}

const method = pain001Message.typeDescriptors.PaymentInstruction51!.fields!.find((f) => f.name === 'PaymentMethod')!;

describe('the same form in English and Spanish', () => {
  it('English is unchanged', async () => {
    render(<Form type="PaymentInstruction51" locale="en" />);
    expect(screen.getAllByText('(required)').length).toBeGreaterThan(3);
    expect(screen.getByRole('checkbox', { name: /^Include Charges Account \(optional\)/ })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('combobox', { name: /^Payment Method/ }));
    expect(screen.getByRole('option', { name: /select/ }).textContent).toBe('— select —');
  });

  it('Spanish interface text, with spec element names still in English', async () => {
    const user = userEvent.setup();
    render(<Form type="PaymentInstruction51" locale="es" />);
    expect(screen.getAllByText('(obligatorio)').length).toBeGreaterThan(3);
    expect(screen.queryByText('(required)')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /^Incluir Charges Account \(opcional\)/ })).toBeTruthy(); // label stays the ISO name
    expect(screen.getByRole('button', { name: 'Acerca de Payment Method' })).toBeTruthy();
    await user.click(screen.getByRole('combobox', { name: /^Payment Method/ }));
    expect(screen.getByRole('option', { name: /seleccione/ })).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Opciones' })).toBeTruthy();
  });

  it('validation messages come out in Spanish when the field is touched', async () => {
    const user = userEvent.setup();
    render(<Form type="GroupHeader114" locale="es" />);
    const input = screen.getByRole('textbox', { name: /^Message Identification/ });
    await user.click(input);
    await user.tab();
    expect((await screen.findByRole('alert')).textContent).toBe('Obligatorio');
  });

  it('validation messages in English by default', async () => {
    const user = userEvent.setup();
    render(<Form type="GroupHeader114" locale="en" />);
    await user.click(screen.getByRole('textbox', { name: /^Message Identification/ }));
    await user.tab();
    expect((await screen.findByRole('alert')).textContent).toBe('Required');
  });

  it('English-only spec text is flagged when the page is in Spanish', async () => {
    const user = userEvent.setup();
    render(<Form type="PaymentInstruction51" locale="es" />);
    await user.click(screen.getByRole('button', { name: 'Acerca de Payment Method' }));
    expect(screen.getByRole('note').textContent).toMatch(/means of payment/);
    expect(screen.getByRole('note').textContent).toContain('Se muestra en inglés (sin traducir)');
  });

  it('consumer overrides change labels, definitions and messages; translated text is not flagged', async () => {
    const user = userEvent.setup();
    const overrides: I18nOverrides = {
      validation: { es: { required: 'Campo obligatorio' } },
      definitions: { es: { labels: { [method.isoId!]: 'Método de pago' }, fields: { [method.isoId!]: 'Medio de pago utilizado.' } } },
    };
    render(<Form type="PaymentInstruction51" locale="es" overrides={overrides} />);
    const about = screen.getByRole('button', { name: 'Acerca de Método de pago' });
    await user.click(about);
    expect(screen.getByRole('note').textContent).toBe('Medio de pago utilizado.');
    expect(screen.getByRole('combobox', { name: /^Método de pago/ })).toBeTruthy();
  });
});
