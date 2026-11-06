import React, { useEffect, useId, useRef, useState } from 'react';
import { I } from './icons';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { useAuthoringReadSession } from './editor/authoringCurrentRead';
import type { RuleConflictDecisionPackage } from '@shared/ana/skills';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import {
  extendsLibrary,
  orgSkillBody,
  studioDefaults,
  studioTitle,
  studioProject,
  standingRuleRefusal,
  ruleConflictDecision,
  RULE_LEVEL_LABELS,
  type OrgEditing,
} from './surfaces/AdminSkillForms';
import {
  ReasonField,
  SkillDialogShell,
  StudioAside,
  StudioFields,
  refusalOf,
  Field,
  Select,
} from './SkillStudioParts';
import './styles/ana-skills.css';

/**
 * The skill studio: where an organization's skill is designed, tried and tuned
 * before it changes what AnA does (docs/design/ANA_SKILLS_2026-10-22.md §9).
 *
 *   Design   the skill's name, when to use it, its method and its trigger
 *            phrases; for a library skill, whether it adds to it or replaces it.
 *   Try      a question, answered with the selection AnA would make with this
 *            draft in force (POST /api/ana-skills/test with `draft`). Nothing
 *            is stored, and the draft is marked in the result.
 *   Tune     the skill's versions: who changed it, when, and why
 *            (GET /api/ana-skills/organization/:id/history, the audit rows).
 *   Save     with a stated reason. The change and its chained audit row commit
 *            together on the server, or nothing does.
 *
 * Used from Admin and access → Skills (the organization's skills) and from a
 * project's Skills card (a skill written for that project).
 */

interface Props {
  target: OrgEditing;
  onClose: () => void;
  /** Told the confirmation to show once the skill is saved. */
  onSaved: (message: string) => void;
  /** Hands a prompt to AnA's conversation (the shell's onAsk), when there is one. */
  onAsk?: (text: string) => void;
}

function saveRequest(target: OrgEditing, values: Record<string, string>): { method: 'POST' | 'PUT'; url: string } {
  const project = studioProject(target, values);
  const base = project
    ? `/api/ana-skills/projects/${encodeURIComponent(String(project))}/skills`
    : '/api/ana-skills/organization';
  return target.skill
    ? { method: 'PUT', url: `${base}/${target.skill.id}` }
    : { method: 'POST', url: base };
}
function studioSub(extending: boolean, mode: string): string {
  if (!extending)
    return 'AnA selects this skill when a question contains one of its trigger phrases, or when someone picks it.';
  return mode === 'replace'
    ? 'AnA follows this method instead of the library method whenever the library skill is selected.'
    : 'AnA follows this after the library method whenever the library skill is selected.';
}

type SaveOutcome = { message: string; saved: boolean; conflict?: RuleConflictDecisionPackage | null };
async function saveStudio(target: OrgEditing, values: Record<string, string>, reason: string): Promise<SaveOutcome> {
  const body = orgSkillBody(target, values, reason);
  const rule = values.ruleLevel !== 'none';
  const { method, url } = saveRequest(target, values);
  try {
    const response = await apiRequest(method, url, body);
    const receipt = await response.json().catch(() => null) as { audited?: boolean; skill?: { version?: number; projectId?: number | null; standingRule?: unknown } } | null;
    if (rule && !confirmedRuleReceipt(receipt, target, values)) return { saved: false, message: 'The rule change could not be confirmed. Reopen its ledger before trying again.' };
    const version = receipt?.skill?.version;
    return { saved: true, message: target.skill ? `${body.name} saved${version ? `, version ${version}` : ''}.` : `${body.name} created.` };
  } catch (error) {
    const conflict = error instanceof ApiRequestError ? ruleConflictDecision(error.payload) : null;
    return { saved: false, conflict, message: conflict ? 'Conflicting rules need an explicit decision before this rule can be saved.'
      : rule ? ruleSaveRefusal(error) : refusalOf(error, 'The skill was not changed.') };
  }
}
function confirmedRuleReceipt(value: { audited?: boolean; skill?: { version?: number; projectId?: number | null; standingRule?: unknown } } | null,
  target: OrgEditing, values: Record<string, string>): boolean {
  if (value?.audited !== true || value.skill?.version !== (target.skill?.version ?? 0) + 1) return false;
  const rule = value.skill.standingRule as Record<string, unknown> | null;
  if (!rule || rule.schemaVersion !== 1 || rule.level !== values.ruleLevel || rule.state !== values.ruleState
      || typeof rule.sourceAuditEventId !== 'string' || typeof rule.sourceInteractionId !== 'string') return false;
  return confirmedRuleScope(rule.scope, value.skill.projectId, studioProject(target, values));
}
function confirmedRuleScope(scope: unknown, projectId: number | null | undefined, expectedProject: string | number | null): boolean {
  if (!expectedProject) return scope === 'tenant' && projectId === null;
  if (scope !== 'project' || !Number.isSafeInteger(projectId) || Number(projectId) <= 0) return false;
  const expected = Number(expectedProject);
  return Number.isSafeInteger(expected) && expected > 0 ? projectId === expected : true;
}
function terminalRule(target: OrgEditing): boolean {
  const rule = target.skill?.standingRule;
  return Boolean(rule && rule.state !== 'active');
}
function studioIdentity(target: OrgEditing): string {
  return JSON.stringify([target.skill?.id, target.skill?.version, target.projectId ?? target.skill?.projectId,
    target.base?.key, target.mode]);
}

