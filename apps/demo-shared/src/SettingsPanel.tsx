import { useEffect, useId, useRef, useState } from 'react';
import { DENSITIES, SIZES, THEMES, type Settings } from './settings.ts';
import type { Skin } from './skin/types.ts';

const LABELS: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  normal: 'Normal',
  large: 'Large',
  xlarge: 'Extra large',
  comfortable: 'Comfortable',
  compact: 'Compact',
};

function Radios({ legend, name, options, value, onChange, hint }: { legend: string; name: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <fieldset className="mb-3">
      <legend className="mb-1 text-xs font-semibold text-fg">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1 text-sm text-fg">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </fieldset>
  );
}

/** "Display" button + dialog. Settings are plain radio groups, so they work by keyboard and on touch. */
export function SettingsPanel({ settings, skins, onChange }: { settings: Settings; skins: readonly Skin[]; onChange: (patch: Partial<Settings>) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const skin = skins.find((s) => s.id === settings.skin);
  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="rounded border border-edge bg-surface px-3 py-1.5 text-sm text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => setOpen((o) => !o)}
      >
        Display ▾
      </button>
      {open ? (
        <div id={id} role="dialog" aria-label="Display settings" className="absolute right-0 z-40 mt-1 w-[min(26rem,92vw)] rounded border border-edge bg-surface p-3 shadow-lg">
          <Radios legend="Theme" name="theme" value={settings.theme} onChange={(v) => onChange({ theme: v as Settings['theme'] })} options={THEMES.map((v) => ({ value: v, label: LABELS[v]! }))} hint="System follows your operating system setting." />
          <Radios legend="Text size" name="size" value={settings.size} onChange={(v) => onChange({ size: v as Settings['size'] })} options={SIZES.map((v) => ({ value: v, label: LABELS[v]! }))} />
          <Radios legend="Density" name="density" value={settings.density} onChange={(v) => onChange({ density: v as Settings['density'] })} options={DENSITIES.map((v) => ({ value: v, label: LABELS[v]! }))} />
          <Radios
            legend="Form skin (the headless part)"
            name="skin"
            value={settings.skin}
            onChange={(v) => onChange({ skin: v })}
            options={skins.map((s) => ({ value: s.id, label: s.label }))}
            hint={skin?.description}
          />
          <p className="text-xs text-muted">Settings are kept in the page address, so a link reproduces this view.</p>
        </div>
      ) : null}
    </div>
  );
}
