/** Deferred variation assessment: the server's canonical classifier, never a
 * browser risk bucket standing in for a filing rule. Launch scope refuses it. */
import React from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { useAuthoringHandoff, openSavedAuthoring } from '../authoringHandoff';
import { AuthoringHandoffNotice } from '../AuthoringHandoffNotice';
import type { VariationClassification, VariationInput } from '../../../../../server/services/cmc/supac-classifier';
import { cmcProjectUuid } from './cmcShared';

const FAMILIES = ['immediate_release_oral_solid', 'modified_release_oral_solid', 'nonsterile_semisolid', 'sterile_injectable', 'biologic', 'inhalation', 'transdermal', 'other'] as const;
const CATEGORIES = ['components_composition', 'manufacturing_site', 'scale_up', 'manufacturing_process', 'equipment', 'container_closure', 'specifications', 'analytical_method', 'stability_protocol'] as const;
const FDA: Record<string, string> = { annual_report: 'Annual Report', cbe_30: 'CBE-30', cbe_0: 'CBE-0', pas: 'Prior-Approval Supplement (PAS)', no_filing: 'No filing' };
const EMA: Record<string, string> = { type_ia: 'Type IA', type_ia_in: 'Type IA (immediate notification)', type_ib: 'Type IB', type_ii: 'Type II', not_applicable: 'Not applicable' };
const readable = (value: string) => value.replace(/_/g, ' ');

function variationReady(input: Partial<VariationInput>, critical: string): boolean {
  if (!input.description?.trim() || !input.dosageFormFamily || !input.changeCategory || !input.affects || critical === '') return false;
  const factors: Partial<Record<NonNullable<VariationInput['changeCategory']>, keyof VariationInput>> = {
    scale_up: 'scaleChangeFactor', components_composition: 'excipientLevelChange', manufacturing_site: 'siteChangeKind', manufacturing_process: 'processChangeKind', equipment: 'processChangeKind',
  };
  const needed = factors[input.changeCategory];
  return !needed || !!input[needed];
}

function memo(result: VariationClassification, description: string): string {
  return `# Regulatory Change Impact Assessment\n\nDraft assessment of a proposed postapproval change. Regulatory review is required before reliance or implementation.\n\n${description}\n\n## Filing categories returned by the classifier\n\n- FDA: ${FDA[result.fdaReportingCategory] ?? result.fdaReportingCategory}\n- EMA: ${EMA[result.emaVariationCategory] ?? result.emaVariationCategory}\n- SUPAC tier: ${result.supacTier}\n- Bioequivalence: ${result.bioequivalence}\n\n## Rationale\n\n${result.rationale.map((item) => `- ${item}`).join('\n')}\n\n## Required supporting work returned by the classifier\n\n${result.validationRequirements.map((item) => `- ${item}`).join('\n')}\n\n## Affected sections\n\n${result.impactedCtdSections.join(', ')}\n\n## Sources\n\n${result.citations.map((item) => `- ${item}`).join('\n')}\n\nNo other market was classified. This assessment does not authorize a filing or implementation.`;
}

function isClassification(value: unknown): value is VariationClassification {
  const v = value as Partial<VariationClassification> | null;
  return !!v && typeof v.fdaReportingCategory === 'string' && typeof v.emaVariationCategory === 'string' && Array.isArray(v.rationale) && Array.isArray(v.validationRequirements) && Array.isArray(v.impactedCtdSections) && Array.isArray(v.citations);
}

/**
 * The body POST /api/cmc-changes takes: the classifier's own inputs, so the
 * recorded change is projected on read through the same classifier
 * (server/routes/cmc-changes.routes.ts, `projectCmcChanges`). Its title is the
 * description's first line, as typed. The CMC project in context goes with it,
 * so the route files the change's Module 3 source and marks the sections it
 * touches stale.
 */
