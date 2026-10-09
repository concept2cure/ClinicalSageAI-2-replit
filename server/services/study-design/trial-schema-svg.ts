/**
 * Trial Schema SVG — the ICH M11 §1.2 figure, rendered from the schema model.
 *
 * Split from `trial-schema.ts` for the 500-line file cap. This file owns only
 * drawing: it takes the {@link TrialSchemaModel} the projection built and
 * emits a self-contained SVG string. It has no opinion about the design; every
 * value it draws is already in the model, and every gap it prints was already
 * listed by the projection. It cannot add an epoch, a day or an arm.
 *
 * Figure grammar, left to right: epoch boxes (screening, run-in, treatment,
 * follow-up) over an axis carrying the visit milestones in visit order, evenly
 * spaced and labelled "not to scale"; below, the randomisation marker "R" at
 * the boundary the projection placed it on, fanning out into one lane per arm.
 * Lanes are drawn only inside treatment epochs — one segment per contiguous run
 * of treatment epochs — and converge into the follow-up band when one follows
 * the last treatment epoch. With epochs but no treatment epoch the arms are
 * listed off the timeline, never laid across screening or follow-up. A design
 * with no drawable schedule gets a dashed placeholder that says whether the
 * Schedule of Activities is absent or recorded with nothing drawable.
 *
 * Deterministic and self-contained: fixed layout constants, coordinates rounded
 * to a tenth, no fonts or scripts fetched, no ids derived from anything but the
 * design. Text is escaped with the repository's canonical `escapeXml`, which
 * also drops characters XML cannot carry, so the output is always well-formed.
 * Accessible: `role="img"` with a `<title>` and a `<desc>` that narrates the
 * whole model — epochs, randomisation (method, ratio, blinding, stratification
 * factors), arms, follow-up, what is not drawn, and every gap. Caption lines
 * are wrapped to the figure width so no gap is clipped out of view.
 *
 * Basis: ICH M11 (Clinical Electronic Structured Harmonised Protocol) §1.2 Trial Schema.
 *
 * @module server/services/study-design/trial-schema-svg
 */

import { escapeXml } from '../submission-gateways/ectd-packager/paths';
import type { SchemaEpoch, SchemaMilestone, SchemaRandomization, TrialSchemaModel } from './trial-schema';

// ─── Layout constants (px) ──────────────────────────────────────────────────

const M = 24;
const EPOCH_H = 46;
const AXIS_H = 74;
const LANE_H = 34;
const MIN_EPOCH_W = 150;
const MIN_PLACEHOLDER_W = 480;
const MILESTONE_W = 88;
const COL_GAP = 6;
const CHAR_W = 6.6;
const CAPTION_CHAR_W = 6.2;
const CAPTION_LINE_H = 14;
const MARKER_R = 11;
const INK = '#1f2937';
const LINE = '#374151';
const MUTED = '#6b7280';
const GAP_INK = '#9a3412';

const EPOCH_FILL: Record<SchemaEpoch['kind'], string> = {
  screening: '#eef2f7',
  run_in: '#f5f1e6',
  treatment: '#e6f0ea',
  follow_up: '#f1ecf6',
  unscheduled: '#f3f4f6',
};

const KIND_LABEL: Record<SchemaEpoch['kind'], string> = {
  screening: 'screening',
  run_in: 'run-in',
  treatment: 'treatment',
  follow_up: 'follow-up',
  unscheduled: 'unscheduled',
};

const NOT_TO_SCALE = 'Milestones are spaced by visit order, not to scale in study days.';
const UNPLACED_ARMS = 'Arms (not placed on the timeline: no treatment epoch recorded):';

interface Column {
  epoch: SchemaEpoch;
  x: number;
  w: number;
}

interface Span {
  x1: number;
  x2: number;
}

interface CaptionLine {
  text: string;
  size: number;
  fill: string;
  /** Index into the gap list when the line carries a gap. */
  gap?: number;
}

interface Layout {
  width: number;
  height: number;
  columns: Column[];
  epochY: number;
  axisY: number;
  laneTop: number;
  captionY: number;
  /** x of the randomisation marker; null when none is drawn. */
  markerX: number | null;
  /** Lane segments, one per contiguous run of treatment columns; null when the arms cannot be placed on the timeline. */
  runs: Span[] | null;
  labelX: number;
  /** The follow-up band the lanes converge into; null when none follows the last treatment epoch. */
  followUp: Span | null;
  placeholder: string | null;
  contentRight: number;
  caption: CaptionLine[];
}

// ─── Entry point ────────────────────────────────────────────────────────────

