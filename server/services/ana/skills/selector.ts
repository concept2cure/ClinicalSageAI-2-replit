/**
 * Which skills AnA loads for a turn — decided by code, explained, and the same
 * every time for the same inputs.
 *
 * Three things decide it:
 *   - what the person chose: a skill picked in the conversation, or deployed
 *     to the project so it loads on every turn there. A choice always loads
 *     (within its own allowance) and never needs a trigger phrase;
 *   - what the person asked: a skill's trigger phrases found in the message;
 *   - what is in front of them: the surface and document open, and the
 *     program's segment, therapeutic area, submission type and region. The
 *     surface, the document and the program's therapeutic area can each load a
 *     skill on their own; segment, submission type and region only refine.
 *
 * The question outranks the screen. A skill whose facets do not fit the open
 * program (a device method in a pharmaceutical program) is never loaded on
 * context alone, but it is loaded when the person asks about it in words, at a
 * small penalty, because a pharmaceutical sponsor can ask how a 510(k)
 * predicate works.
 *
 * No model is consulted. The selection, its scores and its reasons are
 * returned whole so the turn can record them and Settings can show them.
 *
 * Pure: no database, no clock, no I/O.
 *
 * @module server/services/ana/skills/selector
 */

import {
  SKILL_TURN_BUDGET,
  type SkillChoice,
  type ClientSegmentId,
  type CanonicalRegion,
  type SkillFacets,
  type TherapeuticArea,
} from '../../../../shared/ana/skills.js';
import { resolveToRegistryId } from '../../../../shared/regulatory/submission-type-bridge.js';

/** A skill as the selector sees it: library and organization skills alike. */
export interface SelectableSkill extends SkillFacets {
  key: string;
  name: string;
  source: 'library' | 'organization';
  version: number;
  contentHash: string;
  triggers: string[];
  /** The instructions that will be loaded (an organization replacement's, when there is one). */
  instructions: string;
  /** The tools the loaded instructions rely on. */
  tools: string[];
  /** A library method's review state; null for an organization's own text. */
  reviewState: 'unreviewed' | 'reviewed' | null;
  /** For a library skill an organization replaced: the organization skill's key. */
  replacedBy?: { key: string; name: string; version: number } | null;
  /** Organization addenda loaded after the instructions. */
  addenda?: SelectableAddendum[];
}

export interface SelectableAddendum {
  key: string;
  name: string;
  version: number;
  contentHash: string;
  instructions: string;
}

export interface SkillSelectionContext {
  /** The person's message for this turn. */
  message: string;
  surfaceId?: string | null;
  documentType?: string | null;
  /** The open program's client segments; empty when unknown. */
  segments?: ClientSegmentId[];
  therapeuticArea?: TherapeuticArea | null;
  /** Any submission-type spelling; resolved through the bridge. */
  submissionType?: string | null;
  region?: CanonicalRegion | null;
  /** Skills the person picked in the conversation. */
  invokedKeys?: string[];
  /** Skills deployed to the open project: loaded on every turn there. */
  deployedKeys?: string[];
}

export interface SelectedSkill {
  skill: SelectableSkill;
  score: number;
  reasons: string[];
  triggerHits: string[];
  invoked: boolean;
  /** Picked in the conversation or deployed to the project; null when AnA selected it herself. */
  chosen: SkillChoice | null;
  contextOnly: boolean;
}

export interface PassedOverSkill {
  skill: SelectableSkill;
  score: number;
  why: string;
}

export interface SkillSelection {
  selected: SelectedSkill[];
  passedOver: PassedOverSkill[];
  /** How many skills were looked at. */
  considered: number;
}

export interface SkillBudget {
  maxSkills: number;
  maxContextOnly: number;
  maxChosen: number;
  maxChars: number;
}

// ─── Text matching ──────────────────────────────────────────────────────────

/** Lowercase, plain quotes and dashes, single spaces. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The trigger phrases present in a message, each counted once. A phrase
 * matches only as a whole: `cmc` does not match inside `cmcs-lab`, and `pk`
 * does not match inside `pkg`.
 */
