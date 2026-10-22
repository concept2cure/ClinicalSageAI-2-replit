/**
 * The checks every library skill passes before AnA may load it.
 *
 * Run at load (an invalid skill is left out and logged, never served) and,
 * with the checks that need the tool registry and the file system, in
 * library.test.ts, which must stay green for the library to ship.
 *
 * @module server/services/ana/skills/library/validate
 */

import {
  SKILL_DISCIPLINES,
  SKILL_LIMITS,
  SKILL_REVIEW_STATES,
  SKILL_SEGMENT_IDS,
  SKILL_USE_CASES,
  isLibrarySkillKey,
  parentSkillKey,
} from '../../../../../shared/ana/skills.js';
import { THERAPEUTIC_AREAS } from '../../../../../shared/constants/domain/therapeutic-areas.js';
import { isCanonicalRegion } from '../../../../../shared/regulatory/region-identity.js';
import { isStandardId } from '../../../../../shared/regulatory/standards-registry.js';
import { resolveToRegistryId } from '../../../../../shared/regulatory/submission-type-bridge.js';
import type { LibrarySkillSource } from '../types.js';

const TA_VALUES = new Set<string>(THERAPEUTIC_AREAS.map(t => t.value));
const DISCIPLINES = new Set<string>(SKILL_DISCIPLINES);
const USE_CASES = new Set<string>(SKILL_USE_CASES);
const SEGMENTS = new Set<string>(SKILL_SEGMENT_IDS);
const REVIEW_STATES = new Set<string>(SKILL_REVIEW_STATES);

/** Characters the product's tone floor refuses in AnA's static knowledge. */
const EXCLAMATION = /!(?!\[)/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export interface SkillProblem {
  key: string;
  problem: string;
}

function checkList(key: string, field: string, values: readonly string[], allowed: (v: string) => boolean, out: SkillProblem[]): void {
  if (values.length > SKILL_LIMITS.facetMax) out.push({ key, problem: `${field} lists more than ${SKILL_LIMITS.facetMax} values` });
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) out.push({ key, problem: `${field} repeats "${v}"` });
    seen.add(v);
    if (!allowed(v)) out.push({ key, problem: `${field} has "${v}", which is not in its vocabulary` });
  }
}

