import { describe, expect, it } from 'vitest';
import { parseRemedyAnswer } from '../authoringRemedies';
import { oversightPrompt } from '../authoringOversight';

const remedy = {
  sectionId: 'aaaaaaaa-0000-4000-8000-000000000001', baseSha256: 'a'.repeat(64),
  quote: 'The endpoint was met.', replacement: 'The primary endpoint difference was 12%.', reason: 'State the measured result with its source.',
};
const fenced = (p: unknown) => `Review findings.\n\n\`\`\`authoring-remedy\n${JSON.stringify(p)}\n\`\`\``;

describe('explicit, bounded authoring remedies', () => {
  it('only parses labelled complete JSON, leaving the review prose separate', () => {
    expect(parseRemedyAnswer(fenced(remedy))).toEqual({ prose: 'Review findings.', proposals: [remedy], errors: [], hasRemedies: true });
    expect(parseRemedyAnswer(JSON.stringify(remedy)).proposals).toEqual([]);
    expect(parseRemedyAnswer(fenced(remedy).replace('authoring-remedy', 'json')).proposals).toEqual([]);
  });

  it('accepts deletion and surrounding context, but rejects missing/invalid versions, identities and fields', () => {
    expect(parseRemedyAnswer(fenced({ ...remedy, replacement: '', prefix: 'Results: ', suffix: ' Further work follows.' })).proposals).toHaveLength(1);
    for (const invalid of [
      { ...remedy, sectionId: 'arbitrary section' },
      { ...remedy, baseSha256: undefined },
      { ...remedy, baseSha256: 'bogus' },
      { ...remedy, baseUpdatedAt: 'not a date' },
      { ...remedy, quote: '' },
      { ...remedy, replacement: remedy.quote },
      { ...remedy, reason: '' },
      { ...remedy, autoApprove: true },
      { ...remedy, replacement: 'x'.repeat(16001) },
      [remedy],
    ]) {
      const result = parseRemedyAnswer(fenced(invalid));
      expect(result.proposals).toEqual([]);
      expect(result.errors).toHaveLength(1);
    }
  });

  it('reports cut-off or excessive fixes without offering partial application', () => {
    const cutOff = parseRemedyAnswer(fenced(remedy).slice(0, -3));
    expect(cutOff.proposals).toEqual([]);
    expect(cutOff.errors[0]).toMatch(/cut off/);
    expect(parseRemedyAnswer(Array.from({ length: 7 }, () => fenced(remedy)).join('\n')).proposals).toEqual([]);
  });

  it('asks for saved, paged authoring and evidence reads, genuine bases and tracked proposals', () => {
    for (const action of ['section', 'document', 'evidence', 'fixes'] as const) {
      const prompt = oversightPrompt(action);
      expect(prompt).toMatch(/unsaved editor changes are not included/);
      expect(prompt).toContain('read_authoring_section');
      expect(prompt).toContain('nextCursor');
      expect(prompt).toContain('nextOffset');
      expect(prompt).toContain('read_project_document');
      expect(prompt).toContain('authoring-remedy');
      expect(prompt).toMatch(/Do not invent a base version/);
      expect(prompt).toMatch(/do not save, accept, approve or file/);
    }
    expect(oversightPrompt('document')).toContain('critique_document');
    expect(oversightPrompt('evidence')).toContain('every phase and its deliverables');
    expect(oversightPrompt('evidence')).toContain('get_document_section_requirements with document="ind_pyramid"');
  });
});
