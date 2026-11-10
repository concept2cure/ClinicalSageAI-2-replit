/**
 * CSR demo rehearsal (2026-11-02, CDISC pilot): with no provider key, the development
 * gateway answers every drafting call with its fixed "Document Draft (Demo Mode)" text
 * (`deterministic: true`, model 'demo-mode'). Build 1 saved that text on 30 ICH E3
 * headings as an AI draft by 'demo-mode' (ai_generated true), and the section review
 * offered each one as a draft to send for review. A fixed reply is not a draft: the
 * section keeps its template, ai_generated false, and the lineage says why, as the
 * MCP drafting tool already refuses the same reply (server/mcp/tools/drafting.ts).
 */
import { expect, it, vi } from 'vitest';
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { chat: complete } }));
import { draftCSRSectionWithProvenance, getICHE3Structure, type CSRBuildRequest } from '../csr-builder';
import { workflowCopySectionContent } from '../authoring/workflow-copy-content';

const request: CSRBuildRequest = {
  organizationId: 7, projectId: 11, userId: 2,
  studyInfo: { title: 'Synthetic study', protocolNumber: 'SYN-001', phase: 'Phase 2', indication: 'Synthetic indication',
    sponsor: 'Synthetic sponsor', investigationalProduct: 'Synthetic product', studyDesign: 'Synthetic study design', primaryEndpoint: 'Synthetic endpoint' },
};
const section = () => getICHE3Structure().find(row => row.number === '7')!;
const FIXED = '## Document Draft (Demo Mode)\n\nNo draft was written. This is a fixed placeholder served in demo mode, and it must not be used.';

it('the gateway\'s fixed demo-mode reply is not saved as an AI draft', async () => {
  complete.mockResolvedValueOnce({ content: FIXED, provider: 'anthropic', model: 'demo-mode', deterministic: true, usage: { totalTokens: 21 } });
  const drafted = await draftCSRSectionWithProvenance(section(), request);
  expect(drafted.source).toBe('template');
  expect(drafted.model).toBeNull();
  expect(drafted.tokenCost).toBe(0);
  expect(drafted.content).not.toContain('Demo Mode');
  expect(drafted.lineage).toMatchObject({ rejectedModelDraft: { reason: 'no_model_provider' } });
});

it('any deterministic reply is refused the same way, whatever model it names', async () => {
  complete.mockResolvedValueOnce({ content: 'Fixed introduction text.', provider: 'anthropic', model: 'fixture-model', deterministic: true, usage: { totalTokens: 3 } });
  const drafted = await draftCSRSectionWithProvenance(section(), request);
  expect(drafted.source).toBe('template');
  expect(drafted.lineage).toMatchObject({ rejectedModelDraft: { reason: 'no_model_provider' } });
});

// The template's labelled fields reach the editor as separate paragraphs (2026-11-06). One newline apart, the
// import's Markdown joined them, and the working-copy PDF's title page read "Protocol Number: X Phase: Phase 2 …".
it.each([
  ['1', ['CLINICAL STUDY REPORT', 'Protocol Number: SYN-001', 'Phase: Phase 2', 'Indication: Synthetic indication', 'Sponsor: Synthetic sponsor', 'Investigational Product: Synthetic product']],
  ['2', ['Study Title: Synthetic study', 'Protocol Number: SYN-001', 'Study Phase: Phase 2', 'Indication: Synthetic indication', 'Sponsor: Synthetic sponsor']],
])('the template of section %s keeps each labelled field its own paragraph in the editor', async (number, fields) => {
  complete.mockResolvedValue({ content: FIXED, provider: 'anthropic', model: 'demo-mode', deterministic: true, usage: { totalTokens: 21 } });
  const row = getICHE3Structure().find(r => r.number === number)!;
  const drafted = await draftCSRSectionWithProvenance(row, request);
  expect(drafted.source).toBe('template');
  const html = workflowCopySectionContent(drafted.content);
  for (const field of fields) expect(html).toContain(`<p>${field}</p>`);
});

it('a provider\'s draft is still accepted as an AI draft', async () => {
  complete.mockResolvedValueOnce({ content: 'This report describes the Synthetic study of Synthetic product in Synthetic indication.',
    provider: 'anthropic', model: 'test-model', deterministic: false, usage: { totalTokens: 30 } });
  const drafted = await draftCSRSectionWithProvenance(section(), request);
  expect(drafted.source).toBe('ai');
  expect(drafted.model).toBe('test-model');
});
