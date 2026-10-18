import { expect, it, vi } from 'vitest';
const { loaded, complete } = vi.hoisted(() => ({ loaded: vi.fn(), complete: vi.fn(async () => 'Study title page draft.') }));
vi.mock('../../lib/unified-ai-client.js', () => { loaded(); return { ai: { complete } }; });
import { draftCSRSectionWithProvenance, getICHE3Structure, type CSRBuildRequest } from '../csr-builder';
const request: CSRBuildRequest = {
  organizationId: 7, projectId: 11, userId: 2,
  studyInfo: { title: 'Synthetic study', protocolNumber: 'SYN-001', phase: 'Phase 1', indication: 'Synthetic indication',
    sponsor: 'Synthetic sponsor', investigationalProduct: 'Synthetic product', studyDesign: 'Synthetic study design', primaryEndpoint: 'Synthetic endpoint' },
};
const section = () => getICHE3Structure().find(row => row.number === '1')!;

it('reads canonical CSR outline metadata without initializing the provider client', () => {
  expect(section().title).toBe('Title Page');
  expect(loaded).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});
it('initializes on first actual drafting and keeps every concurrent call on the governed gateway envelope', async () => {
  const results = await Promise.all([draftCSRSectionWithProvenance(section(), request), draftCSRSectionWithProvenance(section(), request)]);
  expect(loaded).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledTimes(2);
  for (const [, options] of complete.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>) {
    expect(options).toMatchObject({ organizationId: 7, projectId: 11, userId: 2, taskType: 'document_drafting', callerModule: 'csr-builder/section-draft' });
  }
  expect(results.every(result => result.source === 'ai')).toBe(true);
});
it('keeps a provider refusal as an explicit template source instead of claiming AI output', async () => {
  complete.mockRejectedValueOnce(new Error('Synthetic provider refused drafting'));
  const result = await draftCSRSectionWithProvenance(section(), request);
  expect(result.source).toBe('template');
  expect(result.content).toContain('Synthetic study');
});
