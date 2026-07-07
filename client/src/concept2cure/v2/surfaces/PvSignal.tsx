import React, { useState } from 'react';
import { I } from '../icons';

/* -- Interfaces -- */

interface ContingencyCell {
  a: number;
  b: number;
  c: number;
  d: number;
}

interface FrequentistResult {
  prr: number;
  prrCi95: [number, number];
  ror: number;
  rorCi95: [number, number];
  chiSquaredYates: number;
  signal: boolean;
  counts: ContingencyCell;
}

interface BcpnnResult {
  ic: number;
  ic025: number;
  ic975: number;
  expectedCount: number;
  observed: number;
  shrinkage: number;
  signal: boolean;
  counts: ContingencyCell;
}

interface EbgmResult {
  ebgm: number;
  eb05: number;
  eb95: number;
  relativeReportRatio: number;
  expectedCount: number;
  observed: number;
  prior: { alpha: number; beta: number };
  signal: boolean;
  counts: ContingencyCell;
}

interface SignalPanelResult {
  frequentist: FrequentistResult;
  bcpnn: BcpnnResult;
  ebgm: EbgmResult;
  concordance: number;
  tier: SignalTier;
  divergenceNotes: string[];
  counts: ContingencyCell;
}

type SignalTier = 'strong' | 'moderate' | 'weak' | 'none';

interface PvMetricProps {
  big?: boolean;
  val: string | number;
  crit: string;
  met?: boolean;
  sub?: string;
}

interface PvSignalPanelProps {
  onAsk?: (text: string) => void;
  product?: string;
  event?: string;
  embedded?: boolean;
}

/* -- Math port (verbatim from server/services/stats/signal-disproportionality.ts) -- */

const _Z95 = 1.959964;
const _Z90 = 1.644854;

const _round = (n: number, dp: number = 4): number => {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function _computeDisproportionality(cell: ContingencyCell): FrequentistResult {
  const { a, b, c, d } = cell;
  const aa = a || 0.5, bb = b || 0.5, cc = c || 0.5, dd = d || 0.5;
  const prr = (aa / (aa + bb)) / (cc / (cc + dd));
  const lnPrr = Math.log(prr);
  const sePrr = Math.sqrt(1 / aa - 1 / (aa + bb) + 1 / cc - 1 / (cc + dd));
  const prrCi95: [number, number] = [_round(Math.exp(lnPrr - 1.96 * sePrr)), _round(Math.exp(lnPrr + 1.96 * sePrr))];
  const ror = (aa * dd) / (bb * cc);
  const lnRor = Math.log(ror);
  const seRor = Math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd);
  const rorCi95: [number, number] = [_round(Math.exp(lnRor - 1.96 * seRor)), _round(Math.exp(lnRor + 1.96 * seRor))];
  const n = a + b + c + d;
  let chi = 0;
  if (n > 0) {
    const num = n * Math.max(0, Math.abs(a * d - b * c) - n / 2) ** 2;
    const den = (a + b) * (c + d) * (a + c) * (b + d);
    chi = den === 0 ? 0 : num / den;
  }
  const signal = prr >= 2 && chi >= 4 && a >= 3;
  return { prr: _round(prr), prrCi95, ror: _round(ror), rorCi95, chiSquaredYates: _round(chi), signal, counts: cell };
}

function _expectedCount(cell: ContingencyCell): { a: number; n: number; e: number } {
  const { a, b, c, d } = cell;
  const n = a + b + c + d;
  if (n === 0) throw new Error('empty');
  return { a, n, e: ((a + b) * (a + c)) / n };
}

function _digamma(x: number): number {
  let r = 0, v = x;
  while (v < 6) { r -= 1 / v; v += 1; }
  const inv = 1 / v, i2 = inv * inv;
  r += Math.log(v) - 0.5 * inv - i2 / 12 + (i2 * i2) / 120 - (i2 * i2 * i2) / 252;
  return r;
}

function _gammaQuantileWH(k: number, r: number, z: number): number {
  const t = 1 / (9 * k);
  const base = Math.max(0, 1 - t + z * Math.sqrt(t));
  return (k / r) * base ** 3;
}

