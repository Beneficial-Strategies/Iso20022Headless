import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm } from '@beneficial-strategies/iso20022-react-ui';
import { hydrate } from '@beneficial-strategies/iso20022-validate';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

function Form({ type }: { type: keyof typeof schemas }) {
  const form = useZodForm({ schema: schemas[type] as never, typeDescriptors: pain001Message.typeDescriptors, rootType: type });
  return <SchemaForm form={form} />;
}

describe('dropdown descriptions with the real generated data', () => {
  it('code dropdown (PaymentMethod) lists each code with its spec definition', async () => {
    const user = userEvent.setup();
    render(<Form type="PaymentInstruction51" />);
    await user.click(screen.getByRole('combobox', { name: /Payment Method/i }));
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option')).toHaveLength(4);
    expect(within(list).getByText(/Written order to a bank/)).toBeTruthy(); // CHK
    expect(within(list).getByText(/An advice should be sent back/)).toBeTruthy(); // TRA
    expect(within(list).getByText(/CHK — Cheque/)).toBeTruthy();
    await user.click(within(list).getByRole('option', { name: /TRF/ }));
    // the chosen code's definition also stays visible under the field
    expect(screen.getAllByText(/in the books of the account servicer/).length).toBeGreaterThan(0);
  });

  it('Choice dropdown lists each variant with its definition', async () => {
    const user = userEvent.setup();
    render(<Form type="CashAccount40" />);
    await user.click(screen.getByRole('checkbox', { name: /Include Identification/i })); // optional, so it starts hidden
    await user.click(screen.getByRole('combobox', { name: /Identification.*choose one/i }));
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('IBAN'), expect.stringContaining('Other')]));
    // the IBAN variant carries its spec text, not an empty entry
    const iban = within(list).getByRole('option', { name: /IBAN/ });
    expect((iban.textContent ?? '').length).toBeGreaterThan('IBAN'.length + 20);
    await user.click(iban);
    expect(screen.getByRole('textbox', { name: /IBAN/i })).toBeTruthy(); // selecting reveals the variant's field
  });

  it('true/false dropdown (BatchBooking) works too', async () => {
    const user = userEvent.setup();
    render(<Form type="PaymentInstruction51" />);
    await user.click(screen.getByRole('combobox', { name: /Batch Booking/i }));
    await user.click(screen.getByRole('option', { name: 'true' }));
    expect(screen.getByRole('combobox', { name: /Batch Booking/i }).textContent).toContain('true');
  });
});

describe('setValues', () => {
  /** Load parsed values into a form that already has edits; the edits are replaced, not merged. */
  function Loader() {
    const form = useZodForm({ schema: schemas.GroupHeader114 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'GroupHeader114' });
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
