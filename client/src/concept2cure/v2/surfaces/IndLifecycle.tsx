import React, { useState, useMemo, useCallback } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { AnswerLead } from '../AnswerLead';
import { IndFormsPanel } from './IndFormsPanel';
import {
  INDL_STATUS_LABEL,
  INDL_CLOCK_STATUS,
  INDL_DELIVERABLES,
  indlReadiness,
  indlClock,
} from '../fixtures/ind-lifecycle-data';
import type {
  IndlClockState,
  IndlForm,
  IndlSection,
} from '../fixtures/ind-lifecycle-data';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob } from '../download';
import { readShellProject } from '../shellProject';

/* ── Live read shape: one org-scoped IND checklist (GET /api/ind-checklist).
   Assembled by server/services/ind-lifecycle/ind-checklist-view-assembler.ts from
   the REAL eCTD submission core (submissions + ectd_sequences + submission_leaves +
   coauthor_documents) to exactly the keys this surface renders. drugName /
   productName / indication / sponsorName / submissionType are `| null` and rendered
   null-safe — never fabricated (indication has no column and is honestly null;
   sponsor is the tenant org). targetReceiptDate is the org's RECORDED
   regulatory_programs.target_submission_date (resolved by identity match) or an
   honest null — the clock card then says "no target date set" instead of
   projecting from an invented offset. forms/sections are always arrays (the
   assembler returns [] when nothing is authored yet). */
interface IndlChecklist {
  /** The REAL submissions.id the checklist was assembled from — the anchor the
      lifecycle /file routes need to create an ectd_sequences row. Optional so an
      older server shape degrades to "cannot file" honestly, never to a guess. */
  submissionId?: number | null;
  code: string;
  drugName: string | null;
  productName: string | null;
  indication: string | null;
  sponsorName: string | null;
  submissionType: string | null;
  targetReceiptDate: string | null;
  forms: IndlForm[];
  sections: IndlSection[];
}

/* The assembled IND cover letter (POST /api/ind-lifecycle/cover-letter) —
   deterministic server model; `gaps` are the SERVER's verdict on missing
   required fields, never a client guess. */
interface CoverLetterResult {
  body: string;
  gaps: string[];
}

/* ── Generic wired-deliverable model — mirrors the cover-letter exemplar ──
   Every wired card does the same four honest things: (1) a real POST to its
   documented route carrying the loaded checklist's identity plus the
   particulars entered on the card, (2) renders the SERVER's returned model and
   its gap verdict, (3) offers the /pdf render via the same blob-download idiom,
   and (4) for the lifecycle deliverables with a filing counterpart
   (safety-report / annual-report / amendment →
   server/routes/ind-lifecycle/filing.routes.ts), a "File into sequence"
   follow-up after a successful build that creates a REAL ectd_sequences row
   (+ submission_leaves) through createSequence/upsertLeaf. Failures are
   reported in the server's words — never as success. */
interface DelivView {
  /** The server's model, flattened to readable text — response data only. */
  text: string;
  /** The server's gap verdict (empty exactly when the server reported none). */
  gaps: string[];
  /** Whether THIS build can be filed (a NOT_REPORTABLE event cannot). */
  canFile: boolean;
  /** Honest note shown in place of the file action when filing is unavailable. */
  fileNote?: string;
}
interface DelivRun {
  busy: boolean;
  error: string;
  view: DelivView | null;
  filing: boolean;
  fileError: string;
  filed: { sequenceNumber: string; sequenceId: number | string; leafCount: number } | null;
}
const EMPTY_RUN: DelivRun = { busy: false, error: '', view: null, filing: false, fileError: '', filed: null };

interface DelivField {
  key: string;
  label: string;
  kind: 'text' | 'date' | 'textarea' | 'select';
  options?: Array<{ v: string; label: string }>;
  placeholder?: string;
}

interface WiredDeliverable {
  assemblePath: string;
  pdf?: { path: string; filename: string };
  /** The filing counterpart route (creates the ectd_sequences row), if any. */
  file?: { path: string };
  fields: DelivField[];
  payload: () => Record<string, unknown>;
  toView: (json: unknown) => DelivView | null;
}

/** Flatten a server section tree ({heading, body, cfrRef?, children?}) to text. */
function sectionsText(sections: unknown): string {
  if (!Array.isArray(sections)) return '';
  return sections
    .map((s: any) => {
      const head = [s?.heading, s?.cfrRef ? `(${s.cfrRef})` : ''].filter(Boolean).join(' ');
      const body = typeof s?.body === 'string' && s.body.trim() !== '' ? s.body : '(empty)';
      const kids = Array.isArray(s?.children) && s.children.length > 0 ? '\n' + sectionsText(s.children) : '';
      return `${head}\n${body}${kids}`;
    })
    .join('\n\n');
}

/** Parse "topic | question" lines into numbered briefing questions. Only what
    the user typed goes up — an absent topic stays empty, never invented. */
function parseQuestions(raw: string): Array<{ number: number; topic: string; question: string }> {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const at = line.indexOf('|');
      return at >= 0
        ? { number: i + 1, topic: line.slice(0, at).trim(), question: line.slice(at + 1).trim() }
        : { number: i + 1, topic: '', question: line };
    });
}

/* Field option lists — the server enums, stated once. */
const OPTS = (vs: string[]) => vs.map((v) => ({ v, label: v }));
const MEETING_TYPES = [
  { v: 'pre_ind', label: 'Pre-IND' },
  { v: 'type_a', label: 'Type A' },
  { v: 'type_b', label: 'Type B' },
  { v: 'type_c', label: 'Type C' },
];
const REF_FILE_TYPES = OPTS(['DMF', 'IND', 'NDA', 'BLA']);
const EVENT_TYPES = [
  { v: 'SAE', label: 'SAE — serious adverse event' },
  { v: 'SUSAR', label: 'SUSAR' },
  { v: 'AESI', label: 'AESI' },
  { v: 'AE', label: 'AE — non-serious' },
];
const SERIOUSNESS = OPTS(['death', 'life_threatening', 'hospitalization', 'disability', 'congenital_anomaly', 'medically_important']);
const CAUSALITY = OPTS(['definite', 'probable', 'possible', 'unlikely', 'unrelated']);
const OUTCOME = OPTS(['recovered', 'recovering', 'not_recovered', 'fatal', 'unknown']);
const EXPECTEDNESS = [
  { v: '', label: 'Not assessed (treated as expected — no clock starts)' },
  { v: 'expected', label: 'Expected (listed in RSI)' },
  { v: 'unexpected', label: 'Unexpected (not listed in RSI)' },
];
const AMENDMENT_CATEGORIES = OPTS(['protocol', 'protocol_amendment_summary', 'new_investigator', 'cmc', 'pharmacology_toxicology', 'clinical_summary', 'investigators_brochure', 'other']);
const CHANGE_KINDS = OPTS(['added', 'revised', 'appended', 'withdrawn']);

/* Stable module-level empty seeds: useLiveRows synthesizes a fresh [] every
   render until the checklist resolves, so feeding these to the readiness memo
   (instead of an inline []) keeps its deps stable and avoids a render thrash. */
