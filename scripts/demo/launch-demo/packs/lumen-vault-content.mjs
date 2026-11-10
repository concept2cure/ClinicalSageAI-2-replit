/**
 * launch-demo/packs/lumen-vault-content.mjs — the faux client Data Room of the
 * four Lumen demonstration projects (read by ./lumen-vault.mjs).
 *
 * EVERYTHING HERE IS SYNTHETIC. No document is Lumen Bioscience's: program
 * codes, indications, phases and registry numbers are the public facts the
 * seed kit holds (lumen-content.mjs, data/seeds/lumen-demo); every person,
 * institution, lot, result, date and decision is invented for the
 * demonstration, and every page of every PDF says SYNTHETIC / NOT ACTUAL DATA.
 * The sponsor is the demonstration's own fictional sponsor, as in the
 * fictional approval letter. Text is ASCII: the PDF writer renders Latin-1 only.
 *
 * A document:  { key, project, code, name, type, cls, filing, stage, version, subtitle, sections }
 *   type     POST /api/vault/ingest documentType (VAULT_INGEST_DOCUMENT_TYPES)
 *   filing   [folderId, evidenceKind, ctdSection|null] — a person's filing at upload
 *            (placement 'confirmed', so Required documents counts its CTD section);
 *            null leaves the placement to the classifier
 *   stage    'approved' (sent, reviewed and approved by two other people),
 *            'reviewed' (review signed, approval due), 'in_review' (sent, review due),
 *            'draft' (not sent for review)
 */
import { T } from './lumen-content.mjs';

export const SPONSOR = 'Concept2Cure Therapeutics (fictional demonstration sponsor)';
export const VAULT_FOOTER = 'SYNTHETIC / NOT ACTUAL DATA - fictional demonstration content - not affiliated with Lumen Bioscience, Inc.';
const CRO = 'Harborline Clinical Research (fictional CRO)';
const IRB = 'Larchmont Central Review Board (fictional IRB)';
const LAB = 'Brightwater Analytical Laboratories (fictional)';
const TOX = 'Fernhill Preclinical Services (fictional)';

const p = (heading, ...paragraphs) => ({ heading, paragraphs });

/** Abbreviations a document uses, listed when its own text uses them as words. */
const ABBREVIATIONS = {
  CDI: 'Clostridioides difficile infection', CFU: 'colony-forming units', CMC: 'chemistry, manufacturing and controls',
  CMH: 'Cochran-Mantel-Haenszel', CRO: 'contract research organisation', CTD: 'Common Technical Document',
  DSUR: 'development safety update report', DXA: 'dual-energy X-ray absorptiometry', ELISA: 'enzyme-linked immunosorbent assay',
  ETEC: 'enterotoxigenic Escherichia coli', GLP: 'Good Laboratory Practice', HbA1c: 'glycated haemoglobin',
  IC50: 'half-maximal inhibitory concentration', ICH: 'International Council for Harmonisation',
  IND: 'investigational new drug application', IRB: 'institutional review board',
  'LC-MS': 'liquid chromatography with mass spectrometry', MedDRA: 'Medical Dictionary for Regulatory Activities',
  PCR: 'polymerase chain reaction', PK: 'pharmacokinetics', RH: 'relative humidity', SAP: 'statistical analysis plan',
  TAMC: 'total aerobic microbial count', TYMC: 'total combined yeasts and moulds count',
  VHH: 'single-domain antibody from a heavy-chain-only antibody', WHODrug: 'WHO Drug Dictionary',
};

function abbreviationsOf(sections) {
  const text = sections.flatMap((s) => [s.heading, ...s.paragraphs]).join(' ');
  const used = Object.keys(ABBREVIATIONS).filter((k) => new RegExp(`(^|[^A-Za-z0-9-])${k.replace('-', '\\-')}([^A-Za-z0-9]|$)`).test(text));
  return used.length ? [p('Abbreviations', used.sort().map((k) => `${k}: ${ABBREVIATIONS[k]}`).join('\n'))] : [];
}

/** A heading the PDF's one 16-point title line holds (it is not wrapped): cut at a comma, else a space. */
function heading(name, max = 60) {
  if (name.length <= max) return name;
  const comma = name.lastIndexOf(', ', max);
  const cut = name.slice(0, comma > 20 ? comma : name.lastIndexOf(' ', max));
  return cut.replace(/[\s:,]+(in|of|for|and|the|to|on|with)?[\s:,]*$/i, '');
}

/** The PDF of one document: its own sections between a control block and the synthetic-data statement. */
export function vaultPdf(doc) {
  return {
    title: heading(doc.name),
    subtitle: 'SYNTHETIC / NOT ACTUAL DATA - demonstration document',
    footer: VAULT_FOOTER,
    sections: [
      p('Document control', [
        `Title: ${T(doc.name)}`,
        doc.subtitle,
        `Document number: ${doc.code.replace(/\.pdf$/, '')}`,
        `Version: ${doc.version}`,
        `Program: ${doc.project} (illustrative, public program code only)`,
        `Sponsor: ${SPONSOR}`,
        `Classification: ${doc.cls === 'CONFIDENTIAL' ? 'Confidential' : 'Internal'}`,
        'Status: SYNTHETIC / NOT ACTUAL DATA. Prepared for a Concept2Cure demonstration; not a regulatory record of any company.',
      ].join('\n')),
      ...doc.sections,
      ...abbreviationsOf(doc.sections),
      p('Review and revision history', [
        `${doc.version}: the version held in the project Data Room.`,
        'Review and approval of this version are recorded in the Vault, on its review route, by named people with electronic signatures.',
        'Earlier working drafts are not part of this demonstration data room.',
      ].join('\n')),
      p('Synthetic data statement',
        'SYNTHETIC / NOT ACTUAL DATA. This document was written for a software demonstration. Every name of a person, site, ' +
          'laboratory, contract organisation or review board, every lot number, result, date and decision in it is invented. ' +
          'Program codes, indications and public registry numbers are taken from public information only. It carries no ' +
          'Lumen Bioscience, Inc. data and represents no action of any regulatory agency.'),
    ],
  };
}

