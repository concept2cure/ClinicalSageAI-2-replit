import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Render contract (GET /api/change-assessment → { data: ChangeItem[] }) ──

   Fixture-free (real-data standard): the worklist reads the org's REAL
   change-determination store (change_assessments — server/routes/
   change-assessment.routes.ts, org-scoped on organization_id). Each row is a
   510(k)-change / MDR significant-change determination shaped 1:1 to this
   surface's display contract (id/title/device/area/raised/owner/fda/eu/doc).
   Real rows, an honest empty, or an honest error — never a fabricated
   fixture. `rows` is a fresh [] while loading/on error, so every KPI
   derivation below is null-safe.

   NOTE — distinct from the QMS CMC change-control store (cmc_change_controls,
   GET /api/cmc-changes): that is the SUPAC/EU-variations pharma classifier;
   this is the device 510(k)/MDR significant-change decision tree. Two
   different domains, two different stores — deliberately not converged. */

interface ChangeStep {
  q: string;
  basis: string;
  a: string;
  detail: string;
  gate?: boolean;
}

interface ChangeDecisionData {
  steps: ChangeStep[];
  outcome: string;
  label: string;
  rationale: string;
}

interface ChangeDoc {
  kind: string;
  status: string;
}

interface ChangeItem {
  id: string;
  title: string;
  device: string;
  area: string;
  raised: string;
  owner: string;
  /* The two determinations and the generated document are per-row nullable on
     change_assessments: a change assessed for one jurisdiction only, or one
     raised but not yet run through a decision tree, arrives without them. The
     `?.` reads below are that, not defensiveness. */
  fda?: ChangeDecisionData;
  eu?: ChangeDecisionData;
  doc?: ChangeDoc;
}

/* Outcome → tone/icon map: canonical rendering config for the determination
   verdicts (not data), mirroring the FDA/MDR outcome vocabulary. */
const CA_OUT: Record<string, { tone: string; ic: string }> = {
  'new-submission': { tone: 'err', ic: 'alertTriangle' },
  'nb-notify':      { tone: 'err', ic: 'alertTriangle' },
  'letter-to-file': { tone: 'ok',  ic: 'fileCheck' },
  'record-only':    { tone: 'ok',  ic: 'fileCheck' },
};

/* Does this determination trigger a filing (new submission / NB notification)? */
function triggersFiling(c: ChangeItem): boolean {
  return c.fda?.outcome === 'new-submission' || c.eu?.outcome === 'nb-notify';
}

/* ── Inner components ── */

interface ChangeDecisionProps {
  title: string;
  flag: string;
  dec: ChangeDecisionData;
}

function ChangeDecision({ title, flag, dec }: ChangeDecisionProps) {
  const out = CA_OUT[dec.outcome] || { tone: 'warn', ic: 'minus' };
  const steps = dec.steps ?? [];
  return (
    <div className="chg-dec">
      <div className="chg-dec-h"><span className="chg-flag">{flag}</span>{title}</div>
      <div className="chg-steps">
        {steps.map((s, i) => (
          <div key={i} className="chg-step" data-a={s.a} data-gate={s.gate || undefined}>
            <div className="chg-step-node">{s.a === 'yes' ? I.check : s.a === 'no' ? I.minus : i + 1}</div>
            <div className="chg-step-body">
              <div className="chg-step-q"><span>{s.q}</span><span className="chg-step-a" data-a={s.a}>{s.a === 'yes' ? 'Yes' : 'No'}</span></div>
              <div className="chg-step-d">{s.detail}</div>
              <div className="chg-step-b">{s.gate ? 'Decision gate -- ' : ''}{s.basis}</div>
            </div>
          </div>
        ))}
      </div>
      <div className={`chg-out ${out.tone}`}>
        <span className="chg-out-ic">{(I as Record<string, React.ReactElement>)[out.ic] || I.check}</span>
        <div><div className="chg-out-l">{dec.label}</div><div className="chg-out-r">{dec.rationale}</div></div>
      </div>
    </div>
  );
}

/* ════ Change Assessment surface ════ */

