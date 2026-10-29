/**
 * planCsrLifecycle / lifecycleRefusal, pure (adversarial review, 2026-10-30, D2).
 * The user's choice to withdraw an earlier CSR file in the target sequence:
 * only a file the assembly leaves out, or one of two current files for one
 * part, may be named; naming it resolves that part; anything else is refused.
 */
import { expect, it } from 'vitest';
import { lifecycleRefusal, planCsrLifecycle, type PriorCsrStudyLeaf } from '../csr-placement-lifecycle';
import type { AssemblyLeafSummary } from '../csr-assembly-run';

const prior = (leafId: number, appendix: string | null, sequenceNumber: string, stfFileTag = 'study-report'): PriorCsrStudyLeaf => ({
  leafId, sequenceId: Number(sequenceNumber), sequenceNumber, title: `Leaf ${leafId}`, stfFileTag, appendix, withdrawnHere: false,
  sectionCode: 'm5.3.5.1', documentTable: 'rendered_leaf_files', documentId: leafId + 1000, studyId: 'SYN-1' });
const body = { appendix: 'body', fileName: 'csr-body.pdf', title: 'Body' } as AssemblyLeafSummary;

it('resolves two current bodies only when the user withdraws the one no longer current (SYNTHETIC)', () => {
  const earlier = [prior(700, 'body', '0001'), prior(701, 'body', '0002')];
  const open = planCsrLifecycle([body], earlier, { keepOnFile: [] });
  expect(lifecycleRefusal(open, 'SYN-1', [])).toMatchObject({ code: 'CSR_PLACEMENT_PREDECESSOR_AMBIGUOUS' });
  const chosen = planCsrLifecycle([body], earlier, { keepOnFile: [], withdraw: [700] });
  expect(lifecycleRefusal(chosen, 'SYN-1', [])).toBeNull();
  expect(chosen.leaves[0]).toMatchObject({ operation: 'replace', parent: { leafId: 701 } });
  expect(chosen.withdrawing.map(p => p.leafId)).toEqual([700]);
});

it('refuses to withdraw a file the assembly still replaces, or one that is not the study\'s (SYNTHETIC)', () => {
  const earlier = [prior(700, 'body', '0001')];
  for (const withdraw of [[700], [999]]) {
    const plan = planCsrLifecycle([body], earlier, { keepOnFile: [], withdraw });
    expect(lifecycleRefusal(plan, 'SYN-1', [])).toMatchObject({ code: 'CSR_PLACEMENT_WITHDRAW_INVALID' });
    expect(plan.withdrawing).toEqual([]);
  }
});
