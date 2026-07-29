/**
 * Regulatory Filing & Document Taxonomy -- 113 filing types across 4 segments.
 * Source: Concept2Cure_Regulatory_Filing_Taxonomy_v1 (June 2026).
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

/* ---- Interfaces ---- */

export interface FilingItem {
  n: string;
  a: string;
  f: string;
  c: string;
  wf: string;
  d: string;
}

export interface FilingCategory {
  cat: string;
  desc: string;
  items: FilingItem[];
}

export interface FilingSegment {
  seg: string;
  label: string;
  sub: string;
  icon: string;
  cats: FilingCategory[];
}

export interface FilingLoopReturn {
  label: string;
  desc: string;
}

export interface FilingLoop {
  label: string;
  clock: string;
  stages: string[];
  ret: FilingLoopReturn;
}

/* ---- Taxonomy ---- */

export const FILINGS_TAXONOMY: FilingSegment[] = [
{ seg: 'pharma', label: 'Pharma & Biotech', sub: 'Small molecules -- biologics -- biosimilars -- gene & cell therapy', icon: 'beaker', cats: [
  { cat: 'Preclinical / Pre-IND', desc: 'Nonclinical development, regulatory strategy, and agency interactions before first-in-human dosing', items: [
    { n: 'Pre-IND Meeting Request', a: 'FDA', f: 'eCTD', c: '—', wf: 'IND', d: 'Type B meeting before IND; outlines the development plan and seeks feedback on the nonclinical package, CMC, and clinical design.' },
    { n: 'Scientific Advice / Protocol Assistance', a: 'EMA', f: 'eCTD', c: '—', wf: 'advice', d: 'Formal CHMP/SAWP advice on development strategy, endpoints, comparators, and study design.' },
    { n: 'Orphan Drug Designation (ODD)', a: 'FDA / EMA', f: 'eCTD', c: '—', wf: 'designation', d: 'Designation for rare-disease drugs; unlocks incentives, fee waivers, and market exclusivity.' },
    { n: 'Breakthrough Therapy Designation (BTD)', a: 'FDA', f: 'Letter', c: '—', wf: 'designation', d: 'Expedited development and intensive FDA guidance for substantial improvement over existing therapy.' },
    { n: 'PRIME Designation', a: 'EMA', f: 'eCTD', c: '—', wf: 'designation', d: 'EU priority-medicines scheme: enhanced interaction and early dialogue for unmet medical need.' },
    { n: 'Fast Track Designation', a: 'FDA', f: 'Letter', c: '—', wf: 'designation', d: 'Enables rolling review and more frequent interactions for serious conditions filling an unmet need.' },
    { n: 'Regenerative Medicine Advanced Therapy (RMAT)', a: 'FDA', f: 'Letter', c: '—', wf: 'designation', d: 'Designation for cell/gene/tissue-engineering products with expedited development features.' },
    { n: 'Drug Master File (DMF)', a: 'FDA', f: 'eCTD', c: '—', wf: 'DMF', d: 'Confidential API/excipient CMC filing referenced by IND/NDA applicants.' },
    { n: 'Active Substance Master File (ASMF)', a: 'EMA', f: 'eCTD', c: '3.2.S', wf: 'DMF', d: 'EU equivalent of the DMF; confidential manufacturing and quality data for active substances.' },
  ] },
  { cat: 'Investigational (Clinical Development)', desc: 'Authorization to conduct clinical trials in humans, Phase I through Phase III', items: [
    { n: 'Investigational New Drug Application (IND)', a: 'FDA', f: 'eCTD', c: 'M1–M5', wf: 'IND', d: 'Application to begin clinical trials; CMC (M3), nonclinical (M4), protocol + IB (M5). File 30 days before start.' },
    { n: 'Clinical Trial Application (CTA)', a: 'EMA / National', f: 'eCTD', c: 'M1–M5', wf: 'IND', d: 'EU application under CTR 536/2014 via the CTIS portal; one application covers all member states.' },
    { n: 'Clinical Trial Notification (CTN)', a: 'TGA (AU)', f: 'eCTD', c: '—', wf: 'clindoc', d: 'Notification to Australia’s TGA before commencing a clinical trial.' },
    { n: 'IND Safety Reports (IND-SR)', a: 'FDA', f: 'eCTD', c: 'M5', wf: 'IND', d: 'Expedited reports of serious unexpected reactions within 15 days (7 for fatal/life-threatening).' },
    { n: 'Annual Report (IND)', a: 'FDA', f: 'eCTD', c: 'M5', wf: 'IND', d: 'Annual summary within 60 days of the IND anniversary: study progress, safety, CMC changes.' },
    { n: 'Development Safety Update Report (DSUR)', a: 'ICH / Global', f: 'eCTD', c: 'M5', wf: 'clindoc', d: 'ICH E2F-harmonized annual safety report across all ongoing clinical trials globally.' },
    { n: 'Protocol & Protocol Amendments', a: 'FDA / EMA', f: 'eCTD', c: 'M5', wf: 'IND', d: 'Study design, endpoints, populations, and SAP; amendments require notification or approval.' },
    { n: 'Investigator’s Brochure (IB)', a: 'ICH / Global', f: 'eCTD', c: 'M5', wf: 'IND', d: 'ICH E6 GCP compendium of clinical and nonclinical data; updated at least annually.' },
    { n: 'Informed Consent Form (ICF)', a: 'IRB / Ethics', f: '—', c: '—', wf: 'clindoc', d: 'Patient-facing document meeting 21 CFR 50 / ICH GCP; reviewed by the IRB/Ethics Committee.' },
    { n: 'Clinical Study Report (CSR)', a: 'ICH / Global', f: 'eCTD', c: 'M5 (5.3.5)', wf: 'CSR', d: 'ICH E3 comprehensive report of an individual study’s results; foundational efficacy/safety document.' },
    { n: 'Statistical Analysis Plan (SAP)', a: 'ICH / Global', f: '—', c: 'M5', wf: 'CSR', d: 'Pre-specified statistical methods, analysis populations, multiplicity adjustments, and endpoints.' },
  ] },
  { cat: 'Marketing Authorization (Registration)', desc: 'Applications to bring a drug to market -- the pivotal filings', items: [
    { n: 'New Drug Application (NDA)', a: 'FDA', f: 'eCTD', c: 'M1–M5', wf: 'NDA', d: 'Full CTD dossier for new small molecules; Standard (10 mo) or Priority (6 mo). Triggers PDUFA.' },
    { n: 'Biologics License Application (BLA)', a: 'FDA', f: 'eCTD', c: 'M1–M5', wf: 'BLA', d: 'Marketing application for biologics under PHS Act §351(a); biologics-specific CMC.' },
    { n: 'Marketing Authorisation Application (MAA)', a: 'EMA', f: 'eCTD', c: 'M1–M5', wf: 'MAA', d: 'EU centralized procedure to CHMP; mandatory for biotech products, orphans, advanced therapies.' },
    { n: 'Abbreviated NDA (ANDA)', a: 'FDA', f: 'eCTD', c: 'M1–M3', wf: 'NDA', d: 'Generic drug application demonstrating bioequivalence to a reference listed drug (505(j)).' },
    { n: '505(b)(2) Application', a: 'FDA', f: 'eCTD', c: 'M1–M5', wf: 'NDA', d: 'NDA pathway relying partly on literature or FDA’s prior findings; new formulations/indications.' },
    { n: 'Biosimilar Application (351(k))', a: 'FDA', f: 'eCTD', c: 'M1–M5', wf: 'BLA', d: 'Application for a biosimilar demonstrating biosimilarity to a reference product.' },
    { n: 'New Drug Submission (NDS)', a: 'Health Canada', f: 'eCTD', c: 'M1–M5', wf: 'NDA', d: 'Canadian marketing authorization; CTD format with a Canada-specific Module 1.' },
    { n: 'Accelerated Approval Application', a: 'FDA', f: 'eCTD', c: 'M1–M5', wf: 'NDA', d: 'NDA/BLA using a surrogate or intermediate endpoint; requires confirmatory trials.' },
    { n: 'Conditional Marketing Authorisation', a: 'EMA', f: 'eCTD', c: 'M1–M5', wf: 'MAA', d: 'EU approval on less comprehensive data; annual renewal and obligations to complete the data.' },
    { n: 'Rolling Submission / Review', a: 'FDA', f: 'eCTD', c: 'M1–M5', wf: 'BLA', d: 'Under Breakthrough/Fast Track; completed sections submitted before the full application is done.' },
    { n: 'Pediatric Study Plan (PSP) / PIP', a: 'FDA / EMA', f: 'eCTD', c: 'M1', wf: 'clindoc', d: 'Pediatric development strategy; required before/with NDA/BLA (FDA) or as a PIP (EMA).' },
  ] },
  { cat: 'Post-Approval Lifecycle', desc: 'Changes, variations, and safety reporting after marketing authorization', items: [
    { n: 'NDA/BLA Supplement (Prior Approval)', a: 'FDA', f: 'eCTD', c: '—', wf: 'NDA', d: 'Prior-Approval Supplement for major post-approval changes; FDA approval before implementation.' },
    { n: 'CBE-30 / CBE-0 Supplement', a: 'FDA', f: 'eCTD', c: '—', wf: 'NDA', d: 'Changes Being Effected supplement (30-day notice or immediate).' },
    { n: 'Annual Report (NDA/BLA)', a: 'FDA', f: 'eCTD', c: '—', wf: 'postmarket', d: 'Annual post-marketing report of minor changes and safety information.' },
    { n: 'Type IA / IB / II Variation', a: 'EMA', f: 'eCTD', c: '—', wf: 'MAA', d: 'EU post-authorization variations classified by regulatory significance.' },
    { n: 'PSUR / PBRER', a: 'ICH / Global', f: 'eCTD', c: '—', wf: 'postmarket', d: 'Periodic Benefit-Risk Evaluation Report (ICH E2C(R2)).' },
    { n: 'Risk Evaluation & Mitigation Strategy (REMS)', a: 'FDA', f: 'eCTD', c: '—', wf: 'postmarket', d: 'Risk-management program required to ensure benefits outweigh serious risks.' },
    { n: 'Risk Management Plan (RMP)', a: 'EMA', f: 'eCTD', c: '—', wf: 'postmarket', d: 'EU safety specification, pharmacovigilance plan, and risk-minimization measures.' },
    { n: 'Post-Marketing Requirement (PMR) / PMC', a: 'FDA', f: 'eCTD', c: '—', wf: 'postmarket', d: 'Required or committed post-marketing studies and clinical trials.' },
    { n: 'SUPAC Supplement', a: 'FDA', f: 'eCTD', c: '—', wf: 'postmarket', d: 'Scale-Up and Post-Approval Changes to CMC (components, equipment, site, process).' },
    { n: 'MedWatch / FAERS Report', a: 'FDA', f: '—', c: '—', wf: 'postmarket', d: 'Adverse-event reporting (Forms 3500 / 3500A) into FAERS.' },
    { n: 'Renewal Application', a: 'EMA / National', f: 'eCTD', c: '—', wf: 'MAA', d: 'Renewal of the marketing authorization (typically at 5 years).' },
  ] },
  { cat: 'CMC / Quality (Module 3)', desc: 'Chemistry, manufacturing, and controls -- the quality backbone', items: [
    { n: 'Module 3.2.S -- Drug Substance', a: 'ICH / Global', f: 'eCTD', c: '3.2.S', wf: 'DMF', d: 'Manufacture, characterization, control, and stability of the active substance.' },
    { n: 'Module 3.2.P -- Drug Product', a: 'ICH / Global', f: 'eCTD', c: '3.2.P', wf: 'DMF', d: 'Composition, manufacture, control, and stability of the finished drug product.' },
    { n: 'Quality Overall Summary (QOS)', a: 'ICH / Global', f: 'eCTD', c: '2.3', wf: 'DMF', d: 'CTD Module 2.3 summary of the Module 3 quality data.' },
    { n: 'Comparability Protocol', a: 'FDA / EMA', f: 'eCTD', c: '—', wf: 'DMF', d: 'Pre-agreed plan for assessing the impact of a post-change on product comparability.' },
    { n: 'Environmental Assessment (EA)', a: 'FDA', f: 'eCTD', c: '—', wf: 'DMF', d: 'NEPA environmental impact assessment or claim of categorical exclusion.' },
  ] },
] },

{ seg: 'device', label: 'Medical Devices', sub: 'Class I–III devices -- SaMD -- combination products', icon: 'stethoscope', cats: [
  { cat: 'Classification & Pre-Submission', desc: 'Establish device class and align with the agency before submitting', items: [
    { n: '513(g) Classification Request', a: 'FDA', f: 'Letter', c: '—', wf: 'presub', d: 'Request FDA’s view on the classification and regulatory requirements for a device.' },
    { n: 'Pre-Submission (Q-Sub)', a: 'FDA', f: 'eSTAR', c: '—', wf: 'presub', d: 'Formal feedback meeting with CDRH before a marketing submission.' },
    { n: 'Breakthrough Device Designation', a: 'FDA', f: 'Letter', c: '—', wf: 'designation', d: 'Expedited development and review for devices treating life-threatening conditions.' },
    { n: 'Request for Designation (RFD)', a: 'FDA / OCP', f: '—', c: '—', wf: 'presub', d: 'OCP determination of primary mode of action and lead center for combination products.' },
  ] },
  { cat: 'Market Authorization (US FDA)', desc: 'The pivotal US device marketing pathways', items: [
    { n: '510(k) Premarket Notification', a: 'FDA', f: 'eSTAR', c: '—', wf: '510k', d: 'Demonstrates substantial equivalence to a legally marketed predicate device.' },
    { n: 'De Novo Classification Request', a: 'FDA', f: 'eSTAR', c: '—', wf: 'denovo', d: 'Novel low-to-moderate-risk device with no predicate; creates a new classification.' },
    { n: 'Premarket Approval Application (PMA)', a: 'FDA', f: 'eCopy', c: '—', wf: 'PMA', d: 'Class III devices; clinical evidence of safety and effectiveness.' },
    { n: 'Humanitarian Device Exemption (HDE)', a: 'FDA', f: 'eCopy', c: '—', wf: 'HDE', d: 'Devices for rare conditions (Humanitarian Use Device); probable-benefit standard.' },
    { n: 'Investigational Device Exemption (IDE)', a: 'FDA', f: 'eCopy', c: '—', wf: 'IDE', d: 'Authorizes a clinical investigation of a device to collect safety/effectiveness data.' },
    { n: 'Emergency Use Authorization (EUA)', a: 'FDA', f: '—', c: '—', wf: 'eua', d: 'Authorizes use of an unapproved device during a declared emergency.' },
  ] },
  { cat: 'Market Authorization (EU / International)', desc: 'CE marking under MDR and key ex-US markets', items: [
    { n: 'EU MDR Technical Documentation', a: 'EU / NB', f: 'STED', c: '—', wf: 'CER', d: 'MDR Annex II/III technical file underpinning CE marking; reviewed by the Notified Body.' },
    { n: 'Clinical Evaluation Report (CER)', a: 'EU / NB', f: 'MEDDEV 2.7/1', c: '—', wf: 'CER', d: 'MDR clinical evaluation of device safety and performance against the state of the art.' },
    { n: 'Summary of Safety & Clinical Performance (SSCP)', a: 'EU / EUDAMED', f: '—', c: '—', wf: 'CER', d: 'Public summary for implantable and Class III devices; published in EUDAMED.' },
    { n: 'EU Declaration of Conformity (DoC)', a: 'EU', f: '—', c: '—', wf: 'intldevice', d: 'Manufacturer’s declaration that the device meets all applicable MDR requirements.' },
    { n: 'UK MHRA Registration', a: 'MHRA (UK)', f: '—', c: '—', wf: 'intldevice', d: 'UKCA marking and device registration for the Great Britain market.' },
    { n: 'Health Canada MDL', a: 'Health Canada', f: '—', c: '—', wf: 'intldevice', d: 'Medical Device Licence for Class II–IV devices (CMDR).' },
    { n: 'PMDA Shonin (Approval)', a: 'PMDA (JP)', f: '—', c: '—', wf: 'intldevice', d: 'Japanese marketing approval; STED-based dossier to PMDA/MHLW.' },
  ] },
  { cat: 'Post-Market & Lifecycle', desc: 'Changes, vigilance, and field actions after market entry', items: [
    { n: 'PMA Supplement', a: 'FDA', f: 'eCopy', c: '—', wf: 'PMA', d: 'Post-approval PMA changes (Panel-Track / 180-day / Real-Time / 30-day / Special).' },
    { n: '510(k) for Modified Device', a: 'FDA', f: 'eSTAR', c: '—', wf: '510k', d: 'New 510(k) when a change could significantly affect safety or effectiveness.' },
    { n: 'Annual Report (PMA)', a: 'FDA', f: '—', c: '—', wf: 'pmdevice', d: 'Annual post-approval report for an approved PMA.' },
    { n: 'Medical Device Report (MDR)', a: 'FDA', f: 'eMDR', c: '—', wf: 'pmdevice', d: 'Adverse-event and malfunction reporting under 21 CFR 803.' },
    { n: 'Recall / Correction Report', a: 'FDA', f: '—', c: '—', wf: 'pmdevice', d: 'Corrections and removals reporting under 21 CFR 806.' },
    { n: 'Manufacturer Incident Report (MIR)', a: 'EU', f: '—', c: '—', wf: 'pmdevice', d: 'MDR serious-incident vigilance report to the competent authority via EUDAMED.' },
    { n: 'Trend Report', a: 'EU', f: '—', c: '—', wf: 'pmdevice', d: 'MDR reporting of a statistically significant rise in non-serious incidents.' },
    { n: 'PSUR -- Device', a: 'EU', f: '—', c: '—', wf: 'pmdevice', d: 'MDR Periodic Safety Update Report summarizing the device benefit-risk profile.' },
    { n: 'Post-Market Clinical Follow-Up (PMCF)', a: 'EU', f: '—', c: '—', wf: 'CER', d: 'MDR plan and report for ongoing collection of clinical data post-market.' },
    { n: 'Field Safety Corrective Action (FSCA)', a: 'EU / Global', f: '—', c: '—', wf: 'pmdevice', d: 'Recall/field action plus the Field Safety Notice to users.' },
  ] },
  { cat: 'Software as Medical Device (SaMD) / AI', desc: 'Software, AI/ML, and connected-device documentation', items: [
    { n: 'SaMD Pre-Submission', a: 'FDA', f: 'eSTAR', c: '—', wf: 'samd', d: 'Pre-Sub feedback specific to a software/AI device and its evidence plan.' },
    { n: 'Predetermined Change Control Plan (PCCP)', a: 'FDA', f: 'eSTAR', c: '—', wf: 'samd', d: 'Pre-authorized AI/ML modifications and the protocol governing them.' },
    { n: 'Software Documentation (IEC 62304)', a: 'Global', f: '—', c: '—', wf: 'samd', d: 'Software lifecycle documentation per IEC 62304 safety class.' },
    { n: 'Cybersecurity Documentation', a: 'FDA', f: 'eSTAR', c: '—', wf: 'samd', d: 'Premarket cybersecurity documentation per FD&C §524B (SBOM, threat model, plan).' },
  ] },
] },

{ seg: 'ivd', label: 'Diagnostics & IVD', sub: 'In-vitro diagnostics -- companion diagnostics -- LDTs', icon: 'microscope', cats: [
  { cat: 'Classification & Pre-Submission', desc: 'Categorize the assay and align before submission', items: [
    { n: 'IVD Pre-Submission (Q-Sub)', a: 'FDA', f: 'eSTAR', c: '—', wf: 'ivdpresub', d: 'Pre-Sub feedback for an IVD’s analytical/clinical evidence plan.' },
    { n: 'CLIA Waiver Application', a: 'FDA', f: '—', c: '—', wf: 'ivdpresub', d: 'CLIA categorization and waiver-by-application for simple, low-risk tests.' },
    { n: 'IVDR Classification Self-Assessment', a: 'EU', f: '—', c: '—', wf: 'IVDR', d: 'IVDR Annex VIII rule-based Class A–D self-assessment.' },
  ] },
  { cat: 'Market Authorization (US FDA)', desc: 'US IVD marketing pathways', items: [
    { n: '510(k) for IVD', a: 'FDA', f: 'eSTAR', c: '—', wf: '510k', d: 'Substantial equivalence for a moderate-risk in-vitro diagnostic.' },
    { n: 'PMA for IVD', a: 'FDA', f: 'eCopy', c: '—', wf: 'PMA', d: 'Premarket approval for a high-risk (Class III) IVD.' },
    { n: 'De Novo for IVD', a: 'FDA', f: 'eSTAR', c: '—', wf: 'denovo', d: 'Novel low-to-moderate-risk IVD with no predicate.' },
    { n: 'Emergency Use Authorization (EUA) for IVD', a: 'FDA', f: '—', c: '—', wf: 'eua', d: 'Emergency authorization of a diagnostic during a declared emergency.' },
    { n: 'Laboratory Developed Test (LDT) Notification', a: 'FDA', f: '—', c: '—', wf: 'ldt', d: 'LDT under FDA’s phased oversight framework.' },
  ] },
  { cat: 'Companion Diagnostics (CDx)', desc: 'Diagnostics co-developed with a therapeutic', items: [
    { n: 'CDx PMA', a: 'FDA', f: 'eCopy', c: '—', wf: 'PMA', d: 'Companion diagnostic co-developed with a drug; approved via PMA.' },
    { n: 'CDx 510(k) (Expanded Use)', a: 'FDA', f: 'eSTAR', c: '—', wf: '510k', d: 'Clearance to expand a cleared CDx to an additional therapeutic/indication.' },
    { n: 'Complementary Diagnostic', a: 'FDA', f: '—', c: '—', wf: 'cdx', d: 'Aids the benefit-risk decision but is not required for use of the therapeutic.' },
    { n: 'CDx Co-Development Agreement', a: 'FDA', f: '—', c: '—', wf: 'cdx', d: 'Drug-diagnostic co-development plan and contractual framework.' },
  ] },
  { cat: 'Market Authorization (EU IVDR)', desc: 'CE marking under the IVDR', items: [
    { n: 'IVDR Technical Documentation', a: 'EU / NB', f: '—', c: '—', wf: 'IVDR', d: 'IVDR Annex II/III technical file for CE marking under Notified Body review.' },
    { n: 'Performance Evaluation Report (PER)', a: 'EU / NB', f: '—', c: '—', wf: 'IVDR', d: 'Scientific validity plus analytical and clinical performance (IVDR Annex XIII).' },
    { n: 'Performance Study Application', a: 'EU / Member State', f: '—', c: '—', wf: 'IVDR', d: 'Authorization for an IVD performance study from the competent authority.' },
    { n: 'EU Reference Laboratory Consultation', a: 'EU', f: '—', c: '—', wf: 'IVDR', d: 'EURL verification of performance for Class D devices.' },
    { n: 'SSCP for IVD', a: 'EU / EUDAMED', f: '—', c: '—', wf: 'ivdpostmarket', d: 'Public summary of safety and performance for Class C/D IVDs.' },
  ] },
  { cat: 'Post-Market & Lifecycle (IVD)', desc: 'Ongoing performance and safety surveillance', items: [
    { n: 'Post-Market Performance Follow-Up (PMPF)', a: 'EU', f: '—', c: '—', wf: 'ivdpostmarket', d: 'IVDR plan and report for ongoing collection of performance data.' },
    { n: 'Trend Reporting', a: 'FDA / EU', f: '—', c: '—', wf: 'ivdpostmarket', d: 'Reporting of a statistically significant trend in incidents/results.' },
    { n: 'Annual Device Registration', a: 'FDA', f: '—', c: '—', wf: 'ivdpostmarket', d: 'Annual establishment registration and device listing.' },
    { n: 'PSUR -- IVD', a: 'EU', f: '—', c: '—', wf: 'ivdpostmarket', d: 'IVDR Periodic Safety Update Report for the device benefit-risk profile.' },
  ] },
] },

{ seg: 'cross', label: 'Cross-Cutting', sub: 'CTD structure -- quality systems -- global pharmacovigilance', icon: 'layers', cats: [
  { cat: 'ICH Common Technical Document (CTD/eCTD)', desc: 'The five-module structure every drug filing is built on', items: [
    { n: 'Module 1 -- Regional Administrative', a: 'FDA / EMA', f: 'eCTD', c: 'M1', wf: 'NDA', d: 'Region-specific administrative information: forms, cover letter, labeling.' },
    { n: 'Module 2 -- CTD Summaries', a: 'ICH', f: 'eCTD', c: 'M2', wf: 'NDA', d: 'Overviews and summaries (2.3 QOS, 2.4 nonclinical, 2.5 clinical, 2.6, 2.7).' },
    { n: 'Module 3 -- Quality', a: 'ICH', f: 'eCTD', c: 'M3', wf: 'DMF', d: 'Chemistry, manufacturing, and controls for substance and product.' },
    { n: 'Module 4 -- Nonclinical Study Reports', a: 'ICH', f: 'eCTD', c: 'M4', wf: 'NDA', d: 'Pharmacology, pharmacokinetics, and toxicology study reports.' },
    { n: 'Module 5 -- Clinical Study Reports', a: 'ICH', f: 'eCTD', c: 'M5', wf: 'CSR', d: 'Clinical study reports and the tabular listing of all clinical studies.' },
  ] },
  { cat: 'Quality Management System (QMS)', desc: 'Device quality-system records under ISO 13485 / 21 CFR 820', items: [
    { n: 'Quality Manual / QMS Documentation', a: 'Global', f: '—', c: '—', wf: 'qms', d: 'ISO 13485 / 21 CFR 820 quality-system documentation and procedures.' },
    { n: 'Design History File (DHF)', a: 'FDA', f: '—', c: '—', wf: 'qms', d: 'Design-control records demonstrating the device was developed per the design plan (820.30).' },
    { n: 'Device Master Record (DMR)', a: 'FDA', f: '—', c: '—', wf: 'qms', d: 'Compiled device specifications and production procedures.' },
    { n: 'Device History Record (DHR)', a: 'FDA', f: '—', c: '—', wf: 'qms', d: 'Production records demonstrating each unit/batch was made per the DMR.' },
    { n: 'MDSAP Audit Report', a: 'Global', f: '—', c: '—', wf: 'qms', d: 'Single regulatory audit recognized across US, Canada, Brazil, Australia, and Japan.' },
  ] },
  { cat: 'Safety & Pharmacovigilance (Global)', desc: 'Cross-segment safety surveillance and signal management', items: [
    { n: 'Individual Case Safety Report (ICSR)', a: 'ICH / Global', f: 'E2B', c: '—', wf: 'pv', d: 'Structured single-case adverse-event report (ICH E2B).' },
    { n: 'Pharmacovigilance System Master File (PSMF)', a: 'EMA', f: '—', c: '—', wf: 'pv', d: 'Description of the marketing-authorization holder’s pharmacovigilance system.' },
    { n: 'Signal Detection & Evaluation Report', a: 'ICH / Global', f: '—', c: '—', wf: 'pv', d: 'Documentation of signal management: detection, validation, and evaluation.' },
    { n: 'Benefit-Risk Assessment', a: 'ICH / Global', f: '—', c: '—', wf: 'pv', d: 'Structured evaluation weighing a product’s benefits against its risks.' },
  ] },
] },
];

