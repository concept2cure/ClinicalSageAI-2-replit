import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';

/* ── Types ── */

export interface LintIssue {
  checker: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  offsetStart?: number;
  offsetEnd?: number;
  ruleId: string;
  phrase?: string;
}

interface DeficiencyPattern {
  id: string;
  title: string;
  signal: string;
  mit: string;
  status: 'present' | 'weak' | 'missing';
  sev: 'critical' | 'major' | 'minor';
}

interface DeficiencyGapResult {
  total: number;
  present: number;
  weak: number;
  missing: number;
  completeness: number;
  criticalOpen?: number;
  patterns: DeficiencyPattern[];
}

interface ReviewersEyeProps {
  getText?: () => string;
  documentClass?: string;
  subType?: string;
  sectionNum?: string | number;
  sectionLabel?: string;
  agency?: string;
  onFix?: (f: LintIssue | { ruleId: string; message: string }) => void;
}

interface LeadInfo {
  tone: string;
  h: React.ReactNode;
  b: React.ReactNode;
}

interface SevMeta {
  l: string;
  tone: string;
  ico: string;
}

/* ── Regex patterns ── */

const RV_CLAIM = [/\bbreakthrough\b/i, /\bguaranteed\b/i, /\b100% safe\b/i, /\bzero risk\b/i];
const RV_HEDGE = [/\bdata on file\b/i, /\bseems to\b/i];
const RV_ABBR = /\b([A-Z]{2,8})\b/g;

/* ── Deterministic linter (verbatim port of concept2cure medical-writing rules) ── */

export function c2cMedicalLint(text: string, documentClass?: string): LintIssue[] {
  const issues: LintIssue[] = [];
  text = typeof text === 'string' ? text : '';

  for (const pattern of RV_CLAIM) {
    const m = pattern.exec(text);
    if (m && m.index !== undefined) issues.push({
      checker: 'concept2cure', severity: 'error',
      message: `Promotional or non-regulatory phrasing detected: "${m[0]}"`,
      offsetStart: m.index, offsetEnd: m.index + m[0].length,
      ruleId: 'C2C_CLAIM_001', phrase: m[0],
    });
  }
  for (const pattern of RV_HEDGE) {
    const m = pattern.exec(text);
    if (m && m.index !== undefined) issues.push({
      checker: 'concept2cure', severity: 'warning',
      message: `Ambiguous phrasing detected: "${m[0]}". Prefer explicit evidence framing.`,
      offsetStart: m.index, offsetEnd: m.index + m[0].length,
      ruleId: 'C2C_HEDGE_001', phrase: m[0],
    });
  }
  const seen = new Set<string>();
  for (const m of [...text.matchAll(RV_ABBR)]) {
    const token = m[1];
    if (seen.has(token)) continue;
    seen.add(token);
    const hasExpansion = new RegExp(`\\b${token}\\b\\s*\\(`).test(text)
      || new RegExp(`\\([^)]*${token}[^)]*\\)`).test(text);
    if (!hasExpansion) issues.push({
      checker: 'concept2cure', severity: 'info',
      message: `Abbreviation "${token}" may require first-use expansion for reviewer clarity.`,
      offsetStart: m.index,
      offsetEnd: m.index !== undefined ? m.index + token.length : undefined,
      ruleId: 'C2C_ABBR_001', phrase: token,
    });
  }

  if (documentClass === '510k') {
    if (!/predicate device/i.test(text)) issues.push({
      checker: 'concept2cure', severity: 'warning',
      message: '510(k) draft should explicitly reference a predicate device comparison section.',
      ruleId: 'C2C_510K_PREDICATE_001',
    });
  } else if (documentClass === 'clinical') {
    if (!/primary endpoint|secondary endpoint/i.test(text)) issues.push({
      checker: 'concept2cure', severity: 'warning',
      message: 'Clinical draft should identify primary/secondary endpoint language.',
      ruleId: 'C2C_CLIN_ENDPOINT_001',
    });
    if (!/intention-to-treat|per-protocol|safety population/i.test(text)) issues.push({
      checker: 'concept2cure', severity: 'info',
      message: 'Clinical draft should identify analysis population (e.g., ITT/per-protocol).',
      ruleId: 'C2C_CLIN_POPULATION_001',
    });
  } else if (documentClass === 'cer') {
    if (!/benefit[-\s]?risk/i.test(text)) issues.push({
      checker: 'concept2cure', severity: 'warning',
      message: 'CER draft should include explicit benefit-risk characterization language.',
      ruleId: 'C2C_CER_BENEFIT_RISK_001',
    });
  }

  const hasPct = /\b\d{1,3}(?:\.\d+)?%/.test(text);
  const hasCi = /confidence interval|\bCI\b/i.test(text);
  if (hasPct && !hasCi) issues.push({
    checker: 'concept2cure', severity: 'warning',
    message: 'Percentage efficacy/safety claims should include CI or statistical uncertainty context.',
    ruleId: 'C2C_STATS_CI_001',
  });

  return issues;
}

