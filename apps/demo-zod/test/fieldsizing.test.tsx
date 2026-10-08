import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SchemaForm, SkinProvider, plainSkin, tailwindSkin, type FieldSizing, type Skin } from '@beneficial-strategies/iso20022-react-ui';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

function Form({ skin = tailwindSkin, sizing, type = 'GroupHeader114' }: { skin?: Skin; sizing?: FieldSizing; type?: string }) {
  const form = useZodForm({ schema: schemas[type as keyof typeof schemas] as never, typeDescriptors: pain001Message.typeDescriptors, rootType: type });
  return (
    <SkinProvider value={skin}>
      <SchemaForm form={form} {...(sizing ? { fieldSizing: sizing } : {})} />
    </SkinProvider>
  );
}
const box = (name: RegExp) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const maxWidth = (e: HTMLElement) => e.style.maxWidth;

describe('controls are as wide as their type needs (the default)', () => {
  it('an identifier of at most 35 characters is capped, with room to spare: 1.55 times as many digit widths, plus the box', () => {
    render(<Form />);
    expect(maxWidth(box(/^Message Identification/))).toBe('calc(55ch + 2rem)');
  });

  it('a digits-only field is capped to its digits', () => {
    render(<Form />);
    expect(maxWidth(box(/^Number Of Transactions/))).toBe('calc(24ch + 2rem)'); // 15 digits
    expect(maxWidth(box(/^Control Sum/))).toBe('calc(31ch + 2rem)'); // 18 digits, a point and a sign
  });

  it('a name that can be 140 characters takes the full width: no cap', () => {
    render(<Form />);
    expect(maxWidth(box(/^Name/))).toBe('');
  });

  it('a short code is capped at a few characters', () => {
    render(<Form />);
    expect(maxWidth(box(/^Country Of Residence/))).toBe('calc(13ch + 2rem)');
  });

  it('an empty date-time is a row of the box and its Now button, capped as one; the box itself is not capped', () => {
    render(<Form />);
    const input = box(/^Creation Date Time/);
    expect(maxWidth(input)).toBe('');
    expect(maxWidth(input.closest('div.flex')!)).toBe('calc(53ch + 2rem)'); // 30 characters and the button
  });

  it('a dropdown is capped by its longest option', () => {
    render(<Form type="PaymentInstruction51" />);
    const select = screen.getByRole('combobox', { name: /^Payment Method/ });
    expect(maxWidth(select.closest('div.relative') as HTMLElement)).toMatch(/^calc\(\d+ch \+ 2rem\)$/);
  });

  it('is never wider than the panel: it is a maximum, so a narrow panel still wins', () => {
    render(<Form />);
    const input = box(/^Message Identification/);
    expect(input.className).toContain('w-full');
    expect(maxWidth(input)).not.toMatch(/^\d+px$/);
  });
});

describe('fieldSizing="full" keeps every control as wide as the panel', () => {
  it('no caps anywhere', () => {
    const { container } = render(<Form sizing="full" type="PaymentInstruction51" />);
    expect(maxWidth(box(/^Payment Information Identification/))).toBe('');
    const capped = [...container.querySelectorAll<HTMLElement>('[style]')].filter((e) => e.style.maxWidth);
    expect(capped).toHaveLength(0);
  });
});

describe('the plain skin', () => {
  it('leaves sizing to the browser: no sizes, widths, classes or styles of its own', () => {
    const { container } = render(<Form skin={plainSkin} />);
    expect(box(/^Message Identification/).hasAttribute('size')).toBe(false);
    expect(box(/^Name/).hasAttribute('size')).toBe(false);
    expect(container.querySelectorAll('[class]')).toHaveLength(0);
    expect(container.querySelectorAll('input[style], select[style]')).toHaveLength(0);
  });
});