export function SkillStudio({ target, onClose, onSaved, onAsk }: Props) {
  const uid = useId();
  const session = useAuthoringReadSession(authService.getUser());
  const openedFor = useRef(session);
  const identity = studioIdentity(target);
  const openedTarget = useRef(identity), currentTarget = useRef(identity); currentTarget.current = identity;
  const [v, setV] = useState<Record<string, string>>(() => studioDefaults(target));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<RuleConflictDecisionPackage | null>(null);
  const set = (key: string) => (value: string) => setV(prev => ({ ...prev, [key]: value }));
  const extending = extendsLibrary(target);
  const project = target.projectId ?? target.skill?.projectId ?? null;
  const terminal = terminalRule(target);
  const isRule = v.ruleLevel !== 'none';
  const current = () => openedFor.current === session && session.sameRevision() && openedTarget.current === currentTarget.current;
  useEffect(() => {
    if (openedFor.current !== session || !session.sameRevision() || openedTarget.current !== currentTarget.current) { setV({}); setReason(''); setConflict(null); }
  }, [session, identity]);

  const save = async () => {
    if (!current() || busy || terminal) return;
    const stated = reason.trim();
    if (stated.length < GOVERNED_REASON_MIN) {
      setError(`A reason of at least ${GOVERNED_REASON_MIN} characters is required.`);
      return;
    }
    const refused = standingRuleRefusal(target, v);
    if (refused) { setError(refused); return; }
    setBusy(true);
    setError(null);
    const outcome = await saveStudio(target, v, stated);
    if (!current()) return;
    setBusy(false);
    if (outcome.saved) onSaved(outcome.message);
    else { setConflict(outcome.conflict ?? null); setError(outcome.message); }
  };

  const footer = <StudioFooter busy={busy} blocked={terminal || !current()} editing={Boolean(target.skill)} onClose={onClose} onSave={() => void save()} />;

  if (!current()) return <SkillDialogShell eyebrow="Skills" title={openedTarget.current === currentTarget.current ? 'Session changed' : 'Skill changed'} sub="Close and reopen the current skill in this organization."
    busy={false} onClose={onClose} testId="skill-studio" footer={<button className="de-btn ghost" onClick={onClose}>Close</button>}>
    <p>The previous correction and rule fields have been cleared.</p>
  </SkillDialogShell>;

  return (
    <SkillDialogShell
      eyebrow={project ? 'Skills · this project' : 'Skills · your organization'}
      title={studioTitle(target)}
      sub={studioSub(extending, v.mode)}
      busy={busy}
      onClose={onClose}
      wide
      testId="skill-studio"
      footer={footer}
    >
      <div className="skill-studio-cols">
        <StudioFields
          uid={uid}
          values={v}
          set={set}
          extending={extending}
          projectOnly={project !== null}
          readOnly={terminal}
          hideStatus={isRule}
        />
        <StudioAside target={target} values={v} onClose={onClose} onAsk={onAsk} />
      </div>
      <RuleFields uid={uid} target={target} values={v} set={set} disabled={terminal || busy} />
      {conflict && <RuleConflict decision={conflict} onReplace={() => setV(previous => ({ ...previous,
        supersedes: conflict.ruleRefs.map(ref => `${ref.bundleId}@${ref.version}`).join('\n') }))} disabled={busy || terminal} />}
      <ReasonField id={`${uid}-reason`} value={reason} onChange={setReason} />
      <div className="de-gov">
        <span className="ico">{I.lock}</span>
        <span className="de-gov-t">
          Saving changes the method AnA follows for everyone{' '}
          {project ? 'in this project' : 'in this organization'}. The skill before and after, and
          your reason, are recorded in the audit trail.
        </span>
      </div>
      {error && (
        <div className="de-err" role="alert">
          {error}
        </div>
      )}
    </SkillDialogShell>
  );
}