const EMPTY_FORMS: IndlForm[] = [];
const EMPTY_SECTIONS: IndlSection[] = [];

/* ── The open program, and which checklist row is really its IND ──
   The checklist endpoint is org-scoped and this surface used to render rows[0]
   unconditionally — so with two INDs in the org, the CMC build tab could be on
   one program while this screen silently showed the other's readiness. The
   program ↔ submission linkage is identity matching (product/title, the same
   convention ensureSubmissionSpine and the checklist assembler use), applied
   here so the screens agree. rows[0] remains the fallback when no program is
   open or no row matches — WITH the mismatch said out loud, never silently. */
interface ShellProjectRead {
  id?: unknown;
  title?: string;
  product?: string;
  code?: string;
}

/* The local copy of this reader is gone — `../shellProject` owns both ends of
   the window channel, and a second reader is how the two drift. */

function rowMatchesProgram(row: IndlChecklist, p: ShellProjectRead): boolean {
  const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();
  const programKeys = [p.title, p.product, p.code].map(norm).filter(Boolean);
  const rowKeys = [row.productName, row.drugName, row.code].map(norm).filter(Boolean);
  return programKeys.some((k) => rowKeys.includes(k));
}

/* ════ IND Lifecycle -- the deliverable-first IND workspace (21 CFR 312) ════ */

