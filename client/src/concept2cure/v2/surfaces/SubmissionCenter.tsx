/**
 * Submission Center — kit app/submission-center.jsx ported (registry id
 * `submission-center`, contract-ready).
 *
 * Real-data standard (no mock in product): the 8 workspaces are scaffolded from
 * the REAL contract SUBMISSION_WORKSPACES (@shared/types/submission-ui). The
 * portfolio list binds live to GET /api/submissions and the per-submission
 * sequences to GET /api/submissions/:id/sequences (both DB-backed via
 * submission-service) with a four-state render — loading → error → honest empty
 * → real. Slices with no load-time list read (Builder leaves are per-sequence;
 * eValidator findings, shadow-review results, and cross-region gaps are
 * POST/AI results, not a list GET) show an honest EmptyState instead of the
 * kit's sample data. Every fixture presented as content, plus the SampleTag,
 * has been removed; only the canonical enum/label/state-machine maps
 * (SC_REGIONS / SC_APPTYPES / SC_LENSES / SC_SEQ_STATUS / SC_TRANSITIONS) are
 * kept — real regulatory reference config, not sample data.
 */
import React from 'react';
import { SUBMISSION_WORKSPACES } from '@shared/types/submission-ui';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import { useLiveRows, useLiveData, hasKeys, liveMutateOrNull, EmptyState } from '../dataConnect';
import {
  // Canonical enum / label / state-machine maps (mirror shared/types/
  // submission-constants + the server SEQUENCE_TRANSITIONS) — reference config,
  // NOT sample data, so they stay.
  SC_APPTYPES,
  SC_LENSES,
  SC_REGIONS,
  SC_SEQ_STATUS,
  SC_TRANSITIONS,
  type ToneMap,
} from '../fixtures/submission';
import '../styles/submission-v2.css';

/* ── Display types aligned to the canonical submission core's ACTUAL columns
   (shared/schema/submissions.ts; server/services/submission-service). Only
   columns the backend returns are typed; nullable columns are `| null` and
   rendered null-safe — never fabricated. Notably `submissions` has no
   `pathway`/`seqCount` (pathway lives on submission_regions; sequences are a
   separate table) and its `status` enum is planning|active|submitted|archived
   (distinct from the sequence status enum). ── */

// GET /api/submissions → listSubmissions() → `submissions` rows.
interface SubRow {
  id: number;
  title: string;
  productName: string | null;
  applicationType: string; // ind|nda|bla|anda|maa|510k|de_novo|pma|cta (SC_APPTYPES)
  clientType: string; // pharma|biotech|mdx|ivd
  primaryRegion: string; // fda|eu|jp (SC_REGIONS)
  status: string; // planning|active|submitted|archived
  lifecycleStage: string; // planning|original|amendment|response|variation|annual|withdrawal
}

// GET /api/submissions/:id/sequences → listSequences() → `ectd_sequences` rows.
interface SeqRow {
  id: number;
  sequenceNumber: string; // '0000', '0001', …
  type: string; // original|amendment|response|variation|annual|withdrawal
  status: string; // draft|assembling|validated|frozen|dispatched (SC_SEQ_STATUS)
  region: string; // fda|eu|jp
  validationStatus: string | null; // pending|passed|failed — nullable column
}

// Deterministic display tone for the submission status enum (not sample data).
const SUB_STATUS_TONE: Record<string, string> = {
  planning: 'idle',
  active: 'ai',
  submitted: 'ok',
  archived: 'idle',
};

/* ── Device filings (eSTAR tracker) ─────────────────────────────────────────
   eSTAR is NOT eCTD: a tracked device filing never becomes an ectd_sequences
   row. The device journey is read here from its own canonical tracker,
   GET /api/510k/estar/submissions (server/routes/510k-estar-routes.ts →
   estar_submissions), and rendered as its own Portfolio section. Only columns
   the backend returns are typed; nullable columns render null-safe — never
   fabricated. ── */

