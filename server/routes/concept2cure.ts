/**
 * Concept2Cure Projects API Routes
 *
 * Enterprise-grade regulatory submission project management API.
 * Implements multi-tenant isolation and FDA 21 CFR Part 11 compliance.
 *
 * @module server/routes/concept2cure
 * @version 3.1.0
 *
 * Security Architecture:
 * - Authentication via authMiddleware (JWT/API Key)
 * - Multi-tenant isolation via organizationId enforcement
 * - RBAC permission checks on sensitive operations
 * - Redis-based distributed rate limiting
 *
 * FDA 21 CFR Part 11 Compliance:
 * - All mutations logged to persistent audit trail
 * - Electronic signature support
 * - Tamper-evident integrity hashing (SHA-256)
 * - Input validation (Zod schemas) on all endpoints
 * - Version-controlled artifacts with immutable history
 *
 * Data Architecture:
 * - PostgreSQL persistence via Drizzle ORM
 * - Transaction support for data integrity
 * - Soft deletes for regulatory compliance
 * - Full database persistence for conversations/artifacts
 */

import { Router, Request, Response } from 'express';
import DOMPurifyImport from 'isomorphic-dompurify';
import {
  concept2cureRateLimiter,
  getClientIp,
  getOrganizationId,
  getUserId,
  logConcept2cureError,
  paramStr,
  sanitizeContent,
  sendError,
  sendSuccess,
  logAuditEntry,
  calculateContentHash,
  type AuditEntry,
  type Conversation,
  type Message,
} from './c2c/shared';
import {
  getActorRole,
  getProjectScope,
  isMissingTableError,
  loadProjectAccessRow,
  loadProjectSharingState,
  normalizeProjectSettings,
  resolveClientWorkspaceId,
  verifyProjectAccess,
} from './c2c/project-access';
import { z } from 'zod';
import { eq, desc, and, isNull, inArray } from 'drizzle-orm';
import { db, pool } from '../db';
import { createScopedLogger } from '../utils/logger';
import { authMiddleware } from '../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../middleware/tenantContext';
import { cacheResponse } from '../middleware/enterprise-performance';
const DOMPurify = (DOMPurifyImport as any).default || DOMPurifyImport;
import multer from 'multer';
import path from 'path';
import {
  regulatoryAuditLogs,
  projects,
  users,
  organizationUsers,
  projectMembers,
  projectVisibilitySettings,
  concept2cureConversations,
  concept2cureMessages,
  concept2cureArtifacts,
  concept2cureArtifactVersions,
  concept2cureSignatures,
  concept2cureProvenanceEvents,
  concept2cureSubmissionSnapshots,
  concept2cureReviewTasks,
  projectActivities,
} from '../../shared/schema';
import * as crypto from 'crypto';
import { computeConversationHealth } from '../services/conversation-health.js';
import {
  getProjectRetrievalMode,
  refreshProjectRetrievalMode,
} from '../services/projects/retrieval-mode.js';
import { extractUploadedText } from '../services/projects/extract-text.js';
import { ingestContextualChunks } from '../services/projects/contextual-ingest.js';
import { resolveGovernedContext } from '../services/concept2cure/governedDocumentContractService';
import {
  buildWorkingMemoryPrompt,
  storeWorkingMemory,
  getLatestWorkingMemory,
  formatWorkingMemoryForPrompt,
} from '../services/working-memory.js';
import {
  applyProjectSharingState,
  canManageProject,
  canUseProject,
  getProjectSharingState,
} from '../services/project-sharing-access';

const logger = createScopedLogger('concept2cure-api');
const router = Router();


import { ai } from '../lib/unified-ai-client';
import { parseIntegerProjectId } from '../lib/project-id.js';


// ─────────────────────────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE CHAIN
// Apply in order: rate limit → auth → tenant context → organization check
// ─────────────────────────────────────────────────────────────────────────────


// Apply middleware stack to all routes
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

// ─────────────────────────────────────────────────────────────────────────────
// FDA 21 CFR PART 11 AUDIT LOGGING (DATABASE-BACKED)
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Calculate SHA-256 hash for electronic signature integrity.
 */

/**
 * Verify the integrity chain of an artifact's version history.
 * Recomputes SHA-256 for each version's content and verifies it matches the stored hash.
 * Returns detailed verification results.
 */


function normalizeKnowledge(settings: Record<string, unknown>): ProjectKnowledge {
  const knowledge =
    settings.knowledge && typeof settings.knowledge === 'object'
      ? (settings.knowledge as Record<string, unknown>)
      : {};

  const documents = Array.isArray(knowledge.documents)
    ? (knowledge.documents as UploadedDocument[])
    : [];
  const customInstructions =
    typeof settings.customInstructions === 'string'
      ? settings.customInstructions
      : typeof knowledge.customInstructions === 'string'
      ? knowledge.customInstructions
      : '';
  const context = typeof knowledge.context === 'string' ? knowledge.context : '';
  const memoryEnabled =
    typeof knowledge.memoryEnabled === 'boolean' ? knowledge.memoryEnabled : false;

  return {
    documents,
    customInstructions,
    context,
    memoryEnabled,
  };
}

interface ConnectedAppRecord {
  appId: string;
  connectedAt: string;
  status: 'active' | 'paused';
  memoryRole?: string;
}

function normalizeConnectedApps(settings: Record<string, unknown>): ConnectedAppRecord[] {
  const apps = settings.connectedApps;
  return Array.isArray(apps) ? (apps as ConnectedAppRecord[]) : [];
}

function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes * 0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SubmissionTypeEnum — accepts either a known legacy type or any non-empty string.
 * Legacy aliases (FDA_510K) are normalized. New registry-based types pass through.
 */
const SubmissionTypeEnum = z
  .string()
  .min(1, 'Submission type is required')
  .max(50)
  .transform(val => (val === 'FDA_510K' ? '510K' : val));

// Registry-driven instruction builder replaces hardcoded templates.
// Works for every application type in the Global Document Registry.
import { buildInstructionsFromLegacyType } from '../services/regulatory/defaultInstructionBuilder.js';

function generateDefaultCustomInstructions(
  submissionType: string,
  product?: string | null,
  projectName?: string
): string {
  return buildInstructionsFromLegacyType(submissionType, product, projectName);
}
const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Name too long'),
  submissionType: SubmissionTypeEnum,
  description: z.string().max(2000, 'Description too long').optional(),
  customInstructions: z.string().max(5000).optional(),
  targetSubmissionDate: z.string().datetime().optional(),
  sponsor: z.string().max(200).optional(),
  product: z.string().max(200).optional(),
  region: z.string().max(100).optional(),
  pinned: z.boolean().optional(),
  targetAgency: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
    .optional(),
  /** New: canonical registry ID (e.g., 'US_IND', 'EU_MAA') — takes precedence over submissionType for bootstrap */
  registryId: z.string().max(50).optional(),
  /** New: registry-driven metadata fields */
  applicationFamily: z.string().max(50).optional(),
  applicationType: z.string().max(100).optional(),
  agency: z.string().max(50).optional(),
  country: z.string().max(100).optional(),
  productClass: z.string().max(50).optional(),
  dossierStandard: z.string().max(20).optional(),
  lifecycleStage: z.string().max(30).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const projectVisibilitySchema = z.object({
  visibility: z.enum(['private', 'org_public']),
});

const upsertProjectMemberSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(['use', 'edit']),
});

const updateKnowledgeSchema = z
  .object({
    customInstructions: z.string().max(5000).optional(),
    context: z.string().max(20000).optional(),
    memoryEnabled: z.boolean().optional(),
  })
  .partial();

const ownershipPreferencesSchema = z
  .object({
    projectInstructions: z.string().max(5000).optional(),
    reusableSnippetsKnowledge: z.array(z.string().max(2000)).max(200).optional(),
    currentWorkbenchContext: z
      .enum([
        'project-home',
        'regulatory-workspace',
        'documents',
        'review',
        'review-readiness',
        'submissions',
        'section-workspace',
        'report-engine',
      ])
      .optional(),
  })
  .partial();

const projectCollaboratorSchema = z.object({
  userId: z.number().int().positive(),
  permission: z.enum(['can_use', 'can_edit']),
});

const updateProjectCollaboratorsSchema = z.object({
  collaborators: z.array(projectCollaboratorSchema).max(100),
});

const errorLogSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  error: z.string().min(1).max(2000),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
});

const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const allowedKnowledgeMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'document');
  return base.replace(/[^\w.\-() ]+/g, '_');
}


// ─────────────────────────────────────────────────────────────────────────────
// DATABASE-BACKED DATA TYPES
// These types map to database tables for persistent, multi-tenant storage
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Generated artifact stored with version history.
 */

interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  tokenCount?: number;
  pageCount?: number;
  status?: string;
  /** Whether this document is active in the AI context window (default: true) */
  isActive?: boolean;
}

interface ProjectKnowledge {
  documents: UploadedDocument[];
  customInstructions?: string;
  context?: string;
  memoryEnabled?: boolean;
}

interface OwnershipReportRef {
  id: string;
  title: string;
  kind: 'artifact_report' | 'submission_snapshot';
  status: 'draft' | 'in_review' | 'approved' | 'published';
  updatedAt?: string;
}

type WorkbenchMode = 'draft' | 'review' | 'compliance' | 'submission' | 'analysis' | string;

interface ProjectOwnership {
  chatHistory: Conversation[];
  documentInventory: UploadedDocument[];
  vaultLinkedFilesEvidence: UploadedDocument[];
  projectInstructions: string;
  ownershipTeam?: Array<{ userId: number; permission: 'can_use' | 'can_edit' }>;
  connectedAppsContext: string;
  reusableSnippetsKnowledge: string[];
  reports: string[];
  reviewState: string;
  approvals: Array<Record<string, unknown>>;
  readinessState: string;
  activityHistory: AuditEntry[];
  currentWorkbenchContext: string;
}

function buildProjectOwnership(
  conversations: Conversation[],
  settings: Record<string, unknown>
): ProjectOwnership {
  const knowledge = normalizeKnowledge(settings);
  const ownership =
    settings.ownership && typeof settings.ownership === 'object'
      ? (settings.ownership as Record<string, unknown>)
      : {};

  return {
    chatHistory: conversations,
    documentInventory: knowledge.documents,
    vaultLinkedFilesEvidence: Array.isArray(ownership.vaultLinkedFilesEvidence)
      ? (ownership.vaultLinkedFilesEvidence as UploadedDocument[])
      : [],
    projectInstructions:
      (typeof settings.customInstructions === 'string' ? settings.customInstructions : '') ||
      (typeof ownership.projectInstructions === 'string' ? ownership.projectInstructions : ''),
    ownershipTeam: Array.isArray(ownership.ownershipTeam)
      ? (ownership.ownershipTeam as Array<{ userId: number; permission: 'can_use' | 'can_edit' }>)
      : [],
    connectedAppsContext: (() => {
      const apps = normalizeConnectedApps(settings);
      return apps
        .filter(a => a.status === 'active' && a.memoryRole)
        .map(a => a.memoryRole)
        .join('\n');
    })(),
    reusableSnippetsKnowledge: Array.isArray(ownership.reusableSnippetsKnowledge)
      ? (ownership.reusableSnippetsKnowledge as string[])
      : [],
    reports: Array.isArray(ownership.reports) ? (ownership.reports as string[]) : [],
    reviewState: typeof ownership.reviewState === 'string' ? ownership.reviewState : 'draft',
    approvals: Array.isArray(ownership.approvals)
      ? (ownership.approvals as Array<Record<string, unknown>>)
      : [],
    readinessState:
      typeof ownership.readinessState === 'string' ? ownership.readinessState : 'not_started',
    activityHistory: [],
    currentWorkbenchContext:
      typeof ownership.currentWorkbenchContext === 'string'
        ? ownership.currentWorkbenchContext
        : '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT-AWARE DATA ACCESS HELPERS
// All database operations must include organizationId for tenant isolation
// ─────────────────────────────────────────────────────────────────────────────


async function loadProjectSharingStateMap(
  organizationId: number,
  projectRows: Array<{
    id: number;
    ownerId: number | null;
    createdById: number | null;
    settings: unknown;
  }>
): Promise<Map<number, ReturnType<typeof getProjectSharingState>>> {
  const sharingByProjectId = new Map<number, ReturnType<typeof getProjectSharingState>>();
  if (projectRows.length === 0) {
    return sharingByProjectId;
  }

  const fallbackByProjectId = new Map<number, ReturnType<typeof getProjectSharingState>>();
  for (const row of projectRows) {
    fallbackByProjectId.set(
      row.id,
      getProjectSharingState({
        settings: normalizeProjectSettings(row.settings),
        ownerId: row.ownerId ?? null,
        createdById: row.createdById ?? null,
      })
    );
  }

  try {
    const projectIds = projectRows.map(p => p.id);
    const [visibilityRows, memberRows] = await Promise.all([
      db
        .select({
          projectId: projectVisibilitySettings.projectId,
          visibility: projectVisibilitySettings.visibility,
        })
        .from(projectVisibilitySettings)
        .where(
          and(
            eq(projectVisibilitySettings.organizationId, organizationId),
            inArray(projectVisibilitySettings.projectId, projectIds)
          )
        ),
      db
        .select({
          projectId: projectMembers.projectId,
          userId: projectMembers.userId,
          role: projectMembers.role,
          status: projectMembers.status,
          invitedById: projectMembers.invitedById,
          acceptedAt: projectMembers.acceptedAt,
        })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.organizationId, organizationId),
            inArray(projectMembers.projectId, projectIds),
            eq(projectMembers.status, 'active')
          )
        ),
    ]);

    const visibilityByProjectId = new Map<number, 'private' | 'org_public'>();
    for (const row of visibilityRows) {
      visibilityByProjectId.set(row.projectId, row.visibility as 'private' | 'org_public');
    }

    const membersByProjectId = new Map<
      number,
      Array<{
        userId: number;
        role: string;
        status: string;
        invitedById: number | null;
        acceptedAt: Date | null;
      }>
    >();
    for (const row of memberRows) {
      const list = membersByProjectId.get(row.projectId) || [];
      list.push({
        userId: row.userId,
        role: row.role,
        status: row.status,
        invitedById: row.invitedById ?? null,
        acceptedAt: row.acceptedAt ?? null,
      });
      membersByProjectId.set(row.projectId, list);
    }

    for (const row of projectRows) {
      const fallback = fallbackByProjectId.get(row.id)!;
      const members = membersByProjectId.get(row.id);
      sharingByProjectId.set(
        row.id,
        getProjectSharingState({
          settings: {
            projectSharing: {
              visibility: visibilityByProjectId.get(row.id) ?? fallback.visibility,
              members:
                members?.map(m => ({
                  userId: m.userId,
                  role: m.role,
                  status: m.status,
                  addedById: m.invitedById ?? null,
                  addedAt: m.acceptedAt?.toISOString() ?? new Date().toISOString(),
                })) ?? fallback.members,
            },
          },
          ownerId: row.ownerId ?? null,
          createdById: row.createdById ?? null,
        })
      );
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
    for (const row of projectRows) {
      sharingByProjectId.set(row.id, fallbackByProjectId.get(row.id)!);
    }
  }

  return sharingByProjectId;
}

