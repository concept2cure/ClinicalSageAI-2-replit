/**
 * Submission Center — kit app/submission-center.jsx ported (registry id
 * `submission-center`, contract-ready).
 *
 * The reference answer-first surface (SCREENS.md §03): opens with a
 * plain-language dispatch verdict, not a grid. The 8 workspaces are scaffolded
 * from the REAL contract SUBMISSION_WORKSPACES (@shared/types/submission-ui) —
 * never hard-coded. The portfolio list binds live to GET /api/submissions
 * (live ?? fixture behind the SampleTag pill); the per-workspace detail data
 * (leaves, findings, sequences, shadow, cross-region) stays on the kit sample
 * shapes behind the pill until each endpoint is wired.
 */
import React from 'react';
import { SUBMISSION_WORKSPACES } from '@shared/types/submission-ui';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import { SampleTag, useLive, connected } from '../dataConnect';
import {
  SC_APPTYPES,
  SC_CROSSREGION,
  SC_FINDINGS,
  SC_FIND_SEV,
  SC_FIND_STATUS,
  SC_LEAVES,
  SC_LENSES,
  SC_LIFECYCLE_OPS,
  SC_PATHWAYS,
  SC_REGIONS,
  SC_SEQ_STATUS,
  SC_SEQUENCES,
  SC_SHADOW,
  SC_SUBMISSIONS,
  SC_TRANSITIONS,
  type ScSequence,
  type ScSubmission,
  type ToneMap,
} from '../fixtures/submission';
import '../styles/submission-v2.css';

function Chip({ map, k }: { map: Record<string, ToneMap>; k: string }) {
  const m = map[k] ?? { l: k, t: 'idle' };
  return <span className={`rd-chip tone-${m.t}`}>{m.l}</span>;
}

