import { useEffect, useRef } from 'react';
import { useI18n, type UiKey } from '@beneficial-strategies/iso20022-react-ui';

const LOGO = 'https://beneficialstrategies.com/img/Beneficial%20Strategies%20Logo.svg';
const HOME = 'https://beneficialstrategies.com';

/**
 * The banner of the demos: the Beneficial Strategies logo (a link to its home page, in a new window) on the left, the
 * title of the tool centered in the largest text on the page, and a big question mark on the right that opens the
 * "about" window. The title is centered on the page itself, not just between the two; on a screen narrower than 1024px it moves to its own line under the logo and the question mark. The logo artwork is for light backgrounds, so it sits on
 * a white tile; the bar itself follows the page's light or dark theme.
 */
export function Banner({ onAbout }: { onAbout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="-mx-4 -mt-4 mb-3 grid grid-cols-2 items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-2 shadow-sm lg:grid-cols-[1fr_auto_1fr]">
      <a
        href={HOME}
        target="_blank"
        rel="noopener noreferrer"
        title={t('logoLink')}
        aria-label={t('logoLink')}
        className="justify-self-start rounded bg-white px-2 py-1 focus-visible:ring-2 focus-visible:ring-focus"
      >
        <img src={LOGO} alt={t('logoAlt')} className="block h-9 w-auto" />
      </a>
      <h1 className="col-span-2 row-start-2 text-center text-3xl font-bold tracking-tight text-fg lg:col-span-1 lg:col-start-2 lg:row-start-1">{t('bannerTitle')}</h1>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t('aboutOpen')}
        title={t('aboutOpen')}
        onClick={onAbout}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-self-end justify-center rounded-full bg-accent text-2xl font-bold leading-none text-accent-fg shadow hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus"
      >
        ?
      </button>
    </div>
  );
}

const SECTIONS = [
  ['aboutExploreTitle', 'aboutExploreBody'],
  ['aboutCreateTitle', 'aboutCreateBody'],
  ['aboutSaveTitle', 'aboutSaveBody'],
  ['aboutIllustrateTitle', 'aboutIllustrateBody'],
  ['aboutBuildTitle', 'aboutBuildBody'],
] as const;

/** What this tool is good for, in plain language: exploring comes first, building your own comes last. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    if (d && !d.showModal) d.setAttribute('open', '');
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="about-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto max-h-[90vh] w-[min(46rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50"
    >
      <div className="max-h-[90vh] overflow-auto">
        <div className="bg-linear-to-r from-bar-from to-bar-to px-6 py-5 text-bar-fg">
          <h2 id="about-title" className="text-2xl font-bold tracking-tight">
            {t('aboutTitle')}
          </h2>
          <p className="mt-1 text-sm text-bar-muted">{t('aboutIntro')}</p>
        </div>
        <ol className="space-y-4 px-6 py-5">
          {SECTIONS.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{t(title as UiKey)}</h3>
                <p className="text-sm text-muted">{t(body as UiKey)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-alt px-6 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted">{t('aboutFootnote')}</p>
          <button
            type="button"
            className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => dialog.current?.close()}
          >
            {t('aboutStart')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
