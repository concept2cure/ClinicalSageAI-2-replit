import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getJwtOrgId } from '@/utils/authToken';
import { serverMessage } from '@/lib/queryClient';
import {
  ABSOLUTE_SESSION_HOURS, MIN_IDLE_MINUTES, MAX_IDLE_MINUTES,
  MIN_MAX_CONCURRENT_SESSIONS, MAX_MAX_CONCURRENT_SESSIONS,
  idleWindowSecondsOf, maxConcurrentSessionsOf,
} from '@shared/auth/session-policy';
import {
  MIN_INDEPENDENT_REVIEWERS, MAX_INDEPENDENT_REVIEWERS, reviewPolicyOf, type ReviewPolicy,
} from '@shared/artifact-governance';
import { liveMutateOrNull, useLiveData } from '../dataConnect';
import '../styles/translation-v2.css';

interface Policy { idleMinutes: number; concurrentSessions: number }
interface SettingsPayload { settings: Record<string, unknown>; success?: boolean }
type Note = { error: boolean; text: string } | null;
const ORGANIZATION_CHANGED = 'Your organization changed. Reopen this page to read its current session policy.';
const policyOf = (settings: unknown): Policy => ({ idleMinutes: idleWindowSecondsOf(settings) / 60, concurrentSessions: maxConcurrentSessionsOf(settings) });
const isSettings = (body: unknown): body is SettingsPayload => body !== null && typeof body === 'object' &&
  (body as SettingsPayload).success !== false &&
  (body as SettingsPayload).settings !== null && typeof (body as SettingsPayload).settings === 'object' &&
  !Array.isArray((body as SettingsPayload).settings);
const boundedInteger = (value: string, min: number, max: number) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

function savedPolicy(body: unknown, idle: string, concurrent: string): Policy | null {
  if (!isSettings(body)) return null;
  const security = body.settings.security as { sessionTimeoutMinutes?: unknown; maxConcurrentSessions?: unknown } | null;
  if (security?.sessionTimeoutMinutes !== Number(idle) || security?.maxConcurrentSessions !== Number(concurrent)) return null;
  return policyOf(body.settings);
}

function PolicyFields({ saved, path, organizationId }: { saved: Policy; path: string; organizationId: string }) {
  const [idle, setIdle] = useState(String(saved.idleMinutes));
  const [concurrent, setConcurrent] = useState(String(saved.concurrentSessions));
  const [baseline, setBaseline] = useState(saved);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && getJwtOrgId() === organizationId;
  const dirty = Number(idle) !== baseline.idleMinutes || Number(concurrent) !== baseline.concurrentSessions;
  const valid = boundedInteger(idle, MIN_IDLE_MINUTES, MAX_IDLE_MINUTES) &&
    boundedInteger(concurrent, MIN_MAX_CONCURRENT_SESSIONS, MAX_MAX_CONCURRENT_SESSIONS);

  async function save() {
    if (!current()) {
      setNote({ error: true, text: ORGANIZATION_CHANGED });
      return;
    }
    if (saving || !dirty) return;
    if (!valid || reason.trim().length < 3) {
      setNote({ error: true, text: 'Enter whole numbers within the stated limits and a reason of at least 3 characters.' });
      return;
    }
    setSaving(true);
    setNote(null);
    const result = await liveMutateOrNull<SettingsPayload>('PATCH', path, {
      settings: { security: { sessionTimeoutMinutes: Number(idle), maxConcurrentSessions: Number(concurrent) } },
      reason: reason.trim(),
    });
    if (!mounted.current) return;
    setSaving(false);
    if (!current()) {
      setNote({ error: true, text: ORGANIZATION_CHANGED });
      return;
    }
    const persisted = savedPolicy(result.data, idle, concurrent);
    if (result.error || !persisted) {
      setNote({ error: true, text: serverMessage({ message: result.error }) ?? 'The session policy could not be confirmed as saved. Your changes are still here; try again.' });
      return;
    }
    setBaseline(persisted);
    setIdle(String(persisted.idleMinutes));
    setConcurrent(String(persisted.concurrentSessions));
    setReason('');
    setNote({ error: false, text: 'Session policy saved with your reason in the audit trail. The idle window applies at new sign-in; the concurrent-session limit is checked when a session is opened. Existing sessions keep their idle window.' });
  }

  if (getJwtOrgId() !== organizationId) return <p className="txw-help" data-tone="warn" role="alert">{ORGANIZATION_CHANGED}</p>;
  return <div className="txw-set-body">
    <div className="txw-row"><div className="txw-row-l">Idle sign-out<small>For new sign-ins. {MIN_IDLE_MINUTES}–{MAX_IDLE_MINUTES} minutes.</small></div><div className="txw-row-r">
      <input aria-label="Idle sign-out in minutes" type="number" inputMode="numeric" className="ob-in" min={MIN_IDLE_MINUTES} max={MAX_IDLE_MINUTES} step={1} value={idle} disabled={saving} onChange={(e) => setIdle(e.target.value)} />
    </div></div>
    <div className="txw-row"><div className="txw-row-l">Concurrent sessions<small>{MIN_MAX_CONCURRENT_SESSIONS}–{MAX_MAX_CONCURRENT_SESSIONS} per account. A new sign-in beyond this limit closes the oldest session.</small></div><div className="txw-row-r">
      <input aria-label="Maximum concurrent sessions" type="number" inputMode="numeric" className="ob-in" min={MIN_MAX_CONCURRENT_SESSIONS} max={MAX_MAX_CONCURRENT_SESSIONS} step={1} value={concurrent} disabled={saving} onChange={(e) => setConcurrent(e.target.value)} />
    </div></div>
    <div className="txw-row"><div className="txw-row-l">Absolute lifetime<small>Enforced by the platform for every session.</small></div><div className="txw-row-r"><span className="txw-help">{ABSOLUTE_SESSION_HOURS} hours</span></div></div>
    <div className="txw-row"><div className="txw-row-l">Reason for the change<small>Recorded with the policy change.</small></div><div className="txw-row-r">
      <input aria-label="Reason for session policy change" className="ob-in" value={reason} maxLength={500} disabled={saving} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="btn" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving session policy…' : 'Save session policy'}</button>
    </div></div>
    <div role="status" aria-live="polite" aria-atomic="true" className={note ? 'txw-help' : undefined} data-tone={note?.error ? 'warn' : undefined}>{note?.text ?? ''}</div>
  </div>;
}

