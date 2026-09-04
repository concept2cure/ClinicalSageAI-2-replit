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
 * WHY THERE IS NO `submissionType` KEY — SETTLED 2026-09-04 AGAINST THE TEMPLATE.
 *
 * The pathway a filing takes is chosen on the template's first page by the XFA
 * exclusion group `root.ApplicationType.USA.ATRadioButton110` (member on-values,
 * read from the template's own `<items>`: "1" = Premarket Notification 510(k)
 * (ATRadioButton111), "2" = De Novo (ATRadioButton112), "3" = Premarket
 * Application PMA (ATRadioButton113)). It is DATA-BOUND — no `<bind>` child, so
 * default binding — it is present in the datasets skeleton (FDA ships it EMPTY:
 * `<ATRadioButton110/>`), and pdf.js binds and renders a value written to it.
 * It is writable. We still do not write it, for three reasons, in this order.
 *
 * 1. WRITING IT REVEALS NOTHING. The 12 container subforms that hold the 20
 *    mapped fields are hidden until a script sets `presence = "visible"`. Every
 *    such assignment in the template lives in a `change`, `exit` or `click`
 *    handler — a USER-INTERACTION activity. The whole 9.88 MB template packet
 *    declares exactly ONE `<event activity="initialize">` (on `root`); it makes
 *    ZERO `presence = "visible"` assignments and ZERO `execEvent` calls. There
 *    are two `<event activity="ready" ref="$layout">` (page numbering), one
 *    non-empty `docReady` (bookmark pane), and ZERO events with `ref="$form"`.
 *    Nothing runs at open that reads the pathway group and reveals a section.
 *
 * 2. THE ONE SCRIPT THAT WOULD REVEAL THEM CANNOT RUN WITHOUT A FOCUSED WIDGET.
 *    `root.ApplicationType.USA.ATRadioButton110` `<event activity="change">` is
 *    the only script that makes `Classification`, `Classification.USAKnown-
 *    Classification` and `PredicatesSE` visible. Its reveal block opens:
 *
 *      if (xfa.host.getFocus().name.substr(0,15) != "ATRadioButton10" &&
 *          ApplicationType.ATRadioButton100.rawValue == 1){
 *
 *    — an UNCONDITIONAL dereference of `xfa.host.getFocus()`. FDA's own comment
 *    elsewhere in the template says when that is null: `//if something is
 *    focused, which won't happen on an exit`. With no focus there is no reveal,
 *    only a thrown script.
 *
 * 3. IT WOULD CONSUME THE ONE ACTION THAT DOES REVEAL THEM. FDA ships the group
 *    empty, so the applicant sees an unanswered radio and clicks it; that click
 *    fires `change` with a focused widget and reveals the sections. Writing the
 *    value pre-answers the question WITHOUT running its handler, leaving the
 *    form in a state no click produces: pathway shown as chosen, every section
 *    still hidden. And the value is not even durable — `root.ApplicationType.
 *    ATRadioButton100` `<event activity="change">` (the jurisdiction radio, one
 *    click away) contains `this.USA.ATRadioButton110.ATRadioButton111.rawValue =
 *    null;` for each member, under `if (xfa.host.getFocus().name !=
 *    "ImportData")` — i.e. exactly when a human clicks it.
 *
 * The regulatory reason stands behind all three: which pathway a submission is
 * filed under is a DECLARATION the applicant makes to FDA. Ticking it from
 * inferred data would put an assertion into a client's submission that no one at
 * the client made, and nobody re-reads a radio button they never chose.
 *
 * FDA's own data-loading path is `root.Amendment.Verification.ImportData`
 * `<event activity="click">`: it calls `xfa.host.importData()` and then walks
 * the form calling `execEvent("change")` and `execEvent("exit")` on every field
 * and exclGroup in every VISIBLE subform — a manual replay of the events a data
 * load does not fire. That button, not an open-time binding, is how a filled
 * eSTAR is meant to come alive; the change handlers are littered with
 * `if (xfa.host.getFocus().name != "ImportData")` guards written for it.
 *
 * Measured with `listXfaPackets` on the vendored `eSTAR-510k-non-ivd.pdf`; all
 * 1,435 `<script>` and 434 `<exData>` bodies were blanked before any structural
 * scan (their JavaScript contains `<` and `>` that forge tags otherwise — 2,999
 * spurious elements). Pinned by `estar-field-map.template-behaviour.test.ts`;
 * full write-up in `docs/reports/estar-acrobat-behaviour-2026-09-04.md`.
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

/**
 * WHICH MAPPED FIELDS THE FORM RECOMPUTES FOR ITSELF (nIVD eSTAR v7.0, measured
 * 2026-09-04). Not every mapped path is a place the applicant types. Twelve of
 * the twenty `510k-device` fields are AUTO-POPULATED SUMMARY CELLS: an FDA
 * script clears them (`X.rawValue = "";`) and rebuilds them from a SOURCE field
 * elsewhere in the form. When that script runs, whatever we wrote is replaced by
 * whatever the source holds — and for a source we do not map, that is blank.
 *
 * This table was ENUMERATED, not reasoned: every one of the template's 1,435
 * script bodies was searched for an assignment to each mapped leaf field's
 * `rawValue`. `writtenBy` is empty for a field no script in the template ever
 * assigns; those are the only fields a write to which is unconditionally durable.
 *
 * FOUR OF THEM ARE CLEARED BY THE PATHWAY CLICK ITSELF. The 510(k) branch of
 * `root.ApplicationType.USA.ATRadioButton110` `<event activity="change">` — the
 * click that reveals the sections — runs
 * `Classification.USAKnownClassification.DDDropDownList517.execEvent("exit");`
 * (whose first two statements are
 * `AdministrativeDocumentation.PMNSummary.SSTextField260.rawValue = "";` and
 * `AdministrativeDocumentation.PMNSummary.SSTextField240.rawValue = "";`) and
 * `DeviceDescription.Devices.Functions.Validation();` (whose defaults are
 * `AdministrativeDocumentation.DoC.DCTextField140.rawValue = "";` and
 * `AdministrativeDocumentation.PMNSummary.SSTextField220.rawValue = "";`). Their
 * sources — `DDDropDownList517` and `Device[].TradeName` — are unmapped, so the
 * rebuild leaves them blank. See `clearedByPathwayClick`.
 *
 * Nothing here is acted on automatically: this is the reviewable record of a
 * product decision that is still open (keep filling summary cells, or fill their
 * sources instead). Pinned against the vendored template by
 * `estar-field-map.template-behaviour.test.ts`.
 */
export interface EstarRecomputedField {
  /** Template scripts that assign this field's `rawValue`, by SOM path + activity. */
  readonly writtenBy: readonly string[];
  /** The field the rebuild reads, in the template's own SOM terms. */
  readonly rebuiltFrom: string | null;
  /** True when the pathway radio's own change cascade clears this field. */
  readonly clearedByPathwayClick: boolean;
}

export const ESTAR_TEMPLATE_RECOMPUTED_FIELDS: Readonly<Record<string, EstarRecomputedField>> = {
  deviceTradeName: {
    writtenBy: ['root.DeviceDescription.Devices <variables>'],
    rebuiltFrom: 'root.DeviceDescription.Devices.Device[].TradeName',
    clearedByPathwayClick: true,
  },
  deviceCommonName: {
    writtenBy: ['root.Classification.USAKnownClassification.DDDropDownList513 [exit]'],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList513',
    clearedByPathwayClick: false,
  },
  deviceClassificationName: {
    writtenBy: ['root.Classification.USAKnownClassification.DDDropDownList517 [exit]'],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList517',
    clearedByPathwayClick: true,
  },
  regulationNumber: {
    writtenBy: ['root.Classification.USAKnownClassification.DDDropDownList513 [exit]'],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList513',
    clearedByPathwayClick: false,
  },
  productCodes: {
    writtenBy: [
      'root.Classification.USAKnownClassification.DDDropDownList517 [exit]',
      'root.Classification.USAKnownClassification.DDTextField517a [exit]',
    ],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList517',
    clearedByPathwayClick: true,
  },
  associatedProductCodes: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false },
  applicantCompanyName: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false },
  applicantContactEmail: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false },
  applicantContactTelephone: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField170',
    clearedByPathwayClick: false,
  },
  // Rebuilt from a field WE DO map, so the rebuild reproduces our own value.
  applicantSummaryEmail: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField160',
    clearedByPathwayClick: false,
  },
  correspondentCompanyName: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false },
  correspondentContactEmail: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false },
  correspondentTelephone: {
    writtenBy: [
      'root.AdministrativeInformation.CorrespondentInformation.DeleteCorrespondent [click]',
      'root.AdministrativeInformation.CorrespondentInformation <variables>',
    ],
    rebuiltFrom: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField370',
    clearedByPathwayClick: false,
  },
  // Rebuilt from a field WE DO map, so the rebuild reproduces our own value.
  correspondentSummaryEmail: {
    writtenBy: [
      'root.AdministrativeInformation.CorrespondentInformation.DeleteCorrespondent [click]',
      'root.AdministrativeInformation.CorrespondentInformation <variables>',
    ],
    rebuiltFrom: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField360',
    clearedByPathwayClick: false,
  },
  // Nulled only when the applicant explicitly deletes the predicate instance.
  predicateSubmissionNumber: {
    writtenBy: ['root.PredicatesSE.PredicateReference.DeletePredicate [click]'],
    rebuiltFrom: null,
    clearedByPathwayClick: false,
  },
  predicateDeviceTradeName: {
    writtenBy: ['root.PredicatesSE.PredicateReference.DeletePredicate [click]'],
    rebuiltFrom: null,
    clearedByPathwayClick: false,
  },
  // Rebuilt from a field WE DO map, so the rebuild reproduces our own value.
  declarationCompanyName: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField210',
    clearedByPathwayClick: false,
  },
  declarationCompanyAddress: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField220..ADDropDownList270',
    clearedByPathwayClick: false,
  },
  declarationDeviceTradeName: {
    writtenBy: ['root.DeviceDescription.Devices <variables>'],
    rebuiltFrom: 'root.DeviceDescription.Devices.Device[].TradeName',
    clearedByPathwayClick: true,
  },
  indicationsForUseCitation: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false },
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
