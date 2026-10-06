import type { ParseIssue } from '@beneficial-strategies/iso20022-serialize';
import { useI18n, type UiKey } from '@beneficial-strategies/iso20022-react-ui';
import type { PasteError } from './paste.ts';

/** Where the text came from: the clipboard (Paste) or a file the user chose (Load file). */
export type TextSource = { kind: 'clipboard' } | { kind: 'file'; name: string };

/** The outcome of the last paste or file load, shown until dismissed. */
export type PasteReportData =
  | { kind: 'error'; error: PasteError; source: TextSource }
  | { kind: 'done'; format: 'xml' | 'json'; issues: ParseIssue[]; source: TextSource; /** The message that was loaded instead of the selected one. */ switchedTo?: string };

type T = (key: UiKey, params?: Record<string, string | number | undefined>) => string;

/** One sentence saying why nothing was pasted or loaded. */
export function describePasteError(t: T, e: PasteError, source: TextSource = { kind: 'clipboard' }): string {
  if (source.kind === 'file' && (e.code === 'empty' || e.code === 'not_xml_or_json')) return t(`fileError_${e.code}`);
  switch (e.code) {
    case 'file_unreadable':
      return t('fileError_unreadable');
    case 'file_too_large':
      return t('fileError_too_large');
    case 'unknown_namespace':
      return t('pasteError_unknown_namespace', { namespace: e.namespace });
    case 'whole_message_for_part':
      return t('pasteError_whole_message_for_part', { typeName: e.typeName });
    case 'fragment_mismatch':
      return t('pasteError_fragment_mismatch', { found: e.found, typeName: e.typeName });
    case 'parse': {
      const i = e.issue;
      if (i.code === 'xml_syntax' || i.code === 'json_syntax') return t(`pasteError_${i.code}`, { detail: i.detail ?? '' });
      if (i.code === 'wrong_root' || i.code === 'wrong_body') return t(`pasteError_${i.code}`, { expected: e.expected ?? '?', found: i.detail || '(none)' });
      if (i.code === 'not_json_object') return t('pasteError_not_json_object');
      return t('pasteFailed');
    }
    default:
      return t(`pasteError_${e.code}`);
  }
}

/** One sentence about something that could not be placed. */
export function describePasteIssue(t: T, i: ParseIssue): string {
  const params = { path: i.path === '' ? '(top)' : i.path, detail: i.detail ?? '' };
  switch (i.code) {
    case 'unknown_element':
    case 'duplicate_element':
    case 'multiple_choices':
    case 'unexpected_text':
    case 'unexpected_element':
      return t(`pasteIssue_${i.code}`, params);
    default:
      return `${i.code}: ${i.detail ?? ''}`;
  }
}

const SHOWN = 6;

export function PasteReport({ report, onDismiss }: { report: PasteReportData; onDismiss: () => void }) {
  const { t } = useI18n();
  const failed = report.kind === 'error';
  const issues = report.kind === 'done' ? report.issues : [];
  const tone = failed ? 'border-danger-line bg-danger-soft text-danger' : issues.length > 0 ? 'border-warn-line bg-warn-soft text-warn-fg' : 'border-ok bg-ok-soft text-ok-fg';
  return (
    <div className={`mb-2 flex items-start gap-2 rounded border px-3 py-2 text-xs ${tone}`} role={failed ? 'alert' : 'status'} data-paste-report={failed ? 'error' : 'done'}>
      <div className="min-w-0 flex-1">
        {report.kind === 'error' ? (
          <>
            <p className="font-semibold">{t(report.source.kind === 'file' ? 'fileFailed' : 'pasteFailed')}</p>
            <p>{describePasteError(t, report.error, report.source)}</p>
          </>
        ) : (
          <>
            {report.switchedTo ? <p className="font-semibold">{t('pasteSwitched', { message: report.switchedTo })}</p> : null}
            <p className={report.switchedTo ? '' : 'font-semibold'}>
              {report.source.kind === 'file'
                ? issues.length > 0
                  ? t('fileDoneIssues', { format: report.format.toUpperCase(), name: report.source.name, n: issues.length })
                  : t('fileDone', { format: report.format.toUpperCase(), name: report.source.name })
                : issues.length > 0
                  ? t('pasteDoneIssues', { format: report.format.toUpperCase(), n: issues.length })
                  : t('pasteDone', { format: report.format.toUpperCase() })}
            </p>
            {issues.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {issues.slice(0, SHOWN).map((i, n) => (
                  <li key={n}>{describePasteIssue(t, i)}</li>
                ))}
                {issues.length > SHOWN ? <li>{t('pasteMoreIssues', { n: issues.length - SHOWN })}</li> : null}
              </ul>
            ) : null}
          </>
        )}
      </div>
      <button type="button" className="shrink-0 rounded border border-current px-2 py-0.5 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-focus" onClick={onDismiss}>
        {t('pasteDismiss')}
      </button>
    </div>
  );
}
