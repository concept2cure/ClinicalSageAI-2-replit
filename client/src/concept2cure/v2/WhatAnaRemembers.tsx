/**
 * What AnA remembers: the notes AnA keeps about working with this person, read
 * only, in a drawer beside the conversation (D2, fold ana-memory into the
 * conversation, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * These are the two reads of the retired `ana-memory` screen that were real:
 * how AnA is tuned to the person (its notes, the four tone settings and the
 * latest read of how they are doing) and the "Things I got wrong" ledger. They
 * are the rows every turn reads (loadRelationalOverlay,
 * server/services/ana-ri/relational-profile-service.ts):
 *
 *   GET /api/mdx/ana/memory/profile                     the person's own notes, anywhere
 *   GET /api/mdx/ana/memory/profile?project_id=<ref>    their notes for the project the
 *                                                       conversation is held in, admitted
 *                                                       as its turns are (admitAnaProjectScope)
 *
 * Neither names a user: the server reads the session's own rows only. The
 * retired screen read the first and never the second.
 *
 * Every read says what it got: a failure is an error with Try again and never
 * an empty memory, a refusal is said as one with nothing to retry, an absent
 * store is not "no notes yet", an answer that does not say it is the project's
 * is not shown as the project's, and an empty ledger says so.
 */
import React from 'react';
import { I } from './icons';
import { ErrorState, hasKeys, useLiveData, type DataState } from './dataConnect';
import { useDialog } from './useDialog';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { useAuthoringReadSession } from './editor/authoringCurrentRead';
import { C2CForm, type C2CFormConfig } from './C2CForm';
import { stableStringify } from '@shared/canonical-json';
import type { PrivateUserRuleAction, PrivateUserRuleDto, PrivateUserRuleLedgerDto, PrivateUserRuleReference } from '@shared/ana/skills';
import type { PrivateUserRuleInput } from '@shared/ana/skills';
import './styles/ana-v2.css';

interface EmotionalSignal { at: string; signal: string }
interface AcknowledgedMistake { at: string; mistake: string; correction: string }
export interface RelationalProfile {
  interaction_count: number;
  last_interaction_at: string | null;
  profile_summary: string | null;
  tone_calibration: Record<string, string> | null;
  emotional_signals: EmotionalSignal[] | null;
  acknowledged_mistakes: AcknowledgedMistake[] | null;
}

const PROFILE_PATH = '/api/mdx/ana/memory/profile';
const PROFILE_KEYS = ['interaction_count', 'profile_summary', 'tone_calibration', 'emotional_signals', 'acknowledged_mistakes'];
const TONE: ReadonlyArray<[string, string]> = [['warmth', 'Warmth'], ['humor', 'Humor'], ['formality', 'Formality'], ['detail', 'Detail']];

/* The admission's refusals (server/services/ana/project-scope-admission.ts), in
   words. Each is final for this project: trying again cannot change it. */
const PROJECT_REFUSED: Readonly<Record<string, string>> = {
  ANA_PROJECT_ACCESS_DENIED: 'You do not have current access to this project',
  ANA_PROJECT_NOT_FOUND: 'This project was not found in your organization',
  ANA_PROJECT_ANCHOR_UNRESOLVED: "This project's tracking record could not be verified",
  ANA_PROJECT_SCOPE_INVALID: 'The open project could not be identified',
};

type Scope = 'user' | 'project';
const WHAT: Record<Scope, string> = { user: 'about working with you', project: 'for this project' };

/** Where one read stands, in the words the panel shows. PURE. */
type ScopeView =
  | { state: 'loading' }
  | { state: 'failed'; title: string; message: string; retry: boolean }
  | { state: 'none' }
  | { state: 'ready'; profile: RelationalProfile };

const failed = (title: string, message: string, retry: boolean): ScopeView => ({ state: 'failed', title, message, retry });

