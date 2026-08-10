/**
 * RegistryBridge -- mirrors the backend's Global Document Registry
 * (ported from registry-bridge.jsx).
 *
 * 158 filing types, 4 segments, 23 categories, 13 regions, 12 agencies.
 * Source of truth: shared/regulatory/global-document-registry.ts (PR #927).
 * This is the client-side, dependency-free mirror the kit's offline
 * surfaces read: AnaVerbs.tsx's RegistryPicker and EditorAnaCopilot.tsx's
 * pathway lookup already read GLOBAL_REGISTRY / REG_SEGMENTS /
 * REG_CATEGORIES off window -- this module is what populates them.
 *
 * Not a rendered surface -- a data + lookup module, so it has no
 * SurfaceViewProps component and registers nothing in SURFACE_VIEWS.
 */

/* -- Types -- */

export interface RegistrySegmentDef {
  label: string;
  icon: string;
  count: number;
}

export interface RegistryCategoryDef {
  label: string;
  segment: string;
}

export interface RegistryEntry {
  id: string;
  displayName: string;
  agency: string;
  region: string;
  segment: string;
  category: string;
  dossierStandard: string;
  ctdModule: string;
  submissionFormat: string;
  description: string;
  pathwayKey: string | null;
}

export interface RegistryOption {
  value: string;
  label: string;
  segment: string;
  category: string;
  agency: string;
  region: string;
}

/** [id, displayName, agency, region, dossierStandard, ctdModule, submissionFormat, description, pathwayKey?] */
type RegistryTuple = [string, string, string, string, string, string, string, string, string?];

/* -- Segments (4) -- */

export const REG_SEGMENTS: Record<string, RegistrySegmentDef> = {
  pharma_biotech: { label: 'Pharma & Biotech', icon: 'beaker', count: 92 },
  medical_devices: { label: 'Medical Devices', icon: 'stethoscope', count: 31 },
  diagnostics_ivd: { label: 'Diagnostics & IVD', icon: 'microscope', count: 21 },
  cross_cutting: { label: 'Cross-cutting', icon: 'globe', count: 14 },
};

/* -- Categories (23) -- */

export const REG_CATEGORIES: Record<string, RegistryCategoryDef> = {
  pre_submission: { label: 'Pre-submission & meetings', segment: 'pharma_biotech' },
  investigational: { label: 'Investigational (clinical development)', segment: 'pharma_biotech' },
  marketing_authorization: { label: 'Marketing authorization', segment: 'pharma_biotech' },
  post_approval_lifecycle: { label: 'Post-approval lifecycle', segment: 'pharma_biotech' },
  cmc_quality: { label: 'CMC / Quality (Module 3)', segment: 'pharma_biotech' },
  designations_expedited: { label: 'Designations & expedited programs', segment: 'pharma_biotech' },
  safety_pharmacovigilance: { label: 'Safety & pharmacovigilance', segment: 'pharma_biotech' },
  clinical_documents: { label: 'Clinical documents', segment: 'pharma_biotech' },
  generics_biosimilars: { label: 'Generics & biosimilars', segment: 'pharma_biotech' },
  device_pre_submission: { label: 'Device pre-submission', segment: 'medical_devices' },
  device_market_auth_us: { label: 'Device market authorization — US', segment: 'medical_devices' },
  device_market_auth_eu: { label: 'Device market authorization — EU', segment: 'medical_devices' },
  device_market_auth_intl: { label: 'Device market authorization — international', segment: 'medical_devices' },
  device_post_market: { label: 'Device post-market', segment: 'medical_devices' },
  device_clinical: { label: 'Device clinical', segment: 'medical_devices' },
  ivd_market_auth: { label: 'IVD market authorization', segment: 'diagnostics_ivd' },
  ivd_companion_dx: { label: 'Companion diagnostics', segment: 'diagnostics_ivd' },
  ivd_clinical_performance: { label: 'IVD clinical & performance', segment: 'diagnostics_ivd' },
  ivd_regional: { label: 'IVD regional', segment: 'diagnostics_ivd' },
  ivd_post_market: { label: 'IVD post-market', segment: 'diagnostics_ivd' },
  ctd_ectd: { label: 'CTD / eCTD structure', segment: 'cross_cutting' },
  quality_management: { label: 'Quality management systems', segment: 'cross_cutting' },
  regulatory_intelligence: { label: 'Regulatory intelligence', segment: 'cross_cutting' },
};

/* -- Regions (13) & agencies (12) -- */

