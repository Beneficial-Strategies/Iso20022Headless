import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';
import { useCreateI18n, type TextSource } from '../src/index.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// the elements of InstructionForDebtorAgent1 by name; the pack is keyed by names, the form reads ids
const T = typeDescriptors.InstructionForDebtorAgent1!;
const code = T.fields!.find((f) => f.name === 'Code')!;

function Probe({ source }: { source: TextSource | undefined }) {
  const i18n = useCreateI18n('fr', undefined, source);
  return (
    <>
      <output data-testid="label">{i18n.defs.label(code, 'Code').text}</output>
      <output data-testid="def">{i18n.defs.field(code, undefined)?.text ?? ''}</output>
    </>
  );
}

describe('text from a text host', () => {
  const source: TextSource = { baseUrl: 'https://text.example/', messages: ['pain.001.001.13'], typeDescriptors };

  it('asks for the labels of the language and the definitions of the message, and shows what it gets (names, not ids, are the keys)', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const body = url.endsWith('labels.json')
        ? { schema: 1, lang: 'fr', labels: { Code: 'Code (hôte)' } }
        : { schema: 1, lang: 'fr', message: 'pain.001.001.13', types: {}, members: { 'InstructionForDebtorAgent1/Code': { text: 'Définition (hôte)', status: 'reviewed' } }, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
      return { ok: true, json: async () => body };
    });
    render(<Probe source={source} />);
    await waitFor(() => expect(screen.getByTestId('label').textContent).toBe('Code (hôte)'));
    expect(screen.getByTestId('def').textContent).toBe('Définition (hôte)');
    expect([...new Set(asked)].sort()).toEqual(['https://text.example/v1/fr/labels.json', 'https://text.example/v1/fr/messages/pain.001.001.13.json']);
  });

  it('shows the English text when the host cannot be reached, and loads nothing from the bundled catalogs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    render(<Probe source={{ ...source, baseUrl: 'https://down.example' }} />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.getByTestId('label').textContent).toBe('Code');
    warn.mockRestore();
  });
});