/** A read that answered no data: a refusal, an access check that could not run, or a failure. PURE. */
function failureOf(scope: Scope, read: DataState<RelationalProfile>): ScopeView {
  const refusal = scope === 'project' && read.code ? PROJECT_REFUSED[read.code] : undefined;
  if (refusal) return failed("AnA's notes for this project were not read", `${refusal}, so AnA's notes for it were not read.`, false);
  if (scope === 'project' && read.status === 503) {
    return failed("AnA's notes for this project were not read",
      'Your access to this project could not be checked, so its notes were not read. This says nothing about the project. Try again.', true);
  }
  if (read.status === 401 || read.status === 403) {
    return failed(`AnA's notes ${WHAT[scope]} were not read`, 'Your account or organization could not be confirmed, so nothing was read.', false);
  }
  return failed(`AnA's notes ${WHAT[scope]} could not be read`, 'Nothing is shown in their place, and this is not an empty memory. Try again.', true);
}

/** The route says the answer is this project's (`meta.scope 'project'`, its ref or id). PURE. */
function keyedTo(meta: Record<string, unknown> | undefined, projectRef: string | null): boolean {
  if (!meta || meta.scope !== 'project' || projectRef === null) return false;
  return String(meta.projectRef ?? '').toLowerCase() === projectRef.toLowerCase() || String(meta.projectId ?? '') === projectRef;
}

function viewOf(scope: Scope, read: DataState<RelationalProfile>, projectRef: string | null): ScopeView {
  if (read.loading) return { state: 'loading' };
  if (read.error) return failureOf(scope, read);
  if (read.meta?.pendingStore === true) {
    return failed(`AnA's notes ${WHAT[scope]} could not be read`, "AnA's notes are not kept on this server, so there is nothing to read. This is not an empty memory.", false);
  }
  if (scope === 'project' && !keyedTo(read.meta, projectRef)) {
    return failed("AnA's notes for this project could not be read", "The answer did not say it was this project's, so it is not shown. Try again.", true);
  }
  return read.data ? { state: 'ready', profile: read.data } : { state: 'none' };
}

