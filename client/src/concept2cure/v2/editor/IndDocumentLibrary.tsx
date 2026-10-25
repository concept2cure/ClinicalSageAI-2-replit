import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLiveData, hasKeys, EmptyState } from '../dataConnect';
import { I } from '../icons';
import { statusWords } from './CanvasDocumentList';
import type { IndAuthoringTemplateRef, IndDocumentCatalog } from '@shared/authoring/ind-document-catalog';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { shellProgramId, useShellProject } from '../shellProject';

interface WorkingDocument { id: string; title: string; status: string; template_id?: string | null; client_program_id?: string | null }
interface WorkingDocs { documents: WorkingDocument[] }
interface Item { id: string; title: string; code: string | null; phaseId: string | null; module: string | null;
  description: string | null; draftable: boolean; template?: IndAuthoringTemplateRef }
interface CopyState { status: 'creating' | 'created' | 'failed' | 'unknown'; documentId?: string; message?: string }
type LibraryKind = 'deliverables' | 'sections' | 'modules';
const PAGE_SIZE = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LibraryActions {
  onAsk?: (text: string) => void;
  onOpenDocument?: (docId: string) => void;
  onFindSources?: (query: string) => void;
}

/** This project's working documents for an entry: made from its template, or titled as it is. */
function matchingDocuments(item: Item, documents: WorkingDocs['documents'], programId: string) {
  return documents.filter(doc => (!doc.client_program_id || doc.client_program_id === programId)
    && ((item.template && doc.template_id === item.template.id) || doc.title.trim().toLowerCase() === item.title.trim().toLowerCase()));
}

function LibraryEntry({ item, documents, onOpenDocument, onFindSources, onAsk, programId, copy, create, reload, createAllowed, meta, extra }: {
  item: Item; documents: WorkingDocs['documents']; onAsk?: (item: Item) => void; programId: string;
  copy?: CopyState; create: (template: IndAuthoringTemplateRef) => void; reload: () => void; createAllowed: boolean;
  /** Said beside the title (the Plan step's assignment). */
  meta?: React.ReactNode;
  /** One more action (the Plan step's Assign). */
  extra?: React.ReactNode;
} & Omit<LibraryActions, 'onAsk'>) {
  const matches = matchingDocuments(item, documents, programId);
  return <details className="pf-sel pf-library-entry">
    <summary className="pf-sel-t">{item.code ? `${item.code} · ` : ''}{item.title}{meta && <> {meta}</>}</summary>
    <div className="pf-library-detail">
      {item.description && <p className="pf-sel-m">{item.description}</p>}
      {!item.draftable && <p className="pf-sel-m">Use the original form or data file. Review extracted text against the original.</p>}
      {item.template && <TemplateLimits template={item.template} />}
      {copy?.message && <p className="pf-sel-m" role={copy.status === 'created' ? 'status' : 'alert'}>{copy.message}</p>}
      <div className="pf-actions">
        {matches.map(doc => onOpenDocument && <button type="button" key={doc.id} className="btn ghost" onClick={() => onOpenDocument(doc.id)}>{I.penLine} Open {doc.title} · {statusWords(doc.status)}</button>)}
        {item.template && <TemplateCopyAction template={item.template} copy={copy} create={create}
          createAllowed={createAllowed} onOpenDocument={onOpenDocument} reload={reload} />}
        {extra}
        {onFindSources && <button type="button" className="btn ghost" onClick={() => onFindSources(item.title)}>{I.search} Find source</button>}
        {onAsk && <button type="button" className="btn ghost" onClick={() => onAsk(item)}>{I.sparkles} {item.draftable ? 'Work with AnA' : 'Prepare with AnA'}</button>}
      </div>
    </div>
  </details>;
}

function TemplateLimits({ template }: { template: IndAuthoringTemplateRef }) {
  return <>
    <p className="pf-sel-m">{template.sectionCount} {template.sectionCount === 1 ? 'section' : 'sections'} · {template.kind === 'preparation' ? 'Preparation worksheet' : 'Narrative working outline'} · Original format: {template.originalFormat.toUpperCase()}.</p>
    {template.limitations.map((limit, i) => <p className="pf-sel-m" key={i}>{limit}</p>)}
  </>;
}

