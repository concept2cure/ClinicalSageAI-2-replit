import React, { useRef } from 'react';
import type { C2CFormFieldControl } from '../C2CForm';
import type { RecordedTemplateFilingContext } from '@shared/authoring/recorded-template-source';

/** Display/search metadata already returned by GET /api/authoring/templates. */
export interface AuthoringTemplate {
  id: string | number;
  name?: string | null;
  title?: string | null;
  template_name?: string | null;
  module?: string | null;
  description?: string | null;
  template_type?: string | null;
  category?: string | null;
  regions?: string[];
  entryId?: string;
  kind?: string;
  authoringMode?: string;
  originalFormat?: string;
  families?: string[];
  limitations?: string[];
  filingContext?: RecordedTemplateFilingContext;
}
export type TemplateCatalogState = 'loading' | 'ok' | 'unavailable' | 'failed';
export const BLANK_DOCUMENT = '(blank document)';

export function templateLabel(template: AuthoringTemplate): string {
  return String(template.name ?? template.title ?? 'Template ' + template.id);
}

function searchableMetadata(template: AuthoringTemplate): string {
  return [template.name, template.title, template.template_name, template.module, template.description,
    template.template_type, template.category, ...(template.regions ?? []), template.entryId, template.kind,
    template.authoringMode, template.originalFormat, ...(template.families ?? []), ...(template.limitations ?? []),
    template.filingContext?.registryId, template.filingContext?.region, template.filingContext?.agency]
    .filter(value => typeof value === 'string').join(' ').toLowerCase();
}

function catalogMessage(catalog: TemplateCatalogState, assembly: boolean): string | null {
  if (catalog === 'loading') return assembly ? 'Loading templates…' : 'Loading templates… A blank document is available.';
  if (catalog === 'failed') return assembly
    ? 'The template list didn’t load. Retry the template list before choosing a template.'
    : 'The template list didn’t load. Only a blank document can be started right now.';
  return null;
}

function TemplateSearchResults({ templates, matches, retained, catalog, query, assembly }: {
  templates: AuthoringTemplate[]; matches: AuthoringTemplate[]; retained?: AuthoringTemplate;
  catalog: TemplateCatalogState; query: string; assembly: boolean;
}) {
  const message = catalogMessage(catalog, assembly);
  if (message) return <>{message}</>;
  const noun = templates.length === 1 ? 'template' : 'templates';
  return <>
    <div>{matches.length} of {templates.length} {catalog === 'unavailable' ? 'loaded ' : ''}{noun}</div>
    {templates.length === 0
      ? <div>{catalog === 'unavailable' ? 'No loaded templates are available.' : 'No templates are available.'}{!assembly && ' Start with a blank document.'}</div>
      : matches.length === 0 && <div>No templates match “{query.trim()}”. {assembly
        ? 'Clear search to browse the loaded templates.'
        : 'Clear search to browse the loaded templates or choose a blank document.'}</div>}
    {retained && <div>Current selection is kept: {templateLabel(retained)}.</div>}
  </>;
}

/** Search filters the existing native picker without replacing its selection. */
export function AuthoringTemplatePicker({ templates, catalog, query, onQueryChange, control, purpose = 'create', disabled = false }: {
  templates: AuthoringTemplate[];
  catalog: TemplateCatalogState;
  query: string;
  onQueryChange: (query: string) => void;
  control: C2CFormFieldControl;
  purpose?: 'create' | 'assembly';
  disabled?: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLowerCase();
  const matches = normalized ? templates.filter(template => searchableMetadata(template).includes(normalized)) : templates;
  const selected = templates.find(template => String(template.id) === control.value);
  const retained = selected && !matches.includes(selected) ? selected : undefined;
  const statusId = `${control.id}-results`;
  const hintId = `${control.id}-search-hint`;
  const searchId = `${control.id}-search`;
  const loaded = catalog !== 'loading' && catalog !== 'failed';
  const assembly = purpose === 'assembly';
  const searchDisabled = disabled || !loaded;

  return <>
    <label className="de-label" htmlFor={searchId}>Search templates</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
      <input id={searchId} ref={searchRef} className="de-input" type="search" value={query}
        style={{ minWidth: 0, flex: 1 }}
        placeholder="Search titles and template details" disabled={searchDisabled}
        aria-controls={control.id} aria-describedby={`${hintId} ${statusId}`}
        onChange={event => onQueryChange(event.target.value)} />
      <button type="button" className="btn ghost" aria-label="Clear template search" disabled={searchDisabled || !query}
        onClick={() => { onQueryChange(''); searchRef.current?.focus(); }}>Clear</button>
    </div>
    <p className="de-desc" id={hintId}>Search titles, descriptions, types, categories, regions and recorded template details.</p>
    <div className="de-desc" id={statusId} role={catalog === 'failed' ? 'alert' : 'status'}>
      <TemplateSearchResults templates={templates} matches={matches} retained={retained} catalog={catalog} query={query} assembly={assembly} />
    </div>
    <select id={control.id} className="de-select" value={control.value} aria-required={control.required}
      disabled={assembly ? searchDisabled : disabled}
      style={assembly ? { width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' } : undefined}
      aria-invalid={control.invalid} aria-describedby={[control.describedBy, statusId].filter(Boolean).join(' ')}
      onChange={event => control.onChange(event.target.value)}>
      <option value="">{assembly ? 'Choose a template' : 'Select…'}</option>
      {!assembly && <option value={BLANK_DOCUMENT}>{BLANK_DOCUMENT}</option>}
      {retained && <optgroup label="Selected template"><option value={String(retained.id)}>{templateLabel(retained)}</option></optgroup>}
      {matches.map(template => <option key={String(template.id)} value={String(template.id)}>{templateLabel(template)}</option>)}
    </select>
  </>;
}
