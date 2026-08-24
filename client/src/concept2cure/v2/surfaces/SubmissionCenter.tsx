/**
 * Submission Center — kit app/submission-center.jsx ported (registry id
 * `submission-center`, contract-ready).
 *
 * Real-data standard (no mock in product): the 8 workspaces are scaffolded from
 * the REAL contract SUBMISSION_WORKSPACES (@shared/types/submission-ui). The
 * portfolio list binds live to GET /api/submissions and the per-submission
 * sequences to GET /api/submissions/:id/sequences (both DB-backed via
 * submission-service) with a four-state render — loading → error → honest empty
 * → real. The Portfolio view additionally reads the DEVICE journey from the
 * eSTAR tracker (GET /api/510k/estar/submissions + one POST /assemble verdict
 * for the section header) — a separate spine from the eCTD core, because eSTAR
 * is not eCTD and a device filing is never forced into ectd_sequences.
 *
 * Per-sequence workspaces (SubmissionSeqWorkspaces.tsx) are REAL: a sequence
 * selector feeds Builder (GET/PUT leaves), Validation (dispatch-readiness
 * findings + AI explain), Shadow Review (runs + persisted findings),
 * Cross-region (gap computation off the real leaves) and Dispatch (the
 * server-computed gate + AI QC advisory). Sequence lifecycle transitions POST
 * the real /sequences/:seqId/transition endpoint and surface the server's
 * verdict verbatim. The irreversible transitions — freeze and dispatch — run
 * ONLY through the governed chain: the shared Part 11 EsignModal (re-auth) →
 * POST /api/c2c/actions/sign on the exact `ectd-sequence:<id>` target → the
 * governed freeze/dispatch endpoint with the returned signatureActionId. The
 * server enforces the e-signature AND the deterministic dispatch gate
 * atomically; this surface never simulates, bypasses, or pre-announces a
 * governed outcome. Every fixture presented as content, plus the SampleTag,
 * has been removed; only the canonical enum/label/state-machine maps
 * (SC_REGIONS / SC_APPTYPES / SC_SEQ_STATUS / SC_TRANSITIONS …) are kept —
 * real regulatory reference config, not sample data.
 */
import React from 'react';
import { SUBMISSION_WORKSPACES } from '@shared/types/submission-ui';
import { I } from '../icons';
import { usePublishSurfaceContext } from '../surfaceContext';
import { AnswerLead } from '../AnswerLead';
import { useLiveRows, useLiveData, hasKeys, liveMutateOrNull, EmptyState } from '../dataConnect';
import { EsignModal } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import {
  // Canonical enum / label / state-machine maps (mirror shared/types/
  // submission-constants + the server SEQUENCE_TRANSITIONS) — reference config,
  // NOT sample data, so they stay.
  SC_APPTYPES,
  SC_REGIONS,
  SC_SEQ_STATUS,
  SC_TRANSITIONS,
  type ToneMap,
} from '../fixtures/submission';
import {
  BuilderWorkspace,
  Chip,
  CrossRegionWorkspace,
  DispatchWorkspace,
  SeqPicker,
  ShadowReviewWorkspace,
  ValidationWorkspace,
  VerdictNote,
  mutateVerbatim,
  type Notice,
  type SeqRow,
} from './SubmissionSeqWorkspaces';
import '../styles/submission-v2.css';
import { C2CForm } from '../C2CForm';

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

// (SeqRow — the `ectd_sequences` display row — now lives in
// SubmissionSeqWorkspaces.tsx, shared with the per-sequence workspaces.)

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

// (Chip is imported from SubmissionSeqWorkspaces — one implementation.)

