import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, SchemaForm, createI18n } from '@beneficial-strategies/iso20022-react-ui';
import { useIso20022Form } from '@beneficial-strategies/iso20022-react';
import { hydrate } from '@beneficial-strategies/iso20022-validate';
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

describe('setValues', () => {
  /** Load parsed values into a form that already has edits; the edits are replaced, not merged. */
  function Loader() {
    const form = useIso20022Form({ schema: schemas.GroupHeader114 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'GroupHeader114' });
    return (
      <>
        <SchemaForm form={form} />
        <button type="button" onClick={() => form.setValues(hydrate(pain001Message.typeDescriptors, 'GroupHeader114', { MessageIdentification: 'LOADED', InitiatingParty: { Name: 'Acme' } }))}>
          load
        </button>
        <button type="button" onClick={() => form.touchAll()}>
          touch
        </button>
        <output data-testid="values">{JSON.stringify(form.values)}</output>
      </>
    );
  }

  it('replaces what was typed with the loaded values', async () => {
    const user = userEvent.setup();
    render(<Loader />);
    const id = screen.getByRole('textbox', { name: /^Message Identification/ }) as HTMLInputElement;
    await user.type(id, 'typed before');
    await user.click(screen.getByRole('button', { name: 'load' }));
    expect(id.value).toBe('LOADED');
    expect((screen.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement).value).toBe('Acme');
    expect(screen.getByTestId('values').textContent).not.toContain('typed before');
  });

  it('forgets which fields were touched, and can then show every error', async () => {
    const user = userEvent.setup();
    render(<Loader />);
    await user.click(screen.getByRole('textbox', { name: /^Message Identification/ }));
    await user.tab(); // touched, empty: "Required"
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'load' }));
    expect(screen.queryAllByRole('alert')).toHaveLength(0); // the loaded state starts quiet
    await user.click(screen.getByRole('button', { name: 'touch' })); // what the app does after a paste
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0); // e.g. the missing creation date-time
  });
});
