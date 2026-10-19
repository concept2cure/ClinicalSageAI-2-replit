/**
 * One text-mining labelled-figure extractor, not two.
 *
 * ── The parallel path ────────────────────────────────────────────────────────
 * Two modules mined regulatory prose for figures attached to a curated label and
 * reported the same label disagreeing across a submission's documents. Both were
 * deterministic, both regex, and both said in their own header that they existed for the
 * same reviewer finding:
 *
 *   cross-artifact-consistency.ts  "Sample sizes that differ between a drafted Module 2.5
 *                                   and an existing Module 5.3.5"
 *   ana/dossierReconciliation.ts   "the same labeled figure disagreeing across
 *                                   documents/modules of a submission (e.g. enrolled N in
 *                                   the protocol vs the CSR vs Module 2.7.3)"
 *
 * `intelligence/consistency-verdict.ts` had already named the first one canonical, in its
 * own words, when an earlier duplication was resolved at a merge: *"that one is the
 * canonical implementation, so H2/H4's verdictFor, integrityVerdictFor and their copy were
 * removed at the merge (zero duplication)."* The second one was not reached by that pass.
 *
 * `ana/terminology-consistency.ts` imported from **both** — `extractNumericalFacts` from
 * one and `checkFigureArithmetic` from the other — which is what a parallel path looks like
 * from inside.
 *
 * ── What this holds ─────────────────────────────────────────────────────────
 * 1. One lexicon. A second curated label→regex table for mining figures out of prose is a
 *    parallel path, and this test names the file that holds it.
 * 2. No coverage lost. The five labels only the deleted module had — alpha, power, events,
 *    sites, hazard_ratio — and its enrolled-N prose form are extracted by the canonical
 *    extractor, proven with that module's own test cases.
 * 3. One place for per-label numeric normalisation: "90%" power is 0.9 wherever it is read.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { extractNumericalFacts, numericValueOf, compareDecimalsFor } from '../cross-artifact-consistency';
import { reconcileMinedFigures } from '../../reconciliation/mined-figure-reconciler';

const CANONICAL = 'server/services/intelligence/cross-artifact-consistency.ts';
const ROOT = path.resolve(__dirname, '../../../..');

const factsFor = (label: string, text: string) => extractNumericalFacts(text).filter((f) => f.label === label);
const valuesFor = (label: string, text: string) => factsFor(label, text).map((f) => numericValueOf(f));

describe('one lexicon, in the canonical module', () => {
  it('no other file holds a curated label→regex table for mining figures from prose', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) {
          const rel = path.relative(ROOT, p).split(path.sep).join('/');
          if (rel === CANONICAL) continue;
          const text = readFileSync(p, 'utf8');
          /* The shape of such a table: three or more rows pairing a `label` with a regex
             that captures a NUMBER. One or two is a local pattern, not a lexicon; and a
             lexicon whose captures are not numeric is a different thing altogether —
             translation/glossary.ts pairs labels with regexes for CFR citations, eCTD
             module tokens and slash commands, and is not a figure extractor. */
          const rows = [...text.matchAll(
            /\blabel:\s*'[a-z_]+'[\s\S]{0,120}?(?:regex|pattern):\s*\/[^\n]*?\([^\n]*?(?:\\d|\[0-9\])/g,
          )];
          if (rows.length >= 3) offenders.push(`${rel} (${rows.length} rows)`);
        }
      }
    };
    walk(path.join(ROOT, 'server'));
    walk(path.join(ROOT, 'shared'));
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([]);
  });

  it('the deleted module is gone, and nothing imports it', () => {
    /* An IMPORT of it, not a mention: a comment saying where a pattern came from is how the
       next session learns there was a second copy, and deleting that note would be the
       opposite of the point. */
    const IMPORTS_IT = /(?:from|import|require)\s*\(?\s*['"][^'"]*dossierReconciliation(?:\.js)?['"]/;
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && IMPORTS_IT.test(readFileSync(p, 'utf8'))) {
          importers.push(path.relative(ROOT, p).split(path.sep).join('/'));
        }
      }
    };
    for (const d of ['server', 'shared', 'client/src', 'services', 'tests']) walk(path.join(ROOT, d));
    expect(importers, `\n${importers.join('\n')}\n`).toEqual([]);
    // …and the file itself is gone.
    expect(existsSync(path.join(ROOT, 'server/services/ana/dossierReconciliation.ts'))).toBe(false);
  });
});

