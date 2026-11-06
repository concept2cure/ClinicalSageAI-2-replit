import { ApiRequestError, serverMessage } from '@/lib/queryClient';
import type { C2CFormConfig, C2CFormField, C2CFormFieldOption } from '../C2CForm';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { THERAPEUTIC_AREAS } from '@shared/constants/domain/therapeutic-areas';
import { REGION_IDENTITY } from '@shared/regulatory/region-identity';
import {
  SKILL_DISCIPLINES,
  SKILL_DISCIPLINE_LABELS,
  SKILL_SEGMENT_IDS,
  SKILL_SEGMENT_LABELS,
  SKILL_USE_CASES,
  SKILL_USE_CASE_LABELS,
  SKILL_LIMITS,
  type LibrarySkillDetailDto,
  type LibrarySkillSummaryDto,
  type OrgSkillDto,
  type StandingRuleReference,
  type StandingRuleLevel,
  type RuleConflictDecisionPackage,
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
/** The markets a skill can be written for: the platform's twelve regions, each with its agency. */
export const MARKET_OPTIONS: C2CFormFieldOption[] = [
  { value: '', label: 'Every market' },
  ...Object.values(REGION_IDENTITY).map((r) => ({ value: r.code, label: `${r.code} · ${r.agency.replace(/_/g, ' ')}` })),
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
  return { ...d, mode: mode ?? 'addendum', ...standingRuleDefaults(target) };
}
function standingRuleDefaults(target: OrgEditing): Record<string, string> {
  const rule = target.skill?.standingRule;
  const project = target.projectId ?? target.skill?.projectId;
  return { ruleLevel: rule?.level ?? 'none', ruleState: rule?.state ?? 'active',
    ruleScope: project ? 'project' : 'tenant', ruleProject: String(project ?? ''),
    conflictKey: rule?.conflictKey ?? '', ruleSource: 'capture', sourceAuditEventId: '',
    correctionText: '', correctionAgency: '', correctionDocumentType: '', correctionIntent: '',
    supersedes: rule?.supersedes.map(ref => `${ref.bundleId}@${ref.version}`).join('\n') ?? '',
    approvalDescription: 'Require human approval before checking dossier consistency.' };
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

/**
 * The body /api/ana-skills/organization reads, from the form's values.
 * Ordinary method edits preserve stored approval rules and source attribution.
 * An explicit sourced rule change carries its lifecycle and expected version.
 */
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
    ...(reason === null ? {} : standingRuleBody(target, v)),
  };
}

/** Scope is carried by the existing endpoint, never by a claimed body field. */
export function studioProject(target: OrgEditing, values: Record<string, string>): string | number | null {
  if (target.skill) return target.skill.projectId;
  if (target.projectId) return target.projectId;
  return values.ruleLevel !== 'none' && values.ruleScope === 'project' ? values.ruleProject.trim() : null;
}
export function supersededRuleRefs(value: string): StandingRuleReference[] | null {
  const refs: StandingRuleReference[] = [];
  for (const line of lines(value)) {
    const match = /^([A-Za-z0-9_-]{1,160})@([1-9]\d*)$/.exec(line);
    if (!match || !Number.isSafeInteger(Number(match[2]))) return null;
    refs.push({ bundleId: match[1], version: Number(match[2]) });
  }
  return refs.length <= 20 ? refs : null;
}
function standingRuleBody(target: OrgEditing, values: Record<string, string>) {
  const prior = target.skill?.standingRule;
  if (!prior && (!values.ruleLevel || values.ruleLevel === 'none')) return {};
  const level = values.ruleLevel as StandingRuleLevel;
  const state = values.ruleState === 'revoked' ? 'revoked' as const : 'active' as const;
  const retained = target.skill?.policyBindings ?? [];
  const policyBindings = level === 'hard_gate' ? retained.length ? retained : [{ policyType: 'requires_approval' as const,
    enforcement: 'mandatory' as const, toolName: 'check_dossier_consistency', description: values.approvalDescription.trim() }] : [];
  const supersedes = prior ? prior.supersedes.map(ref => ({ ...ref })) : supersededRuleRefs(values.supersedes) ?? [];
  return { standingRule: { level, state, conflictKey: values.conflictKey.trim(), supersedes },
    policyBindings, status: state === 'revoked' ? 'archived' : 'active',
    ...(target.skill ? { expectedVersion: target.skill.version } : {}),
    ...(!prior ? correctionSourceBody(values) : {}),
  };
}
function correctionSourceBody(values: Record<string, string>) {
  return values.ruleSource === 'audit' ? { sourceAuditEventId: values.sourceAuditEventId.trim() }
    : { correction: { text: values.correctionText.trim(), agency: values.correctionAgency.trim(),
      documentType: values.correctionDocumentType.trim(), intent: values.correctionIntent.trim() } };
}

