import { paragraphs } from '../Info.tsx';
import { useI18n } from '../i18n/context.tsx';
import type { Skin } from './types.ts';

const paras = paragraphs;

/**
 * No classes and no CSS of its own: bare semantic HTML (fieldset, legend, label, input, native
 * select, details). The browser's default styles and the page's color-scheme do all the work.
 * Same form logic, same ARIA values, completely different markup.
 */
export const plainSkin: Skin = {
  id: 'plain',
  label: 'Plain HTML',
  description: 'Unstyled semantic HTML: fieldset, label, native select, details. Browser defaults only.',
  Stack: ({ children }) => <div>{children}</div>,
  Group: function Group({ title, required, info, error, children }) {
    const { t } = useI18n();
    return (
      <fieldset>
        <legend>
          {title}
          {required ? ` ${t('required')}` : ''} {info}
        </legend>
        {children}
        {error}
      </fieldset>
    );
  },
  ChoiceBox: ({ children }) => <blockquote>{children}</blockquote>,
  Field: function Field({ id, label, required, info, error, children }) {
    const { t } = useI18n();
    return (
      <p>
        <label htmlFor={id}>
          {label}
          {required ? ` ${t('required')}` : ''}
        </label>{' '}
        {info}
        <br />
        {children}
        {error}
      </p>
    );
  },
  Row: ({ children }) => <span>{children}</span>,
  Text: ({ field, type = 'text', maxLength, placeholder, inputMode, ariaLabel, multiline }) =>
    multiline ? (
      <textarea {...field} rows={2} placeholder={placeholder} aria-label={ariaLabel} />
    ) : (
      <input {...field} type={type} maxLength={maxLength} placeholder={placeholder} inputMode={inputMode} aria-label={ariaLabel} />
    ),
  Select: function Select({ id, value, options, onChange, onBlur, invalid, required, describedBy }) {
    const { t } = useI18n();
    const selected = options.find((o) => o.value === value);
    const hintId = `${id}-opt`;
    return (
      <>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          aria-describedby={[describedBy, selected?.description ? hintId : ''].filter(Boolean).join(' ') || undefined}
        >
          <option value="">{t('select')}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} title={o.description ? paras(o.description).join(' ') : undefined}>
              {o.label}
            </option>
          ))}
        </select>
        {selected?.description ? (
          <small id={hintId}>
            <br />
            {paras(selected.description).join(' ')}
          </small>
        ) : null}
      </>
    );
  },
  Button: ({ children, onClick, disabled, ariaLabel }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Hint: ({ id, children }) => (
    <small id={id}>
      <br />
      {children}
    </small>
  ),
  Error: function Error({ id, children }) {
    const { t } = useI18n();
    return (
      <strong id={id} role="alert">
        <br />
        {t('errorPrefix')} {children}
      </strong>
    );
  },
  Toggle: function Toggle({ id, checked, onChange, label, info }) {
    const { t } = useI18n();
    return (
      <p>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}> {t('include', { label })} {t('optional')}</label> {info}
      </p>
    );
  },
  ListHeader: ({ title, info, caption, action }) => (
    <p>
      <b>{title}</b> ({caption}) {info} {action}
    </p>
  ),
  ListItem: function ListItem({ removeLabel, onRemove, children }) {
    const { t } = useI18n();
    return (
      <div>
        {children}
        <button type="button" aria-label={removeLabel} onClick={onRemove}>
          {t('remove')}
        </button>
        <hr />
      </div>
    );
  },
  Info: function Info({ def, label }) {
    const { t, lang } = useI18n();
    if (!def) return null;
    return (
      <details style={{ display: 'inline' }}>
        <summary aria-label={t('aboutLabel', { label })} style={{ display: 'inline', cursor: 'pointer' }}>
          ?
        </summary>
        {paras(def.text).map((p, i) => (
          <small key={i}>
            <br />
            {p}
          </small>
        ))}
        {def.lang !== lang ? (
          <small lang={def.lang}>
            <br />
            {t('englishNote')}
          </small>
        ) : def.status === 'machine' ? (
          <small>
            <br />
            {t('machineNote')}
          </small>
        ) : null}
      </details>
    );
  },
};