function TemplateCopyAction({ template, copy, create, createAllowed, onOpenDocument, reload }: {
  template: IndAuthoringTemplateRef; copy?: CopyState; create: (template: IndAuthoringTemplateRef) => void;
  createAllowed: boolean; onOpenDocument?: LibraryActions['onOpenDocument']; reload: () => void;
}) {
  if (copy?.status === 'created') return onOpenDocument && <button type="button" className="btn ghost"
    disabled={!createAllowed} onClick={() => copy.documentId && onOpenDocument(copy.documentId)}>{I.penLine} Open working copy</button>;
  if (copy?.status === 'unknown') return <button type="button" className="btn ghost" onClick={reload}>{I.rotateCw} Check working documents</button>;
  return <button type="button" className="btn ghost" disabled={!createAllowed || copy?.status === 'creating'}
    onClick={() => create(template)}>{I.plus} {copy?.status === 'creating' ? 'Creating working copy…' : copy?.status === 'failed' ? 'Try again' : 'Create from template'}</button>;
}

function confirmedCopy(body: unknown, template: IndAuthoringTemplateRef, programId: string): string | null {
  const value = body as { success?: unknown; document?: Record<string, unknown> } | null;
  const doc = value?.document;
  return value?.success === true && doc && typeof doc.id === 'string' && UUID.test(doc.id)
    && doc.client_program_id === programId && doc.template_id === template.id ? doc.id : null;
}

function copyFailure(error: unknown): CopyState {
  const refused = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
  return { status: refused ? 'failed' : 'unknown', message: refused
    ? redactInternals(error.message, 'The server refused this template. Check current project access and try again.')
    : 'Could not confirm whether the working copy was created. Check working documents before creating another copy.' };
}

async function createTemplateCopy(template: IndAuthoringTemplateRef, programId: string): Promise<CopyState> {
  const res = await apiRequest('POST', '/api/authoring/docs', { title: template.title, module: template.module,
    template_id: template.id, client_program_id: programId });
  const body: unknown = await res.json();
  if (!res.ok) throw new ApiRequestError(serverMessage(body) ?? 'The server refused this template.', res.status);
  const documentId = confirmedCopy(body, template, programId);
  return documentId ? { status: 'created', documentId, message: 'Working copy created in this project; it is not bound to a filing. Review its guidance and source limits in the editor.' }
    : copyFailure(null);
}

