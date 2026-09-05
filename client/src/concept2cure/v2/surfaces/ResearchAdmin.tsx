import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   Research Administration (Capabilities C2C-14, C2C-15, C2C-16, C2C-01/02)
   One workspace, five sections:
     - Committees -- IRB / IACUC / IBC roster, composition, convened-meeting poll
     - Coverage analysis -- Medicare NCD 310.1 qualifying-trial + billing grid
     - Grant finder -- funding profile + ranked opportunities (fit score)
     - Training -- CITI personnel x training matrix + expiring modules
     - Portfolio -- continuing-review expiration analytics

   Real-data standard (no mock in product): this surface renders REAL persisted
   data, an honest EMPTY state, or an honest ERROR state — never a fixture.

   - Training is REAL: GET /api/research-admin (server/routes/research-admin.routes.ts)
     assembles the org's CITI training matrix from the real research-compliance
     roster — research_personnel + personnel_training, the tables the roster
     service and the CITI bulk-import write (see server/services/research-admin/
     research-admin-view-assembler.ts). Re-anchored to useLiveRows; the "Expiring
     soon" panel is a deterministic projection of the live matrix (no fabricated
     expiry-days count).
   - Committees / Coverage / Grants / Portfolio previously rendered fabricated
     fixtures (PDEV_COMMITTEES / PDEV_COVERAGE / PDEV_GRANTS /
     PDEV_PORTFOLIO_ANALYTICS) with a live voting poll, a billing grid and
     "finalize" actions — all fixture-driven. Those are removed under the
     real-data standard. Governed backends DO exist (see NotYetConnected below)
     but are multi-endpoint, shape-divergent CRUD surfaces the v2 surface does
     not yet call, so each shows an honest "not connected yet" state pending a
     dedicated wiring pass, rather than a mock.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types ── */

interface SectionDef {
  id: string;
  label: string;
  icon: string;
}

/* Row shape returned by GET /api/research-admin (research-admin.routes.ts):
   { id, name, role, cells }. `id` is the roster personnel id (research_personnel
   PK, serialized; always present); `name`/`role` come from the real roster
   (rendered null-safe, never fabricated; role arrives as its short display
   label, e.g. 'PI'); `cells` is the per-module CITI status vector DERIVED
   server-side from each person's personnel_training completion/expiry dates,
   aligned to the CITI_TRAININGS column order ('n/a' = no record on file). */
interface CitiPerson {
  id: string;
  name: string | null;
  role: string | null;
  cells: string[];
}

/* ── Constants ── */

const SECTIONS: SectionDef[] = [
  { id: 'committees', label: 'Committees', icon: 'user' },
  { id: 'coverage', label: 'Coverage analysis', icon: 'creditCard' },
  { id: 'grants', label: 'Grant finder', icon: 'sparkles' },
  { id: 'training', label: 'Training (CITI)', icon: 'book' },
  { id: 'portfolio', label: 'Portfolio', icon: 'barChart' },
];

/* Canonical surface config — the CITI training-column catalog. The server
   returns each person's cells[] in exactly this column order (CITI_COLUMN_TYPES
   in server/services/research-admin/research-admin-view-assembler.ts maps each
   column to its personnel_training.training_type), so the surface owns the
   column labels while the live rows carry only the per-person status vector.
   Static catalog of real CITI module names, not org data. */
const CITI_TRAININGS = [
  'Human Subjects (Biomed)',
  'GCP',
  'IACUC (Working with Animals)',
  'Biosafety / IBC',
  'Conflict of Interest',
];

/* ── Inline icon helper (replaces kit PG.Ic) ── */
function Ic({ n }: { n: string }) {
  const icon = (I as Record<string, React.ReactElement>)[n];
  return icon ? <span className="ico">{icon}</span> : null;
}

/* ── Capitalize helper (replaces kit PG.labelize) ── */
function labelize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ════ CITI training matrix (REAL — GET /api/research-admin) ════ */

interface TrainingProps {
  /** The live read's state, lifted to ResearchAdmin (which owns the one AnA
   *  publisher slot) and passed down unchanged. */
  personnel: CitiPerson[];
  loading: boolean;
  error?: string;
  empty: boolean;
}

