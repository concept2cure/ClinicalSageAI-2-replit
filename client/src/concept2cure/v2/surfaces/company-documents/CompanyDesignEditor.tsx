import React, { useState } from 'react';
import { listCanonicalRegions, toAgency } from '@shared/regulatory/region-identity';
import type { CompanyDesignCandidate, CompanyDesignScope } from '@shared/company-document-designs';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { CompanyProgramPicker } from './CompanyProgramPicker';

export function companyDesignCandidate(profile: CompanyDocumentProfile): CompanyDesignCandidate {
  return { companyName: profile.companyName, address: profile.address, contact: profile.contact, registrationDetails: profile.registrationDetails,
    letterhead: profile.letterhead, importedFrom: profile.importedFrom, applyToReports: profile.applyToReports, applyToSubmissionCorrespondence: profile.applyToSubmissionCorrespondence };
}
export function CompanyDesignEditor({ profile, busy, onStage }: {
  profile: CompanyDocumentProfile; busy: boolean; onStage: (name: string, scope: CompanyDesignScope, reason: string) => void;
}) {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<CompanyDesignScope>({ programId: null, market: null, language: null, subsidiary: null });
  const change = <K extends keyof CompanyDesignScope>(key: K, value: CompanyDesignScope[K]) => setScope(previous => ({ ...previous, [key]: value }));
  return <fieldset className="company-editor" disabled={busy}>
    <p className="company-hint">Stage a snapshot of the current designer draft for independent review. Company name: {profile.companyName || 'Not provided'}. Editing the designer later does not change a staged snapshot. Publication creates a named variant and leaves the organization default unchanged.</p>
    <div className="company-fields">
      <label className="company-field company-wide"><span>Named design title</span><input value={name} maxLength={200} onChange={event => setName(event.target.value)} placeholder="For example, Japan regulatory correspondence" /></label>
      <CompanyProgramPicker value={scope.programId} onChange={id => change('programId', id)} disabled={busy} />
      <label className="company-field"><span>Design market scope</span><select value={scope.market ?? ''} onChange={event => change('market', (event.target.value || null) as CompanyDesignScope['market'])}><option value="">Any supported market</option>{listCanonicalRegions().map(code => <option key={code} value={code}>{code} · {toAgency(code)}</option>)}</select></label>
      <label className="company-field"><span>Design language scope</span><input value={scope.language ?? ''} maxLength={50} placeholder="Any language, or BCP 47 such as en-GB" onChange={event => change('language', event.target.value || null)} /></label>
      <label className="company-field company-wide"><span>Design subsidiary scope</span><input value={scope.subsidiary ?? ''} maxLength={200} placeholder="Any subsidiary, or an explicit subsidiary identifier" onChange={event => change('subsidiary', event.target.value || null)} /></label>
      <label className="company-field company-wide"><span>Reason to stage this named design</span><textarea value={reason} maxLength={2000} rows={2} onChange={event => setReason(event.target.value)} /></label>
    </div>
    <p className="company-hint">A restricted project, market, language or subsidiary must match the output context explicitly. A scope does not grant project access or establish legal applicability.</p>
    <button type="button" className="btn small" disabled={!name.trim() || reason.trim().length < 8} onClick={() => onStage(name.trim(), scope, reason.trim())}>Stage current draft as a named design</button>
  </fieldset>;
}