const LMN201 = [
  { key: 'protocol', code: 'LMN201-CDI02-PROT-v2.0.pdf', name: 'LMN-201-CDI02 (RePreve) clinical protocol v2.0', type: 'PROTOCOL', cls: 'CONFIDENTIAL',
    filing: ['module-5', 'protocol', '5.3.5.1'], stage: 'approved', version: '2.0 (amendment 1)',
    subtitle: 'A randomized, double-blind, placebo-controlled Phase 2/3 study of LMN-201 with standard-of-care antibiotics',
    sections: [
      p('1. Synopsis',
        'RePreve (public listing NCT05330182) evaluates whether LMN-201, an oral cocktail of a bacteriophage lysin and three VHH-derived anti-toxin B proteins delivered in spray-dried spirulina biomass in enteric capsules, added to standard-of-care antibiotics, improves sustained clinical cure of Clostridioides difficile infection compared with placebo. Approximately 375 adults are randomized 1:1. In this synthetic version the treatment period is 14 days and follow-up continues to week 12.',
        'Primary endpoint: sustained clinical cure at week 12, defined as initial clinical cure and no recurrence of C. difficile infection through week 12. Key secondary endpoints (illustrative): recurrence by week 8, time to recurrence, and safety and tolerability.'),
      p('2. Rationale for amendment 1 (synthetic)',
        'Version 2.0 widens the window between diagnosis and randomization from 72 to 96 hours, clarifies that vancomycin and fidaxomicin are both acceptable standard-of-care regimens, and adds stool sample collection at day 15 for exploratory toxin B neutralisation assays. No change was made to the primary endpoint or to the sample size.',
        'The amendment follows an interim feasibility review by the study team: 11 of 38 screened participants at three sites were excluded only by the 72-hour window. The change is expected to have no effect on the treatment effect estimate.'),
      p('3. Study population',
        'Adults aged 18 years and older with a first episode or first recurrence of C. difficile infection, confirmed by a positive toxin assay or nucleic acid amplification test with at least three unformed stools in 24 hours, who are receiving a standard-of-care antibiotic. Key exclusions: fulminant colitis, ileus, inflammatory bowel disease, prior fecal microbiota transplantation within 6 months, and an anticipated need for systemic antibiotics for another infection during the treatment period.'),
      p('4. Treatment and blinding',
        'Participants take four LMN-201 or matching placebo enteric capsules twice daily for 14 days. Capsules are identical in appearance, packaged in blinded kits and allocated by an interactive response system using permuted blocks, stratified by episode (first versus recurrent) and antibiotic (vancomycin versus fidaxomicin).'),
      p('5. Assessments and safety monitoring',
        'Visits occur at screening, day 1, day 8, day 15 (end of treatment), and weeks 4, 8 and 12. Recurrence is adjudicated by a blinded clinical events committee. An independent data monitoring committee reviews unblinded safety data every 6 months and once 50 percent of participants complete week 12. Adverse events are collected from first dose through week 12.'),
    ] },
  { key: 'ib', code: 'LMN201-IB-ED4.pdf', name: "LMN-201 Investigator's Brochure, edition 4", type: 'IB', cls: 'CONFIDENTIAL',
    filing: ['module-1', 'clinical', '1.14.4.1'], stage: 'approved', version: 'Edition 4',
    subtitle: "Investigator's Brochure for an oral biologic cocktail for the prevention of recurrent C. difficile infection",
    sections: [
      p('1. Summary',
        'LMN-201 is an orally administered biologic cocktail: a bacteriophage-derived endolysin that lyses C. difficile, and three single-domain (VHH) antibodies that bind non-overlapping epitopes of toxin B. The proteins are expressed in spirulina and delivered as dried biomass in enteric capsules designed to release in the distal small intestine and colon.',
        'Edition 4 adds the completed results of the ileostomy delivery study (public listing NCT04893239, synthetic summary here), the 13-week repeat-dose toxicity study in rats, and the reference safety information for RePreve.'),
      p('2. Nonclinical summary (synthetic)',
        'In a hamster model of C. difficile infection, LMN-201 given with vancomycin increased survival after antibiotic withdrawal from 20 percent (vehicle) to 80 percent at the highest dose tested. In vitro, the VHH combination neutralised toxin B from five ribotypes with IC50 values between 0.3 and 2.1 nM. No systemic exposure to any LMN-201 protein was detected in rats after oral dosing.',
        'The 13-week oral toxicity study in rats identified no adverse findings at the highest dose administered (2000 mg/kg/day biomass); this dose is the no-observed-adverse-effect level.'),
      p('3. Clinical experience (synthetic)',
        'In the ileostomy study, 9 participants swallowed four enteric capsules. All four LMN-201 proteins were recovered intact in ileostomy fluid between 2 and 7 hours after dosing in 8 of 9 participants. Adverse events were mild and transient: abdominal distension (2 participants) and nausea (1). No serious adverse event occurred.'),
      p('4. Reference safety information',
        'Expected adverse reactions for the purpose of expedited reporting: abdominal distension, flatulence and nausea. Because LMN-201 is not absorbed, systemic hypersensitivity is considered unlikely but is monitored; spirulina allergy is an exclusion criterion.'),
    ] },
  { key: 'sap', code: 'LMN201-CDI02-SAP-v1.0.pdf', name: 'LMN-201-CDI02 statistical analysis plan v1.0', type: 'SAP', cls: 'CONFIDENTIAL',
    filing: ['module-5', 'clinical', '5.3.5.1'], stage: 'reviewed', version: '1.0',
    subtitle: 'Statistical analysis plan for RePreve, aligned to protocol version 2.0',
    sections: [
      p('1. Estimand',
        'Population: all randomized participants (intent-to-treat). Variable: sustained clinical cure at week 12. Intercurrent events: discontinuation of study treatment or use of rescue CDI therapy is handled by a composite strategy and counted as not cured. Summary measure: difference in proportions (LMN-201 minus placebo) with a two-sided 95 percent confidence interval.'),
      p('2. Sample size (illustrative assumptions)',
        'Assuming a sustained cure rate of 70 percent with placebo and 84 percent with LMN-201 (an absolute difference of 14 percentage points), a two-sided alpha of 0.05 and 80 percent power, 169 evaluable participants per arm are needed. Allowing for 10 percent dropout, 375 participants are randomized. These assumptions are illustrative demonstration values.'),
      p('3. Primary analysis',
        'The primary analysis uses a Cochran-Mantel-Haenszel test stratified by episode and antibiotic, with the Mantel-Haenszel estimate of the common risk difference. A participant with a missing week-12 assessment is counted as not cured. Sensitivity analyses: multiple imputation under missing at random, a tipping-point analysis, and the per-protocol set.',
        'Secondary endpoints are tested hierarchically in the order recurrence by week 8, then time to recurrence (log-rank test stratified as above), to control the familywise error rate at 0.05.'),
      p('4. Interim analysis',
        'One non-binding futility analysis is performed by the independent data monitoring committee when 50 percent of participants have completed week 12. No efficacy stopping is planned, so no alpha is spent at the interim.'),
    ] },
  { key: 'icf', code: 'LMN201-CDI02-ICF-v2.0.pdf', name: 'LMN-201-CDI02 informed consent form template v2.0', type: 'OTHER', cls: 'INTERNAL',
    filing: ['module-5', 'clinical', '5.3.5.1'], stage: 'approved', version: '2.0',
    subtitle: 'Master informed consent form for adult participants, English, for local adaptation by each site',
    sections: [
      p('1. Why is this study being done?',
        'You are being asked to take part in a research study because you have an infection of the bowel caused by a germ called Clostridioides difficile, often called C. diff. The study is testing whether an experimental medicine called LMN-201, taken by mouth together with the antibiotic your doctor prescribed, helps stop the infection from coming back.'),
      p('2. What will happen if I take part?',
        'You will take four capsules by mouth twice a day for 14 days. You will not know, and the study staff will not know, whether your capsules contain LMN-201 or a placebo, which looks the same but contains no medicine. You will have seven visits over about 12 weeks, and you will be asked to keep a diary of your bowel movements and to give stool samples.'),
      p('3. Risks and discomforts',
        'In earlier testing some people had bloating, gas or mild nausea. Because the study medicine is made from spirulina, a type of algae, people with an allergy to spirulina cannot take part. There may be risks that are not yet known. You will be told of any new information that might change your decision to stay in the study.'),
      p('4. Your rights',
        'Taking part is your choice. You may leave the study at any time without any effect on your usual medical care. Your study records are coded and kept confidential. Questions about your rights as a research participant can be directed to the review board named on the site version of this form.'),
    ] },
  { key: 'irb', code: 'LMN201-CDI02-IRB-APPROVAL-2.pdf', name: 'Central IRB approval of protocol LMN-201-CDI02 v2.0 (fictional)', type: 'CORRESPONDENCE', cls: 'INTERNAL',
    filing: ['module-5', 'cert', '5.3.5.1'], stage: 'draft', version: 'Received',
    subtitle: `Approval letter from ${IRB} for amendment 1`,
    sections: [
      p('Notice of approval',
        `${IRB} reviewed amendment 1 to protocol LMN-201-CDI02 (version 2.0) and the revised master informed consent form (version 2.0) at its convened meeting. The board approved both documents for use at all participating sites under its oversight.`,
        'Approval period: twelve months from the meeting date. Continuing review is due before the approval period ends. The board determined that the change to the randomization window and the addition of a day-15 stool sample do not alter the risk category of the study.'),
      p('Conditions of approval',
        'Sites must use the stamped version 2.0 consent form for all participants consented after the effective date, and must re-consent enrolled participants who have not yet reached the day-15 visit so that they may agree to the additional stool sample. Unanticipated problems involving risks to participants must be reported to the board within 10 working days.'),
      p('Board signature',
        'Signed for the board by its chair (a fictional person). This letter is part of a demonstration data room and was not issued by any real review board.'),
    ] },
  { key: 'preind', code: 'LMN201-FDA-PREIND-MINUTES.pdf', name: 'FDA pre-IND meeting minutes for LMN-201 (fictional)', type: 'CORRESPONDENCE', cls: 'CONFIDENTIAL',
    filing: ['corresp', 'resp', '1.12.1'], stage: 'draft', version: 'Final minutes as received',
    subtitle: 'Fictional minutes of a Type B pre-IND meeting. Not issued by FDA.',
    sections: [
      p('Meeting summary (fictional)',
        'The sponsor requested the meeting to discuss the chemistry, manufacturing and controls approach for a biologic expressed in and delivered as spirulina biomass, the adequacy of the nonclinical package to support a first-in-human study, and the proposed design of a Phase 2/3 trial. This record is fictional and represents no action or view of the Food and Drug Administration.'),
      p('Question 1: CMC',
        'Does the Agency agree that release testing of the drug substance may be performed on the dried biomass, with potency measured by a cell-based toxin B neutralisation assay? Response (fictional): The proposed approach appears reasonable. Provide data showing that the potency assay is stability-indicating, and include the lysin activity assay in the release specification.'),
      p('Question 2: Nonclinical',
        'Does the Agency agree that a 13-week oral repeat-dose toxicity study in one rodent species, with no detectable systemic exposure, is adequate to support dosing for up to 14 days? Response (fictional): Agreed, provided that absence of systemic exposure is confirmed with a validated assay of adequate sensitivity.'),
      p('Question 3: Clinical',
        'Does the Agency agree that sustained clinical cure at week 12 is an acceptable primary endpoint? Response (fictional): The endpoint is acceptable. Recurrence should be confirmed by a toxin assay and adjudicated by a committee blinded to treatment assignment.'),
    ] },
  { key: 'dsur', code: 'LMN201-DSUR-02.pdf', name: 'LMN-201 development safety update report, DSUR 2', type: 'DSUR', cls: 'CONFIDENTIAL',
    filing: ['module-1', 'report', null], stage: 'in_review', version: 'DSUR 2 (draft for review)',
    subtitle: 'Annual safety report for LMN-201 for the second reporting period (synthetic)',
    sections: [
      p('1. Introduction',
        'This report covers the second annual reporting period of the LMN-201 development program, from the development international birth date to the data lock point (both synthetic). One study was ongoing during the period: RePreve (LMN-201-CDI02). The ileostomy delivery study (CDI01) completed before the period began.'),
      p('2. Estimated cumulative exposure (synthetic)',
        'At the data lock point 142 participants had been randomized in RePreve, of whom an estimated 71 received LMN-201 (blinded; estimate based on the 1:1 ratio). Nine participants received LMN-201 in CDI01. Cumulative estimated exposure to LMN-201 is therefore 80 participants.'),
      p('3. Significant safety findings',
        'No new safety signal was identified. Twelve serious adverse events were reported in RePreve, all assessed by the investigator as unrelated to study treatment; the most frequent were recurrent C. difficile infection requiring hospitalisation (4) and pneumonia (2). There were no deaths related to study treatment. The data monitoring committee met twice and recommended that the study continue without modification.'),
      p('4. Overall risk assessment',
        'The benefit-risk balance of LMN-201 in the studied population remains favourable. The reference safety information in Investigator Brochure edition 4 remains appropriate.'),
    ] },
  { key: 'monplan', code: 'LMN201-CDI02-CMP-v1.1.pdf', name: 'LMN-201-CDI02 clinical monitoring plan v1.1', type: 'OTHER', cls: 'INTERNAL',
    filing: ['module-5', 'clinical', null], stage: 'approved', version: '1.1',
    subtitle: `Risk-based monitoring plan for RePreve, executed by ${CRO}`,
    sections: [
      p('1. Approach',
        'Monitoring follows a risk-based approach in line with ICH E6(R3). Critical data and processes were identified in a risk assessment workshop: informed consent, eligibility, primary endpoint assessments (stool diaries, toxin testing of recurrences), investigational product accountability and serious adverse event reporting.'),
      p('2. Monitoring activities',
        'On-site visits: a site initiation visit, then interim visits every 8 to 12 weeks while participants are on treatment, adjusted by key risk indicators. Remote monitoring: monthly review of data entry timeliness, query ageing, protocol deviations and diary compliance. Source data verification: 100 percent for consent, eligibility and primary endpoint data; targeted for other data.'),
      p('3. Key risk indicators and thresholds (illustrative)',
        'Diary compliance below 85 percent at a site; more than 2 important protocol deviations per 10 participants; data entry later than 5 working days after a visit for more than 20 percent of visits; open queries older than 30 days above 15 percent. A threshold breach triggers a targeted visit or a site retraining call within 10 working days.'),
      p('4. Escalation',
        'Findings are escalated from the clinical research associate to the lead monitor, then to the sponsor study manager. Serious non-compliance is escalated to sponsor quality assurance and may lead to a for-cause audit.'),
    ] },
  { key: 'dmp', code: 'LMN201-CDI02-DMP-v1.0.pdf', name: 'LMN-201-CDI02 data management plan v1.0', type: 'OTHER', cls: 'INTERNAL',
    filing: ['module-5', 'clinical', null], stage: 'draft', version: '1.0 draft',
    subtitle: 'Data management plan for RePreve (synthetic)',
    sections: [
      p('1. Systems',
        'Case report form data are captured in a validated electronic data capture system hosted by the CRO. Participant stool diaries are collected on a provisioned electronic diary device and transferred nightly. Central laboratory and toxin assay results are received as monthly transfers in a pre-agreed format.'),
      p('2. Data cleaning',
        'Edit checks are specified in the data validation plan and tested in user acceptance testing before first participant in. Manual review listings are run fortnightly. Medical coding uses MedDRA for adverse events and medical history and WHODrug for concomitant medications, with the dictionary version fixed at database build and upgraded only by a documented change.'),
      p('3. Database lock',
        'Database lock follows completion of all queries, reconciliation of serious adverse events between the safety database and the clinical database, external data reconciliation, and sign-off of the blinded data review meeting minutes. Unblinding occurs only after lock is confirmed in writing.'),
    ] },
  { key: 'coa', code: 'LMN201-DP-2405-COA.pdf', name: 'Certificate of analysis, LMN-201 enteric capsules, lot LMN201-DP-2405', type: 'MODULE_3', cls: 'CONFIDENTIAL',
    filing: ['module-3', 'batch_record', '3.2.P.5.4'], stage: 'approved', version: '1.0',
    subtitle: `Release testing of a clinical drug product lot, tested by ${LAB}`,
    sections: [
      p('1. Lot information (illustrative)',
        'Product: LMN-201 enteric capsules (illustrative). Lot: LMN201-DP-2405. Drug substance lots: LMN201-DS-2403 and LMN201-DS-2404. Use: clinical supply for RePreve. Storage: 2 to 8 degrees C, protected from moisture.'),
      p('2. Results',
        'Appearance: opaque white size 0 capsules, conforms. Identity by LC-MS peptide map: conforms to reference for the lysin and all three VHH proteins. Potency (toxin B neutralisation): 104 percent of reference standard (specification 60 to 140 percent). Enteric protection: no release after 2 h in 0.1 N HCl, conforms. Dissolution at pH 6.8: 91 percent at 45 min (specification not less than 80 percent).',
        'Water content by Karl Fischer: 5.1 percent w/w (specification not more than 8.0 percent). Microbial enumeration: TAMC 40 CFU/g, TYMC less than 10 CFU/g, E. coli absent. Uniformity of dosage units: acceptance value 6.2 (specification not more than 15.0).'),
      p('3. Disposition',
        'All results comply with the clinical release specification. The lot was released for clinical use by the sponsor quality unit (a fictional quality person). The full batch record and laboratory raw data are held by the contract manufacturer and laboratory.'),
    ] },
  { key: 'stability', code: 'LMN201-DP-STAB-SUMMARY-12M.pdf', name: 'Stability summary, LMN-201 enteric capsules, 12-month update', type: 'MODULE_3', cls: 'CONFIDENTIAL',
    filing: ['module-3', 'cmc', '3.2.P.8.1'], stage: 'reviewed', version: '12-month update',
    subtitle: 'Long-term and accelerated stability of lot LMN201-DP-2405 (illustrative values)',
    sections: [
      p('1. Studies',
        'Lot LMN201-DP-2405 is on long-term storage at 25 degrees C / 60 percent RH (24 months planned, 12 months completed) and accelerated storage at 40 degrees C / 75 percent RH (6 months, completed). Tests: appearance, potency, water content and enteric protection. These are the same illustrative studies recorded in the project CMC register.'),
      p('2. Results to date',
        'Long-term potency: 104 percent at release, 101 percent at 3 months, 98 at 6, 97 at 9 and 95 at 12 months. Water content: 5.1 percent at release, 5.6 at 6 months and 6.0 at 12 months. Accelerated potency: 104 percent at release, 93 at 3 months and 86 at 6 months. All results are within specification; enteric protection conformed at every time point.'),
      p('3. Evaluation and proposed shelf life',
        'Potency declines by about 0.75 percentage points per month under long-term conditions; the lower 95 percent confidence bound of the regression stays above 60 percent beyond 36 months. Under ICH Q1E principles a shelf life of 18 months at 25 degrees C is proposed for clinical supply, to be extended as long-term data accrue. The accelerated decline shows that excursions above 30 degrees C must be avoided.'),
    ] },
  { key: 'msa', code: 'LMN201-CRO-MSA-SUMMARY.pdf', name: 'CRO master services agreement summary (fictional CRO)', type: 'OTHER', cls: 'CONFIDENTIAL',
    filing: null, stage: 'draft', version: 'Summary for the study team',
    subtitle: `Key terms of the master services agreement with ${CRO}`,
    sections: [
      p('1. Parties and scope',
        `The master services agreement between ${SPONSOR} and ${CRO} covers clinical operations, monitoring, data management, biostatistics and pharmacovigilance case processing for LMN-201 studies. Each study is contracted under its own work order; RePreve is work order 3.`),
      p('2. Key terms (illustrative)',
        'Term: five years with annual renewal. Payment: milestone-based for fixed deliverables and monthly unit-based for monitoring visits, with a budget change process for scope changes above 5 percent. Quality: the CRO maintains a quality management system, permits sponsor audits on 30 days notice and notifies the sponsor of regulatory inspections within 2 working days.',
        'Transferred obligations: the CRO accepts the transfer of monitoring and data management obligations under 21 CFR 312.52 as listed in the transfer of obligations annex. The sponsor retains overall responsibility for the trial.'),
      p('3. Confidentiality and data',
        'All study data and documents are sponsor property. The CRO returns or destroys confidential information at the end of the agreement, except where retention is required by law. Personal data are processed under a data processing addendum.'),
    ] },
  { key: 'mvr', code: 'LMN201-CDI02-MVR-SITE104-IMV3.pdf', name: 'Interim monitoring visit report, RePreve site 104, visit 3', type: 'REPORT', cls: 'CONFIDENTIAL',
    filing: ['module-5', 'report', null], stage: 'in_review', version: '1.0',
    subtitle: 'Report of an on-site interim monitoring visit (fictional site and staff)',
    sections: [
      p('1. Visit summary',
        'Site 104 (a fictional community gastroenterology practice) has enrolled 9 participants, 6 of whom have completed treatment. The monitor reviewed consent for all 9 participants, eligibility for the 3 participants enrolled since the last visit, and primary endpoint data for all participants who have reached week 4.'),
      p('2. Findings',
        'Consent: all participants consented on the current approved version before any study procedure. Eligibility: one participant was randomized 81 hours after diagnosis; this was within the 96-hour window of protocol version 2.0 but outside the 72-hour window of version 1.0, under which the site was still operating. Recorded as an important protocol deviation; the site has since been activated on version 2.0.',
        'Diary compliance at the site is 88 percent. Investigational product accountability reconciled with no discrepancy. Two queries older than 30 days were resolved during the visit.'),
      p('3. Actions',
        'The site will file the version 2.0 activation letter in the investigator site file within 5 working days. The monitor will confirm at the next visit that re-consent for the day-15 stool sample is complete for the two participants still on treatment.'),
    ] },
  { key: 'tox', code: 'LMN201-TOX-13WK-RAT.pdf', name: '13-week oral repeat-dose toxicity study of LMN-201 in rats (GLP), report summary', type: 'MODULE_4', cls: 'CONFIDENTIAL',
    filing: ['module-4', 'nonclinical', '4.2.3.2'], stage: 'approved', version: 'Final report summary',
    subtitle: `Summary of a GLP study conducted at ${TOX}`,
    sections: [
      p('1. Design',
        'Sprague-Dawley rats (15 per sex per group) received LMN-201 biomass by oral gavage once daily for 13 weeks at 0, 500, 1000 and 2000 mg/kg/day, with a 4-week recovery phase for 5 per sex in the control and high-dose groups. The vehicle control received placebo spirulina biomass to control for the biomass matrix.'),
      p('2. Results (synthetic)',
        'There were no test-article related deaths, clinical signs, or effects on body weight, food consumption, ophthalmology, haematology, clinical chemistry, urinalysis, organ weights, or macroscopic or microscopic pathology. No LMN-201 protein was detected in plasma at any dose (lower limit of quantitation 5 ng/mL). Anti-drug antibodies were not detected.'),
      p('3. Conclusion',
        'The no-observed-adverse-effect level is 2000 mg/kg/day, the highest dose tested. The study supports clinical dosing of up to 14 days with a large margin, as the clinical dose is about 15 mg/kg/day of biomass.'),
      p('4. GLP compliance and quality assurance',
        'The study was conducted under the GLP regulations of 21 CFR Part 58 at a fictional test facility. The test facility quality assurance unit inspected the protocol, the dose formulation analysis, in-life phase, necropsy and the draft report, and found no deviation that affected the integrity of the study. Dose formulations were within 92 to 104 percent of nominal concentration and homogeneous.'),
    ] },
];

