/**
 * Tests for the submission-chat handler — post-draft, cross-dossier
 * provenance interrogation.
 *
 * Validates the pure helpers that don't require pool / gateway wiring:
 *   - parseModelResponse: tolerates fenced JSON, bare JSON, and prose-only
 *   - buildSystemPrompt: renders the dossier manifest + evidence block
 *   - isPostSectionGenerationTurn: detects when chat should auto-flip
 */

import { describe, it, expect } from 'vitest';
import {
  parseModelResponse,
  buildSystemPrompt,
  isPostSectionGenerationTurn,
  type CitationRelationship,
} from '../ana/submission-chat-handler';

describe('submission-chat-handler · parseModelResponse', () => {
  it('parses a clean JSON envelope with structured citations', () => {
    const raw = JSON.stringify({
      answer: 'The median age is 47 [SRC-1] and confirmed in [SRC-2].',
      citations: [
        { ref: 1, relationship: 'supports' },
        { ref: 2, relationship: 'supports' },
      ],
    });
    const out = parseModelResponse(raw);
    expect(out.answer).toContain('median age');
    expect(out.citations).toHaveLength(2);
    expect(out.citations[0].relationship).toBe('supports');
  });

  it('parses JSON wrapped in ```json fences', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        answer: 'IB §4.3 disagrees with Protocol §5.1 [SRC-3].',
        citations: [{ ref: 3, relationship: 'contradicts' }],
      }) +
      '\n```';
    const out = parseModelResponse(raw);
    expect(out.citations[0].relationship).toBe('contradicts');
  });

  it('coerces unknown relationship strings to supports', () => {
    const raw = JSON.stringify({
      answer: 'Cited.',
      citations: [{ ref: 1, relationship: 'somethingelse' }],
    });
    const out = parseModelResponse(raw);
    expect(out.citations[0].relationship).toBe('supports');
  });

  it('maps "missing" / "silent" relationship synonyms to gap', () => {
    const raw = JSON.stringify({
      answer: 'No record found.',
      citations: [
        { ref: 1, relationship: 'missing' },
        { ref: 2, relationship: 'silent' },
      ],
    });
    const out = parseModelResponse(raw);
    const relationships = out.citations.map(c => c.relationship);
    expect(relationships).toEqual<CitationRelationship[]>(['gap', 'gap']);
  });

  it('drops citations with non-numeric refs', () => {
    const raw = JSON.stringify({
      answer: 'Cited.',
      citations: [
        { ref: 'abc', relationship: 'supports' },
        { ref: 2, relationship: 'supports' },
      ],
    });
    const out = parseModelResponse(raw);
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0].ref).toBe(2);
  });

  it('falls back to prose when JSON is malformed', () => {
    const raw = 'I cannot verify that from the dossier.';
    const out = parseModelResponse(raw);
    expect(out.answer).toBe(raw);
    expect(out.citations).toEqual([]);
  });

  it('extracts the JSON body even when the model adds a leading explanation', () => {
    const raw =
      'Sure, here is my response.\n\n' +
      JSON.stringify({
        answer: 'OK [SRC-1].',
        citations: [{ ref: 1, relationship: 'supports' }],
      });
    const out = parseModelResponse(raw);
    expect(out.answer).toBe('OK [SRC-1].');
    expect(out.citations).toHaveLength(1);
  });
});

