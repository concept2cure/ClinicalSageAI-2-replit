/**
 * Periodic reviews on the Audit & compliance reports surface — "Record review"
 * (P1-25 audit-trail review, P1-43 access review; ADR-0014 §8).
 *
 * A reviewer states the period, what was covered, the outcome and the
 * decisions, then signs the record in the product's one signing dialog (the
 * shared EsignModal): meaning `review`, a reason, the account password and the
 * authenticator code when one is enrolled. The server drafts the record, then
 * re-verifies the signer and signs it in one transaction
 * (routes/audit-compliance-reviews.ts → signGovernedAct). A signed review is not
 * changed afterwards; the user access review and the integrity attestation
 * name the latest one, and say when it is overdue.
 *
 * Decision lines for an access review are the privileged accounts of the user
 * access review run on this screen, and the review names that sealed run as
 * its scope. This file draws and sends; the rules are in complianceReviewModel.ts.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuthUser } from '@/services/portal/authService';
import { EsignModal, esignSignerOf, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { apiCall, apiErrorText } from '../apiCall';
import { ErrorState } from '../dataConnect';
import { I } from '../icons';
import type { RunResult } from './complianceReportsModel';
import {
  KIND_LABEL, REVIEWS_PATH, REVIEW_KINDS, draftBody, formProblem, linesFromAccessRun, parseReviews, periodFor, refusalText, sourceRun,
  statusLine, type Decision, type DecisionLine, type FindingLine, type ReviewKind, type ReviewsState,
} from './complianceReviewModel';

const REVIEW_MEANINGS: ReadonlyArray<EsigMeaning> = ['review'];
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-400)' };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-300)' };
const row: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' };

type Load = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; reviews: ReviewsState };

function useReviewStatus() {
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });
    const r = await apiCall('GET', REVIEWS_PATH);
    const reviews = r.ok ? parseReviews(r.body) : null;
    if (reviews) setLoad({ state: 'ready', reviews });
    else setLoad({ state: 'error', message: r.ok ? 'The review records came back in a form this screen cannot read.' : apiErrorText(r, 'The review records did not respond.') });
  }, []);
  return { load, refresh };
}

/** The periodic reviews card. Shown to the members who may run reports; nothing is read until it is opened. */
export function ReviewRecords({ canRun, result }: { canRun: boolean; result: RunResult | null }) {
  const headingId = useId();
  const { load, refresh } = useReviewStatus();
  const [open, setOpen] = useState(false);
  const [signedNote, setSignedNote] = useState<string | null>(null);
  if (!canRun) return null;
  const start = () => {
    setOpen(true);
    setSignedNote(null);
    void refresh();
  };
  return (
    <section className="pj-card" aria-labelledby={headingId} style={{ margin: '0 0 18px', gap: 10 }}>
      <h2 id={headingId} style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Periodic reviews</h2>
      <div style={muted}>
        An access review and an audit trail review are each due every quarter: three months after the end of the period
        the last one covered. A review is recorded here and signed by its reviewer; the user access review and the
        integrity attestation name the latest one.
      </div>
      {signedNote && <div role="status" style={{ fontSize: 13 }}>{signedNote}</div>}
      {!open && (
        <div><button type="button" className="btn ghost" onClick={start}>Record review</button></div>
      )}
      {open && load.state === 'loading' && <div style={muted} aria-busy="true">Loading the review records…</div>}
      {open && load.state === 'error' && (
        <ErrorState title="Couldn’t load the review records" message={load.message} retry={() => void refresh()} />
      )}
      {open && load.state === 'ready' && (
        <ReviewPanel
          reviews={load.reviews} result={result} onCancel={() => setOpen(false)}
          onSigned={(note) => { setSignedNote(note); setOpen(false); }}
        />
      )}
    </section>
  );
}

function ReviewPanel({ reviews, result, onCancel, onSigned }: {
  reviews: ReviewsState; result: RunResult | null; onCancel: () => void; onSigned: (note: string) => void;
}) {
  return (
    <>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} aria-label="Latest signed reviews">
        {REVIEW_KINDS.map((k) => (
          <li key={k} data-state={reviews.status[k].state}>{statusLine(k, reviews.status[k])}</li>
        ))}
      </ul>
      {reviews.canSign ? (
        <ReviewForm status={reviews.status} result={result} onCancel={onCancel} onSigned={onSigned} />
      ) : (
        <div role="note" style={{ display: 'flex', gap: 8, fontSize: 13 }}>
          <span aria-hidden="true">{I.lock}</span>
          <span>A review is recorded and signed by its reviewer, and your role does not carry signing authority.</span>
        </div>
      )}
    </>
  );
}

