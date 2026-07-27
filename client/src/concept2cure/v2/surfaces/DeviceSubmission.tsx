/* DeviceSubmission.tsx -- Device submission hub and remaining intel panels.
   Ported from design kit device-sub.jsx. */
import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { DV, getDevicePathway } from '../fixtures/device-data';
import { useLiveData, useLiveRows, EmptyState, type DataState } from '../dataConnect';
import {
  Ic, KV, StatusBadge, DeviceAcc, Tree, DocumentPage,
  IntelReadiness, IntelPredicate, IntelClassification, IntelRisk,
  IntelPerformance, IntelGspr, IntelClinical, IntelManufacturing,
  IntelEquivalence, IntelLiterature, IntelPms, IntelCdx,
  IntelCerConformance, IntelGsprFull, IntelPostMarket, IntelChangeAssessment,
} from './DeviceIntel';

function Btn({ icon, variant, block, disabled, onClick, children }: {
  icon?: string; variant?: string; block?: boolean; disabled?: boolean;
  onClick?: () => void; children?: React.ReactNode;
}) {
  return <button className={`btn ${variant || ''}${block ? ' block' : ''}`} disabled={disabled} onClick={onClick}>{icon && <Ic n={icon} />}{children}</button>;
}
// MOCK ACTION (flagged for the actions pass — do not half-wire here): both hub
// mounts pass `onConfirm={() => {}}`, so confirming a governed action (including
// "Assemble package" and "Submit to <gateway>" from IntelAssembly, shown with a
// "21 CFR Part 11 e-signature" affordance) performs NO work — no API call, no
// persistence, no audit entry. Needs a real governed-action endpoint before the
// confirm can claim to do anything.
function GovernedActionDialog({ open, onClose, onConfirm, title, intent, basis, esign }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title?: string; intent?: string; basis?: string; esign?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="tb-detail-bd" onClick={onClose}>
      <div className="tb-detail" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="tb-detail-h"><div><h3>{title || 'Governed action'}</h3></div><button className="tb-detail-x" onClick={onClose}>{I.close}</button></div>
        {intent && <p style={{ fontSize: 12.5, color: 'var(--text-300)', margin: '8px 0' }}>{intent}</p>}
        {basis && <div className="ra-citation" title={basis}>{I.info} {basis}</div>}
        {esign && <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 8 }}>Requires e-signature (21 CFR Part 11)</div>}
        {/* HONESTY GUARD: onConfirm is a no-op in every mount of this hub (no
            backing endpoint), so the confirm is disabled and says so — a
            governed action that performs no work must never look confirmable.
            Real agency dispatch lives in the gateway-transmittals surface. */}
        <div style={{ fontSize: 11, color: 'var(--warning,#b54708)', marginTop: 8 }}>
          Not wired to a backend yet — confirming would perform no work, so it is disabled.
        </div>
        <div className="tb-detail-f" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled title="No backing endpoint — this governed action is not wired yet">{I.check} Confirm</button>
        </div>
      </div>
    </div>
  );
}
function IntelDesignControls({ pw }: { pw: any }) {
  const d = pw.dhf; if (!d) return null;
  return (
    <div className="dv-mini">
      <div className="dv-mini-det" data-tone={d.auditReady ? 'ok' : 'warn'}>
        <span className="ra-det-l">DHF audit readiness {'·'} 21 CFR 820.30</span><span className="dv-mini-detv">{d.auditReady ? 'Audit-ready' : 'Not audit-ready'}</span>
      </div>
      <div className="dv-rsim-stats"><span><b>{Math.round(d.completeness)}%</b> DHF complete</span><span><b>{Math.round(d.tracedShare * 100)}%</b> req. traced</span></div>
      {d.elements.map((el: any, i: number) => (
        <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={el.have}>{el.have ? '✓' : '•'}</span><span>{el.label}</span><span className="pg-mono" style={{ marginLeft: 'auto', fontSize: 10 }}>{el.ref}</span></div>
      ))}
      {d.blockers.length > 0 && <div>
        <div className="dv-mini-sub" style={{ marginTop: 8 }}>Blockers</div>
        {d.blockers.map((b: string, i: number) => <div key={i} className="dv-rsim-f" data-sev="deficiency"><div className="dv-rsim-txt">{b}</div></div>)}
      </div>}
    </div>
  );
}
function IntelTraceability17511({ pw }: { pw: any }) {
  const t = pw.traceability17511; if (!t) return null;
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{t.reference}</div>
      <div className="dv-mini-sub" style={{ marginTop: 4 }}>Calibrator chain tier</div>
      {t.tiers.map((tier: string, i: number) => (
        <div key={i} className="dv-mini-mfg"><span className="pg-badge" data-tone={i === t.tierRank ? 'ok' : 'idle'}>{i === t.tierRank ? 'CURRENT' : String(i + 1)}</span><span className="dv-mini-hz" style={{ fontWeight: i === t.tierRank ? 700 : 400 }}>{tier}</span></div>
      ))}
      <div className="dv-mini-sub" style={{ marginTop: 8 }}>Evidence checks</div>
      {t.checks.map((c: any, i: number) => <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={c.have}>{c.have ? '✓' : '•'}</span><span>{c.k}</span></div>)}
      <div className="dv-mini-det" data-tone={t.valid ? 'ok' : 'err'}><span className="ra-det-l">Chain validity</span><span className="dv-mini-detv">{t.valid ? 'Valid for marketing' : 'Not valid — gaps outstanding'}</span></div>
      {t.gaps.length > 0 && t.gaps.map((g: string, i: number) => <div key={i} className="dv-rsim-f" data-sev="deficiency"><div className="dv-rsim-txt">{g}</div></div>)}
      <p className="dv-mini-note">{t.recommendation}</p>
    </div>
  );
}
function IntelReviewSim({ pw }: { pw: any }) {
  const r = pw.reviewsim; if (!r) return null;
  const vlabel = ({ likely_acceptance: 'Likely acceptance', additional_information_likely: 'Additional information likely', not_substantially_complete: 'Not substantially complete' } as Record<string, string>)[r.verdict];
  const vtone = r.verdict === 'likely_acceptance' ? 'ok' : r.verdict === 'additional_information_likely' ? 'warn' : 'err';
  return (
    <div className="dv-mini">
      <div className="dv-mini-det" data-tone={vtone}><span className="ra-det-l">Likely outcome if submitted as-is</span><span className="dv-mini-detv">{vlabel}</span></div>
      <div className="dv-rsim-stats"><span><b>{r.readiness}</b> readiness</span><span><b>{r.cycles}</b> review cycle{r.cycles > 1 ? 's' : ''}</span><span className="pd-chip">{r.riskTier} tier</span></div>
      {r.findings.map((f: any, i: number) => (
        <div key={i} className="dv-rsim-f" data-sev={f.sev}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={f.sev === 'major' ? 'err' : f.sev === 'deficiency' ? 'warn' : 'idle'}>{f.sev}</span><span className="dv-rsim-area">{f.area}</span></div>
          <div className="dv-rsim-txt">{f.text}</div><div className="dv-rsim-fix"><b>Fix: </b>{f.fix}</div>
        </div>
      ))}
      {r.strengths && r.strengths.length > 0 && <div className="dv-rsim-strengths"><div className="dv-mini-sub">Strengths</div>
        {r.strengths.map((s: string, i: number) => <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'✓'}</span><span>{s}</span></div>)}
      </div>}
    </div>
  );
}
/* ── Human factors (IEC 62366) — REAL org-scoped backend (GET /api/human-factors).
   Returns the org's HFE/UE file object { device, framework, present, scenarios[] }
   (or { data: null } when none), the `{ data }` success envelope the hook unwraps.
   We render the real framework + use-related scenarios; nullable columns are
   `| null` and rendered null-safe. `present` (element checklist) is intentionally
   not rendered — its persisted shape isn't part of this display contract, and we
   never fabricate a completeness number the backend doesn't return. ── */