export function IndLifecycle({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;

  /* The org's IND checklist — GET /api/ind-checklist (assembled from the real eCTD
     submission core, org scoped). useLiveRows unwraps the { data } envelope; the
     surface renders one IND, so it reads the first row. Real data, an honest empty
     state, or an honest failed-load state — never a fixture. Readiness and the
     30-day clock are computed deterministically from the loaded forms/sections. */
  const { rows, loading, error } = useLiveRows<IndlChecklist>('/api/ind-checklist');
  /* Prefer the row that IS the open program's IND; fall back to the first row
     with the mismatch stated (scopeNote), never silently. */
  const shellProject = readShellProject();
  const matched = shellProject ? rows.find((r) => rowMatchesProgram(r, shellProject)) ?? null : null;
  const checklist = matched ?? rows[0] ?? null;
  const scopeNote =
    checklist == null
      ? null
      : matched
        ? rows.length > 1
          ? `Showing the open program's IND (${checklist.productName ?? checklist.code}) — ${rows.length - 1} other IND${rows.length > 2 ? 's' : ''} in this organization.`
          : null
        : shellProject
          ? `The open program (${shellProject.title ?? shellProject.id}) has no IND checklist yet — showing ${checklist.productName ?? checklist.code}, the organization's first.`
          : rows.length > 1
            ? `Showing ${checklist.productName ?? checklist.code} — ${rows.length - 1} other IND${rows.length > 2 ? 's' : ''} in this organization. Open a program to scope this screen to it.`
            : null;
  const [tab, setTab] = useState<'file' | 'lifecycle'>('file');
  // Status note from the Module-1 forms panel (build/QC/render outcomes).
  const [formsNote, setFormsNote] = useToast();

  /* AnA can switch between the File-the-IND checklist and the Lifecycle view —
     the same view-state toggle a person makes. The registry enum validates
     `tab`; the defensive guard keeps the handler honest if it drifts. */
  useSurfaceActionHandlers('ind-checklist', {
    'ind-checklist.open-tab': (params) => {
      const target = params.tab;
      if (target !== 'file' && target !== 'lifecycle') {
        return { ok: false, reason: `"${target}" is not an IND tab — choose file or lifecycle.` };
      }
      const label = target === 'file' ? 'File the IND' : 'Lifecycle';
      if (tab === target) return { ok: true, detail: `Already on the ${label} view` };
      setTab(target);
      return { ok: true, detail: `Opened the ${label} view` };
    },
  });

  // Null-safe derivation with stable empty seeds while the checklist is
  // unresolved (loading or failed load) so the readiness memo below is stable.
  const forms = checklist?.forms ?? EMPTY_FORMS;
  const sections = checklist?.sections ?? EMPTY_SECTIONS;
  const targetReceiptDate = checklist?.targetReceiptDate ?? null;

  const R = useMemo(() => indlReadiness(sections, forms), [sections, forms]);

  /* 30-day regulatory clock -- a PROJECTION from the org's RECORDED target
     submission date (regulatory_programs.target_submission_date). When no
     target date is set the clock is null and the card says so — nothing is
     projected from an invented offset. */
  const receiptDate = useMemo(
    () => (targetReceiptDate ? new Date(targetReceiptDate) : null),
    [targetReceiptDate],
  );
  const clock = useMemo<IndlClockState | null>(
    () => (receiptDate ? indlClock(receiptDate.toISOString()) : null),
    [receiptDate],
  );
  const clearDate = useMemo(
    () => (clock ? new Date(clock.thirtyDayDate) : null),
    [clock],
  );

  /* What AnA can see of this screen.
     `R.assessed` is the fact that must not be flattened. A checklist with
     nothing in it produces `assessed: false, ready: false, 0%` — and reporting
     that as "0% ready" would let AnA discuss an IND that was never evaluated as
     one that was evaluated and found wanting. `ready` is only ever true when
     `assessed` is, and both travel.

     The 30-day clock is null when the org has recorded no target submission
     date, and that is published as itself rather than as a clock at zero: the
     FDA 30-day review clock is a regulatory date, not a default. */
  const anaContext = useMemo(() => {
    /* `forms` / `sections` come off a live row, so they are only arrays when the
       column arrived as one. Same degrade-don't-crash rule the render obeys. */
    const formList = Array.isArray(forms) ? forms : [];
    const sectionList = Array.isArray(sections) ? sections : [];
    if (loading) {
      return { summary: 'The IND checklist is still loading; nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The IND checklist could not be read, so this screen is showing no filing readiness because of ' +
          'a failure, not because nothing is assembled.',
        availableActions: ['Retry the IND checklist read'],
      };
    }
    if (!checklist) {
      return {
        summary: 'IND lifecycle: this organisation has no IND checklist assembled yet, so there is no filing to work.',
      };
    }
    return {
      summary:
        `IND lifecycle for ${checklist.code}` +
        (checklist.drugName ? ` (${checklist.drugName})` : '') +
        `, "${tab === 'file' ? 'File the IND' : 'Lifecycle'}" tab. ` +
        (R.assessed
          ? `Readiness ${R.overallPercentage}% — ${R.requiredSections.completed} of ${R.requiredSections.total} ` +
            `required section(s) complete, ${formList.filter((f) => f.done).length} of ${formList.length} Module 1 ` +
            `form(s) done. ${R.ready ? 'Assessed READY to file.' : 'NOT yet ready to file.'}`
          : 'The checklist held nothing to evaluate, so filing readiness has NOT been assessed — this is not a zero-percent verdict.') +
        (clock
          ? ` The 30-day clock: ${clock.status}, ${clock.daysUntilThirtyDay} day(s) to the 30-day date, ` +
            `${clock.safeToProceed ? 'safe to proceed' : clock.onHold ? 'ON HOLD' : 'not yet cleared'}.`
          : ' No target submission date is recorded, so no 30-day clock is projected.'),
      facts: {
        openTab: tab,
        submissionId: checklist.submissionId ?? null,
        code: checklist.code,
        drugName: checklist.drugName,
        productName: checklist.productName,
        indication: checklist.indication,
        sponsor: checklist.sponsorName,
        submissionType: checklist.submissionType,
        readinessAssessed: R.assessed,
        readyToFile: R.ready,
        readinessPercent: R.assessed ? R.overallPercentage : null,
        requiredSections: R.assessed
          ? {
              total: R.requiredSections.total,
              completed: R.requiredSections.completed,
              incomplete: R.requiredSections.incomplete,
            }
          : null,
        module1Forms: formList.map((f) => ({ id: f.id, title: f.title, reference: f.ref, done: f.done })),
        sections: sectionList.slice(0, 24).map((sec) => ({
          code: sec.code, title: sec.title, module: sec.module, status: sec.status,
        })),
        thirtyDayClock: clock
          ? {
              status: clock.status, thirtyDayDate: clock.thirtyDayDate,
              daysUntil: clock.daysUntilThirtyDay, safeToProceed: clock.safeToProceed,
              onHold: clock.onHold, rationale: clock.rationale,
            }
          : null,
        targetSubmissionDateRecorded: Boolean(targetReceiptDate),
      },
      availableActions: [
        'Build, QC and render the Module 1 forms',
        'Generate an IND deliverable (cover letter and the other wired cards) and download its PDF',
        'File a sequence against the real submission record',
        'Switch between the file-the-IND and lifecycle tabs',
      ],
    };
  }, [loading, error, checklist, tab, R, forms, sections, clock, targetReceiptDate]);
  usePublishSurfaceContext('ind-checklist', anaContext);

  /* Cover-letter exemplar — the first deliverable wired end-to-end (POST
     /api/ind-lifecycle/cover-letter + /pdf). The other cards mirror it via the
     generic wired-deliverable runner below (see the DelivRun/WiredDeliverable
     model at the top of this file). */
  const [cl, setCl] = useState<{ busy: boolean; model: CoverLetterResult | null; error: string }>({
    busy: false,
    model: null,
    error: '',
  });

  /* Wired-deliverable state (the other cards, mirroring the exemplar): one run
     record per card, the card-local field entries, and the 4-digit eCTD
     sequence number for the filing follow-ups (user-entered — a sequence number
     is a deliberate regulatory decision, never guessed). */
  const [runs, setRuns] = useState<Record<string, DelivRun>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [seqNums, setSeqNums] = useState<Record<string, string>>({});
  const patchRun = useCallback((id: string, patch: Partial<DelivRun>) => {
    setRuns((r) => ({ ...r, [id]: { ...(r[id] ?? EMPTY_RUN), ...patch } }));
  }, []);
  const setFieldVal = useCallback((key: string, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
  }, []);
  const fmt = (d: Date | null) =>
    d
      ? d.toLocaleDateString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '--';

  /* Honest four-state render. The whole surface is one IND checklist, so a
     loading / failed-load / genuinely-empty read replaces the dashboard rather
     than showing a fabricated program. */
  const kicker = (
    <div className="surface-kicker">
      {/* The endpoint this reads from used to be printed here. A route in a
          client-facing eyebrow tells a regulatory user nothing and tells an
          outside reader the shape of the API — the information-disclosure class
          in the UAT report's BP-07, of which this was the last live instance.
          The regulation is the useful half; the route is documented above. */}
      {I.rocket} IND Lifecycle — 21 CFR 312
    </div>
  );
  if (loading) {
    return (
      <div className="page-inner indl" data-screen-label="IND Lifecycle">
        <div className="surface-head">
          <div>
            {kicker}
            <h1>IND lifecycle</h1>
          </div>
        </div>
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
          Loading the IND checklist…
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-inner indl" data-screen-label="IND Lifecycle">
        <div className="surface-head">
          <div>
            {kicker}
            <h1>IND lifecycle</h1>
          </div>
        </div>
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the IND checklist"
          hint="The org's IND checklist (21 CFR 312) didn't respond — this is your program's Module 1 forms and eCTD section state. Sign in and retry, or check the service is reachable."
        />
      </div>
    );
  }
  if (!checklist) {
    return (
      <div className="page-inner indl" data-screen-label="IND Lifecycle">
        <div className="surface-head">
          <div>
            {kicker}
            <h1>IND lifecycle</h1>
          </div>
        </div>
        <EmptyState
          icon={I.fileText}
          title="No IND checklist yet"
          hint="No Investigational New Drug application is provisioned for this organization yet. Once an IND is set up, its Module 1 forms (1571 / 1572 / 3674), eCTD section state, and 30-day safe-to-proceed clock appear here."
        />
      </div>
    );
  }

  /* checklist is a real, non-null row from here down. */
  const prog = checklist;
  const drug = prog.drugName ?? prog.code;
  // Honest chip: with no recorded target date there is no clock state to name.
  const cst = clock
    ? INDL_CLOCK_STATUS[clock.status] || { label: '--', tone: 'info' }
    : { label: 'No target date', tone: 'info' };
  const formsDone = forms.filter((f) => f.done).length;
  const deliverables = INDL_DELIVERABLES.filter((d) => d.group === tab);
  const stLabel = INDL_STATUS_LABEL;

  /* Cover-letter exemplar handlers — real POSTs against the real routes
     (server/routes/ind-lifecycle/documents.routes.ts). Identity comes from the
     loaded checklist only; a failure is reported honestly, never as success. */
  const coverLetterPayload = () => ({
    sponsorName: prog.sponsorName ?? '',
    drugName: drug,
    submissionType: 'original',
  });
  /** A caught throw reduced to a fragment safe to compose into a sentence.
      Only ApiRequestError has been through the envelope reduction in
      queryClient; every other throw reaching here is the browser's own, whose
      message is "Failed to fetch" / "Load failed" — a string this used to render
      verbatim because the test was only `instanceof Error`. */
  const failMsg = (e: unknown) =>
    (e as { name?: unknown })?.name === 'ApiRequestError' && (e as Error).message
      ? (e as Error).message
      : 'request failed';
  const assembleCoverLetter = async () => {
    setCl({ busy: true, model: null, error: '' });
    try {
      const res = await apiRequest('POST', '/api/ind-lifecycle/cover-letter', coverLetterPayload());
      if (!res.ok) {
        setCl({ busy: false, model: null, error: 'Could not assemble the cover letter — sign in and retry.' });
        return;
      }
      const json = (await res.json().catch(() => null)) as { body?: unknown; gaps?: unknown } | null;
      if (json && typeof json.body === 'string') {
        setCl({
          busy: false,
          model: { body: json.body, gaps: Array.isArray(json.gaps) ? json.gaps.map(String) : [] },
          error: '',
        });
      } else {
        setCl({ busy: false, model: null, error: 'Could not assemble the cover letter — unexpected response shape.' });
      }
    } catch (e) {
      setCl({ busy: false, model: null, error: 'Could not assemble the cover letter — ' + failMsg(e) + '.' });
    }
  };
  const downloadCoverLetterPdf = async () => {
    setCl((s) => ({ ...s, busy: true, error: '' }));
    try {
      const res = await apiRequest('POST', '/api/ind-lifecycle/cover-letter/pdf', coverLetterPayload());
      if (!res.ok) {
        setCl((s) => ({ ...s, busy: false, error: 'Could not render the cover letter PDF — sign in and retry.' }));
        return;
      }
      downloadBlob('ind-cover-letter.pdf', await res.blob());
      setCl((s) => ({ ...s, busy: false }));
    } catch (e) {
      setCl((s) => ({ ...s, busy: false, error: 'Could not render the cover letter PDF — ' + failMsg(e) + '.' }));
    }
  };

  /* ── The other deliverable cards, wired exactly like the exemplar ──
     Identity comes from the loaded checklist; particulars come from the card's
     own fields; the rendered model and every gap are the SERVER's verdict. */
  const runOf = (id: string): DelivRun => runs[id] ?? EMPTY_RUN;
  const fv = (k: string) => (fields[k] ?? '').trim();
  const sel = (k: string, opts: Array<{ v: string }>) => fv(k) || opts[0].v;
  /** The server's own words for a failure — never a cheerful paraphrase, and
      never the machine's words either. The second term used to be a bare
      `json.error` string, so an envelope shaped { error: 'ESIGN_REQUIRED',
      message: '<a real sentence>' } composed the enum token into the card's
      message; serverMessage reads the sentence first and refuses codes and
      infrastructure text. The last resort is a clause rather than a bare `HTTP
      500`, which is not user copy on its own. Trailing period trimmed so
      composed messages don't double it. */
  const serverErr = (json: any, st: number): string => {
    const m = serverMessage(json);
    if (m) return m.replace(/\.\s*$/, '');
    return st === 401 || st === 403
      ? 'sign in with a regulatory-author account and retry'
      : `the server could not complete it (HTTP ${st})`;
  };
  /** The submission the filing routes anchor to — the checklist's REAL
      submissions.id, or null (→ filing honestly unavailable, never guessed). */
  const submissionId =
    typeof prog.submissionId === 'number' && Number.isInteger(prog.submissionId) && prog.submissionId > 0
      ? prog.submissionId
      : null;

  const runAssemble = async (id: string, w: WiredDeliverable) => {
    patchRun(id, { busy: true, error: '', view: null, filed: null, fileError: '' });
    try {
      const res = await apiRequest('POST', w.assemblePath, w.payload());
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json) {
        patchRun(id, { busy: false, error: `Could not assemble — ${serverErr(json, res.status)}. Nothing was generated.` });
        return;
      }
      const view = w.toView(json);
      if (!view) {
        patchRun(id, { busy: false, error: 'Could not assemble — unexpected response shape.' });
        return;
      }
      patchRun(id, { busy: false, view });
    } catch (e) {
      patchRun(id, { busy: false, error: 'Could not assemble — ' + failMsg(e) + '.' });
    }
  };

  const runPdf = async (id: string, w: WiredDeliverable) => {
    if (!w.pdf) return;
    patchRun(id, { busy: true, error: '' });
    try {
      const res = await apiRequest('POST', w.pdf.path, w.payload());
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as any;
        patchRun(id, { busy: false, error: `Could not render the PDF — ${serverErr(json, res.status)}.` });
        return;
      }
      downloadBlob(w.pdf.filename, await res.blob());
      patchRun(id, { busy: false });
    } catch (e) {
      patchRun(id, { busy: false, error: 'Could not render the PDF — ' + failMsg(e) + '.' });
    }
  };

  /* File the built deliverable as a REAL eCTD sequence (+ leaves) via the
     filing counterpart (filing.routes.ts → createSequence + upsertLeaf). */
  const runFile = async (id: string, w: WiredDeliverable) => {
    if (!w.file) return;
    if (submissionId == null) {
      patchRun(id, { fileError: 'This checklist carries no submission id, so there is no eCTD application to file into — nothing was filed.' });
      return;
    }
    const seq = (seqNums[id] ?? '').trim();
    if (!/^\d{4}$/.test(seq)) {
      patchRun(id, { fileError: 'Enter the 4-digit eCTD sequence number (e.g. 0002). The sequence number is a deliberate regulatory decision — it is never guessed for you.' });
      return;
    }
    patchRun(id, { filing: true, fileError: '' });
    try {
      const res = await apiRequest('POST', w.file.path, { ...w.payload(), submissionId, sequenceNumber: seq });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.sequence) {
        patchRun(id, { filing: false, fileError: `Not filed — ${serverErr(json, res.status)}.` });
        return;
      }
      patchRun(id, {
        filing: false,
        filed: {
          sequenceNumber: String(json.sequence.sequenceNumber ?? seq),
          sequenceId: json.sequence.id,
          leafCount: Array.isArray(json.leaves) ? json.leaves.length : 0,
        },
      });
    } catch (e) {
      patchRun(id, { filing: false, fileError: 'Not filed — ' + failMsg(e) + '.' });
    }
  };

  /* Safety-report intake: only what the user entered goes up — an absent field
     reaches the server as absent, so classification never runs on invented
     data (the un-assessed expectedness default is the server's conservative
     "expected → no clock starts"). */
  const safetyEventPayload = (): Record<string, unknown> => {
    const ev: Record<string, unknown> = {
      eventType: sel('sr.eventType', EVENT_TYPES),
      seriousnessCriteria: sel('sr.seriousness', SERIOUSNESS),
      causality: sel('sr.causality', CAUSALITY),
      outcome: sel('sr.outcome', OUTCOME),
    };
    if (fv('sr.patientId')) ev.patientId = fv('sr.patientId');
    if (fv('sr.description')) ev.eventDescription = fv('sr.description');
    if (fv('sr.country')) ev.countryOfOccurrence = fv('sr.country');
    if (fv('sr.expectedness')) ev.expectedness = fv('sr.expectedness');
    if (fv('sr.onset')) ev.onsetDate = fv('sr.onset');
    if (fv('sr.aware')) ev.reportDate = fv('sr.aware');
    return { event: ev };
  };

  /* Annual-report intake. The period registers (study statuses, safety reports
     in period, IB changes) are not captured on this card; they go up as empty
     lists and the SERVER's gap verdict marks the affected sections incomplete —
     nothing is invented to fill them. */
  const annualReportPayload = (): Record<string, unknown> => ({
    productName: prog.productName ?? drug,
    indNumber: fv('ar.indNumber'),
    reportingPeriodStart: fv('ar.start'),
    reportingPeriodEnd: fv('ar.end'),
    studyStatuses: [],
    safetyReportsInPeriod: [],
    ibChanges: [],
    ...(fv('ar.safetySummary') ? { safetySummary: fv('ar.safetySummary') } : {}),
    ...(fv('ar.plan') ? { investigationalPlan: fv('ar.plan') } : {}),
  });

  /* Amendment intake: one changed document, entered by the user. An empty entry
     goes up as an empty list and the server answers IND_AMENDMENT_NO_DOCUMENTS
     verbatim — the plan never maps invented documents. */
  const amendmentPayload = (): Record<string, unknown> => {
    const hasDoc = fv('am.docId') !== '' || fv('am.title') !== '';
    return {
      ...(fv('am.indNumber') ? { indNumber: fv('am.indNumber') } : {}),
      changedDocuments: hasDoc
        ? [{
            documentId: fv('am.docId'),
            title: fv('am.title'),
            category: sel('am.category', AMENDMENT_CATEGORIES),
            changeKind: sel('am.changeKind', CHANGE_KINDS),
            ...(fv('am.leafGuid') ? { replacesLeafGuid: fv('am.leafGuid') } : {}),
          }]
        : [],
    };
  };

  const modelSectionsView = (json: any): DelivView | null =>
    json?.model && Array.isArray(json.model.sections)
      ? {
          text: sectionsText(json.model.sections),
          gaps: Array.isArray(json.model.gaps) ? json.model.gaps.map(String) : [],
          canFile: false,
        }
      : null;

  const wired: Record<string, WiredDeliverable> = {
    'briefing-book': {
      assemblePath: '/api/ind-lifecycle/briefing-book',
      pdf: { path: '/api/ind-lifecycle/briefing-book/pdf', filename: 'fda-briefing-book.pdf' },
      fields: [
        { key: 'bb.meetingType', label: 'Meeting type', kind: 'select', options: MEETING_TYPES },
        { key: 'bb.indication', label: 'Indication', kind: 'text' },
        { key: 'bb.background', label: 'Product background and rationale', kind: 'textarea' },
        { key: 'bb.nonclinical', label: 'Nonclinical data summary', kind: 'textarea' },
        { key: 'bb.plan', label: 'Proposed clinical development plan', kind: 'textarea' },
        { key: 'bb.questions', label: 'Questions for FDA (one per line, "topic | question")', kind: 'textarea' },
      ],
      payload: () => ({
        productName: prog.productName ?? drug,
        indication: fv('bb.indication'),
        meetingType: sel('bb.meetingType', MEETING_TYPES),
        questions: parseQuestions(fv('bb.questions')),
        ...(fv('bb.background') ? { productBackground: fv('bb.background') } : {}),
        ...(fv('bb.nonclinical') ? { nonclinicalSummary: fv('bb.nonclinical') } : {}),
        ...(fv('bb.plan') ? { proposedClinicalPlan: fv('bb.plan') } : {}),
      }),
      toView: (json: any) =>
        json && Array.isArray(json.sections)
          ? {
              text: sectionsText(json.sections),
              gaps: Array.isArray(json.gaps) ? json.gaps.map((g: any) => String(g?.message ?? g)) : [],
              canFile: false,
            }
          : null,
    },
    loa: {
      assemblePath: '/api/ind-lifecycle/loa',
      pdf: { path: '/api/ind-lifecycle/loa/pdf', filename: 'ind-letter-of-authorization.pdf' },
      fields: [
        { key: 'loa.type', label: 'Referenced file type', kind: 'select', options: REF_FILE_TYPES },
        { key: 'loa.number', label: 'Referenced file number', kind: 'text', placeholder: 'e.g. DMF 12345' },
        { key: 'loa.holder', label: 'File holder (grantor)', kind: 'text' },
        { key: 'loa.subject', label: 'Subject (drug substance / product)', kind: 'text' },
        { key: 'loa.signatory', label: 'Signatory (for the holder)', kind: 'text' },
      ],
      payload: () => ({
        referencedFileType: sel('loa.type', REF_FILE_TYPES),
        referencedFileNumber: fv('loa.number'),
        holderName: fv('loa.holder'),
        authorizedPartyName: prog.sponsorName ?? '',
        subjectName: fv('loa.subject'),
        signatoryName: fv('loa.signatory'),
      }),
      toView: modelSectionsView,
    },
    'right-of-reference': {
      assemblePath: '/api/ind-lifecycle/right-of-reference',
      pdf: { path: '/api/ind-lifecycle/right-of-reference/pdf', filename: 'ind-right-of-reference.pdf' },
      fields: [
        { key: 'ror.type', label: 'Referenced file type', kind: 'select', options: REF_FILE_TYPES },
        { key: 'ror.number', label: 'Referenced file number', kind: 'text' },
        { key: 'ror.subject', label: 'Subject (drug substance / product)', kind: 'text' },
        { key: 'ror.signatory', label: 'Signatory (for the sponsor)', kind: 'text' },
      ],
      payload: () => ({
        sponsorName: prog.sponsorName ?? '',
        referencedFileType: sel('ror.type', REF_FILE_TYPES),
        referencedFileNumber: fv('ror.number'),
        subjectName: fv('ror.subject'),
        signatoryName: fv('ror.signatory'),
      }),
      toView: modelSectionsView,
    },
    'safety-report': {
      assemblePath: '/api/ind-lifecycle/safety-report',
      pdf: { path: '/api/ind-lifecycle/safety-report/pdf', filename: 'ind-safety-report.pdf' },
      file: { path: '/api/ind-lifecycle/safety-report/file' },
      fields: [
        { key: 'sr.patientId', label: 'De-identified patient id', kind: 'text' },
        { key: 'sr.description', label: 'Event description', kind: 'textarea' },
        { key: 'sr.eventType', label: 'Event type', kind: 'select', options: EVENT_TYPES },
        { key: 'sr.seriousness', label: 'Seriousness criterion (ICH E2A)', kind: 'select', options: SERIOUSNESS },
        { key: 'sr.causality', label: 'Causality (WHO-UMC)', kind: 'select', options: CAUSALITY },
        { key: 'sr.outcome', label: 'Outcome', kind: 'select', options: OUTCOME },
        { key: 'sr.expectedness', label: 'Expectedness vs RSI', kind: 'select', options: EXPECTEDNESS },
        { key: 'sr.onset', label: 'Onset date', kind: 'date' },
        { key: 'sr.aware', label: 'Sponsor awareness date (clock start)', kind: 'date' },
        { key: 'sr.country', label: 'Country of occurrence (ISO-2)', kind: 'text', placeholder: 'e.g. US' },
      ],
      payload: safetyEventPayload,
      toView: (json: any) => {
        const cls = json?.classification;
        const doc = json?.document;
        if (!cls || !doc) return null;
        const deadline = cls.deadline ? new Date(cls.deadline) : null;
        const head = [
          `Obligation: ${cls.obligation}${cls.reportingWindowDays ? ` (${cls.reportingWindowDays}-day)` : ''}`,
          deadline && !Number.isNaN(deadline.getTime()) ? `Deadline: ${fmt(deadline)}` : '',
          String(cls.rationale ?? ''),
        ].filter(Boolean).join('\n');
        const notReportable = json.amendmentIntent == null;
        return {
          text: head + '\n\n' + sectionsText(doc.sections),
          gaps: [],
          canFile: !notReportable,
          fileNote: notReportable
            ? 'The server classified this event as not reportable as an individual expedited IND safety report — there is nothing to file.'
            : undefined,
        };
      },
    },
    'annual-report': {
      assemblePath: '/api/ind-lifecycle/annual-report',
      pdf: { path: '/api/ind-lifecycle/annual-report/pdf', filename: 'ind-annual-report.pdf' },
      file: { path: '/api/ind-lifecycle/annual-report/file' },
      fields: [
        { key: 'ar.indNumber', label: 'IND number', kind: 'text' },
        { key: 'ar.start', label: 'Reporting period start', kind: 'date' },
        { key: 'ar.end', label: 'Reporting period end', kind: 'date' },
        { key: 'ar.safetySummary', label: 'Summary of safety information (312.33(b))', kind: 'textarea' },
        { key: 'ar.plan', label: 'General investigational plan (312.33(c))', kind: 'textarea' },
      ],
      payload: annualReportPayload,
      toView: (json: any) =>
        json?.reportType === 'IND_ANNUAL_REPORT' && Array.isArray(json.sections)
          ? {
              text: sectionsText(json.sections),
              gaps: Array.isArray(json.gaps) ? json.gaps.map((g: any) => String(g?.message ?? g)) : [],
              canFile: true,
            }
          : null,
    },
    amendment: {
      assemblePath: '/api/ind-lifecycle/amendment-plan',
      file: { path: '/api/ind-lifecycle/amendment/file' },
      fields: [
        { key: 'am.indNumber', label: 'IND number', kind: 'text' },
        { key: 'am.docId', label: 'Changed document id / ref', kind: 'text' },
        { key: 'am.title', label: 'Changed document title', kind: 'text' },
        { key: 'am.category', label: 'Content category', kind: 'select', options: AMENDMENT_CATEGORIES },
        { key: 'am.changeKind', label: 'Change kind', kind: 'select', options: CHANGE_KINDS },
        { key: 'am.leafGuid', label: 'Prior leaf GUID (revise / append / withdraw)', kind: 'text' },
      ],
      payload: amendmentPayload,
      toView: (json: any) =>
        Array.isArray(json?.leaves)
          ? {
              text:
                json.leaves
                  .map((l: any) => `${l.sectionCode} · ${l.lifecycleOp} — ${l.title}${l.cfrRef ? ` (${l.cfrRef})` : ''}`)
                  .join('\n') || '(no leaves planned)',
              gaps: Array.isArray(json.warnings) ? json.warnings.map(String) : [],
              canFile: true,
            }
          : null,
    },
  };

  return (
    <div className="page-inner indl" data-screen-label="IND Lifecycle">
      <div className="surface-head">
        <div>
          {kicker}
          <h1>{drug} -- Initial IND</h1>
          <p className="surface-sub">
            {[prog.productName, prog.indication, prog.sponsorName, 'eCTD v4.0 (FDA)']
              .filter(Boolean)
              .join(' -- ')}
          </p>
          {/* Which IND this screen is scoped to, and why — stated whenever the
              answer is not trivially "the only one". The CMC build tab and this
              screen must never appear to describe the same program while
              reading two different submissions. */}
          {scopeNote && (
            <p className="surface-sub" data-testid="indl-scope-note">
              {scopeNote}
            </p>
          )}
        </div>
        <div className="surface-head-actions">
          <button
            className="btn ghost"
            onClick={() => onNav && onNav('vault')}
            title="Open the IND dossier in the Vault"
          >
            {I.folder} Dossier
          </button>
          <button
            className="btn ghost"
            onClick={() =>
              ask(
                'What is the fastest path to make the ' +
                  drug +
                  ' IND submission-ready?',
              )
            }
          >
            {I.sparkles} Ask AnA
          </button>
        </div>
      </div>

      <AnswerLead
        tone={
          !R.assessed ? 'calm' : R.ready ? 'good' : R.blockers.length > 4 ? 'urgent' : 'calm'
        }
        eyebrow={
          'Is the ' +
          drug +
          ' IND ready to file — and what stands between you and submission'
        }
        headline={
          !R.assessed ? (
            <>
              Nothing has been assessed for this IND yet — the checklist holds
              no required sections or Module 1 forms to evaluate.
            </>
          ) : R.ready ? (
            <>
              The {drug} IND is <b>ready to file</b> -- every
              required section is approved and all three Module 1 forms are
              complete.
            </>
          ) : (
            <>
              The {drug} IND is{' '}
              <b>{R.overallPercentage}% ready</b>.{' '}
              {R.blockers.length} thing
              {R.blockers.length === 1 ? '' : 's'} stand
              {R.blockers.length === 1 ? 's' : ''} between you and a
              fileable submission (21 CFR 312.23).
            </>
          )
        }
        body={
          !R.assessed ? (
            <>
              Readiness is computed from the org's IND checklist. Until it
              carries section and form state, no statement about blockers —
              present or absent — can be made.
            </>
          ) : R.ready ? (
            clearDate ? (
              <>
                Once you file, the 30-day safe-to-proceed clock runs to{' '}
                <b>{fmt(clearDate)}</b> absent a clinical hold (312.40(b)). I
                will keep the lifecycle documents current from there.
              </>
            ) : (
              <>
                Once you file, the 30-day safe-to-proceed clock runs from FDA
                receipt absent a clinical hold (312.40(b)). Set a target
                submission date on the program to project it here.
              </>
            )
          ) : (
            <>
              {R.requiredSections.total - R.requiredSections.completed}{' '}
              required section
              {R.requiredSections.total - R.requiredSections.completed === 1
                ? ''
                : 's'}{' '}
              {R.requiredSections.total - R.requiredSections.completed === 1
                ? 'is'
                : 'are'}{' '}
              not yet approved and {forms.length - formsDone} Module 1 form
              {forms.length - formsDone === 1 ? '' : 's'}{' '}
              {forms.length - formsDone === 1 ? 'is' : 'are'} open. Close
              those and the package is fileable.
            </>
          )
        }
        reassure={
          R.assessed
            ? 'None of these are FDA findings — they are the checklist I hold so nothing slips before you submit.'
            : undefined
        }
        action={{
          label: !R.assessed
            ? 'Ask AnA how to populate the checklist'
            : R.ready
              ? 'Assemble the submission sequence'
              : 'Resolve the top blocker',
          onClick: () => {
            if (!R.assessed) {
              ask(
                'The ' + drug + ' IND checklist is empty — how do I populate its sections and Module 1 forms?',
              );
            } else if (R.ready) {
              onNav && onNav('submission-center');
            } else if (R.blockers[0]) {
              ask(
                'Help me resolve ' +
                  R.blockers[0].code +
                  ': ' +
                  R.blockers[0].message,
              );
            }
          },
        }}
        secondary="Live from this org's IND checklist — its forms and section state; readiness is computed from it."
      />

      <div className="indl-grid">
        {/* HERO deliverable: the IND Filing Readiness Report (312.23) */}
        <div className="indl-main">
          <div className="cm-doc indl-doc">
            <div className="cm-doc-bar">
              <span className="cm-doc-name">
                {drug}_IND_filing-readiness_312.23
              </span>
              <div className="cm-doc-bar-r">
                <span
                  className={'indl-verdict ' + (R.ready ? 'ok' : 'no')}
                >
                  {!R.assessed
                    ? 'NOT ASSESSED'
                    : R.ready
                      ? 'READY TO FILE'
                      : 'NOT YET FILEABLE'}
                </span>
                <button
                  className="btn ghost sm"
                  onClick={() =>
                    ask(
                      'Generate the IND filing-readiness report (21 CFR 312.23) as a governed PDF for ' +
                        drug +
                        '.',
                    )
                  }
                  title="Sends this request to AnA in the rail — it does not download a file here"
                >
                  {I.sparkles} Ask AnA to draft this
                </button>
              </div>
            </div>
            <div className="cm-doc-body indl-doc-body">
              <div className="indl-cover">
                <h2>IND Filing Readiness — 21 CFR 312.23</h2>
                <div className="indl-cover-meta">
                  {prog.productName && <span>{prog.productName}</span>}
                  {prog.sponsorName && <span>{prog.sponsorName}</span>}
                  <span>Initial IND — eCTD v4.0 (FDA)</span>
                  <span>
                    {R.assessed
                      ? 'Assessed ' +
                        new Date().toLocaleDateString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Not yet assessed'}
                  </span>
                </div>
                <div className="indl-overall">
                  <div className="indl-overall-bar">
                    <div
                      className={'fill ' + (R.ready ? 'ok' : '')}
                      style={{ width: R.overallPercentage + '%' }}
                    />
                  </div>
                  <span className="indl-overall-pct">
                    {R.overallPercentage}%
                  </span>
                </div>
              </div>

              <h3>1 — Module progress</h3>
              {R.moduleProgress.length === 0 && (
                <div className="scaf-note" style={{ margin: '4px 0 10px' }}>
                  No eCTD sections have been placed into this submission's filing yet.
                  Sections appear here — scoped to this program — once they're added to
                  the submission's sequence. (Documents in the authoring workspace that
                  aren't placed into this filing are intentionally not shown.)
                </div>
              )}
              <div className="indl-mods">
                {R.moduleProgress.map((m) => (
                  <div key={m.module} className="indl-mod">
                    <div className="indl-mod-h">
                      <span className="l">{m.title}</span>
                      <span className="pct">{m.percentage}%</span>
                    </div>
                    <div className="indl-mod-bar">
                      <div
                        className={
                          'fill' + (m.percentage >= 100 ? ' ok' : '')
                        }
                        style={{ width: m.percentage + '%' }}
                      />
                    </div>
                    <div className="indl-mod-m">
                      {m.completed}/{m.total} required sections approved
                    </div>
                  </div>
                ))}
              </div>

              <h3>
                2 — Module 1 forms{' '}
                <span className="indl-h-x">
                  -- 21 CFR 312.23(a)(1)
                </span>
              </h3>
              <div className="indl-forms">
                {forms.map((f) => (
                  <div
                    key={f.id}
                    className={'indl-form' + (f.done ? ' ok' : '')}
                  >
                    <span className="indl-form-ic">
                      {f.done ? I.checkCircle : I.alertTriangle}
                    </span>
                    <span className="indl-form-b">
                      <span className="t">
                        {f.title} -- {f.label}
                      </span>
                      <span className="s">{f.ref}</span>
                    </span>
                    <span
                      className={
                        'rd-chip tone-' + (f.done ? 'good' : 'warn')
                      }
                    >
                      {f.done ? 'Complete' : 'Open'}
                    </span>
                  </div>
                ))}
              </div>

              <h3>
                2a — Build &amp; render the FDA form PDFs{' '}
                <span className="indl-h-x">-- real form engine</span>
              </h3>
              <IndFormsPanel note={setFormsNote} />
              <C2CToast msg={formsNote} />

              <h3>
                3 — Blockers to filing{' '}
                <span className="indl-h-x">
                  -- {R.blockers.length} -- ready = assessed with zero blockers
                </span>
              </h3>
              {R.blockers.length === 0 ? (
                <p className="indl-clean">
                  {/* "No blockers" is a finding, and a finding needs an
                      assessment behind it — over an empty checklist the honest
                      sentence is that nothing was evaluated (BP-W0-3). */}
                  {R.assessed ? (
                    <>
                      {I.check} No blockers. Every required section is approved
                      and all Module 1 forms are complete — the package is
                      fileable.
                    </>
                  ) : (
                    <>
                      Nothing has been assessed — the checklist holds no
                      sections or forms to evaluate, so no blocker statement
                      can be made.
                    </>
                  )}
                </p>
              ) : (
                <div className="indl-blockers">
                  {R.blockers.map((b, i) => {
                    const sec = (
                      R.requiredSections.incomplete || []
                    ).find((g) => g.code === b.code);
                    return (
                      <div key={b.code + i} className="indl-blk">
                        <span
                          className={'indl-blk-kind k-' + b.kind}
                        >
                          {b.kind === 'required_form'
                            ? 'Form'
                            : b.kind === 'overdue_safety_report'
                              ? 'Safety'
                              : 'Section'}
                        </span>
                        <div className="indl-blk-b">
                          <div className="indl-blk-t">
                            <span className="mono">{b.code}</span>
                            {sec ? ' -- ' + sec.title : ''}
                            {sec ? (
                              <span className="indl-blk-st">
                                {' '}
                                --{' '}
                                {stLabel[sec.status] || sec.status}
                              </span>
                            ) : null}
                          </div>
                          <div className="indl-blk-ref">
                            {sec
                              ? sec.regulatoryRef
                              : b.kind === 'required_form'
                                ? '21 CFR 312.23(a)(1)'
                                : '21 CFR 312.32'}
                          </div>
                        </div>
                        <button
                          className="btn ghost sm"
                          onClick={() =>
                            ask(
                              'Help me clear IND blocker ' +
                                b.code +
                                ': ' +
                                b.message,
                            )
                          }
                        >
                          {I.sparkles} Resolve
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aside: the 30-day clock + the documents AnA assembles */}
        <aside className="indl-aside">
          <div className="indl-clock">
            <div className="indl-clock-h">
              {I.clock} Regulatory clock{' '}
              <span className={'rd-chip tone-' + cst.tone}>
                {cst.label}
              </span>
            </div>
            <div className="indl-clock-big">
              {clock ? clock.daysUntilThirtyDay : '--'}
              <span>days to safe-to-proceed</span>
            </div>
            <div className="indl-clock-rows">
              <div>
                <span>Target FDA receipt</span>
                <b>{receiptDate ? fmt(receiptDate) : 'No target date set'}</b>
              </div>
              <div>
                <span>30-day clears</span>
                <b>{fmt(clearDate)}</b>
              </div>
              <div>
                <span>21 CFR</span>
                <b>312.40(b) / 312.42</b>
              </div>
            </div>
            <p className="indl-clock-note">
              {clock ? (
                <>
                  {clock.rationale}{' '}
                  <span className="indl-proj">
                    Projection from the program's recorded target submission
                    date, until FDA receipt.
                  </span>
                </>
              ) : (
                <>
                  No target submission date is recorded for this program, so
                  there is nothing to project. Set a target submission date on
                  the regulatory program and the 30-day clock projects from it.
                </>
              )}
            </p>
          </div>

          <div className="indl-deliv">
            <div className="indl-deliv-h">Documents AnA assembles</div>
            <div className="indl-deliv-tabs" role="tablist">
              <button
                role="tab"
                className={tab === 'file' ? 'on' : ''}
                onClick={() => setTab('file')}
              >
                For filing
              </button>
              <button
                role="tab"
                className={tab === 'lifecycle' ? 'on' : ''}
                onClick={() => setTab('lifecycle')}
              >
                Lifecycle
              </button>
            </div>
            <div className="indl-deliv-list">
              {deliverables.map((d) => (
                <div key={d.id} className="indl-dcard">
                  <div className="indl-dcard-h">
                    <span className="indl-dcard-t">{d.title}</span>
                    {d.ai && (
                      <span
                        className="indl-ai"
                        title="AnA-draftable"
                      >
                        {I.sparkles} AnA
                      </span>
                    )}
                  </div>
                  <div className="indl-dcard-meta">
                    <span className="indl-place">{d.placement}</span>
                    <span className="indl-ref">{d.ref}</span>
                  </div>
                  <div className="indl-dcard-desc">{d.desc}</div>
                  {/* Every card is wired end-to-end (real POST + gap verdict +
                      PDF; the lifecycle documents also file into a real eCTD
                      sequence). The cover letter keeps its original exemplar
                      wiring; the rest share the generic runner. No printed
                      route, no dead affordance. */}
                  {d.id === 'cover-letter' ? (
                    <>
                      <div className="indl-dcard-acts">
                        <button
                          className="btn primary sm"
                          disabled={cl.busy}
                          onClick={() => void assembleCoverLetter()}
                        >
                          {I.fileText} {cl.busy ? 'Assembling…' : 'Assemble now'}
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={cl.busy}
                          onClick={() => void downloadCoverLetterPdf()}
                        >
                          {I.download} PDF
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={() => ask(d.ask)}
                        >
                          {I.sparkles} Ask AnA
                        </button>
                      </div>
                      {cl.error && (
                        <div className="indl-dcard-desc" role="status">
                          {cl.error}
                        </div>
                      )}
                      {cl.model && (
                        <div className="indl-dcard-desc" role="status">
                          <pre
                            style={{
                              whiteSpace: 'pre-wrap',
                              maxHeight: 220,
                              overflowY: 'auto',
                              margin: '6px 0 0',
                              fontFamily: 'inherit',
                            }}
                          >
                            {cl.model.body}
                          </pre>
                          {cl.model.gaps.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              Missing before filing:{' '}
                              {cl.model.gaps.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : wired[d.id] ? (
                    (() => {
                      const w = wired[d.id];
                      const run = runOf(d.id);
                      return (
                        <>
                          <div style={{ display: 'grid', gap: 6, margin: '6px 0' }}>
                            {w.fields.map((f) => (
                              <label key={f.key} style={{ fontSize: 12 }}>
                                {f.label}
                                {f.kind === 'select' ? (
                                  <select
                                    className="c2c-input"
                                    style={{ height: 28, width: '100%' }}
                                    value={fv(f.key) || (f.options?.[0]?.v ?? '')}
                                    onChange={(e) => setFieldVal(f.key, e.target.value)}
                                  >
                                    {(f.options ?? []).map((o) => (
                                      <option key={o.v} value={o.v}>{o.label}</option>
                                    ))}
                                  </select>
                                ) : f.kind === 'textarea' ? (
                                  <textarea
                                    className="c2c-input"
                                    style={{ width: '100%', minHeight: 44 }}
                                    placeholder={f.placeholder}
                                    value={fields[f.key] ?? ''}
                                    onChange={(e) => setFieldVal(f.key, e.target.value)}
                                  />
                                ) : (
                                  <input
                                    className="c2c-input"
                                    type={f.kind === 'date' ? 'date' : 'text'}
                                    style={{ height: 28, width: '100%' }}
                                    placeholder={f.placeholder}
                                    value={fields[f.key] ?? ''}
                                    onChange={(e) => setFieldVal(f.key, e.target.value)}
                                  />
                                )}
                              </label>
                            ))}
                          </div>
                          <div className="indl-dcard-acts">
                            <button
                              className="btn primary sm"
                              disabled={run.busy}
                              onClick={() => void runAssemble(d.id, w)}
                            >
                              {I.fileText} {run.busy ? 'Assembling…' : 'Assemble now'}
                            </button>
                            {w.pdf && (
                              <button
                                className="btn ghost sm"
                                disabled={run.busy}
                                onClick={() => void runPdf(d.id, w)}
                              >
                                {I.download} PDF
                              </button>
                            )}
                            <button className="btn ghost sm" onClick={() => ask(d.ask)}>
                              {I.sparkles} Ask AnA
                            </button>
                          </div>
                          {run.error && (
                            <div className="indl-dcard-desc" role="status">
                              {run.error}
                            </div>
                          )}
                          {run.view && (
                            <div className="indl-dcard-desc" role="status">
                              <pre
                                style={{
                                  whiteSpace: 'pre-wrap',
                                  maxHeight: 220,
                                  overflowY: 'auto',
                                  margin: '6px 0 0',
                                  fontFamily: 'inherit',
                                }}
                              >
                                {run.view.text}
                              </pre>
                              {run.view.gaps.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                  Missing before filing:{' '}
                                  {run.view.gaps.join(', ')}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Filing follow-up: only after a successful build,
                              and only for deliverables with a real filing
                              counterpart. Creates an actual ectd_sequences row
                              (+ leaves) — or says exactly why it cannot. */}
                          {run.view && w.file && (
                            run.view.canFile ? (
                              !run.filed && (
                                <div className="indl-dcard-acts" style={{ alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                                  <label style={{ fontSize: 12 }}>
                                    eCTD sequence number
                                    <input
                                      className="c2c-input"
                                      style={{ height: 28, width: 76, marginLeft: 6 }}
                                      placeholder="e.g. 0002"
                                      value={seqNums[d.id] ?? ''}
                                      onChange={(e) => setSeqNums((s) => ({ ...s, [d.id]: e.target.value }))}
                                    />
                                  </label>
                                  <button
                                    className="btn primary sm"
                                    disabled={run.filing}
                                    onClick={() => void runFile(d.id, w)}
                                  >
                                    {I.rocket} {run.filing ? 'Filing…' : 'File into sequence'}
                                  </button>
                                </div>
                              )
                            ) : run.view.fileNote ? (
                              <div className="indl-dcard-desc" role="status">
                                {run.view.fileNote}
                              </div>
                            ) : null
                          )}
                          {run.fileError && (
                            <div className="indl-dcard-desc" role="status">
                              {run.fileError}
                            </div>
                          )}
                          {run.filed && (
                            <div className="indl-dcard-desc" role="status">
                              Filed eCTD sequence {run.filed.sequenceNumber} (id{' '}
                              {String(run.filed.sequenceId)}) —{' '}
                              {run.filed.leafCount}{' '}
                              {run.filed.leafCount === 1 ? 'leaf' : 'leaves'} placed.
                            </div>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <div className="indl-dcard-acts">
                      <button
                        className="btn primary sm"
                        onClick={() => ask(d.ask)}
                        title="Sends this request to AnA in the rail"
                      >
                        {I.sparkles} Ask AnA
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="indl-deliv-foot">
              Each document assembles here end-to-end from this IND's recorded
              identity plus the particulars you enter — the rendered model and
              its gap list are the server's verdict. The lifecycle documents can
              then be filed into a real eCTD sequence under this application.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
