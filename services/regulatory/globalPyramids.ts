/**
 * Concept2Cure - Global Regulatory Submission Pyramids
 * 
 * Extends the submission pyramid engine with international regulatory support:
 * - Health Canada (NOC, NOC/c, DIN)
 * - PMDA Japan (J-CTD, Shonin)
 * - TGA Australia
 * - Swissmedic
 * - ANVISA Brazil
 * - NMPA China
 * - EU CE Marking (MDR, IVDR)
 *
 * @module services/regulatory/globalPyramids
 * @version 2.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type GlobalSubmissionType =
  | 'HC_NOC'           // Health Canada Notice of Compliance
  | 'HC_NOC_C'         // Health Canada NOC with Conditions
  | 'HC_DIN'           // Drug Identification Number
  | 'PMDA_SHONIN'      // Japan Marketing Authorization
  | 'PMDA_CTN'         // Japan Clinical Trial Notification
  | 'TGA_AUST_R'       // TGA Australian Register of Therapeutic Goods
  | 'TGA_CTN'          // TGA Clinical Trial Notification
  | 'SWISSMEDIC'       // Swiss Marketing Authorization
  | 'ANVISA'           // Brazil ANVISA Registration
  | 'NMPA'             // China NMPA Registration
  | 'EU_CE_MDR'        // EU CE Marking under MDR 2017/745
  | 'EU_CE_IVDR';      // EU CE Marking under IVDR 2017/746

export interface GlobalPyramidLevel {
  id: string;
  name: string;
  order: number;
  color: string;
}

export interface GlobalPyramidTask {
  id: string;
  title: string;
  description: string;
  level: string;
  estimatedHours: number;
  assignedRole: string;
  dependencies: string[];
  deliverables: string[];
  status: 'pending' | 'in-progress' | 'done';
}

export interface GlobalPyramidConfig {
  type: GlobalSubmissionType;
  agency: string;
  region: string;
  format: 'eCTD' | 'CTD' | 'custom';
  levels: GlobalPyramidLevel[];
  tasks: GlobalPyramidTask[];
  totalEstimatedDays: number;
  localRequirements: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CANADA PYRAMIDS
// ─────────────────────────────────────────────────────────────────────────────

const HC_NOC_PYRAMID: GlobalPyramidConfig = {
  type: 'HC_NOC',
  agency: 'Health Canada',
  region: 'Canada',
  format: 'eCTD',
  totalEstimatedDays: 180,
  localRequirements: [
    'Regional Administrative Information (Module 1.2)',
    'Canadian-specific labeling (PM and PIL)',
    'DSUR for drugs with ongoing studies',
    'Establishment License Application (if manufacturing)',
  ],
  levels: [
    { id: 'l1', name: 'Planning', order: 1, color: '#6366F1' },
    { id: 'l2', name: 'Module 1 - Administrative', order: 2, color: '#8B5CF6' },
    { id: 'l3', name: 'Module 2 - Summaries', order: 3, color: '#A855F7' },
    { id: 'l4', name: 'Module 3 - Quality', order: 4, color: '#D946EF' },
    { id: 'l5', name: 'Module 4 - Nonclinical', order: 5, color: '#EC4899' },
    { id: 'l6', name: 'Module 5 - Clinical', order: 6, color: '#F43F5E' },
    { id: 'l7', name: 'Canadian-Specific', order: 7, color: '#EF4444' },
    { id: 'l8', name: 'Quality Review', order: 8, color: '#10B981' },
  ],
  tasks: [
    // Planning
    {
      id: 'hc-noc-1',
      title: 'Regulatory Strategy for HC Submission',
      description: 'Define submission pathway and identify Canadian-specific requirements',
      level: 'l1',
      estimatedHours: 8,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['HC Regulatory Strategy Memo'],
      status: 'pending',
    },
    {
      id: 'hc-noc-2',
      title: 'Pre-NDS/ANDS Meeting Request',
      description: 'Optional pre-submission meeting with Health Canada',
      level: 'l1',
      estimatedHours: 16,
      assignedRole: 'ra_lead',
      dependencies: ['hc-noc-1'],
      deliverables: ['Meeting Request Package', 'Questions for HC'],
      status: 'pending',
    },
    // Module 1 - Administrative
    {
      id: 'hc-noc-3',
      title: 'Prepare Module 1.2 Regional Information',
      description: 'Complete HC-specific forms including Drug Submission Application Form',
      level: 'l2',
      estimatedHours: 12,
      assignedRole: 'ra_associate',
      dependencies: ['hc-noc-1'],
      deliverables: ['HC Drug Submission Application Form', 'Fee Payment'],
      status: 'pending',
    },
    {
      id: 'hc-noc-4',
      title: 'Product Monograph (PM) Development',
      description: 'Prepare Canadian Product Monograph per HC format',
      level: 'l2',
      estimatedHours: 40,
      assignedRole: 'medical_writer',
      dependencies: ['hc-noc-1'],
      deliverables: ['Product Monograph (English)', 'Product Monograph (French)'],
      status: 'pending',
    },
    {
      id: 'hc-noc-5',
      title: 'Patient Information Leaflet (PIL)',
      description: 'Prepare consumer-friendly medication information',
      level: 'l2',
      estimatedHours: 16,
      assignedRole: 'medical_writer',
      dependencies: ['hc-noc-4'],
      deliverables: ['PIL (English)', 'PIL (French)'],
      status: 'pending',
    },
    // Module 2 - Summaries
    {
      id: 'hc-noc-6',
      title: 'Quality Overall Summary (QOS)',
      description: 'Module 2.3 summary of pharmaceutical quality',
      level: 'l3',
      estimatedHours: 24,
      assignedRole: 'cmc_lead',
      dependencies: ['hc-noc-1'],
      deliverables: ['Quality Overall Summary'],
      status: 'pending',
    },
    {
      id: 'hc-noc-7',
      title: 'Nonclinical Overview',
      description: 'Module 2.4 summary of nonclinical data',
      level: 'l3',
      estimatedHours: 24,
      assignedRole: 'toxicologist',
      dependencies: ['hc-noc-1'],
      deliverables: ['Nonclinical Overview'],
      status: 'pending',
    },
    {
      id: 'hc-noc-8',
      title: 'Clinical Overview',
      description: 'Module 2.5 clinical summary and benefit-risk',
      level: 'l3',
      estimatedHours: 40,
      assignedRole: 'medical_writer',
      dependencies: ['hc-noc-1'],
      deliverables: ['Clinical Overview'],
      status: 'pending',
    },
    {
      id: 'hc-noc-9',
      title: 'Clinical Summary',
      description: 'Module 2.7 detailed clinical summary',
      level: 'l3',
      estimatedHours: 60,
      assignedRole: 'medical_writer',
      dependencies: ['hc-noc-8'],
      deliverables: ['Clinical Summary'],
      status: 'pending',
    },
    // Module 3 - Quality
    {
      id: 'hc-noc-10',
      title: 'Drug Substance Documentation (3.2.S)',
      description: 'Complete drug substance characterization',
      level: 'l4',
      estimatedHours: 40,
      assignedRole: 'cmc_lead',
      dependencies: ['hc-noc-1'],
      deliverables: ['3.2.S Drug Substance'],
      status: 'pending',
    },
    {
      id: 'hc-noc-11',
      title: 'Drug Product Documentation (3.2.P)',
      description: 'Complete drug product characterization',
      level: 'l4',
      estimatedHours: 40,
      assignedRole: 'cmc_lead',
      dependencies: ['hc-noc-10'],
      deliverables: ['3.2.P Drug Product'],
      status: 'pending',
    },
    // Module 4 - Nonclinical
    {
      id: 'hc-noc-12',
      title: 'Nonclinical Study Reports',
      description: 'Compile pharmacology and toxicology study reports',
      level: 'l5',
      estimatedHours: 24,
      assignedRole: 'toxicologist',
      dependencies: ['hc-noc-7'],
      deliverables: ['Module 4 Nonclinical Reports'],
      status: 'pending',
    },
    // Module 5 - Clinical
    {
      id: 'hc-noc-13',
      title: 'Clinical Study Reports',
      description: 'Compile and format all clinical study reports',
      level: 'l6',
      estimatedHours: 40,
      assignedRole: 'clinical_lead',
      dependencies: ['hc-noc-9'],
      deliverables: ['Module 5 Clinical Reports'],
      status: 'pending',
    },
    // Canadian-Specific
    {
      id: 'hc-noc-14',
      title: 'DSUR Preparation (if applicable)',
      description: 'Development Safety Update Report for ongoing studies',
      level: 'l7',
      estimatedHours: 24,
      assignedRole: 'safety_officer',
      dependencies: ['hc-noc-13'],
      deliverables: ['DSUR'],
      status: 'pending',
    },
    {
      id: 'hc-noc-15',
      title: 'Risk Management Plan (RMP)',
      description: 'Canadian-specific risk management commitments',
      level: 'l7',
      estimatedHours: 32,
      assignedRole: 'safety_officer',
      dependencies: ['hc-noc-8'],
      deliverables: ['Risk Management Plan'],
      status: 'pending',
    },
    {
      id: 'hc-noc-16',
      title: 'C-PSUR Commitment',
      description: 'Canadian Periodic Safety Update Report schedule',
      level: 'l7',
      estimatedHours: 8,
      assignedRole: 'safety_officer',
      dependencies: ['hc-noc-15'],
      deliverables: ['PSUR Commitment Letter'],
      status: 'pending',
    },
    // Quality Review
    {
      id: 'hc-noc-17',
      title: 'QC Review of Submission',
      description: 'Quality control review of complete dossier',
      level: 'l8',
      estimatedHours: 24,
      assignedRole: 'qa_manager',
      dependencies: ['hc-noc-4', 'hc-noc-5', 'hc-noc-6', 'hc-noc-9', 'hc-noc-11', 'hc-noc-12', 'hc-noc-13'],
      deliverables: ['QC Review Report'],
      status: 'pending',
    },
    {
      id: 'hc-noc-18',
      title: 'eCTD Technical Validation',
      description: 'Validate eCTD structure and publish',
      level: 'l8',
      estimatedHours: 8,
      assignedRole: 'regulatory_ops',
      dependencies: ['hc-noc-17'],
      deliverables: ['Validated eCTD Package'],
      status: 'pending',
    },
    {
      id: 'hc-noc-19',
      title: 'Submit to Health Canada',
      description: 'Electronic submission via Common Electronic Submissions Gateway',
      level: 'l8',
      estimatedHours: 4,
      assignedRole: 'ra_lead',
      dependencies: ['hc-noc-18'],
      deliverables: ['Submission Confirmation'],
      status: 'pending',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// PMDA JAPAN PYRAMID
// ─────────────────────────────────────────────────────────────────────────────

const PMDA_SHONIN_PYRAMID: GlobalPyramidConfig = {
  type: 'PMDA_SHONIN',
  agency: 'PMDA (Pharmaceuticals and Medical Devices Agency)',
  region: 'Japan',
  format: 'eCTD',
  totalEstimatedDays: 270,
  localRequirements: [
    'Japanese translation of CTD Module 1',
    'J-CTD format compliance',
    'GCP compliance certificate (Japanese GCP)',
    'GPSP compliance for post-marketing',
    'Bridging study data (if required)',
    'Japanese labeling (添付文書)',
  ],
  levels: [
    { id: 'l1', name: 'Pre-Submission', order: 1, color: '#6366F1' },
    { id: 'l2', name: 'Module 1 - J-CTD Admin', order: 2, color: '#8B5CF6' },
    { id: 'l3', name: 'Module 2 - CTD Summaries', order: 3, color: '#A855F7' },
    { id: 'l4', name: 'Module 3 - Quality (CMC)', order: 4, color: '#D946EF' },
    { id: 'l5', name: 'Module 4 - Nonclinical', order: 5, color: '#EC4899' },
    { id: 'l6', name: 'Module 5 - Clinical', order: 6, color: '#F43F5E' },
    { id: 'l7', name: 'Japanese Requirements', order: 7, color: '#F97316' },
    { id: 'l8', name: 'Final Assembly', order: 8, color: '#10B981' },
  ],
  tasks: [
    // Pre-Submission
    {
      id: 'pmda-1',
      title: 'PMDA Pre-Application Consultation',
      description: 'Formal consultation meeting (事前面談) with PMDA',
      level: 'l1',
      estimatedHours: 40,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['Consultation Request', 'Briefing Document (Japanese)'],
      status: 'pending',
    },
    {
      id: 'pmda-2',
      title: 'Bridging Strategy Assessment',
      description: 'Evaluate need for Japanese bridging studies',
      level: 'l1',
      estimatedHours: 24,
      assignedRole: 'clinical_lead',
      dependencies: ['pmda-1'],
      deliverables: ['Bridging Strategy Document'],
      status: 'pending',
    },
    // Module 1 - Japanese Admin
    {
      id: 'pmda-3',
      title: 'Application Form (様式)',
      description: 'Complete Japanese application form',
      level: 'l2',
      estimatedHours: 16,
      assignedRole: 'ra_associate',
      dependencies: ['pmda-1'],
      deliverables: ['PMDA Application Form'],
      status: 'pending',
    },
    {
      id: 'pmda-4',
      title: 'Japanese Package Insert (添付文書)',
      description: 'Prepare Japanese labeling per PMDA format',
      level: 'l2',
      estimatedHours: 60,
      assignedRole: 'medical_writer',
      dependencies: ['pmda-1'],
      deliverables: ['添付文書 (Package Insert)'],
      status: 'pending',
    },
    {
      id: 'pmda-5',
      title: 'GCP Compliance Certificate',
      description: 'Certificate demonstrating J-GCP compliance',
      level: 'l2',
      estimatedHours: 16,
      assignedRole: 'qa_manager',
      dependencies: [],
      deliverables: ['GCP Compliance Certificate'],
      status: 'pending',
    },
    // Module 2
    {
      id: 'pmda-6',
      title: 'CTD Summaries (Module 2)',
      description: 'Quality, nonclinical, and clinical summaries',
      level: 'l3',
      estimatedHours: 80,
      assignedRole: 'medical_writer',
      dependencies: ['pmda-1'],
      deliverables: ['Module 2 Complete'],
      status: 'pending',
    },
    // Module 3
    {
      id: 'pmda-7',
      title: 'Quality Documentation',
      description: 'CMC data per ICH Q8-Q12 guidelines',
      level: 'l4',
      estimatedHours: 60,
      assignedRole: 'cmc_lead',
      dependencies: [],
      deliverables: ['Module 3 Quality'],
      status: 'pending',
    },
    // Module 4
    {
      id: 'pmda-8',
      title: 'Nonclinical Documentation',
      description: 'Pharmacology and toxicology studies',
      level: 'l5',
      estimatedHours: 40,
      assignedRole: 'toxicologist',
      dependencies: [],
      deliverables: ['Module 4 Nonclinical'],
      status: 'pending',
    },
    // Module 5
    {
      id: 'pmda-9',
      title: 'Clinical Study Reports',
      description: 'Clinical data including Japanese studies',
      level: 'l6',
      estimatedHours: 60,
      assignedRole: 'clinical_lead',
      dependencies: ['pmda-2'],
      deliverables: ['Module 5 Clinical'],
      status: 'pending',
    },
    // Japanese Requirements
    {
      id: 'pmda-10',
      title: 'Japanese Bridging Study Data',
      description: 'PK/PD bridging study in Japanese population',
      level: 'l7',
      estimatedHours: 40,
      assignedRole: 'clinical_lead',
      dependencies: ['pmda-2'],
      deliverables: ['Bridging Study CSR'],
      status: 'pending',
    },
    {
      id: 'pmda-11',
      title: 'Risk Management Plan (J-RMP)',
      description: 'Japanese-specific risk management plan',
      level: 'l7',
      estimatedHours: 40,
      assignedRole: 'safety_officer',
      dependencies: ['pmda-6'],
      deliverables: ['J-RMP'],
      status: 'pending',
    },
    {
      id: 'pmda-12',
      title: 'GPSP Compliance Plan',
      description: 'Post-marketing surveillance commitment',
      level: 'l7',
      estimatedHours: 24,
      assignedRole: 'safety_officer',
      dependencies: ['pmda-11'],
      deliverables: ['GPSP Plan'],
      status: 'pending',
    },
    // Final Assembly
    {
      id: 'pmda-13',
      title: 'J-CTD Assembly & Validation',
      description: 'Assemble and validate J-CTD eCTD package',
      level: 'l8',
      estimatedHours: 24,
      assignedRole: 'regulatory_ops',
      dependencies: ['pmda-4', 'pmda-6', 'pmda-7', 'pmda-8', 'pmda-9', 'pmda-10', 'pmda-11'],
      deliverables: ['Validated J-CTD Package'],
      status: 'pending',
    },
    {
      id: 'pmda-14',
      title: 'Submit to PMDA Gateway',
      description: 'Electronic submission to PMDA',
      level: 'l8',
      estimatedHours: 4,
      assignedRole: 'ra_lead',
      dependencies: ['pmda-13'],
      deliverables: ['Submission Receipt'],
      status: 'pending',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// EU MDR CE MARKING PYRAMID
// ─────────────────────────────────────────────────────────────────────────────

const EU_CE_MDR_PYRAMID: GlobalPyramidConfig = {
  type: 'EU_CE_MDR',
  agency: 'Notified Body (EU)',
  region: 'European Union',
  format: 'custom',
  totalEstimatedDays: 365,
  localRequirements: [
    'Technical Documentation per MDR Annex II/III',
    'Clinical Evaluation per MDR Article 61',
    'Post-Market Clinical Follow-up (PMCF)',
    'Unique Device Identification (UDI)',
    'EUDAMED Registration',
    'EU Authorized Representative',
    'Declaration of Conformity',
  ],
  levels: [
    { id: 'l1', name: 'Regulatory Planning', order: 1, color: '#6366F1' },
    { id: 'l2', name: 'Technical Documentation', order: 2, color: '#8B5CF6' },
    { id: 'l3', name: 'Clinical Evaluation', order: 3, color: '#A855F7' },
    { id: 'l4', name: 'Risk Management', order: 4, color: '#D946EF' },
    { id: 'l5', name: 'QMS Requirements', order: 5, color: '#EC4899' },
    { id: 'l6', name: 'Post-Market', order: 6, color: '#F43F5E' },
    { id: 'l7', name: 'Notified Body', order: 7, color: '#F97316' },
    { id: 'l8', name: 'Market Access', order: 8, color: '#10B981' },
  ],
  tasks: [
    // Regulatory Planning
    {
      id: 'mdr-1',
      title: 'Device Classification (MDR Rule)',
      description: 'Classify device per MDR Annex VIII rules',
      level: 'l1',
      estimatedHours: 8,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['Device Classification Rationale'],
      status: 'pending',
    },
    {
      id: 'mdr-2',
      title: 'Conformity Assessment Route',
      description: 'Determine applicable Annex (IX, X, XI)',
      level: 'l1',
      estimatedHours: 8,
      assignedRole: 'ra_lead',
      dependencies: ['mdr-1'],
      deliverables: ['Conformity Assessment Strategy'],
      status: 'pending',
    },
    {
      id: 'mdr-3',
      title: 'Notified Body Selection',
      description: 'Select and contract with Notified Body',
      level: 'l1',
      estimatedHours: 40,
      assignedRole: 'ra_lead',
      dependencies: ['mdr-2'],
      deliverables: ['NB Contract'],
      status: 'pending',
    },
    // Technical Documentation
    {
      id: 'mdr-4',
      title: 'Device Description & Specification',
      description: 'Complete device description per Annex II',
      level: 'l2',
      estimatedHours: 24,
      assignedRole: 'engineering',
      dependencies: ['mdr-1'],
      deliverables: ['Device Description Document'],
      status: 'pending',
    },
    {
      id: 'mdr-5',
      title: 'Design & Manufacturing Information',
      description: 'Design history and manufacturing process',
      level: 'l2',
      estimatedHours: 40,
      assignedRole: 'engineering',
      dependencies: ['mdr-4'],
      deliverables: ['Design Dossier', 'Manufacturing Documentation'],
      status: 'pending',
    },
    {
      id: 'mdr-6',
      title: 'GSPR Checklist (Annex I)',
      description: 'Map compliance to General Safety & Performance Requirements',
      level: 'l2',
      estimatedHours: 32,
      assignedRole: 'ra_associate',
      dependencies: ['mdr-4'],
      deliverables: ['GSPR Checklist'],
      status: 'pending',
    },
    {
      id: 'mdr-7',
      title: 'Verification & Validation',
      description: 'Complete V&V testing per standards',
      level: 'l2',
      estimatedHours: 80,
      assignedRole: 'engineering',
      dependencies: ['mdr-5'],
      deliverables: ['V&V Reports', 'Test Protocols'],
      status: 'pending',
    },
    {
      id: 'mdr-8',
      title: 'Labeling & IFU',
      description: 'Labeling per MDR Annex I Chapter III',
      level: 'l2',
      estimatedHours: 24,
      assignedRole: 'medical_writer',
      dependencies: ['mdr-4'],
      deliverables: ['Labels', 'Instructions for Use'],
      status: 'pending',
    },
    // Clinical Evaluation
    {
      id: 'mdr-9',
      title: 'Clinical Evaluation Plan (CEP)',
      description: 'Plan for clinical evaluation per Article 61',
      level: 'l3',
      estimatedHours: 24,
      assignedRole: 'clinical_lead',
      dependencies: ['mdr-4'],
      deliverables: ['Clinical Evaluation Plan'],
      status: 'pending',
    },
    {
      id: 'mdr-10',
      title: 'Literature Search & Appraisal',
      description: 'Systematic literature review',
      level: 'l3',
      estimatedHours: 40,
      assignedRole: 'medical_writer',
      dependencies: ['mdr-9'],
      deliverables: ['Literature Search Report', 'Appraisal Summaries'],
      status: 'pending',
    },
    {
      id: 'mdr-11',
      title: 'Clinical Evaluation Report (CER)',
      description: 'Complete CER per MEDDEV 2.7/1 rev 4',
      level: 'l3',
      estimatedHours: 80,
      assignedRole: 'clinical_lead',
      dependencies: ['mdr-10'],
      deliverables: ['Clinical Evaluation Report'],
      status: 'pending',
    },
    {
      id: 'mdr-12',
      title: 'Summary of Safety & Clinical Performance (SSCP)',
      description: 'Public SSCP for EUDAMED (Class III/implants)',
      level: 'l3',
      estimatedHours: 16,
      assignedRole: 'clinical_lead',
      dependencies: ['mdr-11'],
      deliverables: ['SSCP'],
      status: 'pending',
    },
    // Risk Management
    {
      id: 'mdr-13',
      title: 'Risk Management File (ISO 14971)',
      description: 'Complete risk analysis and management',
      level: 'l4',
      estimatedHours: 60,
      assignedRole: 'qa_manager',
      dependencies: ['mdr-4'],
      deliverables: ['Risk Management File'],
      status: 'pending',
    },
    {
      id: 'mdr-14',
      title: 'Usability Engineering (IEC 62366)',
      description: 'Human factors and usability file',
      level: 'l4',
      estimatedHours: 40,
      assignedRole: 'engineering',
      dependencies: ['mdr-8'],
      deliverables: ['Usability Engineering File'],
      status: 'pending',
    },
    // QMS Requirements
    {
      id: 'mdr-15',
      title: 'QMS ISO 13485 Certification',
      description: 'Ensure QMS certification is current',
      level: 'l5',
      estimatedHours: 16,
      assignedRole: 'qa_manager',
      dependencies: [],
      deliverables: ['ISO 13485 Certificate'],
      status: 'pending',
    },
    {
      id: 'mdr-16',
      title: 'Person Responsible for Regulatory Compliance (PRRC)',
      description: 'Designate and document PRRC qualifications',
      level: 'l5',
      estimatedHours: 8,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['PRRC Designation'],
      status: 'pending',
    },
    // Post-Market
    {
      id: 'mdr-17',
      title: 'Post-Market Surveillance Plan',
      description: 'PMS plan per Article 83-85',
      level: 'l6',
      estimatedHours: 24,
      assignedRole: 'qa_manager',
      dependencies: ['mdr-11'],
      deliverables: ['PMS Plan'],
      status: 'pending',
    },
    {
      id: 'mdr-18',
      title: 'PMCF Plan',
      description: 'Post-Market Clinical Follow-up plan',
      level: 'l6',
      estimatedHours: 24,
      assignedRole: 'clinical_lead',
      dependencies: ['mdr-11'],
      deliverables: ['PMCF Plan'],
      status: 'pending',
    },
    {
      id: 'mdr-19',
      title: 'Periodic Safety Update Report (PSUR) Template',
      description: 'Template for ongoing PSUR reporting',
      level: 'l6',
      estimatedHours: 16,
      assignedRole: 'safety_officer',
      dependencies: ['mdr-17'],
      deliverables: ['PSUR Template'],
      status: 'pending',
    },
    // Notified Body
    {
      id: 'mdr-20',
      title: 'Technical File Compilation',
      description: 'Compile complete technical file for NB review',
      level: 'l7',
      estimatedHours: 40,
      assignedRole: 'ra_associate',
      dependencies: ['mdr-6', 'mdr-7', 'mdr-8', 'mdr-11', 'mdr-13', 'mdr-14', 'mdr-17'],
      deliverables: ['Technical File'],
      status: 'pending',
    },
    {
      id: 'mdr-21',
      title: 'NB Review & Audit',
      description: 'Support Notified Body technical review and audit',
      level: 'l7',
      estimatedHours: 80,
      assignedRole: 'qa_manager',
      dependencies: ['mdr-20'],
      deliverables: ['Audit Responses'],
      status: 'pending',
    },
    {
      id: 'mdr-22',
      title: 'CE Certificate Issuance',
      description: 'Obtain CE certificate from Notified Body',
      level: 'l7',
      estimatedHours: 4,
      assignedRole: 'ra_lead',
      dependencies: ['mdr-21'],
      deliverables: ['CE Certificate'],
      status: 'pending',
    },
    // Market Access
    {
      id: 'mdr-23',
      title: 'EU Declaration of Conformity',
      description: 'Sign manufacturer\'s DoC',
      level: 'l8',
      estimatedHours: 4,
      assignedRole: 'executive',
      dependencies: ['mdr-22'],
      deliverables: ['Declaration of Conformity'],
      status: 'pending',
    },
    {
      id: 'mdr-24',
      title: 'UDI Registration',
      description: 'Assign UDI and register in EUDAMED',
      level: 'l8',
      estimatedHours: 8,
      assignedRole: 'ra_associate',
      dependencies: ['mdr-22'],
      deliverables: ['UDI Registration'],
      status: 'pending',
    },
    {
      id: 'mdr-25',
      title: 'EUDAMED Registration',
      description: 'Complete economic operator and device registration',
      level: 'l8',
      estimatedHours: 16,
      assignedRole: 'ra_associate',
      dependencies: ['mdr-24'],
      deliverables: ['EUDAMED Registration'],
      status: 'pending',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// TGA AUSTRALIA PYRAMID
// ─────────────────────────────────────────────────────────────────────────────

const TGA_AUST_R_PYRAMID: GlobalPyramidConfig = {
  type: 'TGA_AUST_R',
  agency: 'Therapeutic Goods Administration',
  region: 'Australia',
  format: 'eCTD',
  totalEstimatedDays: 180,
  localRequirements: [
    'Australian-specific labeling (PI and CMI)',
    'Australian Register of Therapeutic Goods (ARTG) inclusion',
    'GMP clearance for overseas manufacturers',
    'Australian Sponsor requirements',
    'PBS/PBAC listing (if applicable)',
  ],
  levels: [
    { id: 'l1', name: 'Planning', order: 1, color: '#6366F1' },
    { id: 'l2', name: 'Module 1 - Regional', order: 2, color: '#8B5CF6' },
    { id: 'l3', name: 'CTD Modules 2-5', order: 3, color: '#A855F7' },
    { id: 'l4', name: 'Australian Requirements', order: 4, color: '#D946EF' },
    { id: 'l5', name: 'Submission & Review', order: 5, color: '#10B981' },
  ],
  tasks: [
    // Planning
    {
      id: 'tga-1',
      title: 'TGA Pathway Assessment',
      description: 'Determine registration category and pathway',
      level: 'l1',
      estimatedHours: 16,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['TGA Strategy Document'],
      status: 'pending',
    },
    {
      id: 'tga-2',
      title: 'Pre-Submission Meeting',
      description: 'Optional pre-submission discussion with TGA',
      level: 'l1',
      estimatedHours: 24,
      assignedRole: 'ra_lead',
      dependencies: ['tga-1'],
      deliverables: ['Meeting Minutes'],
      status: 'pending',
    },
    // Module 1
    {
      id: 'tga-3',
      title: 'Australian Product Information (PI)',
      description: 'Prepare PI per TGA format',
      level: 'l2',
      estimatedHours: 32,
      assignedRole: 'medical_writer',
      dependencies: ['tga-1'],
      deliverables: ['Product Information'],
      status: 'pending',
    },
    {
      id: 'tga-4',
      title: 'Consumer Medicine Information (CMI)',
      description: 'Consumer-friendly medication information',
      level: 'l2',
      estimatedHours: 16,
      assignedRole: 'medical_writer',
      dependencies: ['tga-3'],
      deliverables: ['Consumer Medicine Information'],
      status: 'pending',
    },
    {
      id: 'tga-5',
      title: 'Application Forms',
      description: 'Complete TGA application forms',
      level: 'l2',
      estimatedHours: 8,
      assignedRole: 'ra_associate',
      dependencies: ['tga-1'],
      deliverables: ['TGA Application Forms'],
      status: 'pending',
    },
    // CTD Modules
    {
      id: 'tga-6',
      title: 'CTD Module 2-5 Preparation',
      description: 'Prepare/adapt CTD for Australian submission',
      level: 'l3',
      estimatedHours: 40,
      assignedRole: 'ra_associate',
      dependencies: ['tga-1'],
      deliverables: ['Modules 2-5'],
      status: 'pending',
    },
    // Australian Requirements
    {
      id: 'tga-7',
      title: 'GMP Evidence',
      description: 'Obtain GMP clearance for overseas sites',
      level: 'l4',
      estimatedHours: 24,
      assignedRole: 'qa_manager',
      dependencies: [],
      deliverables: ['GMP Evidence'],
      status: 'pending',
    },
    {
      id: 'tga-8',
      title: 'Australian Sponsor Arrangements',
      description: 'Establish Australian sponsor requirements',
      level: 'l4',
      estimatedHours: 16,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['Sponsor Arrangements'],
      status: 'pending',
    },
    // Submission
    {
      id: 'tga-9',
      title: 'eCTD Compilation & Validation',
      description: 'Compile and validate eCTD package',
      level: 'l5',
      estimatedHours: 16,
      assignedRole: 'regulatory_ops',
      dependencies: ['tga-3', 'tga-4', 'tga-5', 'tga-6', 'tga-7'],
      deliverables: ['Validated eCTD'],
      status: 'pending',
    },
    {
      id: 'tga-10',
      title: 'Submit via TGA Business Services',
      description: 'Electronic submission to TGA',
      level: 'l5',
      estimatedHours: 4,
      assignedRole: 'ra_lead',
      dependencies: ['tga-9'],
      deliverables: ['Submission Receipt'],
      status: 'pending',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SWISSMEDIC PYRAMID (Swiss Marketing Authorization)
// ─────────────────────────────────────────────────────────────────────────────

const SWISSMEDIC_PYRAMID: GlobalPyramidConfig = {
  type: 'SWISSMEDIC',
  agency: 'Swissmedic (Swiss Agency for Therapeutic Products)',
  region: 'Switzerland',
  format: 'eCTD',
  totalEstimatedDays: 200,
  localRequirements: [
    'Swissmedic application form (Gesuchsformular)',
    'Swiss labeling (Arzneimittelinformation) in DE/FR/IT',
    'EU reference product alignment (if applicable)',
    'HMG (Heilmittelgesetz) compliance',
    'GMP certificate accepted by Swissmedic',
    'Swiss-specific Module 1 regional information',
    'Risk Management Plan per Swissmedic requirements',
  ],
  levels: [
    { id: 'l1', name: 'Planning', order: 1, color: '#6366F1' },
    { id: 'l2', name: 'Module 1 - Swiss Admin', order: 2, color: '#8B5CF6' },
    { id: 'l3', name: 'Module 2 - Summaries', order: 3, color: '#A855F7' },
    { id: 'l4', name: 'Module 3 - Quality', order: 4, color: '#D946EF' },
    { id: 'l5', name: 'Module 4 - Nonclinical', order: 5, color: '#EC4899' },
    { id: 'l6', name: 'Module 5 - Clinical', order: 6, color: '#F43F5E' },
    { id: 'l7', name: 'Submission & Review', order: 7, color: '#10B981' },
  ],
  tasks: [
    // Planning
    {
      id: 'swiss-1',
      title: 'Regulatory Strategy & Pathway Selection',
      description: 'Define Swissmedic submission pathway (ZL1/ZL2/ZL3) and identify HMG requirements',
      level: 'l1',
      estimatedHours: 12,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['Swissmedic Regulatory Strategy Memo'],
      status: 'pending',
    },
    {
      id: 'swiss-2',
      title: 'Pre-Submission Scientific Advice',
      description: 'Request scientific advice from Swissmedic (optional but recommended)',
      level: 'l1',
      estimatedHours: 24,
      assignedRole: 'ra_lead',
      dependencies: ['swiss-1'],
      deliverables: ['Scientific Advice Request', 'Briefing Document'],
      status: 'pending',
    },
    // Module 1 - Swiss Admin
    {
      id: 'swiss-3',
      title: 'Swissmedic Application Form (Gesuchsformular)',
      description: 'Complete the Swissmedic-specific application form and administrative documents',
      level: 'l2',
      estimatedHours: 16,
      assignedRole: 'ra_associate',
      dependencies: ['swiss-1'],
      deliverables: ['Gesuchsformular', 'Fee Payment Confirmation'],
      status: 'pending',
    },
    {
      id: 'swiss-4',
      title: 'Arzneimittelinformation (Swiss Labeling)',
      description: 'Prepare trilingual Swiss drug information (German, French, Italian)',
      level: 'l2',
      estimatedHours: 60,
      assignedRole: 'medical_writer',
      dependencies: ['swiss-1'],
      deliverables: ['Fachinformation (DE)', 'Information professionnelle (FR)', 'Informazione professionale (IT)'],
      status: 'pending',
    },
    {
      id: 'swiss-5',
      title: 'Patient Information Leaflet (Packungsbeilage)',
      description: 'Consumer-facing medication leaflet in DE/FR/IT',
      level: 'l2',
      estimatedHours: 24,
      assignedRole: 'medical_writer',
      dependencies: ['swiss-4'],
      deliverables: ['Packungsbeilage (DE)', 'Notice d\'emballage (FR)', 'Foglietto illustrativo (IT)'],
      status: 'pending',
    },
    // Module 2 - Summaries
    {
      id: 'swiss-6',
      title: 'Quality Overall Summary',
      description: 'Module 2.3 quality summary, referencing EU dossier where applicable',
      level: 'l3',
      estimatedHours: 24,
      assignedRole: 'cmc_lead',
      dependencies: ['swiss-1'],
      deliverables: ['Quality Overall Summary'],
      status: 'pending',
    },
    {
      id: 'swiss-7',
      title: 'Nonclinical & Clinical Overviews',
      description: 'Modules 2.4/2.5 nonclinical and clinical overviews with benefit-risk assessment',
      level: 'l3',
      estimatedHours: 60,
      assignedRole: 'medical_writer',
      dependencies: ['swiss-1'],
      deliverables: ['Nonclinical Overview', 'Clinical Overview'],
      status: 'pending',
    },
    // Module 3 - Quality
    {
      id: 'swiss-8',
      title: 'Drug Substance & Drug Product (3.2.S/3.2.P)',
      description: 'CMC documentation; align with EU reference product data if applicable',
      level: 'l4',
      estimatedHours: 60,
      assignedRole: 'cmc_lead',
      dependencies: ['swiss-6'],
      deliverables: ['3.2.S Drug Substance', '3.2.P Drug Product'],
      status: 'pending',
    },
    {
      id: 'swiss-9',
      title: 'GMP Certificate & Manufacturing Compliance',
      description: 'Provide GMP certificate recognized by Swissmedic (MRA with EU/EEA accepted)',
      level: 'l4',
      estimatedHours: 16,
      assignedRole: 'qa_manager',
      dependencies: [],
      deliverables: ['GMP Certificate'],
      status: 'pending',
    },
    // Module 4 - Nonclinical
    {
      id: 'swiss-10',
      title: 'Nonclinical Study Reports',
      description: 'Pharmacology and toxicology study reports per ICH guidelines',
      level: 'l5',
      estimatedHours: 24,
      assignedRole: 'toxicologist',
      dependencies: ['swiss-7'],
      deliverables: ['Module 4 Nonclinical Reports'],
      status: 'pending',
    },
    // Module 5 - Clinical
    {
      id: 'swiss-11',
      title: 'Clinical Study Reports',
      description: 'Clinical data; reference EU-approved product clinical package if applicable',
      level: 'l6',
      estimatedHours: 40,
      assignedRole: 'clinical_lead',
      dependencies: ['swiss-7'],
      deliverables: ['Module 5 Clinical Reports'],
      status: 'pending',
    },
    {
      id: 'swiss-12',
      title: 'Risk Management Plan (Swissmedic RMP)',
      description: 'RMP aligned with Swissmedic expectations; may reference EU RMP',
      level: 'l6',
      estimatedHours: 32,
      assignedRole: 'safety_officer',
      dependencies: ['swiss-7'],
      deliverables: ['Swissmedic Risk Management Plan'],
      status: 'pending',
    },
    // Submission & Review
    {
      id: 'swiss-13',
      title: 'HMG Compliance Review',
      description: 'Internal review for Heilmittelgesetz compliance across all modules',
      level: 'l7',
      estimatedHours: 16,
      assignedRole: 'qa_manager',
      dependencies: ['swiss-4', 'swiss-5', 'swiss-6', 'swiss-8', 'swiss-10', 'swiss-11', 'swiss-12'],
      deliverables: ['HMG Compliance Checklist'],
      status: 'pending',
    },
    {
      id: 'swiss-14',
      title: 'eCTD Assembly & Validation',
      description: 'Compile and validate eCTD package for Swissmedic gateway',
      level: 'l7',
      estimatedHours: 16,
      assignedRole: 'regulatory_ops',
      dependencies: ['swiss-13'],
      deliverables: ['Validated eCTD Package'],
      status: 'pending',
    },
    {
      id: 'swiss-15',
      title: 'Submit to Swissmedic',
      description: 'Electronic submission via Swissmedic portal',
      level: 'l7',
      estimatedHours: 4,
      assignedRole: 'ra_lead',
      dependencies: ['swiss-14'],
      deliverables: ['Submission Confirmation', 'Swissmedic Reference Number'],
      status: 'pending',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// ANVISA BRAZIL PYRAMID (Brazil ANVISA Registration)
// ─────────────────────────────────────────────────────────────────────────────

const ANVISA_PYRAMID: GlobalPyramidConfig = {
  type: 'ANVISA',
  agency: 'ANVISA (Agencia Nacional de Vigilancia Sanitaria)',
  region: 'Brazil',
  format: 'CTD',
  totalEstimatedDays: 240,
  localRequirements: [
    'ANVISA petition form (peticionamento eletronico)',
    'Portuguese-language labeling (bula)',
    'GMP certificate via ANVISA inspection of manufacturing sites',
    'Clinical study in Brazilian population (may be required)',
    'INPI patent linkage (anuencia previa) for generics',
    'Certificate of Pharmaceutical Product (CPP) from reference country',
    'Brazilian local representative (empresa detentora do registro)',
    'REBLAS-accredited bioequivalence studies (if generic)',
  ],
  levels: [
    { id: 'l1', name: 'Planning', order: 1, color: '#6366F1' },
    { id: 'l2', name: 'ANVISA Admin', order: 2, color: '#8B5CF6' },
    { id: 'l3', name: 'CTD Summaries', order: 3, color: '#A855F7' },
    { id: 'l4', name: 'Quality', order: 4, color: '#D946EF' },
    { id: 'l5', name: 'Nonclinical', order: 5, color: '#EC4899' },
    { id: 'l6', name: 'Clinical', order: 6, color: '#F43F5E' },
    { id: 'l7', name: 'Brazilian Requirements & Submission', order: 7, color: '#10B981' },
  ],
  tasks: [
    // Planning
    {
      id: 'anvisa-1',
      title: 'ANVISA Regulatory Strategy',
      description: 'Define registration category (new, generic, similar, biological) and RDC pathway',
      level: 'l1',
      estimatedHours: 16,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['ANVISA Regulatory Strategy Document'],
      status: 'pending',
    },
    {
      id: 'anvisa-2',
      title: 'Appoint Brazilian Local Representative',
      description: 'Designate empresa detentora do registro (registration holder) in Brazil',
      level: 'l1',
      estimatedHours: 24,
      assignedRole: 'ra_lead',
      dependencies: ['anvisa-1'],
      deliverables: ['Local Representative Agreement', 'Power of Attorney'],
      status: 'pending',
    },
    // ANVISA Admin
    {
      id: 'anvisa-3',
      title: 'ANVISA Petition Form (Peticionamento Eletronico)',
      description: 'Complete electronic petition via ANVISA portal',
      level: 'l2',
      estimatedHours: 12,
      assignedRole: 'ra_associate',
      dependencies: ['anvisa-2'],
      deliverables: ['ANVISA Electronic Petition', 'GRU Fee Payment'],
      status: 'pending',
    },
    {
      id: 'anvisa-4',
      title: 'Bula (Portuguese-Language Labeling)',
      description: 'Prepare bula para o paciente and bula para o profissional per ANVISA RDC 47/2009',
      level: 'l2',
      estimatedHours: 48,
      assignedRole: 'medical_writer',
      dependencies: ['anvisa-1'],
      deliverables: ['Bula para o Paciente', 'Bula para o Profissional de Saude'],
      status: 'pending',
    },
    // CTD Summaries
    {
      id: 'anvisa-5',
      title: 'Quality Overall Summary',
      description: 'Module 2.3 quality summary adapted for ANVISA format',
      level: 'l3',
      estimatedHours: 24,
      assignedRole: 'cmc_lead',
      dependencies: ['anvisa-1'],
      deliverables: ['Quality Overall Summary'],
      status: 'pending',
    },
    {
      id: 'anvisa-6',
      title: 'Nonclinical & Clinical Overviews',
      description: 'Modules 2.4/2.5 summaries; note Brazilian population data requirements',
      level: 'l3',
      estimatedHours: 48,
      assignedRole: 'medical_writer',
      dependencies: ['anvisa-1'],
      deliverables: ['Nonclinical Overview', 'Clinical Overview'],
      status: 'pending',
    },
    // Quality
    {
      id: 'anvisa-7',
      title: 'Drug Substance & Product Documentation',
      description: 'CMC documentation per ICH CTD format; include stability data under Zone IVb conditions',
      level: 'l4',
      estimatedHours: 60,
      assignedRole: 'cmc_lead',
      dependencies: ['anvisa-5'],
      deliverables: ['3.2.S Drug Substance', '3.2.P Drug Product', 'Zone IVb Stability Data'],
      status: 'pending',
    },
    {
      id: 'anvisa-8',
      title: 'GMP Certificate via ANVISA Inspection',
      description: 'Schedule and support ANVISA GMP inspection of all manufacturing sites',
      level: 'l4',
      estimatedHours: 40,
      assignedRole: 'qa_manager',
      dependencies: [],
      deliverables: ['ANVISA GMP Certificate (CBPF)'],
      status: 'pending',
    },
    // Nonclinical
    {
      id: 'anvisa-9',
      title: 'Nonclinical Study Reports',
      description: 'Pharmacology and toxicology reports per ANVISA RDC requirements',
      level: 'l5',
      estimatedHours: 24,
      assignedRole: 'toxicologist',
      dependencies: ['anvisa-6'],
      deliverables: ['Module 4 Nonclinical Reports'],
      status: 'pending',
    },
    // Clinical
    {
      id: 'anvisa-10',
      title: 'Clinical Study Reports',
      description: 'Clinical data; include Brazilian population study if required by ANVISA',
      level: 'l6',
      estimatedHours: 40,
      assignedRole: 'clinical_lead',
      dependencies: ['anvisa-6'],
      deliverables: ['Module 5 Clinical Reports'],
      status: 'pending',
    },
    {
      id: 'anvisa-11',
      title: 'Brazilian Population Clinical Data',
      description: 'Clinical trial or bridging data from Brazilian population (may be mandatory for new molecules)',
      level: 'l6',
      estimatedHours: 40,
      assignedRole: 'clinical_lead',
      dependencies: ['anvisa-10'],
      deliverables: ['Brazilian Clinical Study Report'],
      status: 'pending',
    },
    // Brazilian Requirements & Submission
    {
      id: 'anvisa-12',
      title: 'INPI Patent Linkage (Anuencia Previa)',
      description: 'INPI patent search and anuencia previa process (mandatory for generics/similars)',
      level: 'l7',
      estimatedHours: 24,
      assignedRole: 'ra_lead',
      dependencies: ['anvisa-1'],
      deliverables: ['INPI Patent Search Report', 'Anuencia Previa Documentation'],
      status: 'pending',
    },
    {
      id: 'anvisa-13',
      title: 'Certificate of Pharmaceutical Product (CPP)',
      description: 'Obtain CPP from reference country per WHO format',
      level: 'l7',
      estimatedHours: 16,
      assignedRole: 'ra_associate',
      dependencies: [],
      deliverables: ['Certificate of Pharmaceutical Product'],
      status: 'pending',
    },
    {
      id: 'anvisa-14',
      title: 'Dossier Assembly & Submission',
      description: 'Compile final CTD dossier and submit via ANVISA peticionamento eletronico',
      level: 'l7',
      estimatedHours: 24,
      assignedRole: 'regulatory_ops',
      dependencies: ['anvisa-3', 'anvisa-4', 'anvisa-7', 'anvisa-8', 'anvisa-9', 'anvisa-11', 'anvisa-12', 'anvisa-13'],
      deliverables: ['Submitted Dossier', 'ANVISA Protocol Number'],
      status: 'pending',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// NMPA CHINA PYRAMID (China NMPA Registration)
// ─────────────────────────────────────────────────────────────────────────────

const NMPA_PYRAMID: GlobalPyramidConfig = {
  type: 'NMPA',
  agency: 'NMPA (National Medical Products Administration) / CDE',
  region: 'China',
  format: 'CTD',
  totalEstimatedDays: 300,
  localRequirements: [
    'CDE pre-submission consultation (pre-IND/pre-NDA meeting)',
    'Chinese labeling (说明书) in simplified Chinese',
    'Clinical trial in Chinese population (bridging or full study)',
    'GMP certificate via NMPA inspection of manufacturing sites',
    'MAH (Marketing Authorization Holder) system compliance',
    'Drug registration classification per NMPA categories',
    'China-specific stability data (ICH Zone IVa conditions)',
    'Import Drug License (IDL) for imported products',
    'Designated Chinese agent for imported drugs',
  ],
  levels: [
    { id: 'l1', name: 'Pre-Submission', order: 1, color: '#6366F1' },
    { id: 'l2', name: 'NMPA Admin', order: 2, color: '#8B5CF6' },
    { id: 'l3', name: 'Module 2 - Summaries', order: 3, color: '#A855F7' },
    { id: 'l4', name: 'Module 3 - Quality', order: 4, color: '#D946EF' },
    { id: 'l5', name: 'Module 4 - Nonclinical', order: 5, color: '#EC4899' },
    { id: 'l6', name: 'Module 5 - Clinical', order: 6, color: '#F43F5E' },
    { id: 'l7', name: 'China-Specific Requirements', order: 7, color: '#F97316' },
    { id: 'l8', name: 'Submission & Review', order: 8, color: '#10B981' },
  ],
  tasks: [
    // Pre-Submission
    {
      id: 'nmpa-1',
      title: 'CDE Pre-Submission Consultation',
      description: 'Formal pre-IND or pre-NDA meeting with CDE (Center for Drug Evaluation)',
      level: 'l1',
      estimatedHours: 40,
      assignedRole: 'ra_lead',
      dependencies: [],
      deliverables: ['CDE Meeting Request', 'Briefing Document (Chinese)'],
      status: 'pending',
    },
    {
      id: 'nmpa-2',
      title: 'Drug Registration Classification',
      description: 'Determine NMPA registration classification (Category 1-5) and applicable pathway',
      level: 'l1',
      estimatedHours: 16,
      assignedRole: 'ra_lead',
      dependencies: ['nmpa-1'],
      deliverables: ['Registration Classification Justification'],
      status: 'pending',
    },
    {
      id: 'nmpa-3',
      title: 'Appoint Chinese Agent',
      description: 'Designate a Chinese domestic agent (for imported drugs) or MAH entity',
      level: 'l1',
      estimatedHours: 24,
      assignedRole: 'ra_lead',
      dependencies: ['nmpa-2'],
      deliverables: ['Agent Agreement', 'Power of Attorney (notarized)'],
      status: 'pending',
    },
    // NMPA Admin
    {
      id: 'nmpa-4',
      title: 'NMPA Application Forms',
      description: 'Complete drug registration application forms per NMPA format',
      level: 'l2',
      estimatedHours: 16,
      assignedRole: 'ra_associate',
      dependencies: ['nmpa-3'],
      deliverables: ['NMPA Application Forms', 'Fee Payment Confirmation'],
      status: 'pending',
    },
    {
      id: 'nmpa-5',
      title: 'Chinese Labeling (说明书)',
      description: 'Prepare simplified Chinese prescribing information and patient leaflet',
      level: 'l2',
      estimatedHours: 48,
      assignedRole: 'medical_writer',
      dependencies: ['nmpa-2'],
      deliverables: ['说明书 (Prescribing Information)', 'Patient Leaflet (Chinese)'],
      status: 'pending',
    },
    // Module 2 - Summaries
    {
      id: 'nmpa-6',
      title: 'Quality Overall Summary',
      description: 'Module 2.3 quality summary per CTD format for CDE review',
      level: 'l3',
      estimatedHours: 24,
      assignedRole: 'cmc_lead',
      dependencies: ['nmpa-2'],
      deliverables: ['Quality Overall Summary'],
      status: 'pending',
    },
    {
      id: 'nmpa-7',
      title: 'Nonclinical & Clinical Overviews',
      description: 'Modules 2.4/2.5 with emphasis on ethnic sensitivity and bridging rationale',
      level: 'l3',
      estimatedHours: 60,
      assignedRole: 'medical_writer',
      dependencies: ['nmpa-2'],
      deliverables: ['Nonclinical Overview', 'Clinical Overview', 'Ethnic Sensitivity Assessment'],
      status: 'pending',
    },
    // Module 3 - Quality
    {
      id: 'nmpa-8',
      title: 'Drug Substance & Product Documentation',
      description: 'CMC data with China-specific stability under ICH Zone IVa conditions',
      level: 'l4',
      estimatedHours: 60,
      assignedRole: 'cmc_lead',
      dependencies: ['nmpa-6'],
      deliverables: ['3.2.S Drug Substance', '3.2.P Drug Product', 'Zone IVa Stability Data'],
      status: 'pending',
    },
    // Module 4 - Nonclinical
    {
      id: 'nmpa-9',
      title: 'Nonclinical Study Reports',
      description: 'Pharmacology and toxicology per CDE requirements',
      level: 'l5',
      estimatedHours: 32,
      assignedRole: 'toxicologist',
      dependencies: ['nmpa-7'],
      deliverables: ['Module 4 Nonclinical Reports'],
      status: 'pending',
    },
    // Module 5 - Clinical
    {
      id: 'nmpa-10',
      title: 'Clinical Study Reports (Global)',
      description: 'Global clinical data package for CDE review',
      level: 'l6',
      estimatedHours: 48,
      assignedRole: 'clinical_lead',
      dependencies: ['nmpa-7'],
      deliverables: ['Module 5 Clinical Reports'],
      status: 'pending',
    },
    {
      id: 'nmpa-11',
      title: 'Chinese Population Clinical Data',
      description: 'Clinical trial in Chinese population (bridging PK/PD or full pivotal study per CDE guidance)',
      level: 'l6',
      estimatedHours: 60,
      assignedRole: 'clinical_lead',
      dependencies: ['nmpa-10'],
      deliverables: ['Chinese Clinical Study Report', 'Bridging Study Justification'],
      status: 'pending',
    },
    // China-Specific Requirements
    {
      id: 'nmpa-12',
      title: 'GMP Certificate via NMPA Inspection',
      description: 'Schedule and support NMPA on-site GMP inspection of all manufacturing facilities',
      level: 'l7',
      estimatedHours: 60,
      assignedRole: 'qa_manager',
      dependencies: [],
      deliverables: ['NMPA GMP Inspection Report', 'GMP Compliance Certificate'],
      status: 'pending',
    },
    {
      id: 'nmpa-13',
      title: 'MAH System Compliance',
      description: 'Demonstrate compliance with China MAH (Marketing Authorization Holder) pilot program requirements',
      level: 'l7',
      estimatedHours: 24,
      assignedRole: 'ra_lead',
      dependencies: ['nmpa-3'],
      deliverables: ['MAH Compliance Documentation', 'Pharmacovigilance System Description'],
      status: 'pending',
    },
    {
      id: 'nmpa-14',
      title: 'Import Drug License Preparation',
      description: 'Prepare Import Drug License (IDL) application for imported products',
      level: 'l7',
      estimatedHours: 16,
      assignedRole: 'ra_associate',
      dependencies: ['nmpa-3'],
      deliverables: ['IDL Application Package'],
      status: 'pending',
    },
    // Submission & Review
    {
      id: 'nmpa-15',
      title: 'CTD Assembly & CDE Validation',
      description: 'Compile CTD dossier and validate per CDE electronic submission requirements',
      level: 'l8',
      estimatedHours: 24,
      assignedRole: 'regulatory_ops',
      dependencies: ['nmpa-4', 'nmpa-5', 'nmpa-8', 'nmpa-9', 'nmpa-11', 'nmpa-12', 'nmpa-13', 'nmpa-14'],
      deliverables: ['Validated CTD Package'],
      status: 'pending',
    },
    {
      id: 'nmpa-16',
      title: 'Submit to CDE Gateway',
      description: 'Electronic submission to CDE via NMPA drug registration platform',
      level: 'l8',
      estimatedHours: 8,
      assignedRole: 'ra_lead',
      dependencies: ['nmpa-15'],
      deliverables: ['Submission Receipt', 'CDE Acceptance Notification'],
      status: 'pending',
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT ALL PYRAMIDS
// ─────────────────────────────────────────────────────────────────────────────

export const GLOBAL_PYRAMIDS: Record<GlobalSubmissionType, GlobalPyramidConfig> = {
  HC_NOC: HC_NOC_PYRAMID,
  HC_NOC_C: HC_NOC_PYRAMID,        // Alias: shares HC_NOC structure (NOC with Conditions uses same dossier)
  HC_DIN: HC_NOC_PYRAMID,          // Alias: shares HC_NOC structure (simplified DIN pathway)
  PMDA_SHONIN: PMDA_SHONIN_PYRAMID,
  PMDA_CTN: PMDA_SHONIN_PYRAMID,   // Alias: shares PMDA_SHONIN structure (CTN is a subset)
  TGA_AUST_R: TGA_AUST_R_PYRAMID,
  TGA_CTN: TGA_AUST_R_PYRAMID,     // Alias: shares TGA_AUST_R structure (CTN is a subset)
  SWISSMEDIC: SWISSMEDIC_PYRAMID,
  ANVISA: ANVISA_PYRAMID,
  NMPA: NMPA_PYRAMID,
  EU_CE_MDR: EU_CE_MDR_PYRAMID,
  EU_CE_IVDR: EU_CE_MDR_PYRAMID,   // Alias: shares EU_CE_MDR structure (IVDR uses similar framework)
};

/**
 * Get a global pyramid configuration by type
 */
export function getGlobalPyramid(type: GlobalSubmissionType): GlobalPyramidConfig {
  return GLOBAL_PYRAMIDS[type];
}

/**
 * Get all available global submission types
 */
export function getAvailableGlobalSubmissions(): GlobalSubmissionType[] {
  return Object.keys(GLOBAL_PYRAMIDS) as GlobalSubmissionType[];
}

/**
 * Get pyramids by region
 */
export function getPyramidsByRegion(region: string): GlobalPyramidConfig[] {
  return Object.values(GLOBAL_PYRAMIDS).filter(p => p.region === region);
}

export default GLOBAL_PYRAMIDS;
