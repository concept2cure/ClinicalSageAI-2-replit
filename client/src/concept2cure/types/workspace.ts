/**
 * @fileoverview Industry-Aligned Workspace Types
 * @module concept2cure/types/workspace
 * @version 1.0.0
 *
 * @description
 * Type definitions aligned with how Biotech, Pharma, CROs, and Regulatory
 * agencies actually organize their work. Based on real organizational structures.
 *
 * ORGANIZATIONAL MODELS:
 * - Biotech: Product-focused, lean teams, IND/BLA path
 * - Pharma: Portfolio-based, therapeutic areas, global lifecycle
 * - CRO: Client→Project→Study→Deliverable hierarchy
 * - Regulatory Agency: Review division, submission queue, PDUFA management
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON REGULATORY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type RegulatoryRegion = 'US' | 'EU' | 'JP' | 'CN' | 'CA' | 'AU' | 'BR' | 'ROW';

export type IndustryMode =
  | 'biotech'
  | 'pharma'
  | 'cro'
  | 'medtech'
  | 'academic'
  | 'regulatory'
  | 'medical_writing';

export type SubmissionType =
  // US FDA
  | 'IND' | 'NDA' | 'BLA' | 'ANDA' | '510K' | 'PMA' | 'DE_NOVO' | 'HDE' | 'EUA'
  // EU EMA  
  | 'MAA' | 'CTA' | 'IMPD'
  // Clinical Evaluation
  | 'CER' | 'PSUR' | 'PBRER'
  // Variations & Amendments
  | 'TYPE_IA' | 'TYPE_IB' | 'TYPE_II' | 'PRIOR_APPROVAL' | 'CBE' | 'CBE30' | 'ANNUAL_REPORT';

export type ProductStage =
  | 'discovery'
  | 'preclinical'
  | 'phase1'
  | 'phase2'
  | 'phase3'
  | 'registration'
  | 'marketed'
  | 'lifecycle';

export type TherapeuticArea =
  | 'oncology'
  | 'cardiovascular'
  | 'neurology'
  | 'immunology'
  | 'infectious_disease'
  | 'rare_disease'
  | 'metabolic'
  | 'respiratory'
  | 'dermatology'
  | 'ophthalmology'
  | 'medical_device'
  | 'diagnostics'
  | 'combination_product';

// ═══════════════════════════════════════════════════════════════════════════════
// BIOTECH MODEL: Product-Centric
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Biotech workspace organized around a single product pipeline
 * Typical structure: Lead Product → Development Program → Regulatory Submissions
 */
export interface BiotechProduct {
  id: string;
  name: string;                    // e.g., "ABC-123"
  genericName?: string;            // e.g., "abcimab"
  brandName?: string;              // e.g., "Abcira"
  therapeuticArea: TherapeuticArea;
  indication: string;              // e.g., "Relapsed/Refractory AML"
  stage: ProductStage;
  modality: 'small_molecule' | 'biologic' | 'cell_therapy' | 'gene_therapy' | 'device' | 'combination';
  
  // Development Program
  program: {
    indNumber?: string;            // IND #
    protocolNumbers: string[];     // NCT numbers
    targetFiling: string;          // Target NDA/BLA date
    fdaDivision?: string;          // e.g., "DHRR - Division of Hematology Rare Diseases"
  };
  
  // Regulatory Strategy
  strategy: {
    designation: ('breakthrough' | 'fast_track' | 'accelerated' | 'priority' | 'orphan' | 'rmat')[];
    guidance: string[];            // Relevant FDA guidances
    meetings: RegAgencyMeeting[];
  };
  
  // Current focus
  currentSubmission?: ActiveSubmission;
  upcomingMilestones: Milestone[];
}

