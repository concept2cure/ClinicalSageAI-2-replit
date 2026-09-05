/**
 * A 510(k) is granted on FDA's determination of substantial equivalence, made
 * after reviewing a documented comparison of the subject device against a
 * predicate. The assembler must therefore NEVER render "the subject device is
 * substantially equivalent ..." as a settled conclusion — nor mark that section
 * complete — merely because a predicate device has been named and given a
 * K-number. That is a fabricated regulatory determination.
 *
 * Guards the fix in "fix(510k): stop asserting substantial equivalence from a
 * named predicate alone".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({ db: undefined }));
vi.mock('../SmartFieldLinking.js', () => ({ smartFieldLinking: {} }));
vi.mock('../CrossReferenceMapping.js', () => ({ default: class {} }));

import { DynamicContentAssembly } from '../DynamicContentAssembly';

const ORG = 1;
const PROJECT = 1;

function assemblerWithWorkflowData(workflowData: Record<string, unknown>) {
  const svc = new DynamicContentAssembly();
  // getWorkflowData is the sole DB read; stub it so the test exercises the real
  // section-assembly + validation logic with no database.
  vi.spyOn(svc as any, 'getWorkflowData').mockResolvedValue(workflowData);
  return svc;
}

describe('DynamicContentAssembly — substantial equivalence is not fabricated', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does NOT assert SE (nor mark it complete) from a named predicate alone', async () => {
    const svc = assemblerWithWorkflowData({
      device: { deviceName: 'AcmeScan', intendedUse: 'imaging', classification: 'II' },
      predicate: { deviceName: 'PriorScan', kNumber: 'K123456' },
      // NOTE: no equivalence.comparison / differencesRationale — no comparison
      // has actually been performed.
      labeling: { content: 'label' },
    });

    const assembly = await svc.assembleDocument(PROJECT, 'main_510k', ORG, {
      validateOnly: true,
    });
    const se = assembly.sections.find(s => s.id === 'substantial_equivalence');
    expect(se).toBeDefined();

    // The old template asserted the conclusion outright; the fix must not.
    expect(se!.content).not.toMatch(/subject device is substantially equivalent/i);

    // With the comparison absent, the section cannot be complete...
    expect(se!.completeness).not.toBe(100);
    expect(se!.missingFields).toEqual(
      expect.arrayContaining(['SE Comparison', 'SE Differences Rationale'])
    );

    // ...and the document as a whole must not validate as a finished filing.
    expect(assembly.metadata.validationStatus).toBe('error');
  });

  it('renders the SE comparison once an actual comparison is present', async () => {
    const svc = assemblerWithWorkflowData({
      device: { deviceName: 'AcmeScan', intendedUse: 'imaging', classification: 'II' },
      predicate: { deviceName: 'PriorScan', kNumber: 'K123456' },
      equivalence: {
        comparison: 'Identical intended use; same imaging modality and energy source.',
        differencesRationale: 'Minor firmware differences do not affect safety or effectiveness.',
      },
      labeling: { content: 'label' },
    });

    const assembly = await svc.assembleDocument(PROJECT, 'main_510k', ORG, {
      validateOnly: true,
    });
    const se = assembly.sections.find(s => s.id === 'substantial_equivalence')!;

    expect(se.completeness).toBe(100);
    expect(se.missingFields).toHaveLength(0);
    expect(se.content).toContain('PriorScan');
    expect(se.content).toContain('K123456');
    expect(se.content).toContain('Identical intended use');
    // No unfilled bracket tokens should remain in the finished section.
    expect(se.content).not.toMatch(/\[SE Comparison\]|\[Predicate Device\]|\[Predicate K Number\]/);
  });
});