// GET /api/510k/estar/submissions → { submissions: estar_submissions rows }.
interface DeviceFilingRow {
  id: string;
  catalogKey: string;
  programType: string; // 510k|de_novo|pma|q_sub|ide|513g
  variant: string; // device|ivd
  title: string | null;
  status: string; // draft|filed|under_review|additional_info|decision|withdrawn
  decision: string | null;
  fdaTrackingNumber: string | null;
  filedAt: string | null;
  decisionDueAt: string | null;
  projectId: number | null;
}

// Deterministic display map for the eSTAR filing-status enum (mirrors
// shared/schema/estar-submission ESTAR_SUBMISSION_STATUSES) — reference
// config, not sample data. Unknown statuses fall through Chip's honest
// `{ l: k }` default, so a status is never invented.
const ESTAR_FILING_STATUS: Record<string, ToneMap> = {
  draft: { l: 'Draft', t: 'idle' },
  filed: { l: 'Filed', t: 'ai' },
  under_review: { l: 'Under review', t: 'ai' },
  additional_info: { l: 'Additional info', t: 'warn' },
  decision: { l: 'Decision', t: 'ok' },
  withdrawn: { l: 'Withdrawn', t: 'idle' },
};

// POST /api/510k/estar/assemble → assembly verdict (device-assembly contract).
interface AssemblyVerdictPayload {
  artifactKind: string; // official-estar | content-package-draft | none
  blockers?: string[];
}

// Honest labels for the assembly verdict's artifactKind enum.
const ARTIFACT_KIND_LABEL: Record<string, string> = {
  'official-estar': 'official eSTAR producible',
  'content-package-draft': 'draft content package only — not submittable',
  none: 'nothing assemblable yet',
};

type AssemblyVerdictState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; artifactKind: string; blockerCount: number };

/** The device-section header line: the org-wide assembly verdict (one call). */
function assemblyReadinessLine(v: AssemblyVerdictState): string {
  if (v.state === 'loading') return 'Checking assembly readiness…';
  if (v.state === 'error') return 'Assembly readiness unavailable right now';
  const kind = ARTIFACT_KIND_LABEL[v.artifactKind] ?? v.artifactKind;
  return `Assembly readiness: ${kind} · ${v.blockerCount} blocker${v.blockerCount === 1 ? '' : 's'}`;
}

/** Review-clock cell: only states the tracker actually knows. */
function reviewClock(f: DeviceFilingRow): string {
  if (f.decisionDueAt) {
    const d = new Date(f.decisionDueAt);
    if (!Number.isNaN(d.getTime())) return `Decision due ${d.toLocaleDateString()}`;
  }
  return f.filedAt ? 'No review clock' : 'Not filed yet';
}

function Chip({ map, k }: { map: Record<string, ToneMap>; k: string }) {
  const m = map[k] ?? { l: k, t: 'idle' };
  return <span className={`rd-chip tone-${m.t}`}>{m.l}</span>;
}

