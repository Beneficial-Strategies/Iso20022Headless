import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, SchemaForm, createI18n } from '@beneficial-strategies/iso20022-demo-shared';
import { useIso20022Form } from '@beneficial-strategies/iso20022-react';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';

afterEach(cleanup);

/** The library's own hook (TanStack Form underneath), driven through the same schema-driven UI. */
function Form({ locale }: { locale: string }) {
  const i18n = createI18n(locale, { validation: { es: { required: 'Campo obligatorio' } } });
  const form = useIso20022Form({ schema: schemas.GroupHeader114 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'GroupHeader114', messages: i18n.validation });
  return (
    <I18nProvider value={i18n}>
      <SchemaForm form={form} />
      <output data-testid="values">{JSON.stringify(form.values)}</output>
    </I18nProvider>
  );
}

describe('useIso20022Form (TanStack Form)', () => {
  it('stores edits in TanStack state', async () => {
    const user = userEvent.setup();
    render(<Form locale="en" />);
    await user.type(screen.getByRole('textbox', { name: /^Message Identification/ }), 'MSG-1');
    expect(screen.getByTestId('values').textContent).toContain('"MessageIdentification":"MSG-1"');
  });

  it('shows the required error on blur of an empty field, in English', async () => {
    const user = userEvent.setup();
    render(<Form locale="en" />);
    await user.click(screen.getByRole('textbox', { name: /^Message Identification/ }));
    await user.tab();
    expect((await screen.findAllByRole('alert'))[0]?.textContent).toBe('Required');
  });

  it('uses the consumer-supplied Spanish catalog', async () => {
    const user = userEvent.setup();
    render(<Form locale="es" />);
    await user.click(screen.getByRole('textbox', { name: /^Message Identification/ }));
    await user.tab();
    expect((await screen.findAllByRole('alert'))[0]?.textContent).toBe('Campo obligatorio'); // override, not the shipped "Obligatorio"
  });

  it('marks required fields with aria-required and the invalid one with aria-invalid', async () => {
    const user = userEvent.setup();
    render(<Form locale="en" />);
    const input = screen.getByRole('textbox', { name: /^Message Identification/ });
    expect(input.getAttribute('aria-required')).toBe('true');
    await user.click(input);
    await user.tab();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Required');
  });
});
