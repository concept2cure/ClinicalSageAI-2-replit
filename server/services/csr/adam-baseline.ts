/**
 * Declared ADSL populations and baseline characteristics for the CSR source
 * (CDISC pilot defects D11 and D12, 2026-10-30). Both are opt-in through the
 * manifest's conventions, so a manifest that declares neither derives exactly
 * the source it did before.
 *
 *   populations   further named populations from ADSL Y/N flags (EFFFL,
 *                 COMP24FL …), each under its define.xml label. A flag the
 *                 tables already report (randomized, safety, ITT, per-protocol)
 *                 is refused, and none is ever mapped onto mITT.
 *   demographics  the descriptive §11.2 table: height (HEIGHTBL), the ADSL age
 *                 groups (AGEGR1, ordered by AGEGR1N or else by the youngest age
 *                 in each; none when ADSL has no AGEGR1, never invented bands)
 *                 and the declared baseline characteristics.
 */
import type { CsrAdamBundle } from '../../../shared/csr-adam-bundle.js';
import type { AdamDataset, AdamRow } from './adam-dataset-reader.js';
import { has, numeric, refuse, requireColumns, text, where, type StudyData, type Subject } from './adam-rows.js';

type Demographic = NonNullable<Subject['demographic']>;
type Characteristic = NonNullable<NonNullable<CsrAdamBundle['conventions']>['demographics']>['characteristics'];

/** The declared further populations, refused when the tables already report the flag under another name. */
export function declaredPopulations(bundle: CsrAdamBundle, adsl: AdamDataset, reported: Record<string, string>) {
  const declared = bundle.conventions?.populations ?? [];
  for (const p of declared) {
    const as = reported[p.flag];
    if (as) refuse('CONVENTION_CONFLICT', `${p.flag} is already reported as the ${as} population; a declared population is a further one.`, 'conventions.populations');
  }
  requireColumns(adsl, ...declared.map(p => p.flag));
  return declared;
}

/** Per-arm counts of each declared population, from the participants' flags. */
export function populationCounts(bundle: CsrAdamBundle, subjects: Subject[]): StudyData['additionalPopulations'] {
  const declared = bundle.conventions?.populations;
  if (!declared) return undefined;
  return declared.map(p => ({ key: p.flag, label: p.label, counts: Object.fromEntries(bundle.arms.map(a => [a.armId,
    subjects.filter(s => s.participant.armId === a.armId && s.participant.additionalPopulations?.[p.flag] === true).length])) }));
}

/** HEIGHTBL in cm, null when blank or absent; a recorded value that is not a positive number is refused, never dropped from n (review, 2026-10-30). */
function heightOf(adsl: AdamDataset, row: AdamRow, i: number): number | null {
  if (!has(adsl, 'HEIGHTBL') || !text(row, 'HEIGHTBL')) return null;
  const height = numeric(row, 'HEIGHTBL');
  return height !== null && height > 0 ? height : refuse('VALUE_UNMAPPED', 'HEIGHTBL holds a value that is not a positive number.', where(adsl, i, 'HEIGHTBL'));
}

/** The descriptive-table fields of one ADSL row, or nothing when the manifest does not declare the descriptive table. */
export function baselineReader(bundle: CsrAdamBundle, adsl: AdamDataset) {
  const declared = bundle.conventions?.demographics;
  if (!declared) return null;
  const characteristics: NonNullable<Characteristic> = declared.characteristics ?? [];
  requireColumns(adsl, ...characteristics.map(c => c.variable));
  return (row: AdamRow, i: number): Partial<Demographic> => {
    const height = heightOf(adsl, row, i);
    const ageGroup = has(adsl, 'AGEGR1') ? text(row, 'AGEGR1') : '';
    const values: Record<string, number> = {};
    const categories: Record<string, string> = {};
    for (const c of characteristics) {
      const raw = text(row, c.variable);
      if (!raw) continue;
      if (c.kind === 'continuous') {
        const n = numeric(row, c.variable);
        values[c.variable] = n ?? refuse('VALUE_UNMAPPED', `${c.variable} is declared continuous and holds a value that is not a number.`, where(adsl, i, c.variable));
      } else {
        if (!c.categories?.includes(raw)) refuse('VALUE_UNMAPPED', `${c.variable} holds a value outside its declared categories.`, where(adsl, i, c.variable));
        categories[c.variable] = raw;
      }
    }
    return { ...(height !== null && height > 0 ? { height } : {}), ...(ageGroup ? { ageGroup } : {}),
      ...(Object.keys(values).length ? { baselineValues: values } : {}), ...(Object.keys(categories).length ? { baselineCategories: categories } : {}) };
  };
}

/** AGEGR1's groups in reporting order: by AGEGR1N when ADSL has it (one number per group), else by the youngest age in each. */
function ageGroupOrder(adsl: AdamDataset, groups: Map<string, number>): string[] {
  if (!has(adsl, 'AGEGR1N')) return [...groups.keys()].sort((a, b) => groups.get(a)! - groups.get(b)! || (a < b ? -1 : 1));
  const order = new Map<string, number>();
  adsl.rows.forEach((row, i) => {
    const group = text(row, 'AGEGR1');
    if (!group || !groups.has(group)) return;
    const n = numeric(row, 'AGEGR1N') ?? refuse('VALUE_MISSING', 'AGEGR1N is blank for a subject with an age group.', where(adsl, i, 'AGEGR1N'));
    if (order.has(group) && order.get(group) !== n) refuse('VALUE_UNMAPPED', 'AGEGR1N gives one age group two different orders.', where(adsl, i, 'AGEGR1N'));
    order.set(group, n);
  });
  return [...groups.keys()].sort((a, b) => order.get(a)! - order.get(b)! || (a < b ? -1 : 1));
}

/** The studyData declarations of the descriptive table, from the derived demographic records. */
export function descriptiveDeclarations(bundle: CsrAdamBundle, adsl: AdamDataset, demographics: Demographic[]): Partial<StudyData> {
  const declared = bundle.conventions?.demographics;
  if (!declared) return {};
  const youngest = new Map<string, number>();
  for (const d of demographics) if (d.ageGroup) youngest.set(d.ageGroup, Math.min(youngest.get(d.ageGroup) ?? Infinity, d.age));
  return { demographicsPresentation: 'descriptive',
    ...(youngest.size ? { ageGroups: ageGroupOrder(adsl, youngest) } : {}),
    ...(declared.characteristics ? { baselineCharacteristics: declared.characteristics.map(c => ({ key: c.variable, label: c.label, kind: c.kind,
      ...(c.categories ? { categories: c.categories } : {}) })) } : {}) };
}
