/** Regional device authoring groups used by the existing project blueprint.
 * These replace cross-jurisdiction/510(k) substitutions, not agency templates.
 * Ordinals are platform keys; applicability, current form versions and technical
 * conformance require sponsor/regulatory review. References are locations to
 * verify, not a claim that their current text was retrieved or validated.
 */
import type { SectionDefinition } from './document-taxonomy';
import type { RegulatoryBasis } from './regulatory-basis';

type Heading = readonly [key: string, title: string];
function groups(ref: string, headings: readonly Heading[]): SectionDefinition[] {
  return headings.map(([code, title]) => ({ code, title, module: 0, required: false, contentType: 'mixed', guidance: ref }));
}

const PMA = groups('21 CFR 814.20; confirm current FDA PMA content and applicability', [
  ['administrative', 'Application, Applicant and Administrative Records'],
  ['summary', 'Summary of Safety and Effectiveness Evidence'],
  ['device', 'Device Description, Intended Use and Principles of Operation'],
  ['manufacturing', 'Manufacturing, Facilities and Quality Controls'],
  ['nonclinical', 'Nonclinical Laboratory and Performance Evidence'],
  ['clinical', 'Clinical Investigation Evidence and Benefit-Risk Assessment'],
  ['labeling', 'Proposed Labeling and Instructions for Use'],
  ['standards', 'Applicable Standards and Conformity Evidence'],
  ['references', 'Published Literature and Referenced Information'],
  ['other', 'Environmental and Other Applicable Administrative Requirements'],
]);
const DE_NOVO = groups('21 CFR 860.220; confirm current FDA De Novo request requirements', [
  ['administrative', 'Requester, Device Identification and Regulatory History'],
  ['device', 'Device Description, Intended Use and Proposed Classification'],
  ['classification', 'Classification Rationale and Applicable Existing Classifications'],
  ['risk', 'Risks to Health and Proposed General and Special Controls'],
  ['performance', 'Nonclinical and Clinical Performance Evidence'],
  ['benefit_risk', 'Benefit-Risk Assessment and Evidence Limitations'],
  ['labeling', 'Proposed Labeling and Instructions for Use'],
  ['supporting', 'Standards, Supporting Records and Administrative Requirements'],
]);
const HDE = groups('21 CFR 814.104; confirm current FDA HDE requirements', [
  ['administrative', 'Applicant, Humanitarian Use Device Designation and Application'],
  ['eligibility', 'Humanitarian Eligibility, Population and Available Alternatives'],
  ['device', 'Device Description and Proposed Indications'],
  ['benefit_risk', 'Probable Benefit, Risks and Supporting Evidence'],
  ['manufacturing', 'Manufacturing and Quality Information'],
  ['labeling', 'Humanitarian Device Labeling and Instructions for Use'],
  ['clinical', 'Clinical Experience, Investigation Records and Applicable Oversight'],
  ['supporting', 'Other Applicable Application Records and References'],
]);
const EUA = groups('FD&C Act section 564; confirm current product-specific FDA EUA instructions', [
  ['administrative', 'Requester, Product Identification and Authorization Request'],
  ['emergency', 'Emergency Use, Eligibility and Regulatory Context'],
  ['device', 'Device Description, Intended Use and Proposed Users'],
  ['performance', 'Available Performance and Clinical Evidence and Limitations'],
  ['benefit_risk', 'Known and Potential Benefits, Risks and Alternatives'],
  ['manufacturing', 'Manufacturing, Quality Controls and Supply Information'],
  ['labeling', 'Proposed Labeling, Instructions and Recipient Information'],
  ['conditions', 'Proposed Conditions, Monitoring and Follow-Up'],
]);
const CANADA = groups('Canada Medical Devices Regulations SOR/98-282 section 32; confirm class-specific application requirements', [
  ['administrative', 'Licence Application, Manufacturer and Device Identifiers'],
  ['classification', 'Intended Use, Device Classification and Licence Scope'],
  ['device', 'Device Description, Design and Materials'],
  ['safety', 'Safety and Effectiveness Requirements and Supporting Evidence'],
  ['nonclinical', 'Nonclinical Testing and Verification Evidence'],
  ['clinical', 'Clinical Evidence, Benefit-Risk and Evidence Gaps'],
  ['manufacturing', 'Manufacturing, Quality System and Applicable Certification'],
  ['labeling', 'Canadian Labeling and Instructions for Use'],
  ['history', 'Marketing History, Foreign Authorizations and Relevant Changes'],
  ['supporting', 'Declarations, References and Class-Specific Supporting Records'],
]);
const JAPAN = groups('Japan PMD Act; confirm current PMDA/MHLW device approval instructions and applicable standards', [
  ['administrative', 'Japanese Application, Applicant and Marketing Authorization Holder'],
  ['classification', 'Device Classification, Intended Use and Approval Route'],
  ['device', 'Device Description, Design, Specifications and Principles of Operation'],
  ['principles', 'Applicable Essential Principles and Standards Evidence'],
  ['evidence', 'Nonclinical, Performance and Clinical Evidence as Applicable'],
  ['local_evidence', 'Foreign Evidence Applicability and Documented Japanese Consultation'],
  ['manufacturing', 'Manufacturing Sites, Quality System and Conformity Records'],
  ['labeling', 'Japanese Labeling, Instructions and Translation Review'],
  ['summary', 'Technical Summary, Source References and Unresolved Requirements'],
]);
const CERTIFICATION = groups('Japan PMD Act; confirm registered certification body, certification standard and eligible scope', [
  ['administrative', 'Certification Application and Responsible Japanese Entities'],
  ['eligibility', 'Device Classification and Certification-Standard Eligibility'],
  ['device', 'Device Description, Intended Use and Specifications'],
  ['conformity', 'Essential Principles, Certification Standards and Conformity Evidence'],
  ['manufacturing', 'Manufacturing and Quality System Conformity'],
  ['labeling', 'Japanese Labeling, Instructions and Source References'],
  ['questions', 'Certification Body Questions and Unresolved Requirements'],
]);
const IVD = groups('Confirm the target authority and assay-specific evidence requirements; IVDR Annex XIII is not a universal filing standard', [
  ['ivd_performance', 'Assay, Specimen, Analytical and Clinical Performance Evidence'],
]);
const CDX = groups('Confirm paired therapeutic product, intended population and authority consultation requirements', [
  ['paired_product', 'Paired Therapeutic Product, Selection Claim and Co-Development Evidence'],
]);