export const REG_REGIONS: string[] = ['US', 'EU', 'UK', 'CA', 'JP', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL'];
export const REG_AGENCIES: string[] = ['FDA', 'EMA', 'MHRA', 'Health Canada', 'PMDA', 'NMPA', 'TGA', 'Swissmedic', 'ANVISA', 'CDSCO', 'MFDS', 'HSA'];

/* -- Filing types -- compact tuples, grouped by segment then category -- */

const REGISTRY_SOURCE: Record<string, Record<string, RegistryTuple[]>> = {
  pharma_biotech: {
    pre_submission: [
      ['pre_ind', 'Pre-IND Meeting Request', 'FDA', 'US', 'eCTD', '—', 'Letter', 'Type B meeting before IND; outlines development plan.', 'ind'],
      ['scientific_advice', 'Scientific Advice / Protocol Assistance', 'EMA', 'EU', 'eCTD', '—', 'eCTD', 'CHMP/SAWP advice on development strategy and endpoints.'],
      ['type_a_meeting', 'Type A Meeting', 'FDA', 'US', '—', '—', 'Letter', 'Immediately-needed meetings (safety, stalled programs).'],
      ['type_b_meeting', 'Type B Meeting', 'FDA', 'US', '—', '—', 'Letter', 'Pre-IND, pre-NDA/BLA, end-of-phase meetings.'],
      ['type_c_meeting', 'Type C Meeting', 'FDA', 'US', '—', '—', 'Letter', 'Other meetings not qualifying as Type A or B.'],
      ['pre_sub_hc', 'Pre-submission Meeting', 'Health Canada', 'CA', 'eCTD', '—', 'eCTD', 'Health Canada pre-submission scientific advice.'],
      ['pre_consult_pmda', 'Pre-application Consultation', 'PMDA', 'JP', 'CTD', '—', 'CTD', 'PMDA regulatory consultation before J-NDA filing.'],
      ['pre_sub_tga', 'Pre-submission Meeting', 'TGA', 'AU', '—', '—', 'Letter', 'TGA pre-submission meeting request.'],
    ],
    investigational: [
      ['us_ind', 'Investigational New Drug Application (IND)', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'Application to begin clinical trials; 30-day review.', 'ind'],
      // The 9th slot is the pathwayKey, and its absence is not cosmetic:
      // Projects.tsx:130 substitutes 'ctd' for a missing key, and
      // programTypeFor() turns pw === 'ctd' into 'nda'. So this row used to
      // create a US NDA — scaffolding the 71-section marketing dossier — for a
      // customer who asked for an EU clinical trial application.
      //
      // The format columns were wrong too, and said so in their own description:
      // a CTR 536/2014 CTA is a Part I / Part II submission filed through CTIS,
      // not an eCTD M1-M5 dossier. They now match migrations/20260806, which
      // seeds cta:ema with the real Annex I outline.
      ['eu_cta', 'Clinical Trial Application (CTA)', 'EMA', 'EU', 'CTR Annex I', 'Part I–II', 'CTIS', 'EU CTR 536/2014 via CTIS portal.', 'cta'],
      ['ctn_au', 'Clinical Trial Notification (CTN)', 'TGA', 'AU', 'eCTD', '—', 'eCTD', 'TGA notification before commencing a clinical trial.', 'cta'],
      ['cta_hc', 'Clinical Trial Application', 'Health Canada', 'CA', 'eCTD', 'M1–M5', 'eCTD', 'Health Canada CTA under Food and Drug Regulations.', 'cta'],
      ['ctn_jp', 'Clinical Trial Notification', 'PMDA', 'JP', 'CTD', 'M1–M5', 'CTD', 'PMDA clinical trial notification.', 'cta'],
      ['cta_nmpa', 'Clinical Trial Application', 'NMPA', 'CN', 'CTD', 'M1–M5', 'CTD', 'NMPA CTA for first-in-human through Phase III.', 'cta'],
      ['ind_safety', 'IND Safety Report', 'FDA', 'US', 'eCTD', 'M5', 'eCTD', 'Expedited safety reports within 15 days (7 for fatal).'],
      ['ind_annual', 'IND Annual Report', 'FDA', 'US', 'eCTD', 'M5', 'eCTD', 'Annual summary within 60 days of IND anniversary.'],
      ['dsur', 'Development Safety Update Report (DSUR)', 'EMA', 'GLOBAL', 'eCTD', 'M5', 'eCTD', 'ICH E2F-harmonized annual safety report.'],
      ['protocol_amend', 'Protocol & Protocol Amendments', 'FDA', 'GLOBAL', 'eCTD', 'M5', 'eCTD', 'Study design amendments requiring notification.'],
      ['investigator_brochure', "Investigator's Brochure (IB)", 'FDA', 'GLOBAL', 'eCTD', 'M5', 'eCTD', 'ICH E6 GCP compendium; updated at least annually.'],
      ['informed_consent', 'Informed Consent Form (ICF)', 'FDA', 'GLOBAL', '—', '—', '—', 'Patient-facing document meeting 21 CFR 50 / ICH GCP.'],
    ],
    marketing_authorization: [
      ['us_nda', 'New Drug Application (NDA)', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'Full CTD dossier for new small molecules.', 'ctd'],
      ['us_bla', 'Biologics License Application (BLA)', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'Marketing application for biologics under PHS Act §351(a).', 'bla'],
      ['eu_maa', 'Marketing Authorisation Application (MAA)', 'EMA', 'EU', 'eCTD', 'M1–M5', 'eCTD', 'EU centralised procedure to CHMP.', 'maa'],
      ['ca_nds', 'New Drug Submission (NDS)', 'Health Canada', 'CA', 'eCTD', 'M1–M5', 'eCTD', 'Canadian marketing authorization; CTD with CA Module 1.'],
      ['jp_jnda', 'J-NDA', 'PMDA', 'JP', 'eCTD', 'M1–M5', 'eCTD', 'Japanese new drug application via J-CTD.'],
      ['cn_nda', 'NDA', 'NMPA', 'CN', 'CTD', 'M1–M5', 'CTD', 'NMPA marketing authorization for China.'],
      ['au_reg', 'Registration', 'TGA', 'AU', 'eCTD', 'M1–M5', 'eCTD', 'TGA registration via CTD format.'],
      ['uk_maa', 'MAA', 'MHRA', 'UK', 'eCTD', 'M1–M5', 'eCTD', 'MHRA marketing authorization (post-Brexit national).'],
      ['ch_maa', 'Application', 'Swissmedic', 'CH', 'eCTD', 'M1–M5', 'eCTD', 'Swissmedic marketing authorization.'],
      ['br_reg', 'Registration', 'ANVISA', 'BR', 'CTD', 'M1–M5', 'CTD', 'ANVISA marketing authorization for Brazil.'],
      ['kr_nda', 'NDA', 'MFDS', 'KR', 'eCTD', 'M1–M5', 'eCTD', 'MFDS marketing authorization for South Korea.'],
      ['sg_nda', 'NDA', 'HSA', 'SG', 'eCTD', 'M1–M5', 'eCTD', 'HSA new drug application for Singapore.'],
      ['accel_approval', 'Accelerated Approval', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'NDA/BLA using surrogate or intermediate endpoint.'],
      ['conditional_ma', 'Conditional Marketing Authorisation', 'EMA', 'EU', 'eCTD', 'M1–M5', 'eCTD', 'EU approval on less comprehensive data; annual renewal.'],
      ['rolling_sub', 'Rolling Submission', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'Completed sections submitted before the full application.'],
      ['pediatric_plan', 'Pediatric Study Plan (PSP) / PIP', 'FDA', 'GLOBAL', 'eCTD', 'M1', 'eCTD', 'Pediatric development strategy; required before NDA/BLA.'],
    ],
    post_approval_lifecycle: [
      ['prior_approval_suppl', 'Prior Approval Supplement', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Major post-approval changes; FDA approval before implementation.'],
      ['cbe30', 'CBE-30 Supplement', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Changes Being Effected with 30-day notice.'],
      ['cbe0', 'CBE-0 Supplement', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Changes Being Effected; implement immediately.'],
      ['annual_report_nda', 'Annual Report (NDA/BLA)', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Post-marketing annual report of minor changes.'],
      ['type_ia_var', 'Type IA Variation', 'EMA', 'EU', 'eCTD', '—', 'eCTD', 'Minor variation; do-and-tell within 12 months.'],
      ['type_ib_var', 'Type IB Variation', 'EMA', 'EU', 'eCTD', '—', 'eCTD', 'Minor variation requiring 30-day notification.'],
      ['type_ii_var', 'Type II Variation', 'EMA', 'EU', 'eCTD', '—', 'eCTD', 'Major variation requiring CHMP assessment.'],
      ['supac', 'SUPAC Supplement', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Scale-Up and Post-Approval Changes to CMC.'],
      ['renewal_eu', 'Renewal Application', 'EMA', 'EU', 'eCTD', '—', 'eCTD', 'Renewal of marketing authorization at 5 years.'],
      ['snda', 'Supplemental NDA', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'New indication, formulation, or population.', 'ctd'],
      ['sbla', 'Supplemental BLA', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'New indication or change for a licensed biologic.', 'bla'],
      ['line_ext', 'Line Extension', 'EMA', 'EU', 'eCTD', 'M1–M5', 'eCTD', 'New strength, route, or pharmaceutical form.'],
    ],
    cmc_quality: [
      ['mod_32s', 'Module 3.2.S — Drug Substance', 'FDA', 'GLOBAL', 'eCTD', '3.2.S', 'eCTD', 'Manufacture, characterization, control, and stability of the API.'],
      ['mod_32p', 'Module 3.2.P — Drug Product', 'FDA', 'GLOBAL', 'eCTD', '3.2.P', 'eCTD', 'Composition, manufacture, control, and stability of the finished product.'],
      ['qos_23', 'Quality Overall Summary', 'FDA', 'GLOBAL', 'eCTD', '2.3', 'eCTD', 'CTD Module 2.3 summary of quality data.'],
      ['comparability', 'Comparability Protocol', 'FDA', 'GLOBAL', 'eCTD', '—', 'eCTD', 'Pre-agreed plan for assessing post-change comparability.'],
      ['env_assess', 'Environmental Assessment', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'NEPA environmental impact assessment or categorical exclusion.'],
      ['dmf', 'Drug Master File (DMF)', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Confidential API/excipient CMC filing.', 'dmf'],
      ['asmf', 'Active Substance Master File (ASMF)', 'EMA', 'EU', 'eCTD', '3.2.S', 'eCTD', 'EU confidential manufacturing and quality data.'],
      ['cep', 'Certificate of Suitability (CEP)', 'EMA', 'EU', '—', '—', '—', 'EDQM monograph conformity for well-known substances.'],
      ['gmp_cert', 'GMP Certificate', 'EMA', 'EU', '—', '—', '—', 'EMA/National authority GMP compliance.'],
      ['stability_protocol', 'Stability Protocol', 'FDA', 'GLOBAL', 'eCTD', '3.2.P.8', 'eCTD', 'ICH Q1A/Q1E stability study design.'],
    ],
    designations_expedited: [
      ['btd', 'Breakthrough Therapy Designation', 'FDA', 'US', '—', '—', 'Letter', 'Expedited development for substantial improvement.'],
      ['fast_track', 'Fast Track Designation', 'FDA', 'US', '—', '—', 'Letter', 'Rolling review and frequent interactions for serious conditions.'],
      ['odd_fda', 'Orphan Drug Designation', 'FDA', 'US', '—', '—', 'Letter', 'Rare-disease incentives and market exclusivity.'],
      ['odd_ema', 'Orphan Designation', 'EMA', 'EU', '—', '—', 'eCTD', 'EMA orphan medicinal product designation.'],
      ['prime', 'PRIME Designation', 'EMA', 'EU', 'eCTD', '—', 'eCTD', 'EU priority-medicines scheme for unmet medical need.'],
      ['rmat', 'RMAT Designation', 'FDA', 'US', '—', '—', 'Letter', 'Regenerative Medicine Advanced Therapy.'],
      ['sakigake', 'Sakigake Designation', 'PMDA', 'JP', '—', '—', 'CTD', 'PMDA expedited review for innovative therapies.'],
      ['priority_review', 'Priority Review', 'FDA', 'US', '—', '—', '—', '6-month review target for significant advances.'],
      ['accel_assess', 'Accelerated Assessment', 'EMA', 'EU', '—', '—', '—', '150-day assessment for major public-health interest.'],
      ['ilap', 'Innovation Passport (ILAP)', 'MHRA', 'UK', '—', '—', '—', 'MHRA Innovative Licensing and Access Pathway.'],
    ],
    safety_pharmacovigilance: [
      ['psur_pbrer', 'PSUR / PBRER', 'EMA', 'GLOBAL', 'eCTD', '—', 'eCTD', 'ICH E2C(R2) Periodic Benefit-Risk Evaluation Report.'],
      ['rems', 'REMS', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Risk Evaluation and Mitigation Strategy.'],
      ['rmp', 'Risk Management Plan', 'EMA', 'EU', 'eCTD', '—', 'eCTD', 'EU safety specification and risk-minimization measures.'],
      ['pmr_pmc', 'PMR / PMC', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Post-marketing required/committed studies.'],
      ['medwatch', 'MedWatch / FAERS', 'FDA', 'US', '—', '—', '—', 'Adverse-event reporting into FAERS.'],
      ['eudravigilance', 'EudraVigilance Report', 'EMA', 'EU', '—', '—', 'E2B', 'Electronic adverse-event report to EudraVigilance.'],
      ['susar_report', 'SUSAR Report', 'FDA', 'GLOBAL', 'eCTD', '—', 'eCTD', 'Suspected Unexpected Serious Adverse Reaction.'],
      ['signal_detect', 'Signal Detection Report', 'EMA', 'GLOBAL', '—', '—', '—', 'Disproportionality analysis and signal assessment.'],
    ],
    clinical_documents: [
      ['csr', 'Clinical Study Report (ICH E3)', 'FDA', 'GLOBAL', 'eCTD', 'M5 (5.3.5)', 'eCTD', 'Comprehensive report of an individual study.', 'csr'],
      ['sap', 'Statistical Analysis Plan', 'FDA', 'GLOBAL', 'eCTD', 'M5', 'eCTD', 'Pre-specified statistical methods and endpoints.'],
      ['clin_protocol', 'Clinical Protocol', 'FDA', 'GLOBAL', 'eCTD', 'M5', 'eCTD', 'Study design, populations, and endpoints.'],
      ['clin_overview', 'Clinical Overview (M2.5)', 'FDA', 'GLOBAL', 'eCTD', '2.5', 'eCTD', 'Integrated clinical overview across studies.', 'ctd'],
      ['clin_summary', 'Clinical Summary (M2.7)', 'FDA', 'GLOBAL', 'eCTD', '2.7', 'eCTD', 'Integrated summary of clinical data.'],
      ['nonclin_overview', 'Nonclinical Overview (M2.4)', 'FDA', 'GLOBAL', 'eCTD', '2.4', 'eCTD', 'Integrated nonclinical overview.'],
      ['nonclin_summary', 'Nonclinical Summary (M2.6)', 'FDA', 'GLOBAL', 'eCTD', '2.6', 'eCTD', 'Nonclinical written and tabulated summaries.'],
      ['tabulated_sum', 'Tabulated Summaries (M2.7.4)', 'FDA', 'GLOBAL', 'eCTD', '2.7.4', 'eCTD', 'Individual patient data listings.'],
    ],
    generics_biosimilars: [
      ['anda', 'Abbreviated NDA (ANDA)', 'FDA', 'US', 'eCTD', 'M1–M3', 'eCTD', 'Generic drug application demonstrating bioequivalence.', 'anda'],
      ['us_505b2', '505(b)(2) Application', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'NDA relying partly on literature or FDA prior findings.', '505b2'],
      ['biosim_351k', 'Biosimilar 351(k)', 'FDA', 'US', 'eCTD', 'M1–M5', 'eCTD', 'Biosimilar demonstrating biosimilarity to reference.', 'biosimilar'],
      ['biosim_eu', 'Biosimilar MAA', 'EMA', 'EU', 'eCTD', 'M1–M5', 'eCTD', 'EU centralized biosimilar application.'],
      ['biosim_pmda', 'Biosimilar', 'PMDA', 'JP', 'eCTD', 'M1–M5', 'eCTD', 'PMDA biosimilar application.'],
      ['generic_eu', 'Generic Decentralized', 'EMA', 'EU', 'eCTD', 'M1–M3', 'eCTD', 'EU decentralized generic application.'],
      ['ands_hc', 'ANDS', 'Health Canada', 'CA', 'eCTD', 'M1–M3', 'eCTD', 'Health Canada abbreviated new drug submission.'],
      ['biosim_tga', 'Biosimilar', 'TGA', 'AU', 'eCTD', 'M1–M5', 'eCTD', 'TGA biosimilar medicine registration.'],
    ],
  },
  medical_devices: {
    device_pre_submission: [
      ['class_513g', '513(g) Classification Request', 'FDA', 'US', '—', '—', 'Letter', 'Request FDA classification and regulatory requirements.', 'device'],
      ['pre_sub_qsub', 'Pre-Submission (Q-Sub)', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'Formal feedback meeting with CDRH.', 'device'],
      ['breakthrough_dev', 'Breakthrough Device Designation', 'FDA', 'US', '—', '—', 'Letter', 'Expedited development for life-threatening conditions.', 'device'],
      ['rfd_ocp', 'Request for Designation (RFD)', 'FDA', 'US', '—', '—', 'Letter', 'OCP determination for combination products.', 'device'],
      ['dev_nb_consult', 'Notified Body Consultation', 'EMA', 'EU', '—', '—', '—', 'EU Notified Body pre-submission consultation.', 'device'],
    ],
    device_market_auth_us: [
      ['fda_510k', '510(k) Premarket Notification', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'Substantial equivalence to a predicate device.', '510k'],
      ['fda_de_novo', 'De Novo Classification Request', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'Novel low-to-moderate-risk device; creates new classification.', 'denovo'],
      ['fda_pma', 'Premarket Approval (PMA)', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Class III device with clinical evidence.', 'pma'],
      ['fda_hde', 'Humanitarian Device Exemption (HDE)', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Device for < 8,000 patients/year.', 'device'],
      ['fda_510k_special', 'Special 510(k)', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'Modification using design controls.'],
      ['fda_510k_abbrev', 'Abbreviated 510(k)', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'Relying on guidance or special controls.'],
    ],
    device_market_auth_eu: [
      ['eu_mdr_i', 'EU MDR Class I Self-declaration', 'EMA', 'EU', '—', '—', 'NeeS', 'Manufacturer self-declares conformity.', 'mdr'],
      ['eu_mdr_iia', 'EU MDR Class IIa', 'EMA', 'EU', '—', '—', 'NeeS', 'Notified Body assessment required.', 'mdr'],
      ['eu_mdr_iib', 'EU MDR Class IIb', 'EMA', 'EU', '—', '—', 'NeeS', 'Higher-risk device assessment.', 'mdr'],
      ['eu_mdr_iii', 'EU MDR Class III', 'EMA', 'EU', '—', '—', 'NeeS', 'Highest-risk implantable/life-sustaining devices.', 'mdr'],
      ['uk_ukca', 'UKCA Registration', 'MHRA', 'UK', '—', '—', '—', 'UK Conformity Assessment post-Brexit.', 'device'],
    ],
    device_market_auth_intl: [
      ['pmda_shonin', 'Shonin Approval', 'PMDA', 'JP', 'CTD', '—', 'CTD', 'PMDA new medical device approval.', 'device'],
      ['pmda_nintei', 'Nintei Certification', 'PMDA', 'JP', 'CTD', '—', 'CTD', 'PMDA certified medical device.', 'device'],
      ['nmpa_device', 'Device Registration', 'NMPA', 'CN', 'CTD', '—', 'CTD', 'NMPA medical device registration for China.', 'device'],
      ['tga_device', 'Device Inclusion', 'TGA', 'AU', '—', '—', 'ARTG', 'TGA inclusion in the ARTG.', 'device'],
      ['hc_mdl', 'Medical Device Licence', 'Health Canada', 'CA', '—', '—', '—', 'Health Canada device licensing.', 'device'],
      ['ch_device', 'Device Conformity', 'Swissmedic', 'CH', '—', '—', '—', 'Swissmedic conformity assessment.', 'device'],
      ['br_device', 'Device Registration', 'ANVISA', 'BR', '—', '—', '—', 'ANVISA device registration for Brazil.', 'device'],
    ],
    device_post_market: [
      ['pma_suppl', 'PMA Supplement', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Post-approval change to PMA device.'],
      ['dev_510k_mod', '510(k) Modification', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'Change to a cleared 510(k) device.'],
      ['eu_sig_change', 'Significant Change Notification', 'EMA', 'EU', '—', '—', 'NeeS', 'MDR Art 120 significant change to NB.', 'mdr'],
      ['dev_fsc', 'Field Safety Corrective Action (FSCA)', 'FDA', 'GLOBAL', '—', '—', '—', 'Global field safety action and recall.', 'device'],
    ],
    device_clinical: [
      ['ide', 'Investigational Device Exemption (IDE)', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'Clinical investigation of a significant-risk device.', 'ide'],
      ['eu_clin_inv', 'Clinical Investigation (EU MDR)', 'EMA', 'EU', '—', '—', 'NeeS', 'EU MDR clinical investigation application.', 'mdr'],
      ['cip_iso', 'Clinical Investigation Plan (ISO 14155)', 'FDA', 'GLOBAL', '—', '—', '—', 'ISO 14155 clinical investigation plan.', 'device'],
      ['cer', 'Clinical Evaluation Report', 'EMA', 'EU', '—', '—', 'NeeS', 'EU MDR Annex XIV clinical evaluation.', 'cer'],
    ],
  },
  diagnostics_ivd: {
    ivd_market_auth: [
      ['ivd_510k', 'IVD 510(k)', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'IVD premarket notification.'],
      ['ivd_de_novo', 'IVD De Novo', 'FDA', 'US', 'eSTAR', '—', 'eSTAR', 'Novel IVD classification request.'],
      ['ivd_pma', 'IVD PMA', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'High-risk IVD premarket approval.'],
      ['eu_ivdr_a', 'EU IVDR Class A', 'EMA', 'EU', '—', '—', 'NeeS', 'Self-declared conformity for low-risk IVDs.', 'ivdr'],
      ['eu_ivdr_b', 'EU IVDR Class B', 'EMA', 'EU', '—', '—', 'NeeS', 'Notified Body assessment for Class B IVDs.', 'ivdr'],
      ['eu_ivdr_cd', 'EU IVDR Class C/D', 'EMA', 'EU', '—', '—', 'NeeS', 'High-risk IVD assessment (incl. self-testing, blood screening).', 'ivdr'],
    ],
    ivd_companion_dx: [
      ['cdx_pma', 'Companion Dx PMA', 'FDA', 'US', 'eCTD', '—', 'eCTD', 'PMA for companion diagnostic device.'],
      ['cdx_ivdr_d', 'CDx EU IVDR Class D', 'EMA', 'EU', '—', '—', 'NeeS', 'EU companion diagnostic under IVDR.', 'ivdr'],
      ['cdx_pmda', 'CDx Approval', 'PMDA', 'JP', 'CTD', '—', 'CTD', 'PMDA companion diagnostic device approval.', 'ivd'],
      ['cdx_codev', 'CDx Co-development Plan', 'FDA', 'US', '—', '—', 'Letter', 'Joint drug-diagnostic development plan.', 'ivd'],
    ],
    ivd_clinical_performance: [
      ['ivdr_perf_study', 'IVDR Performance Study', 'EMA', 'EU', '—', '—', 'NeeS', 'EU IVDR clinical performance study notification.', 'ivdr'],
      ['ivd_clin_evidence', 'Clinical Evidence Summary', 'EMA', 'EU', '—', '—', 'NeeS', 'EU IVDR clinical evidence compilation.', 'ivd'],
      ['ivdr_pmpf', 'Post-market Performance Follow-up', 'EMA', 'EU', '—', '—', 'NeeS', 'Ongoing performance data collection plan.', 'ivdr'],
      ['ivd_anal_val', 'Analytical Validation Report', 'FDA', 'US', '—', '—', 'eSTAR', 'Analytical and clinical validation study report.', 'ivd'],
    ],
    ivd_regional: [
      ['pmda_ivd', 'IVD Approval', 'PMDA', 'JP', 'CTD', '—', 'CTD', 'PMDA IVD medical device approval.', 'ivd'],
      ['nmpa_ivd', 'IVD Registration', 'NMPA', 'CN', 'CTD', '—', 'CTD', 'NMPA IVD registration for China.', 'ivd'],
      ['tga_ivd', 'IVD Inclusion', 'TGA', 'AU', '—', '—', 'ARTG', 'TGA IVD inclusion in the ARTG.', 'ivd'],
      ['hc_ivd', 'IVD Licence', 'Health Canada', 'CA', '—', '—', '—', 'Health Canada IVD device licence.', 'ivd'],
    ],
    ivd_post_market: [
      ['ivd_pms_plan', 'Post-Market Surveillance Plan', 'EMA', 'EU', '—', '—', 'NeeS', 'EU IVDR post-market surveillance plan.', 'ivdr'],
      ['ivd_trend', 'Trend Reporting', 'FDA', 'US', '—', '—', '—', 'FDA MDR trend reporting for IVDs.', 'ivd'],
      ['ivd_vigilance', 'Vigilance Report', 'EMA', 'EU', '—', '—', 'NeeS', 'EU IVDR vigilance incident report.', 'ivd'],
    ],
  },
  cross_cutting: {
    ctd_ectd: [
      ['ectd_backbone', 'eCTD Backbone Structure', 'FDA', 'GLOBAL', 'eCTD', 'M1–M5', 'eCTD', 'ICH eCTD v3.2.2/v4.0 backbone and envelope.'],
      ['ctd_m1_us', 'CTD Module 1 — US Regional', 'FDA', 'US', 'eCTD', 'M1', 'eCTD', 'US-specific administrative and prescribing information.'],
      ['ctd_m1_eu', 'CTD Module 1 — EU Regional', 'EMA', 'EU', 'eCTD', 'M1', 'eCTD', 'EU-specific application forms and product information.'],
      ['ctd_m1_jp', 'CTD Module 1 — JP Regional', 'PMDA', 'JP', 'eCTD', 'M1', 'eCTD', 'J-CTD Module 1; PMDA-specific forms.'],
      ['nees', 'NeeS Submission', 'EMA', 'EU', 'NeeS', '—', 'NeeS', 'Non-eCTD electronic submission for variations.'],
    ],
    quality_management: [
      ['gmp_inspect', 'GMP Inspection Readiness', 'FDA', 'GLOBAL', '—', '—', '—', 'Pre-inspection GMP compliance package.'],
      ['gcp_compliance', 'GCP Compliance Package', 'FDA', 'GLOBAL', '—', '—', '—', 'ICH E6(R2) GCP compliance documentation.'],
      ['glp_compliance', 'GLP Compliance Package', 'FDA', 'GLOBAL', '—', '—', '—', 'OECD GLP compliance documentation.'],
      ['qsr_820', 'QSR (21 CFR 820)', 'FDA', 'US', '—', '—', '—', 'Quality System Regulation for medical devices.'],
      ['iso_13485', 'ISO 13485 QMS', 'FDA', 'GLOBAL', '—', '—', '—', 'QMS for medical devices — international standard.'],
    ],
    regulatory_intelligence: [
      ['reg_strategy', 'Regulatory Strategy Document', 'FDA', 'GLOBAL', '—', '—', '—', 'Cross-market regulatory strategy and pathway analysis.'],
      ['gap_analysis', 'Gap Analysis Report', 'FDA', 'GLOBAL', '—', '—', '—', 'Dossier gap analysis against target filing.'],
      ['competitive_intel', 'Competitive Landscape Analysis', 'FDA', 'GLOBAL', '—', '—', '—', 'Competitive intelligence and precedent analysis.'],
      ['ha_meeting', 'Health Authority Meeting Minutes', 'FDA', 'GLOBAL', '—', '—', '—', 'Formal meeting minutes and commitments.'],
    ],
  },
};

/* -- Build the flat registry -- */

export const GLOBAL_REGISTRY: RegistryEntry[] = [];
Object.entries(REGISTRY_SOURCE).forEach(([seg, cats]) => {
  Object.entries(cats).forEach(([cat, entries]) => {
    entries.forEach(arr => {
      GLOBAL_REGISTRY.push({
        id: arr[0], displayName: arr[1], agency: arr[2], region: arr[3],
        segment: seg, category: cat,
        dossierStandard: arr[4], ctdModule: arr[5], submissionFormat: arr[6],
        description: arr[7], pathwayKey: arr[8] || null,
      });
    });
  });
});

/* -- Lookup index -- */

const REGISTRY_INDEX: Record<string, RegistryEntry> = {};
GLOBAL_REGISTRY.forEach(e => { REGISTRY_INDEX[e.id] = e; });

/* -- Alias map -- any string a client could throw at us resolves to a canonical id -- */

const REGISTRY_ALIASES: Record<string, string> = {
  IND: 'us_ind', ind: 'us_ind', US_IND: 'us_ind',
  NDA: 'us_nda', nda: 'us_nda', US_NDA: 'us_nda',
  BLA: 'us_bla', bla: 'us_bla', US_BLA: 'us_bla',
  MAA: 'eu_maa', maa: 'eu_maa', EU_MAA: 'eu_maa',
  ANDA: 'anda', anda: 'anda',
  '505(b)(2)': 'us_505b2', '505b2': 'us_505b2',
  '510(k)': 'fda_510k', '510k': 'fda_510k', FDA_510K: 'fda_510k',
  PMA: 'fda_pma', pma: 'fda_pma', FDA_PMA: 'fda_pma',
  'De Novo': 'fda_de_novo', denovo: 'fda_de_novo', DE_NOVO: 'fda_de_novo',
  CER: 'cer', cer: 'cer',
  IDE: 'ide', ide: 'ide',
  CSR: 'csr', csr: 'csr',
  DMF: 'dmf', dmf: 'dmf',
  SNDA: 'snda', SBLA: 'sbla',
  BTD: 'btd', PRIME: 'prime', RMAT: 'rmat',
  DSUR: 'dsur', PSUR: 'psur_pbrer', PBRER: 'psur_pbrer',
  REMS: 'rems', RMP: 'rmp',
  JP_MKT_APPROVAL: 'jp_jnda', 'J-NDA': 'jp_jnda',
  NDS: 'ca_nds',
};

/* -- Helper functions (mirrors backend shared/regulatory/document-taxonomy.ts) -- */

/** Ready-made for a grouped picker. */
export function getSubmissionTypeOptions(): RegistryOption[] {
  return GLOBAL_REGISTRY.map(e => ({
    value: e.id, label: e.displayName, segment: e.segment, category: e.category,
    agency: e.agency, region: e.region,
  }));
}

/** Everything a header/detail panel needs. */
export function getSubmissionTypeContext(id: string): RegistryEntry | null {
  const resolved = REGISTRY_INDEX[id] || REGISTRY_INDEX[REGISTRY_ALIASES[id]];
  if (!resolved) return null;
  return { ...resolved };
}

/** All entries for a segment. */
export function getBySegment(segment: string): RegistryEntry[] {
  return GLOBAL_REGISTRY.filter(e => e.segment === segment);
}

/** All entries for a category. */
export function getByCategory(category: string): RegistryEntry[] {
  return GLOBAL_REGISTRY.filter(e => e.category === category);
}

/** Resolve any alias/string to a canonical id (pure, deterministic, no DB). */
export function resolveSubmissionType(input?: string | null): string | null {
  if (!input) return null;
  if (REGISTRY_INDEX[input]) return input;
  if (REGISTRY_ALIASES[input]) return REGISTRY_ALIASES[input];
  const lower = input.toLowerCase().replace(/[_\s-]+/g, '');
  const found = GLOBAL_REGISTRY.find(e => e.id.replace(/_/g, '') === lower || e.displayName.toLowerCase().replace(/[_\s-]+/g, '').includes(lower));
  return found ? found.id : null;
}

/* -- Window bridge -- AnaVerbs.tsx's RegistryPicker and EditorAnaCopilot.tsx's
   pathway lookup already read these off window; this keeps that contract
   alive until/unless those callers switch to importing this module directly. -- */
(window as any).GLOBAL_REGISTRY = GLOBAL_REGISTRY;
(window as any).REG_SEGMENTS = REG_SEGMENTS;
(window as any).REG_CATEGORIES = REG_CATEGORIES;
(window as any).REG_REGIONS = REG_REGIONS;
(window as any).REG_AGENCIES = REG_AGENCIES;
(window as any).getSubmissionTypeOptions = getSubmissionTypeOptions;
(window as any).getSubmissionTypeContext = getSubmissionTypeContext;
(window as any).getBySegment = getBySegment;
(window as any).getByCategory = getByCategory;
(window as any).resolveSubmissionType = resolveSubmissionType;
