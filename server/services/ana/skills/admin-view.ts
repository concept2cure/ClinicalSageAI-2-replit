/**
 * What the Skills section of Settings reads: the library as this organization
 * has it set, the organization's own skills, and a selection explained.
 *
 * Pure mapping from the registry and stored records to the shapes in
 * shared/ana/skills.ts, so the section shows exactly what AnA would load.
 *
 * @module server/services/ana/skills/admin-view
 */

import {
  orgSkillKey,
  type LibrarySkillDetailDto,
  type LibrarySkillSummaryDto,
  type OrgSkillDto,
  type SkillReferenceDto,
  type SkillSelectionDto,
} from '../../../../shared/ana/skills.js';
import { getGuideline } from '../../ana-ri/ich-guideline-corpus.js';
import { REGULATORY_FACTS } from '../../regulatory-currency/currency-registry.js';
import { getStandard } from '../../../../shared/regulatory/standards-registry.js';
import { THERAPEUTIC_AREAS } from '../../../../shared/constants/domain/therapeutic-areas.js';
import type { OrgSkillRecord, SkillSettingRecord } from '../../account-skill-bundles.js';
import type { SkillSelection } from './selector.js';
import type { LibrarySkill, LibrarySkillReference } from './types.js';

const HASH_SHOWN = 12;

function referenceLabel(r: LibrarySkillReference): string {
  switch (r.kind) {
    case 'standard':
      return getStandard(r.id).designation;
    case 'ich': {
      const g = getGuideline(r.id);
      return g ? `ICH ${g.code}: ${g.title}` : `ICH ${r.id}`;
    }
    case 'currency-fact':
      return REGULATORY_FACTS.find(f => f.id === r.id)?.topic ?? r.id;
    case 'ta-profile':
      return THERAPEUTIC_AREAS.find(t => t.value === r.id)?.label ?? r.id;
    case 'record':
      return r.label;
  }
}

function referencesOf(skill: LibrarySkill): SkillReferenceDto[] {
  return skill.references.map(r => ({ kind: r.kind, id: r.id, label: referenceLabel(r) }));
}

function extendedByOf(key: string, orgSkills: readonly OrgSkillRecord[]): LibrarySkillSummaryDto['extendedBy'] {
  return orgSkills
    .filter(r => r.extendsSkillKey === key && r.extensionMode && r.status !== 'archived')
    .map(r => ({ bundleId: r.bundleId, name: r.name, mode: r.extensionMode!, status: r.status }));
}

export function librarySummary(
  skill: LibrarySkill,
  settings: ReadonlyMap<string, SkillSettingRecord>,
  orgSkills: readonly OrgSkillRecord[],
): LibrarySkillSummaryDto {
  return {
    key: skill.key,
    name: skill.name,
    description: skill.description,
    parent: skill.parent,
    version: skill.version,
    contentHash: skill.contentHash.slice(0, HASH_SHOWN),
    review: { state: skill.review.state, note: skill.review.note },
    enabled: settings.get(skill.key)?.enabled !== false,
    extendedBy: extendedByOf(skill.key, orgSkills),
    disciplines: skill.disciplines,
    useCases: skill.useCases,
    segments: skill.segments,
    therapeuticAreas: skill.therapeuticAreas,
    regions: skill.regions,
    submissionTypes: skill.submissionTypes,
    surfaces: skill.surfaces,
    documentTypes: skill.documentTypes,
  };
}

export function libraryDetail(
  skill: LibrarySkill,
  settings: ReadonlyMap<string, SkillSettingRecord>,
  orgSkills: readonly OrgSkillRecord[],
): LibrarySkillDetailDto {
  const setting = settings.get(skill.key);
  return {
    ...librarySummary(skill, settings, orgSkills),
    instructions: skill.instructions,
    triggers: skill.triggers,
    tools: skill.tools,
    references: referencesOf(skill),
    disabledReason: setting && !setting.enabled ? setting.reason : null,
  };
}

export function orgSkillDto(r: OrgSkillRecord): OrgSkillDto {
  return {
    id: r.id,
    bundleId: r.bundleId,
    key: orgSkillKey(r.bundleId),
    name: r.name,
    description: r.description,
    instructions: r.instructions,
    triggers: r.triggers,
    tools: r.tools,
    extendsSkillKey: r.extendsSkillKey,
    extensionMode: r.extensionMode,
    status: r.status,
    version: r.version,
    updatedAt: r.updatedAt,
    disciplines: r.disciplines as OrgSkillDto['disciplines'],
    useCases: r.useCases as OrgSkillDto['useCases'],
    segments: r.segments as OrgSkillDto['segments'],
    therapeuticAreas: r.therapeuticAreas as OrgSkillDto['therapeuticAreas'],
    regions: r.regions as OrgSkillDto['regions'],
    submissionTypes: r.submissionTypes,
    surfaces: r.surfaces,
    documentTypes: r.documentTypes,
  };
}

export function selectionDto(selection: SkillSelection): SkillSelectionDto {
  return {
    selected: selection.selected.map(s => ({
      key: s.skill.key,
      name: s.skill.name,
      source: s.skill.source,
      version: s.skill.version,
      contentHash: s.skill.contentHash.slice(0, HASH_SHOWN),
      score: s.score,
      reasons: s.reasons,
      attached: [
        ...(s.skill.replacedBy
          ? [{ key: s.skill.replacedBy.key, name: s.skill.replacedBy.name, mode: 'replace' as const, version: s.skill.replacedBy.version }]
          : []),
        ...(s.skill.addenda ?? []).map(a => ({ key: a.key, name: a.name, mode: 'addendum' as const, version: a.version })),
      ],
    })),
    passedOver: selection.passedOver.map(p => ({ key: p.skill.key, name: p.skill.name, score: p.score, why: p.why })),
    considered: selection.considered,
  };
}