function Training({ personnel, loading, error, empty }: TrainingProps) {
  // Real org personnel × CITI training matrix. GET /api/research-admin returns
  // { id, name, role, cells } per person; useLiveRows (called in ResearchAdmin)
  // unwraps the { data } envelope. No fixture fallback — real rows, an honest
  // empty, or an honest error (403 without org context, or an unprovisioned
  // store).
  const cellTone: Record<string, string> = { current: 'ok', expiring: 'warn', expired: 'err', missing: 'err', 'n/a': 'idle' };

  // "Expiring soon" is a deterministic projection of the live matrix: every
  // (person, module) pair whose live CITI status is 'expiring'. Real computed
  // output from real cells — the backend carries no expiry-days count, so none
  // is shown (never fabricated).
  const expiring = personnel.flatMap((p) =>
    (p.cells || []).flatMap((c, i) =>
      c === 'expiring' ? [{ name: p.name, training: CITI_TRAININGS[i] ?? `Module ${i + 1}` }] : [],
    ),
  );

  if (loading) {
    return <div className="ra-sec"><div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading training matrix…</div></div>;
  }
  if (error) {
    return (
      <div className="ra-sec">
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the training matrix"
          hint="The research-administration training register didn't respond. It's the organization's CITI personnel × module matrix — sign in and retry, or check the service is reachable."
        />
      </div>
    );
  }
  if (empty) {
    return (
      <div className="ra-sec">
        <EmptyState
          icon={I.book}
          title="No CITI training records yet"
          hint="Study personnel and their per-module CITI status appear here once the organization's training register is populated."
        />
      </div>
    );
  }

  return (
    <div className="ra-sec">
      <div className="ra-grid2">
        {/* Personnel × module matrix */}
        <div className="ra-card">
          <div className="ra-card-h"><h3>Training matrix</h3><span className="pd-pane-s">{personnel.length} personnel</span></div>
          <div className="ra-matrix-wrap">
            <table className="ra-matrix">
              <thead><tr>
                <th className="ra-mx-cnr">Personnel</th>
                {CITI_TRAININGS.map((t, i) => <th key={i} className="ra-mx-th"><span>{t}</span></th>)}
              </tr></thead>
              <tbody>
                {personnel.map((p) => (
                  <tr key={p.id}>
                    <th className="ra-mx-rh"><span className="ra-mx-name">{p.name ?? '—'}</span><span className="ra-mx-role">{p.role ?? '—'}</span></th>
                    {CITI_TRAININGS.map((t, i) => {
                      const c = (p.cells || [])[i] ?? 'n/a';
                      return <td key={i} className="ra-mx-cell" data-tone={cellTone[c] || 'idle'} title={t + ': ' + c}>{c === 'n/a' ? '—' : labelize(c)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Expiring soon — derived from the live matrix */}
        <div className="ra-card">
          <div className="ra-card-h"><h3>Expiring soon</h3><span className="pd-pane-s">{expiring.length} module{expiring.length === 1 ? '' : 's'}</span></div>
          {expiring.length === 0 ? (
            <EmptyState icon={I.checkCircle} title="Nothing expiring" hint="No CITI modules are marked expiring in the current matrix." />
          ) : (
            <div className="ra-expiring">
              {expiring.map((e, i) => (
                <div key={i} className="ra-exp-row">
                  <span className="rd-chip tone-warn">Expiring</span>
                  <div>
                    <div className="ra-exp-name">{e.name ?? '—'}</div>
                    <div className="ra-exp-tr">{e.training}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════ Not-yet-connected capabilities ════
   Committees, Coverage analysis, Grant finder and Portfolio previously rendered
   fabricated fixtures. Under the real-data standard the fixtures are removed.
   Each capability HAS a governed backend, but it is a multi-endpoint,
   shape-divergent CRUD API the v2 surface does not yet call, so wiring it is a
   dedicated follow-up rather than a fixture→hook swap:
     - Committees   → /api/committees (members / meetings / agenda / votes /
                      finalize; no composite GET — the poll needs a live meeting)
     - Coverage     → /api/coverage-analysis (analyses / items / billing-grid;
                      the qualifying determination uses different field names)
     - Grant finder → /api/grant-finder (funding profile + ranked /discover
                      matches over Grants.gov) and /api/grants (proposals/awards)
     - Portfolio    → /api/committees/portfolio (protocol portfolio projection)
   Until then each shows an honest "not connected yet" state, never a mock. */
function NotYetConnected({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint: React.ReactNode }) {
  return (
    <div className="ra-sec">
      <EmptyState icon={icon} title={title} hint={hint} />
    </div>
  );
}

/* ════ Shell ════ */

export function ResearchAdmin({ onAsk }: SurfaceViewProps) {
  const [sec, setSec] = useState('committees');
  // Lifted from Training so the single publisher below can see the read's
  // state; Training renders from these props and keeps its early returns.
  const training = useLiveRows<CitiPerson>('/api/research-admin');

  /* WHAT ANA SEES HERE. Four of the five sections are NOT connected — said
     plainly, because this surface's own Ask-AnA button invites questions about
     committees the workspace does not have. Training publishes aggregates only:
     a named person paired with a compliance status is an individually-
     attributable finding, so names never travel. */
  const anaContext = useMemo(() => {
    const label = SECTIONS.find((s) => s.id === sec)?.label ?? sec;
    const facts: Record<string, unknown> = {
      openSection: sec,
      connectedSections: ['training'],
      unconnectedSections: ['committees', 'coverage', 'grants', 'portfolio'],
    };
    let summary: string;
    if (sec !== 'training') {
      summary =
        `Research administration, ${label} section. This capability is not connected to the workspace — ` +
        'no committee/coverage/grant/portfolio data is on screen and none exists here to report.';
    } else if (training.loading) {
      summary = 'Research administration, Training (CITI) section — the training matrix is still loading.';
    } else if (training.error) {
      facts.trainingUnavailable = training.error;
      summary =
        'Research administration, Training (CITI) section — the training register could not be read. A failed read, not an organization with no training records.';
    } else if (training.empty) {
      facts.personnelCount = 0;
      facts.expiringCount = 0;
      summary =
        'Research administration, Training (CITI) section — no CITI training records yet; personnel appear once the register is populated.';
    } else {
      // Aggregates over the rendered 5-column matrix; expiringCount matches the
      // "Expiring soon" panel (every expiring cell in the live vectors).
      const rollup: Record<string, number> = { current: 0, expiring: 0, expired: 0, missing: 0, 'n/a': 0 };
      for (const p of training.rows) {
        for (let i = 0; i < CITI_TRAININGS.length; i++) {
          const c = (p.cells || [])[i] ?? 'n/a';
          if (c in rollup) rollup[c] += 1;
        }
      }
      const expiringCount = training.rows.reduce(
        (n, p) => n + (p.cells || []).filter((c) => c === 'expiring').length,
        0,
      );
      facts.personnelCount = training.rows.length;
      facts.expiringCount = expiringCount;
      facts.statusRollup = rollup;
      summary =
        `Research administration, Training (CITI) section — ${training.rows.length} personnel across ${CITI_TRAININGS.length} CITI modules, ` +
        (expiringCount === 0 ? 'nothing expiring.' : `${expiringCount} module assignment(s) marked expiring.`);
    }
    return {
      summary,
      facts,
      availableActions: [
        'Switch section: Committees, Coverage analysis, Grant finder, Training (CITI), Portfolio',
        'Only the Training (CITI) section is connected to live workspace data; the other four have governed backends not yet wired to this surface',
      ],
    };
  }, [sec, training.loading, training.error, training.empty, training.rows]);
  /* Section navigation only. Four of the five sections are not connected to
     the workspace, and the applied detail repeats that rather than letting a
     successful switch imply data arrived. */
  useSurfaceActionHandlers('research-admin', {
    'research-admin.open-section': (params) => {
      const target = String(params.section ?? '');
      const meta = SECTIONS.find((s) => s.id === target);
      if (!meta) return { ok: false, reason: `No research-admin section named "${params.section}".` };
      if (sec === target) return { ok: true, detail: `Already on ${meta.label}` };
      setSec(target);
      return {
        ok: true,
        detail:
          `Opened ${meta.label}` +
          (target === 'training'
            ? ''
            : ' — this capability is not connected to the workspace, so it shows no data'),
      };
    },
  });

  usePublishSurfaceContext('research-admin', anaContext);

  const body = (() => {
    switch (sec) {
      case 'coverage':
        return <NotYetConnected icon={I.creditCard} title="Coverage analysis isn't connected yet"
          hint="Medicare NCD 310.1 qualifying-trial determinations and the billing-coverage grid appear here once this organization's coverage analyses are connected to the workspace." />;
      case 'grants':
        return <NotYetConnected icon={I.sparkles} title="Grant finder isn't connected yet"
          hint="Your organization's funding profile and ranked funding opportunities appear here once the grant finder is connected to the workspace." />;
      case 'training':
        return (
          <Training
            personnel={training.rows}
            loading={training.loading}
            error={training.error}
            empty={training.empty}
          />
        );
      case 'portfolio':
        return <NotYetConnected icon={I.barChart} title="Portfolio analytics isn't connected yet"
          hint="Continuing-review expiration analytics across the committee portfolio appear here once this organization's portfolio is connected to the workspace." />;
      default:
        return <NotYetConnected icon={I.user} title="Committee governance isn't connected yet"
          hint="IRB, IACUC and IBC rosters, composition checks and convened-meeting voting appear here once this organization's committee governance is connected to the workspace." />;
    }
  })();
  return (
    <div className="ra-wrap">
      <div className="ra-head">
        <div>
          <h1 className="ra-title">Research administration</h1>
          <div className="ra-sub">Committee governance, coverage analysis, funding and compliance — for the research organization</div>
        </div>
        <button className="btn ghost" onClick={() => onAsk && onAsk('Summarize what needs my attention across committees, coverage and continuing review.')}>{I.sparkles} Ask AnA</button>
      </div>
      <div className="ra-tabs">
        {SECTIONS.map(s => (
          <button key={s.id} className={'ra-tab' + (sec === s.id ? ' on' : '')} onClick={() => setSec(s.id)}>
            <Ic n={s.icon} /> {s.label}
          </button>
        ))}
      </div>
      <div className="ra-body">{body}</div>
    </div>
  );
}
