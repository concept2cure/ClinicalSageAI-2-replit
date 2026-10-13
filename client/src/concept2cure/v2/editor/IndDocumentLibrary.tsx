import React, { useId, useMemo, useState } from 'react';
import { useLiveData, hasKeys, EmptyState } from '../dataConnect';
import { I } from '../icons';
import type { IndDocumentCatalog } from '@shared/authoring/ind-document-catalog';

interface WorkingDocs { documents: Array<{ id: string; title: string; status: string }> }
interface Item { id: string; title: string; code: string | null; phaseId: string | null; description: string | null; draftable: boolean }
const PAGE_SIZE = 30;

/** A reference to every canonical IND phase/deliverable and section, not a second template registry. */
export function IndDocumentLibrary({ programId, onAsk, onOpenDocument, onFindSources }: {
  programId: string; onAsk?: (text: string) => void; onOpenDocument?: (docId: string) => void; onFindSources?: (query: string) => void;
}) {
  const searchId = useId();
  const phaseId = useId();
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState('all');
  const [kind, setKind] = useState<'deliverables' | 'sections'>('deliverables');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [epoch, setEpoch] = useState(0);
  const catalog = useLiveData<IndDocumentCatalog>('/api/authoring/ind-document-catalog', [epoch], hasKeys<IndDocumentCatalog>('sections', 'deliverables', 'phases'));
  const docs = useLiveData<WorkingDocs>(`/api/authoring/docs?status=all&programId=${encodeURIComponent(programId)}`, [programId, epoch], hasKeys<WorkingDocs>('documents'));
  const items = useMemo<Item[]>(() => {
    if (!catalog.data || catalog.error) return [];
    if (kind === 'sections') return catalog.data.sections.map(s => ({ id: s.id, title: s.title, code: s.code, phaseId: s.phaseId, description: s.description, draftable: s.aiDraftable }));
    return catalog.data.deliverables.map(d => ({ id: d.id, title: d.title, code: null, phaseId: d.phaseId, description: d.description, draftable: d.aiDraftable === true }));
  }, [catalog.data, catalog.error, kind]);
  const filtered = items.filter(item => (phase === 'all' || item.phaseId === phase)
    && `${item.title} ${item.code ?? ''} ${item.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const changeFilter = (run: () => void) => { run(); setShown(PAGE_SIZE); };
  const ask = (item: Item) => onAsk?.(
    `Work on the IND ${kind === 'sections' ? 'section' : 'deliverable'} “${item.title}”${item.code ? ` (${item.code})` : ''} in this project. `
    + 'First list the authoring outline and current project evidence, follow every relevant page and read the complete supporting sources. Reuse an existing working document if present. '
    + (item.draftable ? 'Prepare a source-grounded working draft in the existing authoring editor using draft_authoring_document, preserving source references and naming evidence gaps. ' : 'Prepare a completion checklist; do not invent an official form or dataset. ')
    + 'Do not mark the document, pyramid task or submission approved or complete. State what was read and what could not be checked.',
  );
  return <div className="pf-list" data-testid="ind-document-library">
    <p>IND document work across every phase. This reference list does not imply documents exist or tasks are complete.</p>
    <div className="pf-actions" role="group" aria-label="IND document list">
      <button className="btn ghost" aria-pressed={kind === 'deliverables'} onClick={() => changeFilter(() => setKind('deliverables'))}>Pyramid deliverables</button>
      <button className="btn ghost" aria-pressed={kind === 'sections'} onClick={() => changeFilter(() => setKind('sections'))}>CTD sections</button>
    </div>
    <label className="sr-only" htmlFor={searchId}>Find an IND document type</label>
    <input id={searchId} className="c2c-input" type="search" placeholder="Find a document type…" value={query} onChange={e => changeFilter(() => setQuery(e.target.value))} style={{ width: '100%' }} />
    <label htmlFor={phaseId}>Phase</label>
    <select id={phaseId} className="c2c-input" value={phase} onChange={e => changeFilter(() => setPhase(e.target.value))}>
      <option value="all">All phases</option>
      {catalog.data?.phases.map(p => <option key={p.id} value={p.id}>{p.order}. {p.name}</option>)}
    </select>
    {catalog.loading && <p role="status">Loading IND documents…</p>}
    {catalog.error && <EmptyState tone="error" icon={I.alertTriangle} title="IND document list unavailable" hint={catalog.error} retry={() => setEpoch(v => v + 1)} />}
    {docs.error && <p role="alert">Working documents could not be checked: {docs.error}</p>}
    {!catalog.loading && !catalog.error && <p>{filtered.length} entries · showing {Math.min(shown, filtered.length)}.</p>}
    {!catalog.loading && !catalog.error && filtered.slice(0, shown).map(item => {
      const matches = !docs.error && !docs.loading ? docs.data?.documents.filter(d => d.title.trim().toLowerCase() === item.title.trim().toLowerCase()) ?? [] : [];
      return <div className="pf-sel" key={item.id}>
        <div className="pf-sel-t">{item.code ? `${item.code} · ` : ''}{item.title}</div>
        {item.description && <p className="pf-sel-m">{item.description}</p>}
        {!item.draftable && <p className="pf-sel-m">Use the original form or data file. Extracted text is a working reference and requires review.</p>}
        <div className="pf-actions">
          {matches.map(doc => onOpenDocument && <button key={doc.id} className="btn ghost" onClick={() => onOpenDocument(doc.id)}>{I.penLine} Open {doc.title} · {doc.status}</button>)}
          {onFindSources && <button className="btn ghost" onClick={() => onFindSources(item.title)}>{I.search} Find source</button>}
          {onAsk && <button className="btn ghost" onClick={() => ask(item)}>{I.sparkles} {item.draftable ? 'Work with AnA' : 'Prepare with AnA'}</button>}
        </div>
      </div>;
    })}
    {shown < filtered.length && <button className="btn ghost" onClick={() => setShown(v => v + PAGE_SIZE)}>More IND documents</button>}
  </div>;
}