/** Render the schema model as a deterministic, self-contained, accessible SVG. */
export function renderTrialSchemaSvg(model: TrialSchemaModel, gaps: string[]): string {
  const layout = computeLayout(model, gaps);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(layout.width)}" height="${fmt(layout.height)}" ` +
      `viewBox="0 0 ${fmt(layout.width)} ${fmt(layout.height)}" role="img" aria-labelledby="ts-title ts-desc" ` +
      `data-basis="ICH M11 §1.2" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="${INK}">`,
    `<title id="ts-title">${escapeXml(`Trial schema: ${model.title}`)}</title>`,
    `<desc id="ts-desc">${escapeXml(describeModel(model, gaps, layout))}</desc>`,
    `<rect x="0" y="0" width="${fmt(layout.width)}" height="${fmt(layout.height)}" fill="#ffffff"/>`,
    renderEpochs(layout),
    renderMilestones(layout),
    renderArms(layout, model),
    renderCaption(layout),
    '</svg>',
  ]
    .filter(part => part.length > 0)
    .join('\n');
}

// ─── Layout ─────────────────────────────────────────────────────────────────

function columnWidth(epoch: SchemaEpoch): number {
  const byMilestones = epoch.milestones.length * MILESTONE_W;
  const byName = epoch.name.length * CHAR_W + 24;
  return Math.max(MIN_EPOCH_W, byMilestones, byName);
}

function placeColumns(epochs: SchemaEpoch[]): Column[] {
  const columns: Column[] = [];
  let x = M;
  for (const epoch of epochs) {
    const w = columnWidth(epoch);
    columns.push({ epoch, x, w });
    x += w + COL_GAP;
  }
  return columns;
}

function placeMarker(r: SchemaRandomization, columns: Column[]): number | null {
  if (!r.present) return null;
  const after = columns.find(c => c.epoch.id === r.afterEpochId);
  if (after) return after.x + after.w + COL_GAP / 2;
  const before = columns.find(c => c.epoch.id === r.beforeEpochId);
  if (before) return before.x + MARKER_R + 4;
  return columns.length === 0 ? M + MARKER_R + 4 : null;
}

/** One segment per contiguous run of treatment columns; lanes never cross a non-treatment epoch. */
function treatmentRuns(columns: Column[], laneStart: number | null): Span[] {
  const runs: Span[] = [];
  columns.forEach((c, i) => {
    if (c.epoch.kind !== 'treatment') return;
    const end = c.x + c.w - 8;
    if (i > 0 && columns[i - 1].epoch.kind === 'treatment') {
      runs[runs.length - 1].x2 = end;
      return;
    }
    const start = runs.length === 0 && laneStart !== null ? Math.max(laneStart, c.x + 8) : c.x + 8;
    runs.push({ x1: start, x2: end });
  });
  return runs;
}

function followUpBand(columns: Column[]): Span | null {
  let lastTreatment = -1;
  columns.forEach((c, i) => {
    if (c.epoch.kind === 'treatment') lastTreatment = i;
  });
  if (lastTreatment === -1) return null;
  const after = columns.slice(lastTreatment + 1).filter(c => c.epoch.kind === 'follow_up');
  if (after.length === 0) return null;
  const last = after[after.length - 1];
  return { x1: after[0].x + 8, x2: last.x + last.w - 8 };
}

function computeLayout(model: TrialSchemaModel, gaps: string[]): Layout {
  const columns = placeColumns(model.epochs);
  const placeholder = columns.length ? null : placeholderText(model);
  const epochsRight = placeholder === null
    ? columns[columns.length - 1].x + columns[columns.length - 1].w
    : M + Math.max(MIN_PLACEHOLDER_W, placeholder.length * CHAR_W + 24);

  const markerX = placeMarker(model.randomization, columns);
  const laneStart = markerX !== null ? markerX + MARKER_R + 12 : null;
  const anchored = columns.length === 0 || columns.some(c => c.epoch.kind === 'treatment');
  const treatment = columns.length ? treatmentRuns(columns, laneStart) : [];
  const labelX = (anchored ? (treatment[0]?.x1 ?? laneStart ?? M + 8) : M) + 4;

  const longestLabel = model.arms.reduce((n, a) => Math.max(n, a.label.length), 0);
  const headingRight = anchored ? 0 : M + UNPLACED_ARMS.length * CHAR_W + 16;
  const contentRight = Math.max(epochsRight, headingRight, labelX + longestLabel * CHAR_W + 16);
  const width = contentRight + M;
  // With no epochs drawn there is nothing for a lane to cross: arms run the figure width.
  const runs = !anchored ? null : columns.length ? treatment : [{ x1: labelX - 4, x2: contentRight - 8 }];

  const laneRows = Math.max(1, model.arms.length) + (runs === null ? 1 : 0);
  const epochY = M;
  const axisY = epochY + EPOCH_H + 8;
  const laneTop = axisY + AXIS_H;
  const captionY = laneTop + laneRows * LANE_H + 12;
  const caption = captionLines(model, gaps, markerX !== null, Math.floor((width - 2 * M) / CAPTION_CHAR_W));
  const height = captionY + 8 + caption.length * CAPTION_LINE_H + M;

  return {
    width, height, columns, epochY, axisY, laneTop, captionY, markerX, runs, labelX,
    followUp: runs === null ? null : followUpBand(columns), placeholder, contentRight, caption,
  };
}