function Ledger({ mistakes }: { mistakes: AcknowledgedMistake[] }) {
  return (
    <>
      <div className="amem-sec2">{I.shieldAlert} Things I got wrong <span className="amem-sec-x">and how you set me straight</span></div>
      <div className="amem-mistakes">
        {mistakes.length === 0 ? <div className="amem-empty">Nothing on the ledger yet.</div> : mistakes.map((m, i) => (
          <div key={`${m.at}-${i}`} className="amem-mistake">
            <div className="amem-mistake-t">{I.close} {m.mistake}</div>
            <div className="amem-mistake-c">{I.check} {m.correction}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Profile({ scope, profile: p }: { scope: Scope; profile: RelationalProfile }) {
  const tone = p.tone_calibration ?? {};
  const signals = Array.isArray(p.emotional_signals) ? p.emotional_signals : [];
  const latest = signals.length > 0 ? signals[signals.length - 1] : null;
  const turns = Number(p.interaction_count) || 0;
  return (
    <>
      <div className="amem-prof">
        <div className="amem-prof-notes">
          {p.profile_summary?.trim()
            ? p.profile_summary
            : `AnA has not written notes ${WHAT[scope]} yet. She writes them as she reflects on your turns with her.`}
        </div>
        {scope === 'user' && (
          <div className="amem-tone">
            {TONE.map(([key, label]) => (
              <div key={key} className="amem-tone-cell">
                <span className="amem-tone-k">{label}</span>
                <span className="amem-tone-v">{tone[key] || 'Not set yet'}</span>
              </div>
            ))}
          </div>
        )}
        {latest && <div className="amem-signal">{I.activity} {latest.signal}</div>}
      </div>
      <p className="amem-note">Kept over {turns} {turns === 1 ? 'turn' : 'turns'} with you.</p>
      <Ledger mistakes={Array.isArray(p.acknowledged_mistakes) ? p.acknowledged_mistakes : []} />
    </>
  );
}

function ScopeBody({ scope, view, onRetry }: { scope: Scope; view: ScopeView; onRetry: () => void }) {
  if (view.state === 'loading') return <p role="status" className="amem-note">Reading AnA&rsquo;s notes&hellip;</p>;
  if (view.state === 'failed') {
    return <ErrorState variant="panel" title={view.title} message={view.message} retry={view.retry ? onRetry : undefined} />;
  }
  if (view.state === 'ready') return <Profile scope={scope} profile={view.profile} />;
  return (
    <>
      <p className="amem-empty">
        {scope === 'user'
          ? 'AnA has not kept notes about working with you yet. She writes them after your turns with her.'
          : 'AnA has not kept notes for this project yet. She writes them after your turns with her in it.'}
      </p>
      <Ledger mistakes={[]} />
    </>
  );
}

const PRIVATE_RULE_PATH = '/api/client-intelligence/ana/user-profile';
const RULE_LEVELS = { soft: 'Preference', standing: 'Standing rule', hard_gate: 'Require my approval' };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const reference = (value: unknown): value is PrivateUserRuleReference => UUID.test(String(object(value).ruleId)) && positive(object(value).version);
function privateRuleDetails(r: Record<string, unknown>): boolean {
  return typeof r.name === 'string' && r.name.length <= 120 && typeof r.instructions === 'string' && r.instructions.length <= 8000
    && typeof r.conflictKey === 'string' && typeof r.createdAt === 'string' && Number.isFinite(Date.parse(r.createdAt))
    && typeof r.updatedAt === 'string' && Number.isFinite(Date.parse(r.updatedAt));
}
function privateRuleBindings(value: unknown, level: unknown): boolean {
  if (!Array.isArray(value) || (level === 'hard_gate') !== (value.length > 0)) return false;
  return value.every(b => {
    const binding = object(b); return binding.policyType === 'requires_approval' && binding.enforcement === 'mandatory'
      && binding.toolName === 'check_dossier_consistency' && typeof binding.description === 'string';
  });
}
function privateRule(value: unknown): value is PrivateUserRuleDto {
  const r = object(value), source = object(r.source);
  return UUID.test(String(r.ruleId)) && positive(r.version) && r.scope === 'user' && Object.hasOwn(RULE_LEVELS, String(r.level))
    && ['active', 'revoked', 'superseded'].includes(String(r.state)) && privateRuleDetails(r) && privateRuleBindings(r.policyBindings, r.level)
    && UUID.test(String(source.correctionId)) && typeof source.sourceAuditEventId === 'string' && SHA.test(String(source.correctionSha256))
    && Array.isArray(r.supersedes) && r.supersedes.every(reference);
}
function privateRuleReceipts(value: unknown): boolean {
  return Array.isArray(value) && value.every(x => UUID.test(String(object(x).intentId)) && SHA.test(String(object(x).payloadSha256))
    && UUID.test(String(object(x).ruleId)) && positive(object(x).version) && positive(object(x).revision));
}
function privateRuleConflicts(value: unknown): boolean {
  return Array.isArray(value) && value.every(c => typeof object(c).conflictKey === 'string' && Array.isArray(object(c).ruleRefs)
    && (object(c).ruleRefs as unknown[]).every(reference));
}
function privateLedger(value: unknown, actor: string): PrivateUserRuleLedgerDto | null {
  const r = object(value);
  if (r.schemaVersion !== 1 || `${r.organizationId}:${r.userId}` !== actor || !positive(r.organizationId) || !positive(r.userId)
      || typeof r.revision !== 'number' || !Number.isSafeInteger(r.revision) || r.revision < 0 || !['held_privacy_boundary', 'protected_turns_only'].includes(String(r.promptUse))
      || !Array.isArray(r.rules) || r.rules.length > 200 || !r.rules.every(privateRule)
      || !privateRuleConflicts(r.conflicts) || !privateRuleReceipts(r.receipts)) return null;
  return r as unknown as PrivateUserRuleLedgerDto;
}
type RuleEdit = { intentId: string; action: 'create_rule' | 'update_rule' | 'revoke_rule'; rule?: PrivateUserRuleDto; topic?: string; replaces?: string; supersedes: PrivateUserRuleReference[] };
function personalRuleForm(edit: RuleEdit): C2CFormConfig {
  const r = edit.rule;
  const fields: C2CFormConfig['fields'] = edit.action === 'revoke_rule' ? [] : [
    { key: 'name', label: 'Rule name', type: 'text', required: true, default: r?.name },
    { key: 'instructions', label: 'How AnA should work', type: 'textarea', required: true, rows: 4, default: r?.instructions },
    { key: 'level', label: 'How this applies', type: 'select', required: true, default: r?.level ?? 'standing', options: Object.entries(RULE_LEVELS)
      .map(([value, label]) => ({ value, label, disabled: r?.level === 'hard_gate' && value !== 'hard_gate' })),
      desc: 'Approval rules currently apply to dossier consistency checks. Approval cannot be replaced by a preference.' },
    { key: 'conflictKey', label: 'Rule topic', type: 'text', required: true, default: r?.conflictKey ?? edit.topic,
      desc: 'A short key such as writing.sources. Rules on the same topic must be resolved explicitly.' },
  ];
  if (edit.action === 'create_rule') fields.push({ key: 'correction', label: 'The correction behind this rule', type: 'textarea', required: true, rows: 3,
    desc: 'Kept with your personal rules. Include the correction, not passwords or access keys.' });
  fields.push({ key: 'reason', label: 'Reason for change', type: 'textarea', required: true, rows: 2, desc: 'At least eight characters.' });
  return { title: edit.action === 'revoke_rule' ? 'Revoke personal rule' : r ? 'Edit personal rule' : 'Add personal rule', fields,
    sub: r?.name ?? 'For how AnA works with you.', submitLabel: edit.action === 'revoke_rule' ? 'Revoke rule' : 'Record rule',
    governed: 'Saving records the correction and rule version in your personal ledger.',
    notice: edit.supersedes.length ? `This replaces ${edit.replaces}. Their history is retained.` : undefined };
}
const boundedText = (value: unknown, min: number, max: number): value is string => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
function personalRuleInput(edit: RuleEdit, values: Record<string, string>): PrivateUserRuleInput | null {
  const level = edit.rule?.level === 'hard_gate' ? 'hard_gate' : values.level;
  if (!Object.hasOwn(RULE_LEVELS, level) || !boundedText(values.name, 1, 120) || !boundedText(values.instructions, 8, 8000)
      || !/^[a-z][a-z0-9._-]{2,79}$/.test(values.conflictKey ?? '')) return null;
  return { name: values.name.trim(), instructions: values.instructions.trim(), conflictKey: values.conflictKey,
    level: level as PrivateUserRuleDto['level'], supersedes: edit.rule?.supersedes ?? edit.supersedes,
    policyBindings: level === 'hard_gate' ? [{ policyType: 'requires_approval' as const, enforcement: 'mandatory' as const,
      toolName: 'check_dossier_consistency', description: 'Your personal rule requires approval before a dossier consistency check.' }] : [] };
}
function personalRuleAction(edit: RuleEdit, values: Record<string, string>): PrivateUserRuleAction | null {
  if (!boundedText(values.reason, 8, 2000)) return null;
  const base = { intentId: edit.intentId, reason: values.reason.trim() };
  if (edit.action === 'revoke_rule' && edit.rule) return { ...base, action: edit.action, ruleId: edit.rule.ruleId, expectedVersion: edit.rule.version };
  const rule = personalRuleInput(edit, values);
  if (!rule) return null;
  if (edit.action === 'update_rule' && edit.rule) return { ...base, action: edit.action, ruleId: edit.rule.ruleId, expectedVersion: edit.rule.version, rule };
  if (!boundedText(values.correction, 8, 500)) return null;
  return { ...base, action: 'create_rule', rule, correction: { text: values.correction.trim(), agency: 'other', documentType: 'other', intent: 'fix' } };
}
async function personalActionHash(action: PrivateUserRuleAction): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(action)));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
type PendingPersonalRule = { action: PrivateUserRuleAction; payloadSha256: string };
const personalWriteRefused = (error: unknown): boolean => error instanceof ApiRequestError && [400, 403, 404, 409, 422].includes(error.status);
type PersonalSession = ReturnType<typeof useAuthoringReadSession>;
function personalOwned<T extends { owner: PersonalSession }>(session: PersonalSession, value: T | null): T | null {
  return session.sameRevision() && value?.owner === session ? value : null;
}
function acknowledgedPersonalLedger(raw: Record<string, unknown>, actor: string, operation: PendingPersonalRule): PrivateUserRuleLedgerDto | null {
  const next = privateLedger(raw.privateRules, actor);
  return raw.success === true && raw.audited === true && raw.intentId === operation.action.intentId
    && next?.receipts.some(r => r.intentId === operation.action.intentId && r.payloadSha256 === operation.payloadSha256) ? next : null;
}

function PersonalRuleLedger() {
  const session = useAuthoringReadSession(authService.getUser());
  const currentOwner = React.useRef(session); currentOwner.current = session;
  const [tick, refresh] = React.useReducer((n: number) => n + 1, 0);
  const [read, setRead] = React.useState<{ owner: typeof session; ledger: PrivateUserRuleLedgerDto | null; checkedIntentId?: string } | null>(null);
  const [edit, setEdit] = React.useState<{ owner: typeof session; value: RuleEdit } | null>(null);
  const [pending, setPending] = React.useState<{ owner: typeof session; value: PendingPersonalRule } | null>(null);
  const [notice, setNotice] = React.useState<{ owner: typeof session; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef<typeof session | null>(null);
  const pendingRef = React.useRef(pending); pendingRef.current = pending;
  const current = () => currentOwner.current === session && session.sameRevision();
  const signedIn = /^[1-9]\d*:[1-9]\d*$/.test(session.actor);
  React.useEffect(() => {
    let active = true; setEdit(null); setBusy(false); inFlight.current = null;
    setPending(p => p?.owner === session ? p : null); setNotice(n => n?.owner === session ? n : null);
    if (!signedIn || !session.sameRevision()) return;
    void apiRequest('GET', PRIVATE_RULE_PATH).then(async response => {
      const raw: unknown = await response.json();
      if (!active || currentOwner.current !== session || !session.sameRevision()) return;
      const next = response.ok ? privateLedger(object(raw).privateRules, session.actor) : null;
      const operation = pendingRef.current?.owner === session ? pendingRef.current.value : null;
      const receipt = next?.receipts.find(r => r.intentId === operation?.action.intentId);
      setRead({ owner: session, ledger: next, checkedIntentId: operation && !receipt ? operation.action.intentId : undefined });
      if (operation && receipt?.payloadSha256 === operation.payloadSha256) {
        setPending(null); setNotice({ owner: session, text: 'Personal rule change confirmed from the current ledger.' });
      }
    }).catch(() => { if (active && currentOwner.current === session && session.sameRevision()) setRead({ owner: session, ledger: null }); });
    return () => { active = false; };
  }, [session, signedIn, tick]);
  const ownedRead = personalOwned(session, read);
  const ledger = ownedRead?.ledger ?? null;
  const editing = personalOwned(session, edit)?.value ?? null;
  const held = personalOwned(session, pending)?.value ?? null;
  const note = personalOwned(session, notice)?.text ?? null;
  const open = (action: RuleEdit['action'], rule?: PrivateUserRuleDto, supersedes: PrivateUserRuleReference[] = []) => {
    if (!current() || !ledger || busy || held || typeof crypto.randomUUID !== 'function') return;
    const replacing = ledger.rules.filter(row => supersedes.some(ref => ref.ruleId === row.ruleId && ref.version === row.version));
    setNotice(null); setEdit({ owner: session, value: { action, rule, supersedes, intentId: crypto.randomUUID(),
      topic: replacing[0]?.conflictKey, replaces: replacing.map(row => `${row.name} (version ${row.version})`).join(', ') } });
  };
  const send = async (input: { action: PrivateUserRuleAction; payloadSha256?: string }) => {
    if (!current() || inFlight.current) return;
    inFlight.current = session; setBusy(true); setNotice(null);
    let operation: PendingPersonalRule | null = null;
    try {
      const prepared = { action: input.action, payloadSha256: input.payloadSha256 ?? await personalActionHash(input.action) };
      operation = prepared;
      if (!current()) return;
      setEdit(null); setPending({ owner: session, value: prepared });
      const response = await apiRequest('POST', PRIVATE_RULE_PATH, prepared.action);
      const raw = object(await response.json());
      if (!current()) return;
      const next = response.ok ? acknowledgedPersonalLedger(raw, session.actor, prepared) : null;
      if (!next) throw new Error('Unconfirmed personal rule receipt');
      setRead({ owner: session, ledger: next }); setPending(null); setNotice({ owner: session, text: 'Personal rule change recorded.' });
    } catch (error) {
      if (!current()) return;
      if (!operation) { setNotice({ owner: session, text: 'This change could not be prepared securely. Nothing was sent.' }); return; }
      const known = personalWriteRefused(error);
      if (known) { setPending(null); setRead({ owner: session, ledger: null }); }
      setNotice({ owner: session, text: known ? 'The change was refused. Re-read your personal rules before editing again.'
        : 'The save could not be confirmed. Re-read your personal rules before retrying the same change.' });
    } finally { if (inFlight.current === session) inFlight.current = null; if (current()) setBusy(false); }
  };
  const save = async (values: Record<string, string>) => {
    if (!editing || !current() || busy || held) return;
    const action = personalRuleAction(editing, values);
    if (!action) { setNotice({ owner: session, text: 'Check the rule topic and provide at least eight characters for instructions, correction and reason.' }); return; }
    await send({ action });
  };
  return <PersonalRuleView ledger={ledger} available={signedIn && current()} hasRead={!!ownedRead} busy={busy}
    held={held} checkedIntentId={ownedRead?.checkedIntentId} notice={note} editing={editing} formKey={`${session.actor}:${session.key}`}
    onOpen={open} onRead={refresh} onRetry={operation => { void send(operation); }} onCancel={() => { if (!busy) setEdit(null); }}
    onSave={values => { void save(values); }} />;
}
interface PersonalRuleViewProps {
  ledger: PrivateUserRuleLedgerDto | null; available: boolean; hasRead: boolean; busy: boolean;
  held: PendingPersonalRule | null; checkedIntentId?: string; notice: string | null; editing: RuleEdit | null; formKey: string;
  onOpen: (action: RuleEdit['action'], rule?: PrivateUserRuleDto, supersedes?: PrivateUserRuleReference[]) => void;
  onRead: () => void; onRetry: (operation: PendingPersonalRule) => void; onCancel: () => void; onSave: (values: Record<string, string>) => void;
}
function PersonalRuleRow({ rule, disabled, onOpen }: { rule: PrivateUserRuleDto; disabled: boolean; onOpen: PersonalRuleViewProps['onOpen'] }) {
  return <div className="amem-mistake"><strong>{rule.name}</strong><p>{RULE_LEVELS[rule.level]} · {rule.state} · Version {rule.version}</p>
    <p className="amem-mistake-c">{rule.instructions}</p><p className="amem-note">From your recorded correction · {new Date(rule.createdAt).toLocaleDateString()}</p>
    {rule.state === 'active' && <><button className="btn ghost small" disabled={disabled} onClick={() => onOpen('update_rule', rule)}>Edit {rule.name}</button>
      <button className="btn ghost small" disabled={disabled} onClick={() => onOpen('revoke_rule', rule)}>Revoke {rule.name}</button></>}
  </div>;
}
function PersonalRuleBody({ ledger, available, hasRead, busy, held, onOpen }: PersonalRuleViewProps) {
  if (!available) return <p className="amem-note">Sign in with your current account to read your personal rules.</p>;
  if (!hasRead) return <p role="status">Reading your personal rules…</p>;
  if (!ledger) return <p className="amem-note">Your personal rules could not be read. This is not an empty ledger.</p>;
  const disabled = busy || !!held;
  return <><p className="amem-note">Your corrections and rule history are kept for you. {ledger.promptUse === 'protected_turns_only'
      ? 'Personal instructions are limited to protected conversations. AnA pauses if privacy or model approval cannot be verified.'
      : 'Personal instructions are not yet loaded into model prompts.'} Approval rules use the recorded controls.</p>
    {ledger.rules.length === 0 && <p className="amem-empty">No personal rules recorded.</p>}
    {ledger.rules.map(rule => <PersonalRuleRow key={rule.ruleId} rule={rule} disabled={disabled} onOpen={onOpen} />)}
    {ledger.conflicts.map(conflict => <div key={conflict.conflictKey}><p role="status">Resolve conflicting personal rules for {conflict.conflictKey}.</p>
      <button className="btn ghost small" disabled={disabled} onClick={() => onOpen('create_rule', undefined, conflict.ruleRefs)}>Replace conflicting versions</button></div>)}
    <button className="btn ghost small" disabled={disabled} onClick={() => onOpen('create_rule')}>Add a personal rule</button>
  </>;
}
function PersonalRuleView(props: PersonalRuleViewProps) {
  const { available, busy, held, ledger, checkedIntentId, notice, editing, formKey, onRead, onRetry, onCancel, onSave } = props;
  const config = editing ? personalRuleForm(editing) : null;
  return <section aria-label="Your personal rules" data-testid="ana-personal-rules">
    <h3 className="amem-sec">Your personal rules</h3><PersonalRuleBody {...props} />
    {available && <button className="btn ghost small" disabled={busy} onClick={onRead}>Re-read personal rules</button>}
    {held && ledger && checkedIntentId === held.action.intentId && <button className="btn ghost small" disabled={busy} onClick={() => onRetry(held)}>Retry the same personal rule change</button>}
    {notice && !editing && <p role="status">{notice}</p>}
    {editing && config && <C2CForm key={`${formKey}:${editing.intentId}`} config={{ ...config,
      busy: busy ? 'Recording your personal rule…' : undefined, notice: notice ?? config.notice }} onCancel={onCancel} onSubmit={onSave} />}
  </section>;
}

export function WhatAnaRemembers({ projectRef, projectName, onClose }: {
  /** The project this conversation's turns are sent under (its `project_id`), or null. */
  projectRef: string | number | null;
  projectName: string | null;
  onClose: () => void;
}) {
  const ref = useDialog(onClose);
  const titleId = React.useId();
  const [userTick, setUserTick] = React.useState(0);
  const [projectTick, setProjectTick] = React.useState(0);
  const project = projectRef != null && String(projectRef).trim() !== '' ? String(projectRef).trim() : null;
  const projectPath = project ? `${PROFILE_PATH}?project_id=${encodeURIComponent(project)}` : null;
  /* Made here, not at import: the conversation imports this file, and its
     suites stub the data module without the guard. */
  const isProfile = React.useMemo(() => hasKeys<RelationalProfile>(...PROFILE_KEYS), []);
  const userRead = useLiveData<RelationalProfile>(PROFILE_PATH, [userTick], isProfile);
  const projectRead = useLiveData<RelationalProfile>(projectPath, [projectPath, projectTick], isProfile);

  return (
    <div className="de-bd" onClick={onClose}>
      <div
        className="de"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        data-testid="ana-remembers"
      >
        <div className="de-h">
          <div>
            <div className="de-h-t" id={titleId}>What AnA remembers</div>
            <div className="de-h-s">
              AnA’s notes are shown read-only. You can inspect and manage your personal rules below.
            </div>
          </div>
          <button type="button" className="de-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="de-body">
          <section data-testid="ana-remembers-user" aria-labelledby={`${titleId}-user`}>
            <h3 className="amem-sec" id={`${titleId}-user`}>{I.user} How AnA is tuned to you</h3>
            <ScopeBody scope="user" view={viewOf('user', userRead, null)} onRetry={() => setUserTick((n) => n + 1)} />
          </section>
          <div className="acct-sep" />
          <PersonalRuleLedger />
          <div className="acct-sep" />
          <section data-testid="ana-remembers-project" aria-labelledby={`${titleId}-project`}>
            <h3 className="amem-sec" id={`${titleId}-project`}>
              {I.folder} {projectName ? `For this project: ${projectName}` : 'For this project'}
            </h3>
            {projectPath ? (
              <ScopeBody scope="project" view={viewOf('project', projectRead, project)} onRetry={() => setProjectTick((n) => n + 1)} />
            ) : (
              <p className="amem-note">No project is open, so AnA reads only the notes above into this conversation.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
