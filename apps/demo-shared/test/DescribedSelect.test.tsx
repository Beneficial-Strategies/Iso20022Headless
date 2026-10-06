import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DescribedSelect } from '../src/DescribedSelect.tsx';

const options = [
  { value: 'CHK', label: 'CHK — Cheque', description: 'Written order to a bank to pay a certain amount of money.' },
  { value: 'TRA', label: 'TRA — TransferAdvice', description: 'Transfer of an amount. An advice should be sent back.' },
  { value: 'TRF', label: 'TRF — CreditTransfer', description: 'Transfer of an amount of money in the books of the account servicer.' },
];

function Harness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <DescribedSelect id="pm" value={v} options={options} onChange={setV} />
      <output data-testid="value">{v}</output>
    </>
  );
}

afterEach(cleanup);

describe('DescribedSelect', () => {
  it('shows every option with its description when opened', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(screen.getByRole('combobox'));
    const opts = screen.getAllByRole('option');
    expect(opts).toHaveLength(4); // "— select —" + 3
    expect(screen.getByText('Written order to a bank to pay a certain amount of money.')).toBeTruthy();
    expect(screen.getByText(/in the books of the account servicer/)).toBeTruthy();
  });

  it('selects with the mouse and closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /TRF/ }));
    expect(screen.getByTestId('value').textContent).toBe('TRF');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox').textContent).toContain('TRF — CreditTransfer');
  });

  it('works from the keyboard: arrows move, Enter selects, Escape closes without selecting', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('combobox').focus();
    await user.keyboard('{ArrowDown}'); // opens with the (empty) current value active
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); // -> TRA
    expect(screen.getByTestId('value').textContent).toBe('TRA');
    await user.keyboard('{ArrowDown}{ArrowDown}'); // open (active=TRA) then TRF
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('value').textContent).toBe('TRA');
  });

  it('exposes combobox/listbox semantics and the active option', async () => {
    const user = userEvent.setup();
    render(<Harness initial="TRA" />);
    const cb = screen.getByRole('combobox');
    expect(cb.getAttribute('aria-expanded')).toBe('false');
    await user.click(cb);
    expect(cb.getAttribute('aria-expanded')).toBe('true');
    const active = cb.getAttribute('aria-activedescendant')!;
    expect(document.getElementById(active)?.textContent).toContain('TRA');
    expect(screen.getByRole('option', { name: /TRA/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('can clear the value via the "— select —" entry', async () => {
    const user = userEvent.setup();
    render(<Harness initial="CHK" />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /select/ }));
    expect(screen.getByTestId('value').textContent).toBe('');
  });

  it('type-ahead jumps to a matching option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('combobox').focus();
    await user.keyboard('trf{Enter}');
    expect(screen.getByTestId('value').textContent).toBe('TRF');
  });
});