const QMS_BASIS = 'ISO 13485:2016; US QMSR 21 CFR 820.10 where applicable; verify current scope and source records';
const DESIGN_RECORDS = groups(QMS_BASIS, [
  ['scope', 'Device, configuration and design record scope'],
  ['planning', 'Design planning, responsibilities and controlled inputs'],
  ['traceability', 'Design outputs, review and requirements traceability'],
  ['verification', 'Verification, validation and unresolved evidence'],
  ['transfer', 'Design transfer, approved changes and source record index'],
]);

/** One authoring record per blueprint identity; no copied registry or UUIDs. */
export const DEVICE_AUTHORING_SECTION_CORRECTIONS: Readonly<Record<string, SectionDefinition[]>> = {
  qms_quality_manual_sections: groups(QMS_BASIS, [
    ['scope', 'Quality system scope, device families and applicable requirements'],
    ['policy', 'Quality policy, objectives and responsible management'],
    ['processes', 'Process interactions, responsibilities and controlled procedures'],
    ['records', 'Document control, quality records and review ownership'],
    ['improvement', 'Management review, audit and corrective action interfaces'],
  ]),
  qms_design_controls_sections: DESIGN_RECORDS,
  us_dhf_sections: DESIGN_RECORDS,
  qms_dmr_sections: groups(QMS_BASIS, [
    ['scope', 'Device model, configuration and master record scope'],
    ['specifications', 'Approved device and manufacturing specifications'],
    ['production', 'Production, inspection and acceptance procedures'],
    ['labeling', 'Controlled packaging, labeling and installation records'],
    ['sources', 'Approved revisions, change control and source record index'],
  ]),
  qms_dhr_sections: groups(QMS_BASIS, [
    ['identity', 'Batch or unit identity, configuration and production interval'],
    ['production', 'Actual production and traceable source records'],
    ['acceptance', 'Acceptance results, deviations and disposition records'],
    ['release', 'Authorized release and original signed records'],
    ['traceability', 'Distribution traceability, record gaps and review ownership'],
  ]),
  qms_mdsap_sections: groups('MDSAP audit model and applicable participating-authority requirements; obtain current auditing organization records', [
    ['scope', 'Auditing organization, audit scope and applicable jurisdictions'],
    ['original', 'Original independent audit report and provenance'],
    ['findings', 'Source-linked findings, nonconformities and evidence gaps'],
    ['responses', 'Manufacturer responses and corrective action evidence'],
    ['follow_up', 'Auditing organization follow-up and controlled report versions'],
  ]),
  qms_qsr_820_sections: groups('US QMSR 21 CFR 820.10 and incorporated ISO 13485:2016; verify current requirements', [
    ['scope', 'Device, facility and applicable QMSR scope'],
    ['mapping', 'Current QMSR and incorporated standard source mapping'],
    ['records', 'Controlled procedures and objective evidence index'],
    ['gaps', 'Evidence gaps, remediation and accountable review'],
  ]),
  qms_iso_13485_sections: groups(QMS_BASIS, [
    ['scope', 'Quality system scope and applicable ISO 13485 requirements'],
    ['mapping', 'Process, procedure and objective evidence mapping'],
    ['audit', 'Original audit and certification records where available'],
    ['gaps', 'Nonconformities, corrective actions and review ownership'],
  ]),
  us_pma_sections: PMA,
  us_de_novo_sections: DE_NOVO,
  us_hde_sections: HDE,
  us_eua_sections: EUA,
  us_pma_supp_sections: groups('21 CFR 814.39; confirm supplement category and affected PMA scope', [
    ['parent', 'Parent PMA, Supplement Category and Regulatory History'],
    ['change', 'Proposed Change, Rationale and Affected Device Configuration'],
    ['evidence', 'Supporting Verification, Validation and Clinical Evidence as Applicable'],
    ['quality', 'Affected Manufacturing and Quality Information'],
    ['labeling', 'Affected Labeling and Application Sections'],
    ['supporting', 'Change Control, Administrative Records and References'],
  ]),
  us_cdx_pma_sections: [...PMA, ...IVD, ...CDX],
  us_pma_ivd_sections: [...PMA, ...IVD],
  us_de_novo_ivd_sections: [...DE_NOVO, ...IVD],
  us_eua_ivd_sections: [...EUA, ...IVD],
  ca_mdl_sections: CANADA,
  ca_ivd_licence_sections: [...CANADA, ...IVD],
  jp_shonin_sections: JAPAN,
  jp_nintei_sections: CERTIFICATION,
  jp_todokede_sections: groups('Japan PMD Act; PMDA Regulations and Approval/Certification of Medical Devices: Class I notification', [
    ['administrative', 'Notification, Device Identifiers and Responsible Japanese Entities'],
    ['classification', 'Class I Classification Rationale and Applicable Device Scope'],
    ['device', 'Device Description, Intended Use and Specifications'],
    ['labeling', 'Japanese Labeling, Instructions and Source Records'],
    ['requirements', 'Current Notification Instructions, Supporting Records and Unresolved Requirements'],
  ]),
  jp_ivd_approval_sections: [...JAPAN, ...IVD],
  jp_cdx_sections: [...JAPAN, ...IVD, ...CDX],
};

export const DEVICE_AUTHORING_LIMITATIONS = [
  'These are platform preparation groups, not a verified current agency template, complete requirement list or legal applicability decision. Section keys are not agency form or dossier numbering.',
  'Unmarked required flags leave applicability unresolved; they never waive applicable content. Confirm device/assay/version, class, pathway, jurisdiction, current instructions and original forms with the accountable reviewer.',
  'Preserve source datasets, test reports, original application forms, certificates and signed records. A narrative worksheet does not replace them, qualify a package or enable transmission.',
  'Do not author or imply an independent audit report, signed release, certificate or executed production record from this scaffold.',
];

export function deviceAuthoringBlueprintContext(blueprintId: string): { basis: RegulatoryBasis; limitations: readonly string[] } | undefined {
  const sections = DEVICE_AUTHORING_SECTION_CORRECTIONS[blueprintId];
  if (!sections) return undefined;
  return {
    basis: { ref: `Platform device authoring groups; reference locations: ${[...new Set(sections.map(s => s.guidance))].join('; ')}`, confidence: 'platform-convention', note: 'References locate material to verify; current regulator text was not independently checked for this outline.' },
    limitations: DEVICE_AUTHORING_LIMITATIONS,
  };
}
