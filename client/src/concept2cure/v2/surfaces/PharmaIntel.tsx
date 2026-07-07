import React, { useState, useMemo } from 'react';

/* ── Types ── */
interface ShadowFinding {
  dim: string;
  sev: string;
  title: string;
  detail?: string;
  basis?: string;
  fix?: string;
}

interface ShadowReview {
  pathway: string;
  lens: string;
  rtfRiskScore: number;
  crlRiskScore: number;
  summary: string;
  findings: ShadowFinding[];
}

interface BiostatsFragility {
  level: string;
  score: number;
  dependencies: string[];
}

interface BiostatsRisk {
  sev: string;
  type: string;
  desc: string;
  fix?: string;
}

interface BiostatsJudgment {
  study: string;
  phase: string;
  type: string;
  sampleSize: number;
  endpoint: string;
  method: string;
  powerClass: string;
  fragility?: BiostatsFragility;
  defensibility: string;
  powerRationale?: string[];
  risks?: BiostatsRisk[];
  sapComplete: boolean;
  sapElements: { have: boolean; k: string }[];
}

interface ATMPVector {
  name: string;
  immunogenicityRisk: string;
  insertionalMutagenesisRisk: string;
}

interface ATMPData {
  expedited: string[];
  euBasis: string;
  usReviewDiv: string;
  usBasis: string;
  japanClass: string;
  japanPathway: string;
  vector: ATMPVector;
  ltfu: { years: number; rationale: string };
  cmcRequirements: string[];
  clinicalRequirements: string[];
  gmpFocusAreas: string[];
}

interface INDInvestigator {
  name: string;
  site: string;
  irb: string;
  form1572Complete: boolean;
  missing?: string;
  subIs?: string[];
}

interface INDFormData {
  form1571: {
    indNumber: string;
    phase: string;
    status: string;
    sponsor: string;
    division: string;
    submissionDate: string;
    annualReportDue: string;
  };
  sponsor: { name: string; address: string; duns: string; signatory: string };
  investigators: INDInvestigator[];
  usAgent: null | unknown;
}
interface CMCOSSection {
  state: string;
  stale: boolean;
  staleReason?: string;
  key: string;
  path: string;
}

interface CMCOSData {
  sections: CMCOSSection[];
  contradictions: { sev: string; type: string; details: string; sections: string[] }[];
}

interface PharmaData {
  shadow?: ShadowReview;
  biostats?: BiostatsJudgment;
  atmpData?: ATMPData;
  formData?: INDFormData;
}
interface RiskBarProps {
  label: string;
  score: number;
  tone?: string;
}
interface ChipProps {
  tone: string;
  children: React.ReactNode;
}
interface PharmaAccProps {
  title: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  badge?: string | number | null;
  children: React.ReactNode;
}

interface PharmaIntelPanelProps {
  pid: string;
  onAsk?: (q: string) => void;
}

/* ── Tone / label maps ── */

const DIM_TONE: Record<string, string> = { rtf: 'err', crl: 'warn', format: 'idle', nb: 'ai' };
const DIM_LABEL: Record<string, string> = { rtf: 'RTF', crl: 'CRL', format: 'Format', nb: 'NB' };
const SEV_TONE: Record<string, string> = { critical: 'err', major: 'warn', minor: 'idle', info: 'idle', informational: 'idle' };
const POWER_TONE: Record<string, string> = { adequate: 'ok', marginal: 'warn', underpowered: 'err', indeterminate: 'idle' };
const FRAG_TONE: Record<string, string> = { low: 'ok', moderate: 'warn', high: 'err' };
const DEF_TONE: Record<string, string> = { appropriate: 'ok', acceptable_with_caveats: 'warn', vulnerable: 'err', poorly_matched: 'err' };
const DEF_LABEL: Record<string, string> = { appropriate: 'Appropriate', acceptable_with_caveats: 'Acceptable w/ caveats', vulnerable: 'Vulnerable', poorly_matched: 'Poorly matched' };
const RISK_LABEL: Record<string, string> = { underpower_risk: 'Underpower', assumption_fragility: 'Assumption fragility', endpoint_method_mismatch: 'Method mismatch', attrition_sensitivity: 'Attrition sensitivity', overinterpretation_risk: 'Overinterpretation', precision_instability: 'Precision instability', multiplicity_risk: 'Multiplicity', missing_data_risk: 'Missing data' };
const LENS_LABEL: Record<string, string> = { fda_filing: 'FDA filing', ema_d120: 'EMA D120', pmda: 'PMDA', nb_mdr: 'NB MDR', nb_ivdr: 'NB IVDR' };

