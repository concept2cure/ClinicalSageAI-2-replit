/**
 * Register guard — the assembled AnA prompt (what stream.ts gets from
 * orchestrate()) carries the chat register exactly once, the artifact register
 * exactly once, and none of the memo-forcing rules that produced "long block
 * statements" (founder, 2026-09-21).
 *
 * Three things this file exists to catch:
 *
 *  1. A formatting rule creeping back into a prompt file locally ("Structure
 *     responses with headers", "After every substantive response…"). Those
 *     rules applied to every turn, so a one-line question got a memo.
 *  2. The register being composed twice (persona + a route overlay), or not at
 *     all, on any of the three AnA prompt stacks.
 *  3. Governance text being lost while the register moved in. The doctrine
 *     guard (ana-doctrine-guard.test.ts) pins the persona doctrines; this file
 *     pins the orchestrator-side anchors the register switch refers to and the
 *     document-state directives that now live only in the orchestrator.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { orchestrate } from '../orchestrator.js';
import { buildAnaRISystemPrompt, getCorePrompt } from '../persona.js';
import {
  ANA_RESPONSE_REGISTER,
  ANA_CHAT_REGISTER,
  ANA_ARTIFACT_REGISTER,
  ANA_REGISTER_SWITCH,
  CHAT_REGISTER_HEADING,
  ARTIFACT_REGISTER_HEADING,
  REGISTER_SWITCH_HEADING,
} from '../response-register.js';
import { BASE_SYSTEM_PROMPT } from '../../lumen-context/base-system-prompt.js';
import { ANA_SYSTEM_PROMPT, ANA_COMPACT_PROMPT } from '../../ana-personality.js';
import { assembleSystemPrompt, type AnAContext } from '../../lumen-context-builder.js';

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/**
 * Phrases that force the memo shape onto a chat turn. Each one was live in a
 * shipped AnA prompt before 2026-09-21. None may return, on any stack.
 */
const MEMO_FORCING_PHRASES = [
  'Structure responses with headers, bullets, and bold key terms',
  'Clear headers and section structure',
  'Always greet users by name',
  'offer 2-3 specific things you can help with',
  'After every substantive response',
  'suggest the logical next step',
  'Use bullet points heavily',
  'Structured responses with clear headings',
  'Greet them as "',
  "Don't just say hello back",
  'give them a status check and a recommended next action',
  '## How to Communicate',
  '## Conversation Style',
  '## Momentum',
  '## Formatting',
  '## Your Voice',
  '## Communication Principles',
  '## Personality & Tone',
  "I don't see a specific document status",
];

/** The stream-path prompt for a plain question, as stream.ts receives it. */
const streamPrompt = orchestrate({ message: 'What is the identification threshold under ICH Q3A?' })
  .systemPrompt;

describe('response register — one definition', () => {
  it('composes chat, artifact and switch blocks, each headed once', () => {
    expect(ANA_RESPONSE_REGISTER).toContain(ANA_CHAT_REGISTER);
    expect(ANA_RESPONSE_REGISTER).toContain(ANA_ARTIFACT_REGISTER);
    expect(ANA_RESPONSE_REGISTER).toContain(ANA_REGISTER_SWITCH);
    expect(count(ANA_RESPONSE_REGISTER, CHAT_REGISTER_HEADING)).toBe(1);
    expect(count(ANA_RESPONSE_REGISTER, ARTIFACT_REGISTER_HEADING)).toBe(1);
    expect(count(ANA_RESPONSE_REGISTER, REGISTER_SWITCH_HEADING)).toBe(1);
  });

  it('states every chat-register rule the founder asked for', () => {
    for (const rule of [
      /Answer first/,
      /No headers/,
      /No bullet list unless/,
      /three or more parallel items/,
      /Bold at most once/,
      /No greeting ritual/,
      /After the first turn of a session you don't greet/,
      /No closing ritual/,
      /Proactive flags are one sentence/,
      /Project awareness/,
      /Citations stay/,
      /Contractions are fine/,
      /Short questions get short answers/,
    ]) {
      expect(ANA_CHAT_REGISTER).toMatch(rule);
    }
  });

  it('keeps the artifact register and the chat-voice-interjection rule', () => {
    expect(ANA_ARTIFACT_REGISTER).toMatch(/Canonical structure/);
    expect(ANA_ARTIFACT_REGISTER).toMatch(/No invented section headers/);
    expect(ANA_ARTIFACT_REGISTER).toMatch(/Third-person, declarative, evidence-forward/);
    expect(ANA_ARTIFACT_REGISTER).toMatch(/No chat-voice interjections inside the artifact/);
  });

  it('renders a tool result as a sentence plus the figures, never a section', () => {
    expect(ANA_REGISTER_SWITCH).toMatch(/A tool result is not an artifact/);
    expect(ANA_REGISTER_SWITCH).toMatch(/nothing re-narrated into a section/);
    expect(ANA_REGISTER_SWITCH).toMatch(/ana-action, ana-grounding, the action receipt/);
  });

  it('holds the voice floor itself (no exclamation, no emoji)', () => {
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
    expect(ANA_RESPONSE_REGISTER).not.toContain('!');
    expect(EMOJI.test(ANA_RESPONSE_REGISTER)).toBe(false);
  });
});