export function SubmissionCenter({
  onAsk,
  onNav,
}: {
  onAsk: (text: string) => void;
  /** Shell navigation (surfaceId router) — the device-filing deep link into
   *  the 510(k) surface (`device-510k`). Optional so the surface still
   *  renders standalone (the shell always provides it). */
  onNav?: (id: string) => void;
}) {
  const [ws, setWs] = React.useState('portfolio');
  const [selSub, setSelSub] = React.useState<number | null>(null);
  const [lens, setLens] = React.useState('fda_filing');

  // GET /api/submissions — real DB rows, honest empty, honest error (no fixture).
  const subs = useLiveRows<SubRow>('/api/submissions');
  const list = subs.rows;
  const sub = list.find((s) => s.id === selSub) ?? list[0];

  // GET /api/510k/estar/submissions — the org's tracked eSTAR device filings.
  // { submissions } envelope (not the `{ data }` convention), so the shape is
  // guarded explicitly; a mismatched 200 reaches the error branch, never an
  // invented empty state.
  const deviceRes = useLiveData<{ submissions: DeviceFilingRow[] }>(
    '/api/510k/estar/submissions',
    ['/api/510k/estar/submissions'],
    hasKeys('submissions'),
  );
  const deviceFilingsRaw = deviceRes.data?.submissions;
  const deviceFilings: DeviceFilingRow[] = Array.isArray(deviceFilingsRaw) ? deviceFilingsRaw : [];
  const deviceEmpty = !deviceRes.loading && !deviceRes.error && deviceFilings.length === 0;

  // POST /api/510k/estar/assemble — ONE org-wide device-assembly verdict for
  // the section header (read-only on the server; renders/persists nothing).
  // One call per mount, never per-row.
  const [assembly, setAssembly] = React.useState<AssemblyVerdictState>({ state: 'loading' });
  React.useEffect(() => {
    let cancelled = false;
    liveMutateOrNull<AssemblyVerdictPayload>('POST', '/api/510k/estar/assemble', {
      pathway: '510k',
      variant: 'device',
    }).then((r) => {
      if (cancelled) return;
      if (r.data && typeof r.data.artifactKind === 'string') {
        const blockers = Array.isArray(r.data.blockers) ? r.data.blockers : [];
        setAssembly({ state: 'ready', artifactKind: r.data.artifactKind, blockerCount: blockers.length });
      } else {
        // Failed or misshapen — say it is unavailable, never fabricate a verdict.
        setAssembly({ state: 'error' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // GET /api/submissions/:id/sequences — keyed on the selected submission (a real
  // numeric id). Null path while no submission is selected → the hook stays idle
  // and returns an empty list (no fixture). Not seeded into local state, so no
  // re-render loop.
  const seqPath = sub ? `/api/submissions/${sub.id}/sequences` : null;
  const seqs = useLiveRows<SeqRow>(seqPath);

  const appL = (v: string) => SC_APPTYPES.find((a) => a.v === v)?.l ?? v;
  const regL = (v: string) => SC_REGIONS.find((a) => a.v === v)?.l ?? v;
  const lensL = SC_LENSES.find((l) => l.v === lens)?.l ?? lens;

  return (
    <div className="sp sc-page">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Submission · GET /api/submissions</div>
          <h1 className="sp-title">Submission Center</h1>
          <p className="sp-state">
            Plan, assemble, validate and dispatch regulatory submissions across regions — eCTD v3.2.2
            / v4.0, eSTAR, MDR/IVDR. Eight workspaces scaffolded from the submission contract, each
            backed by the canonical submission core and AnA tools.
          </p>
        </div>
        {list.length > 0 && (
          <select
            className="sc-subpick"
            value={sub?.id ?? ''}
            onChange={(e) => setSelSub(Number(e.target.value))}
          >
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {appL(s.applicationType)} · {regL(s.primaryRegion)}
              </option>
            ))}
          </select>
        )}
      </div>

      {sub && (
        <AnswerLead
          tone="calm"
          eyebrow={`Where ${sub.title} stands`}
          headline={
            <>
              {sub.title}
              {sub.productName ? ` (${sub.productName})` : ''} — a {regL(sub.primaryRegion)}{' '}
              {appL(sub.applicationType)} at the <b>{sub.lifecycleStage}</b> stage.
            </>
          }
          body={
            seqs.loading ? (
              <>Loading this submission&#39;s sequences…</>
            ) : seqs.error ? (
              <>
                This submission&#39;s sequences couldn&#39;t be loaded right now — open the Sequences
                workspace to retry.
              </>
            ) : (
              <>
                <b>{seqs.rows.length}</b> eCTD {seqs.rows.length === 1 ? 'sequence' : 'sequences'}{' '}
                tracked{seqs.rows.length ? '' : ' yet'}. Plan, assemble, validate and dispatch it
                across the workspaces below; validation findings load per sequence once it is
                assembled.
              </>
            )
          }
          reassure="I can plan the sequence from the region profile, assemble the leaves, and walk the validation and dispatch gates with you."
          action={{
            label: seqs.rows.length ? 'Open the sequences' : 'Plan the submission',
            onClick: () => setWs(seqs.rows.length ? 'sequences' : 'planner'),
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
          </button>
        ))}
      </div>

      {ws === 'portfolio' && (
        <>
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Submissions</span>
            <button
              type="button"
              className="pj-card-h-go"
              onClick={() => onAsk('Start a new submission — create the canonical submission record.')}
            >
              + New submission
            </button>
          </div>
          <div className="pj-card-b pj-card-b-flush">
            {subs.loading ? (
              <div className="scaf-note" style={{ padding: '18px 10px' }}>
                Loading submissions…
              </div>
            ) : subs.error ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the submissions"
                hint="The canonical submission core didn't respond. These are your organization's submissions — sign in and retry, or check the service is reachable."
              />
            ) : subs.empty ? (
              <EmptyState
                icon={I.fileText}
                title="No submissions yet"
                hint="Create your first submission to plan, assemble, validate and dispatch a regulatory sequence. Each is governed and tracked here."
              />
            ) : (
              <table className="ub-inv">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Region</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Stage</th>
                    <th>Status</th>
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
                        <b>{s.title}</b>
                        {s.productName ? <span className="sp-row-s"> · {s.productName}</span> : null}
                      </td>
                      <td>{regL(s.primaryRegion)}</td>
                      <td>{appL(s.applicationType)}</td>
                      <td className="sc-cap">{s.clientType}</td>
                      <td className="sc-cap">{s.lifecycleStage}</td>
                      <td>
                        <span className={`rd-chip tone-${SUB_STATUS_TONE[s.status] ?? 'idle'}`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Device filings — the eSTAR tracker's journey, read-only here.
            eSTAR is not eCTD: these rows live in estar_submissions and never
            masquerade as sequences. The header line is the org's one-call
            device-assembly verdict (artifact kind + blocker count). */}
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Device filings · eSTAR</span>
            <span className="s">{assemblyReadinessLine(assembly)}</span>
          </div>
          <div className="pj-card-b pj-card-b-flush">
            {deviceRes.loading ? (
              <div className="scaf-note" style={{ padding: '18px 10px' }}>
                Loading device filings…
              </div>
            ) : deviceRes.error ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the device filings"
                hint="The eSTAR filing tracker didn't respond. These are your organization's tracked device filings — sign in and retry, or check the service is reachable."
              />
            ) : deviceEmpty ? (
              <EmptyState
                icon={I.fileText}
                title="No device filings tracked yet"
                hint="Start tracking an eSTAR filing (510(k), De Novo, PMA, Q-Sub…) from the 510(k) surface's filing panel — its status and review clock appear here."
              />
            ) : (
              <table className="ub-inv">
                <thead>
                  <tr>
                    <th>Filing</th>
                    <th>Program</th>
                    <th>Status</th>
                    <th>FDA tracking</th>
                    <th>Review clock</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {deviceFilings.map((f) => (
                    <tr key={f.id} className="sc-subrow">
                      <td>
                        <b>{f.title ?? f.catalogKey}</b>
                        {f.title ? <span className="sp-row-s"> · {f.catalogKey}</span> : null}
                        {f.projectId != null ? (
                          <span className="sp-row-s"> · project #{f.projectId}</span>
                        ) : null}
                      </td>
                      <td>
                        {appL(f.programType)} <span className="sc-cap">· {f.variant}</span>
                      </td>
                      <td>
                        <Chip map={ESTAR_FILING_STATUS} k={f.status} />
                        {f.decision ? <span className="sp-row-s"> · {f.decision}</span> : null}
                      </td>
                      <td>{f.fdaTrackingNumber ?? '—'}</td>
                      <td>{reviewClock(f)}</td>
                      <td>
                        <button
                          type="button"
                          className="sc-trans-b"
                          title="Open the 510(k) surface — the device filing workspace"
                          onClick={() => onNav && onNav('device-510k')}
                        >
                          {I.right} Open 510(k) surface
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        </>
      )}

      {ws === 'planner' && sub && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Planner · {sub.title}</span>
            <span className="s">POST /:id/plan · GET /region-profiles</span>
          </div>
          <div className="pj-card-b">
            <div className="tl-spec-grid sc-spec">
              <div className="tl-spec-row">
                <span className="tl-spec-k">Region</span>
                <span className="tl-spec-v">{regL(sub.primaryRegion)}</span>
              </div>
              <div className="tl-spec-row">
                <span className="tl-spec-k">Application</span>
                <span className="tl-spec-v">{appL(sub.applicationType)}</span>
              </div>
              <div className="tl-spec-row">
                <span className="tl-spec-k">Client type</span>
                <span className="tl-spec-v sc-cap">{sub.clientType}</span>
              </div>
              <div className="tl-spec-row">
                <span className="tl-spec-k">Lifecycle stage</span>
                <span className="tl-spec-v sc-cap">{sub.lifecycleStage}</span>
              </div>
            </div>
            <div className="scaf-note sc-mt">
              AnA builds the sequence plan from the region profile — required modules, granularity,
              regional Module 1, and the validation profile for {regL(sub.primaryRegion)}.
            </div>
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() =>
                  onAsk(
                    `Plan the ${regL(sub.primaryRegion)} ${appL(sub.applicationType)} submission for ${sub.title} from the region profile.`
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
            <span className="s">GET /sequences/:seqId/leaves</span>
          </div>
          <div className="pj-card-b">
            <div className="scaf-note sc-mb">
              Each leaf carries a lifecycle operator (new / replace / append / delete). AnA classifies
              and extracts uploaded documents into the right leaf and traces provenance.
            </div>
            {/* Backend gap: the leaves list is a per-SEQUENCE read
                (GET /api/submissions/sequences/:seqId/leaves). This surface has no
                sequence selection yet, so there is no id to read against — show an
                honest empty rather than the kit's sample leaves. */}
            <EmptyState
              icon={I.layers}
              title="No eCTD leaves to show here yet"
              hint="The Builder tree loads a sequence's leaves once a sequence is selected. Open a sequence from the Sequences workspace, then classify and place its documents here."
            />
          </div>
        </div>
      )}

      {ws === 'sequences' && sub && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Sequences · {sub.title}</span>
            <span className="s">draft → assembling → validated → frozen → dispatched</span>
          </div>
          <div className="pj-card-b">
            {seqs.loading ? (
              <div className="scaf-note" style={{ padding: '18px 10px' }}>
                Loading sequences…
              </div>
            ) : seqs.error ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the sequences"
                hint="The submission core didn't return this submission's eCTD sequences. Retry, or check the service is reachable."
              />
            ) : seqs.empty ? (
              <>
                <EmptyState
                  icon={I.gitBranch}
                  title="No sequences yet"
                  hint="Create the first eCTD sequence (0000) to begin assembling this submission."
                />
                <div className="cm-pushbar sc-mt">
                  <button
                    type="button"
                    className="sp-primary sc-btn"
                    onClick={() =>
                      onAsk(
                        `Create the original eCTD sequence (0000) for the ${regL(sub.primaryRegion)} ${appL(sub.applicationType)} submission ${sub.title}.`
                      )
                    }
                  >
                    {I.sparkles} Start sequence 0000
                  </button>
                </div>
              </>
            ) : (
              <div className="sp-list">
                {seqs.rows.map((s) => (
                  <div key={s.id} className="sp-row">
                    <span className="sp-tag2">{s.sequenceNumber}</span>
                    <span className="sp-row-b">
                      <span className="sp-row-t sc-cap">{s.type} sequence</span>
                      <span className="sp-row-s">
                        {regL(s.region)}
                        {s.validationStatus ? (
                          <>
                            {' '}
                            {I.dot} validation {s.validationStatus}
                          </>
                        ) : null}
                      </span>
                    </span>
                    <Chip map={SC_SEQ_STATUS} k={s.status} />
                    <span className="sc-trans">
                      {/* MOCK-ACTION (flagged): the kit transitioned status with an
                          optimistic local write + a toast claiming POST /transition.
                          A real endpoint exists (POST /api/submissions/sequences/
                          :seqId/transition — and governed freeze/dispatch) but wiring
                          the write + refetch is the actions pass; hand off to AnA
                          rather than fabricate a persisted state change. */}
                      {(SC_TRANSITIONS[s.status] ?? []).map((to) => (
                        <button
                          key={to}
                          type="button"
                          className="sc-trans-b"
                          onClick={() =>
                            onAsk(
                              `Transition sequence ${s.sequenceNumber} of ${sub.title} to ${SC_SEQ_STATUS[to]?.l ?? to}.`
                            )
                          }
                        >
                          {I.right} {SC_SEQ_STATUS[to]?.l ?? to}
                        </button>
                      ))}
                      {(SC_TRANSITIONS[s.status] ?? []).length === 0 && (
                        <span className="sp-q-s">terminal</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {ws === 'validation' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Validation · eValidator</span>
            <span className="s">POST /:id/validation/explain</span>
          </div>
          <div className="pj-card-b">
            {/* Backend gap: there is no load-time list read for eValidator findings
                in this display shape — findings are produced by an assemble/validate
                run (the dispatch-readiness gate exposes a COUNT, not this list). Show
                an honest empty rather than the kit's sample findings. */}
            <EmptyState
              icon={I.fileText}
              title="No validation findings loaded yet"
              hint="eValidator findings surface after a sequence is assembled and validated. Ask AnA to re-validate a sequence — each finding is then explained with its rule and location."
            />
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() =>
                  onAsk('Re-run the eCTD validator on the current sequence and explain each finding.')
                }
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
              {/* MOCK-ACTION (flagged): the kit flipped a local `ran` flag and showed
                  fixture findings. A real endpoint exists (POST shadow-review + GET
                  findings, keyed on a sequence); hand off to AnA rather than fabricate
                  a completed run. */}
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() =>
                  onAsk(`Run a ${lensL} shadow review on the current sequence and list the findings.`)
                }
              >
                {I.sparkles} Run shadow review
              </button>
            </div>
            <div className="scaf-note">
              Run a review to see how a {lensL} reviewer would read this sequence before you file —
              pre-empting information requests. Findings appear once AnA completes the run.
            </div>
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
              What the {regL(sub.primaryRegion)} sequence is missing to file the same program in other
              regions.
            </div>
            {/* Backend gap: cross-region gaps are a POST/AI computation, not a
                load-time list read — show an honest empty + CTA rather than the
                kit's sample gaps. */}
            <EmptyState
              icon={I.gitBranch}
              title="No cross-region gap analysis yet"
              hint="Run a gap analysis to compare this sequence against another region's requirements — reusable content vs. the gaps you'd need to close to file there."
            />
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sp-primary sc-btn"
                onClick={() =>
                  onAsk(
                    `Run a cross-region gap analysis for ${sub.title}: what the ${regL(sub.primaryRegion)} sequence is missing to file in the EU and Japan.`
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
              <div className="scaf-note">
                Dispatch is governed: a sequence must be Validated → Frozen (Part 11 e-signature) and
                clear the deterministic dispatch gate before it can be dispatched, and{' '}
                {sub.primaryRegion === 'fda'
                  ? 'transmission through the FDA ESG gateway'
                  : 'export / regional transmission'}{' '}
                only runs when the region gateway is configured. AnA runs the QC and walks the gates
                with you.
              </div>
              <div className="sc-disp-actions">
                {/* MOCK-ACTIONS (flagged): the kit fired toasts claiming a QC check /
                    gateway transmit. Real endpoints exist (dispatch-qc, governed
                    freeze/dispatch/transmit) but each is gated on e-signature + the
                    server dispatch gate — hand off to AnA rather than fake the event. */}
                <button
                  type="button"
                  className="sp-primary sc-btn"
                  onClick={() =>
                    onAsk(`Run the dispatch QC gate for the current ${regL(sub.primaryRegion)} sequence of ${sub.title}.`)
                  }
                >
                  {I.shieldCheck} Run dispatch QC
                </button>
                <button
                  type="button"
                  className={`sp-primary sc-btn ${sub.primaryRegion === 'fda' ? '' : 'sc-btn-neutral'}`}
                  onClick={() =>
                    onAsk(
                      sub.primaryRegion === 'fda'
                        ? `Freeze and dispatch the current sequence of ${sub.title} through the FDA ESG gateway (governed — e-signature required).`
                        : `Freeze and export the current sequence of ${sub.title} as the ${regL(sub.primaryRegion)} regional package (governed — e-signature required).`
                    )
                  }
                >
                  {I.rocket} {sub.primaryRegion === 'fda' ? 'Send via ESG gateway' : 'Export package'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
