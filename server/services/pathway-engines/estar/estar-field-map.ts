/**
 * eSTAR canonical → official-template field maps (Device eSTAR, B2).
 *
 * Maps our canonical field keys to the exact field locator inside each official
 * FDA eSTAR template, per template descriptor id (see estar-template-registry's
 * ESTAR_TEMPLATE_MANIFEST).
 *
 * WHICH LOCATOR: the official FDA eSTAR templates are Adobe LiveCycle *dynamic
 * XFA* PDFs — `/NeedsRendering true`, and an AcroForm `/Fields` array that is
 * EMPTY. There are no AcroForm field names to map; the real fields live in the
 * `/XFA` packets and are addressed by SOM path (`root.Section.Subform.Field`).
 * So these entries carry `xfaSomPath`, and `estar-fill` routes them through
 * `fillXfaDatasets`. An `acroField` entry would match nothing on these templates.
 *
 * HONEST-BY-CONSTRUCTION: every path below was ENUMERATED from the vendored
 * template itself (`listXfaFields`) and verified to (a) be declared by the
 * template and (b) exist in its `datasets` skeleton, which is what makes it
 * fillable. None was guessed or hand-typed — a wrong locator fails silently, so
 * `fillXfaDatasets` additionally skips+warns on any path the template does not
 * declare rather than inventing a data node. `caption` is the template's OWN
 * label for the field, carried so a reviewer can confirm the mapping by reading
 * the form. Descriptors with no verified map stay `{}` and keep `estar-fill`
 * fail-closed.
 *
 * A populated map is a version-pinned DATA change, not new code: when FDA ships
 * a new eSTAR revision, re-enumerate and re-verify against the new template.
 *
 * @module server/services/pathway-engines/estar/estar-field-map
 */

import type { OfficialPdfFieldMap } from '../../forms/fill-official-pdf';

/**
 * Per-descriptor field maps, keyed by descriptor id from ESTAR_TEMPLATE_MANIFEST.
 * Populated for the two 510(k) descriptors against nIVD/IVD eSTAR v7.0
 * (2026-06-01). De Novo, PMA and PreSTAR remain empty and fail closed.
 */
export const ESTAR_FIELD_MAPS: Record<string, OfficialPdfFieldMap> = {
  // ── 510(k), nIVD eSTAR v7.0 — 20 fields verified against the vendored template
  '510k-device': {
    deviceTradeName: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField220', type: 'text', caption: 'Device Trade Name' },
    deviceCommonName: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField230', type: 'text', caption: 'Common Name' },
    deviceClassificationName: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField240', type: 'text', caption: 'Classification Name' },
    regulationNumber: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField250', type: 'text', caption: 'Regulation Number' },
    productCodes: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField260', type: 'text', caption: 'Product Code(s)' },
    associatedProductCodes: { xfaSomPath: 'root.Classification.USAKnownClassification.DDTextField517a', type: 'text', caption: 'Associated Product Code(s)' },
    applicantCompanyName: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField210', type: 'text', caption: 'Company Name' },
    applicantContactEmail: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField160', type: 'text', caption: 'Email' },
    applicantContactTelephone: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField130', type: 'text', caption: 'Applicant Contact Telephone' },
    applicantSummaryEmail: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField150', type: 'text', caption: 'Applicant Contact Email' },
    correspondentCompanyName: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField410', type: 'text', caption: 'Company Name' },
    correspondentContactEmail: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField360', type: 'text', caption: 'Email' },
    correspondentTelephone: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField180', type: 'text', caption: 'Correspondent Contact Telephone' },
    correspondentSummaryEmail: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField200', type: 'text', caption: 'Correspondent Contact Email' },
    predicateSubmissionNumber: { xfaSomPath: 'root.PredicatesSE.PredicateReference.ADTextField830', type: 'text', caption: 'Predicate Submission Number (e.g., K210001)' },
    predicateDeviceTradeName: { xfaSomPath: 'root.PredicatesSE.PredicateReference.ADTextField840', type: 'text', caption: 'Predicate Device Trade Name' },
    declarationCompanyName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField120', type: 'text', caption: 'Company Name' },
    declarationCompanyAddress: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField130', type: 'text', caption: 'Company Address' },
    declarationDeviceTradeName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField140', type: 'text', caption: 'Device Trade Name' },
    indicationsForUseCitation: { xfaSomPath: 'root.Labeling.SpecificLabeling.LBTextField130', type: 'text', caption: 'Please specifically cite the attachment and page number where the Indications for Use ex' },
  },
  // ── 510(k), IVD eSTAR v7.0 — 19 fields verified. The IVD template does not
  //    declare Labeling.SpecificLabeling.LBTextField130, so indicationsForUseCitation
  //    is deliberately absent here rather than mapped to a path that does not exist.
  '510k-ivd': {
    deviceTradeName: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField220', type: 'text', caption: 'Device Trade Name' },
    deviceCommonName: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField230', type: 'text', caption: 'Common Name' },
    deviceClassificationName: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField240', type: 'text', caption: 'Classification Name' },
    regulationNumber: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField250', type: 'text', caption: 'Regulation Number' },
    productCodes: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField260', type: 'text', caption: 'Product Code(s)' },
    associatedProductCodes: { xfaSomPath: 'root.Classification.USAKnownClassification.DDTextField517a', type: 'text', caption: 'Associated Product Code(s)' },
    applicantCompanyName: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField210', type: 'text', caption: 'Company Name' },
    applicantContactEmail: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField160', type: 'text', caption: 'Email' },
    applicantContactTelephone: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField130', type: 'text', caption: 'Applicant Contact Telephone' },
    applicantSummaryEmail: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField150', type: 'text', caption: 'Applicant Contact Email' },
    correspondentCompanyName: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField410', type: 'text', caption: 'Company Name' },
    correspondentContactEmail: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField360', type: 'text', caption: 'Email' },
    correspondentTelephone: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField180', type: 'text', caption: 'Correspondent Contact Telephone' },
    correspondentSummaryEmail: { xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField200', type: 'text', caption: 'Correspondent Contact Email' },
    predicateSubmissionNumber: { xfaSomPath: 'root.PredicatesSE.PredicateReference.ADTextField830', type: 'text', caption: 'Predicate Submission Number (e.g., K210001)' },
    predicateDeviceTradeName: { xfaSomPath: 'root.PredicatesSE.PredicateReference.ADTextField840', type: 'text', caption: 'Predicate Device Trade Name' },
    declarationCompanyName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField120', type: 'text', caption: 'Company Name' },
    declarationCompanyAddress: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField130', type: 'text', caption: 'Company Address' },
    declarationDeviceTradeName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField140', type: 'text', caption: 'Device Trade Name' },
  },
  // Out of scope for WO-8; unmapped, so estar-fill reports an honest blocker.
  'de_novo-device': {},
  'de_novo-ivd': {},
  'pma-device': {},
  'pma-ivd': {},
  'q_sub-prestar': {},
  'ide-prestar': {},
  '513g-prestar': {},
};

/** The field map for a descriptor id, or undefined if the descriptor is unknown. */
export function getEstarFieldMap(descriptorId: string): OfficialPdfFieldMap | undefined {
  return ESTAR_FIELD_MAPS[descriptorId];
}

/** True when a descriptor's field map has at least one verified field mapping. */
export function isFieldMapPopulated(descriptorId: string): boolean {
  const m = ESTAR_FIELD_MAPS[descriptorId];
  return !!m && Object.keys(m).length > 0;
}

export default { ESTAR_FIELD_MAPS, getEstarFieldMap, isFieldMapPopulated };
