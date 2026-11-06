/**
 * An administrator's skill, checked before it is stored: the same vocabulary
 * and limits as the platform library (shared/ana/skills.ts), tools AnA has in
 * the launch scope, and a library skill that exists when one is extended.
 *
 * @module server/services/ana/skills/org-skill-input
 */

import { z } from 'zod';
import {
  PROJECT_SKILL_APPROVAL_TOOLS,
  SKILL_DISCIPLINES,
  SKILL_EXTENSION_MODES,
  SKILL_LIMITS,
  SKILL_SEGMENT_IDS,
  SKILL_USE_CASES,
} from '../../../../shared/ana/skills.js';
import { THERAPEUTIC_AREAS } from '../../../../shared/constants/domain/therapeutic-areas.js';
import { isCanonicalRegion } from '../../../../shared/regulatory/region-identity.js';
import { getApplicationType } from '../../../../shared/regulatory/global-document-registry.js';
import { resolveToRegistryId } from '../../../../shared/regulatory/submission-type-bridge.js';
import type { OrgSkillFields } from '../../account-skill-bundles.js';
import { TOOL_REGISTER } from '../tool-authorization.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { withoutHiddenAppTools } from '../ana-launch-scope.js';
import { getLibrarySkill } from './library/index.js';

const TA_VALUES = THERAPEUTIC_AREAS.map(t => t.value) as [string, ...string[]];
let launchTools: ReadonlySet<string> | null = null;
function launchToolNames(): ReadonlySet<string> {
  return (launchTools ??= new Set(withoutHiddenAppTools(ALL_ANA_TOOLS).map(t => t.name)));
}

const list = <T extends z.ZodTypeAny>(item: T) =>
  z.array(item).max(SKILL_LIMITS.facetMax).default([]).transform(v => Array.from(new Set(v)) as Array<z.infer<T>>);

const trigger = z
  .string()
  .transform(t => t.toLowerCase().replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(SKILL_LIMITS.triggerMin).max(SKILL_LIMITS.triggerMax));

