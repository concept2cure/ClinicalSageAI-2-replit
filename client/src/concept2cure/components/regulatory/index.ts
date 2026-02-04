// @ts-nocheck
/**
 * Concept2Cure - Regulatory Module Index
 *
 * Central export point for all regulatory workflow components
 *
 * @module components/regulatory
 * @version 1.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// REGULATORY WORKFLOW COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// CAPA (Corrective and Preventive Action) Management
export { CAPAManagement, default as CAPAManagementDefault } from './CAPAManagement';

// Post-Market Surveillance & Vigilance
export {
  PostMarketSurveillance,
  default as PostMarketSurveillanceDefault,
} from './PostMarketSurveillance';

// eCTD Structure Navigator
export { ECTDNavigator, default as ECTDNavigatorDefault } from './ECTDNavigator';

// Inspection Readiness & Audit Preparation
export { InspectionReadiness, default as InspectionReadinessDefault } from './InspectionReadiness';

// Regulatory Intelligence Hub
export {
  RegulatoryIntelligence,
  default as RegulatoryIntelligenceDefault,
} from './RegulatoryIntelligence';

// ─────────────────────────────────────────────────────────────────────────────
// RE-EXPORTS FROM SERVICES
// ─────────────────────────────────────────────────────────────────────────────

// Global Submission Pyramids (Health Canada, PMDA, TGA, EU MDR)
// NOTE: File exists at services/regulatory/globalPyramids.ts but not in client/src/services/
// These re-exports are commented out until the module is available in the client bundle
/*
export type {
  GlobalSubmissionType,
  GlobalPyramidConfig,
} from '@/services/regulatory/globalPyramids';

export {
  GLOBAL_PYRAMIDS,
  getGlobalPyramid,
  getAvailableGlobalSubmissions,
  getPyramidsByRegion,
} from '@/services/regulatory/globalPyramids';
*/

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry of all regulatory components for dynamic loading
 */
export const REGULATORY_COMPONENTS = {
  capa: {
    component: 'CAPAManagement',
    title: 'CAPA Management',
    description: 'Corrective and Preventive Action tracking',
    icon: 'AlertTriangle',
    roles: ['qa_manager', 'ra_lead', 'executive'],
  },
  pms: {
    component: 'PostMarketSurveillance',
    title: 'Post-Market Surveillance',
    description: 'Safety monitoring and vigilance reporting',
    icon: 'Shield',
    roles: ['safety_officer', 'ra_lead', 'medical_writer'],
  },
  ectd: {
    component: 'ECTDNavigator',
    title: 'eCTD Navigator',
    description: 'Electronic submission structure management',
    icon: 'Package',
    roles: ['ra_lead', 'ra_associate', 'regulatory_ops'],
  },
  inspection: {
    component: 'InspectionReadiness',
    title: 'Inspection Readiness',
    description: 'Audit preparation and finding tracking',
    icon: 'ClipboardCheck',
    roles: ['qa_manager', 'ra_lead', 'executive'],
  },
  intelligence: {
    component: 'RegulatoryIntelligence',
    title: 'Regulatory Intelligence',
    description: 'Guidance tracking and competitive analysis',
    icon: 'Globe',
    roles: ['ra_lead', 'ra_associate', 'executive'],
  },
} as const;

export type RegulatoryComponentKey = keyof typeof REGULATORY_COMPONENTS;
