/**
 * Global market registry — structured, comparable descriptors for the world's
 * major regulated markets for medical devices and IVDs.
 *
 * WHY THIS EXISTS: existing modules each cover a slice — drug eCTD region
 * profiles (region-profile-service), per-format submission governance
 * (market-submission-specs), drug pathway readiness (global-pathways), and a
 * prose IVD corpus (global-ivd*.ts). None give ONE typed, side-by-side
 * descriptor per market that spans BOTH devices and IVDs with honest platform
 * capability flags. This registry is that single comparable view.
 *
 * HONEST BY CONSTRUCTION: `canTransmit` is false for every market; `canAssemble`
 * is true only where the platform already produces the artifact (eCTD backbone,
 * FDA eSTAR mapper, EU CE technical documentation / CER packager).
 *
 * PURE + DETERMINISTIC: static data + pure lookups. No DB, no network, no LLM.
 *
 * @module server/services/global-markets/market-registry
 */

import type { MarketDescriptor, MarketId } from './types';

/**
 * Cross-market QMS audit elements shared by MDSAP-participating markets, kept
 * here as a single source so the descriptors stay consistent.
 */
const MDSAP_QMS_ELEMENTS = [
  'iso_13485_qms',
  'management_process',
  'design_development_process',
  'capa_process',
  'production_service_controls',
];

