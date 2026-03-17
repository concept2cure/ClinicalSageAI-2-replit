/**
 * Concept2Cure Enablement Platform
 * Dr. Sage + AnA 1.0 dual-AI enablement, adoption, and orchestration layer
 */

// Core
export { EnablementCenter } from './EnablementCenter';
export { default as EnablementCenterDefault } from './EnablementCenter';

// Data models
export type {
  LearningPath,
  LearningModule,
  Certification,
  ReleaseNote,
  WorkflowScenario,
  WorkflowStep,
  DrSageAction,
  ContextProfile,
  AIMode,
} from './enablement-data';

export {
  LEARNING_PATHS,
  LEARNING_MODULES,
  CERTIFICATIONS,
  RELEASE_NOTES,
  WORKFLOW_SCENARIOS,
  COMING_SOON_FEATURES,
  MODULE_CATEGORIES,
  MODULE_FILTERS,
} from './enablement-data';

// Dual-AI Theater — live collaboration showcase
export { DualAITheater, THEATER_SCENARIOS } from './DualAITheater';
export type { TheaterMessage, TheaterScenario, DualAITheaterProps } from './DualAITheater';

// First-Run Onboarding Experience
export { default as FirstRunExperience } from './FirstRunExperience';

// Achievement Celebrations
export {
  AchievementProvider,
  useAchievements,
  AchievementToast,
} from './AchievementCelebration';

// Before/After Interactive Comparison
export { BeforeAfterSlider, COMPARISON_PRESETS } from './BeforeAfterSlider';

// Capability Constellation Map
export { CapabilityConstellation, CAPABILITY_NODES } from './CapabilityConstellation';
export type { CapabilityNode, CapabilityConstellationProps } from './CapabilityConstellation';

// Micro-Missions
export { MissionCard, MissionRunner, MissionBrowser, MICRO_MISSIONS } from './MicroMissions';
export type { MicroMission, MissionStep } from './MicroMissions';

// AI Agent Modules (lazy-loaded from EnablementCenter)
export { default as AgentShowcase } from './AgentShowcase';
export { default as AgentSetupWizard } from './AgentSetupWizard';
export { default as AgentWorkflowMonitor } from './AgentWorkflowMonitor';
