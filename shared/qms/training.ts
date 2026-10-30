/** Shared wire contract for the existing Quality register's personal attestation. */
import { z } from 'zod';
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '../constants/governed-reason';

const id = z.number().int().positive().max(2_147_483_647);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().trim().min(1).max(20);
const timestamp = z.string().datetime({ offset: true });

export const QMS_TRAINING_DECLARATION = 'I have read and understood this released revision.';
export const QMS_TRAINABLE_DOCUMENT_TYPES = ['sop', 'wi', 'manual', 'policy', 'protocol', 'curriculum'] as const;

/** A trainee cannot supply another actor, a score, a trainer or a signature method. */
export const qmsTrainingAcknowledgementInputSchema = z.object({
  documentVersion: version,
  contentDigest: digest,
  understood: z.literal(true),
  method: z.literal('attestation'),
}).strict();

/** Draft text uses the existing editor and PATCH route; blank bodies stay drafts. */
export const qmsControlledTextInputSchema = z.object({
  controlledText: z.object({
    documentVersion: version,
    contentDigest: digest,
    sections: z.array(z.object({
      key: z.string().trim().min(1).max(80),
      label: z.string().trim().min(1).max(200),
      body: z.string().max(200_000),
      order: z.number().int().nonnegative().optional(),
      hint: z.string().max(500).optional(),
    }).strict()).min(1).max(100).superRefine((sections, ctx) => {
      if (new Set(sections.map(section => section.key)).size !== sections.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each controlled section needs a distinct key.' });
      }
      if (sections.reduce((size, section) => size + section.body.length, 0) > 2_000_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Controlled text exceeds the supported size.' });
      }
    }),
  }).strict(),
  reason: z.string().trim().min(8).max(2000),
}).strict();

export const qmsTrainingAcknowledgementSchema = z.object({
  id,
  documentId: id,
  userId: id,
  documentVersion: version,
  contentDigest: digest,
  acknowledgedAt: timestamp,
  expiresAt: timestamp.nullable(),
  method: z.literal('attestation'),
});

export const qmsTrainingSectionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  body: z.string().min(1).refine(value => value.trim().length > 0, 'Controlled text must not be blank.'),
});

/** One version's training context. */
const qmsTrainingVersionContextBase = z.object({
  documentId: id,
  docNumber: z.string().min(1),
  title: z.string().min(1),
  documentVersion: version,
  status: z.enum(['draft', 'in_review', 'effective', 'superseded', 'retired']),
  contentDigest: digest.nullable(),
  eligible: z.boolean(),
  canEditControlledText: z.boolean().default(false),
  unavailableReason: z.string().min(1).nullable(),
  sections: z.array(qmsTrainingSectionSchema),
  acknowledgement: qmsTrainingAcknowledgementSchema.nullable(),
  /** Whether this version is in force today (false: approved for a later day, and acknowledgeable ahead of it; P-49). */
  inForce: z.boolean().optional(),
  /** The day this version takes or took effect (UTC), when it has one. */
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
type VersionContext = z.infer<typeof qmsTrainingVersionContextBase>;
function versionContextRules(value: VersionContext, ctx: z.RefinementCtx) {
  if (value.eligible && (value.status !== 'effective' || !value.contentDigest || !value.sections.length || value.unavailableReason !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Eligible training requires verified readable release content.' });
  }
  const ack = value.acknowledgement;
  if (ack && (ack.documentId !== value.documentId || ack.documentVersion !== value.documentVersion || ack.contentDigest !== value.contentDigest)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The acknowledgement must cover this document revision.' });
  }
}

/**
 * Added to meta.training on GET /api/mdx/qms/documents/:id; data stays intact.
 * The version in force, and (`successor`) the version approved for a later day
 * while it waits, which the people assigned read and acknowledge ahead of it.
 */
export const qmsTrainingContextSchema = qmsTrainingVersionContextBase.extend({
  successor: qmsTrainingVersionContextBase.superRefine(versionContextRules).nullable().optional(),
}).superRefine(versionContextRules);

export const qmsTrainingAcknowledgementResponseSchema = z.object({
  data: qmsTrainingAcknowledgementSchema,
  meta: z.object({
    alreadyAcknowledged: z.boolean().optional(),
    auditTrail: z.object({ persisted: z.literal(true), chained: z.literal(true) }).optional(),
  }),
}).superRefine((value, ctx) => {
  if (value.meta.alreadyAcknowledged !== true && !value.meta.auditTrail) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A new acknowledgement must confirm its chained audit record.' });
  }
});

/* Job roles and who holds them (P-49; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md
   §3.8). A job role is a job function the organization manages, not a permission
   role. Every write names its reason; an unknown field is refused, never dropped. */
const governedReason = z.string().trim().min(GOVERNED_REASON_MIN).max(GOVERNED_REASON_MAX);
const jobRoleName = z.string().trim().min(1).max(80);
const jobRoleDescription = z.string().trim().max(500);

export const qmsJobRoleCreateSchema = z.object({ name: jobRoleName, description: jobRoleDescription.optional(), reason: governedReason }).strict();
export const qmsJobRoleUpdateSchema = z.object({ name: jobRoleName.optional(), description: jobRoleDescription.nullable().optional(), reason: governedReason })
  .strict().refine(b => b.name !== undefined || b.description !== undefined, { message: 'Change the name or the description.' });
export const qmsJobRoleMemberSchema = z.object({ userId: id, reason: governedReason }).strict();
/** A DELETE body: the reason only (DELETE requests carry a JSON body here, as TaskBoard's do). */
export const qmsGovernedRemovalSchema = z.object({ reason: governedReason }).strict();
/** One requirement on a controlled document: exactly one job role or one person (the table's num_nonnulls CHECK). */
export const qmsTrainingAssignmentSchema = z.object({ jobRoleId: id.optional(), userId: id.optional(), reason: governedReason })
  .strict().refine(b => (b.jobRoleId === undefined) !== (b.userId === undefined), { message: 'Name exactly one job role or one person.' });

export type QmsJobRoleCreate = z.infer<typeof qmsJobRoleCreateSchema>;
export type QmsJobRoleUpdate = z.infer<typeof qmsJobRoleUpdateSchema>;
export type QmsTrainingAssignmentInput = z.infer<typeof qmsTrainingAssignmentSchema>;

export type QmsTrainingAcknowledgementInput = z.infer<typeof qmsTrainingAcknowledgementInputSchema>;
export type QmsTrainingAcknowledgement = z.infer<typeof qmsTrainingAcknowledgementSchema>;
export type QmsTrainingContext = z.infer<typeof qmsTrainingContextSchema>;
export type QmsTrainingSection = z.infer<typeof qmsTrainingSectionSchema>;
export type QmsControlledTextInput = z.infer<typeof qmsControlledTextInputSchema>;
