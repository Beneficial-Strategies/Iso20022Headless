import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm, SkinProvider, plainSkin, tailwindSkin, type FieldExtraContext, type FieldMode, type FieldModeView, type Skin } from '@beneficial-strategies/iso20022-react-ui';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

type Modes = Record<string, FieldMode>;
interface Props {
  modes?: Modes;
  view?: FieldModeView;
  skin?: Skin;
  seen?: FieldExtraContext[];
}

function Harness({ modes, view, skin = tailwindSkin, seen }: Props) {
  const form = useZodForm({ schema: schemas.PaymentInstruction51 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'PaymentInstruction51' });
  const fieldMode = modes ? (e: FieldExtraContext) => (seen?.push(e), modes[e.path]) : undefined;
  return (
    <SkinProvider value={skin}>
      <SchemaForm form={form} {...(fieldMode ? { fieldMode } : {})} {...(view ? { fieldModeView: view } : {})} />
      <output data-testid="values">{JSON.stringify(form.values)}</output>
    </SkinProvider>
  );
}

const values = () => JSON.parse(screen.getByTestId('values').textContent!) as Record<string, unknown>;
const idInput = () => screen.queryByRole('textbox', { name: /^Payment Information Identification/ });

describe('field mode: label', () => {
  it('shows the value as text, not in a control, and the label stays', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.type(idInput()!, 'PMT-1');
    rerender(<Harness modes={{ PaymentInformationIdentification: 'label' }} />);
    expect(idInput()).toBeNull();
    expect(screen.getByText('Payment Information Identification')).toBeTruthy();
    expect(screen.getByText('PMT-1').tagName).toBe('P');
    expect(values()).toMatchObject({ PaymentInformationIdentification: 'PMT-1' });
  });

  it('an empty value reads as a dash', () => {
    render(<Harness modes={{ PaymentInformationIdentification: 'label' }} />);
    expect(idInput()).toBeNull();
    const field = screen.getByText('Payment Information Identification').closest('div')!.parentElement!;
    expect(within(field).getByText('—')).toBeTruthy();
  });

  it('a code shows with its name, as the dropdown does', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness skin={plainSkin} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /^Payment Method/ }), 'CHK');
    rerender(<Harness skin={plainSkin} modes={{ PaymentMethod: 'label' }} />);
    expect(screen.queryByRole('combobox', { name: /^Payment Method/ })).toBeNull();
    expect(screen.getByText('CHK — Cheque')).toBeTruthy();
  });

  it('a section in label mode makes everything inside it a label; elements outside stay editable', () => {
    render(<Harness modes={{ Debtor: 'label' }} />);
    const debtor = screen.getByText('Debtor').closest('fieldset')!;
    expect(within(debtor).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(debtor).queryAllByRole('checkbox')).toHaveLength(0); // optional sections have no box to tick
    expect(screen.getByRole('textbox', { name: /^Payment Information Identification/ })).toBeTruthy();
  });

  it('a list in label mode has no add button and no remove buttons', () => {
    const { rerender } = render(<Harness />);
    expect(screen.getAllByRole('button', { name: /Add Credit Transfer Transaction Information/ }).length).toBeGreaterThan(0);
    rerender(<Harness modes={{ CreditTransferTransactionInformation: 'label' }} />);
    expect(screen.queryAllByRole('button', { name: /Add Credit Transfer Transaction Information/ })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^Remove/ })).toHaveLength(0);
  });

  it('an optional section left out is absent in label mode, and an included one shows its values as labels', async () => {
    const user = userEvent.setup();
    const box = () => screen.queryAllByRole('checkbox', { name: /Include Payment Type Information/ });
    const { rerender } = render(<Harness />);
    const before = box().length; // the payment's own, and one in each transaction
    expect(before).toBeGreaterThan(0);
    rerender(<Harness modes={{ PaymentTypeInformation: 'label' }} />);
    expect(box()).toHaveLength(before - 1); // the one of the payment is gone: nothing to tick when left out
    rerender(<Harness />);
    await user.click(box()[0]!); // include it
    rerender(<Harness modes={{ PaymentTypeInformation: 'label' }} />);
    expect(box()).toHaveLength(before - 1);
    expect(screen.getAllByText('Payment Type Information').length).toBeGreaterThan(0); // shown as a section of labels
  });
});

