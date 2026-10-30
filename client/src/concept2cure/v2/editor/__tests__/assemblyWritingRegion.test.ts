// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AssemblyPlan, AssemblyPreviewInput } from '@shared/authoring/assembly';
import { readAssemblyPlan } from '../assemblyBuildTransport';

const input: AssemblyPreviewInput = { programId: 'program', templateId: 'template', selection: { target: 'document' } };
function plan(region: string | null): AssemblyPlan {
  return { version: 1, docId: 'document', programId: input.programId, templateId: input.templateId, selection: input.selection,
    targetSnapshot: 'target', templateSnapshot: 'template', fingerprint: 'fingerprint', templateName: 'Recorded outline',
    draftRegion: region, limitations: ['Writing label only; verify actual regional requirements.'], gaps: [],
    rows: [{ code: '3', title: 'Quality', content: '', ordering: 0, disposition: 'append', aiDraftable: false,
      aiDraftableReason: 'Structure alone grants no drafting authority.', gaps: [] }] };
}

describe('assembly receipt recognizes shared writing labels without granting template eligibility', () => {
  it.each(['MHRA', 'NMPA', 'MFDS', 'TGA', 'Swissmedic', 'ANVISA', 'CDSCO', 'HSA'])(
    'retains a recorded %s writing label and the independent manual preparation constraint', region => {
      const expected = plan(region);
      expect(readAssemblyPlan(expected, 'document', input)).toEqual(expected);
      expect(readAssemblyPlan(expected, 'document', input)?.rows[0].aiDraftable).toBe(false);
    });
  it.each([null, 'FDA', 'Health Canada', 'EMA', 'PMDA'])('retains existing %s receipts', region => {
    const expected = plan(region); expect(readAssemblyPlan(expected, 'document', input)).toEqual(expected);
  });
  it.each(['GLOBAL', 'unrecognised', ''])('refuses a purported %s writing agency instead of assuming FDA', region => {
    expect(readAssemblyPlan(plan(region), 'document', input)).toBeNull();
  });
});