export function SubmissionCenter({
  onAsk,
  onNav,
}: {
  onAsk: (text: string) => void;
  onNav: (id: string) => void;
}) {
  const [ws, setWs] = React.useState('portfolio');
  const [selSub, setSelSub] = React.useState('sub-204');
  const [lens, setLens] = React.useState('fda_filing');
  const [ran, setRan] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const live = connected();
  // GET /api/submissions — live ?? fixture (SampleTag reflects which).
  const portfolio = useLive<{ submissions?: ScSubmission[] } | ScSubmission[]>(
    '/api/submissions',
    SC_SUBMISSIONS,
    []
  );
  const submissions: ScSubmission[] = Array.isArray(portfolio.data)
    ? portfolio.data
    : portfolio.data?.submissions ?? SC_SUBMISSIONS;
  const portfolioSample = portfolio.sample || !Array.isArray(submissions) || submissions.length === 0;
  const list = submissions.length ? submissions : SC_SUBMISSIONS;

  const [seqs, setSeqs] = React.useState<ScSequence[]>(SC_SEQUENCES);

  const sub = list.find((s) => s.id === selSub) ?? list[0];
  const appL = (v: string) => SC_APPTYPES.find((a) => a.v === v)?.l ?? v;
  const pathL = (v: string) => SC_PATHWAYS.find((a) => a.v === v)?.l ?? v;
  const regL = (v: string) => SC_REGIONS.find((a) => a.v === v)?.l ?? v;

  const transition = (i: number, to: string) => {
    setSeqs((s) => s.map((x, k) => (k === i ? { ...x, status: to } : x)));
    fireToast(`Sequence ${seqs[i].seq} → ${SC_SEQ_STATUS[to].l}${live ? ' · POST /transition' : ''}`);
  };

  const openFindings = SC_FINDINGS.filter((f) => f.status === 'open').length;
  const crit = SC_FINDINGS.filter((f) => f.status === 'open' && f.severity === 'critical');
  const top = crit[0] ?? SC_FINDINGS.filter((f) => f.status === 'open')[0];
  const clean = openFindings === 0;

  return (
    <div className="sp sc-page">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Submission · /api/submissions {live ? '· live' : ''}</div>
          <h1 className="sp-title">
            Submission Center <SampleTag sample={portfolioSample} />
          </h1>
          <p className="sp-state">
            Plan, assemble, validate and dispatch regulatory submissions across regions — eCTD v3.2.2
            / v4.0, eSTAR, MDR/IVDR. Eight workspaces scaffolded from the submission contract, each
            wired to its endpoints and AnA tools.
          </p>
        </div>
        <select className="sc-subpick" value={sub?.id} onChange={(e) => setSelSub(e.target.value)}>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.program} · {appL(s.appType)} · {regL(s.region)}
            </option>
          ))}
        </select>
      </div>

      {sub && (
        <AnswerLead
          tone={crit.length ? 'urgent' : clean ? 'good' : 'calm'}
          eyebrow={`Is your ${regL(sub.region)} ${appL(sub.appType)} sequence ready to transmit`}
          headline={
            clean ? (
              <>
                Yes — the sequence validates clean. You&#39;re clear to freeze and dispatch to{' '}
                {sub.region === 'fda' ? 'the ESG gateway' : 'the regional gateway'}.
              </>
            ) : (
              <>
                Not yet —{' '}
                <b>
                  {openFindings} validation {openFindings === 1 ? 'finding' : 'findings'}
                </b>{' '}
                {crit.length ? <>({crit.length} critical) </> : ''}stand between you and dispatch.
              </>
            )
          }
          body={
            clean ? (
              <>
                Every eValidator rule passes and the lifecycle is at a dispatch-ready state. Run the
                final dispatch QC and transmit; acknowledgements will track automatically.
              </>
            ) : top ? (
              <>
                The one that blocks technical validation: <b>{top.rule}</b> —{' '}
                {top.msg.charAt(0).toLowerCase() + top.msg.slice(1)} Clear the criticals and the
                gateway will accept the sequence.
              </>
            ) : (
              <>
                Work the open findings in Validation; they must reach zero before the ESG gateway will
                accept the sequence.
              </>
            )
          }
          reassure={
            crit.length
              ? "These are fixable before you file — I'll explain each finding and draft the corrections, then re-run the validator with you."
              : clean
                ? "You're at the finish line. I'll run the dispatch QC and confirm the transmission."
                : "You're close. I'll help you close out the remaining findings."
          }
          action={{
            label: clean ? 'Run dispatch QC & transmit' : 'Fix the validation findings',
            onClick: () => setWs(clean ? 'dispatch' : 'validation'),
            alt: top
              ? {
                  label: `Explain ${top.id}`,
                  onClick: () =>
                    onAsk(`Explain validation finding ${top.id}: ${top.rule} — ${top.msg}`),
                }
              : undefined,
          }}
          secondary="Or move through the workspaces below — plan, build, validate, dispatch."
        />
      )}

      <div className="sc-wsbar" role="tablist">
        {SUBMISSION_WORKSPACES.map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={ws === w.id}
            className={`sc-ws${ws === w.id ? ' on' : ''}`}
            onClick={() => setWs(w.id)}
          >
            {w.label}
            {w.id === 'validation' && openFindings > 0 && (
              <span className="sc-ws-badge">{openFindings}</span>
            )}
          </button>
        ))}
      </div>

      {ws === 'portfolio' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Submissions</span>
            <button
              type="button"
              className="pj-card-h-go"
              onClick={() => fireToast('New submission (POST /api/submissions)')}
            >
              + New submission
            </button>
          </div>
          <div className="pj-card-b pj-card-b-flush">
            <table className="ub-inv">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Region</th>
                  <th>Type</th>
                  <th>Pathway</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th className="ub-r">Sequences</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr
                    key={s.id}
                    data-cur={s.id === sub?.id || undefined}
                    className="sc-subrow"
                    onClick={() => {
                      setSelSub(s.id);
                      setWs('sequences');
                    }}
                  >
                    <td>
                      <b>{s.program}</b>
                    </td>
                    <td>{regL(s.region)}</td>
                    <td>{appL(s.appType)}</td>
                    <td>{pathL(s.pathway)}</td>
                    <td className="sc-cap">{s.stage}</td>
                    <td>
                      <Chip map={SC_SEQ_STATUS} k={s.status} />
                    </td>
                    <td className="ub-r">{s.seqCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ws === 'planner' && sub && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Planner · {sub.program}</span>
            <span className="s">POST /:id/plan · GET /region-profiles</span>
          </div>
          <div className="pj-card-b">
            <div className="tl-spec-grid sc-spec">
              <div className="tl-spec-row">
                <span className="tl-spec-k">Region</span>
                <span className="tl-spec-v">{regL(sub.region)}</span>
              </div>
              <div className="tl-spec-row">
                <span className="tl-spec-k">Application</span>
                <span className="tl-spec-v">{appL(sub.appType)}</span>
              </div>
              <div className="tl-spec-row">
                <span className="tl-spec-k">Pathway</span>
                <span className="tl-spec-v">{pathL(sub.pathway)}</span>
              </div>
              <div className="tl-spec-row">
                <span className="tl-spec-k">Lifecycle stage</span>
                <span className="tl-spec-v sc-cap">{sub.stage}</span>
              </div>
            </div>
            <div className="scaf-note sc-mt">
              AnA builds the sequence plan from the region profile — required modules, granularity,
              regional Module 1, and the validation profile for {regL(sub.region)}.
            </div>
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() =>
                  onAsk(
                    `Plan the ${regL(sub.region)} ${appL(sub.appType)} submission for ${sub.program} from the region profile.`
                  )
                }
              >
                {I.sparkles} Generate plan (plan_submission)
              </button>
            </div>
          </div>
        </div>
      )}

      {ws === 'builder' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Builder · eCTD leaves</span>
            <span className="s">classify · extract · provenance</span>
          </div>
          <div className="pj-card-b">
            <div className="scaf-note sc-mb">
              Each leaf carries a lifecycle operator (new / replace / append / delete). AnA classifies
              and extracts uploaded documents into the right leaf and traces provenance.
            </div>
            <div className="sp-list">
              {SC_LEAVES.map((l, i) => (
                <div key={i} className="sp-row">
                  <span className="sp-tag2">M{l.module}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">{l.title}</span>
                    <span className="sp-row-s sc-mono">{l.path}</span>
                  </span>
                  <Chip map={SC_LIFECYCLE_OPS} k={l.op} />
                  <button
                    type="button"
                    className="cv-open"
                    onClick={() => onAsk(`Trace provenance for leaf ${l.path}`)}
                  >
                    Provenance {I.right}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {ws === 'sequences' && sub && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Sequences · {sub.program}</span>
            <span className="s">draft → assembling → validated → frozen → dispatched</span>
          </div>
          <div className="pj-card-b">
            <div className="sp-list">
              {seqs.map((s, i) => (
                <div key={i} className="sp-row">
                  <span className="sp-tag2">{s.seq}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t sc-cap">{s.type} sequence</span>
                    <span className="sp-row-s">
                      {s.leaves} leaves · {regL(s.region)} · updated {s.updated}
                    </span>
                  </span>
                  <Chip map={SC_SEQ_STATUS} k={s.status} />
                  <span className="sc-trans">
                    {(SC_TRANSITIONS[s.status] ?? []).map((to) => (
                      <button
                        key={to}
                        type="button"
                        className="sc-trans-b"
                        onClick={() => transition(i, to)}
                      >
                        {I.right} {SC_SEQ_STATUS[to].l}
                      </button>
                    ))}
                    {(SC_TRANSITIONS[s.status] ?? []).length === 0 && (
                      <span className="sp-q-s">terminal</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {ws === 'validation' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Validation · eValidator</span>
            <span className="s">{openFindings} open · POST /:id/validation/explain</span>
          </div>
          <div className="pj-card-b">
            <div className="sp-list">
              {SC_FINDINGS.map((f) => (
                <div key={f.id} className="sp-row">
                  <span className="sp-tag2">{f.id}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">{f.rule}</span>
                    <span className="sp-row-s">
                      {f.msg} · {f.loc}
                    </span>
                  </span>
                  <Chip map={SC_FIND_SEV} k={f.severity} />
                  <Chip map={SC_FIND_STATUS} k={f.status} />
                  <button
                    type="button"
                    className="cv-open"
                    onClick={() => onAsk(`Explain validation finding ${f.id}: ${f.rule}`)}
                  >
                    Explain
                  </button>
                </div>
              ))}
            </div>
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() => fireToast('Re-running eValidator (validate_ectd_package)')}
              >
                {I.shieldCheck} Re-validate package
              </button>
            </div>
          </div>
        </div>
      )}

      {ws === 'shadow-review' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Shadow review</span>
            <span className="s">POST /sequences/:seqId/shadow-review</span>
          </div>
          <div className="pj-card-b">
            <div className="cm-pushbar sc-mb">
              <span className="sp-q-s">Review lens</span>
              <select
                className="sc-subpick"
                value={lens}
                onChange={(e) => setLens(e.target.value)}
              >
                {SC_LENSES.map((l) => (
                  <option key={l.v} value={l.v}>
                    {l.l}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() => {
                  setRan(true);
                  fireToast(`Shadow review running · ${SC_LENSES.find((l) => l.v === lens)?.l}`);
                }}
              >
                {I.sparkles} Run shadow review
              </button>
            </div>
            {ran ? (
              <div className="sp-list">
                {SC_SHADOW.map((f) => (
                  <div key={f.id} className="sp-row">
                    <span className="sp-tag2">{f.id}</span>
                    <span className="sp-row-b">
                      <span className="sp-row-t">{f.msg}</span>
                      <span className="sp-row-s sc-mono">{f.ref}</span>
                    </span>
                    <Chip map={SC_FIND_SEV} k={f.severity} />
                    <button type="button" className="cv-open" onClick={() => onNav('dossier')}>
                      Open {I.right}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="scaf-note">
                Run a review to see how a {SC_LENSES.find((l) => l.v === lens)?.l} reviewer would read
                this sequence before you file — pre-empting information requests.
              </div>
            )}
          </div>
        </div>
      )}

      {ws === 'cross-region' && sub && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Cross-region gap analysis</span>
            <span className="s">POST /:id/cross-region</span>
          </div>
          <div className="pj-card-b">
            <div className="scaf-note sc-mb">
              What the {regL(sub.region)} sequence is missing to file the same program in other
              regions.
            </div>
            <div className="sp-list">
              {SC_CROSSREGION.map((g, i) => (
                <div key={i} className="sp-row">
                  <span className="sp-tag2">{regL(g.region)}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">{g.item}</span>
                    <span className="sp-row-s">{g.note}</span>
                  </span>
                  <span className={`rd-chip tone-${g.status === 'gap' ? 'warn' : 'ok'}`}>
                    {g.status === 'gap' ? 'gap' : 'reusable'}
                  </span>
                </div>
              ))}
            </div>
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() =>
                  onAsk(
                    `Run cross-region gap analysis for ${sub.program} EU MAA vs the FDA sequence.`
                  )
                }
              >
                {I.sparkles} Analyze another region
              </button>
            </div>
          </div>
        </div>
      )}

      {ws === 'dispatch' && sub && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Dispatch</span>
            <span className="s">POST /:id/dispatch-qc</span>
          </div>
          <div className="pj-card-b">
            <div className="sc-dispatch">
              <div className="sc-disp-row">
                <span className={`rd-chip tone-${openFindings ? 'warn' : 'ok'}`}>
                  {openFindings ? I.alertTriangle : I.check}{' '}
                  {openFindings ? `${openFindings} open validation findings` : 'Validation clean'}
                </span>
                <span className="sp-row-s">
                  Sequence must be Validated → Frozen before dispatch.
                </span>
              </div>
              <div className="sc-disp-actions">
                <button
                  type="button"
                  className="sp-primary sc-btn"
                  disabled={openFindings > 0}
                  onClick={() => fireToast('Dispatch QC check (dispatch_qc_check)')}
                >
                  {I.shieldCheck} Run dispatch QC
                </button>
                <button
                  type="button"
                  className={`sp-primary sc-btn ${sub.region === 'fda' ? '' : 'sc-btn-neutral'}`}
                  disabled={openFindings > 0}
                  onClick={() =>
                    fireToast(
                      sub.region === 'fda'
                        ? 'Transmit via FDA ESG gateway'
                        : 'Export eSTAR / regional package'
                    )
                  }
                >
                  {I.rocket} {sub.region === 'fda' ? 'Send via ESG gateway' : 'Export package'}
                </button>
              </div>
              <div className="scaf-note">
                {sub.region === 'fda'
                  ? 'FDA sequences transmit through the ESG gateway (acknowledgements tracked). eSTAR device submissions export a validated package instead.'
                  : 'Regional package export with the region validation profile.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="sc-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
