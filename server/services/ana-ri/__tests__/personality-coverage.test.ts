/**
 * AnA's personality is a product requirement, not a nicety — and it has to
 * hold on EVERY surface she speaks from.
 *
 * Two failures this file exists to prevent:
 *
 *  1. A named trait quietly disappearing from the core block. AnA is specified
 *     as warm, intellectual, kind and lightly funny; a prompt edit that drops
 *     one is invisible in review and only shows up as "she feels different".
 *
 *  2. A surface shipping with no personality at all. That had already happened:
 *     submission chat (both the buffered and streaming builders) opened with
 *     "You are AnA in submission-chat mode" and carried nothing of her voice,
 *     so she read as a warm colleague in one panel and a terse extraction
 *     engine in the next. Anything that assembles a system prompt for AnA must
 *     include either the full core block or the compact brief.
 */

import { describe, expect, it } from 'vitest';

import { ANA_PERSONALITY_BRIEF, ANA_PERSONALITY_CORE } from '../personality-core';
import { buildAnaRISystemPrompt } from '../persona';
import {
  buildSystemPrompt,
  buildStreamingSystemPrompt,
  type ArtifactRow,
} from '../../ana/submission-chat-handler';

/** The traits the product specifies. Each maps to a phrase in the core block. */
const REQUIRED_TRAITS: Array<{ trait: string; marker: RegExp }> = [
  { trait: 'kind', marker: /\*\*Kind, always\.\*\*/ },
  { trait: 'warm / empathetic', marker: /\*\*Deeply empathetic and emotionally aware\.\*\*/ },
  { trait: 'intellectual', marker: /\*\*Intellectually alive\.\*\*/ },
  { trait: 'lightly humorous', marker: /\*\*Lightly, professionally funny\.\*\*/ },
  { trait: 'self-reflective', marker: /\*\*Self-reflective — you own your mistakes\.\*\*/ },
];

describe('ANA_PERSONALITY_CORE', () => {
  it.each(REQUIRED_TRAITS)('defines the "$trait" trait', ({ marker }) => {
    expect(ANA_PERSONALITY_CORE).toMatch(marker);
  });

  it('holds the guardrails that keep warmth from becoming performance', () => {
    // The failure mode of "give her a personality" is an assistant that
    // exclaims and cheerleads. The core block has to forbid that explicitly,
    // or the trait list above produces exactly the wrong thing.
    expect(ANA_PERSONALITY_CORE).toMatch(/no exclamation marks/i);
    expect(ANA_PERSONALITY_CORE).toMatch(/never at the user's expense/i);
    expect(ANA_PERSONALITY_CORE).toMatch(/never about patients or safety/i);
  });
});

describe('ANA_PERSONALITY_BRIEF', () => {
  it('is a compression of the core, carrying the same named traits', () => {
    // The brief is a second rendering of one character, not a second
    // character. If a trait exists in only one of the two, AnA is literally
    // a different person depending on which panel you opened.
    expect(ANA_PERSONALITY_BRIEF).toMatch(/kind/i);
    expect(ANA_PERSONALITY_BRIEF).toMatch(/intellectually alive/i);
    expect(ANA_PERSONALITY_BRIEF).toMatch(/warm/i);
    expect(ANA_PERSONALITY_BRIEF).toMatch(/dry aside|funny|humou?r/i);
    expect(ANA_PERSONALITY_BRIEF).toMatch(/no exclamation marks/i);
  });

  it('stays short enough for a prompt already carrying a strict schema', () => {
    // It exists because the full block is too long for these surfaces. If it
    // grows to the size of the thing it replaces, it has stopped being a fix.
    expect(ANA_PERSONALITY_BRIEF.length).toBeLessThan(ANA_PERSONALITY_CORE.length / 2);
  });

  it('subordinates itself to the output contract', () => {
    // These surfaces must still emit valid JSON. The voice block has to say so
    // itself, or it competes with the schema instead of decorating it.
    expect(ANA_PERSONALITY_BRIEF).toMatch(/never overrides the output contract/i);
  });
});

describe('every AnA surface carries her personality', () => {
  it('the RI system prompt embeds the full core block', () => {
    expect(buildAnaRISystemPrompt()).toContain(ANA_PERSONALITY_CORE);
  });

  it('the RI system prompt keeps her personality under every role overlay', () => {
    // Role overlays are appended per turn. A future overlay that replaced
    // rather than extended the prompt would strip her voice for that role only
    // — the kind of gap that shows up for one customer and nobody else.
    for (const role of ['ceo', 'medical_writer', 'biostatistician', 'general'] as const) {
      expect(buildAnaRISystemPrompt({ userRole: role })).toContain(ANA_PERSONALITY_CORE);
    }
  });

  const artifact = {
    id: 1,
    artifact_id: 'ART-1',
    project_id: 1,
    organization_id: 1,
    title: 'Clinical Overview',
    ctd_section: '2.5',
  } as ArtifactRow;

  it('the submission-chat prompt carries the brief', () => {
    // The regression: this builder used to open straight into
    // "You are AnA in submission-chat mode" with no voice at all.
    expect(buildSystemPrompt(artifact, [artifact], [])).toContain(ANA_PERSONALITY_BRIEF);
  });

  it('the streaming submission-chat prompt carries the brief', () => {
    expect(buildStreamingSystemPrompt(artifact, [artifact], [])).toContain(
      ANA_PERSONALITY_BRIEF
    );
  });

  it('the submission-chat prompts still state their output contract', () => {
    // Guards the other direction: personality must not have displaced the
    // schema instructions these surfaces depend on.
    expect(buildSystemPrompt(artifact, [artifact], [])).toMatch(/JSON/);
    expect(buildStreamingSystemPrompt(artifact, [artifact], [])).toMatch(/JSON/);
  });
});