export const MARKET_DESCRIPTORS: Record<MarketId, MarketDescriptor> = {
  // ── United States — FDA ─────────────────────────────────────────────────────
  'us-fda': {
    id: 'us-fda',
    name: 'United States — FDA (CDRH)',
    region: 'north-america',
    authority: 'U.S. Food and Drug Administration — Center for Devices and Radiological Health',
    authorityShort: 'FDA',
    jurisdictions: ['US'],
    dossierStandard: 'fda-estar',
    dossierFormatName: 'FDA eSTAR (510(k)/De Novo) — eCTD for combination/drug-led',
    ivdSupport:
      'IVDs are devices regulated by CDRH (OHT7); same 510(k)/De Novo/PMA pathways apply, with CLIA categorization and CDx co-development under PMA where applicable.',
    classificationScheme:
      'Risk-based Class I / II / III (21 CFR 860); IVDs follow the same three-class scheme with product-code-specific special controls.',
    devicePathways: ['510(k)', 'De Novo', 'PMA', 'HDE', 'Exempt'],
    ivdPathways: ['510(k)', 'De Novo', 'PMA (incl. CDx)', 'CLIA waiver'],
    localRepresentativeRequired: true, // U.S. Agent for foreign establishments
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'English',
      translationRequired: true,
      note: 'All content in English; certified translations of foreign-language source documents.',
    },
    qmsExpectation: 'iso-13485', // QMSR (21 CFR 820) harmonised to ISO 13485 from 2026
    requiredDossierElements: [
      'device_classification',
      'predicate_or_benefit_risk',
      'safety_effectiveness_evidence',
      'performance_testing',
      'labelling',
      'qms_quality_system',
      'us_agent',
    ],
    canAssemble: true,
    assembleNote:
      'Platform assembles FDA eSTAR (device 510(k)/De Novo) and eCTD (drug-led) packages; this descriptor is assembly-aware.',
    canTransmit: false,
    citations: [
      '21 CFR 807 (510(k)); 21 CFR 814 (PMA); 21 CFR 860 (classification)',
      'FDA eSTAR program & guidance "Electronic Submission Template for Medical Device 510(k)"',
      'QMSR final rule (21 CFR 820 harmonised to ISO 13485), effective 2026',
    ],
  },

  // ── European Union — MDR / IVDR ─────────────────────────────────────────────
  'eu-mdr-ivdr': {
    id: 'eu-mdr-ivdr',
    name: 'European Union — MDR / IVDR (Notified Bodies & EUDAMED)',
    region: 'europe',
    authority: 'EU Notified Bodies under Regulations (EU) 2017/745 (MDR) & 2017/746 (IVDR); EUDAMED',
    authorityShort: 'EU-NB',
    jurisdictions: ['EU', 'EEA'],
    dossierStandard: 'ce-technical-documentation',
    dossierFormatName: 'CE technical documentation (MDR/IVDR Annex II/III) + EUDAMED registration',
    ivdSupport:
      'IVDs regulated separately under IVDR (2017/746) with Class A–D risk rules; Class B–D require Notified Body involvement and a Performance Evaluation Report (PER).',
    classificationScheme:
      'Devices: MDR Class I / IIa / IIb / III (rule-based). IVDs: IVDR Class A / B / C / D (rule-based, GHTF-aligned).',
    devicePathways: ['Self-declaration (Class I)', 'NB conformity assessment (IIa/IIb/III)'],
    ivdPathways: ['Self-declaration (Class A non-sterile)', 'NB conformity assessment (B/C/D)'],
    localRepresentativeRequired: true, // EU Authorised Representative for non-EU mfrs
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'IFU/labelling in the official language(s) of each member state of placement (up to 24)',
      translationRequired: true,
      note: 'Technical documentation typically English per NB agreement; IFU/labelling translated per member state.',
    },
    qmsExpectation: 'iso-13485',
    requiredDossierElements: [
      'device_classification',
      'gspr_checklist',
      'technical_documentation',
      'clinical_or_performance_evaluation',
      'declaration_of_conformity',
      'iso_13485_certificate',
      'eu_authorised_representative',
      'eudamed_registration',
    ],
    canAssemble: true,
    assembleNote:
      'Platform assembles EU MDR/IVDR technical documentation and CER/PER packages (technical-file packager); this descriptor is assembly-aware.',
    canTransmit: false,
    citations: [
      'Regulation (EU) 2017/745 (MDR) Annex I/II/III',
      'Regulation (EU) 2017/746 (IVDR) Annex I/II/III',
      'MDCG guidance; EUDAMED documentation',
    ],
  },

  // ── United Kingdom — MHRA ────────────────────────────────────────────────────
  'uk-mhra': {
    id: 'uk-mhra',
    name: 'United Kingdom (Great Britain) — MHRA',
    region: 'europe',
    authority: 'Medicines and Healthcare products Regulatory Agency',
    authorityShort: 'MHRA',
    jurisdictions: ['GB'],
    dossierStandard: 'ce-technical-documentation',
    dossierFormatName: 'UKCA technical documentation (UK MDR 2002 as amended) + MHRA registration',
    ivdSupport:
      'IVDs covered by the UK MDR 2002; CE/EU-IVDR IVDs accepted during transition. New UK IVD-specific framework and PMS rules phasing in; Northern Ireland follows EU IVDR (Windsor Framework).',
    classificationScheme:
      'GB largely mirrors the legacy EU classification (devices I/IIa/IIb/III; IVDs by Annex II list / self-test / general), transitioning toward IMDRF-aligned rules.',
    devicePathways: ['UKCA marking', 'CE marking (accepted in transition)'],
    ivdPathways: ['UKCA marking', 'CE/EU-IVDR (accepted in transition)'],
    localRepresentativeRequired: true, // UK Responsible Person for non-UK mfrs
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'English for the GB market',
      translationRequired: true,
      note: 'EU IVDR/MDR technical file largely reusable; layer UK registration + UK Responsible Person + UK PMS.',
    },
    qmsExpectation: 'iso-13485',
    requiredDossierElements: [
      'device_classification',
      'technical_documentation',
      'clinical_or_performance_evaluation',
      'declaration_of_conformity',
      'iso_13485_certificate',
      'uk_responsible_person',
      'mhra_registration',
    ],
    canAssemble: true,
    assembleNote:
      'Platform reuses the EU CE technical-documentation/CER assembler for the UKCA file; UK Module 1 + registration layered separately.',
    canTransmit: false,
    citations: [
      'UK Medical Devices Regulations 2002 (as amended); MHRA guidance',
      'MHRA roadmap / PMS Regulations 2024; Windsor Framework',
    ],
  },

  // ── Japan — PMDA / MHLW ─────────────────────────────────────────────────────
  'jp-pmda': {
    id: 'jp-pmda',
    name: 'Japan — PMDA / MHLW',
    region: 'asia-pacific',
    authority: 'Pharmaceuticals and Medical Devices Agency / Ministry of Health, Labour and Welfare',
    authorityShort: 'PMDA',
    jurisdictions: ['JP'],
    dossierStandard: 'national-form-set',
    dossierFormatName: 'STED-like Japanese application (shōnin/ninshō/todokede) under the PMD Act',
    ivdSupport:
      'IVDs are a distinct category under the PMD Act; established types with certification standards go via third-party certification (ninshō), novel/high-risk via MHLW approval (shōnin).',
    classificationScheme:
      'Risk classes I–IV (GHTF-aligned); review route by class: notification (todokede) / certification (ninshō) / approval (shōnin).',
    devicePathways: ['Todokede (notification)', 'Ninshō (third-party certification)', 'Shōnin (MHLW approval)'],
    ivdPathways: ['Todokede', 'Ninshō', 'Shōnin (incl. CDx)'],
    localRepresentativeRequired: true, // MAH / DMAH
    localization: {
      primaryLanguage: 'ja',
      labellingLanguages: 'Japanese',
      translationRequired: true,
      note: 'Japanese-language dossier and labelling; bridging/local data may be expected (esp. genetic/CDx).',
    },
    qmsExpectation: 'iso-13485-or-national', // MHLW Ord. 169, ISO 13485-aligned; MDSAP accepted
    requiredDossierElements: [
      'device_classification',
      'sted_dossier',
      'safety_effectiveness_evidence',
      'japanese_labelling',
      'marketing_authorisation_holder',
      'qms_ordinance_169',
    ],
    canAssemble: false,
    assembleNote:
      'No PMDA STED assembler in the platform; descriptive + readiness only.',
    canTransmit: false,
    citations: [
      'Pharmaceuticals and Medical Devices Act (PMD Act)',
      'MHLW Ordinance No. 169 (QMS, ISO 13485-aligned); MDSAP acceptance in Japan',
    ],
  },

  // ── China — NMPA ────────────────────────────────────────────────────────────
  'cn-nmpa': {
    id: 'cn-nmpa',
    name: 'China — NMPA',
    region: 'asia-pacific',
    authority: 'National Medical Products Administration (CMDE/CDE review)',
    authorityShort: 'NMPA',
    jurisdictions: ['CN'],
    dossierStandard: 'national-form-set',
    dossierFormatName: 'NMPA registration dossier (Class I filing / Class II–III registration) — China-specific',
    ivdSupport:
      'IVDs follow IVD-specific rules; most Class II/III IVDs require type testing at an NMPA-recognised Chinese lab and local clinical trial/evaluation data — the most data-intensive major market.',
    classificationScheme:
      'Risk classes I / II / III (RSAMD Decree 739): I = municipal record-filing (备案), II = provincial registration, III = national NMPA registration.',
    devicePathways: ['Class I filing (备案)', 'Class II provincial registration', 'Class III national registration'],
    ivdPathways: ['Class I filing', 'Class II registration', 'Class III registration'],
    localRepresentativeRequired: true, // China-based legal agent / registrant
    localization: {
      primaryLanguage: 'zh',
      labellingLanguages: 'Chinese (Simplified)',
      translationRequired: true,
      note: 'Chinese-language dossier/labelling; in-country type testing (GB/YY) and local clinical data typically required.',
    },
    qmsExpectation: 'national-gmp',
    requiredDossierElements: [
      'device_classification',
      'type_testing_chinese_lab',
      'clinical_evaluation_or_trial',
      'chinese_labelling',
      'china_legal_agent',
      'quality_system',
    ],
    canAssemble: false,
    assembleNote:
      'No NMPA dossier assembler; in-country type testing/clinical data are out of platform scope. Descriptive + readiness only.',
    canTransmit: false,
    citations: [
      'RSAMD (State Council Decree No. 739)',
      'Measures for the Administration of Medical Device Registration; GB/YY standards',
    ],
  },

  // ── Canada — Health Canada ──────────────────────────────────────────────────
  'ca-health-canada': {
    id: 'ca-health-canada',
    name: 'Canada — Health Canada',
    region: 'north-america',
    authority: 'Health Canada — Medical Devices Directorate',
    authorityShort: 'HC',
    jurisdictions: ['CA'],
    dossierStandard: 'imdrf-toc',
    dossierFormatName: 'Medical Device Licence (MDL) application — IMDRF ToC accepted; MDEL for Class I',
    ivdSupport:
      'IVDs are a defined subset under the Medical Devices Regulations (SOR/98-282) with IVD-specific classification rules; Class II–IV require an MDL with a valid MDSAP certificate.',
    classificationScheme:
      'Risk classes I–IV (SOR/98-282). Class I via establishment licence (MDEL); Class II–IV require a Medical Device Licence (MDL).',
    devicePathways: ['MDEL (Class I)', 'MDL (Class II–IV)'],
    ivdPathways: ['MDEL (Class I)', 'MDL (Class II–IV)'],
    localRepresentativeRequired: false,
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'Bilingual English and French',
      translationRequired: true,
      note: 'Bilingual EN/FR labelling required; evidence largely transferable from FDA/EU files.',
    },
    qmsExpectation: 'mdsap', // mandatory for Class II–IV
    requiredDossierElements: [
      'device_classification',
      'iso_13485_mdsap_certificate',
      'safety_effectiveness_evidence',
      'labelling',
      'quality_plan',
    ],
    canAssemble: false,
    assembleNote:
      'No Health Canada MDL/IMDRF-ToC assembler; descriptive + readiness only. MDSAP certificate is a prerequisite.',
    canTransmit: false,
    citations: [
      'Medical Devices Regulations (SOR/98-282)',
      'Health Canada IMDRF ToC acceptance; mandatory MDSAP for Class II–IV',
    ],
  },

  // ── Australia — TGA ─────────────────────────────────────────────────────────
  'au-tga': {
    id: 'au-tga',
    name: 'Australia — TGA',
    region: 'asia-pacific',
    authority: 'Therapeutic Goods Administration',
    authorityShort: 'TGA',
    jurisdictions: ['AU'],
    dossierStandard: 'imdrf-toc',
    dossierFormatName: 'ARTG inclusion (conformity-assessment evidence; IMDRF ToC / CE / MDSAP leverageable)',
    ivdSupport:
      'IVDs regulated under the IVD framework (2010) with GHTF-aligned Class 1–4; Class 4 in-house IVDs have specific requirements. CE/MDSAP evidence supports conformity assessment.',
    classificationScheme:
      'GHTF/IMDRF-aligned risk classes: devices I/IIa/IIb/III/AIMD; IVDs Class 1–4 (4 highest, e.g. transmissible-agent screening).',
    devicePathways: ['ARTG inclusion (self-declaration Class I)', 'ARTG inclusion (conformity assessment)'],
    ivdPathways: ['ARTG inclusion (Class 1 self-declare)', 'ARTG inclusion (Class 2–4 assessment)'],
    localRepresentativeRequired: true, // Australian sponsor
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'English',
      translationRequired: true,
      note: 'CE/MDSAP/ISO 13485 evidence leverageable; an Australian sponsor holds the ARTG entry.',
    },
    qmsExpectation: 'iso-13485',
    requiredDossierElements: [
      'device_classification',
      'conformity_assessment_evidence',
      'iso_13485_certificate',
      'australian_sponsor',
      'labelling',
    ],
    canAssemble: false,
    assembleNote:
      'No TGA ARTG assembler; conformity-assessment evidence reused from EU/MDSAP work. Descriptive + readiness only.',
    canTransmit: false,
    citations: [
      'Therapeutic Goods Act 1989 + IVD framework (2010)',
      'TGA IVD classification (GHTF-aligned); ARTG inclusion requirements',
    ],
  },

  // ── Brazil — ANVISA ─────────────────────────────────────────────────────────
  'br-anvisa': {
    id: 'br-anvisa',
    name: 'Brazil — ANVISA',
    region: 'south-america',
    authority: 'Agência Nacional de Vigilância Sanitária',
    authorityShort: 'ANVISA',
    jurisdictions: ['BR'],
    dossierStandard: 'national-form-set',
    dossierFormatName: 'Cadastro (notification) / Registro (registration) — Brazil-specific; MDSAP for B-GMP',
    ivdSupport:
      'IVDs classified I–IV under IVD-specific RDC resolutions; Class I/II via Cadastro, III/IV via Registro. MDSAP can substitute/expedite the B-GMP inspection.',
    classificationScheme:
      'Risk classes I–IV. Cadastro (simplified notification) for lower classes; Registro (full registration) for III/IV.',
    devicePathways: ['Cadastro (Class I/II)', 'Registro (Class III/IV)'],
    ivdPathways: ['Cadastro (Class I/II)', 'Registro (Class III/IV)'],
    localRepresentativeRequired: true, // Brazil Registration Holder
    localization: {
      primaryLanguage: 'pt',
      labellingLanguages: 'Brazilian Portuguese',
      translationRequired: true,
      note: 'Portuguese labelling/IFU; sworn translations of foreign documents; route via local registration holder.',
    },
    qmsExpectation: 'mdsap', // MDSAP accepted in lieu of B-GMP inspection
    requiredDossierElements: [
      'device_classification',
      'bgmp_or_mdsap_certificate',
      'safety_effectiveness_evidence',
      'portuguese_labelling',
      'brazil_registration_holder',
    ],
    canAssemble: false,
    assembleNote:
      'No ANVISA Cadastro/Registro assembler; descriptive + readiness only. MDSAP leveraged for B-GMP.',
    canTransmit: false,
    citations: [
      'ANVISA RDC resolutions (IVD classification/registration)',
      'RDC 665/2022 (B-GMP); MDSAP participation (Brazil)',
    ],
  },

  // ── South Korea — MFDS ──────────────────────────────────────────────────────
  'kr-mfds': {
    id: 'kr-mfds',
    name: 'South Korea — MFDS',
    region: 'asia-pacific',
    authority: 'Ministry of Food and Drug Safety',
    authorityShort: 'MFDS',
    jurisdictions: ['KR'],
    dossierStandard: 'national-form-set',
    dossierFormatName: 'MFDS technical review dossier (IVD Act); Korean-language; KGMP certification',
    ivdSupport:
      'IVDs regulated under a dedicated In Vitro Diagnostic Medical Devices Act with risk classes 1–4; Class 3–4 require technical review and often local clinical performance evaluation.',
    classificationScheme:
      'Risk classes 1–4 (IMDRF-aligned). Lower classes notified/certified; Class 3–4 require MFDS approval with technical review.',
    devicePathways: ['Notification', 'Certification', 'MFDS approval'],
    ivdPathways: ['Notification', 'Certification', 'MFDS approval (Class 3–4)'],
    localRepresentativeRequired: true, // Korea license holder / importer
    localization: {
      primaryLanguage: 'ko',
      labellingLanguages: 'Korean',
      translationRequired: true,
      note: 'Korean documentation/labelling; MDSAP/ISO 13485 supports but does not fully replace the KGMP audit.',
    },
    qmsExpectation: 'national-gmp', // KGMP
    requiredDossierElements: [
      'device_classification',
      'technical_documentation',
      'clinical_performance_evaluation',
      'korean_labelling',
      'korea_license_holder',
      'kgmp_certificate',
    ],
    canAssemble: false,
    assembleNote:
      'No MFDS dossier assembler; descriptive + readiness only.',
    canTransmit: false,
    citations: [
      'Korea In Vitro Diagnostic Medical Devices Act; MFDS guidance',
      'KGMP certification; IMDRF alignment',
    ],
  },

  // ── Switzerland — Swissmedic ────────────────────────────────────────────────
  'ch-swissmedic': {
    id: 'ch-swissmedic',
    name: 'Switzerland — Swissmedic',
    region: 'europe',
    authority: 'Swissmedic (Swiss Agency for Therapeutic Products)',
    authorityShort: 'Swissmedic',
    jurisdictions: ['CH'],
    dossierStandard: 'ce-technical-documentation',
    dossierFormatName: 'EU-aligned technical documentation (MepV/IvDO) + CH-REP registration; CE accepted',
    ivdSupport:
      'IVDs regulated under the IvDO, aligned to EU IVDR. Since the EU-Swiss MRA lapsed, Switzerland is a third country requiring a Swiss Authorised Representative (CH-REP).',
    classificationScheme:
      'Mirrors EU MDR/IVDR classification (devices I/IIa/IIb/III; IVDs A–D); CE-marked products accepted on EU-aligned transitional timelines.',
    devicePathways: ['CE marking + CH registration', 'Swiss conformity (EU-equivalent)'],
    ivdPathways: ['CE/EU-IVDR + CH registration', 'Swiss conformity (EU-equivalent)'],
    localRepresentativeRequired: true, // CH-REP + Swiss importer
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'German, French and Italian (Swiss official languages)',
      translationRequired: true,
      note: 'Essentially EU-equivalent technical file; add CH-REP, Swiss importer and Swissmedic registration.',
    },
    qmsExpectation: 'iso-13485',
    requiredDossierElements: [
      'device_classification',
      'technical_documentation',
      'clinical_or_performance_evaluation',
      'declaration_of_conformity',
      'iso_13485_certificate',
      'swiss_authorised_representative',
      'swissmedic_registration',
    ],
    canAssemble: true,
    assembleNote:
      'Platform reuses the EU CE technical-documentation/CER assembler (EU-equivalent file); CH-REP + registration layered separately.',
    canTransmit: false,
    citations: [
      'Swiss Ordinance on IVD Medical Devices (IvDO) / MepV; Swissmedic guidance',
      'Lapsed EU-Swiss MRA (third-country status; CH-REP required)',
    ],
  },

  // ── India — CDSCO ───────────────────────────────────────────────────────────
  'in-cdsco': {
    id: 'in-cdsco',
    name: 'India — CDSCO',
    region: 'asia-pacific',
    authority: 'Central Drugs Standard Control Organisation',
    authorityShort: 'CDSCO',
    jurisdictions: ['IN'],
    dossierStandard: 'national-form-set',
    dossierFormatName: 'CDSCO licence (MD-14/MD-15) under Medical Devices Rules 2017; DMF/PMF',
    ivdSupport:
      'IVDs regulated under the Medical Devices Rules 2017 (phased notification) with Class A–D; reference-regulator approvals and ISO 13485 streamline review; some local data for high-risk/novel IVDs.',
    classificationScheme:
      'Risk classes A–D (MDR 2017). Class A/B via State Licensing Authority; Class C/D via Central Licensing Authority.',
    devicePathways: ['Import licence (MD-14/MD-15)', 'Manufacturing licence (MD-5/MD-9)'],
    ivdPathways: ['Import licence (MD-14/MD-15)', 'Manufacturing licence (MD-5/MD-9)'],
    localRepresentativeRequired: true, // Indian Authorised Agent
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'English (Indian labelling requirements)',
      translationRequired: false,
      note: 'Indian Authorised Agent holds the import licence; Device Master File + Plant Master File required.',
    },
    qmsExpectation: 'iso-13485-or-national',
    requiredDossierElements: [
      'device_classification',
      'device_master_file',
      'plant_master_file',
      'iso_13485_certificate',
      'indian_authorised_agent',
      'labelling',
    ],
    canAssemble: false,
    assembleNote:
      'No CDSCO MD-14/MD-15 assembler; descriptive + readiness only.',
    canTransmit: false,
    citations: [
      'India Medical Devices Rules 2017; CDSCO guidance',
      'Form MD-14/MD-15 import process; DMF/PMF requirements',
    ],
  },

  // ── MDSAP — cross-market QMS audit construct ────────────────────────────────
  mdsap: {
    id: 'mdsap',
    name: 'MDSAP — Medical Device Single Audit Program (AU, BR, CA, JP, US)',
    region: 'cross-market',
    authority: 'MDSAP participating regulators (TGA, ANVISA, Health Canada, MHLW/PMDA, FDA)',
    authorityShort: 'MDSAP',
    jurisdictions: ['AU', 'BR', 'CA', 'JP', 'US'],
    dossierStandard: 'qms-audit-model',
    dossierFormatName: 'Single ISO 13485-based QMS audit (MDSAP Audit Model) — NOT a product dossier',
    ivdSupport:
      'Applies to IVD and general-device manufacturers alike; one audit satisfies the QMS requirements of five regulators (mandatory in Canada).',
    classificationScheme:
      'Not a device-classification scheme; a five-process QMS audit model (management, design & development, production & service controls, CAPA, marketing-authorisation/reporting links).',
    devicePathways: ['MDSAP certificate (QMS audit)'],
    ivdPathways: ['MDSAP certificate (QMS audit)'],
    localRepresentativeRequired: false,
    localization: {
      primaryLanguage: 'en',
      labellingLanguages: 'n/a (QMS audit, not a labelled product)',
      translationRequired: false,
      note: 'One ISO 13485-based audit recognised by AU/BR/CA/JP/US; foundational to CA/BR/AU/JP pathways.',
    },
    qmsExpectation: 'mdsap',
    requiredDossierElements: MDSAP_QMS_ELEMENTS,
    canAssemble: false,
    assembleNote:
      'MDSAP is a third-party QMS audit, not a platform-assembled artifact; descriptive + readiness only.',
    canTransmit: false,
    citations: [
      'MDSAP program (IMDRF/regulators)',
      'MDSAP Audit Model companion document',
    ],
  },
};