/* ---- Workflow surface mapping ---- */

export const FILING_WF_SURFACE: Record<string, string> = {
  IND: 'document-authoring', NDA: 'document-authoring', BLA: 'document-authoring', MAA: 'document-authoring',
  CSR: 'document-authoring', '510k': 'document-authoring', PMA: 'document-authoring',
  denovo: 'document-authoring', CER: 'document-authoring', ANDA: 'document-authoring',
  '505b2': 'document-authoring', biosimilar: 'document-authoring', DMF: 'document-authoring',
  IDE: 'document-authoring', HDE: 'document-authoring', IVDR: 'document-authoring',
  MDR: 'document-authoring', STED: 'document-authoring',
  designation: 'document-authoring', postmarket: 'document-authoring', presub: 'document-authoring',
  samd: 'document-authoring', qms: 'document-authoring', pv: 'document-authoring',
  clindoc: 'document-authoring', eua: 'document-authoring', cdx: 'document-authoring',
  pmdevice: 'document-authoring', ivdpresub: 'document-authoring', ldt: 'document-authoring',
  intldevice: 'document-authoring', advice: 'document-authoring', ivdpostmarket: 'document-authoring',
};

/* wf code -> pathway ID in REG_PATHWAYS */
export const FILING_WF_PATHWAY: Record<string, string> = {
  IND: 'ind', NDA: 'ctd', BLA: 'bla', MAA: 'maa', CSR: 'csr',
  '510k': 'estar', PMA: 'pma', denovo: 'denovo', CER: 'cer',
  ANDA: 'anda', '505b2': '505b2', biosimilar: 'biosimilar', DMF: 'dmf',
  IDE: 'ide', HDE: 'hde', IVDR: 'ivdr', MDR: 'mdr', STED: 'sted',
  designation: 'designation', postmarket: 'postmarket', presub: 'presub',
  samd: 'samd', qms: 'qms', pv: 'pv', clindoc: 'clindoc', eua: 'eua',
  cdx: 'cdx', pmdevice: 'pmdevice', ivdpresub: 'ivdpresub', ldt: 'ldt',
  intldevice: 'intldevice', advice: 'advice', ivdpostmarket: 'ivdpostmarket',
};

