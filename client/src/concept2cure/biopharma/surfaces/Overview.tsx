/**
 * Biopharma Overview — start-of-day surface (Phase 10.2).
 *
 * Claude.ai-pattern lead-in, tailored to a regulatory affairs lead:
 *   1. Greeting + state-of-portfolio line (derived from LIVE programs —
 *      never fabricated)
 *   2. Composer with file drop zone + 4 client-type-aware starters
 *   3. Today · your queue (live inbound correspondence + blocked programs;
 *      labeled sample queue only when the live stores are unavailable)
 *   4. Active programs — collapsed by default
 *   5. Next 30 days — agency milestones from live program dates, collapsed
 *
 * Port of ui_kits/biopharma/surfaces.jsx > Overview, with the repo's
 * honesty rules applied (live ?? fixture, sample pills, no invented
 * metrics or overnight narratives).
 *
 * @module client/src/concept2cure/biopharma/surfaces/Overview
 */

import * as React from 'react';
import { BioIcon } from '../icons';
import { ReadinessBar, SamplePill, ToneText } from './bits';
import { getClientTypeConfig } from '../data/clientTypes';
import { useInboundCorrespondence } from '../data/correspondence';
import type { BiopharmaProgram } from '../data/programs';
import type { SurfaceQueueItem } from '../shell/SurfaceComposer';

interface OverviewProps {
  programs: BiopharmaProgram[];
  onAskAna: (text: string) => void;
  loading?: boolean;
  clientType?: string;
  userFirstName?: string | null;
}

/** Sample queue — rendered ONLY when the live stores are unavailable,
 *  always with the sample pill. Mirrors the kit's representative day. */