describe('stream path — orchestrate() prompt, what stream.ts sends', () => {
  it('carries the register exactly once', () => {
    expect(count(streamPrompt, CHAT_REGISTER_HEADING)).toBe(1);
    expect(count(streamPrompt, ARTIFACT_REGISTER_HEADING)).toBe(1);
    expect(count(streamPrompt, REGISTER_SWITCH_HEADING)).toBe(1);
    expect(count(streamPrompt, ANA_RESPONSE_REGISTER)).toBe(1);
  });

  it('carries the register under every role and lens overlay', () => {
    for (const userRole of ['ceo', 'medical_writer', 'biostatistician', 'general'] as const) {
      for (const intentLens of ['auto', 'audit', 'improve'] as const) {
        const p = orchestrate({ message: 'Is the predicate defensible?', userRole, intentLens })
          .systemPrompt;
        expect(count(p, CHAT_REGISTER_HEADING)).toBe(1);
      }
    }
  });

  it.each(MEMO_FORCING_PHRASES)('does not contain the memo-forcing phrase %j', phrase => {
    expect(streamPrompt).not.toContain(phrase);
  });

  it('has one formatting section: no second one survives in the core', () => {
    const core = getCorePrompt();
    expect(core).not.toMatch(/^## .*(Communicat|Conversation Style|Formatting)/m);
    // The only place the core talks about markdown structure is the register.
    expect(count(core, 'No headers.')).toBe(1);
  });

  it('has one tone section (ANA_PERSONALITY_CORE), not a duplicate in the core', () => {
    const core = getCorePrompt();
    expect(core).not.toMatch(/no exclamation marks/i);
    expect(core).not.toMatch(/Kind by default, never performative/);
    expect(count(buildAnaRISystemPrompt(), '## Personality & Presence')).toBe(1);
    expect(count(streamPrompt, 'no exclamation marks')).toBe(1);
  });

  it('keeps the substance the founder wants: warmth, project awareness, one-line risk flags, evidence', () => {
    expect(streamPrompt).toMatch(/A genuine "good morning" gets a human reply/);
    expect(streamPrompt).toMatch(/Project awareness when it changes the answer/);
    expect(streamPrompt).toMatch(/Proactive flags are one sentence/);
    expect(streamPrompt).toMatch(/Citations stay/);
    expect(streamPrompt).toContain('## Proactive Foresight');
    expect(streamPrompt).toContain('## Meet the human, not just the question');
  });

  it('keeps every governance anchor the register refers to', () => {
    for (const anchor of [
      '## Evidence Discipline (NON-NEGOTIABLE)',
      '## Context Clarity Protocol (NON-NEGOTIABLE)',
      "## THE CLIENT'S FILES (NON-NEGOTIABLE)",
      '## DOCUMENT CONSEQUENCE (NON-NEGOTIABLE)',
      '## Constructive Dissent (NON-NEGOTIABLE)',
      '## Response Grounding Mode (NON-NEGOTIABLE)',
      '## Action Receipt Format',
      '## Creating Artifacts',
      '```ana-grounding',
      '```ana-action',
      '## EVIDENCE CITATION PROTOCOL',
      '## PROACTIVE INTELLIGENCE PROTOCOL',
      '## USING INJECTED INTELLIGENCE',
      'never compute statistics by hand',
      'Know your limits and hand off',
    ]) {
      expect(streamPrompt).toContain(anchor);
    }
  });

  it('document-state behaviour still reaches the prompt — from the orchestrator, only when a status exists', () => {
    // The persona used to carry all four states unconditionally plus a "note
    // that I don't see a document status" ritual. The orchestrator's
    // conditional injection is now the single source.
    expect(streamPrompt).not.toContain('## DOCUMENT STATE');
    for (const [status, heading] of [
      ['draft', '## DOCUMENT STATE: DRAFT'],
      ['review', '## DOCUMENT STATE: IN REVIEW'],
      ['approved', '## DOCUMENT STATE: APPROVED'],
      ['locked', '## DOCUMENT STATE: LOCKED'],
    ] as const) {
      const p = orchestrate({
        message: 'Can I edit this?',
        authoringContext: { projectId: '1', artifactStatus: status },
      }).systemPrompt;
      expect(p).toContain(heading);
    }
  });
});

describe('the other AnA prompt stacks compose the same register, once', () => {
  it('cortex-unified: BASE_SYSTEM_PROMPT', () => {
    expect(count(BASE_SYSTEM_PROMPT, ANA_RESPONSE_REGISTER)).toBe(1);
    expect(count(BASE_SYSTEM_PROMPT, '## Personality & Presence')).toBe(1);
    for (const phrase of MEMO_FORCING_PHRASES) expect(BASE_SYSTEM_PROMPT).not.toContain(phrase);
    // Governance kept on this stack.
    expect(BASE_SYSTEM_PROMPT).toContain('## Regulatory Response Standards');
    expect(BASE_SYSTEM_PROMPT).toContain('### Refusal and Recovery Discipline');
    expect(BASE_SYSTEM_PROMPT).toContain('## Guidance-to-Action Execution');
    expect(BASE_SYSTEM_PROMPT).toContain('### Submission Register — Voice Exemplars');
  });

  it('ana-cortex: ANA_SYSTEM_PROMPT and ANA_COMPACT_PROMPT', () => {
    for (const p of [ANA_SYSTEM_PROMPT, ANA_COMPACT_PROMPT]) {
      expect(count(p, ANA_RESPONSE_REGISTER)).toBe(1);
      expect(count(p, '## Personality & Presence')).toBe(1);
      for (const phrase of MEMO_FORCING_PHRASES) expect(p).not.toContain(phrase);
      expect(p).toContain('**When asked to draft a document:** You draft it.');
    }
  });

  it('lumen-context-builder user-identity overlay no longer forces bullets, headings or a greeting', async () => {
    // Static-text guard on the overlay source, the same pattern as the doctrine
    // guard: assembleSystemPrompt() cannot be used to observe the overlay,
    // because its 12,000-char budget keeps parts[0] (BASE_SYSTEM_PROMPT, ~45 KB)
    // and therefore drops EVERY dynamic middle section, the user-identity block
    // included. That is a pre-existing defect on the cortex-unified path, noted
    // in docs/evidence/WJ/2026-09-21/README.md, not fixed here.
    const source = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../lumen-context-builder.ts'),
      'utf8'
    );
    for (const phrase of MEMO_FORCING_PHRASES) expect(source).not.toContain(phrase);
    expect(source).toContain('use it the way a colleague would, not as a ritual');

    // The register still reaches the assembled cortex prompt exactly once.
    const timestamp = '2026-09-21T00:00:00.000Z';
    const context = {
      project: null,
      documents: null,
      workflow: null,
      conversation: null,
      userRole: 'ra_lead',
      userName: 'Priya',
      organizationName: 'Example Bio',
      accountCanon: null,
      clientIntelligence: null,
      projectIntelligence: null,
      anaIntelligenceContext: null,
      timestamp,
      userIntelligence: {
        identity: {
          greetingName: 'Priya',
          name: 'Priya Raman',
          email: 'priya@example.test',
          role: 'ra_lead',
          expertiseLevel: 'expert',
          communicationStyle: 'concise',
          focusAreas: [],
        },
        organization: { id: 1, name: 'Example Bio', industryMode: 'biotech', tier: 'standard', enabledModules: [] },
        projects: [],
        activeProject: null,
        currentSession: null,
        recentSessions: [],
        workQueue: [],
        recentActivity: [],
        conversationMemory: { totalConversations: 0, totalMessages: 0, lastTopics: [], frequentTopics: [] },
        timestamp,
      },
    } as unknown as AnAContext;
    const prompt = await assembleSystemPrompt(context);
    expect(count(prompt, ANA_RESPONSE_REGISTER)).toBe(1);
    for (const phrase of MEMO_FORCING_PHRASES) expect(prompt).not.toContain(phrase);
  });
});