function _computeBcpnnIc(cell: ContingencyCell, shrinkage: number = 0.5): BcpnnResult {
  const { a, e } = _expectedCount(cell);
  const ic = Math.log2((a + shrinkage) / (e + shrinkage));
  const sd = Math.sqrt((1 / Math.log(2)) ** 2 * (1 / (a + shrinkage)));
  return {
    ic: _round(ic), ic025: _round(ic - _Z95 * sd), ic975: _round(ic + _Z95 * sd),
    expectedCount: _round(e), observed: a, shrinkage, signal: (ic - _Z95 * sd) > 0, counts: cell,
  };
}

function _computeGammaPoissonEbgm(cell: ContingencyCell, prior = { alpha: 0.5, beta: 0.5 }): EbgmResult {
  const { alpha, beta } = prior;
  const { a, e } = _expectedCount(cell);
  const k = alpha + a, r = beta + e;
  const ebgm = Math.exp(_digamma(k) - Math.log(r));
  return {
    ebgm: _round(ebgm), eb05: _round(_gammaQuantileWH(k, r, -_Z90)), eb95: _round(_gammaQuantileWH(k, r, _Z90)),
    relativeReportRatio: _round(e === 0 ? Infinity : a / e), expectedCount: _round(e), observed: a, prior,
    signal: _gammaQuantileWH(k, r, -_Z90) >= 2, counts: cell,
  };
}

export function c2cScreenSignalPanel(cell: ContingencyCell): SignalPanelResult {
  const frequentist = _computeDisproportionality(cell);
  const bcpnn = _computeBcpnnIc(cell);
  const ebgm = _computeGammaPoissonEbgm(cell);
  const flags = [frequentist.signal, bcpnn.signal, ebgm.signal];
  const concordance = flags.filter(Boolean).length;
  const tier: SignalTier = concordance === 3 ? 'strong' : concordance === 2 ? 'moderate' : concordance === 1 ? 'weak' : 'none';
  const notes: string[] = [];
  if (frequentist.signal && !bcpnn.signal) notes.push('Frequentist PRR/ROR flags a signal but BCPNN IC025 ≤ 0 — the association is not robust to Bayesian shrinkage (typically a small observed count a). Treat as lower priority.');
  if (frequentist.signal && !ebgm.signal) notes.push('Frequentist PRR/ROR flags a signal but EBGM EB05 < 2 — the shrunken relative report ratio does not clear the MGPS threshold. Treat as lower priority.');
  if (!frequentist.signal && (bcpnn.signal || ebgm.signal)) notes.push('A Bayesian method flags a signal while the frequentist criterion does not (often the EMA a ≥ 3 count gate). Worth a manual look despite the frequentist miss.');
  if (concordance === 3) notes.push('All three methods concur — the strongest disproportionality evidence from a single table.');
  return { frequentist, bcpnn, ebgm, concordance, tier, divergenceNotes: notes, counts: cell };
}

/* -- UI -- */

const PV_TIER: Record<SignalTier, { cls: string; label: string; line: string }> = {
  strong: { cls: 'attn', label: 'Strong signal', line: 'All three methods agree — the strongest disproportionality evidence a single 2×2 can give.' },
  moderate: { cls: 'warn', label: 'Moderate signal', line: 'Two of three methods agree — real enough to work, with a caveat worth reading.' },
  weak: { cls: 'info', label: 'Weak signal', line: 'Only one method flags this — most likely a small-count coincidence the shrinkage methods suppress.' },
  none: { cls: 'calm', label: 'No signal', line: 'No method clears its threshold. This is noise, not a signal — you don\'t need to chase it.' },
};

const PV_CITES = ['Bate et al. 1998 (BCPNN)', 'Norén et al. 2006', 'DuMouchel 1999 (MGPS/EBGM)', 'EMA/MHRA: PRR ≥ 2 ∧ χ² ≥ 4 ∧ a ≥ 3'];

function PvMetric({ big, val, crit, met, sub }: PvMetricProps) {
  return (
    <div className={'pv-metric' + (big ? ' pv-metric-big' : '') + (met ? ' is-signal' : '')}>
      <div className="pv-metric-v">{val}</div>
      <div className="pv-metric-k">{crit}</div>
      {sub && <div className="pv-metric-s">{sub}</div>}
    </div>
  );
}

