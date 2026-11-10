/**
 * Biostatistics bridge — the client half of server/services/biostatistics-bridge.
 *
 * ── What this connects ───────────────────────────────────────────────────────
 * Until this module the Biostatistics designer took its study from four
 * hard-coded presets, the protocol workspace had no statistics view at all,
 * and nothing a biostatistician computed reached the design record, the task
 * board or a filing. The bridge API (`/api/biostat-bridge`) joins those, and
 * these components are its one client rendering, shared by:
 *
 *   • `Biostatistics.tsx` — the study picker, the gap/verdict panel, the
 *     filing-placement note, the governed write-back and task-raising forms;
 *   • `ProtocolDev.tsx`   — the Statistics tab (readiness per design, with the
 *     deep link into the designer).
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * Every read renders real rows, an honest empty state, or an honest failure.
 * A design the server could not size shows its blocking gaps and no numbers.
 * Both writes are governed: a reason is required, the toast follows the
 * server's confirmation, and a refusal is shown as the refusal it is.
 *
 * @module client/src/concept2cure/v2/surfaces/biostatBridge
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState, isRowsWith, useLiveRows, type ListState } from '../dataConnect';
import { readShellProject } from '../shellProject';
import { stashNavParamsForTarget } from '../navParams';
import { SizingRunCheck } from './biostatSizingRun';
/* The two governed writes and their reason forms, split out on 2026-11-02:
   this module had reached the 500-line ceiling exactly, and they were the
   block that depended on nothing else in it. */
import { ApplySampleSizeForm, RaiseTasksForm } from './biostatGovernedWrites';
import {
  EngineResultPanel,
  StatisticalReviewTable,
  computedTotalN,
  engineFigureIsUsable,
  muted,
  pct,
  readinessChecksOf,
  verdictTone,
  verdictWord,
  type EngineResult,
  type StatisticalReadiness,
  type StatisticalReview,
} from './biostatEngineResult';

/* The engine-result half of this pair (biostatEngineResult.tsx) was split out
   of this file, so its names are re-exported here: an importer should not have
   to know which of the two halves a given name ended up in. */
export * from './biostatEngineResult';

// ─── Wire shapes (mirror server/services/biostatistics-bridge) ───────────────

export interface BridgeDesignRow {
  studyId: string;
  programId: string | null;
  title: string;
  phase: string;
  indication: string;
  status: string;
  updatedAt: string | null;
  readiness: StatisticalReadiness;
}
export interface BridgePlacement {
  deliverable: string;
  applicationType: string;
  backbone: 'ectd' | 'estar' | 'ctis';
  required: 'required' | 'expected' | 'conditional' | 'not_applicable';
  code: string | null;
  heading: string;
  module: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | null;
  note: string;
}
export interface BridgeTaskBlueprint {
  key: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  trigger: string;
  deliverable?: string;
}
/* `EngineResult` carries the four fields the engine-result rendering reads —
   adapter, computation, judgment, provenance — so they are declared once, in
   the module that renders them, and this interface adds the rest. */
export interface DesignAssessment extends EngineResult {
  studyId: string;
  title: string;
  readiness: StatisticalReadiness;
  /** The design gates' report (ICH E9 / E9(R1) / E10 / E3), as /api/study-design returns it. */
  validation?: { riskLevel: string; summary: string; counts: Record<string, number> };
  /** The reviewer's risk table and defensibility verdict. */
  review?: StatisticalReview;
  filing: { programId: string | null; programType: string | null; applicationType: string | null; projectId: number | null };
  placements: BridgePlacement[];
  existingDeliverables: string[];
  proposedTasks: BridgeTaskBlueprint[];
  existingTaskKeys: string[];
  /** The stored run behind the planned N (bridge-service SizingRunRead). Absent from an older server. */
  sizingRun?:
    | { state: 'found'; runId: number; recordedAt: string; plannedSampleSize: number | null }
    | { state: 'none' }
    | { state: 'unreadable' };
}


