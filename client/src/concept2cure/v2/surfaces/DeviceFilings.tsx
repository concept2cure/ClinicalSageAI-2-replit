/**
 * Submission Center's device filings: the tracked eSTAR filings
 * (estar_submissions), the one device-filing store (D2, fold F5 item 1,
 * 2026-10-30; decision P-61 item 1;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
 *
 * The card and its helpers moved here from SubmissionCenter.tsx unchanged,
 * which keeps reading the list and the one assembly verdict (its AnA context
 * states both). Added with the fold, carrying what the retired device-submission
 * screen (mdx/workbench/Workbench.tsx) did over c2c_submission_packages:
 *   - a status filter, offering only the statuses the list holds, with counts;
 *   - each draft filing's gate, from the filing's own readiness: GET
 *     /api/510k/estar/submissions/:id/readiness, the assessment
 *     EstarFilingPanel shows (assessEstarFilingReadiness). A blocker belongs to
 *     the filing and closes when it is fixed (P-61 item 2). "Can file now" is
 *     the assessment's own word; a filing with no project is not assessed and
 *     says why; a failed read is an error with a retry, never a verdict. A
 *     filing past draft is not asked: readiness is assessed before filing.
 * Each filing's history is under its record (TrackedFilingHistory.tsx).
 *
 * @module client/src/concept2cure/v2/surfaces/DeviceFilings
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState, hasKeys, useLiveData } from '../dataConnect';
import type { ToneMap } from '../fixtures/submission';
import { Chip } from './SubmissionSeqWorkspaces';

/* ── Device filings (eSTAR tracker) ─────────────────────────────────────────
   eSTAR is NOT eCTD: a tracked device filing never becomes an ectd_sequences
   row. The device journey is read here from its own canonical tracker,
   GET /api/510k/estar/submissions (server/routes/510k-estar-routes.ts →
   estar_submissions), and rendered as its own Portfolio section. Only columns
   the backend returns are typed; nullable columns render null-safe — never
   fabricated. ── */

// GET /api/510k/estar/submissions → { submissions: estar_submissions rows }.
export interface DeviceFilingRow {
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
export const ESTAR_FILING_STATUS: Record<string, ToneMap> = {
  draft: { l: 'Draft', t: 'idle' },
  filed: { l: 'Filed', t: 'ai' },
  under_review: { l: 'Under review', t: 'ai' },
  additional_info: { l: 'Additional info', t: 'warn' },
  decision: { l: 'Decision', t: 'ok' },
  withdrawn: { l: 'Withdrawn', t: 'idle' },
};

// POST /api/510k/estar/assemble → assembly verdict (device-assembly contract).
export interface AssemblyVerdictPayload {
  artifactKind: string; // official-estar | content-package-draft | none
  blockers?: string[];
  /** The section readiness the blockers were written from
   *  (assemble-device-submission.ts: `estar.summary`). */
  estar?: { summary?: { missingRequired?: unknown; undetermined?: unknown } };
}

// Honest labels for the assembly verdict's artifactKind enum.
const ARTIFACT_KIND_LABEL: Record<string, string> = {
  'official-estar': 'official eSTAR producible',
  'content-package-draft': 'draft content package only — not submittable',
  none: 'nothing assemblable yet',
};

export type AssemblyVerdictState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; artifactKind: string; missingRequired: number; undetermined: number; otherBlockers: number };

/* ── What the blocker list counts ───────────────────────────────────────────
   `blockers` is a list of SENTENCES, not of blockers: the engine writes every
   missing required eSTAR section into ONE sentence ("11 required eSTAR
   section(s) missing: …") and every section of undetermined applicability into
   another. The caption printed `blockers.length`, so an org with 11 required
   sections missing and 7 undetermined read "· 2 blockers". The section counts
   are read from the summary those sentences are written from; each remaining
   entry (a template or market blocker) is one blocker. */
