/**
 * AnA Feature API Routes
 *
 * Endpoints for the four core Concept2Cure intelligence features:
 * 1. Regulatory Intelligence Feed
 * 2. Submission Gap Analysis
 * 3. Document Change Impact
 * 4. AnA Memory (per-project persistence)
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REGULATORY INTELLIGENCE FEED
// ═══════════════════════════════════════════════════════════════════════════════

interface FeedItem {
  id: string;
  type: 'guidance' | 'alert' | 'approval' | 'warning_letter';
  title: string;
  summary: string;
  agency: string;
  date: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low';
  therapeuticArea: string;
  url: string;
  tags: string[];
}

const FEED_ITEMS: FeedItem[] = [
  {
    id: 'fi-001', type: 'guidance', title: 'FDA Releases Updated Guidance on AI/ML-Based Software as Medical Device (SaMD)',
    summary: 'The FDA has published final guidance on the predetermined change control plan for ML-enabled devices, establishing a framework for modifications that do not require new 510(k) submissions.',
    agency: 'FDA', date: '2026-03-15', impactLevel: 'critical', therapeuticArea: 'Medical Devices',
    url: '#', tags: ['AI/ML', 'SaMD', '510(k)', 'PCCP']
  },
  {
    id: 'fi-002', type: 'alert', title: 'EMA Mandates Electronic Submission of PSUR via EVCTM by Q3 2026',
    summary: 'Starting September 2026, all PSURs must be submitted electronically through the EudraVigilance Clinical Trial Module. Paper submissions will no longer be accepted.',
    agency: 'EMA', date: '2026-03-14', impactLevel: 'high', therapeuticArea: 'Pharmacovigilance',
    url: '#', tags: ['PSUR', 'EudraVigilance', 'Electronic Submission']
  },
  {
    id: 'fi-003', type: 'approval', title: 'FDA Approves First Gene Therapy for Sickle Cell Disease (Priority Review)',
    summary: 'Vertex Pharmaceuticals receives BLA approval for exa-cel (CASGEVY) for treatment of sickle cell disease in patients 12+ years, using CRISPR/Cas9 gene-editing technology.',
    agency: 'FDA', date: '2026-03-13', impactLevel: 'high', therapeuticArea: 'Gene Therapy',
    url: '#', tags: ['BLA', 'Priority Review', 'CRISPR', 'Gene Therapy']
  },
  {
    id: 'fi-004', type: 'warning_letter', title: 'FDA Issues Warning Letter to Contract Manufacturer for GMP Violations',
    summary: 'Warning letter issued for failure to adequately investigate out-of-specification results, inadequate cleaning validation, and lack of environmental monitoring in sterile manufacturing.',
    agency: 'FDA', date: '2026-03-12', impactLevel: 'medium', therapeuticArea: 'Manufacturing',
    url: '#', tags: ['GMP', 'Warning Letter', 'Sterile Manufacturing']
  },
  {
    id: 'fi-005', type: 'guidance', title: 'ICH E6(R3) Implementation Timeline Finalized — GCP Modernization',
    summary: 'ICH has finalized the step-by-step implementation timeline for E6(R3), introducing risk-proportionate approaches to clinical trial quality management. Full compliance required by December 2027.',
    agency: 'ICH', date: '2026-03-11', impactLevel: 'critical', therapeuticArea: 'Clinical Trials',
    url: '#', tags: ['ICH', 'GCP', 'E6(R3)', 'Quality Management']
  },
  {
    id: 'fi-006', type: 'guidance', title: 'FDA Draft Guidance: Clinical Pharmacology Considerations for ADCs',
    summary: 'New draft guidance addressing PK/PD characterization, immunogenicity assessment, and dose optimization strategies specific to antibody-drug conjugates.',
    agency: 'FDA', date: '2026-03-10', impactLevel: 'medium', therapeuticArea: 'Oncology',
    url: '#', tags: ['ADC', 'Clinical Pharmacology', 'PK/PD', 'Draft Guidance']
  },
  {
    id: 'fi-007', type: 'alert', title: 'PMDA Updates Electronic CTD Specifications for Japan NDA Submissions',
    summary: 'Japan PMDA has released updated eCTD v4.0 technical specifications effective January 2027, including new requirements for Japanese-specific Module 1 documents.',
    agency: 'PMDA', date: '2026-03-09', impactLevel: 'high', therapeuticArea: 'Regulatory Operations',
    url: '#', tags: ['eCTD', 'Japan', 'NDA', 'PMDA']
  },
  {
    id: 'fi-008', type: 'approval', title: 'EMA Grants Conditional Marketing Authorization for Novel mRNA Vaccine',
    summary: 'Conditional MAA approval granted for a next-generation mRNA vaccine platform targeting multiple respiratory pathogens, using a novel lipid nanoparticle delivery system.',
    agency: 'EMA', date: '2026-03-08', impactLevel: 'medium', therapeuticArea: 'Vaccines',
    url: '#', tags: ['MAA', 'mRNA', 'Conditional Approval', 'Vaccines']
  },
  {
    id: 'fi-009', type: 'guidance', title: 'FDA Final Rule: Diversity Action Plans for Clinical Studies',
    summary: 'The FDA has finalized requirements for sponsors to submit diversity action plans for Phase 3 and pivotal trials, with specific enrollment targets based on disease epidemiology.',
    agency: 'FDA', date: '2026-03-07', impactLevel: 'high', therapeuticArea: 'Clinical Trials',
    url: '#', tags: ['Diversity', 'Clinical Trials', 'Phase 3', 'Enrollment']
  },
  {
    id: 'fi-010', type: 'warning_letter', title: 'EMA Publishes Inspection Findings on Data Integrity at CRO',
    summary: 'Major findings include systematic data manipulation in bioequivalence studies, inadequate audit trails, and failure to report protocol deviations in pharmacokinetic analyses.',
    agency: 'EMA', date: '2026-03-06', impactLevel: 'critical', therapeuticArea: 'Data Integrity',
    url: '#', tags: ['CRO', 'Data Integrity', 'Bioequivalence', 'Inspection']
  },
  {
    id: 'fi-011', type: 'guidance', title: 'FDA Guidance: Decentralized Clinical Trials — Remote Monitoring Considerations',
    summary: 'Comprehensive guidance on implementing DCTs including remote consent, wearable data collection, direct-to-patient drug shipment, and telemedicine visit requirements.',
    agency: 'FDA', date: '2026-03-05', impactLevel: 'medium', therapeuticArea: 'Clinical Trials',
    url: '#', tags: ['DCT', 'Remote Monitoring', 'Telemedicine', 'Wearables']
  },
  {
    id: 'fi-012', type: 'alert', title: 'Health Canada Adopts ICH M4 (R4) for CTD Organization',
    summary: 'Health Canada announces adoption of the revised ICH M4 guideline for CTD module organization, with a 24-month transition period for existing submissions.',
    agency: 'Health Canada', date: '2026-03-04', impactLevel: 'medium', therapeuticArea: 'Regulatory Operations',
    url: '#', tags: ['CTD', 'ICH M4', 'Health Canada']
  },
  {
    id: 'fi-013', type: 'guidance', title: 'FDA Revised Guidance on Postmarketing Safety Reporting for Combination Products',
    summary: 'Updated reporting requirements for combination products clarifying which constituent part adverse events should be reported to CDER vs. CDRH, with new timelines.',
    agency: 'FDA', date: '2026-03-03', impactLevel: 'high', therapeuticArea: 'Pharmacovigilance',
    url: '#', tags: ['Combination Products', 'Safety Reporting', 'CDER', 'CDRH']
  },
  {
    id: 'fi-014', type: 'approval', title: 'FDA Grants De Novo Classification for AI-Powered Diagnostic Device',
    summary: 'First-of-kind AI diagnostic tool for early detection of pancreatic cancer from routine blood work receives De Novo classification with special controls.',
    agency: 'FDA', date: '2026-03-02', impactLevel: 'medium', therapeuticArea: 'Diagnostics',
    url: '#', tags: ['De Novo', 'AI Diagnostics', 'Special Controls']
  },
  {
    id: 'fi-015', type: 'guidance', title: 'EMA Reflection Paper on Use of Real-World Evidence in Regulatory Decision-Making',
    summary: 'EMA outlines acceptable methodologies for incorporating RWE into benefit-risk assessments, including pragmatic trial designs, registry studies, and electronic health record analyses.',
    agency: 'EMA', date: '2026-03-01', impactLevel: 'high', therapeuticArea: 'Real-World Evidence',
    url: '#', tags: ['RWE', 'Registries', 'EHR', 'Benefit-Risk']
  },
  {
    id: 'fi-016', type: 'alert', title: 'PDUFA Date: BLA Review for Bispecific Antibody in NSCLC — April 15, 2026',
    summary: 'FDA target action date for the BLA review of a novel bispecific T-cell engager targeting PD-L1 and CTLA-4 for first-line treatment of non-small cell lung cancer.',
    agency: 'FDA', date: '2026-02-28', impactLevel: 'medium', therapeuticArea: 'Oncology',
    url: '#', tags: ['PDUFA', 'BLA', 'Bispecific', 'NSCLC']
  },
  {
    id: 'fi-017', type: 'guidance', title: 'FDA Guidance on CMC Postapproval Manufacturing Changes for Biological Products',
    summary: 'Clarifies reporting categories for manufacturing changes to biological products, including when prior approval supplements vs. annual reports are required.',
    agency: 'FDA', date: '2026-02-25', impactLevel: 'high', therapeuticArea: 'CMC',
    url: '#', tags: ['CMC', 'Biologics', 'Manufacturing Changes', 'PAS']
  },
  {
    id: 'fi-018', type: 'warning_letter', title: 'FDA 483 Observations at Major API Manufacturer in India',
    summary: 'Significant observations include cross-contamination risks between penicillin and non-penicillin manufacturing areas, incomplete batch records, and inadequate CAPA implementation.',
    agency: 'FDA', date: '2026-02-22', impactLevel: 'high', therapeuticArea: 'Manufacturing',
    url: '#', tags: ['483', 'API', 'Cross-Contamination', 'CAPA']
  },
  {
    id: 'fi-019', type: 'guidance', title: 'ICH Q14 Finalized: Analytical Procedure Development and Revision',
    summary: 'Final ICH Q14 guideline establishes a harmonized framework for analytical procedure lifecycle management, including enhanced approaches using analytical QbD principles.',
    agency: 'ICH', date: '2026-02-20', impactLevel: 'medium', therapeuticArea: 'CMC',
    url: '#', tags: ['ICH Q14', 'Analytical', 'QbD', 'Lifecycle']
  },
  {
    id: 'fi-020', type: 'approval', title: 'TGA Approves Biosimilar Adalimumab with Interchangeability Designation',
    summary: 'Australia TGA grants interchangeability designation for biosimilar adalimumab, first such designation under new Australian biosimilar guidelines.',
    agency: 'TGA', date: '2026-02-18', impactLevel: 'low', therapeuticArea: 'Biosimilars',
    url: '#', tags: ['Biosimilar', 'Interchangeability', 'TGA']
  },
];

router.get('/intelligence-feed', (req: Request, res: Response) => {
  const { therapeuticArea, agencies, limit = '20', offset = '0' } = req.query;

  let items = [...FEED_ITEMS];

  if (therapeuticArea && typeof therapeuticArea === 'string') {
    items = items.filter(i => i.therapeuticArea.toLowerCase().includes(therapeuticArea.toLowerCase()));
  }
  if (agencies && typeof agencies === 'string') {
    const agencyList = agencies.split(',').map(a => a.trim().toLowerCase());
    items = items.filter(i => agencyList.includes(i.agency.toLowerCase()));
  }

  const total = items.length;
  const sliced = items.slice(Number(offset), Number(offset) + Number(limit));

  res.json({ items: sliced, total, offset: Number(offset), limit: Number(limit) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SUBMISSION GAP ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

interface GapItem {
  section: string;
  module: string;
  requirement: string;
  status: 'complete' | 'partial' | 'missing';
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffortDays: number;
  description: string;
}

const ECTD_REQUIREMENTS: Record<string, GapItem[]> = {
  IND: [
    { section: 'm1.1.1', module: 'Module 1', requirement: 'Form FDA 1571', status: 'missing', priority: 'critical', estimatedEffortDays: 1, description: 'IND application form with sponsor information, investigator details, and submission contents' },
    { section: 'm1.1.2', module: 'Module 1', requirement: 'Form FDA 1572', status: 'missing', priority: 'critical', estimatedEffortDays: 1, description: 'Statement of Investigator form for each clinical investigator' },
    { section: 'm1.2', module: 'Module 1', requirement: 'Cover Letter', status: 'missing', priority: 'high', estimatedEffortDays: 1, description: 'Cover letter describing the IND submission and its contents' },
    { section: 'm1.3.1', module: 'Module 1', requirement: 'US Agent Authorization', status: 'missing', priority: 'medium', estimatedEffortDays: 1, description: 'Authorization letter for US agent (foreign sponsors)' },
    { section: 'm2.2', module: 'Module 2', requirement: 'Introduction to Quality Overall Summary', status: 'missing', priority: 'high', estimatedEffortDays: 3, description: 'Overview of drug substance and drug product quality' },
    { section: 'm2.3', module: 'Module 2', requirement: 'Quality Overall Summary', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Comprehensive summary of CMC data for drug substance and drug product' },
    { section: 'm2.4', module: 'Module 2', requirement: 'Nonclinical Overview', status: 'missing', priority: 'critical', estimatedEffortDays: 7, description: 'Integrated overview of pharmacology, pharmacokinetics, and toxicology studies' },
    { section: 'm2.5', module: 'Module 2', requirement: 'Clinical Overview', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Critical assessment of clinical data supporting the proposed investigation' },
    { section: 'm2.6', module: 'Module 2', requirement: 'Nonclinical Written Summaries', status: 'missing', priority: 'high', estimatedEffortDays: 14, description: 'Detailed summaries of pharmacology, PK, and toxicology studies' },
    { section: 'm2.7', module: 'Module 2', requirement: 'Clinical Summary', status: 'missing', priority: 'high', estimatedEffortDays: 14, description: 'Detailed summary of clinical pharmacology, efficacy, and safety' },
    { section: 'm3.2.S', module: 'Module 3', requirement: 'Drug Substance', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'Complete CMC characterization of the active pharmaceutical ingredient' },
    { section: 'm3.2.P', module: 'Module 3', requirement: 'Drug Product', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'Formulation, manufacturing process, specifications, and stability of the drug product' },
    { section: 'm3.2.A', module: 'Module 3', requirement: 'Appendices (Facilities & Equipment)', status: 'missing', priority: 'medium', estimatedEffortDays: 5, description: 'Manufacturing facilities, equipment, and adventitious agents safety' },
    { section: 'm4.2.1', module: 'Module 4', requirement: 'Pharmacology Studies', status: 'missing', priority: 'high', estimatedEffortDays: 5, description: 'Primary and secondary pharmacodynamic studies, safety pharmacology' },
    { section: 'm4.2.2', module: 'Module 4', requirement: 'Pharmacokinetics Studies', status: 'missing', priority: 'high', estimatedEffortDays: 5, description: 'ADME studies, PK modeling, and species comparison data' },
    { section: 'm4.2.3', module: 'Module 4', requirement: 'Toxicology Studies', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Acute, repeat-dose, genotoxicity, and reproductive toxicology studies' },
    { section: 'm5.3.1', module: 'Module 5', requirement: 'Clinical Pharmacology Reports', status: 'missing', priority: 'high', estimatedEffortDays: 7, description: 'BA/BE, PK, PD, and drug interaction study reports' },
    { section: 'm5.3.3', module: 'Module 5', requirement: 'Clinical Efficacy Reports', status: 'missing', priority: 'medium', estimatedEffortDays: 3, description: 'Reports of controlled and uncontrolled clinical studies' },
    { section: 'm5.3.5', module: 'Module 5', requirement: 'Clinical Study Reports', status: 'missing', priority: 'high', estimatedEffortDays: 15, description: 'Full clinical study reports per ICH E3 format' },
    { section: 'm5.3.6', module: 'Module 5', requirement: 'Investigator Brochure', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Complete IB with preclinical and clinical safety/efficacy data' },
  ],
  '510K': [
    { section: 'cover', module: 'Administrative', requirement: 'Cover Letter', status: 'missing', priority: 'high', estimatedEffortDays: 1, description: 'Cover letter identifying the submission and device' },
    { section: 'eSTAR', module: 'Administrative', requirement: 'eSTAR Submission Form', status: 'missing', priority: 'critical', estimatedEffortDays: 2, description: 'Electronic Submission Template and Resource for 510(k)' },
    { section: 'indications', module: 'Device Description', requirement: 'Indications for Use', status: 'missing', priority: 'critical', estimatedEffortDays: 1, description: 'FDA Form 3881 — Indications for Use Statement' },
    { section: 'predicate', module: 'Substantial Equivalence', requirement: 'Predicate Device Comparison', status: 'missing', priority: 'critical', estimatedEffortDays: 5, description: 'Detailed comparison table with predicate device(s)' },
    { section: 'desc', module: 'Device Description', requirement: 'Device Description', status: 'missing', priority: 'critical', estimatedEffortDays: 5, description: 'Comprehensive device description including principles of operation' },
    { section: 'perf', module: 'Performance Testing', requirement: 'Performance Testing — Bench', status: 'missing', priority: 'high', estimatedEffortDays: 15, description: 'Bench testing per applicable standards (IEC, ISO)' },
    { section: 'biocompat', module: 'Biocompatibility', requirement: 'Biocompatibility Testing', status: 'missing', priority: 'high', estimatedEffortDays: 10, description: 'Biocompatibility evaluation per ISO 10993' },
    { section: 'software', module: 'Software', requirement: 'Software Documentation', status: 'missing', priority: 'high', estimatedEffortDays: 10, description: 'Software level of concern, hazard analysis, V&V' },
    { section: 'steril', module: 'Sterilization', requirement: 'Sterilization Validation', status: 'missing', priority: 'medium', estimatedEffortDays: 5, description: 'Sterilization method validation and shelf life' },
    { section: 'emcemc', module: 'Electrical Safety', requirement: 'EMC/Electrical Safety', status: 'missing', priority: 'medium', estimatedEffortDays: 5, description: 'IEC 60601-1 and EMC testing per IEC 60601-1-2' },
    { section: 'labeling', module: 'Labeling', requirement: 'Proposed Labeling', status: 'missing', priority: 'critical', estimatedEffortDays: 3, description: 'Device labeling, instructions for use, and package insert' },
    { section: 'clinical', module: 'Clinical', requirement: 'Clinical Data', status: 'missing', priority: 'medium', estimatedEffortDays: 10, description: 'Clinical study data or literature review supporting safety/effectiveness' },
  ],
  NDA: [
    { section: 'm1.2', module: 'Module 1', requirement: 'Cover Letter', status: 'missing', priority: 'high', estimatedEffortDays: 1, description: 'NDA cover letter with submission summary' },
    { section: 'm1.3', module: 'Module 1', requirement: 'Administrative Information', status: 'missing', priority: 'high', estimatedEffortDays: 3, description: 'Application form, field copy certification, debarment certification' },
    { section: 'm1.14', module: 'Module 1', requirement: 'Labeling', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Proposed prescribing information, medication guide, patient labeling' },
    { section: 'm2.2', module: 'Module 2', requirement: 'Quality Overall Summary', status: 'missing', priority: 'critical', estimatedEffortDays: 15, description: 'Comprehensive CMC quality overview' },
    { section: 'm2.5', module: 'Module 2', requirement: 'Clinical Overview', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'Integrated overview of all clinical data supporting approval' },
    { section: 'm2.7.1', module: 'Module 2', requirement: 'Summary of Biopharmaceutic Studies', status: 'missing', priority: 'high', estimatedEffortDays: 7, description: 'Summary of BA/BE and dissolution data' },
    { section: 'm2.7.2', module: 'Module 2', requirement: 'Summary of Clinical Pharmacology', status: 'missing', priority: 'high', estimatedEffortDays: 10, description: 'PK, PD, exposure-response analysis summaries' },
    { section: 'm2.7.3', module: 'Module 2', requirement: 'Summary of Clinical Efficacy', status: 'missing', priority: 'critical', estimatedEffortDays: 15, description: 'Integrated summary of efficacy from all controlled trials' },
    { section: 'm2.7.4', module: 'Module 2', requirement: 'Summary of Clinical Safety', status: 'missing', priority: 'critical', estimatedEffortDays: 15, description: 'Integrated summary of safety including all AE data' },
    { section: 'm3.2.S', module: 'Module 3', requirement: 'Drug Substance (Full)', status: 'missing', priority: 'critical', estimatedEffortDays: 25, description: 'Complete drug substance CMC package with commercial process' },
    { section: 'm3.2.P', module: 'Module 3', requirement: 'Drug Product (Full)', status: 'missing', priority: 'critical', estimatedEffortDays: 25, description: 'Complete drug product CMC with commercial manufacturing' },
    { section: 'm5.3.5', module: 'Module 5', requirement: 'Clinical Study Reports (All Pivotal)', status: 'missing', priority: 'critical', estimatedEffortDays: 30, description: 'Full CSRs for all pivotal efficacy and safety trials' },
  ],
  BLA: [
    { section: 'm1.2', module: 'Module 1', requirement: 'Cover Letter', status: 'missing', priority: 'high', estimatedEffortDays: 1, description: 'BLA cover letter' },
    { section: 'm2.3', module: 'Module 2', requirement: 'Quality Overall Summary', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'Biologics-specific CMC quality overview' },
    { section: 'm2.5', module: 'Module 2', requirement: 'Clinical Overview', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'Integrated clinical overview for biologics' },
    { section: 'm3.2.S', module: 'Module 3', requirement: 'Drug Substance (Biologics)', status: 'missing', priority: 'critical', estimatedEffortDays: 30, description: 'Biological substance characterization, cell line, fermentation' },
    { section: 'm3.2.P', module: 'Module 3', requirement: 'Drug Product (Biologics)', status: 'missing', priority: 'critical', estimatedEffortDays: 25, description: 'Biologics formulation, fill/finish, stability' },
    { section: 'm3.2.A.2', module: 'Module 3', requirement: 'Adventitious Agents Safety', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Viral safety, TSE risk assessment, mycoplasma testing' },
    { section: 'm4.2.3', module: 'Module 4', requirement: 'Toxicology (Biologics)', status: 'missing', priority: 'high', estimatedEffortDays: 10, description: 'Species-relevant toxicology studies for biologics' },
    { section: 'm5.3.5', module: 'Module 5', requirement: 'Clinical Study Reports', status: 'missing', priority: 'critical', estimatedEffortDays: 30, description: 'Full CSRs for pivotal trials including immunogenicity' },
  ],
  MAA: [
    { section: 'm1.0', module: 'Module 1', requirement: 'EU Application Form', status: 'missing', priority: 'critical', estimatedEffortDays: 3, description: 'EU-specific Module 1 application form' },
    { section: 'm1.3', module: 'Module 1', requirement: 'Product Information (SmPC, PIL, Label)', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Summary of Product Characteristics, Package Leaflet, and Labeling' },
    { section: 'm1.5', module: 'Module 1', requirement: 'Risk Management Plan', status: 'missing', priority: 'critical', estimatedEffortDays: 15, description: 'EU RMP per GVP Module V requirements' },
    { section: 'm1.8', module: 'Module 1', requirement: 'Pediatric Investigation Plan', status: 'missing', priority: 'high', estimatedEffortDays: 5, description: 'PIP or waiver documentation' },
    { section: 'm2.3', module: 'Module 2', requirement: 'Quality Overall Summary', status: 'missing', priority: 'critical', estimatedEffortDays: 15, description: 'EU CTD quality summary' },
    { section: 'm2.5', module: 'Module 2', requirement: 'Clinical Overview', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'EU clinical overview with benefit-risk assessment' },
    { section: 'm3.2.S', module: 'Module 3', requirement: 'Drug Substance', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'Drug substance quality data' },
    { section: 'm3.2.P', module: 'Module 3', requirement: 'Drug Product', status: 'missing', priority: 'critical', estimatedEffortDays: 20, description: 'Drug product quality data' },
    { section: 'm5.3.5', module: 'Module 5', requirement: 'Clinical Study Reports', status: 'missing', priority: 'critical', estimatedEffortDays: 25, description: 'Pivotal CSRs' },
  ],
  PMA: [
    { section: 'cover', module: 'Administrative', requirement: 'Cover Letter', status: 'missing', priority: 'high', estimatedEffortDays: 1, description: 'PMA cover letter' },
    { section: 'summary', module: 'Summary', requirement: 'Summary of Safety and Effectiveness', status: 'missing', priority: 'critical', estimatedEffortDays: 15, description: 'SSED summarizing all safety and effectiveness data' },
    { section: 'desc', module: 'Device Description', requirement: 'Device Description', status: 'missing', priority: 'critical', estimatedEffortDays: 7, description: 'Complete device description with engineering drawings' },
    { section: 'nonclinical', module: 'Nonclinical', requirement: 'Nonclinical Laboratory Studies', status: 'missing', priority: 'high', estimatedEffortDays: 15, description: 'Bench, animal, and biocompatibility testing' },
    { section: 'clinical', module: 'Clinical', requirement: 'Clinical Investigation', status: 'missing', priority: 'critical', estimatedEffortDays: 25, description: 'Full IDE clinical study data and analysis' },
    { section: 'manufacturing', module: 'Manufacturing', requirement: 'Manufacturing Information', status: 'missing', priority: 'critical', estimatedEffortDays: 10, description: 'Manufacturing processes, quality system, and facility information' },
    { section: 'labeling', module: 'Labeling', requirement: 'Proposed Labeling', status: 'missing', priority: 'critical', estimatedEffortDays: 5, description: 'Complete proposed labeling and IFU' },
  ],
};

router.post('/gap-analysis', (req: Request, res: Response) => {
  const { submissionType, uploadedDocuments = [] } = req.body;

  if (!submissionType || !ECTD_REQUIREMENTS[submissionType]) {
    return res.status(400).json({ error: `Invalid submissionType. Supported: ${Object.keys(ECTD_REQUIREMENTS).join(', ')}` });
  }

  const requirements = ECTD_REQUIREMENTS[submissionType].map(req => {
    const isUploaded = (uploadedDocuments as string[]).some(
      doc => doc.toLowerCase().includes(req.requirement.toLowerCase().split('(')[0].trim().toLowerCase().substring(0, 10))
    );
    return { ...req, status: isUploaded ? 'complete' as const : req.status };
  });

  const completed = requirements.filter(r => r.status === 'complete').length;
  const partial = requirements.filter(r => r.status === 'partial').length;
  const missing = requirements.filter(r => r.status === 'missing').length;
  const overallReadiness = Math.round((completed / requirements.length) * 100);

  const criticalGaps = requirements.filter(r => r.status === 'missing' && r.priority === 'critical');
  const totalEffortDays = requirements.filter(r => r.status !== 'complete').reduce((sum, r) => sum + r.estimatedEffortDays, 0);

  const recommendations = [
    criticalGaps.length > 0
      ? `Prioritize ${criticalGaps.length} critical gaps: ${criticalGaps.slice(0, 3).map(g => g.requirement).join(', ')}`
      : 'All critical sections are addressed.',
    `Estimated ${totalEffortDays} total work days remaining across ${missing + partial} incomplete sections.`,
    `Consider parallel workstreams for Module 2 summaries and Module 3 CMC data to accelerate timeline.`,
    overallReadiness < 50
      ? 'Current readiness is below 50%. Focus on completing critical-priority sections before addressing medium/low items.'
      : 'Good progress. Focus on closing remaining high-priority gaps to reach submission readiness.',
    'Schedule internal review milestones every 2 weeks to track completion velocity.',
  ];

  res.json({
    overallReadiness,
    totalRequired: requirements.length,
    completed,
    partial,
    missing,
    gaps: requirements.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }),
    recommendations,
    estimatedWeeksToCompletion: Math.ceil(totalEffortDays / 5),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DOCUMENT CHANGE IMPACT
// ═══════════════════════════════════════════════════════════════════════════════

interface ChangeImpactResult {
  guidanceTitle: string;
  changeDate: string;
  affectedSections: Array<{
    section: string;
    module: string;
    currentStatus: string;
    impactLevel: 'critical' | 'high' | 'medium' | 'low';
    requiredAction: string;
    estimatedReworkDays: number;
  }>;
  totalImpactDays: number;
  riskLevel: string;
  recommendations: string[];
}

const CHANGE_SCENARIOS: Record<string, ChangeImpactResult> = {
  'fda-ai-samd-2026': {
    guidanceTitle: 'FDA Updated Guidance on AI/ML-Based SaMD',
    changeDate: '2026-03-15',
    affectedSections: [
      { section: 'Software Documentation', module: 'Software', currentStatus: 'In Progress', impactLevel: 'critical', requiredAction: 'Add predetermined change control plan (PCCP) for ML algorithm updates', estimatedReworkDays: 15 },
      { section: 'Performance Testing', module: 'Performance', currentStatus: 'Complete', impactLevel: 'high', requiredAction: 'Include algorithm performance monitoring plan and retraining triggers', estimatedReworkDays: 10 },
      { section: 'Labeling', module: 'Labeling', currentStatus: 'Draft', impactLevel: 'high', requiredAction: 'Update labeling to include ML model version, training data description, and performance metrics', estimatedReworkDays: 5 },
      { section: 'Risk Analysis', module: 'Risk Management', currentStatus: 'Complete', impactLevel: 'medium', requiredAction: 'Add algorithm bias risk assessment and data drift mitigation controls', estimatedReworkDays: 7 },
      { section: 'Clinical Validation', module: 'Clinical', currentStatus: 'In Progress', impactLevel: 'medium', requiredAction: 'Ensure clinical validation includes demographic subgroup performance analysis', estimatedReworkDays: 8 },
    ],
    totalImpactDays: 45,
    riskLevel: 'High',
    recommendations: [
      'Engage with FDA through Pre-Submission meeting to discuss PCCP scope before finalizing documentation.',
      'Prioritize the predetermined change control plan — this is the most significant new requirement.',
      'Allocate 2-3 weeks for the algorithm monitoring plan, as this requires input from both engineering and clinical teams.',
      'Review training data demographic representation against the new diversity requirements.',
      'Consider requesting a De Novo if PCCP significantly changes the regulatory classification strategy.',
    ],
  },
  'ich-e6r3-2026': {
    guidanceTitle: 'ICH E6(R3) GCP Modernization',
    changeDate: '2026-03-11',
    affectedSections: [
      { section: 'Clinical Study Protocol', module: 'Module 5', currentStatus: 'Final', impactLevel: 'critical', requiredAction: 'Incorporate risk-proportionate quality management framework per E6(R3) Annex 1', estimatedReworkDays: 12 },
      { section: 'Quality Management Plan', module: 'Module 5', currentStatus: 'Not Started', impactLevel: 'critical', requiredAction: 'Develop standalone quality management plan with critical-to-quality factors', estimatedReworkDays: 10 },
      { section: 'Monitoring Plan', module: 'Module 5', currentStatus: 'Draft', impactLevel: 'high', requiredAction: 'Revise to risk-based monitoring approach with centralized monitoring strategy', estimatedReworkDays: 8 },
      { section: 'Data Management Plan', module: 'Module 5', currentStatus: 'Complete', impactLevel: 'high', requiredAction: 'Add data governance framework and technology platform validation sections', estimatedReworkDays: 6 },
      { section: 'Informed Consent', module: 'Module 5', currentStatus: 'Template', impactLevel: 'medium', requiredAction: 'Update consent templates to address electronic consent and remote participation', estimatedReworkDays: 3 },
      { section: 'Investigator Site Selection', module: 'Module 5', currentStatus: 'In Progress', impactLevel: 'medium', requiredAction: 'Include site capability assessment for technology-enabled trial conduct', estimatedReworkDays: 4 },
    ],
    totalImpactDays: 43,
    riskLevel: 'High',
    recommendations: [
      'The quality management plan is mandatory under E6(R3) — begin development immediately as it impacts all other clinical documents.',
      'Identify Critical-to-Quality (CtQ) factors early; they drive the entire risk-based approach.',
      'Train clinical operations team on E6(R3) principles before protocol revision to ensure consistent implementation.',
      'Consider engaging a GCP consultant with E6(R3) expertise for the quality management framework.',
      'Timeline extension of 6-8 weeks recommended to properly incorporate these changes without rushing.',
    ],
  },
  'fda-diversity-2026': {
    guidanceTitle: 'FDA Final Rule on Diversity Action Plans',
    changeDate: '2026-03-07',
    affectedSections: [
      { section: 'Diversity Action Plan', module: 'Module 1', currentStatus: 'Not Started', impactLevel: 'critical', requiredAction: 'Develop and submit diversity action plan with enrollment targets based on disease epidemiology', estimatedReworkDays: 10 },
      { section: 'Clinical Protocol', module: 'Module 5', currentStatus: 'Draft', impactLevel: 'high', requiredAction: 'Add demographic enrollment goals, community engagement plan, and site diversity criteria', estimatedReworkDays: 5 },
      { section: 'Statistical Analysis Plan', module: 'Module 5', currentStatus: 'Draft', impactLevel: 'medium', requiredAction: 'Include pre-specified subgroup analyses for demographic populations', estimatedReworkDays: 4 },
      { section: 'Site Selection Strategy', module: 'Operations', currentStatus: 'In Progress', impactLevel: 'high', requiredAction: 'Expand site selection to include community health centers and underserved areas', estimatedReworkDays: 6 },
    ],
    totalImpactDays: 25,
    riskLevel: 'Medium',
    recommendations: [
      'Submit Diversity Action Plan concurrent with IND — delays can trigger FDA requests and slow review.',
      'Engage patient advocacy organizations early to inform recruitment strategy.',
      'Map disease prevalence by demographic group to set evidence-based enrollment targets.',
      'Consider decentralized trial elements to improve access for underrepresented populations.',
    ],
  },
};

router.post('/change-impact', (req: Request, res: Response) => {
  const { guidanceId, submissionType } = req.body;

  if (!guidanceId) {
    return res.status(400).json({ error: 'guidanceId is required' });
  }

  const scenario = CHANGE_SCENARIOS[guidanceId];
  if (!scenario) {
    // Return a generic low-impact result for unknown guidance
    return res.json({
      guidanceTitle: 'Unknown Guidance Document',
      changeDate: new Date().toISOString().split('T')[0],
      affectedSections: [],
      totalImpactDays: 0,
      riskLevel: 'Low',
      recommendations: ['No specific impact analysis available for this guidance document. Please check back later.'],
    });
  }

  res.json(scenario);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ANA MEMORY (Per-Project Persistence)
// ═══════════════════════════════════════════════════════════════════════════════

interface Memory {
  id: string;
  type: 'preference' | 'fact' | 'decision' | 'context';
  content: string;
  createdAt: string;
}

interface ProjectMemory {
  projectId: string;
  memories: Memory[];
  projectContext: {
    therapeuticArea: string;
    submissionType: string;
    targetAgency: string;
    drugProduct: string;
  };
}

// In-memory store (would be PostgreSQL in production)
const memoryStore: Record<string, ProjectMemory> = {
  'default-project': {
    projectId: 'default-project',
    memories: [
      { id: 'mem-001', type: 'context', content: 'Target indication is moderate-to-severe plaque psoriasis in adults who are candidates for systemic therapy.', createdAt: '2026-03-10T14:30:00Z' },
      { id: 'mem-002', type: 'preference', content: 'User prefers concise executive summaries over detailed technical write-ups for Module 2 documents.', createdAt: '2026-03-09T10:15:00Z' },
      { id: 'mem-003', type: 'decision', content: 'Team decided to pursue Fast IND pathway based on unmet medical need and orphan drug designation eligibility.', createdAt: '2026-03-08T16:45:00Z' },
      { id: 'mem-004', type: 'fact', content: 'Drug substance is a fully humanized IgG4 monoclonal antibody targeting IL-23p19 with half-life of approximately 25 days.', createdAt: '2026-03-07T09:20:00Z' },
      { id: 'mem-005', type: 'preference', content: 'CMC documentation should follow QbD approach with design space defined for critical process parameters.', createdAt: '2026-03-06T11:30:00Z' },
      { id: 'mem-006', type: 'fact', content: 'Phase 1 study (Protocol C2C-001) enrolled 48 healthy volunteers. No dose-limiting toxicities observed.', createdAt: '2026-03-05T14:00:00Z' },
      { id: 'mem-007', type: 'decision', content: 'Stability studies will use ICH Q1A(R2) conditions: 25°C/60%RH and 40°C/75%RH accelerated.', createdAt: '2026-03-04T08:45:00Z' },
      { id: 'mem-008', type: 'context', content: 'Primary comparator for Phase 3 is adalimumab. Non-inferiority design with PASI 90 as primary endpoint.', createdAt: '2026-03-03T13:10:00Z' },
    ],
    projectContext: {
      therapeuticArea: 'Dermatology — Plaque Psoriasis',
      submissionType: 'IND (Investigational New Drug)',
      targetAgency: 'FDA (CDER)',
      drugProduct: 'C2C-1042 (Anti-IL-23p19 mAb)',
    },
  },
};

router.get('/memory/:projectId', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const project = memoryStore[projectId];

  if (!project) {
    return res.json({
      projectId,
      memories: [],
      projectContext: {
        therapeuticArea: '',
        submissionType: '',
        targetAgency: '',
        drugProduct: '',
      },
    });
  }

  res.json(project);
});

router.post('/memory/:projectId', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { type, content } = req.body;

  if (!type || !content) {
    return res.status(400).json({ error: 'type and content are required' });
  }

  if (!memoryStore[projectId]) {
    memoryStore[projectId] = {
      projectId,
      memories: [],
      projectContext: { therapeuticArea: '', submissionType: '', targetAgency: '', drugProduct: '' },
    };
  }

  const newMemory: Memory = {
    id: `mem-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type,
    content,
    createdAt: new Date().toISOString(),
  };

  memoryStore[projectId].memories.unshift(newMemory);
  res.status(201).json(newMemory);
});

router.delete('/memory/:projectId/:memoryId', (req: Request, res: Response) => {
  const { projectId, memoryId } = req.params;
  const project = memoryStore[projectId];

  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const idx = project.memories.findIndex(m => m.id === memoryId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Memory not found' });
  }

  project.memories.splice(idx, 1);
  res.json({ success: true });
});

router.patch('/memory/:projectId/context', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const updates = req.body;

  if (!memoryStore[projectId]) {
    memoryStore[projectId] = {
      projectId,
      memories: [],
      projectContext: { therapeuticArea: '', submissionType: '', targetAgency: '', drugProduct: '' },
    };
  }

  memoryStore[projectId].projectContext = {
    ...memoryStore[projectId].projectContext,
    ...updates,
  };

  res.json(memoryStore[projectId].projectContext);
});

export default router;