describe('submission-chat-handler · buildSystemPrompt', () => {
  const activeArtifact = {
    id: 1,
    artifact_id: 'artifact_csr_001',
    project_id: 42,
    organization_id: 7,
    ctd_section: '5.3.5',
    title: 'Clinical Study Report',
    type: 'markdown',
    category: 'document',
  };
  const projectArtifacts = [
    activeArtifact,
    {
      id: 2,
      artifact_id: 'artifact_protocol_001',
      project_id: 42,
      organization_id: 7,
      ctd_section: '5.3.1',
      title: 'Study Protocol',
      type: 'markdown',
      category: 'document',
    },
    {
      id: 3,
      artifact_id: 'artifact_ib_001',
      project_id: 42,
      organization_id: 7,
      ctd_section: '1.14',
      title: 'Investigator Brochure',
      type: 'markdown',
      category: 'document',
    },
  ];
  const chunks = [
    {
      id: 'atom-a',
      title: 'Protocol §5.1',
      content: 'Median age was 47 years across the enrolled cohort.',
      score: 0.91,
      artifactId: 'artifact_protocol_001',
      sectionCode: '5.3.1',
      pageRef: 'p.12',
    },
  ];

  it('flags the active artifact and lists every sibling', () => {
    const prompt = buildSystemPrompt(activeArtifact, projectArtifacts, chunks);
    expect(prompt).toContain('artifact_csr_001');
    expect(prompt).toContain('(active)');
    expect(prompt).toContain('artifact_protocol_001');
    expect(prompt).toContain('artifact_ib_001');
  });

  it('renders evidence blocks with [SRC-n], section, and page refs', () => {
    const prompt = buildSystemPrompt(activeArtifact, projectArtifacts, chunks);
    expect(prompt).toContain('[SRC-1]');
    expect(prompt).toContain('artifact=artifact_protocol_001');
    expect(prompt).toContain('5.3.1');
    expect(prompt).toContain('p.12');
  });

  it('calls out a JSON output contract with relationship enum', () => {
    const prompt = buildSystemPrompt(activeArtifact, projectArtifacts, chunks);
    expect(prompt).toContain('"answer"');
    expect(prompt).toContain('"citations"');
    expect(prompt).toContain('supports');
    expect(prompt).toContain('contradicts');
    expect(prompt).toContain('gap');
  });

  it('handles the no-evidence case explicitly', () => {
    const prompt = buildSystemPrompt(activeArtifact, projectArtifacts, []);
    expect(prompt).toContain('no retrieved evidence');
  });
});

describe('submission-chat-handler · isPostSectionGenerationTurn', () => {
  it('flips to true when a generate_section action was executed', () => {
    expect(
      isPostSectionGenerationTurn(
        [{ role: 'assistant', content: 'short reply' }],
        [{ actionType: 'generate_section', executed: true }]
      )
    ).toBe(true);
  });

  it('does not flip on a planned-but-not-executed generation action', () => {
    expect(
      isPostSectionGenerationTurn(
        [{ role: 'assistant', content: 'short reply' }],
        [{ actionType: 'generate_section', executed: false }]
      )
    ).toBe(false);
  });

  it('detects a CTD section header in the assistant body', () => {
    const body =
      '## 9.2 Demographic and other baseline characteristics\n\n' +
      'A'.repeat(500) +
      '\n\nMedian age 47 years.';
    expect(
      isPostSectionGenerationTurn([{ role: 'assistant', content: body }])
    ).toBe(true);
  });

  it('detects §-prefixed section headers', () => {
    const body =
      '§4.1 Indications and usage\n\n' +
      'B'.repeat(450) +
      '\n\nThe indication is …';
    expect(
      isPostSectionGenerationTurn([{ role: 'assistant', content: body }])
    ).toBe(true);
  });

  it('returns false on a short conversational reply', () => {
    expect(
      isPostSectionGenerationTurn([
        { role: 'assistant', content: 'Sure, I can help with that.' },
      ])
    ).toBe(false);
  });

  it('returns false when there is no assistant turn yet', () => {
    expect(
      isPostSectionGenerationTurn([
        { role: 'user', content: 'Generate CSR §9.2.' },
      ])
    ).toBe(false);
  });

  it('looks at the most recent assistant turn, not the first', () => {
    const longSection =
      '## 5.3 Clinical study reports\n\n' + 'C'.repeat(500);
    expect(
      isPostSectionGenerationTurn([
        { role: 'assistant', content: 'old short reply' },
        { role: 'user', content: 'Generate it now.' },
        { role: 'assistant', content: longSection },
      ])
    ).toBe(true);
  });
});