// ─── Bands ──────────────────────────────────────────────────────────────────

function placeholderText(model: TrialSchemaModel): string {
  return model.scheduleRecorded
    ? 'Schedule of Activities recorded but has no drawable epochs: epochs and visit milestones not drawn'
    : 'Schedule of Activities not recorded: epochs and visit milestones not drawn';
}

function renderEpochs(l: Layout): string {
  if (l.placeholder !== null) {
    const w = l.contentRight - M;
    return [
      `<rect data-role="no-epochs" x="${fmt(M)}" y="${fmt(l.epochY)}" width="${fmt(w)}" height="${fmt(EPOCH_H)}" rx="4" ` +
        `fill="none" stroke="${MUTED}" stroke-dasharray="6 4"/>`,
      text(M + w / 2, l.epochY + EPOCH_H / 2 + 4, l.placeholder, { anchor: 'middle', fill: MUTED }),
    ].join('\n');
  }
  const out: string[] = [];
  for (const c of l.columns) {
    const cx = c.x + c.w / 2;
    out.push(
      `<rect data-epoch="${escapeXml(c.epoch.id)}" data-kind="${c.epoch.kind}" x="${fmt(c.x)}" y="${fmt(l.epochY)}" ` +
        `width="${fmt(c.w)}" height="${fmt(EPOCH_H)}" rx="4" fill="${EPOCH_FILL[c.epoch.kind]}" stroke="${LINE}"/>`,
    );
    const range = dayRange(c.epoch.milestones);
    out.push(text(cx, l.epochY + (range ? 19 : 28), c.epoch.name, { anchor: 'middle', weight: 'bold' }));
    if (range) out.push(text(cx, l.epochY + 36, range, { anchor: 'middle', size: 10, fill: MUTED }));
  }
  return out.join('\n');
}

function renderMilestones(l: Layout): string {
  if (l.columns.length === 0) return '';
  const axisLine = l.axisY + 34;
  const first = l.columns[0];
  const last = l.columns[l.columns.length - 1];
  const out: string[] = [
    `<line x1="${fmt(first.x)}" y1="${fmt(axisLine)}" x2="${fmt(last.x + last.w)}" y2="${fmt(axisLine)}" stroke="${LINE}" stroke-width="1.5"/>`,
  ];
  for (const c of l.columns) {
    const n = c.epoch.milestones.length;
    c.epoch.milestones.forEach((m, i) => {
      const x = c.x + ((i + 0.5) * c.w) / n;
      const tick = m.isBaseline ? 9 : 6;
      out.push(
        `<line data-visit="${escapeXml(m.name)}"${m.isBaseline ? ' data-baseline="true"' : ''} x1="${fmt(x)}" ` +
          `y1="${fmt(axisLine - tick)}" x2="${fmt(x)}" y2="${fmt(axisLine + tick)}" stroke="${LINE}" stroke-width="${m.isBaseline ? 2.5 : 1.5}"/>`,
      );
      out.push(text(x, axisLine - 13, m.name, { anchor: 'middle', size: 10 }));
      const day = dayLabel(m);
      if (day) out.push(text(x, axisLine + 22, day, { anchor: 'middle', size: 10, fill: MUTED }));
    });
  }
  return out.join('\n');
}

function laneY(l: Layout, i: number): number {
  return l.laneTop + i * LANE_H + LANE_H * 0.7;
}

