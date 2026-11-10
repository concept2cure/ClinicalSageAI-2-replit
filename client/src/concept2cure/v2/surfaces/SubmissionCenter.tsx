/**
 * Submission Center — kit app/submission-center.jsx ported (registry id
 * `submission-center`, contract-ready).
 *
 * Real-data standard (no mock in product): the workspaces are scaffolded from
 * the REAL contract SUBMISSION_WORKSPACES (@shared/types/submission-ui). The
 * portfolio list binds live to GET /api/submissions and the per-submission
 * sequences to GET /api/submissions/:id/sequences (both DB-backed via
 * submission-service) with a four-state render — loading → error → honest empty
 * → real. The Portfolio view additionally reads the DEVICE journey from the
 * eSTAR tracker (GET /api/510k/estar/submissions + one POST /assemble verdict
 * for the section header) — a separate spine from the eCTD core, because eSTAR
 * is not eCTD and a device filing is never forced into ectd_sequences.
 *
 * The PLANNER reads the live region profile (GET /api/region-profiles/:region)
 * — agency, pathways, the Module 1 sections required for THIS application type,
 * agency forms, region-specific requirements, and the codified gateway rules the
 * package will later be validated against. It had named those contents in prose
 * over a screen that never read them. Profiles exist for five of the twelve
 * regions the selector offers, so the 404 is a first-class state: "no profile is
 * registered" is rendered distinctly from a failed read AND from an empty
 * requirement set, because on a submission screen an empty required-section list
 * is a statement that nothing is required.
 *
 * Per-sequence workspaces (SubmissionSeqWorkspaces.tsx) are REAL: a sequence
 * selector feeds Builder (GET/PUT leaves), Validation (dispatch-readiness
 * findings + AI explain), Shadow Review (runs + persisted findings) and
 * Dispatch (the
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
import { PATHWAYS } from '@shared/types/submission-constants';
import { useAuthUser } from '@/services/portal/authService';
import { SUBMISSION_WORKSPACES } from '@shared/types/submission-ui';
import { I } from '../icons';
import { usePublishSurfaceContext } from '../surfaceContext';
import { listedChoices, notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { assessmentStateFor } from '../assessmentState';
import { useLiveRows, useLiveData, hasKeys, isRowsWith, liveMutateOrNull, EmptyState, ProjectBack } from '../dataConnect';
import { EsignModal, type EsignModalProps } from '../../_shared/components/EsignModal';
import { FiledBaselineSlot, nextAfterFiled, numberingKnown, useFiledBaseline, type FiledBaselineView } from './FiledElsewhereBaseline';
import { useShellProject, shellProgramId, type ShellProject } from '../shellProject';
import { isUsInd, notOfferedCount, programSubmissionsPath, SUB_STATUS_LABEL, SUB_STATUS_TONE } from './programSequence';
import type { EsigMeaning } from '../../hooks/useEsignature';
import {
  // Canonical enum / label / state-machine maps (mirror shared/types/
  // submission-constants + the server SEQUENCE_TRANSITIONS) — reference config,
  // NOT sample data, so they stay.
  SC_APPTYPES,
  SC_REGIONS,
  SC_SEQ_STATUS,
  SC_TRANSITIONS,
} from '../fixtures/submission';
import {
  BuilderWorkspace,
  Chip,
  DispatchWorkspace,
  SeqPicker,
  SeqSelect,
  ShadowReviewWorkspace,
  ValidationWorkspace,
  VerdictNote,
  blockerForDisplay,
  clause,
  environmentWords,
  mutateVerbatim,
  retirementOf,
  settlementOf,
  TEST_SEND_NOT_A_FILING,
  type GovernedKind,
  type GovernedPrecheck,
  type HeldSendOverview,
  type SettlementRequest,
  type Notice,
  type SeqRow,
  type TransmitRequest,
} from './SubmissionSeqWorkspaces';
import '../styles/submission-v2.css';
import { NewSubmissionForm } from './NewSubmissionForm';
import { gatewayLabel, heldSendDay } from '../gatewayLabels';
import { dispatchWords } from './CommitmentRow';
import { SubmissionProgramAnchor } from './SubmissionProgramAnchor';
import { useSurfaceAvailable } from '../surfaceAvailable';
import { consumeNavParams, stashNavParamsForTarget, NAV_PARAMS_EVENT } from '../navParams';
import { ceremonyOpen } from '../ceremony';
import { readSubmissionNavTarget, useOpenOnNavTarget, type SubmissionNavTarget } from './submissionNavTarget';
import { TrackedFilingDetail } from './TrackedFilingDetail';
import { TrackedFilingHistory } from './TrackedFilingHistory';
import {
  DeviceFilingsCard,
  plural,
  readAssemblyVerdict,
  type AssemblyVerdictPayload,
  type AssemblyVerdictState,
  type DeviceFilingRow,
} from './DeviceFilings';
import { isTrackedFilingId } from '@shared/types/task-filing-home';
import { isDeviceOrDiagnosticProgram } from '@shared/constants/domain/product-types';
import { SubmissionRequiredDeliverables, type SubmissionCoverageSequence } from './SubmissionRequiredDeliverables';
import { useSubmissionReadSession, useSubmissionScopedRows } from './submissionScopedRead';
import { getSurfaceMeta } from '../registryModel';
import { SHADOW_WAIVER_ACTION, SHADOW_WAIVER_MEANINGS, shadowWaiverTargetLine, submitShadowWaiver, type WaiverRequest } from './ShadowReviewWaiver';
import {
  SHADOW_DISPOSITION_MEANINGS,
  dispositionFields,
  shadowDispositionAction,
  shadowDispositionDefaultMeaning,
  shadowDispositionTargetLine,
  submitFindingDisposition,
  type DispositionRequest,
} from './ShadowFindingDisposition';

/* ── Display types aligned to the canonical submission core's ACTUAL columns
   (shared/schema/submissions.ts; server/services/submission-service). Only
   columns the backend returns are typed; nullable columns are `| null` and
   rendered null-safe — never fabricated. Notably `submissions` has no
   `pathway`/`seqCount` (pathway lives on submission_regions; sequences are a
   separate table) and its `status` enum is planning|active|submitted|archived
   (distinct from the sequence status enum). ── */

// GET /api/submissions → listSubmissions() → `submissions` rows. Project home
// lists the same rows for its project (type-only import, no runtime coupling).
export interface SubRow {
  id: number;
  title: string;
  productName: string | null;
  applicationType: string; // ind|nda|bla|anda|maa|510k|de_novo|pma|cta (SC_APPTYPES)
  clientType: string; // pharma|biotech|mdx|ivd
  primaryRegion: string; // fda|eu|jp (SC_REGIONS)
  status: string; // planning|active|submitted|archived
  lifecycleStage: string; // planning|original|amendment|response|variation|annual|withdrawal
  /** The project this submission belongs to (regulatory_programs.id); null for
   *  one created before submissions recorded it (LX-22). */
  programId?: string | null;
}

// (SeqRow — the `ectd_sequences` display row — now lives in
// SubmissionSeqWorkspaces.tsx, shared with the per-sequence workspaces.)

/* The region profile GET /api/region-profiles/:region returns. Mirrors
   SubmissionRegionProfile (server/services/region-profiles/region-profile-service.ts);
   declared structurally rather than imported because that module is server-side
   (it reaches into the rule packs), and the client only reads this shape. */
interface RegionProfileSection {
  number: string;
  title: string;
  titleLocal?: string;
  required: boolean;
  /** Application types the `required` flag applies to. Absent = all of them. */
  requiredFor?: string[];
  description: string;
  childSections?: RegionProfileSection[];
}
interface RegionProfileForm {
  name: string;
  formId?: string;
  required: boolean;
  /** Application types that file this form. Absent = all of them. */
  requiredFor?: string[];
  description: string;
  url?: string;
}
interface RegionProfileRule {
  id: string;
  severity: string;
  citation: string;
  description: string;
}
interface RegionProfile {
  region: string;
  agency: string;
  language: string;
  currency: string;
  pathways: string[];
  module1Sections: RegionProfileSection[];
  forms: RegionProfileForm[];
  specificRequirements: string[];
  validationRules: RegionProfileRule[];
  validationRuleCount: number;
}

/**
 * Flatten the Module 1 tree to the sections REQUIRED for this application type.
 *
 * `requiredFor` is load-bearing and application-specific: a debarment
 * certification is required for a marketing application and not for an IND;
 * the general investigational plan is the reverse. Listing every `required`
 * section regardless would tell an IND filer they owe paperwork they do not,
 * which is the same class of false statement as listing none at all.
 * An ABSENT `requiredFor` means "every application type", per the server's own
 * contract — so it is kept, not dropped.
 */
/** A filing pathway in words ("eCTD v3.2.2"), from the product's one list of them; a pathway it has no name for is
 * shown as recorded, never as blank. The Planner printed the stored codes, "ectd_v322 · ectd_v40 · estar"
 * (showcase walk, 2026-11-10). */
const pathwayName = (code: string): string => PATHWAYS.find((p) => p.value === code)?.label ?? code;

function requiredModule1For(
  sections: RegionProfileSection[],
  applicationType: string | null | undefined,
): RegionProfileSection[] {
  const app = applicationType ? String(applicationType).toLowerCase() : null;
  const out: RegionProfileSection[] = [];
  const walk = (list: RegionProfileSection[]): void => {
    for (const s of list) {
      const appliesHere = !s.requiredFor || !app || s.requiredFor.includes(app);
      if (s.required && appliesHere) out.push(s);
      if (s.childSections?.length) walk(s.childSections);
    }
  };
  walk(sections ?? []);
  return out;
}

/** The agency forms THIS application type files, by the same `requiredFor`
 *  contract as requiredModule1For: an IND does not file Form 356h (J4 human
 *  test, 2026-11-06). Unknown type: every form is kept. */
function formsFor(forms: RegionProfileForm[] | undefined, applicationType: string | null | undefined): RegionProfileForm[] {
  const app = applicationType ? String(applicationType).toLowerCase() : null;
  return (forms ?? []).filter((f) => !f.requiredFor || !app || f.requiredFor.includes(app));
}

// (SUB_STATUS_TONE / SUB_STATUS_LABEL — the submission status chip — live in
// programSequence.ts, shared with Project home's list of the project's submissions.)

/* ── Device filings (eSTAR tracker) ─────────────────────────────────────────
   The card, its row and verdict types and its helpers live in
   DeviceFilings.tsx (D2, fold F5 item 1, 2026-10-30), with the status filter
   and each draft filing's gate. This screen reads the list and the one
   assembly verdict, which its AnA context states. ── */

