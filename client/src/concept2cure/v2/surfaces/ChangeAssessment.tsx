import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';
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
  fda: ChangeDecisionData;
  eu: ChangeDecisionData;
  doc: ChangeDoc;
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

  return (
    <div className="page-inner reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform {I.dot} lifecycle</div>
          <h1 className="reg-title">Change assessment</h1>
          <p className="reg-sub">Every design, labeling or manufacturing change runs the FDA "When to Submit a 510(k) for a Change" (2017) and EU MDR significant-change (MDCG 2020-3) determinations -- resolving to a new submission or a document-to-file.</p>
        </div>
        {onAsk && <button className="reg-ask" onClick={() => onAsk('Assess a new device change for 510(k) / MDR significant-change impact')}>{I.sparkles} Assess a change</button>}
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{items.length}</div><div className="reg-kpi-l">Open changes</div></div>
        <div className="reg-kpi" data-tone="err"><div className="reg-kpi-v">{triggers}</div><div className="reg-kpi-l">Trigger a filing</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{items.length - triggers}</div><div className="reg-kpi-l">Document to file</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{jurisdictions}</div><div className="reg-kpi-l">Jurisdictions assessed</div></div>
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

            <div className="chg-decisions">
              <ChangeDecision title="FDA -- 21 CFR 807 / 2017 guidance" flag="US" dec={item.fda} />
              <ChangeDecision title="EU MDR -- MDCG 2020-3" flag="EU" dec={item.eu} />
            </div>

            <div className="chg-doc">
              <div className="chg-doc-l">{I.fileText} Generates: <b>{item.doc?.kind}</b></div>
              <div className="chg-doc-acts">
                <button className="reg-doc-open" onClick={() => onAsk && onAsk(`Draft the ${item.doc?.kind} for ${item.id} -- ${item.title}`)}>{I.sparkles} Draft with AnA</button>
                <button className="reg-doc-open ghost">{I.externalLink} Open change record</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
