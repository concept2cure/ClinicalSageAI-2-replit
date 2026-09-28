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
 * follow-up) over a study-day axis carrying the visit milestones; below, the
 * randomisation marker "R" at the boundary the projection placed it on, fanning
 * out into one horizontal lane per arm across the treatment epoch(s), converging
 * into the follow-up band when one exists. A design with no drawable schedule
 * gets a dashed placeholder where the epochs would be, saying so.
 *
 * Deterministic and self-contained: fixed layout constants, coordinates rounded
 * to a tenth, no fonts or scripts fetched, no ids derived from anything but the
 * design. Accessible: `role="img"` with a `<title>` and a `<desc>` that
 * narrates the whole model, including its gaps.
 *
 * Basis: ICH M11 (Clinical Electronic Structured Harmonised Protocol) §1.2 Trial Schema.
 *
 * @module server/services/study-design/trial-schema-svg
 */

import type { SchemaEpoch, SchemaMilestone, SchemaRandomization, TrialSchemaModel } from './trial-schema';

// ─── Layout constants (px) ──────────────────────────────────────────────────

const M = 24;
const EPOCH_H = 46;
const AXIS_H = 74;
const LANE_H = 34;
const MIN_EPOCH_W = 150;
const MILESTONE_W = 88;
const COL_GAP = 6;
const CHAR_W = 6.6;
const MARKER_R = 11;
const INK = '#1f2937';
const LINE = '#374151';
const MUTED = '#6b7280';

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

interface Column {
  epoch: SchemaEpoch;
  x: number;
  w: number;
}

interface Layout {
  width: number;
  height: number;
  columns: Column[];
  epochY: number;
  axisY: number;
  laneTop: number;
  laneRows: number;
  captionY: number;
  /** x of the randomisation marker; null when none is drawn. */
  markerX: number | null;
  laneStart: number;
  laneEnd: number;
  /** Left edge of the follow-up band the lanes converge into; null when none follows treatment. */
  followUpX: number | null;
  /** Right edge of the drawn content. */
  contentRight: number;
}

// ─── Entry point ────────────────────────────────────────────────────────────

/** Render the schema model as a deterministic, self-contained, accessible SVG. */
export function renderTrialSchemaSvg(model: TrialSchemaModel, gaps: string[]): string {
  const layout = computeLayout(model, gaps);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(layout.width)}" height="${fmt(layout.height)}" ` +
      `viewBox="0 0 ${fmt(layout.width)} ${fmt(layout.height)}" role="img" aria-labelledby="ts-title ts-desc" ` +
      `data-basis="ICH M11 §1.2" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="${INK}">`,
    `<title id="ts-title">${esc(`Trial schema: ${model.title}`)}</title>`,
    `<desc id="ts-desc">${esc(describeModel(model, gaps))}</desc>`,
    `<rect x="0" y="0" width="${fmt(layout.width)}" height="${fmt(layout.height)}" fill="#ffffff"/>`,
    renderEpochs(layout),
    renderMilestones(layout),
    renderArms(layout, model),
    renderCaption(layout, model, gaps),
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

function computeLayout(model: TrialSchemaModel, gaps: string[]): Layout {
  const columns: Column[] = [];
  let x = M;
  for (const epoch of model.epochs) {
    const w = columnWidth(epoch);
    columns.push({ epoch, x, w });
    x += w + COL_GAP;
  }
  const epochsRight = columns.length ? x - COL_GAP : M + 480;

  const treatment = columns.filter(c => c.epoch.kind === 'treatment');
  const r = model.randomization;
  const after = columns.find(c => c.epoch.id === r.afterEpochId);
  const before = columns.find(c => c.epoch.id === r.beforeEpochId);
  let markerX: number | null = null;
  if (r.present) {
    if (after) markerX = after.x + after.w + COL_GAP / 2;
    else if (before) markerX = before.x + MARKER_R + 4;
    else if (columns.length === 0) markerX = M + MARKER_R + 4;
  }

  const laneStart = markerX !== null ? markerX + MARKER_R + 12 : (treatment[0]?.x ?? M) + 8;
  const lastTreatment = treatment[treatment.length - 1];
  const laneEndByColumns = lastTreatment ? lastTreatment.x + lastTreatment.w - 8 : epochsRight - 8;

  const followUpColumn = lastTreatment
    ? columns.find(c => c.epoch.kind === 'follow_up' && c.x > lastTreatment.x)
    : undefined;
  const followUpX = followUpColumn ? followUpColumn.x : null;

  const longestLabel = Math.max(0, ...model.arms.map(a => a.label.length));
  const contentRight = Math.max(epochsRight, laneStart + longestLabel * CHAR_W + 16);
  const width = contentRight + M;
  const laneEnd = lastTreatment ? laneEndByColumns : contentRight - 8;

  const laneRows = Math.max(1, model.arms.length);
  const epochY = M;
  const axisY = epochY + EPOCH_H + 8;
  const laneTop = axisY + AXIS_H;
  const captionY = laneTop + laneRows * LANE_H + 12;
  const captionLines = (markerX !== null ? 1 : 0) + gaps.length;
  const height = captionY + 22 + captionLines * 14 + M;

  return {
    width, height, columns, epochY, axisY, laneTop, laneRows, captionY,
    markerX, laneStart, laneEnd, followUpX, contentRight,
  };
}

