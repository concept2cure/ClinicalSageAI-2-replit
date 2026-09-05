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
import { apiRequest } from '@/lib/queryClient';
import { EmptyState, useLiveData, useLiveRows } from '../dataConnect';
import { C2CForm } from '../C2CForm';
import { cmcProjectId, cmcWriteError } from './cmcShared';
import { openProgramAction } from '../programAction';
import { C2CToast, useToast } from '../toast';

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

export interface Module3BuildSummary {
  totalSections: number;
  readySections: number;
  staleSections: number;
  blockedSections: number;
  buildableSections: number;
  readinessPercent: number;
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

/** GET /api/submissions rows (subset the placement picker reads). */
interface SubmissionRow {
  id: number;
  title: string;
  applicationType: string;
  status: string;
}

/** GET /api/submissions/:id/sequences rows (subset). */
interface SequenceRow {
  id: number;
  sequenceNumber: string;
  status: string; // draft|assembling|validated|frozen|dispatched
}

interface PlacementOutcome {
  placements: Array<{ sectionKey: string; leafSectionCode: string; leafId: number; title: string }>;
  skipped: Array<{ sectionKey: string; reason: string }>;
}

export interface Module3Readiness {
  totalSections: number;
  approvedSections: number;
  staleSections: number;
  openCriticalContradictions: number;
  /** Sections with no recorded source lineage — the audit trail has a gap. */
  sectionsWithoutProvenance?: number;
  /** False = the governed-decision fabric returned no verdict (not "it cleared"). */
  governedStateEvaluated?: boolean;
  exportReady: boolean;
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

export function CmModule3Build({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
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
  const [gate, setGate] = React.useState<{ ok: boolean; message: string } | null>(null);

  const sections = build.data?.sections ?? [];
  const summary = build.data?.summary;
  const open = contradictions.rows.filter((c) => c.status !== 'resolved');
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
        return 'Contradiction sweep complete — nothing found across specifications, methods, stability, batches and comparability.';
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
        <Head ask={ask} />
        <div className="pj-card">
          <div className="pj-card-b">
            <EmptyState
              icon={I.layers}
              title="Open a program to build its Module 3"
              hint="The §3.2 build state, its contradictions and its export readiness are all per-project."
              action={openProgramAction(nav)}
              regulation="Serves the CTD Module 3 record (ICH M4Q)"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-body">
      <Head
        ask={ask}
        actions={
          <>
            <button className="nda-open" onClick={() => void detectContradictions()} disabled={Boolean(busy)}>
              {I.shieldAlert} {busy === 'contradictions' ? 'Sweeping…' : 'Run contradiction sweep'}
            </button>
            <button className="reg-cta" onClick={() => void compileAll()} disabled={Boolean(busy)}>
              {I.zap} {busy === 'compile' ? 'Compiling…' : 'Compile Module 3'}
            </button>
          </>
        }
      />

      {build.loading ? (
        <EmptyState icon={I.layers} title="Loading the Module 3 build state…" busy testId="m3-build-loading" />
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
                    'The artifact registry could not be addressed for this program, so no governed artifacts are shown — not because there are none.'}
                </div>
              </div>
            </div>
          )}

          <div className="cm-kpis">
            <Kpi l="Sections" v={summary?.totalSections ?? sections.length} s="CTD §3.2" />
            <Kpi
              l="Approved"
              v={`${summary?.readySections ?? 0}/${summary?.totalSections ?? sections.length}`}
              tone={(summary?.readinessPercent ?? 0) >= 80 ? 'ok' : (summary?.readinessPercent ?? 0) >= 50 ? 'warn' : 'err'}
            />
            <Kpi l="Ready to compile" v={summary?.buildableSections ?? 0} />
            <Kpi l="Stale" v={summary?.staleSections ?? 0} tone={summary?.staleSections ? 'err' : 'ok'} />
            <Kpi l="Blocked" v={summary?.blockedSections ?? 0} tone={summary?.blockedSections ? 'err' : 'ok'} />
          </div>

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
                <div className="cm-meta">Computing readiness…</div>
              ) : readiness.error ? (
                <div className="cm-meta">Readiness could not be computed — {readiness.error}</div>
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
                    {/* Two reasons the gate refuses that the counts above never showed. */}
                    {readiness.data.sectionsWithoutProvenance
                      ? ` · ${readiness.data.sectionsWithoutProvenance} section${readiness.data.sectionsWithoutProvenance === 1 ? '' : 's'} with no recorded source lineage`
                      : ''}
                    {readiness.data.governedStateEvaluated === false
                      ? ' · the governed-decision state could not be evaluated, so nothing here is cleared'
                      : ''}
                  </span>
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
                    : `${open.length} open${criticalOpen.length ? ` -- ${criticalOpen.length} critical` : ''} -- across specifications, methods, stability, batch and comparability`}
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
                    <EmptyState
                      icon={I.shieldCheck}
                      title="No open contradictions"
                      hint="The detection engine compares specifications against their methods, stability against its studies, batch dispositions and comparability risk. Run the sweep after recording new CMC data — a critical finding blocks section approval."
                    />
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
                              <span className="sp-tone-warn" title={s.missingInputs.join(', ')}>
                                {s.missingInputs.slice(0, 2).join(', ')}
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
            governed: 'The resolution note is written to the Module 3 provenance chain against your account.',
            submitLabel: 'Record resolution',
            fields: [
              {
                key: 'resolutionNote',
                label: 'Resolution',
                type: 'textarea',
                required: true,
                rows: 4,
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
      <C2CToast msg={toast} />
    </div>
  );
}

/* ── Place into submission ───────────────────────────────────────────────── */

/**
 * The CMC → IND seam, from this side. POST /place-into-submission snapshots
 * every approved §3.2 section into the canonical renderable leaf source and
 * places real submission leaves at the m-prefixed section codes — after
 * re-running the same final-export gate this surface's "Check export gate"
 * button reports. The pickers render live org data with honest empty and
 * error states; frozen/dispatched sequences are excluded WITH the reason
 * (their leaves are immutable — the server refuses them too); the server's
 * verdict is shown verbatim either way.
 */
function PlaceIntoSubmission({ projectId, onPlaced }: { projectId: string; onPlaced: () => void }) {
  const submissions = useLiveRows<SubmissionRow>('/api/submissions');
  const [submissionId, setSubmissionId] = React.useState<number | null>(null);
  const sequences = useLiveRows<SequenceRow>(
    submissionId != null ? `/api/submissions/${submissionId}/sequences` : null,
    [submissionId],
  );
  const [sequenceId, setSequenceId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [verdict, setVerdict] = React.useState<
    | { ok: true; outcome: PlacementOutcome }
    | { ok: false; message: string }
    | null
  >(null);

  const lockedSeq = (s: SequenceRow) => s.status === 'frozen' || s.status === 'dispatched';

  const place = async () => {
    if (busy || submissionId == null || sequenceId == null) return;
    setBusy(true);
    setVerdict(null);
    try {
      const res = await apiRequest(
        'POST',
        '/api/cmc/module3-os/place-into-submission/' + encodeURIComponent(projectId),
        { submissionId, sequenceId },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setVerdict({ ok: false, message: cmcWriteError(json, res.status) });
        return;
      }
      const data = (json as { data?: PlacementOutcome })?.data;
      setVerdict({ ok: true, outcome: { placements: data?.placements ?? [], skipped: data?.skipped ?? [] } });
      onPlaced();
    } catch (e) {
      setVerdict({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="m3-place-into-submission">
      <div className="cm-meta" style={{ marginBottom: 6 }}>
        Place the approved §3.2 sections into an IND sequence — each becomes a real submission leaf the
        checklist, package manifest and eCTD assembly read.
      </div>
      {submissions.loading ? (
        <div className="cm-meta">Loading submissions…</div>
      ) : submissions.error ? (
        <div className="cm-meta">Submissions could not be loaded — {submissions.error}</div>
      ) : submissions.rows.length === 0 ? (
        <div className="cm-meta">No submissions exist in this workspace yet — create one in the Submission Center first.</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="c2c-input"
            aria-label="Target submission"
            value={submissionId ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setSubmissionId(v);
              setSequenceId(null);
              setVerdict(null);
            }}
          >
            <option value="">Choose a submission…</option>
            {submissions.rows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.applicationType.toUpperCase()})
              </option>
            ))}
          </select>
          {submissionId != null &&
            (sequences.loading ? (
              <span className="cm-meta">Loading sequences…</span>
            ) : sequences.error ? (
              <span className="cm-meta">Sequences could not be loaded — {sequences.error}</span>
            ) : sequences.rows.length === 0 ? (
              <span className="cm-meta">This submission has no sequences yet — create one in the Submission Center.</span>
            ) : (
              <select
                className="c2c-input"
                aria-label="Target sequence"
                value={sequenceId ?? ''}
                onChange={(e) => {
                  setSequenceId(e.target.value ? Number(e.target.value) : null);
                  setVerdict(null);
                }}
              >
                <option value="">Choose a sequence…</option>
                {sequences.rows.map((s) => (
                  <option key={s.id} value={s.id} disabled={lockedSeq(s)}>
                    {s.sequenceNumber} · {s.status}
                    {lockedSeq(s) ? ' — leaves are immutable' : ''}
                  </option>
                ))}
              </select>
            ))}
          <button
            className="reg-cta"
            onClick={() => void place()}
            disabled={busy || submissionId == null || sequenceId == null}
          >
            {I.fileDown} {busy ? 'Placing…' : 'Place into the submission'}
          </button>
        </div>
      )}
      {verdict &&
        (verdict.ok ? (
          <div className="pj-con cm-gate-verdict is-ok" style={{ marginTop: 10 }}>
            <span className="ico">{I.shieldCheck}</span>
            <div>
              <div className="pj-con-t">
                {verdict.outcome.placements.length}{' '}
                {verdict.outcome.placements.length === 1 ? 'section' : 'sections'} placed into the submission
              </div>
              <div className="pj-con-d">
                {verdict.outcome.placements.map((p) => p.leafSectionCode).join(', ') || '—'}
                {verdict.outcome.skipped.length > 0 && (
                  <>
                    {' '}· skipped: {verdict.outcome.skipped.map((s) => `§${s.sectionKey} (${s.reason})`).join('; ')}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="pj-con cm-gate-verdict" style={{ marginTop: 10 }}>
            <span className="ico">{I.alertTriangle}</span>
            <div>
              <div className="pj-con-t">Placement refused</div>
              <div className="pj-con-d">{verdict.message}</div>
            </div>
          </div>
        ))}
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
  return (
    <div className="de-bd" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="de" role="dialog" aria-label={'Provenance for section ' + section.sectionKey}>
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
            <div className="cm-meta">Loading the provenance chain…</div>
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

const SUGGEST = [
  'Which §3.2 sections are blocking my export and why?',
  'Draft the narrative for the section with the lowest completeness',
  'What still stands between this Module 3 and its IND sequence?',
];

function Head({ ask, actions }: { ask: (text: string) => void; actions?: React.ReactNode }) {
  return (
    <>
      <div className="cm-head">
        <div>
          <div className="cm-kicker">CMC — Module 3 operating system</div>
          <h1 className="cm-title">Module 3 build</h1>
          <div className="cm-meta">Compile CTD §3.2 from your CMC data, resolve what blocks it, and clear the export gate</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {actions}
          <button className="reg-cta" onClick={() => ask(SUGGEST[0])}>{I.sparkles} Ask AnA</button>
        </div>
      </div>
      <div className="sp-starters" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {SUGGEST.map((s, i) => (
          <button key={i} className="sp-starter" onClick={() => ask(s)}>
            <span className="sk">{I.sparkles}</span><span>{s}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Kpi({ l, v, s, tone }: { l: string; v: React.ReactNode; s?: string; tone?: string }) {
  return (
    <div className="reg-kpi" data-tone={tone}>
      <div className="reg-kpi-v">{v}</div>
      <div className="reg-kpi-l">{l}{s ? ' -- ' + s : ''}</div>
    </div>
  );
}
