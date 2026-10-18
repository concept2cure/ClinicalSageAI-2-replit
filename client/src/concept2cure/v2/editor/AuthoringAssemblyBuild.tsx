import React, { useEffect, useId, useRef } from 'react';
import type { AssemblyBuildController } from './assemblyBuildState';
import { assemblySelectionKey } from './assemblySourceSelection';
import { AssemblySourcesNotice } from './AssemblySourcesNotice';
import { SavedAssemblySourcesNotice } from './SavedAssemblySourcesNotice';
export { useAuthoringAssemblyBuild } from './useAuthoringAssemblyBuild';
export type { AssemblyBuildController, AssemblyBuildOptions } from './assemblyBuildState';
const FIELD_STYLE: React.CSSProperties = { display: 'grid', minWidth: 0, gap: 'var(--space-1)' };
const CONTROL_STYLE: React.CSSProperties = { width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' };
const DETAIL_STYLE: React.CSSProperties = { minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)', overflowWrap: 'anywhere' };

function AssemblyPlanRows({ controller }: { controller: AssemblyBuildController }) {
  const plan = controller.plan;
  if (!plan) return null;
  return <div className="ed-source-detail" style={DETAIL_STYLE} data-testid="assembly-plan">
    <strong>{plan.templateName} · {plan.rows.length} selected section{plan.rows.length === 1 ? '' : 's'}</strong>
    {plan.limitations.length > 0 && <ul>{plan.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul>}
    <ol>{plan.rows.map(row => <li key={row.code}>
      <strong>{row.code} {row.title}</strong> · {row.disposition === 'preserve' ? 'Preserve existing section and text' : row.content.trim() ? 'Append stored template text' : 'Append empty section; scientific content is missing'}
      {controller.withAna && <p>{row.aiDraftable ? 'AnA can prepare a candidate only if this saved section is empty.' : `AnA drafting is unavailable: ${row.aiDraftableReason}`}</p>}
      {row.gaps.length > 0 && <ul>{row.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>}
    </li>)}</ol>
    {plan.gaps.length > 0 && <><strong>Completion gaps</strong><ul>{plan.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></>}
  </div>;
}
function AssemblyCandidates({ controller }: { controller: AssemblyBuildController }) {
  if (!controller.slots.length) return null;
  const selected = assemblySelectionKey(controller.sourceSelection);
  const remaining = controller.slots.some(slot => slot.sourceSelectionKey === selected && ['failed', 'not-started'].includes(slot.status));
  return <div className="ed-source-detail" style={DETAIL_STYLE} data-testid="assembly-candidates">
    <strong>Section candidates</strong>
    <p>Completed candidates stay here while you review another section. Each acceptance uses the existing draft review and source-lineage controls.</p>
    <ul>{controller.slots.map(slot => <li key={`${slot.section.id}:${slot.sourceSelectionKey}`}>
      <strong>{slot.section.code} {slot.section.title}</strong> · {slot.status.replace('-', ' ')}
      {slot.message && <p>{slot.message}</p>}
      {slot.sourceSelectionKey !== selected && <p>Retained from an earlier source selection. Select those same sources again before continuing this review.</p>}
      {slot.review.draft && slot.status !== 'accepted' && <button type="button" className="btn ghost authoring-oversight-action" disabled={slot.sourceSelectionKey !== selected} onClick={() => controller.review(slot.section.id)}>Review {slot.section.code}</button>}
    </li>)}</ul>
    {controller.phase === 'drafting' && <button type="button" className="btn ghost authoring-oversight-action" onClick={controller.stop}>Stop preparation</button>}
    {remaining && controller.phase !== 'drafting' && <button type="button" className="btn ghost authoring-oversight-action" disabled={controller.busy || !!controller.disabledReason || controller.phase === 'unknown'} onClick={() => void controller.retryDrafts()}>{controller.targetCode ? 'Retry selected candidate' : 'Retry remaining candidates'}</button>}
  </div>;
}
function AssemblyOptions({ controller, noteId }: { controller: AssemblyBuildController; noteId: string }) {
  const disabled = controller.busy || !!controller.disabledReason || controller.phase === 'unknown';
  return <div className="ed-source-detail" style={DETAIL_STYLE}>
    <label style={FIELD_STYLE}>Template <select className="c2c-input" style={CONTROL_STYLE} aria-describedby={noteId} value={controller.templateId} disabled={disabled || controller.rosterLoading} onChange={event => void controller.chooseTemplate(event.target.value)}>
      <option value="">Choose a template</option>
      {controller.templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
    </select></label>
    <label style={FIELD_STYLE}>Build target <select className="c2c-input" style={CONTROL_STYLE} value={controller.targetCode} disabled={disabled || !controller.outline} onChange={event => controller.chooseTarget(event.target.value)}>
      <option value="">Entire document</option>
      {controller.outline?.rows.map(row => <option key={row.code} value={row.code}>{row.code} {row.title}</option>)}
    </select></label>
    <label><input type="checkbox" checked={controller.withAna} disabled={disabled} onChange={event => controller.setWithAna(event.target.checked)} /> Draft empty eligible sections with AnA</label>
    {controller.withAna && <label style={FIELD_STYLE}>Draft requirements (optional) <input className="c2c-input" style={CONTROL_STYLE} value={controller.requirements} maxLength={2000} disabled={disabled} onChange={event => controller.setRequirements(event.target.value)} /></label>}
    <label style={FIELD_STYLE}>Reason for build <input className="c2c-input" style={CONTROL_STYLE} value={controller.reason} maxLength={2000} disabled={disabled} onChange={event => controller.setReason(event.target.value)} placeholder="Why sections are being assembled" /></label>
    <div className="authoring-oversight-actions">
      <button type="button" className="btn ghost authoring-oversight-action" disabled={disabled || !controller.templateId} onClick={() => void controller.preview()}>{controller.phase === 'previewing' ? 'Previewing…' : 'Preview build'}</button>
      <button type="button" className="btn primary authoring-oversight-action" disabled={disabled || !controller.plan || controller.reason.trim().length < 8} onClick={() => void controller.build()}>{controller.phase === 'building' ? 'Building…' : controller.targetCode ? 'Build section' : 'Build document'}</button>
    </div>
  </div>;
}
/** Existing disclosure/forms/notices; assembly always targets the one open document. */
export function AuthoringAssemblyBuild({ controller }: { controller: AssemblyBuildController }) {
  const noteId = useId();
  const disclosure = useRef<React.ElementRef<'details'> | null>(null);
  const latest = useRef(controller); latest.current = controller;
  useEffect(() => {
    if (!controller.disclosureRequest) return;
    if (disclosure.current) disclosure.current.open = true;
    void latest.current.loadTemplates();
  }, [controller.disclosureRequest, controller.sourceSelection]);
  return <section className="authoring-oversight" style={{ minWidth: 0 }} aria-label="Document assembly">
    <details ref={disclosure} className="authoring-oversight-options" onToggle={event => { if (event.currentTarget.open) void controller.loadTemplates(); }}>
      <summary className="authoring-oversight-toggle" aria-describedby={noteId}>Build document or section</summary>
      <div className="ed-source-detail" style={DETAIL_STYLE}>
        <p id={noteId}>Assemble missing template sections in this document. Existing text and section order are preserved. Without AnA, only stored template text is used; missing science stays missing. With AnA, review each candidate before accepting it.</p>
        {controller.disabledReason && <p role="status">{controller.disabledReason}</p>}
        {controller.rosterLoading && <p role="status">Loading templates…</p>}
        {controller.rosterError && <><p role="alert">{controller.rosterError}</p><button type="button" className="btn ghost authoring-oversight-action" disabled={controller.rosterLoading} onClick={() => void controller.loadTemplates()}>Retry templates</button></>}
        {controller.globalCatalogUnavailable && <p role="status">The shared reference store is unavailable. Organization and built-in templates remain listed.</p>}
        <AssemblySourcesNotice controller={controller} />
        <SavedAssemblySourcesNotice controller={controller} />
        <AssemblyOptions controller={controller} noteId={noteId} />
        {controller.message && <div className="scaf-note" role={controller.phase === 'unknown' ? 'alert' : 'status'}>{controller.message}</div>}
        {controller.phase === 'unknown' && <button type="button" className="btn ghost authoring-oversight-action" onClick={() => void controller.check()}>Check saved document</button>}
        <AssemblyPlanRows controller={controller} />
        <AssemblyCandidates controller={controller} />
      </div>
    </details>
  </section>;
}
