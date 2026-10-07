import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm, SkinProvider, tailwindSkin } from '@beneficial-strategies/iso20022-react-ui';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

function Form({ onZoom }: { onZoom?: (type: string) => void }) {
  const form = useZodForm({ schema: schemas.PaymentInstruction51 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'PaymentInstruction51' });
  return (
    <SkinProvider value={tailwindSkin}>
      <SchemaForm form={form} {...(onZoom ? { onZoom } : {})} />
    </SkinProvider>
  );
}

const about = () => screen.getByRole('button', { name: 'About Payment Method' });

describe('the "i" help button', () => {
  it('shows nothing until it is used', () => {
    render(<Form />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('hovering shows the definition in a popup that ends with "Click to view in form", and leaving hides it', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.hover(about());
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toMatch(/means of payment/);
    expect(tip.textContent?.endsWith('Click to view in form')).toBe(true);
    expect(about().getAttribute('aria-describedby')).toBe(tip.id);
    expect(screen.queryByRole('note')).toBeNull();
    await user.unhover(about());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('clicking shows the same text inline, under the label, and the popup is gone', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.hover(about());
    const tipText = screen.getByRole('tooltip').textContent!.replace('Click to view in form', '');
    await user.click(about());
    const note = screen.getByRole('note');
    expect(note.textContent).toBe(tipText);
    expect(note.textContent).not.toContain('Click to view in form');
    expect(screen.queryByRole('tooltip')).toBeNull(); // still hovering, but the text is already on the page
    expect(about().getAttribute('aria-expanded')).toBe('true');
    expect(about().getAttribute('aria-controls')).toBe(note.id);
    // it sits in the field, after the label row and before the control
    const field = note.parentElement!;
    expect(field.querySelector('label')!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(field.querySelector('[role="combobox"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // small text, like the "(optional)" mark
    expect(note.className).toContain('text-xs');
  });

  it('clicking again, or pressing Escape, hides the inline text', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(about());
    expect(screen.getByRole('note')).toBeTruthy();
    await user.click(about());
    expect(screen.queryByRole('note')).toBeNull();
    await user.click(about());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('each help button has its own note', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(about());
    await user.click(screen.getAllByRole('button', { name: /^About /, expanded: false })[0]!);
    expect(screen.getAllByRole('note')).toHaveLength(2);
  });
});

describe('the zoom button next to the "i"', () => {
  const zoomButtons = () => screen.queryAllByRole('button', { name: /^Zoom in to / });

  it('is not shown unless the host can zoom (no onZoom)', () => {
    render(<Form />);
    expect(zoomButtons()).toHaveLength(0);
  });

  it('is shown on components only, not on values or choices, and not on the form title', () => {
    render(<Form onZoom={() => {}} />);
    const names = zoomButtons().map((b) => b.getAttribute('aria-label'));
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('Zoom in to PaymentTypeInformation26');
    expect(names).not.toContain('Zoom in to PaymentInstruction51'); // the type being edited
    expect(names.every((n) => /^Zoom in to [A-Z][A-Za-z]*\d+$/.test(n!))).toBe(true);
    // the title has an "i" but nothing to zoom into
    const title = screen.getByRole('heading', { level: 2 });
    expect(title.querySelector('[aria-label^="Zoom in"]')).toBeNull();
    expect(title.querySelector('[aria-label^="About"]')).toBeTruthy();
  });

  it('sits right after the "i" of the same element', () => {
    render(<Form onZoom={() => {}} />);
    const zoom = screen.getAllByRole('button', { name: 'Zoom in to PaymentTypeInformation26' })[0]!;
    const i = zoom.closest('span.inline-flex.items-center')!.querySelector('button[aria-label^="About"]')!;
    expect(i.compareDocumentPosition(zoom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(i.getAttribute('aria-label')).toBe('About Payment Type Information');
  });

  it('hovering explains it, naming the type, and clicking asks the host to zoom into that type', async () => {
    const user = userEvent.setup();
    const zoomed: string[] = [];
    render(<Form onZoom={(t) => zoomed.push(t)} />);
    const button = screen.getAllByRole('button', { name: 'Zoom in to PaymentTypeInformation26' })[0]!;
    await user.hover(button);
    const tip = screen.getByRole('tooltip').textContent!;
    expect(tip).toContain('based upon the ISO 20022 type PaymentTypeInformation26');
    expect(tip).toContain('Click Zoom to zoom in to that data type in isolation from the outer message.');
    await user.unhover(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.click(button);
    expect(zoomed).toEqual(['PaymentTypeInformation26']);
  });
});
