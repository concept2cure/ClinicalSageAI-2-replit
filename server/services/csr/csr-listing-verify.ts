/**
 * CSR slice 8 (2026-10-29): a drawn §16.2 listing checked back against its
 * source, subject by subject.
 *
 * The PDF writer records every row it draws, exactly as drawn, in a receipt
 * (one JSON line per row) beside the listing. This check reads that receipt as
 * a stream and compares it with the source records looked up by subject, not
 * with the listing generator's output: every drawn row must be one of its
 * subject's source records (each used once), and every source record must have
 * been drawn. A listing that disagrees with its source subject fails.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { CsrListingAppendix } from './csr-assembly-plan.js';
import { STATUS_LABEL, labBaseline, labDate, labParameter, labValue, orNotRecorded, subjectArms, yesNo, type CsrListingSource } from './csr-listings.js';
import { toWinAnsiSafe } from '../ectd/leaf-pdf-renderer.js';

export interface ListingVerification { number: CsrListingAppendix; ok: boolean; rows: number; findings: string[] }

/** Subject → (drawn-row key → the source record and how many times it occurs). */
type Expected = Map<string, Map<string, { cells: string[]; left: number }>>;
const NOT_RECORDED_REASON = `${orNotRecorded(undefined)} in the source`;

/**
 * A source value as the listing's fonts draw it (toWinAnsiSafe, the writer's
 * one rule, which the receipt records). A substitution that keeps the value
 * (CO₂ → CO2, 10⁶ → 10^6) is what is printed; a character the fonts cannot
 * draw becomes '?', and then the drawn row no longer matches its source.
 */
export function drawnAs(value: string): string {
  const drawn = toWinAnsiSafe(value);
  return (drawn.match(/\?/g)?.length ?? 0) > (value.match(/\?/g)?.length ?? 0) ? value : drawn;
}

function add(expected: Expected, subjectId: string, raw: string[]): void {
  const cells = raw.map(drawnAs);
  const records = expected.get(subjectId) ?? new Map();
  const key = JSON.stringify(cells);
  const record = records.get(key) ?? { cells, left: 0 };
  record.left++;
  records.set(key, record);
  expected.set(subjectId, records);
}

function armNames(source: CsrListingSource): Map<string, string> {
  return new Map(source.study.treatmentArms.map(a => [a.armId, a.armName]));
}

const cellOf = (row: Record<string, unknown>, name: string) => {
  const v = row[name];
  return v === null || v === undefined || (typeof v === 'string' && !v.trim()) ? '' : String(v).trim();
};

type Group = (subjectId: string) => string;
const NOT_RECORDED_SETS = [['itt', 'Intent-to-treat'], ['mitt', 'Modified intent-to-treat'], ['perProtocol', 'Per protocol']] as const;

/** Each listing's rows as its source records them, one builder per listing. */
const EXPECTED: Readonly<Record<string, (source: CsrListingSource, group: Group, add: (subjectId: string, cells: string[]) => void) => void>> = {
  '16.2.1': (source, group, add) => {
    for (const r of source.study.disposition) if (r.status !== 'completed') add(r.subjectId, [group(r.subjectId), r.subjectId, STATUS_LABEL[r.status], orNotRecorded(r.reason)]);
  },
  '16.2.2': (source, group, add) => {
    for (const d of source.protocolDeviations ?? []) add(d.subjectId, [group(d.subjectId), d.subjectId, d.category, d.description, yesNo(d.important)]);
  },
  '16.2.3': (source, group, add) => {
    for (const p of source.participants ?? []) {
      if (!p.randomized) continue;
      for (const [key, label] of NOT_RECORDED_SETS) if (p[key] === false) add(p.subjectId, [group(p.subjectId), p.subjectId, label, NOT_RECORDED_REASON]);
    }
  },
  '16.2.4': (source, group, add) => {
    for (const d of source.study.demographics) add(d.subjectId, [group(d.subjectId), d.subjectId, String(d.age), d.sex, orNotRecorded(d.race), orNotRecorded(d.ethnicity), orNotRecorded(d.weight), orNotRecorded(d.bmi)]);
  },
  '16.2.7': (source, group, add) => {
    for (const e of source.study.adverseEvents) add(e.subjectId, [group(e.subjectId), e.subjectId, e.soc, e.pt, e.severity, yesNo(e.serious), e.related, orNotRecorded(e.outcome), yesNo(e.ledToDiscontinuation)]);
  },
  '16.2.8': (source, group, add) => {
    const ds = source.laboratory;
    for (const row of ds?.rows ?? []) {
      const subjectId = cellOf(row, 'USUBJID');
      add(subjectId, [group(subjectId), subjectId, labParameter(row), labDate(row), orNotRecorded(cellOf(row, 'AVISIT')),
        labBaseline(ds!, row), labValue(row), orNotRecorded(cellOf(row, 'ANRIND'))]);
    }
  },
};

/** What each listing must contain, keyed by subject, built straight from the source records. */
function expectedRows(number: CsrListingAppendix, source: CsrListingSource): Expected {
  const expected: Expected = new Map();
  const arm = armNames(source);
  const arms = subjectArms(source);
  EXPECTED[number]?.(source, subjectId => arm.get(arms.get(subjectId) ?? '') ?? '', (subjectId, cells) => add(expected, subjectId, cells));
  return expected;
}

const MAX_FINDINGS = 50;

/** Which column of a drawn row differs from the subject's nearest source record. */
function differingColumn(drawn: string[], candidates: string[][], headers: readonly string[]): string {
  let best = candidates[0], bestScore = -1;
  for (const c of candidates) {
    const score = c.filter((v, i) => v === drawn[i]).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  const i = best ? best.findIndex((v, n) => v !== drawn[n]) : -1;
  return i >= 0 ? headers[i] ?? `column ${i + 1}` : 'row';
}

/** Stream the receipt of one listing and hold every drawn row to its subject's source records. */
export async function verifyListingReceipt(number: CsrListingAppendix, receiptPath: string, source: CsrListingSource, headers: readonly string[]): Promise<ListingVerification> {
  const expected = expectedRows(number, source);
  const findings: string[] = [];
  const note = (message: string) => { if (findings.length < MAX_FINDINGS) findings.push(message); else if (findings.length === MAX_FINDINGS) findings.push('Further disagreements are not listed.'); };
  let rows = 0;
  const lines = createInterface({ input: createReadStream(receiptPath, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows++;
    const drawn = JSON.parse(line) as { subjectId: string; cells: string[] };
    const records = expected.get(drawn.subjectId);
    const record = records?.get(JSON.stringify(drawn.cells));
    if (record && record.left > 0) { record.left--; continue; }
    const candidates = [...(records?.values() ?? [])].filter(r => r.left > 0).map(r => r.cells);
    note(candidates.length
      ? `Listing ${number}: a row for subject ${drawn.subjectId} disagrees with the source in ${differingColumn(drawn.cells, candidates, headers)}.`
      : `Listing ${number}: a row for subject ${drawn.subjectId} has no source record left to match.`);
  }
  for (const [subjectId, records] of expected) {
    const left = [...records.values()].reduce((n, r) => n + r.left, 0);
    if (left) note(`Listing ${number}: ${left} source record(s) of subject ${subjectId} are not listed.`);
  }
  return { number, ok: findings.length === 0, rows, findings };
}