export const APP_LABELS: Record<string, string> = {
  ind: 'IND', nda: 'NDA', bla: 'BLA', anda: 'ANDA', maa: 'MAA', '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', cta: 'CTA',
};

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The design list, narrowed to the open program when one is open. */
export function bridgeDesignsPath(): string {
  const p = readShellProject();
  return p ? `/api/biostat-bridge/designs?program_id=${encodeURIComponent(String(p.id))}` : '/api/biostat-bridge/designs';
}

/**
 * A 200 whose rows lack the bridge's own fields is reported as a shape error,
 * not rendered: the panel reads `readiness.percent` and `studyId` from every
 * row, and a row without them is a broken read, not a design.
 */
const isDesignRows = isRowsWith<BridgeDesignRow>('studyId', 'readiness');

export function useBridgeDesigns(reloadKey = 0): ListState<BridgeDesignRow> {
  const path = bridgeDesignsPath();
  return useLiveRows<BridgeDesignRow>(path, [path, reloadKey], isDesignRows);
}

export interface AssessmentState {
  assessment: DesignAssessment | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** One design's assessment — refetched when the id or the reload nonce changes. */
export function useDesignAssessment(studyId: string | null): AssessmentState {
  const [assessment, setAssessment] = useState<DesignAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!studyId) { setAssessment(null); setError(null); setLoading(false); return undefined; }
    setLoading(true); setError(null);
    (async () => {
      try {
        const res = await apiRequest('GET', `/api/biostat-bridge/designs/${encodeURIComponent(studyId)}/assessment`);
        const body = (await res.json().catch(() => null)) as { data?: DesignAssessment } | null;
        if (cancelled) return;
        if (!res.ok || !body?.data) {
          setAssessment(null);
          setError(res.status === 401 ? 'Sign in to your tenant to load study designs.' : serverMessage(body) ?? `The assessment did not load (HTTP ${res.status}).`);
          return;
        }
        setAssessment(body.data);
      } catch (e) {
        if (cancelled) return;
        setAssessment(null);
        setError(e instanceof Error && e.message ? e.message : 'The assessment did not load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studyId, nonce]);
  return { assessment, loading, error, reload: () => setNonce((n) => n + 1) };
}

/** Where the document being drafted files for this program, or null when the program's filing is unknown. */
export function placementForDoc(assessment: DesignAssessment | null, docType: string): BridgePlacement | null {
  if (!assessment) return null;
  return assessment.placements.find((p) => p.deliverable === docType) ?? null;
}

/** Resolve a person's (or AnA's) name for a design against the live list. */
export function resolveDesign(rows: BridgeDesignRow[], raw: string): { ok: true; row: BridgeDesignRow } | { ok: false; reason: string } {
  const needle = raw.trim().toLowerCase();
  if (!needle) return { ok: false, reason: 'Name a study design to load.' };
  const byId = rows.filter((r) => r.studyId.toLowerCase() === needle);
  const byTitle = rows.filter((r) => r.title.toLowerCase() === needle);
  const hits = byId.length ? byId : byTitle.length ? byTitle : rows.filter((r) => r.title.toLowerCase().includes(needle));
  if (hits.length === 0) return { ok: false, reason: `No study design matching "${raw}" in the listed designs.` };
  if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} designs — name one exactly.` };
  return { ok: true, row: hits[0] };
}

/** Hand a design to the Biostatistics designer: stash the id on the nav channel, then navigate. */
export function openDesignInBiostatistics(studyId: string, onNav: (id: string) => void): void {
  stashNavParamsForTarget('biostatistics', { studyId });
  onNav('biostatistics');
}

// ─── Presentation helpers ────────────────────────────────────────────────────

const readinessTone = (p: number) => (p >= 80 ? 'ok' : p >= 50 ? 'warn' : 'err');
const gradeLabel: Record<BridgePlacement['required'], string> = {
  required: 'required', expected: 'expected', conditional: 'conditional', not_applicable: 'not filed',
};

function scopeLabel(): string {
  const p = readShellProject();
  const name = p ? String(p.product ?? p.code ?? p.title ?? '').trim() : '';
  return p ? (name ? `project ${name}` : 'the open project') : 'org-scoped';
}

// ─── Study picker (designer left rail) ───────────────────────────────────────

export function StudyDesignCard({ designs, selectedId, onSelect }: {
  designs: ListState<BridgeDesignRow>;
  selectedId: string | null;
  onSelect: (studyId: string) => void;
}) {
  return (
    <section className="pj-sec" aria-label="Study design">
      <div className="pj-sec-h">
        <h2>Study design</h2>
        <span className="sec-sub">{scopeLabel()}</span>
      </div>
      <>
        {designs.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '12px 10px' }}>Loading study designs…</div>
        ) : designs.error ? (
          <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load study designs"
            hint="The design store didn't respond. These are the persisted study designs (CDISC PRM) for this organization — sign in and retry." />
        ) : designs.empty ? (
          <EmptyState icon={I.fileText} title="No persisted study design yet"
            hint="Design a study in the study-design spine (or the protocol workspace) and it appears here to load into the engine. The presets below are worked examples, not your study." />
        ) : (
          <div className="sp-list">
            {/* Selection is the attribute the row already sets, styled in CSS
                ([data-work-area] .sp-row[aria-pressed="true"], D5-0's block),
                not an inline orange tint — it was one of this page's four
                orange fills, on a row that is a choice and not an act. */}
            {designs.rows.map((d) => (
              <button key={d.studyId} type="button" className="sp-row"
                aria-pressed={selectedId === d.studyId}
                onClick={() => onSelect(d.studyId)} title={`Load "${d.title}" into the engine`}>
                <span className="sp-row-b">
                  <span className="sp-row-t">{d.title}</span>
                  <span className="sp-row-s">{[d.phase && 'Phase ' + d.phase, d.indication].filter(Boolean).join(' · ')}{d.readiness.primaryEndpoint ? ' · ' + d.readiness.primaryEndpoint : ''}</span>
                  {/* Labelled, and under the title rather than beside it: in the
                      300px column a labelled chip beside the title squeezed it
                      to a word per line. */}
                  <span className="bs-row-chip">
                    <span className={'rd-chip tone-' + readinessTone(d.readiness.percent)} title="Share of applicable statistical checks that pass">Statistical readiness {d.readiness.percent}%</span>
                  </span>
                </span>
                {selectedId === d.studyId && <span className="bs-row-check" aria-hidden="true">{I.check}</span>}
              </button>
            ))}
          </div>
        )}
      </>
    </section>
  );
}

// ─── Assessment panel (designer) ─────────────────────────────────────────────

/**
 * Where this design's statistical deliverables file — or why they cannot be
 * placed. Its own component so the panel stays inside the repo's complexity
 * budget rather than suppressing the rule.
 */
/** "a" or "an" as the label is SAID: an acronym by its first letter's name
 *  ("an IND", "an NDA", "a BLA"), a word by its first sound ("a De Novo"). */
function article(label: string): 'a' | 'an' {
  return /^[A-Z][A-Z(]/.test(label) ? (/^[AEFHILMNORSX]/.test(label) ? 'an' : 'a') : (/^[aeiou]/i.test(label) ? 'an' : 'a');
}

function FilingSentence({ filing }: { filing: DesignAssessment['filing'] }) {
  const app = filing.applicationType;
  /* No inline font-size: this sentence renders inside the assessment's
     disclosure now, whose own rule sets the ramp. A hard 12px there was a
     fourth size on a page that has four. */
  if (app) {
    const label = APP_LABELS[app] ?? app;
    return (
      <p>
        Files as {article(label)} <b>{label}</b>
        {filing.projectId === null ? <span style={muted}> — the project has no tracking record yet, so tasks and documents cannot be bound to it</span> : null}.
      </p>
    );
  }
  return (
    <p>
      {filing.programId
        ? `The project's type (${filing.programType ?? 'unknown'}) does not map to a filing type, so no placements are shown.`
        : 'This design is not linked to a project, so filing placements and task binding are unavailable.'}
    </p>
  );
}

/**
 * What the engine made of this design, in the figures a reader scans for.
 *
 * These are `ResultLead`'s headline facts (D5 §B.4 step 3): the banner that
 * carried them is deleted, and a section's heading is where a summary belongs.
 * The honesty rules come with them, not just the numbers:
 *
 * - a design the engine did not size reads "Not sized", never a dash standing
 *   in for a figure — `engineFigureIsUsable` is the same gate the governed
 *   Apply write runs on, so the heading and the button cannot disagree;
 * - a readiness read that carried no checks at all contributes nothing, where
 *   "0 of 0 checks pass" would report a broken read as a clean design;
 * - the verdict is toned exactly as its chip is, by the one tone map.
 */
function assessmentSummary(a: DesignAssessment): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const n = computedTotalN(a.computation);
  if (engineFigureIsUsable(a) && n !== null) {
    parts.push(`${n} subjects`, `${pct(a.computation?.power ?? null)} power`);
  } else {
    parts.push('Not sized');
  }
  const verdict = a.judgment?.overallVerdict;
  if (verdict) parts.push(<span data-tone={verdictTone(verdict)}>{verdictWord(verdict)}</span>);
  const checks = readinessChecksOf(a.readiness);
  if (checks.length > 0) parts.push(`${checks.filter((c) => c.ok).length} of ${checks.length} checks pass`);
  return <>{parts.map((part, i) => <React.Fragment key={i}>{i > 0 ? ' · ' : ''}{part}</React.Fragment>)}</>;
}