function buildProjectSharingResponse(
  projectId: number,
  sharing: ReturnType<typeof getProjectSharingState>,
  legacyFallbackApplied?: boolean
) {
  return {
    projectId: `proj_${projectId}`,
    visibility: sharing.visibility,
    legacyFallbackApplied: legacyFallbackApplied ?? sharing.legacyFallbackApplied,
    members: sharing.members
      .filter(m => m.status !== 'revoked')
      .map(m => ({
        userId: m.userId,
        role: m.role,
        status: m.status ?? 'active',
        addedById: m.addedById ?? null,
        addedAt: m.addedAt ?? null,
      })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE-BACKED DATA ACCESS
// All conversations and artifacts are persisted to PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get conversations for a project from database.
 */
async function getConversationsFromDb(
  projectId: number,
  organizationId: number
): Promise<Conversation[]> {
  const dbConversations = await db
    .select()
    .from(concept2cureConversations)
    .where(
      and(
        eq(concept2cureConversations.projectId, projectId),
        eq(concept2cureConversations.organizationId, organizationId),
        eq(concept2cureConversations.status, 'active')
      )
    )
    .orderBy(desc(concept2cureConversations.updatedAt));

  if (dbConversations.length === 0) {
    return [];
  }

  const conversationIds = dbConversations.map(conv => conv.id);
  const dbMessages = await db
    .select()
    .from(concept2cureMessages)
    .where(inArray(concept2cureMessages.conversationId, conversationIds))
    .orderBy(concept2cureMessages.createdAt);

  const messagesByConversationId = new Map<number, Message[]>();
  for (const message of dbMessages) {
    const list = messagesByConversationId.get(message.conversationId) || [];
    list.push({
      id: message.messageId,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp: message.createdAt,
      attachments: message.attachments as Message['attachments'],
      artifactId: message.artifactId || undefined,
      edited: message.edited || false,
    });
    messagesByConversationId.set(message.conversationId, list);
  }

  return dbConversations.map(conv => ({
    id: conv.conversationId,
    projectId: `proj_${conv.projectId}`,
    title: conv.title,
    messages: messagesByConversationId.get(conv.id) || [],
    parentConversationId: conv.parentConversationId?.toString(),
    forkMessageIndex: conv.forkMessageIndex || undefined,
    threadId: conv.threadId || undefined,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  }));
}

async function getOwnershipDerivationData(
  projectIds: number[],
  organizationId: number
): Promise<{
  approvalsByProject: Map<number, Array<Record<string, unknown>>>;
  reviewTasksByProject: Map<number, Array<{ status: string | null; taskType: string | null }>>;
  reportsByProject: Map<number, OwnershipReportRef[]>;
  activitiesByProject: Map<number, AuditEntry[]>;
}> {
  const approvalsByProject = new Map<number, Array<Record<string, unknown>>>();
  const reviewTasksByProject = new Map<
    number,
    Array<{ status: string | null; taskType: string | null }>
  >();
  const reportsByProject = new Map<number, OwnershipReportRef[]>();
  const activitiesByProject = new Map<number, AuditEntry[]>();

  if (projectIds.length === 0) {
    return { approvalsByProject, reviewTasksByProject, reportsByProject, activitiesByProject };
  }

  const signatureRows = await db
    .select({
      projectId: concept2cureArtifacts.projectId,
      signatureId: concept2cureSignatures.signatureId,
      signerName: concept2cureSignatures.signerName,
      signedAt: concept2cureSignatures.signedAt,
      signatureMeaning: concept2cureSignatures.signatureMeaning,
      signatureHash: concept2cureSignatures.signatureHash,
    })
    .from(concept2cureSignatures)
    .innerJoin(
      concept2cureArtifacts,
      eq(concept2cureSignatures.artifactId, concept2cureArtifacts.id)
    )
    .where(
      and(
        inArray(concept2cureArtifacts.projectId, projectIds),
        eq(concept2cureSignatures.organizationId, organizationId),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    );
  for (const row of signatureRows) {
    const list = approvalsByProject.get(row.projectId) || [];
    list.push({
      signerId: row.signatureId,
      signerName: row.signerName,
      signedAt: row.signedAt?.toISOString(),
      meaning: row.signatureMeaning || 'Approved',
      signatureHash: row.signatureHash,
    });
    approvalsByProject.set(row.projectId, list);
  }

  const reviewRows = await db
    .select({
      projectId: concept2cureReviewTasks.projectId,
      status: concept2cureReviewTasks.status,
      taskType: concept2cureReviewTasks.taskType,
    })
    .from(concept2cureReviewTasks)
    .where(
      and(
        inArray(concept2cureReviewTasks.projectId, projectIds),
        eq(concept2cureReviewTasks.orgId, organizationId)
      )
    );
  for (const row of reviewRows) {
    const list = reviewTasksByProject.get(row.projectId) || [];
    list.push({ status: row.status, taskType: row.taskType });
    reviewTasksByProject.set(row.projectId, list);
  }

  const artifactReportRows = await db
    .select({
      projectId: concept2cureArtifacts.projectId,
      artifactId: concept2cureArtifacts.artifactId,
      title: concept2cureArtifacts.title,
      status: concept2cureArtifacts.status,
      updatedAt: concept2cureArtifacts.updatedAt,
      type: concept2cureArtifacts.type,
    })
    .from(concept2cureArtifacts)
    .where(
      and(
        inArray(concept2cureArtifacts.projectId, projectIds),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    );
  for (const row of artifactReportRows) {
    const lowerType = row.type?.toLowerCase() || '';
    const isReportLike = lowerType.includes('report') || lowerType.includes('summary');
    if (!isReportLike) continue;
    const list = reportsByProject.get(row.projectId) || [];
    list.push({
      id: row.artifactId,
      title: row.title,
      kind: 'artifact_report',
      status: (row.status as OwnershipReportRef['status']) || 'draft',
      updatedAt: row.updatedAt?.toISOString(),
    });
    reportsByProject.set(row.projectId, list);
  }

  const snapshotRows = await db
    .select({
      projectId: concept2cureArtifacts.projectId,
      snapshotId: concept2cureSubmissionSnapshots.snapshotId,
      title: concept2cureSubmissionSnapshots.title,
      actionType: concept2cureSubmissionSnapshots.actionType,
      createdAt: concept2cureSubmissionSnapshots.createdAt,
    })
    .from(concept2cureSubmissionSnapshots)
    .innerJoin(
      concept2cureArtifacts,
      eq(concept2cureSubmissionSnapshots.artifactId, concept2cureArtifacts.id)
    )
    .where(
      and(
        inArray(concept2cureArtifacts.projectId, projectIds),
        eq(concept2cureSubmissionSnapshots.organizationId, organizationId),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    );
  for (const row of snapshotRows) {
    const list = reportsByProject.get(row.projectId) || [];
    list.push({
      id: row.snapshotId,
      title: row.title,
      kind: 'submission_snapshot',
      status: row.actionType === 'publish' ? 'published' : 'approved',
      updatedAt: row.createdAt?.toISOString(),
    });
    reportsByProject.set(row.projectId, list);
  }

  const activityRows = await db
    .select({
      projectId: projectActivities.projectId,
      id: projectActivities.id,
      createdAt: projectActivities.createdAt,
      userId: projectActivities.userId,
      activityType: projectActivities.activityType,
      entityType: projectActivities.entityType,
      entityId: projectActivities.entityId,
      description: projectActivities.description,
    })
    .from(projectActivities)
    .where(
      and(
        inArray(projectActivities.projectId, projectIds),
        eq(projectActivities.organizationId, organizationId)
      )
    )
    .orderBy(desc(projectActivities.createdAt))
    .limit(500);
  for (const row of activityRows) {
    const list = activitiesByProject.get(row.projectId) || [];
    if (list.length >= 50) continue;
    list.push({
      id: `project_activity_${row.id}`,
      timestamp: row.createdAt?.toISOString() || new Date().toISOString(),
      userId: row.userId?.toString() || 'system',
      userName: 'project-activity',
      action: (row.activityType?.toUpperCase() as AuditEntry['action']) || 'UPDATE',
      entityType: (row.entityType as AuditEntry['entityType']) || 'project',
      entityId: row.entityId || `proj_${row.projectId}`,
      newValue: { description: row.description },
    });
    activitiesByProject.set(row.projectId, list);
  }

  const projectEntityIds = projectIds.map(id => `proj_${id}`);
  const auditRows = await db
    .select({
      entityId: regulatoryAuditLogs.entityId,
      timestamp: regulatoryAuditLogs.timestamp,
      userId: regulatoryAuditLogs.userId,
      userName: regulatoryAuditLogs.userName,
      action: regulatoryAuditLogs.action,
      entityType: regulatoryAuditLogs.entityType,
    })
    .from(regulatoryAuditLogs)
    .where(
      and(
        eq(regulatoryAuditLogs.organizationId, organizationId),
        eq(regulatoryAuditLogs.entityType, 'project'),
        inArray(regulatoryAuditLogs.entityId, projectEntityIds)
      )
    )
    .orderBy(desc(regulatoryAuditLogs.timestamp))
    .limit(500);
  for (const row of auditRows) {
    const numeric = parseIntegerProjectId(row.entityId);
    if (numeric === null) continue;
    const list = activitiesByProject.get(numeric) || [];
    if (list.length >= 50) continue;
    list.push({
      id: `audit_${row.entityId}_${row.timestamp?.toISOString() || Date.now()}`,
      timestamp: row.timestamp?.toISOString() || new Date().toISOString(),
      userId: row.userId?.toString() || 'system',
      userName: row.userName || 'unknown',
      action: (row.action as AuditEntry['action']) || 'UPDATE',
      entityType: (row.entityType as AuditEntry['entityType']) || 'project',
      entityId: row.entityId || `proj_${numeric}`,
    });
    activitiesByProject.set(numeric, list);
  }

  return { approvalsByProject, reviewTasksByProject, reportsByProject, activitiesByProject };
}

/**
 * Get artifacts for a project from database.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ROUTES (DATABASE-BACKED WITH TENANT ISOLATION)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects
 * List all projects for the current user within their organization.
 *
 * @security Bearer token required
 * @param req.tenantContext.organizationId - Required organization context
 * @returns {Project[]} Array of projects sorted by updatedAt descending
 */
router.get(
  '/projects',
  // The organization half of the key is supplied by cacheResponse itself.
  // This read used to be `(req as any).organizationId`, which the global /api
  // gate never sets, so every tenant keyed to `projects:undefined`.
  cacheResponse({ ttl: 30_000, keyGenerator: () => 'projects' }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const actorRole = getActorRole(req);
      const clientWorkspaceId = await resolveClientWorkspaceId(req);

      // Use raw SQL to avoid Drizzle ORM schema mismatch (parent_project_id doesn't exist in DB)
      const result = await pool.query(
        `SELECT id, name, description, status, type, metadata, settings, created_at, updated_at, created_by_id, owner_id
       FROM projects
       WHERE organization_id = $1
         AND client_workspace_id = $2
         AND actual_end_date IS NULL
       ORDER BY updated_at DESC
       LIMIT 100`,
        [organizationId, clientWorkspaceId]
      );

      // Batch-load all conversations for all projects (2 queries total instead of 2*N)
      const projectIds = result.rows.map((p: any) => p.id);
      const allConversationsByProject = new Map<number, Conversation[]>();
      if (projectIds.length > 0) {
        const allDbConvs = await db
          .select()
          .from(concept2cureConversations)
          .where(
            and(
              inArray(concept2cureConversations.projectId, projectIds),
              eq(concept2cureConversations.organizationId, organizationId),
              eq(concept2cureConversations.status, 'active')
            )
          )
          .orderBy(desc(concept2cureConversations.updatedAt));

        if (allDbConvs.length > 0) {
          const convIds = allDbConvs.map(c => c.id);
          const allDbMsgs = await db
            .select()
            .from(concept2cureMessages)
            .where(inArray(concept2cureMessages.conversationId, convIds))
            .orderBy(concept2cureMessages.createdAt);

          const msgsByConv = new Map<number, Message[]>();
          for (const m of allDbMsgs) {
            const list = msgsByConv.get(m.conversationId) || [];
            list.push({
              id: m.messageId,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: m.createdAt,
              attachments: m.attachments as Message['attachments'],
              artifactId: m.artifactId || undefined,
              edited: m.edited || false,
            });
            msgsByConv.set(m.conversationId, list);
          }

          for (const conv of allDbConvs) {
            const list = allConversationsByProject.get(conv.projectId) || [];
            list.push({
              id: conv.conversationId,
              projectId: `proj_${conv.projectId}`,
              title: conv.title,
              messages: msgsByConv.get(conv.id) || [],
              parentConversationId: conv.parentConversationId?.toString(),
              forkMessageIndex: conv.forkMessageIndex || undefined,
              threadId: conv.threadId || undefined,
              createdAt: conv.createdAt,
              updatedAt: conv.updatedAt,
            });
            allConversationsByProject.set(conv.projectId, list);
          }
        }
      }

      const sharingByProjectId = await loadProjectSharingStateMap(
        organizationId,
        result.rows.map((p: any) => ({
          id: p.id,
          ownerId: p.owner_id ?? null,
          createdById: p.created_by_id ?? null,
          settings: p.settings,
        }))
      );

      const response = result.rows
        .filter((p: any) => {
          const sharing =
            sharingByProjectId.get(p.id) ??
            getProjectSharingState({
              settings: normalizeProjectSettings(p.settings),
              ownerId: p.owner_id ?? null,
              createdById: p.created_by_id ?? null,
            });
          const settingsWithSharing = applyProjectSharingState(
            normalizeProjectSettings(p.settings),
            sharing
          );
          return canUseProject({
            actor: { userId, orgRole: actorRole },
            project: {
              createdById: p.created_by_id ?? null,
              ownerId: p.owner_id ?? null,
              settings: settingsWithSharing,
            },
          });
        })
        .map((p: any) => {
          const conversations = allConversationsByProject.get(p.id) || [];
          return {
            id: `proj_${p.id}`,
            name: p.name,
            submissionType: p.metadata?.submissionType || p.type || 'IND',
            description: p.description,
            status: p.status || 'active',
            sponsor: p.metadata?.sponsor,
            product: p.metadata?.product,
            region: p.metadata?.region,
            pinned: (p.metadata as any)?.pinned ?? false,
            targetAgency: (p.metadata as any)?.targetAgency ?? null,
            color: (p.metadata as any)?.color ?? null,
            organizationId,
            conversations,
            ownership: buildProjectOwnership(conversations, normalizeProjectSettings(p.settings)),
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            sharing: buildProjectSharingResponse(
              p.id,
              sharingByProjectId.get(p.id) ??
                getProjectSharingState({
                  settings: normalizeProjectSettings(p.settings),
                  ownerId: p.owner_id ?? null,
                  createdById: p.created_by_id ?? null,
                })
            ),
          };
        });

      return sendSuccess(res, response);
    } catch (error: any) {
      logger.error('Failed to fetch projects', {
        error: error.message,
        organizationId: req.tenantContext?.organizationId,
      });
      return sendError(res, 500, 'Failed to fetch projects');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:id
 * Get a single project by ID with tenant isolation.
 *
 * @security Bearer token required
 * @param req.params.id - Project ID (with or without 'proj_' prefix)
 */
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const clientWorkspaceId = await resolveClientWorkspaceId(req);
    const scope = getProjectScope(req.params.id);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }
    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId,
      projectId: scope.numericId,
      userId,
      actorRole,
    });
    const project = projectAccess.project;

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const conversations = await getConversationsFromDb(project.id, organizationId);
    const sharing = await loadProjectSharingState(scope.numericId, organizationId, {
      ownerId: project.ownerId ?? null,
      createdById: project.createdById ?? null,
      settings: project.settings,
    });

    // Transform to API response with DB conversations
    const response = {
      id: `proj_${project.id}`,
      name: project.name,
      submissionType: (project.metadata as any)?.submissionType || 'IND',
      description: project.description,
      sponsor: (project.metadata as any)?.sponsor,
      product: (project.metadata as any)?.product,
      region: (project.metadata as any)?.region,
      pinned: (project.metadata as any)?.pinned ?? false,
      targetAgency: (project.metadata as any)?.targetAgency ?? null,
      color: (project.metadata as any)?.color ?? null,
      customInstructions: (project.settings as any)?.customInstructions,
      status: project.status,
      organizationId: project.organizationId,
      conversations,
      ownership: buildProjectOwnership(conversations, settings),
      sharing: buildProjectSharingResponse(
        project.id,
        sharing,
        projectAccess.legacyFallbackApplied
      ),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    return sendSuccess(res, response);
  } catch (error: any) {
    logger.error('Failed to fetch project', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project');
  }
});

/**
 * Returns submission-type-aware suggested actions for display after project creation.
 */
function getSuggestedActionsForType(
  submissionType: string
): Array<{ id: string; label: string; command: string }> {
  const base = [
    { id: 'dossier-map', label: 'Start Dossier Map', command: '/dossier' },
    { id: 'add-docs', label: 'Add Documents', command: '/upload' },
    { id: 'readiness', label: 'Run Readiness Check', command: '/readiness' },
  ];

  const upperType = (submissionType ?? '').toUpperCase();

  // Device submissions
  if (['510K', 'PMA', 'DE_NOVO'].includes(upperType)) {
    return [...base, { id: 'predicates', label: 'Find Predicates', command: '/predicates' }];
  }

  // Drug submissions
  if (['IND', 'NDA', 'BLA', 'ANDA'].includes(upperType)) {
    return [
      ...base,
      { id: 'clinical-review', label: 'Review Clinical Data', command: '/clinical' },
    ];
  }

  // EU submissions
  if (['MAA', 'IVDR'].includes(upperType)) {
    return [...base, { id: 'regulatory-path', label: 'Map Regulatory Path', command: '/pathway' }];
  }

  // Default (EUA or unknown)
  return [...base, { id: 'strategy', label: 'Define Strategy', command: '/strategy' }];
}

/**
 * POST /api/concept2cure/projects
 * Create a new project with tenant isolation.
 *
 * @security Bearer token required
 * @body {name, submissionType, description?, customInstructions?}
 */
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const clientWorkspaceId = await resolveClientWorkspaceId(req);
    const data = createProjectSchema.parse(req.body);

    // Auto-populate custom instructions based on registry entry or submission type
    if (!data.customInstructions) {
      data.customInstructions = generateDefaultCustomInstructions(
        data.submissionType,
        data.product,
        data.name
      );
    }

    // Sanitize user input
    const sanitizedData = {
      name: sanitizeContent(data.name),
      description: data.description ? sanitizeContent(data.description) : null,
      customInstructions: sanitizeContent(data.customInstructions),
    };

    // Insert into database with tenant context
    const [newProject] = await db
      .insert(projects)
      .values({
        organizationId,
        clientWorkspaceId,
        name: sanitizedData.name,
        description: sanitizedData.description,
        type: 'concept2cure',
        status: 'planning',
        createdById: userId,
        ownerId: userId,
        metadata: {
          submissionType: data.submissionType,
          registryId: data.registryId ?? null,
          applicationFamily: data.applicationFamily ?? null,
          applicationType: data.applicationType ?? null,
          agency: data.agency ?? data.targetAgency ?? null,
          country: data.country ?? null,
          productClass: data.productClass ?? null,
          dossierStandard: data.dossierStandard ?? null,
          lifecycleStage: data.lifecycleStage ?? null,
          targetSubmissionDate: data.targetSubmissionDate,
          sponsor: data.sponsor,
          product: data.product,
          region: data.region,
          pinned: data.pinned ?? false,
          targetAgency: data.targetAgency ?? null,
          color: data.color ?? null,
        },
        settings: {
          customInstructions: sanitizedData.customInstructions,
          ownership: {
            chatHistory: [],
            documentInventory: [],
            vaultLinkedFilesEvidence: [],
            projectInstructions: sanitizedData.customInstructions || '',
            reusableSnippetsKnowledge: [],
            reports: [],
            reviewState: 'draft',
            approvals: [],
            readinessState: 'not_started',
            activityHistory: [],
            currentWorkbenchContext: '',
          },
        },
      })
      .returning();

    await db
      .insert(projectVisibilitySettings)
      .values({
        organizationId,
        projectId: newProject.id,
        visibility: 'private',
        updatedById: userId,
      })
      .onConflictDoNothing();

    await db
      .insert(projectMembers)
      .values({
        organizationId,
        projectId: newProject.id,
        userId,
        role: 'owner',
        status: 'active',
        invitedById: userId,
        acceptedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: {
          role: 'owner',
          status: 'active',
          invitedById: userId,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    const projectId = `proj_${newProject.id}`;

    // Log audit entry for 21 CFR Part 11 compliance
    await logAuditEntry(req, 'CREATE', 'project', projectId, null, {
      name: sanitizedData.name,
      submissionType: data.submissionType,
      organizationId,
    });

    // Create initial AnA conversation thread for the project
    const initialThreadId = `thread_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // Transform response
    const sharing = {
      visibility: 'private' as const,
      members: [
        {
          userId,
          role: 'owner' as const,
          status: 'active' as const,
          addedById: userId,
          addedAt: new Date().toISOString(),
        },
      ],
      legacyFallbackApplied: false,
    };

    const response = {
      id: projectId,
      name: newProject.name,
      submissionType: data.submissionType,
      registryId: data.registryId ?? null,
      applicationFamily: data.applicationFamily ?? null,
      applicationType: data.applicationType ?? null,
      description: newProject.description,
      sponsor: data.sponsor,
      product: data.product,
      region: data.region,
      agency: data.agency ?? data.targetAgency ?? null,
      dossierStandard: data.dossierStandard ?? null,
      conversations: [],
      ownership: buildProjectOwnership([], normalizeProjectSettings(newProject.settings)),
      sharing,
      status: newProject.status,
      organizationId: newProject.organizationId,
      pinned: (newProject.metadata as any)?.pinned ?? false,
      targetAgency: (newProject.metadata as any)?.targetAgency ?? null,
      createdAt: newProject.createdAt,
      updatedAt: newProject.updatedAt,
      initialThreadId,
      suggestedActions: getSuggestedActionsForType(data.submissionType),
    };

    logger.info('Created new project', {
      projectId,
      name: newProject.name,
      organizationId,
    });

    // Post-creation: initialize intelligence profile and CTD sections (blocking)
    await Promise.allSettled([
      // Create intelligence profile
      (async () => {
        try {
          const { getOrCreateProfile } = await import(
            '../services/intelligence/project-intelligence-service.js'
          );
          await getOrCreateProfile(newProject.id, organizationId);
          logger.info('Auto-created intelligence profile', { projectId });
        } catch (err) {
          logger.error('[projects] Failed to auto-create intelligence profile:', err);
        }
      })(),
      // Initialize sections based on registry (or fallback to IND for backward compat)
      (async () => {
        try {
          const { bootstrapFromRegistry } = await import(
            '../services/regulatory/projectBootstrapFromRegistry.js'
          );
          const bootstrapResult = await bootstrapFromRegistry({
            registryId: data.registryId,
            submissionType: data.submissionType,
            product: data.product,
            projectName: data.name,
          });

          if (bootstrapResult && bootstrapResult.sections.length > 0) {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              let inserted = 0;
              for (const section of bootstrapResult.sections) {
                await client.query(
                  `INSERT INTO project_sections
                     (organization_id, project_id, section_code, module, title, status, estimated_hours, priority, metadata)
                   VALUES ($1, $2, $3, $4, $5, 'not_started', $6, $7, $8)
                   ON CONFLICT DO NOTHING`,
                  [
                    organizationId,
                    newProject.id,
                    section.sectionCode,
                    section.module,
                    section.title,
                    section.estimatedHours,
                    section.priority,
                    JSON.stringify(section.metadata),
                  ]
                );
                inserted++;
              }
              await client.query('COMMIT');
              logger.info('Auto-initialized sections from registry', {
                projectId,
                registryId: bootstrapResult.entry.id,
                sectionsInserted: inserted,
                usedDeepAdapter: bootstrapResult.usedDeepAdapter,
              });
            } catch (err) {
              await client.query('ROLLBACK');
              throw err;
            } finally {
              client.release();
            }

            // Persist the blueprint's milestones as canonical board tasks.
            // `bootstrapResult.milestones` was computed and then thrown away,
            // so every new project began with a populated section tree and a
            // completely empty task board (assessment D22). Deterministic
            // task_id (project + milestone id) keeps this idempotent;
            // best-effort so a milestone failure never fails project creation.
            try {
              let milestonesInserted = 0;
              for (const milestone of bootstrapResult.milestones ?? []) {
                const r = await pool.query(
                  `INSERT INTO unified_tasks
                     (task_id, organization_id, project_id, module_type, title,
                      description, task_type, category, priority, status,
                      source_entity_type, source_entity_id, created_by_id,
                      created_at, updated_at)
                   VALUES ($1, $2, $3, 'Regulatory', $4, $5, 'milestone',
                           'regulatory', 'high', 'pending', 'registry_blueprint',
                           $6, $7, NOW(), NOW())
                   ON CONFLICT (task_id) DO NOTHING`,
                  [
                    `TASK-BP-${newProject.id}-${milestone.id}`,
                    organizationId,
                    newProject.id,
                    milestone.title,
                    milestone.description || '',
                    `${bootstrapResult.entry.id}:${milestone.id}`,
                    userId ?? null,
                  ]
                );
                milestonesInserted += r.rowCount ?? 0;
              }
              if (milestonesInserted > 0) {
                logger.info('Seeded blueprint milestones onto the task board', {
                  projectId,
                  registryId: bootstrapResult.entry.id,
                  milestonesInserted,
                });
              }
            } catch (milestoneErr) {
              logger.warn('Blueprint milestone seeding failed (non-fatal)', {
                projectId,
                error:
                  milestoneErr instanceof Error ? milestoneErr.message : String(milestoneErr),
              });
            }
          } else {
            // Fallback: use legacy IND sections if registry bootstrap returned nothing
            const { getAllINDSections } = await import(
              '../../services/regulatory/ind-ectd-sections.js'
            );
            const allSections = getAllINDSections();
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              let inserted = 0;
              for (const section of allSections) {
                await client.query(
                  `INSERT INTO project_sections
                     (organization_id, project_id, section_code, module, title, status, estimated_hours, priority, metadata)
                   VALUES ($1, $2, $3, $4, $5, 'not_started', $6, $7, $8)
                   ON CONFLICT DO NOTHING`,
                  [
                    organizationId,
                    newProject.id,
                    section.code,
                    section.module,
                    section.title,
                    section.estimatedHours,
                    section.required ? 'high' : 'medium',
                    JSON.stringify({
                      required: section.required,
                      requiredForAmendment: section.requiredForAmendment,
                      aiDraftable: section.aiDraftable,
                      authoringMode: section.authoringMode,
                      role: section.role,
                      regulatoryRef: section.regulatoryRef,
                      format: section.format,
                      parentCode: section.parentCode,
                      depth: section.depth,
                    }),
                  ]
                );
                inserted++;
              }
              await client.query('COMMIT');
              logger.info('Auto-initialized CTD sections (legacy fallback)', {
                projectId,
                sectionsInserted: inserted,
              });
            } catch (err) {
              await client.query('ROLLBACK');
              throw err;
            } finally {
              client.release();
            }
          }
        } catch (err) {
          logger.error('[projects] Failed to auto-initialize sections:', err);
        }
      })(),
      // Create initial AnA conversation thread with onboarding message
      (async () => {
        try {
          const productName = data.product || newProject.name;
          const submissionLabel = data.submissionType || 'regulatory';
          const onboardingContent = `I've set up your ${submissionLabel} project for ${productName}. What would you like to work on first?\n\nI can help you map your CTD structure, identify predicate devices, run a readiness assessment, or start drafting sections.`;

          await pool.query(
            `INSERT INTO ai_threads (id, organization_id, project_id, title, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [
              initialThreadId,
              organizationId,
              newProject.id,
              `${productName} — Getting Started`,
              userId,
            ]
          );

          await pool.query(
            `INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, 'assistant', $2)`,
            [initialThreadId, onboardingContent]
          );

          logger.info('Auto-created initial AnA thread', { projectId, threadId: initialThreadId });
        } catch (err: any) {
          if (err?.code !== '42P01') {
            logger.error('[projects] Failed to auto-create initial AnA thread:', err);
          } else {
            logger.warn(
              '[projects] ai_threads/ai_messages table missing — skipping onboarding thread'
            );
          }
        }
      })(),
    ]).catch(() => {}); // guard: each task logs its own failure

    return sendSuccess(res.status(201), response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logConcept2cureError('create project', error, {
      organizationId: req.tenantContext?.organizationId,
    });
    return sendError(res, 500, 'Failed to create project');
  }
});

/**
 * PUT /api/concept2cure/projects/:id
 * Update a project with tenant isolation.
 *
 * @security Bearer token required
 * @param req.params.id - Project ID
 */
router.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.id).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const data = updateProjectSchema.parse(req.body);

    // First fetch existing project to verify ownership and capture previous state
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    // Prepare sanitized update data
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name) updateData.name = sanitizeContent(data.name);
    if (data.description !== undefined)
      updateData.description = data.description ? sanitizeContent(data.description) : null;

    if (
      data.submissionType ||
      data.targetSubmissionDate ||
      data.sponsor !== undefined ||
      data.product !== undefined ||
      data.region !== undefined ||
      data.pinned !== undefined ||
      data.targetAgency !== undefined ||
      data.color !== undefined
    ) {
      updateData.metadata = {
        ...((existing.metadata as object) || {}),
        ...(data.submissionType && { submissionType: data.submissionType }),
        ...(data.targetSubmissionDate && { targetSubmissionDate: data.targetSubmissionDate }),
        ...(data.sponsor !== undefined && {
          sponsor: data.sponsor ? sanitizeContent(data.sponsor) : null,
        }),
        ...(data.product !== undefined && {
          product: data.product ? sanitizeContent(data.product) : null,
        }),
        ...(data.region !== undefined && {
          region: data.region ? sanitizeContent(data.region) : null,
        }),
        ...(data.pinned !== undefined && { pinned: data.pinned }),
        ...(data.targetAgency !== undefined && {
          targetAgency: data.targetAgency ? sanitizeContent(data.targetAgency) : null,
        }),
        ...(data.color !== undefined && { color: data.color }),
      };
    }

    if (data.customInstructions !== undefined) {
      updateData.settings = {
        ...((existing.settings as object) || {}),
        customInstructions: data.customInstructions
          ? sanitizeContent(data.customInstructions)
          : null,
      };
    }

    // Update with tenant isolation
    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    // Log audit entry for 21 CFR Part 11 compliance
    await logAuditEntry(req, 'UPDATE', 'project', req.params.id, existing, updated);

    // Transform response with DB conversations
    const conversations = await getConversationsFromDb(numericId, organizationId);
    const response = {
      id: paramStr(req.params.id),
      name: updated.name,
      submissionType: (updated.metadata as any)?.submissionType || 'IND',
      description: updated.description,
      sponsor: (updated.metadata as any)?.sponsor,
      product: (updated.metadata as any)?.product,
      region: (updated.metadata as any)?.region,
      conversations,
      ownership: buildProjectOwnership(conversations, normalizeProjectSettings(updated.settings)),
      status: updated.status,
      pinned: (updated.metadata as any)?.pinned ?? false,
      targetAgency: (updated.metadata as any)?.targetAgency ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    logger.info('Updated project', { projectId: req.params.id, organizationId });
    return sendSuccess(res, response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project', { error: error.message, projectId: req.params.id });
    return sendError(res, 500, 'Failed to update project');
  }
});

router.patch('/projects/:id/ownership-preferences', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.id).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);
    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const payload = ownershipPreferencesSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(existing.settings);
    const ownership =
      settings.ownership && typeof settings.ownership === 'object'
        ? (settings.ownership as Record<string, unknown>)
        : {};
    const existingPreferences =
      ownership.preferences && typeof ownership.preferences === 'object'
        ? (ownership.preferences as Record<string, unknown>)
        : {};

    const nextPreferences = {
      projectInstructions:
        payload.projectInstructions !== undefined
          ? sanitizeContent(payload.projectInstructions)
          : (existingPreferences.projectInstructions as string) ||
            (ownership.projectInstructions as string) ||
            '',
      reusableSnippetsKnowledge:
        payload.reusableSnippetsKnowledge !== undefined
          ? payload.reusableSnippetsKnowledge.map(sanitizeContent)
          : Array.isArray(existingPreferences.reusableSnippetsKnowledge)
          ? (existingPreferences.reusableSnippetsKnowledge as string[])
          : [],
      currentWorkbenchContext:
        payload.currentWorkbenchContext !== undefined
          ? payload.currentWorkbenchContext
          : (existingPreferences.currentWorkbenchContext as WorkbenchMode) || 'project-home',
    };

    const mergedSettings = {
      ...settings,
      customInstructions: nextPreferences.projectInstructions,
      ownership: {
        ...ownership,
        preferences: nextPreferences,
        projectInstructions: nextPreferences.projectInstructions,
        reusableSnippetsKnowledge: nextPreferences.reusableSnippetsKnowledge,
        currentWorkbenchContext: nextPreferences.currentWorkbenchContext,
      },
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: mergedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    const conversations = await getConversationsFromDb(numericId, organizationId);
    await getOwnershipDerivationData([numericId], organizationId);
    return sendSuccess(res, {
      id: `proj_${updated.id}`,
      name: updated.name,
      submissionType: (updated.metadata as any)?.submissionType || 'IND',
      description: updated.description,
      sponsor: (updated.metadata as any)?.sponsor,
      product: (updated.metadata as any)?.product,
      region: (updated.metadata as any)?.region,
      customInstructions: nextPreferences.projectInstructions,
      status: updated.status,
      organizationId: updated.organizationId,
      conversations,
      ownership: buildProjectOwnership(conversations, normalizeProjectSettings(updated.settings)),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update ownership preferences', { error: error.message });
    return sendError(res, 500, 'Failed to update ownership preferences');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/collaborators
 * Returns current project collaborator permission assignments.
 * @deprecated Use GET /projects/:id/sharing for comprehensive sharing state
 */
router.get('/projects/:projectId/collaborators', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const ownership =
      settings.ownership && typeof settings.ownership === 'object'
        ? (settings.ownership as Record<string, unknown>)
        : {};

    const team = Array.isArray(ownership.ownershipTeam)
      ? (ownership.ownershipTeam as Array<{ userId: number; permission: 'can_use' | 'can_edit' }>)
      : [];
    const normalizedTeam = team.filter(
      member =>
        Number.isInteger(member?.userId) &&
        member.userId > 0 &&
        (member.permission === 'can_use' || member.permission === 'can_edit')
    );

    const memberIds = normalizedTeam.map(member => member.userId);
    const memberDirectory =
      memberIds.length > 0
        ? await db
            .select({
              userId: users.id,
              name: users.name,
              email: users.email,
            })
            .from(users)
            .where(inArray(users.id, memberIds))
        : [];
    const directoryById = new Map(memberDirectory.map(member => [member.userId, member]));

    const collaborators = normalizedTeam.map(member => ({
      userId: member.userId,
      permission: member.permission,
      name: directoryById.get(member.userId)?.name || null,
      email: directoryById.get(member.userId)?.email || null,
    }));

    return sendSuccess(res, {
      projectId: `proj_${numericId}`,
      collaborators,
    });
  } catch (error: any) {
    logger.error('Failed to fetch project collaborators', {
      error: error.message,
      projectId: paramStr(req.params.projectId),
    });
    return sendError(res, 500, 'Failed to fetch project collaborators');
  }
});

/**
 * GET /api/concept2cure/projects/:id/sharing
 * Retrieve sharing visibility and member assignments for a project.
 */
router.get('/projects/:id/sharing', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.id);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId,
      actorRole,
    });

    if (!projectAccess.project) {
      return sendError(res, 404, 'Project not found');
    }

    const sharing = await loadProjectSharingState(projectAccess.project.id, organizationId);
    if (
      !canUseProject({
        actor: { userId, orgRole: actorRole },
        project: {
          createdById: projectAccess.project.createdById ?? null,
          ownerId: projectAccess.project.ownerId ?? null,
          settings: applyProjectSharingState(
            normalizeProjectSettings(projectAccess.project.settings),
            sharing
          ),
        },
      })
    ) {
      return sendError(res, 403, 'Forbidden');
    }

    return sendSuccess(
      res,
      buildProjectSharingResponse(
        projectAccess.project.id,
        sharing,
        projectAccess.legacyFallbackApplied
      )
    );
  } catch (error: any) {
    logger.error('Failed to fetch project sharing', {
      error: error.message,
      projectId: paramStr(req.params.id),
    });
    return sendError(res, 500, 'Failed to fetch project sharing');
  }
});

/**
 * PUT /api/concept2cure/projects/:projectId/collaborators
 * Replaces project collaborator permission assignments.
 * @deprecated Use PATCH /projects/:id/sharing/visibility + PUT /projects/:id/sharing/members/:userId
 */
router.put('/projects/:projectId/collaborators', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const payload = updateProjectCollaboratorsSchema.parse(req.body);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const uniqueByUser = new Map<number, { userId: number; permission: 'can_use' | 'can_edit' }>();
    for (const collaborator of payload.collaborators) {
      uniqueByUser.set(collaborator.userId, collaborator);
    }
    const collaborators = Array.from(uniqueByUser.values());

    if (collaborators.length > 0) {
      const orgMembers = await db
        .select({ userId: organizationUsers.userId })
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            inArray(
              organizationUsers.userId,
              collaborators.map(entry => entry.userId)
            )
          )
        );
      const allowedIds = new Set(orgMembers.map(member => member.userId));
      const invalidIds = collaborators
        .map(entry => entry.userId)
        .filter(userId => !allowedIds.has(userId));
      if (invalidIds.length > 0) {
        return sendError(
          res,
          400,
          `Collaborator user IDs not in organization: ${invalidIds.join(', ')}`
        );
      }
    }

    const settings = normalizeProjectSettings(project.settings);
    const ownership =
      settings.ownership && typeof settings.ownership === 'object'
        ? (settings.ownership as Record<string, unknown>)
        : {};

    const mergedSettings = {
      ...settings,
      ownership: {
        ...ownership,
        ownershipTeam: collaborators,
      },
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: mergedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${numericId}`, project, {
      collaborators,
      action: 'update_collaborators',
    });

    return sendSuccess(res, {
      projectId: `proj_${numericId}`,
      collaborators,
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project collaborators', {
      error: error.message,
      projectId: paramStr(req.params.projectId),
    });
    return sendError(res, 500, 'Failed to update project collaborators');
  }
});

/**
 * PATCH /api/concept2cure/projects/:id/sharing/visibility
 * Update project visibility policy (private | org_public).
 */
router.patch('/projects/:id/sharing/visibility', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.id);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }
    const { visibility } = projectVisibilitySchema.parse(req.body);

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId,
      actorRole,
    });

    if (!projectAccess.project) {
      return sendError(res, 404, 'Project not found');
    }

    if (
      !canManageProject({
        actor: { userId, orgRole: actorRole },
        project: {
          createdById: projectAccess.project.createdById ?? null,
          ownerId: projectAccess.project.ownerId ?? null,
          settings: normalizeProjectSettings(projectAccess.project.settings),
        },
      })
    ) {
      return sendError(res, 403, 'Forbidden');
    }

    const [existingVisibility] = await db
      .select({
        id: projectVisibilitySettings.id,
      })
      .from(projectVisibilitySettings)
      .where(
        and(
          eq(projectVisibilitySettings.organizationId, organizationId),
          eq(projectVisibilitySettings.projectId, scope.numericId)
        )
      )
      .limit(1);

    if (existingVisibility) {
      await db
        .update(projectVisibilitySettings)
        .set({
          visibility,
          updatedById: userId,
          updatedAt: new Date(),
        })
        .where(eq(projectVisibilitySettings.id, existingVisibility.id));
    } else {
      await db.insert(projectVisibilitySettings).values({
        organizationId,
        projectId: scope.numericId,
        visibility,
        updatedById: userId,
      });
    }

    const sharing = await loadProjectSharingState(scope.numericId, organizationId);
    return sendSuccess(
      res,
      buildProjectSharingResponse(scope.numericId, sharing, projectAccess.legacyFallbackApplied)
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project sharing visibility', {
      error: error.message,
      projectId: paramStr(req.params.id),
    });
    return sendError(res, 500, 'Failed to update project sharing visibility');
  }
});

