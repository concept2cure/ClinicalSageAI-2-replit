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

// Design System
export * from './design';

// Components
export * from './components';

// Services (Cortex connectivity)
export * from './services';

// Context
export { ProjectProvider, useProject } from './context/ProjectContext';

// Hooks
export * from './hooks';

// Types
// `./services` and `./types` both declare `Citation` and `SubmissionType`.
// The richer domain definitions in `./types` are canonical (they back the
// `Project` shape), so re-export them explicitly to resolve the ambiguity.
export type { Citation, SubmissionType } from './types';
export * from './types';
// Explicit re-export to resolve ambiguity with names also surfaced by ./services
export type { Citation, SubmissionType } from './types';
