import { z } from 'zod';

export const submissionCreateSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  organizationId: z.coerce.number().int().positive().optional(),
  submissionType: z.string().min(2).max(32).default('NDA'),
  regulator: z.string().min(2).max(32).default('FDA'),
  center: z.string().max(120).optional(),
  division: z.string().max(120).optional(),
  applicationNumber: z.string().max(120).optional(),
  sequenceNumber: z.string().max(120).optional(),
  lifecycleState: z.string().max(64).optional(),
  clockMetadata: z.record(z.string(), z.unknown()).optional(),
});

export const submissionStateSchema = z.object({
  lifecycleState: z.string().min(3).max(64),
});

export const correspondenceIntakeSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  organizationId: z.coerce.number().int().positive().optional(),
  submissionId: z.string().min(1),
  direction: z.enum(['inbound', 'outbound', 'internal']).optional(),
  sourceChannel: z.enum(['manual_upload', 'mailbox_sync', 'api_import']).optional(),
  communicationType: z.string().min(3).max(80).optional(),
  subject: z.string().min(3).max(240),
  sender: z.string().max(200).optional(),
  recipients: z.array(z.string().max(200)).optional(),
  receivedAt: z.string().optional(),
  dueDate: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  responseRequired: z.boolean().optional(),
  parsedText: z.string().max(120000).optional(),
  summary: z.string().max(5000).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(512),
        size: z.coerce.number().int().min(0).max(50 * 1024 * 1024),
      })
    )
    .optional(),
});

export const issueReviewSchema = z.object({
  humanReviewStatus: z.enum(['pending', 'confirmed', 'edited', 'rejected']).optional(),
  mappedCtdSections: z.array(z.string().max(24)).optional(),
  mappedArtifactIds: z.array(z.string().max(64)).optional(),
  resolutionStatus: z.enum(['open', 'in_progress', 'resolved', 'waived']).optional(),
  owner: z.string().max(200).optional(),
});

export const responsePackageCreateSchema = z.object({
  organizationId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().nonnegative().default(0),
  sourceCorrespondenceId: z.string().min(1),
  title: z.string().min(3).max(240).optional(),
  status: z.enum(['draft', 'review', 'approval', 'assembled', 'sent']).optional(),
  issueMatrixArtifactId: z.string().max(120).optional(),
  coverLetterArtifactId: z.string().max(120).optional(),
  revisedArtifactIds: z.array(z.string().max(120)).optional(),
  assembledSequenceId: z.string().max(120).optional(),
});

export const mailboxConnectionSchema = z.object({
  organizationId: z.coerce.number().int().positive().optional(),
  provider: z.enum(['microsoft365', 'gmail', 'imap', 'other']).optional(),
  mailboxIdentifier: z.string().min(3).max(240),
  authState: z.enum(['connected', 'expired', 'error', 'revoked']).optional(),
  tokenReference: z.string().max(240).optional(),
  scopes: z.array(z.string().max(120)).optional(),
  syncStatus: z.enum(['idle', 'syncing', 'error']).optional(),
  cursor: z.string().max(240).optional(),
  lastSyncAt: z.string().optional(),
  errorState: z.string().max(240).optional(),
});
