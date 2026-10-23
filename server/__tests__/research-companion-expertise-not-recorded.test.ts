/**
 * The research companion does not invent the researcher's expertise level.
 *
 * Every new conversation was seeded with `expertiseLevel: 'intermediate'`, and
 * the prompt then told the model "Expertise level: intermediate" and asked it to
 * pitch its answer to "a intermediate expertise level" — a fact about the user
 * nobody stated. Unrecorded is now null, and the prompt says it is not recorded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryHuggingFace } = vi.hoisted(() => ({ queryHuggingFace: vi.fn() }));

vi.mock('shared/schema', () => ({ csrReports: {} }));
vi.mock('../db', () => ({ db: {} }));
vi.mock('../huggingface-service', () => ({ huggingFaceService: { queryHuggingFace }, HFModel: { TEXT: 'text' } }));
vi.mock('../academic-knowledge-service', () => ({ academicKnowledgeService: {} }));

import { researchCompanionService } from '../research-companion-service';

type Internals = { findRelevantCSRs: () => Promise<unknown[]>; findRelevantAcademicSources: () => Promise<unknown[]> };

beforeEach(() => {
  queryHuggingFace.mockReset();
  queryHuggingFace.mockResolvedValue('An answer.');
  const svc = researchCompanionService as unknown as Internals;
  vi.spyOn(svc, 'findRelevantCSRs').mockResolvedValue([]);
  vi.spyOn(svc, 'findRelevantAcademicSources').mockResolvedValue([]);
});

describe('research companion: expertise is recorded or it is "not recorded"', () => {
  it('a new conversation records no expertise level', async () => {
    const conversation = await researchCompanionService.createConversation();
    expect(conversation.memory.userPreferences.expertiseLevel).toBeNull();
  });

  it('the prompt says the expertise level is not recorded, and assumes none', async () => {
    const { id } = await researchCompanionService.createConversation();
    await researchCompanionService.addMessageToConversation(id, 'What endpoints suit a phase 2 NASH trial?');
    const prompt = String(queryHuggingFace.mock.calls[0]?.[0]);
    expect(prompt).toContain('Expertise level: not recorded');
    expect(prompt).not.toMatch(/intermediate/i);
  });

  it('control: a stated expertise level reaches the prompt', async () => {
    const { id } = await researchCompanionService.createConversation();
    await researchCompanionService.updateUserPreferences(id, { expertiseLevel: 'expert' });
    await researchCompanionService.addMessageToConversation(id, 'What endpoints suit a phase 2 NASH trial?');
    const prompt = String(queryHuggingFace.mock.calls[0]?.[0]);
    expect(prompt).toContain('Expertise level: expert');
    expect(prompt).toContain('appropriate for a expert expertise level');
  });
});