/** Receipt and pending state survive filtering and a canceled host leave dialog. */
function useTemplateCopies(programId: string, onOpenDocument?: LibraryActions['onOpenDocument']) {
  const [copies, setCopies] = useState<Record<string, CopyState>>({});
  const recorded = useRef<Record<string, CopyState>>({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => alive.current && shellProgramId() === programId;
  const record = (id: string, state: CopyState) => {
    recorded.current = { ...recorded.current, [id]: state };
    setCopies(recorded.current);
  };
  const create = async (template: IndAuthoringTemplateRef) => {
    const previous = recorded.current[template.id];
    if (!current() || previous?.status === 'creating' || previous?.status === 'created' || previous?.status === 'unknown') return;
    record(template.id, { status: 'creating' });
    let documentId: string | null = null;
    try {
      const state = await createTemplateCopy(template, programId);
      if (!current()) return;
      documentId = state.documentId ?? null;
      record(template.id, state);
    } catch (error) {
      if (current()) record(template.id, copyFailure(error));
    }
    if (documentId && current()) onOpenDocument?.(documentId);
  };
  return { copies, create };
}

function libraryItems(catalog: IndDocumentCatalog | null, kind: LibraryKind): Item[] {
  if (!catalog) return [];
  if (kind === 'modules') return (catalog.moduleTemplates ?? []).map(template => ({ id: template.id,
    title: template.title, code: null, module: template.module, phaseId: null,
    description: null, draftable: template.aiDraftable, template }));
  if (kind === 'sections') return catalog.sections.map(s => ({ id: s.id, title: s.title, code: s.code,
    phaseId: s.phaseId, module: s.module ?? null, description: s.description,
    draftable: s.template?.aiDraftable ?? s.aiDraftable, template: s.template }));
  return catalog.deliverables.map(d => ({ id: d.id, title: d.title, code: null,
    phaseId: d.phaseId, module: d.module ?? null, description: d.description,
    draftable: d.template?.aiDraftable ?? d.aiDraftable === true, template: d.template }));
}

/** What AnA is asked to do for one entry: read its template and the project's sources, then draft or list. */
function askAbout(item: Item, kind: LibraryKind): string {
  return `Work on the IND ${kind === 'sections' ? 'section' : kind === 'modules' ? 'module outline' : 'deliverable'} “${item.title}”${item.code ? ` (${item.code})` : ''} in this project. `
    + (item.template ? `Read get_document_template with template_id "${item.template.id}" and follow every page of its outline, source requirements and original-record limits. ` : '')
    + 'First list the authoring outline and current project evidence, follow every relevant page and read the complete supporting sources. Reuse an existing working document if present. '
    + (item.draftable ? 'Prepare a source-grounded working draft in the existing authoring editor using draft_authoring_document, preserving source references and naming evidence gaps. ' : 'Prepare a completion checklist; do not invent an official form or dataset. ')
    + 'Do not mark the document, pyramid task or submission approved or complete. State what was read and what could not be checked.';
}

/** A reference to every canonical IND phase/deliverable and section, not a second template registry. */
export function IndDocumentLibrary(props: { programId: string } & LibraryActions) {
  return <ScopedIndDocumentLibrary key={props.programId} {...props} />;
}

function ScopedIndDocumentLibrary({ programId, onAsk, onOpenDocument, onFindSources }: {
  programId: string;
} & LibraryActions) {
  const searchId = useId();
  const phaseId = useId();
  const moduleId = useId();
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState('all');
  const [module, setModule] = useState('all');
  const [kind, setKind] = useState<LibraryKind>('deliverables');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [epoch, setEpoch] = useState(0);
  const activeProgram = shellProgramId(useShellProject());
  const { copies, create } = useTemplateCopies(programId, onOpenDocument);
  const catalog = useLiveData<IndDocumentCatalog>('/api/authoring/ind-document-catalog', [epoch], hasKeys<IndDocumentCatalog>('sections', 'deliverables', 'phases'));
  const docs = useLiveData<WorkingDocs>(`/api/authoring/docs?status=all&programId=${encodeURIComponent(programId)}`, [programId, epoch], hasKeys<WorkingDocs>('documents'));
  const items = useMemo<Item[]>(() => {
    return libraryItems(catalog.error ? null : catalog.data, kind);
  }, [catalog.data, catalog.error, kind]);
  const filtered = items.filter(item => (phase === 'all' || item.phaseId === phase)
    && (module === 'all' || item.module === module)
    && `${item.title} ${item.code ?? ''} ${item.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const changeFilter = (run: () => void) => { run(); setShown(PAGE_SIZE); };
  const ask = (item: Item) => onAsk?.(askAbout(item, kind));
  return <div className="pf-library" data-testid="ind-document-library">
    <div className="pf-search pf-library-head">
    <p className="pf-sel-m">Document types across all IND phases. Expand a type to find sources or work with AnA.</p>
    <div className="cdl-scope" role="group" aria-label="IND document list">
      <button type="button" className="cdl-scope-btn" aria-pressed={kind === 'deliverables'} onClick={() => changeFilter(() => setKind('deliverables'))}>Pyramid deliverables</button>
      <button type="button" className="cdl-scope-btn" aria-pressed={kind === 'sections'} onClick={() => changeFilter(() => setKind('sections'))}>CTD sections</button>
      <button type="button" className="cdl-scope-btn" aria-pressed={kind === 'modules'} onClick={() => changeFilter(() => { setKind('modules'); setPhase('all'); })}>Module outlines</button>
    </div>
    <label className="sr-only" htmlFor={searchId}>Find an IND document type</label>
    <input id={searchId} className="c2c-input" type="search" placeholder="Find a document type…" value={query} onChange={e => changeFilter(() => setQuery(e.target.value))} />
    <label htmlFor={moduleId}>Module</label>
    <select id={moduleId} className="c2c-input" value={module} onChange={e => changeFilter(() => setModule(e.target.value))}>
      <option value="all">All modules</option>
      {['M1', 'M2', 'M3', 'M4', 'M5'].map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    <label htmlFor={phaseId}>Phase</label>
    <select id={phaseId} className="c2c-input" value={phase} onChange={e => changeFilter(() => setPhase(e.target.value))}>
      <option value="all">All phases</option>
      {catalog.data?.phases.map(p => <option key={p.id} value={p.id}>{p.order}. {p.name}</option>)}
    </select>
    </div>
    <div className="pf-list" aria-busy={catalog.loading || docs.loading}>
    {catalog.loading && <EmptyState busy icon={I.fileText} title="Loading IND documents…" />}
    {catalog.error && <EmptyState tone="error" icon={I.alertTriangle} title="IND document list unavailable" hint={catalog.error} retry={() => setEpoch(v => v + 1)} />}
    {docs.error && <EmptyState tone="error" icon={I.alertTriangle} title="Working documents could not be checked" hint={docs.error} retry={() => setEpoch(v => v + 1)} />}
    {!catalog.loading && !catalog.error && <>
      <p className="pf-count" role="status">{filtered.length} entries · showing {Math.min(shown, filtered.length)}.</p>
      {filtered.length === 0 && <EmptyState icon={I.search} title="No IND document types match"
        hint="Change the search or phase to find a document type."
        action={{ label: 'Clear filters', onAct: () => changeFilter(() => { setQuery(''); setPhase('all'); setModule('all'); }) }} />}
      {filtered.slice(0, shown).map(item => <LibraryEntry key={item.id} item={item}
        documents={!docs.error && !docs.loading ? docs.data?.documents ?? [] : []}
        programId={programId} copy={item.template ? copies[item.template.id] : undefined}
        create={template => void create(template)} reload={() => setEpoch(value => value + 1)}
        createAllowed={activeProgram === programId && !docs.loading && !docs.error}
        onOpenDocument={onOpenDocument} onFindSources={onFindSources} onAsk={onAsk ? ask : undefined} />)}
      {shown < filtered.length && <div className="pf-search"><button type="button" className="btn ghost" onClick={() => setShown(v => v + PAGE_SIZE)}>More IND documents</button></div>}
    </>}
    </div>
  </div>;
}

/** What the Plan step adds to each entry and phase; the catalogue, entries and template copies stay the library's. */
interface PlanSlots {
  /** The feature that composes a phase, when one does for this project (CMC / Module 3, IND forms). */
  phaseDoor?: (phaseId: string) => React.ReactNode;
  /** The deliverable's assignment, said beside its title. */
  assignmentOf?: (deliverableId: string) => React.ReactNode;
  /** The deliverable's Assign action. */
  assignAction?: (deliverable: { id: string; title: string; group: string }) => React.ReactNode;
}

/**
 * The filing's plan (the Plan step, CLIENT_JOURNEY_2026-10-25.md pass 3): every
 * IND deliverable, grouped by the phase it belongs to, with this project's
 * working copy, who it is assigned to, and the feature that composes the phase.
 * The same catalogue read, entries and template copies as the library above;
 * the library stays in the editor's project files for finding a type by name.
 */
export function IndFilingPlan(props: { programId: string } & LibraryActions & PlanSlots) {
  return <ScopedIndFilingPlan key={props.programId} {...props} />;
}

function ScopedIndFilingPlan({ programId, onAsk, onOpenDocument, phaseDoor, assignmentOf, assignAction }: { programId: string } & LibraryActions & PlanSlots) {
  const [epoch, setEpoch] = useState(0);
  const activeProgram = shellProgramId(useShellProject());
  const { copies, create } = useTemplateCopies(programId, onOpenDocument);
  const catalog = useLiveData<IndDocumentCatalog>('/api/authoring/ind-document-catalog', [epoch], hasKeys<IndDocumentCatalog>('sections', 'deliverables', 'phases'));
  const docs = useLiveData<WorkingDocs>(`/api/authoring/docs?status=all&programId=${encodeURIComponent(programId)}`, [programId, epoch], hasKeys<WorkingDocs>('documents'));
  const items = useMemo(() => libraryItems(catalog.error ? null : catalog.data, 'deliverables'), [catalog.data, catalog.error]);
  const documents = !docs.error && !docs.loading ? docs.data?.documents ?? [] : [];
  const phases = [...(catalog.data?.phases ?? [])].sort((a, b) => a.order - b.order);
  const reload = () => setEpoch(value => value + 1);
  if (catalog.loading) return <EmptyState busy icon={I.fileText} title="Reading what this filing needs…" />;
  if (catalog.error) return <EmptyState tone="error" icon={I.alertTriangle} title="What this filing needs could not be read" hint={catalog.error} retry={reload} />;
  return <div className="pj-plan" data-testid="ind-filing-plan" aria-busy={docs.loading}>
    {docs.error && <EmptyState tone="error" icon={I.alertTriangle} title="This project’s documents could not be checked" hint={`${docs.error} Which deliverables are started is unknown until they are read.`} retry={reload} />}
    {phases.map((phase, index) => {
      const list = items.filter(item => item.phaseId === phase.id);
      const started = list.filter(item => matchingDocuments(item, documents, programId).length > 0).length;
      return <details key={phase.id} className="pj-plan-phase" open={index === 0} data-phase={phase.id}>
        <summary>
          <span className="pj-plan-phase-t">{phase.order}. {phase.name}</span>
          <span className="pj-plan-phase-n">{list.length} {list.length === 1 ? 'document' : 'documents'}{docs.loading || docs.error ? '' : ` · ${started} started`}</span>
        </summary>
        {phaseDoor?.(phase.id)}
        {list.map(item => <LibraryEntry key={item.id} item={item} documents={documents} programId={programId}
          copy={item.template ? copies[item.template.id] : undefined} create={template => void create(template)} reload={reload}
          createAllowed={activeProgram === programId && !docs.loading && !docs.error} onOpenDocument={onOpenDocument}
          onAsk={onAsk ? entry => onAsk(askAbout(entry, 'deliverables')) : undefined}
          meta={assignmentOf?.(item.id)} extra={assignAction?.({ id: item.id, title: item.title, group: phase.name })} />)}
      </details>;
    })}
  </div>;
}