describe('the five labels only the deleted module had, on its own cases', () => {
  it('alpha, from "alpha = 0.05" and from "Significance level: 0.025"', () => {
    expect(valuesFor('alpha', 'Two-sided alpha = 0.05 with power of 90%.')).toEqual([0.05]);
    expect(valuesFor('alpha', 'Significance level: 0.025. The study had power = 0.80.')).toEqual([0.025]);
    expect(valuesFor('alpha', 'A type I error rate of 0.05 was assumed.')).toEqual([0.05]);
  });

  it('power, with a percentage normalised to a fraction — "90%" is 0.9', () => {
    // The normalisation the deleted module carried, now in one place.
    expect(valuesFor('power', 'The design assumed power of 90% at a two-sided alpha.')).toEqual([0.9]);
    expect(valuesFor('power', 'The study had power = 0.80 for the primary endpoint.')).toEqual([0.8]);
  });

  it('hazard_ratio, from the word and from the abbreviation', () => {
    expect(valuesFor('hazard_ratio', 'The design assumed a hazard ratio of 0.70.')).toEqual([0.7]);
    expect(valuesFor('hazard_ratio', 'HR = 0.75, favouring the experimental arm.')).toEqual([0.75]);
  });

  it('sites, counting centres and centers alike', () => {
    expect(valuesFor('sites', 'The study randomized 240 patients across 30 sites.')).toEqual([30]);
    expect(valuesFor('sites', 'The subjects completed the trial at 30 centres.')).toEqual([30]);
    expect(valuesFor('sites', 'Patients were enrolled at 12 investigational centers.')).toEqual([12]);
  });

  it('events, counting events and deaths', () => {
    expect(valuesFor('events', 'A total of 180 primary events had accrued at the cut-off.')).toEqual([180]);
    expect(valuesFor('events', 'There were 42 deaths in the full analysis set.')).toEqual([42]);
  });

  it('the enrolled-N prose form, which the canonical pattern required an "=" for', () => {
    // "randomized 240 patients" has no `N=`; the canonical lexicon only read `N=240`.
    expect(valuesFor('sample_size', 'The study randomized 240 patients across 30 sites.')).toEqual([240]);
    expect(valuesFor('sample_size', 'A total of enrolled 238 subjects completed the trial.')).toEqual([238]);
    expect(valuesFor('sample_size', 'The trial randomized 100 participants in all.')).toEqual([100]);
    // …and the form it already read still reads.
    expect(valuesFor('sample_size', 'The safety analysis set (N=305) was used.')).toEqual([305]);
  });
});

describe('per-label numeric normalisation lives in one place', () => {
  it('a count sheds its thousands separator; a fraction is read as written', () => {
    expect(valuesFor('sample_size', 'The trial randomized 1,240 patients in total.')).toEqual([1240]);
    expect(valuesFor('alpha', 'The interim used a one-sided alpha = 0.025 per the plan.')).toEqual([0.025]);
  });

  it('every label the lexicon holds has a comparison precision', () => {
    for (const label of ['sample_size', 'alpha', 'power', 'hazard_ratio', 'p_value', 'sites', 'events']) {
      expect(compareDecimalsFor(label), label).toBeGreaterThanOrEqual(0);
    }
  });

  it('a value the normaliser cannot read is null, never NaN or 0', () => {
    expect(numericValueOf({ label: 'sample_size', value: 'K123456' })).toBeNull();
  });
});

