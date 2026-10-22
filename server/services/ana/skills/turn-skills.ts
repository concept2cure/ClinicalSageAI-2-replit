/**
 * The skills a conversation turn loads: the platform library as this
 * organization has it set, the organization's own skills, the selector's
 * choice, and the prompt block AnA reads.
 *
 * Fail closed to nothing, never to the wrong skills. When the organization's
 * settings or skills cannot be read, no skill loads (a library skill the
 * administrator turned off must not come back because the read failed), the
 * turn says so, and AnA answers without them. Skills shape method; the turn
 * does not depend on them.
 *
 * @module server/services/ana/skills/turn-skills
 */

import { createHash } from 'node:crypto';
import {
  orgSkillKey,
  type ClientSegmentId,
  type CanonicalRegion,
  type TherapeuticArea,
} from '../../../../shared/ana/skills.js';
import { stableStringify } from '../../../../shared/canonical-json.js';
import { THERAPEUTIC_AREAS } from '../../../../shared/constants/domain/therapeutic-areas.js';
import { normalizeTherapeuticArea } from '../../../../shared/constants/domain/aliases.js';
import { isCanonicalRegion } from '../../../../shared/regulatory/region-identity.js';
import { resolveToRegistryEntry } from '../../../../shared/regulatory/submission-type-bridge.js';
import {
  listOrgSkills,
  readSkillSettings,
  type OrgSkillRecord,
  type SkillReadClient,
  type SkillSettingRecord,
} from '../../account-skill-bundles.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getProfile } from '../therapeutic-area-profiles/index.js';
import { getSkillLibrary } from './library/index.js';
import { selectSkills, type SelectableSkill, type SkillSelection, type SkillSelectionContext } from './selector.js';
import type { LibrarySkill } from './types.js';

// ─── Candidates ─────────────────────────────────────────────────────────────

/** sha256 of what an organization skill puts in front of AnA. */
export function orgSkillHash(r: OrgSkillRecord): string {
  return createHash('sha256')
    .update(
      stableStringify({
        bundleId: r.bundleId,
        version: r.version,
        name: r.name,
        instructions: r.instructions,
        triggers: r.triggers,
        disciplines: r.disciplines,
        useCases: r.useCases,
        segments: r.segments,
        therapeuticAreas: r.therapeuticAreas,
        regions: r.regions,
        submissionTypes: r.submissionTypes,
        surfaces: r.surfaces,
        documentTypes: r.documentTypes,
        tools: r.tools,
        extendsSkillKey: r.extendsSkillKey,
        extensionMode: r.extensionMode,
      }),
      'utf8',
    )
    .digest('hex');
}

function inForce(r: OrgSkillRecord): boolean {
  return r.status === 'active' || r.status === 'locked';
}

function orFacet<T>(own: T[], base: T[]): T[] {
  return own.length > 0 ? own : base;
}

export interface CandidateNotes {
  /** Organization skills that extend a library skill the library no longer holds. */
  orphaned: OrgSkillRecord[];
}

interface SortedOrgSkills {
  replacements: Map<string, OrgSkillRecord>;
  addenda: Map<string, OrgSkillRecord[]>;
  orphaned: OrgSkillRecord[];
  standalone: OrgSkillRecord[];
}

/** The organization's skills in force, by what each does to the library. */
function sortOrgSkills(orgSkills: readonly OrgSkillRecord[], libraryKeys: ReadonlySet<string>): SortedOrgSkills {
  const sorted: SortedOrgSkills = { replacements: new Map(), addenda: new Map(), orphaned: [], standalone: [] };
  for (const r of orgSkills.filter(inForce)) {
    const extended = r.extendsSkillKey;
    if (!extended) {
      sorted.standalone.push(r);
    } else if (!libraryKeys.has(extended)) {
      sorted.orphaned.push(r);
      // A replacement still stands on its own facets; an addendum has nothing to add to.
      if (r.extensionMode === 'replace') sorted.standalone.push(r);
    } else if (r.extensionMode === 'replace') {
      if (!sorted.replacements.has(extended)) sorted.replacements.set(extended, r);
    } else {
      sorted.addenda.set(extended, [...(sorted.addenda.get(extended) ?? []), r]);
    }
  }
  return sorted;
}

