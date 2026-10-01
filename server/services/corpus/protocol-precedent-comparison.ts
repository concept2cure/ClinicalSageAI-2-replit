/**
 * A protocol's stated design, set beside the precedent benchmark for its
 * indication and phase.
 *
 * This replaces `generateSectionAnalysis` in server/routes/protocol_routes.ts,
 * which returned the same five paragraphs for every protocol — "standard
 * randomization and blinding procedures", "Successful Phase 3 trials have
 * utilized central randomization", "Recent regulatory approvals … included
 * comprehensive endpoint packages" — each with a fixed "alignment" score (85,
 * 78, 82, 75, 80). It never read the protocol, and it never read a trial.
 *
 * Pure and deterministic. Each section carries what the protocol STATES (null
 * when it does not), what the comparable trials SHOW with the N it came from
 * (or the benchmark's own reason it cannot say), and a comparison only when
 * both exist. There is no score: nothing here measures "alignment", and a
 * percentage would claim that something did.
 */

import type { Distribution, FrequencyItem, PrecedentBenchmark } from './precedent-benchmark';

/** The fields of a protocol this comparison reads — each one only if stated. */
export interface StatedDesign {
  design?: string;
  arms?: number;
  sample_size?: number;
  duration_weeks?: number;
  primary_endpoint?: string;
}

export interface SectionComparison {
  /** What the protocol states for this section; null when it does not. */
  stated: string | null;
  /** What the comparable trials show, with the N it came from — or why it cannot be said. */
  precedent: string;
  /** The stated value against the precedent; null unless both exist. */
  comparison: string | null;
  /** The stated value lies outside the comparable trials' 10th–90th percentile band. */
  outsidePrecedentRange: boolean;
}

export interface ProtocolSectionAnalysis {
  design: SectionComparison;
  sampleSize: SectionComparison;
  duration: SectionComparison;
  primaryEndpoint: SectionComparison;
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4' };

function onePhase(part: string): string | null {
  if (/early/i.test(part))
    return /\b(1|i)\b/i.test(part.replace(/phase/i, ' ')) ? 'Early Phase 1' : null;
  const m = part
    .replace(/phase/i, '')
    .trim()
    .match(/^(iv|iii|ii|i|[1-4])[ab]?$/i);
  if (!m) return null;
  const k = m[1].toLowerCase();
  return `Phase ${ROMAN[k] ?? k}`;
}

/**
 * A caller's phase ("phase3", "Phase III", "3", "Phase 1/2") in the form the
 * corpus normalizer stores ("Phase 3", "Phase 1/Phase 2"). Null when it is not a
 * recognisable phase — the caller then has no phase to match on, rather than a
 * guessed one.
 */
export function toCorpusPhase(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw
    .split(/\/|,|&|\band\b/i)
    .map(p => p.trim())
    .filter(Boolean);
  const mapped = parts.map(onePhase);
  if (mapped.length === 0 || mapped.some(p => p === null)) return null;
  return mapped.join('/');
}

function isDistribution(d: PrecedentBenchmark['sampleSize']): d is Distribution {
  return !('assessable' in d);
}

const fmt = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));