// ─── Bands ──────────────────────────────────────────────────────────────────

function renderEpochs(l: Layout): string {
  if (l.columns.length === 0) {
    const w = l.contentRight - M;
    return [
      `<rect x="${fmt(M)}" y="${fmt(l.epochY)}" width="${fmt(w)}" height="${fmt(EPOCH_H)}" rx="4" ` +
        `fill="none" stroke="${MUTED}" stroke-dasharray="6 4"/>`,
      text(M + w / 2, l.epochY + EPOCH_H / 2 + 4, 'Schedule of Activities not recorded: epochs and visit milestones not drawn', {
        anchor: 'middle', fill: MUTED,
      }),
    ].join('\n');
  }
  const out: string[] = [];
  for (const c of l.columns) {
    const cx = c.x + c.w / 2;
    out.push(
      `<rect data-epoch="${esc(c.epoch.id)}" data-kind="${c.epoch.kind}" x="${fmt(c.x)}" y="${fmt(l.epochY)}" ` +
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
        `<line data-visit="${esc(m.name)}"${m.isBaseline ? ' data-baseline="true"' : ''} x1="${fmt(x)}" ` +
          `y1="${fmt(axisLine - tick)}" x2="${fmt(x)}" y2="${fmt(axisLine + tick)}" stroke="${LINE}" stroke-width="${m.isBaseline ? 2.5 : 1.5}"/>`,
      );
      out.push(text(x, axisLine - 13, m.name, { anchor: 'middle', size: 10 }));
      const day = dayLabel(m);
      if (day) out.push(text(x, axisLine + 22, day, { anchor: 'middle', size: 10, fill: MUTED }));
    });
  }
  return out.join('\n');
}

function renderArms(l: Layout, model: TrialSchemaModel): string {
  const out: string[] = [];
  const midY = l.laneTop + (l.laneRows * LANE_H) / 2;
  const laneY = (i: number) => l.laneTop + i * LANE_H + LANE_H * 0.7;

  if (l.markerX !== null) {
    out.push(
      `<circle data-role="randomization" cx="${fmt(l.markerX)}" cy="${fmt(midY)}" r="${MARKER_R}" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`,
    );
    out.push(text(l.markerX, midY + 4, 'R', { anchor: 'middle', weight: 'bold' }));
    model.arms.forEach((_, i) => {
      out.push(
        `<line x1="${fmt(l.markerX! + MARKER_R)}" y1="${fmt(midY)}" x2="${fmt(l.laneStart)}" y2="${fmt(laneY(i))}" stroke="${LINE}" stroke-width="1"/>`,
      );
    });
  }

  if (model.arms.length === 0) {
    out.push(text(l.laneStart, laneY(0), 'no arms recorded', { fill: MUTED }));
    return out.join('\n');
  }

  model.arms.forEach((arm, i) => {
    const y = laneY(i);
    out.push(
      `<line data-arm="${esc(arm.name)}" x1="${fmt(l.laneStart)}" y1="${fmt(y)}" x2="${fmt(l.laneEnd)}" y2="${fmt(y)}" stroke="${LINE}" stroke-width="2"/>`,
    );
    out.push(text(l.laneStart + 4, y - 6, arm.label, { size: 11 }));
  });

  if (l.followUpX !== null) {
    const fx = l.followUpX + 8;
    model.arms.forEach((_, i) => {
      out.push(`<line x1="${fmt(l.laneEnd)}" y1="${fmt(laneY(i))}" x2="${fmt(fx)}" y2="${fmt(midY)}" stroke="${LINE}" stroke-width="1"/>`);
    });
    const last = l.columns[l.columns.length - 1];
    out.push(
      `<line data-role="follow-up" x1="${fmt(fx)}" y1="${fmt(midY)}" x2="${fmt(last.x + last.w - 8)}" y2="${fmt(midY)}" stroke="${LINE}" stroke-width="2"/>`,
    );
    out.push(text(fx + 4, midY - 6, `${model.followUp?.name ?? 'Follow-up'} (all arms)`, { size: 11 }));
  }
  return out.join('\n');
}