/** A library skill the organization replaced: its method, under the library key. */
function replacedLibrarySkill(l: LibrarySkill, r: OrgSkillRecord): SelectableSkill {
  return {
    key: l.key,
    name: r.name,
    source: 'library',
    version: l.version,
    contentHash: l.contentHash,
    triggers: Array.from(new Set([...l.triggers, ...r.triggers])),
    instructions: r.instructions,
    tools: r.tools,
    reviewState: null,
    disciplines: orFacet(r.disciplines as LibrarySkill['disciplines'], l.disciplines),
    useCases: orFacet(r.useCases as LibrarySkill['useCases'], l.useCases),
    segments: orFacet(r.segments as ClientSegmentId[], l.segments),
    therapeuticAreas: orFacet(r.therapeuticAreas as TherapeuticArea[], l.therapeuticAreas),
    regions: orFacet(r.regions as CanonicalRegion[], l.regions),
    submissionTypes: orFacet(r.submissionTypes, l.submissionTypes),
    surfaces: orFacet(r.surfaces, l.surfaces),
    documentTypes: orFacet(r.documentTypes, l.documentTypes),
    replacedBy: { key: orgSkillKey(r.bundleId), name: r.name, version: r.version },
    addenda: [],
  };
}

/** A library skill as written, with the organization's addenda attached. */
function librarySkillWithAddenda(l: LibrarySkill, addenda: readonly OrgSkillRecord[]): SelectableSkill {
  return {
    key: l.key,
    name: l.name,
    source: 'library',
    version: l.version,
    contentHash: l.contentHash,
    triggers: l.triggers,
    instructions: l.instructions,
    tools: l.tools,
    reviewState: l.review.state,
    disciplines: l.disciplines,
    useCases: l.useCases,
    segments: l.segments,
    therapeuticAreas: l.therapeuticAreas,
    regions: l.regions,
    submissionTypes: l.submissionTypes,
    surfaces: l.surfaces,
    documentTypes: l.documentTypes,
    replacedBy: null,
    addenda: addenda.map(a => ({
      key: orgSkillKey(a.bundleId),
      name: a.name,
      version: a.version,
      contentHash: orgSkillHash(a),
      instructions: a.instructions,
    })),
  };
}

/**
 * Everything the organization has on, as the selector sees it. A library
 * skill turned off is left out unless the organization replaced it with its
 * own version; an addendum loads only with its library skill.
 */
export function buildSelectableSkills(
  library: readonly LibrarySkill[],
  orgSkills: readonly OrgSkillRecord[],
  settings: ReadonlyMap<string, Pick<SkillSettingRecord, 'enabled'>>,
): { skills: SelectableSkill[]; notes: CandidateNotes } {
  const { replacements, addenda, orphaned, standalone } = sortOrgSkills(orgSkills, new Set(library.map(s => s.key)));

  const skills: SelectableSkill[] = [];
  for (const l of library) {
    const replacement = replacements.get(l.key);
    if (replacement) skills.push(replacedLibrarySkill(l, replacement));
    else if (settings.get(l.key)?.enabled !== false) skills.push(librarySkillWithAddenda(l, addenda.get(l.key) ?? []));
  }

  for (const r of standalone) {
    skills.push({
      key: orgSkillKey(r.bundleId),
      name: r.name,
      source: 'organization',
      version: r.version,
      contentHash: orgSkillHash(r),
      triggers: r.triggers,
      instructions: r.instructions,
      tools: r.tools,
      reviewState: null,
      disciplines: r.disciplines as LibrarySkill['disciplines'],
      useCases: r.useCases as LibrarySkill['useCases'],
      segments: r.segments as ClientSegmentId[],
      therapeuticAreas: r.therapeuticAreas as TherapeuticArea[],
      regions: r.regions as CanonicalRegion[],
      submissionTypes: r.submissionTypes,
      surfaces: r.surfaces,
      documentTypes: r.documentTypes,
      replacedBy: null,
      addenda: [],
    });
  }

  return { skills, notes: { orphaned } };
}

// ─── Context from the turn ──────────────────────────────────────────────────

const SEGMENT_OF_REGISTRY: Record<string, ClientSegmentId[]> = {
  pharma_biotech: ['pharma', 'biotech'],
  medical_devices: ['device'],
  diagnostics_ivd: ['ivd'],
};

const TA_VALUES = new Set<string>(THERAPEUTIC_AREAS.map(t => t.value));