/**
 * PUT /api/concept2cure/projects/:id/sharing/members/:userId
 * Add/update explicit project member with use/edit role.
 */
router.put('/projects/:id/sharing/members/:userId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const actorUserId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.id);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const pathUserId = Number.parseInt(paramStr(req.params.userId), 10);
    if (!Number.isFinite(pathUserId) || pathUserId <= 0) {
      return sendError(res, 400, 'Invalid member userId', undefined, 'INVALID_ID');
    }

    const payload = upsertProjectMemberSchema.parse({
      userId: pathUserId,
      role: req.body?.role,
    });

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId: actorUserId,
      actorRole,
    });

    if (!projectAccess.project) {
      return sendError(res, 404, 'Project not found');
    }

    if (
      !canManageProject({
        actor: { userId: actorUserId, orgRole: actorRole },
        project: {
          createdById: projectAccess.project.createdById ?? null,
          ownerId: projectAccess.project.ownerId ?? null,
          settings: normalizeProjectSettings(projectAccess.project.settings),
        },
      })
    ) {
      return sendError(res, 403, 'Forbidden');
    }

    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    if (!targetUser) {
      return sendError(res, 404, 'Target user not found');
    }

    const [orgMembership] = await db
      .select({ id: organizationUsers.id })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.organizationId, organizationId),
          eq(organizationUsers.userId, payload.userId)
        )
      )
      .limit(1);
    if (!orgMembership) {
      return sendError(
        res,
        400,
        'Target user is not a member of this organization',
        undefined,
        'ORG_MEMBERSHIP_REQUIRED'
      );
    }

    const [existingMember] = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.organizationId, organizationId),
          eq(projectMembers.projectId, scope.numericId),
          eq(projectMembers.userId, payload.userId)
        )
      )
      .limit(1);

    if (existingMember) {
      await db
        .update(projectMembers)
        .set({
          role: payload.role,
          status: 'active',
          invitedById: actorUserId,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectMembers.id, existingMember.id));
    } else {
      await db.insert(projectMembers).values({
        organizationId,
        projectId: scope.numericId,
        userId: payload.userId,
        role: payload.role,
        status: 'active',
        invitedById: actorUserId,
        acceptedAt: new Date(),
      });
    }

    const sharing = await loadProjectSharingState(scope.numericId, organizationId);
    return sendSuccess(
      res,
      buildProjectSharingResponse(scope.numericId, sharing, projectAccess.legacyFallbackApplied)
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to upsert project member', {
      error: error.message,
      projectId: paramStr(req.params.id),
    });
    return sendError(res, 500, 'Failed to upsert project member');
  }
});

