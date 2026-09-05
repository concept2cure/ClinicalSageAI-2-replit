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

import type { OfficialPdfFieldMap, OfficialPdfFieldSpec } from '../../forms/fill-official-pdf';

/*
 * TWO FIELDS OF THE MAPS BELOW ARE WRITTEN INTO A SECOND BOX AS WELL, AND THE SECOND WRITE IS
 * THE ONE THAT LASTS. Measured 2026-09-04 against both vendored templates; the
 * full write-up is in `docs/reports/estar-acrobat-behaviour-2026-09-04.md`.
 *
 * Several cells this map addresses are not boxes an applicant types in. They are
 * SUMMARIES, and the template's own JavaScript owns them: it blanks each one and
 * rebuilds it from a SOURCE field elsewhere in the form. Write only the summary
 * and the applicant's very first click erases it — the script clears the cell and
 * rebuilds it from a source we left empty. Write the source as well and the same
 * script puts the value back, which is what the form is built to do.
 *
 * The specs are named constants rather than repeated literals because each is
 * spelled out in four places (both shared maps and both 510(k) maps), and a
 * source path that drifted in one of them would be a value lost on one pathway
 * and kept on another.
 */

/**
 * Device trade name → the Declaration of Conformity cell AND the device listing
 * row FDA rebuilds it from.
 *
 * `DCTextField140` is owned by `DeviceDescription.Devices` `<variables>
 * Validation()`, which blanks it and rebuilds it by concatenating
 * `Device[i].TradeName` across the listing repeat. Both assignments sit at the
 * top level of that function, outside every branch, and it is the only script in
 * either template that writes the cell. The pathway radio's change handler — the
 * click that reveals the form — ends with `DeviceDescription.Devices.Functions
 * .Validation();` in its COMMON TAIL, after the 510(k), De Novo and PMA branches
 * have all closed, so this applies on every marketing pathway.
 *
 * `root.DeviceDescription.Devices.Device.TradeName` is declared by both templates,
 * present in both shipped `datasets` skeletons with exactly one instance, and no
 * script in either template clears it except the applicant switching jurisdiction
 * away from US FDA or clicking Delete Device. With one device and no model number
 * the rebuild is byte-for-byte the trade name. pdf.js, an independent XFA engine,
 * binds and renders a value written there.
 *
 * It is not an extra row to remove: `Device` ships with a single instance either
 * way, so this fills the row the applicant was going to type in. FDA's rebuild
 * also reaches two cells no map declares — the Indications for Use device-name box
 * and the global-bound page footer — because that is what the form does with its
 * own device listing.
 */
const DECLARATION_DEVICE_TRADE_NAME: OfficialPdfFieldSpec = {
  xfaSomPath: 'root.AdministrativeDocumentation.DoC.DCTextField140',
  alsoWriteSomPaths: ['root.DeviceDescription.Devices.Device.TradeName'],
  type: 'text',
  caption: 'Device Trade Name',
};

/**
 * Product code → the 510(k) Summary cell AND the Product Code selector FDA
 * rebuilds it from.
 *
 * `Classification.USAKnownClassification.DDDropDownList517` `[exit]` opens by
 * blanking `PMNSummary.SSTextField260` and `SSTextField240`, and the pathway
 * radio's 510(k) branch fires that exit directly
 * (`DDDropDownList517.execEvent("exit")`). It then rebuilds `SSTextField260` from
 * `this.rawValue.substr(0,3)`, appending the Associated Product Code(s) field when
 * that is set — FDA's own composition for a cell captioned "Product Code(s)".
 * `DDTextField517a` `[exit]`, which the associated-codes mapping already writes,
 * blanks the same summary cell on its way past.
 *
 * The dropdown is `textEntry="1"` and its handler special-cases a typed bare code
 * (`//Convert pro code to upper case, if only pro code entered`), so the governed
 * product code goes in exactly as stored, with nothing added.
 *
 * WHAT IS DELIBERATELY NOT WRITTEN: the dropdown's own items read
 * `XXX (Class N) - <classification name>`, and writing that composite would make
 * FDA's script rebuild the Classification Name cell as well. It would also put a
 * string into the form that LOOKS like a selection from FDA's 6,153-item catalog
 * but was assembled by us from three separate columns — and if our stored
 * classification name differs from FDA's for that code, the form would carry a
 * plausible, wrong catalog entry. The bare code asserts only what we hold.
 * `deviceClassificationName` is therefore still cleared by the reveal click; that
 * is recorded in ESTAR_TEMPLATE_RECOMPUTED_FIELDS rather than papered over.
 */