export const FILING_WF_LABEL: Record<string, string> = {
  IND: 'IND', NDA: 'NDA', BLA: 'BLA', MAA: 'MAA', CSR: 'CSR',
  '510k': '510(k)', PMA: 'PMA', denovo: 'De Novo', CER: 'CER',
  ANDA: 'ANDA', '505b2': '505(b)(2)', biosimilar: 'Biosimilar 351(k)', DMF: 'DMF',
  IDE: 'IDE', HDE: 'HDE', IVDR: 'IVDR', MDR: 'EU MDR', STED: 'STED',
  designation: 'Designation', postmarket: 'Post-Market', presub: 'Pre-Sub',
  samd: 'SaMD', qms: 'QMS', pv: 'PV', clindoc: 'Clinical Doc', eua: 'EUA',
  cdx: 'CDx', pmdevice: 'PM Device', ivdpresub: 'IVD Pre-Sub', ldt: 'LDT',
  intldevice: 'Intl Device', advice: 'Sci. Advice', ivdpostmarket: 'IVD Post-Mkt',
};

/* ---- Filing lifecycle loop ---- */

export const FILING_LOOP_ARCHETYPE: Record<string, string> = {
  NDA: 'marketing', BLA: 'marketing', MAA: 'marketing', ANDA: 'marketing',
  '505b2': 'marketing', biosimilar: 'marketing',
  '510k': 'device', denovo: 'device', PMA: 'device', HDE: 'device',
  IND: 'clinical', IDE: 'clinical',
  presub: 'presub', advice: 'presub', ivdpresub: 'presub',
  designation: 'designation',
  CER: 'euconformity', IVDR: 'euconformity', MDR: 'euconformity', STED: 'euconformity',
  postmarket: 'postmarket', pmdevice: 'postmarket', ivdpostmarket: 'postmarket', pv: 'postmarket',
  DMF: 'cmc', qms: 'cmc',
  CSR: 'clindoc', clindoc: 'clindoc', eua: 'presub', cdx: 'device', ldt: 'presub', intldevice: 'euconformity',
};

