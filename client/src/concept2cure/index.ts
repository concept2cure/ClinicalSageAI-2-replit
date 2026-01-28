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

// Layouts
export * from './layouts';

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
export * from './types';
