/* DeviceSubmission.tsx -- Device submission hub and remaining intel panels.
   Ported from design kit device-sub.jsx. */
import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { DV, DV_CAPA, DV_INSPECTION, DV_PCCP, getDevicePathway } from '../fixtures/device-data';
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
        <div className="tb-detail-f" style={{ marginTop: 14 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { onConfirm(); onClose(); }}>{I.check} Confirm</button>
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
function IntelHumanFactors({ pw }: { pw: any }) {
  const h = pw.humanfactors; if (!h) return null;
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{h.framework} {'·'} HFE/UE file</div>
      <div className="dv-gspr-bar"><span className="dv-gspr-seg" style={{ flex: h.completeness }} data-tone={h.completeness >= 75 ? 'ok' : 'warn'}>{h.completeness}%</span><span className="dv-gspr-seg" style={{ flex: 100 - h.completeness }} data-tone="idle" /></div>
      {h.elements.map((el: any, i: number) => <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={el.have}>{el.have ? '✓' : '•'}</span><span>{el.k}</span></div>)}
      <div className="dv-mini-sub">Use-related critical tasks</div>
      {h.critical.map((c: any, i: number) => (
        <div key={i} className="dv-rsim-f" data-sev={c.mitigated ? 'minor' : 'major'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={c.sev === 'critical' ? 'err' : 'warn'}>{c.sev}</span><span className="dv-rsim-area">{c.task}</span><span className="pg-badge" data-tone={c.mitigated ? 'ok' : 'err'}>{c.mitigated ? 'mitigated' : 'open'}</span></div>
          <div className="dv-rsim-txt">Use error: {c.error}</div>
        </div>
      ))}
      <p className="dv-mini-note">{h.residualAcceptable ? 'Residual use-related risk acceptable — all critical tasks mitigated.' : 'Residual risk NOT acceptable — unmitigated critical task(s) must be closed before summative testing.'}</p>
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
function IntelCapa() {
  const D = DV_CAPA; if (!D) return null;
  const ht: Record<string, string> = { none: 'idle', malfunction: 'warn', injury: 'warn', serious_injury: 'err', death: 'err' };
  const st: Record<string, string> = { new: 'idle', triaged: 'ai', investigation: 'warn', escalated_mdr: 'err', escalated_capa: 'warn', resolved: 'ok', closed: 'ok' };
  const ct: Record<string, string> = { open: 'idle', investigation: 'warn', action_planned: 'ai', action_implemented: 'ai', effectiveness_check: 'warn', closed_effective: 'ok', closed_not_effective: 'err', escalated: 'err' };
  const at: Record<string, string> = { planned: 'idle', in_progress: 'ai', done: 'ok', blocked: 'err', cancelled: 'idle' };
  const mt: Record<string, string> = { open: 'idle', preparing: 'warn', filed: 'ok', acknowledged: 'ok', followup_required: 'warn', closed: 'ok' };
  const [_open, _setOpen] = useState<string | null>('mdr');
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>MDR events ({D.mdrEvents.length}){D.mdrEvents.some((e: any) => e.state === 'preparing') && <span className="pg-badge" data-tone="err"><Ic n="alertTriangle" /> Clock running</span>}</div>
      {D.mdrEvents.map((e: any, i: number) => {
        const u = e.euDaysRemaining !== null && e.euDaysRemaining <= 2;
        return (<div key={i} className="dv-rsim-f" data-sev={u ? 'critical' : 'minor'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={mt[e.state] || 'idle'}>{e.code}</span><span className="dv-mini-note" style={{ flex: 1 }}>{e.jurisdiction === 'both' ? 'FDA + EU MDR' : e.jurisdiction === 'us_fda' ? 'FDA 803' : 'EU MDR 87'}</span><span className="pg-badge" data-tone={mt[e.state] || 'idle'}>{e.state.replace(/_/g, ' ')}</span></div>
          {e.fdaDaysRemaining !== null && <div className="dv-rsim-fix"><b>FDA 30-day: </b>{e.fdaDaysRemaining} days remaining {'·'} due {e.fdaDueAt}</div>}
          {e.euDaysRemaining !== null && <div className="dv-rsim-fix" style={u ? { color: 'var(--error)' } : undefined}><b>EU MDR 10-day: </b>{e.euDaysRemaining} day{e.euDaysRemaining === 1 ? '' : 's'} remaining {'·'} due {e.euDueAt}{u ? ' — ACTION REQUIRED' : ''}</div>}
          {e.reportFiledAt && <div className="dv-rsim-fix"><b>Filed: </b>{e.reportFiledAt} {'·'} Report# {e.fdaReportNumber}</div>}
          <div className="dv-mini-note" style={{ marginTop: 3 }}>{e.narrative}</div>
        </div>);
      })}
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>Complaints ({D.complaints.length}) — triage queue</div>
      {D.complaints.map((c: any, i: number) => (
        <div key={i} className="dv-rsim-f" data-sev={c.severity === 'serious' ? 'major' : c.severity === 'negligible' ? 'ok' : 'minor'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={ht[c.harm] || 'idle'}>{c.harm.replace(/_/g, ' ')}</span><span className="dv-mini-note" style={{ flex: 1 }}>{c.code} {'·'} {c.source.replace(/_/g, ' ')}</span><span className="pg-badge" data-tone={st[c.state] || 'idle'}>{c.state.replace(/_/g, ' ')}</span></div>
          <div className="dv-mini-note">{c.narrative}</div>
          {c.linkedMdr && <div className="dv-rsim-fix"><b>{'→'} MDR: </b>{c.linkedMdr}</div>}
          {c.linkedCapa && <div className="dv-rsim-fix"><b>{'→'} CAPA: </b>{c.linkedCapa}</div>}
        </div>
      ))}
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>CAPA records ({D.capas.length})</div>
      {D.capas.map((c: any, i: number) => (
        <div key={i} className="dv-rsim-f" data-sev={c.risk === 'high' ? 'critical' : c.risk === 'medium' ? 'major' : 'minor'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone="idle">{c.code}</span><span className="dv-mini-note" style={{ flex: 1 }}>{c.type} {'·'} risk: {c.risk}</span><span className="pg-badge" data-tone={ct[c.state] || 'idle'}>{c.state.replace(/_/g, ' ')}</span></div>
          <div className="dv-rsim-txt">{c.title}</div>
          <div className="dv-mini-note">Owner: {c.assignedTo} {'·'} Due: {c.targetClose}</div>
          <div className="dv-mini-note" style={{ marginTop: 3 }}>Root cause: {c.rootCause}</div>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>{c.actions.map((a: any, j: number) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span className="pg-badge" data-tone={at[a.state] || 'idle'} style={{ minWidth: 22, textAlign: 'center' as const }}>{a.state === 'done' ? '✓' : a.state === 'in_progress' ? '…' : '–'}</span>
              <span style={{ flex: 1 }}>{a.type.replace(/_/g, ' ')}: {a.desc}</span>
              {a.completedAt ? <span style={{ color: 'var(--success)', fontSize: 10 }}>{a.completedAt}</span> : <span style={{ color: 'var(--text-400)', fontSize: 10 }}>due {a.due}</span>}
            </div>
          ))}</div>
        </div>
      ))}
    </div>
  );
}
function IntelInspection() {
  const D = DV_INSPECTION; if (!D) return null;
  const oT: Record<string, string> = { pending: 'idle', nai: 'ok', vai: 'warn', oai: 'err' };
  const oL: Record<string, string> = { pending: 'Pending', nai: 'NAI', vai: 'VAI', oai: 'OAI' };
  const fT: Record<string, string> = { critical: 'err', major: 'warn', minor: 'ai', observation: 'idle' };
  const rT: Record<string, string> = { ready: 'ok', in_progress: 'ai', at_risk: 'err', not_started: 'idle' };
  return (
    <div className="dv-mini">{D.inspections.map((ins: any, i: number) => (
      <div key={i} style={{ marginBottom: i < D.inspections.length - 1 ? 14 : 0 }}>
        <div className="dv-mini-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {ins.type.toUpperCase()} {'·'} {ins.agency.toUpperCase()}
          <span className="pg-badge" data-tone={ins.status === 'scheduled' ? 'ai' : ins.status === 'completed' ? 'ok' : 'idle'}>{ins.status}</span>
          {ins.outcome !== 'pending' && <span className="pg-badge" data-tone={oT[ins.outcome]}>{oL[ins.outcome]}</span>}
        </div>
        <div className="dv-mini-note">{ins.site}</div>
        {ins.scheduledDate && <div className="dv-mini-mfg"><Ic n="calendar" /><span>Scheduled: {ins.scheduledDate}</span></div>}
        {ins.startDate && <div className="dv-mini-note">Held: {ins.startDate} – {ins.endDate}</div>}
        {ins.readiness.length > 0 && <div>
          <div className="dv-mini-sub" style={{ marginTop: 8 }}>Readiness assessment ({ins.readiness.length} areas)</div>
          {ins.readiness.map((r: any, j: number) => (
            <div key={j} className="dv-rsim-f" data-sev={r.status === 'at_risk' ? 'critical' : r.status === 'in_progress' ? 'minor' : 'ok'}>
              <div className="dv-rsim-fh"><span className="pg-badge" data-tone={rT[r.status] || 'idle'}>{r.status.replace(/_/g, ' ')}</span><span className="dv-rsim-area">{r.area}</span></div>
              {r.gaps && <div className="dv-rsim-fix" style={{ color: 'var(--error)' }}>{r.gaps}</div>}
            </div>
          ))}
        </div>}
        {ins.findings.length > 0 && <div>
          <div className="dv-mini-sub" style={{ marginTop: 8 }}>Form FDA 483 findings ({ins.findings.length}){ins.findings.some((f: any) => f.status === 'open') && <span className="pg-badge" data-tone="err" style={{ marginLeft: 6 }}>{ins.findings.filter((f: any) => f.status === 'open').length} open</span>}</div>
          {ins.findings.map((f: any, j: number) => (
            <div key={j} className="dv-rsim-f" data-sev={f.classification === 'critical' ? 'critical' : f.classification === 'major' ? 'major' : 'minor'}>
              <div className="dv-rsim-fh"><span className="pg-badge" data-tone={fT[f.classification] || 'idle'}>{f.classification}</span><span className="dv-mini-note" style={{ flex: 1 }}>Obs. {f.num}</span><span className="pg-badge" data-tone={f.status === 'responded' ? 'ok' : 'err'}>{f.status}</span></div>
              <div className="dv-rsim-txt">{f.desc}</div>
              <div className="dv-rsim-fix"><b>Response due: </b>{f.responseDue}{f.responseFiled ? ' · filed ' + f.responseFiled : <span style={{ color: 'var(--error)' }}> — not yet filed</span>}</div>
            </div>
          ))}
        </div>}
      </div>
    ))}</div>
  );
}
function IntelPccp() {
  const P = DV_PCCP; if (!P) return null;
  const pl = P.plan;
  const MT: Record<string, string> = { algorithm_update: 'Algorithm update', retraining: 'Retraining', input_data_change: 'Input data', output_format_change: 'Output format', performance_threshold_change: 'Perf threshold', ui_change: 'UI change', hardware_dependency: 'Hardware', other: 'Other' };
  const MO: Record<string, string> = { accepted: 'ok', draft: 'idle', proposed: 'warn', rejected: 'err', superseded: 'idle' };
  const c2d = pl.component2_elements.filter((e: any) => e.have).length;
  const c3d = pl.component3_elements.filter((e: any) => e.have).length;
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{pl.code} v{pl.version} {'·'} {pl.guidanceVersion}</div>
      <div className="dv-mini-mfg"><span className="pg-badge" data-tone={pl.status === 'approved' ? 'ok' : pl.status === 'under_review' ? 'warn' : 'idle'}>{pl.status.replace(/_/g, ' ')}</span></div>
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>3 Required PCCP components (FDA 2025 final guidance)</div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'✓'}</span><span>Component 1 — Description of modifications: complete</span></div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={c2d === pl.component2_elements.length}>{c2d}/{pl.component2_elements.length}</span><span>Component 2 — Modification protocol</span></div>
      {pl.component2_elements.filter((e: any) => !e.have).map((e: any, i: number) => <div key={i} className="dv-mini-note" style={{ paddingLeft: 24, color: 'var(--warning)' }}>{'• ' + e.k + ' — missing'}</div>)}
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={c3d === pl.component3_elements.length}>{c3d}/{pl.component3_elements.length}</span><span>Component 3 — Impact assessment</span></div>
      {pl.component3_elements.filter((e: any) => !e.have).map((e: any, i: number) => <div key={i} className="dv-mini-note" style={{ paddingLeft: 24, color: 'var(--warning)' }}>{'• ' + e.k + ' — missing'}</div>)}
      <div className="dv-mini-sub" style={{ marginTop: 12 }}>Anticipated modifications ({P.modifications.length})</div>
      {P.modifications.map((m: any, i: number) => (
        <div key={i} className="dv-rsim-f" data-sev={m.status === 'accepted' ? 'ok' : 'minor'}>
          <div className="dv-rsim-fh"><span className="pg-badge" data-tone={MO[m.status] || 'idle'}>{m.code}</span><span className="dv-mini-note" style={{ flex: 1 }}>{MT[m.type] || m.type}</span><span className="pg-badge" data-tone={MO[m.status] || 'idle'}>{m.status}</span></div>
          <div className="dv-rsim-txt">{m.title}</div><div className="dv-mini-note">{m.boundary}</div>
          {m.metric !== 'N/A' && m.threshold && <div className="dv-rsim-fix"><b>Threshold: </b>{m.metric} {m.comparator} {m.threshold} on {m.testSet}</div>}
          <div className="dv-rsim-fix"><b>Rollback: </b>{m.rollback}</div>
          {m.labelingImpact && <div className="dv-rsim-fix"><b>Labeling: </b>{m.labelingImpact}</div>}
        </div>
      ))}
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
  humanfactors: { title: 'Human factors (62366)', icon: 'user', C: IntelHumanFactors, has: pw => !!pw.humanfactors },
  registration: { title: 'Registration and listing', icon: 'fileCheck', C: IntelRegistration, has: pw => !!pw.registration },
  pccp: { title: 'AI/ML PCCP (FDA 2025)', icon: 'settings', C: IntelPccp, has: () => !!DV_PCCP },
  capa: { title: 'CAPA and MDR vigilance', icon: 'alertTriangle', C: IntelCapa, has: () => !!DV_CAPA },
  inspection: { title: 'Inspection readiness', icon: 'shieldCheck', C: IntelInspection, has: () => !!DV_INSPECTION },
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
