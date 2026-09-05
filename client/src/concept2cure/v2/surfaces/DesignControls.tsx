import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import { assessmentStateFor, mayReassure } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/* ════ Design Controls -- DHF surface ════

   Fixture-free by construction (real-data standard). The traceability matrix is
   the org's REAL 21 CFR 820.30(c) design inputs from the c2c_design_controls
   store (GET /api/design-controls, written via POST /api/design-controls). The
   surface renders real rows, an honest empty state, or an honest error state —
   never a fabricated fixture. The traceability roll-up and the 820.30
   completeness checklist are derived from those real rows; checklist elements
   the design-input store cannot evidence are shown as an honest "not tracked
   here", never a fabricated present/absent claim. */

/* ── Types ── */

interface DcOutput {
  id: string;
  desc: string;
}

interface DcInput {
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

/** A 21 CFR 820.30 subsection and how (or whether) the design-input store
 *  evidences it. `derive` returns the element's state from the REAL rows:
 *  'present' / 'absent' where the store carries the evidence, or 'untracked'
 *  where no store backs the element (never a fabricated have/have-not). */
type ElState = 'present' | 'absent' | 'untracked';
interface Dc82030Def {
  el: string;
  label: string;
  ref: string;
  derive: (rows: DcInput[]) => ElState;
}

/* ── Presentation vocabulary (controlled UI config, not data fixtures) ── */

/** 820.30(c) input categories — the controlled vocabulary the "new design
 *  input" form offers and the matrix labels from (not fabricated org data). */
const DC_INPUT_CATS: [string, string][] = [
  ['intended_use', 'Intended use'], ['user_need', 'User need'], ['functional', 'Functional'],
  ['performance', 'Performance'], ['safety', 'Safety'], ['regulatory', 'Regulatory'],
  ['usability', 'Usability'], ['interface', 'Interface'],
];

/** V&V result → cell tone (presentation map, not data). */
const DC_RESULT: Record<string, string> = { pass: 'ok', fail: 'err', pending: 'warn', null: 'idle' };

/**
 * The nine design-control elements, dual-cited.
 *
 * QMSR took effect 2 February 2026 and incorporates ISO 13485:2016 by
 * reference: design controls now live at ISO 13485 §7.3, and 21 CFR 820.30 is
 * the legacy citation. This surface cited 820.30 alone in thirty-one places
 * with no mention of 13485 anywhere in the file — so a device team reading it
 * after February was being pointed at the superseded clause for every element
 * of their design history file.
 *
 * BOTH are shown during the transition rather than a swap. A DHF assembled
 * before the changeover is indexed to 820.30 and its reviewers still search on
 * it; dropping the old citation would make the existing record unfindable, and
 * dropping the new one leaves the product a year behind the rule it claims to
 * enforce.
 *
 * The derivation is unchanged: only the five elements the c2c_design_controls
 * store actually evidences are derivable. Design plan / reviews / transfer /
 * changes have no backing store here and are reported 'untracked' rather than
 * asserted present or absent.
 */
const DC_820_30: Dc82030Def[] = [
  { el: 'designPlan', label: 'Design & development plan', ref: '820.30(b) · ISO 13485 §7.3.2', derive: () => 'untracked' },
  { el: 'designInputs', label: 'Design inputs', ref: '820.30(c) · ISO 13485 §7.3.3', derive: (r) => (r.length ? 'present' : 'absent') },
  { el: 'designOutputs', label: 'Design outputs', ref: '820.30(d) · ISO 13485 §7.3.4', derive: (r) => (r.some(i => i.outputs && i.outputs.length) ? 'present' : 'absent') },
  { el: 'designReviews', label: 'Design reviews (independent)', ref: '820.30(e) · ISO 13485 §7.3.5', derive: () => 'untracked' },
  { el: 'designVerification', label: 'Design verification', ref: '820.30(f) · ISO 13485 §7.3.6', derive: (r) => (r.some(i => i.ver === 'pass') ? 'present' : 'absent') },
  { el: 'designValidation', label: 'Design validation', ref: '820.30(g) · ISO 13485 §7.3.7', derive: (r) => (r.some(i => i.val === 'pass') ? 'present' : 'absent') },
  { el: 'designTransfer', label: 'Design transfer documented', ref: '820.30(h) · ISO 13485 §7.3.8', derive: () => 'untracked' },
  { el: 'designChanges', label: 'Design changes reviewed/verified', ref: '820.30(i) · ISO 13485 §7.3.9', derive: () => 'untracked' },
  { el: 'traceability', label: 'Full requirements<->V&V traceability', ref: '820.30(j) · ISO 13485 §7.3.10',
    derive: (r) => {
      if (!r.length) return 'absent';
      const traced = r.filter(i => i.outputs && i.outputs.length && i.ver === 'pass' && i.val === 'pass').length;
      return traced === r.length ? 'present' : 'absent';
    } },
];

export function DesignControls({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  /* Fixture-free: read the org's REAL design inputs. `rows` is a fresh [] while
     loading / on error, so the derivations below are null-safe. */
  const live = useLiveRows<DcInput>('/api/design-controls');

  /* Design inputs created in THIS session, held on their own and merged with the
     live file below so the "new design input" form can insert optimistically.
     The read fires once per path, so a row the user has just recorded is not in
     `live.rows` until the surface remounts.

     ── Honest-state sweep, finding 2 ──────────────────────────────────────────
     This used to be a full local MIRROR of the live rows: `const [inputs,
     setInputs] = useState<DcInput[]>([])` seeded by a `useEffect` that copied
     `live.rows` across once the read settled. An effect runs AFTER the render it
     belongs to, so in the render where `live.loading` first flipped to false the
     org's real rows were already in hand while `inputs` was still its initial
     `[]`. Every branch below reads `inputs`, so that render painted "No design
     inputs defined yet -- Add your first with New design input above" over a
     SUCCESSFUL read of a populated design history file, with the traceability
     roll-up computing 0 of 0 beside it, until a second render (triggered by the
     effect calling setInputs) replaced it with the real matrix.

     Deriving the rendered set from `live.rows` directly closes that window
     rather than narrowing it: there is no second copy left to be stale. */
  const [added, setAdded] = useState<DcInput[]>([]);
  const inputs = useMemo(
    () => (added.length ? [...live.rows, ...added] : live.rows),
    [live.rows, added],
  );

  const [form, setForm] = useState(false);
  const [toast, fire] = useToast();
  const catLabel = (c: string) => (DC_INPUT_CATS.find(x => x[0] === c) || [])[1] || c;

  /* Traceability roll-up — derived from the REAL rows. */
  const trace = useMemo(() => {
    const total = inputs.length;
    const noOutput = inputs.filter(i => !i.outputs || !i.outputs.length).length;
    const noVer = inputs.filter(i => i.ver !== 'pass').length;
    const noVal = inputs.filter(i => i.val !== 'pass').length;
    const fullyTraced = inputs.filter(i => i.outputs && i.outputs.length && i.ver === 'pass' && i.val === 'pass').length;
    const pct = total ? Math.round(fullyTraced / total * 100) : 0;
    return { total, noOutput, noVer, noVal, fullyTraced, pct };
  }, [inputs]);

  /* 820.30 completeness — derived from the REAL rows. `untracked` elements are
     excluded from the completeness fraction (we don't score what no store
     evidences); they're surfaced separately as honestly not-tracked. */
  const checklist = useMemo(
    () => DC_820_30.map(e => ({ ...e, state: e.derive(inputs) })),
    [inputs],
  );
  const assessable = checklist.filter(e => e.state !== 'untracked');
  const present = assessable.filter(e => e.state === 'present').length;
  const untracked = checklist.length - assessable.length;
  const elPct = assessable.length ? Math.round(present / assessable.length * 100) : 0;

  const firstGap = inputs.find(i => !i.outputs || !i.outputs.length) || inputs.find(i => i.ver !== 'pass') || inputs.find(i => i.val !== 'pass');

  /* ── Honest-state sweep, finding 1 ────────────────────────────────────────
     `reassure` on the lead below was one static string, outside every branch:
     "I'll draft the missing V&V protocols, link each to the input it covers,
     and flag any orphan output before the review -- you sign off."

     It therefore rendered in the state the headline one prop above had just
     declared complete. When `trace.fullyTraced === trace.total` the headline
     reads "Every design input traces cleanly to output -> verification ->
     validation. The DHF is audit-ready on traceability" -- which is only true
     when no row lacks an output, a passing verification or a passing validation
     -- and the very next line offered to draft "the missing V&V protocols" and
     flag "any orphan output". The surface asserted outstanding work that its own
     roll-up, computed from the same rows a few lines up, shows does not exist.

     `assessmentRan` here is a RECORDED result rather than the absence of
     findings: a fully traced row exists only because someone executed the
     verification and the validation and entered their outcomes against that
     input. The case where "no gaps" is an artifact of having nothing to gap --
     an empty design history file, where `fullyTraced === total` is 0 === 0 --
     is excluded by `scopeExists`, not by this flag. */
  const dcState = assessmentStateFor(live, {
    scopeExists: trace.total > 0,
    findingCount: trace.total - trace.fullyTraced,
    assessmentRan: trace.fullyTraced > 0,
  });
  const traceClear = dcState === 'assessed-clear';

  const FORM: C2CFormConfig = {
    eyebrow: 'DHF — 820.30(c) · ISO 13485 §7.3.3',
    title: 'New design input',
    sub: 'A design input is a requirement the device must meet. It enters the traceability matrix untraced until an output, verification and validation are linked.',
    governed: 'Design inputs are controlled records; adding one is audit-logged per 21 CFR 820.30 and ISO 13485 §7.3.',
    submitLabel: 'Add design input',
    fields: [
      { key: 'req', label: 'Requirement', type: 'text', placeholder: 'e.g. Battery lasts a full 14-day wear period', required: true },
      { key: 'cat', label: 'Category', type: 'select', options: DC_INPUT_CATS.map(c => ({ value: c[0], label: c[1] })), required: true },
      { key: 'riskRef', label: 'Risk item reference (optional)', type: 'text', placeholder: 'e.g. HZ-02' },
    ],
  };

  const addInput = async (v: Record<string, string>) => {
    setForm(false);

    // Real org-scoped POST into the store backing the read. Optimistic insert,
    // then reconcile with the server's row; roll back on failure.
    const tempId = 'dc-tmp-' + Date.now();
    const optimistic: DcInput = { id: tempId, cat: v.cat || 'functional', req: v.req, riskRef: v.riskRef || null, outputs: [], ver: null, verRef: null, val: null, valRef: null, _new: true };
    setAdded(is => [...is, optimistic]);
    try {
      const res = await apiRequest('POST', '/api/design-controls', {
        req: v.req,
        cat: v.cat || 'functional',
        riskRef: v.riskRef || undefined,
      });
      const row = (await res.json())?.data as DcInput | undefined;
      if (!row || !row.id) throw new Error('malformed response');
      setAdded(is => is.map(i => (i.id === tempId ? { ...row, _new: true } : i)));
      fire('Design input ' + row.id + ' added — untraced');
    } catch (e) {
      setAdded(is => is.filter(i => i.id !== tempId));
      fire('Could not add design input -- ' + (e instanceof Error && e.message ? e.message : 'request failed'));
    }
  };

  const cell = (result: string | null, ref: string | null, label: string) => {
    const tone = result === null ? 'idle' : (DC_RESULT[result] || 'idle');
    return (
      <div className={'dc-cell tone-' + tone} title={ref || label}>
        <span className="dc-cell-v">{result === null ? '--' : result}</span>
        {ref && <span className="dc-cell-ref">{ref}</span>}
      </div>
    );
  };

  const hasRows = inputs.length > 0;
  const isLive = !live.loading && !live.error;

  /* What AnA can see of this screen. A DHF question is always about a specific
     gap — "what is untraced?", "does 820.30(g) hold?" — and until now she had
     the surface name and none of the matrix.

     A FAILED read publishes the failure. `inputs` is [] on error as well as on
     an empty file, and reporting 0% traceability over an outage would be a
     confident claim about a device maker's design history file. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The design history file is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The design history file could not be read, so this screen is showing no design inputs because ' +
          'of a failure, not because none are recorded.',
        availableActions: ['Retry the design-input read'],
      };
    }
    return {
      summary:
        `Design controls (DHF — 21 CFR 820.30 · ISO 13485 §7.3): ${trace.total} design input(s), ${trace.fullyTraced} fully traced ` +
        `(${trace.pct}%). ${trace.noOutput} have no linked output, ${trace.noVer} are unverified, ` +
        `${trace.noVal} unvalidated. 820.30 completeness ${elPct}% over ${assessable.length} assessable ` +
        `element(s), ${untracked} element(s) not tracked by any store.`,
      facts: {
        totalInputs: trace.total,
        fullyTraced: trace.fullyTraced,
        traceabilityPercent: trace.pct,
        missingOutput: trace.noOutput,
        unverified: trace.noVer,
        unvalidated: trace.noVal,
        completeness820_30: {
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
        'Add a design input (a controlled record; the write is audit-logged under 21 CFR 820.30 / ISO 13485 §7.3)',
        'Read the traceability matrix — inputs to outputs to verification to validation',
        'Read the 820.30 completeness checklist, including the elements no store evidences',
      ],
    };
  }, [live.loading, live.error, trace, checklist, assessable.length, present, untracked, elPct, firstGap]);
  usePublishSurfaceContext('design-controls', anaContext);

  return (
    <div className="dc" style={{ maxWidth: 1200 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist {I.dot} device {isLive ? <> {I.dot} live</> : ''}</div>
          <h1 className="sp-title">Design controls {I.dot} DHF</h1>
          <p className="sp-state">Design history file — 21 CFR 820.30 · ISO 13485 §7.3 (QMSR, in force 2 Feb 2026) — inputs {'->'} outputs {'->'} verification {'->'} validation, traced end to end.</p>
        </div>
        <button className="sp-primary" onClick={() => setForm(true)}>{I.plus} New design input</button>
      </div>

      {live.loading ? (
        <div role="status" className="reg-sub2" style={{ padding: '22px 4px' }}>Loading design inputs…</div>
      ) : live.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the design history file"
          hint="The design-controls store didn't respond. These are your organization's 820.30(c) design inputs — sign in and retry, or check the service is reachable."
        />
      ) : !hasRows ? (
        <EmptyState
          icon={I.fileText}
          title="No design inputs defined yet"
          hint={
            <>
              A design input is a requirement the device must meet (820.30(c)).
              Add your first with <b>New design input</b> above — it persists via{' '}
              <span className="mono">Record a design input</span> and it enters
              the traceability matrix untraced until an output, verification and
              validation are linked.
            </>
          }
        />
      ) : (
        <>
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
            body={<>Design-control completeness is <b>{elPct}%</b> across the {assessable.length} 820.30 elements this store can evidence{untracked > 0 && <> ({untracked} more not tracked here)</>}; traceability (820.30(j)) is <b>{trace.pct}%</b>. {trace.noVal > 0 && <>{trace.noVal} input{trace.noVal === 1 ? '' : 's'} still lack{trace.noVal === 1 ? 's' : ''} passing validation.</>}</>}
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
              ? { label: 'Close the ' + firstGap.id + ' gap', onClick: () => ask('What is missing to fully trace ' + firstGap.id + ' (' + firstGap.req + ')?') }
              : { label: 'Draft the design review minutes', onClick: () => ask('Draft the design review minutes confirming full traceability') }}
            secondary="Or work the traceability matrix and 820.30 checklist below."
          />

          {/* Traceability matrix -- the hero */}
          <div className="pj-seclbl">Design traceability matrix <span className="s">{I.dot} 820.30(j) {I.dot} input {'->'} output {'->'} verification {'->'} validation</span></div>
          <div className="dc-matrix">
            <div className="dc-mhead">
              <div className="dc-mh dc-mh-in">Design input</div>
              <div className="dc-mh">Output</div>
              <div className="dc-mh">Verification</div>
              <div className="dc-mh">Validation</div>
            </div>
            {inputs.map(i => {
              const gap = !i.outputs || !i.outputs.length || i.ver !== 'pass' || i.val !== 'pass';
              return (
                <div key={i.id} className="dc-mrow" data-gap={gap || undefined} data-fresh={i._new || undefined}>
                  <div className="dc-in">
                    <div className="dc-in-top">
                      <span className="dc-in-id mono">{i.id}</span>
                      <span className="dc-in-cat">{catLabel(i.cat)}</span>
                      {i.riskRef && <button className="dc-in-hz" onClick={() => ask('Show ' + i.riskRef + ' in the risk file and confirm this input controls it')}>{I.alertTriangle} {i.riskRef}</button>}
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

          {/* 820.30 completeness checklist -- derived from the real rows */}
          <div className="pj-seclbl">21 CFR 820.30 completeness <span className="s">{I.dot} {present}/{assessable.length} evidenced by design inputs{untracked > 0 && <> {I.dot} {untracked} not tracked here</>}</span></div>
          <div className="dc-820">
            {checklist.map(e => (
              <div key={e.el} className="dc-820-row" data-have={e.state === 'present' || undefined} data-untracked={e.state === 'untracked' || undefined}>
                {e.state === 'untracked' ? (
                  <>
                    <span className="dc-820-dot tone-idle">{I.minus || I.dot}</span>
                    <span className="dc-820-l">{e.label}</span>
                    <span className="dc-820-ref mono">{e.ref}</span>
                    <span className="dc-820-note">Not tracked in this store</span>
                    <button className="dc-820-fix" onClick={() => ask('How should we evidence ' + e.ref + ' -- ' + e.label + ' -- for this program?')}>Set up</button>
                  </>
                ) : (
                  <>
                    <span className={'dc-820-dot tone-' + (e.state === 'present' ? 'ok' : 'err')}>{e.state === 'present' ? I.check : I.alertTriangle}</span>
                    <span className="dc-820-l">{e.label}</span>
                    <span className="dc-820-ref mono">{e.ref}</span>
                    {e.state === 'absent' && <button className="dc-820-fix" onClick={() => ask('What is required to satisfy ' + e.ref + ' -- ' + e.label + '?')}>Resolve</button>}
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={addInput} />}
      <C2CToast msg={toast} />
    </div>
  );
}
