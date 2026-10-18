import React, { useState } from 'react';
import type { CompanyDesignDetail } from '@shared/company-document-designs';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { COMPANY_DOCUMENTS_PATH, type CompanyDocumentSettingsModel } from '../useCompanyDocumentSettings';

function DefaultActivationEditor({ detail, profile, model }: { detail: CompanyDesignDetail; profile: CompanyDocumentProfile; model: CompanyDocumentSettingsModel }) {
  const [reports, setReports] = useState(profile.applyToReports);
  const [correspondence, setCorrespondence] = useState(profile.applyToSubmissionCorrespondence);
  const [reason, setReason] = useState('');
  return <fieldset className="company-register company-editor" disabled={model.busy || model.loading || model.conflict}>
    <legend>Activate as organization default</legend>
    <p className="company-hint">This explicit action replaces the saved organization default with this independently reviewed, published organization-wide design. Its identity and style become the approved default. Publishing a named variant alone never changes the default.</p>
    <label className="company-check"><input type="checkbox" checked={reports} onChange={event => setReports(event.target.checked)} />Use the activated default for report exports</label>
    <label className="company-check"><input type="checkbox" checked={correspondence} onChange={event => setCorrespondence(event.target.checked)} />Use the activated default for submission correspondence</label>
    <label className="company-field"><span>Reason for organization default activation</span><textarea value={reason} maxLength={2000} rows={2} onChange={event => setReason(event.target.value)} /></label>
    <button type="button" className="btn small" disabled={reason.trim().length < 8} onClick={() => void model.mutation('POST', `${COMPANY_DOCUMENTS_PATH}/designs/${encodeURIComponent(detail.design.id)}/activate-default`, {
      expectedRevision: profile.revision, expectedHash: detail.design.sha256, reason: reason.trim(), applyToReports: reports, applyToSubmissionCorrespondence: correspondence,
    }, 'activation')}>Activate this design as organization default</button>
    <p className="company-hint">An unsaved designer draft is retained and may differ from the newly activated default. Legal originals and existing filing placements are retained. This action does not enable the independent-review policy.</p>
  </fieldset>;
}
export function CompanyDefaultDesignActivation({ detail, model }: { detail: CompanyDesignDetail; model: CompanyDocumentSettingsModel }) {
  if (!model.capabilities.manageBrand || !model.saved) return null;
  if (!detail.canActivateDefault) return <p className="company-hint">Default activation: {detail.activationBlocker || 'This design cannot currently be activated as the organization default.'}</p>;
  return <DefaultActivationEditor key={`${detail.design.id}:${model.saved.revision}`} detail={detail} profile={model.saved} model={model} />;
}
