import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schemas, typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';
import { Iso20022Form } from '../src/index.ts';
// the text of another language, as a text host would serve it
const validationEs = { invalid_format: 'Formato no válido' };

const TYPE = 'BranchAndFinancialInstitutionIdentification8';

afterEach(cleanup);

describe('Iso20022Form', () => {
  it('shows a working form for one type, with its heading, prompts and format hints', async () => {
    const user = userEvent.setup();
    render(<Iso20022Form type={TYPE} schemas={schemas} typeDescriptors={typeDescriptors} />);
    expect(screen.getByRole('heading', { name: /Branch And Financial Institution Identification8/ })).toBeTruthy();
    const bic = screen.getByRole('textbox', { name: /BICFI/ });
    await user.type(bic, 'deutdeff');
    await user.tab();
    expect(await screen.findByText(/Not a valid BIC \(8 or 11 characters\)/)).toBeTruthy();
    await user.clear(bic);
    await user.type(bic, 'DEUTDEFF');
    await user.tab();
    await waitFor(() => expect(screen.queryByText(/Not a valid BIC/)).toBeNull());
  });

  it('reports value and validity through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Iso20022Form type={TYPE} schemas={schemas} typeDescriptors={typeDescriptors} onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: /BICFI/ }), 'DEUTDEFF');
    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)!;
      expect(last[0]).toMatchObject({ FinancialInstitutionIdentification: { BICFI: 'DEUTDEFF' } });
      expect(last[1].valid).toBe(true);
    });
  });

  it('works in another language when its text is passed in with a locale', async () => {
    const user = userEvent.setup();
    render(<Iso20022Form type={TYPE} schemas={schemas} typeDescriptors={typeDescriptors} locale="es" overrides={{ validation: { es: validationEs } }} />);
    const bic = screen.getByRole('textbox', { name: /BICFI/ });
    await user.type(bic, 'x');
    await user.tab();
    expect(await screen.findByText(/Formato no válido/, {}, { timeout: 3000 })).toBeTruthy();
  });

  it('names the problem when the type is not in the module', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Iso20022Form type="Nope" schemas={schemas} typeDescriptors={typeDescriptors} />)).toThrow(/unknown type "Nope"/);
    quiet.mockRestore();
  });
});
