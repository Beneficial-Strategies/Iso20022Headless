import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm, SkinProvider, plainSkin, tailwindSkin, type Skin } from '@beneficial-strategies/iso20022-demo-shared';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

function Form({ skin }: { skin: Skin }) {
  const form = useZodForm({ schema: schemas.PaymentInstruction51 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'PaymentInstruction51' });
  return (
    <SkinProvider value={skin}>
      <SchemaForm form={form} />
      <output data-testid="values">{JSON.stringify(form.values)}</output>
    </SkinProvider>
  );
}

const controls = (root: HTMLElement) => root.querySelectorAll('input, select, textarea, [role="combobox"]').length;

describe('skins render the same form with different markup', () => {
  it('Plain HTML carries no classes at all and uses native controls', () => {
    const { container } = render(<Form skin={plainSkin} />);
    expect(container.querySelectorAll('[class]')).toHaveLength(0);
    expect(container.querySelector('fieldset > legend')).toBeTruthy();
    expect(container.querySelector('select')).toBeTruthy();
    expect(container.querySelector('[role="combobox"]')).toBeNull(); // no custom combobox
  });

  it('the Tailwind skin is styled and uses the custom dropdown', () => {
    const { container } = render(<Form skin={tailwindSkin} />);
    expect(container.querySelectorAll('[class]').length).toBeGreaterThan(10);
    expect(container.querySelector('[role="combobox"]')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
  });

  it('both skins expose the same controls and the same required/ARIA state', () => {
    const a = render(<Form skin={tailwindSkin} />).container;
    const countA = { controls: controls(a), required: a.querySelectorAll('[aria-required="true"]').length };
    cleanup();
    const b = render(<Form skin={plainSkin} />).container;
    expect({ controls: controls(b), required: b.querySelectorAll('[aria-required="true"]').length }).toEqual(countA);
    expect(countA.required).toBeGreaterThan(3);
  });

  it('editing works identically through the native select (Plain)', async () => {
    const user = userEvent.setup();
    render(<Form skin={plainSkin} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /^Payment Method/ }), 'TRF');
    expect(screen.getByTestId('values').textContent).toContain('"PaymentMethod":"TRF"');
    // the selected code's definition is shown, as in the other skin
    expect(screen.getAllByText(/in the books of the account servicer/).length).toBeGreaterThan(0);
  });

  it('Plain help is a details/summary (no JavaScript popover)', () => {
    const { container } = render(<Form skin={plainSkin} />);
    const summary = container.querySelector('details > summary');
    expect(summary).toBeTruthy();
    expect(summary?.getAttribute('aria-label')).toMatch(/^About /);
  });
});
