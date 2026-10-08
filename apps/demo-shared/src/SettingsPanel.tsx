import { useEffect, useId, useRef, useState } from 'react';
import { LANGUAGE_NAMES, Popup, type Skin, type UiKey } from '@beneficial-strategies/iso20022-react-ui';
import { DENSITIES, FORMATS, SIZES, THEMES, type Settings } from './settings.ts';
import { usePageText, type PageKey } from './text/messages.ts';

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

/** Where a wording problem is reported: a prefilled GitHub issue naming the language, so a fix can be found and made. */
const ISSUES_URL = 'https://github.com/Beneficial-Strategies/Iso20022Headless/issues/new';
export function wordingIssueUrl(locale: string, pageUrl: string): string {
  const body = `Language: ${locale}\nPage: ${pageUrl}\n\nWhat reads wrongly, and what it should say:\n\n`;
  return `${ISSUES_URL}?${new URLSearchParams({ title: `Wording (${locale}): `, body, labels: 'translation' }).toString()}`;
}

/** The language choice is a dropdown, so adding languages never crowds the dialog. */
function LanguageSelect({ value, locales, onChange, locale }: { value: string; locales: readonly string[]; onChange: (v: string) => void; locale: string }) {
  const { t } = usePageText();
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-fg">
        {t('language')}
      </label>
      <select id={id} className="w-full rounded border border-edge bg-surface px-2 py-1 text-sm text-fg focus-visible:ring-2 focus-visible:ring-focus" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="auto">{t('lang_auto')}</option>
        {locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANGUAGE_NAMES[l] ?? l}
          </option>
        ))}
      </select>
      <a className="mt-1 inline-block text-xs text-accent underline hover:no-underline" href={wordingIssueUrl(locale, typeof window === 'undefined' ? '' : window.location.href)} target="_blank" rel="noreferrer">
        {t('reportWording')}
      </a>
    </div>
  );
}

/** "Display" button + dialog. Settings are plain radio groups, so they work by keyboard and on touch. */
export function SettingsPanel({
  settings,
  skins,
  locales,
  locale,
  onChange,
}: {
  settings: Settings;
  skins: readonly Skin[];
  /** Locale tags offered in the Language group (besides "automatic"). */
  locales: readonly string[];
  /** The language in use now (after resolving "automatic"). */
  locale: string;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const { t } = usePageText();
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
  const skinLabel = (s: Skin) => t(`skin_${s.id}` as PageKey) || s.label;
  const named = (k: string) => t(k as PageKey);
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
          <LanguageSelect value={settings.lang} locales={locales} onChange={(v) => onChange({ lang: v })} locale={locale} />
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
            hint={skin ? t(`skin_${skin.id}_desc` as PageKey) || skin.description : undefined}
          />
          <p className="text-xs text-muted">{t('settingsNote')}</p>
        </Popup>
      ) : null}
    </div>
  );
}
