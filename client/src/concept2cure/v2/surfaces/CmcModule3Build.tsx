/**
 * Module 3 build — the surface where CMC data becomes the CTD §3.2 dossier.
 *
 * ── What this binds ───────────────────────────────────────────────────────────
 * The Module 3 operating system has existed server-side in full and had exactly
 * one caller in this UI: the section-approve endpoint. Everything between "a
 * scientist recorded a specification" and "a section is approved" was
 * unreachable from the product:
 *
 *   GET  /api/cmc/module3-os/build-state/:projectId      per-section build state
 *   POST /api/cmc/module3-os/compile/:projectId          compile all §3.2 sections
 *   POST /api/cmc/module3-os/build-section/:pid/:key     compile one section
 *   POST /api/cmc/module3-os/contradictions/:projectId   run detection
 *   GET  /api/cmc/module3-os/contradictions/:projectId   the open findings
 *   PATCH /api/cmc/module3-os/contradictions/:id/resolve resolve one
 *   GET  /api/cmc/module3-os/readiness/:projectId        export readiness
 *   POST /api/cmc/module3-os/guard/final-export/:pid     the fail-closed gate
 *   GET  /api/cmc/module3-os/provenance/:pid/:key        the section audit chain
 *
 * This surface is those nine endpoints. It adds no route and no schema.
 *
 * ── The honesty rules it keeps ────────────────────────────────────────────────
 * Nothing here is computed locally and presented as server state. Build state,
 * completeness, missing inputs, contradictions and the export verdict are all
 * read back from the endpoints after each action; a compile that fails leaves
 * the grid exactly as it was and says why. The export gate is fail-closed
 * server-side and this surface reports its answer verbatim — including the 409
 * body, which carries the reason the release was refused.
 */

import React from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { apiRequest } from '@/lib/queryClient';
import { EmptyState, useLiveData, useLiveRows } from '../dataConnect';
import { C2CForm } from '../C2CForm';
import { CmHead, cmcProjectId, cmcWriteError } from './cmcShared';
import { openProgramAction } from '../programAction';
import { C2CToast, useToast } from '../toast';
import { SectionEvidence } from './CmcSectionEvidence';
import { PlaceIntoSubmission } from './CmcPlaceIntoSubmission';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { module3InputList } from '@shared/cmc/module3-input-words';

/* ── The read models ─────────────────────────────────────────────────────── */

/** One row of GET /build-state/:projectId → data.sections[]. */
export interface Module3SectionState {
  sectionKey: string;
  sectionLabel: string;
  buildState: string;
  sourceObjectCount: number;
  uploadedSourceCount: number;
  sourceTypes: string[];
  completeness: number;
  missingInputs: string[];
  hasContradictions: boolean;
  contradictionCount: number;
  isStale: boolean;
  staleReason: string | null;
  approvalState: string;
  hasNarrative: boolean;
  artifactId: string | null;
  artifactStatus: string | null;
  lastCompiled: string | null;
  lastUpdated: string | null;
}

/* The view's lead, named once: the empty state and the board must not drift
   into two descriptions of the same tab. The meta was "…from your CMC data";
   "the study records" is what the other half of the work area is now called
   (D5 §A.3), so the sentence points at a place the reader can go. */
const BUILD_TITLE = 'Module 3 build';
const BUILD_META = 'Compile CTD §3.2 from the study records, resolve what blocks it, and clear the export gate';

export interface Module3BuildSummary {
  totalSections: number;
  readySections: number;
  staleSections: number;
  blockedSections: number;
  buildableSections: number;
  readinessPercent: number;
}

/**
 * The build's figures as the section's one grey line (D5 §A.4.13).
 *
 * Every number is the same read the five tiles made, and the two that stop an
 * export — stale and blocked — keep the error colour when they are not zero,
 * with the WORD beside them, never colour alone. "Approved" keeps its own
 * tone band, so a reader sees at a glance whether the module is near ready.
 */
