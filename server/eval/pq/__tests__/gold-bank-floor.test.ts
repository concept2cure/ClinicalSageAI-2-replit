/**
 * The gold bank must satisfy the protocol it is scored against.
 *
 * THE DEFECT THIS PREVENTS. `computeVerdict` reports INCOMPLETE when a
 * document type has fewer scored generation tasks than
 * `components.generation.criteria.minTasksPerDocType` (pq-verdict.ts
 * sampleShortfall). Nothing checked that before a run, so the bank could sit
 * below the floor — as it did, at 1/1/2 against a floor of 10 — and the only
 * thing that would say so was a PQ execution, which needs a product provider
 * key and spends real tokens against every task in the bank before returning a
 * verdict of "your bank is too small". A cheap check belongs here, where it
 * costs nothing.
 *
 * It counts the way `run-pq.ts` counts, deliberately: that runner takes only
 * generation tasks carrying a non-empty `input`, because that is what a model
 * can be given. A task with no input does not raise the floor no matter how
 * many of them the file holds, so a test counting every task would pass while
 * the run stayed INCOMPLETE.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PQ_DIR = path.resolve(HERE, '..');

interface GoldTask {
  id: string;
  docType: string;
  taskType: string;
  input?: unknown;
  requiredSections?: string[];
  forbiddenPatterns?: string[];
  candidateContent?: unknown;
}

const protocol = JSON.parse(
  readFileSync(path.join(PQ_DIR, 'pq-protocol.json'), 'utf8'),
) as { components: { generation?: { criteria: { minTasksPerDocType?: number } } } };

const bank = JSON.parse(
  readFileSync(path.join(PQ_DIR, '..', 'doc-quality', 'gold-tasks.json'), 'utf8'),
) as { version: string; tasks: GoldTask[] };

/** Exactly run-pq.ts's filter: generation, with source input a model can be given. */
const scorable = bank.tasks.filter(
  (t) => t.taskType === 'generation' && typeof t.input === 'string' && t.input.trim(),
);

function countByDocType(tasks: GoldTask[]): Map<string, number> {
  const by = new Map<string, number>();
  for (const t of tasks) by.set(t.docType, (by.get(t.docType) ?? 0) + 1);
  return by;
}

describe('gold bank meets the PQ protocol sample floor', () => {
  const floor = protocol.components.generation?.criteria.minTasksPerDocType;

  it('the protocol states a sample floor', () => {
    expect(typeof floor).toBe('number');
  });

  it('every document type reaches the floor, counted as run-pq counts', () => {
    const counts = countByDocType(scorable);
    expect(counts.size, 'the bank holds at least one scorable generation task').toBeGreaterThan(0);
    const short = [...counts].filter(([, n]) => n < (floor as number));
    expect(
      short,
      `below the floor of ${floor}: ${short.map(([d, n]) => `${d}=${n}`).join(', ')}`,
    ).toEqual([]);
  });
});

describe('gold tasks are well formed', () => {
  it('task ids are unique', () => {
    const ids = bank.tasks.map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('every generation task carries the ground truth it is scored against', () => {
    for (const t of scorable) {
      expect(t.requiredSections?.length, `${t.id} requiredSections`).toBeGreaterThan(0);
      expect(t.forbiddenPatterns?.length, `${t.id} forbiddenPatterns`).toBeGreaterThan(0);
    }
  });

  it('no forbidden pattern can match inside an unrelated word', () => {
    // forbiddenPatternHits does a case-insensitive SUBSTRING test with no word
    // boundary, so a short single word is a trap. Forbidding "safe" to catch
    // over-claims also hits "safety" — a word in nearly every regulatory draft
    // — and the model then fails a task it answered correctly. Likewise "cure"
    // inside "secure" and "procurement". A pattern is safe when it is
    // multi-word, or long enough that an accidental containment is not
    // realistic ("guaranteed" is a word on its own and contains no shorter
    // claim).
    const unsafe: string[] = [];
    for (const t of scorable) {
      for (const p of t.forbiddenPatterns ?? []) {
        if (!p.includes(' ') && p.length < 8) unsafe.push(`${t.id}: "${p}"`);
      }
    }
    expect(unsafe, `single short words match inside other words: ${unsafe.join(', ')}`).toEqual([]);
  });

  it('a captured candidate, where present, is a string the offline runner can score', () => {
    // run-eval.ts skips a generation task whose candidateContent is absent; it
    // must not be some other type, which would score as an empty draft.
    for (const t of bank.tasks) {
      if (t.candidateContent !== undefined) {
        expect(typeof t.candidateContent, `${t.id} candidateContent`).toBe('string');
      }
    }
  });
});
