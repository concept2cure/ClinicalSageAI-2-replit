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
import { I } from './icons';

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

  const set = (k: string, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    if (err) setErr('');
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
      return;
    }
    onSubmit(v);
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const renderField = (f: C2CFormField) => {
    const common = {
      className:
        f.type === 'textarea' ? 'de-textarea' : f.type === 'select' ? 'de-select' : 'de-input',
      value: v[f.key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        set(f.key, e.target.value),
    };

    if (f.type === 'select') {
      return (
        <select className="de-select" value={v[f.key]} onChange={(e) => set(f.key, e.target.value)}>
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
      return (
        <div className="de-seg">
          {(f.options ?? []).map((o) => {
            const val = typeof o === 'string' ? o : o.value;
            const lab = typeof o === 'string' ? o : o.label;
            return (
              <button
                key={val}
                type="button"
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
      <div className="de" role="dialog" aria-label={title}>
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
              <label className="de-label">
                {f.label}
                {f.required && <span className="req">*</span>}
              </label>
              {f.desc && <div className="de-desc">{f.desc}</div>}
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
          {err && <div className="de-err">{err}</div>}
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
