/**
 * The Stability register's chart of one ICH Q1E fit (P-122, 2026-11-10).
 *
 * CMC had no chart: no stability plot, no regression line, no confidence band
 * (P-122 inventory, B1). The fit existed on the server — `estimateShelfLife`
 * (server/services/cmc/shelf-life.ts) — and returns, since this change, the
 * line and the one-sided bound it computed (`band`) beside the observations it
 * fitted (`observations`, recorded-stability.ts). This file draws those, the
 * specification and the reported shelf life. It computes no statistic: every
 * y-value it plots is a number the engine returned (RULE 2). The only
 * arithmetic here is the mapping from data units to pixels and the choice of
 * round tick values.
 *
 * Form (the dataviz method): change over time, one attribute at one storage
 * condition per chart; recorded results as dots with a surface ring, the fitted
 * mean as a 2px line, the confidence bound as a thin line edging a 10% wash,
 * the specification and the shelf life as labelled reference lines in text ink.
 * One series hue, validated against both surfaces (light #6250d6, dark
 * #9085e9). Each dot's value is in its tooltip; the table above carries every
 * figure, so nothing is shown by colour alone.
 */
import React from 'react';
import { apiRequest } from '@/lib/queryClient';
import { cmcWriteError } from './cmcShared';

export interface Q1eBandPoint { time: number; fitted: number; bound: number }

/** The fields of one recorded Q1E estimate this chart draws. */
export interface Q1eChartEstimate {
  parameter: string;
  condition?: string | null;
  estimable: boolean;
  specLimit?: number;
  shelfLife?: number;
  observedPeriod?: number;
  extrapolationLimit?: number;
  cappedByExtrapolationLimit?: boolean;
  confidence?: { alpha: number; bound: 'lower' | 'upper' };
  regression?: { slope: number; r2: number; n: number };
  band?: Q1eBandPoint[];
  observations?: Array<{ time: number; value: number }>;
}

/** True when the engine returned everything this chart draws, and nothing has to be made up. */
export function chartable(e: Q1eChartEstimate): boolean {
  return Boolean(
    e.estimable && e.band && e.band.length >= 2 && e.observations && e.observations.length > 0 &&
    typeof e.specLimit === 'number' && typeof e.shelfLife === 'number',
  );
}

const W = 640;
const H = 240;
const M = { l: 52, r: 20, t: 22, b: 34 };

/** Round tick values over [lo, hi]: 1, 2 or 5 times a power of ten. Layout, not statistics. */
function ticks(lo: number, hi: number, want = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / want;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}

const fmt = (n: number) => String(Number(n.toFixed(3)));

function describe(e: Q1eChartEstimate): string {
  const side = e.confidence?.bound === 'upper' ? 'upper' : 'lower';
  return (
    `${e.parameter}${e.condition ? ` at ${e.condition}` : ''}: ${e.observations!.length} recorded ` +
    `${e.observations!.length === 1 ? 'result' : 'results'} to ${fmt(e.observedPeriod ?? 0)} months, the fitted line and ` +
    `its one-sided 95% ${side} confidence bound; specification ${fmt(e.specLimit!)}; shelf life ${fmt(e.shelfLife!)} months` +
    (e.cappedByExtrapolationLimit ? ', limited by the ICH Q1E extrapolation allowance.' : '.')
  );
}