export function readAssemblyVerdict(p: AssemblyVerdictPayload): AssemblyVerdictState {
  const blockers = Array.isArray(p.blockers) ? p.blockers : [];
  const missingList = p.estar?.summary?.missingRequired;
  const undeterminedList = p.estar?.summary?.undetermined;
  const missingRequired = Array.isArray(missingList) ? missingList.length : 0;
  const undetermined = Array.isArray(undeterminedList) ? undeterminedList.length : 0;
  const sectionSentences = (missingRequired > 0 ? 1 : 0) + (undetermined > 0 ? 1 : 0);
  return {
    state: 'ready',
    artifactKind: p.artifactKind,
    missingRequired,
    undetermined,
    otherBlockers: Math.max(0, blockers.length - sectionSentences),
  };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The device-section header line: the org-wide assembly verdict (one call). */
function assemblyReadinessLine(v: AssemblyVerdictState): string {
  // The verdict is fetched for ONE pathway/variant (510(k), device) while the
  // card lists every eSTAR program type, device and IVD. The caption used to
  // read "Assembly readiness: … · 0 blockers" over all of them; it now names
  // the scope the call actually covers.
  if (v.state === 'loading') return 'Checking 510(k) device assembly readiness…';
  if (v.state === 'error') return '510(k) device assembly readiness unavailable right now';
  const kind = ARTIFACT_KIND_LABEL[v.artifactKind] ?? v.artifactKind;
  const parts: string[] = [];
  if (v.missingRequired > 0) parts.push(`${plural(v.missingRequired, 'required section', 'required sections')} missing`);
  if (v.undetermined > 0) parts.push(`applicability of ${plural(v.undetermined, 'section', 'sections')} not established`);
  if (v.otherBlockers > 0 || parts.length === 0) {
    parts.push(parts.length === 0
      ? plural(v.otherBlockers, 'blocker', 'blockers')
      : plural(v.otherBlockers, 'other blocker', 'other blockers'));
  }
  return `510(k) device assembly readiness: ${kind} · ${parts.join(' · ')} (other pathways not assessed here)`;
}

/** Review-clock cell: only states the tracker actually knows. */
function reviewClock(f: DeviceFilingRow): string {
  if (f.decisionDueAt) {
    const d = new Date(f.decisionDueAt);
    if (!Number.isNaN(d.getTime())) return `Decision due ${d.toLocaleDateString()}`;
  }
  return f.filedAt ? 'No review clock' : 'Not filed yet';
}


/* eSTAR program types are not eCTD application types: SC_APPTYPES has no
   q_sub / ide / 513g, so the device table printed the raw DB token. */
const DEVICE_PROGRAM_LABEL: Record<string, string> = {
  '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', q_sub: 'Q-Submission', ide: 'IDE', '513g': '513(g)',
};

/* ── Each draft filing's gate ────────────────────────────────────────────── */

/** GET /api/510k/estar/submissions/:id/readiness (510k-estar-routes.ts). */
type FilingGatePayload =
  | { assessed: true; filingId: string; programId: string; readiness: { canFileNow?: unknown; blockers?: unknown } }
  | { assessed: false; filingId: string; reason?: string; message?: string };

const NOT_ASSESSED: Record<string, string> = {
  no_project: 'Not assessed: tracked under no project. Readiness is read from a project\'s own authored content.',
  no_program: 'Not assessed: its project anchors no device program.',
};

function filingName(f: DeviceFilingRow): string {
  return f.title ?? f.catalogKey;
}

/** The gate of one draft filing, read from its own readiness; nothing assumed. */
function FilingGate({ filing }: { filing: DeviceFilingRow }) {
  const [attempt, setAttempt] = React.useState(0);
  const path = `/api/510k/estar/submissions/${encodeURIComponent(filing.id)}/readiness`;
  const gate = useLiveData<FilingGatePayload>(path, [path, attempt], hasKeys('assessed'));
  if (gate.loading) return <span className="sp-row-s" role="status">Reading readiness…</span>;
  if (gate.error || !gate.data) {
    return (
      <span>
        <span className="sp-row-s">Couldn&apos;t read this filing&apos;s readiness</span>{' '}
        <button type="button" className="sc-trans-b" aria-label={`Retry readiness for ${filingName(filing)}`}
          onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </button>
      </span>
    );
  }
  const data = gate.data;
  if (data.assessed !== true) {
    return <span className="sp-row-s">{NOT_ASSESSED[data.reason ?? ''] ?? 'Not assessed.'}</span>;
  }
  const blockers = Array.isArray(data.readiness?.blockers)
    ? data.readiness.blockers.filter((b): b is string => typeof b === 'string')
    : [];
  if (data.readiness?.canFileNow === true && blockers.length === 0) {
    return <span className="rd-chip tone-ok">Can file now</span>;
  }
  return (
    <div>
      <span className="rd-chip tone-warn">{`Blocked · ${blockers.length} ${blockers.length === 1 ? 'blocker' : 'blockers'}`}</span>
      {blockers.length > 0 && (
        <ul className="sp-row-s" aria-label={`Blockers of ${filingName(filing)}`}>
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

/** The gate cell: a draft is assessed; a filing past draft is not asked. */
function GateCell({ filing }: { filing: DeviceFilingRow }) {
  if (filing.status === 'draft') return <FilingGate filing={filing} />;
  if (filing.status === 'withdrawn') return <span className="sp-row-s">Withdrawn: not assessed</span>;
  return <span className="sp-row-s">Filed: readiness is assessed before filing</span>;
}

/* ── The card ────────────────────────────────────────────────────────────── */

export interface DeviceFilingsCardProps {
  res: { loading: boolean; error?: string };
  filings: DeviceFilingRow[];
  assembly: AssemblyVerdictState;
  /** The 510(k) surface's label and whether this release can open it (F16). */
  pathway: { available: boolean; label: string };
  onOpenFiling: (f: DeviceFilingRow) => void;
  onOpenPathway: () => void;
}

/** One tracked filing's row: its record, its gate, and the doors to it. */
function DeviceFilingTableRow({ f, pathway, onOpenFiling, onOpenPathway }: Pick<DeviceFilingsCardProps, 'pathway' | 'onOpenFiling' | 'onOpenPathway'> & { f: DeviceFilingRow }) {
  return (
    <tr className="sc-subrow">
      <td>
        <b>{f.title ?? f.catalogKey}</b>
        {f.title ? <span className="sp-row-s"> · {f.catalogKey}</span> : null}
      </td>
      <td>
        {DEVICE_PROGRAM_LABEL[f.programType] ?? f.programType} <span className="sc-cap">· {f.variant}</span>
      </td>
      <td>
        <Chip map={ESTAR_FILING_STATUS} k={f.status} />
        {f.decision ? <span className="sp-row-s"> · {f.decision}</span> : null}
      </td>
      <td>{f.fdaTrackingNumber ?? '—'}</td>
      <td>{reviewClock(f)}</td>
      <td><GateCell filing={f} /></td>
      <td>
        <button
          type="button"
          className="sc-trans-b"
          aria-label={`Open tracked filing ${f.title ?? f.catalogKey}`}
          onClick={() => onOpenFiling(f)}
        >
          Open recorded filing
        </button>
        {/* Offered only where the 510(k) surface can be opened:
            outside this release it led to the locked panel
            (FILING_SPINE.md F16). */}
        {pathway.available && (
          <button
            type="button"
            className="sc-trans-b"
            title="Open the 510(k) surface — the device filing workspace"
            onClick={onOpenPathway}
          >
            {I.right} Open 510(k) surface
          </button>
        )}
      </td>
    </tr>
  );
}

export function DeviceFilingsCard({ res, filings, assembly, pathway, onOpenFiling, onOpenPathway }: DeviceFilingsCardProps) {
  const [status, setStatus] = React.useState<string>('all');
  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filings) m.set(f.status, (m.get(f.status) ?? 0) + 1);
    return m;
  }, [filings]);
  /* A status the list no longer holds is no filter: it would show an empty
     table over filings that exist. */
  const active = status !== 'all' && counts.has(status) ? status : 'all';
  const shown = active === 'all' ? filings : filings.filter((f) => f.status === active);
  const empty = !res.loading && !res.error && filings.length === 0;

  /* Device filings — the eSTAR tracker's journey, read-only here.
     eSTAR is not eCTD: these rows live in estar_submissions and never
     masquerade as sequences. The header line is the org's one-call
     device-assembly verdict (artifact kind + blocker count). */
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Device filings · eSTAR</span>
        <span className="s">{assemblyReadinessLine(assembly)}</span>
      </div>
      {filings.length > 0 && (
        <div className="pj-card-b">
          <label className="sp-row-s">
            Device filing status{' '}
            <select aria-label="Device filing status" value={active} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">{`All statuses (${filings.length})`}</option>
              {[...counts.entries()].map(([k, n]) => (
                <option key={k} value={k}>{`${ESTAR_FILING_STATUS[k]?.l ?? k} (${n})`}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="pj-card-b pj-card-b-flush">
        {res.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
            Loading device filings…
          </div>
        ) : res.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the device filings"
            hint="The eSTAR filing tracker didn't respond. These are your organization's tracked device filings — sign in and retry, or check the service is reachable."
          />
        ) : empty ? (
          <EmptyState
            icon={I.fileText}
            title="No device filings tracked yet"
            hint={pathway.available
              ? "Start tracking an eSTAR filing (510(k), De Novo, PMA, Q-Sub…) from the 510(k) surface's filing panel — its status and review clock appear here."
              /* The surface it names is not in this release (F16: no dead ends). */
              : `Device filings are tracked from ${pathway.label}, which is not part of this release.`}
          />
        ) : (
          <table className="ub-inv">
            <thead>
              <tr>
                <th>Filing</th>
                <th>Filing type</th>
                <th>Status</th>
                <th>FDA tracking</th>
                <th>Review clock</th>
                <th>Readiness</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <DeviceFilingTableRow key={f.id} f={f} pathway={pathway} onOpenFiling={onOpenFiling} onOpenPathway={onOpenPathway} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