describe('cross-document reconciliation, on the deleted module\u2019s own cases', () => {
  /*
   * Through ONE grouping engine. `reconcileMinedFigures` mines the text with the canonical
   * extractor and hands the figures to `reconcileDossierNumbers`, which is the engine the
   * device reconciler already feeds. The deleted module had a second grouping
   * implementation of its own; it is gone, so the cases below are stated in the engine's
   * vocabulary (quantityKey, conflicts, verdict) rather than the deleted module's.
   */
  const conflictOn = (r: ReturnType<typeof reconcileMinedFigures>, key: string) =>
    r.conflicts.find((c) => c.quantityKey === key);
  const valuesOf = (r: ReturnType<typeof reconcileMinedFigures>, key: string) =>
    (conflictOn(r, key)?.values ?? []).map((v) => v.value).sort((a, b) => a - b);

  it('flags an enrolled-N disagreement across documents, and does not flag sites', () => {
    const r = reconcileMinedFigures([
      { id: 'protocol', text: 'The study randomized 240 patients across 30 sites.' },
      { id: 'csr', text: 'A total of enrolled 238 subjects completed the trial at 30 centres.' },
    ]);
    expect(conflictOn(r, 'sample_size'), r.conflicts.map((c) => c.quantityKey).join(', ')).toBeTruthy();
    expect(valuesOf(r, 'sample_size')).toEqual([238, 240]);
    // 30 in both documents, so sites is compared and agrees.
    expect(conflictOn(r, 'sites')).toBeFalsy();
    expect(r.quantitiesCompared).toBeGreaterThanOrEqual(2);
  });

  it('flags alpha / power / HR drift between a SAP and the results', () => {
    const r = reconcileMinedFigures([
      { id: 'sap', text: 'Two-sided alpha = 0.05 with power of 90%. Assumed hazard ratio of 0.70.' },
      { id: 'results', text: 'Significance level: 0.025. The study had power = 0.80, HR = 0.75.' },
    ]);
    expect(r.conflicts.map((c) => c.quantityKey).sort()).toEqual(['alpha', 'hazard_ratio', 'power']);
    expect(valuesOf(r, 'alpha')).toEqual([0.025, 0.05]);
    // "90%" against "0.80" \u2014 one normaliser, so both are fractions.
    expect(valuesOf(r, 'power')).toEqual([0.8, 0.9]);
  });

  it('reports no conflict when the figures agree, and says what it compared', () => {
    const r = reconcileMinedFigures([
      { id: 'a', text: 'Enrolled 100 patients at a single centre.' },
      { id: 'b', text: 'The trial randomized 100 participants in all.' },
    ]);
    expect(r.conflictCount).toBe(0);
    expect(r.quantitiesCompared).toBeGreaterThanOrEqual(1);
    expect(r.verdict).not.toBe('not_assessed');
  });

  it('a figure stated in ONE document is not_assessed, not consistent', () => {
    /* This is the defect the deleted implementation carried: it listed every label it saw
       once in `consistentLabels`, so a figure compared against nothing read as agreeing.
       The engine has separated the two since 2026-09-28. */
    const r = reconcileMinedFigures([
      { id: 'a', text: 'A two-sided alpha = 0.05 was assumed throughout the study.' },
      { id: 'b', text: 'This document states no labelled figure of any kind at all.' },
    ]);
    expect(r.conflictCount).toBe(0);
    expect(r.quantitiesCompared).toBe(0);
    expect(r.verdict).toBe('not_assessed');
    expect(r.notAssessedReason).toBe('no_shared_quantities');
  });

  it('a document set with no labelled figure at all is not_assessed / no_figures', () => {
    const r = reconcileMinedFigures([
      { id: 'a', text: 'This document states no labelled figure of any kind at all.' },
      { id: 'b', text: 'Neither does this one, which is also prose without any numbers.' },
    ]);
    expect(r.verdict).toBe('not_assessed');
    expect(r.notAssessedReason).toBe('no_figures');
    expect(r.figuresReconciled).toBe(0);
  });

  it('throws a parameter error for malformed input', () => {
    expect(() => reconcileMinedFigures([{ id: 'x' } as never])).toThrow(/must be a string|required/);
    expect(() => reconcileMinedFigures([] as never)).toThrow(/required/);
  });
});

describe('the claim/source comparator reads the canonical extractor', () => {
  it('figure-consistency.ts imports it, and no longer imports the deleted module', () => {
    const src = readFileSync(path.join(ROOT, 'server/services/truth-engine/figure-consistency.ts'), 'utf8');
    expect(src).toContain("from '../intelligence/cross-artifact-consistency'");
    expect(src).not.toMatch(/from\s+'[^']*dossierReconciliation'/);
  });

  it('terminology-consistency.ts reads the arithmetic check from its own module', () => {
    const src = readFileSync(path.join(ROOT, 'server/services/ana/terminology-consistency.ts'), 'utf8');
    expect(src).toContain("from './figure-arithmetic'");
    expect(src).not.toMatch(/from\s+'[^']*dossierReconciliation'/);
  });
});