function ReviewForm({ status, result, onCancel, onSigned }: {
  status: ReviewsState['status']; result: RunResult | null; onCancel: () => void; onSigned: (note: string) => void;
}) {
  const ids = { kind: useId(), from: useId(), to: useId(), scope: useId(), outcome: useId() };
  const [kind, setKind] = useState<ReviewKind>('access');
  // A review starts the day after the last signed review of its kind ended: the server refuses a gap.
  const [period, setPeriod] = useState(() => periodFor('access', status));
  const chooseKind = (k: ReviewKind) => {
    setKind(k);
    setPeriod(periodFor(k, status));
  };
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');
  const accessLines = useMemo(() => linesFromAccessRun(result), [result]);
  const [lines, setLines] = useState<DecisionLine[]>(accessLines ?? []);
  useEffect(() => setLines(accessLines ?? []), [accessLines]);
  const [findings, setFindings] = useState<FindingLine[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const form = { kind, periodStart: period.from, periodEnd: period.to, description, outcome, lines, findings };
  const run = sourceRun(kind, result);
  const sign = useSignReview(form, run);
  const openSign = () => {
    const p = formProblem(form, run);
    setProblem(p);
    if (!p) setSigning(true);
  };
  const close = () => {
    setSigning(false);
    if (sign.signed.current) onSigned(sign.signed.current);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); openSign(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 16 }}>
        <legend style={{ fontSize: 12, color: 'var(--text-300)', marginBottom: 4 }}>Review</legend>
        {REVIEW_KINDS.map((k) => (
          <label key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="radio" name={ids.kind} value={k} checked={kind === k} onChange={() => chooseKind(k)} />
            {KIND_LABEL[k]}
          </label>
        ))}
      </fieldset>
      <div style={row}>
        <div style={field}>
          <label htmlFor={ids.from}>Reviewed from</label>
          <input id={ids.from} className="c2c-input" type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} />
        </div>
        <div style={field}>
          <label htmlFor={ids.to}>Reviewed to</label>
          <input id={ids.to} className="c2c-input" type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} />
        </div>
        <span style={muted}>Dates are UTC and inclusive.</span>
      </div>
      <div style={field}>
        <label htmlFor={ids.scope}>What the review covered</label>
        <textarea id={ids.scope} className="c2c-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <span style={muted}>{run ? `It names the ${KIND_LABEL[kind].toLowerCase()} report run on this screen, export ${String(run.exp.manifest.exportId ?? '')}.` : 'Run the matching report on this screen first to name it in the review.'}</span>
      </div>
      {kind === 'access' ? <DecisionTable lines={lines} onChange={setLines} /> : <FindingsEditor findings={findings} onChange={setFindings} />}
      <div style={field}>
        <label htmlFor={ids.outcome}>Outcome</label>
        <textarea id={ids.outcome} className="c2c-input" rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      </div>
      {problem && <div role="alert" style={{ fontSize: 13, color: 'var(--error)' }}>{problem}</div>}
      <div style={row}>
        <button type="submit" className="btn primary">Sign review…</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
      {signing && <ReviewSignDialog form={form} onSign={sign.onSign} onClose={close} />}
    </form>
  );
}

/** POST the draft; its id, or a thrown sentence saying nothing was signed. */
async function postDraft(body: Record<string, unknown>): Promise<number> {
  const d = await apiCall('POST', REVIEWS_PATH, body);
  if (!d.ok) throw new Error(refusalText(d, 'The review was not recorded.'));
  const id = Number(d.body?.review?.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('The review came back in a form this screen cannot read. Nothing was signed.');
  return id;
}

/** The note shown once the signature has landed: the server's record number and content hash. */
function signedNote(id: number, body: Record<string, unknown> | null): { note: string; contentHash: string | null } {
  const review = (body?.review ?? null) as { contentHash?: unknown } | null;
  const contentHash = typeof review?.contentHash === 'string' ? review.contentHash : null;
  const hash = contentHash ? ` with content hash ${contentHash.slice(0, 12)}…` : '';
  return { note: `Signed. Review record ${id} is recorded${hash}, and the reports name it from now on.`, contentHash };
}

/** Draft once per distinct content, then sign through the ceremony. `signed` holds the note once it has landed. */
function useSignReview(form: Parameters<typeof draftBody>[0], run: RunResult | null) {
  const draft = useRef<{ key: string; id: number } | null>(null);
  const signed = useRef<string | null>(null);
  const onSign = async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    const body = draftBody(form, run);
    const key = JSON.stringify(body);
    if (draft.current?.key !== key) draft.current = { key, id: await postDraft(body) };
    const id = draft.current.id;
    const s = await apiCall('POST', `${REVIEWS_PATH}/${id}/sign`, {
      reason: input.reason, meaning: input.meaning, password: input.password, ...(input.totp ? { mfaToken: input.totp } : {}),
    });
    if (!s.ok) throw new Error(refusalText(s, 'The review was not signed.'));
    const { note, contentHash } = signedNote(id, s.body);
    signed.current = note;
    draft.current = null;
    if (typeof s.body?.signedAt !== 'string') {
      throw new Error('The review was signed, but the confirmation came back in a form this screen cannot read. Close this dialog to see the review records.');
    }
    return { meaning: input.meaning, reason: input.reason, signedAt: s.body.signedAt, ...(contentHash ? { hash: contentHash } : {}) };
  };
  return { onSign, signed };
}

