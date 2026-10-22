import type { C2CFormConfig, C2CFormField, C2CFormFieldOption } from '../C2CForm';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { THERAPEUTIC_AREAS } from '@shared/constants/domain/therapeutic-areas';
import {
  SKILL_DISCIPLINES,
  SKILL_DISCIPLINE_LABELS,
  SKILL_SEGMENT_IDS,
  SKILL_SEGMENT_LABELS,
  SKILL_USE_CASES,
  SKILL_USE_CASE_LABELS,
  type LibrarySkillDetailDto,
  type LibrarySkillSummaryDto,
  type OrgSkillDto,
} from '@shared/ana/skills';

/**
 * The forms of AnA skills: turning a library skill off or on (a drawer in
 * Admin and access → Skills, AdminSkills.tsx), and what the skill studio
 * (SkillStudio.tsx) starts from and sends when a skill is written or tuned.
 * Every change carries the reason the server requires; the body built here is
 * what /api/ana-skills reads.
 */

export const SEGMENT_OPTIONS: C2CFormFieldOption[] = [
  { value: '', label: 'Every client segment' },
  ...SKILL_SEGMENT_IDS.map((s) => ({ value: s, label: SKILL_SEGMENT_LABELS[s] })),
];
export const DISCIPLINE_OPTIONS: C2CFormFieldOption[] = SKILL_DISCIPLINES.map((d) => ({ value: d, label: SKILL_DISCIPLINE_LABELS[d] }));
export const USE_CASE_OPTIONS: C2CFormFieldOption[] = SKILL_USE_CASES.map((u) => ({ value: u, label: SKILL_USE_CASE_LABELS[u] }));
export const TA_OPTIONS: C2CFormFieldOption[] = [
  { value: '', label: 'Any therapeutic area' },
  ...THERAPEUTIC_AREAS.filter((t) => t.value !== 'other').map((t) => ({ value: t.value, label: t.label })),
];
export const STATUS_OPTIONS: C2CFormFieldOption[] = [
  { value: 'draft', label: 'Draft — AnA does not load it' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export const REASON_FIELD: C2CFormField = {
  key: 'reason',
  label: 'Reason for change',
  type: 'textarea',
  rows: 2,
  required: true,
  desc: `Recorded with the change in the audit trail. At least ${GOVERNED_REASON_MIN} characters.`,
};

export type Editing =
  | { kind: 'toggle'; skill: LibrarySkillSummaryDto }
  | {
      kind: 'org';
      skill: OrgSkillDto | null;
      base: LibrarySkillDetailDto | null;
      mode: 'addendum' | 'replace' | null;
      /** The project a new skill is written for (its program id or number); absent for the organization's own. */
      projectId?: string | number | null;
    };

export type OrgEditing = Extract<Editing, { kind: 'org' }>;

/** The stated reason, or null when it is shorter than the governed minimum. */
export function reasonOf(v: Record<string, string>): string | null {
  const reason = (v.reason ?? '').trim();
  return reason.length < GOVERNED_REASON_MIN ? null : reason;
}

export const REASON_REQUIRED = `A reason of at least ${GOVERNED_REASON_MIN} characters is required.`;

function lines(text: string | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function one(value: string | undefined): string[] {
  return value ? [value] : [];
}

export function toggleForm(skill: LibrarySkillSummaryDto): C2CFormConfig {
  return {
    eyebrow: 'Skills · library',
    title: skill.enabled ? `Turn off "${skill.name}"` : `Turn on "${skill.name}"`,
    governed: skill.enabled
      ? 'AnA stops loading this skill for everyone in this organization. Your skills that add to it stop loading with it; one that replaces it keeps loading. The change and your reason are recorded in the audit trail.'
      : 'AnA loads this skill again when a question or screen calls for it. The change and your reason are recorded in the audit trail.',
    submitLabel: skill.enabled ? 'Turn off' : 'Turn on',
    fields: [REASON_FIELD],
  };
}

interface OrgFormDefaults {
  name: string;
  description: string;
  instructions: string;
  triggers: string;
  tools: string;
  discipline: string;
  useCase: string;
  segment: string;
  therapeuticArea: string;
  status: string;
}

function defaultsOfSkill(s: OrgSkillDto): OrgFormDefaults {
  return {
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    triggers: s.triggers.join('\n'),
    tools: s.tools.join('\n'),
    discipline: s.disciplines[0] ?? 'regulatory-strategy',
    useCase: s.useCases[0] ?? 'drafting',
    segment: s.segments[0] ?? '',
    therapeuticArea: s.therapeuticAreas[0] ?? '',
    // A locked skill is changed only by an administrator unlocking it; the form offers active.
    status: s.status === 'locked' ? 'active' : s.status,
  };
}

function defaultsOfBase(base: LibrarySkillDetailDto | null, mode: OrgEditing['mode']): OrgFormDefaults {
  return {
    name: base ? `${base.name}: our practice` : '',
    description: base?.description ?? '',
    instructions: base && mode === 'replace' ? base.instructions : '',
    triggers: '',
    tools: '',
    discipline: base?.disciplines[0] ?? 'regulatory-strategy',
    useCase: base?.useCases[0] ?? 'drafting',
    segment: '',
    therapeuticArea: '',
    status: 'draft',
  };
}

/** What the studio's fields start from: the skill being changed, or the library skill it builds on. */
export function studioDefaults(target: OrgEditing): Record<string, string> {
  const mode = target.skill?.extensionMode ?? target.mode;
  const d = target.skill ? defaultsOfSkill(target.skill) : defaultsOfBase(target.base, mode);
  return { ...d, mode: mode ?? 'addendum' };
}

/** Whether the skill builds on a library skill (adds to it or replaces it). */
export function extendsLibrary(target: OrgEditing): boolean {
  return Boolean(target.base || target.skill?.extendsSkillKey);
}

/** The studio's title for what is being written. */
export function studioTitle(target: OrgEditing): string {
  const mode = target.skill?.extensionMode ?? target.mode;
  if (target.skill) return `Change "${target.skill.name}"`;
  if (!target.base) return target.projectId ? 'New skill for this project' : 'New skill';
  return mode === 'replace' ? `Replace "${target.base.name}"` : `Add to "${target.base.name}"`;
}

/** The body /api/ana-skills/organization reads, from the form's values. */
export function orgSkillBody(target: OrgEditing, v: Record<string, string>, reason: string | null) {
  const extendsSkillKey = target.base?.key ?? target.skill?.extendsSkillKey ?? null;
  return {
    name: (v.name ?? '').trim(),
    description: (v.description ?? '').trim(),
    instructions: v.instructions ?? '',
    triggers: lines(v.triggers),
    tools: lines(v.tools),
    disciplines: one(v.discipline),
    useCases: one(v.useCase),
    segments: one(v.segment),
    therapeuticAreas: one(v.therapeuticArea),
    extendsSkillKey,
    extensionMode: extendsSkillKey ? (v.mode === 'replace' ? 'replace' : 'addendum') : null,
    status: v.status || 'draft',
    reason,
  };
}