/* ── Subcomponents ── */

function RiskBar({ label, score, tone }: RiskBarProps) {
  const t = score >= 0.7 ? 'err' : score >= 0.4 ? 'warn' : 'ok';
  return (
    <div className="ph-risk-row">
      <span className="ph-risk-label">{label}</span>
      <div className="ph-risk-bar">
        <div className="ph-risk-fill" data-tone={tone || t} style={{ width: Math.round(score * 100) + '%' }} />
      </div>
      <span className="ph-risk-val" data-tone={tone || t}>{Math.round(score * 100)}%</span>
    </div>
  );
}

function Chip({ tone, children }: ChipProps) {
  return <span className="pg-badge" data-tone={tone}>{children}</span>;
}

function PharmaAcc({ title, icon, open, onToggle, badge, children }: PharmaAccProps) {
  return (
    <div className={'dv-acc' + (open ? ' open' : '')}>
      <button className="dv-acc-h" onClick={onToggle}>
        <span className="dv-acc-ic">{icon}</span>
        <span className="dv-acc-t">{title}</span>
        {badge != null && <span className="dv-acc-badge">{badge}</span>}
        <span className="dv-acc-chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="dv-acc-body">{children}</div>}
    </div>
  );
}

/* ── Shadow Review Panel ── */

function ShadowPanel({ data }: { data: PharmaData }) {
  if (!data || !data.shadow) return (
    <div className="dv-mini">
      <p className="dv-mini-note">Shadow review not available for this pathway.</p>
    </div>
  );
  const s = data.shadow;
  const lensLabel = LENS_LABEL[s.lens] || s.lens;
  return (
    <div className="dv-mini">
      <div className="ph-shadow-head">
        <span className="ph-pathway-chip">{s.pathway}</span>
        <span className="ph-lens-chip">{lensLabel}</span>
        <div className="ph-risk-bars">
          <RiskBar label="RTF risk" score={s.rtfRiskScore} />
          <RiskBar label="CRL risk" score={s.crlRiskScore} />
        </div>
      </div>
      <p className="dv-mini-note" style={{ marginBottom: 8 }}>{s.summary}</p>
      {s.findings.map((f, i) => (
        <div key={i} className="dv-rsim-f" data-sev={f.sev}>
          <div className="dv-rsim-fh">
            <Chip tone={DIM_TONE[f.dim] || 'idle'}>{DIM_LABEL[f.dim] || f.dim}</Chip>
            <Chip tone={SEV_TONE[f.sev] || 'idle'}>{f.sev}</Chip>
            <span className="dv-rsim-area">{f.title}</span>
          </div>
          {f.detail && <div className="dv-rsim-txt">{f.detail}</div>}
          {f.basis && <div className="dv-rsim-fix"><b>Basis: </b>{f.basis}</div>}
          {f.fix && <div className="dv-rsim-fix"><b>Fix: </b>{f.fix}</div>}
        </div>
      ))}
      <div className="dv-mini-note" style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 5 }}>
        {'RTF risk = administrative/format gate (refuse to file). CRL risk = substantive (complete response). Deterministic aggregate: critical finding → 1.0.'}
      </div>
    </div>
  );
}

/* ── Biostatistics Judgment Panel ── */

