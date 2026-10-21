import React, { useState } from 'react';
import { getAuthToken } from '@/utils/authToken';
import type { CompanyDocumentProfile, CompanyDocumentsResponse, CompanyLegalDocument } from '@shared/company-documents';
import { companyLegalRenewal, type CompanyLegalLifecycleResponse, type CompanyLegalWorkflowInput } from '@shared/company-legal-workflows';
import { VaultVersionPicker, type PickedVaultVersion } from '../VaultLibraryResults';
import { COMPANY_LEGAL_PATH, companyLegalOwner, useCompanyLegalAction, useCompanyLegalResource } from './useCompanyLegalResource';
import { PagedCompanyLegalPicker } from './PagedCompanyLegalPicker';

export interface LegalLifecycleEditorProps {
  document: CompanyLegalDocument; profile: CompanyDocumentProfile; token: string; canManage: boolean;
  onSaved: (result: CompanyDocumentsResponse) => void;
}
function initialWorkflow(document: CompanyLegalDocument): CompanyLegalWorkflowInput {
  const workflow = document.workflow;
  return { custodianUserId: workflow?.custodianUserId ?? null, reminderDays: workflow?.reminderDays ?? [30, 7, 0], replacementId: workflow?.replacementId ?? null,
    authority: initialAuthority(document), signatureEvidence: initialSignature(document),
    translationOfId: workflow?.translationOfId ?? null, certifiedTranslationEvidenceVaultDocumentId: workflow?.certifiedTranslationEvidence?.vaultDocumentId ?? null };
}
function initialAuthority(document: CompanyLegalDocument): CompanyLegalWorkflowInput['authority'] {
  const authority = document.workflow?.authority;
  return authority ? { signatoryName: authority.signatoryName, role: authority.role, delegationLegalDocumentId: authority.delegationLegalDocumentId,
    evidenceVaultDocumentIds: authority.evidence.map(item => item.vaultDocumentId) } : null;
}
function initialSignature(document: CompanyLegalDocument): CompanyLegalWorkflowInput['signatureEvidence'] {
  const signature = document.workflow?.signatureEvidence;
  return signature ? { method: signature.method, result: signature.result, tool: signature.tool, verifiedAt: signature.verifiedAt,
    evidenceVaultDocumentId: signature.evidence.vaultDocumentId } : null;
}
interface RelationScope { token: string; programId: string; excludeId: string }
function LegalRelation({ label, value, scope, authority, disabled, change }: { label: string; value: string | null; scope: RelationScope; authority?: boolean; disabled: boolean; change: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="company-field"><span>{label}: {value ?? 'None recorded'}</span><details onToggle={event => setOpen(event.currentTarget.open)}><summary>Choose {label.toLowerCase()}</summary>
    {open && <PagedCompanyLegalPicker label={label} token={scope.token} programId={scope.programId} excludeIds={[scope.excludeId]} allowedKinds={authority ? ['authorization', 'power_of_attorney'] : undefined}
      selected={value ? [value] : []} disabled={disabled} onChange={ids => change(ids[0] ?? null)} />}
  </details></div>;
}
function AuthorityFields({ value, change, scope, disabled }: { value: CompanyLegalWorkflowInput['authority']; change: (value: CompanyLegalWorkflowInput['authority']) => void; scope: RelationScope; disabled: boolean }) {
  return <fieldset className="company-wide"><legend>Legal signing authority</legend>
    <label className="company-check"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={event => change(event.target.checked ? { signatoryName: '', role: '', delegationLegalDocumentId: null, evidenceVaultDocumentIds: [] } : null)} />Record reviewed signing-authority evidence</label>
    {value && <><label className="company-field"><span>Signatory name</span><input value={value.signatoryName} maxLength={300} disabled={disabled} onChange={event => change({ ...value, signatoryName: event.target.value })} /></label>
      <label className="company-field"><span>Authorized role</span><input value={value.role} maxLength={300} disabled={disabled} onChange={event => change({ ...value, role: event.target.value })} /></label>
      <LegalRelation label="Delegated authority document" value={value.delegationLegalDocumentId} scope={scope} authority disabled={disabled} change={id => change({ ...value, delegationLegalDocumentId: id })} />
      <p className="company-hint">Supporting authority evidence: {value.evidenceVaultDocumentIds.length} Vault version(s) selected. Add approved evidence below.</p>
      {value.evidenceVaultDocumentIds.map(id => <p key={id}><code>{id}</code> <button type="button" className="btn ghost small" disabled={disabled} onClick={() => change({ ...value, evidenceVaultDocumentIds: value.evidenceVaultDocumentIds.filter(item => item !== id) })}>Remove authority evidence</button></p>)}
    </>}
  </fieldset>;
}
function SignatureFields({ value, change, disabled }: { value: CompanyLegalWorkflowInput['signatureEvidence']; change: (value: CompanyLegalWorkflowInput['signatureEvidence']) => void; disabled: boolean }) {
  return <fieldset className="company-wide"><legend>External signature verification evidence</legend>
    <p className="company-hint">Record a reviewed external verification report or manual evidence. This application records that evidence separately from Vault approval; it does not cryptographically validate the signature.</p>
    <label className="company-check"><input type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={event => change(event.target.checked ? {
      method: 'external_tool', result: 'inconclusive', tool: '', verifiedAt: `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`, evidenceVaultDocumentId: '' } : null)} />Record signature verification evidence</label>
    {value && <><label className="company-field"><span>Evidence method</span><select disabled={disabled} value={value.method} onChange={event => change({ ...value, method: event.target.value as typeof value.method })}><option value="external_tool">External verification tool</option><option value="manual_evidence">Reviewed manual evidence</option></select></label>
      <label className="company-field"><span>Reported result</span><select disabled={disabled} value={value.result} onChange={event => change({ ...value, result: event.target.value as typeof value.result })}><option value="inconclusive">Inconclusive</option><option value="valid">Reported valid in the evidence</option><option value="invalid">Reported invalid in the evidence</option></select></label>
      <label className="company-field"><span>Verifier or report source</span><input disabled={disabled} value={value.tool} maxLength={300} onChange={event => change({ ...value, tool: event.target.value })} /></label>
      <label className="company-field"><span>Verification date</span><input type="date" disabled={disabled} max={new Date().toISOString().slice(0, 10)} value={value.verifiedAt.slice(0, 10)} onChange={event => change({ ...value, verifiedAt: event.target.value ? `${event.target.value}T00:00:00.000Z` : '' })} /></label>
      <p className="company-hint">Verification evidence: {value.evidenceVaultDocumentId || 'Choose an approved Vault report below.'}</p>
    </>}
  </fieldset>;
}
function LegalEvidencePicker({ document, workflow, change, disabled }: { document: CompanyLegalDocument; workflow: CompanyLegalWorkflowInput; change: (value: CompanyLegalWorkflowInput) => void; disabled: boolean }) {
  const [purpose, setPurpose] = useState<'authority' | 'signature' | 'translation'>('authority');
  const [message, setMessage] = useState('');
  const choose = (hit: PickedVaultVersion) => {
    if (hit.programId !== document.programId) { setMessage('Choose approved evidence from the same program as this legal document.'); return; }
    if (purpose === 'authority' && workflow.authority) change({ ...workflow, authority: { ...workflow.authority, evidenceVaultDocumentIds: [...new Set([...workflow.authority.evidenceVaultDocumentIds, hit.id])] } });
    else if (purpose === 'signature' && workflow.signatureEvidence) change({ ...workflow, signatureEvidence: { ...workflow.signatureEvidence, evidenceVaultDocumentId: hit.id } });
    else if (purpose === 'translation' && workflow.translationOfId) change({ ...workflow, certifiedTranslationEvidenceVaultDocumentId: hit.id });
    else { setMessage('Enable the corresponding authority/signature review or select a translation source before adding its evidence.'); return; }
    setMessage(`Selected “${hit.title}” as ${purpose} evidence. Its current approval and exact version will be checked when saved.`);
  };
  return <details className="company-wide"><summary>Add supporting Vault evidence</summary>
    <label className="company-field"><span>Use selected evidence for</span><select value={purpose} disabled={disabled} onChange={event => setPurpose(event.target.value as typeof purpose)}><option value="authority">Signing authority</option><option value="signature">External signature verification</option><option value="translation">Certified translation</option></select></label>
    <VaultVersionPicker programId={document.programId} disabled={disabled} onChoose={choose} />{message && <p role="status">{message}</p>}
  </details>;
}
function useLifecycleModel(props: LegalLifecycleEditorProps) {
  const { document, profile, token, canManage, onSaved } = props;
  const [workflow, setWorkflow] = useState(() => initialWorkflow(document));
  const [reminders, setReminders] = useState(workflow.reminderDays.join(', '));
  const [reason, setReason] = useState('');
  const [revoke, setRevoke] = useState(false);
  const action = useCompanyLegalAction(token, document.id, onSaved);
  const lifecycle = useCompanyLegalResource<CompanyLegalLifecycleResponse>(`${COMPANY_LEGAL_PATH}/legal-documents/${encodeURIComponent(document.id)}/lifecycle`, token, `${document.id}:${profile.revision}`);
  const members = useCompanyLegalResource<{ data: Array<{ id: string; name: string }> }>(`${COMPANY_LEGAL_PATH}/legal-documents/${encodeURIComponent(document.id)}/custodians`, token, `${document.id}:${profile.revision}`, canManage);
  const scope = { token, programId: document.programId, excludeId: document.id };
  const renewal = lifecycle.data?.renewal ?? companyLegalRenewal(document);
  const days = reminders.split(',').map(value => value.trim()).filter(Boolean).map(Number);
  const reminderValid = days.length <= 12 && days.every(value => Number.isInteger(value) && value >= 0 && value <= 730);
  const disabled = !canManage || action.busy;
  const save = () => action.run('PUT', `${COMPANY_LEGAL_PATH}/legal-documents/${encodeURIComponent(document.id)}/lifecycle`, {
    expectedRevision: profile.revision, reason: reason.trim(), workflow: { ...workflow, reminderDays: days, ...(revoke ? { revocation: { reason: reason.trim() } } : {}) },
  });
  return { props, workflow, setWorkflow, reminders, setReminders, reason, setReason, revoke, setRevoke, action, lifecycle, members, scope, renewal, reminderValid, disabled, save };
}
type LifecycleModel = ReturnType<typeof useLifecycleModel>;
function LifecycleRenewalStatus({ model }: { model: LifecycleModel }) {
  const { renewal, props: { document } } = model;
  return <>
    <p className="company-hint company-wide" role="status">Renewal: {renewal.status.replaceAll('_', ' ')}{renewal.dueOn ? ` · task due ${renewal.dueOn}` : ''}{renewal.daysRemaining !== null ? ` · ${renewal.daysRemaining} day(s) until expiry` : ''}.</p>
    {document.workflow?.revokedAt && <p className="company-notice company-error company-wide">Revoked on {document.workflow.revokedAt.slice(0, 10)}. This exact version remains refused for filing, including after archival.</p>}
  </>;
}
function LifecycleCustodian({ model }: { model: LifecycleModel }) {
  const { workflow, setWorkflow, disabled, members, reminders, setReminders, reminderValid } = model;
  return <>
    <label className="company-field"><span>Renewal custodian</span><select value={workflow.custodianUserId ?? ''} disabled={disabled || members.loading || Boolean(members.error)} onChange={event => setWorkflow({ ...workflow, custodianUserId: event.target.value || null })}>
      <option value="">Unassigned</option>{workflow.custodianUserId && !members.data?.data.some(member => member.id === workflow.custodianUserId) && <option value={workflow.custodianUserId}>Assigned member {workflow.custodianUserId}</option>}
      {members.data?.data.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
    </select></label>
    <label className="company-field"><span>Reminder days before expiry</span><input value={reminders} disabled={disabled} onChange={event => setReminders(event.target.value)} placeholder="30, 7, 0" /></label>
    {!reminderValid && <p className="company-error company-wide" role="alert">Use up to 12 whole-day intervals between 0 and 730, separated by commas.</p>}
    {members.error && <p className="company-error company-wide" role="alert">{members.error} <button type="button" onClick={members.retry}>Retry custodian list</button></p>}
  </>;
}
function LifecycleRelations({ model }: { model: LifecycleModel }) {
  const { workflow, setWorkflow, scope, disabled } = model;
  return <>
    <LegalRelation label="Replacement legal version" value={workflow.replacementId} scope={scope} disabled={disabled} change={id => setWorkflow({ ...workflow, replacementId: id })} />
    <LegalRelation label="Translation of legal original" value={workflow.translationOfId} scope={scope} disabled={disabled} change={id => setWorkflow({ ...workflow, translationOfId: id, ...(id ? {} : { certifiedTranslationEvidenceVaultDocumentId: null }) })} />
    {workflow.translationOfId && <p className="company-hint company-wide">Certified-translation evidence: {workflow.certifiedTranslationEvidenceVaultDocumentId || 'Not linked. Select approved evidence below.'}</p>}
  </>;
}
function LifecycleActions({ model }: { model: LifecycleModel }) {
  const { props: { document, profile, canManage }, revoke, setRevoke, disabled, reason, setReason, action, reminderValid, save } = model;
  if (!canManage) return null;
  return <>
    {!document.workflow?.revokedAt && <label className="company-check company-wide"><input type="checkbox" checked={revoke} disabled={disabled} onChange={event => setRevoke(event.target.checked)} />Revoke this exact legal version. It will be refused for filing; affected placements remain visible for corrective action.</label>}
    <label className="company-field company-wide"><span>Reason for lifecycle change or reminder</span><textarea value={reason} maxLength={2000} disabled={action.busy} onChange={event => setReason(event.target.value)} /></label>
      <div className="company-actions company-wide"><button type="button" className="btn" disabled={action.busy || !reminderValid || reason.trim().length < 8} onClick={() => void save()}>{action.busy ? 'Recording…' : revoke ? 'Record revocation and lifecycle' : 'Save legal lifecycle'}</button>
        <button type="button" className="btn ghost small" disabled={action.busy || reason.trim().length < 8} onClick={() => void action.run('POST', `${COMPANY_LEGAL_PATH}/legal-documents/${encodeURIComponent(document.id)}/remind`, { expectedRevision: profile.revision, reason: reason.trim() })}>Refresh saved renewal reminder</button></div>
      <p className="company-hint company-wide">In-app reminders use saved intervals and current custodian access. The existing hourly task sweep delivers due reminders. Saving a replacement link does not withdraw an original; record revocation explicitly when needed.</p>
  </>;
}
function LifecyclePlacements({ model }: { model: LifecycleModel }) {
  const { lifecycle, props: { document } } = model;
  return <section className="company-wide" aria-label="Affected submission placements"><h4>Affected filings</h4>
      {lifecycle.data?.evidenceUnavailable && <p className="company-error" role="alert">Supporting legal-review evidence is no longer available at its recorded approved version. Review and record current evidence before relying on that review.</p>}
      {lifecycle.loading && <p role="status">Checking current placements…</p>}{lifecycle.error && <p role="alert">{lifecycle.error} <button type="button" onClick={lifecycle.retry}>Retry affected filings</button></p>}
      {lifecycle.data?.placements.length === 0 && <p>No current submission placements are recorded for this exact Vault version.</p>}
      {lifecycle.data?.placements.map(placement => <p key={placement.leafId}><a href={`/concept2cure/submission-center?submissionId=${placement.submissionId}&sequenceId=${placement.sequenceId}&program=${document.programId}`}>{placement.submissionTitle || `Submission ${placement.submissionId}`} · sequence {placement.sequenceNumber || placement.sequenceId}</a> · {placement.sectionCode} · {placement.operation} · {placement.sequenceStatus}{placement.dispatchStatus ? ` / ${placement.dispatchStatus}` : ''}</p>)}
      <AdditionalLegalUses data={lifecycle.data} />
    </section>;
}
function AdditionalLegalUses({ data }: { data: CompanyLegalLifecycleResponse | null }) {
  if (!data) return null;
  return <>
    <h5>Official eSTAR exports</h5>
    {data.estarUses?.length === 0 && <p>No recorded official eSTAR export uses this exact version.</p>}
    {data.estarUses?.map(use => <p key={`${use.record}:${use.recordId}:${use.slot}`}>{use.exportedAt.slice(0, 10)} · {use.fileName || 'Official eSTAR attachment'} · {use.slot || use.chapter || 'Attachment'} · receipt {use.recordId}{use.retainedAs ? ` · retained as ${use.retainedAs.documentCode || use.retainedAs.documentId}, v${use.retainedAs.version || 'not recorded'}` : ''}</p>)}
    <h5>CMC evidence dependencies</h5>
    {data.cmcEvidence?.length === 0 && <p>No current CMC evidence record cites this exact version.</p>}
    {data.cmcEvidence?.map(use => <p key={use.linkId}>{use.sourceType} · {use.sourceKey} · compiled sections: {use.sections.join(', ') || 'none recorded'}</p>)}
  </>;
}
function LifecycleForm(props: LegalLifecycleEditorProps) {
  const model = useLifecycleModel(props);
  const { workflow, setWorkflow, scope, disabled, action } = model;
  return <div className="company-fields">
    <LifecycleRenewalStatus model={model} /><LifecycleCustodian model={model} /><LifecycleRelations model={model} />
    <AuthorityFields value={workflow.authority} scope={scope} disabled={disabled} change={value => setWorkflow({ ...workflow, authority: value })} />
    <SignatureFields value={workflow.signatureEvidence} disabled={disabled} change={value => setWorkflow({ ...workflow, signatureEvidence: value })} />
    {props.canManage && <LegalEvidencePicker document={props.document} workflow={workflow} disabled={disabled} change={setWorkflow} />}
    <LifecycleActions model={model} />
    {action.notice && <p className={`company-notice company-wide${action.error ? ' company-error' : ''}`} role={action.error ? 'alert' : 'status'}>{action.notice}</p>}
    <LifecyclePlacements model={model} />
  </div>;
}
export function LegalLifecycleEditor(props: LegalLifecycleEditorProps) {
  const [open, setOpen] = useState(false);
  if (props.token !== getAuthToken()) return null;
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Lifecycle, signing evidence and affected filings</summary>
    {open && <LifecycleForm key={companyLegalOwner(props.token, `${props.document.id}:${props.profile.revision}`)} {...props} />}
  </details>;
}