// (Chip is imported from SubmissionSeqWorkspaces — one implementation.)

/** What the create says. A market added to the project says what was recorded, and why (Part 11
 *  review, 2026-10-15): the reason is in the project's audit record. A refusal of the add by role
 *  says who may add one. */
function newSubmissionNotice(ok: boolean, inProject: boolean, v: Record<string, string>, r: { status?: number; error?: string | null }): Notice {
  const what = `${SC_APPTYPES.find((x) => x.v === v.applicationType)?.l ?? v.applicationType} · ${SC_REGIONS.find((x) => x.v === v.primaryRegion)?.l ?? v.primaryRegion}`;
  if (ok && inProject) {
    return { tone: 'ok', text: `Market added to the project — ${what}. Recorded on the project with your reason: "${(v.reason ?? '').trim()}".` };
  }
  if (ok) return { tone: 'ok', text: `Submission created — ${what}.` };
  if (inProject && r.status === 403) {
    return { tone: 'err', text: "Market not added — only this project's lead or an organization manager can add a market to it." };
  }
  return { tone: 'err', text: `Submission not created — ${r.error ?? 'the request failed'}.` };
}

/** The create request: with a project open, a market of that project (F22) through
 *  the project's route, for the stated reason; else the organisation's create. */
function postNewSubmission(
  openProgramId: string | null,
  programme: { id: string; title?: string | null; code?: string | null },
  v: Record<string, string>,
) {
  const title = (v.title ?? '').trim();
  if (openProgramId) {
    return mutateVerbatim<{ submissionId?: number }>('POST', `/api/c2c/projects/${openProgramId}/markets`, {
      title, applicationType: v.applicationType, agency: v.primaryRegion, clientType: v.clientType, reason: (v.reason ?? '').trim(),
    });
  }
  return mutateVerbatim<SubRow>('POST', '/api/submissions', {
    title, programId: programme.id, productName: programme.title || programme.code || undefined,
    applicationType: v.applicationType, clientType: v.clientType, primaryRegion: v.primaryRegion,
  });
}

/** Follow-up sequence types: the server's createSequence enum, less 'original' (that is 0000). */
const FOLLOW_UP_SEQ_TYPES = ['amendment', 'response', 'annual', 'variation', 'withdrawal'] as const;

/** The next sequence number in the submission's own region — numbering restarts per region. */
function nextSequenceNumber(sub: SubRow, rows: SeqRow[]): string {
  const taken = rows
    .filter((r) => r.region === sub.primaryRegion)
    .map((r) => Number.parseInt(r.sequenceNumber, 10))
    .filter((n) => Number.isFinite(n));
  return String((taken.length ? Math.max(...taken) : -1) + 1).padStart(4, '0');
}

