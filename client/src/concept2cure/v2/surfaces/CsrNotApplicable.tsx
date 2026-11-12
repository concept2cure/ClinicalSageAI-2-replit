/**
 * "Not applicable because …" for a CSR heading the build does not draft (founder decision P-115, item 5, 2026-11-10:
 * "Every heading holds text. 'Not applicable' is a person's statement with a reason, never a default … The editor
 * offers, on a CSR heading, the 'Not applicable because …' act the assembly already has for §16").
 *
 * The scientific review refuses a CSR in which any heading is blank (csr-scientific-review-core.ts), and the build
 * leaves the headings it does not draft (§3, §14, §15, §16) to a person. Until this, the only way to say one does
 * not apply was to open it in the outline and type. Split out of CsrRunBuilds.tsx; it sits in the CSR document's
 * "Build from the study's data", under the section review.
 *
 * - It lists the headings the build does not draft whose section in THIS document holds no text.
 * - A heading with no subheadings takes a reason, and the act saves "Not applicable to this study: <reason>" into
 *   the document's own section through the editor's save (PATCH /api/authoring/sections/:id): the person's text,
 *   a revision, and their reason for change on the audit row. Nothing is written by default.
 * - Where the build's assembly already holds a declaration for that appendix, its reason is offered, so the report
 *   and the assembled files say the same thing. The person can change it.
 * - A heading that holds only its subsections is named, with no act: "not applicable" is not what it says.
 * A failed read is an alert, never an empty list.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import type { CsrBoardHeading } from './CsrBuildProgress';

interface DocumentSection { id: string; code: string; content: string; updatedAt: string | null }
type Declared = Record<string, { reason?: unknown }>;

const record = (value: unknown): Record<string, unknown> | null =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);

/** The section's visible text: markup and entities are not text, so "<p></p>" is blank. */
const visibleText = (content: string): string => content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim();
const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** This document's sections by ICH E3 number, or the reason they could not be read. */
function useDocumentSections(documentId: string) {
  const [state, setState] = useState<{ sections: Map<string, DocumentSection> | null; error: string | null }>({ sections: null, error: null });
  const load = useCallback(async () => {
    const result = await apiCall<{ success?: unknown; sections?: unknown }>('GET', `/api/authoring/docs/${encodeURIComponent(documentId)}/sections`);
    const rows = result?.body?.sections;
    if (!result?.ok || result.body?.success !== true || !Array.isArray(rows)) {
      setState({ sections: null, error: apiErrorText(result, 'This document’s sections could not be read, so nothing is offered here.') });
      return;
    }
    const sections = new Map<string, DocumentSection>();
    for (const row of rows) {
      const r = record(row);
      if (!r || typeof r.id !== 'string' || typeof r.code !== 'string') continue;
      sections.set(r.code, { id: r.id, code: r.code, content: typeof r.content === 'string' ? r.content : '',
        updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null });
    }
    setState({ sections, error: null });
  }, [documentId]);
  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load };
}

/** What the build's assembly already declares not applicable, by appendix number. Absent or unreadable is none. */
function useAssemblyDeclarations(jobId: number): Declared {
  const [declared, setDeclared] = useState<Declared>({});
  useEffect(() => {
    let current = true;
    void apiCall<{ assembly?: unknown }>('GET', `/api/csr/jobs/${jobId}/assembly`).then(result => {
      const found = record(record(result?.body?.assembly)?.notApplicable);
      if (current && result?.ok && found) setDeclared(found as Declared);
    });
    return () => { current = false; };
  }, [jobId]);
  return declared;
}

