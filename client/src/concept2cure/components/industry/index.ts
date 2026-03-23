/**
 * @fileoverview Industry-Native Component Index
 * @module concept2cure/components/industry
 * @version 1.0.0
 *
 * @description
 * Exports all industry-native components organized by how each
 * organization type ACTUALLY operates:
 *
 * BIOTECH: Product/milestone-centric, lean teams, outsourced vendors
 * PHARMA: Portfolio/therapeutic area matrix, global registrations
 * CRO: Client/SOW-centric, deliverable tracking, utilization
 * REGULATORY: FDA meeting workflow, submission management
 * WRITING: Document authoring, review cycles, source linking
 */

import type { IndustryMode } from '../../types/workspace';

// ═══════════════════════════════════════════════════════════════════════════════
// BIOTECH COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
export {
  BiotechProgramDashboard,
  type DevelopmentStage,
  type FundingMilestone,
  type VendorDeliverable,
  type FDAInteraction,
  type BiotechProgram,
} from './biotech/BiotechProgramDashboard';

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMA COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
export {
  PharmaPortfolioDashboard,
  type RegulatoryRegion,
  type RegistrationStatus,
  type CommitmentType,
  type PDUFADate,
  type RegulatoryCommitment,
  type GlobalRegistration,
  type PharmaProduct,
  type TherapeuticAreaPortfolio,
} from './pharma/PharmaPortfolioDashboard';

// ═══════════════════════════════════════════════════════════════════════════════
// CRO COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
export {
  CROClientPortal,
  type DeliverableType,
  type DeliverableStatus,
  type ChangeOrderStatus,
  type CRODeliverable,
  type ChangeOrder,
  type SOW,
  type CROProgram,
  type CROClient,
  type CROResource,
} from './cro/CROClientPortal';

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATORY COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
export {
  FDAMeetingWorkspace,
  type MeetingType,
  type MeetingPurpose,
  type MeetingStatus,
  type QuestionTopic,
  type MeetingQuestion,
  type ActionItem,
  type FDAMeeting,
} from './regulatory/FDAMeetingWorkspace';

// ═══════════════════════════════════════════════════════════════════════════════
// MEDICAL WRITING COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
export {
  ClinicalDocAuthoringWorkspace,
  type DocumentType,
  type AuthoringStatus,
  type ReviewCommentStatus,
  type SourceDocument,
  type ReviewComment,
  type DocumentSection,
  type DocumentVersion,
  type RegulatoryDocument,
} from './writing/ClinicalDocAuthoringWorkspace';

// ═══════════════════════════════════════════════════════════════════════════════
// MEDTECH / DEVICE COMPONENTS - "THE PATHFINDER"
// ═══════════════════════════════════════════════════════════════════════════════
export {
  MedicalDeviceDashboard,
  type RegulatoryPathway,
  type DeviceClass,
  type SubmissionStatus,
  type RecallClass,
  type PredicateDevice,
  type MAUDEAlert,
  type DeviceSubmission,
  type ESTARSection,
  type CERDocument,
} from '../medtech/MedicalDeviceDashboard';

// ═══════════════════════════════════════════════════════════════════════════════
// CO-AUTHOR COMPONENTS - "THE HEAVY LIFTER"
// ═══════════════════════════════════════════════════════════════════════════════
export {
  eCTDCoAuthor,
  type DocumentModule,
  type SectionStatus,
  type SmartTagType,
  type SmartTag,
  type RedlineAlert,
} from '../coauthor/eCTDCoAuthor';


// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT & INTEGRATION - "THE CONVERGENT CANVAS"
// ═══════════════════════════════════════════════════════════════════════════════
export {
  ContextRibbon,
  type RiskLevel,
  type ConnectionStatus,
  type WorkspaceMode,
} from '../layout/ContextRibbon';

export {
  CouncilThread,
  type AgentRole,
  type CouncilMessage,
  type MessageAction,
  type Citation,
  type Attachment,
} from '../chat/CouncilThread';

export {
  MorningBriefing,
  type AlertPriority,
  type AlertSource,
  type BriefingAlert,
  type TodaysPriority,
} from '../dashboard/MorningBriefing';

export {
  ConvergentCanvas,
  type WorkspaceView,
} from '../layout/ConvergentCanvas';

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED EXPORTS FOR CONVENIENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Industry Mode Configuration
 * Used to determine which dashboard/workspace to show based on organization type
 */
export type { IndustryMode };

/**
 * User Role Configuration
 * Determines specialized views and permissions
 */
export type UserRole = 
  | 'regulatory_affairs'
  | 'ra_lead'
  | 'ra_specialist'
  | 'medical_writer'
  | 'clinical_ops'
  | 'medical_affairs'
  | 'quality_assurance'
  | 'cmc_lead'
  | 'project_manager'
  | 'executive'
  | 'consultant';

/**
 * Maps industry mode to the appropriate dashboard component
 */
export const INDUSTRY_DASHBOARD_MAP = {
  biotech: 'BiotechProgramDashboard',
  pharma: 'PharmaPortfolioDashboard',
  cro: 'CROClientPortal',
  medtech: 'MedicalDeviceDashboard',  // Now has dedicated dashboard!
  academic: 'CROClientPortal',
  regulatory: 'FDAMeetingWorkspace',
  medical_writing: 'ClinicalDocAuthoringWorkspace',
} as const;

/**
 * Maps user role to specialized workspace components
 */
export const ROLE_WORKSPACE_MAP = {
  regulatory_affairs: ['FDAMeetingWorkspace', 'MedicalDeviceDashboard', 'PharmaPortfolioDashboard'],
  ra_lead: ['FDAMeetingWorkspace', 'MedicalDeviceDashboard', 'PharmaPortfolioDashboard'],
  ra_specialist: ['FDAMeetingWorkspace', 'MedicalDeviceDashboard'],
  medical_writer: ['eCTDCoAuthor', 'ClinicalDocAuthoringWorkspace'],
  clinical_ops: ['BiotechProgramDashboard'],
  medical_affairs: ['ClinicalDocAuthoringWorkspace'],
  quality_assurance: ['CMCWizard', 'ClinicalDocAuthoringWorkspace'],
  cmc_lead: ['CMCWizard', 'ClinicalDocAuthoringWorkspace'],
  project_manager: ['CROClientPortal', 'BiotechProgramDashboard'],
  executive: ['PharmaPortfolioDashboard', 'BiotechProgramDashboard'],
  consultant: ['CROClientPortal'],
} as const;

/**
 * THE SHERPA TEAM - Maps components to their Sherpa roles
 */
export const SHERPA_ROLES = {
  ConvergentCanvas: 'The Expedition Leader (AnA RI)',
  eCTDCoAuthor: 'The Heavy Lifter (Document Porter)',
  CMCWizard: 'The Gear Master (Equipment Check)',
  MedicalDeviceDashboard: 'The Pathfinder (CERV2 Scout)',
  ContextRibbon: 'The Compass & Altimeter',
  MorningBriefing: 'The Morning Weather Report',
  CouncilThread: 'The Sherpa Council',
} as const;
