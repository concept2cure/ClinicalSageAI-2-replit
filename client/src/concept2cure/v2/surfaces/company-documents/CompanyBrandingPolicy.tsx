import React, { useState } from 'react';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { COMPANY_DOCUMENTS_PATH, type CompanyDocumentSettingsModel } from '../useCompanyDocumentSettings';

function BrandingPolicyEditor({ model, profile }: { model: CompanyDocumentSettingsModel; profile: CompanyDocumentProfile }) {
  const [required, setRequired] = useState(profile.brandingApprovalRequired === true);
  const [reason, setReason] = useState('');
  const current = profile.brandingApprovalRequired === true;
  const approvalMissing = !profile.approvedDefaultDesignId;
  const blocked = model.busy || model.loading || model.conflict;
  return <fieldset className="company-register company-editor" disabled={blocked}>
    <legend>Organization default branding review</legend>
    <p className="company-hint">Owners and administrators may require independent review before the saved company identity, logo or letterhead style changes. Automatic report and correspondence preferences can still be changed directly.</p>
    <label className="company-check"><input type="checkbox" checked={required} disabled={!current && approvalMissing} onChange={event => setRequired(event.target.checked)} />Require independent review of the organization default</label>
    {approvalMissing ? <p className="company-hint">Before enabling this policy, stage an organization-wide named design, have another authorized person review it, publish it and explicitly activate it as the organization default.</p> : <p className="company-hint">Current default references published design {profile.approvedDefaultDesignId}. The server verifies its exact approved identity and style before enabling this policy.</p>}
    <label className="company-field"><span>Reason for default branding review policy</span><textarea value={reason} maxLength={2000} rows={2} onChange={event => setReason(event.target.value)} /></label>
    <button type="button" className="btn small" disabled={required === current || reason.trim().length < 8 || (required && approvalMissing)} onClick={() => void model.mutation('PUT', `${COMPANY_DOCUMENTS_PATH}/branding-policy`, { expectedRevision: profile.revision, requireIndependentReview: required, reason: reason.trim() }, 'policy')}>Save default branding review policy</button>
    <p className="company-hint">This changes the review requirement only. It does not publish a design, enable automatic use or replace your unsaved designer draft.</p>
  </fieldset>;
}
export function CompanyBrandingPolicy({ model, profile }: { model: CompanyDocumentSettingsModel; profile: CompanyDocumentProfile }) {
  return model.capabilities.managePermissions ? <BrandingPolicyEditor key={profile.revision} model={model} profile={profile} /> : null;
}
