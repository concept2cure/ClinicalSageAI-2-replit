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
 * The pathway-NEUTRAL administrative fields of the nIVD eSTAR v7.0 — the
 * applicant, correspondent, Declaration of Conformity, associated product code
 * and Indications-for-Use citation fields that every marketing pathway filed on
 * this template (510(k), De Novo, PMA) shares. Re-enumerated from the vendored
 * `eSTAR-510k-non-ivd.pdf` with `listXfaFields` on 2026-09-03 (WO-8 Phase 3),
 * each verified `inDatasets`. Deliberately EXCLUDES the 510(k) Summary page
 * (`AdministrativeDocumentation.PMNSummary.*`) and the predicate fields
 * (`PredicatesSE.PredicateReference.*`): those are 510(k)-only and a De Novo or
 * PMA must never write them.
 */
const NIVD_SHARED_ADMINISTRATIVE_FIELDS: OfficialPdfFieldMap = {
  applicantCompanyName: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField210', type: 'text', caption: 'Company Name' },
  applicantContactEmail: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField160', type: 'text', caption: 'Email' },
  correspondentCompanyName: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField410', type: 'text', caption: 'Company Name' },
  correspondentContactEmail: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField360', type: 'text', caption: 'Email' },
  associatedProductCodes: { xfaSomPath: 'root.Classification.USAKnownClassification.DDTextField517a', type: 'text', caption: 'Associated Product Code(s)' },
  declarationCompanyName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField120', type: 'text', caption: 'Company Name' },
  declarationCompanyAddress: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField130', type: 'text', caption: 'Company Address' },
  declarationDeviceTradeName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField140', type: 'text', caption: 'Device Trade Name' },
  indicationsForUseCitation: { xfaSomPath: 'root.Labeling.SpecificLabeling.LBTextField130', type: 'text', caption: 'Please specifically cite the attachment and page number where the Indications for Use exists in the labeling.' },
};

/**
 * The same pathway-neutral fields on the IVD eSTAR v7.0, re-enumerated from the
 * vendored `eSTAR-510k-ivd.pdf` on 2026-09-03. The IVD template does not declare
 * `Labeling.SpecificLabeling.LBTextField130`, so indicationsForUseCitation is
 * absent here rather than mapped to a path that does not exist.
 */