/* ── Label / tone maps ── */

const RV_CLASS_LABEL: Record<string, string> = {
  '510k': '510(k)', cer: 'Clinical Evaluation Report', pma: 'PMA',
  clinical: 'Clinical', general: 'General',
};
const RV_CLASS_PILL: Record<string, string> = {
  '510k': '510(k)', cer: 'CER', pma: 'PMA',
  clinical: 'Clinical', general: 'General',
};
const RV_SEV: Record<string, SevMeta> = {
  error:   { l: 'Must fix', tone: 'err',  ico: 'alertTriangle' },
  warning: { l: 'Tighten',  tone: 'warn', ico: 'alertCircle' },
  info:    { l: 'Minor',    tone: 'idle', ico: 'info' },
};

const RV_ARTICLE: Record<string, string> = {
  FDA: 'an', EMA: 'an', MHRA: 'an', EU: 'an', ANVISA: 'an', MFDS: 'an',
  HSA: 'an', PMDA: 'a', TGA: 'a', NMPA: 'a', Swissmedic: 'a', 'Health Canada': 'a',
};

/* ── Component ── */

export function ReviewersEye({
  getText, documentClass, subType, sectionNum, sectionLabel, agency, onFix,
}: ReviewersEyeProps) {
  const cls = documentClass || 'general';
  const [runN, setRunN] = useState(0);
  const [mode, setMode] = useState<'write' | 'risk'>('write');
  const [text, setText] = useState(() => (getText ? getText() : ''));
  useEffect(() => { setText(getText ? getText() : ''); }, [sectionNum, runN]);

  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  const issues = useMemo(() => c2cMedicalLint(text, cls), [text, cls]);
  const abbr = issues.filter(i => i.ruleId === 'C2C_ABBR_001');
  const others = issues.filter(i => i.ruleId !== 'C2C_ABBR_001');
  const oE = others.filter(i => i.severity === 'error').length;
  const oW = others.filter(i => i.severity === 'warning').length;
  const oN = others.filter(i => i.severity === 'info').length;
  const minorCount = oN + (abbr.length ? 1 : 0);
  const units = others.length + (abbr.length ? 1 : 0);
  const clean = issues.length === 0;
  const thin = words < 20;

  const ag = agency || 'FDA';
  const art = RV_ARTICLE[ag] || 'a';
  const Art = art.charAt(0).toUpperCase() + art.slice(1);

  const risk = useMemo<DeficiencyGapResult | null>(
    () => ((window as any).c2cDeficiencyGaps && subType)
      ? (window as any).c2cDeficiencyGaps(text, subType, ag)
      : null,
    [text, subType, ag],
  );

  const riskLead: LeadInfo | null = !risk ? null : (!risk.total
    ? { tone: 'good',
        h: <>No catalogued {ag} deficiency patterns map to this section type.</>,
        b: <>I match your draft against concept2cure{'’'}s deficiency taxonomy for {(subType || '').toUpperCase()} {'·'} {ag}. Nothing in the catalogue applies to {'§'}{sectionNum} {'—'} keep going.</> }
    : risk.missing === 0
    ? { tone: 'good',
        h: <>Your draft already speaks to all {risk.total} things {art} {ag} reviewer looks for here.</>,
        b: <>{risk.present} fully addressed{risk.weak ? `, ${risk.weak} partially` : ''} {'—'} completeness {risk.completeness}%. Strong position going into review.</> }
    : { tone: 'calm',
        h: <>{Art} {ag} reviewer for {(subType || '').toUpperCase()} is likely to challenge <b>{risk.missing}</b> thing{risk.missing > 1 ? 's' : ''} your draft doesn{'’'}t yet address.</>,
        b: <>Coverage {risk.completeness}% {'·'} {risk.present} addressed {'·'} {risk.weak} partial {'·'} {risk.missing} not yet.{risk.criticalOpen ? ` ${risk.criticalOpen} of the open items are critical.` : ''} Preempt them before the review clock starts.</> });

  const lead: LeadInfo = thin
    ? { tone: 'good',
        h: <>Start writing and I{'’'}ll review {'§'}{sectionNum} the way {art} {ag} reviewer will {'—'} as you go.</>,
        b: <>I check promotional phrasing, undefined abbreviations, statistical claims, and the {RV_CLASS_LABEL[cls]} essentials {'—'} deterministic house rules, no AI guesswork.</> }
    : clean
    ? { tone: 'good',
        h: <>Your {'§'}{sectionNum} draft is clean {'—'} nothing {art} {ag} reviewer would flag.</>,
        b: <>I ran {words} words through concept2cure{'’'}s medical-writing rules for a {RV_CLASS_LABEL[cls]} document. Promotional phrasing, abbreviation expansion, and statistical-claim discipline all pass.</> }
    : { tone: 'calm',
        h: <>AnA found <b>{units}</b> thing{units > 1 ? 's' : ''} {art} {ag} reviewer would flag in {'§'}{sectionNum}.</>,
        b: <>{[oE && `${oE} must-fix`, oW && `${oW} to tighten`, minorCount && `${minorCount} minor`].filter(Boolean).join(' · ')} {'—'} each maps to a concept2cure rule. Fix them now and they never reach the review clock.</> };

  const fix = (f: LintIssue | { ruleId: string; message: string }) => onFix && onFix(f);

  return (
    <div className="rv-pane">
      <div className="rv-head">
        <div className="rv-title" title="The checks a regulator's reviewer runs -- run on your side of the desk first">{I.shieldCheck} Reviewer{'’'}s Eye</div>
        <span className="rv-classpill" title={RV_CLASS_LABEL[cls] + ' house rules'}>{RV_CLASS_PILL[cls]}</span>
      </div>
      <div className="rv-modes">
        <button className={'rv-mode' + (mode === 'write' ? ' on' : '')} onClick={() => setMode('write')}>{I.penLine || I.edit} Writing{!thin && units > 0 && mode !== 'write' ? <span className="rv-mode-n">{units}</span> : null}</button>
        <button className={'rv-mode' + (mode === 'risk' ? ' on' : '')} onClick={() => setMode('risk')}>{I.alertTriangle} Reviewer risk{risk && risk.missing > 0 && mode !== 'risk' ? <span className="rv-mode-n">{risk.missing}</span> : null}</button>
      </div>

      {mode === 'write' && <>
        <div className={'rv-lead rv-' + lead.tone}>
          <div className="rv-lead-h">{lead.h}</div>
          <div className="rv-lead-b">{lead.b}</div>
        </div>

        {!thin && !clean && (
          <div className="rv-list">
            {['error', 'warning', 'info'].flatMap(sev => others.filter(f => f.severity === sev).map((f, i) => {
              const S = RV_SEV[sev];
              return (
                <div key={sev + i} className={'rv-item tone-' + S.tone}>
                  <span className="rv-item-ic">{I[S.ico] || I.alertCircle}</span>
                  <div className="rv-item-b">
                    <div className="rv-item-top">
                      <span className={'rv-sevchip ' + S.tone}>{S.l}</span>
                      <span className="rv-ruleid">{f.ruleId}</span>
                    </div>
                    <div className="rv-item-msg">{f.message}</div>
                    <div className="rv-item-act">
                      <button className="rv-fix" onClick={() => fix(f)}>{I.sparkles} Ask AnA to fix</button>
                    </div>
                  </div>
                </div>
              );
            }))}
            {abbr.length > 0 && (
              <div className="rv-item tone-idle">
                <span className="rv-item-ic">{I.info || I.alertCircle}</span>
                <div className="rv-item-b">
                  <div className="rv-item-top">
                    <span className="rv-sevchip idle">Minor</span>
                    <span className="rv-ruleid">C2C_ABBR_001</span>
                  </div>
                  <div className="rv-item-msg">{abbr.length} abbreviation{abbr.length > 1 ? 's' : ''} may need first-use expansion for reviewer clarity.</div>
                  <div className="rv-abbr-chips">{abbr.map((a, i) => <span key={i} className="rv-abbr-chip">{a.phrase}</span>)}</div>
                  <div className="rv-item-act">
                    <button className="rv-fix" onClick={() => fix({ ruleId: 'C2C_ABBR_001', message: 'expand the first use of these abbreviations for reviewer clarity: ' + abbr.map(a => a.phrase).join(', ') })}>{I.sparkles} Ask AnA to expand first uses</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!thin && clean && (
          <div className="rv-clean">
            <div className="rv-clean-ic">{I.checkCircle || I.check}</div>
            <div>Every concept2cure medical-writing rule passes for this {RV_CLASS_LABEL[cls]} section. Keep the discipline as you add content {'—'} I re-check on every edit.</div>
          </div>
        )}
      </>}

      {mode === 'risk' && riskLead && <>
        <div className={'rv-lead rv-' + riskLead.tone}>
          <div className="rv-lead-h">{riskLead.h}</div>
          <div className="rv-lead-b">{riskLead.b}</div>
        </div>
        {risk!.total > 0 && (
          <div className="rv-riskbar"><div className="rv-riskbar-f" style={{ width: risk!.completeness + '%' }} /><span className="rv-riskbar-l">{risk!.completeness}% covered</span></div>
        )}
        <div className="rv-list">
          {risk!.patterns.map(p => {
            const st = p.status === 'present' ? { l: 'Addressed', t: 'ok' } : p.status === 'weak' ? { l: 'Partly', t: 'warn' } : { l: 'Not addressed', t: 'err' };
            const sv = p.sev === 'critical' ? { l: 'Critical', t: 'err' } : p.sev === 'major' ? { l: 'Major', t: 'warn' } : { l: 'Minor', t: 'idle' };
            return (
              <div key={p.id} className={'rv-item tone-' + st.t}>
                <span className="rv-item-ic">{p.status === 'present' ? (I.checkCircle || I.check) : I.alertTriangle}</span>
                <div className="rv-item-b">
                  <div className="rv-item-top">
                    <span className={'rv-sevchip ' + sv.t}>{sv.l}</span>
                    <span className={'rv-cov ' + st.t}>{st.l}</span>
                    <span className="rv-ruleid">{p.id}</span>
                  </div>
                  <div className="rv-item-ttl">{p.title}</div>
                  <div className="rv-signal">{'“'}{p.signal}{'”'}</div>
                  {p.status !== 'present' && <div className="rv-mit">{p.mit}</div>}
                  {p.status !== 'present' && <div className="rv-item-act"><button className="rv-fix" onClick={() => fix({ ruleId: p.id, message: 'preempt the likely ' + ag + ' deficiency ' + p.id + ' (' + p.title + ') in §' + sectionNum + ' — ' + p.mit })}>{I.sparkles} Ask AnA to address</button></div>}
                </div>
              </div>
            );
          })}
        </div>
      </>}
      {mode === 'risk' && !riskLead && (
        <div className="rv-clean"><div className="rv-clean-ic">{I.info || I.alertCircle}</div><div>Open a section with a known submission type to see the reviewer-risk radar.</div></div>
      )}

      <div className="rv-foot">
        <span>{words} word{words === 1 ? '' : 's'} reviewed {'·'} deterministic house rules</span>
        <button className="rv-rerun" onClick={() => setRunN(x => x + 1)}>{I.refresh || I.history} Re-run</button>
      </div>
    </div>
  );
}
