import type { CompanyDocumentCapabilities, CompanyDocumentProfile, CompanyDocumentsResponse, CompanyLegalKind } from '@shared/company-documents';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';

export type CompanyMutationMode = 'design' | 'legal' | 'policy' | 'activation';
export const MUTATION_CAPABILITY: Record<CompanyMutationMode, keyof CompanyDocumentCapabilities> = {
  design: 'manageBrand', activation: 'manageBrand', legal: 'manageLegal', policy: 'managePermissions',
};
export const copyCompanyValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export function companyCapabilitiesOf(response: CompanyDocumentsResponse): CompanyDocumentCapabilities {
  return response.capabilities ?? { manageBrand: response.canManage, manageLegal: response.canManage, managePermissions: response.canManage };
}
export function validCompanyDocumentsResponse(value: unknown): value is CompanyDocumentsResponse {
  const response = value as CompanyDocumentsResponse | null;
  return Boolean(response && typeof response.canManage === 'boolean' && response.data?.version === 1 &&
    Number.isSafeInteger(response.data.revision) && typeof response.data.companyName === 'string' &&
    response.data.letterhead?.specVersion === 1 && Array.isArray(response.data.legalDocuments));
}
export const companyPresentation = (profile: CompanyDocumentProfile) => ({
  companyName: profile.companyName, address: profile.address, contact: profile.contact, registrationDetails: profile.registrationDetails,
  letterhead: profile.letterhead, importedFrom: profile.importedFrom,
});
export const editableCompanyProfile = (profile: CompanyDocumentProfile) => ({
  ...companyPresentation(profile), applyToReports: profile.applyToReports, applyToSubmissionCorrespondence: profile.applyToSubmissionCorrespondence,
});
function protectedPresentation(profile: CompanyDocumentProfile) {
  const letterhead = normalizeTemplateSpec(profile.letterhead);
  letterhead.brand.organizationName = profile.companyName;
  return { companyName: profile.companyName, address: profile.address, contact: profile.contact, registrationDetails: profile.registrationDetails,
    letterhead };
}
/** Early UI guidance only; the server validates the trusted approval and canonical presentation hash. */
export function companyProtectedPresentationChanged(saved: CompanyDocumentProfile, draft: CompanyDocumentProfile) {
  return JSON.stringify(protectedPresentation(saved)) !== JSON.stringify(protectedPresentation(draft));
}
export const emptyCompanyLegal = () => ({ title: '', kind: 'authorization' as CompanyLegalKind, programId: '', vaultDocumentId: '', agencies: '', countries: '', submissionTypes: '', language: 'en', effectiveOn: '', expiresOn: '' });