const IVD_SHARED_ADMINISTRATIVE_FIELDS: OfficialPdfFieldMap = {
  applicantCompanyName: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField210', type: 'text', caption: 'Company Name' },
  applicantContactEmail: { xfaSomPath: 'root.AdministrativeInformation.ApplicantInformation.ADTextField160', type: 'text', caption: 'Email' },
  correspondentCompanyName: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField410', type: 'text', caption: 'Company Name' },
  correspondentContactEmail: { xfaSomPath: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField360', type: 'text', caption: 'Email' },
  associatedProductCodes: { xfaSomPath: 'root.Classification.USAKnownClassification.DDTextField517a', type: 'text', caption: 'Associated Product Code(s)' },
  declarationCompanyName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField120', type: 'text', caption: 'Company Name' },
  declarationCompanyAddress: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField130', type: 'text', caption: 'Company Address' },
  declarationDeviceTradeName: { xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField140', type: 'text', caption: 'Device Trade Name' },
};

/*
 * WHY THERE IS NO `submissionType` KEY (investigated 2026-09-03, WO-8 Phase 3;
 * the binding claim below CORRECTED 2026-09-04 against the decrypted template).
 * The pathway a filing takes is chosen on the template's first page. That
 * selector is writable through the `datasets` packet — and is still not mapped:
 *   - `root.ApplicationType.USA` and `root.ApplicationType.ApplicationSubType`
 *     are SUBFORMS, not dropdowns. The pathway selector is the radio group
 *     (XFA exclGroup) `root.ApplicationType.USA.ATRadioButton110`, whose
 *     members' on-values, read from the template packet, are: "1" = Premarket
 *     Notification 510(k) (ATRadioButton111), "2" = De Novo (ATRadioButton112),
 *     "3" = Premarket Application PMA (ATRadioButton113). The sub-type group
 *     `root.ApplicationType.ApplicationSubType.ATRadioButton130` is "1" = New
 *     Application/Submission, "2" = Change to Application/Submission, "3" =
 *     Additional Information, "4" = Report. The jurisdiction group
 *     `root.ApplicationType.ATRadioButton100` is "1" = US FDA (nIVD also "0" =
 *     IMDRF; both templates "2" = Health Canada). Identical on both templates.
 *   - The GROUPS are DATA-BOUND. `ATRadioButton100`, `ATRadioButton110` and
 *     `ATRadioButton130` have no `<bind>` child at all — default binding — and
 *     all three are present in the datasets skeleton. Only their MEMBER fields
 *     carry `<bind match="none"/>` (10 of the 11 members; `ATRadioButton113`
 *     carries no `<bind>` either), which is the normal LiveCycle shape: the
 *     exclGroup holds the value, the members are presentation. An earlier
 *     version of this note said the groups themselves were `match="none"` and
 *     that a write to them would be inert; a depth-aware scan of the decrypted
 *     template packet shows that is wrong, and pdf.js — an independent XFA
 *     engine — binds and renders a value written to `ATRadioButton110`, and a
 *     value written to `ATRadioButton100` even overrides the default FDA ships
 *     (see `fill-official-pdf.xfa-render.test`).
 *   - The key is therefore withheld for the reason that actually holds: THE
 *     SELECTION IS THE APPLICANT'S DECLARATION. Which pathway a submission is
 *     filed under is a regulatory assertion the applicant makes to FDA. Ticking
 *     it from inferred data would put a declaration into a client's submission
 *     that no one at the client made — and unlike a wrong trade name, nobody
 *     re-reads a radio button they never chose.
 *   - The mechanism is also unverified exactly here. Acrobat is not available in
 *     this environment, and these groups are the one place where the template's
 *     saved `form` packet DOES keep state: it stores
 *     `ApplicationType.ATRadioButton100.ATRadioButton101 = "1"` for the
 *     jurisdiction group's member. Whether Acrobat prefers that saved state over
 *     a datasets write is unobserved — pdf.js ignores the `form` packet
 *     entirely, so its rendering cannot answer it. (No mapped administrative
 *     field is exposed to this: the packet declares no node for any of them —
 *     see the `form`-packet section of `forms/fill-official-pdf`.) The members
 *     also carry the `event__change` scripts that reveal the pathway-specific
 *     sections, and no engine here runs XFA script, so a written selection is
 *     not known to leave the form in the state a human click produces.
 * The pathway stays the user's to select in the form; the maps below write
 * fields that carry data, never a declaration.
 */

/**
 * Per-descriptor field maps, keyed by descriptor id from ESTAR_TEMPLATE_MANIFEST.
 * Populated for the six marketing descriptors against nIVD/IVD eSTAR v7.0: the
 * two 510(k) maps (2026-06-01) carry the full administrative set including the
 * 510(k) Summary page and predicate fields; the De Novo and PMA maps (2026-09-03)
 * carry only the pathway-neutral fields above. FDA ships one PDF per family that
 * carries all three pathways, so all three device maps address the same vendored
 * file (see ESTAR_TEMPLATE_MANIFEST). PreSTAR remains empty and fails closed.
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
  // ── De Novo and PMA on the same vendored templates: the pathway-neutral
  //    administrative fields only (no 510(k) Summary page, no predicate fields).
  //    Separate objects per descriptor so a caller mutating one map (the route
  //    tests do) cannot change another.
  'de_novo-device': { ...NIVD_SHARED_ADMINISTRATIVE_FIELDS },
  'pma-device': { ...NIVD_SHARED_ADMINISTRATIVE_FIELDS },
  'de_novo-ivd': { ...IVD_SHARED_ADMINISTRATIVE_FIELDS },
  'pma-ivd': { ...IVD_SHARED_ADMINISTRATIVE_FIELDS },
  // PreSTAR2 is not vendored; unmapped, so estar-fill reports an honest blocker.
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