/** Problems with one skill that need no registry outside shared/. */
export function validateSkillSource(s: LibrarySkillSource): SkillProblem[] {
  const out: SkillProblem[] = [];
  const key = s.key;

  if (!isLibrarySkillKey(key)) out.push({ key, problem: 'key is not a lowercase dotted path of at most four parts' });

  const name = s.name?.trim() ?? '';
  if (!name) out.push({ key, problem: 'name is empty' });
  if (name.length > SKILL_LIMITS.nameMax) out.push({ key, problem: `name is longer than ${SKILL_LIMITS.nameMax} characters` });
  if (EXCLAMATION.test(name) || EMOJI.test(name)) out.push({ key, problem: 'name carries an exclamation mark or emoji' });

  const description = s.description?.trim() ?? '';
  if (description.length < SKILL_LIMITS.descriptionMin || description.length > SKILL_LIMITS.descriptionMax) {
    out.push({ key, problem: `description is not ${SKILL_LIMITS.descriptionMin}–${SKILL_LIMITS.descriptionMax} characters` });
  }

  if (s.disciplines.length === 0) out.push({ key, problem: 'names no discipline' });
  if (s.useCases.length === 0) out.push({ key, problem: 'names no use case' });
  checkList(key, 'disciplines', s.disciplines, v => DISCIPLINES.has(v), out);
  checkList(key, 'useCases', s.useCases, v => USE_CASES.has(v), out);
  checkList(key, 'segments', s.segments, v => SEGMENTS.has(v), out);
  checkList(key, 'therapeuticAreas', s.therapeuticAreas, v => TA_VALUES.has(v), out);
  checkList(key, 'regions', s.regions, v => isCanonicalRegion(v), out);
  checkList(key, 'submissionTypes', s.submissionTypes, v => resolveToRegistryId(v) === v, out);
  checkList(key, 'surfaces', s.surfaces, v => /^[a-z0-9-]+$/.test(v), out);
  checkList(key, 'documentTypes', s.documentTypes, v => /^[A-Z0-9_]+$/.test(v), out);

  if (s.triggers.length === 0 && s.surfaces.length === 0 && s.documentTypes.length === 0) {
    out.push({ key, problem: 'has no trigger, surface or document type, so nothing can select it' });
  }
  if (s.triggers.length > SKILL_LIMITS.triggersMax) out.push({ key, problem: `has more than ${SKILL_LIMITS.triggersMax} triggers` });
  const seenTriggers = new Set<string>();
  for (const t of s.triggers) {
    if (t !== t.toLowerCase() || t !== t.trim() || /\s{2,}/.test(t)) out.push({ key, problem: `trigger "${t}" is not lowercase single-spaced text` });
    if (t.length < SKILL_LIMITS.triggerMin || t.length > SKILL_LIMITS.triggerMax) out.push({ key, problem: `trigger "${t}" is not ${SKILL_LIMITS.triggerMin}–${SKILL_LIMITS.triggerMax} characters` });
    if (seenTriggers.has(t)) out.push({ key, problem: `trigger "${t}" is repeated` });
    seenTriggers.add(t);
  }

  if (s.tools.length > SKILL_LIMITS.toolsMax) out.push({ key, problem: `routes to more than ${SKILL_LIMITS.toolsMax} tools` });
  if (new Set(s.tools).size !== s.tools.length) out.push({ key, problem: 'repeats a tool' });

  for (const r of s.references) {
    if (r.kind === 'standard' && !isStandardId(r.id)) out.push({ key, problem: `cites standard "${r.id}", which the standards registry does not hold` });
    if (r.kind === 'ta-profile' && !TA_VALUES.has(r.id)) out.push({ key, problem: `cites therapeutic area "${r.id}", which is not in the vocabulary` });
    if (r.kind === 'record' && !/^(shared|server)\/[A-Za-z0-9_./-]+\.ts$/.test(r.id)) out.push({ key, problem: `cites record "${r.id}", which is not a shared/ or server/ TypeScript path` });
    if ((r.kind === 'ich' || r.kind === 'currency-fact') && !r.id.trim()) out.push({ key, problem: `cites an empty ${r.kind} id` });
  }

  const instructions = s.instructions ?? '';
  if (instructions.length < SKILL_LIMITS.instructionsMin || instructions.length > SKILL_LIMITS.instructionsMax) {
    out.push({ key, problem: `instructions are not ${SKILL_LIMITS.instructionsMin}–${SKILL_LIMITS.instructionsMax} characters (${instructions.length})` });
  }
  if (EXCLAMATION.test(instructions) || EMOJI.test(instructions)) out.push({ key, problem: 'instructions carry an exclamation mark or emoji' });
  if (!/^## Method\b/m.test(instructions)) out.push({ key, problem: 'instructions have no "## Method" section' });
  if (/\b(TODO|TBD|FIXME|lorem ipsum)\b/i.test(instructions)) out.push({ key, problem: 'instructions hold a placeholder' });

  if (!Number.isInteger(s.version) || s.version < 1) out.push({ key, problem: 'version is not a positive integer' });
  if (!REVIEW_STATES.has(s.review.state)) out.push({ key, problem: `review state "${s.review.state}" is unknown` });
  if (s.review.state === 'reviewed' && (!s.review.reviewedBy || !s.review.reviewedOn)) {
    out.push({ key, problem: 'is marked reviewed without a named reviewer and date' });
  }
  if (!s.review.note?.trim()) out.push({ key, problem: 'review note is empty' });

  return out;
}

/** Problems across the whole library: duplicate keys and missing parents. */
export function validateLibraryShape(skills: readonly LibrarySkillSource[]): SkillProblem[] {
  const out: SkillProblem[] = [];
  const keys = new Set<string>();
  for (const s of skills) {
    if (keys.has(s.key)) out.push({ key: s.key, problem: 'key is used twice' });
    keys.add(s.key);
  }
  for (const s of skills) {
    const parent = parentSkillKey(s.key);
    if (parent && !keys.has(parent)) out.push({ key: s.key, problem: `parent "${parent}" is not in the library` });
  }
  return out;
}
