/**
 * Setup → Records retention: the organisation's retention period
 * (P1-22 remainder, DP-20; ADR-0014 §6).
 *
 *   GET /api/vault/legal-holds/retention   the period in force (the organisation's own, or the default)
 *   PUT /api/vault/legal-holds/retention   { years, reason?, governingRule? }, owner/admin only
 *
 * The server is the only source of every number shown here — the period in
 * force AND the default — so a failed read renders as a failure, never as a
 * default presented as this organisation's period. Shorter than the default is
 * a governed act: it asks for the governing rule and a reason, and the server
 * refuses it without them (server/routes/vault-retention-period.ts). Each
 * accepted change is one transaction with its chained audit row there; this
 * card reports "saved" only from that answer.
 */
import React, { useEffect, useState } from 'react';
import { I } from '../icons';
import { EmptyState, hasKeys, liveMutateOrNull, useLiveData } from '../dataConnect';

export const RETENTION_PERIOD_PATH = '/api/vault/legal-holds/retention';

export interface RetentionPeriodView {
  years: number;
  defaultYears: number;
  isDefault: boolean;
  reason: string | null;
  governingRule: string | null;
  setBy: number | null;
  setAt: string | null;
}

type Payload = { retention: RetentionPeriodView };
const isPayload = hasKeys<Payload>('retention');

interface Props {
  /** How a refused write is described — Setup's own reader, so both cards word a refusal the same way. */
  describeFailure: (error: string, status: number) => string;
}

const fieldStyle: React.CSSProperties = {
  fontSize: 12.5,
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--border-control)',
  background: 'var(--bg-050)',
  color: 'var(--text-100)',
};

const yearsText = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;

/** The server's refusal as a sentence: dataConnect has already reduced it to display copy. */
const asSentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

function InForce({ view }: { view: RetentionPeriodView }) {
  return (
    <div className="txw-row" data-testid="retention-in-force">
      <div className="txw-row-l">
        Period in force
        <small>From the date the Vault admits a record.</small>
      </div>
      <div className="txw-row-r">
        <div>
          <b>{yearsText(view.years)}</b>{' '}
          {view.isDefault ? (
            <span className="rd-chip tone-ok">Default (ADR-0014 §6)</span>
          ) : (
            <span className="txw-help">
              Set by user #{view.setBy ?? '—'}
              {view.setAt ? ` on ${new Date(view.setAt).toLocaleDateString()}` : ''}
            </span>
          )}
        </div>
        {view.governingRule && <span className="txw-help">Governing rule: {view.governingRule}</span>}
        {view.reason && <span className="txw-help">Reason: {view.reason}</span>}
      </div>
    </div>
  );
}

function bodyOf(years: number, reason: string, rule: string, shorter: boolean) {
  const body: { years: number; reason?: string; governingRule?: string } = { years };
  if (reason.trim()) body.reason = reason.trim();
  if (shorter && rule.trim()) body.governingRule = rule.trim();
  return body;
}

/** What the typed values amount to: the period, whether it is below the default, and whether there is anything to send. */
function draftOf(years: string, reason: string, rule: string, saved: RetentionPeriodView) {
  const n = Number(years);
  const valid = years.trim() !== '' && Number.isInteger(n);
  return {
    n,
    shorter: valid && n < saved.defaultYears,
    dirty: valid && (n !== saved.years || reason.trim() !== '' || rule.trim() !== ''),
  };
}

type Note = { tone: 'ok' | 'warn'; text: string } | null;

/** The result of a save, in a live region that exists before its content changes so the change is announced. */
function StatusNote({ note }: { note: Note }) {
  return (
    <div
      className={note ? 'txw-help' : undefined}
      data-tone={note?.tone === 'warn' ? 'warn' : undefined}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {note ? (
        <>
          {note.tone === 'warn' ? I.alertTriangle : I.checkCircle} {note.text}
        </>
      ) : null}
    </div>
  );
}

