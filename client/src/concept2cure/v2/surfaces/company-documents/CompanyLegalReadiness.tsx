import React, { useState } from 'react';
import type { CompanyDocumentProfile, CompanyDocumentsResponse } from '@shared/company-documents';
import type { CompanyLegalReadinessResponse, CompanyLegalRequirement } from '@shared/company-legal-workflows';
import { CompanyLegalRequirementForm } from './LegalRequirementsEditor';
import { COMPANY_LEGAL_PATH, companyLegalOwner, useCompanyLegalSession, useCompanyLegalResource } from './useCompanyLegalResource';
import { companySetter, useCompanyLease } from './companySession';

export interface CompanyLegalReadinessProps {
  sequenceId: number; profile: CompanyDocumentProfile; token: string; canManage: boolean;
  onSaved: (result: CompanyDocumentsResponse) => void;
}
function validReadiness(value: unknown): value is CompanyLegalReadinessResponse {
  const data = value as CompanyLegalReadinessResponse | null;
  return Boolean(data && typeof data.ready === 'boolean' && data.target?.sequenceId && Array.isArray(data.items) && Array.isArray(data.findings));
}
export function CompanyLegalReadiness(props: CompanyLegalReadinessProps) {
  const { sequenceId, profile, token, canManage, onSaved } = props;
  const session = useCompanyLegalSession(token);
  const lease = useCompanyLease(session, `${sequenceId}:${profile.revision}`);
  const resource = useCompanyLegalResource<CompanyLegalReadinessResponse>(`${COMPANY_LEGAL_PATH}/legal-workflows/readiness?sequenceId=${sequenceId}`, token, `sequence:${sequenceId}:${profile.revision}`);
  const [editing, updateEditing] = useState<string | null>(null);
  const setEditing = companySetter(lease.current, updateEditing);
  if (!lease.current()) return null;
  const data = validReadiness(resource.data) && resource.data.target.sequenceId === sequenceId ? resource.data : null;
  const save = (result: CompanyDocumentsResponse) => { if (lease.current()) { setEditing(null); onSaved(result); resource.retry(); } };
  const editor = (requirement?: CompanyLegalRequirement) => data && <CompanyLegalRequirementForm
    key={companyLegalOwner(session, `${sequenceId}:${requirement?.id ?? 'new'}:${profile.revision}`)} profile={profile} token={token} canManage={canManage}
    onSaved={save} requirement={requirement} target={data.target} onCancel={() => setEditing(null)} />;
  return <section aria-label="Company legal companion readiness"><h4>Legal companion completeness</h4>
    <p className="company-hint">Requirements are evaluated against this sequence’s recorded program, agency and filing type. A library entry alone does not count as a placed companion.</p>
    <button type="button" className="btn ghost small" disabled={resource.loading} onClick={resource.retry}>Refresh legal companion checks</button>
    {resource.loading && <p role="status">Checking current legal versions, reviews and sequence placements…</p>}
    {resource.error && <p className="company-error" role="alert">{resource.error}</p>}
    {!resource.loading && !resource.error && !data && <p className="company-error" role="alert">Legal readiness could not be verified for this sequence. Refresh before relying on it.</p>}
    {data && <><p role="status" className="company-notice">{data.ready ? 'The reviewed company companion checks are complete.' : 'Company companion review or remediation is required.'} {data.target.agency} · {data.target.country} · {data.target.submissionType}</p>
      {data.findings.map(finding => <p key={finding} className="company-hint">{finding}</p>)}
      {data.items.map(item => <article className="company-legal-card" key={item.requirement.id}><strong>{item.requirement.title}</strong>
        <p>{item.status.replaceAll('_', ' ')}{item.requirement.sectionCode ? ` · section ${item.requirement.sectionCode}` : ''}{item.requirement.language ? ` · ${item.requirement.language}` : ''}</p>
        {item.findings.length > 0 && <ul>{item.findings.map(finding => <li key={finding}>{finding}</li>)}</ul>}
        {item.status === 'not_applicable' && <p>Review rationale: {item.requirement.rationale}</p>}
        {canManage && <button type="button" className="btn ghost small" onClick={() => setEditing(item.requirement.id)}>Review applicability and mapped versions</button>}
        {editing === item.requirement.id && editor(item.requirement)}
      </article>)}
      {canManage && <button type="button" className="btn ghost small" onClick={() => setEditing('new')}>Add a filing-specific customer requirement</button>}
      {editing === 'new' && editor()}
      <p className="company-hint">{data.disclaimer}</p>
    </>}
  </section>;
}
