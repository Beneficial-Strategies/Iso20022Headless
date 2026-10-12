import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIso20022Form } from '@beneficial-strategies/iso20022-react';
import { schemas, typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';
import { I18nProvider, Iso20022Form, SchemaForm, SkinProvider, createI18n, plainSkin } from '../src/index.ts';

afterEach(cleanup);

// InstructionForDebtorAgent1 has one external code, ExternalDebtorAgentInstruction1Code (7 values, HOLD first), and a free text.
// The repository lists an external code set's values like any code set's, so the form shows them the same way: a dropdown of
// "value — name", the definition as description. Unlike an enumerated set it accepts any value of the right length.
const TYPE = 'InstructionForDebtorAgent1';
const codeBox = () => screen.findByRole('combobox', { name: /^Code/ });

describe('external code sets in a form', () => {
  it('offers the values the repository lists as a dropdown, in the publisher\'s order, and reports the one chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Iso20022Form type={TYPE} schemas={schemas} typeDescriptors={typeDescriptors} onChange={onChange} />);
    const dropdown = await codeBox();
    const options = within(dropdown).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(options[0]).toMatch(/select/);
    expect(options.slice(1, 4).map((o) => o.slice(0, 4))).toEqual(['HOLD', 'CHQB', 'PRTK']); // declared order, not alphabetical
    expect(options).toHaveLength(8);
    await user.selectOptions(dropdown, 'CHQB');
    await waitFor(() => expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ Code: 'CHQB' }));
  });

  it('shows a value that is not on the list as it is, and keeps it valid (the list is not closed)', async () => {
    function Loaded() {
      const form = useIso20022Form({ schema: schemas[TYPE]!, typeDescriptors, rootType: TYPE });
      useEffect(() => form.setValues({ Code: 'ZZZZ' }), []); // eslint-disable-line react-hooks/exhaustive-deps
      return (
        <I18nProvider value={createI18n('en')}>
          <SkinProvider value={plainSkin}>
            <SchemaForm form={form} />
            <output data-testid="valid">{String(!form.errors.Code)}</output>
          </SkinProvider>
        </I18nProvider>
      );
    }
    render(<Loaded />);
    const dropdown = await codeBox();
    await waitFor(() => expect((dropdown as HTMLSelectElement).value).toBe('ZZZZ'));
    expect(within(dropdown).getAllByRole('option').map((o) => o.textContent)).toContain('ZZZZ');
    expect(screen.getByTestId('valid').textContent).toBe('true');
  });

  it('lets the host add, edit and delete values by passing its own copy of the type descriptor', async () => {
    const mine = {
      ...typeDescriptors,
      ExternalDebtorAgentInstruction1Code: {
        ...typeDescriptors.ExternalDebtorAgentInstruction1Code!,
        options: [{ value: 'ACME', name: 'AcmeInternal' }, ...typeDescriptors.ExternalDebtorAgentInstruction1Code!.options!.filter((o) => o.value !== 'HOLD')],
      },
    };
    render(<Iso20022Form type={TYPE} schemas={schemas} typeDescriptors={mine} overrides={{ definitions: { en: { codeNames: { ACME: 'Acme internal' } } } }} />);
    const options = within(await codeBox()).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(options[1]).toMatch(/^ACME — /);
    expect(options.some((o) => o.startsWith('HOLD'))).toBe(false);
    expect(options).toHaveLength(8); // the select entry, ACME, and the six that stayed
  });
});
