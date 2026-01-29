/**
 * @fileoverview Concept2Cure - Main Application Entry
 * @module concept2cure/App
 * @version 2.0.0
 * 
 * @description
 * Claude.ai-style regulatory intelligence interface.
 * This is the main entry point for the new UI.
 * 
 * @compliance
 * - FDA 21 CFR Part 11: Error boundary captures and logs all errors
 * - All user actions are auditable through the API layer
 */

import React from 'react';
import { ZenApp } from './ZenApp';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * Main Concept2Cure Application
 * 
 * @description
 * The Claude.ai-inspired interface for regulatory submissions.
 * 
 * Features:
 * - Projects sidebar with submission types
 * - Split-screen chat + artifacts layout
 * - Persistent project memory (200K context)
 * - Artifact publishing & remixing
 * - Conversation forking
 * - FDA 21 CFR Part 11 compliant audit logging
 * 
 * @example
 * ```tsx
 * <Concept2CureApp />
 * ```
 */
export const Concept2CureApp: React.FC = () => {
  const handleError = (error: Error) => {
    // Additional error handling (e.g., analytics, notifications)
    console.error('[Concept2CureApp] Unhandled error:', error.message);
  };

  return (
    <ErrorBoundary 
      onError={handleError}
      showDetails={process.env.NODE_ENV === 'development'}
    >
      <ZenApp />
    </ErrorBoundary>
  );
};

export default Concept2CureApp;