function numericSection(
  stated: number | undefined,
  dist: PrecedentBenchmark['sampleSize'],
  unit: string
): SectionComparison {
  const statedText = typeof stated === 'number' ? `${stated} ${unit}` : null;
  if (!isDistribution(dist)) {
    return {
      stated: statedText,
      precedent: dist.note,
      comparison: null,
      outsidePrecedentRange: false,
    };
  }
  const precedent =
    `Median ${fmt(dist.median)} ${unit} (interquartile range ${fmt(dist.q1)}–${fmt(dist.q3)}; ` +
    `10th–90th percentile ${fmt(dist.p10)}–${fmt(dist.p90)}) across ${dist.n} comparable trials.`;
  if (typeof stated !== 'number') {
    return { stated: null, precedent, comparison: null, outsidePrecedentRange: false };
  }
  if (stated < dist.p10) {
    return {
      stated: statedText,
      precedent,
      comparison: `Below the 10th percentile (${fmt(dist.p10)} ${unit}) of the ${
        dist.n
      } comparable trials.`,
      outsidePrecedentRange: true,
    };
  }
  if (stated > dist.p90) {
    return {
      stated: statedText,
      precedent,
      comparison: `Above the 90th percentile (${fmt(dist.p90)} ${unit}) of the ${
        dist.n
      } comparable trials.`,
      outsidePrecedentRange: true,
    };
  }
  const comparison =
    stated >= dist.q1 && stated <= dist.q3
      ? `Within the interquartile range of the ${dist.n} comparable trials.`
      : `Within the 10th–90th percentile range of the ${dist.n} comparable trials, outside the interquartile range.`;
  return { stated: statedText, precedent, comparison, outsidePrecedentRange: false };
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function categoricalSection(
  stated: string | null,
  items: FrequencyItem[],
  totalTrials: number,
  noun: string
): SectionComparison {
  if (totalTrials === 0) {
    return {
      stated,
      precedent: 'No comparable trials in the corpus for this indication and phase.',
      comparison: null,
      outsidePrecedentRange: false,
    };
  }
  if (items.length === 0) {
    return {
      stated,
      precedent: `None of the ${totalTrials} comparable trials records a ${noun}.`,
      comparison: null,
      outsidePrecedentRange: false,
    };
  }
  const precedent =
    `Most common among ${totalTrials} comparable trials: ` +
    items
      .slice(0, 3)
      .map(i => `${i.value} (${i.count})`)
      .join('; ') +
    '.';
  if (!stated) return { stated: null, precedent, comparison: null, outsidePrecedentRange: false };
  const match = items.find(i => norm(i.value) === norm(stated));
  return {
    stated,
    precedent,
    comparison: match
      ? `Recorded by ${match.count} of the ${totalTrials} comparable trials.`
      : `Not among the ${items.length} most common ${noun}s of the ${totalTrials} comparable trials.`,
    outsidePrecedentRange: false,
  };
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The four sections the corpus can speak to. Eligibility, statistics and
 *  safety monitoring are not summarised by the benchmark, so they are not
 *  reported here at all rather than reported with nothing behind them. */
export function buildSectionAnalysis(
  stated: StatedDesign,
  benchmark: PrecedentBenchmark
): ProtocolSectionAnalysis {
  const design = text(stated.design);
  return {
    design: (() => {
      const section = categoricalSection(
        design,
        benchmark.commonDesigns,
        benchmark.totalTrials,
        'design'
      );
      return typeof stated.arms === 'number' && section.stated
        ? { ...section, stated: `${section.stated} (${stated.arms} arms)` }
        : section;
    })(),
    sampleSize: numericSection(stated.sample_size, benchmark.sampleSize, 'participants'),
    duration: numericSection(stated.duration_weeks, benchmark.duration, 'weeks'),
    primaryEndpoint: categoricalSection(
      text(stated.primary_endpoint),
      benchmark.commonEndpoints,
      benchmark.totalTrials,
      'endpoint'
    ),
  };
}

const LABEL: Record<keyof ProtocolSectionAnalysis, string> = {
  design: 'Design',
  sampleSize: 'Sample size',
  duration: 'Duration',
  primaryEndpoint: 'Primary endpoint',
};

/** Risks the comparison actually shows: a stated value outside the comparable
 *  trials' 10th–90th percentile band. Empty when there is none — never a
 *  generic list. */
export function riskFactorsFrom(analysis: ProtocolSectionAnalysis): string[] {
  return (Object.keys(analysis) as Array<keyof ProtocolSectionAnalysis>)
    .filter(k => analysis[k].outsidePrecedentRange)
    .map(k => `${LABEL[k]} ${analysis[k].stated}: ${analysis[k].comparison}`);
}

/** "value — k of N comparable trials" lines for a frequency list. */
export function frequencyLines(items: FrequencyItem[], totalTrials: number): string[] {
  return items.map(i => `${i.value} — ${i.count} of ${totalTrials} comparable trials`);
}

/** The benchmark and the section comparisons as plain text, for a model to
 *  narrate. Every figure in it was computed here; the model is told to quote
 *  these and add none. */
export function describeForNarration(
  benchmark: PrecedentBenchmark,
  analysis: ProtocolSectionAnalysis
): string {
  const lines = [
    `Comparable trials (${benchmark.indication}, ${benchmark.phase}): ${benchmark.note}`,
  ];
  for (const k of Object.keys(analysis) as Array<keyof ProtocolSectionAnalysis>) {
    const s = analysis[k];
    lines.push(
      `${LABEL[k]} — stated: ${s.stated ?? 'not stated in the protocol'}; precedent: ${
        s.precedent
      }` + (s.comparison ? `; comparison: ${s.comparison}` : '')
    );
  }
  lines.push(`Completion rate: ${benchmark.successRate.note}`);
  return lines.join('\n');
}
