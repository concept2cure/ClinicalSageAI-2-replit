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
 * The forms of Admin and access → Skills (AdminSkills.tsx): turning a library
 * skill off or on, and writing an organization skill. Each form carries the
 * reason the server requires; the body it builds is what /api/ana-skills reads.
 */

export const SEGMENT_OPTIONS: C2CFormFieldOption[] = [
  { value: '', label: 'Every client segment' },
  ...SKILL_SEGMENT_IDS.map((s) => ({ value: s, label: SKILL_SEGMENT_LABELS[s] })),
];
export const DISCIPLINE_OPTIONS: C2CFormFieldOption[] = SKILL_DISCIPLINES.map((d) => ({ value: d, label: SKILL_DISCIPLINE_LABELS[d] }));
const USE_CASE_OPTIONS: C2CFormFieldOption[] = SKILL_USE_CASES.map((u) => ({ value: u, label: SKILL_USE_CASE_LABELS[u] }));
const TA_OPTIONS: C2CFormFieldOption[] = [
  { value: '', label: 'Any therapeutic area' },
  ...THERAPEUTIC_AREAS.filter((t) => t.value !== 'other').map((t) => ({ value: t.value, label: t.label })),
];
const STATUS_OPTIONS: C2CFormFieldOption[] = [
  { value: 'draft', label: 'Draft — AnA does not load it' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const REASON_FIELD: C2CFormField = {
  key: 'reason',
  label: 'Reason for change',
  type: 'textarea',
  rows: 2,
  required: true,
  desc: `Recorded with the change in the audit trail. At least ${GOVERNED_REASON_MIN} characters.`,
};

export type Editing =
  | { kind: 'toggle'; skill: LibrarySkillSummaryDto }
  | { kind: 'org'; skill: OrgSkillDto | null; base: LibrarySkillDetailDto | null; mode: 'addendum' | 'replace' | null };

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

function orgFormTitle(target: OrgEditing, mode: OrgEditing['mode']): string {
  if (target.skill) return 'Change this skill';
  if (!target.base) return 'New skill';
  return mode === 'replace' ? `Replace "${target.base.name}"` : `Add to "${target.base.name}"`;
}

function orgFormSub(extending: boolean, mode: OrgEditing['mode']): string {
  if (!extending) return 'AnA selects this skill when a question contains one of its trigger phrases.';
  return mode === 'replace'
    ? 'AnA loads this text instead of the library method whenever the library skill is selected.'
    : 'AnA loads this text after the library method whenever the library skill is selected.';
}

function modeField(mode: OrgEditing['mode']): C2CFormField {
  return {
    key: 'mode',
    label: 'What it does to the library skill',
    type: 'seg',
    options: [
      { value: 'addendum', label: 'Adds to it' },
      { value: 'replace', label: 'Replaces it' },
    ],
    default: mode ?? 'addendum',
  };
}

export function orgForm(target: OrgEditing): C2CFormConfig {
  const s = target.skill;
  const mode = s?.extensionMode ?? target.mode;
  const extending = Boolean(target.base || s?.extendsSkillKey);
  const d = s ? defaultsOfSkill(s) : defaultsOfBase(target.base, mode);
  return {
    eyebrow: s ? `Skills · ${s.name}` : 'Skills · new',
    title: orgFormTitle(target, mode),
    sub: orgFormSub(extending, mode),
    governed: 'Saving changes the instructions AnA follows for everyone in this organization. The skill before and after, and your reason, are recorded in the audit trail.',
    submitLabel: s ? 'Save skill' : 'Create skill',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, default: d.name },
      {
        key: 'description',
        label: 'When to use it',
        type: 'textarea',
        rows: 2,
        required: true,
        default: d.description,
        desc: 'One or two sentences. At least 20 characters.',
      },
      ...(extending ? [modeField(mode)] : []),
      {
        key: 'instructions',
        label: 'Instructions',
        type: 'textarea',
        rows: 12,
        required: true,
        default: d.instructions,
        desc: 'The method AnA follows, in Markdown. Name tools in backticks. Never put figures here for AnA to repeat: figures come from the platform’s engines.',
      },
      {
        key: 'triggers',
        label: 'Trigger phrases',
        type: 'textarea',
        rows: 4,
        default: d.triggers,
        desc: extending
          ? 'Optional: phrases that should also select it, one per line.'
          : 'One per line, as people type them. A skill with none is never selected.',
      },
      { key: 'discipline', label: 'Discipline', type: 'select', options: DISCIPLINE_OPTIONS, default: d.discipline, half: true },
      { key: 'useCase', label: 'Kind of work', type: 'select', options: USE_CASE_OPTIONS, default: d.useCase, half: true },
      { key: 'segment', label: 'Client segment', type: 'select', options: SEGMENT_OPTIONS, default: d.segment, half: true },
      { key: 'therapeuticArea', label: 'Therapeutic area', type: 'select', options: TA_OPTIONS, default: d.therapeuticArea, half: true },
      {
        key: 'tools',
        label: 'Tools',
        type: 'textarea',
        rows: 2,
        default: d.tools,
        desc: 'Optional: AnA tool names the method relies on, one per line.',
      },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, default: d.status },
      REASON_FIELD,
    ],
  };
}

/** The body /api/ana-skills/organization reads, from the form's values. */
export function orgSkillBody(target: OrgEditing, v: Record<string, string>, reason: string) {
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
