/**
 * Database Entity Types
 * Auto-generated type declarations that match the database schema
 */

// ============================================================================
// Core Entity Types
// ============================================================================

export interface Organization {
  id: number;
  name: string;
  slug: string;
  type?: string;
  settings?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: number;
  email: string;
  name?: string;
  role: string;
  organizationId: number;
  password?: string;
  avatar?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: number;
  name: string;
  title?: string;
  description?: string;
  status: string;
  type?: string;
  organizationId: number;
  userId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: number;
  title: string;
  name?: string;
  content?: string;
  type?: string;
  status: string;
  version: number;
  projectId?: number;
  organizationId?: number;
  folderId?: number;
  moduleId?: string;
  sectionId?: string;
  contentHash?: string;
  metadata?: Record<string, any>;
  createdBy?: string;
  lastModifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CSR (Clinical Study Report) Types
// ============================================================================

export interface CSRReport {
  id: number;
  organizationId: number;
  clientWorkspaceId?: number;
  reportId: string;
  reportTitle: string;
  reportType?: string;
  studyId?: string;
  status: string;
  submissionDate?: Date;
  dueDate?: Date;
  uploadDate: Date;
  content?: Record<string, any>;
  metadata?: Record<string, any>;
  complianceStatus?: string;
  regulatoryAgency?: string;
  // Computed/virtual fields (may not exist in DB but used in code)
  title?: string;
  sponsor?: string;
  indication?: string;
  phase?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CSRDetails {
  id: number;
  csrReportId: number;
  studyDesign?: string;
  primaryEndpoint?: string;
  secondaryEndpoints?: string[];
  sampleSize?: number;
  duration?: string;
  results?: Record<string, any>;
  conclusions?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Study Session Types
// ============================================================================

export interface StudySession {
  id: number;
  sessionId: string;
  userId?: number;
  organizationId?: number;
  projectId?: number;
  studyType?: string;
  status: string;
  parameters?: Record<string, any>;
  results?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Summary/Insight Types
// ============================================================================

export interface SummaryPacket {
  id: number;
  title: string;
  content?: string;
  type?: string;
  status: string;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsightMemory {
  id: number;
  insightId: string;
  content: string;
  type?: string;
  category?: string;
  relevanceScore?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WisdomTrace {
  id: number;
  traceId: string;
  insight: string;
  source?: string;
  confidence?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Regulatory/Compliance Types
// ============================================================================

export interface RegulatorySubmission {
  id: number;
  submissionId: string;
  type: string;
  status: string;
  agency?: string;
  targetDate?: Date;
  submissionDate?: Date;
  projectId?: number;
  organizationId?: number;
  documents?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceRecord {
  id: number;
  recordId: string;
  type: string;
  status: string;
  score?: number;
  findings?: Record<string, any>[];
  recommendations?: string[];
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Task/Workflow Types
// ============================================================================

export interface Task {
  id: number;
  taskId: string;
  title: string;
  description?: string;
  type?: string;
  status: string;
  priority?: string;
  assigneeId?: number;
  projectId?: number;
  organizationId?: number;
  dueDate?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowInstance {
  id: number;
  workflowId: string;
  name: string;
  status: string;
  currentStep?: number;
  totalSteps?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// FDA/Device Types
// ============================================================================

export interface FDA510kSubmission {
  id: number;
  submissionNumber?: string;
  deviceName: string;
  deviceClass?: string;
  productCode?: string;
  regulatoryClass?: string;
  predicateDevice?: string;
  status: string;
  applicantName?: string;
  decisionDate?: Date;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceProfile {
  id: number;
  deviceId: string;
  name: string;
  description?: string;
  category?: string;
  manufacturer?: string;
  modelNumber?: string;
  specifications?: Record<string, any>;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Audit/Logging Types
// ============================================================================

export interface AuditLog {
  id: number;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: number;
  organizationId?: number;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface EventLog {
  id: number;
  eventType: string;
  payload: Record<string, any>;
  processed: boolean;
  processedAt?: Date;
  createdAt: Date;
}

// ============================================================================
// Client/Tenant Types
// ============================================================================

export interface ClientWorkspace {
  id: number;
  name: string;
  slug: string;
  organizationId: number;
  settings?: Record<string, any>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantConfig {
  id: number;
  tenantId: number;
  key: string;
  value: any;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Analytics/Statistics Types
// ============================================================================

export interface AnalyticsMetric {
  id: number;
  metricName: string;
  metricValue: number;
  metricType: string;
  dimensions?: Record<string, any>;
  projectId?: number;
  organizationId?: number;
  timestamp: Date;
  createdAt: Date;
}

export interface HistoricalData {
  durationMedian?: number;
  durationMean?: number;
  successRate?: number;
  sampleSize?: number;
  confidenceInterval?: [number, number];
}

// ============================================================================
// Protocol Types
// ============================================================================

export interface Protocol {
  id: number;
  protocolId: string;
  title: string;
  version?: string;
  status: string;
  phase?: string;
  indication?: string;
  sponsor?: string;
  principalInvestigator?: string;
  synopsis?: string;
  objectives?: Record<string, any>;
  endpoints?: Record<string, any>;
  studyDesign?: Record<string, any>;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Section/Module Types
// ============================================================================

export interface Section {
  id: number;
  sectionId: string;
  title: string;
  content?: string;
  status: string;
  version: number;
  parentId?: number;
  moduleId?: string;
  order?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  canonical?: boolean;
  regionScope?: string;
  slug?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModuleConfig {
  id: number;
  moduleId: string;
  name: string;
  description?: string;
  type?: string;
  enabled: boolean;
  settings?: Record<string, any>;
  organizationId?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Evidence/Literature Types
// ============================================================================

export interface Evidence {
  id: number;
  evidenceId: string;
  title: string;
  type: string;
  source?: string;
  content?: string;
  citation?: string;
  url?: string;
  relevanceScore?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LiteratureEntry {
  id: number;
  entryId: string;
  title: string;
  authors?: string[];
  journal?: string;
  publicationDate?: Date;
  abstract?: string;
  doi?: string;
  pmid?: string;
  relevanceScore?: number;
  projectId?: number;
  organizationId?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Helper/Utility Types
// ============================================================================

export type InsertEntity<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateEntity<T> = Partial<Omit<T, 'id' | 'createdAt'>>;
export type EntityWithTimestamps = { createdAt: Date; updatedAt: Date };

// Database query result types
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

// Drizzle-compatible types
export type DrizzleEntity<T> = T & EntityWithTimestamps;

// ============================================================================
// Global exports
// ============================================================================

declare global {
  namespace Database {
    type Organization = Organization;
    type User = User;
    type Project = Project;
    type Document = Document;
    type CSRReport = CSRReport;
    type StudySession = StudySession;
    type Task = Task;
    type Protocol = Protocol;
    type Section = Section;
    type Evidence = Evidence;
    type AuditLog = AuditLog;
  }
}