function Editor({ saved, onSaved, describeFailure }: Props & { saved: RetentionPeriodView; onSaved: (v: RetentionPeriodView) => void }) {
  const [years, setYears] = useState(String(saved.years));
  const [reason, setReason] = useState('');
  const [rule, setRule] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const { n, shorter, dirty } = draftOf(years, reason, rule, saved);

  async function save() {
    setSaving(true);
    setNote(null);
    const r = await liveMutateOrNull<Payload>('PUT', RETENTION_PERIOD_PATH, bodyOf(n, reason, rule, shorter));
    setSaving(false);
    if (r.error || !r.data?.retention) {
      setNote({ tone: 'warn', text: `Not changed: ${describeFailure(r.error ?? 'no period was returned', r.status ?? 0)}` });
      return;
    }
    onSaved(r.data.retention);
    setYears(String(r.data.retention.years));
    setReason('');
    setRule('');
    setNote({ tone: 'ok', text: `Saved: ${yearsText(r.data.retention.years)}, recorded with its audit-trail entry.` });
  }

  return (
    <>
      <div className="txw-row">
        <div className="txw-row-l">
          Change the period
          <small>
            Longer than {yearsText(saved.defaultYears)} needs nothing more. Shorter needs the rule that
            permits it and a reason, both kept in the audit trail.
          </small>
        </div>
        <div className="txw-row-r">
          <input
            aria-label="Retention period in years"
            type="number"
            inputMode="numeric"
            value={years}
            disabled={saving}
            onChange={(e) => setYears(e.target.value)}
            style={{ ...fieldStyle, width: 120 }}
          />
          {shorter && (
            <input
              aria-label="Governing rule"
              placeholder="Governing rule, e.g. 21 CFR 312.62(c)"
              value={rule}
              disabled={saving}
              onChange={(e) => setRule(e.target.value)}
              style={fieldStyle}
            />
          )}
          <input
            aria-label={shorter ? 'Reason for the change (required)' : 'Reason for the change (optional)'}
            placeholder={shorter ? 'Reason for the change (required, audited)' : 'Reason for the change (audited)'}
            value={reason}
            disabled={saving}
            onChange={(e) => setReason(e.target.value)}
            style={fieldStyle}
          />
          <button className="btn" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save retention period'}
          </button>
        </div>
      </div>
      <StatusNote note={note} />
    </>
  );
}

function Body({ describeFailure }: Props) {
  const [reload, setReload] = useState(0);
  const live = useLiveData<Payload>(RETENTION_PERIOD_PATH, [reload], isPayload);
  const [saved, setSaved] = useState<RetentionPeriodView | null>(null);
  useEffect(() => {
    if (live.data?.retention) setSaved(live.data.retention);
  }, [live.data]);

  if (live.loading && !saved) {
    return <EmptyState busy icon={I.clock} title="Loading the retention period…" />;
  }
  if (live.error && live.status === 403) {
    // A 403 is not always about role: the API gate refuses a path outside the
    // release with one too. So the server's own reason is shown, and the role
    // rule is stated as the rule, not as the cause.
    return (
      <EmptyState
        icon={I.lock}
        title="The retention period was not shown"
        hint={`${asSentence(live.error)} The period is viewed and set by the organisation's owner or administrators.`}
      />
    );
  }
  if (live.error || !saved) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load the retention period"
        hint="The period in force is unknown here, so nothing can be changed until it loads."
        retry={() => setReload((k) => k + 1)}
      />
    );
  }
  return (
    <>
      <InForce view={saved} />
      <Editor saved={saved} onSaved={setSaved} describeFailure={describeFailure} />
    </>
  );
}

export function RetentionPeriodCard({ describeFailure }: Props) {
  return (
    <div className="txw-set-card" data-testid="retention-period-card">
      <div className="txw-set-head">
        <div className="txw-set-head-l">
          <div className="txw-set-eyebrow">Vault — records retention</div>
          <h2 className="txw-set-title">Retention period</h2>
          <p className="txw-set-sub">
            How long the Vault keeps a governed record before it may be disposed of. Applies to records
            admitted from now on; a record already admitted keeps the date it was given. A named
            retention policy that is longer still applies, and a legal hold always prevents deletion.
          </p>
        </div>
      </div>
      <div className="txw-set-body">
        <Body describeFailure={describeFailure} />
      </div>
    </div>
  );
}
