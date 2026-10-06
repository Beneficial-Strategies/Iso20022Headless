import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '../src/SettingsPanel.tsx';
import { useSettings } from '../src/settings.ts';
import { skinIds, skins } from '../src/skin/index.ts';

function Harness() {
  const { settings, update } = useSettings(skinIds);
  return <SettingsPanel settings={settings} skins={skins} locales={['en', 'es']} onChange={update} />;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  delete document.documentElement.dataset.theme;
});
afterEach(cleanup);

describe('settings panel', () => {
  it('opens as a dialog with theme, size, density and skin options', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Display/ }));
    expect(screen.getByRole('dialog', { name: /Display settings/ })).toBeTruthy();
    for (const name of ['XML', 'JSON', 'Light', 'Dark', 'System', 'Normal', 'Large', 'Extra large', 'Comfortable', 'Compact', 'Tailwind', 'Plain HTML']) {
      expect(screen.getByRole('radio', { name })).toBeTruthy();
    }
  });

  it('applies choices to <html> and records only non-defaults in the URL', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const html = document.documentElement;
    expect(html.dataset.theme).toBe('light'); // jsdom has no OS preference, so "system" resolves to light
    await user.click(screen.getByRole('button', { name: /Display/ }));
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.click(screen.getByRole('radio', { name: 'Large' }));
    await user.click(screen.getByRole('radio', { name: 'Compact' }));
    await user.click(screen.getByRole('radio', { name: 'Plain HTML' }));
    await user.click(screen.getByRole('radio', { name: 'JSON' }));
    expect(html.dataset.theme).toBe('dark');
    expect(html.dataset.size).toBe('large');
    expect(html.dataset.density).toBe('compact');
    expect(html.dataset.skin).toBe('plain');
    expect(window.location.search).toBe('?theme=dark&size=large&density=compact&skin=plain&format=json');
    await user.click(screen.getByRole('radio', { name: 'Normal' }));
    expect(window.location.search).toBe('?theme=dark&density=compact&skin=plain&format=json');
  });

  it('starts from the URL, so a link reproduces a view', () => {
    window.history.replaceState(null, '', '/?theme=dark&size=xlarge');
    render(<Harness />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.size).toBe('xlarge');
  });

  it('closes with Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: /Display/ });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