describe('field mode: hidden', () => {
  it('leaves the element out, keeps its value in the form, and brings it back when the mode is lifted', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.type(idInput()!, 'PMT-1');
    rerender(<Harness modes={{ PaymentInformationIdentification: 'hidden' }} />);
    expect(idInput()).toBeNull();
    expect(screen.queryByText('Payment Information Identification')).toBeNull();
    expect(screen.queryByText('PMT-1')).toBeNull();
    expect(values()).toMatchObject({ PaymentInformationIdentification: 'PMT-1' }); // the default is still in the message
    rerender(<Harness />);
    expect((idInput() as HTMLInputElement).value).toBe('PMT-1');
  });

  it('a hidden section takes everything inside it away', () => {
    render(<Harness modes={{ Debtor: 'hidden' }} />);
    expect(screen.queryByText('Debtor')).toBeNull();
    expect(screen.queryByText('Debtor Account')).not.toBeNull(); // a sibling
  });

  it('hidden wins over label: a label section with a hidden element in it', () => {
    render(<Harness modes={{ Debtor: 'label', 'Debtor.Name': 'hidden' }} />);
    const debtor = screen.getByText('Debtor').closest('fieldset')!;
    expect(within(debtor).queryByText('Name')).toBeNull();
  });
});

describe('field mode: the marked view keeps everything editable and shades what is not', () => {
  it('a hidden element is still there to edit, inside a shaded wrapper', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness view="mark" modes={{ PaymentInformationIdentification: 'hidden' }} />);
    const input = idInput()!;
    await user.type(input, 'PMT-2');
    expect(values()).toMatchObject({ PaymentInformationIdentification: 'PMT-2' });
    const mark = input.closest('[data-field-mode]')!;
    expect(mark.getAttribute('data-field-mode')).toBe('hidden');
    expect(container.querySelectorAll('[data-field-mode]')).toHaveLength(1);
  });

  it('a label is shaded differently, and what is inside a shaded section is not shaded again', () => {
    const { container } = render(<Harness view="mark" modes={{ Debtor: 'label', 'Debtor.Name': 'label' }} />);
    expect(container.querySelectorAll('[data-field-mode="label"]')).toHaveLength(1);
    const debtor = screen.getByText('Debtor').closest('[data-field-mode]')!;
    expect(within(debtor as HTMLElement).getAllByRole('textbox').length).toBeGreaterThan(0); // still editable
  });

  it('a stronger mode inside a weaker one is shaded in its own right', () => {
    const { container } = render(<Harness view="mark" modes={{ Debtor: 'label', 'Debtor.Name': 'hidden' }} />);
    expect(container.querySelectorAll('[data-field-mode="label"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-field-mode="hidden"]')).toHaveLength(1);
  });

  it('the plain skin shades nothing itself: only an attribute, and still no class attributes', () => {
    const { container } = render(<Harness skin={plainSkin} view="mark" modes={{ PaymentInformationIdentification: 'hidden', Debtor: 'label' }} />);
    expect(container.querySelectorAll('[data-field-mode]')).toHaveLength(2);
    expect(container.querySelectorAll('[class]')).toHaveLength(0);
  });
});

describe('field mode: the rest', () => {
  it('without fieldMode nothing changes: no marks, everything editable', () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll('[data-field-mode]')).toHaveLength(0);
    expect(idInput()).not.toBeNull();
  });

  it('is asked about every element, with its type, kind, name, label and path', () => {
    const seen: FieldExtraContext[] = [];
    render(<Harness modes={{}} seen={seen} />);
    expect(seen.find((e) => e.path === 'PaymentMethod')).toMatchObject({ type: 'PaymentMethod3Code', kind: 'code', name: 'PaymentMethod', label: 'Payment Method' });
    expect(seen.find((e) => e.path === 'Debtor')).toMatchObject({ kind: 'component', name: 'Debtor' });
    expect(seen.find((e) => e.path === 'Debtor.Name')).toMatchObject({ kind: 'text' });
  });

  it('the values of hidden and label elements are in the form state, so in the XML', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.type(idInput()!, 'A');
    rerender(<Harness modes={{ PaymentInformationIdentification: 'hidden' }} />);
    expect(values().PaymentInformationIdentification).toBe('A');
  });
});