function renderArms(l: Layout, model: TrialSchemaModel): string {
  if (l.runs === null) return renderUnplacedArms(l, model);
  const runs = l.runs;
  const midY = l.laneTop + (Math.max(1, model.arms.length) * LANE_H) / 2;
  const out: string[] = [];
  if (l.markerX !== null) {
    const mx = l.markerX;
    out.push(
      `<circle data-role="randomization" cx="${fmt(mx)}" cy="${fmt(midY)}" r="${MARKER_R}" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`,
      text(mx, midY + 4, 'R', { anchor: 'middle', weight: 'bold' }),
      ...model.arms.map((_, i) =>
        `<line x1="${fmt(mx + MARKER_R)}" y1="${fmt(midY)}" x2="${fmt(runs[0].x1)}" y2="${fmt(laneY(l, i))}" stroke="${LINE}" stroke-width="1"/>`,
      ),
    );
  }
  if (model.arms.length === 0) return [...out, text(l.labelX, laneY(l, 0), 'no arms recorded', { fill: MUTED })].join('\n');
  model.arms.forEach((arm, i) => {
    const y = laneY(l, i);
    for (const run of runs) {
      out.push(
        `<line data-arm="${escapeXml(arm.name)}" x1="${fmt(run.x1)}" y1="${fmt(y)}" x2="${fmt(run.x2)}" y2="${fmt(y)}" stroke="${LINE}" stroke-width="2"/>`,
      );
    }
    out.push(text(l.labelX, y - 6, arm.label, { size: 11 }));
  });
  if (l.followUp !== null && model.followUp) {
    const fu = l.followUp;
    const lastRun = runs[runs.length - 1];
    out.push(
      ...model.arms.map((_, i) =>
        `<line x1="${fmt(lastRun.x2)}" y1="${fmt(laneY(l, i))}" x2="${fmt(fu.x1)}" y2="${fmt(midY)}" stroke="${LINE}" stroke-width="1"/>`,
      ),
      `<line data-role="follow-up" x1="${fmt(fu.x1)}" y1="${fmt(midY)}" x2="${fmt(fu.x2)}" y2="${fmt(midY)}" stroke="${LINE}" stroke-width="2"/>`,
      text(fu.x1 + 4, midY - 6, `${model.followUp.name} (all arms)`, { size: 11 }),
    );
  }
  return out.join('\n');
}

/** Epochs exist but none is a treatment epoch: the arms are listed, not laid across the timeline. */
function renderUnplacedArms(l: Layout, model: TrialSchemaModel): string {
  if (model.arms.length === 0) return text(l.labelX, laneY(l, 0), 'no arms recorded', { fill: MUTED });
  return [
    text(M, laneY(l, 0), UNPLACED_ARMS, { size: 11, fill: MUTED }),
    ...model.arms.map((arm, i) =>
      text(l.labelX, laneY(l, i + 1), arm.label, { size: 11, data: `data-arm="${escapeXml(arm.name)}" data-placed="false"` }),
    ),
  ].join('\n');
}

// ─── Caption ────────────────────────────────────────────────────────────────

/** Design summary, the scale note, the randomisation legend, then every gap — each wrapped to the figure width. */
function captionLines(model: TrialSchemaModel, gaps: string[], markerDrawn: boolean, maxChars: number): CaptionLine[] {
  const d = model.design;
  const raw: CaptionLine[] = [
    { text: `${phaseText(d.phase)} · ${words(d.structuralDesign)} · ${controlText(d.controlType)} · ${words(d.inferentialFrame)}`, size: 11, fill: MUTED },
  ];
  if (model.epochs.length) raw.push({ text: NOT_TO_SCALE, size: 10, fill: MUTED });
  if (model.randomization.present) {
    const sub = randomizationLabel(model.randomization);
    const head = markerDrawn ? 'R = randomization' : 'Randomization recorded, point not drawn';
    raw.push({ text: `${head}${sub ? `: ${sub}` : ''}`, size: 10, fill: MUTED });
  }
  gaps.forEach((g, i) => raw.push({ text: `Gap: ${g}`, size: 10, fill: GAP_INK, gap: i }));
  return raw.flatMap(line => wrap(line.text, maxChars).map(t => ({ ...line, text: t })));
}

function renderCaption(l: Layout): string {
  return l.caption
    .map((line, i) =>
      text(M, l.captionY + 10 + i * CAPTION_LINE_H, line.text, {
        size: line.size,
        fill: line.fill,
        ...(line.gap !== undefined ? { data: `data-gap="${line.gap}"` } : {}),
      }),
    )
    .join('\n');
}

function wrap(s: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  return lines;
}

// ─── Text helpers ───────────────────────────────────────────────────────────