const LMN801 = [
  { key: 'synopsis', code: 'LMN801-P2-SYNOPSIS-D0.3.pdf', name: 'LMN-801 Phase 2 protocol synopsis, draft 0.3', type: 'PROTOCOL', cls: 'CONFIDENTIAL',
    filing: ['module-5', 'protocol', '5.3.5.1'], stage: 'draft', version: 'Draft 0.3',
    subtitle: 'A randomized, double-blind, placebo-controlled dose-ranging study of oral LMN-801 in adults with obesity or overweight',
    sections: [
      p('Objectives and endpoints (draft)',
        'Primary objective: to evaluate the effect of three doses of oral LMN-801 on body weight over 24 weeks compared with placebo. Candidate co-primary endpoint under discussion: change in lean mass by dual-energy X-ray absorptiometry, to show that weight loss preserves lean tissue.',
        'Secondary endpoints: proportion of participants losing at least 5 percent of body weight, change in waist circumference, change in fasting glucose and HbA1c, and safety and tolerability, in particular gastrointestinal events.'),
      p('Design (draft)',
        'About 240 adults with a body mass index of 30 or more, or 27 or more with a weight-related comorbidity, are randomized 1:1:1:1 to LMN-801 low, middle or high dose, or placebo, taken by mouth once daily with a reduced-calorie diet and physical activity counselling. Treatment lasts 24 weeks with 4 weeks of follow-up.'),
      p('Open questions for the study team',
        'Whether to stratify by type 2 diabetes status; whether the lean mass endpoint should be primary or key secondary; and the size of the dose escalation steps given that the oral hormone protein acts locally in the gut. These are to be raised at the pre-IND meeting.'),
    ] },
  { key: 'pd', code: 'LMN801-PD-DIO-MOUSE.pdf', name: 'LMN-801 primary pharmacodynamics: body composition in diet-induced obese mice', type: 'MODULE_4', cls: 'CONFIDENTIAL',
    filing: ['module-4', 'nonclinical', '4.2.1.1'], stage: 'approved', version: 'Final report',
    subtitle: 'Nonclinical study report (synthetic results)',
    sections: [
      p('Design',
        'Male diet-induced obese C57BL/6 mice (12 per group) received oral LMN-801 biomass at three dose levels, placebo biomass, or a subcutaneous GLP-1 receptor agonist as a positive control for 28 days. Body weight and food intake were measured daily and body composition by quantitative magnetic resonance on days 0 and 28.'),
      p('Results (synthetic)',
        'LMN-801 reduced body weight dose-dependently by 4, 9 and 13 percent relative to placebo at day 28. At the high dose, 86 percent of the weight lost was fat mass, compared with 72 percent for the positive control. Food intake fell by 11 percent at the high dose during the first week and returned toward baseline by day 21.',
        'No adverse clinical signs were seen. These results are synthetic and were written for a software demonstration.'),
      p('Conclusion',
        'Oral LMN-801 produced dose-dependent weight loss with relative preservation of lean mass in this model, supporting the proposed Phase 2 dose range.'),
    ] },
  { key: 'coa', code: 'LMN801-DS-2502-COA.pdf', name: 'Certificate of analysis, LMN-801 drug substance, lot LMN801-DS-2502', type: 'MODULE_3', cls: 'CONFIDENTIAL',
    filing: ['module-3', 'batch_record', '3.2.S.4.4'], stage: 'in_review', version: '1.0',
    subtitle: `Drug substance release testing by ${LAB} (illustrative values)`,
    sections: [
      p('Lot information',
        'Material: LMN-801 drug substance, spray-dried spirulina biomass expressing the hormone protein (illustrative). Lot: LMN801-DS-2502. Intended use: nonclinical toxicology and clinical supply.'),
      p('Results',
        'Identity by LC-MS peptide map: conforms. Content of the hormone protein by ELISA: 3.4 percent w/w (specification 2.5 to 4.5 percent). Bioactivity in a receptor reporter cell assay: 97 percent of reference (specification 70 to 130 percent). Water content: 4.8 percent w/w (not more than 8.0 percent). Microbial enumeration: TAMC 60 CFU/g, TYMC less than 10 CFU/g, specified organisms absent.',
        'Heavy metals and microcystin (spirulina-specific contaminant): below the limits of the illustrative specification.'),
      p('Disposition',
        'Pending quality review. Results comply with the illustrative specification.'),
    ] },
  { key: 'preind', code: 'LMN801-PREIND-REQUEST-DRAFT.pdf', name: 'LMN-801 pre-IND meeting request, draft questions', type: 'CORRESPONDENCE', cls: 'CONFIDENTIAL',
    filing: ['corresp', 'resp', null], stage: 'reviewed', version: 'Draft 2',
    subtitle: 'Draft meeting request and questions for a Type B pre-IND meeting (not submitted)',
    sections: [
      p('Purpose',
        'The sponsor requests a Type B pre-IND meeting to obtain agreement on the nonclinical program, the CMC approach for an orally delivered hormone protein expressed in spirulina, and the design of a Phase 2 dose-ranging study. This draft has not been submitted to any agency.'),
      p('Draft questions',
        'Question 1: Does the Agency agree that, given negligible systemic exposure after oral dosing, a 13-week oral toxicity study in rats and a 4-week study in a non-rodent species are sufficient to support a 24-week Phase 2 study? Question 2: Does the Agency agree with the proposed potency assay and its use for release and stability?',
        'Question 3: Does the Agency agree that change in body weight at week 24 is an acceptable primary endpoint for a Phase 2 study, with lean mass by DXA as a key secondary endpoint?'),
    ] },
];

