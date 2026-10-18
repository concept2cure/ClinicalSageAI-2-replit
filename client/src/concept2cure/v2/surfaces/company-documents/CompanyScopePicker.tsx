import React, { useState } from 'react';
import { COMPANY_SCOPE_CATALOG, normalizeCompanyScope, type CompanyScopeKind } from '@shared/company-legal-workflows';

function scopeOptions(kind: CompanyScopeKind): Array<{ value: string; label: string }> {
  if (kind === 'agency') return COMPANY_SCOPE_CATALOG.agencies;
  return kind === 'country' ? COMPANY_SCOPE_CATALOG.countries : COMPANY_SCOPE_CATALOG.submissionTypes;
}
const valuesOf = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);

export function CompanyScopePicker({ label, kind, value, onChange }: {
  label: string; kind: CompanyScopeKind; value: string; onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const options = scopeOptions(kind);
  const chosen = valuesOf(value).map(item => normalizeCompanyScope(item, kind) ?? item);
  const visible = options.filter(option => `${option.label} ${option.value}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const unknown = chosen.filter(item => !options.some(option => option.value === item));
  const toggle = (option: string, checked: boolean) => onChange((checked ? Array.from(new Set([...chosen, option])) : chosen.filter(item => item !== option)).join(', '));
  return <fieldset className="company-scope-picker company-wide"><legend>{label}</legend>
    <label className="company-field"><span>Search {label.toLowerCase()}</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Find ${label.toLowerCase()} by name or code`} /></label>
    <p className="company-hint">{chosen.length ? `${chosen.length} selected: ${chosen.join(', ')}` : 'Unrestricted applicability: no scope selected.'} Selection records company intent and does not establish agency acceptance.</p>
    {unknown.length > 0 && <p className="company-notice">Unrecognized saved scope: {unknown.join(', ')}. Choose a canonical value or clear the scope before saving.</p>}
    <div className="company-scope-options">{visible.slice(0, 20).map(option => <label className="company-check" key={option.value}><input type="checkbox" checked={chosen.includes(option.value)} onChange={e => toggle(option.value, e.target.checked)} />{option.label}</label>)}</div>
    {visible.length === 0 && <p className="company-hint">No canonical {label.toLowerCase()} match this search.</p>}
    {visible.length > 20 && <p className="company-hint">Showing the first 20 of {visible.length} options. Refine the search to find another option.</p>}
    <button type="button" className="btn ghost small" disabled={chosen.length === 0} onClick={() => onChange('')}>Clear {label.toLowerCase()} scope</button>
  </fieldset>;
}