export function ChangeAssessment({ onAsk }: SurfaceViewProps) {
  const live = useLiveRows<ChangeItem>('/api/change-assessment');
  /* Gated on error as well as loading. `useLiveRows`/`useLiveData` return
     `data: null` on a FAILED read, so each count below derives from an empty
     list and resolves to 0 — and with `loading` already false the strip renders
     a SETTLED zero rather than a placeholder. Rows are empty in three
     situations and only the third may say "nothing is on file"; the pattern is
     MarketAccess.tsx:62. */
  const kv = (n: number | string) => (live.loading || live.error ? '—' : String(n));
  const items = live.rows;
  const [sel, setSel] = useState<string | null>(null);

  /* Select the first change once the worklist arrives; keep the selection
     valid if the list changes. */
  const firstId = items[0]?.id;
  useEffect(() => {
    if (!firstId) return;
    setSel((s) => (s && items.some((c) => c.id === s) ? s : firstId));
  }, [firstId, items]);

  const item = items.find((c) => c.id === sel) || items[0];

  /* KPIs — all derived from the real worklist (0 on empty/error, never a
     fabricated count). Jurisdictions = the distinct jurisdictions actually
     assessed across the org's changes, not a hardcoded "2". */
  const triggers = items.filter(triggersFiling).length;
  const jurisdictions = new Set(
    items.flatMap((c) => [c.fda ? 'FDA' : null, c.eu ? 'EU' : null].filter(Boolean) as string[]),
  ).size;

  /* WHAT ANA SEES HERE. Branches mirror the render exactly. On error the
     screen's kv() shows '—' for every KPI, so no numeric facts are published
     there — a failed read is a failure, not zero changes. A jurisdiction with
     no determination on the selected row is reported absent, never asserted. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'Change assessment — loading the 510(k)-change / MDR significant-change worklist; nothing is on screen yet.' };
    }
    if (live.error) {
      return {
        summary:
          'Change assessment — the 510(k)-change / MDR significant-change worklist did not load, so no counts are on screen — a failed read, not an empty worklist.',
      };
    }
    if (items.length === 0 || !item) {
      return { summary: 'Change assessment — no change assessments on file yet; record a change or ask AnA to assess one and its FDA / EU MDR determination appears here.' };
    }
    return {
      summary:
        'Change assessment — ' + items.length + ' open change(s): ' + triggers + ' trigger a filing, '
        + (items.length - triggers) + ' document-to-file, ' + jurisdictions + ' jurisdiction(s) assessed. Selected: '
        + item.id + ' — ' + item.title + '.',
      facts: {
        openChanges: items.length,
        triggerFiling: triggers,
        documentToFile: items.length - triggers,
        jurisdictionsAssessed: jurisdictions,
        selected: {
          id: item.id,
          title: item.title,
          device: item.device,
          area: item.area,
          raised: item.raised,
          owner: item.owner,
          docStatus: item.doc?.status ?? null,
        },
        determinationsPresent: { fda: !!item.fda, eu: !!item.eu },
      },
      availableActions: [
        'Selecting a row in the worklist is the only screen control here — the FDA and EU MDR determinations shown are read-outs of recorded assessments, not something this screen edits',
        'Ask AnA to assess a new change, or to draft the selected change’s document-to-file',
      ],
    };
  }, [live.loading, live.error, items, item, triggers, jurisdictions]);
  /* Selection only — the FDA and EU MDR determinations this screen shows are
     computed from the change record; recording one stays a human act. */
  useSurfaceActionHandlers('change-assessment', {
    'change-assessment.select-change': (params) => {
      const raw = String(params.change ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a change to select.' };
      if (live.loading) return { ok: false, reason: 'The change worklist is still loading.', retry: true };
      if (live.error) {
        return { ok: false, reason: 'The change worklist could not be read, so there is nothing to select from.' };
      }
      const needle = raw.toLowerCase();
      const exact = items.filter((c) => c.id.toLowerCase() === needle || c.title.toLowerCase() === needle);
      const hits = exact.length ? exact : items.filter((c) => c.title.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No change named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} changes — name one exactly.` };
      setSel(hits[0].id);
      return { ok: true, detail: `Selected ${hits[0].id} — ${hits[0].title}` };
    },
  });
  useEffect(() => {
    if (!live.loading && !live.error) notifySurfaceActionReady('change-assessment');
  }, [live.loading, live.error]);

  usePublishSurfaceContext('change-assessment', anaContext);

  return (
    <div className="page-inner reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform {I.dot} lifecycle</div>
          <h1 className="reg-title">Change assessment</h1>
          <p className="reg-sub">Every design, labeling or manufacturing change runs the FDA "When to Submit a 510(k) for a Change" (2017) and EU MDR significant-change (MDCG 2020-3) determinations — resolving to a new submission or a document-to-file.</p>
        </div>
        {onAsk && <button className="reg-ask" onClick={() => onAsk('Assess a new device change for 510(k) / MDR significant-change impact')}>{I.sparkles} Assess a change</button>}
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{kv(items.length)}</div><div className="reg-kpi-l">Open changes</div></div>
        <div className="reg-kpi" data-tone="err"><div className="reg-kpi-v">{kv(triggers)}</div><div className="reg-kpi-l">Trigger a filing</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{kv(items.length - triggers)}</div><div className="reg-kpi-l">Document to file</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{kv(jurisdictions)}</div><div className="reg-kpi-l">Jurisdictions assessed</div></div>
      </div>

      {live.loading ? (
        <EmptyState title="Loading change assessments…" />
      ) : live.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn’t load change assessments"
          hint="This is your organization's governed 510(k)-change / MDR significant-change worklist. Sign in and retry, or check the service is reachable."
        />
      ) : items.length === 0 || !item ? (
        <EmptyState
          icon={I.fileText}
          title="No change assessments yet"
          hint="Record a design, labeling or manufacturing change — or ask AnA to assess one — and its FDA / EU MDR determination appears here as a worklist."
        />
      ) : (
        <div className="chg-split">
          <div className="chg-list">
            {items.map((c) => {
              const trig = triggersFiling(c);
              return (
                <button key={c.id} className="chg-row" data-on={c.id === sel || undefined} onClick={() => setSel(c.id)}>
                  <div className="chg-row-top"><span className="chg-row-id">{c.id}</span><span className={`chg-row-tag ${trig ? 'err' : 'ok'}`}>{trig ? 'Filing' : 'File only'}</span></div>
                  <div className="chg-row-t">{c.title}</div>
                  <div className="chg-row-m">{c.device} {I.dot} {c.area} {I.dot} {c.owner}</div>
                </button>
              );
            })}
          </div>

          <div className="chg-detail">
            <div className="chg-detail-h">
              <div>
                <div className="chg-detail-t">{item.title}</div>
                <div className="chg-detail-m">{item.id} {I.dot} {item.device} {I.dot} {item.area} {I.dot} raised {item.raised}</div>
              </div>
              <span className={`reg-st ${item.doc?.status}`}>{item.doc?.status}</span>
            </div>

            {/* A jurisdiction with no determination on the row renders no card
                at all -- an empty decision tree with a blank verdict would
                assert an assessment that was never made. Same reading of the
                data as the jurisdictions KPI above, which counts `c.fda`/`c.eu`
                only where they are present. */}
            <div className="chg-decisions">
              {item.fda && <ChangeDecision title="FDA — 21 CFR 807 / 2017 guidance" flag="US" dec={item.fda} />}
              {item.eu && <ChangeDecision title="EU MDR — MDCG 2020-3" flag="EU" dec={item.eu} />}
            </div>

            <div className="chg-doc">
              <div className="chg-doc-l">{I.fileText} Generates: <b>{item.doc?.kind}</b></div>
              <div className="chg-doc-acts">
                <button className="reg-doc-open" onClick={() => onAsk && onAsk(`Draft the ${item.doc?.kind} for ${item.id} -- ${item.title}`)}>{I.sparkles} Draft with AnA</button>
                {/* "Open change record" was a dead button — no onClick, and no
                    second view to reach. The .chg-detail pane beside it already
                    IS the change record: id, device, area, raised date, both
                    jurisdictions' decision trees, outcomes, rationales, doc kind
                    and status. Removed rather than wired, because wiring it
                    would mean inventing a change-record document store this
                    product does not have. "Draft with AnA" is the real action
                    here and it works. */}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