export function matchTriggers(normalizedMessage: string, triggers: readonly string[]): string[] {
  if (!normalizedMessage) return [];
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const raw of triggers) {
    const t = normalizeForMatch(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(t)}(?![a-z0-9])`);
    if (re.test(normalizedMessage)) hits.push(t);
  }
  return hits;
}

/** A longer phrase is a more specific signal than a single word. */
function triggerWeight(trigger: string): number {
  const words = trigger.split(' ').filter(Boolean).length;
  return 2 + Math.min(3, words);
}

const TRIGGER_SCORE_CAP = 12;

// ─── Facets ─────────────────────────────────────────────────────────────────

interface FacetOutcome {
  score: number;
  reasons: string[];
  mismatches: string[];
  inFront: boolean;
}

function registryIdOf(submissionType: string | null | undefined): string | null {
  if (!submissionType) return null;
  return resolveToRegistryId(submissionType) ?? null;
}

/**
 * One list facet: a skill that names values for it either matches the
 * program's value (adding `weight`) or records a mismatch. An empty list on
 * the skill, or no value in the context, says nothing either way.
 */
function scoreListFacet(
  out: FacetOutcome,
  facet: { values: readonly string[]; actual: string | null | undefined; weight: number; label: string },
): boolean {
  const { values, actual, weight, label } = facet;
  if (values.length === 0 || !actual) return false;
  if (values.includes(actual)) {
    out.score += weight;
    out.reasons.push(`the ${label} is ${actual}`);
    return true;
  }
  out.mismatches.push(`written for ${values.join('/')}, the ${label} is ${actual}`);
  return false;
}

function scoreInFront(out: FacetOutcome, values: readonly string[], actual: string | null | undefined, reason: string): void {
  if (!actual || !values.includes(actual)) return;
  out.score += 3;
  out.inFront = true;
  out.reasons.push(reason);
}

function scoreFacets(skill: SelectableSkill, ctx: SkillSelectionContext, ctxRegistryId: string | null): FacetOutcome {
  const out: FacetOutcome = { score: 0, reasons: [], mismatches: [], inFront: false };

  scoreInFront(out, skill.surfaces, ctx.surfaceId, `the ${ctx.surfaceId} screen is open`);
  scoreInFront(out, skill.documentTypes, ctx.documentType, `a ${ctx.documentType} document is open`);

  const ctxSegments = ctx.segments ?? [];
  if (skill.segments.length > 0 && ctxSegments.length > 0) {
    if (skill.segments.some(s => ctxSegments.includes(s))) {
      out.score += 1;
      out.reasons.push(`the program is ${ctxSegments.join('/')}`);
    } else {
      out.mismatches.push(`written for ${skill.segments.join('/')}, the program is ${ctxSegments.join('/')}`);
    }
  }

  // The program's own therapeutic area is in front of the person on every
  // turn about it, so an area-specific method may load on it alone.
  const areaMatched = scoreListFacet(out, {
    values: skill.therapeuticAreas,
    actual: ctx.therapeuticArea,
    weight: 2,
    label: "program's therapeutic area",
  });
  if (areaMatched) out.inFront = true;
  scoreListFacet(out, { values: skill.submissionTypes, actual: ctxRegistryId, weight: 2, label: 'submission' });
  scoreListFacet(out, { values: skill.regions, actual: ctx.region, weight: 1, label: 'region' });

  return out;
}

function depthOf(key: string): number {
  return key.split('.').length;
}

function sizeOf(skill: SelectableSkill): number {
  let n = skill.instructions.length;
  for (const a of skill.addenda ?? []) n += a.instructions.length;
  return n;
}

// ─── Selection ──────────────────────────────────────────────────────────────

interface Scored {
  skill: SelectableSkill;
  score: number;
  triggerScore: number;
  reasons: string[];
  triggerHits: string[];
  invoked: boolean;
  chosen: SkillChoice | null;
  contextOnly: boolean;
}

/** A choice made under the library key or under the organization's replacement of it. */
function chosenAs(skill: SelectableSkill, keys: ReadonlySet<string>): boolean {
  return keys.has(skill.key) || (skill.replacedBy ? keys.has(skill.replacedBy.key) : false);
}

const CHOICE_SCORE: Record<SkillChoice, number> = { picked: 100, deployed: 50 };
const CHOICE_REASON: Record<SkillChoice, string> = {
  picked: 'chosen in this conversation',
  deployed: 'deployed to this project',
};

function scoreSkill(
  skill: SelectableSkill,
  message: string,
  choices: { picked: ReadonlySet<string>; deployed: ReadonlySet<string> },
  ctx: SkillSelectionContext,
  ctxRegistryId: string | null,
): Scored | null {
  const chosen: SkillChoice | null = chosenAs(skill, choices.picked) ? 'picked' : chosenAs(skill, choices.deployed) ? 'deployed' : null;
  const triggerHits = matchTriggers(message, skill.triggers);
  const triggerScore = Math.min(
    TRIGGER_SCORE_CAP,
    triggerHits.reduce((sum, t) => sum + triggerWeight(t), 0),
  );
  const facets = scoreFacets(skill, ctx, ctxRegistryId);

  const asked = chosen !== null || triggerScore > 0;
  // On context alone: only what is in front of the person, and only when
  // nothing about the program says the method is for something else.
  if (!asked && (!facets.inFront || facets.mismatches.length > 0)) return null;

  const reasons: string[] = [];
  if (chosen) reasons.push(CHOICE_REASON[chosen]);
  if (triggerHits.length > 0) reasons.push(`asked about ${triggerHits.map(t => `"${t}"`).join(', ')}`);
  reasons.push(...facets.reasons);
  if (asked) reasons.push(...facets.mismatches.map(m => `loaded on the question though ${m}`));

  // A choice is the person's: no facet mismatch penalizes it.
  const penalty = asked && !chosen ? 2 * facets.mismatches.length : 0;
  const score = (chosen ? CHOICE_SCORE[chosen] : 0) + triggerScore + facets.score - penalty;
  if (score <= 0) return null;
  return { skill, score, triggerScore, reasons, triggerHits, invoked: chosen === 'picked', chosen, contextOnly: !asked };
}

function compareScored(a: Scored, b: Scored): number {
  return (
    b.score - a.score ||
    b.triggerScore - a.triggerScore ||
    depthOf(b.skill.key) - depthOf(a.skill.key) ||
    (a.skill.key < b.skill.key ? -1 : a.skill.key > b.skill.key ? 1 : 0)
  );
}

interface Held {
  skills: number;
  chosen: number;
  contextOnly: number;
  chars: number;
}

/** Why a scored skill does not fit what the turn already holds, or null when it fits. */
function whyItDoesNotFit(e: Scored, held: Held, limits: SkillBudget): string | null {
  if (e.chosen && held.chosen >= limits.maxChosen) return `${limits.maxChosen} chosen skills are already loaded`;
  if (!e.chosen && held.skills >= limits.maxSkills) return `the turn already holds ${limits.maxSkills} closer matches`;
  if (e.contextOnly && held.contextOnly >= limits.maxContextOnly) return 'only one skill is loaded on the screen alone';
  if (held.chars + sizeOf(e.skill) > limits.maxChars) return 'it does not fit the turn’s skill budget';
  return null;
}

/**
 * Choose the skills for a turn from the skills an organization has on.
 * `skills` must already exclude what is switched off or not active; this
 * function decides relevance only.
 */
export function selectSkills(
  skills: readonly SelectableSkill[],
  ctx: SkillSelectionContext,
  budget: Partial<SkillBudget> = {},
): SkillSelection {
  const limits: SkillBudget = { ...SKILL_TURN_BUDGET, ...budget };
  const message = normalizeForMatch(ctx.message ?? '');
  const keySet = (keys: string[] | undefined) => new Set((keys ?? []).map(k => k.trim()).filter(Boolean));
  const choices = { picked: keySet(ctx.invokedKeys), deployed: keySet(ctx.deployedKeys) };
  const ctxRegistryId = registryIdOf(ctx.submissionType);

  const eligible = skills
    .map(skill => scoreSkill(skill, message, choices, ctx, ctxRegistryId))
    .filter((e): e is Scored => e !== null)
    .sort(compareScored);

  const selected: SelectedSkill[] = [];
  const passedOver: PassedOverSkill[] = [];
  const held: Held = { skills: 0, chosen: 0, contextOnly: 0, chars: 0 };

  for (const e of eligible) {
    const why = whyItDoesNotFit(e, held, limits);
    if (why) {
      passedOver.push({ skill: e.skill, score: e.score, why });
      continue;
    }
    if (e.chosen) held.chosen += 1;
    else held.skills += 1;
    held.chars += sizeOf(e.skill);
    if (e.contextOnly) held.contextOnly += 1;
    selected.push({
      skill: e.skill,
      score: e.score,
      reasons: e.reasons,
      triggerHits: e.triggerHits,
      invoked: e.invoked,
      chosen: e.chosen,
      contextOnly: e.contextOnly,
    });
  }

  return { selected, passedOver, considered: skills.length };
}