export function proposedChangeBody(input: Partial<VariationInput>, critical: string, projectId: string | undefined): Record<string, unknown> {
  const description = (input.description ?? '').trim();
  return {
    title: description.split('\n')[0].slice(0, 160),
    description,
    dosageFormFamily: input.dosageFormFamily,
    changeCategory: input.changeCategory,
    affects: input.affects,
    touchesCriticalStep: critical === 'yes',
    ...(input.scaleChangeFactor ? { scaleChangeFactor: input.scaleChangeFactor } : {}),
    ...(input.excipientLevelChange ? { excipientLevelChange: input.excipientLevelChange } : {}),
    ...(input.siteChangeKind ? { siteChangeKind: input.siteChangeKind } : {}),
    ...(input.processChangeKind ? { processChangeKind: input.processChangeKind } : {}),
    ...(projectId ? { cmcProjectId: projectId } : {}),
  };
}

/** What recording the change did about Module 3, from the route's own `meta.module3WriteThrough`. */
function recordedSentence(linked: unknown): string {
  const tail =
    linked === 'recorded' ? ' The Module 3 sections it touches are marked for rebuild.'
      : linked === 'failed' ? ' It could not be linked to Module 3; the change itself is saved.'
        : ' No project is open, so it is not linked to a Module 3.';
  return 'Recorded as a proposed change, with this classification.' + tail;
}

/**
 * POST /api/cmc-changes (P-122: it had no caller). The proposed-change store
 * the Lifecycle "CMC change control" card lists; the route audits the proposal
 * and, with a project, writes it through to Module 3. Recorded once per
 * assessment: `reset` clears it when an input changes.
 */
function useProposedChange(onError: (message: string) => void) {
  const [recorded, setRecorded] = React.useState<string | null>(null);
  const record = async (body: Record<string, unknown>) => {
    try {
      const response = await apiRequest('POST', '/api/cmc-changes', body);
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(serverMessage(json) ?? 'The proposed change was refused.');
      setRecorded(recordedSentence(json?.meta?.module3WriteThrough));
    } catch (err) { onError(err instanceof Error ? err.message : 'The proposed change could not be recorded.'); }
  };
  return { recorded, record, reset: () => setRecorded(null) };
}

/** The record control and what recording did, under the classification it records. */
function RecordProposedChange({ busy, recorded, onRecord }: { busy: boolean; recorded: string | null; onRecord: () => void }) {
  return <>
    <button type="button" className="btn ghost small" disabled={busy || recorded != null} onClick={onRecord}>Record this proposed change</button>
    {recorded && <p role="status" style={{ marginTop: 8 }}>{recorded}</p>}
  </>;
}