const LMN301 = [
  { key: 'ib', code: 'LMN301-IB-ED2.pdf', name: "LMN-301 Investigator's Brochure, edition 2", type: 'IB', cls: 'CONFIDENTIAL',
    filing: ['module-1', 'clinical', '1.14.4.1'], stage: 'approved', version: 'Edition 2',
    subtitle: 'Investigator brochure for an intranasal biologic for the prevention of viral respiratory infection',
    sections: [
      p('Product',
        'LMN-301 is an intranasally administered biologic expressed in spirulina, intended to bind respiratory viruses in the nasal mucosa before infection is established. It is delivered as a dry powder by a single-use nasal device. Phase 1 dosing in the public listing (NCT06030414) is 50 mg (25 mg per nostril).'),
      p('Nonclinical summary (synthetic)',
        'In a hamster challenge model, LMN-301 given 4 hours before intranasal virus challenge reduced nasal viral load by 2.1 log10 on day 2. A GLP nasal local tolerance study in rabbits showed minimal, reversible epithelial changes at the highest dose. No systemic exposure was detected.'),
      p('Clinical experience (synthetic)',
        'Edition 2 adds the Part A single-dose sentinel cohort of the Phase 1 study: 8 healthy volunteers received a single 50 mg dose. Adverse events were mild: nasal discomfort (3), sneezing (2) and headache (1), all resolving within 24 hours. No serious adverse event occurred.'),
    ] },
  { key: 'p1', code: 'LMN301-COV01-INTERIM-SAFETY.pdf', name: 'LMN-301-COV01 Phase 1 interim safety summary, Parts A and B', type: 'REPORT', cls: 'CONFIDENTIAL',
    filing: ['module-5', 'report', '5.3.3.1'], stage: 'in_review', version: 'Interim 1',
    subtitle: 'Interim safety and tolerability summary for single and multiple intranasal doses (synthetic)',
    sections: [
      p('Participants',
        'At the interim cut-off 35 healthy volunteers aged 18 to 65 had been dosed at a single fictional site: 8 in Part A (single dose) and 27 in Part B (multiple doses every 3 days, every other day, or daily for 12 days). All Part A participants and 21 of 27 Part B participants had completed follow-up.'),
      p('Safety (synthetic)',
        'No serious adverse event and no discontinuation for an adverse event occurred. The most common treatment-emergent adverse events were nasal discomfort (14 participants, 40 percent), rhinorrhoea (6, 17 percent) and headache (4, 11 percent), all mild. Nasal endoscopy showed mild erythema in 3 Part B daily-dosing participants, resolved at follow-up. No clinically relevant changes in laboratory values or vital signs were seen.'),
      p('Interpretation',
        'Single and multiple intranasal doses of 50 mg were well tolerated. The safety review committee recommended proceeding to the planned Phase 2 challenge study design discussion.'),
    ] },
  { key: 'tox', code: 'LMN301-TOX-NASAL-RABBIT.pdf', name: 'LMN-301 nasal local tolerance study in rabbits (GLP), report summary', type: 'MODULE_4', cls: 'CONFIDENTIAL',
    filing: ['module-4', 'nonclinical', '4.2.3.6'], stage: 'approved', version: 'Final report summary',
    subtitle: `Summary of a GLP study conducted at ${TOX}`,
    sections: [
      p('Design',
        'New Zealand White rabbits (5 per sex per group) received LMN-301 dry powder or placebo powder intranasally three times daily for 14 days at up to 4 times the clinical dose per nostril, with a 14-day recovery group. Nasal cavity, nasopharynx and lungs were examined microscopically.'),
      p('Results (synthetic)',
        'Minimal epithelial hyperplasia of the anterior nasal septum was seen at the highest dose in 3 of 10 animals and was fully reversed after recovery. There were no systemic findings and no detectable plasma exposure. The placebo powder produced a similar minimal finding in 1 of 10 animals.'),
      p('Conclusion',
        'LMN-301 is locally well tolerated in the nasal cavity at up to 4 times the clinical dose. The findings are considered non-adverse.'),
      p('GLP compliance and quality assurance',
        'The study was conducted under the GLP regulations of 21 CFR Part 58 at a fictional test facility. The quality assurance unit inspected the protocol, dosing, necropsy and the draft report. Delivered dose per actuation was verified gravimetrically on each dosing day and was within 90 to 108 percent of target. No deviation affected the integrity of the study.'),
    ] },
  { key: 'stability', code: 'LMN301-DP-STAB-SUMMARY.pdf', name: 'LMN-301 intranasal powder drug product stability summary', type: 'MODULE_3', cls: 'INTERNAL',
    filing: ['module-3', 'cmc', '3.2.P.8.1'], stage: 'draft', version: 'Draft 0.2',
    subtitle: 'Stability of the intranasal dry powder in its single-use device (illustrative values)',
    sections: [
      p('Studies',
        'Two clinical lots (LMN301-DP-2301 and LMN301-DP-2302, illustrative) are on long-term storage at 25 degrees C / 60 percent RH and accelerated storage at 40 degrees C / 75 percent RH. Tests: binding activity, delivered dose uniformity, particle size distribution, water content and device function.'),
      p('Results to date (illustrative)',
        'At 9 months long-term, binding activity is 96 and 98 percent of initial, delivered dose uniformity meets the acceptance criteria and median particle size is unchanged at 48 micrometres. At 6 months accelerated, binding activity is 88 and 90 percent of initial; water uptake increased from 3.9 to 5.2 percent.'),
      p('Next steps',
        'The 12-month pull is scheduled. A shelf life of 12 months at 25 degrees C is the working proposal; the draft will be completed once the 12-month data are reviewed.'),
    ] },
];

