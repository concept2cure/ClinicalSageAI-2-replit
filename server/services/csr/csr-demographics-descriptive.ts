/**
 * The descriptive §11.2 demographics and baseline characteristics table (CDISC
 * pilot defect D12, 2026-10-30), built when the source declares
 * demographicsPresentation 'descriptive'. A source that does not keeps the
 * compact table in csr-tabulation-builders.ts, byte for byte.
 *
 * Per arm and in a Total column over the randomized subjects the source lists:
 *   - continuous (age, weight, height, BMI, declared characteristics): n,
 *     mean (SD), median, and min, max. Mean, median, min and max print to one
 *     place and the SD to two, the usual SAS TLF precision (the pilot's Table
 *     14-2.01); every figure rounds half up (csr-figure-format.ts).
 *   - categorical (age group, sex, race, ethnicity, declared characteristics):
 *     n (%) of the column's subjects, to one place. Age groups and declared
 *     categories are the source's own, in its order, and a declared category
 *     with no subject is a recorded 0. Race and ethnicity list the values
 *     recorded, alphabetically. A subject with no value is counted on a
 *     "Not recorded" row, never dropped from the denominator silently.
 * Nothing is computed that the records do not hold: a characteristic no record
 * carries has no rows.
 */
import type { GeneratedTable } from '../module3Composer.js';
import { roundHalfUp } from '../csr-figure-format.js';
import type { DemographicRecord, StudyData } from '../csr-tabulation-builders.js';

export const NOT_RECORDED_ROW = 'Not recorded';

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** n, mean (SD), median and min, max; an SD needs two observations, and an empty column states n = 0 and nothing else. */
function continuousCells(values: number[]): [string, string, string, string] {
  if (!values.length) return ['0', '—', '—', '—'];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)) : null;
  const sorted = [...values].sort((a, b) => a - b);
  return [String(values.length), `${roundHalfUp(mean, 1)} (${sd === null ? '—' : roundHalfUp(sd, 2)})`,
    roundHalfUp(median(sorted), 1), `${roundHalfUp(sorted[0], 1)}, ${roundHalfUp(sorted[sorted.length - 1], 1)}`];
}

const countCell = (k: number, n: number) => `${k} (${n > 0 ? `${roundHalfUp((k / n) * 100, 1)}%` : '—'})`;

export function buildDescriptiveDemographicsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const columns: DemographicRecord[][] = [...arms.map(a => study.demographics.filter(d => d.armId === a.armId)), study.demographics];
  const rows: string[][] = [['Subjects', 'n', ...columns.map(c => String(c.length))]];

  const continuous = (label: string, value: (r: DemographicRecord) => number | undefined) => {
    if (!study.demographics.some(r => value(r) !== undefined)) return;
    const cells = columns.map(c => continuousCells(c.map(value).filter((v): v is number => v !== undefined)));
    ['n', 'Mean (SD)', 'Median', 'Min, max'].forEach((statistic, k) => rows.push([label, statistic, ...cells.map(c => c[k])]));
  };
  const categorical = (label: string, value: (r: DemographicRecord) => string | undefined, declared?: string[]) => {
    const recorded = study.demographics.map(value);
    if (!declared && recorded.every(v => v === undefined)) return;
    const categories = declared ?? [...new Set(recorded.filter((v): v is string => v !== undefined))].sort();
    for (const category of categories) rows.push([label, category, ...columns.map(c => countCell(c.filter(r => value(r) === category).length, c.length))]);
    if (recorded.some(v => v === undefined)) rows.push([label, NOT_RECORDED_ROW, ...columns.map(c => countCell(c.filter(r => value(r) === undefined).length, c.length))]);
  };

  continuous('Age (years)', r => r.age);
  if (study.ageGroups) categorical('Age group', r => r.ageGroup, study.ageGroups);
  const sexes: Array<[DemographicRecord['sex'], string]> = [['M', 'Male'], ['F', 'Female'], ['Other', 'Other']];
  for (const [code, name] of sexes) {
    if (code === 'Other' && !study.demographics.some(r => r.sex === code)) continue;
    rows.push(['Sex', name, ...columns.map(c => countCell(c.filter(r => r.sex === code).length, c.length))]);
  }
  categorical('Race', r => r.race);
  categorical('Ethnicity', r => r.ethnicity);
  continuous('Weight (kg)', r => r.weight);
  continuous('Height (cm)', r => r.height);
  continuous('BMI (kg/m²)', r => r.bmi);
  for (const c of study.baselineCharacteristics ?? []) {
    if (c.kind === 'continuous') continuous(c.label, r => r.baselineValues?.[c.key]);
    else categorical(c.label, r => r.baselineCategories?.[c.key], c.categories);
  }

  return {
    title: '§11.2 — Demographics and Baseline Characteristics',
    headers: ['Characteristic', 'Statistic', ...arms.map(a => a.armName), 'Total'],
    rows,
  };
}