/** The workspaces that operate on ONE selected sequence (fed by SeqPicker). */
const PER_SEQ_WS = new Set(['builder', 'validation', 'shadow-review', 'cross-region', 'dispatch']);

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

  // GET /api/submissions — real DB rows, honest empty, honest error (no fixture).
  const [subsBump, setSubsBump] = React.useState(0);
  const subs = useLiveRows<SubRow>('/api/submissions', ['/api/submissions', subsBump]);
  /* The org's programmes, so the required projectId is PICKED rather than typed
     as a uuid — createSubmissionSchema takes a uuid and a customer does not
     have one to hand. */
  const programmes = useLiveRows<{ id: string; title: string; code: string }>('/api/c2c/projects');
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
  // re-render loop. `seqBump` refetches after a server-confirmed transition so
  // the rendered status always comes from the server, never an optimistic guess.
  const [seqBump, setSeqBump] = React.useState(0);
  const seqPath = sub ? `/api/submissions/${sub.id}/sequences` : null;
  const seqs = useLiveRows<SeqRow>(seqPath, [seqPath, seqBump]);

  // The selected working sequence — the selector feeding Builder / Validation /
  // Shadow Review / Cross-region / Dispatch. Defaults to the first real row.
  const [selSeq, setSelSeq] = React.useState<number | null>(null);
  const seq = seqs.rows.find((r) => r.id === selSeq) ?? seqs.rows[0] ?? null;

  // Server-verdict line (transitions, governed outcomes) — verbatim, role=status.
  const [notice, setNotice] = React.useState<Notice | null>(null);
  // The in-flight governed flow (freeze | dispatch) driving the EsignModal.
  const [flow, setFlow] = React.useState<{ seq: SeqRow; kind: 'freeze' | 'dispatch' } | null>(null);
  // Sequence id with a transition POST in flight (buttons disable, no double-fire).
  const [acting, setActing] = React.useState<number | null>(null);

  // Changing submission invalidates the sequence selection and any verdict.
  const subId = sub?.id;
  React.useEffect(() => {
    setSelSeq(null);
    setNotice(null);
  }, [subId]);

  /**
   * Create a submission — POST /api/submissions.
   *
   * "+ New submission" is the ONLY create control on this surface, and on an
   * empty tenant the empty state beside it says "Create your first
   * submission". It did `onAsk('Start a new submission — create the canonical
   * submission record.')`: a sentence into the chat rail. No record was
   * created, so the one route into the Submission Center was closed and the
   * empty state was instructing the user to press a button that could not do
   * what it said.
   *
   * The route and its schema existed the whole time — createSubmissionSchema
   * takes { type, projectId, targetAgency, targetDate? } — so this is a form
   * over what the server already requires, with the project picked from the
   * org's own programmes rather than typed as a uuid.
   */
  const [newOpen, setNewOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const createSubmission = async (v: Record<string, string>) => {
    if (creating) return;
    const projectId = (v.projectId ?? '').trim();
    if (!projectId) {
      setNotice({ tone: 'err', text: 'Pick the programme this submission belongs to.' });
      return;
    }
    setCreating(true);
    setNotice(null);
    const r = await mutateVerbatim<SubRow>('POST', '/api/submissions', {
      type: v.type,
      projectId,
      targetAgency: (v.targetAgency ?? '').trim(),
      targetDate: v.targetDate || undefined,
    });
    setCreating(false);
    if (r.data && (r.data as { id?: unknown }).id != null) {
      setNewOpen(false);
      // Re-read rather than appending a client-built row: what appears is the
      // record the server created.
      setSubsBump((b) => b + 1);
      setNotice({ tone: 'ok', text: `Submission created — ${v.type} for ${v.targetAgency}.` });
    } else {
      setNotice({ tone: 'err', text: `Submission not created — ${r.error ?? 'the request failed'}.` });
    }
  };

  /**
   * Create the original eCTD sequence — POST /api/submissions/:id/sequences.
   *
   * The empty state beside this button TELLS the user to create sequence 0000
   * to begin assembling, and the button asked the assistant to do it: no
   * sequence row was ever written, so the workspace it gates could not be
   * entered.
   *
   * Every field the schema wants is already on the submission being viewed —
   * its region, and 'original' for the first sequence — so there is nothing to
   * ask the user for. The verdict is the server's, verbatim.
   */
  const [creatingSeq, setCreatingSeq] = React.useState(false);
  const startFirstSequence = async (target: SubRow) => {
    if (creatingSeq) return;
    setCreatingSeq(true);
    setNotice(null);
    const r = await mutateVerbatim<SeqRow>('POST', `/api/submissions/${target.id}/sequences`, {
      region: target.primaryRegion,
      sequenceNumber: '0000',
      type: 'original',
    });
    setCreatingSeq(false);
    if (r.data && (r.data as { id?: unknown }).id != null) {
      setSeqBump((b) => b + 1);
      setNotice({ tone: 'ok', text: `Sequence 0000 created for ${target.title} — server-confirmed.` });
    } else {
      setNotice({ tone: 'err', text: `Sequence 0000 not created — ${r.error ?? 'the request failed'}.` });
    }
  };

  /** Non-governed lifecycle transition — the REAL endpoint, verdict verbatim.
   *  The server refuses frozen/dispatched here (GOVERNED_REQUIRED); those two
   *  targets never reach this function — they open the e-sign chain instead. */
  const doTransition = async (s: SeqRow, to: string) => {
    if (acting != null) return;
    setActing(s.id);
    const r = await mutateVerbatim<SeqRow>('POST', `/api/submissions/sequences/${s.id}/transition`, {
      status: to,
    });
    setActing(null);
    if (r.data && typeof r.data.status === 'string') {
      setNotice({
        tone: 'ok',
        text: `Sequence ${s.sequenceNumber} → ${SC_SEQ_STATUS[r.data.status]?.l ?? r.data.status} — server-confirmed.`,
      });
      setSeqBump((b) => b + 1);
    } else {
      // The server's refusal, verbatim (e.g. an INVALID_STATE lifecycle verdict).
      setNotice({ tone: 'err', text: `Transition refused — ${r.error ?? 'the request failed'}.` });
    }
  };

  /** The governed freeze/dispatch chain, run from inside the EsignModal AFTER
   *  its §11.200 re-authentication succeeds. Two real server steps:
   *    1. POST /api/c2c/actions/sign on the exact `ectd-sequence:<id>` target —
   *       the server re-verifies the forwarded credentials, enforces separation
   *       of duties, and writes the sha256-chained ledger row.
   *    2. POST the governed freeze/dispatch endpoint with the returned
   *       signatureActionId — the server verifies the signature governs THIS
   *       sequence and that the deterministic dispatch gate is clear, atomically.
   *  Any failure throws with the server's words; the modal shows it inline and
   *  no success is fabricated. */
  const runGoverned = async (
    f: { seq: SeqRow; kind: 'freeze' | 'dispatch' },
    input: { meaning: EsigMeaning; reason: string; password: string; totp?: string },
  ) => {
    const sign = await mutateVerbatim<{ actionId?: string; sha256Chain?: string }>(
      'POST',
      '/api/c2c/actions/sign',
      {
        target: `ectd-sequence:${f.seq.id}`,
        reason: input.reason,
        payload: { intent: f.kind, meaning: input.meaning },
        reauth: { password: input.password, ...(input.totp ? { totp: input.totp } : {}) },
      },
    );
    if (sign.error || !sign.data?.actionId) {
      throw new Error(
        `The e-signature was not recorded — ${sign.error ?? 'no actionId returned'}. Nothing was ${
          f.kind === 'freeze' ? 'frozen' : 'dispatched'
        }.`,
      );
    }
    const done = await mutateVerbatim<SeqRow>(
      'POST',
      `/api/submissions/sequences/${f.seq.id}/${f.kind}`,
      { signatureActionId: sign.data.actionId },
    );
    if (done.error || !done.data || typeof done.data.status !== 'string') {
      throw new Error(done.error ?? `The ${f.kind} was not applied.`);
    }
    setSeqBump((b) => b + 1);
    setNotice({
      tone: 'ok',
      text: `Sequence ${f.seq.sequenceNumber} is now ${
        SC_SEQ_STATUS[done.data.status]?.l ?? done.data.status
      } — server-confirmed under signature ${sign.data.actionId}.`,
    });
    return {
      meaning: input.meaning,
      reason: input.reason,
      signedAt: new Date().toISOString(),
      hash: sign.data.sha256Chain,
    };
  };


  const appL = (v: string) => SC_APPTYPES.find((a) => a.v === v)?.l ?? v;
  const regL = (v: string) => SC_REGIONS.find((a) => a.v === v)?.l ?? v;

  /* What AnA can see of this screen.
     The Submission Center is eight workspaces over one selected submission and
     one selected sequence, and every question a user asks here is about THAT
     pair — "is this ready to dispatch?", "what is blocking 0002?". Until now she
     was told only that the surface was called "submission-center", so she could
     not name the submission the user was looking at, let alone its sequences.

     A FAILED read publishes the failure. `list` and `seqs.rows` are both []
     when the read threw, and reporting "no submissions" over an outage would be
     a confident claim about a customer's filing portfolio that nobody made. */
  const anaContext = React.useMemo(() => {
    if (subs.loading) {
      return { summary: 'The submission portfolio is still loading; nothing on screen is final yet.' };
    }
    if (subs.error) {
      return {
        summary:
          'The submission portfolio could not be read, so this screen is showing no submissions ' +
          'because of a failure, not because there are none.',
        availableActions: ['Reload the Submission Center to retry the portfolio read'],
      };
    }
    const seqLine = seqs.loading
      ? 'its sequences are still loading'
      : seqs.error
        ? 'its sequences could not be read'
        : `${seqs.rows.length} eCTD sequence(s) tracked`;
    return {
      summary:
        `Submission Center, "${SUBMISSION_WORKSPACES.find((w) => w.id === ws)?.label ?? ws}" workspace: ` +
        `${list.length} submission(s) in the portfolio` +
        (sub
          ? `, "${sub.title}" selected — a ${regL(sub.primaryRegion)} ${appL(sub.applicationType)} at the ` +
            `${sub.lifecycleStage} stage, ${seqLine}` +
            (seq ? `, working sequence ${seq.sequenceNumber} (${seq.status})` : '')
          : ', none selected'),
      facts: {
        workspace: ws,
        totalSubmissions: list.length,
        selectedSubmission: sub
          ? {
              id: sub.id, title: sub.title, product: sub.productName,
              applicationType: sub.applicationType, clientType: sub.clientType,
              primaryRegion: sub.primaryRegion, status: sub.status,
              lifecycleStage: sub.lifecycleStage,
            }
          : null,
        sequences: seqs.loading || seqs.error
          ? null
          : seqs.rows.slice(0, 12).map((r) => ({
              id: r.id, number: r.sequenceNumber, type: r.type,
              status: r.status, region: r.region, validation: r.validationStatus,
            })),
        sequencesUnavailable: seqs.error ? 'the sequence read failed' : null,
        workingSequence: seq
          ? { id: seq.id, number: seq.sequenceNumber, status: seq.status, validation: seq.validationStatus }
          : null,
        deviceFilings: deviceRes.loading
          ? null
          : deviceRes.error
            ? null
            : deviceFilings.length,
        deviceFilingsUnavailable: deviceRes.error ? 'the eSTAR tracker read failed' : null,
        deviceAssemblyVerdict:
          assembly.state === 'ready'
            ? { artifactKind: assembly.artifactKind, blockerCount: assembly.blockerCount }
            : assembly.state === 'error'
              ? 'unavailable'
              : 'loading',
        lastServerNotice: notice ? { tone: notice.tone, text: notice.text } : null,
      },
      availableActions: [
        'Switch workspace — planner, sequences, builder, validation, shadow review, cross-region, dispatch',
        'Select a different submission from the portfolio picker',
        'Select the working sequence the build and validation workspaces act on',
        'Move a sequence through its non-governed lifecycle transitions',
        'Freeze or dispatch a sequence (each requires a Part 11 e-signature and passes the dispatch gate)',
        'Open a tracked eSTAR device filing in the 510(k) surface',
      ],
    };
  }, [
    subs.loading, subs.error, list, sub, ws, seqs.loading, seqs.error, seqs.rows, seq,
    deviceRes.loading, deviceRes.error, deviceFilings.length, assembly, notice,
  ]);
  usePublishSurfaceContext('submission-center', anaContext);

  return (
    <div className="sp sc-page">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Submission</div>
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

      {/* The latest server verdict (transition / governed outcome) — verbatim. */}
      <VerdictNote notice={notice} />

      {newOpen && (
        <C2CForm
          config={{
            eyebrow: 'Submission',
            title: 'Create a submission',
            sub: 'The canonical submission record. Its sequences, validation profile and regional Module 1 are derived from the type and agency chosen here.',
            submitLabel: creating ? 'Creating…' : 'Create submission',
            fields: [
              {
                key: 'type', label: 'Submission type', type: 'select',
                // The server's own enum — a type it would refuse is never offered.
                options: ['510k', 'PMA', 'De_Novo', 'IND', 'NDA', 'BLA'],
                default: 'IND', required: true, half: true,
              },
              {
                key: 'targetAgency', label: 'Target agency', type: 'text',
                placeholder: 'e.g. FDA CDER', required: true, half: true,
              },
              {
                key: 'projectId', label: 'Programme', type: 'select',
                options: programmes.rows.map((p) => ({
                  value: p.id,
                  label: [p.code, p.title].filter(Boolean).join(' · ') || p.id,
                })),
                required: true,
              },
              { key: 'targetDate', label: 'Target date (optional)', type: 'date', half: true },
            ],
          }}
          onCancel={() => setNewOpen(false)}
          onSubmit={createSubmission}
        />
      )}

      {ws === 'portfolio' && (
        <>
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Submissions</span>
            <button
              type="button"
              className="pj-card-h-go"
              onClick={() => setNewOpen(true)}
              disabled={creating || programmes.rows.length === 0}
              title={
                programmes.rows.length === 0
                  ? 'A submission belongs to a programme, and this organization has none yet. Create one in Projects first.'
                  : undefined
              }
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
            <span className="s">planning · region profiles</span>
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

      {/* Builder / Validation / Shadow review / Cross-region / Dispatch — the
          per-sequence workspaces. One selector (SeqPicker) chooses the working
          sequence; each workspace then reads/writes the REAL endpoints for it. */}
      {PER_SEQ_WS.has(ws) && !sub && !subs.loading && (
        <EmptyState
          icon={I.fileText}
          title="No submission selected"
          hint="Create or select a submission in the Portfolio workspace — these workspaces operate on one of its sequences."
        />
      )}
      {PER_SEQ_WS.has(ws) && sub && (
        <>
          <SeqPicker
            loading={seqs.loading}
            error={seqs.error}
            rows={seqs.rows}
            selId={seq?.id ?? null}
            onSel={setSelSeq}
          />
          {!seqs.loading && !seqs.error && seq && (
            <>
              {ws === 'builder' && <BuilderWorkspace key={seq.id} seq={seq} />}
              {ws === 'validation' && <ValidationWorkspace key={seq.id} sub={sub} seq={seq} />}
              {ws === 'shadow-review' && <ShadowReviewWorkspace key={seq.id} seq={seq} />}
              {ws === 'cross-region' && <CrossRegionWorkspace key={seq.id} sub={sub} seq={seq} />}
              {ws === 'dispatch' && (
                <DispatchWorkspace
                  key={`${seq.id}:${seq.status}`}
                  sub={sub}
                  seq={seq}
                  onGoverned={(s, kind) => setFlow({ seq: s, kind })}
                />
              )}
            </>
          )}
        </>
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
                    onClick={() => void startFirstSequence(sub)}
                    disabled={creatingSeq}
                  >
                    {I.sparkles} {creatingSeq ? 'Creating…' : 'Start sequence 0000'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="scaf-note sc-mb">
                  Transitions POST the real lifecycle endpoint and the server&#39;s verdict is shown
                  verbatim. Freeze and Dispatch are irreversible — the generic endpoint refuses
                  them, so those two open the Part 11 e-signature chain instead. Selecting a row
                  sets the working sequence for the Builder, Validation, Shadow review,
                  Cross-region and Dispatch workspaces.
                </div>
                <div className="sp-list">
                  {seqs.rows.map((s) => (
                    <div
                      key={s.id}
                      className="sp-row sc-subrow"
                      data-cur={s.id === seq?.id || undefined}
                      onClick={() => setSelSeq(s.id)}
                    >
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
                        {(SC_TRANSITIONS[s.status] ?? []).map((to) => {
                          const governed = to === 'frozen' || to === 'dispatched';
                          return (
                            <button
                              key={to}
                              type="button"
                              className="sc-trans-b"
                              disabled={acting != null}
                              title={
                                governed
                                  ? 'Governed — Part 11 e-signature and a clear dispatch gate required'
                                  : 'POST /sequences/:seqId/transition — server-enforced lifecycle'
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelSeq(s.id);
                                if (governed) {
                                  setFlow({ seq: s, kind: to === 'frozen' ? 'freeze' : 'dispatch' });
                                } else {
                                  void doTransition(s, to);
                                }
                              }}
                            >
                              {governed ? I.lock : I.right} {SC_SEQ_STATUS[to]?.l ?? to}
                            </button>
                          );
                        })}
                        {(SC_TRANSITIONS[s.status] ?? []).length === 0 && (
                          <span className="sp-q-s">terminal</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* The governed freeze/dispatch chain — the shared Part 11 EsignModal
          (§11.50 meaning + reason, §11.100 identity, §11.200 re-auth) runs
          `runGoverned` only after re-authentication succeeds. Its failure path
          is the modal's inline alert with the server's words; its success path
          is the server-confirmed manifest. Never simulated, never bypassed. */}
      {flow && sub && (
        <EsignModal
          open
          action={flow.kind === 'freeze' ? 'Freeze sequence' : 'Dispatch sequence'}
          target={`Sequence ${flow.seq.sequenceNumber} · ${sub.title}`}
          targetMeta={`${regL(flow.seq.region)} · ectd-sequence:${flow.seq.id} · ${
            flow.kind === 'freeze'
              ? 'irreversible content lock'
              : 'records dispatch; wire transmission stays behind the governed transmit path'
          }`}
          defaultMeaning="release"
          onClose={() => setFlow(null)}
          onSign={(input) => runGoverned(flow, input)}
        />
      )}
    </div>
  );
}
