/**
 * C2CForm — the governed data-entry drawer (kit app/data-entry.jsx).
 *
 * A right-side panel built from a typed field schema
 * (text / textarea / select / seg / date / number / password), with
 * required-field validation and an optional Part 11 governed note.
 * 15 kit surfaces mount this via `window.C2CForm`; on port they import
 * it directly.
 */
import React from 'react';
import { registerCeremonyOpen } from './ceremony';
import { I } from './icons';
import { useDialog } from './useDialog';

export interface C2CFormFieldOption {
  value: string;
  label: string;
}

export interface C2CFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'seg' | 'date' | 'number' | 'password';
  placeholder?: string;
  required?: boolean;
  options?: (string | C2CFormFieldOption)[];
  rows?: number;
  min?: number;
  max?: number;
  half?: boolean;
  desc?: string;
  default?: string;
}

export interface C2CFormConfig {
  eyebrow?: string;
  title: string;
  sub?: string;
  governed?: string | boolean;
  submitLabel?: string;
  fields: C2CFormField[];
}

export interface C2CFormProps {
  config: C2CFormConfig;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

export function C2CForm({ config, onCancel, onSubmit }: C2CFormProps) {
  const { eyebrow, title, sub, fields = [], submitLabel = 'Save', governed } = config;

  /**
   * Every control needs an id so its `<label>` can point at it.
   *
   * The labels here were plain `<label className="de-label">` wrappers with no
   * `htmlFor`, and the inputs had no `id` and no `aria-label`. That means a
   * screen reader announced "edit text, blank" for every field of a governed
   * record — a scientist working this drawer non-visually could not tell the
   * release limit from the shelf-life limit — and clicking a label did not focus
   * its input. `useId` gives each mount a unique prefix so two drawers, or a
   * drawer and the surface behind it, never collide on an id.
   */
  const uid = React.useId();
  const fieldId = (key: string) => `${uid}-${key}`;
  const labelId = (key: string) => `${uid}-${key}-label`;
  const descId = (key: string) => `${uid}-${key}-desc`;

  const [v, setV] = React.useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of fields) {
      if (f.default != null) {
        o[f.key] = f.default;
      } else if (f.type === 'seg' && f.options?.length) {
        const first = f.options[0];
        o[f.key] = typeof first === 'string' ? first : first.value;
      } else {
        o[f.key] = '';
      }
    }
    return o;
  });
  const [err, setErr] = React.useState('');
  /* The fields a failed submit found empty: each is marked aria-invalid and
     described by the error message, so the error is tied to the control
     (WCAG 3.3.1) rather than being a summary the user must go and find. */
  const [invalidKeys, setInvalidKeys] = React.useState<ReadonlySet<string>>(() => new Set());
  const errId = `${uid}-error`;

  const set = (k: string, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    if (err) setErr('');
    if (invalidKeys.size) setInvalidKeys(new Set());
  };

  const missing = () => fields.filter((f) => f.required && !String(v[f.key] ?? '').trim());

  const submit = () => {
    const m = missing();
    if (m.length) {
      setErr(
        'Complete the required field' +
          (m.length > 1 ? 's' : '') +
          ': ' +
          m.map((f) => f.label).join(', '),
      );
      setInvalidKeys(new Set(m.map((f) => f.key)));
      return;
    }
    onSubmit(v);
  };

  /* Focus hand-off + Escape via the repo's shared dialog hook: focus moves
     into the panel on open and back to the opener on close (WCAG 2.4.3). The
     drawer used to handle Escape itself and never moved focus at all, so a
     keyboard user opening "Record identifiers" was left focused on the page
     behind the overlay. */
  const panelRef = useDialog(onCancel);

  // The ceremony channel: while this form is mounted, AnA's surface actions
  // can refuse view changes that would disturb it (see v2/ceremony.ts).
  React.useEffect(() => registerCeremonyOpen(), []);

  const renderField = (f: C2CFormField) => {
    const common = {
      id: fieldId(f.key),
      className:
        f.type === 'textarea' ? 'de-textarea' : f.type === 'select' ? 'de-select' : 'de-input',
      value: v[f.key],
      'aria-required': f.required || undefined,
      'aria-invalid': invalidKeys.has(f.key) || undefined,
      'aria-describedby':
        [f.desc ? descId(f.key) : null, invalidKeys.has(f.key) ? errId : null].filter(Boolean).join(' ') || undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        set(f.key, e.target.value),
    };

    if (f.type === 'select') {
      return (
        <select {...common} className="de-select">
          <option value="">Select…</option>
          {(f.options ?? []).map((o) => {
            const val = typeof o === 'object' ? o.value : o;
            const lab = typeof o === 'object' ? o.label : o;
            return (
              <option key={val} value={val}>
                {lab}
              </option>
            );
          })}
        </select>
      );
    }
    if (f.type === 'textarea') {
      return (
        <textarea {...common} rows={f.rows ?? 3} placeholder={f.placeholder ?? ''} />
      );
    }
    if (f.type === 'seg') {
      /* A segmented control is a single choice made of buttons, so it carries
         radiogroup semantics: the group is named by the field's label and each
         option reports whether it is the one selected. Without `aria-checked` a
         screen reader announces three identical buttons and never says which
         disposition is currently chosen. */
      return (
        <div className="de-seg" role="radiogroup" aria-labelledby={labelId(f.key)}>
          {(f.options ?? []).map((o) => {
            const val = typeof o === 'string' ? o : o.value;
            const lab = typeof o === 'string' ? o : o.label;
            return (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={v[f.key] === val}
                className="de-seg-opt"
                data-on={v[f.key] === val || undefined}
                onClick={() => set(f.key, val)}
              >
                {lab}
              </button>
            );
          })}
        </div>
      );
    }
    if (f.type === 'date') return <input {...common} type="date" />;
    if (f.type === 'password')
      return <input {...common} type="password" placeholder={f.placeholder ?? ''} autoComplete="off" />;
    if (f.type === 'number')
      return <input {...common} type="number" min={f.min} max={f.max} placeholder={f.placeholder ?? ''} />;
    return <input {...common} type="text" placeholder={f.placeholder ?? ''} />;
  };

  return (
    <div className="de-bd" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="de" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panelRef}>
        <div className="de-h">
          <div>
            {eyebrow && <div className="de-h-eye">{eyebrow}</div>}
            <div className="de-h-t">{title}</div>
            {sub && <div className="de-h-s">{sub}</div>}
          </div>
          <button className="de-x" onClick={onCancel} aria-label="Close">
            {I.close}
          </button>
        </div>
        <div className="de-body">
          {fields.map((f) => (
            <div key={f.key} className={'de-field' + (f.half ? ' half' : '')}>
              {/* A seg is a radiogroup, not a labellable control, so its label
                  is referenced by id rather than pointing at an input. The
                  required marker is decorative — `aria-required` on the control
                  already carries it — so it is hidden from the accessible name
                  instead of turning every field into "Method code star". */}
              <label
                className="de-label"
                id={labelId(f.key)}
                {...(f.type === 'seg' ? {} : { htmlFor: fieldId(f.key) })}
              >
                {f.label}
                {f.required && <span className="req" aria-hidden="true">*</span>}
              </label>
              {f.desc && <div className="de-desc" id={descId(f.key)}>{f.desc}</div>}
              {renderField(f)}
            </div>
          ))}
          {governed && (
            <div className="de-gov">
              <span className="ico">{I.lock}</span>
              <span className="de-gov-t">
                {typeof governed === 'string'
                  ? governed
                  : 'This is a governed record — saving writes an audit entry and may require your e-signature per 21 CFR §11.'}
              </span>
            </div>
          )}
          {err && <div className="de-err" id={errId} role="alert">{err}</div>}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="de-btn primary" onClick={submit}>
            {governed ? I.lock : I.check} {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