function BiostatsPanel({ data }: { data: PharmaData }) {
  if (!data || !data.biostats) return (
    <div className="dv-mini">
      <p className="dv-mini-note">Biostatistics judgment not available for this pathway.</p>
    </div>
  );
  const b = data.biostats;
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">{b.study}</div>
      <div className="ph-biostats-meta">
        <span className="pd-chip">Phase {b.phase}</span>
        <span className="pd-chip">{b.type.replace(/_/g, ' ')}</span>
        <span className="pd-chip">n={b.sampleSize}</span>
      </div>
      <div className="dv-mini-note">{b.endpoint} {'·'} {b.method}</div>
      <div className="ph-biostats-badges">
        <div>
          <div className="dv-mini-sub" style={{ marginBottom: 3 }}>Power</div>
          <Chip tone={POWER_TONE[b.powerClass] || 'idle'}>{b.powerClass.replace(/_/g, ' ')}</Chip>
        </div>
        {b.fragility && (
          <div>
            <div className="dv-mini-sub" style={{ marginBottom: 3 }}>Fragility</div>
            <Chip tone={FRAG_TONE[b.fragility.level] || 'idle'}>{b.fragility.level} ({b.fragility.score})</Chip>
          </div>
        )}
        <div>
          <div className="dv-mini-sub" style={{ marginBottom: 3 }}>Defensibility</div>
          <Chip tone={DEF_TONE[b.defensibility] || 'idle'}>{DEF_LABEL[b.defensibility] || b.defensibility}</Chip>
        </div>
      </div>
      {b.powerRationale && (
        <div>
          <div className="dv-mini-sub" style={{ marginTop: 8 }}>Power rationale</div>
          {b.powerRationale.map((r, i) => (
            <div key={i} className="dv-mini-mfg">
              <span className="dv-mini-tk" data-ok={true}>{'✓'}</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
      {b.fragility && b.fragility.dependencies.length > 0 && (
        <div>
          <div className="dv-mini-sub" style={{ marginTop: 8 }}>Assumption dependencies</div>
          {b.fragility.dependencies.map((d, i) => (
            <div key={i} className="dv-mini-mfg">
              <span className="dv-mini-tk" data-ok={false}>{'•'}</span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}
      {b.risks && b.risks.length > 0 && (
        <div>
          <div className="dv-mini-sub" style={{ marginTop: 8 }}>Statistical risks</div>
          {b.risks.map((r, i) => (
            <div key={i} className="dv-rsim-f" data-sev={r.sev}>
              <div className="dv-rsim-fh">
                <Chip tone={SEV_TONE[r.sev] || 'idle'}>{r.sev}</Chip>
                <span className="dv-rsim-area">{RISK_LABEL[r.type] || r.type}</span>
              </div>
              <div className="dv-rsim-txt">{r.desc}</div>
              {r.fix && <div className="dv-rsim-fix"><b>Action: </b>{r.fix}</div>}
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="dv-mini-sub" style={{ marginTop: 8 }}>
          Statistical Analysis Plan{' '}
          <Chip tone={b.sapComplete ? 'ok' : 'warn'}>{b.sapComplete ? 'Complete' : 'Incomplete'}</Chip>
        </div>
        {b.sapElements.map((el, i) => (
          <div key={i} className="dv-mini-mfg">
            <span className="dv-mini-tk" data-ok={el.have}>{el.have ? '✓' : '•'}</span>
            <span>{el.k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── IND Assembly Panel (Form 1571 + 1572) ── */

function INDAssemblyPanel({ data }: { data: PharmaData }) {
  if (!data || !data.formData) return (
    <div className="dv-mini">
      <p className="dv-mini-note">IND master-data not available for this pathway.</p>
    </div>
  );
  const fd = data.formData;
  const f71 = fd.form1571;
  const sp = fd.sponsor;
  const inv = fd.investigators || [];
  const allComplete = inv.every(i => i.form1572Complete);
  return (
    <div className="dv-mini">
      <div className="dv-mini-sub">Form FDA 1571 {'—'} IND cover sheet</div>
      <div className="ph-biostats-meta">
        <span className="pd-chip">{f71.indNumber}</span>
        <span className="pd-chip">{f71.phase}</span>
        <span className="pg-badge" data-tone="ok">{f71.status}</span>
      </div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'✓'}</span><span>Sponsor: {f71.sponsor}</span></div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'✓'}</span><span>Division: {f71.division}</span></div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'✓'}</span><span>Submission date: {f71.submissionDate}</span></div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={false}>!</span><span style={{ color: 'var(--warning)' }}>Annual report due: {f71.annualReportDue}</span></div>
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>Sponsor registry (21 CFR 312.3)</div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'✓'}</span><span>{sp.name}</span></div>
      <div className="dv-mini-note">{sp.address}</div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={!!sp.duns}>{'✓'}</span><span>DUNS: {sp.duns}</span></div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'✓'}</span><span>Signatory: {sp.signatory}</span></div>
      {fd.usAgent === null && <div className="dv-mini-note" style={{ color: 'var(--text-400)' }}>US-based sponsor {'—'} no US agent (21 CFR 312.3) required.</div>}
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>
        Form FDA 1572 {'—'} Investigators ({inv.length}){' '}
        <span className="pg-badge" data-tone={allComplete ? 'ok' : 'warn'}>{allComplete ? 'All complete' : (inv.filter(i => i.form1572Complete).length + '/' + inv.length + ' complete')}</span>
      </div>
      {inv.map((inv_, i) => (
        <div key={i} className="dv-rsim-f" data-sev={inv_.form1572Complete ? 'ok' : 'minor'}>
          <div className="dv-rsim-fh">
            <span className="pg-badge" data-tone={inv_.form1572Complete ? 'ok' : 'warn'}>{inv_.form1572Complete ? '✓ Complete' : 'Incomplete'}</span>
            <span className="dv-rsim-area">{inv_.name}</span>
          </div>
          <div className="dv-mini-note">{inv_.site}</div>
          <div className="dv-mini-note">IRB: {inv_.irb}</div>
          {!inv_.form1572Complete && inv_.missing && <div className="dv-rsim-fix" style={{ color: 'var(--warning)' }}><b>Gap: </b>{inv_.missing}</div>}
          {inv_.subIs && inv_.subIs.length > 0 && <div className="dv-mini-note">Sub-investigators: {inv_.subIs.join(', ')}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── ATMP / Gene & Cell Therapy Panel ── */

function ATMPPanel({ data }: { data: PharmaData }) {
  if (!data || !data.atmpData) return null;
  const a = data.atmpData;
  const riskTone: Record<string, string> = { low: 'ok', moderate: 'warn', high: 'err', very_high: 'err' };
  return (
    <div className="dv-mini">
      <div className="ph-biostats-meta">
        {a.expedited.map((e, i) => <span key={i} className="pd-chip">{e}</span>)}
      </div>
      <div className="dv-mini-sub" style={{ marginTop: 8 }}>Classification</div>
      <div className="dv-rsim-f" data-sev="ok">
        <div className="dv-rsim-fh"><span className="pg-badge" data-tone="ai">EU</span><span className="dv-rsim-area">GTMP {'—'} Committee for Advanced Therapies (CAT)</span></div>
        <div className="dv-mini-note">{a.euBasis}</div>
        <div className="dv-rsim-fix"><b>CAT opinion required {'·'} Centralised procedure mandatory</b></div>
      </div>
      <div className="dv-rsim-f" data-sev="ok" style={{ marginTop: 4 }}>
        <div className="dv-rsim-fh"><span className="pg-badge" data-tone="warn">US</span><span className="dv-rsim-area">{a.usReviewDiv}</span></div>
        <div className="dv-mini-note">{a.usBasis}</div>
      </div>
      <div className="dv-rsim-f" data-sev="ok" style={{ marginTop: 4 }}>
        <div className="dv-rsim-fh"><span className="pg-badge" data-tone="idle">JP</span><span className="dv-rsim-area">{a.japanClass}</span></div>
        <div className="dv-mini-note">{a.japanPathway}</div>
      </div>
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>Vector profile {'·'} {a.vector.name}</div>
      <div className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={false}>{'⚠'}</span><span>Integrating {'—'} LTFU {a.ltfu.years} years (FDA Guidance 2020)</span></div>
      <div className="dv-mini-mfg"><span className="pg-badge" data-tone={riskTone[a.vector.immunogenicityRisk]}>{a.vector.immunogenicityRisk}</span><span> immunogenicity risk</span></div>
      <div className="dv-mini-mfg"><span className="pg-badge" data-tone={riskTone[a.vector.insertionalMutagenesisRisk]}>{a.vector.insertionalMutagenesisRisk}</span><span> insertional mutagenesis risk</span></div>
      <div className="dv-mini-note" style={{ marginTop: 3 }}>{a.ltfu.rationale}</div>
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>CMC requirements ({a.cmcRequirements.length})</div>
      {a.cmcRequirements.map((r, i) => (
        <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'·'}</span><span className="dv-mini-note" style={{ flex: 1 }}>{r}</span></div>
      ))}
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>Clinical requirements (key items)</div>
      {a.clinicalRequirements.slice(0, 5).map((r, i) => (
        <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={true}>{'·'}</span><span className="dv-mini-note" style={{ flex: 1 }}>{r}</span></div>
      ))}
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>GMP focus areas</div>
      {a.gmpFocusAreas.map((r, i) => (
        <div key={i} className="dv-mini-mfg"><span className="dv-mini-tk" data-ok={false}>{'⚑'}</span><span className="dv-mini-note" style={{ flex: 1 }}>{r}</span></div>
      ))}
    </div>
  );
}

/* ── CMC Module 3 OS Panel ── */

function CMCOSPanel() {
  const C = (window as any).CMC_OS as CMCOSData | undefined;
  if (!C) return null;
  const approved = C.sections.filter(s => s.state === 'approved' && !s.stale).length;
  const stale = C.sections.filter(s => s.stale).length;
  const draft = C.sections.filter(s => s.state === 'draft').length;
  const sevTone: Record<string, string> = { high: 'err', medium: 'warn', low: 'ai', critical: 'err' };
  return (
    <div className="dv-mini">
      <div className="ph-biostats-meta">
        <span className="pd-chip">{approved}/{C.sections.length} approved</span>
        {stale > 0 && <span className="pd-chip" data-tone="err">{stale} stale</span>}
        {draft > 0 && <span className="pd-chip">{draft} draft</span>}
      </div>
      {C.contradictions.length > 0 && (
        <div>
          <div className="dv-mini-sub" style={{ marginTop: 8 }}>Contradictions detected ({C.contradictions.length})</div>
          {C.contradictions.map((c, i) => (
            <div key={i} className="dv-rsim-f" data-sev={c.sev === 'high' ? 'critical' : c.sev === 'medium' ? 'major' : 'minor'}>
              <div className="dv-rsim-fh">
                <span className="pg-badge" data-tone={sevTone[c.sev]}>{c.sev}</span>
                <span className="dv-mini-note" style={{ flex: 1 }}>{c.type.replace(/_/g, ' ')}</span>
              </div>
              <div className="dv-rsim-txt">{c.details}</div>
              <div className="dv-mini-note">Sections: {c.sections.join(', ')}</div>
            </div>
          ))}
        </div>
      )}
      <div className="dv-mini-sub" style={{ marginTop: 10 }}>Module 3 sections</div>
      {C.sections.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
          <span className="pg-badge" data-tone={s.stale ? 'err' : s.state === 'approved' ? 'ok' : 'idle'} style={{ minWidth: 60, fontSize: 10 }}>{s.stale ? 'STALE' : s.state}</span>
          <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 64, color: 'var(--text-300)' }}>{s.key}</span>
          <span className="dv-mini-note" style={{ flex: 1 }}>{s.path}</span>
          {s.stale && <span title={s.staleReason} style={{ color: 'var(--error)', fontSize: 12, cursor: 'help' }}>{'⚠'}</span>}
        </div>
      ))}
    </div>
  );
}

/* ── Main Panel ── */

export function PharmaIntelPanel({ pid, onAsk }: PharmaIntelPanelProps) {
  const data = useMemo<PharmaData | null>(
    () => (window as any).getPharmaData && (window as any).getPharmaData(pid),
    [pid],
  );
  const [open, setOpen] = useState<string | null>('shadow');
  const isInd = pid === 'ind';
  const isAtmp = pid === 'atmp';
  const hasCmcOs = !!(window as any).CMC_OS && (pid === 'ctd' || pid === 'bla' || pid === 'nda');

  if (!data) return (
    <div className="dv-dock dv-dock-embed">
      <div className="dv-dock-scroll" style={{ padding: 14 }}>
        <p className="dv-mini-note">No shadow review or biostatistics data for pathway &quot;{pid}&quot;. Data available for: BLA (ctd), IND, NDA, MAA.</p>
      </div>
    </div>
  );

  const rtf = data.shadow ? Math.round(data.shadow.rtfRiskScore * 100) : null;
  const cmcOs = (window as any).CMC_OS as CMCOSData | undefined;

  return (
    <div className="dv-dock dv-dock-embed">
      <div className="dv-dock-scroll">
        <PharmaAcc title="Shadow review" icon={'📋'} open={open === 'shadow'} onToggle={() => setOpen(open === 'shadow' ? null : 'shadow')} badge={rtf != null ? (rtf + '% RTF') : null}>
          <ShadowPanel data={data} />
        </PharmaAcc>
        <PharmaAcc title="Biostatistics judgment" icon={'📊'} open={open === 'biostats'} onToggle={() => setOpen(open === 'biostats' ? null : 'biostats')} badge={data.biostats ? data.biostats.powerClass : null}>
          <BiostatsPanel data={data} />
        </PharmaAcc>
        {isAtmp && (
          <PharmaAcc title="ATMP — Gene & Cell Therapy" icon={'🧬'} open={open === 'atmp'} onToggle={() => setOpen(open === 'atmp' ? null : 'atmp')} badge={data.atmpData ? data.atmpData.vector.name : null}>
            <ATMPPanel data={data} />
          </PharmaAcc>
        )}
        {hasCmcOs && (
          <PharmaAcc title="CMC Module 3 OS" icon={'🔬'} open={open === 'cmcos'} onToggle={() => setOpen(open === 'cmcos' ? null : 'cmcos')} badge={cmcOs ? (cmcOs.sections.filter(s => s.stale).length + ' stale') : null}>
            <CMCOSPanel />
          </PharmaAcc>
        )}
        {isInd && (
          <PharmaAcc title="IND assembly (Form 1571 / 1572)" icon={'📝'} open={open === 'ind'} onToggle={() => setOpen(open === 'ind' ? null : 'ind')} badge={data.formData ? data.formData.form1571.indNumber : null}>
            <INDAssemblyPanel data={data} />
          </PharmaAcc>
        )}
      </div>
    </div>
  );
}
