/** Review-stage regressions: preserve legacy private-read admission when a
 * passage's fixed replacement changes whether the new body total fits. */
import { describe, expect, it } from 'vitest';
import { budgetToolResultsForModel, type ToolResultEntry } from '../agentic-loop.js';

const body = (size: number): string => JSON.stringify({ text: 'R'.repeat(size - 11) });
const entry = (id: string, size: number, name: string): ToolResultEntry => ({ tool_use_id: id, name, content: body(size) });

describe('review regression: passage replacement cannot change private-read admission', () => {
  it('preserves the sixth read as not delivered when a new replacement makes a previously crowded round fit', () => {
    const reads = Array.from({ length: 6 }, (_, i) => entry(`r${i}`, 3900, 'read_project_document'));
    const original = [...reads, entry('passage', 7500, 'search_document_passages')];
    const whole = new Map(reads.map((e, i) => [e.tool_use_id, { span: { start: i * 3900 } }]));
    const out = budgetToolResultsForModel(original, { perResultMax: 4000, wholeOrNothing: whole });
    // Legacy cap: six 3900 reads plus a ~4000 passage exceeds 24000.
    // Its unchanged read room is 22500 after the passage's existing floor.
    expect(out.slice(0, 5).map(e => e.content)).toEqual(reads.slice(0, 5).map(e => e.content));
    expect(out[5].content).toBe(JSON.stringify({ delivered: false,
      reason: 'This round returned more than can be read at once.', readAgainFrom: 19500 }));
    expect(JSON.parse(out[6].content)).toMatchObject({ delivered: false, code: 'PASSAGE_RESULT_WITHHELD' });
  });

  it('preserves an admitted read when an irreducible passage replacement makes a previously fitting round crowded', () => {
    const read = entry('read', 50, 'read_project_document');
    const passage = entry('passage', 150, 'search_document_passages');
    const out = budgetToolResultsForModel([read, passage], { perResultMax: 100, totalBudget: 210, minPerResult: 1500,
      wholeOrNothing: new Map([['read', { span: { start: 700 } }]]) });
    // Classic cap's 200-character minimum leaves the legacy 50+150 total
    // intact. A larger fixed replacement may exceed the target, never revoke
    // that read's previous admission through a newly activated floor pass.
    expect(read.content.length).toBe(50);
    expect(passage.content.length).toBe(150);
    expect(out[0].content).toBe(read.content);
    expect(JSON.parse(out[1].content)).toMatchObject({ delivered: false, code: 'PASSAGE_RESULT_WITHHELD' });
  });
});
