type MethodCore = {
  id: string;
  title: string;
  analyte: string;
  accuracy_target?: string | null;
  precision_target?: string | null;
};

const num = (s?: string | null) => (s ?? '').match(/[\d.]+/g)?.map(Number) ?? [];
const range = (s?: string | null) => {
  const xs = (s ?? '').replace(/[–—]/g, '-').match(/(\d+(\.\d+)?)\s*[-]\s*(\d+(\.\d+)?)/);
  return xs ? [Number(xs[1]), Number(xs[3])] : null;
};

function r2Threshold(m: MethodCore) {
  const hint = `${m.title} ${m.analyte}`.toLowerCase();
  return hint.includes('impur') || hint.includes('residual') ? 0.995 : 0.999;
}
function precisionMax(m: MethodCore) {
  const n = num(m.precision_target)[0];
  return Number.isFinite(n) ? n : 2.0; // %RSD
}
function accuracyBounds(m: MethodCore) {
  const r = range(m.accuracy_target);
  return r ?? [98, 102];
}

export function evaluateAcceptance(
  m: MethodCore,
  stats: {
    r2: number;
    accMeans: { LOW: number | undefined; MID: number | undefined; HIGH: number | undefined };
    rsd: number | undefined;
  }
) {
  const [accLo, accHi] = accuracyBounds(m);
  const r2Min = r2Threshold(m);
  const rsdMax = precisionMax(m);

  const accPass = (v?: number) => typeof v === 'number' && v >= accLo && v <= accHi;
  const accLow = accPass(stats.accMeans.LOW);
  const accMid = accPass(stats.accMeans.MID);
  const accHigh = accPass(stats.accMeans.HIGH);
  const accuracyOverall = Boolean(accLow && accMid && accHigh);

  const r2Pass = stats.r2 >= r2Min;
  const rsdPass = typeof stats.rsd === 'number' ? stats.rsd <= rsdMax : false;

  const guardPass = r2Pass && rsdPass && accuracyOverall;

  return {
    thresholds: { r2Min, rsdMax, accLo, accHi },
    results: { r2: stats.r2, rsd: stats.rsd, accMeans: stats.accMeans },
    passes: { r2Pass, rsdPass, accLow, accMid, accHigh, accuracyOverall, guardPass },
  };
}

export type GuardGap = {
  ruleId: string;
  title: string;
  why: string;
  severity: 'ERROR' | 'WARNING';
};

export function guardFailuresToGaps(
  m: MethodCore,
  acc: ReturnType<typeof evaluateAcceptance>
): GuardGap[] {
  const gaps: GuardGap[] = [];
  if (!acc.passes.r2Pass) {
    gaps.push({
      ruleId: 'GUARD-R2',
      title: 'R² below minimum threshold',
      why: `Observed R² ${acc.results.r2.toFixed(5)} < minimum ${acc.thresholds.r2Min}`,
      severity: 'ERROR',
    });
  }
  if (!acc.passes.rsdPass) {
    const rsd = typeof acc.results.rsd === 'number' ? `${acc.results.rsd.toFixed(2)}%` : 'N/A';
    gaps.push({
      ruleId: 'GUARD-PR',
      title: 'Repeatability %RSD above maximum',
      why: `Observed ${rsd} > maximum ${acc.thresholds.rsdMax}%`,
      severity: 'ERROR',
    });
  }
  if (!acc.passes.accuracyOverall) {
    const { LOW, MID, HIGH } = acc.results.accMeans;
    gaps.push({
      ruleId: 'GUARD-ACC',
      title: 'Accuracy means outside bounds',
      why: `Means: L=${LOW?.toFixed(1) ?? '—'} M=${MID?.toFixed(1) ?? '—'} H=${HIGH?.toFixed(1) ?? '—'} (bounds ${acc.thresholds.accLo}–${acc.thresholds.accHi}%)`,
      severity: 'ERROR',
    });
  }
  return gaps;
}