export function CmcVariationAssessment({ nav, followup }: { nav?: (id: string) => void; followup?: (sections: string[]) => React.ReactNode }) {
  const handoff = useAuthoringHandoff();
  const [input, setInput] = React.useState<Partial<VariationInput>>({});
  const [critical, setCritical] = React.useState('');
  const [result, setResult] = React.useState<VariationClassification | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const proposed = useProposedChange(setNote);
  const category = input.changeCategory;
  const patch = (key: keyof VariationInput, value: string) => { setInput((old) => ({ ...old, [key]: value })); setResult(null); proposed.reset(); };
  const complete = variationReady(input, critical);

  const select = (label: string, key: keyof VariationInput, options: readonly string[]) => (
    <label style={{ display: 'grid', gap: 4 }}>{label}<select className="de-select" aria-label={label} value={String(input[key] ?? '')} onChange={(event) => patch(key, event.target.value)}><option value="">Choose…</option>{options.map((value) => <option key={value} value={value}>{readable(value)}</option>)}</select></label>
  );
  const assess = async () => {
    if (!complete || busy) return;
    setBusy(true); setNote(null); setResult(null);
    try {
      const response = await apiRequest('POST', '/api/cmc/variations/classify', { ...input, touchesCriticalStep: critical === 'yes' });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(serverMessage(json) ?? 'The variation assessment was refused.');
      if (!isClassification(json?.data)) throw new Error('The classifier returned no readable assessment.');
      setResult(json.data);
    } catch (err) { setNote(err instanceof Error ? err.message : 'The variation assessment could not be run.'); }
    finally { setBusy(false); }
  };
  const record = async () => {
    if (!result || busy || proposed.recorded) return;
    setBusy(true); setNote(null);
    try { await proposed.record(proposedChangeBody(input, critical, cmcProjectUuid())); } finally { setBusy(false); }
  };
  const openEditor = async () => {
    if (!result || busy || handoff.blocked) return;
    setBusy(true);
    try {
      const saved = await handoff.save({ title: 'Regulatory Change Impact Assessment', module: 'M3', code: 'regulatory_change_impact_assessment', content: memo(result, input.description ?? ''), subject: 'the assessment' });
      if (!saved.ok) setNote(saved.message);
      else if (nav) openSavedAuthoring(saved, nav);
    } finally { setBusy(false); }
  };

  return <div className="pj-card">
    <div className="pj-card-h"><span className="t">Deferred postapproval variation assessment</span></div>
    <div className="pj-card-b">
      <p>This assessment is available because this deployment explicitly permits deferred capabilities. It classifies the supplied change for FDA and EMA only; it is not an IND amendment or an authorization to implement.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {select('Dosage form', 'dosageFormFamily', FAMILIES)}
        {select('Change category', 'changeCategory', CATEGORIES)}
        {select('Material affected', 'affects', ['drug_substance', 'drug_product', 'both'])}
        <label>Touches a critical step<select className="de-select" aria-label="Touches a critical step" value={critical} onChange={(event) => { setCritical(event.target.value); setResult(null); }}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        {category === 'scale_up' && select('Scale change', 'scaleChangeFactor', ['within_10x', 'gt_10x'])}
        {category === 'components_composition' && select('SUPAC excipient change level', 'excipientLevelChange', ['level_1', 'level_2', 'level_3'])}
        {category === 'manufacturing_site' && select('Site change', 'siteChangeKind', ['within_same_facility', 'contiguous_site', 'different_site_same_country', 'different_country'])}
        {['manufacturing_process', 'equipment'].includes(category ?? '') && select('Process change', 'processChangeKind', ['minor_in_kind', 'equipment_class_change', 'principle_change'])}
      </div>
      <label style={{ display: 'grid', marginTop: 12 }}>Change description<textarea className="ra-ta" aria-label="Change description" placeholder="e.g. switch the drug-substance supplier after marketing approval" value={input.description ?? ''} onChange={(event) => patch('description', event.target.value)} /></label>
      <button type="button" className="reg-cta" style={{ marginTop: 12 }} disabled={!complete || busy} onClick={() => void assess()}>{busy ? 'Assessing…' : 'Assess proposed variation'}</button>
      <AuthoringHandoffNotice handoff={handoff} onNav={nav} />
      {note && <div role="alert" style={{ marginTop: 12 }}>{note}</div>}
      {result && <div style={{ marginTop: 16 }}>
        {followup?.(result.impactedCtdSections)}
        <h3>Regulatory Change Impact Assessment</h3>
        <p>FDA: <b>{FDA[result.fdaReportingCategory] ?? result.fdaReportingCategory}</b> · EMA: <b>{EMA[result.emaVariationCategory] ?? result.emaVariationCategory}</b></p>
        <ul>{result.rationale.map((item) => <li key={item}>{item}</li>)}</ul>
        <p>Affected sections: {result.impactedCtdSections.join(', ')}</p>
        <ul>{result.validationRequirements.map((item) => <li key={item}>{item}</li>)}</ul>
        <p>Sources: {result.citations.join('; ')}</p>
        <button type="button" className="nda-open" disabled={busy || handoff.blocked} onClick={() => void openEditor()}>Open draft assessment in editor</button>
        {' '}
        <RecordProposedChange busy={busy} recorded={proposed.recorded} onRecord={() => void record()} />
      </div>}
    </div>
  </div>;
}
