/**
 * Therapeutic-area skills, derived from the therapeutic-area profiles.
 *
 * The profiles (server/services/ana/therapeutic-area-profiles/) already hold
 * what AnA needs to know per area: context rules, reviewer expectations,
 * endpoint and statistical considerations, guidance references and common
 * gaps. Until now they reached the project routes and the readiness
 * aggregator but not the conversation (the stream never rendered them). These
 * skills are how they reach it: one skill per profile, its instructions the
 * profile as `renderProfileForPrompt` renders it, its triggers the area's
 * names and those retrieval keywords that name the area (see triggersOf). A
 * program whose therapeutic area is the profile's also loads it (selector.ts).
 * Nothing is copied; editing a profile edits its skill, and the content hash
 * records which text a turn received.
 *
 * The cross-cutting profile (`other`) is not a therapeutic area and is not
 * offered as one.
 *
 * @module server/services/ana/skills/library/therapeutic-areas
 */

import type { TherapeuticArea } from '../../../../../shared/ana/skills.js';
import { SKILL_LIMITS } from '../../../../../shared/ana/skills.js';
import {
  getProfile,
  listAcceptedSlugs,
  listProfiles,
  renderProfileForPrompt,
  type TherapeuticAreaProfile,
} from '../../therapeutic-area-profiles/index.js';
import { skill, type LibrarySkillSource } from '../types.js';

const PROFILE_DIR = 'server/services/ana/therapeutic-area-profiles';

/** Room left for the method lines above the rendered profile. */
const PROFILE_BUDGET = SKILL_LIMITS.instructionsMax - 1200;

const ROOT = skill({
  key: 'therapeutic-area',
  name: 'Therapeutic-area context',
  description:
    'How AnA uses what is known about a therapeutic area: its reviewers, endpoints, statistical conventions and common gaps. Each area has its own skill under this one.',
  disciplines: ['clinical', 'regulatory-strategy'],
  useCases: ['strategy', 'drafting', 'review', 'study-design'],
  triggers: ['therapeutic area', 'indication-specific', 'disease area'],
  tools: ['lookup_fda_guidance', 'lookup_ich_guideline'],
  references: [{ kind: 'record', id: `${PROFILE_DIR}/types.ts`, label: 'Therapeutic-area profile shape' }],
  instructions: `
## When this applies
The program has a therapeutic area, or the question is about one. The area's own skill carries the specifics; this one says how to use them.

## Method
1. Establish the area from the program record, not from the wording of the question. When the program names none and the question does, say which area you are assuming.
2. Read the area's context rules for the section in hand first. A rule scoped to a module or section applies only there.
3. Treat each guidance reference as a document to look up, not a fact to repeat. Before citing one, confirm it with \`lookup_fda_guidance\` or \`lookup_ich_guideline\` and cite what the lookup returned. A reference the lookup cannot find is named as unconfirmed.
4. Use the reviewer expectations as a checklist against the draft: say which are met, which are not addressed and which do not apply.
5. Endpoint and statistical considerations shape the design and analysis questions; the numbers themselves come from the study data and the statistics engines, never from the profile.

## Before answering
- Every area-specific claim names the profile it came from or the guidance the lookup returned.
- Where the area's conventions differ by region, say which region you followed.
`,
});

/** Profile id → shared therapeutic-area value (hyphens become underscores). */
export function taValueOf(profile: TherapeuticAreaProfile): TherapeuticArea {
  return profile.id.replace(/-/g, '_') as TherapeuticArea;
}

/**
 * Words a profile lists for retrieval that do not name its area: they belong
 * to many areas, or to another area's patients. As triggers they would load an
 * area's context for a question that is not about the area.
 */
const NOT_AREA_SPECIFIC = new Set([
  // Profile aliases that name a method or modality shared by several areas.
  'immunotherapy',
  'orphan',
  // A labeling frequency category ("rare", "very rare") as often as an area.
  'rare',
  'general',
  'default',
  'cross cutting',
  'pediatric',
  'registry',
  'biologic',
  'malignancy',
  'pro',
  'small sample',
  // The neurology (CNS) profile lists psychiatric indications; psychiatry owns them.
  'depression',
  'schizophrenia',
]);

let sharedKeywords: ReadonlySet<string> | null = null;

