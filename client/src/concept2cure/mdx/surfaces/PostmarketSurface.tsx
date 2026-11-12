/**
 * PostmarketSurface — DOC-FIRST (per PHASE_4_INSTALL.md §1.1).
 *
 * Vigilance is the most document-heavy MDX surface: every signal that
 * crosses a regulatory threshold becomes an MDR (FDA 5-day or 30-day)
 * or a 15-day report (EU MDR Art. 87); confirmed trends become FSCAs +
 * FSNs; investigations become CAPA records; every device-year produces
 * a PSUR. Documents are the primary zone; the CAPA board, vigilance
 * trending and PMS plan execution collapse into a "Situational awareness"
 * accordion.
 *
 * Cross-program surface. Port basis:
 * ui_kits/mdx/surfaces/Postmarket.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  PV_CAPA_STAGES,
} from '../data/postmarket';
import { PV_DOC_FRAMEWORKS } from '../data/postmarket-docs';
import { usePostmarket } from '../hooks/usePostmarket';
import { useTriageQueue, type TriageItem } from '../hooks/useTriageQueue';
import { DataGate } from '../components/DataGate';
import { readyRows } from '../lib/dataState';
import type { KitDocFramework, KitDocument } from '../components/DocumentsPanel';
import type { Program } from '../data/programs';

export interface PostmarketSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
  /**
   * Selected program, when the shell has one. Vigilance is legitimately
   * a portfolio-level view, but the reporting-clock queue must say which
   * it is showing — a deadline count is read as "mine" by default.
   */
  program?: Program | null;
}

/** Stable identity: an empty list must not churn memo/effect deps. */
const EMPTY_DOCS: KitDocument[] = [];

/* Slice 0 (.design/client-journey/INFORMATION_ARCHITECTURE.md, the
   `device-postmarket` row) hid the signals, CAPA board, vigilance trending and
   PMS plan execution panels from 2026-10-26 (10bbeeeea): GET /api/mdx/postmarket
   read the whole organization, so their rows could be another project's.
   P-122 (2026-11-10): the read takes the open project (`?program_id=`), after
   the caller's current access to it, and says so (`meta.scope: 'program'`;
   server/routes/mdx-postmarket.ts). The panels are drawn when, and only when,
   the server says the rows are this project's, as Engineering's are since
   P-60. A read in flight or failed is said as that by each panel's DataGate;
   an answer that does not say 'program' keeps the panels hidden and says why.
   Trends and PMS plan execution still have no store (`[]`); their panels say
   so, not that the project has none. */
type Surveillance = 'keyed' | 'unkeyed' | 'pending';

/* Slice 0, same row: `documents` is EMPTY_DOCS — nothing reads it — so the
   panel drew an empty list with "All 0" filter counts, which reads as "no
   MDR in flight". It says it is not read here until the existing
   documentation-status read is wired (slice 21). That read reports the
   project's PMS plan document (`pms_plan`); the PMS plan execution note
   below is about the execution table, which has no store, and must not be
   read as "no PMS plan". */
const DOCUMENTS_READ_HERE = false;

/* Slice 0: due within `days` and not past its due date. The lower bound keeps
   the server's verdict: a past due date it did not mark overdue is an MDR
   already filed, acknowledged or closed (getTriageQueueTx,
   server/services/capa-mdr/capaMdr.service.ts), not a clock still running.
   useTriageQueue's `dueSoon` has the same bound. */
function dueWithin(i: TriageItem, days: number): boolean {
  return !i.overdue && i.daysToDue !== null && i.daysToDue >= 0 && i.daysToDue <= days;
}

function NotKeyedNote({ panel, reason }: { panel: string; reason: string }) {
  return (
    <p className="eng-trace-summary" data-testid={`pm-not-keyed-${panel}`}>
      Shown once this screen reads this project&apos;s records; {reason}.
    </p>
  );
}