/** A project's free-form therapeutic area as the shared vocabulary value, or null. */
export function therapeuticAreaOf(raw: string | null | undefined): TherapeuticArea | null {
  if (!raw) return null;
  const direct = normalizeTherapeuticArea(raw.trim().toLowerCase());
  if (direct) return direct;
  const profile = getProfile(raw);
  if (!profile) return null;
  const value = profile.id.replace(/-/g, '_');
  return TA_VALUES.has(value) ? (value as TherapeuticArea) : null;
}

/** The segments and region a submission type states, from the global registry. */
export function segmentsAndRegionOf(submissionType: string | null | undefined): {
  segments: ClientSegmentId[];
  region: CanonicalRegion | null;
} {
  const entry = submissionType ? resolveToRegistryEntry(submissionType) : null;
  if (!entry) return { segments: [], region: null };
  const segments = SEGMENT_OF_REGISTRY[entry.segment ?? ''] ?? [];
  const region = isCanonicalRegion(entry.region) ? entry.region : null;
  return { segments, region };
}

// ─── The prompt block ───────────────────────────────────────────────────────

function reviewLine(skill: SelectableSkill): string {
  return skill.reviewState === 'unreviewed' ? ' Not yet reviewed against its sources by a named regulatory reviewer.' : '';
}

function originLine(skill: SelectableSkill): string {
  if (skill.replacedBy) {
    return `This organization's own version (${skill.replacedBy.name}, version ${skill.replacedBy.version}) of library skill ${skill.key}, in place of the library method.`;
  }
  if (skill.source === 'organization') return `This organization's skill, version ${skill.version}.`;
  return `Library skill ${skill.key}, version ${skill.version} (${skill.contentHash.slice(0, 12)}).`;
}

/** Tool names a skill's text puts in backticks. */
function toolsNamedIn(text: string): string[] {
  return Array.from(new Set([...text.matchAll(/`([a-z][a-z0-9_]{2,})`/g)].map(m => m[1])));
}

let knownTools: ReadonlySet<string> | null = null;

/** Every tool name AnA has: a backticked word that is not one is not checked. */
function knownToolNames(): ReadonlySet<string> {
  return (knownTools ??= new Set(ALL_ANA_TOOLS.map(t => t.name)));
}

export interface RenderOptions {
  /** The tools this turn can call. A named tool outside it is stated as unavailable. */
  availableTools?: ReadonlySet<string> | null;
}

/** The system-prompt block for a selection. Empty when nothing was selected. */
export function renderSkillsBlock(selection: SkillSelection, options: RenderOptions = {}): string {
  if (selection.selected.length === 0) return '';
  const lines: string[] = [
    '',
    '',
    '## Skills for this turn',
    '',
    'These are methods from this organization’s skill library, chosen for what was asked and what is on screen. Follow each where it applies to the question. A skill never supplies a figure, a verdict, a date or a citation: those come from the tools and records it names. When a tool a skill names is not available in this turn, say so and do not supply the result yourself. If asked which skills you used, name these.',
  ];
  for (const s of selection.selected) {
    const sk = s.skill;
    lines.push('', `### ${sk.name}`, '');
    lines.push(`${originLine(sk)}${reviewLine(sk)} Loaded because ${s.reasons.join('; ')}.`);
    if (options.availableTools) {
      const known = knownToolNames();
      const named = [sk.instructions, ...(sk.addenda ?? []).map(a => a.instructions)].flatMap(toolsNamedIn);
      const missing = Array.from(new Set(named)).filter(t => known.has(t) && !options.availableTools!.has(t));
      if (missing.length > 0) {
        lines.push(`Not available in this turn: ${missing.map(t => `\`${t}\``).join(', ')}.`);
      }
    }
    lines.push('', sk.instructions.trim());
    for (const a of sk.addenda ?? []) {
      lines.push('', `#### This organization's addendum: ${a.name} (version ${a.version})`, '', a.instructions.trim());
    }
  }
  return lines.join('\n');
}

// ─── The turn ───────────────────────────────────────────────────────────────

export interface TurnSkillEntry {
  key: string;
  name: string;
  source: 'library' | 'organization';
  version: number;
  contentHash: string;
  replacedBy: { key: string; name: string; version: number } | null;
  addenda: Array<{ key: string; name: string; version: number; contentHash: string }>;
  reasons: string[];
}