const LMN401 = [
  { key: 'pd', code: 'LMN401-PD-NEUTRALISATION.pdf', name: 'LMN-401 in vitro toxin neutralisation, primary pharmacodynamics report', type: 'MODULE_4', cls: 'CONFIDENTIAL',
    filing: ['module-4', 'nonclinical', '4.2.1.1'], stage: 'approved', version: 'Final report',
    subtitle: 'Nonclinical primary pharmacodynamics of an oral antibody cocktail (synthetic results)',
    sections: [
      p('Design',
        "The LMN-401 antibody cocktail was tested for neutralisation of enterotoxins and adhesins of the pathogens most often associated with travelers' diarrhea in the illustrative target product profile: enterotoxigenic E. coli heat-labile and heat-stable toxins and colonisation factors, and Campylobacter jejuni adhesion, in cell-based assays."),
      p('Results (synthetic)',
        'The cocktail neutralised heat-labile toxin with an IC50 of 0.8 nM and inhibited heat-stable toxin induced cGMP production by 92 percent at 10 nM. Adhesion of four ETEC colonisation factor types to intestinal epithelial cells was reduced by 70 to 95 percent. Activity was retained after 2 hours at pH 3 when protected in the biomass matrix.'),
      p('Conclusion',
        'The results support continued development toward the planned field proof-of-concept study. They are synthetic values written for a software demonstration.'),
    ] },
  { key: 'td02', code: 'LMN401-TD02-INTERIM-SUMMARY.pdf', name: 'TD02 etiology study, interim enrolment and pathogen summary (fictional)', type: 'REPORT', cls: 'INTERNAL',
    filing: ['module-5', 'report', null], stage: 'reviewed', version: 'Interim 2',
    subtitle: "Observational study of the etiology of travelers' diarrhea (public listing NCT06363890); interim values are synthetic",
    sections: [
      p('Enrolment (synthetic)',
        'The public listing plans 1200 adult tourists traveling for 14 to 28 days. At this fictional interim, 610 travelers had enrolled and 584 had returned their travel diary and samples. 171 (29 percent) reported at least one episode of diarrhea during travel.'),
      p('Pathogens detected (synthetic)',
        'Of 152 episodes with a stool sample, a pathogen was detected by multiplex PCR in 118 (78 percent). Enterotoxigenic E. coli was the most common (41 percent of positive samples), followed by Campylobacter (22 percent), enteroaggregative E. coli (18 percent) and norovirus (9 percent). Mixed infections occurred in 24 percent.'),
      p('Relevance to LMN-401',
        'The interim distribution supports the choice of ETEC and Campylobacter targets in the antibody cocktail and informs the sample size of the planned field proof-of-concept study.'),
    ] },
  { key: 'briefing', code: 'LMN401-PREIND-BRIEFING-OUTLINE.pdf', name: 'LMN-401 pre-IND briefing package outline', type: 'CORRESPONDENCE', cls: 'CONFIDENTIAL',
    filing: ['corresp', 'resp', null], stage: 'draft', version: 'Outline 0.1',
    subtitle: 'Working outline of the briefing package for a planned pre-IND meeting',
    sections: [
      p('Planned content',
        'Product description and mechanism; summary of CMC for the spirulina-expressed antibody cocktail; nonclinical pharmacology including the in vitro neutralisation report; the ileostomy pharmacokinetic study (public listing NCT06556940) design; and the proposed field proof-of-concept study in travelers.'),
      p('Proposed questions (working)',
        'Whether a prophylaxis indication may be studied first in a field setting without a controlled human infection model; whether the nonclinical package of an orally delivered, non-absorbed biologic can be limited to one species; and what evidence of gut delivery is needed before a field study.'),
      p('Owners and timing',
        'Each section has an owner in the study team. The outline will be expanded into a full briefing package once the ileostomy PK study reports.'),
    ] },
];

