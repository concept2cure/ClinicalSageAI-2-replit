/**
 * Concept2Cure - Main Module Index
 * 
 * Claude.ai-style regulatory intelligence interface.
 * Version 3.0: Zen Minimalist UX
 */

// Main apps
export { Concept2CureApp, default } from './App';
export { ZenApp } from './ZenApp';

// Router (handles auth + main app routing)
export { ZenRouter } from './router';

// Auth Components
export { ZenLogin, ZenSignup, ZenAuthLayout } from './auth';

// Layouts re-export removed — the folder was deleted during the Phase 1
// design-system port and nothing imports from here yet.

// Design System
export * from './design';

// Components
export * from './components';

// Services (Cortex connectivity). Has @ts-nocheck internally; the
// services/index.ts re-exports Citation and SubmissionType which
// collide with the same names on ./types. Skip the wildcard and
// re-export only the non-conflicting shapes.
export {
  cortexService,
  regulatoryIntelligenceService,
  medicalDeviceService,
  documentIntelligenceService,
  cmcService,
} from './services';

// Context
export { ProjectProvider, useProject } from './context/ProjectContext';

// Hooks
export * from './hooks';

// Types
export * from './types';
