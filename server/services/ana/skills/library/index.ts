/**
 * The platform skill library: every skill the platform ships, validated and
 * hashed once at load.
 *
 * A skill that fails validation is left out and logged; it is never served,
 * and library.test.ts fails on it, so a broken skill cannot ship unnoticed.
 *
 * Adding a skill: write it in the module for its discipline (or a new module
 * added to MODULES below), give it a key under an existing parent, and run
 * server/services/ana/skills/__tests__/library.test.ts.
 *
 * @module server/services/ana/skills/library
 */

import { createHash } from 'node:crypto';
import { stableStringify } from '../../../../../shared/canonical-json.js';
import { parentSkillKey } from '../../../../../shared/ana/skills.js';
import { createScopedLogger } from '../../../../utils/logger.js';
import type { LibrarySkill, LibrarySkillSource } from '../types.js';
import { validateLibraryShape, validateSkillSource, type SkillProblem } from './validate.js';
import { REGULATORY_STRATEGY_SKILLS } from './regulatory-strategy.js';
import { SUBMISSIONS_SKILLS } from './submissions.js';
import { CMC_SKILLS } from './cmc.js';
import { NONCLINICAL_SKILLS } from './nonclinical.js';
import { CLINICAL_SKILLS } from './clinical.js';
import { BIOSTATISTICS_SKILLS } from './biostatistics.js';
import { CLINICAL_PHARMACOLOGY_SKILLS } from './clinical-pharmacology.js';
import { SAFETY_SKILLS } from './safety.js';
import { LABELING_SKILLS } from './labeling.js';
import { MEDICAL_WRITING_SKILLS } from './medical-writing.js';
import { QUALITY_SYSTEMS_SKILLS } from './quality-systems.js';
import { DEVICE_SKILLS } from './device.js';
import { DIAGNOSTICS_SKILLS } from './diagnostics.js';
import { therapeuticAreaSkills } from './therapeutic-areas.js';

const logger = createScopedLogger('ana-skills-library');

/** Every authored module, in the order Settings lists disciplines. */
export const LIBRARY_MODULES: ReadonlyArray<readonly LibrarySkillSource[]> = [
  REGULATORY_STRATEGY_SKILLS,
  SUBMISSIONS_SKILLS,
  CMC_SKILLS,
  NONCLINICAL_SKILLS,
  CLINICAL_SKILLS,
  BIOSTATISTICS_SKILLS,
  CLINICAL_PHARMACOLOGY_SKILLS,
  SAFETY_SKILLS,
  LABELING_SKILLS,
  MEDICAL_WRITING_SKILLS,
  QUALITY_SYSTEMS_SKILLS,
  DEVICE_SKILLS,
  DIAGNOSTICS_SKILLS,
];

/**
 * Every skill source: the authored modules, then the therapeutic-area skills
 * derived from the profiles, whose triggers leave out the phrases an authored
 * method already owns.
 */
export function librarySources(): LibrarySkillSource[] {
  const authored = LIBRARY_MODULES.flat();
  const reserved = new Set(authored.flatMap(s => s.triggers.map(t => t.toLowerCase())));
  return [...authored, ...therapeuticAreaSkills(reserved)];
}

/** The fields a turn's record vouches for: everything that shapes what AnA reads. */
function contentOf(s: LibrarySkillSource): Record<string, unknown> {
  return {
    key: s.key,
    version: s.version,
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    triggers: s.triggers,
    tools: s.tools,
    references: s.references,
    disciplines: s.disciplines,
    useCases: s.useCases,
    segments: s.segments,
    therapeuticAreas: s.therapeuticAreas,
    regions: s.regions,
    submissionTypes: s.submissionTypes,
    surfaces: s.surfaces,
    documentTypes: s.documentTypes,
    review: s.review,
  };
}

/**
 * sha256 of the canonical JSON of a skill's content. Hashed with node:crypto
 * here rather than shared/canonical-json's sha256Hex, which reaches crypto
 * through `require` and so cannot run in the ESM production bundle.
 */
export function contentHashOf(s: LibrarySkillSource): string {
  return createHash('sha256').update(stableStringify(contentOf(s)), 'utf8').digest('hex');
}

export interface BuiltLibrary {
  skills: LibrarySkill[];
  byKey: ReadonlyMap<string, LibrarySkill>;
  /** Skills left out, with why. Empty in a shippable build. */
  problems: SkillProblem[];
}

/** Validate, hash and index a set of skill sources. Exported for tests. */
export function buildLibrary(sources: readonly LibrarySkillSource[]): BuiltLibrary {
  const problems: SkillProblem[] = [...validateLibraryShape(sources)];
  for (const s of sources) problems.push(...validateSkillSource(s));

  const bad = new Set(problems.map(p => p.key));
  // A skill whose parent was left out is left out too: its place in the tree is gone.
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sources) {
      const parent = parentSkillKey(s.key);
      if (!bad.has(s.key) && parent && bad.has(parent)) {
        bad.add(s.key);
        problems.push({ key: s.key, problem: `left out because its parent "${parent}" was` });
        changed = true;
      }
    }
  }

  const skills: LibrarySkill[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (bad.has(s.key) || seen.has(s.key)) continue;
    seen.add(s.key);
    skills.push({ ...s, parent: parentSkillKey(s.key), contentHash: contentHashOf(s) });
  }
  return { skills, byKey: new Map(skills.map(s => [s.key, s])), problems };
}

let built: BuiltLibrary | null = null;

/** The library, built on first use. */
export function getSkillLibrary(): BuiltLibrary {
  if (!built) {
    built = buildLibrary(librarySources());
    for (const p of built.problems) {
      logger.error(`Skill ${p.key} left out of the library: ${p.problem}`);
    }
  }
  return built;
}

export function getLibrarySkill(key: string): LibrarySkill | undefined {
  return getSkillLibrary().byKey.get(key);
}