/**
 * How this assessment was reached, folded away.
 *
 * Three quiet lines used to sit flat in the panel body, each true and none of
 * them the answer: where these deliverables file, which standards the gates
 * checked, and the fact that no figure on the screen was computed in the
 * browser. A reader who wants them wants them once; a reader reading the
 * verdict was reading past them. They keep their words inside the disclosure
 * (D5 §B.4 step 6), which is where this page's standing explanations live.
 */
function AssessmentNotes({ assessment: a }: { assessment: DesignAssessment }) {
  const standards = Array.isArray(a.review?.standardsChecked) ? a.review.standardsChecked : [];
  return (
    <details className="pj-more">
      <summary>Standards checked and how the engine works</summary>
      <FilingSentence filing={a.filing} />
      {standards.length > 0 && <p>Standards checked: {standards.join(' · ')}</p>}
      {/* The engine and its version are named once, on the computation's own
          line above, and not again here: a `<details>` is in the document
          whether it is open or shut, so a second copy is a second thing to
          keep in step and a second hit for anyone searching the page. */}
      <p>
        Nothing on this screen is computed in the browser. Every figure above comes from the deterministic
        statistical engine named on the computation line, which stamps each document it generates with its own
        version and with the record of the inputs it ran on.
      </p>
    </details>
  );
}