export const orgSkillBody = z
  .object({
    name: z.string().trim().min(1).max(SKILL_LIMITS.nameMax),
    description: z.string().trim().min(SKILL_LIMITS.descriptionMin).max(SKILL_LIMITS.descriptionMax),
    instructions: z.string().trim().min(SKILL_LIMITS.instructionsMin).max(SKILL_LIMITS.instructionsMax),
    disciplines: list(z.enum(SKILL_DISCIPLINES)),
    useCases: list(z.enum(SKILL_USE_CASES)),
    segments: list(z.enum(SKILL_SEGMENT_IDS as unknown as [string, ...string[]])),
    therapeuticAreas: list(z.enum(TA_VALUES)),
    regions: list(z.string().refine(isCanonicalRegion, 'is not a region code')),
    submissionTypes: list(z.string().refine(v => resolveToRegistryId(v) === v, 'is not a submission registry id')),
    surfaces: list(z.string().regex(/^[a-z0-9-]{2,64}$/)),
    documentTypes: list(z.string().refine(v => Boolean(getApplicationType(v)), 'is not a document registry id')),
    triggers: z
      .array(trigger)
      .max(SKILL_LIMITS.triggersMax)
      .default([])
      .transform(v => Array.from(new Set(v))),
    tools: list(z.string().refine(v => launchToolNames().has(v), 'is not an AnA tool available at launch')).pipe(
      z.array(z.string()).max(SKILL_LIMITS.toolsMax),
    ),
    extendsSkillKey: z
      .string()
      .nullable()
      .default(null)
      .refine(v => v === null || Boolean(getLibrarySkill(v)), 'names no skill in the platform library'),
    extensionMode: z.enum(SKILL_EXTENSION_MODES).nullable().default(null),
    status: z.enum(['draft', 'active', 'archived']).default('draft'),
    // A skill written for one project. Set at creation; a change keeps the stored one.
    projectId: z.number().int().positive().nullable().default(null),
    policyBindings: z.array(z.object({
      policyType: z.literal('requires_approval'),
      enforcement: z.literal('mandatory'),
      toolName: z.string().refine(v => launchToolNames().has(v) && !['execute_platform_command', 'run_agent'].includes(v) &&
        Object.prototype.hasOwnProperty.call(TOOL_REGISTER, v), 'is not an available registered direct tool'),
      description: z.string().trim().min(8).max(600),
    }).strict()).max(12).optional(),
    sourceAuditEventId: z.string().uuid().transform(v => v.toLowerCase()).nullable().optional(),
    standingRule: z.object({
      level: z.enum(['soft', 'standing', 'hard_gate']), state: z.enum(['active', 'revoked']),
      conflictKey: z.string().regex(/^[a-z][a-z0-9._-]{2,79}$/),
      supersedes: z.array(z.object({ bundleId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), version: z.number().int().positive() }).strict()).max(12).optional(),
    }).strict().optional(),
    correction: z.object({ text: z.string().trim().min(8).max(500), agency: z.string().trim().min(1).max(80),
      documentType: z.string().trim().min(1).max(100), intent: z.string().trim().min(1).max(80) }).strict().optional(),
    expectedVersion: z.number().int().positive().optional(),
    reason: z.unknown(),
  })
  .superRefine((v, ctx) => {
    if ((v.extendsSkillKey === null) !== (v.extensionMode === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extensionMode'],
        message: 'A skill that extends a library skill says whether it adds to it or replaces it; one that stands alone says neither.',
      });
    }
    if (v.projectId !== null && v.policyBindings?.some(binding => !(PROJECT_SKILL_APPROVAL_TOOLS as readonly string[]).includes(binding.toolName))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['policyBindings'],
        message: 'That action does not yet have a verified project target for a mandatory project rule.' });
    }
    // An active skill with no trigger phrase, screen or document type is one
    // AnA never selects herself: it loads when someone picks it in a
    // conversation or deploys it to a project (2026-10-22). Allowed.
    if (v.projectId !== null && v.extensionMode === 'replace') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['extensionMode'],
        message: 'A project can add to a library skill; replacing one is the organization’s decision, made in Admin and access → Skills.',
      });
    }
    if (v.extendsSkillKey === null && (v.disciplines.length === 0 || v.useCases.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['disciplines'],
        message: 'A skill that stands alone names at least one discipline and one kind of work.',
      });
    }
  });

export type OrgSkillBody = z.infer<typeof orgSkillBody>;

/** The stored fields, from a parsed body. */
export function fieldsOf(body: OrgSkillBody): OrgSkillFields {
  return {
    ...(body.standingRule ? { standingRule: body.standingRule } : {}),
    ...(body.correction ? { correction: body.correction } : {}),
    ...(body.expectedVersion !== undefined ? { expectedVersion: body.expectedVersion } : {}),
    name: body.name,
    description: body.description,
    instructions: body.instructions,
    disciplines: body.disciplines,
    useCases: body.useCases,
    segments: body.segments,
    therapeuticAreas: body.therapeuticAreas,
    regions: body.regions,
    submissionTypes: body.submissionTypes,
    surfaces: body.surfaces,
    documentTypes: body.documentTypes,
    triggers: body.triggers,
    tools: body.tools,
    extendsSkillKey: body.extendsSkillKey,
    extensionMode: body.extensionMode,
    status: body.status,
    projectId: body.projectId,
    ...(body.policyBindings !== undefined ? { policyBindings: body.policyBindings } : {}),
    ...(body.sourceAuditEventId !== undefined ? { sourceAuditEventId: body.sourceAuditEventId } : {}),
  };
}

/** The first problem with a body, in the words the form shows. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'The skill is not valid.';
  const where = issue.path.filter(p => typeof p === 'string').join('.');
  return where ? `${where}: ${issue.message}` : issue.message;
}