/** Retrieval keywords that more than one profile lists. */
function keywordsSharedAcrossProfiles(): ReadonlySet<string> {
  if (sharedKeywords) return sharedKeywords;
  const seen = new Map<string, number>();
  for (const p of listProfiles()) {
    for (const k of new Set(p.retrievalKeywords.map(norm))) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  sharedKeywords = new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  return sharedKeywords;
}

function norm(raw: string): string {
  return String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The profile's own names and its area-specific retrieval keywords, as
 * trigger phrases. `reserved` is every phrase an authored method skill already
 * owns: "accelerated approval" is a regulatory-strategy question even though
 * the oncology profile lists it, and the method skill answers it.
 */
function triggersOf(profile: TherapeuticAreaProfile, reserved: ReadonlySet<string>): string[] {
  const shared = keywordsSharedAcrossProfiles();
  const out: string[] = [];
  const seen = new Set<string>();
  // The area's display name, id and every slug the profile registry resolves
  // to it ("vaccine", "cns", "obgyn").
  const aliases = listAcceptedSlugs().filter(slug => getProfile(slug)?.id === profile.id);
  const names = [profile.displayName, profile.id, ...aliases]
    .map(n => norm(n.replace(/-/g, ' ')))
    .filter(n => !NOT_AREA_SPECIFIC.has(n));
  const keywords = profile.retrievalKeywords
    .map(norm)
    .filter(k => !shared.has(k) && !reserved.has(k) && !NOT_AREA_SPECIFIC.has(k));
  for (const t of [...names, ...keywords]) {
    if (t.length < SKILL_LIMITS.triggerMin || t.length > SKILL_LIMITS.triggerMax || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= SKILL_LIMITS.triggersMax) break;
  }
  return out;
}

/** The profile rendered at the most bullets per section that fit the budget. */
function renderWithinBudget(profile: TherapeuticAreaProfile): string {
  for (const max of [4, 3, 2, 1]) {
    const text = renderProfileForPrompt(profile, { maxBulletsPerSection: max });
    if (text.length <= PROFILE_BUDGET) return text;
  }
  return renderProfileForPrompt(profile, { maxBulletsPerSection: 1 }).slice(0, PROFILE_BUDGET);
}

function profileSkill(profile: TherapeuticAreaProfile, reserved: ReadonlySet<string>): LibrarySkillSource {
  return skill({
    key: `therapeutic-area.${profile.id}`,
    name: `${profile.displayName}: therapeutic-area context`,
    description: `What reviewers expect in ${profile.displayName.toLowerCase()} programs: context rules, endpoints, statistical conventions, guidance to look up and the gaps most often found.`,
    disciplines: ['clinical', 'regulatory-strategy'],
    useCases: ['strategy', 'drafting', 'review', 'study-design'],
    therapeuticAreas: [taValueOf(profile)],
    triggers: triggersOf(profile, reserved),
    tools: ['lookup_fda_guidance', 'lookup_ich_guideline'],
    references: [
      { kind: 'ta-profile', id: taValueOf(profile) },
      { kind: 'record', id: `${PROFILE_DIR}/${profile.id}.ts`, label: `${profile.displayName} profile` },
    ],
    review: {
      state: 'unreviewed',
      note: `Rendered from the ${profile.displayName} therapeutic-area profile, which is platform knowledge written before 2026-10-22. The profile has not been read against its sources by a named regulatory reviewer.`,
    },
    instructions: `
## Method
Apply this area's context to the work in hand, following the therapeutic-area context skill: rules scoped to a section apply only there; each guidance reference is looked up (\`lookup_fda_guidance\`, \`lookup_ich_guideline\`) before it is cited; reviewer expectations are checked one by one against the draft; numbers come from the study data and engines, never from this profile.

${renderWithinBudget(profile)}`,
  });
}

/**
 * The root and one skill per profile. `reserved` holds the trigger phrases the
 * authored library already uses (library/index.ts passes them).
 */
export function therapeuticAreaSkills(reserved: ReadonlySet<string>): LibrarySkillSource[] {
  return [
    ROOT,
    ...listProfiles()
      .filter(p => p.id !== 'other')
      .map(p => profileSkill(p, reserved)),
  ];
}