const EMPTY_BUILD_SUMMARY = {
  readySections: 0, staleSections: 0, blockedSections: 0, buildableSections: 0, readinessPercent: 0,
};
/** How near ready the module is, in the band the tile's tone used. */
function readinessTone(pct: number): string {
  if (pct >= 80) return 'ok';
  return pct >= 50 ? 'warn' : 'err';
}
function BuildCounts({ sections, summary }: { sections: number; summary?: Module3BuildSummary }) {
  const n = { ...EMPTY_BUILD_SUMMARY, totalSections: sections, ...summary };
  return (
    <p className="sec-sub" data-testid="m3-build-counts">
      {n.totalSections} {n.totalSections === 1 ? 'section' : 'sections'} in CTD §3.2
      {' · '}
      <span data-tone={readinessTone(n.readinessPercent)}>{n.readySections} of {n.totalSections} approved</span>
      {' · '}{n.buildableSections} ready to compile
      {' · '}<span data-tone={n.staleSections ? 'err' : undefined}>{n.staleSections} stale</span>
      {' · '}<span data-tone={n.blockedSections ? 'err' : undefined}>{n.blockedSections} blocked</span>
    </p>
  );
}

interface Module3BuildPayload {
  sections?: Module3SectionState[];
  summary?: Module3BuildSummary;
  /**
   * Whether the governed artifact registry was addressable for this project.
   * When it wasn't ('unanchored' | 'unaddressable'), every artifactId in
   * `sections` is null BECAUSE of that — the server's detail says why, and
   * this surface must show the distinction rather than render it as "no
   * artifacts".
   */
  artifactRegistry?: { state: 'linked' | 'unanchored' | 'unaddressable'; detail?: string };
}

export interface Module3Readiness {
  totalSections: number;
  approvedSections: number;
  staleSections: number;
  openCriticalContradictions: number;
  /** Sections with no recorded source lineage — the audit trail has a gap. */
  sectionsWithoutProvenance?: number;
  /** Approved sections whose own compiled record says they are incomplete — the gate refuses on them. */
  incompleteApprovedSections?: string[];
  /** False = the governed-decision fabric returned no verdict (not "it cleared"). */
  governedStateEvaluated?: boolean;
  exportReady: boolean;
  /** The export gate's own sentence when it would refuse — readiness is the gate's verdict. */
  blockedBecause?: string | null;
}

export interface Module3Contradiction {
  id: string;
  severity: string;
  contradictionType: string;
  details: string;
  impactedSections: string[] | null;
  requiredReviewers: string[] | null;
  status: string;
  updatedAt: string | null;
}

interface ProvenanceEvent {
  eventType: string;
  eventPayload: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string | null;
}

/* ── Presentation vocabulary ─────────────────────────────────────────────── */

/**
 * The eleven states `deriveBuildState` can return, each with the tone it should
 * read as and what it means for the person looking at it. The server owns the
 * derivation; this map only says how each one is shown, so a state the server
 * adds later renders neutrally rather than being guessed into a green chip.
 */
export const BUILD_STATE_META: Record<string, { tone: string; label: string; hint: string }> = {
  no_sources: { tone: 'dim', label: 'no sources', hint: 'Nothing feeds this section yet — record the underlying CMC data or upload a source document.' },
  sources_uploaded: { tone: 'dim', label: 'sources uploaded', hint: 'Source documents are classified to this section but have not been extracted into canonical data.' },
  extraction_pending: { tone: 'warn', label: 'extraction pending', hint: 'Extraction from the uploaded sources has not completed.' },
  extraction_complete: { tone: 'warn', label: 'ready to compile', hint: 'Canonical source data exists for this section. Compile to draft it.' },
  compiled: { tone: 'warn', label: 'compiled', hint: 'A deterministic draft exists. It has not yet been placed as a governed artifact.' },
  draft_artifact_created: { tone: 'warn', label: 'draft in editor', hint: 'A governed draft artifact exists for this section.' },
  stale: { tone: 'err', label: 'stale', hint: 'A source changed after this section was built. Recompile before it can be approved or exported.' },
  contradiction_flagged: { tone: 'err', label: 'contradiction', hint: 'An unresolved contradiction impacts this section. Critical ones block approval.' },
  review: { tone: 'warn', label: 'in review', hint: 'The artifact for this section is under review.' },
  approved: { tone: 'ok', label: 'approved', hint: 'Signed off and not stale.' },
  locked: { tone: 'ok', label: 'locked', hint: 'Locked for submission.' },
};