/** Refuse a silent change in authority before sending the exact versioned action. */
export function standingRuleRefusal(target: OrgEditing, values: Record<string, string>): string | null {
  const prior = target.skill?.standingRule;
  const stored = storedRuleRefusal(target, values);
  if (stored) return stored;
  if (!prior && (!values.ruleLevel || values.ruleLevel === 'none')) return null;
  return reusableMethodRefusal(values) ?? ruleDefinitionRefusal(target, values) ?? (prior ? null : correctionSourceRefusal(values));
}
function reusableMethodRefusal(values: Record<string, string>): string | null {
  if (!values.name.trim() || values.name.trim().length > SKILL_LIMITS.nameMax) return `Give the rule a name of 1–${SKILL_LIMITS.nameMax} characters.`;
  if (values.description.trim().length < SKILL_LIMITS.descriptionMin || values.description.length > SKILL_LIMITS.descriptionMax) return `State when to use it in ${SKILL_LIMITS.descriptionMin}–${SKILL_LIMITS.descriptionMax} characters.`;
  return values.instructions.trim().length < SKILL_LIMITS.instructionsMin || values.instructions.length > SKILL_LIMITS.instructionsMax
    ? `Write the reusable Method in ${SKILL_LIMITS.instructionsMin}–${SKILL_LIMITS.instructionsMax} characters. The correction source is stored separately.` : null;
}
function storedRuleRefusal(target: OrgEditing, values: Record<string, string>): string | null {
  const prior = target.skill?.standingRule;
  if (prior && prior.state !== 'active') return 'This rule is revoked or superseded. Create a new sourced rule to replace it.';
  if (prior?.level === 'hard_gate' && values.ruleLevel !== 'hard_gate') return 'A mandatory approval rule cannot be lowered. Revoke it explicitly with a reason.';
  if (!prior && target.skill?.policyBindings?.length && !['none', 'hard_gate'].includes(values.ruleLevel)) return 'Existing mandatory approval actions must be retained.';
  if (prior && values.ruleLevel === 'none') return 'Use explicit revocation to stop a saved rule.';
  return null;
}
function ruleDefinitionRefusal(target: OrgEditing, values: Record<string, string>): string | null {
  if (!/^[a-z][a-z0-9._-]{2,79}$/.test(values.conflictKey)) return 'Use a rule topic of 3–80 lowercase letters, numbers, dots, hyphens or underscores.';
  if (supersededRuleRefs(values.supersedes) === null) return 'List each replaced rule as its bundle identifier followed by @ and its exact version.';
  const project = studioProject(target, values);
  if (values.ruleScope === 'project' && !project) return 'Choose the project this rule applies to.';
  if (values.ruleLevel === 'hard_gate' && !(target.skill?.policyBindings?.length) && values.approvalDescription.trim().length < 8) return 'Describe the mandatory approval step.';
  return null;
}
export const RULE_LEVEL_LABELS = { soft: 'Soft preference', standing: 'Standing instruction', hard_gate: 'Mandatory approval' };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function conflictReference(raw: unknown): StandingRuleReference | null {
  if (!object(raw) || typeof raw.bundleId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(raw.bundleId)
      || typeof raw.version !== 'number' || !Number.isSafeInteger(raw.version) || raw.version <= 0) return null;
  return { bundleId: raw.bundleId, version: raw.version };
}
export function ruleConflictDecision(payload: unknown): RuleConflictDecisionPackage | null {
  if (!object(payload) || !object(payload.error) || payload.error.code !== 'RULE_CONFLICT') return null;
  const decision = payload.error.decisionPackage;
  if (!object(decision) || typeof decision.conflictKey !== 'string' || !/^[a-z][a-z0-9._-]{2,79}$/.test(decision.conflictKey)
      || !Array.isArray(decision.ruleRefs) || !decision.ruleRefs.length || decision.ruleRefs.length > 20) return null;
  const ruleRefs: StandingRuleReference[] = [];
  for (const raw of decision.ruleRefs) {
    const reference = conflictReference(raw);
    if (!reference) return null;
    ruleRefs.push(reference);
  }
  return { conflictKey: decision.conflictKey, ruleRefs, resolution: 'Explicitly supersede or revoke the conflicting rule.' };
}
function correctionSourceRefusal(values: Record<string, string>): string | null {
  if (values.ruleState === 'revoked') return 'Save a sourced rule before revoking it.';
  if (values.ruleSource === 'audit') return /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(values.sourceAuditEventId)
    ? null : 'Enter the identifier of a recorded correction audit event.';
  if (!values.correctionText.trim() || values.correctionText.trim().length > 500) return 'State the correction in 1–500 characters.';
  return values.correctionAgency.trim() && values.correctionDocumentType.trim() && values.correctionIntent.trim()
    ? null : 'State the correction’s agency, document type and intended future behavior.';
}

/** One fixed request to AnA: nothing stored by a member is spliced into it. */
export const DESIGN_WITH_ANA =
  'Help me design an AnA skill for this organization. Ask me what work it is for, then draft its name, one or two sentences on when to use it, trigger phrases as people type them, and its method under a "## Method" heading: numbered steps, naming the platform tool in backticks wherever a figure, verdict, date or citation is needed.';

export function refusalOf(e: unknown, fallback: string): string {
  return (e instanceof ApiRequestError ? serverMessage(e.payload) : null) ?? fallback;
}


export function approvalRuleStatus(skill: OrgSkillDto): string {
  if (skill.standingRule && skill.standingRule.state !== 'active') return 'These approval actions are retained in history. This rule no longer applies to future work.';
  return skill.status === 'active' || skill.status === 'locked'
    ? 'Approval is required for these actions even when this skill is not selected or is turned off for prompts in a project.'
    : 'These saved rules apply when this skill is active, regardless of whether it is selected for a prompt.';
}