/** Accessible narration of the whole model — what the figure shows and what it could not. */
function describeModel(model: TrialSchemaModel, gaps: string[], l: Layout): string {
  const parts: string[] = [`Trial schema for ${model.title}.`];
  if (model.epochs.length) {
    const epochs = model.epochs.map(e => `${e.name} (${KIND_LABEL[e.kind]}${e.milestones.length ? `: ${milestoneList(e.milestones)}` : ''})`);
    parts.push(`Epochs left to right: ${epochs.join('; ')}. ${NOT_TO_SCALE}`);
  } else {
    parts.push(model.scheduleRecorded
      ? 'The Schedule of Activities is recorded but has no drawable epochs: epochs and visit milestones are not drawn.'
      : 'No Schedule of Activities: epochs and visit milestones are not drawn.');
  }
  parts.push(describeRandomization(model, l));
  if (!model.arms.length) parts.push('No arms recorded.');
  else if (l.runs === null) parts.push(`Arms, not placed on the timeline because no treatment epoch is recorded: ${model.arms.map(a => a.label).join('; ')}.`);
  else parts.push(`Arms: ${model.arms.map(a => a.label).join('; ')}.`);
  if (model.followUp) {
    const ms = milestoneList(model.followUp.milestones);
    parts.push(`Follow-up: ${model.followUp.name}${ms ? ` (${ms})` : ''}.`);
  } else if (model.epochs.length) {
    parts.push('No follow-up epoch is recorded.');
  }
  if (model.notDrawn.length) parts.push(`Not drawn: ${model.notDrawn.join('; ')}.`);
  if (gaps.length) parts.push(`Gaps: ${gaps.join('; ')}.`);
  return parts.join(' ');
}

function describeRandomization(model: TrialSchemaModel, l: Layout): string {
  const r = model.randomization;
  if (!r.present) return 'No randomization point is drawn.';
  const sub = randomizationLabel(r);
  const tail = sub ? `: ${sub}.` : '.';
  if (l.markerX === null) return `Randomization is recorded but its point is not drawn${tail}`;
  const after = model.epochs.find(e => e.id === r.afterEpochId);
  const before = model.epochs.find(e => e.id === r.beforeEpochId);
  if (after) return `Randomization after ${after.name}${tail}`;
  if (before) return `Randomization at the start of ${before.name}${tail}`;
  return `Randomization${tail}`;
}

/** Every recorded randomisation fact, verbatim: ratio, blinding, allocation method, stratification factors. */
function randomizationLabel(r: SchemaRandomization): string {
  const bits: string[] = [];
  if (r.ratio) bits.push(r.ratio.join(':'));
  if (r.blinding) bits.push(r.blinding === 'open' ? 'open-label' : `${r.blinding}-blind`);
  if (r.allocationMethod) bits.push(`${words(r.allocationMethod)} allocation`);
  if (r.stratificationFactors?.length) bits.push(`stratification factors: ${r.stratificationFactors.join(', ')}`);
  return bits.join(' · ');
}

function milestoneList(ms: SchemaMilestone[]): string {
  return ms.map(m => [m.name, dayLabel(m)].filter(Boolean).join(' ')).join(', ');
}

/** "Day 84 ±3" from recorded values only; empty when the design records no study day. */
function dayLabel(m: SchemaMilestone): string {
  if (typeof m.studyDay !== 'number') return '';
  return typeof m.windowDays === 'number' ? `Day ${m.studyDay} ±${m.windowDays}` : `Day ${m.studyDay}`;
}

function dayRange(ms: SchemaMilestone[]): string {
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of ms) {
    if (typeof m.studyDay !== 'number') continue;
    lo = Math.min(lo, m.studyDay);
    hi = Math.max(hi, m.studyDay);
  }
  if (lo === Infinity) return '';
  return lo === hi ? `Day ${lo}` : `Day ${lo} to ${hi}`;
}

function phaseText(phase: TrialSchemaModel['design']['phase']): string {
  return phase === 'FIH' ? 'First-in-human' : `Phase ${phase}`;
}

function controlText(c: TrialSchemaModel['design']['controlType']): string {
  return c === 'none' ? 'no control' : `${words(c)} control`;
}

function text(
  x: number,
  y: number,
  content: string,
  o: { anchor?: 'start' | 'middle'; size?: number; weight?: 'bold'; fill?: string; data?: string } = {},
): string {
  const attrs = [
    o.data ?? '',
    `x="${fmt(x)}"`,
    `y="${fmt(y)}"`,
    o.anchor ? `text-anchor="${o.anchor}"` : '',
    o.size ? `font-size="${o.size}"` : '',
    o.weight ? `font-weight="${o.weight}"` : '',
    o.fill ? `fill="${o.fill}"` : '',
  ].filter(Boolean);
  return `<text ${attrs.join(' ')}>${escapeXml(content)}</text>`;
}

function words(s: string): string {
  return s.replace(/^non_/, 'non-').replace(/_/g, ' ');
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}