interface HfScenario { task: string; useError: string | null; potentialHarmSeverity: string | null; mitigated: boolean | null; }
interface HfFile { device: string | null; framework: string | null; scenarios: HfScenario[] }

function IntelHumanFactors() {
  const hf = useLiveData<HfFile>('/api/human-factors');
  if (hf.loading) return <div className="dv-mini"><div className="scaf-note" style={{ padding: '18px 10px' }}>Loading HFE/UE file…</div></div>;
  if (hf.error) return (
    <div className="dv-mini">
      <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the HFE/UE file"
        hint="The organization's IEC 62366 human-factors file (use specification, critical tasks, residual use-related risk) didn't respond. Sign in and retry, or check the service is reachable." />
    </div>
  );
  if (hf.empty || !hf.data) return (
    <div className="dv-mini">
      <EmptyState icon={I.fileText} title="No HFE/UE file yet"
        hint="Once a human-factors file is created, its use specification, use-related critical tasks and residual-risk conclusion are governed here (IEC 62366-1)." />
    </div>
  );
  const h = hf.data;
  const scenarios = h.scenarios ?? [];
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{h.framework || 'IEC 62366-1'}{h.device ? ` ${'·'} ${h.device}` : ''} {'·'} HFE/UE file</div>
      <div className="dv-mini-sub">Use-related critical tasks{scenarios.length ? ` (${scenarios.length})` : ''}</div>
      {scenarios.length === 0 ? (
        <p className="dv-mini-note">No use-related scenarios recorded yet.</p>
      ) : scenarios.map((c, i) => (
        <div key={i} className="dv-rsim-f" data-sev={c.mitigated ? 'minor' : 'major'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={c.potentialHarmSeverity === 'critical' ? 'err' : 'warn'}>{c.potentialHarmSeverity || 'severity n/a'}</span><span className="dv-rsim-area">{c.task}</span><span className="pg-badge" data-tone={c.mitigated ? 'ok' : 'err'}>{c.mitigated ? 'mitigated' : 'open'}</span></div>
          {c.useError && <div className="dv-rsim-txt">Use error: {c.useError}</div>}
        </div>
      ))}
    </div>
  );
}
function IntelCyber({ pw }: { pw: any }) {
  const c = pw.cyber; if (!c) return null;
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{c.framework}</div>
      <div className="dv-gspr-bar"><span className="dv-gspr-seg" style={{ flex: c.readiness }} data-tone={c.readiness >= 75 ? 'ok' : 'warn'}>{c.readiness}%</span><span className="dv-gspr-seg" style={{ flex: 100 - c.readiness }} data-tone="idle" /></div>
      {c.artifacts.map((a: any, i: number) => <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={a.have}>{a.have ? '✓' : '•'}</span><span>{a.k}</span></div>)}
      {c.sbom && <p className="dv-mini-note">SBOM: {c.sbom.complete}/{c.sbom.components} components complete vs {c.sbom.ntia} {'·'} {c.sbom.vulnerableComponents} with known vulnerabilities ({c.sbom.knownVulns}).</p>}
    </div>
  );
}
function IntelRegistration({ pw }: { pw: any }) {
  const r = pw.registration; if (!r) return null;
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{r.scheme}</div>
      {r.items.map((it: any, i: number) => <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={it.have}>{it.have ? '✓' : '•'}</span><span>{it.k}</span></div>)}
      {r.doc && <div className="dv-honesty info"><Ic n="fileText" /><div><b>{r.doc.annex}</b><p>{r.doc.status === 'valid' ? 'Ready to sign.' : 'Pending — missing: ' + (r.doc.missing || []).join(', ') + '.'}</p></div></div>}
      {r.note && <p className="dv-mini-note">{r.note}</p>}
    </div>
  );
}
function IntelForms({ pw }: { pw: any }) {
  return (
    <div className="dv-mini">{pw.forms.map((f: any) => (
      <div key={f.id} className="dv-mini-form"><Ic n="fileText" /><span className="dv-mini-fn">{f.name}</span><span className="dv-mini-ft">{f.title}</span>
        {f.status === 'na' ? <span className="pd-chip">N/A</span> : <StatusBadge status={f.status} />}</div>
    ))}</div>
  );
}
function IntelAssembly({ pw, onGov }: { pw: any; onGov: (cfg: any) => void }) {
  const a = pw.assembly;
  return (
    <div className="dv-mini">
      {(a.officialEstarPdf === false || a.officialEstarPdf === null) && (
        <div className={'dv-honesty' + (a.officialEstarPdf === null ? ' info' : '')}><Ic n={a.officialEstarPdf === null ? 'info' : 'alertTriangle'} /><p>{a.officialNote}</p></div>
      )}
      <div className="dv-validator">{a.validator.map((v: any, i: number) => (
        <div key={i} className="dv-val-row" data-r={v.result}><span className="dv-val-mk" data-r={v.result}>{v.result === 'pass' ? '✓' : '✕'}</span><div className="dv-val-body"><div className="dv-val-check">{v.check}</div><div className="dv-val-detail">{v.detail}</div></div></div>
      ))}</div>
      <div className="dv-dispatch" data-open={a.canTransmit}><span className="dv-dispatch-k"><Ic n={a.canTransmit ? 'checkCircle' : 'alertTriangle'} />{a.canTransmit ? 'Dispatch gate OPEN' : 'Dispatch gate CLOSED'}</span><div className="dv-dispatch-note">{a.transmitNote}</div></div>
      <Btn icon="fileCheck" variant="outline" block onClick={() => onGov({ title: 'Assemble submission package', intent: 'Assemble the ' + a.format + ' content package from all sections.', basis: pw.framework, esign: false })}>Assemble package</Btn>
      <Btn icon="rocket" variant="primary" block disabled={!a.canTransmit} onClick={() => onGov({ title: 'Transmit to ' + a.gateway, intent: 'Transmit the assembled submission to ' + a.gateway + '.', basis: 'Dispatch gate · 21 CFR Part 11', esign: true })}>Submit to {a.gateway}</Btn>
    </div>
  );
}
// LEFT AS CANONICAL REFERENCE + FLAGGED (spec "unsure → leave and flag"): DV.markets
// is fundamentally a canonical list of real regulatory markets/authorities/instruments
// (FDA, EU MDR/IVDR, PMDA, Health Canada, NMPA, ANVISA, TGA, MHRA) — the kind of
// reference config the standard excludes. It carries a fabricated per-device overlay
// though (each market's `readiness` % and `reqs[].have` booleans), and there is no
// backend for a "device market-readiness" contract to re-anchor that overlay to.
function IntelGlobalMarkets({ pw }: { pw: any }) {
  const M = DV.markets || [];
  const [open, setOpen] = useState<string | null>(null);
  const tier = (n: number) => n >= 66 ? 'hi' : n >= 45 ? 'mid' : 'lo';
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{M.length} markets {'·'} global registration strategy</div>
      {M.map((m: any) => (
        <div key={m.id} className={'dv-mkt' + (open === m.id ? ' open' : '')}>
          <button className="dv-mkt-h" onClick={() => setOpen(open === m.id ? null : m.id)}>
            <span className="dv-mkt-flag">{m.flag}</span><div className="dv-mkt-id"><span className="dv-mkt-auth">{m.authority}</span><span className="dv-mkt-inst">{m.instrument}</span></div>
            <span className="dv-mkt-pct" data-tier={tier(m.readiness)}>{m.readiness}%</span>
          </button>
          <div className="dv-mkt-bar"><span style={{ width: m.readiness + '%' }} data-tier={tier(m.readiness)} /></div>
          <div className="dv-mkt-chips"><span className="dv-mkt-chip">{m.format}</span><span className="dv-mkt-chip">{m.language}</span>{m.localRep && <span className="dv-mkt-chip warn">Local rep</span>}{m.mdsap && <span className="dv-mkt-chip ok">MDSAP</span>}</div>
          {open === m.id && <div className="dv-mkt-detail">
            <KV k="Classification" v={m.classRule} /><KV k="UDI" v={m.udi} />
            <div className="dv-mini-sub">Core requirements</div>
            {m.reqs.map((r: any, i: number) => <div key={i} className="dv-mkt-req"><span className="dv-mini-tk" data-ok={r.have}>{r.have ? '✓' : '•'}</span><span>{r.r}</span></div>)}
            <div className="dv-mini-sub">Format and demands</div>
            {m.demands.map((d: string, i: number) => <div key={i} className="dv-mkt-demand">{'· ' + d}</div>)}
          </div>}
        </div>
      ))}
      <div className="dv-mkt-mdsap"><Ic n="globe" /><div><b>{DV.mdsap.authority}</b><p>{DV.mdsap.note}</p></div></div>
    </div>
  );
}
/* ── CAPA / MDR vigilance — REAL org-scoped backend (/api/capa-mdr/*).
   Three governed list endpoints (mdr-events, complaints, capa) each return
   { rows, count }; we render the real persisted rows, an honest empty, or an
   honest error — never a fixture. Display types are aligned to the drizzle
   columns in shared/schema/capa-mdr.ts; nullable columns are `| null` and
   rendered null-safe. Timestamps arrive as ISO strings over JSON. ── */

