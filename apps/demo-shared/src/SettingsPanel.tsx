import { useEffect, useId, useRef, useState } from 'react';
import { Popup } from './Popup.tsx';
import { useI18n } from './i18n/context.tsx';
import { LANGUAGE_NAMES, type UiKey } from './i18n/messages.ts';
import { DENSITIES, FORMATS, SIZES, THEMES, type Settings } from './settings.ts';
import type { Skin } from './skin/types.ts';

function Radios({ legend, name, options, value, onChange, hint }: { legend: string; name: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; hint?: string | undefined }) {
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
export function SettingsPanel({
  settings,
  skins,
  locales,
  onChange,
}: {
  settings: Settings;
  skins: readonly Skin[];
  /** Locale tags offered in the Language group (besides "automatic"). */
  locales: readonly string[];
  onChange: (patch: Partial<Settings>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (root.current && !root.current.contains(t) && !popup.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const skin = skins.find((s) => s.id === settings.skin);
  const skinLabel = (s: Skin) => t(`skin_${s.id}` as UiKey) || s.label;
  const named = (k: string) => t(k as UiKey);
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
        className="whitespace-nowrap rounded border border-edge bg-surface px-3 py-1.5 text-sm text-fg hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => setOpen((o) => !o)}
      >
        {t('display')}
      </button>
      {open ? (
        <Popup ref={popup} anchor={button.current} id={id} role="dialog" label={t('displayDialog')} width={416} align="end" className="rounded border border-edge bg-surface p-3 shadow-lg">
          <Radios legend={t('language')} name="lang" value={settings.lang} onChange={(v) => onChange({ lang: v })} options={[{ value: 'auto', label: t('lang_auto') }, ...locales.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] ?? l }))]} />
          <Radios legend={t('outputFormat')} name="format" value={settings.format} onChange={(v) => onChange({ format: v as Settings['format'] })} options={FORMATS.map((v) => ({ value: v, label: named(`format_${v}`) }))} hint={settings.format === 'json' ? t('formatHint') : undefined} />
          <Radios legend={t('theme')} name="theme" value={settings.theme} onChange={(v) => onChange({ theme: v as Settings['theme'] })} options={THEMES.map((v) => ({ value: v, label: named(`theme_${v}`) }))} hint={t('themeHint')} />
          <Radios legend={t('textSize')} name="size" value={settings.size} onChange={(v) => onChange({ size: v as Settings['size'] })} options={SIZES.map((v) => ({ value: v, label: named(`size_${v}`) }))} />
          <Radios legend={t('density')} name="density" value={settings.density} onChange={(v) => onChange({ density: v as Settings['density'] })} options={DENSITIES.map((v) => ({ value: v, label: named(`density_${v}`) }))} />
          <Radios
            legend={t('skinLegend')}
            name="skin"
            value={settings.skin}
            onChange={(v) => onChange({ skin: v })}
            options={skins.map((s) => ({ value: s.id, label: skinLabel(s) }))}
            hint={skin ? t(`skin_${skin.id}_desc` as UiKey) || skin.description : undefined}
          />
          <p className="text-xs text-muted">{t('settingsNote')}</p>
        </Popup>
      ) : null}
    </div>
  );
}