/** The two organization settings the live session engine enforces, through the one governed settings writer. */
export function SessionPolicySetting() {
  const organizationId = useMemo(() => getJwtOrgId(), []);
  const path = `/api/organizations/${encodeURIComponent(organizationId)}/settings`;
  const current = Boolean(organizationId) && getJwtOrgId() === organizationId;
  const [epoch, setEpoch] = useState(0);
  const live = useLiveData<SettingsPayload>(current ? path : null, [path, epoch, current], isSettings);
  const saved = current && live.data ? policyOf(live.data.settings) : null;
  return <section className="txw-set-card" aria-label="Session security policy">
    <div className="txw-set-head"><div className="txw-set-head-l"><div className="txw-set-eyebrow">Security</div><h2 className="txw-set-title">Session policy</h2><p className="txw-set-sub">Effective organization policy for new sign-ins, including platform defaults when a value has not been set. Changes are saved with a reason and an audit record.</p></div></div>
    {!current && <p className="txw-help" data-tone="warn" role="alert">{ORGANIZATION_CHANGED}</p>}
    {current && live.loading && <p className="txw-help" role="status">Reading your session policy…</p>}
    {current && live.error && <div className="txw-help" data-tone="warn" role="alert">The session policy could not be read, so no values are shown for editing. <button type="button" className="btn ghost small" onClick={() => setEpoch((n) => n + 1)}>Retry session policy</button></div>}
    {current && !live.loading && !live.error && saved && <PolicyFields key={`${epoch}-${saved.idleMinutes}-${saved.concurrentSessions}`} saved={saved} path={path} organizationId={organizationId} />}
  </section>;
}

const REVIEW_ORGANIZATION_CHANGED = 'Your organization changed. Reopen this page to read its current review rules.';

function savedReviewPolicy(body: unknown, wanted: ReviewPolicy): ReviewPolicy | null {
  if (!isSettings(body)) return null;
  const security = body.settings.security as Partial<Record<keyof ReviewPolicy, unknown>> | null;
  if (security?.independentReviewersRequired !== wanted.independentReviewersRequired ||
      security?.soleMemberSelfApproval !== wanted.soleMemberSelfApproval) return null;
  return reviewPolicyOf(body.settings);
}