export interface RegAgencyMeeting {
  id: string;
  type: 'pre_ind' | 'eop1' | 'eop2' | 'pre_nda' | 'pre_bla' | 'type_a' | 'type_b' | 'type_c' | 'type_d';
  date: string;
  status: 'requested' | 'scheduled' | 'completed' | 'cancelled';
  division?: string;
  briefingDocDue?: string;
  minutesReceived?: string;
  keyQuestions?: string[];
  outcomes?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMA MODEL: Portfolio & Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pharma workspace organized by portfolio, therapeutic area, and geography
 * Typical structure: Portfolio → TA → Product → Region → Submission
 */
export interface PharmaPortfolio {
  id: string;
  organizationId: string;
  therapeuticAreas: TherapeuticAreaUnit[];
  globalProducts: GlobalProduct[];
  
  // Portfolio metrics
  metrics: {
    activeSubmissions: number;
    pendingApprovals: number;
    pdufa_dates: PDUFADate[];
    upcomingCommitments: RegulatoryCommitment[];
  };
}

export interface TherapeuticAreaUnit {
  id: string;
  name: TherapeuticArea;
  head: string;                    // TA Lead
  products: string[];              // Product IDs
  pipeline: PipelineEntry[];
}

export interface GlobalProduct {
  id: string;
  name: string;
  genericName: string;
  brandNames: Record<RegulatoryRegion, string>;  // Different names per region
  therapeuticArea: TherapeuticArea;
  
  // Regional registration status
  registrations: ProductRegistration[];
  
  // Lifecycle management
  lifecycle: {
    variations: VariationTracker[];
    renewals: RenewalTracker[];
    commitments: RegulatoryCommitment[];
    labeling: LabelingVersion[];
  };
}

export interface ProductRegistration {
  region: RegulatoryRegion;
  status: 'not_filed' | 'under_review' | 'approved' | 'withdrawn' | 'refused';
  approvalNumber?: string;         // NDA #, MA #, etc.
  approvalDate?: string;
  expiryDate?: string;
  holder: string;                  // MAH or NDA holder
  localAgent?: string;
}

export interface PDUFADate {
  id: string;
  productId: string;
  productName: string;
  submissionType: SubmissionType;
  filingDate: string;
  pdufa_date: string;
  extension?: string;
  status: 'active' | 'crl_received' | 'approved' | 'withdrawn';
  daysPending: number;
}

export interface RegulatoryCommitment {
  id: string;
  productId: string;
  type: 'pmc' | 'pme' | 'rems' | 'pas' | 'annual_report' | 'psur' | 'variation';
  description: string;
  dueDate: string;
  status: 'on_track' | 'at_risk' | 'overdue' | 'completed';
  assignee?: string;
}

export interface VariationTracker {
  id: string;
  variationType: 'TYPE_IA' | 'TYPE_IB' | 'TYPE_II' | 'PRIOR_APPROVAL' | 'CBE' | 'CBE30';
  region: RegulatoryRegion;
  description: string;
  filedDate?: string;
  approvalDate?: string;
  effectiveDate?: string;
  status: 'drafting' | 'internal_review' | 'filed' | 'under_review' | 'approved' | 'withdrawn';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRO MODEL: Client → Project → Study → Deliverable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CRO workspace organized by client accounts and deliverables
 * Typical structure: Client → Master Services Agreement → Projects → Studies → Tasks
 */
export interface CROClient {
  id: string;
  name: string;
  type: 'biotech' | 'pharma' | 'medtech' | 'academic';
  msa: {                          // Master Services Agreement
    id: string;
    effectiveDate: string;
    expiryDate: string;
    rateCard: string;
  };
  contacts: ClientContact[];
  projects: CROProject[];
  
  // Financials
  contractValue: number;
  invoiced: number;
  recognized: number;
}

export interface CROProject {
  id: string;
  clientId: string;
  sowNumber: string;              // Statement of Work #
  name: string;
  type: 'regulatory_submission' | 'medical_writing' | 'clinical_ops' | 'pv_safety' | 'quality' | 'strategy';
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  
  // Scope
  scope: {
    deliverables: CRODeliverable[];
    milestones: CROMilestone[];
    resources: ResourceAllocation[];
  };
  
  // Timeline
  startDate: string;
  endDate: string;
  