/** What a contradiction sweep compared (POST …/contradictions `examined`). */
interface SweepExamined {
  specifications?: number;
  methods?: number;
  stability?: number;
  batches?: number;
  comparability?: number;
}

/** The last recorded sweep (GET …/contradictions `meta.lastSweep`). */
interface LastSweep {
  at: string;
  by: string | null;
  examined: SweepExamined | null;
  found: number | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Compared 2 specifications, 1 method, …" — or that the scope was not reported. */
function sweepScope(e: SweepExamined | undefined): string {
  if (!e) return 'What it compared was not reported';
  return (
    'Compared ' +
    [
      plural(e.specifications ?? 0, 'specification', 'specifications'),
      plural(e.methods ?? 0, 'method', 'methods'),
      plural(e.stability ?? 0, 'stability study', 'stability studies'),
      plural(e.batches ?? 0, 'batch', 'batches'),
      plural(e.comparability ?? 0, 'comparability assessment', 'comparability assessments'),
    ].join(', ')
  );
}

export function buildStateMeta(state: string) {
  return BUILD_STATE_META[state] ?? { tone: 'dim', label: state.replace(/_/g, ' '), hint: '' };
}

function severityTone(sev: string): string {
  const v = String(sev || '').toLowerCase();
  if (v === 'critical') return 'err';
  if (v === 'major' || v === 'high') return 'warn';
  return 'dim';
}

function fmtWhen(value: string | null | undefined): string {
  if (!value) return '--';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString();
}

/* ── The surface ─────────────────────────────────────────────────────────── */

/* `ask` stays in the props type — CMC_SURF hands every tab the same pair — but
   this tab no longer reads it: its orange "Ask AnA" went with `Head`, and its
   `SUGGEST` list reaches the reader through the page's starter row. */
export function CmModule3Build({ nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const projectId = cmcProjectId();
  const [reloadKey, setReloadKey] = React.useState(0);
  const bump = () => setReloadKey((n) => n + 1);

  const build = useLiveData<Module3BuildPayload>(
    projectId ? '/api/cmc/module3-os/build-state/' + encodeURIComponent(projectId) : null,
    [projectId, reloadKey],
  );
  const readiness = useLiveData<Module3Readiness>(
    projectId ? '/api/cmc/module3-os/readiness/' + encodeURIComponent(projectId) : null,
    [projectId, reloadKey],
  );
  const contradictions = useLiveRows<Module3Contradiction>(
    projectId ? '/api/cmc/module3-os/contradictions/' + encodeURIComponent(projectId) : null,
    [projectId, reloadKey],
  );

  const [toast, fireToast] = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [resolving, setResolving] = React.useState<Module3Contradiction | null>(null);
  const [provenanceFor, setProvenanceFor] = React.useState<Module3SectionState | null>(null);
  const [evidenceFor, setEvidenceFor] = React.useState<Module3SectionState | null>(null);
  const [gate, setGate] = React.useState<{ ok: boolean; message: string } | null>(null);

  const sections = build.data?.sections ?? [];
  const summary = build.data?.summary;
  const open = contradictions.rows.filter((c) => c.status !== 'resolved');
  /* When the program was last swept, and over what (GET …/contradictions
     meta). An empty list from a program nobody swept is not "no
     contradictions"; the export gate runs the detector itself either way. */
  const lastSweep = (contradictions.meta as { lastSweep?: LastSweep | null } | undefined)?.lastSweep ?? null;
  const criticalOpen = open.filter((c) => String(c.severity).toLowerCase() === 'critical');

  /** Every action here is awaited, reports the server's own words, and reloads
   *  the read models rather than assuming what the write did. */
  const run = async (
    key: string,
    method: 'POST' | 'PATCH',
    path: string,
    body: unknown,
    onOk: (json: unknown) => string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      const res = await apiRequest(method, path, body);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(cmcWriteError(json, res.status), 'error');
        return null;
      }
      fireToast(onOk(json));
      bump();
      return json;
    } catch (e) {
      fireToast(e instanceof Error ? e.message : String(e), 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const compileAll = () =>
    run('compile', 'POST', '/api/cmc/module3-os/compile/' + encodeURIComponent(projectId!), {}, (json) => {
      const n = (json as { compiledCount?: number })?.compiledCount ?? 0;
      const bridged = (json as { bridgedArtifacts?: unknown[] })?.bridgedArtifacts?.length ?? 0;
      /* A section the server compiled but could NOT place as an artifact is
         said out loud with the server's reason — "compiled successfully" while
         zero artifacts land is exactly the silence that hid the spine break. */
      const skips = (json as { bridgeSkips?: Array<{ detail?: string }> })?.bridgeSkips ?? [];
      const skipTail = skips.length
        ? ` ${skips.length} could not be placed as governed ${skips.length === 1 ? 'artifact' : 'artifacts'}: ${skips[0]?.detail ?? 'see the build state'}`
        : '';
      return `Compiled ${n} §3.2 ${n === 1 ? 'section' : 'sections'} · ${bridged} placed as governed ${bridged === 1 ? 'artifact' : 'artifacts'}.${skipTail}`;
    });

  const buildSection = (s: Module3SectionState) =>
    run(
      'section:' + s.sectionKey,
      'POST',
      '/api/cmc/module3-os/build-section/' + encodeURIComponent(projectId!) + '/' + encodeURIComponent(s.sectionKey),
      {},
      (json) => {
        const d = (json as { data?: { completeness?: number; sourceCount?: number } })?.data;
        return `§${s.sectionKey} built from ${d?.sourceCount ?? 0} ${d?.sourceCount === 1 ? 'source' : 'sources'} · ${d?.completeness ?? 0}% complete.`;
      },
    );

  const detectContradictions = () =>
    run('contradictions', 'POST', '/api/cmc/module3-os/contradictions/' + encodeURIComponent(projectId!), {}, (json) => {
      const body = json as {
        contradictions?: unknown[];
        tasks?: { created?: number; existing?: number; error?: string };
      };
      const found = body?.contradictions?.length ?? 0;
      if (found === 0) {
        // Say what was compared: a sweep over empty registers also finds nothing.
        return 'Contradiction sweep complete — nothing found. ' + sweepScope((json as { examined?: SweepExamined })?.examined) + '.';
      }
      /* Each finding is now raised as work on the shared task board. Say what
         happened to it: "3 findings recorded" and a silently empty board is the
         gap this closes, and a tasking failure must not read as a success. */
      const t = body?.tasks;
      const tail = t?.error
        ? ' Tasks could NOT be raised on the board — the findings stand, but nobody is holding them yet.'
        : t?.created
          ? ` ${t.created} raised as ${t.created === 1 ? 'a task' : 'tasks'}${t.existing ? `, ${t.existing} already open` : ''}.`
          : t?.existing
            ? ` All ${t.existing === 1 ? 'of it is' : 'of them are'} already open as ${t.existing === 1 ? 'a task' : 'tasks'}.`
            : '';
      return `Contradiction sweep complete — ${found} ${found === 1 ? 'finding' : 'findings'} recorded.${tail}`;
    });

  const resolveContradiction = async (values: Record<string, string>) => {
    if (!resolving) return;
    const done = await run(
      'resolve',
      'PATCH',
      '/api/cmc/module3-os/contradictions/' + encodeURIComponent(resolving.id) + '/resolve',
      { resolutionNote: values.resolutionNote },
      () => 'Contradiction resolved — the resolution note is recorded in the provenance chain.',
    );
    if (done) setResolving(null);
  };

  /**
   * The final-export gate. This is the one action whose FAILURE is the useful
   * answer: a 409 carries the reason the release is refused (unapproved
   * sections, sections that went stale after approval, unresolved critical
   * contradictions, a blocking governed decision). It is shown as the verdict
   * it is, not swallowed as an error.
   */
  const checkExportGate = async () => {
    if (busy || !projectId) return;
    setBusy('gate');
    setGate(null);
    try {
      const res = await apiRequest('POST', '/api/cmc/module3-os/guard/final-export/' + encodeURIComponent(projectId), {});
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setGate({ ok: true, message: (json as { message?: string })?.message || 'Final export gate passed.' });
      } else {
        setGate({ ok: false, message: cmcWriteError(json, res.status) });
      }
    } catch (e) {
      setGate({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  if (!projectId) {
    return (
      <div className="cm-body">
        <CmHead title={BUILD_TITLE} meta={BUILD_META} />
        <EmptyState
          icon={I.layers}
          title="Open a project to build its Module 3"
          hint="The §3.2 build state, its contradictions and its export readiness are all per-project."
          action={openProgramAction(nav)}
          regulation="Serves the CTD Module 3 record (ICH M4Q)"
        />
      </div>
    );
  }

  return (
    <div className="cm-body">
      {/* The view's one primary (§WA.3 "Actions"): in a tabbed work area the
          header holds none and the active tab's lead row holds it, so its
          position is the same on every tab. */}
      <CmHead
        title={BUILD_TITLE}
        meta={BUILD_META}
        actions={
          <>
            <button type="button" className="btn ghost small" onClick={() => void detectContradictions()} disabled={Boolean(busy)}>
              {I.shieldAlert} {busy === 'contradictions' ? 'Sweeping…' : 'Run contradiction sweep'}
            </button>
            <button type="button" className="btn primary small" onClick={() => void compileAll()} disabled={Boolean(busy)}>
              {I.zap} {busy === 'compile' ? 'Compiling…' : 'Compile Module 3'}
            </button>
          </>
        }
      />

      {build.loading ? (
        <EmptyState icon={I.layers} title="Loading the Module 3 build state…" busy testId="m3-build-loading" />
      ) : build.status === 409 ? (
        /* The composition boundary (decision P-28: small-molecule Module 3 for
           a US IND) refused this program — a biologic, a marketing
           application, or a substance whose modality is not yet recorded (the
           one titled as a record still to make, by its code). That is an
           answer about the program, not a failed read, so it is said in the
           server's own words and offers no retry: retrying changes nothing
           until the program's records do. A read that failed is 503 and takes
           the error branch below, with its retry. */
        <EmptyState
          icon={I.layers}
          title={
            build.code === 'CMC_MODALITY_NOT_ESTABLISHED'
              ? 'This project’s drug substance is not established yet'
              : 'Module 3 is not composed here for this project'
          }
          hint={build.error}
          regulation="Serves the CTD Module 3 record (ICH M4Q)"
          testId="m3-build-out-of-scope"
        />
      ) : build.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn’t load the Module 3 build state"
          hint="The Module 3 build state didn’t respond. It aggregates canonical source objects, compiled sections, contradictions and governed artifacts for this project — sign in and retry."
          retry={bump}
          testId="m3-build-error"
        />
      ) : (
        <>
          {build.data?.artifactRegistry && build.data.artifactRegistry.state !== 'linked' && (
            <div className="pj-con" style={{ marginBottom: 16 }} data-testid="m3-registry-unlinked">
              <span className="ico">{I.alertTriangle}</span>
              <div>
                <div className="pj-con-t">Governed artifact registry not linked</div>
                <div className="pj-con-d">
                  {build.data.artifactRegistry.detail ||
                    'The artifact registry could not be addressed for this project, so no governed artifacts are shown — not because there are none.'}
                </div>
              </div>
            </div>
          )}

          {/* Five tiles were five figures nobody acts on as tiles; they are
              the build table's one grey line now (D5 §A.4.13). Every number
              and every tone is the same read — stale and blocked keep the
              error colour when they are not zero, because those two are the
              ones that stop an export. */}
          <BuildCounts sections={sections.length} summary={summary} />

          {/* ── Export gate ── */}
          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h">
              <span className="t">Export readiness</span>
              <span className="s">fail-closed — 21 CFR §11 / governed decision fabric</span>
              <button className="nda-open cm-reg-add" onClick={() => void checkExportGate()} disabled={Boolean(busy)}>
                {I.shieldCheck} {busy === 'gate' ? 'Checking…' : 'Check export gate'}
              </button>
            </div>
            <div className="pj-card-b">
              {readiness.loading ? (
                <div role="status" aria-busy="true" className="cm-meta">Computing readiness…</div>
              ) : readiness.error ? (
                <div role="alert" className="cm-meta">Readiness could not be computed — {readiness.error}</div>
              ) : readiness.data ? (
                <div className="cm-gate">
                  <span className={'rd-chip tone-' + (readiness.data.exportReady ? 'ok' : 'warn')}>
                    {readiness.data.exportReady ? 'export ready' : 'not export ready'}
                  </span>
                  <span className="cm-meta">
                    {readiness.data.approvedSections} of {readiness.data.totalSections} sections approved
                    {readiness.data.staleSections ? ` · ${readiness.data.staleSections} stale` : ''}
                    {readiness.data.openCriticalContradictions
                      ? ` · ${readiness.data.openCriticalContradictions} critical contradiction${readiness.data.openCriticalContradictions === 1 ? '' : 's'} open`
                      : ''}
                    {/* Three reasons the gate refuses that the counts above never showed. */}
                    {readiness.data.incompleteApprovedSections?.length
                      ? ` · ${readiness.data.incompleteApprovedSections.length} approved but incomplete (§${readiness.data.incompleteApprovedSections.join(', §')})`
                      : ''}
                    {readiness.data.sectionsWithoutProvenance
                      ? ` · ${readiness.data.sectionsWithoutProvenance} section${readiness.data.sectionsWithoutProvenance === 1 ? '' : 's'} with no recorded source lineage`
                      : ''}
                    {readiness.data.governedStateEvaluated === false
                      ? ' · the governed-decision state could not be evaluated, so nothing here is cleared'
                      : ''}
                  </span>
                  {!readiness.data.exportReady && readiness.data.blockedBecause && (
                    <div className="cm-meta" data-testid="m3-readiness-blocked">{readiness.data.blockedBecause}</div>
                  )}
                </div>
              ) : (
                <div className="cm-meta">No compiled sections yet — compile Module 3 to establish a readiness baseline.</div>
              )}
              {gate && (
                <div className={'pj-con cm-gate-verdict' + (gate.ok ? ' is-ok' : '')}>
                  <span className="ico">{gate.ok ? I.shieldCheck : I.alertTriangle}</span>
                  <div>
                    <div className="pj-con-t">{gate.ok ? 'Final export gate passed' : 'Final export refused'}</div>
                    <div className="pj-con-d">{gate.message}</div>
                  </div>
                </div>
              )}
            </div>
            {readiness.data?.exportReady && (
              <div className="pj-card-b" style={{ paddingTop: 0 }}>
                <PlaceIntoSubmission projectId={projectId} onPlaced={bump} />
                <button className="nda-open" style={{ marginTop: 10 }} onClick={() => nav && nav('ectd-compile')}>
                  {I.fileDown} Open the eCTD assembly
                </button>
              </div>
            )}
          </div>

          {/* ── Contradictions ── */}
          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h">
              <span className="t">Contradictions</span>
              <span className="s">
                {/* This header claimed "0 open -- across specifications, methods,
                    stability, batch and comparability" UNCONDITIONALLY — while the
                    read was in flight and after it had failed. useLiveRows hands
                    back empty rows on a failed read exactly as on a genuinely empty
                    one; only its loading/error flags tell them apart, and the card
                    BODY below already branches on both. The header never did, so a
                    reviewer skimming the summary of a filing-blocking gate took "0
                    open" as a clean sweep that had not happened. It now says what
                    the body says: a count only from a settled, successful read. */}
                {contradictions.loading
                  ? 'Loading contradictions…'
                  : contradictions.error
                    ? 'Couldn’t load contradictions — no count is claimed'
                    : !lastSweep
                      ? 'Not swept yet — no count is claimed'
                      : `${open.length} open${criticalOpen.length ? ` — ${criticalOpen.length} critical` : ''} — last swept ${new Date(lastSweep.at).toLocaleString()}`}
              </span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {open.length === 0 ? (
                <div style={{ padding: 12 }}>
                  {contradictions.loading ? (
                    <EmptyState icon={I.shieldAlert} title="Loading contradictions…" busy />
                  ) : contradictions.error ? (
                    <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load contradictions" hint={contradictions.error} retry={bump} />
                  ) : (
                    !lastSweep ? (
                      <EmptyState
                        icon={I.shieldAlert}
                        title="Not swept yet"
                        hint="No contradiction sweep has run for this project, so no finding is recorded and none is claimed absent. Run the sweep after recording CMC data. The export gate refuses a critical finding in the records whether or not a sweep recorded it."
                      />
                    ) : (
                      <EmptyState
                        icon={I.shieldCheck}
                        title="No open contradictions at the last sweep"
                        hint={`Swept ${new Date(lastSweep.at).toLocaleString()}. ${sweepScope(lastSweep.examined ?? undefined)}. Run the sweep again after recording new CMC data — a critical finding blocks section approval.`}
                      />
                    )
                  )}
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead>
                    <tr><th>Severity</th><th>Type</th><th>Detail</th><th>Impacted sections</th><th style={{ textAlign: 'right' }}>Action</th></tr>
                  </thead>
                  <tbody>
                    {open.map((c) => (
                      <tr key={c.id}>
                        <td><span className={'rd-chip tone-' + severityTone(c.severity)}>{c.severity}</span></td>
                        <td className="mono">{c.contradictionType}</td>
                        <td>{c.details}</td>
                        <td>{(c.impactedSections ?? []).join(', ') || '--'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="nda-open" onClick={() => setResolving(c)}>{I.check} Resolve</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Section grid ── */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">§3.2 build state</span>
              <span className="s">{sections.length} subsections — source coverage, completeness and approval</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {sections.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState
                    icon={I.layers}
                    title="No build state for this project yet"
                    hint="Record CMC data (drug substance, specifications, methods, stability, batches) — each write feeds the canonical source layer this board is computed from."
                  />
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead>
                    <tr>
                      <th>Section</th><th>Title</th><th>Sources</th><th>Complete</th>
                      <th>Missing inputs</th><th>State</th><th>Approval</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((s) => {
                      const meta = buildStateMeta(s.buildState);
                      return (
                        <tr key={s.sectionKey}>
                          <td className="mono" style={{ fontWeight: 600 }}>{s.sectionKey}</td>
                          <td>{s.sectionLabel}</td>
                          <td>
                            {s.sourceObjectCount === 0 && s.uploadedSourceCount === 0 ? (
                              <span className="cm-meta">none</span>
                            ) : (
                              <>
                                {s.sourceObjectCount} canonical
                                {s.uploadedSourceCount ? ` · ${s.uploadedSourceCount} uploaded` : ''}
                              </>
                            )}
                          </td>
                          <td>
                            <div className="cm-projbar cm-projbar-sm">
                              <span
                                className="fill"
                                style={{
                                  width: Math.max(0, Math.min(100, s.completeness)) + '%',
                                  background: s.completeness >= 80 ? 'var(--success)' : s.completeness >= 40 ? 'var(--accent-100)' : 'var(--warning)',
                                }}
                              />
                            </div>
                            <span className="cm-meta">{s.completeness}%</span>
                          </td>
                          <td>
                            {s.missingInputs.length === 0 ? (
                              <span className="cm-meta">--</span>
                            ) : (
                              <span className="sp-tone-warn" title={module3InputList(s.missingInputs)}>
                                {module3InputList(s.missingInputs.slice(0, 2))}
                                {s.missingInputs.length > 2 ? ` +${s.missingInputs.length - 2}` : ''}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={'rd-chip tone-' + meta.tone} title={meta.hint}>{meta.label}</span>
                            {s.isStale && s.staleReason ? <div className="cm-meta">{s.staleReason}</div> : null}
                          </td>
                          <td><span className="cm-meta">{s.approvalState.replace(/_/g, ' ')}</span></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="nda-open"
                              onClick={() => void buildSection(s)}
                              disabled={Boolean(busy) || s.sourceObjectCount === 0}
                              title={s.sourceObjectCount === 0 ? 'No canonical source data feeds this section yet' : 'Compile this section and place it as a governed artifact'}
                            >
                              {I.zap} {busy === 'section:' + s.sectionKey ? 'Building…' : 'Build'}
                            </button>
                            <button
                              className="nda-open"
                              style={{ marginLeft: 6 }}
                              onClick={() => setProvenanceFor(s)}
                              disabled={!s.lastCompiled}
                              title={s.lastCompiled ? 'Show the provenance chain for this section' : 'Nothing has been compiled for this section yet'}
                            >
                              {I.history} History
                            </button>
                            <button
                              className="nda-open"
                              style={{ marginLeft: 6 }}
                              onClick={() => setEvidenceFor(s)}
                              title="The Vault documents this section’s records were taken from"
                            >
                              {I.paperclip} Evidence
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {resolving && (
        <C2CForm
          config={{
            eyebrow: 'Module 3 — contradiction',
            title: 'Resolve ' + resolving.contradictionType,
            sub: resolving.details,
            governed: 'The resolution note is written to the Module 3 provenance chain and the audit trail against your account.',
            submitLabel: 'Record resolution',
            fields: [
              {
                key: 'resolutionNote',
                label: 'Resolution',
                type: 'textarea',
                required: true,
                rows: 4,
                desc: `At least ${GOVERNED_REASON_MIN} characters. A later sweep keeps this resolution while the data stays the same; a change to the data reopens the finding.`,
                placeholder: 'What was changed, or why the two records are not in fact in conflict…',
              },
            ],
          }}
          onCancel={() => setResolving(null)}
          onSubmit={resolveContradiction}
        />
      )}
      {provenanceFor && (
        <SectionProvenance projectId={projectId} section={provenanceFor} onClose={() => setProvenanceFor(null)} />
      )}
      {evidenceFor && (
        <SectionEvidence
          projectId={projectId}
          sectionKey={evidenceFor.sectionKey}
          sectionLabel={evidenceFor.sectionLabel}
          onClose={() => setEvidenceFor(null)}
          onChanged={bump}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ── Section provenance drawer ───────────────────────────────────────────── */

/**
 * The audit chain for one section: every compile, refresh and approval recorded
 * against it in `cmc_provenance_events`. This is the traceability a reviewer
 * asks for — "what was this section built from, and when did it change" — and
 * it is read from the store, never reconstructed on the client.
 */
function SectionProvenance({
  projectId,
  section,
  onClose,
}: {
  projectId: string;
  section: Module3SectionState;
  onClose: () => void;
}) {
  const events = useLiveRows<ProvenanceEvent>(
    '/api/cmc/module3-os/provenance/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(section.sectionKey),
  );
  const dlgRef = useDialog(onClose);
  return (
    <div className="de-bd" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* It declared role="dialog" and stopped there: no aria-modal, so a screen
          reader kept reading the build behind it; no Escape; and focus stayed on
          whatever opened it. useDialog is the shared answer and this is already
          its own component, so the hook can simply live here. */}
      <div
        className="de"
        ref={dlgRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={'Provenance for section ' + section.sectionKey}
      >
        <div className="de-h">
          <div>
            <div className="de-h-eye">Module 3 — provenance</div>
            <div className="de-h-t">§{section.sectionKey}</div>
            <div className="de-h-s">{section.sectionLabel}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>
        <div className="de-body">
          {events.loading ? (
            <div role="status" className="cm-meta">Loading the provenance chain…</div>
          ) : events.error ? (
            <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the provenance chain" hint={events.error} />
          ) : events.rows.length === 0 ? (
            <EmptyState icon={I.scroll} title="No recorded events" hint="Compiles, refreshes and approvals for this section appear here as they happen." />
          ) : (
            <ol className="cm-prov">
              {events.rows.map((e, i) => (
                <li key={i}>
                  <div className="cm-prov-h">
                    <span className={'rd-chip tone-' + (e.eventType === 'approved' ? 'ok' : e.eventType === 'refreshed' ? 'warn' : 'dim')}>{e.eventType}</span>
                    <span className="cm-meta">{fmtWhen(e.createdAt)}</span>
                  </div>
                  <div className="cm-meta">by {e.createdBy || 'system'}</div>
                  {e.eventPayload && Object.keys(e.eventPayload).length > 0 && (
                    <pre className="cm-prov-p">{JSON.stringify(e.eventPayload, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Local chrome ────────────────────────────────────────────────────────── */

export const SUGGEST = [
  'Which §3.2 sections are blocking my export and why?',
  'Draft the narrative for the section with the lowest completeness',
  'What still stands between this Module 3 and its IND sequence?',
];

/* This file's own `Head` and `Kpi` are deleted (D5 §A.4.13). `Head` drew a
   second page header — an uppercase kicker, an `h1` under the page's `h1`, and
   an orange "Ask AnA" beside an orange "Compile Module 3", the two orange
   fills §WA.3 allows one of — and `Kpi` was a byte-near copy of CmcModule's.
   Both now come from ./cmcShared: one lead and one figure for all nine tabs.
   `SUGGEST` stays, exported: it is this tab's asks, and the page's starter row
   reads it (CmcModule's CMC_SUGGEST.build), so the prompts have one home. */