export function PostmarketSurface({
  onAskAna,
  onOpenEditor,
  program = null,
}: PostmarketSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);

  const live = usePostmarket(program ? String(program.id) : null);
  /* No fixture fallbacks. On a vigilance surface an example feed reading
     "0 critical signals" is indistinguishable from a genuine all-clear,
     so every panel below states which of loading / error / empty / real
     it is showing. */
  /* An answer that is not this project's contributes no rows here, so another
     project's signals and CAPAs reach no panel or count (slice 0). */
  const surveillance: Surveillance = live.scope === 'program' ? 'keyed'
    : live.loading || live.error ? 'pending' : 'unkeyed';
  const keyed = surveillance === 'keyed';
  const signals = keyed ? readyRows(live.signals) : [];
  const capas = keyed ? readyRows(live.capas) : [];

  /* Complaints, MDR events and CAPAs merged into one queue ordered by
     regulatory urgency, with the reporting clocks computed server-side.
     This service was fully built and consumed by nothing while the
     surface rendered its clocks from fixtures — and an invented MDR
     clock is a countdown to a statutory deadline shown as though it
     were real. */
  const triage = useTriageQueue({ programId: program?.id ?? null });
  /* Documents/frameworks have no live feed yet. They were wired to fixtures
     UNCONDITIONALLY on the one surface where an example row is least
     acceptable — a fabricated MDR submission reads as a statutory filing that
     never happened. Same gate as every other panel now: live rows would win,
     sample only in explicit sample mode, honest empty otherwise. */
  /* This panel has no live feed, and the rows it used to show under sample
     mode were fabricated regulatory artifacts — several asserting
     `esigState: 'signed'` with a named signer and a date (pv-docs.ts).
     There is no real document list to show here yet, so it shows none:
     the panel renders its honest empty state instead of example records.
     Wiring a real read is what fills it. */
  const documents: KitDocument[] = EMPTY_DOCS;
  /* The framework list is a real category taxonomy, not tenant data, so it
     is not sample content and is no longer gated as though it were. */
  const frameworks = PV_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  /* Critical or under-review signals not yet wrapped in a doc. */
  const triageQueue = React.useMemo(
    () =>
      signals
        .filter(
          (s) =>
            (s.severity === 'critical' || s.severity === 'review') &&
            s.state !== 'closed-trend',
        )
        .slice(0, 4),
    [signals],
  );

  /* Find the most urgent MDR doc (5-day clock closest to expiry) for
     the primary CTA. */
  const urgentMdr =
    documents.find(
      (d) => d.blocker && (d.framework ?? '').startsWith('mdr'),
    ) ??
    documents.find(
      (d) => (d.framework ?? '').startsWith('mdr') && d.status === 'draft',
    );

  /* The four metric cards used to be computed from `documents` — a list
     with no live feed, now empty — so they read "MDRs due ≤72h 0", "CAPAs in
     flight 0", "PSURs 0 · 0 signed": statutory-clock and quality findings
     stated about data nobody read. Each card now comes from the read that
     actually holds it, and says "—" until that read is ready. */
  /* Slice 0: a read that answered with nothing is a read — 0, not "Not yet read". */
  const triageRows =
    triage.items.status === 'ready' || triage.items.status === 'empty' ? readyRows(triage.items) : null;
  const mdrDue = triageRows
    ? triageRows.filter((t) => t.kind === 'mdr' && (t.overdue || dueWithin(t, 3))).length
    : null;
  const openCapas = triageRows ? triageRows.filter((t) => t.kind === 'capa') : null;
  const overdueCapas = openCapas ? openCapas.filter((t) => t.overdue).length : null;
  const pmsEntries = keyed && (live.pmsPlan.status === 'ready' || live.pmsPlan.status === 'empty') ? readyRows(live.pmsPlan).length : null;
  const signalsRead = keyed && (live.signals.status === 'ready' || live.signals.status === 'empty');
  /* The PMS plan and open-signals cards say why they hold no figure. */
  const notYetRead = surveillance === 'unkeyed' ? 'Not read for this project yet' : live.error ? 'Could not be read' : 'Not yet read';
  const openSignals = signals.filter((s) => s.state !== 'closed-trend');
  const criticalSignals = signals.filter((s) => s.severity === 'critical').length;

  const urgentLabel = urgentMdr
    ? `${(urgentMdr.id.split('-').slice(-2).join('-') || urgentMdr.id).toUpperCase()}${
        (urgentMdr as unknown as { dueIn?: string }).dueIn
          ? ` (${(urgentMdr as unknown as { dueIn?: string }).dueIn})`
          : ''
      }`
    : null;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">Post-market vigilance</h1>
          {/* Slice 0: no submission count here — `documents` is not read
              (DOCUMENTS_READ_HERE), so it always said "0 … in flight". */}
          <div className="page-sub">
            21 CFR 803 MDR · EU MDR Art. 87 · CAPA 21 CFR 820.100 · ISO 13485
            §8.5.2/8.5.3 · PSUR.
          </div>
          {/* Slice 0: no scope is stated for PMS plan entries — the route has no
              store for them (`pmsPlan: []`). The project is named by its title:
              `program.code` is a class and pathway ("Class II · 510(k)",
              useMdxPrograms.deriveCode) that many projects share. */}
          <div className="page-sub" data-testid="postmarket-scope">
            {surveillance === 'unkeyed'
              ? "Surveillance signals and the CAPA board are read for every project in this organization and are not shown until this screen reads this project's records. PMS plan execution is not tracked yet. "
              : `${program ? `Surveillance signals and the CAPA board are read for ${program.title}. ` : ''}PMS plan execution is not tracked yet. `}
            {program
              ? `Reporting clocks and the MDR/CAPA deadline metrics are limited to ${program.title}.`
              : 'Reporting clocks and the MDR/CAPA deadline metrics cover all projects.'}
          </div>
        </div>
        <div className="page-actions">
          {/* Slice 0: AnA is asked only what its triage tool does —
              triage_capa_mdr_queue (server/services/ana/capaMdrTools.ts) reads one
              program's complaints, MDR events and CAPAs and requires its id. No
              tool triages signals or the portfolio. The host mounts this leaf
              only with a project. */}
          {program && (
            <button
              className="btn ghost small"
              onClick={() =>
                onAskAna(
                  `Triage the open complaints, MDR events and CAPAs for ${program.title} (project ${program.id}) and tell me which cross a 5-day or 30-day MDR clock today.`,
                )
              }
              type="button"
            >
              {I.sparkles} Triage queue
            </button>
          )}
          {/* Drawn only when it opens something: the host passes no handler
              here, and a primary button that does nothing is a dead end
              (MDX journey M1, 2026-11-01). */}
          {onOpenEditor && urgentMdr && urgentLabel && (
            <button
              className="btn primary small"
              onClick={() => onOpenEditor(urgentMdr.id)}
              title={urgentMdr.title}
              type="button"
            >
              {I.pencil} Open {urgentLabel}
            </button>
          )}
        </div>
      </div>


      <div className="metrics-row metrics-compact">
        <div className="metric-card" data-tone="err">
          <div className="metric-label">MDRs due ≤72h</div>
          <div className="metric-val" data-testid="pm-mdr-due">{mdrDue ?? '—'}</div>
          {/* GA-DEMO-08 (2026-11-10): the triage read leaves out filed, acknowledged
              and closed MDRs (server, getTriageQueueTx), so the caveat this card
              carried is gone. */}
          <div className="metric-meta">FDA 5-day · 30-day · EU 15-day</div>
        </div>
        <div className="metric-card" data-tone="warn">
          <div className="metric-label">CAPAs open</div>
          <div className="metric-val" data-testid="pm-capas">{openCapas ? openCapas.length : '—'}</div>
          <div className="metric-meta">
            {overdueCapas === null ? 'Not yet read' : `${overdueCapas} past target date`}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">PMS plan entries</div>
          <div className="metric-val" data-testid="pm-pms">{pmsEntries ?? '—'}</div>
          <div className="metric-meta">
            {/* Slice 0: what has no store is plan execution, not the PMS plan document (`pms_plan`). */}
            {pmsEntries === null ? notYetRead : pmsEntries === 0 ? 'No PMS plan execution recorded' : 'From the PMS plan'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Open signals</div>
          <div className="metric-val" data-testid="pm-signals">{signalsRead ? openSignals.length : '—'}</div>
          <div className="metric-meta">
            {signalsRead ? `${criticalSignals} critical · awaiting MDR roll-up` : notYetRead}
          </div>
        </div>
      </div>

      {/* Slice 0: not an empty list for a list nobody read (DOCUMENTS_READ_HERE). */}
      {DOCUMENTS_READ_HERE ? (
        <DocumentsPanel
          title="Regulatory submissions in flight"
          subtitle="Tap any row to open in the MDR / CAPA / FSCA editor · sparkle to draft the narrative with AnA"
          docs={documents}
          frameworks={frameworks}
          onOpenEditor={onOpenEditor}
          onAskAna={(text) => onAskAna(text)}
        />
      ) : (
        <section className="section">
          <div className="section-head">
            <h2>Regulatory submissions in flight</h2>
          </div>
          <p className="eng-trace-summary" data-testid="pm-docs-not-read">
            This project&apos;s post-market documents are not read here yet.
          </p>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Reporting clocks</h2>
          <span className="section-sub">
            {/* Slice 0: the project by its title, and what the MDR rows include. */}
            {program ? `${program.title} only` : 'All projects'} · complaints · MDR
            events · CAPAs — overdue first, then soonest due. FDA 5-day and
            30-day, EU MDR Article 87 15-day. Filed, acknowledged and closed
            MDRs are left out.
          </span>
        </div>
        <DataGate
          state={triage.items}
          label="reportable items"
          onRetry={triage.refresh}
          emptyHint="Complaints, MDR events and CAPAs appear here as they are raised, ordered by how close they are to their reporting deadline."
        >
          {(items) => (
            <>
              <div className="metrics-row metrics-compact">
                <div className="metric-card" data-tone={triage.overdue.length > 0 ? 'err' : 'ok'}>
                  <div className="metric-label">Overdue</div>
                  <div className="metric-val">{triage.overdue.length}</div>
                  {/* Slice 0: only what the server's `overdue` means — an MDR past its due date
                      and not filed, or an open CAPA past its target date. The read never compares a
                      filing date with its due date, so it cannot say a deadline was met. */}
                  <div className="metric-meta">
                    {triage.overdue.length === 0
                      ? 'No unfiled MDR or open CAPA past its due date'
                      : 'Past its due date'}
                  </div>
                </div>
                <div className="metric-card" data-tone={triage.dueSoon.length > 0 ? 'warn' : 'ok'}>
                  <div className="metric-label">Due within 7 days</div>
                  <div className="metric-val">{triage.dueSoon.length}</div>
                  {/* Slice 0: by due date, not a running clock. Filed MDRs are not in the read (GA-DEMO-08). */}
                  <div className="metric-meta">By due date</div>
                </div>
                <div className="metric-card">
                  {/* Slice 0: "In the queue": open complaints, CAPAs and unfiled MDRs (GA-DEMO-08). */}
                  <div className="metric-label">In the queue</div>
                  <div className="metric-val">{items.length}</div>
                  <div className="metric-meta">
                    {items.filter((i) => i.kind === 'mdr').length} MDR ·{' '}
                    {items.filter((i) => i.kind === 'complaint').length} complaint ·{' '}
                    {items.filter((i) => i.kind === 'capa').length} CAPA
                  </div>
                </div>
              </div>
              <div className="eng-blockers-feed">
                {items.slice(0, 10).map((i) => {
                  /* Slice 0: a past due date the server did not mark overdue is no warning (dueWithin). */
                  const tone = i.overdue ? 'err' : dueWithin(i, 7) ? 'warn' : 'low';
                  return (
                  <button
                    key={`${i.kind}-${i.id}`}
                    className="eng-blocker-row"
                    data-sev={tone}
                    data-kind={i.kind}
                    onClick={() =>
                      onAskAna(
                        `${i.code} (${i.kind}) — ${i.title}. Current state ${i.state}. ` +
                          `Walk me through what is required to close it and by when.`,
                      )
                    }
                    type="button"
                  >
                    <span className={`eng-blocker-dot tone-${tone}`} />
                    <span className="eng-blocker-kind mono tiny">{i.kind}</span>
                    <span className="mono small eng-blocker-ref">{i.code}</span>
                    <span className="eng-blocker-title">{i.title}</span>
                    <span className="eng-blocker-note">{i.riskOrSeverity ?? i.state}</span>
                    <span className="eng-blocker-owner">{i.state}</span>
                    {/* The clock is whatever the server computed. A skewed
                        browser clock must not move a statutory deadline.
                        Slice 0: the due date, not "Nd left" — a filed MDR has
                        no time left to run, and a past one read "-12d left". */}
                    <span className="eng-blocker-age">
                      {i.dueAt === null
                        ? '—'
                        : i.overdue
                          ? `${Math.abs(i.daysToDue ?? 0)}d overdue`
                          : (i.daysToDue ?? 0) >= 0
                            ? `due in ${i.daysToDue ?? 0}d`
                            : `due ${Math.abs(i.daysToDue ?? 0)}d ago`}
                    </span>
                  </button>
                  );
                })}
              </div>
            </>
          )}
        </DataGate>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Signal triage queue</h2>
          <span className="section-sub">
            {keyed ? `${triageQueue.length} critical` : 'Critical'} or under-review signals not yet wrapped
            in an MDR or CAPA · oldest first
          </span>
        </div>
        {/* Drawn only for this project's rows (P-122); in flight or failed, the gate says so. */}
        {surveillance === 'unkeyed' ? (
          <NotKeyedNote panel="signals" reason="the read did not say these signals are this project's" />
        ) : (
        <DataGate
          state={live.signals}
          label="vigilance signals"
          onRetry={live.refresh}
          emptyHint="Signals appear here as complaints, MDR events and CAPAs are recorded for this project."
        >
        {() => triageQueue.length === 0 ? (
          <p className="eng-trace-summary" data-testid="pm-signals-none">No critical or under-review signal is waiting for an MDR or CAPA.</p>
        ) : (
        <div className="eng-blockers-feed">
          {triageQueue.map((s) => (
            <button
              key={s.id}
              className="eng-blocker-row"
              data-sev={s.severity === 'critical' ? 'err' : 'warn'}
              data-kind={s.kind}
              onClick={() =>
                onAskAna(
                  `Draft an MDR for signal ${s.id} on ${s.device}: ${s.summary}. Determine whether this is a 5-day or 30-day report, identify the reporting jurisdiction, and prep the Form 3500A narrative.`,
                )
              }
              type="button"
            >
              <span
                className={`eng-blocker-dot tone-${
                  s.severity === 'critical' ? 'err' : 'warn'
                }`}
              />
              <span className="eng-blocker-kind mono tiny">{s.source}</span>
              <span className="mono small eng-blocker-ref">{s.id}</span>
              <span className="eng-blocker-title">
                {s.device} — {s.summary}
              </span>
              <span className="eng-blocker-note">
                ×{s.count} · {s.vs}
              </span>
              <span className="eng-blocker-owner">{s.owner}</span>
              <span className="eng-blocker-age">{s.opened}</span>
            </button>
          ))}
        </div>
        )}
        </DataGate>
        )}
      </section>

      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button
          className="eng-awareness-head"
          onClick={() => setAwarenessOpen((o) => !o)}
          aria-expanded={awarenessOpen}
          type="button"
        >
          <span className="eng-awareness-chev">
            {awarenessOpen ? I.down : I.right}
          </span>
          <h2>Situational awareness</h2>
          {/* Slice 0: only what the accordion holds. It never held a signals
              feed or an MDR clock, and while its panels are not keyed it holds
              the notes saying why. */}
          <span className="section-sub">
            CAPA board · vigilance trending · PMS plan execution
            {surveillance === 'unkeyed' ? ' — not shown for this project yet' : ''}
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>CAPA workflow</h2>
                <span className="section-sub">
                  {keyed ? `${capas.length} active · ` : ''}5-stage
                </span>
              </div>
              {/* Drawn only for this project's rows (P-122). */}
              {surveillance === 'unkeyed' ? (
                <NotKeyedNote panel="capas" reason="the read did not say these CAPAs are this project's" />
              ) : (
              <DataGate state={live.capas} label="CAPAs" onRetry={live.refresh} dense
                emptyHint="No CAPA is recorded for this project.">
              {() => (
              <div className="pv-capa-board">
                {PV_CAPA_STAGES.map((stage) => {
                  const inStage = capas.filter((c) => c.stage === stage.id);
                  return (
                    <div key={stage.id} className="pv-capa-col">
                      <div className="pv-capa-head">
                        <span className="pv-capa-label">{stage.label}</span>
                        <span className="pv-capa-n">{inStage.length}</span>
                      </div>
                      <div className="pv-capa-body">
                        {inStage.map((c) => (
                          <button
                            key={c.id}
                            className="pv-capa-card"
                            data-critical={c.critical || undefined}
                            onClick={() =>
                              onAskAna(`Open CAPA ${c.id}: ${c.title}`)
                            }
                            type="button"
                          >
                            <div className="pv-capa-card-head">
                              <span className="mono small">{c.id}</span>
                              {c.critical && (
                                <span className="pill-err small">critical</span>
                              )}
                            </div>
                            <div className="pv-capa-card-title">{c.title}</div>
                            <div className="pv-capa-card-foot">
                              <span className="ctable-strong">{c.device}</span>
                              <span className="dot-sep" aria-hidden="true">·</span>
                              <span>{c.owner}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
              </DataGate>
              )}
            </section>

            <div className="eng-grid eng-grid-awareness">
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Vigilance trending</h2>
                </div>
                {/* Trends come from the same read; drawn only when it is this project's (P-122). */}
                {surveillance === 'unkeyed' ? (
                  <NotKeyedNote panel="trends" reason="vigilance trends are not computed per project yet" />
                ) : (
                <DataGate
                  state={live.trends}
                  label="vigilance trends"
                  onRetry={live.refresh}
                  dense
                  emptyHint="Trend series are not yet computed from the complaint feed in this workspace."
                >
                {(trends) => (
                <div className="pv-trends">
                  {trends.map((t) => {
                    const total = t.weeks.reduce((s, v) => s + v, 0);
                    const max = Math.max(...t.weeks, 1);
                    const path = t.weeks
                      .map(
                        (v, i) =>
                          `${i === 0 ? 'M' : 'L'} ${2 + i * 28} ${
                            2 + 36 * (1 - v / max)
                          }`,
                      )
                      .join(' ');
                    return (
                      <div key={t.device} className="pv-trend">
                        <div className="pv-trend-head">
                          <span className="ctable-strong">{t.device}</span>
                          <span className="pv-trend-total mono small">{total}</span>
                        </div>
                        <svg width="200" height="40" className="pv-trend-spark">
                          <path
                            d={path}
                            fill="none"
                            stroke="var(--accent-100)"
                            strokeWidth="1.5"
                          />
                        </svg>
                      </div>
                    );
                  })}
                </div>
                )}
                </DataGate>
                )}
              </section>
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>PMS plan execution</h2>
                </div>
                {/* PMS plan execution has no store yet (`pmsPlan: []`); its gate says so when the read is this
                    project's. The PMS plan itself is a per-project document (`pms_plan`). */}
                {surveillance === 'unkeyed' ? (
                  <NotKeyedNote panel="pms" reason="PMS plan execution is not tracked per project yet" />
                ) : (
                <DataGate
                  state={live.pmsPlan}
                  label="PMS plan rows"
                  onRetry={live.refresh}
                  dense
                  emptyHint="PMS plan execution is not yet tracked in this workspace."
                >
                {(pmsPlan) => (
                <div className="ctable">
                  <div
                    className="ctable-head"
                    style={{ gridTemplateColumns: '90px 1fr 80px 90px' }}
                  >
                    <div>Device</div>
                    <div>Sources</div>
                    <div>Signals</div>
                    <div>State</div>
                  </div>
                  {pmsPlan.map((p) => (
                    <div
                      key={p.device}
                      className="ctable-row"
                      style={{ gridTemplateColumns: '90px 1fr 80px 90px' }}
                    >
                      <div className="ctable-strong">{p.device}</div>
                      <div
                        style={{ color: 'var(--text-300)', fontSize: 12 }}
                      >
                        {p.source}
                      </div>
                      <div className="mono small">{p.signals}</div>
                      <div>
                        <span
                          className={`status-pill ${
                            p.state === 'on-track' ? 'active' : 'review'
                          }`}
                        >
                          {p.state}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                )}
                </DataGate>
                )}
              </section>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