function StudioFooter({ busy, blocked, editing, onClose, onSave }: { busy: boolean; blocked: boolean; editing: boolean; onClose: () => void; onSave: () => void }) {
  return <><button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
    <button className="de-btn primary" onClick={onSave} disabled={busy || blocked} data-testid="skill-studio-save">
      {busy ? 'Saving…' : editing ? 'Save skill' : 'Create skill'}</button></>;
}

function ruleSaveRefusal(error: unknown): string {
  const status = error instanceof ApiRequestError ? error.status : 0;
  if (status === 409) return 'The rule version or authority changed. Reopen the current ledger before making an explicit change.';
  if (status === 403) return 'The rule was not changed. Current permission for this organization or project is required.';
  return 'The rule was not changed. Check its source, scope, version and reason, then read its current ledger.';
}

type RuleFieldProps = { uid: string; target: OrgEditing; values: Record<string, string>; set: (key: string) => (value: string) => void; disabled: boolean };
function RuleFields(props: RuleFieldProps) {
  const { uid, target, values, set, disabled } = props;
  const prior = target.skill?.standingRule;
  const guarded = prior?.level === 'hard_gate' || Boolean(target.skill?.policyBindings?.length);
  const options = Object.entries(RULE_LEVEL_LABELS).map(([value, label]) => ({ value, label, disabled: guarded && value !== 'hard_gate' }));
  return <section className="skill-studio-side" aria-label="Correction and future rule">
    <h4>Correction and future rule</h4>
    <Field id={`${uid}-rule-level`} label="Rule level" desc="Keep the reusable instruction in Method. The correction is stored separately as its source.">
      <Select id={`${uid}-rule-level`} value={values.ruleLevel} options={prior ? options : [{ value: 'none', label: 'Ordinary skill method' }, ...options]}
        onChange={set('ruleLevel')} disabled={disabled} />
    </Field>
    {values.ruleLevel !== 'none' && <>
      <RuleScopeFields {...props} />
      <Field id={`${uid}-rule-topic`} label="Rule topic" desc="Rules with the same topic and scope need an explicit replacement decision when they conflict.">
        <input id={`${uid}-rule-topic`} className="c2c-input" value={values.conflictKey} maxLength={80} onChange={event => set('conflictKey')(event.target.value)} readOnly={disabled || Boolean(prior)} />
      </Field>
      {prior ? <Field id={`${uid}-rule-state`} label="Rule state" desc="Revocation is explicit and recorded with the current version and your reason.">
        <Select id={`${uid}-rule-state`} value={values.ruleState} options={prior.state === 'active'
          ? [{ value: 'active', label: 'Active' }, { value: 'revoked', label: 'Revoke this rule' }]
          : [{ value: prior.state, label: prior.state }]} onChange={set('ruleState')} disabled={disabled} />
      </Field> : <CorrectionSourceFields {...props} />}
      <RuleActionFields {...props} />
    </>}
  </section>;
}
function RuleActionFields({ uid, target, values, set, disabled }: RuleFieldProps) {
  const retained = Boolean(target.skill?.policyBindings?.length);
  return <>
    {values.ruleLevel === 'hard_gate' && <p className="skill-studio-verdict">{retained
      ? 'Existing mandatory approval actions are retained. They cannot be lowered through a method edit.' : 'Require approval before checking dossier consistency.'}</p>}
    {values.ruleLevel === 'hard_gate' && !retained && <Field id={`${uid}-approval`} label="Approval requirement">
      <textarea id={`${uid}-approval`} className="c2c-input" rows={2} value={values.approvalDescription} onChange={event => set('approvalDescription')(event.target.value)} readOnly={disabled} />
    </Field>}
    <Field id={`${uid}-supersedes`} label="Replace exact rule versions" desc="Optional. One bundle identifier@version per line. A replacement never silently lowers a mandatory approval.">
      <textarea id={`${uid}-supersedes`} className="c2c-input" rows={2} value={values.supersedes} onChange={event => set('supersedes')(event.target.value)} readOnly={disabled || Boolean(target.skill?.standingRule)} />
    </Field>
  </>;
}
function RuleScopeFields({ uid, target, values, set, disabled }: RuleFieldProps) {
  const fixed = Boolean(target.skill || target.projectId);
  return <>
    <Field id={`${uid}-rule-scope`} label="Rule scope">
      <Select id={`${uid}-rule-scope`} value={values.ruleScope} options={[{ value: 'tenant', label: 'This organization' }, { value: 'project', label: 'One project' }]}
        onChange={set('ruleScope')} disabled={disabled || fixed} />
    </Field>
    {values.ruleScope === 'project' && <Field id={`${uid}-rule-project`} label="Project reference" desc="The existing project number or program identifier. Its current access is checked before saving.">
      <input id={`${uid}-rule-project`} className="c2c-input" value={values.ruleProject} onChange={event => set('ruleProject')(event.target.value)} readOnly={disabled || fixed} />
    </Field>}
    <p className="skill-studio-verdict">Saving an active rule applies it to future work in this scope. Revocation stops future use and keeps its history.</p>
  </>;
}
function CorrectionSourceFields({ uid, values, set, disabled }: RuleFieldProps) {
  return <>
    <Field id={`${uid}-correction-source`} label="Correction source">
      <Select id={`${uid}-correction-source`} value={values.ruleSource} options={[{ value: 'capture', label: 'Record this correction with the rule' }, { value: 'audit', label: 'Use a recorded correction audit event' }]}
        onChange={set('ruleSource')} disabled={disabled} />
    </Field>
    {values.ruleSource === 'audit' ? <Field id={`${uid}-source-audit`} label="Correction audit event">
      <input id={`${uid}-source-audit`} className="c2c-input" value={values.sourceAuditEventId} onChange={event => set('sourceAuditEventId')(event.target.value)} readOnly={disabled} />
    </Field> : <>
      <Field id={`${uid}-correction`} label="Correction to remember" desc="Up to 500 characters. This source text is not sent to AnA’s skill test or design prompt.">
        <textarea id={`${uid}-correction`} className="c2c-input" rows={3} maxLength={500} value={values.correctionText} onChange={event => set('correctionText')(event.target.value)} readOnly={disabled} />
      </Field>
      {(['correctionAgency', 'correctionDocumentType', 'correctionIntent'] as const).map((key, index) => <Field key={key} id={`${uid}-${key}`} label={['Agency or context', 'Document type', 'Intended future behavior'][index]}>
        <input id={`${uid}-${key}`} className="c2c-input" value={values[key]} onChange={event => set(key)(event.target.value)} readOnly={disabled} />
      </Field>)}
    </>}
  </>;
}
function RuleConflict({ decision, onReplace, disabled }: { decision: RuleConflictDecisionPackage; onReplace: () => void; disabled: boolean }) {
  return <section className="skill-studio-side" role="region" aria-label="Rule conflict decision">
    <h4>Choose how to resolve the rule conflict</h4><p>Topic: {decision.conflictKey}. No rule was changed.</p>
    <ul>{decision.ruleRefs.map(ref => <li key={ref.bundleId}>{ref.bundleId} · version {ref.version}</li>)}</ul>
    <p>Revoke a conflicting rule in its own ledger, or explicitly replace the exact versions above. Review the Method before saving again.</p>
    <button type="button" className="de-btn ghost" disabled={disabled} onClick={onReplace}>Use these exact versions for replacement</button>
  </section>;
}
