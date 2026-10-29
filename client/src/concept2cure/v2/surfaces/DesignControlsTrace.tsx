import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { EmptyState, isPendingStore } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import { assessmentStateFor, mayReassure, type AssessmentState } from '../assessmentState';
/* One definition of the design-control traceability rule and of the pass value, shared
   with server/routes/mdx-engineering.ts — the other reader of this store, which
   had its own copy and disagreed with this one over identical rows. */
import { DESIGN_CONTROL_PASS, isFullyTraced } from '@shared/regulatory/design-controls-trace';
/* The design-control element ids, order, and citations have one home, the QMSR
   crosswalk, shared with design-controls.ts and combination-products-knowledge.ts. */
import { QMSR_CROSSWALK, citeQms, type QmsrCrosswalkId } from '@shared/regulatory/qmsr-crosswalk';
import { canGovernedWrite } from '@shared/constants/permissions';
import { useAuthUser } from '@/services/portal/authService';
import type { SurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';
import {
  ProjectRefused,
  useProjectScopedRead,
  type ProjectReadOptions,
  type ProjectScopedRead,
} from '../projectScopedRead';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/* ════ The design-controls trace -- DHF ════

   One panel, mounted twice until the fold (D2, fold F1 slice B, 2026-10-29;
   docs/design/DEVICE_FOLDS_2026-10-29.md F1, "Work" item 4;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/):
     - the Design controls screen (./DesignControls.tsx), for the open
       project, or the organization's register with no project open;
     - Engineering (../../mdx/surfaces/EngineeringSurface.tsx), for its project
       only, once its own route has admitted the project.
   It was drawn inside DesignControls.tsx; Engineering printed one count line.

   Fixture-free by construction (real-data standard). The traceability matrix is
   the REAL design inputs (ISO 13485:2016 §7.3.3) from the c2c_design_controls
   store (GET /api/design-controls?program_id=, written via POST
   /api/design-controls with the `programId`). The panel renders real rows, an
   honest empty state, an honest error state or an honest refusal — never a
   fabricated fixture. The traceability roll-up and the design-control
   completeness checklist are derived from those real rows; checklist elements
   the design-input store cannot evidence are shown as an honest "not tracked
   here", never a fabricated present/absent claim. A role that cannot write
   (canGovernedWrite; the POST's requireEditorAccess) is offered no write
   control. */

/* ── Types ── */

interface DcOutput {
  id: string;
  desc: string;
}

export interface DcInput {
  id: string;
  cat: string;
  req: string;
  riskRef: string | null;
  outputs: DcOutput[];
  ver: string | null;
  verRef: string | null;
  val: string | null;
  valRef: string | null;
  _new?: boolean;
}

/** A design-control element (crosswalk row) and how (or whether) the
 *  design-input store evidences it. `derive` returns the element's state from the REAL rows:
 *  'present' / 'absent' where the store carries the evidence, or 'untracked'
 *  where no store backs the element (never a fabricated have/have-not). */
type ElState = 'present' | 'absent' | 'untracked';
interface DcElementDef {
  el: QmsrCrosswalkId;
  label: string;
  ref: string;
  derive: (rows: DcInput[]) => ElState;
}

/* ── Presentation vocabulary (controlled UI config, not data fixtures) ── */

/** Design-input (ISO 13485:2016 §7.3.3) categories — the controlled vocabulary the "new design
 *  input" form offers and the matrix labels from (not fabricated org data). */
const DC_INPUT_CATS: [string, string][] = [
  ['intended_use', 'Intended use'], ['user_need', 'User need'], ['functional', 'Functional'],
  ['performance', 'Performance'], ['safety', 'Safety'], ['regulatory', 'Regulatory'],
  ['usability', 'Usability'], ['interface', 'Interface'],
];

/** V&V result → cell tone (presentation map, not data). */
const DC_RESULT: Record<string, string> = { pass: 'ok', fail: 'err', pending: 'warn', null: 'idle' };

/** The design-control element ids: the crosswalk's ISO 13485:2016 §7.3.x rows. */
type DcElementId = Extract<
  QmsrCrosswalkId,
  | 'designPlan' | 'designInputs' | 'designOutputs' | 'designReviews' | 'designVerification'
  | 'designValidation' | 'designTransfer' | 'designChanges' | 'traceability'
>;

/**
 * How this panel labels each design-control element and whether the
 * design-input store evidences it. The ids, their order and their citations
 * are not here: they come from shared/regulatory/qmsr-crosswalk.ts through
 * `citeQms(id, asOf)`.
 *
 * QMSR took effect 2 February 2026 and incorporates ISO 13485:2016 by
 * reference: design controls are ISO 13485 §7.3 through 21 CFR 820.10(c), and
 * 21 CFR 820.30 is removed. On and after that date each ref leads with the
 * QMSR basis and keeps the QSR section as "formerly … (QSR, until
 * 2026-02-01)": a DHF assembled before the changeover is indexed to 820.30 and
 * its reviewers still search on it, so the old citation stays findable without
 * being presented as the requirement.
 *
 * 2026-10-05 (g-design-control-lists-one-home): this surface kept its own list
 * of nine refs ('820.30(c) · ISO 13485 §7.3.3', …) that led with the removed
 * section, and labelled design review "(independent)" — a QSR 820.30(e)
 * requirement the QMSR does not carry (ISO 13485:2016 §7.3.5).
 *
 * The derivation is unchanged: only the five elements the c2c_design_controls
 * store actually evidences are derivable. Design plan / reviews / transfer /
 * changes have no backing store here and are reported 'untracked' rather than
 * asserted present or absent.
 */
const DC_ELEMENT_VIEW: Record<DcElementId, Pick<DcElementDef, 'label' | 'derive'>> = {
  designPlan: { label: 'Design & development plan', derive: () => 'untracked' },
  designInputs: { label: 'Design inputs', derive: (r) => (r.length ? 'present' : 'absent') },
  designOutputs: { label: 'Design outputs', derive: (r) => (r.some(i => i.outputs && i.outputs.length) ? 'present' : 'absent') },
  designReviews: { label: 'Design reviews', derive: () => 'untracked' },
  designVerification: { label: 'Design verification', derive: (r) => (r.some(i => i.ver === 'pass') ? 'present' : 'absent') },
  designValidation: { label: 'Design validation', derive: (r) => (r.some(i => i.val === 'pass') ? 'present' : 'absent') },
  designTransfer: { label: 'Design transfer documented', derive: () => 'untracked' },
  designChanges: { label: 'Design changes reviewed/verified', derive: () => 'untracked' },
  traceability: { label: 'Full requirements<->V&V traceability',
    derive: (r) => {
      if (!r.length) return 'absent';
      const traced = r.filter(i => isFullyTraced({ ver: i.ver, val: i.val, outputCount: i.outputs?.length ?? 0 })).length;
      return traced === r.length ? 'present' : 'absent';
    } },
};

/**
 * The design-control checklist as at `asOf` (YYYY-MM-DD), in crosswalk order,
 * each ref `citeQms(id, asOf)`. Pure; the panel supplies today's date.
 */
export function designControlChecklistDefs(asOf: string): DcElementDef[] {
  return QMSR_CROSSWALK
    .filter(r => /^7\.3\.\d+$/.test(r.iso13485Clause))
    .map((r): DcElementDef => {
      const view = DC_ELEMENT_VIEW[r.id as DcElementId];
      if (!view) throw new Error(`DesignControls: no view for design-control element "${r.id}"`);
      return { el: r.id, ref: citeQms(r.id, asOf), ...view };
    });
}

/** Today's UTC date, YYYY-MM-DD. */
const utcToday = (): string => new Date().toISOString().slice(0, 10);
const catLabel = (c: string) => (DC_INPUT_CATS.find(x => x[0] === c) || [])[1] || c;

interface TraceRollup { total: number; noOutput: number; noVer: number; noVal: number; fullyTraced: number; pct: number }

/* Traceability roll-up — derived from the REAL rows. */
function traceRollupOf(inputs: DcInput[]): TraceRollup {
  const total = inputs.length;
  const fullyTraced = inputs.filter(i => isFullyTraced({ ver: i.ver, val: i.val, outputCount: i.outputs?.length ?? 0 })).length;
  return {
    total,
    noOutput: inputs.filter(i => !i.outputs || !i.outputs.length).length,
    noVer: inputs.filter(i => i.ver !== DESIGN_CONTROL_PASS).length,
    noVal: inputs.filter(i => i.val !== DESIGN_CONTROL_PASS).length,
    fullyTraced,
    pct: total ? Math.round(fullyTraced / total * 100) : 0,
  };
}

type Checklist = Array<DcElementDef & { state: ElState }>;
type AnaContext = Omit<SurfaceContext, 'surfaceId'>;

/* What AnA can see of the trace. A DHF question is always about a specific
   gap — "what is untraced?", "does design validation hold?" — and until now she had
   the surface name and none of the matrix.

   A FAILED read publishes the failure. `inputs` is [] on error as well as on
   an empty file, and reporting 0% traceability over an outage would be a
   confident claim about a device maker's design history file. */
function traceAnaContext(x: {
  read: ProjectScopedRead<DcInput>; pendingStore: boolean; trace: TraceRollup; checklist: Checklist;
  firstGap: DcInput | undefined; asOf: string; dcBasis: string; canWrite: boolean;
}): AnaContext {
  const { read, trace, checklist, firstGap, dcBasis } = x;
  if (read.status === 'loading' || read.status === 'idle') {
    return { summary: 'The design history file is still loading; nothing on screen is final yet.' };
  }
  if (read.status !== 'ready') {
    return {
      summary:
        (read.status === 'error'
          ? 'The design history file could not be read'
          : 'The design-input read was not tied to the open project, so nothing on this screen is a statement about it') +
        ', so this screen is showing no design inputs because of a failure, not because none are recorded.',
      availableActions: ['Retry the design-input read'],
    };
  }
  /* No store, so no completeness claim. The derived summary below reports
     "completeness 0% over 5 assessable element(s)" with designInputs,
     designOutputs, designVerification, designValidation and traceability each
     `absent` — five positive have-not claims about a device maker's design
     history file, computed from a table that does not exist. This context
     rides every AnA turn as `module_context` (V2App.tsx), so she would answer
     "is design validation satisfied?" with a confident no. */
  if (x.pendingStore) {
    return {
      summary:
        'The design-controls store is not provisioned in this environment, so nothing on this screen ' +
        'is a statement about the organization’s design history file. No design-control completeness or ' +
        'traceability figure can be computed, and none should be quoted.',
      facts: { storeProvisioned: false },
      availableActions: ['Explain that the design-controls store is not provisioned here'],
    };
  }
  const assessable = checklist.filter(e => e.state !== 'untracked');
  const present = assessable.filter(e => e.state === 'present').length;
  const untracked = checklist.length - assessable.length;
  const elPct = assessable.length ? Math.round(present / assessable.length * 100) : 0;
  return {
    summary:
      `Design controls (${dcBasis}): ${trace.total} design input(s), ${trace.fullyTraced} fully traced ` +
      `(${trace.pct}%). ${trace.noOutput} have no linked output, ${trace.noVer} are unverified, ` +
      `${trace.noVal} unvalidated. Design-control completeness ${elPct}% over ${assessable.length} assessable ` +
      `element(s), ${untracked} element(s) not tracked by any store.`,
    facts: {
      totalInputs: trace.total,
      fullyTraced: trace.fullyTraced,
      traceabilityPercent: trace.pct,
      missingOutput: trace.noOutput,
      unverified: trace.noVer,
      unvalidated: trace.noVal,
      citationsAsOf: x.asOf,
      designControlCompleteness: {
        percent: elPct,
        assessableElements: assessable.length,
        presentElements: present,
        untrackedElements: untracked,
        elements: checklist.map((e) => ({ element: e.el, label: e.label, ref: e.ref, state: e.state })),
      },
      firstGap: firstGap
        ? {
            id: firstGap.id, requirement: firstGap.req, category: catLabel(firstGap.cat),
            outputs: (firstGap.outputs ?? []).length,
            verification: firstGap.ver, validation: firstGap.val,
          }
        : null,
    },
    availableActions: [
      ...(x.canWrite ? ['Add a design input (a controlled record; the write is audit-logged under ' + dcBasis + ')'] : []),
      'Read the traceability matrix — inputs to outputs to verification to validation',
      'Read the design-control completeness checklist, including the elements no store evidences',
    ],
  };
}

/* ── The trace's state ─────────────────────────────────────────────────── */

export interface DesignControlsTraceState {
  programId: string | null;
  read: ProjectScopedRead<DcInput>;
  /** The route answered from no store (42P01 → `meta.pendingStore`). */
  pendingStore: boolean;
  inputs: DcInput[];
  trace: TraceRollup;
  checklist: Checklist;
  firstGap: DcInput | undefined;
  dcState: AssessmentState;
  /** The signed-in role may write (canGovernedWrite). The server decides either way. */
  canWrite: boolean;
  /** A design input may be added here: a writing role, a store, and a read that is the open project's. */
  mayAdd: boolean;
  form: boolean;
  setForm: (open: boolean) => void;
  addInput: (v: Record<string, string>) => Promise<void>;
  toast: ReturnType<typeof useToast>[0];
  asOf: string;
  dcBasis: string;
  /** What AnA can see of the trace. The screen publishes it under its own id. */
  anaContext: AnaContext;
}

export function useDesignControlsTrace(opts: ProjectReadOptions): DesignControlsTraceState {
  /* The date every citation on this panel is resolved against, and the
     citations themselves — all from the QMSR crosswalk. */
  const asOf = useMemo(utcToday, []);
  const dcBasis = citeQms('design_controls', asOf);
  const elementDefs = useMemo(() => designControlChecklistDefs(asOf), [asOf]);

  /* D2, fold F1 (2026-10-29): with a project open, the read is that project's
     design inputs (GET /api/design-controls?program_id=), which the route
     admits first and answers with `meta.scope: 'program'` and the `programId`.
     An answer not keyed to the open project (an unreported scope, the
     organization's, or another project's) is not drawn under it, and a refused
     one says so. With no project open on the Design controls screen, the read
     is the organization's register, as before. */
  const read = useProjectScopedRead<DcInput>('/api/design-controls', opts);
  const { programId } = opts;

  /* ── Honest-state sweep, finding 3 ────────────────────────────────────────
     A DHF that does not EXIST is not a DHF that is empty.

     `GET /api/design-controls` fails closed on SQLSTATE 42P01 — the table is
     created only by db/migrations/20260717_design_controls_store.sql, which
     deploy-migrate applies and install-fresh does not, so an install-fresh-only
     environment answers every read from no table at all. Failing closed is
     right: the route returns `{ data: [], meta: { count: 0, pendingStore:
     true } }` rather than a 500.

     The flag used to die in transit: the read unwrapped the envelope to the
     array and dropped `meta`, so `rows` was `[]` with `error` unset — the exact
     shape of a provisioned store holding nothing. The two states painted
     byte-identical DOM, and the CTA was worse than false — the POST it points
     at answers 503 PENDING_STORE, so the one action offered cannot succeed.
     Vault.tsx and rbmBoard.ts already branch on this flag. */
  const pendingStore = isPendingStore(read);

  /* Design inputs created in THIS session, held on their own and merged with the
     live file below so the "new design input" form can insert optimistically.
     The read fires once per path, so a row the user has just recorded is not in
     the read's rows until the panel remounts.

     ── Honest-state sweep, finding 2 ──────────────────────────────────────────
     This used to be a full local MIRROR of the live rows seeded by a
     `useEffect`. An effect runs AFTER the render it belongs to, so in the render
     where the read first settled the real rows were already in hand while the
     mirror was still `[]`, and that render painted "No design inputs defined
     yet" over a SUCCESSFUL read of a populated design history file. Deriving
     the rendered set from the read directly closes that window rather than
     narrowing it: there is no second copy left to be stale. */
  const [added, setAdded] = useState<DcInput[]>([]);
  /* Inputs added this session belong to the project they were added under. */
  useEffect(() => { setAdded([]); }, [programId]);
  /* A failed read keeps this session's inputs (its rows are empty); a read
     that is not the project's, or refused, holds none. */
  const keyed = read.status === 'ready' || read.status === 'error';
  const inputs = useMemo(
    () => (!keyed ? [] : added.length ? [...read.rows, ...added] : read.rows),
    [read.rows, added, keyed],
  );

  const [form, setForm] = useState(false);
  useEffect(() => { setForm(false); }, [programId]);
  const [toast, fire] = useToast();
  const canWrite = canGovernedWrite(useAuthUser());

  const trace = useMemo(() => traceRollupOf(inputs), [inputs]);
  /* Design-control completeness — derived from the REAL rows. `untracked` elements are
     excluded from the completeness fraction (we don't score what no store
     evidences); they're surfaced separately as honestly not-tracked. */
  const checklist = useMemo(
    () => elementDefs.map(e => ({ ...e, state: e.derive(inputs) })),
    [elementDefs, inputs],
  );
  const firstGap = inputs.find(i => !i.outputs || !i.outputs.length) || inputs.find(i => i.ver !== DESIGN_CONTROL_PASS) || inputs.find(i => i.val !== DESIGN_CONTROL_PASS);

  /* ── Honest-state sweep, finding 1 ────────────────────────────────────────
     `assessmentRan` here is a RECORDED result rather than the absence of
     findings: a fully traced row exists only because someone executed the
     verification and the validation and entered their outcomes against that
     input. The case where "no gaps" is an artifact of having nothing to gap --
     an empty design history file, where `fullyTraced === total` is 0 === 0 --
     is excluded by `scopeExists`, not by this flag. */
  const dcState = assessmentStateFor(read, {
    scopeExists: trace.total > 0,
    findingCount: trace.total - trace.fullyTraced,
    assessmentRan: trace.fullyTraced > 0,
  });

  const addInput = async (v: Record<string, string>) => {
    setForm(false);

    // A real POST into the store backing the read, naming the open project.
    // Optimistic insert, then reconcile with the server's row; roll back on failure.
    const tempId = 'dc-tmp-' + Date.now();
    const optimistic: DcInput = { id: tempId, cat: v.cat || 'functional', req: v.req, riskRef: v.riskRef || null, outputs: [], ver: null, verRef: null, val: null, valRef: null, _new: true };
    setAdded(is => [...is, optimistic]);
    try {
      const res = await apiRequest('POST', '/api/design-controls', {
        req: v.req,
        cat: v.cat || 'functional',
        riskRef: v.riskRef || undefined,
        ...(programId ? { programId } : {}),
      });
      const row = (await res.json())?.data as DcInput | undefined;
      if (!row || !row.id) throw new Error('malformed response');
      setAdded(is => is.map(i => (i.id === tempId ? { ...row, _new: true } : i)));
      fire('Design input ' + row.id + ' added — untraced');
    } catch (e) {
      setAdded(is => is.filter(i => i.id !== tempId));
      /* Tone, not just text. `fire` defaults to 'ok', which draws
         `I.checkCircle` in `var(--success)` and announces `role="status"` — so
         a REFUSED write into a design-control controlled record wore the green
         tick. That is precisely the defect toast.tsx's own header says the
         two-argument signature exists to make unrepresentable; it was
         re-created here by omitting the argument. */
      fire('Could not add design input — ' + (e instanceof Error && e.message ? e.message : 'request failed'), 'error');
    }
  };

  const anaContext = useMemo(
    () => traceAnaContext({ read, pendingStore, trace, checklist, firstGap, asOf, dcBasis, canWrite }),
    [read, pendingStore, trace, checklist, firstGap, asOf, dcBasis, canWrite],
  );
  const mayAdd = canWrite && !pendingStore && (read.status === 'ready' || read.status === 'error' || read.status === 'loading');

  return {
    programId, read, pendingStore, inputs, trace, checklist, firstGap, dcState, canWrite, mayAdd,
    form, setForm, addInput, toast, asOf, dcBasis, anaContext,
  };
}

/* ── The trace, drawn ──────────────────────────────────────────────────── */

type Ask = (text: string) => void;

function cell(result: string | null, ref: string | null, label: string) {
  const tone = result === null ? 'idle' : (DC_RESULT[result] || 'idle');
  return (
    <div className={'dc-cell tone-' + tone} title={ref || label}>
      <span className="dc-cell-v">{result === null ? '--' : result}</span>
      {ref && <span className="dc-cell-ref">{ref}</span>}
    </div>
  );
}

function newInputForm(asOf: string, dcBasis: string): C2CFormConfig {
  return {
    eyebrow: 'Design input — ' + citeQms('designInputs', asOf),
    title: 'New design input',
    sub: 'A design input is a requirement the device must meet. It enters the traceability matrix untraced until an output, verification and validation are linked.',
    governed: 'Design inputs are controlled records; adding one is audit-logged (' + dcBasis + ').',
    submitLabel: 'Add design input',
    fields: [
      { key: 'req', label: 'Requirement', type: 'text', placeholder: 'e.g. Battery lasts a full 14-day wear period', required: true },
      { key: 'cat', label: 'Category', type: 'select', options: DC_INPUT_CATS.map(c => ({ value: c[0], label: c[1] })), required: true },
      { key: 'riskRef', label: 'Risk item reference (optional)', type: 'text', placeholder: 'e.g. HZ-02' },
    ],
  };
}

function TraceLead({ dc, onAsk }: { dc: DesignControlsTraceState; onAsk: Ask }) {
  const { trace, checklist, firstGap, dcState } = dc;
  const assessable = checklist.filter(e => e.state !== 'untracked');
  const present = assessable.filter(e => e.state === 'present').length;
  const untracked = checklist.length - assessable.length;
  const elPct = assessable.length ? Math.round(present / assessable.length * 100) : 0;
  const traceClear = dcState === 'assessed-clear';
  return (
    <AnswerLead
      tone={trace.noVal > 0 || trace.noOutput > 0 ? 'urgent' : 'calm'}
      eyebrow="Whether the DHF will survive a design-control audit"
      /* The clear branch was `trace.fullyTraced < trace.total ? ... : ...`,
         so an arithmetic tie decided it. 0 === 0 is a tie: an empty design
         history file satisfied the else and would have claimed the DHF
         audit-ready on traceability with nothing in it. Branching on the
         state keeps that unrepresentable — `assessed-clear` requires
         `scopeExists`, i.e. at least one real design input. */
      headline={traceClear
        ? <>Every design input traces cleanly to output {'->'} verification {'->'} validation. The DHF is audit-ready on traceability.</>
        : <><b>{trace.total - trace.fullyTraced}</b> of {trace.total} design inputs {trace.total - trace.fullyTraced === 1 ? 'is' : 'are'} not yet fully traced to output, verification and validation.</>}
      body={<>Design-control completeness is <b>{elPct}%</b> across the {assessable.length} design-control elements this store can evidence{untracked > 0 && <> ({untracked} more not tracked here)</>}; traceability is <b>{trace.pct}%</b>. {trace.noVal > 0 && <>{trace.noVal} input{trace.noVal === 1 ? '' : 's'} still lack{trace.noVal === 1 ? 's' : ''} passing validation.</>}</>}
      /* The offer to draft what is missing is kept verbatim for the state
         it was written for — untraced inputs on file — and withheld from
         the state it contradicted. Reassurance is gated by mayReassure,
         so it is spoken only from `assessed-clear` and only against a
         non-zero traceability figure; every other state says nothing here
         rather than a softened version of either sentence. */
      reassure={dcState === 'assessed-with-findings'
        ? "I'll draft the missing V&V protocols, link each to the input it covers, and flag any orphan output before the review — you sign off."
        : mayReassure(dcState, trace.pct)
          ? "Nothing is outstanding on traceability. As design inputs are added I'll flag the first one that reaches design review without an output, verification and validation linked."
          : undefined}
      action={firstGap
        ? { label: 'Close the ' + firstGap.id + ' gap', onClick: () => onAsk('What is missing to fully trace ' + firstGap.id + ' (' + firstGap.req + ')?') }
        : { label: 'Draft the design review minutes', onClick: () => onAsk('Draft the design review minutes confirming full traceability') }}
      secondary="Or work the traceability matrix and design-control checklist below."
    />
  );
}

function TraceMatrix({ dc, onAsk }: { dc: DesignControlsTraceState; onAsk: Ask }) {
  return (
    <>
      {/* Traceability matrix -- the hero */}
      <div className="pj-seclbl">Design traceability matrix <span className="s">{I.dot} {citeQms('traceability', dc.asOf)} {I.dot} input {'->'} output {'->'} verification {'->'} validation</span></div>
      <div className="dc-matrix">
        <div className="dc-mhead">
          <div className="dc-mh dc-mh-in">Design input</div>
          <div className="dc-mh">Output</div>
          <div className="dc-mh">Verification</div>
          <div className="dc-mh">Validation</div>
        </div>
        {dc.inputs.map(i => {
          const gap = !i.outputs || !i.outputs.length || i.ver !== 'pass' || i.val !== 'pass';
          return (
            <div key={i.id} className="dc-mrow" data-gap={gap || undefined} data-fresh={i._new || undefined}>
              <div className="dc-in">
                <div className="dc-in-top">
                  <span className="dc-in-id mono">{i.id}</span>
                  <span className="dc-in-cat">{catLabel(i.cat)}</span>
                  {i.riskRef && <button className="dc-in-hz" onClick={() => onAsk('Show ' + i.riskRef + ' in the risk file and confirm this input controls it')}>{I.alertTriangle} {i.riskRef}</button>}
                </div>
                <div className="dc-in-req">{i.req}</div>
              </div>
              <div className="dc-cell-wrap">
                {(i.outputs && i.outputs.length)
                  ? <div className="dc-out">{i.outputs.map(o => <span key={o.id} className="dc-out-chip" title={o.desc}><span className="mono">{o.id}</span> {o.desc}</span>)}</div>
                  : <div className="dc-cell tone-err"><span className="dc-cell-v">missing</span><span className="dc-cell-ref">no output</span></div>}
              </div>
              <div className="dc-cell-wrap">{cell(i.ver, i.verRef, 'verification')}</div>
              <div className="dc-cell-wrap">{cell(i.val, i.valRef, 'validation')}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TraceChecklist({ dc, onAsk }: { dc: DesignControlsTraceState; onAsk: Ask }) {
  const assessable = dc.checklist.filter(e => e.state !== 'untracked');
  const present = assessable.filter(e => e.state === 'present').length;
  const untracked = dc.checklist.length - assessable.length;
  return (
    <>
      {/* Design-control completeness checklist -- derived from the real rows */}
      <div className="pj-seclbl">Design-control completeness <span className="s">{I.dot} {present}/{assessable.length} evidenced by design inputs{untracked > 0 && <> {I.dot} {untracked} not tracked here</>}</span></div>
      <div className="dc-820">
        {dc.checklist.map(e => (
          <div key={e.el} className="dc-820-row" data-have={e.state === 'present' || undefined} data-untracked={e.state === 'untracked' || undefined}>
            {e.state === 'untracked' ? (
              <>
                <span className="dc-820-dot tone-idle">{I.minus || I.dot}</span>
                <span className="dc-820-l">{e.label}</span>
                <span className="dc-820-ref mono">{e.ref}</span>
                <span className="dc-820-note">Not tracked in this store</span>
                <button className="dc-820-fix" onClick={() => onAsk('How should we evidence ' + e.ref + ' — ' + e.label + ' — for this project?')}>Set up</button>
              </>
            ) : (
              <>
                <span className={'dc-820-dot tone-' + (e.state === 'present' ? 'ok' : 'err')}>{e.state === 'present' ? I.check : I.alertTriangle}</span>
                <span className="dc-820-l">{e.label}</span>
                <span className="dc-820-ref mono">{e.ref}</span>
                {e.state === 'absent' && <button className="dc-820-fix" onClick={() => onAsk('What is required to satisfy ' + e.ref + ' — ' + e.label + '?')}>Resolve</button>}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* Every state of the read that is not a matrix, in words. */
function UnreadTrace({ dc }: { dc: DesignControlsTraceState }) {
  const { read } = dc;
  if (read.refusal) {
    return <ProjectRefused refusal={read.refusal} onRetry={read.retry} record="design input" testId="design-controls-project-refused" />;
  }
  if (read.status === 'loading' || read.status === 'idle') {
    return <div role="status" className="reg-sub2" style={{ padding: '22px 4px' }}>Loading design inputs…</div>;
  }
  if (read.status === 'error') {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load the design history file"
        hint={`The design-controls store didn't respond. These are ${dc.programId ? "this project's" : "your organization's"} design inputs — sign in and retry, or check the service is reachable.`}
        retry={read.retry}
      />
    );
  }
  if (read.status === 'unkeyed') {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load this project's design inputs"
        hint="The design-controls read did not say it was this project's, so no design input is shown under it. Reload, or check the service is current."
        retry={read.retry}
      />
    );
  }
  if (dc.pendingStore) {
    return (
      <EmptyState
        icon={I.database || I.fileText}
        title="The design-controls store is not provisioned here"
        hint={
          <>
            This environment has no <span className="mono">c2c_design_controls</span>{' '}
            table, so the design history file could not be read at all — this
            is not a finding that your organization has recorded no design
            inputs. No design-control completeness or traceability figure is shown,
            because none can be computed. Adding an input would fail;
            provision the store first.
          </>
        }
        regulation={'Serves the design and development file (' + dc.dcBasis + ')'}
      />
    );
  }
  return (
    <EmptyState
      icon={I.fileText}
      title="No design inputs defined yet"
      hint={dc.canWrite ? (
        <>
          A design input is a requirement the device must meet ({citeQms('designInputs', dc.asOf)}).
          Add your first with <b>New design input</b> above — it persists via{' '}
          <span className="mono">Record a design input</span> and it enters
          the traceability matrix untraced until an output, verification and
          validation are linked.
        </>
      ) : (
        <>
          A design input is a requirement the device must meet ({citeQms('designInputs', dc.asOf)}).
          None is recorded yet. Your role can read the design inputs but cannot add them.
        </>
      )}
    />
  );
}

/**
 * The trace: its lead, matrix and §7.3 checklist, or the state of its read in
 * words; the new-input form and the toast. The screen draws its own header and
 * "New design input" (offered when `dc.canWrite`, enabled when `dc.mayAdd`).
 */
export function DesignControlsTrace({ dc, onAsk }: { dc: DesignControlsTraceState; onAsk: Ask }) {
  /* Only a read that is the project's draws inputs; a failed one says so even
     with inputs added this session, as before. */
  const draws = dc.inputs.length > 0 && dc.read.status === 'ready';
  return (
    <>
      {!dc.canWrite && (
        <p className="scaf-note" role="note" data-testid="design-controls-view-only">
          View only. Your role can read these design inputs but cannot add them.
        </p>
      )}
      {draws ? (
        <>
          <TraceLead dc={dc} onAsk={onAsk} />
          <TraceMatrix dc={dc} onAsk={onAsk} />
          <TraceChecklist dc={dc} onAsk={onAsk} />
        </>
      ) : (
        <UnreadTrace dc={dc} />
      )}

      {dc.form && <C2CForm config={newInputForm(dc.asOf, dc.dcBasis)} onCancel={() => dc.setForm(false)} onSubmit={dc.addInput} />}
      <C2CToast msg={dc.toast} />
    </>
  );
}