  // Commercial
  budget: number;
  burnRate: number;
  changeOrders: ChangeOrder[];
}

export interface CRODeliverable {
  id: string;
  projectId: string;
  name: string;                   // e.g., "Module 2.7.1 Summary of Biopharmaceutics"
  type: 'document' | 'dossier' | 'response' | 'meeting_package' | 'review' | 'translation';
  ectdModule?: string;            // e.g., "2.7.1"
  
  // Workflow
  status: 'not_started' | 'drafting' | 'internal_qc' | 'client_review' | 'finalized' | 'delivered';
  assignedTo: string;             // Medical writer / RA specialist
  reviewer?: string;
  
  // Dates
  dueDate: string;
  clientReviewDue?: string;
  deliveredDate?: string;
  
  // Versions
  versions: DeliverableVersion[];
}

export interface ResourceAllocation {
  resourceId: string;
  resourceName: string;
  role: 'project_manager' | 'medical_writer' | 'ra_specialist' | 'qa_reviewer' | 'publishing' | 'translation';
  allocation: number;             // Percentage (0-100)
  startDate: string;
  endDate: string;
  hours: {
    budgeted: number;
    actual: number;
    forecast: number;
  };
}

export interface ChangeOrder {
  id: string;
  number: string;                 // CO-001
  description: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedDate: string;
  approvedDate?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION DOSSIER MODEL: eCTD Structure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Submission organized by eCTD module structure
 * This is how everyone actually thinks about submissions
 */
export interface SubmissionDossier {
  id: string;
  name: string;
  type: SubmissionType;
  sequence: string;               // e.g., "0000" for initial, "0001" for first amendment
  region: RegulatoryRegion;
  
  // Administrative
  applicationNumber?: string;     // IND #, NDA #, etc.
  productId: string;
  sponsor: string;
  
  // eCTD Modules
  modules: {
    module1: Module1AdminRegional;
    module2: Module2Summaries;
    module3: Module3Quality;
    module4: Module4Nonclinical;
    module5: Module5Clinical;
  };
  
  // Submission tracking
  status: DossierStatus;
  timeline: SubmissionTimeline;
}

export interface DossierStatus {
  overall: 'drafting' | 'internal_review' | 'qc' | 'publishing' | 'ready' | 'submitted' | 'under_review';
  moduleStatus: Record<string, 'not_started' | 'in_progress' | 'complete'>;
  validationStatus?: 'pending' | 'passed' | 'failed';
  validationErrors?: string[];
}

export interface Module1AdminRegional {
  id: string;
  coverLetter: DocumentStatus;
  forms: {
    form1571?: DocumentStatus;    // IND
    form356h?: DocumentStatus;    // NDA/BLA
    form3674?: DocumentStatus;    // Pre-sub
  };
  prescribingInfo?: DocumentStatus;
  financialDisclosure?: DocumentStatus;
  patentInfo?: DocumentStatus;
}

export interface Module2Summaries {
  id: string;
  qualityOverall: DocumentStatus;
  nonclinicalOverall: DocumentStatus;
  clinicalOverall: DocumentStatus;
  nonclinicalWritten: DocumentStatus;
  nonclinicalTabulated: DocumentStatus;
  clinicalWritten: DocumentStatus;
  clinicalTabulated: DocumentStatus;
}

export interface Module3Quality {
  id: string;
  drugSubstance: {
    generalInfo: DocumentStatus;
    manufacture: DocumentStatus;
    characterization: DocumentStatus;
    control: DocumentStatus;
    referenceStandards: DocumentStatus;
    containerClosure: DocumentStatus;
    stability: DocumentStatus;
  };
  drugProduct: {
    description: DocumentStatus;
    development: DocumentStatus;
    manufacture: DocumentStatus;
    control: DocumentStatus;
    referenceStandards: DocumentStatus;
    containerClosure: DocumentStatus;
    stability: DocumentStatus;
  };
  appendices?: DocumentStatus;
  regionalInfo?: DocumentStatus;
  literatureRefs?: DocumentStatus;
}

export interface Module4Nonclinical {
  id: string;
  pharmacology: DocumentStatus;
  pharmacokinetics: DocumentStatus;
  toxicology: DocumentStatus;
}

export interface Module5Clinical {
  id: string;
  biopharmStudies: DocumentStatus;
  clinicalPharmStudies: DocumentStatus;
  efficacyStudies: DocumentStatus;
  safetyStudies: DocumentStatus;
  literatureRefs: DocumentStatus;
  synopses: DocumentStatus;
}

export interface DocumentStatus {
  sectionId: string;
  sectionName: string;
  status: 'not_required' | 'not_started' | 'drafting' | 'review' | 'qc' | 'final' | 'published';
  owner?: string;
  reviewer?: string;
  dueDate?: string;
  completedDate?: string;
  documents: DossierDocument[];
}

export interface DossierDocument {
  id: string;
  name: string;
  fileName: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'published';
  lifeCycle: 'new' | 'replace' | 'append' | 'delete';
  checksum?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE-BASED VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

export type UserRole =
  | 'ra_lead'           // Regulatory Affairs Lead
  | 'ra_specialist'     // Regulatory Affairs Specialist  
  | 'medical_writer'    // Medical Writer
  | 'cmc_lead'          // CMC Lead
  | 'clinical_ops'      // Clinical Operations
  | 'quality_assurance' // QA/QC
  | 'pharmacovigilance' // PV/Safety
  | 'project_manager'   // Project Manager
  | 'medical_director'  // Medical Affairs/Medical Director
  | 'executive';        // C-Suite

export interface RoleBasedDashboard {
  role: UserRole;
  