export type TurnSkillsStatus = 'loaded' | 'none' | 'unavailable';

export interface TurnSkills {
  status: TurnSkillsStatus;
  selection: SkillSelection | null;
  /** What the turn record and the client are told. */
  entries: TurnSkillEntry[];
  /** Tools the loaded skills name, to survive the turn's relevance cap. */
  toolPins: string[];
  /** Why the skills could not be read, for the turn's warning. */
  error?: string;
}

export interface TurnSkillInput {
  organizationId: number;
  message: string;
  surfaceId?: string | null;
  documentType?: string | null;
  submissionType?: string | null;
  projectId?: number | null;
  invokedKeys?: string[];
}

function entriesOf(selection: SkillSelection): TurnSkillEntry[] {
  return selection.selected.map(s => ({
    key: s.skill.key,
    name: s.skill.name,
    source: s.skill.source,
    version: s.skill.version,
    contentHash: s.skill.contentHash,
    replacedBy: s.skill.replacedBy ?? null,
    addenda: (s.skill.addenda ?? []).map(a => ({ key: a.key, name: a.name, version: a.version, contentHash: a.contentHash })),
    reasons: s.reasons,
  }));
}

/** A turn that selects no skills: an org-less turn, or a door that has none. */
export const NO_TURN_SKILLS: TurnSkills = { status: 'none', selection: null, entries: [], toolPins: [] };

const REGISTRY_ID = /^[A-Z][A-Z0-9_]{2,63}$/;

/**
 * The first document-type registry id among the turn's candidates (the
 * surface's stated type, then the document context's). Client-sent, so only
 * the registry-id shape is accepted; anything else is no document type.
 */
export function documentTypeIdOf(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const v = c && typeof c === 'object' ? (c as Record<string, unknown>).documentType : undefined;
    if (typeof v === 'string' && REGISTRY_ID.test(v)) return v;
  }
  return null;
}

function toolPinsOf(selection: SkillSelection): string[] {
  const pins = new Set<string>();
  for (const s of selection.selected) {
    for (const t of s.skill.tools) pins.add(t);
    for (const t of toolsNamedIn(s.skill.instructions)) pins.add(t);
    for (const a of s.skill.addenda ?? []) for (const t of toolsNamedIn(a.instructions)) pins.add(t);
  }
  const known = knownToolNames();
  return Array.from(pins).filter(t => known.has(t));
}

/** The project's therapeutic area, read in the organization's scope. Null when unset or unreadable. */
async function projectTherapeuticArea(client: SkillReadClient, organizationId: number, projectId: number): Promise<TherapeuticArea | null> {
  const { rows } = await client.query(
    `SELECT therapeutic_area FROM projects WHERE id = $1 AND organization_id = $2`,
    [projectId, organizationId],
  );
  return therapeuticAreaOf(typeof rows[0]?.therapeutic_area === 'string' ? rows[0].therapeutic_area : null);
}

/** Select and describe the turn's skills. Never throws. */
export async function resolveTurnSkills(client: SkillReadClient, input: TurnSkillInput): Promise<TurnSkills> {
  try {
    const library = getSkillLibrary();
    const [orgSkills, settings, therapeuticArea] = await Promise.all([
      listOrgSkills(client, input.organizationId),
      readSkillSettings(client, input.organizationId),
      input.projectId ? projectTherapeuticArea(client, input.organizationId, input.projectId) : Promise.resolve(null),
    ]);
    const { skills } = buildSelectableSkills(library.skills, orgSkills, settings);
    const { segments, region } = segmentsAndRegionOf(input.submissionType);
    const context: SkillSelectionContext = {
      message: input.message,
      surfaceId: input.surfaceId ?? null,
      documentType: input.documentType ?? null,
      segments,
      therapeuticArea,
      submissionType: input.submissionType ?? null,
      region,
      invokedKeys: input.invokedKeys ?? [],
    };
    const selection = selectSkills(skills, context);
    return {
      status: selection.selected.length > 0 ? 'loaded' : 'none',
      selection,
      entries: entriesOf(selection),
      toolPins: toolPinsOf(selection),
    };
  } catch (err) {
    return {
      status: 'unavailable',
      selection: null,
      entries: [],
      toolPins: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