const PRODUCT_CODES: OfficialPdfFieldSpec = {
  xfaSomPath: 'root.AdministrativeDocumentation.PMNSummary.SSTextField260',
  alsoWriteSomPaths: ['root.Classification.USAKnownClassification.DDDropDownList517'],
  type: 'text',
  caption: 'Product Code(s)',
};

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
  declarationDeviceTradeName: DECLARATION_DEVICE_TRADE_NAME,
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
  declarationDeviceTradeName: DECLARATION_DEVICE_TRADE_NAME,
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
    productCodes: PRODUCT_CODES,
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
    declarationDeviceTradeName: DECLARATION_DEVICE_TRADE_NAME,
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
    productCodes: PRODUCT_CODES,
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
    declarationDeviceTradeName: DECLARATION_DEVICE_TRADE_NAME,
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
 * FOUR OF THEM ARE CLEARED BY THE PATHWAY CLICK ITSELF. The
 * `root.ApplicationType.USA.ATRadioButton110` `<event activity="change">` handler
 * — the click that reveals the sections — runs
 * `Classification.USAKnownClassification.DDDropDownList517.execEvent("exit");`
 * (whose first two statements are
 * `AdministrativeDocumentation.PMNSummary.SSTextField260.rawValue = "";` and
 * `AdministrativeDocumentation.PMNSummary.SSTextField240.rawValue = "";`) in its
 * 510(k) branch, and `DeviceDescription.Devices.Functions.Validation();` (whose
 * defaults are `AdministrativeDocumentation.DoC.DCTextField140.rawValue = "";`
 * and `AdministrativeDocumentation.PMNSummary.SSTextField220.rawValue = "";`) in
 * its COMMON TAIL, after the 510(k), De Novo and PMA branches have all closed.
 *
 * THIS IS NO LONGER ONLY A RECORD OF LOSS. Two of those four sources are now
 * mapped — `Device[].TradeName` and `DDDropDownList517`, through the
 * `alsoWriteSomPaths` of `declarationDeviceTradeName` and `productCodes` — so the
 * same click that used to erase those values now REBUILDS them from what we
 * wrote. `rebuildOutcome` says which of the three things the rebuild does to each
 * field, and it is the column to read: `clearedByPathwayClick` only says WHEN.
 *
 * Pinned against the vendored template by
 * `estar-field-map.template-behaviour.test.ts`.
 */
export interface EstarRecomputedField {
  /** Template scripts that assign this field's `rawValue`, by SOM path + activity. */
  readonly writtenBy: readonly string[];
  /** The field the rebuild reads, in the template's own SOM terms. */
  readonly rebuiltFrom: string | null;
  /** True when the pathway radio's own change cascade clears this field. */
  readonly clearedByPathwayClick: boolean;
  /**
   * What the template's rebuild leaves in this cell.
   *
   *   'reproduces'  — the field map writes `rebuiltFrom` with THIS key's own
   *                   governed value, so the rebuild puts our value back.
   *   'blanks'      — `rebuiltFrom` is unmapped, so the rebuild writes empty and
   *                   whatever we put in the cell is gone.
   *   'substitutes' — `rebuiltFrom` is mapped, but from a DIFFERENT governed
   *                   fact, so the rebuild replaces our value with that one. This
   *                   is the dangerous case: the cell is not blank, it is wrong.
   */
  readonly rebuildOutcome: 'reproduces' | 'blanks' | 'substitutes';
  /** Why the outcome is what it is, where the outcome alone understates it. */
  readonly note?: string;
}