/**
 * DELETE /api/concept2cure/projects/:id/sharing/members/:userId
 * Remove explicit member access from project.
 */
router.delete('/projects/:id/sharing/members/:userId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const actorUserId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.id);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }
    const targetUserId = Number.parseInt(paramStr(req.params.userId), 10);

    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return sendError(res, 400, 'Invalid member userId', undefined, 'INVALID_ID');
    }

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId: actorUserId,
      actorRole,
    });

    if (!projectAccess.project) {
      return sendError(res, 404, 'Project not found');
    }

    if (
      !canManageProject({
        actor: { userId: actorUserId, orgRole: actorRole },
        project: {
          createdById: projectAccess.project.createdById ?? null,
          ownerId: projectAccess.project.ownerId ?? null,
          settings: normalizeProjectSettings(projectAccess.project.settings),
        },
      })
    ) {
      return sendError(res, 403, 'Forbidden');
    }

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.organizationId, organizationId),
          eq(projectMembers.projectId, scope.numericId),
          eq(projectMembers.userId, targetUserId)
        )
      );

    const sharing = await loadProjectSharingState(scope.numericId, organizationId);
    return sendSuccess(
      res,
      buildProjectSharingResponse(scope.numericId, sharing, projectAccess.legacyFallbackApplied)
    );
  } catch (error: any) {
    logger.error('Failed to remove project member', {
      error: error.message,
      projectId: paramStr(req.params.id),
    });
    return sendError(res, 500, 'Failed to remove project member');
  }
});

/**
 * DELETE /api/concept2cure/projects/:id
 * Soft delete a project for 21 CFR Part 11 compliance.
 * Records are never truly deleted - just marked with actualEndDate.
 *
 * @security Bearer token required
 * @param req.params.id - Project ID
 */
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.id);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    // First verify access and capture state for audit
    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId,
      actorRole,
    });
    const existing = projectAccess.project;

    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    // Soft delete by setting actualEndDate (21 CFR Part 11 compliant)
    await db
      .update(projects)
      .set({
        actualEndDate: new Date(),
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, scope.numericId), eq(projects.organizationId, organizationId)));

    // Soft delete related conversations in DB (set status to archived)
    await db
      .update(concept2cureConversations)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(
        and(
          eq(concept2cureConversations.projectId, scope.numericId),
          eq(concept2cureConversations.organizationId, organizationId)
        )
      );

    // Log audit entry for 21 CFR Part 11 compliance
    await logAuditEntry(req, 'DELETE', 'project', req.params.id, existing, null);

    logger.info('Soft-deleted project', { projectId: req.params.id, organizationId });
    return sendSuccess(res, { deleted: true, projectId: req.params.id });
  } catch (error: any) {
    logger.error('Failed to delete project', { error: error.message });
    return sendError(res, 500, 'Failed to delete project');
  }
});

/**
 * POST /api/concept2cure/projects/:id/export
 * Returns a JSON snapshot of the project + linked conversations so the
 * subscriber can back up / share / archive their work. Tenant-scoped,
 * audited as EXPORT.
 */
router.post('/projects/:id/export', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const rawId = String(req.params.id ?? '');
    const numericId = parseIntegerProjectId(rawId);
    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    const conversations = await getConversationsFromDb(numericId, organizationId);
    const snapshot = {
      exportedAt: new Date().toISOString(),
      project: {
        id: rawId,
        name: existing.name,
        description: existing.description,
        status: existing.status,
        metadata: existing.metadata,
        settings: existing.settings,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      },
      conversations,
    };

    await logAuditEntry(req, 'EXPORT', 'project', rawId, existing, snapshot);
    return sendSuccess(res, snapshot);
  } catch (error: any) {
    logger.error('Failed to export project', { error: error.message });
    return sendError(res, 500, 'Failed to export project');
  }
});

/**
 * POST /api/concept2cure/projects/:id/duplicate
 * Clone-as-template: copies name / description / metadata / settings /
 * type / clientWorkspaceId into a new project row. Strips conversations
 * and audit so the copy starts clean. Audited as DUPLICATE on both
 * source and copy ids.
 *
 * Body (optional): { name?: string }   — defaults to "Copy of <orig>"
 */
router.post('/projects/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const rawId = String(req.params.id ?? '');
    const numericId = parseIntegerProjectId(rawId);
    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    const overrideName =
      typeof req.body?.name === 'string' && req.body.name.trim().length > 0
        ? sanitizeContent(req.body.name.trim()).slice(0, 200)
        : `Copy of ${existing.name}`;

    const [created] = await db
      .insert(projects)
      .values({
        organizationId,
        clientWorkspaceId: existing.clientWorkspaceId,
        createdById: userId ?? existing.createdById ?? null,
        name: overrideName,
        description: existing.description,
        type: existing.type,
        status: 'active',
        metadata: existing.metadata,
        settings: existing.settings,
      })
      .returning();

    await logAuditEntry(req, 'DUPLICATE', 'project', `proj_${created.id}`, existing, created);
    return sendSuccess(res, {
      id: `proj_${created.id}`,
      name: created.name,
      description: created.description,
      status: created.status,
      organizationId: created.organizationId,
      sourceProjectId: rawId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error: any) {
    logger.error('Failed to duplicate project', { error: error.message });
    return sendError(res, 500, 'Failed to duplicate project');
  }
});

const transferProjectSchema = z.object({
  targetWorkspaceId: z.string().min(1).max(100).optional(),
  targetUserId: z.number().int().positive().optional(),
  targetEmail: z.string().email().optional(),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
});

/**
 * POST /api/concept2cure/projects/:id/transfer
 * Records the source-side transfer intent + reason and writes an
 * audit row. Full owner-change with double-sided audit lands when the
 * workspace-picker kit ships; until then this endpoint captures the
 * subscriber's intent and the audit trail of who initiated it.
 */
