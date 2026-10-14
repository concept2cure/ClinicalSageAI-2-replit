/**
 * Discovery answers reviewed by the workspace setup author (W1 / D2).
 *
 * This is the shared, versioned shape of organizations.settings.onboardingDiscovery.
 * These are human-stated planning notes, not regulatory determinations, personal
 * account preferences, permission grants, or security-policy changes. The
 * existing governed organization-settings door owns storage and its audit row.
 */
import { z } from 'zod';

export const DISCOVERY_USE_CASES = [
  'projects', 'vault', 'authoring', 'submission_center',
  'submission_readiness', 'qms', 'reporting', 'cmc',
] as const;
export type DiscoveryUseCase = (typeof DISCOVERY_USE_CASES)[number];

export const DISCOVERY_SETUP_NEEDS = [
  'invite_team', 'review_roles', 'mfa', 'session_policy',
  'sso_scim', 'agency_accounts', 'translation',
] as const;
export type DiscoverySetupNeed = (typeof DISCOVERY_SETUP_NEEDS)[number];

const note = (limit: number) => z.string().trim().max(limit);
const list = z.array(z.string().trim().min(1).max(120)).max(12)
  .refine((values) => new Set(values.map((v) => v.toLocaleLowerCase('en-US'))).size === values.length,
    'Entries must be unique.');
const choices = <T extends [string, ...string[]]>(values: T) => z.array(z.enum(values)).max(values.length)
  .refine((entries) => new Set(entries).size === entries.length, 'Choices must be unique.');

/** Reject impossible dates, while preserving an explicitly undecided date. */
function isCalendarDate(value: string): boolean {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const onboardingDiscoverySchema = z.object({
  schemaVersion: z.literal(1),
  company: z.object({
    goals: note(1000),
    useCases: choices([...DISCOVERY_USE_CASES]),
    therapeuticAreas: list,
    markets: list,
    pathways: list,
  }).strict(),
  user: z.object({
    workingRole: note(120),
    sophistication: z.enum(['new', 'developing', 'experienced', 'not_stated']),
    preferredGuidance: z.enum(['step_by_step', 'contextual', 'concise', 'not_stated']),
  }).strict(),
  project: z.object({
    name: note(120),
    goals: note(1000),
    productType: z.enum(['drug', 'biologic', 'device', 'ivd', 'not_stated']),
    lifecycleStage: note(120),
    indication: note(500),
    targetDate: z.string().max(10).refine(isCalendarDate, 'Use a valid calendar date in YYYY-MM-DD format, or leave it blank.'),
    predicateDevice: note(500),
    assayContext: note(500),
  }).strict(),
  setup: z.object({
    teamSize: z.number().int().min(1).max(10000).nullable(),
    needs: choices([...DISCOVERY_SETUP_NEEDS]),
    approvalRigor: z.enum(['single_reviewer', 'regulated_dual_review', 'qa_lock', 'signoff_required']).nullable(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.project.predicateDevice && value.project.productType !== 'device') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['project', 'predicateDevice'], message: 'Predicate context applies to medical-device projects.' });
  }
  if (value.project.assayContext && value.project.productType !== 'ivd') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['project', 'assayContext'], message: 'Assay context applies to IVD projects.' });
  }
});

export type OnboardingDiscovery = z.infer<typeof onboardingDiscoverySchema>;

/** A fresh editable form with no fabricated client context or setup defaults. */
export function emptyDiscovery(): OnboardingDiscovery {
  return {
    schemaVersion: 1,
    company: { goals: '', useCases: [], therapeuticAreas: [], markets: [], pathways: [] },
    user: { workingRole: '', sophistication: 'not_stated', preferredGuidance: 'not_stated' },
    project: { name: '', goals: '', productType: 'not_stated', lifecycleStage: '', indication: '', targetDate: '', predicateDevice: '', assayContext: '' },
    setup: { teamSize: null, needs: [], approvalRigor: null },
  };
}

/** Null means absent, malformed, or an unsupported version; never guessed data. */
export function parseDiscovery(value: unknown): OnboardingDiscovery | null {
  const parsed = onboardingDiscoverySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
