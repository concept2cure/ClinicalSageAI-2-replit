/**
 * @fileoverview Canvas Components Index
 * @module concept2cure/components/canvas
 * @version 1.0.0
 * 
 * @description
 * Exports for the Convergent Canvas system - the Sherpa System architecture.
 * Phase 52 implementation for industry-native regulatory intelligence.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CANVAS PANELS
// ═══════════════════════════════════════════════════════════════════════════════

export { MorningBriefingPanel } from './MorningBriefingPanel';

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY WORKSPACES
// ═══════════════════════════════════════════════════════════════════════════════

export { IndustryWorkspace } from './IndustryWorkspace';
export type { IndustryMode, IndustryWorkspaceProps } from './IndustryWorkspace';

// Lazy-loaded workspaces (import directly when needed)
// - MedTechWorkspace
// - PharmaWorkspace  
// - BiotechWorkspace
// - CROWorkspace
// - RegulatoryWorkspace
// - MedicalWritingWorkspace

// ═══════════════════════════════════════════════════════════════════════════════
// SHERPA SYSTEM CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sherpa Personas - The Council of Advisors
 */
export const SHERPA_PERSONAS = {
  EXPEDITION_LEADER: {
    id: 'expedition-leader',
    name: 'Expedition Leader',
    role: 'Primary Navigator & Strategist',
    avatar: '🧭',
    color: 'indigo',
    description: 'Guides overall regulatory strategy and submission pathways',
    capabilities: ['strategy', 'planning', 'risk-assessment', 'timeline-management'],
  },
  CAMP_MANAGER: {
    id: 'camp-manager',
    name: 'Camp Manager',
    role: 'Project Orchestrator',
    avatar: '🏕️',
    color: 'amber',
    description: 'Manages project resources, milestones, and team coordination',
    capabilities: ['project-management', 'resource-allocation', 'milestone-tracking'],
  },
  EQUIPMENT_MANAGER: {
    id: 'equipment-manager',
    name: 'Equipment Manager',
    role: 'Technical Specialist',
    avatar: '🎒',
    color: 'emerald',
    description: 'Handles CMC, specifications, and technical documentation',
    capabilities: ['cmc', 'specifications', 'technical-writing', 'quality'],
  },
  WEATHER_READER: {
    id: 'weather-reader',
    name: 'Weather Reader',
    role: 'Regulatory Intelligence',
    avatar: '🌤️',
    color: 'sky',
    description: 'Monitors regulatory landscape, FDA signals, and market intelligence',
    capabilities: ['regulatory-intel', 'fda-monitoring', 'competitive-analysis'],
  },
  TRAIL_MEDIC: {
    id: 'trail-medic',
    name: 'Trail Medic',
    role: 'Safety & Compliance',
    avatar: '⛑️',
    color: 'rose',
    description: 'Ensures safety compliance, pharmacovigilance, and risk mitigation',
    capabilities: ['safety', 'pharmacovigilance', 'risk-management', 'compliance'],
  },
} as const;

export type SherpaPersonaId = keyof typeof SHERPA_PERSONAS;

/**
 * Canvas zone definitions
 */
export const CANVAS_ZONES = {
  BRIEFING: 'briefing',
  COUNCIL: 'council',
  WORKSPACE: 'workspace',
} as const;