router.post('/projects/:id/transfer', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const rawId = String(req.params.id ?? '');
    const numericId = parseIntegerProjectId(rawId);
    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const data = transferProjectSchema.parse(req.body);
    if (!data.targetWorkspaceId && !data.targetUserId && !data.targetEmail) {
      return sendError(
        res,
        400,
        'One of targetWorkspaceId / targetUserId / targetEmail is required',
        undefined,
        'INVALID_INPUT',
      );
    }

    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    const transferRecord = {
      requestedAt: new Date().toISOString(),
      requestedBy: userId,
      targetWorkspaceId: data.targetWorkspaceId ?? null,
      targetUserId: data.targetUserId ?? null,
      targetEmail: data.targetEmail ?? null,
      reason: sanitizeContent(data.reason),
      status: 'pending' as const,
    };

    const [updated] = await db
      .update(projects)
      .set({
        metadata: {
          ...((existing.metadata as object) || {}),
          transfer: transferRecord,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'TRANSFER', 'project', rawId, existing, updated);
    return sendSuccess(res, { id: rawId, transfer: transferRecord });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return sendError(res, 400, 'Invalid payload', error.errors, 'INVALID_INPUT');
    }
    logger.error('Failed to record transfer', { error: error.message });
    return sendError(res, 500, 'Failed to record transfer');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT KNOWLEDGE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/knowledge
 * Retrieve knowledge base state for a project.
 */
router.get('/projects/:projectId/knowledge', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.projectId);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId,
      actorRole,
    });
    const project = projectAccess.project;

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const knowledge = normalizeKnowledge(settings);
    // A2: surface the retrieval mode (read-through compute when not yet set) so
    // the UI can show the in-context vs retrieval indicator.
    const modeState = await getProjectRetrievalMode(scope.numericId, organizationId);
    return sendSuccess(res, {
      ...knowledge,
      retrievalMode: modeState.mode,
      knowledgeTokenEstimate: modeState.tokenEstimate,
    });
  } catch (error: any) {
    logger.error('Failed to fetch project knowledge', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project knowledge');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/activity
 * Returns a merged activity feed: explicit project_activities + recent artifact updates.
 */
router.get(
  '/projects/:projectId/activity',
  cacheResponse({
    ttl: 30_000,
    // Organization prefix comes from cacheResponse; see /projects above.
    keyGenerator: req => `activity:${req.params.projectId}`,
  }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const numericProjectId = parseIntegerProjectId(req.params.projectId);

      if (numericProjectId === null) {
        return sendError(res, 400, 'Invalid project ID');
      }

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      // Fetch from projectActivities table
      const activities = await pool.query(
        `SELECT pa.id, pa.activity_type, pa.entity_type, pa.entity_id, pa.description, pa.details, pa.created_at,
              u.full_name as user_name, u.email as user_email
       FROM project_activities pa
       LEFT JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = $1 AND pa.organization_id = $2
       ORDER BY pa.created_at DESC
       LIMIT $3`,
        [numericProjectId, organizationId, limit]
      );

      // Also get recently modified artifacts as activity items
      const recentArtifacts = await pool.query(
        `SELECT id, artifact_id, title, status, category, type, updated_at, created_at, version
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC
       LIMIT 10`,
        [numericProjectId, organizationId]
      );

      // Merge and sort by timestamp
      const feed = [
        ...activities.rows.map((a: any) => ({
          id: `act-${a.id}`,
          type: 'activity' as const,
          activityType: a.activity_type,
          entityType: a.entity_type,
          entityId: a.entity_id,
          description: a.description,
          details: a.details,
          userName: a.user_name || a.user_email || 'System',
          timestamp: a.created_at,
        })),
        ...recentArtifacts.rows.map((a: any) => ({
          id: `doc-${a.id}`,
          type: 'document_update' as const,
          activityType: a.version > 1 ? 'update' : 'create',
          entityType: 'document',
          entityId: a.artifact_id || a.id,
          description:
            a.version > 1
              ? `Updated "${a.title || 'Untitled'}" to v${a.version}`
              : `Created "${a.title || 'Untitled'}"`,
          details: { status: a.status, category: a.category, type: a.type },
          userName: null,
          timestamp: a.updated_at || a.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return sendSuccess(res, feed);
    } catch (error: any) {
      logger.error('Failed to fetch project activity', { error: error.message });
      return sendError(res, 500, 'Failed to fetch project activity');
    }
  }
);

// ─── Linked Projects Routes ─────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/linked
 * Returns all typed link relationships for a project (both directions).
 * Joins with concept2cure_projects for name/type/status of the other project.
 * If the table doesn't exist yet (pre-migration deploy), returns [].
 */
router.get('/projects/:projectId/linked', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const numericProjectId = parseIntegerProjectId(req.params.projectId);

    if (numericProjectId === null) {
      return sendError(res, 400, 'Invalid project ID');
    }

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) {
      return sendError(res, 404, 'Project not found');
    }

    let rows: any[] = [];
    try {
      const result = await pool.query(
        `SELECT
           lnk.id,
           lnk.kind,
           lnk.direction AS dir,
           lnk.created_at,
           CASE
             WHEN lnk.source_id = $1 THEN p.name
             ELSE sp.name
           END AS name,
           CASE
             WHEN lnk.source_id = $1 THEN p.metadata->>'submissionType'
             ELSE sp.metadata->>'submissionType'
           END AS type,
           CASE
             WHEN lnk.source_id = $1 THEN p.status
             ELSE sp.status
           END AS status
         FROM concept2cure_project_links lnk
         LEFT JOIN projects p  ON p.id  = lnk.target_id AND p.organization_id  = lnk.org_id
         LEFT JOIN projects sp ON sp.id = lnk.source_id AND sp.organization_id = lnk.org_id
         WHERE lnk.org_id = $2
           AND (lnk.source_id = $1 OR lnk.target_id = $1)
         ORDER BY lnk.created_at DESC`,
        [numericProjectId, organizationId]
      );
      rows = result.rows;
    } catch (tableErr: any) {
      // Table doesn't exist yet (pre-migration deploy) — return empty list.
      if (tableErr.code === '42P01') {
        return sendSuccess(res, []);
      }
      throw tableErr;
    }

    const kindVia: Record<string, string> = {
      predicate:  'Predicate device',
      parent_ind: 'Parent IND',
      child_nda:  'Child NDA',
      cross_ref:  'Cross-reference',
      supplier:   'Supplier',
    };

    const links = rows.map((r: any) => ({
      id:     r.id,
      kind:   r.kind,
      dir:    r.dir as 'in' | 'out',
      name:   r.name   || 'Unknown project',
      type:   r.type   || '',
      status: r.status || 'active',
      via:    kindVia[r.kind] || r.kind,
    }));

    return sendSuccess(res, links);
  } catch (error: any) {
    logger.error('Failed to fetch linked projects', { error: error.message });
    return sendError(res, 500, 'Failed to fetch linked projects');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/linked
 * Creates a new typed link from this project to another.
 * Body: { targetProjectId: string; kind: string; direction?: string }
 */
router.post('/projects/:projectId/linked', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const numericProjectId = parseIntegerProjectId(req.params.projectId);

    if (numericProjectId === null) {
      return sendError(res, 400, 'Invalid project ID');
    }

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) {
      return sendError(res, 404, 'Project not found');
    }

    const { targetProjectId, kind, direction = 'out' } = req.body as {
      targetProjectId: string;
      kind: string;
      direction?: string;
    };

    if (!targetProjectId || !kind) {
      return sendError(res, 400, 'targetProjectId and kind are required');
    }

    const numericTargetId = parseIntegerProjectId(targetProjectId);
    if (numericTargetId === null) {
      return sendError(res, 400, 'Invalid targetProjectId');
    }

    const result = await pool.query(
      `INSERT INTO concept2cure_project_links (org_id, source_id, target_id, kind, direction)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, org_id, source_id, target_id, kind, direction, created_at`,
      [organizationId, numericProjectId, numericTargetId, kind, direction]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create project link', { error: error.message });
    return sendError(res, 500, 'Failed to create project link');
  }
});

// ─── Client-Safe Governance Routes ──────────────────────────────────────────
// These expose governed fabric decisions via project-scoped paths,
// removing the dependency on admin-only /api/control-plane routes.

/**
 * GET /api/concept2cure/projects/:projectId/governance/decisions
 * Client-safe: returns governed decisions for a project.
 * Uses durable storage, not admin-only control-plane.
 */
router.get('/projects/:projectId/governance/decisions', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { getRecentGovernedDecisions } = await import(
      '../services/governed-decision-repository.js'
    );
    const entries = await getRecentGovernedDecisions({
      organizationId: String(organizationId),
      projectId: paramStr(req.params.projectId),
      limit,
    });

    return sendSuccess(res, { entries, count: entries.length });
  } catch (error: any) {
    logger.error('Failed to load governance decisions', { error: error.message });
    return sendError(res, 500, 'Failed to load governance decisions');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/summary
 * Client-safe governance decision summary.
 */
router.get('/projects/:projectId/governance/summary', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { getGovernedDecisionSummary } = await import(
      '../services/governed-decision-repository.js'
    );
    const summary = await getGovernedDecisionSummary({
      organizationId: String(organizationId),
      projectId: paramStr(req.params.projectId),
    });

    return sendSuccess(res, { summary });
  } catch (error: any) {
    logger.error('Failed to load governance summary', { error: error.message });
    return sendError(res, 500, 'Failed to load governance summary');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/artifacts/:artifactId/trace
 * Client-safe artifact decision trace.
 */
router.get('/projects/:projectId/governance/artifacts/:artifactId/trace', async (req: Request, res: Response) => {
  try {
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { getArtifactDecisionTrace } = await import(
      '../services/governed-decision-repository.js'
    );
    const trace = await getArtifactDecisionTrace(
      paramStr(req.params.projectId),
      paramStr(req.params.artifactId)
    );

    return sendSuccess(res, { trace, count: trace.length });
  } catch (error: any) {
    logger.error('Failed to load artifact decision trace', { error: error.message });
    return sendError(res, 500, 'Failed to load artifact decision trace');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/governance/decisions/:decisionId/transition
 * Transition a governed decision through its lifecycle.
 * Body: { action: 'review'|'approve'|'reject'|'escalate'|'defer'|'execute'|'supersede', reason?, escalatedTo?, executedArtifactId?, executedArtifactVersion?, workflowRunId?, supersededByDecisionId? }
 */
router.post('/projects/:projectId/governance/decisions/:decisionId/transition', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { action } = req.body;
    if (!action || typeof action !== 'string') {
      return sendError(res, 400, 'Missing required field: action');
    }

    const validActions = ['review', 'approve', 'reject', 'escalate', 'defer', 'execute', 'supersede'];
    if (!validActions.includes(action)) {
      return sendError(res, 400, `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
    }

    const { handleTransition } = await import('../controllers/governance-controller.js');
    const result = await handleTransition({
      decisionId: paramStr(req.params.decisionId),
      organizationId,
      projectId: Number(req.params.projectId),
      actorId: String(userId),
      action,
      reason: req.body.reason,
      escalatedTo: req.body.escalatedTo,
      executedArtifactId: req.body.executedArtifactId,
      supersededByDecisionId: req.body.supersededByDecisionId,
    });

    if (result && !result.success) {
      return sendError(res, 400, result.error || 'Transition failed');
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Failed to transition governed decision', { error: error.message });
    return sendError(res, 500, 'Failed to transition governed decision');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/decisions/:decisionId/history
 * Get lifecycle transition history for a decision.
 */
router.get('/projects/:projectId/governance/decisions/:decisionId/history', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { handleGetHistory } = await import('../controllers/governance-controller.js');
    const result = await handleGetHistory(paramStr(req.params.decisionId), organizationId);

    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Failed to load decision lifecycle history', { error: error.message });
    return sendError(res, 500, 'Failed to load decision lifecycle history');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/review-queue
 * Returns the project's governed decision review queue — decisions requiring action.
 */
router.get('/projects/:projectId/governance/review-queue', async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { handleGetReviewQueue } = await import('../controllers/governance-controller.js');
    const result = await handleGetReviewQueue(organizationId, Number(req.params.projectId));

    return sendSuccess(res, result);
  } catch (error) {
    return sendError(res, 500, 'Failed to load review queue');
  }
});

/**
 * GET /api/concept2cure/governance/health
 * Returns governance system health — DB reachability, table status, counters, failure rate.
 */
router.get('/governance/health', async (_req, res) => {
  try {
    const { governanceMetrics } = await import('../services/governance-observability.js');
    const { getRevocationHealth } = await import('../services/token-revocation.js');
    const { getBridgeHealth } = await import('../services/artifact-document-bridge.js');

    const [governanceHealth, revocationHealth, bridgeHealth] = await Promise.all([
      governanceMetrics.getHealth(),
      getRevocationHealth(),
      getBridgeHealth(),
    ]);

    return sendSuccess(res, {
      governance: governanceHealth,
      tokenRevocation: revocationHealth,
      documentBridge: bridgeHealth,
    });
  } catch (error: any) {
    logger.error('Failed to check governance health', { error: error.message });
    return sendError(res, 500, 'Failed to check governance health');
  }
});

/**
 * POST /api/concept2cure/maintenance/run
 * Run platform maintenance tasks (token cleanup, bridge integrity, backfill).
 * Requires admin/operator access in production.
 */
router.post('/maintenance/run', async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const { runPlatformMaintenance } = await import('../services/maintenance/platform-maintenance.js');
    const result = await runPlatformMaintenance(organizationId);
    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Maintenance run failed', { error: error.message });
    return sendError(res, 500, 'Maintenance run failed');
  }
});

/**
 * GET /api/concept2cure/startup/invariants
 * Returns startup invariant check results.
 */
router.get('/startup/invariants', async (_req, res) => {
  try {
    const { runStartupInvariants } = await import('../lib/startup-invariants.js');
    const report = await runStartupInvariants();
    return sendSuccess(res, report);
  } catch (error: any) {
    logger.error('Startup invariant check failed', { error: error.message });
    return sendError(res, 500, 'Startup invariant check failed');
  }
});

/**
 * PATCH /api/concept2cure/projects/:projectId/knowledge
 * Update knowledge base metadata (custom instructions, context).
 */
router.patch('/projects/:projectId/knowledge', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.projectId);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const data = updateKnowledgeSchema.parse(req.body);

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId,
      actorRole,
    });
    const project = projectAccess.project;

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const knowledge = normalizeKnowledge(settings);

    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      customInstructions:
        data.customInstructions !== undefined
          ? data.customInstructions
            ? sanitizeContent(data.customInstructions)
            : ''
          : knowledge.customInstructions,
      context:
        data.context !== undefined
          ? data.context
            ? sanitizeContent(data.context)
            : ''
          : knowledge.context,
      memoryEnabled:
        data.memoryEnabled !== undefined ? data.memoryEnabled : knowledge.memoryEnabled,
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, scope.numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updated);
    return sendSuccess(res, updatedKnowledge);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project knowledge', { error: error.message });
    return sendError(res, 500, 'Failed to update project knowledge');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT CONNECTED APPS ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known app IDs — server-side allowlist prevents arbitrary injection.
 *
 * Contains the 20 canonical catalog IDs (post-convergence) plus 9 legacy IDs
 * preserved for back-compat with stored project app connections, saved nav
 * targets, and external action handlers. Legacy IDs are normalized to their
 * canonical equivalents on the client side.
 */
const KNOWN_APP_IDS = new Set([
  // ── Strategy & Research ──
  'deep-research',
  'precedent-intelligence',
  'device-strategy',
  // ── Submission Authoring ──
  'medical-device',
  'ind-authoring',
  'cmc',
  'safety-narrative',
  'report-engine',
  // ── Intelligence & Analysis ──
  'regulatory-intelligence',
  'csr-intelligence',
  'biostatistics',
  'protocol-designer',
  'cortex-prime',
  'foresight-ai',
  'predicate-intelligence',
  // ── Quality & Lifecycle ──
  'device-engineering',
  'dossier-navigator',
  'ectd-navigator',
  'document-vault',
  'sop-management',
  'capa-management',
  'post-market',
  'inspection-readiness',
  // ── Legacy IDs (back-compat) ──
  'cmc-platform',         // → cmc
  'csr-builder',          // → csr-intelligence
  '510k-workspace',       // → medical-device
  'pma-workspace',        // → medical-device
  'cer-generator',        // → medical-device
  'device-pathway',       // → device-strategy
  'q-submission',         // → device-strategy
  'predicate-finder',     // → device-strategy
  'risk-management',      // → device-engineering
  'samd-cybersecurity',   // → device-engineering
  'human-factors',        // → device-engineering
  'biocompatibility',     // → device-engineering
  // ── Pre-existing IDs not in current catalog (preserved) ──
  'compliance-monitor',
  'evidence-engine',
]);

const MAX_CONNECTED_APPS = 20;

const connectAppSchema = z.object({
  appId: z.string().min(1).max(80),
  memoryRole: z.string().max(1000).optional(),
});

/** Build the aggregated memory context string from all active connected apps */
function buildAppMemoryContext(apps: ConnectedAppRecord[]): string {
  return apps
    .filter(a => a.status === 'active' && a.memoryRole)
    .map(a => a.memoryRole)
    .join('\n');
}

/** Merge appContext into the project settings.knowledge object */
function syncKnowledgeAppContext(
  settings: Record<string, unknown>,
  appContext: string
): Record<string, unknown> {
  const knowledge =
    settings.knowledge && typeof settings.knowledge === 'object'
      ? { ...(settings.knowledge as Record<string, unknown>) }
      : {};
  knowledge.appContext = appContext;
  return { ...settings, knowledge };
}

/**
 * GET /api/concept2cure/projects/:projectId/apps
 * List apps connected to this project with metadata.
 */
router.get('/projects/:projectId/apps', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const apps = normalizeConnectedApps(settings);
    return sendSuccess(res, {
      apps,
      totalConnected: apps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    logger.error('Failed to fetch project apps', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project apps');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/apps
 * Connect an app to the project. Validates against known catalog, stores connection,
 * and initializes app's memory role in the project context for AnA.
 */
router.post('/projects/:projectId/apps', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const body = connectAppSchema.parse(req.body);
    const { appId } = body;

    // Validate against known catalog
    if (!KNOWN_APP_IDS.has(appId)) {
      return sendError(res, 400, `Unknown app ID: ${appId}`, undefined, 'UNKNOWN_APP');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const apps = normalizeConnectedApps(settings);

    // Prevent duplicate connections
    if (apps.some(a => a.appId === appId)) {
      return sendError(res, 409, 'App is already connected to this project');
    }

    // Enforce max connected apps
    if (apps.length >= MAX_CONNECTED_APPS) {
      return sendError(
        res,
        400,
        `Maximum of ${MAX_CONNECTED_APPS} connected apps reached. Disconnect one first.`
      );
    }

    // Sanitize memoryRole if provided
    const sanitizedRole = body.memoryRole ? sanitizeContent(body.memoryRole) : undefined;

    const newApp: ConnectedAppRecord = {
      appId,
      connectedAt: new Date().toISOString(),
      status: 'active',
      ...(sanitizedRole ? { memoryRole: sanitizedRole } : {}),
    };

    const updatedApps = [...apps, newApp];
    let updatedSettings: Record<string, unknown> = { ...settings, connectedApps: updatedApps };

    // Rebuild and sync aggregated memory context
    const appContext = buildAppMemoryContext(updatedApps);
    updatedSettings = syncKnowledgeAppContext(updatedSettings, appContext);

    const [updatedProject] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updatedProject);

    logger.info('App connected to project', {
      projectId: numericId,
      appId,
      totalConnected: updatedApps.length,
    });

    return sendSuccess(res, {
      app: newApp,
      totalConnected: updatedApps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to connect app to project', { error: error.message });
    return sendError(res, 500, 'Failed to connect app to project');
  }
});

/**
 * DELETE /api/concept2cure/projects/:projectId/apps/:appId
 * Disconnect an app from the project. Removes its memory role from context.
 */
router.delete('/projects/:projectId/apps/:appId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = paramStr(req.params.projectId).replace('proj_', '');
    const numericId = parseIntegerProjectId(projectId);

    if (numericId === null) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const { appId } = req.params;
    if (!appId || typeof appId !== 'string') {
      return sendError(res, 400, 'appId is required');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const apps = normalizeConnectedApps(settings);
    const removedApp = apps.find(a => a.appId === appId);

    if (!removedApp) {
      return sendError(res, 404, 'App not found in project connections');
    }

    const updatedApps = apps.filter(a => a.appId !== appId);
    let updatedSettings: Record<string, unknown> = { ...settings, connectedApps: updatedApps };

    // Rebuild and sync aggregated memory context (removes this app's role)
    const appContext = buildAppMemoryContext(updatedApps);
    updatedSettings = syncKnowledgeAppContext(updatedSettings, appContext);

    const [updatedProject] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updatedProject);

    logger.info('App disconnected from project', {
      projectId: numericId,
      appId,
      totalConnected: updatedApps.length,
    });

    return sendSuccess(res, {
      disconnected: appId,
      totalConnected: updatedApps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    logger.error('Failed to disconnect app from project', { error: error.message });
    return sendError(res, 500, 'Failed to disconnect app from project');
  }
});

/**
 * POST /api/concept2cure/documents/upload
 * Upload a document and attach to project knowledge.
 */
router.post(
  '/documents/upload',
  knowledgeUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const projectIdRaw = req.body.projectId as string | undefined;
      const file = req.file;

      if (!projectIdRaw) {
        return sendError(res, 400, 'Project ID is required');
      }

      const numericId = parseIntegerProjectId(projectIdRaw);
      if (numericId === null) {
        return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
      }

      if (!file) {
        return sendError(res, 400, 'File is required');
      }

      if (!allowedKnowledgeMimeTypes.has(file.mimetype)) {
        return sendError(res, 400, `Unsupported file type: ${file.mimetype}`);
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
        .limit(1);

      if (!project) {
        return sendError(res, 404, 'Project not found');
      }

      const safeOriginalName = sanitizeFilename(file.originalname);
      const extension = safeOriginalName.split('.').pop()?.toLowerCase() || 'unknown';
      const uploadedAt = new Date();
      const documentId = `doc_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const tokenCount = estimateTokensFromBytes(file.size);

      // ── DOSSIER-AWARE CLASSIFICATION (Phase 1 — Module 3 Workflow Convergence) ──
      // These fields allow callers to classify uploads by dossier module, CTD section,
      // source type, and whether the file feeds Module 3 source extraction.
      // All fields are optional — generic uploads still work without classification.
      const dossierClassification = {
        submissionTrack: req.body.submissionTrack || null,       // IND | NDA | BLA | 510K | PMA | SOP | CER | general
        moduleCode: req.body.moduleCode || null,                 // 1 | 2 | 3 | 4 | 5
        ctdSection: req.body.ctdSection || null,                 // e.g. 3.2.S.4, 3.2.P.8
        documentFamily: req.body.documentFamily || null,         // spec | method | stability | batch | narrative | sop | ref_std | etc.
        sourceType: req.body.sourceType || null,                 // maps to CmcSourceType for Module 3
        tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags]) : [],
        feedsModule3: req.body.feedsModule3 === 'true' || req.body.feedsModule3 === true,
        sourceProcessingMode: req.body.sourceProcessingMode || 'artifact_only', // artifact_only | artifact_plus_source_object
      };

      // Extract real text from PDF/DOCX (and pass through plain text) so binary
      // uploads are searchable in retrieval and the in-context corpus; fall back
      // to a placeholder when extraction yields nothing.
      const extracted = await extractUploadedText(file.buffer, file.mimetype, safeOriginalName);
      const extractedText =
        extracted && extracted.length > 0
          ? extracted
          : `[${file.mimetype} document ${safeOriginalName}]`;

      const document: UploadedDocument = {
        id: documentId,
        name: safeOriginalName,
        type: extension,
        size: file.size,
        uploadedAt: uploadedAt.toISOString(),
        tokenCount,
        status: 'processed',
      };

      // ── CONVERGENCE: create governed source artifact before mutating project knowledge ──
      const userId = getUserId(req);
      const artifactId = `artifact_upload_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const contentForArtifact =
        extractedText && extractedText.length > 10
          ? extractedText
          : `[Uploaded file: ${safeOriginalName}] (${file.mimetype}, ${file.size} bytes)`;
      const contentHash = calculateContentHash(contentForArtifact);
      const uploadGovernedResolution = resolveGovernedContext({
        req,
        projectId: numericId,
        artifactId: null,
        documentType: 'source_document',
        generationMode: 'imported',
        lifecycleStatus: 'draft',
        originSurface: 'import_pipeline',
        clientTrack:
          req.body?.clientTrack === 'device'
            ? 'device'
            : req.body?.clientTrack === 'diagnostics'
            ? 'diagnostics'
            : 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'evidence_memo',
        readinessGate: 'exploratory',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'evidence_analysis',
        placementContainerId: String(numericId),
        title: safeOriginalName,
        content: contentForArtifact,
        sourceRefs: [`upload:${documentId}`],
        provider: 'upload_pipeline',
        model: 'import_handler',
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!uploadGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: uploadGovernedResolution.validation.errors,
            warnings: uploadGovernedResolution.validation.warnings,
            resolved: uploadGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const [newArtifact] = await db
        .insert(concept2cureArtifacts)
        .values({
          organizationId,
          projectId: numericId,
          artifactId,
          type: 'source_document',
          category: 'source',
          title: safeOriginalName,
          content: contentForArtifact,
          contentHash,
          version: 1,
          ctdSection: dossierClassification.ctdSection || undefined,
          metadata: {
            originalName: safeOriginalName,
            mimeType: file.mimetype,
            fileSize: file.size,
            extension,
            tokenCount,
            uploadSource: 'knowledge_upload',
            knowledgeDocumentId: documentId,
            dossierClassification,
            harness: {
              clientTrack: uploadGovernedResolution.contract.clientTrack,
              submissionProgram: uploadGovernedResolution.contract.submissionProgram,
              persona: uploadGovernedResolution.contract.persona,
              regulatorScope: uploadGovernedResolution.contract.regulatorScope,
              documentClass: uploadGovernedResolution.contract.documentClass,
              readinessGate: uploadGovernedResolution.contract.readinessGate,
              workspaceTarget: uploadGovernedResolution.contract.workspaceTarget,
              originSurface: uploadGovernedResolution.contract.originSurface,
              recommendationSource: uploadGovernedResolution.contract.recommendationSource,
              regulatorIntent: uploadGovernedResolution.contract.regulatorIntent,
              gateChecks: uploadGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: uploadGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome:
                uploadGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
          createdById: userId,
        })
        .returning();

      // Version entry
      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: newArtifact.id,
        version: 1,
        content: contentForArtifact,
        contentHash,
        createdById: userId,
      });

      const artifactRecord: { id: number; artifactId: string } = { id: newArtifact.id, artifactId };

      // ── AUTO-EMBED: Insert into lumen_data_atoms + generate embedding ──
      try {
        const atomResult = await pool.query(
          `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'data_room_upload', $2, 'source_document', $3, $4, $5, 0.9, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            organizationId,
            artifactId,
            safeOriginalName,
            contentForArtifact.substring(0, 16000),
            `{source,upload,${extension}${dossierClassification.ctdSection ? `,${dossierClassification.ctdSection}` : ''}${dossierClassification.sourceType ? `,${dossierClassification.sourceType}` : ''}${dossierClassification.feedsModule3 ? ',module3_source' : ''}}`,
          ]
        );
        if (atomResult.rows.length > 0) {
          const atomId = atomResult.rows[0].id;
          const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
          const embeddingService = getEmbeddingService(pool);
          await embeddingService.embedAtom(atomId);
          logger.info('Source document auto-embedded for retrieval', { artifactId, atomId });
        }
      } catch (embedErr: any) {
        logger.warn('Auto-embedding failed (non-fatal)', { error: embedErr.message });
      }

      // ── A3 contextual-retrieval ingest (dark-launched) ──
      // When enabled, also store contextualized chunk atoms (chunk + a per-chunk
      // situating context generated via the gateway) for finer-grained
      // retrieval. Off by default — the per-chunk gateway calls cost tokens, so
      // validate cost/quality before enabling. Fire-and-forget so it never
      // blocks the upload response; additive to the whole-document atom above.
      if (
        process.env.PROJECT_CONTEXTUAL_INGEST_ENABLED === 'true' &&
        extractedText &&
        extractedText.length > 200
      ) {
        void ingestContextualChunks({
          artifactId,
          organizationId,
          title: safeOriginalName,
          text: extractedText,
          ctdSection: dossierClassification.ctdSection,
        });
      }

      // ── Record dossier classification provenance ──
      if (dossierClassification.ctdSection || dossierClassification.feedsModule3) {
        try {
          await pool.query(
            `INSERT INTO concept2cure_provenance_events
               (organization_id, artifact_id, artifact_version_id, event_type, event_action, actor_id, details, backend_route, backend_service)
             VALUES ($1, $2, NULL, 'source_input', 'dossier_classify', $3, $4::jsonb, '/documents/upload', 'upload_pipeline')`,
            [
              organizationId,
              newArtifact.id,
              userId,
              JSON.stringify({
                classification: dossierClassification,
                fileName: safeOriginalName,
                documentId,
              }),
            ]
          );
        } catch (provErr: any) {
          logger.warn('Dossier classification provenance event failed (non-fatal)', { error: provErr.message });
        }
      }

      // ── AUTO-MAP: If feedsModule3, create/update cmc_source_object from uploaded artifact ──
      if (dossierClassification.feedsModule3 && dossierClassification.sourceType) {
        try {
          const { classifyAndMapArtifactToSource } = await import('../services/module3-convergence-service');
          await classifyAndMapArtifactToSource(organizationId, projectIdRaw, artifactId, {
            submissionTrack: (dossierClassification.submissionTrack || 'general') as any,
            dossierModule: dossierClassification.moduleCode,
            ctdSection: dossierClassification.ctdSection,
            sourceType: dossierClassification.sourceType as any,
            useAsModule3Source: true,
            tags: dossierClassification.tags || [],
          });
          logger.info('Auto-mapped uploaded artifact to Module 3 source object', {
            artifactId,
            sourceType: dossierClassification.sourceType,
            ctdSection: dossierClassification.ctdSection,
          });
        } catch (mapErr: any) {
          logger.warn('Module 3 source mapping failed (non-fatal)', { error: mapErr.message });
        }
      }

      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      const updatedKnowledge: ProjectKnowledge = {
        ...knowledge,
        documents: [...knowledge.documents, document],
        customInstructions: knowledge.customInstructions,
        context: knowledge.context,
      };

      const updatedSettings = {
        ...settings,
        customInstructions: updatedKnowledge.customInstructions,
        knowledge: updatedKnowledge,
      };

      const [updated] = await db
        .update(projects)
        .set({ settings: updatedSettings, updatedAt: new Date() })
        .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
        .returning();

      await logAuditEntry(req, 'UPDATE', 'project', projectIdRaw, project, updated);

      // A2: the corpus grew with this upload — recompute the retrieval mode
      // (fire-and-forget; never blocks the upload response).
      void refreshProjectRetrievalMode(numericId, organizationId);

      res.status(201);
      return sendSuccess(res, {
        document,
        extractedText,
        tokenCount,
        artifact: artifactRecord,
      });
    } catch (error: any) {
      logger.error('Failed to upload knowledge document', { error: error.message });
      return sendError(res, 500, 'Failed to upload knowledge document');
    }
  }
);

/**
 * DELETE /api/concept2cure/documents/:documentId
 * Remove a document from project knowledge.
 */
router.delete('/documents/:documentId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = req.params.documentId;

    const dbProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.actualEndDate)));

    const target = dbProjects.find(project => {
      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      return knowledge.documents.some(doc => doc.id === documentId);
    });

    if (!target) {
      return sendError(res, 404, 'Document not found');
    }

    const settings = normalizeProjectSettings(target.settings);
    const knowledge = normalizeKnowledge(settings);
    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      documents: knowledge.documents.filter(doc => doc.id !== documentId),
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, target.id), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${target.id}`, target, updated);

    return sendSuccess(res, { deleted: true, documentId });
  } catch (error: any) {
    logger.error('Failed to delete knowledge document', { error: error.message });
    return sendError(res, 500, 'Failed to delete knowledge document');
  }
});

/**
 * PATCH /api/concept2cure/documents/:documentId/activation
 * Toggle a document's active state in the AI context window (E7).
 * Body: { isActive: boolean }
 */
router.patch('/documents/:documentId/activation', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = req.params.documentId;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return sendError(res, 400, 'isActive must be a boolean');
    }

    const dbProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.actualEndDate)));

    const target = dbProjects.find(project => {
      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      return knowledge.documents.some(doc => doc.id === documentId);
    });

    if (!target) {
      return sendError(res, 404, 'Document not found');
    }

    const settings = normalizeProjectSettings(target.settings);
    const knowledge = normalizeKnowledge(settings);
    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      documents: knowledge.documents.map(doc =>
        doc.id === documentId ? { ...doc, isActive } : doc
      ),
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, target.id), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${target.id}`, target, updated);

    return sendSuccess(res, { documentId, isActive });
  } catch (error: any) {
    logger.error('Failed to toggle document activation', { error: error.message });
    return sendError(res, 500, 'Failed to toggle document activation');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR LOGGING ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/errors
 * Capture client-side errors for audit compliance.
 */
router.post('/errors', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const data = errorLogSchema.parse(req.body);

    await db.insert(regulatoryAuditLogs).values({
      auditId: data.id,
      organizationId,
      entityType: 'system_error',
      entityId: data.id,
      action: 'CREATE',
      actionCategory: 'system',
      previousValue: null,
      newValue: {
        timestamp: data.timestamp,
        error: sanitizeContent(data.error),
        stack: data.stack ? sanitizeContent(data.stack) : null,
        componentStack: data.componentStack ? sanitizeContent(data.componentStack) : null,
        userAgent: data.userAgent || null,
        url: data.url || null,
      },
      userId,
      userName: req.userEmail || 'unknown',
      userRole: req.userRole || 'user',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
      sessionId: (req as any).session?.id || null,
      isGxpRelevant: true,
      metadata: { source: 'client-error' },
    });

    return sendSuccess(res, { logged: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to log client error', { error: error.message });
    return sendError(res, 500, 'Failed to log client error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG QUERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/audit-logs
 * Query persisted audit log entries for the organization.
 */
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { entityType, entityId, limit: limitParam } = req.query;
    const queryLimit = Math.min(Number(limitParam) || 50, 200);

    const query = db
      .select()
      .from(regulatoryAuditLogs)
      .where(eq(regulatoryAuditLogs.organizationId, organizationId))
      .orderBy(desc(regulatoryAuditLogs.timestamp))
      .limit(queryLimit);

    const logs = await query;

    // Filter in-memory for optional entityType/entityId (Drizzle doesn't support dynamic AND easily)
    let filtered = logs;
    if (entityType) {
      filtered = filtered.filter(l => l.entityType === entityType);
    }
    if (entityId) {
      filtered = filtered.filter(l => l.entityId === entityId);
    }

    return sendSuccess(res, {
      total: filtered.length,
      logs: filtered.map(l => ({
        auditId: l.auditId,
        entityType: l.entityType,
        entityId: l.entityId,
        action: l.action,
        actionCategory: l.actionCategory,
        userName: l.userName,
        userRole: l.userRole,
        ipAddress: l.ipAddress,
        isGxpRelevant: l.isGxpRelevant,
        timestamp: l.timestamp,
        previousValue: l.previousValue,
        newValue: l.newValue,
        metadata: l.metadata,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to query audit logs', { error: error.message });
    return sendError(res, 500, 'Failed to query audit logs');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Built-in templates for regulatory documents
const TEMPLATES = [
  {
    id: 'tpl_510k_cover',
    name: '510(k) Cover Letter',
    description: 'FDA-compliant cover letter for 510(k) submissions',
    submissionTypes: ['FDA_510K'],
    category: 'document',
    ctdSection: '1.1',
    content: `Date: <Insert submission date>

Food and Drug Administration
Center for Devices and Radiological Health
Document Control Center
10903 New Hampshire Avenue
Silver Spring, MD 20993-0002

Re: 510(k) Premarket Notification
Device Name: <Insert device name>
Product Code: <Insert product code>
Regulation Number: <Insert regulation number>

Dear Review Team,

<Insert sponsor name> submits this Traditional 510(k) for <Insert device name>. This submission supports a determination of substantial equivalence to <Insert predicate device name> (K<Insert predicate number>).

Submission highlights:
- Intended use and indications for use statement
- Device description and technological characteristics
- Substantial equivalence comparison to predicate device
- Performance testing package (bench, biocompatibility, software, sterilization, and/or clinical evidence as applicable)

This package is organized according to 21 CFR 807.87 and current FDA 510(k) expectations.

Primary contact for this submission:
<Insert contact name, title, email, and phone>

Sincerely,

<Insert authorized signatory name>
<Insert signatory title>
<Insert sponsor legal entity name>`,
  },
  {
    id: 'tpl_510k_summary',
    name: '510(k) Summary',
    description: 'Executive summary for 510(k) device submissions',
    submissionTypes: ['FDA_510K'],
    category: 'document',
    ctdSection: '1.2',
    content: `# 510(k) Summary

## 1. Submitter Information
- **Company**: <Insert sponsor legal name>
- **Address**: <Insert sponsor address>
- **Contact**: <Insert contact name and title>
- **Phone**: <Insert phone number>
- **Email**: <Insert contact email>

## 2. Device Information
- **Device Name**: <Insert device trade name>
- **Common Name**: <Insert common name>
- **Classification Name**: <Insert classification name>
- **Product Code**: <Insert product code>
- **Regulation Number**: <Insert CFR regulation number>

## 3. Predicate Device
- **Device Name**: <Insert primary predicate name>
- **510(k) Number**: K<Insert predicate number>
- **Manufacturer**: <Insert predicate manufacturer>

## 4. Intended Use
State the intended use exactly as presented in labeling and the indications for use form, including target population and setting of use.

## 5. Device Description
Describe the device design, components, materials, principle of operation, user interface, and key accessories. Include software architecture summary when software is part of the device.

## 6. Substantial Equivalence Discussion
Compare intended use, technology, and performance versus the predicate device. Clearly explain any technological differences and why they do not raise new questions of safety or effectiveness.

## 7. Performance Data Summary
Summarize nonclinical and clinical evidence, including bench testing, biocompatibility, electrical safety/EMC, software validation, sterility, shelf life, and human factors/usability as applicable.`,
  },
  {
    id: 'tpl_ind_cover_letter',
    name: 'IND Cover Letter',
    description: 'FDA-aligned IND cover letter for initial and amendment submissions',
    submissionTypes: ['IND'],
    category: 'document',
    ctdSection: '1.2',
    content: `# IND Cover Letter
Date: <Insert submission date>

Food and Drug Administration
Center for Drug Evaluation and Research
<Insert division or office name>

Re: Investigational New Drug Application - <Insert product name>
IND Number: <Insert IND number or "new IND">
Submission Type: <Initial IND | Amendment | Annual Report | Safety Report>

Dear Review Team,

On behalf of <Insert sponsor name>, we submit this <Insert submission type> for <Insert product name>.
This package includes:

- Administrative and regulatory submission materials for this filing
- Relevant nonclinical, clinical, and safety updates for the current reporting period
- Chemistry, manufacturing, and controls updates applicable to this submission

Please contact <Insert contact name and title> at <Insert email and phone> with any questions.

Sincerely,

<Insert signatory name>
<Insert signatory title>
<Insert sponsor name>`,
  },
  {
    id: 'tpl_ind_investigator_brochure',
    name: "Investigator's Brochure (IB)",
    description: 'IND investigator brochure structure aligned to ICH expectations',
    submissionTypes: ['IND'],
    category: 'document',
    ctdSection: '5.3',
    content: `# Investigator's Brochure

## 1. Summary
Provide a concise clinical and nonclinical summary of the investigational product, mechanism of action, and development status.

## 2. Introduction
Describe product background, indication context, and development rationale.

## 3. Physical, Chemical, and Pharmaceutical Properties
Summarize relevant drug substance and drug product characteristics, including formulation and handling information for investigators.

## 4. Nonclinical Studies
Summarize pharmacology, pharmacokinetics, and toxicology findings that inform clinical risk management.

## 5. Effects in Humans
Summarize clinical pharmacology, known efficacy signals, observed safety profile, and important risk considerations.

## 6. Guidance for Investigators
Provide dosing rationale, monitoring expectations, contraindications, and investigator actions for adverse events.

## 7. References
List key source reports, publications, and supporting references used in this brochure.`,
  },
  {
    id: 'tpl_ind_pre_ind_briefing',
    name: 'Pre-IND Briefing Package',
    description: 'Structured FDA pre-IND meeting briefing package template',
    submissionTypes: ['IND'],
    category: 'document',
    ctdSection: '1.2',
    content: `# Pre-IND Briefing Package

## 1. Meeting Request Context
Summarize sponsor, product, indication, and current development stage.

## 2. Product and Development Overview
Provide a concise integrated overview of CMC, nonclinical, and clinical development work completed to date.

## 3. Proposed Clinical Plan
Describe the proposed first-in-human or next-phase plan, including study design rationale and key safety controls.

## 4. Key Questions for FDA
1. Include a focused question on CMC strategy and release readiness.
2. Include a focused question on nonclinical package adequacy.
3. Include a focused question on clinical design, dose justification, and safety monitoring.

## 5. Supporting Summaries
Provide supporting summaries and references for each question area.

## 6. Appendices
Attach key tables, prior correspondence, and reference documents needed for efficient FDA review.`,
  },
  {
    id: 'tpl_ind_protocol',
    name: 'IND Clinical Protocol',
    description: 'Clinical trial protocol template for IND applications',
    submissionTypes: ['IND'],
    category: 'document',
    ctdSection: '5.3.5',
    content: `# Clinical Protocol

## Protocol Number
<Insert protocol number>

## Version
<Insert protocol version and date>

## 1. Protocol Synopsis
| Element | Description |
|---------|-------------|
| Title | <Insert full study title> |
| Phase | <Insert study phase> |
| Sponsor | <Insert sponsor legal name> |
| Indication | <Insert target indication> |
| Primary Objective | <Insert primary objective statement> |

## 2. Background and Rationale
Provide the scientific and clinical rationale for this study, including unmet need, mechanism of action, and supporting nonclinical/clinical evidence.

## 3. Study Objectives
### 3.1 Primary Objective
State one clear, measurable primary objective linked to the primary endpoint and estimand.

### 3.2 Secondary Objectives
List key secondary and exploratory objectives with aligned endpoints and analysis hierarchy.

## 4. Study Design
Describe study design, treatment arms, randomization/blinding approach, visit schedule, dose strategy, and stopping or escalation rules.

## 5. Study Population
### 5.1 Inclusion Criteria
Define clinically justified eligibility criteria that align to the target treatment population.

### 5.2 Exclusion Criteria
Define exclusion criteria focused on patient safety, interpretability, and protocol feasibility.

## 6. Investigational Product
Describe product formulation, route, dose, administration, accountability, storage, and handling requirements.

## 7. Efficacy Assessments
Define endpoint instruments, assessment timing, and adjudication methods where applicable.

## 8. Safety Assessments
Define adverse event capture, laboratory/vitals/ECG schedules, DLT rules, and safety monitoring governance.

## 9. Statistical Analysis
Describe analysis populations, primary model, multiplicity control, missing data strategy, interim analysis, and sensitivity analyses.

## 10. Ethics
Describe informed consent, IRB/IEC oversight, data privacy protections, and protocol compliance with ICH E6 and applicable regulations.`,
  },
  {
    id: 'tpl_cer_summary',
    name: 'Clinical Evaluation Report',
    description: 'EU MDR-compliant CER template',
    submissionTypes: ['MAA'],
    category: 'document',
    ctdSection: '2.7',
    content: `# Clinical Evaluation Report

## Document Information
| Field | Value |
|-------|-------|
| Device | <Insert device name> |
| Manufacturer | <Insert legal manufacturer name> |
| Version | <Insert CER version> |
| Date | <Insert effective date> |
| Author | <Insert author and credentials> |

---

## 1. Executive Summary
Provide a concise conclusion on whether current clinical evidence demonstrates safety, clinical performance, and acceptable benefit-risk for the intended purpose.

## 2. Scope of the Clinical Evaluation
### 2.1 Device Description
Describe device design, key materials, operating principles, variants, and accessories relevant to clinical performance and risk.

### 2.2 Intended Purpose
State intended medical purpose, indications, contraindications, and claims as reflected in current labeling.

### 2.3 Target Population
Define patient population, use environment, and user profile, including special populations where relevant.

## 3. Clinical Background
### 3.1 Current Knowledge
Summarize clinical context, disease burden, and current treatment standards for the intended indication.

### 3.2 State of the Art
Describe accepted state-of-the-art therapies/devices and position this device relative to alternatives.

## 4. Clinical Data Sources
### 4.1 Literature Search
Summarize search protocol, databases, inclusion/exclusion criteria, appraisal methods, and evidence flow.

### 4.2 Clinical Investigations
Summarize pivotal/supportive clinical studies, endpoints, populations, and key outcomes.

### 4.3 Post-Market Data
Summarize complaint trends, vigilance events, CAPA signals, registry/real-world data, and PMCF findings.

## 5. Data Analysis
Provide integrated analysis across all evidence sources, including consistency of outcomes and limitations of the data set.

## 6. Benefit-Risk Analysis
Describe demonstrated clinical benefits, residual risks, risk controls, and justification for overall benefit-risk acceptability.

## 7. Conclusions
State final clinical evaluation conclusions, claim supportability, and any conditions for ongoing surveillance.

## 8. Post-Market Clinical Follow-up
Define PMCF objectives, study activities, timelines, and decision criteria for CER updates.`,
  },
  {
    id: 'tpl_risk_analysis',
    name: 'Risk Analysis Template',
    description: 'ISO 14971 compliant risk analysis',
    submissionTypes: ['FDA_510K', 'PMA', 'DE_NOVO'],
    category: 'interactive',
    ctdSection: '4.2',
    content: JSON.stringify({
      type: 'risk_matrix',
      severityLevels: ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'],
      probabilityLevels: ['Remote', 'Unlikely', 'Possible', 'Likely', 'Frequent'],
      risks: [],
    }),
  },
];

/**
 * GET /api/concept2cure/templates
 * List available templates, optionally filtered by submission type
 */
router.get('/templates', (req: Request, res: Response) => {
  try {
    const { submissionType, package: templatePackage, projectGoal } = req.query;

    let templates = TEMPLATES;
    if (submissionType) {
      templates = templates.filter(t => t.submissionTypes.includes(submissionType as string));
    }
    const pkg = typeof templatePackage === 'string' ? templatePackage.toLowerCase() : '';
    const goal = typeof projectGoal === 'string' ? projectGoal.toLowerCase() : '';
    if (pkg === 'ind' || pkg === 'ind-core' || pkg === 'ind_readiness') {
      templates = templates.filter(
        t =>
          t.submissionTypes.includes('IND') ||
          [
            'tpl_ind_cover_letter',
            'tpl_ind_investigator_brochure',
            'tpl_ind_pre_ind_briefing',
          ].includes(t.id)
      );
    } else if (goal === 'first_ind' || goal === 'ind_initial') {
      templates = templates.filter(t =>
        [
          'tpl_ind_cover_letter',
          'tpl_ind_investigator_brochure',
          'tpl_ind_pre_ind_briefing',
          'tpl_ind_protocol',
        ].includes(t.id)
      );
    } else if (goal === 'cmc') {
      templates = templates.filter(t => ['tpl_ind_protocol', 'tpl_risk_analysis'].includes(t.id));
    }

    return sendSuccess(res, templates);
  } catch (error: any) {
    logger.error('Failed to fetch templates', { error: error.message });
    return sendError(res, 500, 'Failed to fetch templates');
  }
});

/**
 * GET /api/concept2cure/templates/:id
 * Get a specific template
 */
router.get('/templates/:id', (req: Request, res: Response) => {
  try {
    const template = TEMPLATES.find(t => t.id === req.params.id);

    if (!template) {
      return sendError(res, 404, 'Template not found');
    }

    return sendSuccess(res, template);
  } catch (error: any) {
    logger.error('Failed to fetch template', { error: error.message });
    return sendError(res, 500, 'Failed to fetch template');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REGULATORY CATALOG — Registry-driven application type catalog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/regulatory-catalog/regions
 * List all supported regions with application type counts.
 */
router.get('/regulatory-catalog/regions', async (_req: Request, res: Response) => {
  try {
    const {
      getRegionsWithCounts,
    } = await import('../services/regulatory/registry/globalDocumentRegistryService.js');
    return sendSuccess(res, getRegionsWithCounts());
  } catch (error: any) {
    logger.error('Failed to fetch regulatory regions', { error: error.message });
    return sendError(res, 500, 'Failed to fetch regulatory regions');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/agencies
 * List all supported regulatory agencies with counts.
 */
router.get('/regulatory-catalog/agencies', async (_req: Request, res: Response) => {
  try {
    const {
      getAgenciesWithCounts,
    } = await import('../services/regulatory/registry/globalDocumentRegistryService.js');
    return sendSuccess(res, getAgenciesWithCounts());
  } catch (error: any) {
    logger.error('Failed to fetch regulatory agencies', { error: error.message });
    return sendError(res, 500, 'Failed to fetch regulatory agencies');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/application-types
 * List application types with optional filters.
 * Query params: region, agency, family, productClass, query
 */
router.get('/regulatory-catalog/application-types', async (req: Request, res: Response) => {
  try {
    const {
      getApplicationTypes,
    } = await import('../services/regulatory/registry/globalDocumentRegistryService.js');
    const filters: Record<string, string> = {};
    if (req.query.region) filters.region = String(req.query.region);
    if (req.query.agency) filters.agency = String(req.query.agency);
    if (req.query.family) filters.family = String(req.query.family);
    if (req.query.productClass) filters.productClass = String(req.query.productClass);
    if (req.query.query) filters.query = String(req.query.query);
    return sendSuccess(
      res,
      getApplicationTypes(Object.keys(filters).length > 0 ? filters : undefined)
    );
  } catch (error: any) {
    logger.error('Failed to fetch application types', { error: error.message });
    return sendError(res, 500, 'Failed to fetch application types');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/families
 * List all application families with metadata.
 */
router.get('/regulatory-catalog/families', async (_req: Request, res: Response) => {
  try {
    const { getAllFamiliesSorted } = await import('../../shared/regulatory/application-families.js');
    return sendSuccess(res, getAllFamiliesSorted());
  } catch (error: any) {
    logger.error('Failed to fetch application families', { error: error.message });
    return sendError(res, 500, 'Failed to fetch application families');
  }
});

/**
 * POST /api/concept2cure/regulatory-catalog/resolve
 * Resolve a registry ID or legacy submission type to full entry with blueprints.
 * Body: { registryId?: string, submissionType?: string }
 */
router.post('/regulatory-catalog/resolve', async (req: Request, res: Response) => {
  try {
    const { resolve } = await import('../services/regulatory/registry/globalDocumentRegistryService.js');
    const { registryId, submissionType } = req.body;
    const idToResolve = registryId || submissionType;
    if (!idToResolve) {
      return sendError(res, 400, 'Either registryId or submissionType is required');
    }
    const result = resolve(idToResolve);
    if (!result) {
      return sendError(res, 404, `Could not resolve "${idToResolve}" to a known application type`);
    }
    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Failed to resolve registry entry', { error: error.message });
    return sendError(res, 500, 'Failed to resolve registry entry');
  }
});

/**
 * POST /api/concept2cure/regulatory-catalog/bootstrap-preview
 * Preview what sections and tasks would be created for a given application type.
 * Body: { registryId: string }
 */
router.post('/regulatory-catalog/bootstrap-preview', async (req: Request, res: Response) => {
  try {
    const {
      getBootstrapPreview,
    } = await import('../services/regulatory/registry/globalDocumentRegistryService.js');
    const { registryId } = req.body;
    if (!registryId) {
      return sendError(res, 400, 'registryId is required');
    }
    const preview = await getBootstrapPreview(registryId);
    if (!preview) {
      return sendError(res, 404, `Unknown registry ID: ${registryId}`);
    }
    return sendSuccess(res, preview);
  } catch (error: any) {
    logger.error('Failed to generate bootstrap preview', { error: error.message });
    return sendError(res, 500, 'Failed to generate bootstrap preview');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/search
 * Search application types with ranked results.
 * Query params: q (required), region, agency, family, limit
 */
router.get('/regulatory-catalog/search', async (req: Request, res: Response) => {
  try {
    const { rankedSearch } = await import('../services/regulatory/registry/registrySearch.js');
    const q = String(req.query.q || '');
    if (!q) {
      return sendError(res, 400, 'Query parameter "q" is required');
    }
    const filters: Record<string, string | boolean> = { activeOnly: true };
    if (req.query.region) filters.region = String(req.query.region);
    if (req.query.agency) filters.agency = String(req.query.agency);
    if (req.query.family) filters.family = String(req.query.family);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const results = rankedSearch(q, Object.keys(filters).length > 1 ? filters : undefined, limit);
    return sendSuccess(res, results);
  } catch (error: any) {
    logger.error('Failed to search registry', { error: error.message });
    return sendError(res, 500, 'Failed to search registry');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CONTEXT INTEGRITY LAYER ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/concept2cure/conversations/:conversationId/health
 * Compute and return conversation health report.
 */
router.get(
  '/conversations/:conversationId/health',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId);
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      const report = await computeConversationHealth(conversationId, organizationId);
      return sendSuccess(res, report);
    } catch (error: any) {
      logConcept2cureError('conversation health', error);
      return sendError(res, 500, 'Failed to compute conversation health');
    }
  }
);

/**
 * GET /api/concept2cure/conversations/:conversationId/working-memory
 * Get the latest working memory summary for a conversation.
 */
router.get(
  '/conversations/:conversationId/working-memory',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId);
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      const memory = await getLatestWorkingMemory(conversationId, organizationId);
      if (!memory) {
        return sendSuccess(res, null, { message: 'No working memory generated yet' });
      }

      return sendSuccess(res, {
        ...memory,
        formatted: formatWorkingMemoryForPrompt(memory),
      });
    } catch (error: any) {
      logConcept2cureError('working memory retrieval', error);
      return sendError(res, 500, 'Failed to retrieve working memory');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/summarize
 * Generate or refresh the working memory summary for a conversation.
 * Uses AI to analyze conversation messages and produce a structured summary.
 */
router.post(
  '/conversations/:conversationId/summarize',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId);
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load conversation messages
      const messagesResult = await pool.query(
        `SELECT role, content FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
        [conversationId, organizationId]
      );
      const messages = messagesResult.rows;

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages found for this conversation');
      }

      // Get previous summary for chaining
      const existingMemory = await getLatestWorkingMemory(conversationId, organizationId);
      const previousSummary = existingMemory
        ? formatWorkingMemoryForPrompt(existingMemory)
        : undefined;

      // Build the summarization prompt
      const summaryPrompt = buildWorkingMemoryPrompt(messages, previousSummary);

      // Use OpenAI to generate the structured summary
      let structured: any;
      try {
        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a regulatory affairs analyst. Produce concise, structured summaries.',
            },
            { role: 'user', content: summaryPrompt },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        });

        const responseText = aiResult.content || '{}';
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        structured = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : {
              objective: 'Unable to parse summary',
              lockedFacts: [],
              decisions: [],
              openQuestions: [],
              nextActions: [],
              createdArtifacts: [],
              exclusions: [],
            };
      } catch (aiError: any) {
        logger.error(`AI summarization failed: ${aiError.message}`);
        // Fallback: generate a basic summary without AI
        structured = {
          objective: `Conversation with ${messages.length} messages`,
          lockedFacts: [],
          decisions: [],
          openQuestions: messages
            .filter((m: any) => m.role === 'user' && m.content?.trim().endsWith('?'))
            .slice(-5)
            .map((m: any) => m.content.trim().slice(0, 200)),
          nextActions: [],
          createdArtifacts: [],
          exclusions: [],
        };
      }

      // Format as readable summary
      const formattedSummary = [
        `**Objective**: ${structured.objective}`,
        structured.lockedFacts?.length > 0
          ? `**Key Facts**: ${structured.lockedFacts.join('; ')}`
          : '',
        structured.decisions?.length > 0 ? `**Decisions**: ${structured.decisions.join('; ')}` : '',
        structured.openQuestions?.length > 0
          ? `**Open Questions**: ${structured.openQuestions.join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      // Get thread ID for cross-system linking
      const convResult = await pool.query(
        'SELECT thread_id FROM concept2cure_conversations WHERE id = $1',
        [conversationId]
      );
      const threadId = convResult.rows[0]?.thread_id || null;

      // Store
      await storeWorkingMemory({
        conversationId,
        threadId,
        organizationId,
        summary: formattedSummary,
        structured,
        messageCountAtGeneration: messages.length,
      });

      return sendSuccess(res, {
        summary: formattedSummary,
        structured,
        messageCount: messages.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logConcept2cureError('working memory generation', error);
      return sendError(res, 500, 'Failed to generate working memory summary');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/promote
 * Promote conversation content to a governed artifact.
 */
router.post(
  '/conversations/:conversationId/promote',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number((req as any).tenantContext?.organizationId) ||
        Number((req as any).tenantId) ||
        Number((req as any).user?.organizationId) ||
        null;
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }
      const userId = (req as any).userId || (req as any).user?.id || null;

      const promoteSchema = z.object({
        type: z.enum([
          'strategy_memo',
          'evidence_brief',
          'module_draft',
          'decision_log',
          'handoff_memo',
        ]),
        title: z.string().min(1).max(500),
        messageStart: z.number().optional(),
        messageEnd: z.number().optional(),
      });

      const parsed = promoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid promotion request', parsed.error.format());
      }
      const { type, title, messageStart, messageEnd } = parsed.data;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load conversation and verify it belongs to this org
      const convResult = await pool.query(
        'SELECT id, project_id, conversation_id FROM concept2cure_conversations WHERE id = $1 AND organization_id = $2',
        [conversationId, organizationId]
      );
      if (convResult.rows.length === 0) {
        return sendError(res, 404, 'Conversation not found');
      }
      const conversation = convResult.rows[0];

      // Load messages (optionally filtered by range)
      const messagesQuery = `SELECT role, content, created_at FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`;
      const messagesResult = await pool.query(messagesQuery, [conversationId, organizationId]);
      let messages = messagesResult.rows;

      if (messageStart !== undefined || messageEnd !== undefined) {
        const start = messageStart ?? 0;
        const end = messageEnd ?? messages.length;
        messages = messages.slice(start, end);
      }

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages in specified range');
      }

      // Generate document content using AI + Intelligence Engine
      let documentContent: string;
      try {
        const conversationText = messages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n\n');

        // Run intelligence pipeline on conversation content for structured signals
        let intelligenceContext = '';
        try {
          const { runIntelligencePipeline, buildConstrainedPrompt } = await import(
            '../services/intelligence-engine/index.js'
          );
          const analysis = runIntelligencePipeline(conversationText);
          intelligenceContext = buildConstrainedPrompt(analysis, 'generate_memo');
        } catch {
          // Graceful degradation
        }

        const systemPrompt =
          intelligenceContext ||
          `You are a regulatory affairs document specialist. Extract and organize the conversation content into a formal ${type.replace(
            /_/g,
            ' '
          )} document. Use proper document structure with headings, and maintain regulatory precision. Output in Markdown format.`;

        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Create a "${title}" (${type.replace(
                /_/g,
                ' '
              )}) from this conversation:\n\n${conversationText}`,
            },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });
        documentContent = aiResult.content || '';

        // Evaluation gate: check output quality
        try {
          const { evaluateOutput } = await import('../services/intelligence-engine/index.js');
          const evaluation = evaluateOutput(documentContent);
          if (!evaluation.passed && intelligenceContext) {
            // Regenerate with tighter constraints
            const retryResult = await ai.chat({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `${systemPrompt}\n\nIMPORTANT: Your output MUST include: a clear verdict/recommendation, prioritized findings with severity levels, specific evidence references, and actionable next steps. Rejected reasons: ${evaluation.rejectionReasons.join(
                    '; '
                  )}`,
                },
                {
                  role: 'user',
                  content: `Create a "${title}" (${type.replace(
                    /_/g,
                    ' '
                  )}) from this conversation:\n\n${conversationText}`,
                },
              ],
              max_tokens: 4000,
              temperature: 0.2,
            });
            documentContent = retryResult.content || documentContent;
          }
        } catch {
          // Use original if evaluation/retry fails
        }
      } catch {
        // Fallback: raw conversation export
        documentContent =
          `# ${title}\n\n_Promoted from conversation on ${new Date().toISOString()}_\n\n` +
          messages
            .map(
              (m: any) =>
                `### ${m.role === 'user' ? 'User' : 'Assistant'} (${new Date(
                  m.created_at
                ).toLocaleString()})\n\n${m.content}`
            )
            .join('\n\n---\n\n');
      }

      // Create artifact
      const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const contentHash = crypto.createHash('sha256').update(documentContent).digest('hex');

      const promotedMetadata = {
        promotedFrom: type,
        sourceMessageCount: messages.length,
      };
      const governedPromotion = resolveGovernedContext({
        req,
        projectId: conversation.project_id,
        artifactId: null,
        documentType: type,
        generationMode: 'ai_generated',
        lifecycleStatus: 'draft',
        originSurface: 'ri_copilot',
        title: DOMPurify.sanitize(title),
        content: documentContent,
        sourceRefs: [`conversation:${conversationId}`],
        provider: 'openai',
        model: 'gpt-4o-mini',
        eventType: 'artifact.created',
      });
      if (!governedPromotion.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: governedPromotion.validation.errors,
            warnings: governedPromotion.validation.warnings,
            resolved: governedPromotion.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const artifactResult = await db
        .insert(concept2cureArtifacts)
        .values({
          artifactId,
          projectId: conversation.project_id,
          conversationId,
          organizationId,
          type: 'markdown',
          category: 'document',
          title: DOMPurify.sanitize(title),
          content: documentContent,
          contentHash,
          version: 1,
          status: 'draft',
          createdById: userId,
          metadata: {
            ...promotedMetadata,
            harness: {
              clientTrack: governedPromotion.contract.clientTrack,
              submissionProgram: governedPromotion.contract.submissionProgram,
              persona: governedPromotion.contract.persona,
              regulatorScope: governedPromotion.contract.regulatorScope,
              documentClass: governedPromotion.contract.documentClass,
              readinessGate: governedPromotion.contract.readinessGate,
              workspaceTarget: governedPromotion.contract.workspaceTarget,
              originSurface: governedPromotion.contract.originSurface,
              recommendationSource: governedPromotion.contract.recommendationSource,
              regulatorIntent: governedPromotion.contract.regulatorIntent,
              gateChecks: governedPromotion.contract.exportEligibility.gateChecks,
              blockingReasons: governedPromotion.contract.exportEligibility.blockingReasons,
              readinessOutcome: governedPromotion.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .returning();

      // Log provenance event
      if (artifactResult.length > 0) {
        await db.insert(concept2cureProvenanceEvents).values({
          eventId: `prov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          artifactId: artifactResult[0].id,
          organizationId,
          eventType: 'creation',
          eventAction: 'promoted_from_conversation',
          actorId: userId || undefined,
          actorName: 'User',
          sourceDescription: `Promoted from conversation ${conversationId} as ${type}`,
          details: {
            conversationId,
            messageRange: { start: messageStart ?? 0, end: messageEnd ?? messages.length },
            sourceType: type,
          },
          backendService: 'concept2cure',
          backendRoute: `POST /api/concept2cure/conversations/${conversationId}/promote`,
        });
      }

      return sendSuccess(res, {
        artifact: artifactResult[0],
        artifactId,
        title,
        type,
        messageCount: messages.length,
      });
    } catch (error: any) {
      logConcept2cureError('document promotion', error);
      return sendError(res, 500, 'Failed to promote conversation to document');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/extract-decisions
 * Extract decisions, risks, and open questions from a conversation.
 */
router.post(
  '/conversations/:conversationId/extract-decisions',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(paramStr(req.params.conversationId), 10);
      const organizationId =
        Number(
          (req as any).organizationId || (req as any).user?.organizationId || (req as any).tenantId
        ) || 0;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load messages
      const messagesResult = await pool.query(
        `SELECT role, content FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
        [conversationId, organizationId]
      );
      const messages = messagesResult.rows;

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages found');
      }

      try {
        const conversationText = messages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n\n');

        // Run intelligence pipeline for structured risk/decision signals
        let intelligenceSignals: Record<string, unknown> = {};
        try {
          const { runIntelligencePipeline } = await import(
            '../services/intelligence-engine/index.js'
          );
          const analysis = runIntelligencePipeline(conversationText);
          intelligenceSignals = {
            defensibilityScore: analysis.defensibility.score,
            riskLevel: analysis.defensibility.riskLevel,
            riskClassifications: analysis.riskClassifications.classifications.map(r => ({
              category: r.category,
              severity: r.severity,
              finding: r.finding,
            })),
            reviewerQuestions: analysis.reviewerQuestions.map(q => ({
              question: q.question,
              severity: q.severity,
              category: q.category,
            })),
          };
        } catch {
          // Graceful degradation
        }

        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Extract structured information from this regulatory conversation. You have intelligence signals available. Return ONLY valid JSON.${
                Object.keys(intelligenceSignals).length > 0
                  ? `\n\nIntelligence signals:\n${JSON.stringify(intelligenceSignals, null, 2)}`
                  : ''
              }`,
            },
            {
              role: 'user',
              content: `Extract all decisions, risks, open questions, and action items from this conversation:\n\n${conversationText}\n\nRespond with JSON: { "decisions": [...], "risks": [...], "openQuestions": [...], "actionItems": [...], "intelligenceSignals": {...} }`,
            },
          ],
          max_tokens: 2000,
          temperature: 0.2,
        });

        const responseText = aiResult.content || '{}';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const extracted = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : {
              decisions: [],
              risks: [],
              openQuestions: [],
              actionItems: [],
            };

        // Merge intelligence signals into response
        if (Object.keys(intelligenceSignals).length > 0) {
          extracted.intelligenceSignals = intelligenceSignals;
        }

        return sendSuccess(res, extracted);
      } catch (aiError: any) {
        logger.error(`Decision extraction failed: ${aiError.message}`);
        return sendError(res, 500, 'AI extraction failed');
      }
    } catch (error: any) {
      logConcept2cureError('decision extraction', error);
      return sendError(res, 500, 'Failed to extract decisions');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE ENGINE — Deterministic regulatory intelligence analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/concept2cure/intelligence/analyze
 *
 * Runs the full Intelligence Engine pipeline on provided content.
 * Returns deterministic analysis: claim/evidence alignment, consistency,
 * defensibility scoring, risk classification, and reviewer questions.
 *
 * No LLM dependency — all results are reproducible.
 */
router.post('/intelligence/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { runIntelligencePipeline, emitRIMSignals, buildConstrainedPrompt } = await import(
      '../services/intelligence-engine/index.js'
    );

    const analyzeSchema = z.object({
      content: z.string().min(10).max(200000),
      sections: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            content: z.string(),
          })
        )
        .optional(),
      includeConstrainedPrompt: z
        .enum(['explain_risk', 'suggest_remediation', 'generate_memo', 'rewrite_section'])
        .optional(),
    });

    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'Invalid analysis request', parsed.error.format());
    }

    const { content, sections, includeConstrainedPrompt } = parsed.data;
    const startTime = Date.now();

    // Run full deterministic pipeline
    const analysis = runIntelligencePipeline(content, sections);
    const rimSignals = emitRIMSignals(analysis);

    // Optionally build a constrained LLM prompt
    let constrainedPrompt: string | undefined;
    if (includeConstrainedPrompt) {
      constrainedPrompt = buildConstrainedPrompt(analysis, includeConstrainedPrompt);
    }

    return sendSuccess(res, {
      analysis,
      rimSignals,
      constrainedPrompt,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error: any) {
    logger.error(`Intelligence analysis failed: ${error.message}`);
    return sendError(res, 500, 'Intelligence analysis failed');
  }
});

/**
 * POST /api/concept2cure/intelligence/evaluate
 *
 * Run the evaluation gate on any output text to check quality.
 */
router.post('/intelligence/evaluate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { evaluateOutput } = await import('../services/intelligence-engine/index.js');

    const evalSchema = z.object({
      output: z.string().min(1).max(100000),
    });

    const parsed = evalSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'Invalid evaluation request', parsed.error.format());
    }

    const evaluation = evaluateOutput(parsed.data.output);
    return sendSuccess(res, evaluation);
  } catch (error: any) {
    logger.error(`Evaluation gate failed: ${error.message}`);
    return sendError(res, 500, 'Evaluation failed');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRECEDENTS — Regulatory precedent/predicate data for Intelligence Hub
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/precedents', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    // Try to load precedents from the precedent engine or predicate intelligence tables
    let precedents: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, device_name as name, pathway, decision_date as "decisionDate",
                predicate_device as "predicateDevice", outcome, similarity,
                key_questions as "keyQuestions"
         FROM predicate_intelligence_results
         WHERE organization_id = $1
         ORDER BY decision_date DESC
         LIMIT 50`,
        [orgId]
      );
      precedents = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return sendSuccess(res, precedents);
  } catch (error: any) {
    logConcept2cureError('precedents fetch', error);
    return sendError(res, 500, 'Failed to fetch precedent data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATENTS — IP portfolio data for Legal Center
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/patents', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    let patents: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, title, patent_number as "patentNumber", jurisdiction,
                status, filing_date as "filingDate", expiration_date as "expirationDate",
                inventors, category, fto_status as "ftoStatus",
                related_compounds as "relatedCompounds"
         FROM patent_portfolio
         WHERE organization_id = $1
         ORDER BY filing_date DESC`,
        [orgId]
      );
      patents = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return res.json(patents);
  } catch (error: any) {
    logConcept2cureError('patents fetch', error);
    return sendError(res, 500, 'Failed to fetch patent data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE — Compliance tracking data for Legal Center
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/compliance', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    let complianceItems: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, framework, requirement, status,
                last_audit_date as "lastAuditDate", next_audit_date as "nextAuditDate",
                findings, capa_count as "capaCount", owner, risk_level as "riskLevel"
         FROM compliance_tracking
         WHERE organization_id = $1
         ORDER BY next_audit_date ASC`,
        [orgId]
      );
      complianceItems = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return res.json(complianceItems);
  } catch (error: any) {
    logConcept2cureError('compliance fetch', error);
    return sendError(res, 500, 'Failed to fetch compliance data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM WORKLOAD — Task workload per team member for Mission Control
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/team/workload', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    let workload: any[] = [];
    try {
      // Aggregate task counts by assignee from the unified tasks table
      const result = await pool.query(
        `SELECT
           u.id as "memberId",
           u.name as "memberName",
           COALESCE(SUM(CASE WHEN t.status = 'assigned' OR t.status = 'in_progress' THEN 1 ELSE 0 END), 0)::int as assigned,
           COALESCE(SUM(CASE WHEN t.status = 'in_review' THEN 1 ELSE 0 END), 0)::int as "inReview",
           COALESCE(SUM(CASE WHEN t.due_date < NOW() AND t.status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END), 0)::int as overdue
         FROM users u
         LEFT JOIN tasks t ON t.assigned_to = u.id AND t.organization_id = $1
         WHERE u.organization_id = $1
         GROUP BY u.id, u.name
         ORDER BY u.name`,
        [orgId]
      );
      workload = result.rows;
    } catch {
      // Tables may not exist yet — return empty array gracefully
    }

    return res.json(workload);
  } catch (error: any) {
    logConcept2cureError('team workload fetch', error);
    return sendError(res, 500, 'Failed to fetch workload data');
  }
});

/**
 * POST /api/concept2cure/feedback
 * Persist user feedback (thumbs up/down) on AI responses.
 * Critical for RLHF quality loop — was previously console.info only.
 */
router.post('/feedback', authMiddleware, async (req: Request, res: Response) => {
  try {
    const organizationId =
      Number((req as any).tenantContext?.organizationId) ||
      Number((req as any).tenantId) ||
      Number((req as any).user?.organizationId);
    if (!organizationId) {
      return sendError(res, 403, 'Organization context required');
    }
    const userId = getUserId(req);
    const { messageId, positive, conversationId, comment } = req.body;

    if (messageId === undefined || positive === undefined) {
      return sendError(res, 400, 'messageId and positive (boolean) are required');
    }

    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ai_feedback (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          user_id INTEGER,
          message_id TEXT NOT NULL,
          conversation_id TEXT,
          positive BOOLEAN NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`
      );
      await pool.query(
        `INSERT INTO ai_feedback (organization_id, user_id, message_id, conversation_id, positive, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          organizationId,
          userId,
          String(messageId),
          conversationId || null,
          positive,
          comment || null,
        ]
      );
    } catch (dbErr: any) {
      console.warn('[Feedback] DB persist failed:', dbErr.message);
    }

    // Also log to audit trail for compliance
    await logAuditEntry(req, 'FEEDBACK', 'ai_response', String(messageId), null, {
      positive,
      conversationId,
    });

    // Feed back to RIM learning loop (non-blocking)
    try {
      const { interceptFeedback } = await import('../services/intelligence/rim-interceptors.js');
      interceptFeedback({
        organizationId,
        projectId: req.body.projectId ? Number(req.body.projectId) : 0,
        userId,
        feedbackType: positive ? 'accepted' : 'rejected',
      });
    } catch {
      /* non-blocking */
    }

    return sendSuccess(res, { recorded: true });
  } catch (error: any) {
    logConcept2cureError('feedback submission', error);
    return sendError(res, 500, 'Failed to record feedback');
  }
});

export default router;