export const VAULT_DOCUMENTS = { 'LMN-201': LMN201, 'LMN-801': LMN801, 'LMN-301': LMN301, 'LMN-401': LMN401 };

/**
 * The governed artifacts of each project: memos a person wrote in the project
 * (POST /api/concept2cure/projects/:id/artifacts). `stage`: 'approved' is
 * moved to review and approved by a second person with an e-signature,
 * 'review' is moved to review, 'draft' is left as created.
 */
const LMN201_ARTIFACTS = [
  { name: 'Endpoint justification: sustained clinical cure at week 12 (synthetic)', type: 'endpoint_justification', documentClass: 'endpoint_justification', ctdSection: '2.5', stage: 'approved',
    content: 'SYNTHETIC / NOT ACTUAL DATA.\n\nSustained clinical cure at week 12 combines resolution of the initial episode with absence of recurrence, which is the outcome that matters to patients after C. difficile infection. Recurrence after a first episode occurs in roughly one in five patients and most recurrences happen within eight weeks of stopping antibiotics, so a twelve-week window captures the clinically relevant period. The endpoint was accepted in the fictional pre-IND minutes, provided recurrence is toxin-confirmed and adjudicated blind.' },
  { name: 'Evidence memo: delivery of LMN-201 proteins to the terminal ileum, CDI01 (synthetic)', type: 'evidence_memo', documentClass: 'evidence_memo', ctdSection: '2.7', stage: 'review',
    content: 'SYNTHETIC / NOT ACTUAL DATA.\n\nIn the ileostomy delivery study (public listing NCT04893239; synthetic results), intact LMN-201 proteins were recovered in ileostomy fluid between 2 and 7 hours after dosing in 8 of 9 participants. This supports the enteric capsule as a means of delivering the cocktail to the distal gut, where C. difficile toxin acts. Limitations: small sample, a population with altered gut transit, and no measurement in the colon.' },
  { name: 'Risk-benefit summary for the RePreve Phase 2/3 design (synthetic)', type: 'risk_benefit', documentClass: 'risk_benefit', ctdSection: '2.5', stage: 'draft',
    content: 'SYNTHETIC / NOT ACTUAL DATA.\n\nExpected benefit: fewer recurrences of C. difficile infection when LMN-201 is added to standard-of-care antibiotics. Identified risks: mild gastrointestinal effects. Potential risks: hypersensitivity to spirulina-derived material, mitigated by exclusion of known allergy. The double-blind placebo-controlled design, blinded adjudication and an independent data monitoring committee keep the risk to participants proportionate to the expected benefit.' },
];