/** Design summary, the randomisation legend when a marker is drawn, then every gap on its own line. */
function renderCaption(l: Layout, model: TrialSchemaModel, gaps: string[]): string {
  const d = model.design;
  const out: string[] = [
    text(M, l.captionY + 10, `Phase ${d.phase} · ${words(d.structuralDesign)} · ${words(d.controlType)} control · ${words(d.inferentialFrame)}`, {
      size: 11, fill: MUTED,
    }),
  ];
  let y = l.captionY + 26;
  if (l.markerX !== null) {
    const sub = randomizationLabel(model.randomization);
    out.push(text(M, y, `R = randomization${sub ? `: ${sub}` : ''}`, { size: 10, fill: MUTED }));
    y += 14;
  }
  for (const g of gaps) {
    out.push(text(M, y, `Gap: ${g}`, { size: 10, fill: '#9a3412' }));
    y += 14;
  }
  return out.join('\n');
}

// ─── Text helpers ───────────────────────────────────────────────────────────

/** Accessible narration of the whole model — what the figure shows and what it could not. */
function describeModel(model: TrialSchemaModel, gaps: string[]): string {
  const parts: string[] = [`Trial schema for ${model.title}.`];
  if (model.epochs.length) {
    const epochs = model.epochs.map(e => {
      const ms = e.milestones.map(m => [m.name, dayLabel(m)].filter(Boolean).join(' ')).join(', ');
      return `${e.name} (${KIND_LABEL[e.kind]}${ms ? `: ${ms}` : ''})`;
    });
    parts.push(`Epochs left to right: ${epochs.join('; ')}.`);
  } else {
    parts.push('No Schedule of Activities: epochs and visit milestones are not drawn.');
  }
  const r = model.randomization;
  if (r.present) {
    const after = model.epochs.find(e => e.id === r.afterEpochId);
    const sub = randomizationLabel(r);
    parts.push(`Randomization${after ? ` after ${after.name}` : ''}${sub ? `: ${sub}` : ''}.`);
  } else {
    parts.push('No randomization point is drawn.');
  }
  parts.push(model.arms.length ? `Arms: ${model.arms.map(a => a.label).join('; ')}.` : 'No arms recorded.');
  if (model.followUp) {
    const ms = model.followUp.milestones.map(m => [m.name, dayLabel(m)].filter(Boolean).join(' ')).join(', ');
    parts.push(`Follow-up: ${model.followUp.name}${ms ? ` (${ms})` : ''}.`);
  } else if (model.epochs.length) {
    parts.push('No follow-up epoch is recorded.');
  }
  if (model.notDrawn.length) parts.push(`Not drawn: ${model.notDrawn.join('; ')}.`);
  if (gaps.length) parts.push(`Gaps: ${gaps.join('; ')}.`);
  return parts.join(' ');
}

function randomizationLabel(r: SchemaRandomization): string {
  const bits: string[] = [];
  if (r.ratio) bits.push(r.ratio.join(':'));
  if (r.blinding) bits.push(r.blinding === 'open' ? 'open-label' : `${r.blinding}-blind`);
  if (r.allocationMethod && r.allocationMethod !== 'simple') bits.push(words(r.allocationMethod));
  return bits.join(' · ');
}

/** "Day 84 ±3" from recorded values only; empty when the design records no study day. */
function dayLabel(m: SchemaMilestone): string {
  if (typeof m.studyDay !== 'number') return '';
  return typeof m.windowDays === 'number' ? `Day ${m.studyDay} ±${m.windowDays}` : `Day ${m.studyDay}`;
}

function dayRange(ms: SchemaMilestone[]): string {
  const days = ms.map(m => m.studyDay).filter((d): d is number => typeof d === 'number');
  if (days.length === 0) return '';
  const lo = Math.min(...days);
  const hi = Math.max(...days);
  return lo === hi ? `Day ${lo}` : `Day ${lo} to ${hi}`;
}

function text(
  x: number,
  y: number,
  content: string,
  o: { anchor?: 'start' | 'middle'; size?: number; weight?: 'bold'; fill?: string } = {},
): string {
  const attrs = [
    `x="${fmt(x)}"`,
    `y="${fmt(y)}"`,
    o.anchor ? `text-anchor="${o.anchor}"` : '',
    o.size ? `font-size="${o.size}"` : '',
    o.weight ? `font-weight="${o.weight}"` : '',
    o.fill ? `fill="${o.fill}"` : '',
  ].filter(Boolean);
  return `<text ${attrs.join(' ')}>${esc(content)}</text>`;
}

function words(s: string): string {
  return s.replace(/_/g, ' ');
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