/** One attribute's fit: dots, line, bound, specification and shelf life. */
export function StabilityFitChart({ estimate: e }: { estimate: Q1eChartEstimate }) {
  if (!chartable(e)) return null;
  const band = e.band!;
  const obs = e.observations!;
  const tMax = band[band.length - 1].time;
  const ys = [...band.flatMap((p) => [p.fitted, p.bound]), ...obs.map((o) => o.value), e.specLimit!];
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
  const yTicks = ticks(Math.min(...ys) - pad, Math.max(...ys) + pad);
  const [yLo, yHi] = [Math.min(yTicks[0], Math.min(...ys)), Math.max(yTicks[yTicks.length - 1], Math.max(...ys))];
  const x = (t: number) => M.l + (t / (tMax || 1)) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - ((v - yLo) / (yHi - yLo || 1)) * (H - M.t - M.b);
  const line = (key: 'fitted' | 'bound') => band.map((p) => `${x(p.time).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const wash = `${line('fitted')} ${[...band].reverse().map((p) => `${x(p.time).toFixed(1)},${y(p.bound).toFixed(1)}`).join(' ')}`;
  const sx = x(Math.min(e.shelfLife!, tMax));
  return (
    <figure className="cm-fit" data-testid="cm-fit-chart">
      <figcaption className="cm-fit-h">
        <span className="cm-fit-t">{e.parameter}{e.condition ? ` · ${e.condition}` : ''}</span>
        <span className="cm-fit-legend" aria-hidden="true">
          <span><i className="k-dot" />Results</span>
          <span><i className="k-line" />Fitted mean</span>
          <span><i className="k-band" />One-sided 95% bound</span>
          <span><i className="k-ref" />Specification</span>
        </span>
      </figcaption>
      <svg className="cm-fit-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describe(e)} preserveAspectRatio="xMidYMid meet">
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="grid" x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
            <text className="tick" x={M.l - 8} y={y(v) + 4} textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
        {ticks(0, tMax, 6).map((t) => (
          <text key={`x${t}`} className="tick" x={x(t)} y={H - M.b + 16} textAnchor="middle">{fmt(t)}</text>
        ))}
        <text className="tick" x={W - M.r} y={H - 4} textAnchor="end">months on stability</text>
        <polygon className="band" points={wash} />
        <polyline className="bound" data-mark="bound" points={line('bound')} />
        <polyline className="fitted" data-mark="fitted" points={line('fitted')} />
        <line className="ref" data-mark="spec" x1={M.l} x2={W - M.r} y1={y(e.specLimit!)} y2={y(e.specLimit!)} />
        <text className="ref-l" x={W - M.r} y={y(e.specLimit!) - 6} textAnchor="end">Specification {fmt(e.specLimit!)}</text>
        <line className="ref" data-mark="shelf-life" x1={sx} x2={sx} y1={M.t} y2={H - M.b} />
        <text className="ref-l" x={sx + 6} y={M.t + 10}>Shelf life {fmt(e.shelfLife!)} mo</text>
        {obs.map((o) => (
          <circle key={`${o.time}-${o.value}`} className="dot" data-mark="observation" cx={x(o.time)} cy={y(o.value)} r={4}>
            <title>{`${fmt(o.time)} months: ${fmt(o.value)}`}</title>
          </circle>
        ))}
      </svg>
      <p className="sec-sub cm-fit-cap">
        Drawn from the server’s ICH Q1E fit: {e.regression ? `slope ${fmt(e.regression.slope)} per month, R² ${e.regression.r2}, ${e.regression.n} points. ` : ''}
        {e.cappedByExtrapolationLimit
          ? `The bound stays within the specification past ${fmt(e.extrapolationLimit ?? 0)} months, which is as far as ICH Q1E allows from ${fmt(e.observedPeriod ?? 0)} months of data.`
          : `The bound meets the specification at ${fmt(e.shelfLife!)} months.`}
      </p>
    </figure>
  );
}

/** Every drawable fit of one study's estimate, or nothing. */
export function StabilityFitCharts({ estimates }: { estimates: Q1eChartEstimate[] }) {
  const drawable = estimates.filter(chartable);
  if (!drawable.length) return null;
  return <div className="cm-fits">{drawable.map((e, i) => <StabilityFitChart key={`${e.parameter}-${e.condition ?? ''}-${i}`} estimate={e} />)}</div>;
}

/**
 * Estimate every study with recorded results once, when the register opens.
 *
 * The estimate is a read (it writes nothing; `shelf_life` is set only by the
 * signed close-out), so it is not held behind a button: a chart nobody presses
 * for is a chart nobody sees (P-122). A refusal — a biologic, a study filed
 * under no project, too few points — is kept per study and said in the
 * register, not raised as a failure.
 */
export function useAutoQ1e<R>(
  studies: Array<{ id: number; hasResults: boolean }>,
  have: Record<number, R>,
  adopt: (id: number, report: R) => void,
  /** The report's shape is checked before it is adopted: a reply of another shape is said, not rendered. */
  isReport: (value: unknown) => value is R,
): Record<number, string> {
  const [refused, setRefused] = React.useState<Record<number, string>>({});
  /* Asked once per study for the life of the register. A run is not cancelled
     when the set changes (adopting one estimate changes it); only an unmount
     stops it adopting what it reads. */
  const asked = React.useRef<Set<number>>(new Set());
  const mounted = React.useRef(true);
  /* Set on every mount, not only at creation: React's development double mount
     runs this cleanup once before the real mount, and a ref left false then
     dropped every estimate the register read (found on the running app). */
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const dueKey = studies.filter((s) => s.hasResults && !have[s.id] && !asked.current.has(s.id)).map((s) => s.id).join(',');
  React.useEffect(() => {
    if (!dueKey) return;
    const ids = dueKey.split(',').map(Number).filter((id) => !asked.current.has(id));
    ids.forEach((id) => asked.current.add(id));
    void (async () => {
      for (const id of ids) {
        try {
          const res = await apiRequest('POST', '/api/cmc/stability-studies/' + id + '/shelf-life', {});
          const json = await res.json().catch(() => null);
          if (!mounted.current) return;
          const report = (json as { data?: unknown } | null)?.data;
          if (res.ok && isReport(report)) adopt(id, report);
          else setRefused((m) => ({ ...m, [id]: res.ok ? 'The estimate came back in a shape this screen does not read.' : cmcWriteError(json, res.status) }));
        } catch (err) {
          if (mounted.current) setRefused((m) => ({ ...m, [id]: err instanceof Error ? err.message : String(err) }));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dueKey is the set of studies still to estimate
  }, [dueKey]);
  return refused;
}
