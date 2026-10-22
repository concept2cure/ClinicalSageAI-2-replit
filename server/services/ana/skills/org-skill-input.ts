/**
 * An administrator's skill, checked before it is stored: the same vocabulary
 * and limits as the platform library (shared/ana/skills.ts), tools AnA has in
 * the launch scope, and a library skill that exists when one is extended.
 *
 * @module server/services/ana/skills/org-skill-input
 */

import { z } from 'zod';
import {
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
    const selectable = v.triggers.length > 0 || v.surfaces.length > 0 || v.documentTypes.length > 0;
    const loadsWithBase = v.extensionMode === 'addendum';
    if (v.status === 'active' && !selectable && !loadsWithBase && v.extensionMode !== 'replace') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['triggers'],
        message: 'An active skill needs at least one trigger phrase, screen or document type, or AnA can never select it.',
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
  };
}

/** The first problem with a body, in the words the form shows. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'The skill is not valid.';
  const where = issue.path.filter(p => typeof p === 'string').join('.');
  return where ? `${where}: ${issue.message}` : issue.message;
}