function ReviewFields({ saved, path, organizationId }: { saved: ReviewPolicy; path: string; organizationId: string }) {
  const [reviewers, setReviewers] = useState(String(saved.independentReviewersRequired));
  const [selfApproval, setSelfApproval] = useState(saved.soleMemberSelfApproval);
  const [baseline, setBaseline] = useState(saved);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && getJwtOrgId() === organizationId;
  const dirty = Number(reviewers) !== baseline.independentReviewersRequired || selfApproval !== baseline.soleMemberSelfApproval;
  const valid = boundedInteger(reviewers, MIN_INDEPENDENT_REVIEWERS, MAX_INDEPENDENT_REVIEWERS);

  async function save() {
    if (!current()) { setNote({ error: true, text: REVIEW_ORGANIZATION_CHANGED }); return; }
    if (saving || !dirty) return;
    if (!valid || reason.trim().length < 3) {
      setNote({ error: true, text: `Enter a whole number of reviewers from ${MIN_INDEPENDENT_REVIEWERS} to ${MAX_INDEPENDENT_REVIEWERS} and a reason of at least 3 characters.` });
      return;
    }
    const wanted: ReviewPolicy = { independentReviewersRequired: Number(reviewers), soleMemberSelfApproval: selfApproval };
    setSaving(true);
    setNote(null);
    const result = await liveMutateOrNull<SettingsPayload>('PATCH', path, { settings: { security: wanted }, reason: reason.trim() });
    if (!mounted.current) return;
    setSaving(false);
    if (!current()) { setNote({ error: true, text: REVIEW_ORGANIZATION_CHANGED }); return; }
    const persisted = savedReviewPolicy(result.data, wanted);
    if (result.error || !persisted) {
      setNote({ error: true, text: serverMessage({ message: result.error }) ?? 'The review rules could not be confirmed as saved. Your changes are still here; try again.' });
      return;
    }
    setBaseline(persisted);
    setReason('');
    setNote({ error: false, text: 'Review rules saved with your reason in the audit trail. They apply to every approval from now on; approvals already recorded stand.' });
  }

  if (getJwtOrgId() !== organizationId) return <p className="txw-help" data-tone="warn" role="alert">{REVIEW_ORGANIZATION_CHANGED}</p>;
  return <div className="txw-set-body">
    <div className="txw-row"><div className="txw-row-l">Independent reviewers<small>How many people must review a version before it can be approved. {MIN_INDEPENDENT_REVIEWERS}–{MAX_INDEPENDENT_REVIEWERS}. A reviewer is never an author or the approver.</small></div><div className="txw-row-r">
      <input aria-label="Independent reviewers required" type="number" inputMode="numeric" className="ob-in" min={MIN_INDEPENDENT_REVIEWERS} max={MAX_INDEPENDENT_REVIEWERS} step={1} value={reviewers} disabled={saving} onChange={(e) => setReviewers(e.target.value)} />
    </div></div>
    <div className="txw-row"><div className="txw-row-l">One-person organization<small>While the organization has a single member, that person may approve and lock their own document. Each such act is recorded as having no independent review. It stops applying when a second member joins.</small></div><div className="txw-row-r">
      <label className="txw-help"><input type="checkbox" aria-label="Allow a sole member to approve their own document" checked={selfApproval} disabled={saving} onChange={(e) => setSelfApproval(e.target.checked)} /> Allow self-approval</label>
    </div></div>
    <div className="txw-row"><div className="txw-row-l">Reason for the change<small>Recorded with the rule change.</small></div><div className="txw-row-r">
      <input aria-label="Reason for review rules change" className="ob-in" value={reason} maxLength={500} disabled={saving} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="btn" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving review rules…' : 'Save review rules'}</button>
    </div></div>
    <div role="status" aria-live="polite" aria-atomic="true" className={note ? 'txw-help' : undefined} data-tone={note?.error ? 'warn' : undefined}>{note?.text ?? ''}</div>
  </div>;
}

/**
 * The organisation's review rules, set by its administrator (founder decision
 * P-117, 2026-11-10): how many independent reviewers an approval needs, and
 * whether a one-person organisation may approve its own document. Written
 * through the one governed settings writer, with a reason; the approval act
 * reads them (server/services/artifact-approval-act.ts).
 */
export function ReviewPolicySetting() {
  const organizationId = useMemo(() => getJwtOrgId(), []);
  const path = `/api/organizations/${encodeURIComponent(organizationId)}/settings`;
  const current = Boolean(organizationId) && getJwtOrgId() === organizationId;
  const [epoch, setEpoch] = useState(0);
  const live = useLiveData<SettingsPayload>(current ? path : null, [path, epoch, current], isSettings);
  const saved = current && live.data ? reviewPolicyOf(live.data.settings) : null;
  return <section className="txw-set-card" aria-label="Review and approval rules">
    <div className="txw-set-head"><div className="txw-set-head-l"><div className="txw-set-eyebrow">Security</div><h2 className="txw-set-title">Review and approval</h2><p className="txw-set-sub">Your organization&apos;s rules for approving a document, including platform defaults when a value has not been set. A document is always reviewed before it is approved. Changes are saved with a reason and an audit record.</p></div></div>
    {!current && <p className="txw-help" data-tone="warn" role="alert">{REVIEW_ORGANIZATION_CHANGED}</p>}
    {current && live.loading && <p className="txw-help" role="status">Reading your review rules…</p>}
    {current && live.error && <div className="txw-help" data-tone="warn" role="alert">The review rules could not be read, so no values are shown for editing. <button type="button" className="btn ghost small" onClick={() => setEpoch((n) => n + 1)}>Retry review rules</button></div>}
    {current && !live.loading && !live.error && saved && <ReviewFields key={`${epoch}-${saved.independentReviewersRequired}-${saved.soleMemberSelfApproval}`} saved={saved} path={path} organizationId={organizationId} />}
  </section>;
}