function ReviewSignDialog({ form, onSign, onClose }: {
  form: Parameters<typeof draftBody>[0];
  onSign: ReturnType<typeof useSignReview>['onSign'];
  onClose: () => void;
}) {
  const authUser = useAuthUser();
  return (
    <EsignModal
      open
      action="Sign review"
      target={`${KIND_LABEL[form.kind]}, ${form.periodStart} to ${form.periodEnd}`}
      targetMeta="Signing records this review as complete under your name. A signed review is not changed afterwards; a correction is a new review."
      defaultMeaning="review"
      meanings={REVIEW_MEANINGS}
      signer={esignSignerOf(authUser)}
      requireMfa={authUser?.mfaEnabled === true}
      onClose={onClose}
      onSign={onSign}
    />
  );
}

function DecisionTable({ lines, onChange }: { lines: DecisionLine[]; onChange: (lines: DecisionLine[]) => void }) {
  if (lines.length === 0) {
    return <div style={muted}>Run the user access review on this screen first. Its privileged accounts are the lines this review decides on.</div>;
  }
  const update = (i: number, patch: Partial<DecisionLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="reg-tbl">
        <caption style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-300)' }}>Decisions, one per privileged account</caption>
        <thead>
          <tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Decision</th><th scope="col">Role it keeps</th><th scope="col">Change that carried it out</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.userId}>
              <td>{l.account}</td>
              <td>{l.role}</td>
              <td>
                <select className="c2c-input" aria-label={`Decision for ${l.account}`} value={l.decision} onChange={(e) => update(i, { decision: e.target.value as Decision | '' })}>
                  <option value="">Choose…</option>
                  <option value="keep">Keep</option>
                  <option value="reduce">Reduce</option>
                  <option value="remove">Remove</option>
                </select>
              </td>
              <td>
                {l.decision === 'reduce'
                  ? <input className="c2c-input" aria-label={`Role ${l.account} keeps`} value={l.reducedTo} onChange={(e) => update(i, { reducedTo: e.target.value })} />
                  : <span style={muted}>Not applicable</span>}
              </td>
              <td>
                {l.decision === 'reduce' || l.decision === 'remove'
                  ? <input className="c2c-input" aria-label={`Change that carried out the decision for ${l.account}`} value={l.changeReference} onChange={(e) => update(i, { changeReference: e.target.value })} />
                  : <span style={muted}>Not applicable</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingsEditor({ findings, onChange }: { findings: FindingLine[]; onChange: (f: FindingLine[]) => void }) {
  const update = (i: number, patch: Partial<FindingLine>) => onChange(findings.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <legend style={{ fontSize: 12, color: 'var(--text-300)', marginBottom: 4 }}>Findings</legend>
      {findings.length === 0 && <div style={muted}>No findings recorded. Add one for each thing the review found.</div>}
      {findings.map((f, i) => (
        <div key={i} style={row}>
          <input className="c2c-input" aria-label={`Finding ${i + 1}`} placeholder="What was found" value={f.finding} onChange={(e) => update(i, { finding: e.target.value })} />
          <input className="c2c-input" aria-label={`What was done about finding ${i + 1}`} placeholder="What was done" value={f.action} onChange={(e) => update(i, { action: e.target.value })} />
          <button type="button" className="btn ghost" onClick={() => onChange(findings.filter((_, j) => j !== i))}>Remove finding {i + 1}</button>
        </div>
      ))}
      <div><button type="button" className="btn ghost" onClick={() => onChange([...findings, { finding: '', action: '' }])}>Add finding</button></div>
    </fieldset>
  );
}
