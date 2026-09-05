import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import '../styles/project-home-v2.css';
import { shellProgramName } from '../shellProject';

/* One payer/HTA position — the read shape of GET /api/market-access, one row per
   market × payer position per program from the REAL org-scoped store
   `market_access_positions` (written via POST /api/market-access). */
interface PayerPosition {
  id: string;
  program: string;
  market: string;
  payer: string;
  mechanism: string | null;
  code: string | null;
  status: string;
  decisionDate: string | null;
  note: string | null;
}

/* -- Helpers -- */

/* Pill tone for the stored position vocab (validated server-side):
   covered | partial | review | planned | denied. */
function maPill(s: string): string {
  return (
    ({
      covered: 'ok',
      partial: 'warn',
      review: 'review',
      denied: 'warn',
      planned: 'idle',
    } as Record<string, string>)[s] || 'idle'
  );
}

/* The payer · note · decision sub-line under each market. */
function posSub(p: PayerPosition): string {
  return [p.payer, p.note, p.decisionDate ? 'decision ' + p.decisionDate : null]
    .filter(Boolean)
    .join(' · ');
}

/* ════ MarketAccess -- market access & reimbursement surface ════ */

export function MarketAccess({ onAsk }: SurfaceViewProps) {
  /* The open programme, named as a person would say it — never a hardcoded
     product. `null` when no programme is open, and every caller below phrases
     its request without one rather than substituting a placeholder: an
     assistant that has to ask which programme beats one confidently answering
     about the wrong one. */
  const program = shellProgramName();

  const [tab, setTab] = useState('coverage');
  const ask = (q: string) => onAsk && onAsk(q);

  /* Fixture-free (real-data standard): the surface reads the org's REAL payer/HTA
     position store (market_access_positions, written via POST /api/market-access).
     Real rows, an honest empty, or an honest error — never a fixture. `rows` is a
     fresh [] while loading/on error, so the derivations below are null-safe. */
  const live = useLiveRows<PayerPosition>('/api/market-access');
  const positions = live.rows;

  const covered = positions.filter((p) => p.status === 'covered').length;
  const inReview = positions.filter((p) => p.status === 'review').length;
  const programs = new Set(positions.map((p) => p.program)).size;
  /* KPIs are derived from the real rows only — shown as '--' until they load. */
  const kv = (n: number) => (live.loading || live.error ? '--' : String(n));
  const kpis = [
    { v: kv(positions.length), l: 'Markets / payers' },
    { v: kv(covered), l: 'Covered', tone: 'ok' },
    { v: kv(inReview), l: 'In HTA review', tone: 'warn' },
    { v: kv(programs), l: 'Programs' },
  ];
  const tabs: [string, string][] = [
    ['coverage', 'Coverage status'],
    ['dossier', 'Value dossier'],
    ['coding', 'Coding strategy'],
    ['strategy', 'Access strategy'],
  ];

  /* AnA can open any of the four tabs — the same view-state switch a person
     makes by clicking. The registry enum has already validated `tab`; the
     defensive lookup keeps the handler honest if the registry drifts. */
  useSurfaceActionHandlers('market-access', {
    'market-access.open-tab': (params) => {
      const target = params.tab;
      const hit = tabs.find((t) => t[0] === target);
      if (!hit) return { ok: false, reason: `"${target}" is not a market-access tab.` };
      if (tab === target) return { ok: true, detail: `Already on the ${hit[1]} tab` };
      setTab(target);
      return { ok: true, detail: `Opened the ${hit[1]} tab` };
    },
  });

  /* Code-centric view of the same real rows: the billing codes in play across
     the org's payer positions (a projection, not a second store). */
  const coded = positions.filter((p) => p.code);

  /* What AnA can see of this screen.
     A FAILED read publishes the failure. `positions` is [] on error as well as
     when the org has recorded no payer positions, and "0 markets covered" over
     an outage is a reimbursement claim nobody made — the KPIs above already
     refuse to render a number in that state, and AnA is told the same thing. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The payer / HTA position store is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The payer / HTA position store could not be read, so this screen is showing no coverage ' +
          'positions because of a failure, not because none are recorded.',
        availableActions: ['Retry the market-access read'],
      };
    }
    return {
      summary:
        `Market access and reimbursement, "${(tabs.find((t) => t[0] === tab) ?? [])[1] ?? tab}" tab: ` +
        `${positions.length} payer position(s) across ${programs} program(s) — ${covered} covered, ` +
        `${inReview} in HTA review, ${coded.length} carrying a billing code.`,
      facts: {
        openTab: tab,
        totalPositions: positions.length,
        covered,
        inHtaReview: inReview,
        programCount: programs,
        codedPositions: coded.length,
        positions: positions.slice(0, 12).map((pp) => ({
          id: pp.id, program: pp.program, market: pp.market, payer: pp.payer,
          mechanism: pp.mechanism, code: pp.code, status: pp.status,
          // `note` is a user-authored free-text payer-position note
          // (market_access_positions.note) — its presence travels, the prose
          // stays on screen, matching the rest of the subsystem.
          decisionDate: pp.decisionDate, hasNote: Boolean(pp.note),
        })),
      },
      availableActions: [
        'Switch between coverage status, value dossier, coding strategy and access strategy',
        'Read a payer position — its market, mechanism, billing code and decision date',
      ],
    };
  }, [live.loading, live.error, positions, tab, tabs, covered, inReview, programs, coded.length]);
  usePublishSurfaceContext('market-access', anaContext);

  return (
    <div className="reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform · commercial</div>
          <h1 className="reg-title">Market access &amp; reimbursement</h1>
          <p className="reg-sub">
            Payer coverage, value dossiers and coding strategy — the bridge from
            a cleared device to a reimbursed one. Grounds the market-access
            advisory, CMS coverage lookup, and value-dossier composer.
          </p>
        </div>
        <button
          className="reg-cta"
          onClick={() =>
            /* Was `'…for the BX-204 CGM'` — a hardcoded demo product AND a
               hardcoded device type, so the plan came back about a continuous
               glucose monitor the customer does not have. */
            ask(
              program
                ? `Build a US + EU market-access plan for ${program}`
                : 'Build a US + EU market-access plan for my programme'
            )
          }
        >
          {I.sparkles} Plan with AnA
        </button>
      </div>

      <div className="reg-kpis">
        {kpis.map((k, i) => (
          <div key={i} className="reg-kpi">
            <div className="reg-kpi-v" data-tone={k.tone}>
              {k.v}
            </div>
            <div className="reg-kpi-l">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, l]) => (
          <button
            key={id}
            className={'reg-tab' + (tab === id ? ' on' : '')}
            onClick={() => setTab(id)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'coverage' && (
        <div className="reg-card">
          {/* Four-state body: loading -> error -> empty -> real */}
          {live.loading ? (
            <div className="reg-sub2" style={{ padding: '18px 14px' }}>Loading payer positions…</div>
          ) : live.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load payer positions"
              hint="The market-access store didn't respond. These are your organization's payer/HTA positions — sign in and retry, or check the service is reachable."
            />
          ) : live.empty ? (
            <EmptyState
              icon={I.globe}
              title="No payer positions tracked yet"
              hint={
                <>
                  Track your first market × payer position to see coverage status,
                  HTA reviews and the codes in play. Positions are written via{' '}
                  <span className="mono">Record a market-access plan</span> — or ask
                  AnA to plan the access sequence and log them with you.
                </>
              }
            />
          ) : (
            <table className="reg-tbl">
              <thead>
                <tr>
                  <th>Market / payer</th>
                  <th>Basis</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="reg-mk">{c.market}</div>
                      <div className="reg-sub2">{posSub(c)}</div>
                    </td>
                    <td>{c.mechanism ?? '--'}</td>
                    <td className="mono">{c.code ?? '--'}</td>
                    <td>
                      <span className={'reg-pill ' + maPill(c.status)}>
                        {c.status}
                      </span>
                    </td>
                    <td className="reg-row-act">
                      <button
                        className="reg-ask"
                        onClick={() =>
                          ask(
                            `What evidence does ${c.payer} require for ${c.program} coverage?`,
                          )
                        }
                      >
                        {I.sparkles} Evidence
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'dossier' && (
        <div className="reg-card">
          <div className="ma-dossier-h">
            <div>
              <b>Global value dossier</b>
              <span className="reg-sub2"> AMCP dossier format</span>
            </div>
            <button
              className="reg-ask"
              onClick={() =>
                ask(
                  'Draft the budget-impact model section of the value dossier',
                )
              }
            >
              {I.sparkles} Draft section
            </button>
          </div>
          {/* Honest empty: the market-access store holds payer/HTA positions;
              section-level dossier tracking has no real store yet, and a
              fabricated section list must never stand in for one. */}
          <EmptyState
            icon={I.fileText}
            title="No value-dossier sections tracked yet"
            hint="Section-level dossier tracking isn't stored in the market-access position store. Ask AnA to draft a dossier section, or plan the access strategy from your tracked payer positions."
          />
        </div>
      )}

      {tab === 'coding' && (
        <div className="reg-card">
          {live.loading ? (
            <div className="reg-sub2" style={{ padding: '18px 14px' }}>Loading payer positions…</div>
          ) : live.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load the coding view"
              hint="The market-access store didn't respond, so the codes in play across your payer positions can't be shown. Sign in and retry, or check the service is reachable."
            />
          ) : coded.length === 0 ? (
            <EmptyState
              icon={I.creditCard}
              title="No billing codes on file"
              hint="None of your tracked payer positions carries a billing code yet. Add the code when you track a position and the coding view builds itself from the same store."
            />
          ) : (
            <table className="reg-tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Position</th>
                  <th>Basis</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {coded.map((c) => (
                  <tr key={c.id}>
                    <td className="mono reg-mk">{c.code}</td>
                    <td>
                      {c.market}
                      <div className="reg-sub2">
                        {c.payer} · {c.program}
                      </div>
                    </td>
                    <td>{c.mechanism ?? '--'}</td>
                    <td>
                      <span className={'reg-pill ' + maPill(c.status)}>
                        {c.status}
                      </span>
                    </td>
                    <td className="reg-row-act">
                      <button
                        className="reg-ask"
                        onClick={() =>
                          ask(
                            `What documentation does ${c.payer} require to bill ${c.code}?`,
                          )
                        }
                      >
                        {I.sparkles} Billing
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'strategy' && (
        <div className="reg-card reg-pad">
          {/* ── This was four bullets of invented market-access advice ────────
              "AnA's access sequencing for BX-204, positioned against Libre 3 on
              cost-comparability" — with a specific HCPCS code (E2103), a named
              competitor, a "~30% list gap" and a four-market sequence, rendered
              as though AnA had analysed the reader's own programme. None of it
              was: it was a string literal, identical for every tenant, and the
              heading above it claimed authorship.

              Fabricated reimbursement strategy is not a cosmetic problem — a
              customer acting on "no new NCD needed" for a product that has one
              is a commercial decision made on invented evidence.

              There is no market-access analysis endpoint to read instead, so
              the surface says what is true: AnA has not produced a sequencing
              analysis for this programme, and here is how to ask for one. */}
          <div className="ma-strat">
            <p className="ma-strat-empty">
              {I.info || I.alertTriangle} No access sequencing has been generated for
              {program ? <> <b>{program}</b></> : ' this programme'} yet. Sequencing depends on the
              coverage landscape, the comparator set and the pricing position for your own
              product — nothing here is pre-computed, and a generic sequence would be a
              commercial recommendation made about a product this platform has not analysed.
            </p>
            <button
              className="reg-ask"
              onClick={() =>
                ask(
                  program
                    ? `Generate the full global market-access strategy document for ${program}`
                    : 'Generate the full global market-access strategy document for my programme',
                )
              }
            >
              {I.sparkles} Generate strategy document
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