export const ESTAR_TEMPLATE_RECOMPUTED_FIELDS: Readonly<Record<string, EstarRecomputedField>> = {
  deviceTradeName: {
    writtenBy: ['root.DeviceDescription.Devices <variables>'],
    rebuiltFrom: 'root.DeviceDescription.Devices.Device[].TradeName',
    clearedByPathwayClick: true,
    rebuildOutcome: 'reproduces',
    note:
      'The listing row `Device[].TradeName` is written through this key\'s twin '  +
      '`declarationDeviceTradeName`, which resolves to the same governed fact, so the concatenation '  +
      'the rebuild performs over a single device with no model number is byte-for-byte our value.',
  },
  deviceCommonName: {
    writtenBy: ['root.Classification.USAKnownClassification.DDDropDownList513 [exit]'],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList513',
    clearedByPathwayClick: false,
    rebuildOutcome: 'blanks',
  },
  deviceClassificationName: {
    writtenBy: ['root.Classification.USAKnownClassification.DDDropDownList517 [exit]'],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList517',
    clearedByPathwayClick: true,
    rebuildOutcome: 'blanks',
    note:
      '`DDDropDownList517` IS written, but with the bare product code. FDA rebuilds this cell from '  +
      '`rawValue.substr(16)` under `if (rawValue.length > 16)`, and a three-letter code fails that '  +
      'guard, so the cell keeps the empty string set at the top of the handler. Writing the full '  +
      '`XXX (Class N) - <name>` composite would rebuild it, and is refused: see PRODUCT_CODES.',
  },
  regulationNumber: {
    writtenBy: ['root.Classification.USAKnownClassification.DDDropDownList513 [exit]'],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList513',
    clearedByPathwayClick: false,
    rebuildOutcome: 'blanks',
  },
  productCodes: {
    writtenBy: [
      'root.Classification.USAKnownClassification.DDDropDownList517 [exit]',
      'root.Classification.USAKnownClassification.DDTextField517a [exit]',
    ],
    rebuiltFrom: 'root.Classification.USAKnownClassification.DDDropDownList517',
    clearedByPathwayClick: true,
    rebuildOutcome: 'reproduces',
    note:
      '`DDDropDownList517` is written with the governed product code. FDA rebuilds this cell as '  +
      '`rawValue.substr(0,3)`, then appends `", " + DDTextField517a` when the associated codes are '  +
      'set — so a filing that has associated codes ends with MORE here than we wrote, which is '  +
      'FDA\'s own composition for a cell captioned Product Code(s).',
  },
  associatedProductCodes: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false, rebuildOutcome: 'reproduces' },
  applicantCompanyName: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false, rebuildOutcome: 'reproduces' },
  applicantContactEmail: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false, rebuildOutcome: 'reproduces' },
  applicantContactTelephone: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField170',
    clearedByPathwayClick: false,
    rebuildOutcome: 'blanks',
    note:
      '`ADTextField170` is deliberately unmapped: the template constrains it to `maxChars="15"` '  +
      'with a digits-only picture, and neither `client_workspaces.contact_phone` nor '  +
      '`estar_registrations.correspondent_telephone` is constrained to that at capture. Writing an '  +
      'over-length or punctuated value into a field the form\'s own message says does not accept it '  +
      'would rely on unobserved Acrobat behaviour. Constrain capture first.',
  },
  // Rebuilt from a field WE DO map, so the rebuild reproduces our own value.
  applicantSummaryEmail: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField160',
    clearedByPathwayClick: false,
    rebuildOutcome: 'reproduces',
  },
  correspondentCompanyName: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false, rebuildOutcome: 'reproduces' },
  correspondentContactEmail: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false, rebuildOutcome: 'reproduces' },
  correspondentTelephone: {
    writtenBy: [
      'root.AdministrativeInformation.CorrespondentInformation.DeleteCorrespondent [click]',
      'root.AdministrativeInformation.CorrespondentInformation <variables>',
    ],
    rebuiltFrom: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField370',
    clearedByPathwayClick: false,
    rebuildOutcome: 'blanks',
    note: '`ADTextField370` unmapped for the same reason as `applicantContactTelephone`.',
  },
  // Rebuilt from a field WE DO map, so the rebuild reproduces our own value.
  correspondentSummaryEmail: {
    writtenBy: [
      'root.AdministrativeInformation.CorrespondentInformation.DeleteCorrespondent [click]',
      'root.AdministrativeInformation.CorrespondentInformation <variables>',
    ],
    rebuiltFrom: 'root.AdministrativeInformation.CorrespondentInformation.ADTextField360',
    clearedByPathwayClick: false,
    rebuildOutcome: 'reproduces',
  },
  // Nulled only when the applicant explicitly deletes the predicate instance.
  predicateSubmissionNumber: {
    writtenBy: ['root.PredicatesSE.PredicateReference.DeletePredicate [click]'],
    rebuiltFrom: null,
    clearedByPathwayClick: false,
    rebuildOutcome: 'blanks',
  },
  predicateDeviceTradeName: {
    writtenBy: ['root.PredicatesSE.PredicateReference.DeletePredicate [click]'],
    rebuiltFrom: null,
    clearedByPathwayClick: false,
    rebuildOutcome: 'blanks',
  },
  // Rebuilt from a field WE DO map, so the rebuild reproduces our own value.
  declarationCompanyName: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField210',
    clearedByPathwayClick: false,
    rebuildOutcome: 'substitutes',
    note:
      '`ADTextField210` IS mapped — as `applicantCompanyName`, from `client_workspaces.name`. This '  +
      'key reads `estar_registrations.declaration_company_name`, and the whole reason that column '  +
      'exists is that an organization filing for several clients must be able to name a DIFFERENT '  +
      'legal entity on the Declaration of Conformity. FDA\'s rebuild is unconditional, so the moment '  +
      'the applicant tabs through any applicant field the DoC company name becomes the APPLICANT '  +
      'company name. The form owns this cell and derives it from the applicant block; there is no '  +
      'source we could write that would hold a different entity here.',
  },
  declarationCompanyAddress: {
    writtenBy: ['root.AdministrativeInformation.ApplicantInformation <variables>'],
    rebuiltFrom: 'root.AdministrativeInformation.ApplicantInformation.ADTextField220..ADDropDownList270',
    clearedByPathwayClick: false,
    rebuildOutcome: 'blanks',
    note:
      'The template holds the address as six separate parts (two street lines, city, state, zip, '  +
      'and a 274-item country dropdown that ships set to USA), and FDA\'s rebuild always appends the '  +
      'country\'s display text. `estar_registrations.declaration_company_address` is one free-text '  +
      'column, so writing the source would mean parsing an address — and would append a country '  +
      'nobody entered. It needs structured columns before the source can be written.',
  },
  declarationDeviceTradeName: {
    writtenBy: ['root.DeviceDescription.Devices <variables>'],
    rebuiltFrom: 'root.DeviceDescription.Devices.Device[].TradeName',
    clearedByPathwayClick: true,
    rebuildOutcome: 'reproduces',
    note: '`Device[].TradeName` is written through this key\'s own `alsoWriteSomPaths`.',
  },
  indicationsForUseCitation: { writtenBy: [], rebuiltFrom: null, clearedByPathwayClick: false, rebuildOutcome: 'reproduces' },
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
