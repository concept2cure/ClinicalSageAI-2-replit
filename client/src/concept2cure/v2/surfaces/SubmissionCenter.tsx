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
import { useAuthUser } from '@/services/portal/authService';
import { SUBMISSION_WORKSPACES } from '@shared/types/submission-ui';
import { I } from '../icons';
import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { AnswerLead } from '../AnswerLead';
import { assessmentStateFor } from '../assessmentState';
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
// The status cell printed the raw enum ("submitted") while every other chip on
// the surface carries a label; an unknown value stays visible as itself.
const SUB_STATUS_LABEL: Record<string, string> = {
  planning: 'Planning', active: 'Active', submitted: 'Submitted', archived: 'Archived',
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
  // The verdict is fetched for ONE pathway/variant (510(k), device) while the
  // card lists every eSTAR program type, device and IVD. The caption used to
  // read "Assembly readiness: … · 0 blockers" over all of them; it now names
  // the scope the call actually covers.
  if (v.state === 'loading') return 'Checking 510(k) device assembly readiness…';
  if (v.state === 'error') return '510(k) device assembly readiness unavailable right now';
  const kind = ARTIFACT_KIND_LABEL[v.artifactKind] ?? v.artifactKind;
  return `510(k) device assembly readiness: ${kind} · ${v.blockerCount} blocker${v.blockerCount === 1 ? '' : 's'} (other pathways not assessed here)`;
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
  // The signer sees their own identity in the e-signature dialog (§11.50): the
  // name the platform will print on the signature, not a generic "You".
  const authUser = useAuthUser();
  const signerLabel = authUser?.displayName || authUser?.email || 'the authenticated user';

  // GET /api/submissions — real DB rows, honest empty, honest error (no fixture).
  const [subsBump, setSubsBump] = React.useState(0);
  const subs = useLiveRows<SubRow>('/api/submissions', ['/api/submissions', subsBump]);
  /* The org's programmes, so the required projectId is PICKED rather than typed
     as a uuid — createSubmissionSchema takes a uuid and a customer does not
     have one to hand. */
  const programmes = useLiveRows<{ id: string; title: string; code: string }>('/api/c2c/projects');
  const list = subs.rows;
  const sub = list.find((s) => s.id === selSub) ?? list[0];

  /* ── Which of the three things an empty `list` means ────────────────────────
     `subs.rows` is the SAME empty array while the read is in flight, when the
     read FAILED, and when this organization genuinely has no submissions — so
     `!sub` on its own cannot say which is true, and copy written off `!sub`
     states as fact something nobody established. The Portfolio table below
     already branches loading → error → empty → rows; the per-sequence gate
     further down did not. This is the one discriminator both now read.

     `assessmentRan: false` deliberately: a submission list is a RECORD of what
     exists, not the outcome of an evaluation, so zero rows is 'not-assessed'
     ("nothing is recorded") and never 'assessed-clear'. Nothing here is
     entitled to clearance vocabulary. ── */
  const subsState = assessmentStateFor(subs, {
    scopeExists: true,
    findingCount: list.length,
    assessmentRan: false,
  });

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

  /* The same discriminator for THIS submission's sequences, for the same reason:
     `seqs.rows.length === 0` is true in flight, on failure, and on a genuine
     zero-sequence submission, and only the third may be spoken about.
       'loading'                 → the read has not settled
       'unreadable'              → the read failed
       'assessed-with-findings'  → sequences came back
       'not-assessed'            → the read settled and none are recorded
     `assessmentRan: false` again: a sequence list is a record, and an empty one
     means nothing has been planned yet — which is exactly 'not-assessed'. */
  const seqState = assessmentStateFor(seqs, {
    scopeExists: Boolean(sub),
    findingCount: seqs.rows.length,
    assessmentRan: false,
  });

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
   * The route and its schema existed the whole time — the MOUNTED router's
   * createSubmissionSchema (routes/submissions.ts) takes { title,
   * productName?, applicationType, clientType, primaryRegion } — so this is a
   * form over what the server actually requires, with the programme picked
   * from the org's own list to supply the product identity the compile spine
   * links on. (An earlier body targeted a different, unmounted router's
   * schema; every submit answered 400 VALIDATION.)
   */
  const [newOpen, setNewOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const createSubmission = async (v: Record<string, string>) => {
    if (creating) return;
    const programme = programmes.rows.find((p) => p.id === (v.projectId ?? '').trim());
    if (!programme) {
      setNotice({ tone: 'err', text: 'Pick the programme this submission belongs to.' });
      return;
    }
    setCreating(true);
    setNotice(null);
    /* The LIVE schema of POST /api/submissions (routes/submissions.ts):
       { title, productName?, applicationType, clientType, primaryRegion }.
       The previous body ({ type, projectId, targetAgency, targetDate })
       belonged to a router that is NOT mounted at this path — every submit
       was a 400 VALIDATION, so this form had never created anything.
       productName carries the programme's identity on purpose: the eCTD
       compile spine links program ↔ submission by matching application type
       plus product/title, so this field is what makes the new submission
       compilable from the programme's Module 3. */
    const r = await mutateVerbatim<SubRow>('POST', '/api/submissions', {
      title: (v.title ?? '').trim(),
      productName: programme.title || programme.code || undefined,
      applicationType: v.applicationType,
      clientType: v.clientType,
      primaryRegion: v.primaryRegion,
    });
    setCreating(false);
    if (r.data && (r.data as { id?: unknown }).id != null) {
      setNewOpen(false);
      // Re-read rather than appending a client-built row: what appears is the
      // record the server created.
      setSubsBump((b) => b + 1);
      setNotice({
        tone: 'ok',
        text: `Submission created — ${SC_APPTYPES.find((x) => x.v === v.applicationType)?.l ?? v.applicationType} · ${SC_REGIONS.find((x) => x.v === v.primaryRegion)?.l ?? v.primaryRegion}.`,
      });
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
      } — signed by ${signerLabel} (${input.meaning}), server-confirmed under signature ${sign.data.actionId}.`,
    });
    return {
      meaning: input.meaning,
      reason: input.reason,
      signedAt: new Date().toISOString(),
      hash: sign.data.sha256Chain,
    };
  };

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     submissions.*; the bus alias-resolves that nav-target id onto this
     surface's own 'submission-center' registration). Every handler drives the
     SAME state the human's own controls drive (setWs / setSelSub / setSelSeq);
     names are resolved against the REAL portfolio and sequence rows with
     honest misses, never guesses. View state only: the governed chain
     (doTransition / runGoverned, freeze/dispatch e-sign) and the create paths
     stay human-operated and untouched. */
  /* One guard for all three: while the Part 11 e-sign dialog is open a person
     is mid-ceremony, and while a lifecycle transition POST is in flight the
     rows are about to change under any selection — AnA operating the center
     in either window would race a governed act. Honest refusal instead. */
  const busyGuard = () => {
    if (flow != null)
      return { ok: false as const, reason: 'An e-signature dialog is open — finish or cancel it first.' };
    if (acting != null)
      return { ok: false as const, reason: 'A sequence transition is in flight — wait for it to finish.' };
    return null;
  };
  useSurfaceActionHandlers('submission-center', {
    'submissions.set-workspace': (params) => {
      const guarded = busyGuard();
      if (guarded) return guarded;
      const target = (params.workspace ?? '').trim();
      const meta = SUBMISSION_WORKSPACES.find((w) => w.id === target);
      if (!meta) return { ok: false, reason: `No workspace named "${params.workspace}".` };
      // Not-ready, not failed: whether a per-sequence workspace has a
      // submission to operate on is unknowable until the portfolio lands. The
      // bus holds the directive and re-attempts on the ready signal below.
      if (subs.loading)
        return { ok: false, reason: 'The submission portfolio is still loading.', retry: true };
      if (PER_SEQ_WS.has(target) && !sub)
        return { ok: false, reason: 'No submission is selected — select one first.' };
      setWs(target);
      return { ok: true, detail: `Opened the ${meta.label} workspace` };
    },
    'submissions.select-submission': (params) => {
      const guarded = busyGuard();
      if (guarded) return guarded;
      const wanted = (params.submission ?? '').trim().toLowerCase();
      if (!wanted) return { ok: false, reason: 'No submission named.' };
      if (subs.loading)
        return { ok: false, reason: 'The submission portfolio is still loading.', retry: true };
      if (subs.error) return { ok: false, reason: 'The submission portfolio could not be read.' };
      // Resolved over the same `list` the portfolio picker renders: exact
      // title/product match first (case-insensitive), then unique containment.
      const exact = list.find(
        (s) => s.title.toLowerCase() === wanted || (s.productName ?? '').toLowerCase() === wanted,
      );
      const contains = exact
        ? []
        : list.filter(
            (s) =>
              s.title.toLowerCase().includes(wanted) ||
              (s.productName ?? '').toLowerCase().includes(wanted),
          );
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            contains.length > 1
              ? `"${params.submission}" matches ${contains.length} submissions — name one exactly.`
              : `No submission named "${params.submission}" in this portfolio.`,
        };
      }
      const already = match.id === sub?.id;
      setSelSub(match.id);
      // Changing submission runs the reset effect above (selSeq + notice
      // cleared); say so — and never claim a reset that re-selecting the
      // already-current submission skips.
      return {
        ok: true,
        detail: already
          ? `${match.title} is already the selected submission`
          : `Selected ${match.title} — the working sequence and any verdict notice were cleared`,
      };
    },
    'submissions.select-sequence': (params) => {
      const guarded = busyGuard();
      if (guarded) return guarded;
      const wanted = (params.sequence ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No sequence named.' };
      // The portfolio decides whether a submission is even selected; until it
      // lands, "no submission" would be a false refusal — hold instead.
      if (subs.loading)
        return { ok: false, reason: 'The submission portfolio is still loading.', retry: true };
      if (!sub) return { ok: false, reason: 'No submission is selected — select one first.' };
      if (seqs.loading)
        return { ok: false, reason: "This submission's sequences are still loading.", retry: true };
      if (seqs.error) return { ok: false, reason: "This submission's sequences could not be read." };
      if (seqs.rows.length === 0)
        return { ok: false, reason: 'This submission has no sequences yet.' };
      // Matched on the sequence number exactly as the list renders it ("0000").
      const match = seqs.rows.find((r) => r.sequenceNumber === wanted);
      if (!match) return { ok: false, reason: `No sequence "${params.sequence}" in ${sub.title}.` };
      setSelSeq(match.id);
      return { ok: true, detail: `Selected sequence ${match.sequenceNumber} as the working sequence` };
    },
  });
  /* The ready signal for the retry contract above: a held directive gets its
     re-attempt when the portfolio read settles AND again when the selected
     submission's sequence read settles — select-sequence legitimately waits
     through both reads in turn. */
  React.useEffect(() => {
    if (!subs.loading || !seqs.loading) notifySurfaceActionReady('submission-center');
  }, [subs.loading, seqs.loading]);

  const appL = (v: string) => SC_APPTYPES.find((a) => a.v === v)?.l ?? v;
  /* eSTAR program types are not eCTD application types: SC_APPTYPES has no
     q_sub / ide / 513g, so the device table printed the raw DB token. */
  const DEVICE_PROGRAM_LABEL: Record<string, string> = {
    '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', q_sub: 'Q-Submission', ide: 'IDE', '513g': '513(g)',
  };
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
            / v4.0, eSTAR, MDR/IVDR. Eight workspaces scaffolded from the submission contract.
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
          /* ── The lead's action used to branch on `seqs.rows.length` alone ────
             It read `seqs.rows.length ? 'Open the sequences' : 'Plan the
             submission'`, with the same expression choosing the destination —
             and `rows` is empty in flight, on a failed read, and on a genuine
             zero-sequence submission alike. So the reader could see the body
             copy two props above say "Loading this submission's sequences…" or
             "couldn't be loaded" while the button directly below offered to plan
             the submission from zero, and clicking it opened the Planner: the
             right destination only when zero is the KNOWN count, not the unknown
             one. The Planner is now offered from 'not-assessed' only — a settled
             read with no sequences recorded. While the count is unknown the
             button names the workspace it opens and claims nothing about what is
             in it; that workspace reports the loading or failed read itself. ── */
          action={
            seqState === 'not-assessed'
              ? { label: 'Plan the submission', onClick: () => setWs('planner') }
              : seqState === 'assessed-with-findings'
                ? { label: 'Open the sequences', onClick: () => setWs('sequences') }
                : { label: 'Open the Sequences workspace', onClick: () => setWs('sequences') }
          }
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
                key: 'title', label: 'Title', type: 'text',
                placeholder: 'e.g. BX-701 — Initial IND', required: true,
              },
              {
                key: 'applicationType', label: 'Application type', type: 'select',
                // The canonical vocabulary the rest of this surface renders —
                // including the non-US applications (MAA, CTA) a global team
                // opens as its second market.
                options: SC_APPTYPES.map((a) => ({ value: a.v, label: a.l })),
                default: 'ind', required: true, half: true,
              },
              {
                key: 'primaryRegion', label: 'Primary region', type: 'select',
                options: SC_REGIONS.map((r0) => ({ value: r0.v, label: r0.l })),
                default: 'fda', required: true, half: true,
              },
              {
                key: 'clientType', label: 'Client type', type: 'select',
                options: [
                  { value: 'pharma', label: 'Pharma' },
                  { value: 'biotech', label: 'Biotech' },
                  { value: 'mdx', label: 'Medical device' },
                  { value: 'ivd', label: 'IVD' },
                ],
                default: 'biotech', required: true, half: true,
              },
              {
                key: 'projectId', label: 'Programme', type: 'select',
                options: programmes.rows.map((p) => ({
                  value: p.id,
                  label: [p.code, p.title].filter(Boolean).join(' · ') || p.id,
                })),
                required: true, half: true,
              },
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
                          {SUB_STATUS_LABEL[s.status] ?? s.status}
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
                          <span className="sp-row-s"> · {programmes.rows.find((p) => p.id === String(f.projectId))?.title ?? 'programme not resolved'}</span>
                        ) : null}
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
              {/* Read "AnA builds the sequence plan…" above a button that only
                  opened the chat rail: a capability stated in the present
                  indicative over an act nothing on this screen performs. */}
              AnA can draft a sequence plan from the region profile — required modules, granularity,
              regional Module 1, and the validation profile for {regL(sub.primaryRegion)} — as a
              proposal in conversation.
            </div>
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sp-primary sc-btn"
                title="Opens the request in the AnA conversation. Nothing is generated or persisted by this button."
                onClick={() =>
                  onAsk(
                    `Plan the ${regL(sub.primaryRegion)} ${appL(sub.applicationType)} submission for ${sub.title} from the region profile.`
                  )
                }
              >
                {/* Was "Generate plan (plan_submission)" — a governed generative
                    act promised by the label, a chat message delivered by the
                    handler, and an internal tool id shown to the user. */}
                {I.sparkles} Ask AnA to plan this sequence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Builder / Validation / Shadow review / Cross-region / Dispatch — the
          per-sequence workspaces. One selector (SeqPicker) chooses the working
          sequence; each workspace then reads/writes the REAL endpoints for it. */}
      {/* ── "No submission selected" is a claim about the reader's portfolio ──
          The guard was `PER_SEQ_WS.has(ws) && !sub && !subs.loading`, which never
          inspected `subs.error`. `sub` falls back to `list[0]`, and `list` is the
          same empty array after a failed read as after a genuinely empty one, so
          once a failed fetch settled this panel told a regulatory director that
          nothing was selected — implying the list had been read and they simply
          had not picked from it — when the list had not been read at all. The
          Portfolio table thirty lines above already branched on the failure
          first; this is that same branch, taken from the shared discriminator. ── */}
      {PER_SEQ_WS.has(ws) && !sub && subsState === 'unreadable' && (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the submissions"
          hint="These workspaces operate on one submission's sequences, and the submission list didn't load — nothing here says whether you have any. Retry from the Portfolio workspace, or check the service is reachable."
        />
      )}
      {PER_SEQ_WS.has(ws) && !sub && subsState === 'not-assessed' && (
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
                                  : 'Lifecycle transition — the server enforces which transitions are legal'
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
                        {/* "terminal" was printed for ANY status absent from
                            SC_TRANSITIONS — a dispatched sequence and a status
                            this build has never heard of looked the same. */}
                        {!(s.status in SC_TRANSITIONS) ? (
                          <span className="sp-q-s">unknown status</span>
                        ) : SC_TRANSITIONS[s.status].length === 0 ? (
                          <span className="sp-q-s">terminal</span>
                        ) : null}
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
          defaultMeaning={flow.kind === 'freeze' ? 'approval' : 'release'}
          signer={authUser ? { name: authUser.displayName || `${authUser.firstName} ${authUser.lastName ?? ''}`.trim() || authUser.email, email: authUser.email } : undefined}
          onClose={() => setFlow(null)}
          onSign={(input) => runGoverned(flow, input)}
        />
      )}
    </div>
  );
}
