import React, { useState } from 'react';
import { COMPANY_LEGAL_KINDS, type CompanyDocumentProfile, type CompanyDocumentsResponse, type CompanyLegalKind } from '@shared/company-documents';
import type { CompanyLegalRequirement, CompanyLegalReadinessResponse } from '@shared/company-legal-workflows';
import { CompanyScopePicker } from './CompanyScopePicker';
import { COMPANY_LEGAL_PATH, companyLegalOwner, useCompanyLegalAction, useCompanyLegalSession } from './useCompanyLegalResource';
import { PagedCompanyLegalPicker } from './PagedCompanyLegalPicker';
import { companySetter, useCompanyLease } from './companySession';

export interface LegalRequirementsEditorProps {
  profile: CompanyDocumentProfile; token: string; canManage: boolean; onSaved: (result: CompanyDocumentsResponse) => void;
}
interface RequirementFormProps extends LegalRequirementsEditorProps {
  requirement?: CompanyLegalRequirement; target?: CompanyLegalReadinessResponse['target']; onCancel?: () => void;
}
const label = (value: string) => value.replaceAll('_', ' ');
function useRequirementDraft(requirement?: CompanyLegalRequirement, target?: CompanyLegalReadinessResponse['target']) {
  return useState(() => ({ ...initialRequirementDetails(requirement), ...initialRequirementScopes(requirement, target), ...initialRequirementReviews(requirement) }));
}
function initialRequirementDetails(requirement?: CompanyLegalRequirement) {
  return { title: requirement?.title ?? '', kind: requirement?.kind ?? 'authorization' as CompanyLegalKind,
    language: requirement?.language ?? '', sectionCode: requirement?.sectionCode ?? '' };
}
function initialRequirementScopes(requirement?: CompanyLegalRequirement, target?: CompanyLegalReadinessResponse['target']) {
  if (target) return { agencies: target.agency, countries: target.country, submissionTypes: target.submissionType };
  if (requirement) return { agencies: requirement.agencies.join(', '), countries: requirement.countries.join(', '), submissionTypes: requirement.submissionTypes.join(', ') };
  return { agencies: '', countries: '', submissionTypes: '' };
}
function initialRequirementReviews(requirement?: CompanyLegalRequirement) {
  return { applicability: requirement?.applicability ?? 'unresolved' as CompanyLegalRequirement['applicability'], rationale: '',
    legalDocumentIds: requirement?.legalDocumentIds ?? [], requiresAuthority: requirement?.requiresAuthority ?? false,
    requiresSignatureEvidence: requirement?.requiresSignatureEvidence ?? false, requiresCertifiedTranslation: requirement?.requiresCertifiedTranslation ?? false };
}
function RequirementDocumentChoices({ token, target, kind, selected, disabled, change }: {
  token: string; target?: CompanyLegalReadinessResponse['target']; kind: CompanyLegalKind; selected: string[]; disabled: boolean; change: (ids: string[]) => void;
}) {
  return <PagedCompanyLegalPicker key={`${target?.programId ?? 'accessible'}:${kind}`} label="Map exact legal versions" token={token} programId={target?.programId}
    kind={kind} selected={selected} multiple disabled={disabled} onChange={change} />;
}
function RequirementReviewFooter({ action, title, rationale, save, onCancel }: {
  action: ReturnType<typeof useCompanyLegalAction>; title: string; rationale: string; save: () => Promise<void>; onCancel?: () => void;
}) {
  return <>
    <div className="company-actions company-wide"><button type="button" className="btn" disabled={action.busy || rationale.trim().length < 8 || !title.trim()} onClick={() => void save()}>{action.busy ? 'Recording review…' : 'Record requirement review'}</button>{onCancel && <button type="button" className="btn ghost small" disabled={action.busy} onClick={onCancel}>Close requirement editor</button>}</div>
    {action.notice && <p className={`company-notice company-wide${action.error ? ' company-error' : ''}`} role={action.error ? 'alert' : 'status'}>{action.notice}</p>}
  </>;
}
export function CompanyLegalRequirementForm({ profile, token, canManage, onSaved, requirement, target, onCancel }: RequirementFormProps) {
  const session = useCompanyLegalSession(token);
  const [draft, updateDraft] = useRequirementDraft(requirement, target);
  const action = useCompanyLegalAction(token, `${requirement?.id ?? 'new'}:${target?.sequenceId ?? 'library'}:${profile.revision}`, onSaved);
  const setDraft = companySetter(action.current, updateDraft);
  const regional = requirement?.source === 'regional';
  const change = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const csv = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
  const save = async () => {
    const result = await action.run('POST', `${COMPANY_LEGAL_PATH}/legal-workflows/requirements`, { expectedRevision: profile.revision,
      reason: draft.rationale.trim(), requirement: { ...(requirement ? { id: requirement.id } : {}), title: draft.title.trim(), source: requirement?.source ?? 'customer',
        sequenceId: target?.sequenceId ?? requirement?.sequenceId ?? null,
        regionalCode: requirement?.regionalCode ?? null, kind: draft.kind, agencies: csv(draft.agencies), countries: csv(draft.countries), submissionTypes: csv(draft.submissionTypes),
        language: draft.language.trim() || null, sectionCode: draft.sectionCode.trim() || null, applicability: draft.applicability, rationale: draft.rationale.trim(), legalDocumentIds: draft.legalDocumentIds,
        requiresAuthority: draft.requiresAuthority, requiresSignatureEvidence: draft.requiresSignatureEvidence, requiresCertifiedTranslation: draft.requiresCertifiedTranslation } });
    if (result && action.current()) onCancel?.();
  };
  if (!canManage || !session.current()) return null;
  return <div className="company-fields">
    <label className="company-field company-wide"><span>Requirement title</span><input value={draft.title} maxLength={500} disabled={regional || action.busy} onChange={event => change('title', event.target.value)} /></label>
    <label className="company-field"><span>Required document kind</span><select value={draft.kind} disabled={action.busy || regional} onChange={event => setDraft(previous => ({ ...previous, kind: event.target.value as CompanyLegalKind, legalDocumentIds: [] }))}>{COMPANY_LEGAL_KINDS.map(kind => <option key={kind} value={kind}>{label(kind)}</option>)}</select></label>
    <label className="company-field"><span>Applicability review</span><select value={draft.applicability} disabled={action.busy} onChange={event => change('applicability', event.target.value as typeof draft.applicability)}><option value="unresolved">Unresolved — review needed</option><option value="required">Required</option><option value="not_applicable">Not applicable with rationale</option></select></label>
    {regional ? <p className="company-hint company-wide">Regional checklist: {draft.agencies} · {draft.countries} · {draft.submissionTypes}. This mapping is reviewed for this initial marketing filing type.</p> : <>
      <CompanyScopePicker label="Requirement agencies" kind="agency" value={draft.agencies} onChange={value => change('agencies', value)} />
      <CompanyScopePicker label="Requirement countries and regions" kind="country" value={draft.countries} onChange={value => change('countries', value)} />
      <CompanyScopePicker label="Requirement submission types" kind="submissionType" value={draft.submissionTypes} onChange={value => change('submissionTypes', value)} />
    </>}
    <label className="company-field"><span>Required language, if specified</span><input value={draft.language} maxLength={50} disabled={action.busy} placeholder="For example en or ja" onChange={event => change('language', event.target.value)} /></label>
    <label className="company-field"><span>Required sequence section, if specified</span><input value={draft.sectionCode} maxLength={64} disabled={regional || action.busy} placeholder="For example m1.2" onChange={event => change('sectionCode', event.target.value)} /></label>
    <fieldset className="company-wide"><legend>Required supporting reviews</legend>
      <label className="company-check"><input type="checkbox" checked={draft.requiresAuthority} disabled={action.busy} onChange={event => change('requiresAuthority', event.target.checked)} />Reviewed signing-authority evidence</label>
      <label className="company-check"><input type="checkbox" checked={draft.requiresSignatureEvidence} disabled={action.busy} onChange={event => change('requiresSignatureEvidence', event.target.checked)} />Reviewed external evidence reporting a valid signature</label>
      <label className="company-check"><input type="checkbox" checked={draft.requiresCertifiedTranslation} disabled={action.busy} onChange={event => change('requiresCertifiedTranslation', event.target.checked)} />Certified translation linked to its original</label>
    </fieldset>
    <RequirementDocumentChoices token={token} target={target} kind={draft.kind} selected={draft.legalDocumentIds} disabled={action.busy} change={ids => change('legalDocumentIds', ids)} />
    <label className="company-field company-wide"><span>Review rationale and reason for change</span><textarea value={draft.rationale} maxLength={2000} disabled={action.busy} placeholder="Explain the agency checklist, sponsor requirement or basis for a not-applicable decision." onChange={event => change('rationale', event.target.value)} /></label>
    <RequirementReviewFooter action={action} title={draft.title} rationale={draft.rationale} save={save} onCancel={onCancel} />
  </div>;
}
export function LegalRequirementsEditor(props: LegalRequirementsEditorProps) {
  const session = useCompanyLegalSession(props.token);
  const lease = useCompanyLease(session, String(props.profile.revision));
  const [editing, updateEditing] = useState<string | null>(null);
  const setEditing = companySetter(lease.current, updateEditing);
  if (!lease.current()) return null;
  const requirements = props.profile.legalRequirements ?? [];
  return <section aria-label="Reviewed legal requirements"><h3>Legal companion requirements</h3>
    <p className="company-hint">Maintain sponsor requirements here. Review the regional checklist against an actual filing in Submission Center; unknown applicability remains unresolved.</p>
    {requirements.length === 0 && <p>No reviewed requirements are recorded. An unrestricted document scope does not establish filing completeness.</p>}
    {requirements.map(requirement => <article className="company-legal-card" key={requirement.id}><strong>{requirement.title}</strong><p>{label(requirement.applicability)} · {label(requirement.kind)} · {requirement.agencies.join(', ') || 'all agencies'} · {requirement.legalDocumentIds.length} visible mapped version(s)</p>
      <p>{requirement.rationale}</p><small>{requirement.reviewedBy && requirement.reviewedAt ? `Reviewed ${requirement.reviewedAt.slice(0, 10)}` : 'No legal review recorded'}{requirement.language ? ` · ${requirement.language}` : ''}</small>
      {requirement.sequenceId && <p className="company-hint">Bound to sequence {requirement.sequenceId}. Changes are checked against that filing’s current access and recorded target.</p>}
      {props.canManage && <button type="button" className="btn ghost small" onClick={() => setEditing(requirement.id)}>Review requirement</button>}
      {editing === requirement.id && <CompanyLegalRequirementForm key={companyLegalOwner(session, `${requirement.id}:${props.profile.revision}`)} {...props} requirement={requirement} onCancel={() => setEditing(null)} />}
    </article>)}
    {props.canManage && <button type="button" className="btn ghost small" onClick={() => setEditing('new')}>Add customer legal requirement</button>}
    {editing === 'new' && <CompanyLegalRequirementForm key={companyLegalOwner(session, `new:${props.profile.revision}`)} {...props} onCancel={() => setEditing(null)} />}
  </section>;
}
