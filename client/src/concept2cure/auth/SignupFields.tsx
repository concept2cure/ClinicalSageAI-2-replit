/**
 * Sign-up's text field and select, split out of ZenSignup.tsx (2026-11-10).
 *
 * They are declared here, at module level, on purpose. Declared inside the page component they were a new component
 * type on every render, so React remounted the field on each key press and focus fell to the page: "Avery" left "A"
 * (client administration walk, docs/evidence/F1/2026-11-10-client-admin/, W1-01 and A11Y-01). Pasting and autofill
 * set the value in one event, so they hid it.
 *
 * Each field owns nothing: the value, the refusal and the change come from the page. A refusal is tied to its field
 * (aria-invalid, aria-describedby), and focus is shown by a ring, not by a faint change of border colour alone.
 */
import React from 'react';

const FIELD_BASE = 'w-full px-4 py-3 text-base border rounded-xl transition-all duration-150 outline-none '
  + 'focus-visible:ring-2 focus-visible:ring-offset-1';
const FIELD_OK = 'border-stone-300 bg-white focus:border-stone-500 focus-visible:ring-stone-500';
const FIELD_REFUSED = 'border-red-500 bg-red-50 focus:border-red-600 focus-visible:ring-red-600';

const fieldClass = (refused: boolean, extra = '') =>
  [FIELD_BASE, extra, refused ? FIELD_REFUSED : FIELD_OK].filter(Boolean).join(' ');

/** What ties a refusal to its field; nothing at all while nothing is refused. */
function refusalProps(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};
}

function Refusal({ id, error }: { id: string; error: string | undefined }) {
  if (!error) return null;
  return <p id={`${id}-error`} className="text-sm text-red-700">{error}</p>;
}

export interface SignupFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

export function SignupInput({ id, label, value, error, onChange, type = 'text', placeholder, autoComplete }:
  SignupFieldProps & { type?: string; placeholder?: string; autoComplete?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={fieldClass(Boolean(error))}
        {...refusalProps(id, error)}
      />
      <Refusal id={id} error={error} />
    </div>
  );
}

const CHEVRON = `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`;

export function SignupSelect({ id, label, value, error, onChange, options, placeholder }:
  SignupFieldProps & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={fieldClass(Boolean(error), 'appearance-none')}
        style={{ backgroundImage: CHEVRON, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
        {...refusalProps(id, error)}
      >
        <option value="">{placeholder || 'Select...'}</option>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <Refusal id={id} error={error} />
    </div>
  );
}