/**
 * The two governed writes this assessment offers, and the three screens the
 * work continues on.
 *
 * The writes are hairline actions in the section's heading now rather than an
 * orange primary in its body: on a screen whose one primary is "Open in
 * editor", a second filled button was a second answer to "what do I do here?"
 * Neither fires on its click — each opens a reason form, as before.
 */
function AssessmentActions({ assessment: a, openTasks, onForm }: {
  assessment: DesignAssessment;
  openTasks: number;
  onForm: (f: 'apply' | 'tasks') => void;
}) {
  const sizable = engineFigureIsUsable(a);
  return (
    <div className="pj-sec-acts">
      {/* The same gate as the Statistics tab's: the engine produced a total,
          not merely a computation object. */}
      <button type="button" className="btn ghost small" disabled={!sizable} onClick={() => onForm('apply')}
        title={sizable ? 'Write the computed sample size and power onto the design (governed)' : 'Resolve the blocking gaps first'}>
        {I.penLine} Apply sample size to design
      </button>
      <button type="button" className="btn ghost small" disabled={openTasks === 0} onClick={() => onForm('tasks')}
        title={openTasks ? `${openTasks} proposed task(s) not yet on the board` : a.proposedTasks.length ? 'Every proposed task is already on the board' : 'The assessment proposes no tasks'}>
        {I.clipboardList ?? I.check} Raise tasks{openTasks ? ` (${openTasks})` : ''}
      </button>
    </div>
  );
}