  // What this role cares about
  primaryMetrics: DashboardMetric[];
  actionItems: ActionItem[];
  watchlist: WatchlistItem[];
  calendar: CalendarItem[];
}

export interface DashboardMetric {
  id: string;
  label: string;
  value: number | string;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
  link?: string;
}

export interface ActionItem {
  id: string;
  type: 'review' | 'approval' | 'deadline' | 'meeting' | 'response' | 'signature';
  title: string;
  description?: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  project?: string;
  product?: string;
  link: string;
}

export interface WatchlistItem {
  id: string;
  type: 'submission' | 'commitment' | 'meeting' | 'deficiency' | 'approval';
  title: string;
  status: string;
  daysRemaining?: number;
  link: string;
}

export interface CalendarItem {
  id: string;
  type: 'pdufa' | 'meeting' | 'deadline' | 'commitment' | 'milestone';
  title: string;
  date: string;
  allDay: boolean;
  project?: string;
  importance: 'normal' | 'high' | 'critical';
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ActiveSubmission {
  id: string;
  type: SubmissionType;
  status: string;
  targetDate: string;
  progress: number;
}

export interface Milestone {
  id: string;
  name: string;
  date: string;
  type: 'regulatory' | 'clinical' | 'commercial' | 'internal';
  status: 'upcoming' | 'at_risk' | 'completed' | 'missed';
}

export interface PipelineEntry {
  productId: string;
  productName: string;
  stage: ProductStage;
  indication: string;
  nextMilestone: Milestone;
}

export interface RenewalTracker {
  id: string;
  region: RegulatoryRegion;
  approvalNumber: string;
  expiryDate: string;
  renewalDueDate: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved';
}

export interface LabelingVersion {
  id: string;
  region: RegulatoryRegion;
  version: string;
  effectiveDate: string;
  type: 'uspi' | 'smpc' | 'pil' | 'ccds';
  status: 'current' | 'superseded' | 'draft';
}

export interface ClientContact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone?: string;
  isPrimary: boolean;
}

export interface CROMilestone {
  id: string;
  name: string;
  dueDate: string;
  completedDate?: string;
  status: 'pending' | 'completed' | 'at_risk' | 'missed';
  paymentTrigger?: boolean;
  amount?: number;
}

export interface DeliverableVersion {
  id: string;
  version: string;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'review' | 'approved';
  comments?: string;
  fileUrl: string;
}

export interface SubmissionTimeline {
  targetFiling: string;
  actualFiling?: string;
  validationComplete?: string;
  reviewStart?: string;
  midCycleReview?: string;
  pdufa_date?: string;
  approvalDate?: string;
}
