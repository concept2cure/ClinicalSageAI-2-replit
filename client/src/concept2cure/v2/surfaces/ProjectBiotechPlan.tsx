/** Complete the existing Plan with recorded biotech filing context and existing template starts. */
import React from 'react';
import { useAuth } from '@/services/portal/authService';
import { getApplicationType } from '@shared/regulatory/global-document-registry';
import { resolveProjectMap } from '@shared/regulatory/project-map';
import type { RegulatoryApplicationType } from '@shared/regulatory/document-taxonomy';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { shellProgramId, useShellProject } from '../shellProject';
import { useFilingOutline } from '../useFilingOutline';
import { useScopedDocuments } from '../editor/useScopedDocuments';
import { useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { useAuthoringCreation } from '../editor/useAuthoringCreation';
import { templateLabel, templatesForFiling, type AuthoringTemplate } from './AuthoringTemplatePicker';
import type { PlanDeliverable } from './PlanAssign';
import type { AuthDoc } from '../editor/DocumentWorkbench';

/** Exact public identity from the admitted project read; a title or product type is insufficient. */
export function biotechPlanEntry(project: { id: string; registry_id?: string | null } | null, programId: string) {
  const entry = project?.id === programId && project.registry_id ? getApplicationType(project.registry_id) : undefined;
  return entry?.active && entry.segment === 'pharma_biotech' && ['US', 'GLOBAL'].includes(entry.region) ? entry : null;
}

type PlanProps = {
  programId: string; entry: RegulatoryApplicationType; onOpenDocument: (id: string) => void;
  onAsk: (text: string) => void; assignmentOf: (id: string) => React.ReactNode;
  assignAction: (deliverable: PlanDeliverable) => React.ReactNode;
};
function RecordedOutline({ programId }: { programId: string }) {
  const filing = useFilingOutline(programId);
  return <details className="pj-plan-phase">
    <summary className="pj-plan-phase-t">Recorded filing outline</summary>
    {filing.loading ? <p role="status">Reading the saved filing outline…</p>
      : filing.error ? <p role="alert">The saved filing outline could not be read.</p>
        : filing.flat.length ? <ul>{filing.flat.map(node => <li key={node.key}>{node.key} · {node.label}</li>)}</ul>
          : <p>No saved filing outline is available. Template guidance remains available below.</p>}
  </details>;
}

function TemplateCreationActions({ creation, ready, start }: {
  creation: ReturnType<typeof useAuthoringCreation>; ready: boolean; start: () => void;
}) {
  const state = creation.state('document');
  if (state?.phase === 'unknown') return <>
    <button type="button" className="btn ghost" disabled={state.checking}
      onClick={() => creation.check('document')}>Check working documents</button>
    {state.canOpenRecovered && <button type="button" className="btn ghost" disabled={state.checking}
      onClick={() => creation.open('document')}>Open identified document</button>}
  </>;
  if (state?.phase === 'created') return <button type="button" className="btn ghost" onClick={() => creation.open('document')}>Open created document</button>;
  return <button type="button" className="btn ghost" disabled={!ready || creation.blocked('document')} onClick={start}>
    {I.plus} {state?.phase === 'pending' ? 'Creating working copy…' : 'Create from template'}</button>;
}

function TemplateStart({ template, programId, docs, ready, refresh, onOpenDocument, onAsk, assignmentOf, assignAction }: {
  template: AuthoringTemplate; programId: string; docs: AuthDoc[]; ready: boolean; refresh: () => Promise<boolean>;
} & Pick<PlanProps, 'onOpenDocument' | 'onAsk' | 'assignmentOf' | 'assignAction'>) {
  const [notice, setNotice] = React.useState('');
  const openProject = shellProgramId(useShellProject());
  const creation = useAuthoringCreation({ programId, openProject, docId: null, programSwitchHeld: false,
    fireToast: message => setNotice(message), onDocCreated: doc => onOpenDocument(doc.id), onSectionCreated: () => undefined,
    onCheckCreation: refresh });
  const state = creation.state('document');
  const message = state?.message ?? notice;
  const existing = docs.filter(doc => 'template_id' in doc && typeof doc.template_id === 'string' && doc.template_id === String(template.id));
  const deliverableId = `template:${template.id}`;
  const title = templateLabel(template);
  return <details className="pf-sel pf-library-entry">
    <summary className="pf-sel-t">{title}{assignmentOf(deliverableId)}</summary>
    <div className="pf-library-detail">
      {template.description && <p className="pf-sel-m">{template.description}</p>}
      <p className="pf-sel-m">{template.kind === 'preparation' ? 'Preparation worksheet; retain original forms and records.' : 'Working outline; source-supported writing requires review.'}</p>
      {template.limitations?.map((limit, index) => <p className="pf-sel-m" key={index}>{limit}</p>)}
      {message && <p className="pf-sel-m" role={state?.phase === 'created' ? 'status' : 'alert'}>{message}</p>}
      <div className="pf-actions">
        {existing.map(doc => <button type="button" className="btn ghost" key={doc.id} onClick={() => onOpenDocument(doc.id)}>{I.penLine} Open {doc.title}</button>)}
        <TemplateCreationActions creation={creation} ready={ready}
          start={() => creation.create('document', { title, module: template.module ?? null, template_id: template.id }, () => undefined, title)} />
        {assignAction({ id: deliverableId, title, group: 'Authoring' })}
        <button type="button" className="btn ghost" onClick={() => onAsk(`Work on ${title} in the open project. Read get_document_template for template_id "${template.id}" and every guidance page; inspect existing working documents and current project sources before drafting. Preserve original-record limits and report missing evidence. Do not claim approval or filing readiness.`)}>Work with AnA</button>
      </div>
    </div>
  </details>;
}

function FilingWorkGuidance({ entry, assignmentOf, assignAction }: Pick<PlanProps, 'entry' | 'assignmentOf' | 'assignAction'>) {
  const guidance = resolveProjectMap({ need: entry.id });
  return <details className="pj-plan-phase">
    <summary className="pj-plan-phase-t">Work guidance</summary>
    <p className="pj-desc">This guidance is not a legal checklist or a completeness verdict. Confirm current requirements, applicability and source records.</p>
    {guidance.milestones.map(phase => <details className="pf-sel" key={phase.id}>
      <summary className="pf-sel-t">{phase.title}{assignmentOf(`filing:${entry.id}:${phase.id}`)}</summary>
      <p className="pf-sel-m">{phase.purpose}</p>
      <ul>{phase.deliverables.map(item => <li key={item}>{item}</li>)}</ul>
      {assignAction({ id: `filing:${entry.id}:${phase.id}`, title: phase.title, group: entry.applicationType })}
    </details>)}
  </details>;
}

export function ProjectBiotechPlan(props: PlanProps) {
  return <ScopedBiotechPlan key={`${props.programId}:${props.entry.id}`} {...props} />;
}
function ScopedBiotechPlan({ programId, entry, ...actions }: PlanProps) {
  const { user } = useAuth();
  const session = useAuthoringReadSession(user);
  const [epoch, setEpoch] = React.useState(0);
  const [shown, setShown] = React.useState(30);
  const catalog = useLiveData<{ templates: AuthoringTemplate[]; globalCatalog?: string }>('/api/authoring/templates', [programId, epoch], undefined,
    { key: JSON.stringify([programId, session.actor, session.key]), current: session.sameRevision });
  const working = useScopedDocuments(programId, 'all');
  const templates = templatesForFiling(catalog.data?.templates ?? [], entry.id);
  const ready = working.docsState === 'ready';
  return <section className="pj-sec" data-testid="biotech-filing-plan">
    <div className="pj-sec-h"><h2>What this {entry.applicationType} needs</h2></div>
    <p className="pj-desc">{entry.displayName} · {entry.agency}. {entry.description}</p>
    {entry.moduleAuthority && <p className="pj-desc">Recorded reference: {entry.moduleAuthority}</p>}
    <RecordedOutline programId={programId} />
    <FilingWorkGuidance entry={entry} {...actions} />
    <h3>Document templates</h3>
    <p className="pj-desc">Exact filing and shared document starts. Shared structures do not establish a receiving jurisdiction; review each template’s applicability and original-record limits.</p>
    {(catalog.loading || working.docsState === 'loading') && <EmptyState busy icon={I.fileText} title="Reading templates and working documents…" />}
    {(catalog.error || working.docsState === 'error') && <EmptyState tone="error" icon={I.alertTriangle} title="Templates or working documents could not be read"
      retry={() => { if (catalog.error) setEpoch(value => value + 1); void working.loadDocs(); }} />}
    {!catalog.loading && !catalog.error && <>
      {catalog.data?.globalCatalog === 'unavailable' && <p role="status">The shared reference store is unavailable. Loaded built-in and organization templates remain available.</p>}
      <div className="pf-list">{templates.slice(0, shown).map(template => <TemplateStart key={String(template.id)} template={template}
        programId={programId} ready={ready} docs={ready ? working.docs : []} refresh={working.refreshCreationContext} {...actions} />)}</div>
      {!templates.length && <p>No matching filing or shared templates were returned. All templates remain available through New document in Author.</p>}
      {templates.length > shown && <button type="button" className="btn ghost" onClick={() => setShown(value => value + 30)}>Show more templates</button>}
    </>}
  </section>;
}