export const FILING_LOOP: Record<string, FilingLoop> = {
  marketing: {
    label: 'Marketing authorization', clock: 'FDA: PDUFA 10 mo standard / 6 mo priority -- EMA: CHMP 210 active days',
    stages: ['Pre-sub / EOP2', 'Assemble dossier', 'Submit to gateway', 'Filing / validation', 'Agency review', 'Response to deficiencies', 'Approval'],
    ret: { label: 'Complete Response Letter (CRL) -- Day-120 List of Questions', desc: 'FDA issues a CRL (or EMA a Day-120/180 LoQ) describing every deficiency. Decompose it, respond section-by-section, and resubmit -- the loop runs back through review.' } },
  device: {
    label: 'US device market authorization', clock: '510(k): 90 FDA days -- De Novo: 150 days -- PMA: 180 days + panel',
    stages: ['Pre-Sub (Q-Sub)', 'Compile submission', 'Submit (eSTAR/eCopy)', 'Acceptance / filing review', 'Substantive review', 'Response to deficiencies', 'Clearance / approval'],
    ret: { label: 'Additional Information (AI) request -- Major Deficiency Letter', desc: 'FDA places the submission on hold with an AI request (510(k)/De Novo) or a Major Deficiency Letter (PMA). The clock stops until you respond; 510(k) AI responses are due within 180 days.' } },
  clinical: {
    label: 'Clinical-trial authorization', clock: 'IND: 30-day default review -- IDE: 30-day FDA decision',
    stages: ['Pre-IND meeting', 'Assemble IND/IDE', 'Submit', '30-day safety review', 'Trial may proceed', 'Amendments & safety reports', 'Ongoing'],
    ret: { label: 'Clinical Hold', desc: 'FDA may place a full or partial clinical hold within 30 days. Resolve every hold issue in a complete response; the trial resumes only on FDA\'s written removal of the hold.' } },
  presub: {
    label: 'Pre-submission / agency feedback', clock: 'FDA Q-Sub: ~70-day meeting -- EMA Scientific Advice: ~40–70 days',
    stages: ['Frame the questions', 'Draft briefing package', 'Submit request', 'Agency preparation', 'Meeting / written response', 'Incorporate feedback'],
    ret: { label: 'No denial loop', desc: 'Feedback interactions do not get denied -- the output is agency advice or written responses that shape your development plan and de-risk the eventual marketing application.' } },
  designation: {
    label: 'Special designation', clock: 'FDA BTD/Fast Track: 60 days -- Orphan: ~90 days -- EMA PRIME/Orphan: per COMP/CHMP cycle',
    stages: ['Assess eligibility', 'Assemble request', 'Submit', 'Agency review', 'Granted / denied'],
    ret: { label: 'Denial (request may be resubmitted)', desc: 'A denied designation can be re-requested with additional data as the program matures -- it does not block the underlying application.' } },
  euconformity: {
    label: 'EU / international device conformity', clock: 'Notified Body review of the technical file; timeline varies by NB and device class',
    stages: ['Build technical file', 'Clinical/performance evaluation', 'NB submission', 'NB review', 'Deficiency (NCR) response', 'CE certificate'],
    ret: { label: 'Notified Body Non-Conformity (NCR) / Deficiency', desc: 'The Notified Body raises non-conformities against the GSPRs. Close every NCR with evidence before the CE certificate is issued.' } },
  postmarket: {
    label: 'Post-approval lifecycle', clock: 'Prior-Approval Supplement: 4 mo -- CBE-30: 30 days -- Variation Type II: 60–90 days',
    stages: ['Assess change / signal', 'Classify the filing', 'Prepare', 'Submit', 'Agency review / notification', 'Implemented'],
    ret: { label: 'Deficiency on the supplement / variation', desc: 'The agency can raise deficiencies on a supplement or variation just like an original application; respond and the change is approved for implementation.' } },
  cmc: {
    label: 'CMC / quality', clock: 'Reviewed within the referencing IND/NDA/BLA or as a standalone DMF assessment',
    stages: ['Author quality data', 'Assemble Module 3 / DMF', 'Submit / reference', 'Assessment', 'Deficiency response', 'Accepted'],
    ret: { label: 'CMC Deficiency / Complete Response (quality)', desc: 'Quality deficiencies (specifications, stability, comparability) are raised against Module 3; resolve them to clear the quality review.' } },
  clindoc: {
    label: 'Clinical document', clock: 'Authored to ICH standards; reviewed as part of the parent submission',
    stages: ['Draft to ICH template', 'Bind evidence', 'Internal review', 'Finalize', 'File into dossier'],
    ret: { label: 'Reviewer questions (in the parent application)', desc: 'Clinical documents are assessed inside the marketing application; questions arrive as part of the CRL / LoQ for the parent filing.' } },
};
