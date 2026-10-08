import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm, SkinProvider, plainSkin, tailwindSkin, type FieldExtraContext, type Skin } from '@beneficial-strategies/iso20022-react-ui';
import { zoomExtra } from '@beneficial-strategies/iso20022-demo-shared';
import { pain001Message, schemas } from '@beneficial-strategies/iso20022-validate/pain001';
import { useZodForm } from '../src/useZodForm.ts';

afterEach(cleanup);

function Form({ onZoom, fieldExtra, skin = tailwindSkin }: { onZoom?: (type: string) => void; fieldExtra?: (element: FieldExtraContext) => React.ReactNode; skin?: Skin }) {
  const form = useZodForm({ schema: schemas.PaymentInstruction51 as never, typeDescriptors: pain001Message.typeDescriptors, rootType: 'PaymentInstruction51' });
  const extra = fieldExtra ?? (onZoom ? zoomExtra(onZoom) : undefined);
  return (
    <SkinProvider value={skin}>
      <SchemaForm form={form} {...(extra ? { fieldExtra: extra } : {})} />
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

describe('the demo\'s zoom button, imposed beside the "i" from outside the library', () => {
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

describe('fieldExtra: the library\'s neutral slot beside the "i"', () => {
  it('puts nothing of its own there: the "i" and the library\'s spec button, and no zoom or anything else', () => {
    const { container } = render(<Form />);
    expect(screen.queryAllByRole('button', { name: /zoom/i })).toHaveLength(0);
    expect(container.textContent).not.toMatch(/zoom/i);
    for (const i of screen.getAllByRole('button', { name: /^About / })) {
      const kids = [...i.parentElement!.parentElement!.children];
      expect(kids).toHaveLength(2); // the "i" and the spec button
      expect(kids[1]!.querySelector('a[data-spec-link]')).not.toBeNull();
    }
  });

  it('is called for every element that has an "i", with what the host needs to decide', () => {
    const seen: FieldExtraContext[] = [];
    render(<Form fieldExtra={(e) => (seen.push(e), null)} />);
    const by = (name: string) => seen.find((e) => e.name === name)!;
    expect(by('PaymentMethod')).toMatchObject({ type: 'PaymentMethod3Code', kind: 'code', label: 'Payment Method', path: 'PaymentMethod' });
    expect(by('PaymentTypeInformation')).toMatchObject({ type: 'PaymentTypeInformation26', kind: 'component' });
    expect(seen.some((e) => e.kind === 'choice')).toBe(true);
    expect(seen.some((e) => e.kind === 'component')).toBe(true);
    // not for the form title (it is not an element)
    expect(seen.find((e) => e.type === 'PaymentInstruction51' && e.path === '')).toBeUndefined();
  });

  it('shows what the host returns right after the "i", in the same place', () => {
    render(<Form fieldExtra={(e) => (e.name === 'PaymentMethod' ? <button type="button">Mine</button> : null)} />);
    const mine = screen.getByRole('button', { name: 'Mine' });
    const i = screen.getByRole('button', { name: 'About Payment Method' });
    expect(mine.parentElement).toBe(i.parentElement!.parentElement); // both inside the same wrapper
    expect(i.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Mine' })).toHaveLength(1);
  });

  it('works in the plain skin as well', () => {
    render(<Form skin={plainSkin} fieldExtra={(e) => (e.name === 'PaymentMethod' ? <button type="button">Mine</button> : null)} />);
    expect(screen.getAllByRole('button', { name: 'Mine' })).toHaveLength(1);
  });

  it('the demo\'s zoom is just one use of it: its text is the demo\'s own, in English and Spanish', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Form onZoom={() => {}} />);
    await user.hover(screen.getAllByRole('button', { name: 'Zoom in to PaymentTypeInformation26' })[0]!);
    expect(screen.getByRole('tooltip').textContent).toContain('Click Zoom to zoom in to that data type');
    unmount();
  });

  it('the demo\'s zoom adapts to the skin: in the plain skin it is an ordinary button with no classes', () => {
    const { container } = render(<Form skin={plainSkin} onZoom={() => {}} />);
    const zooms = screen.getAllByRole('button', { name: /^Zoom in to / });
    expect(zooms.length).toBeGreaterThan(0);
    for (const z of zooms) {
      expect(z.textContent).toBe('Zoom');
      expect(z.hasAttribute('class')).toBe(false);
      expect(z.hasAttribute('title')).toBe(true);
    }
    expect(container.querySelectorAll('[class]')).toHaveLength(0);
  });
});