/** All market ids in canonical order. */
export const MARKET_IDS: MarketId[] = [
  'us-fda',
  'eu-mdr-ivdr',
  'uk-mhra',
  'jp-pmda',
  'cn-nmpa',
  'ca-health-canada',
  'au-tga',
  'br-anvisa',
  'kr-mfds',
  'ch-swissmedic',
  'in-cdsco',
  'mdsap',
];

/** Resolve a market descriptor by id, or undefined if unknown. */
export function getMarket(marketId: string): MarketDescriptor | undefined {
  return MARKET_DESCRIPTORS[marketId as MarketId];
}

/** All market descriptors in canonical order. */
export function listMarkets(): MarketDescriptor[] {
  return MARKET_IDS.map((id) => MARKET_DESCRIPTORS[id]);
}

/** Markets in a given coarse region. */
export function marketsByRegion(region: MarketDescriptor['region']): MarketDescriptor[] {
  return listMarkets().filter((m) => m.region === region);
}

/** Markets that leverage / accept MDSAP. */
export function mdsapLeverageMarkets(): MarketDescriptor[] {
  return listMarkets().filter((m) => m.qmsExpectation === 'mdsap' || m.id === 'mdsap');
}

export interface MarketRegistrySummary {
  total: number;
  byRegion: Record<MarketDescriptor['region'], number>;
  assembleCapable: MarketId[];
  /** Always empty — honest invariant that nothing transmits. */
  transmitCapable: MarketId[];
}

/** Aggregate summary of the registry (pure projection). */
export function marketRegistrySummary(): MarketRegistrySummary {
  const byRegion: Record<MarketDescriptor['region'], number> = {
    'north-america': 0,
    europe: 0,
    'asia-pacific': 0,
    'south-america': 0,
    'cross-market': 0,
  };
  const assembleCapable: MarketId[] = [];
  const transmitCapable: MarketId[] = [];
  for (const m of listMarkets()) {
    byRegion[m.region] += 1;
    if (m.canAssemble) assembleCapable.push(m.id);
    if (m.canTransmit) transmitCapable.push(m.id);
  }
  return { total: MARKET_IDS.length, byRegion, assembleCapable, transmitCapable };
}

export default {
  MARKET_DESCRIPTORS,
  MARKET_IDS,
  getMarket,
  listMarkets,
  marketsByRegion,
  mdsapLeverageMarkets,
  marketRegistrySummary,
};
