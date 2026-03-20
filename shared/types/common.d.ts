/**
 * Global type augmentations and common interface definitions
 * for the Concept2Cure.RI application
 */

import type * as React from 'react';

// ============================================================================
// React Component Prop Types
// ============================================================================

/**
 * Base props for all components with children
 */
interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Common status types used across the application
 */
type DocumentStatus =
  | 'draft'
  | 'in-progress'
  | 'pending'
  | 'approved'
  | 'under_review'
  | 'rejected'
  | 'published'
  | 'completed';

type WorkflowStepStatus =
  | 'COMPLETED'
  | 'PENDING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'AWAITING_SIGNATURE'
  | 'SKIPPED'
  | 'BLOCKED'
  | 'FAILED';

// ============================================================================
// API Response Types
// ============================================================================

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// Document Types
// ============================================================================

interface BaseDocument {
  id: string;
  title: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

interface EvidenceFile extends BaseDocument {
  file_name: string;
  file_type: string;
  file_size: number;
  category?: string;
  module?: string;
}

interface IntelligentDocument extends BaseDocument {
  type: string;
  content: string;
  complianceStatus?: string;
  complianceScore?: number;
  lastEditedBy: string;
  lastEditedAt: string;
  version: number;
  module?: string;
  section?: string;
}

// ============================================================================
// Workflow Types
// ============================================================================

interface WorkflowStep {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  stepType: string;
  order: number;
  isRequired: boolean;
  completedAt?: string;
  completedBy?: string;
}

interface DataBridgeConnection {
  id: string;
  sourceModule: string;
  targetDocumentId: string;
  dataType: string;
  dataLabel: string;
  status: string;
  itemCount?: number;
  preview?: string;
}

// ============================================================================
// Device Data Types
// ============================================================================

interface DeviceDataStats {
  totalFiles: number;
  approvedFiles: number;
  underReview: number;
  gaps: number;
  files: EvidenceFile[];
  completed?: number;
}

// ============================================================================
// Form Types
// ============================================================================

interface FDAForm {
  id: string;
  name: string;
  formNumber: string;
  status: DocumentStatus;
  data?: Record<string, any>;
  submittedAt?: string;
}

interface FormGeneratorData {
  forms: FDAForm[];
}

// ============================================================================
// Intelligence Types
// ============================================================================

interface IntelligenceMetrics {
  trialSuccess?: number;
  timeReduction?: number;
  costSavings?: number;
  complianceScore?: number;
}

interface INDNarrativeData {
  narratives: Array<{
    id: string;
    section: string;
    content: string;
    status: string;
  }>;
  length?: number;
  map?: <T>(fn: (item: any, index: number) => T) => T[];
}

// ============================================================================
// Export all types globally
// ============================================================================

export {
  BaseComponentProps,
  DocumentStatus,
  WorkflowStepStatus,
  ApiResponse,
  PaginatedResponse,
  BaseDocument,
  EvidenceFile,
  IntelligentDocument,
  WorkflowStep,
  DataBridgeConnection,
  DeviceDataStats,
  FDAForm,
  FormGeneratorData,
  IntelligenceMetrics,
  INDNarrativeData,
};

// Make types available globally
declare global {
  type DocumentStatus = DocumentStatus;
  type WorkflowStepStatus = WorkflowStepStatus;

  interface Window {
    __CLINICAL_SAGE_CONFIG__?: {
      apiBaseUrl?: string;
      organizationId?: string;
      userId?: string;
    };
  }
}
