import type { CompanyDocumentProfile, CompanyDocumentsResponse } from '@shared/company-documents';
import { apiErrorText, type ApiResult } from '../../apiCall';
import type { CompanyDocumentSettingsState } from '../useCompanyDocumentSettings';
import { companyCapabilitiesOf, copyCompanyValue, emptyCompanyLegal, validCompanyDocumentsResponse, type CompanyMutationMode } from './companyDocumentsData';

type ReceiptState = Pick<CompanyDocumentSettingsState, 'dirtyRef' | 'setBusy' | 'setConflict' | 'setNotice' | 'setSaved' | 'setCanManage' | 'setCapabilities' | 'setLegalDocumentsIncluded' | 'setDraft' | 'setReason' | 'setWarnings' | 'setLegacyDecision' | 'setLegal' | 'setLegalReason' | 'setArchiveId' | 'setArchiveReason'>;
export function companyMutationFailure(state: ReceiptState, result: ApiResult) {
  const code = (result.body as { error?: unknown } | null)?.error;
  const conflict = result.status === 409 && (code === 'REVISION_CONFLICT' || code === 'COMPANY_DOCUMENTS_CONFLICT');
  state.setBusy(false); state.setConflict(conflict);
  state.setNotice({ error: true, text: conflict
    ? 'Another administrator changed this profile. Your draft is kept. Reload the saved profile before applying your changes again.'
    : apiErrorText(result, 'The change could not be confirmed. Your draft is kept; reload the saved profile before retrying if the connection was interrupted.') });
}
function updatedDraft(previous: CompanyDocumentProfile | null, profile: CompanyDocumentProfile, replace: boolean) {
  if (replace || !previous) return copyCompanyValue(profile);
  return { ...previous, revision: profile.revision, legalDocuments: profile.legalDocuments, legalRequirements: profile.legalRequirements,
    brandingAdopted: profile.brandingAdopted, brandingApprovalRequired: profile.brandingApprovalRequired, approvedDefaultDesignId: profile.approvedDefaultDesignId };
}
function receiptMessage(profile: CompanyDocumentProfile, verified: boolean, mode: CompanyMutationMode, keepDirty: boolean) {
  if (!verified) return `The server recorded revision ${profile.revision}, but the latest saved profile could not be verified. Reload before making another change.`;
  if (mode === 'policy') return `Default branding review policy ${profile.brandingApprovalRequired ? 'enabled' : 'disabled'} · revision ${profile.revision}.`;
  if (mode === 'activation') return `Organization default activated · revision ${profile.revision}.${keepDirty ? ' Your unsaved designer draft is retained.' : ''}`;
  return mode === 'design' ? `Company identity and letterhead saved · revision ${profile.revision}.` : 'Legal document library updated. Source files and their approval records are unchanged.';
}
export function applyCompanyMutationReceipt(state: ReceiptState, receipt: CompanyDocumentsResponse, reread: ApiResult, mode: CompanyMutationMode) {
  const verified = reread.ok && validCompanyDocumentsResponse(reread.body) && reread.body.data.revision === receipt.data.revision;
  const latest = verified ? reread.body as CompanyDocumentsResponse : receipt;
  const profile = copyCompanyValue(latest.data); const keepDirty = state.dirtyRef.current;
  const replace = mode === 'design' || (mode === 'activation' && !keepDirty);
  state.setBusy(false); state.setSaved(profile); state.setCanManage(latest.canManage);
  state.setLegalDocumentsIncluded(latest.legalDocumentsIncluded !== false); state.setCapabilities(companyCapabilitiesOf(latest));
  state.setDraft(previous => updatedDraft(previous, profile, replace)); state.setConflict(!verified);
  state.setNotice({ error: !verified, text: receiptMessage(profile, verified, mode, keepDirty) });
  if (mode === 'design') { state.setReason(''); state.setWarnings([]); state.setLegacyDecision(undefined); }
  if (mode === 'activation') state.setLegacyDecision(undefined);
  if (mode === 'legal') { state.setLegal(emptyCompanyLegal()); state.setLegalReason(''); state.setArchiveId(null); state.setArchiveReason(''); }
}
