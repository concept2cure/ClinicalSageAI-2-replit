import React, { useState } from 'react';
import type { CompanyDesignDetail as DesignDetail } from '@shared/company-document-designs';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { apiErrorText } from '../../apiCall';
import { downloadBlob, safeFileName } from '../../download';
import { COMPANY_DOCUMENTS_PATH, type CompanyDocumentSettingsModel } from '../useCompanyDocumentSettings';
import { CompanyLetterheadPreview } from './CompanyLetterheadPreview';
import { useCompanyResource } from './useCompanyResource';
import { CompanyDefaultDesignActivation } from './CompanyDefaultDesignActivation';

export function companyDesignDetailOf(value: unknown): DesignDetail | null {
  const detail = (value as { data?: DesignDetail } | null)?.data;
  return detail?.design && typeof detail.design.id === 'string' && typeof detail.design.sha256 === 'string' && detail.candidate?.letterhead?.specVersion === 1 && Array.isArray(detail.changedFields) && typeof detail.canReview === 'boolean' && typeof detail.canPublish === 'boolean' && typeof detail.canActivateDefault === 'boolean' ? detail : null;
}
function DesignReviewActions({ detail, revision, canManage, resource, onChanged }: {
  detail: DesignDetail; revision: number; canManage: boolean; resource: ReturnType<typeof useCompanyResource<DesignDetail>>; onChanged: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const target = `${COMPANY_DOCUMENTS_PATH}/designs/${encodeURIComponent(detail.design.id)}`;
  const run = async (action: 'review' | 'publish') => {
    if (busy || !canManage || reason.trim().length < 8) return;
    setBusy(true); setNotice(null);
    const result = await resource.call('POST', `${target}/${action}`, { expectedHash: detail.design.sha256, reason: reason.trim(), ...(action === 'publish' ? { expectedRevision: revision } : {}) });
    if (!result) return;
    setBusy(false);
    if (!result.ok || !companyDesignDetailOf(result.body)) { setNotice({ error: true, text: apiErrorText(result, 'The design action could not be confirmed. Your reason is retained.') }); return; }
    setReason(''); onChanged(action === 'review' ? 'Independent design review recorded.' : 'Named variant published. The organization default remains unchanged.'); resource.reload();
  };
  const proof = async () => {
    setBusy(true); setNotice(null);
    const result = await resource.file(`${target}/proof`, { expectedHash: detail.design.sha256 });
    if (!result) return;
    setBusy(false);
    if (!result.blob) { setNotice({ error: true, text: result.error }); return; }
    const ok = downloadBlob(`${safeFileName(detail.design.name)}-design-proof.docx`, result.blob);
    setNotice({ error: !ok, text: ok ? 'Named design proof downloaded for review. Downloading does not publish or activate it.' : 'The browser could not save the design proof.' });
  };
  return <div className="company-register">
    <button type="button" className="btn ghost small" disabled={busy} onClick={() => void proof()}>Download named design proof</button>
    {detail.reviewBlocker && <p className="company-hint">Review: {detail.reviewBlocker}</p>}{detail.publishBlocker && <p className="company-hint">Publication: {detail.publishBlocker}</p>}
    {canManage && (detail.canReview || detail.canPublish) && <>
      <label className="company-field"><span>Reason for named design review or publication</span><textarea value={reason} maxLength={2000} rows={2} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
      <div className="company-actions">{detail.canReview && <button type="button" className="btn small" disabled={busy || reason.trim().length < 8} onClick={() => void run('review')}>Record independent design review</button>}{detail.canPublish && <button type="button" className="btn small" disabled={busy || reason.trim().length < 8} onClick={() => void run('publish')}>Publish this named variant</button>}</div>
    </>}
    {notice && <p className={`company-notice${notice.error ? ' company-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
  </div>;
}
export function CompanyDesignDetail({ id, profile, canManage, onChanged, model }: { id: string; profile: CompanyDocumentProfile; canManage: boolean; onChanged: () => void; model: CompanyDocumentSettingsModel }) {
  const resource = useCompanyResource(`${COMPANY_DOCUMENTS_PATH}/designs/${encodeURIComponent(id)}`, companyDesignDetailOf, profile.revision);
  const [success, setSuccess] = useState('');
  const detail = resource.data;
  return <section aria-label="Selected named design" className="company-register">
    <button className="btn ghost small" type="button" disabled={resource.loading} onClick={resource.reload}>Reload design and review permissions</button>
    {success && <p className="company-notice" role="status">{success}</p>}
    {resource.loading && <p role="status">Reading the named design and its review permissions…</p>}
    {resource.error && <p className="company-error" role="alert">{resource.error} <button className="btn ghost small" type="button" onClick={resource.reload}>Retry selected design</button></p>}
    {detail && <><h4>{detail.design.name} · {detail.design.state}</h4>
      <p className="company-hint">Project {detail.design.scope.programId || 'any'} · market {detail.design.scope.market || 'any'} · language {detail.design.scope.language || 'any'} · subsidiary {detail.design.scope.subsidiary || 'any'}.</p>
      <p className="company-hint">Fields changed from the staged default: {detail.changedFields.join(', ') || 'None'}. Created by {detail.design.createdBy}{detail.design.reviewedBy === null ? '; no independent review recorded' : `; reviewed by ${detail.design.reviewedBy}`}.</p>
      <CompanyLetterheadPreview profile={{ ...profile, ...detail.candidate }} />
      <DesignReviewActions detail={detail} revision={profile.revision} canManage={canManage} resource={resource} onChanged={message => { setSuccess(message); onChanged(); }} />
      <CompanyDefaultDesignActivation detail={detail} model={model} />
    </>}
  </section>;
}