const SAMPLE_QUEUE: SurfaceQueueItem[] = [
  { ico: 'globe',       title: '3 open HAQs · BX-115',                  sub: 'FDA · day 9 of 14',                   tone: 'warn', action: 'Pre-draft now', cmd: '/respond all open HAQs on BX-115' },
  { ico: 'users',       title: 'Reviewer blocked on §2.7 — needs you',  sub: 'BX-204 · reviewer feedback open',     tone: 'warn', action: 'Open §2.7',     cmd: 'Open the §2.7 reviewer feedback thread for BX-204' },
  { ico: 'shieldCheck', title: 'CMC stability addendum — your sign-off', sub: 'BX-204 · M3 §3.2.S.7.3',             tone: 'warn', action: 'Open',          cmd: 'Open the BX-204 stability addendum for sign-off' },
  { ico: 'messageCircle', title: 'CMO standup briefing not prepared',   sub: 'One-line status per program needed',  tone: 'info', action: 'Brief me',      cmd: 'Build a one-line status per program for the 9 AM CMO standup' },
];

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function daysUntil(dateIso: string): number | null {
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

export function BiopharmaOverview({ programs, onAskAna, loading, clientType, userFirstName }: OverviewProps) {
  const [programsOpen, setProgramsOpen] = React.useState(false);
  const [upcomingOpen, setUpcomingOpen] = React.useState(false);
  const [composerValue, setComposerValue] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const cfg = getClientTypeConfig(clientType);
  const inbound = useInboundCorrespondence();

  const total = programs.length;
  const blocked = programs.filter(p => p.status === 'blocked');
  const avgReadiness = total
    ? Math.round(programs.reduce((a, p) => a + (p.completion_percentage ?? 0), 0) / total)
    : 0;

  /* State line — derived from live data only. */
  const stateLine = loading ? (
    <>Loading your portfolio…</>
  ) : total > 0 ? (
    <>
      You have <b>{total} program{total === 1 ? '' : 's'}</b>
      {blocked.length > 0 && <>, <b>{blocked.length} blocked</b>,</>} at{' '}
      <b>{avgReadiness}% average readiness</b>
      {inbound && inbound.length > 0 && (
        <>
          {' '}— and <b>{inbound.length} open inbound item{inbound.length === 1 ? '' : 's'}</b> from agencies.
        </>
      )}
      {(!inbound || inbound.length === 0) && '.'}
    </>
  ) : (
    <>No biopharma programs found for your organization yet — drop a document below or ask AnA to set one up.</>
  );

  /* Today queue — live inbound correspondence + blocked programs. */
  const liveQueue: SurfaceQueueItem[] = React.useMemo(() => {
    const items: SurfaceQueueItem[] = [];
    (inbound ?? []).slice(0, 3).forEach(c => {
      const days = c.dueDate ? daysUntil(c.dueDate) : null;
      items.push({
        ico: 'globe',
        title: c.subject ?? c.communicationType ?? 'Inbound agency correspondence',
        sub: [
          c.communicationType ?? 'correspondence',
          c.urgency ? `urgency ${c.urgency}` : null,
          days !== null ? `due in ${days} day${days === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' · '),
        tone: c.urgency === 'high' || (days !== null && days <= 5) ? 'warn' : 'info',
        action: c.responseRequired ? 'Pre-draft now' : 'Open',
        cmd: `/respond ${c.id} — draft a response to "${c.subject ?? 'this correspondence'}" anchored on prior submissions`,
      });
    });
    blocked.slice(0, 2).forEach(p => {
      items.push({
        ico: 'alertCircle',
        title: `${p.code ?? p.name} is blocked`,
        sub: p.lead_indication ?? p.program_type,
        tone: 'err',
        action: 'Unblock',
        cmd: `What is blocking ${p.code ?? p.name} and what is the fastest path to unblock it?`,
      });
    });
    return items;
  }, [inbound, blocked]);

  const queueIsSample = liveQueue.length === 0 && inbound === null;
  const queue = queueIsSample ? SAMPLE_QUEUE : liveQueue;

  /* Next 30 days — agency milestones from live program dates. */
  const upcoming = React.useMemo(() => {
    const rows: { when: string; what: string; agency: string; prog: string; days: number }[] = [];
    programs.forEach(p => {
      const agency = (p.target_agencies ?? [])[0] ?? 'Agency';
      if (p.pdufa_date) {
        const d = daysUntil(p.pdufa_date);
        if (d !== null && d >= 0) rows.push({ when: `${d} days`, what: 'PDUFA target action', agency, prog: p.code ?? p.name, days: d });
      }
      if (p.filing_date) {
        const d = daysUntil(p.filing_date);
        if (d !== null && d >= 0) rows.push({ when: `${d} days`, what: 'Filing window', agency, prog: p.code ?? p.name, days: d });
      }
    });
    return rows.sort((a, b) => a.days - b.days).slice(0, 6);
  }, [programs]);

  const send = (text: string) => {
    if (text && text.trim()) onAskAna(text.trim());
    setComposerValue('');
  };

  const fileNames = (files: FileList | null): string =>
    files && files.length ? Array.from(files).map(f => f.name).join(', ') : '';

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const names = fileNames(e.dataTransfer?.files ?? null);
    if (!names) return;
    onAskAna(
      `Classify and file these uploaded documents: ${names}. Suggest which program and which section to anchor them to, then write the audit row.`,
    );
  };

  return (
    <div className="bp-surface bp-overview-start">
      {/* 1. Greeting + state-of-portfolio (live) */}
      <div className="bp-od-greet">
        <h1>{greeting()}{userFirstName ? `, ${userFirstName}` : ''}.</h1>
        <p className="bp-od-state">{stateLine}</p>
      </div>

      {/* 2. Composer with drop zone */}
      <div
        className={`bp-od-composer ${dragOver ? 'bp-od-composer-drag' : ''}`}
        onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <textarea
          rows={1}
          placeholder="Drop files, ask AnA, or capture a note…"
          value={composerValue}
          onChange={e => setComposerValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(composerValue);
            }
          }}
        />
        <div className="bp-od-composer-row">
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            onChange={e => {
              const names = fileNames(e.target.files);
              if (names) onAskAna(`Classify and file these uploaded documents: ${names}.`);
              e.target.value = '';
            }}
          />
          <button className="bp-od-chip" type="button" onClick={() => fileRef.current?.click()}>
            <BioIcon name="paperclip" /> Drop files
          </button>
          <span className="bp-od-chip" style={{ marginLeft: 'auto', cursor: 'default' }}>AnA 1.0</span>
          <button
            className="bp-od-send"
            type="button"
            disabled={!composerValue.trim()}
            onClick={() => send(composerValue)}
            aria-label="Send to AnA"
          >
            <BioIcon name="arrowRight" />
          </button>
        </div>
        {dragOver && (
          <div className="bp-od-drop-hint">Drop to file with AnA — she'll classify and anchor it.</div>
        )}
      </div>

      {/* Client-type-aware starters */}
      <div className="bp-od-starters">
        {cfg.overview.starters.map((s, i) => (
          <button key={i} className="bp-od-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="bp-od-starter-ico"><BioIcon name="sparkles" /></span>
            <span>{s}</span>
          </button>
        ))}
      </div>

      {/* 3. Today · your queue */}
      <section className="bp-od-section">
        <header className="bp-od-section-head">
          <h2>Today · your queue</h2>
          <span className="bp-od-section-meta">{queue.length} items</span>
          {queueIsSample && <SamplePill />}
        </header>
        <div className="bp-od-queue">
          {queue.map((q, i) => (
            <button
              key={i}
              className={`bp-od-q-item bp-od-q-${q.tone ?? 'info'}`}
              type="button"
              onClick={() => onAskAna(q.cmd)}
            >
              <span className="bp-od-q-ico"><BioIcon name={q.ico} /></span>
              <div className="bp-od-q-body">
                <div className="bp-od-q-title">{q.title}</div>
                <div className="bp-od-q-sub">{q.sub}</div>
              </div>
              <span className="bp-od-q-action">
                {q.action ?? 'Open'}{' '}
                <span style={{ display: 'inline-flex' }}><BioIcon name="arrowRight" /></span>
              </span>
            </button>
          ))}
          {queue.length === 0 && (
            <div className="bp-empty">Nothing needs your attention here right now.</div>
          )}
        </div>
      </section>

      {/* 4. Active programs — collapsed by default */}
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" type="button" onClick={() => setProgramsOpen(o => !o)}>
          <span className="bp-od-chev" data-open={programsOpen || undefined}><BioIcon name="chevronRight" /></span>
          <h2>Active programs</h2>
          <span className="bp-od-section-meta">
            {loading ? 'loading…' : `${total} programs · sorted by readiness`}
          </span>
        </button>
        {programsOpen && (
          loading ? (
            <div className="bp-empty">Loading programs…</div>
          ) : total === 0 ? (
            <div className="bp-empty">No biopharma programs found for your organization.</div>
          ) : (
            <div className="bp-od-calendar" style={{ marginTop: 10 }}>
              {[...programs]
                .sort((a, b) => (a.completion_percentage ?? 0) - (b.completion_percentage ?? 0))
                .map(p => (
                  <div key={p.id} className="bp-od-cal-row" style={{ gridTemplateColumns: '120px 70px 1fr 140px 36px' }}>
                    <span className="bp-od-cal-prog">{p.code ?? p.name}</span>
                    <span className="bp-tag bp-tag-mono">{p.program_type}</span>
                    <span className="bp-od-cal-what">
                      {p.lead_indication ?? '—'}
                      {p.status === 'blocked' && <> · <ToneText tone="err">blocked</ToneText></>}
                    </span>
                    <ReadinessBar pct={p.completion_percentage ?? 0} />
                    <button
                      className="bp-btn-tert"
                      type="button"
                      onClick={() => onAskAna(`Open the ${p.code ?? p.name} program and summarize its current state`)}
                      aria-label={`Open ${p.code ?? p.name}`}
                    >
                      <BioIcon name="arrowRight" />
                    </button>
                  </div>
                ))}
            </div>
          )
        )}
      </section>

      {/* 5. Next 30 days — collapsed by default */}
      <section className="bp-od-section">
        <button className="bp-od-section-head bp-od-toggle" type="button" onClick={() => setUpcomingOpen(o => !o)}>
          <span className="bp-od-chev" data-open={upcomingOpen || undefined}><BioIcon name="chevronRight" /></span>
          <h2>Upcoming agency milestones</h2>
          <span className="bp-od-section-meta">{upcoming.length} from program dates</span>
        </button>
        {upcomingOpen && (
          upcoming.length === 0 ? (
            <div className="bp-empty">No dated agency milestones on your programs.</div>
          ) : (
            <div className="bp-od-calendar">
              {upcoming.map((u, i) => (
                <div key={i} className="bp-od-cal-row">
                  <span className="bp-od-cal-when">{u.when}</span>
                  <span className="bp-tag bp-tag-mono">{u.agency}</span>
                  <span className="bp-od-cal-prog">{u.prog}</span>
                  <span className="bp-od-cal-what">{u.what}</span>
                  <button
                    className="bp-btn-tert"
                    type="button"
                    onClick={() => onAskAna(`What is left before the ${u.prog} ${u.what.toLowerCase()} in ${u.when}?`)}
                    aria-label={`Ask AnA about ${u.prog}`}
                  >
                    <BioIcon name="arrowRight" />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </section>
    </div>
  );
}