interface MdrEventRow {
  id: string; mdrCode: string; jurisdiction: string; state: string;
  usFdaReportType: string | null; euMdrSeverity: string | null;
  reportDueAt: string | null; reportFiledAt: string | null;
  fdaReportNumber: string | null; daysToDue: number | null; eventNarrative: string;
}
interface ComplaintRow {
  id: string; complaintCode: string; source: string; channel: string;
  patientHarm: string; severityAssessment: string; triageState: string;
  deviceModel: string | null; eventNarrative: string;
}
interface CapaRow {
  id: string; capaCode: string; title: string; type: string; source: string;
  riskLevel: string; state: string; assignedTo: string | null; targetCloseDate: string | null;
}

/* One governed post-market list, four honest states (loading → error → empty →
   real). `state.data` is the `{ rows, count }` envelope the routes return (the
   hook does not treat that as the canonical `{ data }` envelope, so we read
   `.rows` and compute empty locally). */
function CapaSection<T extends { id: string }>({ state, title, emptyTitle, render }: {
  state: DataState<{ rows: T[] }>; title: string; emptyTitle: string; render: (r: T) => React.ReactNode;
}) {
  const rows = state.data?.rows ?? [];
  return (
    <div>
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>{title}{rows.length ? ` (${rows.length})` : ''}</div>
      {state.loading ? (
        <div className="scaf-note" style={{ padding: '12px 10px' }}>Loading…</div>
      ) : state.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title={`Couldn't load ${title.toLowerCase()}`}
          hint="This is the organization's governed device post-market queue (21 CFR 803 / 820.100, EU MDR Art 87). Sign in and retry, or check the CAPA/MDR service is reachable."
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={I.fileText} title={emptyTitle} />
      ) : (
        rows.map(render)
      )}
    </div>
  );
}