function StateNotApplicable({ heading, section, declared, onStated }: {
  heading: CsrBoardHeading; section: DocumentSection; declared: string; onStated: () => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The assembly's declaration is offered until the person types their own.
  const value = touched ? reason : declared;
  const stated = value.trim();
  const save = async () => {
    setBusy(true); setError(null);
    const result = await apiCall('PATCH', `/api/authoring/sections/${encodeURIComponent(section.id)}`, {
      content: `<p>Not applicable to this study: ${escapeHtml(stated)}</p>`,
      changeReason: `Stated not applicable to this study: ${stated}`,
      ...(section.updatedAt ? { expectedUpdatedAt: section.updatedAt } : {}),
    });
    setBusy(false);
    if (result?.ok) onStated();
    else setError(apiErrorText(result, 'The statement was not saved. Nothing in the document was changed.'));
  };
  return <li style={{ display: 'grid', gap: 4 }}>
    <span><span className="mono" style={{ color: 'var(--accent-200)' }}>{heading.num}</span> {heading.label}</span>
    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ flex: '1 1 320px', display: 'flex', gap: 6, alignItems: 'center' }}>Not applicable because{' '}
        <input className="c2c-input" style={{ flex: 1, minWidth: 0 }} value={value} maxLength={1000} disabled={busy}
          aria-label={`Not applicable because, for §${heading.num}`}
          onChange={event => { setTouched(true); setReason(event.target.value); }} />
      </label>
      <button type="button" className="btn" disabled={busy || !stated}
        aria-label={`State §${heading.num} not applicable in the document`} onClick={() => void save()}>
        {busy ? 'Saving…' : 'State it in the document'}
      </button>
    </span>
    {!touched && declared && <span className="sec-sub">As declared for the assembled report. Change it if the report should say something else.</span>}
    {error && <span role="alert">{error}</span>}
  </li>;
}

export function CsrNotApplicable({ documentId, jobId, headings, onDocumentChanged }: {
  documentId: string; jobId: number; headings: CsrBoardHeading[]; onDocumentChanged?: () => void;
}) {
  const { sections, error, reload } = useDocumentSections(documentId);
  const declared = useAssemblyDeclarations(jobId);
  const holdsSubsections = (heading: CsrBoardHeading) => headings.some(other => other.num.startsWith(`${heading.num}.`));
  // What the build leaves to a person: the headings it is not asked to draft (§3, §14, §15, §16), and every heading
  // that holds only its subsections, which it skips whether or not it drafts those.
  const undrafted = headings.filter(heading => heading.state === 'not_drafted' && (heading.manual || holdsSubsections(heading)));
  if (!undrafted.length) return null;
  const blank = sections ? undrafted.filter(heading => {
    const section = sections.get(heading.num);
    return section && !visibleText(section.content);
  }) : [];
  const leaves = blank.filter(heading => !holdsSubsections(heading));
  const parents = blank.filter(holdsSubsections);
  const stated = () => { void reload(); onDocumentChanged?.(); };
  return <details role="group" aria-label="Headings the build does not draft" style={{ display: 'grid', gap: 6 }}>
    <summary><strong>Headings the build does not draft</strong>{sections && <> · {blank.length} hold no text in this document</>}</summary>
    {error && <p role="alert">{error}{' '}<button type="button" className="btn ghost" onClick={() => void reload()}>Read the document again</button></p>}
    {!error && !sections && <p role="status">Reading this document’s sections…</p>}
    {sections && <>
      <p style={{ margin: 0 }}>A clinical study report is reviewed only when every heading holds text. A heading that does not apply to this
        study says so, with the reason, as your own statement. {leaves.length} heading{leaves.length === 1 ? '' : 's'} can be stated not
        applicable here; write any other heading in the document.</p>
      {parents.length > 0 && <p className="sec-sub" style={{ margin: 0 }}>{parents.map(heading => `${heading.num} ${heading.label}`).join(', ')}{' '}
        {parents.length === 1 ? 'holds' : 'hold'} only {parents.length === 1 ? 'its' : 'their'} subsections. Write {parents.length === 1 ? 'its' : 'their'} text in the document.</p>}
      {leaves.length > 0 && <ul aria-label="Headings that can be stated not applicable" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {leaves.map(heading => <StateNotApplicable key={`${heading.num}:${sections.get(heading.num)!.updatedAt}`} heading={heading}
          section={sections.get(heading.num)!} declared={typeof declared[heading.num]?.reason === 'string' ? String(declared[heading.num].reason) : ''}
          onStated={stated} />)}
      </ul>}
    </>}
  </details>;
}