export function PvSignalPanel({ onAsk, product, event, embedded }: PvSignalPanelProps) {
  const PedigreeBadge = (window as any).PedigreeBadge as React.ComponentType<{ level: string }> | undefined;
  const AnswerLead = (window as any).AnswerLead as React.ComponentType<any> | undefined;
  const CitationChips = (window as any).CitationChips as React.ComponentType<{ items: string[]; lead: string }> | undefined;

  const ask: (text: string) => void = onAsk || (window as any).openAna || (() => {});
  const [cell, setCell] = useState<ContingencyCell>({ a: 25, b: 75, c: 100, d: 1000 });
  const set = (k: keyof ContingencyCell, v: string) => setCell(p => ({ ...p, [k]: Math.max(0, parseInt(v, 10) || 0) }));
  const p = c2cScreenSignalPanel(cell);
  const T = PV_TIER[p.tier];
  const which = p.bcpnn.signal ? 'BCPNN IC025 stays above 0' : (p.ebgm.signal ? 'EBGM EB05 clears 2' : 'neither Bayesian bound clears its threshold');

  const lead = {
    tone: p.tier === 'strong' ? 'calm' : p.tier === 'none' ? 'good' : 'calm',
    eyebrow: 'Which of your safety signals are real — not small-count noise',
    headline: <>For {product || 'this drug'} {'·'} {event || 'this event'}, {p.concordance} of 3 methods flag a signal {'—'} that reads as a <b>{T.label.toLowerCase()}</b>.</>,
    body: <>{T.line} The two Bayesian measures shrink small counts toward the null, so a handful of coincidental co-reports doesn't fire the way raw PRR does {'—'} here, {which}.</>,
    reassure: p.tier === 'strong'
      ? <>When all three concur, you can act without second-guessing the statistics {'—'} the evidence is as strong as a single table allows.</>
      : p.tier === 'none'
        ? <>You don't have to chase every small-count blip {'—'} the shrinkage math tells you this one isn't worth your week.</>
        : <>I've surfaced exactly where the methods disagree below, so you decide with the caveat in front of you {'—'} not hidden behind one number.</>,
    action: {
      label: 'Draft the signal-evaluation note', icon: I.fileText,
      onClick: () => ask('Draft a signal-evaluation note for ' + (product || 'the product') + ' · ' + (event || 'the event') + ' summarising the disproportionality panel (PRR ' + p.frequentist.prr + ', IC025 ' + p.bcpnn.ic025 + ', EB05 ' + p.ebgm.eb05 + ', tier ' + p.tier + ') and recommend a priority.'),
      alt: { label: 'Ask AnA how the tier is derived', onClick: () => ask('Explain how the consolidated signal tier is derived from BCPNN IC025, Gamma-Poisson EB05, and the frequentist PRR/χ² criterion.') },
    },
    secondary: 'Enter this pair\'s 2×2 counts below to screen it.',
  };

  return (
    <div className="pv-panel">
      <div className="pv-panel-head">
        <div className="pv-panel-ttl">
          {I.activity || I.trendingUp} Disproportionality screen
          {PedigreeBadge && <PedigreeBadge level="deterministic_registry" />}
        </div>
        <span className="pv-sample">Sample counts</span>
      </div>

      {embedded
        ? <p className="pv-embed-lead">Beyond the raw PRR, I ran all three signal-detection methods on this pair. <b>{p.concordance} of 3 agree</b> {'—'} that reads as a <b>{T.label.toLowerCase()}</b>. The Bayesian bounds below (IC025, EB05) shrink the small-count noise that inflates a raw ratio, so you act on the consolidated verdict, not one number.</p>
        : (AnswerLead && <AnswerLead {...lead} onAsk={ask} />)}

      <div className="pv-verdict">
        <div className={'pv-tier pv-tier-' + T.cls}>
          <span className="pv-tier-lbl">{T.label}</span>
          <span className="pv-tier-con">{p.concordance} of 3 methods agree</span>
        </div>
        <div className="pv-methods">
          <div className="pv-method pv-method-hero">
            <div className="pv-method-h"><span>BCPNN Information Component</span>{p.bcpnn.signal ? <span className="pv-chip ok">signal</span> : <span className="pv-chip idle">no signal</span>}</div>
            <div className="pv-metric-row">
              <PvMetric big val={p.bcpnn.ic025.toFixed(2)} crit="IC025" met={p.bcpnn.signal} sub="signal if > 0" />
              <PvMetric val={p.bcpnn.ic.toFixed(2)} crit="IC" />
              <PvMetric val={p.bcpnn.ic975.toFixed(2)} crit="IC975" />
              <PvMetric val={p.bcpnn.expectedCount.toFixed(1)} crit="expected" />
            </div>
          </div>
          <div className="pv-method pv-method-hero">
            <div className="pv-method-h"><span>Gamma-Poisson EBGM</span>{p.ebgm.signal ? <span className="pv-chip ok">signal</span> : <span className="pv-chip idle">no signal</span>}</div>
            <div className="pv-metric-row">
              <PvMetric big val={p.ebgm.eb05.toFixed(2)} crit="EB05" met={p.ebgm.signal} sub={'signal if ≥ 2'} />
              <PvMetric val={p.ebgm.ebgm.toFixed(2)} crit="EBGM" />
              <PvMetric val={p.ebgm.eb95.toFixed(2)} crit="EB95" />
              <PvMetric val={p.ebgm.relativeReportRatio.toFixed(2)} crit="RR = a/E" />
            </div>
          </div>
          <div className="pv-method pv-method-freq">
            <div className="pv-method-h"><span>Frequentist PRR / ROR <em>{'·'} sensitive but noisy at small a</em></span>{p.frequentist.signal ? <span className="pv-chip ok">signal</span> : <span className="pv-chip idle">no signal</span>}</div>
            <div className="pv-metric-row">
              <PvMetric val={p.frequentist.prr.toFixed(2)} crit="PRR" sub={p.frequentist.prrCi95[0].toFixed(1) + '–' + p.frequentist.prrCi95[1].toFixed(1)} />
              <PvMetric val={p.frequentist.ror.toFixed(2)} crit="ROR" sub={p.frequentist.rorCi95[0].toFixed(1) + '–' + p.frequentist.rorCi95[1].toFixed(1)} />
              <PvMetric val={p.frequentist.chiSquaredYates.toFixed(1)} crit={'χ² Yates'} />
              <PvMetric val={p.frequentist.counts.a} crit="a (observed)" />
            </div>
          </div>
        </div>
      </div>

      {p.divergenceNotes.length > 0 && (
        <div className="pv-notes">
          <div className="pv-notes-h">{I.info} What the methods say together</div>
          {p.divergenceNotes.map((n, i) => <div key={i} className="pv-note">{n}</div>)}
        </div>
      )}

      <div className="pv-input">
        <div className="pv-input-h">{'2×2 contingency table'} <span className="pv-input-s">edit to screen this pair {'—'} recomputes live</span></div>
        <div className="pv-grid">
          <div className="pv-gcell pv-ghead"></div>
          <div className="pv-gcell pv-ghead">Event of interest</div>
          <div className="pv-gcell pv-ghead">Other events</div>
          <div className="pv-gcell pv-ghead pv-grow">{product || 'Product'} of interest</div>
          <label className="pv-gcell"><span>a</span><input type="number" min="0" value={cell.a} onChange={e => set('a', e.target.value)} /></label>
          <label className="pv-gcell"><span>b</span><input type="number" min="0" value={cell.b} onChange={e => set('b', e.target.value)} /></label>
          <div className="pv-gcell pv-ghead pv-grow">All other products</div>
          <label className="pv-gcell"><span>c</span><input type="number" min="0" value={cell.c} onChange={e => set('c', e.target.value)} /></label>
          <label className="pv-gcell"><span>d</span><input type="number" min="0" value={cell.d} onChange={e => set('d', e.target.value)} /></label>
        </div>
      </div>

      {CitationChips && <CitationChips items={PV_CITES} lead="Method sources" />}
    </div>
  );
}