function IntelCapa() {
  const mdr = useLiveData<{ rows: MdrEventRow[] }>('/api/capa-mdr/mdr-events');
  const complaints = useLiveData<{ rows: ComplaintRow[] }>('/api/capa-mdr/complaints');
  const capa = useLiveData<{ rows: CapaRow[] }>('/api/capa-mdr/capa');
  const ht: Record<string, string> = { none: 'idle', malfunction: 'warn', injury: 'warn', serious_injury: 'err', death: 'err' };
  const st: Record<string, string> = { new: 'idle', triaged: 'ai', investigation: 'warn', escalated_mdr: 'err', escalated_capa: 'warn', resolved: 'ok', closed: 'ok' };
  const ct: Record<string, string> = { open: 'idle', investigation: 'warn', action_planned: 'ai', action_implemented: 'ai', effectiveness_check: 'warn', closed_effective: 'ok', closed_not_effective: 'err', escalated: 'err' };
  const mt: Record<string, string> = { open: 'idle', preparing: 'warn', filed: 'ok', acknowledged: 'ok', followup_required: 'warn', closed: 'ok' };
  const jl = (j: string) => j === 'both' ? 'FDA + EU MDR' : j === 'us_fda' ? 'FDA 803' : j === 'eu_mdr' ? 'EU MDR 87' : j;
  return (
    <div className="dv-mini">
      <CapaSection state={mdr} title="MDR events" emptyTitle="No MDR events yet" render={(e) => (
        <div key={e.id} className="dv-rsim-f" data-sev={e.daysToDue !== null && e.daysToDue <= 2 ? 'critical' : 'minor'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={mt[e.state] || 'idle'}>{e.mdrCode}</span><span className="dv-mini-note" style={{ flex: 1 }}>{jl(e.jurisdiction)}</span><span className="pg-badge" data-tone={mt[e.state] || 'idle'}>{e.state.replace(/_/g, ' ')}</span></div>
          {e.reportDueAt && <div className="dv-rsim-fix"><b>Report due: </b>{e.reportDueAt.slice(0, 10)}{e.daysToDue !== null ? ` ${'·'} ${e.daysToDue} day${e.daysToDue === 1 ? '' : 's'} remaining` : ''}</div>}
          {e.reportFiledAt && <div className="dv-rsim-fix"><b>Filed: </b>{e.reportFiledAt.slice(0, 10)}{e.fdaReportNumber ? ` ${'·'} Report# ${e.fdaReportNumber}` : ''}</div>}
          <div className="dv-mini-note" style={{ marginTop: 3 }}>{e.eventNarrative}</div>
        </div>
      )} />
      <CapaSection state={complaints} title="Complaints" emptyTitle="No complaints yet" render={(c) => (
        <div key={c.id} className="dv-rsim-f" data-sev={c.severityAssessment === 'critical' ? 'critical' : c.severityAssessment === 'serious' ? 'major' : c.severityAssessment === 'negligible' ? 'ok' : 'minor'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={ht[c.patientHarm] || 'idle'}>{c.patientHarm.replace(/_/g, ' ')}</span><span className="dv-mini-note" style={{ flex: 1 }}>{c.complaintCode} {'·'} {c.source.replace(/_/g, ' ')}</span><span className="pg-badge" data-tone={st[c.triageState] || 'idle'}>{c.triageState.replace(/_/g, ' ')}</span></div>
          <div className="dv-mini-note">{c.eventNarrative}</div>
        </div>
      )} />
      <CapaSection state={capa} title="CAPA records" emptyTitle="No CAPA records yet" render={(c) => (
        <div key={c.id} className="dv-rsim-f" data-sev={c.riskLevel === 'critical' || c.riskLevel === 'high' ? 'critical' : c.riskLevel === 'medium' ? 'major' : 'minor'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone="idle">{c.capaCode}</span><span className="dv-mini-note" style={{ flex: 1 }}>{c.type} {'·'} risk: {c.riskLevel}</span><span className="pg-badge" data-tone={ct[c.state] || 'idle'}>{c.state.replace(/_/g, ' ')}</span></div>
          <div className="dv-rsim-txt">{c.title}</div>
          <div className="dv-mini-note">{c.assignedTo ? `Owner: ${c.assignedTo}` : 'Unassigned'}{c.targetCloseDate ? ` ${'·'} Due: ${c.targetCloseDate.slice(0, 10)}` : ''}</div>
        </div>
      )} />
    </div>
  );
}
/* ── Inspection readiness — REAL org-scoped backend (GET /api/inspections,
   BIMO/PAI). The list returns the org's inspections as a flat array of real
   columns (snake_case). Per-inspection Form FDA 483 findings and per-area
   readiness live at separate endpoints (/:id/findings, /readiness/score) and
   are NOT fabricated here. Render real rows, an honest empty, or an honest
   error — never a fixture. ── */

interface InspectionRow {
  id: number; inspection_type: string; agency: string; site_name: string;
  scheduled_date: string | null; start_date: string | null; end_date: string | null;
  status: string; outcome: string;
}

function IntelInspection() {
  const insp = useLiveRows<InspectionRow>('/api/inspections');
  const oT: Record<string, string> = { pending: 'idle', nai: 'ok', vai: 'warn', oai: 'err' };
  const oL: Record<string, string> = { pending: 'Pending', nai: 'NAI', vai: 'VAI', oai: 'OAI' };
  if (insp.loading) return <div className="dv-mini"><div className="scaf-note" style={{ padding: '18px 10px' }}>Loading inspections…</div></div>;
  if (insp.error) return (
    <div className="dv-mini">
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load inspection readiness"
        hint="These are the organization's governed BIMO / PAI inspections and their outcomes. Sign in and retry, or check the inspection service is reachable."
      />
    </div>
  );
  if (insp.empty) return (
    <div className="dv-mini">
      <EmptyState
        icon={I.shieldCheck}
        title="No inspections yet"
        hint="Scheduled and completed FDA / EMA / MHRA / PMDA inspections, their outcomes, Form 483 findings and per-area readiness are governed here once created."
      />
    </div>
  );
  return (
    <div className="dv-mini">{insp.rows.map((ins) => (
      <div key={ins.id} style={{ marginBottom: 10 }}>
        <div className="dv-mini-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {ins.inspection_type.toUpperCase()} {'·'} {ins.agency.toUpperCase()}
          <span className="pg-badge" data-tone={ins.status === 'scheduled' ? 'ai' : ins.status === 'completed' || ins.status === 'closed' ? 'ok' : 'idle'}>{ins.status}</span>
          {ins.outcome && ins.outcome !== 'pending' && <span className="pg-badge" data-tone={oT[ins.outcome] || 'idle'}>{oL[ins.outcome] || ins.outcome}</span>}
        </div>
        <div className="dv-mini-note">{ins.site_name}</div>
        {ins.scheduled_date && <div className="dv-mini-mfg"><Ic n="calendar" /><span>Scheduled: {ins.scheduled_date.slice(0, 10)}</span></div>}
        {ins.start_date && <div className="dv-mini-note">Held: {ins.start_date.slice(0, 10)}{ins.end_date ? ` – ${ins.end_date.slice(0, 10)}` : ''}</div>}
      </div>
    ))}</div>
  );
}
/* ── AI/ML PCCP (FDA 2025) — the backend is REAL (/api/pccp/programs/:programId
   /plans, org-scoped drizzle over ai_ml_pccp_plans) but the list is keyed by a
   regulatory-program UUID this fixture-driven device surface does not carry
   (there is no program context here). Rather than fabricate a PCCP plan, show
   an honest empty until the surface is wired to a real program.
   FOLLOW-UP: thread the selected program id in and fetch its plans. ── */
function IntelPccp() {
  return (
    <div className="dv-mini">
      <EmptyState
        icon={I.fileText}
        title="No AI/ML PCCP plan yet"
        hint="Predetermined Change Control Plans (FDA 2025 final guidance) are governed per regulatory program. Once this device submission is linked to its program, its PCCP plan, modification protocol and impact assessment appear here."
      />
    </div>
  );
}

/* ════ INTEL registry ════ */
interface IntelEntry { title: string; icon: string; C: React.ComponentType<any>; has: (pw: any) => boolean }
const INTEL: Record<string, IntelEntry> = {
  predicate: { title: 'Predicate and SE', icon: 'scale', C: IntelPredicate, has: pw => !!pw.predicate },
  classification: { title: 'Classification', icon: 'gitBranch', C: IntelClassification, has: pw => !!pw.classification },
  risk: { title: 'Risk (ISO 14971)', icon: 'alertTriangle', C: IntelRisk, has: pw => !!pw.risk },
  performance: { title: 'Performance', icon: 'barChart', C: IntelPerformance, has: pw => !!pw.performance },
  clinical: { title: 'Clinical', icon: 'barChart', C: IntelClinical, has: pw => !!pw.clinical },
  manufacturing: { title: 'Manufacturing', icon: 'beaker', C: IntelManufacturing, has: pw => !!pw.manufacturing },
  equivalence: { title: 'Equivalence', icon: 'gitCompare', C: IntelEquivalence, has: pw => !!pw.equivalence },
  gspr: { title: 'GSPR conformity', icon: 'fileCheck', C: IntelGspr, has: pw => !!pw.gspr },
  literature: { title: 'Literature', icon: 'search', C: IntelLiterature, has: pw => !!pw.literature },
  pms: { title: 'PMS / PMCF', icon: 'globe', C: IntelPms, has: pw => !!pw.pms },
  cdx: { title: 'Companion Dx', icon: 'network', C: IntelCdx, has: pw => !!pw.cdx },
  globalmarkets: { title: 'Global markets', icon: 'globe', C: IntelGlobalMarkets, has: () => true },
  cerconformance: { title: 'CER conformance (MEDDEV)', icon: 'fileCheck', C: IntelCerConformance, has: pw => !!pw.cerconformance },
  gsprfull: { title: 'GSPR clause mapping', icon: 'scale', C: IntelGsprFull, has: pw => !!pw.gsprfull },
  postmarketdocs: { title: 'Post-market suite', icon: 'globe', C: IntelPostMarket, has: pw => !!pw.postmarketdocs },
  forms: { title: 'FDA forms', icon: 'clipboardList', C: IntelForms, has: pw => !!(pw.forms && pw.forms.length) },
  changeAssessment: { title: 'Change assessment', icon: 'gitBranch', C: IntelChangeAssessment, has: pw => !!pw.changeAssessment },
  dhf: { title: 'Design controls (DHF)', icon: 'clipboardList', C: IntelDesignControls, has: pw => !!pw.dhf },
  traceability17511: { title: 'Metrological traceability', icon: 'telescope', C: IntelTraceability17511, has: pw => !!pw.traceability17511 },
  cyber: { title: 'Cybersecurity', icon: 'shieldCheck', C: IntelCyber, has: pw => !!pw.cyber },
  reviewsim: { title: 'Reviewer simulation', icon: 'scale', C: IntelReviewSim, has: pw => !!pw.reviewsim },
  humanfactors: { title: 'Human factors (62366)', icon: 'user', C: IntelHumanFactors, has: () => true },
  registration: { title: 'Registration and listing', icon: 'fileCheck', C: IntelRegistration, has: pw => !!pw.registration },
  pccp: { title: 'AI/ML PCCP (FDA 2025)', icon: 'settings', C: IntelPccp, has: () => true },
  capa: { title: 'CAPA and MDR vigilance', icon: 'alertTriangle', C: IntelCapa, has: () => true },
  inspection: { title: 'Inspection readiness', icon: 'shieldCheck', C: IntelInspection, has: () => true },
  assembly: { title: 'Assembly and validate', icon: 'rocket', C: IntelAssembly, has: () => true },
};
function intelOrder(pw: any): string[] {
  const base = ['predicate', 'equivalence', 'cerconformance', 'reviewsim', 'changeAssessment', 'dhf', 'classification', 'clinical', 'performance', 'humanfactors', 'cyber', 'cdx', 'traceability17511', 'globalmarkets', 'registration', 'pccp', 'capa', 'inspection', 'risk', 'gsprfull', 'gspr', 'manufacturing', 'literature', 'pms', 'postmarketdocs', 'forms', 'assembly'];
  return base.filter(k => INTEL[k].has(pw));
}
function CoAuthor({ pw, sec, onAsk }: { pw: any; sec: any; onAsk: (m: string) => void }) {
  const a = pw.ana;
  return (
    <div className="dv-coauthor">
      <div className="dv-ca-ctx">
        <div className="dv-ca-row"><span className="dv-ca-k">Section</span><span className="dv-ca-v">{sec.num} {'·'} {sec.title}</span></div>
        <div className="dv-ca-row"><span className="dv-ca-k">Readiness</span><span className="dv-ca-v">{pw.readiness}%</span></div>
      </div>
      <div className="dv-ca-activity">{a.activity.map((ac: any, i: number) => (
        <div key={i} className="dv-ca-act" data-t={ac.type}><span className="dv-ca-dot" /><span className="dv-ca-text">{ac.text}</span><span className="dv-ca-when">{ac.when}</span></div>
      ))}</div>
      <div className="dv-ca-actions">{a.actions.map((ac: any) => <button key={ac.id} className="dv-ca-action" onClick={() => onAsk(ac.prompt)}><Ic n={ac.icon} />{ac.label}</button>)}</div>
      <button className="dv-ca-ask" onClick={() => onAsk('Continue drafting ' + sec.title + ' for ' + pw.device.name + '.')}><Ic n="sparkles" />Ask AnA to draft this section</button>
    </div>
  );
}

/* ════ The hub ════ */
export function DeviceSubmission({ onAsk, surface }: { onAsk: (m: string) => void; surface?: any }) {
  const initial = (surface && ({ 'device-cer': 'cer', 'device-diagnostics': 'ivdr' } as Record<string, string>)[surface.id]) || '510k';
  const [pwId, setPwId] = useState(initial);
  // FIXTURE SPINE (follow-up — not re-anchorable from this file alone): the whole
  // `pw` object (device identity, sections, document content, predicate, risk,
  // performance, reviewsim, DHF, cyber, registration, change-assessment, forms,
  // assembly, ana, traceability) is seed data from ../fixtures/device-data. It has
  // no matching backend contract and is consumed by components in ./DeviceIntel
  // (Tree, DocumentPage, DeviceAcc, IntelPredicate, IntelRisk, …) that this task
  // may not edit, so honestly re-anchoring it requires a coordinated multi-file
  // change (a device-submission read model + DeviceIntel.tsx). The self-contained
  // panels are handled here instead: CAPA/MDR, inspections and human factors are
  // re-anchored to live org-scoped data; PCCP shows an honest empty pending a
  // program id. (Candidate backends exist for some spine slices — /api/design-controls
  // for DHF, but it serves a different item-list contract on its own surface;
  // /api/cybersecurity-524b is POST-only — so they stay flagged, not half-wired.)
  const pw = getDevicePathway(pwId);
  const [activeSec, setActiveSec] = useState(pw.sections[0].id);
  const [dock, setDock] = useState('intel');
  const [openAcc, setOpenAcc] = useState<string | null>('readiness');
  const [gov, setGov] = useState<any>(null);
  const sec = pw.sections.find((s: any) => s.id === activeSec) || pw.sections[0];
  useEffect(() => { try { const C2C = (window as any).C2C; if (C2C && sec) C2C.setContext({ entityType: 'section', entityId: sec.id, entityLabel: (pw.label || pwId.toUpperCase()) + ' · §' + sec.num + ' ' + (sec as any).label }); } catch (_e) { /* silent */ } }, [pwId, sec?.id]);
  const ask = (m: string) => onAsk && onAsk(m);
  const order = useMemo(() => intelOrder(pw), [pwId]);
  const switchPathway = (id: string) => { setPwId(id); const np = getDevicePathway(id); setActiveSec(np.sections[0].id); setOpenAcc('readiness'); };
  const onSec = (s: any) => { setActiveSec(s.id); if (s.tab && INTEL[s.tab]) { setDock('intel'); setOpenAcc(s.tab); } };
  return (
    <div className="dv-wrap">
      <div className="dv-head">
        <div className="dv-head-l">
          <span className="pd-kind">{pw.full} {'·'} {pw.agency}</span>
          <div className="pd-titrow"><h1 className="pd-title">{pw.device.name}</h1><span className="pd-short">{pw.device.className}{pw.device.code && pw.device.code !== '—' ? (' · ' + pw.device.code) : ''}</span></div>
          <div className="pd-subrow"><span>{pw.region}</span><span className="pd-dot" /><span>{pw.device.kind}</span></div>
        </div>
        <div className="pd-head-r"><span className="pd-autosave"><span className="pd-autosave-dot" />Autosaved {'·'} v{pw.version} {'·'} {pw.updated}</span></div>
      </div>
      <div className="dv-pathways">{DV.order.map((id: string) => { const p = DV.pathways[id]; return (
        <button key={id} className={'dv-path' + (pwId === id ? ' on' : '')} onClick={() => switchPathway(id)}><span className="dv-path-l">{p.label}</span><span className="dv-path-region">{p.agency}</span></button>
      ); })}</div>
      <div className="dv-grid">
        <Tree pw={pw} activeSec={activeSec} onSec={onSec} />
        <DocumentPage pw={pw} sec={sec} onAsk={ask} />
        <div className="dv-dock">
          <div className="dv-dock-tabs">
            <button className={'dv-dock-tab' + (dock === 'intel' ? ' on' : '')} onClick={() => setDock('intel')}>Intelligence</button>
            <button className={'dv-dock-tab' + (dock === 'ana' ? ' on' : '')} onClick={() => setDock('ana')}>AnA co-author</button>
          </div>
          {dock === 'ana' ? <CoAuthor pw={pw} sec={sec} onAsk={ask} /> : <div className="dv-dock-scroll">
            <DeviceAcc id="readiness" title="Submission readiness" icon="fileCheck" open={openAcc === 'readiness'} onToggle={() => setOpenAcc(openAcc === 'readiness' ? null : 'readiness')} badge={pw.readiness + '%'}><IntelReadiness pw={pw} /></DeviceAcc>
            {order.map((k: string) => { const meta = INTEL[k]; const C = meta.C; return (
              <DeviceAcc key={k} id={k} title={meta.title} icon={meta.icon} open={openAcc === k} onToggle={() => setOpenAcc(openAcc === k ? null : k)}><C pw={pw} onGov={setGov} /></DeviceAcc>
            ); })}
          </div>}
        </div>
      </div>
      <GovernedActionDialog open={!!gov} onClose={() => setGov(null)} onConfirm={() => {}} {...(gov || {})} />
    </div>
  );
}
export function DeviceIntelPanel({ dvId, onAsk }: { dvId: string; onAsk?: (m: string) => void }) {
  const pw = getDevicePathway(dvId);
  const [openAcc, setOpenAcc] = useState<string | null>('readiness');
  const [gov, setGov] = useState<any>(null);
  const order = useMemo(() => intelOrder(pw), [dvId]);
  return (
    <div className="dv-dock dv-dock-embed">
      <div className="dv-dock-scroll">
        <DeviceAcc id="readiness" title="Submission readiness" icon="fileCheck" open={openAcc === 'readiness'} onToggle={() => setOpenAcc(openAcc === 'readiness' ? null : 'readiness')} badge={pw.readiness + '%'}><IntelReadiness pw={pw} /></DeviceAcc>
        {order.map((k: string) => { const meta = INTEL[k]; const C = meta.C; return (
          <DeviceAcc key={k} id={k} title={meta.title} icon={meta.icon} open={openAcc === k} onToggle={() => setOpenAcc(openAcc === k ? null : k)}><C pw={pw} onGov={setGov} /></DeviceAcc>
        ); })}
      </div>
      <GovernedActionDialog open={!!gov} onClose={() => setGov(null)} onConfirm={() => {}} {...(gov || {})} />
    </div>
  );
}