export function DesignBridgePanel({ state, onNav, onApplied, onTasksRaised, fireToast }: {
  state: AssessmentState;
  onNav: (id: string) => void;
  onApplied: () => void;
  onTasksRaised: () => void;
  fireToast: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { assessment: a, loading, error } = state;
  const [form, setForm] = useState<'apply' | 'tasks' | null>(null);
  if (loading) return <section className="pj-sec bs-assess"><div role="status" className="scaf-note">Assessing the design…</div></section>;
  if (error) {
    return <section className="pj-sec bs-assess"><EmptyState tone="error" icon={I.alertTriangle} title="Couldn't assess the design" hint={error} /></section>;
  }
  if (!a) return null;

  const openTasks = a.proposedTasks.filter((t) => !a.existingTaskKeys.includes(t.key));

  return (
    <section className="pj-sec bs-assess" aria-label="Design assessment">
      <div className="pj-sec-h">
        <h2>Design assessment</h2>
        <span className="sec-sub">{assessmentSummary(a)}</span>
        <AssessmentActions assessment={a} openTasks={openTasks.length} onForm={setForm} />
      </div>
      <div className="bs-assess-b">
        {/* Readiness — the design record's own checks. The count that used to
            follow this chip is in the heading summary now; saying it twice,
            twelve pixels apart, is the repetition §WA.4.2 rule 4 retires. */}
        <div>
          <span className={'rd-chip tone-' + readinessTone(a.readiness.percent)}>Statistical readiness {a.readiness.percent}%</span>
        </div>

        {/* The engines: the computation, its gaps and assumptions, the judgment
            by dimension. The one rendering, shared with the Statistics tab —
            told that the heading above already carries the three figures, which
            the Statistics tab has no heading for. */}
        <EngineResultPanel assessment={a} figuresInLead />

        {/* Statistical review — the gates' findings and the engine's judgment as
            one risk table with a verdict (biostatistics-engine review format).
            Each row's gates are its cell's hover text. */}
        {a.review && <StatisticalReviewTable review={a.review} />}

        {/* Where the work continues. Three doors, named for where they go. */}
        <div className="pj-sec-acts">
          <button type="button" className="btn ghost small" onClick={() => onNav('protocol-dev')}>Open the protocol</button>
          <button type="button" className="btn ghost small" onClick={() => onNav('tasks')}>Open Tasks</button>
          <button type="button" className="btn ghost small" onClick={() => onNav('submission-center')}>Open Submission Center</button>
        </div>

        <AssessmentNotes assessment={a} />
      </div>

      {form === 'apply' && (
        <ApplySampleSizeForm assessment={a} onCancel={() => setForm(null)}
          onDone={(msg) => { setForm(null); fireToast(msg); onApplied(); }}
          onError={(msg) => fireToast(msg, 'error')} />
      )}
      {form === 'tasks' && (
        <RaiseTasksForm assessment={a} onCancel={() => setForm(null)}
          onDone={(msg) => { setForm(null); fireToast(msg); onTasksRaised(); }}
          onError={(msg) => fireToast(msg, 'error')} />
      )}
    </section>
  );
}

// ─── Filing placement note (designer document bar) ───────────────────────────

export function FilingPlacementNote({ placement }: { placement: BridgePlacement | null }) {
  if (!placement) return null;
  const app = APP_LABELS[placement.applicationType] ?? placement.applicationType;
  if (placement.required === 'not_applicable') {
    return <span style={muted} title={placement.note}>Not filed with the {app} — {placement.heading.toLowerCase()}</span>;
  }
  return (
    <span style={muted} title={placement.note}>
      {app}: <span className="mono">{placement.code}</span>{placement.module ? ` (${placement.module})` : ''} · {gradeLabel[placement.required]} — {placement.heading}
    </span>
  );
}

// ─── Statistics tab (protocol workspace) ─────────────────────────────────────

/**
 * Statistics for THIS protocol's bound study design.
 *
 * ── Two wrong answers, in order ──────────────────────────────────────────────
 *
 * First this pane rendered `useBridgeDesigns()` unfiltered, which narrows to
 * the open PROGRAM — or, with no program open, the whole organization. Opening
 * protocol A showed protocol B's sample size and power: every number correct,
 * answering a question nobody asked.
 *
 * Then it filtered that same program-narrowed list by the bound study id, which
 * was the wrong repair. Binding is ORG-scoped on both sides (the picker calls
 * `GET /api/study-design` with no program filter; `bindStudyDesignTx` checks
 * only the tenant), `cdisc_prm_studies.program_id` is NULLABLE, protocols are
 * not program-scoped at all, and the list is capped at 50 rows. So a correctly
 * bound design whose program_id was null, or which belonged to another program,
 * or which fell outside the newest 50, produced `rows.length === 0` and the
 * author was told "the bound study design could not be read". A false error on
 * the default path is worse than the wrong-scope list it replaced: it denies
 * the author something they are entitled to, and blames the data for it.
 *
 * It resolves the design BY ID now — `useDesignAssessment` over
 * `GET /api/biostat-bridge/designs/:studyId/assessment`, which is tenant-scoped,
 * takes no program filter, has no row cap, and already existed. The scope of
 * the read finally matches the scope of the binding.
 *
 * Three absences stay distinct: nothing bound (point at the Study design tab —
 * never a fallback list, which is the original defect wearing a label), the
 * read failed (the server's own message), and bound-but-absent, which now means
 * the design genuinely is not readable for this tenant rather than "not in the
 * program you happen to have open".
 *
 * ── The third wrong answer: a read-only statistics tab ───────────────────────
 *
 * That assessment read carries the engines' whole answer — the computed N and
 * power, the assumptions the sizing stood on, the gaps that stopped it, the
 * judgment dimension by dimension — and the pane rendered four stored numbers
 * out of it. The one action that computes and applies a sample size rendered
 * only on the `biostatistics` surface, which is not in the launch catalog,
 * while protocol development is. So a statistician in the launch Authoring app
 * could read a sample size and had no way to produce one.
 *
 * It now mounts `EngineResultPanel` — the SAME rendering the designer's
 * `DesignBridgePanel` mounts, not a second one — and the governed write beside
 * it. The deep link stays, because the designer does more than size a study;
 * it is no longer the only way to compute.
 */
export function StudyDesignStatisticsTab({ onNav, boundStudyId, onChanged }: {
  onNav: (id: string) => void;
  boundStudyId?: string | null;
  /** Re-read the protocol after a confirmed write to the design. The design
   *  gates' findings this workspace shows elsewhere are computed from the
   *  statistical plan the write just changed, so not re-reading would leave
   *  the Study design tab reporting the previous plan as current. */
  onChanged?: () => void;
}) {
  const bound = (boundStudyId ?? '').trim();
  const state = useDesignAssessment(bound || null);
  const { assessment, loading, error, reload } = state;
  const applied = useCallback(() => { reload(); onChanged?.(); }, [reload, onChanged]);
  return (
    <div className="pd-pane">
      <div className="pd-pane-h">
        <div><h2 className="pd-pane-t">Statistics</h2><div className="pd-pane-s">The study design bound to this protocol: what the design record holds, what the deterministic engine computes for it, and the governed write that puts the computed size onto the design.</div></div>
      </div>
      {!bound ? (
        <div style={{ padding: 12 }}><EmptyState icon={I.fileText} title="No study design is bound to this protocol" hint="A protocol's statistics live on its study design (CDISC PRM). Bind one on the Study design tab and its readiness appears here. Other designs in this project are not shown, because they are not this protocol's." /></div>
      ) : loading ? (
        <div role="status" className="scaf-note" style={{ margin: 12 }}>Loading the bound study design…</div>
      ) : error ? (
        <div style={{ padding: 12 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the bound study design" hint={error} /></div>
      ) : !assessment || !assessment.readiness ? (
        <div style={{ padding: 12 }}><EmptyState tone="error" icon={I.alertTriangle} title="The bound study design could not be read" hint={`This protocol names study design ${bound}, but no design with that id is readable for this organization. The link is unresolved — this is not a protocol without a design, and no statistics are shown for it.`} /></div>
      ) : (
        <div style={{ display: 'grid', gap: 10, padding: 12 }}>
          <BoundDesignCard studyId={bound} assessment={assessment} onNav={onNav} onApplied={applied} />
        </div>
      )}
    </div>
  );
}

/** The bound design's card: the record's figures, then the engine's. Extracted
 *  to keep the pane's branch count under the repo's complexity budget rather
 *  than suppressing it. */
function BoundDesignCard({ studyId, assessment, onNav, onApplied }: {
  studyId: string;
  assessment: DesignAssessment;
  onNav: (id: string) => void;
  onApplied: () => void;
}) {
  const readiness = assessment.readiness;
  const failed = readinessChecksOf(readiness).filter((c) => !c.ok);
  const title = assessment.title || studyId;
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        <span className="s">{studyId}</span>
      </div>
      <div className="pj-card-b" style={{ padding: 12, display: 'grid', gap: 8 }}>
        {/* What the design RECORDS. */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <span className={'rd-chip tone-' + readinessTone(readiness.percent)}>{readiness.percent}% ready</span>
          <span><b>{readiness.plannedSampleSize ?? '—'}</b> planned subjects</span>
          <span><b>{pct(readiness.power)}</b> power</span>
          <span><b>{readiness.alpha ?? '—'}</b> alpha</span>
          <span style={muted}>{readiness.primaryEndpoint ? 'Primary: ' + readiness.primaryEndpoint : 'No primary endpoint'}</span>
        </div>
        {failed.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 2 }} aria-label={`Open statistical checks for ${title}`}>
            {failed.map((c) => <li key={c.key}>{c.label}{c.hint ? <span style={muted}> — {c.hint}</span> : null}</li>)}
          </ul>
        )}
        <SizingRunCheck assessment={assessment} />
        {/* What the ENGINE computes for it — the same rendering the designer
            shows, so the two surfaces cannot disagree about one design. */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>The engine's computation for this design</div>
          <EngineResultPanel assessment={assessment} />
        </div>
        <BoundDesignActions studyId={studyId} assessment={assessment} onNav={onNav} onApplied={onApplied} />
      </div>
    </div>
  );
}

/**
 * The two actions a statistician needs here: apply the engine's size to the
 * design, and open the design in the full designer.
 *
 * ── Why the write is here and not only there ─────────────────────────────────
 * Until 2026-10-11 "Apply sample size" rendered only on the `biostatistics`
 * surface, and this tab's only action was the deep link into it. Protocol
 * development is in the launch catalog and the biostatistics surfaces are not
 * yet, so the one governed action that turns a computation into the protocol's
 * sample size was not reachable from the launch app at all. The link stays —
 * the designer does far more than size a study — but it is no longer the only
 * way to compute.
 *
 * ── Why the outcome is a sentence in the pane ────────────────────────────────
 * The designer reports this write through a toast, which it owns. This tab is
 * mounted inside the protocol workspace, so a toast here would be the
 * workspace's. The refusal is shown in the pane instead, as its own sentence
 * and in the server's own words: a governed write that was refused must leave
 * something a reviewer can still read after the moment has passed. The drawer
 * closes on a refusal because a CANNOT_SIZE cannot be retried with a different
 * reason — the design has to change first.
 */
function BoundDesignActions({ studyId, assessment, onNav, onApplied }: {
  /** The id the protocol binds — the one the deep link must carry. */
  studyId: string;
  assessment: DesignAssessment;
  onNav: (id: string) => void;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const sizable = engineFigureIsUsable(assessment);
  return (
    <>
      {notice && (
        <div
          className={notice.tone === 'error' ? 'pde-refusal' : 'scaf-note'}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          style={{ fontSize: 12 }}
        >
          {notice.text}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn primary"
          style={{ height: 28, fontSize: 12 }}
          disabled={!sizable}
          onClick={() => { setNotice(null); setOpen(true); }}
          title={sizable
            ? 'Write the engine’s computed sample size and power onto this design (governed)'
            : 'The engine did not size this design — the fields it needs are named above'}
        >
          {I.penLine} Apply sample size to design
        </button>
        <button className="btn" style={{ height: 28, fontSize: 12 }} onClick={() => openDesignInBiostatistics(studyId, onNav)}>
          {I.sigma} Open in Biostatistics
        </button>
      </div>
      {open && (
        <ApplySampleSizeForm
          assessment={assessment}
          onCancel={() => setOpen(false)}
          onDone={(msg) => { setOpen(false); setNotice({ tone: 'ok', text: msg }); onApplied(); }}
          onError={(msg) => { setOpen(false); setNotice({ tone: 'error', text: msg }); }}
        />
      )}
    </>
  );
}
