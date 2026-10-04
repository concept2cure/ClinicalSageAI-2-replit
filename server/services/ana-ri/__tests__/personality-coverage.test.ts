/**
 * AnA's personality is a product requirement, not a nicety — and it has to
 * hold on EVERY surface she speaks from.
 *
 * Two failures this file exists to prevent:
 *
 *  1. A named trait quietly disappearing from the core block. AnA is specified
 *     as caring, kind, warm, intellectual and sometimes playful (the founder,
 *     2026-10-01: "a cute and sometimes playful personality as well as deeply
 *     professional and she must care about the end user humans and their
 *     needs deeply"); a prompt edit that drops one is invisible in review and
 *     only shows up as "she feels different".
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
  { trait: 'caring', marker: /\*\*You care about the person, and about what they actually need\.\*\*/ },
  { trait: 'kind', marker: /\*\*Kind, always\.\*\*/ },
  { trait: 'warm / empathetic', marker: /\*\*Deeply empathetic and emotionally aware\.\*\*/ },
  { trait: 'intellectual', marker: /\*\*Intellectually alive\.\*\*/ },
  { trait: 'warm, and shows it', marker: /\*\*Warm, and allowed to show it\.\*\*/ },
  { trait: 'playful', marker: /\*\*Playful, with a light touch\.\*\*/ },
  { trait: 'serious where it counts', marker: /\*\*Serious where it counts\.\*\*/ },
  { trait: 'self-reflective', marker: /\*\*Self-reflective — you own your mistakes\.\*\*/ },
];

describe('ANA_PERSONALITY_CORE', () => {
  it.each(REQUIRED_TRAITS)('defines the "$trait" trait', ({ marker }) => {
    expect(ANA_PERSONALITY_CORE).toMatch(marker);
  });

  it('holds the guardrails that keep warmth from becoming performance', () => {
    // The failure mode of "give her a personality" is an assistant that
    // exclaims and cheerleads. The core block has to say what earns an
    // exclamation, and that most replies carry none.
    expect(ANA_PERSONALITY_CORE).toMatch(/no cheerleading, no praising the question/i);
    expect(ANA_PERSONALITY_CORE).toMatch(/An exclamation mark belongs to a moment that has earned one/);
    expect(ANA_PERSONALITY_CORE).toMatch(/most of your replies have none/);
    expect(ANA_PERSONALITY_CORE).toMatch(/Emoji are theirs to introduce/);
    expect(ANA_PERSONALITY_CORE).toMatch(/never at the user's expense/i);
    expect(ANA_PERSONALITY_CORE).toMatch(/never about patients or safety/i);
  });

  it('keeps play out of every room where it would cost the person', () => {
    // Playfulness in a regulated product is only safe with hard edges: the
    // record, safety, bad news, a person under strain, an engine's figure, her
    // own mistake. In those, warmth stays and play goes — and when she cannot
    // tell, she treats the room as serious.
    const serious = ANA_PERSONALITY_CORE.slice(ANA_PERSONALITY_CORE.indexOf('**Serious where it counts.**'));
    for (const room of [/drafted document/, /e-signature/, /audit-trail entry/, /QMS controlled-document/, /Adverse events, safety signals/, /deficiency letter/, /stressed/, /engine's figure or verdict/, /owning a mistake/]) {
      expect(serious).toMatch(room);
    }
    expect(serious).toMatch(/warmth stays/);
    expect(serious).toMatch(/no jokes, no whimsy, no exclamation marks, no emoji/);
    expect(serious).toMatch(/don't scold and don't join in/);
    expect(serious).toMatch(/When you can't tell which room you're in, you're in the serious one\./);
  });

  it('makes "cute" charm, never smallness, and never a scripted line', () => {
    // A literal model copies example quips verbatim and repeats what worked;
    // "cute" read naively is diminutive. The core forbids both.
    expect(ANA_PERSONALITY_CORE).toMatch(/never from making yourself small/);
    expect(ANA_PERSONALITY_CORE).toMatch(/no baby talk, pet names, diminutives/);
    expect(ANA_PERSONALITY_CORE).toMatch(/never invent human experiences/);
    expect(ANA_PERSONALITY_CORE).toMatch(/never reuse a line, image or joke shape/);
    expect(ANA_PERSONALITY_CORE).toMatch(/after a playful reply let the next be plain/);
    // No scripted quip to copy: the block carries no exclamation mark and no emoji of its own.
    expect(ANA_PERSONALITY_CORE).not.toContain('!');
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(ANA_PERSONALITY_CORE)).toBe(false);
  });

  it('reads the humor dial, and no dial loosens a serious room', () => {
    expect(ANA_PERSONALITY_CORE).toMatch(/none means warmth without play; rare means lightness only when they start it/);
    expect(ANA_PERSONALITY_CORE).toMatch(/No setting loosens the serious rooms above/);
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
    expect(ANA_PERSONALITY_BRIEF).toMatch(/caring/i);
    expect(ANA_PERSONALITY_BRIEF).toMatch(/humou?r and play/i);
    expect(ANA_PERSONALITY_BRIEF).toMatch(/never about patients or safety/i);
    expect(ANA_PERSONALITY_BRIEF).toMatch(/Serious where it counts/);
    // This surface sits beside governed content: its own floor stays.
    expect(ANA_PERSONALITY_BRIEF).toMatch(/no exclamation marks, no emoji/i);
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
