/**
 * The submission context an IND, NDA or BLA chat is given — one block, both
 * chat doors (chat-path-parity.test.ts pins the doors).
 *
 * Until 2026-10-05 POST /api/chat/send-message carried a hand-written
 * "## IND Submission Context" block. It fired for NDA and BLA projects and
 * told them "This is an IND"; it sent AnA to ind_generate_section and
 * ind_get_status, whose loopback calls carry no Authorization header and get
 * 401 on every call; it said "Module 1 first, then 2-5", which is not the
 * order the canonical NDA/BLA chain (plan_submission_from_database_lock)
 * gives; and its "complete IND structure" had no Investigator's Brochure.
 * The streaming door had no block at all.
 *
 * Evidence: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-submission-context-block-{red,green,facts}.*
 */
import { describe, expect, it } from 'vitest';
import { submissionContextBlockFor } from '../submission-context-block';
import { renderLifecycleBrief } from '../../ind/ctd/section-brief';
import { CLASSIFIED_TOOLS, HIDDEN_APP_TOOLS, anaCapabilityInLaunchScope } from '../ana-launch-scope';

const blockFor = (productType: string | undefined, extra: Record<string, unknown> = {}) =>
  submissionContextBlockFor({ projectContext: { productType, ...extra } });

/** Every `snake_case` token the block puts in backticks is a tool it names. */
const toolsNamedIn = (block: string): string[] =>
  Array.from(block.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g), (m) => m[1]);

describe('submissionContextBlockFor', () => {
  it('an IND block states the IB at 1.14.4.1, required unless the sponsor is a sponsor-investigator', () => {
    const block = blockFor('IND');
    expect(block).toContain('1.14.4.1');
    expect(block).toMatch(/sponsor-investigator/);
    expect(block).toContain('312.23(a)(5)');
    expect(block).toContain('312.55');
  });

  it('an IND block sends drafting through the canonical tools, not the retired ones', () => {
    const block = blockFor('IND');
    expect(block).not.toContain('ind_generate_section');
    expect(block).not.toContain('ind_get_status');
    expect(block).not.toMatch(/Module 1 first/i);
    expect(block).toContain('`get_document_section_requirements`');
    expect(block).toContain('`draft_authoring_document`');
    expect(block).toContain('`batch_draft_sections`');
    expect(block).toContain('`plan_ind_module_authoring`');
    // The database-lock chain is an NDA/BLA sequence; an IND is not told it.
    expect(block).not.toContain('plan_submission_from_database_lock');
  });

  it('an IND block carries the canonical initial-IND brief, not a second hand list', () => {
    const block = blockFor('IND');
    expect(block).toContain('Initial IND Application');
    expect(block).not.toMatch(/Complete IND structure/);
    // The brief's components, rendered from LIFECYCLE_DOCUMENT_TYPES.
    const brief = renderLifecycleBrief('ind_initial')!;
    const componentLine = brief.split('\n').find((l) => l.startsWith('- IB '))!;
    expect(componentLine).toBeTruthy();
    expect(block).toContain(componentLine);
  });

  it.each([
    ['NDA', 'New Drug Application (NDA)'],
    ['BLA', 'Biologics License Application (BLA)'],
  ])('a %s block is headed as a %s, never as an IND', (type, label) => {
    const block = blockFor(type);
    expect(block).toMatch(new RegExp(`^## ${type} submission context`, 'm'));
    expect(block).not.toMatch(/IND Submission Context|This is an IND/);
    expect(block).toContain(label);
    expect(block).not.toMatch(/Module 1 first/i);
    expect(block).toContain('`plan_submission_from_database_lock`');
    expect(block).toContain('`get_document_section_requirements`');
    expect(block).toContain('`draft_authoring_document`');
  });

  it.each(['IND', 'NDA', 'BLA'])('every tool the %s block names is a classified, in-scope AnA tool', (type) => {
    const tools = toolsNamedIn(blockFor(type));
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(CLASSIFIED_TOOLS.has(t), `${t} is not a classified AnA tool`).toBe(true);
      expect(anaCapabilityInLaunchScope(t, HIDDEN_APP_TOOLS), `${t} is out of launch scope`).toBe(true);
    }
  });

  it('names the open project when the client sends one', () => {
    const block = blockFor('NDA', { activeProject: 'Avelumab sNDA', projectId: 42 });
    expect(block).toContain('Project: Avelumab sNDA');
    expect(block).toContain('Project ID: 42');
  });

  it('an explicit submissionType is read when the context carries none', () => {
    const block = submissionContextBlockFor({ submissionType: 'BLA', projectContext: {} });
    expect(block).toMatch(/^## BLA submission context/m);
  });

  it.each(['MAA', 'CTA', 'JNDA', '510K', 'ANDA', '', undefined])(
    'fails closed for %s: no US block borrowed for another application',
    (type) => {
      expect(blockFor(type)).toBe('');
      expect(submissionContextBlockFor({ submissionType: type, projectContext: null })).toBe('');
    },
  );
});