/** Start a follow-up sequence: its number is derived, its type is the author's to state. */
function NextSequenceControl({ sub, rows, baseline, type, onType, busy, onStart }: {
  sub: SubRow;
  rows: SeqRow[];
  /** Sequences declared filed outside the platform: the next number follows them too. */
  baseline: FiledBaselineView | null;
  type: string;
  onType: (t: string) => void;
  busy: boolean;
  onStart: (sequenceNumber: string) => void;
}) {
  const next = nextAfterFiled(nextSequenceNumber(sub, rows), baseline);
  return (
    <div className="cm-pushbar sc-mt">
      <select className="sc-subpick" aria-label={`Type of sequence ${next}`} value={type} disabled={busy}
        onChange={(e) => onType(e.target.value)}>
        {FOLLOW_UP_SEQ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {/* Not the view's primary (the header's "New submission" is, D0 §7 check 2), and it asks nothing of AnA, so it
          carries no spark (D0 §8.1; the coordinating session, 2026-11-09). The hairline secondary, not the bare `.btn`,
          which has no border and read as text in the running app. */}
      <button type="button" className="btn ghost" disabled={busy} onClick={() => onStart(next)}>
        {busy ? 'Creating…' : `Start sequence ${next}`}
      </button>
    </div>
  );
}

/** A governed step in flight: what is signed, for a transmit where it goes, for
 *  a Shadow Review waiver (P-34) the failed run it answers, for a finding
 *  disposition (P-35) the finding and how it is closed, and for a retirement
 *  (P-86) the statement the server gave, signed word for word. */
type GovernedFlow = {
  seq: SeqRow; kind: GovernedKind; transmit?: TransmitRequest; waiver?: WaiverRequest; disposition?: DispositionRequest; statement?: string;
  /** A held send's settlement (P-92): the way and its ground, and the server's answer it is signed over. */
  settlement?: SettlementRequest; heldSend?: HeldSendOverview;
};
const GOVERNED_LABEL: Record<GovernedKind, string> = {
  freeze: 'Freeze', dispatch: 'Dispatch', transmit: 'Transmit', 'shadow-waiver': 'Shadow Review waiver',
  'shadow-finding-disposition': 'Closing a critical finding', retire: 'Retirement', 'held-send-settlement': 'Settling a held send',
};
const GOVERNED_PAST: Record<GovernedKind, string> = {
  freeze: 'frozen', dispatch: 'dispatched', transmit: 'transmitted', 'shadow-waiver': 'waived', 'shadow-finding-disposition': 'closed',
  retire: 'retired', 'held-send-settlement': 'settled',
};
/** What a governed step needs beyond its kind: where a transmit goes, the run a waiver answers (P-34), the finding a
 *  disposition closes (P-35), or the way a held send is settled (P-92). */
type GovernedRequest = { transmit?: TransmitRequest; waiver?: WaiverRequest; disposition?: DispositionRequest; settlement?: SettlementRequest };
/** A cleared answer that carried no statement: nothing can be signed over it. */
const NO_STATEMENT = 'Whether the server would accept this could not be checked — the answer carried no statement to sign. Nothing was signed.';
const STATEMENT_CHANGED = 'What you would state changed since this dialog opened. Nothing was signed; close it and open it again.';

/** What a settlement's precheck asks: the way and its ground. */
function settlementBody(r: SettlementRequest | undefined): Record<string, string> {
  if (!r) return {};
  return { outcome: r.outcome, evidenceKind: r.evidenceKind, ...(r.evidenceDocumentId ? { evidenceDocumentId: r.evidenceDocumentId } : {}) };
}
/** What a settlement's signature carries beyond its intent and meaning (P-92 §3.1): the way, the transmission and attempt
 *  it settles, the evidence and the statement, all as the server answered them, compared by the server word for word. */
function settlementFields(f: GovernedFlow): Record<string, unknown> {
  if (f.kind !== 'held-send-settlement' || !f.settlement || !f.heldSend) return {};
  return {
    outcome: f.settlement.outcome, transmittalId: f.heldSend.transmittalId, transmitAttemptId: f.heldSend.attemptId,
    evidence: f.heldSend.evidence, statement: f.statement,
  };
}
/** The step's own statement, from a cleared answer: a retirement's (P-86) or a settlement's (P-92); none for the others. */
function clearedAnswer(kind: GovernedKind, data: GovernedPrecheck): { refusal: string | null; statement?: string; heldSend?: HeldSendOverview } {
  if (kind === 'retire') {
    const retirement = retirementOf(data);
    return retirement ? { refusal: null, statement: retirement.statement } : { refusal: NO_STATEMENT };
  }
  if (kind === 'held-send-settlement') {
    const held = settlementOf(data);
    return held ? { refusal: null, statement: held.statement, heldSend: held } : { refusal: NO_STATEMENT };
  }
  return { refusal: null };
}
/** The page's word that a held send was settled (P-92 C2, S8), with no signature id. */
function settledNotice(f: GovernedFlow, signer: string, meaning: string): string {
  const n = f.seq.sequenceNumber;
  const kind = f.settlement?.evidenceKind;
  if (f.settlement?.outcome === 'received') {
    return `Sequence ${n} is recorded as received by FDA, on its ${kind === 'ack3' ? 'Ack3' : 'Ack2'} kept in the Vault, signed by ${signer} (${meaning}).`;
  }
  const ground = kind === 'platform-proof' ? "the platform's own record that it never left" : "FDA's written confirmation kept in the Vault";
  return `Sequence ${n}'s held send is released as not received, on ${ground}, signed by ${signer} (${meaning}). It can be sent again, under a new signature.`;
}

/** What a retirement's signature carries beyond its intent and meaning (P-86 D6): that the sequence was filed by no
 *  other route, and the server's statement, which the server compares word for word. The client holds no copy. */
function retirementFields(f: GovernedFlow): { notFiledElsewhere?: true; statement?: string } {
  return f.kind === 'retire' ? { notFiledElsewhere: true, statement: f.statement } : {};
}

type SigningWords = Pick<EsignModalProps, 'action' | 'targetMeta' | 'defaultMeaning' | 'meanings' | 'renderMeaningDetails' | 'signedRows'>;

/** The retirement's one signature (P-86 C3): Responsibility only; a target line that says what the act does and
 *  carries no record key (plan §2's retired patterns); and the server's statement, shown and recorded word for word. */
function retirementSigning(flow: GovernedFlow, region: string): SigningWords {
  const statement = flow.statement ?? '';
  return {
    action: 'Retire sequence',
    targetMeta: `${region} · takes the sequence out of use; nothing is sent to the agency; cannot be undone`,
    defaultMeaning: 'responsibility',
    meanings: ['responsibility'],
    renderMeaningDetails: () => (
      <div className="sc-mb" data-testid="retire-statement">
        <span className="tl-spec-k">By signing, you state:</span>
        <p><q>{statement}</q></p>
      </div>
    ),
    signedRows: [{ label: 'Stated', value: statement }],
  };
}

/** A held send's one signature (P-92 C2): Responsibility only; a target line that says what the act does and carries
 *  no record key; the server's statement, shown and recorded word for word; and the FDA document it rests on, if any. */
function settlementSigning(flow: GovernedFlow, region: string): SigningWords {
  const statement = flow.statement ?? '';
  const n = flow.seq.sequenceNumber;
  const day = heldSendDay(flow.heldSend?.sentAt);
  const document = flow.settlement?.documentLabel;
  return {
    action: flow.settlement?.outcome === 'received' ? `Record sequence ${n} as received` : `Release sequence ${n}'s held send`,
    targetMeta: `${region} · settles the held send${day ? ` of ${day}` : ''}; nothing is sent to FDA`,
    defaultMeaning: 'responsibility',
    meanings: ['responsibility'],
    renderMeaningDetails: () => (
      <div className="sc-mb" data-testid="held-send-statement">
        <span className="tl-spec-k">By signing, you state:</span>
        <p><q>{statement}</q></p>
      </div>
    ),
    signedRows: [...(document ? [{ label: 'FDA document', value: document }] : []), { label: 'Stated', value: statement }],
  };
}

/** The words of the one signing dialog, for the step in flight. */
function governedSigning(flow: GovernedFlow, region: string): SigningWords {
  if (flow.kind === 'retire') return retirementSigning(flow, region);
  if (flow.kind === 'held-send-settlement') return settlementSigning(flow, region);
  return {
    action:
      flow.kind === 'shadow-waiver'
        ? SHADOW_WAIVER_ACTION
        : flow.kind === 'shadow-finding-disposition'
          ? shadowDispositionAction(flow.disposition)
          : `${GOVERNED_LABEL[flow.kind]} sequence`,
    targetMeta: `${region} · ectd-sequence:${flow.seq.id} · ${
      flow.kind === 'freeze'
        ? 'irreversible content lock'
        : flow.kind === 'dispatch'
          ? 'records dispatch; the package is sent by a separate, signed transmit'
          : flow.kind === 'shadow-waiver'
            ? shadowWaiverTargetLine(flow.waiver)
            : flow.kind === 'shadow-finding-disposition'
              ? shadowDispositionTargetLine(flow.disposition)
              : transmitTargetLine(flow.transmit)
    }`,
    defaultMeaning:
      flow.kind === 'freeze'
        ? 'approval'
        : flow.kind === 'shadow-waiver'
          ? 'responsibility'
          : flow.kind === 'shadow-finding-disposition'
            ? shadowDispositionDefaultMeaning(flow.disposition)
            : 'release',
    // Freeze and dispatch are approval and release acts. "Authorship"
    // is not offered: the sign route skips separation of duties for it,
    // and the step refuses a signature that declares it (Gate 1). A
    // Shadow Review waiver is responsibility or approval (P-34), and so is
    // closing a critical finding (P-35).
    meanings:
      flow.kind === 'shadow-waiver'
        ? SHADOW_WAIVER_MEANINGS
        : flow.kind === 'shadow-finding-disposition'
          ? SHADOW_DISPOSITION_MEANINGS
          : flow.kind === 'freeze'
            ? ['approval', 'responsibility']
            : ['release', 'approval', 'responsibility'],
  };
}

/** What POST /sequences/:id/transmit answers. `signatureVoided`: on a
 *  transmit that sent nothing, whether the signature given for it is now void
 *  (P-23). */
type TransmitAnswer = { transmitted?: boolean; reason?: string; gateway?: string; transmittalId?: number; status?: string; dispatchStatus?: string; signatureVoided?: boolean };

/** The server's honest "nothing was sent" (`transmitted: false`), as a sentence.
 *  The environment is said in words, never as stored (F1, row D7). */
function notTransmittedSentence(a: TransmitAnswer, environment: string | undefined): string {
  const sentence = a.reason === 'gateway_not_configured'
    ? `Not sent — ${gatewayLabel(a.gateway)} has no credentials configured for ${environmentWords(environment)} for this organization. Nothing was sent; the attempt is recorded. Add the credentials, then send again.`
    : `Not sent — ${clause(a.reason ?? 'the server did not send it')}. Nothing was sent.`;
  return a.signatureVoided ? `${sentence} The signature given for it is now void; a new attempt is signed again.` : sentence;
}

/** A performed transmit, as the server reported it, with who signed it. The
 *  environment is said in words, never as stored. F1 (row D7, 2026-11-01): a
 *  send to the agency's test environment is said to be one, and not a filing,
 *  always: whatever it answered, the sequence can still be filed. How the agency
 *  now holds a production send is said by dispatchWords (CommitmentRow.tsx),
 *  and only for a status it names: any other is not yet confirmed, never "not
 *  on file" just after a send. */
function transmittedSentence(seq: SeqRow, a: TransmitAnswer, environment: string | undefined, signed: string): string {
  const n = seq.sequenceNumber;
  const record = `transmittal #${a.transmittalId ?? 'not returned'}, gateway status ${a.status ?? 'not returned'}, ${signed}`;
  const sent = `Sequence ${n} sent to ${environmentWords(environment)} through ${gatewayLabel(a.gateway)} — ${record}.`;
  if (environment === 'staging') {
    return `${sent} ${TEST_SEND_NOT_A_FILING}; sequence ${n} is ${dispatchWords('pending')} and can still be filed with the agency.`;
  }
  const named = a.dispatchStatus === 'sent' || a.dispatchStatus === 'acknowledged' || a.dispatchStatus === 'rejected';
  const held = named
    ? ` Sequence ${n} is now ${dispatchWords(a.dispatchStatus)}.`
    : ` Whether the agency holds sequence ${n} is not yet confirmed; check the transmittal list before sending again.`;
  return `${sent}${held}`;
}

/** The environment a transmit signature names, so it authorizes a send there
 *  only (the server refuses it for the other, F1, row D7, 2026-11-08). */
function transmitEnvironmentField(f: { kind: string; transmit?: TransmitRequest }): { environment?: string } {
  return f.kind === 'transmit' && f.transmit?.environment ? { environment: f.transmit.environment } : {};
}

/** What the transmit's signer reads before signing: where the package goes, in
 *  words, and that a test send is not a filing (F1, row D7, 2026-11-01). */
function transmitTargetLine(t: TransmitRequest | undefined): string {
  const application = `application ${t?.applicationId ?? 'not given'}`;
  if (t?.environment === 'production') {
    return `sends the package to ${environmentWords(t.environment)}, ${application}; this files the sequence with the agency`;
  }
  if (t?.environment === 'staging') {
    return `sends the package to ${environmentWords(t.environment)}, ${application}; ${TEST_SEND_NOT_A_FILING.toLowerCase()}, and the sequence can still be filed with the agency`;
  }
  return `sends the package to the agency gateway (environment not chosen), ${application}`;
}

/** The open project as the create form's programme: the org's own row when
 *  the projects list has it, otherwise what the shell knows of it. */
function openProgramme(
  id: string,
  row: { title: string; code: string } | undefined,
  shell: ShellProject | null,
): { id: string; title: string; code: string } {
  return { id, title: row?.title || shell?.title || '', code: row?.code || shell?.code || '' };
}

/** The context row's scope toggle (D7 §A.4 step 3). The sentence it replaced ("Submissions of X, the open project")
 *  is said by the page's back link and this label. `notOffered` is the server's count of the organization's
 *  submissions the project scope left out (meta.notOffered); the label carries it when the server sent it, and says
 *  nothing about them when it did not, rather than guessing. Scoped with no other submission, "show all" would list
 *  the same rows, so it is not offered.
 *
 *  It is one <button> in both states, relabelled, so it is the same element after a toggle and keyboard focus stays
 *  on it (WCAG 2.4.3). */
function ProjectScopeToggle({ scoped, notOffered, onToggle }: {
  scoped: boolean;
  notOffered: number | null;
  onToggle: () => void;
}) {
  if (scoped && notOffered === 0) return null;
  const label = scoped
    ? `Show the organization's submissions${notOffered ? ` (${notOffered} more)` : ''}`
    : "Show this project's submissions";
  return (
    <button type="button" className="btn ghost small" data-testid="sc-scope" onClick={onToggle}>
      {label}
    </button>
  );
}

/** AnA's miss on a submission while the list is the open project's. The list
 *  is the project's, so a miss is a miss there, not "no such submission": the
 *  organization's others are not listed (the server counted them in
 *  `notOffered`, null when it did not say), and only the person can list them. */
function scopedMissReason(wanted: string, projectName: string | null, notOffered: number | null): string {
  const head = `No submission named "${wanted}" among the open project's submissions${projectName ? ` (${projectName})` : ''}`;
  if (notOffered === 0) return `${head}; the organization has no other submissions.`;
  const others =
    notOffered != null
      ? `${plural(notOffered, 'other submission', 'other submissions')} of the organization ${notOffered === 1 ? 'is' : 'are'}`
      : "The organization's other submissions are";
  return `${head}. ${others} not listed here; the person can list them with "Show the organization's submissions" beside the submission picker.`;
}

/* ── Device filings follow the open project (B4, demo walk 2026-11-05) ──────
   A drug IND's Submission Center showed "Device filings · eSTAR" and a 510(k)
   assembly verdict. The platform follows the project's own record: the eSTAR
   section, and its two reads, belong to a device or diagnostic project
   (isDeviceOrDiagnosticProgram, the rule Project home and the market refusal
   read). While that record is read, or when it cannot be read, the section is
   not shown; nothing is guessed. With no project open the screen is the
   organization's view and lists them as before. */
function useDeviceFilingsShown(openProgramId: string | null): boolean {
  const record = useLiveData<{ product_type?: string | null; program_type?: string | null }>(
    openProgramId ? `/api/c2c/projects/${encodeURIComponent(openProgramId)}` : null, [openProgramId]);
  if (!openProgramId) return true;
  return !record.loading && !record.error && isDeviceOrDiagnosticProgram(record.data);
}

/** What AnA is told about the device filings: nothing it would read as "none
 *  tracked" when the section is not shown for this project. */
function deviceFilingFacts(
  shown: boolean,
  read: { loading: boolean; error?: unknown },
  count: number,
  assembly: AssemblyVerdictState,
): Record<string, unknown> {
  if (!shown) return { deviceFilings: 'not shown: the open project is not recorded as a device or diagnostic filing' };
  return {
    deviceFilings: read.loading || read.error ? null : count,
    deviceFilingsUnavailable: read.error ? 'the eSTAR tracker read failed' : null,
    deviceAssemblyVerdict:
      assembly.state === 'ready'
        ? { artifactKind: assembly.artifactKind, missingRequiredSections: assembly.missingRequired,
            undeterminedSections: assembly.undetermined, otherBlockers: assembly.otherBlockers }
        : assembly.state === 'error' ? 'unavailable' : 'loading',
  };
}

/** The workspaces that operate on ONE selected sequence (fed by SeqPicker). */
const PER_SEQ_WS = new Set(['builder', 'validation', 'shadow-review', 'dispatch', 'required-deliverables']);
interface ScopedBuilderNotice extends Notice { builderGeneration?: number; builderSequenceId?: number }

function visibleSubmissionNotice(notice: ScopedBuilderNotice | null, generation: number, sequenceId: number | undefined): Notice | null {
  if (notice?.builderGeneration === undefined) return notice;
  return notice.builderGeneration === generation && (sequenceId === undefined || sequenceId === notice.builderSequenceId) ? notice : null;
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
  const available = useSurfaceAvailable();
  // The signer sees their own identity in the e-signature dialog (§11.50): the
  // name the platform will print on the signature, not a generic "You".
  const authUser = useAuthUser();
  const signerLabel = authUser?.displayName || authUser?.email || 'the authenticated user';
  const esignSigner = authUser ? { name: authUser.displayName || `${authUser.firstName} ${authUser.lastName ?? ''}`.trim() || authUser.email, email: authUser.email } : undefined;

  /* ── The open project (ONE_ANA_ONE_CANVAS.md slice 24) ─────────────────────
     With a project open this screen is about that project: it lists the
     project's submissions (GET /api/submissions?programId=…, the server's own
     scope) and a new submission belongs to it. The line under the title says
     whose submissions these are and how many others the organization has, as
     the server counted them, with a control to list them all. With no project
     open, or one that is not a regulatory_programs uuid, nothing changes. */
  const shell = useShellProject();
  const openProgramId = shellProgramId(shell);
  const [orgWide, setOrgWide] = React.useState(false);
  const scopedTo = openProgramId && !orgWide ? openProgramId : null;
  const readSession = useSubmissionReadSession();
  const selectorContext = JSON.stringify([openProgramId, orgWide]);

  // GET /api/submissions — real DB rows, honest empty, honest error (no fixture).
  const [subsBump, setSubsBump] = React.useState(0);
  const subsPath = scopedTo ? programSubmissionsPath(scopedTo) : '/api/submissions';
  /* A 200 with no list in it is a failed read, not "no submissions": unguarded
     it was flattened to zero rows, and New submission preselected the
     project's region as if that market did not exist (design review
     2026-10-08, honest-state lens). */
  const subs = useSubmissionScopedRows<SubRow>(subsPath, selectorContext, subsBump, readSession, isRowsWith<SubRow>('id', 'applicationType', 'primaryRegion'));
  const notOffered = scopedTo && !subs.loading && !subs.error ? notOfferedCount(subs.meta) : null;
  /* The org's programmes, so the required programId is PICKED rather than
     typed as a uuid — createSubmissionSchema requires one (the submission's
     project) and a customer does not have one to hand. With a project open the
     programme is that project, and this list only names it. */
  const programmes = useLiveRows<{ id: string; title: string; code: string }>('/api/c2c/projects');
  const openRow = openProgramId ? programmes.rows.find((p) => p.id === openProgramId) : undefined;
  /* The project's name when the shell or the projects list gives one; null
     when neither does (the shell may carry the id alone), and the screen then
     says "the open project" rather than a name it does not have. */
  const openProjectKnownName = openProgramId
    ? shell?.title || openRow?.title || shell?.code || openRow?.code || null
    : null;
  const openProjectName = openProgramId ? openProjectKnownName ?? 'the open project' : null;
  const list = subs.rows;
  const sub = list.find((s) => s.id === selSub) ?? list[0];
  /* What the Submissions table's "Program" column says, read by the
     submission's key (submissions.program_id → the program record). It printed
     `title · productName`, so an unanchored NDA whose product string is
     "BX-204" read as the BX-204 program — a 510(k) device in Projects — and the
     two screens appeared to disagree about one program's filing type (QA
     2026-10-08, j1). A program not on the page read is not named, and only a
     recorded null is stated as "no program". */
  const programOf = (s: SubRow): string | null => {
    if (s.programId === null) return 'No project recorded';
    const p = s.programId ? programmes.rows.find((r) => r.id === s.programId) : undefined;
    return p?.code ? `Project ${p.code}` : null;
  };

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

  const showDeviceFilings = useDeviceFilingsShown(openProgramId);
  // GET /api/510k/estar/submissions — the org's tracked eSTAR device filings,
  // read only where the section is shown (useDeviceFilingsShown).
  // { submissions } envelope (not the `{ data }` convention), so the shape is
  // guarded explicitly; a mismatched 200 reaches the error branch, never an
  // invented empty state.
  const deviceFilingsPath = showDeviceFilings ? '/api/510k/estar/submissions' : null;
  const deviceRes = useLiveData<{ submissions: DeviceFilingRow[] }>(
    deviceFilingsPath,
    [deviceFilingsPath],
    hasKeys('submissions'),
  );
  const deviceFilingsRaw = deviceRes.data?.submissions;
  const deviceFilings: DeviceFilingRow[] = Array.isArray(deviceFilingsRaw) ? deviceFilingsRaw : [];

  // POST /api/510k/estar/assemble — ONE org-wide device-assembly verdict for
  // the section header (read-only on the server; renders/persists nothing).
  // One call each time the section is shown, never per-row.
  const [assembly, setAssembly] = React.useState<AssemblyVerdictState>({ state: 'loading' });
  React.useEffect(() => {
    if (!showDeviceFilings) return undefined;
    let cancelled = false;
    setAssembly({ state: 'loading' });
    liveMutateOrNull<AssemblyVerdictPayload>('POST', '/api/510k/estar/assemble', {
      pathway: '510k',
      variant: 'device',
    }).then((r) => {
      if (cancelled) return;
      if (r.data && typeof r.data.artifactKind === 'string') {
        setAssembly(readAssemblyVerdict(r.data));
      } else {
        // Failed or misshapen — say it is unavailable, never fabricate a verdict.
        setAssembly({ state: 'error' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showDeviceFilings]);

  // GET /api/submissions/:id/sequences — keyed on the selected submission (a real
  // numeric id). Null path while no submission is selected → the hook stays idle
  // and returns an empty list (no fixture). Not seeded into local state, so no
  // re-render loop. `seqBump` refetches after a server-confirmed transition so
  // the rendered status always comes from the server, never an optimistic guess.
  const [seqBump, setSeqBump] = React.useState(0);
  // Sequences filed outside the platform, declared (D7, 2026-10-29): a declaration
  // removes empty drafts, so the sequence list is re-read with it.
  const filedRead = useFiledBaseline(sub, seqBump);
  const seqPath = sub ? `/api/submissions/${sub.id}/sequences` : null;
  const sequenceContext = JSON.stringify([selectorContext, subs.loadedScope, sub?.id, sub?.programId]);
  const seqs = useSubmissionScopedRows<SubmissionCoverageSequence>(seqPath, sequenceContext, seqBump, readSession, isRowsWith<SubmissionCoverageSequence>('id', 'sequenceNumber', 'region'));

  /* ── The Planner's region profile ────────────────────────────────────────
     The Planner named this profile's contents in prose — "required modules,
     granularity, regional Module 1, and the validation profile" — over a
     screen that never read it. /api/region-profiles is live and auth-gated,
     and its own header says it serves "the submission UI"; it simply had no
     caller. This is that caller.

     COVERAGE IS PARTIAL AND THAT IS THE POINT. The region selector offers
     twelve regions; profiles exist for five (fda, eu, jp, cn, kr), so seven —
     Health Canada, MHRA, Swissmedic, TGA, ANVISA, CDSCO, HSA — resolve to a
     404. That 404 must never render as "no requirements": on a submission
     screen, an empty required-section list is a statement that nothing is
     required, and for those seven nobody has codified what is. The same
     fail-visible rule the dispatch assessor already applies to an unregistered
     region ("the absence of MISSING_REQUIRED_SECTION findings does NOT mean
     the required sections are present"). */
  const profilePath = sub?.primaryRegion
    ? `/api/region-profiles/${encodeURIComponent(String(sub.primaryRegion).toLowerCase())}`
    : null;
  const profile = useLiveData<RegionProfile>(profilePath, [profilePath]);

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
  // Shadow Review / Dispatch. Defaults to the first real row.
  const [selSeq, setSelSeq] = React.useState<number | null>(null);
  const seq = seqs.rows.find((r) => r.id === selSeq) ?? seqs.rows[0] ?? null;

  // Server-verdict line (transitions, governed outcomes) — verbatim, role=status.
  const [notice, setNotice] = React.useState<ScopedBuilderNotice | null>(null);
  const builderContext = JSON.stringify([readSession.key, selectorContext, sub?.id, sub?.programId, selSeq]);
  const builderOwner = React.useRef({ context: builderContext, generation: 0 });
  if (builderOwner.current.context !== builderContext) builderOwner.current = { context: builderContext, generation: builderOwner.current.generation + 1 };
  const builderGeneration = builderOwner.current.generation;
  const currentSequence = React.useRef(seq);
  currentSequence.current = seq;
  const builderIsCurrent = () => Boolean(seq && builderOwner.current.generation === builderGeneration && currentSequence.current === seq && seqs.isCurrent() && readSession.sameRevision());
  const builderSequenceChanged = (verdict: Notice) => {
    if (!seq || !builderIsCurrent()) return;
    setNotice({ ...verdict, builderGeneration, builderSequenceId: seq.id });
    setSeqBump(value => value + 1);
  };
  // The in-flight governed flow (freeze | dispatch | transmit) driving the EsignModal.
  const [flow, setFlow] = React.useState<GovernedFlow | null>(null);
  // Sequence id with a transition POST in flight (buttons disable, no double-fire).
  const [acting, setActing] = React.useState<number | null>(null);
  // Re-reads the Dispatch tab's readiness after a waive, which moves no status.
  const [readinessBump, setReadinessBump] = React.useState(0);

  // Changing submission invalidates the sequence selection and any verdict.
  const subId = sub?.id;
  React.useEffect(() => {
    setSelSeq(null);
    setNotice(null);
  }, [subId]);

  /* F10: opened on the submission, sequence and tab a sender named (Place into
     filing's "Open in Submission Center"). Read once on mount; opened against
     the rows the server returned, after the reset above, never guessed. */
  const [navParams] = React.useState(() => consumeNavParams('submission-center'));
  const navFollowUp = (FOLLOW_UP_SEQ_TYPES as readonly string[]).includes(navParams?.followUp ?? '') ? navParams?.followUp ?? null : null;
  const [navTarget, setNavTarget] = React.useState(() => {
    const query = new URLSearchParams(window.location.search);
    return readSubmissionNavTarget(navParams ?? {
      submissionId: query.getAll('submissionId').length === 1 ? query.get('submissionId') ?? undefined : undefined,
      sequenceId: query.getAll('sequenceId').length === 1 ? query.get('sequenceId') ?? undefined : undefined,
      ws: query.get('ws') ?? undefined,
    });
  });
  const [filingTarget, setFilingTarget] = React.useState<string | null>(null);
  const [filingLinkError, setFilingLinkError] = React.useState<string | null>(null);
  const navMiss = useOpenOnNavTarget(navTarget, {
    subs, sub, seqs, ws, selSeq, selectSubmission: setSelSub, selectSequence: setSelSeq, openWorkspace: setWs,
  });
  /* F18: the Builder section a readiness finding's act names, given to the
     Builder on the named sequence until it is used once, per hand-off. */
  const [sectionUsed, setSectionUsed] = React.useState<SubmissionNavTarget | null>(null);

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
   * createSubmissionSchema (routes/submissions.ts) takes { programId, title,
   * productName?, applicationType, clientType, primaryRegion } — so this is a
   * form over what the server actually requires, with the programme picked
   * from the org's own list: the submission is anchored to it. (An earlier
   * body targeted a different, unmounted router's schema; every submit
   * answered 400 VALIDATION.)
   */
  /* F9: the project page's "Add a market" opens this form on arrival — only
     with a project open, since the submission is that project's (F20). */
  const [newOpen, setNewOpen] = React.useState(() => navParams?.newSubmission === '1' && !!openProgramId);
  const [creating, setCreating] = React.useState(false);
  const createSubmission = async (v: Record<string, string>) => {
    if (creating) return;
    /* With a project open, the submission is that project's: there is no
       picker, and its name is the product name the picker would have sent. */
    const programme = openProgramId
      ? openProgramme(openProgramId, openRow, shell)
      : programmes.rows.find((p) => p.id === (v.projectId ?? '').trim());
    if (!programme) {
      setNotice({ tone: 'err', text: 'Pick the project this submission belongs to.' });
      return;
    }
    setCreating(true);
    setNotice(null);
    /* The LIVE schema of POST /api/submissions (routes/submissions.ts):
       { programId, title, productName?, applicationType, clientType,
       primaryRegion }. The previous body ({ type, projectId, targetAgency,
       targetDate }) belonged to a router that is NOT mounted at this path —
       every submit was a 400 VALIDATION, so this form had never created
       anything.
       programId is the programme the user picked: the submission belongs to
       it (submissions.program_id, LX-22). The form used to make the user pick
       one and then drop the id, so a submission created here had no project
       and reached one only by a product-name match. The server refuses a
       programme of another organization (404). */
    /* With a project open the submission is a market of that project (F22):
       the project's own route writes its regional modules, the market and the
       submission together, for the stated reason. */
    const r = await postNewSubmission(openProgramId, programme, v);
    setCreating(false);
    const created = r.data as { id?: unknown; submissionId?: unknown } | null | undefined;
    const ok = !!created && (created.id ?? created.submissionId) != null;
    if (ok) {
      setNewOpen(false);
      // Re-read rather than appending a client-built row: what appears is the
      // record the server created.
      setSubsBump((b) => b + 1);
    }
    setNotice(newSubmissionNotice(ok, !!openProgramId, v, r));
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
  const entryBusy = React.useRef<() => boolean>(() => false);
  entryBusy.current = () => ceremonyOpen() || flow !== null || acting !== null || newOpen || creating || creatingSeq;
  const initialFilingLinkRead = React.useRef(false);
  React.useEffect(() => {
    const openFiling = (id: string) => {
      if (!isTrackedFilingId(id)) {
        setFilingLinkError('The linked tracked filing identifier is invalid or ambiguous. Open a filing from the portfolio.');
        return;
      }
      setFilingLinkError(null); setNavTarget(null); setWs('portfolio'); setFilingTarget(id);
    };
    if (!initialFilingLinkRead.current) {
      initialFilingLinkRead.current = true;
      const queryIds = new URLSearchParams(window.location.search).getAll('filingId');
      const id = navParams ? navParams.filingId : queryIds.length === 1 ? queryIds[0] : queryIds.length > 1 ? '' : undefined;
      if (id !== undefined) {
        if (entryBusy.current()) setNotice({ tone: 'err', text: 'Finish or cancel the open governed form, then retry the linked tracked filing.' });
        else openFiling(id);
      }
    }
    const handoff = (event: Event) => {
      if ((event as CustomEvent<{ surfaceId?: string }>).detail?.surfaceId !== 'submission-center') return;
      const params = consumeNavParams('submission-center');
      if (!params) return;
      if (entryBusy.current()) {
        setNotice({ tone: 'err', text: 'Finish or cancel the open governed form, then retry the linked submission or tracked filing.' });
        return;
      }
      if (params.filingId !== undefined) openFiling(params.filingId);
      else {
        setFilingTarget(null); setFilingLinkError(null); setNavTarget(readSubmissionNavTarget(params));
        if ((FOLLOW_UP_SEQ_TYPES as readonly string[]).includes(params.followUp ?? '')) setNextSeqType(params.followUp!);
      }
    };
    window.addEventListener(NAV_PARAMS_EVENT, handoff);
    return () => window.removeEventListener(NAV_PARAMS_EVENT, handoff);
  }, [navParams]);
  const startSequence = async (target: SubRow, sequenceNumber: string, type: string) => {
    if (creatingSeq) return;
    setCreatingSeq(true);
    setNotice(null);
    const r = await mutateVerbatim<SeqRow>('POST', `/api/submissions/${target.id}/sequences`, {
      region: target.primaryRegion,
      sequenceNumber,
      type,
    });
    setCreatingSeq(false);
    if (r.data && (r.data as { id?: unknown }).id != null) {
      setSeqBump((b) => b + 1);
      setNotice({ tone: 'ok', text: `Sequence ${sequenceNumber} created for ${target.title} — server-confirmed.` });
    } else {
      setNotice({ tone: 'err', text: `Sequence ${sequenceNumber} not created — ${r.error ?? 'the request failed'}.` });
    }
  };

  /* A follow-up sequence (WO-9 Click 6). Its number follows the highest in the
     submission's own region — numbering restarts per region — and its type is
     the author's to state; the server's enum, less 'original', which is 0000. */
  const [nextSeqType, setNextSeqType] = React.useState<string>(navFollowUp ?? 'amendment');

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

  /** Ask the step's own gates before anything is signed — POST
   *  /sequences/:id/governed-precheck. QA 2026-10-08 (j6): the Sequences row
   *  opened the e-signature with no gate shown, the signature was recorded, and
   *  only then did the freeze refuse. A refusal or an unreadable answer is
   *  returned as the sentence to show; null means the gates clear. */
  const precheckAnswer = async (
    s: SeqRow,
    kind: GovernedKind,
    { transmit, waiver, disposition, settlement }: GovernedRequest = {},
  ): Promise<{ refusal: string | null; statement?: string; heldSend?: HeldSendOverview }> => {
    // A waiver answers one failed run; without it there is nothing to sign (P-34).
    if (kind === 'shadow-waiver' && !waiver) return { refusal: 'No failed Shadow Review run is named for this waiver. Nothing was signed.' };
    // A disposition closes one named finding (P-35); a settlement settles the held send one way, on one ground (P-92).
    if (kind === 'shadow-finding-disposition' && !disposition) return { refusal: 'No finding is named to close. Nothing was signed.' };
    if (kind === 'held-send-settlement' && !settlement) return { refusal: 'No way to settle the held send is chosen. Nothing was signed.' };
    // A transmit's typed number is judged against the program record here,
    // before the signature, by the rule transmit applies (P-23).
    const r = await mutateVerbatim<GovernedPrecheck>('POST', `/api/submissions/sequences/${s.id}/governed-precheck`, {
      step: kind,
      ...(transmit ? { environment: transmit.environment, applicationId: transmit.applicationId } : {}),
      ...dispositionFields(disposition),
      ...settlementBody(settlement),
    });
    if (!r.data || typeof r.data.cleared !== 'boolean') {
      return { refusal: `Whether the server would accept this could not be checked — ${clause(r.error ?? 'no answer')}. Nothing was signed.` };
    }
    if (!r.data.cleared) return { refusal: `${clause(r.data.refusal ?? 'the server would refuse it')}. Nothing was signed.` };
    // A retirement (P-86 D6) and a settlement (P-92) sign the server's statement word for word: a cleared answer without
    // one is unreadable.
    return clearedAnswer(kind, r.data);
  };

  /** Open the e-signature for a governed step only when its gates clear. The
   *  Sequences row and the Dispatch tab both come here: one path to a signature. */
  const requestGoverned = async (s: SeqRow, kind: GovernedKind, req: GovernedRequest = {}) => {
    if (acting != null || flow != null) return;
    setActing(s.id);
    setNotice(null);
    const { transmit, waiver, disposition, settlement } = req;
    const { refusal, statement, heldSend } = await precheckAnswer(s, kind, req);
    setActing(null);
    if (refusal) {
      setNotice({ tone: 'err', text: `${GOVERNED_LABEL[kind]} of sequence ${s.sequenceNumber} not started — ${refusal}` });
      return;
    }
    setFlow({
      seq: s, kind, ...(transmit ? { transmit } : {}), ...(waiver ? { waiver } : {}), ...(disposition ? { disposition } : {}),
      ...(statement ? { statement } : {}), ...(settlement ? { settlement } : {}), ...(heldSend ? { heldSend } : {}),
    });
  };

  /** The governed freeze/dispatch/transmit chain, run from inside the EsignModal AFTER
   *  its §11.200 re-authentication succeeds. The gates are asked again first
   *  (they may have moved since the dialog opened), then two real server steps:
   *    1. POST /api/c2c/actions/sign on the exact `ectd-sequence:<id>` target —
   *       the server re-verifies the forwarded credentials, enforces separation
   *       of duties, and writes the sha256-chained ledger row.
   *    2. POST the governed freeze/dispatch endpoint with the returned
   *       signatureActionId — the server verifies the signature governs THIS
   *       sequence and that the deterministic dispatch gate is clear, atomically.
   *  Any failure throws with the server's words; the modal shows it inline and
   *  no success is fabricated. */
  const askAgain = async (f: GovernedFlow) => {
    const again = await precheckAnswer(f.seq, f.kind, { transmit: f.transmit, waiver: f.waiver, disposition: f.disposition, settlement: f.settlement });
    if (again.refusal) throw new Error(again.refusal);
    // A settlement is signed over the statement the dialog shows; the server's answer now must be the same (P-92 C2).
    if (f.kind === 'held-send-settlement' && again.statement !== f.statement) throw new Error(STATEMENT_CHANGED);
  };
  const runGoverned = async (
    f: GovernedFlow,
    input: { meaning: EsigMeaning; reason: string; password: string; totp?: string },
  ) => {
    await askAgain(f);
    const sign = await mutateVerbatim<{ actionId?: string; sha256Chain?: string }>(
      'POST',
      '/api/c2c/actions/sign',
      {
        target: `ectd-sequence:${f.seq.id}`,
        reason: input.reason,
        // A disposition's signature names the finding and how it is closed (P-35);
        // a transmit's names where the package goes (F1, row D7, 2026-11-08).
        payload: {
          intent: f.kind, meaning: input.meaning, ...dispositionFields(f.disposition), ...transmitEnvironmentField(f), ...retirementFields(f),
          ...settlementFields(f),
        },
        reauth: { password: input.password, ...(input.totp ? { totp: input.totp } : {}) },
      },
    );
    if (sign.error || !sign.data?.actionId) {
      throw new Error(
        `The e-signature was not recorded — ${sign.error ?? 'no actionId returned'}. Nothing was ${GOVERNED_PAST[f.kind]}.`,
      );
    }
    // Transmit, the Shadow Review waiver (P-34), closing a finding (P-35) and
    // retirement (P-86) each have their own act after the signature; freeze and
    // dispatch share one.
    const ownAct: Partial<Record<GovernedKind, typeof runTransmit>> = {
      transmit: runTransmit,
      'shadow-waiver': runWaiver,
      'shadow-finding-disposition': runDisposition,
      retire: runRetire,
      'held-send-settlement': runSettlement,
    };
    const act = ownAct[f.kind];
    if (act) return act(f, sign.data.actionId, input, sign.data.sha256Chain);
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

  /** Transmit: POST /sequences/:id/transmit with the signature, the environment
   *  and the agency application number. `transmitted: false` is the server's
   *  honest "nothing was sent" (gateway_not_configured) and is shown as such,
   *  never as a success. */
  const runTransmit = async (
    f: GovernedFlow,
    signatureActionId: string,
    input: { meaning: EsigMeaning; reason: string },
    hash: string | undefined,
  ) => {
    const done = await mutateVerbatim<TransmitAnswer>(
      'POST',
      `/api/submissions/sequences/${f.seq.id}/transmit`,
      { signatureActionId, environment: f.transmit?.environment, applicationId: f.transmit?.applicationId },
    );
    if (done.error || !done.data || typeof done.data.transmitted !== 'boolean') {
      // The server's own sentence says whether anything reached the agency: a
      // refusal before the wire says nothing was sent, a failure after it says the
      // agency may hold the package. Nothing is added that could contradict it
      // (F1, row D7, 2026-11-08). A send to the agency's test environment files
      // nothing whatever became of it, so that is said.
      const after = f.transmit?.environment === 'staging' ? ` ${TEST_SEND_NOT_A_FILING}, so nothing was filed.` : '';
      throw new Error(`${clause(done.error ?? 'The server did not confirm the transmit; check the transmittal list before sending again')}.${after}`);
    }
    setSeqBump((b) => b + 1);
    if (!done.data.transmitted) throw new Error(notTransmittedSentence(done.data, f.transmit?.environment));
    setNotice({
      tone: 'ok',
      text: transmittedSentence(
        f.seq, done.data, f.transmit?.environment,
        `signed by ${signerLabel} (${input.meaning}), server-confirmed under signature ${signatureActionId}`,
      ),
    });
    return { meaning: input.meaning, reason: input.reason, signedAt: new Date().toISOString(), hash };
  };

  /** The Shadow Review waiver (P-34): POST /sequences/:id/shadow-review/waive
   *  with the signature and the failed run it answers. A refusal or an
   *  unconfirmed answer throws (the modal shows it; no success). The Dispatch
   *  tab is read again whatever the answer: a waive moves no status. */
  const runWaiver = async (
    f: GovernedFlow,
    signatureActionId: string,
    input: { meaning: EsigMeaning; reason: string },
    hash: string | undefined,
  ) => {
    // precheckAnswer refused a waiver flow without its run before anything was signed.
    if (!f.waiver) throw new Error('No failed Shadow Review run is named for this waiver. Nothing was waived.');
    try {
      const done = await submitShadowWaiver(f.seq, signatureActionId, f.waiver);
      setNotice({ tone: 'ok', text: `${done} — signed by ${signerLabel} (${input.meaning}), server-confirmed under signature ${signatureActionId}.` });
      return { meaning: input.meaning, reason: input.reason, signedAt: new Date().toISOString(), hash };
    } finally {
      setReadinessBump((b) => b + 1);
    }
  };

  /** Closing a critical finding (P-35): POST …/findings/:findingId/disposition
   *  with the signature and the disposition. A refusal or an unconfirmed
   *  answer throws (the modal shows it; no success). The findings are read
   *  again whatever the answer: a disposition moves no sequence status. */
  const runDisposition = async (
    f: GovernedFlow,
    signatureActionId: string,
    input: { meaning: EsigMeaning; reason: string },
    hash: string | undefined,
  ) => {
    // precheckAnswer refused a disposition flow without its finding before anything was signed.
    if (!f.disposition) throw new Error('No finding is named to close. Nothing was closed.');
    try {
      const done = await submitFindingDisposition(f.seq, signatureActionId, f.disposition);
      setNotice({ tone: 'ok', text: `${done} — signed by ${signerLabel} (${input.meaning}), server-confirmed under signature ${signatureActionId}.` });
      return { meaning: input.meaning, reason: input.reason, signedAt: new Date().toISOString(), hash };
    } finally {
      setReadinessBump((b) => b + 1);
    }
  };

  /** Retirement (P-86 C3): POST /sequences/:id/retire with the signature. Only the server saying that THIS sequence
   *  was retired is a success; any other answer throws its words (the modal shows them inline) and nothing is said
   *  retired. The notice carries no signature id and no record key (plan §2's retired patterns): the id stays in the
   *  audit trail. The sequences are read again whatever the answer, so a retired one leaves the picker. */
  const runRetire = async (
    f: GovernedFlow,
    signatureActionId: string,
    input: { meaning: EsigMeaning; reason: string },
    hash: string | undefined,
  ) => {
    const n = f.seq.sequenceNumber;
    try {
      const done = await mutateVerbatim<{ retired?: unknown; sequenceId?: unknown; numberFreed?: unknown }>(
        'POST', `/api/submissions/sequences/${f.seq.id}/retire`, { signatureActionId },
      );
      if (done.error) throw new Error(blockerForDisplay(done.error));
      if (done.data?.retired !== true || done.data.sequenceId !== f.seq.id) {
        throw new Error(`The server did not confirm that sequence ${n} was retired. Check whether it is still listed before signing again.`);
      }
      const number = done.data.numberFreed === true
        ? ` Its number is free: start sequence ${n} again from the Sequences tab.`
        : done.data.numberFreed === false ? ` Another sequence ${n} is in use, so the number stays taken.` : '';
      setNotice({ tone: 'ok', text: `Sequence ${n} is retired, signed by ${signerLabel} (${input.meaning}).${number}` });
      return { meaning: input.meaning, reason: input.reason, signedAt: new Date().toISOString(), hash };
    } finally {
      setSeqBump((b) => b + 1);
    }
  };

  /** The settlement's act (P-92 C2): only a server answer that says this sequence's held send was settled, the way it
   *  was signed, is a success; any other answer is the server's words, or that it did not confirm. */
  const runSettlement = async (
    f: GovernedFlow,
    signatureActionId: string,
    input: { meaning: EsigMeaning; reason: string },
    hash: string | undefined,
  ) => {
    const outcome = f.settlement?.outcome;
    try {
      const done = await mutateVerbatim<{ settled?: unknown; sequenceId?: unknown; outcome?: unknown }>(
        'POST', `/api/submissions/sequences/${f.seq.id}/held-send/settle`, { signatureActionId, outcome },
      );
      if (done.error) throw new Error(blockerForDisplay(done.error));
      if (done.data?.settled !== true || done.data.sequenceId !== f.seq.id || done.data.outcome !== outcome) {
        throw new Error(`The server did not confirm that sequence ${f.seq.sequenceNumber}'s held send was settled. Check its Dispatch tab before signing again.`);
      }
      setNotice({ tone: 'ok', text: settledNotice(f, signerLabel, input.meaning) });
      return { meaning: input.meaning, reason: input.reason, signedAt: new Date().toISOString(), hash };
    } finally {
      setReadinessBump((b) => b + 1);
    }
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
      if (subs.loading)
        return { ok: false, reason: 'The submission portfolio is still loading.', retry: true };
      if (subs.error) return { ok: false, reason: 'The submission portfolio could not be read.' };
      const listed = () => listedChoices(list.map((s) => s.title), 'Submissions listed');
      if (!wanted) return { ok: false, reason: `No submission named.${listed()}` };
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
              ? `"${params.submission}" matches ${contains.length} submissions — name one exactly.${listedChoices(
                  contains.map((s) => s.title),
                  'Matches',
                )}`
              : scopedTo
                ? `${scopedMissReason(params.submission ?? '', openProjectKnownName, notOffered)}${listed()}`
                : `No submission named "${params.submission}" in this portfolio.${listed()}`,
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
  const regL = (v: string) => SC_REGIONS.find((a) => a.v === v)?.l ?? v;

  /* What AnA can see of this screen.
     The Submission Center is seven workspaces over one selected submission and
     one selected sequence, and every question a user asks here is about THAT
     pair — "is this ready to dispatch?", "what is blocking 0002?". Until now she
     was told only that the surface was called "submission-center", so she could
     not name the submission the user was looking at, let alone its sequences.

     A FAILED read publishes the failure. `list` and `seqs.rows` are both []
     when the read threw, and reporting "no submissions" over an outage would be
     a confident claim about a customer's filing portfolio that nobody made. */
  // How many submissions are listed, and whose: the scope is stated to AnA, so
  // a project's list is never reported as the organization's portfolio.
  const portfolioCountLine = scopedTo
    ? `${list.length} submission(s) of the open project${openProjectKnownName ? ` ${openProjectKnownName}` : ''}` +
      (notOffered != null ? ` (${notOffered} other submission(s) of the organization not listed)` : '')
    : `${list.length} submission(s) in the portfolio`;
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
        portfolioCountLine +
        (sub
          ? `, "${sub.title}" selected — ${appL(sub.applicationType)} · ${regL(sub.primaryRegion)}, at the ` +
            `${sub.lifecycleStage} stage, ${seqLine}` +
            (seq ? `, working sequence ${seq.sequenceNumber} (${seq.status})` : '')
          : ', none selected'),
      facts: {
        workspace: ws,
        totalSubmissions: list.length,
        /* Which submissions `totalSubmissions` counts: the open project's, with
           the server's count of the organization's others, or all of them. */
        listScope: scopedTo ? { project: openProjectKnownName, programId: scopedTo, otherSubmissionsNotListed: notOffered } : 'organization',
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
        ...deviceFilingFacts(showDeviceFilings, { loading: deviceRes.loading, error: deviceRes.error }, deviceFilings.length, assembly),
        lastServerNotice: notice ? { tone: notice.tone, text: notice.text } : null,
        /* The Planner's region profile. The three outcomes are kept apart here
           for the same reason they are on screen: an assistant told only
           "requiredModule1: []" will report that nothing is required, which is
           true for none of the three cases below. */
        regionProfile: profile.loading
          ? 'loading'
          : profile.status === 404
            ? {
                state: 'not-codified',
                region: sub?.primaryRegion ?? null,
                detail:
                  'No region profile is registered for this region. Required Module 1 sections, forms and gateway rules have NOT been codified — this is a rule-pack gap, never a statement that nothing is required.',
              }
            : profile.error || !profile.data
              ? { state: 'unreadable', detail: 'the region-profile read failed; requirements are unknown, not absent' }
              : {
                  state: 'codified',
                  agency: profile.data.agency,
                  pathways: profile.data.pathways ?? [],
                  /* Scoped to this application type — see requiredModule1For. */
                  requiredModule1ForThisApplicationType: requiredModule1For(
                    profile.data.module1Sections,
                    sub?.applicationType,
                  ).map((s) => ({ number: s.number, title: s.title })),
                  requiredForms: formsFor(profile.data.forms, sub?.applicationType)
                    .filter((f) => f.required)
                    .map((f) => ({ formId: f.formId ?? null, name: f.name })),
                  specificRequirements: profile.data.specificRequirements ?? [],
                  gatewayRuleCount: profile.data.validationRuleCount ?? 0,
                },
      },
      availableActions: [
        'Switch workspace — planner, sequences, builder, validation, shadow review, dispatch',
        'Select a different submission from the portfolio picker',
        ...(openProjectName ? ["List all of the organization's submissions, or only the open project's"] : []),
        'Select the working sequence the build and validation workspaces act on',
        'Move a sequence through its non-governed lifecycle transitions',
        'Freeze or dispatch a sequence (each requires a Part 11 e-signature and a clear gate; a missing release signature never blocks a freeze)',
        ...(showDeviceFilings ? ['Open a tracked eSTAR device filing in the 510(k) surface'] : []),
      ],
    };
  }, [
    subs.loading, subs.error, list, sub, ws, seqs.loading, seqs.error, seqs.rows, seq,
    scopedTo, openProjectName, openProjectKnownName, notOffered, portfolioCountLine,
    showDeviceFilings, deviceRes.loading, deviceRes.error, deviceFilings.length, assembly, notice,
    profile.loading, profile.error, profile.data,
  ]);
  usePublishSurfaceContext('submission-center', anaContext);

  /* The page's one-sentence state (D7 §A.4 step 2): what the deleted AnswerLead's headline said, as a plain
     sentence. While the sequences are in flight or unreadable it says so and never counts them (seqState). */
  const latestSeq = seqs.rows.reduce<(typeof seqs.rows)[number] | null>(
    (a, r) => (!a || r.sequenceNumber > a.sequenceNumber ? r : a), null);
  const headSub = !sub
    ? "Plan, build, validate and dispatch each market's eCTD sequences."
    : `${appL(sub.applicationType)} · ${regL(sub.primaryRegion)}, ${sub.lifecycleStage}. ` + (
      seqState === 'loading' ? 'Loading its sequences…'
        : seqState === 'unreadable' ? 'Its sequences could not be read.'
          : !latestSeq ? 'No sequence yet.'
            : `${plural(seqs.rows.length, 'sequence', 'sequences')}: ${latestSeq.sequenceNumber}, ` +
              `${(SC_SEQ_STATUS[latestSeq.status]?.l ?? latestSeq.status).toLowerCase()}.`);

  return (
    <div className="sp sc-page" data-work-area="submission-center">
      <ProjectBack onNav={onNav} />
      <header className="ph">
        <div>
          <h1 className="ph-title">{getSurfaceMeta('submission-center').label}</h1>
          <p className="ph-sub" data-testid="sc-state">{headSub}</p>
        </div>
        <div className="ph-acts">
          {/* P-32: the IND forms and letters are a feature of this app, reached from the US IND they are filed in.
              The IND screen reads { submissionId } once on mount and opens that submission's checklist. */}
          {sub && onNav && isUsInd(sub) && available('ind-checklist') && (
            <button
              type="button"
              className="btn ghost"
              title="Form FDA 1571, the cover letter and the Letter of Authorization for this IND, on the IND screen"
              onClick={() => {
                stashNavParamsForTarget('ind-checklist', { submissionId: String(sub.id) });
                onNav('ind-checklist');
              }}
            >
              Forms and letters
            </button>
          )}
          {/* The compile screen, opened on the working sequence (FILING_SPINE.md F14). */}
          {seq && onNav && available('ectd-compile') && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => { stashNavParamsForTarget('ectd-compile', { sequenceId: String(seq.id) }); onNav('ectd-compile'); }}
            >
              Compile &amp; export
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            onClick={() => setNewOpen(true)}
            disabled={creating || (!openProgramId && programmes.rows.length === 0)}
            title={
              !openProgramId && programmes.rows.length === 0
                ? 'A submission belongs to a project, and this organization has none yet. Create one in Projects first.'
                : undefined
            }
          >
            {I.plus} New submission
          </button>
        </div>
      </header>

      {sub && (
        <div className="sp-starters" data-layout="row" role="group" aria-label="Ask AnA">
          {[
            { label: 'Where does this submission stand?', prompt: `Where does ${sub.title} stand, sequence by sequence, and what is next?` },
            { label: 'What blocks dispatch?', prompt: 'What blocks dispatch of the working sequence, and what clears each blocker?' },
            { label: 'Plan the next sequence', prompt: 'Plan the next sequence for this submission from its region profile.' },
          ].map((st) => (
            <button key={st.label} type="button" className="sp-starter" onClick={() => onAsk(st.prompt)}>
              <span className="sk" aria-hidden="true">{I.sparkles}</span><span>{st.label}</span>
            </button>
          ))}
        </div>
      )}

      {(list.length > 0 || openProjectName) && (
        <div className="sc-context" data-testid="sc-context">
          {list.length > 0 && (
            <label className="sc-context-f">
              <span>Submission</span>
              <select
                className="c2c-input"
                aria-label="Submission to work on"
                value={sub?.id ?? ''}
                onChange={(e) => setSelSub(Number(e.target.value))}
              >
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {appL(s.applicationType)} · {regL(s.primaryRegion)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* The working sequence (D7-A2 step 8), once this submission's sequences are read. */}
          {sub && !seqs.loading && !seqs.error && <SeqSelect rows={seqs.rows} selId={seq?.id ?? null} onSel={setSelSeq} />}
          {openProjectName && (
            <ProjectScopeToggle scoped={Boolean(scopedTo)} notOffered={notOffered} onToggle={() => setOrgWide((w) => !w)} />
          )}
        </div>
      )}

      {/* P-14's remedy: a submission the server records with no project is
          anchored here (POST /api/submissions/:id/program-anchor). */}
      {sub && sub.programId === null && (
        <SubmissionProgramAnchor
          submission={sub}
          onAnchored={(n) => {
            setNotice(n);
            setSubsBump((b) => b + 1);
          }}
        />
      )}

      <div className="tabs" role="tablist" aria-label="Workspaces">
        {SUBMISSION_WORKSPACES.map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={ws === w.id}
            className="tab"
            onClick={() => setWs(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* The latest server verdict (transition / governed outcome) — verbatim. */}
      <VerdictNote notice={visibleSubmissionNotice(notice, builderOwner.current.generation, seq?.id)} />
      <VerdictNote notice={navMiss} />
      {filingLinkError && <p role="alert" className="sp-state">{filingLinkError}</p>}
      {filingTarget && ws === 'portfolio' && <TrackedFilingDetail filingId={filingTarget} onClose={() => setFilingTarget(null)} />}
      {/* The filing's own history, under its record (fold F5 item 1). */}
      {filingTarget && ws === 'portfolio' && <TrackedFilingHistory filingId={filingTarget} />}
      {navMiss?.tone === 'err' && <button type="button" className="btn ghost"
        onClick={() => {
          if (ceremonyOpen() || flow || acting !== null) return;
          setSubsBump(value => value + 1);
          setSeqBump(value => value + 1);
        }}>Retry linked submission</button>}

      {newOpen && (
        <NewSubmissionForm
          openProgramId={openProgramId}
          openProjectName={openProjectName}
          workspace={shell?.ws}
          projectSubmissions={openProgramId ? list.filter((x) => x.programId === openProgramId) : []}
          submissionsSettled={!subs.loading}
          submissionsUnread={!!subs.error}
          programmes={programmes.rows}
          creating={creating}
          onCancel={() => setNewOpen(false)}
          onSubmit={createSubmission}
        />
      )}

      {ws === 'portfolio' && (
        <>
        <section className="pj-sec" aria-labelledby="sc-subs-h">
          <div className="pj-sec-h">
            <h2 id="sc-subs-h">Submissions</h2>
            {!subs.loading && !subs.error && <span className="sec-sub">{list.length}</span>}
          </div>
          <div className="sc-tbl">
            {subs.loading ? (
              <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
                Loading submissions…
              </div>
            ) : subs.error ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the submissions"
                hint={
                  scopedTo
                    ? "The canonical submission core didn't respond, so this project's submissions could not be read — sign in and retry, or check the service is reachable."
                    : "The canonical submission core didn't respond. These are your organization's submissions — sign in and retry, or check the service is reachable."
                }
              />
            ) : subs.empty && scopedTo ? (
              <EmptyState
                icon={I.fileText}
                title={`No submissions for ${openProjectName} yet`}
                hint="Create this project's first submission to plan, assemble, validate and dispatch a regulatory sequence."
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
                    <th>Project</th>
                    <th>Region</th>
                    <th>Type</th>
                    <th>Client</th>
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
                        {/* The row opens on click. A <tr> cannot take focus without
                            losing its table semantics, so the title is the keyboard
                            affordance: a real button styled as the text it wraps.
                            Its click (mouse or Enter/Space) bubbles to the row's
                            handler, so there is one open path, not two (SC 2.1.1). */}
                        <button type="button" className="sc-subrow-open" aria-label={`Open ${s.title}`}>
                          <b>{s.title}</b>
                        </button>
                        {/* The project is said by the back link when the list is the open project's. */}
                        {[s.productName ? `Product ${s.productName}` : null, scopedTo ? null : programOf(s)]
                          .filter(Boolean)
                          .map((part) => <span key={part} className="sp-row-s"> · {part}</span>)}
                      </td>
                      <td>{regL(s.primaryRegion)}</td>
                      <td>{appL(s.applicationType)}</td>
                      <td className="sc-cap">{s.clientType}</td>
                      <td>
                        {/* Status and stage are two fields that start equal ("planning"): the stage is said only
                            when it differs, so one column carries both without repeating either. */}
                        <span className={`rd-chip tone-${SUB_STATUS_TONE[s.status] ?? 'idle'}`}>
                          {SUB_STATUS_LABEL[s.status] ?? s.status}
                        </span>
                        {s.lifecycleStage && s.lifecycleStage.toLowerCase() !== String(s.status).toLowerCase() && (
                          <span className="sp-row-s sc-cap"> · {s.lifecycleStage}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {showDeviceFilings && <DeviceFilingsCard
          res={deviceRes}
          filings={deviceFilings}
          assembly={assembly}
          pathway={{ available: available('device-510k'), label: getSurfaceMeta('device-510k').label }}
          onOpenFiling={(f) => {
            if (entryBusy.current()) {
              setNotice({ tone: 'err', text: 'Finish or cancel the open governed form, then open this tracked filing.' });
              return;
            }
            if (!isTrackedFilingId(f.id)) {
              setFilingLinkError('This tracked filing has an invalid identifier and could not be opened.');
              return;
            }
            setFilingLinkError(null); setNavTarget(null); setFilingTarget(f.id);
          }}
          onOpenPathway={() => onNav && onNav('device-510k')}
        />}
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
            {/* ── The region profile itself ────────────────────────────────
                The prose above used to NAME this profile's contents over a
                screen that never read them. It is read now, with the 404 for
                an unprofiled region kept distinct from an empty one. */}
            <div className="sc-mt">
              {profile.loading ? (
                <EmptyState icon={I.globe} title="Loading the region profile…" busy />
              ) : profile.status === 404 ? (
                /* THE 404, TESTED BEFORE THE GENERIC ERROR. Seven of the twelve
                   regions the selector offers have no codified profile, and the
                   route answers 404 for each. That is a different fact from a
                   failed read — nobody has codified this region, so there is
                   nothing to retry — and it must not be reported as either a
                   transient failure or an empty requirement set. Ordering
                   matters: useLiveData sets `error` for every non-OK status, so
                   a 404 checked after `error` is unreachable. */
                <EmptyState
                  icon={I.globe}
                  title={`No region profile is registered for ${regL(sub.primaryRegion)}`}
                  hint="Required Module 1 sections, agency forms and gateway validation rules have not been codified for this region. Their absence here is a gap in the rule pack, not a statement that nothing is required — plan this filing against the agency’s own guidance."
                />
              ) : profile.error || !profile.data ? (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title={`Couldn’t load the ${regL(sub.primaryRegion)} region profile`}
                  hint="The profile read did not complete, so the required Module 1 sections and validation rules below are unknown — this is a failed read, not an empty requirement set."
                />
              ) : (
                <>
                  <div className="tl-spec-grid sc-spec">
                    <div className="tl-spec-row">
                      <span className="tl-spec-k">Agency</span>
                      <span className="tl-spec-v">{profile.data.agency}</span>
                    </div>
                    <div className="tl-spec-row">
                      <span className="tl-spec-k">Pathways</span>
                      <span className="tl-spec-v">
                        {profile.data.pathways?.length ? profile.data.pathways.map(pathwayName).join(' · ') : '—'}
                      </span>
                    </div>
                    <div className="tl-spec-row">
                      <span className="tl-spec-k">Codified gateway rules</span>
                      <span className="tl-spec-v">{profile.data.validationRuleCount ?? 0}</span>
                    </div>
                  </div>

                  {/* Required Module 1, scoped to THIS application type. */}
                  {(() => {
                    const req = requiredModule1For(profile.data.module1Sections, sub.applicationType);
                    return (
                      <div className="sc-mt">
                        <div className="tl-spec-k sc-mb">
                          Required Module 1 for {appL(sub.applicationType)} · {req.length}
                        </div>
                        {req.length === 0 ? (
                          <div className="scaf-note">
                            The profile codifies no Module 1 section as required for{' '}
                            {appL(sub.applicationType)} specifically. Sections required for other
                            application types are not listed here.
                          </div>
                        ) : (
                          <div className="sc-chiprow">
                            {req.map((s) => (
                              <span key={s.number} className="rd-chip tone-idle" title={s.description}>
                                {s.number} {s.title}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Agency forms. */}
                  {formsFor(profile.data.forms, sub.applicationType).length > 0 && (
                    <div className="sc-mt">
                      <div className="tl-spec-k sc-mb">Agency forms</div>
                      <div className="sc-chiprow">
                        {formsFor(profile.data.forms, sub.applicationType).map((f) => (
                          <span
                            key={f.formId ?? f.name}
                            className={`rd-chip tone-${f.required ? 'warn' : 'idle'}`}
                            title={f.description}
                          >
                            {f.formId ? `${f.formId} · ` : ''}
                            {f.name}
                            {f.required ? ' (required)' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Region-specific requirements, verbatim from the profile. */}
                  {profile.data.specificRequirements?.length > 0 && (
                    <div className="sc-mt">
                      <div className="tl-spec-k sc-mb">Region-specific requirements</div>
                      <ul className="sc-blockers">
                        {profile.data.specificRequirements.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* The gateway rules this filing will be validated against —
                      the same codified set the hardened validator enforces at
                      package time, shown here BEFORE the package is built. */}
                  {profile.data.validationRules?.length > 0 && (
                    <div className="sc-mt">
                      <div className="tl-spec-k sc-mb">
                        Gateway validation rules · {profile.data.validationRules.length}
                      </div>
                      <div className="sc-chiprow">
                        {profile.data.validationRules.map((r) => (
                          <span
                            key={r.id}
                            className={`rd-chip tone-${r.severity === 'error' ? 'err' : r.severity === 'warning' ? 'warn' : 'idle'}`}
                            title={`${r.description} — ${r.citation}`}
                          >
                            {r.id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
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

      {/* Builder / Validation / Shadow review / Dispatch — the
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
          <SeqPicker loading={seqs.loading} error={seqs.error} rows={seqs.rows} />
          {!seqs.loading && !seqs.error && seq && (
            <>
              {ws === 'builder' && (
                <BuilderWorkspace key={`${readSession.key}:${builderGeneration}:${seq.id}`} seq={seq} submission={sub}
                  session={readSession} scopeContext={`${builderContext}:${builderGeneration}`} isScopeCurrent={builderIsCurrent}
                  onSequenceChanged={builderSequenceChanged} onNav={onNav}
                  section={navTarget?.section && sectionUsed !== navTarget && String(seq.id) === navTarget.sequenceId ? navTarget.section : null}
                  onSectionApplied={() => setSectionUsed(navTarget)} />
              )}
              {ws === 'validation' && <ValidationWorkspace key={seq.id} sub={sub} seq={seq} />}
              {ws === 'shadow-review' && (
                <ShadowReviewWorkspace
                  key={seq.id}
                  seq={seq}
                  reread={readinessBump}
                  onDisposition={(s, d) => void requestGoverned(s, 'shadow-finding-disposition', { disposition: d })}
                />
              )}
              {ws === 'required-deliverables' && <SubmissionRequiredDeliverables
                key={`${readSession.key}:${sequenceContext}:${seq.id}`}
                sub={sub} seq={seq} session={readSession} context={sequenceContext} openProgramId={openProgramId}
                onNav={onNav} onValidation={() => setWs('validation')}
              />}
              {ws === 'dispatch' && (
                <DispatchWorkspace
                  key={`${seq.id}:${seq.status}:${readinessBump}`}
                  sub={sub}
                  seq={seq}
                  onNav={onNav}
                  onGoverned={(s, kind, transmit, waiver, settlement) => void requestGoverned(s, kind, { transmit, waiver, settlement })}
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
              <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
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
                <FiledBaselineSlot read={filedRead} submissionId={sub.id} signer={esignSigner} onDeclared={() => setSeqBump((b) => b + 1)} />
                {filedRead.baseline ? (
                  <NextSequenceControl
                    sub={sub}
                    rows={seqs.rows}
                    baseline={filedRead.baseline}
                    type={nextSeqType}
                    onType={setNextSeqType}
                    busy={creatingSeq}
                    onStart={(n) => void startSequence(sub, n, nextSeqType)}
                  />
                ) : numberingKnown(filedRead) ? (
                  <>
                    <EmptyState
                      icon={I.gitBranch}
                      title="No sequences yet"
                      hint="Create the first eCTD sequence (0000) to begin assembling this submission."
                    />
                    <div className="cm-pushbar sc-mt">
                      {/* The hairline secondary, as NextSequenceControl's: not the view's primary, and no spark. */}
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => void startSequence(sub, '0000', 'original')}
                        disabled={creatingSeq}
                      >
                        {creatingSeq ? 'Creating…' : 'Start sequence 0000'}
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <div className="scaf-note sc-mb">
                  Transitions POST the real lifecycle endpoint and the server&#39;s verdict is shown
                  verbatim. Freeze and Dispatch are irreversible — the generic endpoint refuses
                  them, so those two open the Part 11 e-signature chain instead. Selecting a row
                  sets the working sequence for the Builder, Validation, Shadow review
                  and Dispatch workspaces.
                </div>
                <FiledBaselineSlot read={filedRead} submissionId={sub.id} signer={esignSigner} onDeclared={() => setSeqBump((b) => b + 1)} />
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
                      {s.status === 'validated' && s.validationStatus !== 'passed' ? (
                        /* A stage stored before 0e50993c5 recorded the verdict
                           with it (QA 2026-10-08, j7 finding 20). */
                        <span className="sp-q-s" data-validated-stage="unrecorded">
                          no validation recorded
                        </span>
                      ) : null}
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
                                  ? to === 'frozen'
                                    ? 'Governed — Part 11 e-signature and a clear freeze gate required. A missing release signature does not block a freeze.'
                                    : 'Governed — Part 11 e-signature and a clear dispatch gate required'
                                  : 'Lifecycle transition — the server enforces which transitions are legal'
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelSeq(s.id);
                                if (governed) {
                                  void requestGoverned(s, to === 'frozen' ? 'freeze' : 'dispatch');
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
                {numberingKnown(filedRead) && (
                  <NextSequenceControl
                    sub={sub}
                    rows={seqs.rows}
                    baseline={filedRead.baseline}
                    type={nextSeqType}
                    onType={setNextSeqType}
                    busy={creatingSeq}
                    onStart={(n) => void startSequence(sub, n, nextSeqType)}
                  />
                )}
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
          {...governedSigning(flow, regL(flow.seq.region))}
          target={`Sequence ${flow.seq.sequenceNumber} · ${sub.title}`}
          signer={esignSigner}
          // The server's re-authentication demands the authenticator code
          // whenever the signer has one enrolled; without this the modal never
          // asked for it and an enrolled signer could not freeze or dispatch.
          requireMfa={authUser?.mfaEnabled === true}
          onClose={() => setFlow(null)}
          onSign={(input) => runGoverned(flow, input)}
        />
      )}
    </div>
  );
}
