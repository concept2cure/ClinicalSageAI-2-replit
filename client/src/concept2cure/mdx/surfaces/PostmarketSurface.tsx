/**
 * PostmarketSurface — DOC-FIRST (per PHASE_4_INSTALL.md §1.1).
 *
 * Vigilance is the most document-heavy MDX surface: every signal that
 * crosses a regulatory threshold becomes an MDR (FDA 5-day or 30-day)
 * or a 15-day report (EU MDR Art. 87); confirmed trends become FSCAs +
 * FSNs; investigations become CAPA records; every device-year produces
 * a PSUR. Documents are the primary zone; signal feed, MDR clock cards,
 * CAPA board, sparkline trends, and PMS plan execution collapse into a
 * "Situational awareness" accordion.
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
import { useTriageQueue } from '../hooks/useTriageQueue';
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

export function PostmarketSurface({
  onAskAna,
  onOpenEditor,
  program = null,
}: PostmarketSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);

  const live = usePostmarket();
  /* No fixture fallbacks. On a vigilance surface an example feed reading
     "0 critical signals" is indistinguishable from a genuine all-clear,
     so every panel below states which of loading / error / empty / real
     it is showing. */
  const signals = readyRows(live.signals);
  const capas = readyRows(live.capas);

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
  const triageRows = triage.items.status === 'ready' ? triage.items.data : null;
  const mdrDue = triageRows
    ? triageRows.filter((t) => t.kind === 'mdr' && (t.overdue || (t.daysToDue !== null && t.daysToDue <= 3))).length
    : null;
  const openCapas = triageRows ? triageRows.filter((t) => t.kind === 'capa') : null;
  const overdueCapas = openCapas ? openCapas.filter((t) => t.overdue).length : null;
  const pmsEntries = live.pmsPlan.status === 'ready' || live.pmsPlan.status === 'empty' ? readyRows(live.pmsPlan).length : null;
  const signalsRead = live.signals.status === 'ready' || live.signals.status === 'empty';
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
          <div className="page-sub">
            {documents.length} regulatory submissions in flight. 21 CFR 803 MDR ·
            EU MDR Art. 87 · CAPA 21 CFR 820.100 · ISO 13485 §8.5.2/8.5.3 · PSUR.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Triage open vigilance signals across the portfolio and tell me which ones cross a 5-day or 30-day MDR clock today.',
              )
            }
            type="button"
          >
            {I.sparkles} Triage signals
          </button>
          {urgentMdr && urgentLabel && (
            <button
              className="btn primary small"
              onClick={() => onOpenEditor?.(urgentMdr.id)}
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
          <div className="metric-meta">FDA 5-day · 30-day · EU 15-day clocks</div>
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
            {pmsEntries === null ? 'Not yet read' : pmsEntries === 0 ? 'No PMS plan recorded' : 'From the PMS plan'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Open signals</div>
          <div className="metric-val" data-testid="pm-signals">{signalsRead ? openSignals.length : '—'}</div>
          <div className="metric-meta">
            {signalsRead ? `${criticalSignals} critical · awaiting MDR roll-up` : 'Not yet read'}
          </div>
        </div>
      </div>

      <DocumentsPanel
        title="Regulatory submissions in flight"
        subtitle="Tap any row to open in the MDR / CAPA / FSCA editor · sparkle to draft the narrative with AnA"
        docs={documents}
        frameworks={frameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />

      <section className="section">
        <div className="section-head">
          <h2>Reporting clocks</h2>
          <span className="section-sub">
            {program ? `${program.code} only` : 'All programs'} · complaints · MDR
            events · CAPAs — overdue first, then soonest due. FDA 5-day and
            30-day, EU MDR Article 87 15-day.
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
                  <div className="metric-meta">
                    {triage.overdue.length === 0
                      ? 'No reporting deadline passed'
                      : 'Past a reporting deadline'}
                  </div>
                </div>
                <div className="metric-card" data-tone={triage.dueSoon.length > 0 ? 'warn' : 'ok'}>
                  <div className="metric-label">Due within 7 days</div>
                  <div className="metric-val">{triage.dueSoon.length}</div>
                  <div className="metric-meta">Clock running</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Open items</div>
                  <div className="metric-val">{items.length}</div>
                  <div className="metric-meta">
                    {items.filter((i) => i.kind === 'mdr').length} MDR ·{' '}
                    {items.filter((i) => i.kind === 'complaint').length} complaint ·{' '}
                    {items.filter((i) => i.kind === 'capa').length} CAPA
                  </div>
                </div>
              </div>
              <div className="eng-blockers-feed">
                {items.slice(0, 10).map((i) => (
                  <button
                    key={`${i.kind}-${i.id}`}
                    className="eng-blocker-row"
                    data-sev={i.overdue ? 'err' : i.daysToDue !== null && i.daysToDue <= 7 ? 'warn' : 'low'}
                    data-kind={i.kind}
                    onClick={() =>
                      onAskAna(
                        `${i.code} (${i.kind}) — ${i.title}. Current state ${i.state}. ` +
                          `Walk me through what is required to close it and by when.`,
                      )
                    }
                    type="button"
                  >
                    <span
                      className={`eng-blocker-dot tone-${
                        i.overdue ? 'err' : i.daysToDue !== null && i.daysToDue <= 7 ? 'warn' : 'low'
                      }`}
                    />
                    <span className="eng-blocker-kind mono tiny">{i.kind}</span>
                    <span className="mono small eng-blocker-ref">{i.code}</span>
                    <span className="eng-blocker-title">{i.title}</span>
                    <span className="eng-blocker-note">{i.riskOrSeverity ?? i.state}</span>
                    <span className="eng-blocker-owner">{i.state}</span>
                    {/* The clock is whatever the server computed. A skewed
                        browser clock must not move a statutory deadline. */}
                    <span className="eng-blocker-age">
                      {i.dueAt === null
                        ? '—'
                        : i.overdue
                          ? `${Math.abs(i.daysToDue ?? 0)}d overdue`
                          : `${i.daysToDue}d left`}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </DataGate>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Signal triage queue</h2>
          <span className="section-sub">
            {triageQueue.length} critical or under-review signals not yet wrapped
            in an MDR or CAPA · oldest first
          </span>
        </div>
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
          <span className="section-sub">
            Full signals feed · MDR clock · CAPA board · trend sparklines · PMS
            plan execution
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>CAPA workflow</h2>
                <span className="section-sub">
                  {capas.length} active · 5-stage
                </span>
              </div>
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
            </section>

            <div className="eng-grid eng-grid-awareness">
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>Vigilance trending</h2>
                </div>
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
              </section>
              <section>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 14 }}>PMS plan execution</h2>
                </div>
                <DataGate
                  state={live.pmsPlan}
                  label="PMS plan rows"
                  onRetry={live.refresh}
                  dense
                  emptyHint="Post-market surveillance plans are not yet tracked in this workspace."
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
              </section>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
