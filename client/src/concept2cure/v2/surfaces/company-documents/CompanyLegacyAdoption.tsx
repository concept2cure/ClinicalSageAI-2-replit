import React, { useEffect, useRef, useState } from 'react';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { apiCall, apiErrorText } from '../../apiCall';
import { COMPANY_DOCUMENTS_PATH, type CompanyDocumentSettingsModel } from '../useCompanyDocumentSettings';
import { CompanyLetterheadPreview } from './CompanyLetterheadPreview';

interface LegacyPreview {
  available: boolean;
  sourceHash: string | null;
  candidate: Pick<CompanyDocumentProfile, 'companyName' | 'address' | 'contact' | 'registrationDetails' | 'letterhead' | 'importedFrom'> | null;
  warnings: string[];
}
function validPreview(value: unknown): value is LegacyPreview {
  const preview = value as LegacyPreview | null;
  return Boolean(preview && typeof preview.available === 'boolean' && (preview.sourceHash === null || typeof preview.sourceHash === 'string') &&
    Array.isArray(preview.warnings) && (preview.candidate === null || preview.candidate?.letterhead?.specVersion === 1));
}
function useLegacyPreview(revision: number) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ loading: boolean; data: LegacyPreview | null; error: string }>({ loading: true, data: null, error: '' });
  const pending = useRef({ generation: 0 });
  useEffect(() => {
    const guard = pending.current; const ticket = ++guard.generation;
    setState({ loading: true, data: null, error: '' });
    void apiCall('GET', `${COMPANY_DOCUMENTS_PATH}/legacy-adoption`).then(result => {
      if (guard.generation !== ticket) return;
      const data = result.ok && validPreview(result.body) ? result.body : null;
      setState({ loading: false, data, error: data ? '' : apiErrorText(result, 'Existing branding could not be checked. Retry before replacing it.') });
    });
    return () => { guard.generation++; };
  }, [revision, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}

function AdoptionChoices({ preview, model, profile }: { preview: LegacyPreview; model: CompanyDocumentSettingsModel; profile: CompanyDocumentProfile }) {
  const [reason, setReason] = useState('');
  const disabled = model.busy || model.loading || model.conflict;
  return <>
    {preview.candidate && <details><summary>Inspect extracted legacy stationery</summary><CompanyLetterheadPreview profile={{ ...profile, ...preview.candidate }} /></details>}
    <p className="company-hint">Adoption replaces the saved company presentation and the current letterhead draft with the reviewed legacy candidate. Existing legal library entries are retained.</p>
    <label className="company-field"><span>Reason for legacy branding adoption</span><input value={reason} maxLength={2000} disabled={disabled} onChange={e => setReason(e.target.value)} /></label>
    <div className="company-actions"><button className="btn primary small" type="button" disabled={disabled || !preview.candidate || !preview.sourceHash || reason.trim().length < 3} onClick={() => { if (preview.sourceHash) void model.adoptLegacy(preview.sourceHash, reason); }}>Adopt reviewed legacy branding</button>
      <button className="btn ghost small" type="button" disabled={disabled} onClick={() => model.setLegacyDecision('replace')}>Use my current design instead</button></div>
    {model.legacyDecision === 'replace' && <p className="company-hint" role="status">Replacement selected. Review your current draft and save it with a reason to replace the existing branding. Nothing has been changed yet.</p>}
  </>;
}

export function CompanyLegacyAdoption({ model, profile }: { model: CompanyDocumentSettingsModel; profile: CompanyDocumentProfile }) {
  const state = useLegacyPreview(profile.revision);
  if (state.loading) return <p role="status" className="company-hint">Checking for existing company branding…</p>;
  if (state.error) return <div className="company-notice company-error" role="alert">{state.error}<button className="btn ghost small" type="button" onClick={state.retry}>Retry existing branding check</button></div>;
  if (!state.data?.available) return null;
  return <section className="company-legacy-adoption" aria-label="Review existing branding before adoption">
    <h3>Existing company branding was found</h3>
    <button className="btn ghost small" type="button" disabled={model.busy} onClick={state.retry}>Refresh legacy branding preview</button>
    <p>Your earlier branding is retained until you explicitly adopt it or choose a reviewed replacement. An unrelated company-document save does not retire those assets.</p>
    {state.data.warnings.length > 0 && <div className="company-notice"><strong>Adoption warnings</strong><ul>{state.data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
    <AdoptionChoices preview={state.data} model={model} profile={profile} />
  </section>;
}
