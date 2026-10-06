import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, SchemaForm, createI18n } from '@beneficial-strategies/iso20022-demo-shared';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate';
import es from '@beneficial-strategies/iso20022-validate/locales/es';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

function Form({ type, overrides }: { type: keyof typeof schemas; overrides?: Parameters<typeof createI18n>[1] }) {
  const i18n = createI18n('es', overrides, { es });
  const form = useZodForm({ schema: schemas[type] as never, typeDescriptors: pain001Message.typeDescriptors, rootType: type, messages: i18n.validation });
  return (
    <I18nProvider value={i18n}>
      <SchemaForm form={form} />
    </I18nProvider>
  );
}

describe('the form with the shipped Spanish spec text', () => {
  it('labels, code names and descriptions are in Spanish', async () => {
    const user = userEvent.setup();
    render(<Form type="PaymentInstruction51" />);
    const method = screen.getByRole('combobox', { name: /^Método de pago/ });
    await user.click(method);
    const list = screen.getByRole('listbox');
    expect(within(list).getByText(/TRF — Transferencia/)).toBeTruthy();
    expect(within(list).getByText(/Orden escrita dirigida a un banco/)).toBeTruthy();
    await user.click(within(list).getByRole('option', { name: /TRF/ }));
    expect(screen.getAllByText(/Transferencia de una cantidad de dinero/).length).toBeGreaterThan(0);
  });

  it('the help note says the text is machine translated, not that it is English', async () => {
    const user = userEvent.setup();
    render(<Form type="PaymentInstruction51" />);
    await user.click(screen.getByRole('button', { name: 'Acerca de Método de pago' }));
    const note = screen.getByRole('note').textContent ?? '';
    expect(note).toContain('Traducción automática, pendiente de revisión');
    expect(note).not.toContain('sin traducir');
    expect(note).toMatch(/medio de pago/i);
  });

  it('a consumer correction replaces the machine text and drops the machine note', async () => {
    const user = userEvent.setup();
    const method = pain001Message.typeDescriptors.PaymentInstruction51!.fields!.find((f) => f.name === 'PaymentMethod')!;
    render(<Form type="PaymentInstruction51" overrides={{ definitions: { es: { fields: { [method.isoId!]: 'Medio de pago utilizado.' } } } }} />);
    await user.click(screen.getByRole('button', { name: 'Acerca de Método de pago' }));
    expect(screen.getByRole('note').textContent).toBe('Medio de pago utilizado.');
  });
});