export const VAULT_ARTIFACTS = {
  'LMN-201': LMN201_ARTIFACTS,
  'LMN-801': [
    { name: 'Evidence memo: lean-mass preservation in the DIO mouse study (synthetic)', type: 'evidence_memo', documentClass: 'evidence_memo', ctdSection: '2.4', stage: 'review',
      content: 'SYNTHETIC / NOT ACTUAL DATA.\n\nIn the diet-induced obese mouse study (synthetic results), the high dose of oral LMN-801 reduced body weight by 13 percent relative to placebo, and 86 percent of the weight lost was fat mass, compared with 72 percent for the injected positive control. This supports carrying lean mass by DXA into the Phase 2 study as a key endpoint. Limitations: one species, male animals only, 28 days.' },
  ],
  'LMN-301': [
    { name: 'Safety evidence brief: Phase 1 nasal tolerability, COV01 (synthetic)', type: 'safety_evidence_brief', documentClass: 'safety_evidence_brief', ctdSection: '2.5', stage: 'approved',
      content: 'SYNTHETIC / NOT ACTUAL DATA.\n\nAcross 35 healthy volunteers dosed intranasally (synthetic interim), no serious adverse event or discontinuation for an adverse event occurred. Nasal discomfort was the most common event (40 percent), all mild. Mild erythema at endoscopy in three daily-dosing participants resolved at follow-up. The rabbit local tolerance study (synthetic) showed minimal, reversible changes at four times the clinical dose. Together these support the next study.' },
  ],
  'LMN-401': [
    { name: 'Strategy memo: pre-IND questions for an oral antibody cocktail (synthetic)', type: 'strategy_memo', documentClass: 'strategy_memo', ctdSection: '2.4', stage: 'draft',
      content: 'SYNTHETIC / NOT ACTUAL DATA.\n\nThe pre-IND meeting should settle three points before the field proof-of-concept study: whether a prophylaxis indication may be studied first in travelers without a controlled human infection model; whether a non-absorbed oral biologic needs nonclinical toxicology in more than one species; and what evidence of delivery to the gut, from the ileostomy PK study, is enough before dosing travelers.' },
  ],
};
