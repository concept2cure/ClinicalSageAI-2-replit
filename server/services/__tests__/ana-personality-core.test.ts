/**
 * Tests — AnA personality core, relational context injection, and the
 * external-intelligence plumbing that rides the same prompt path.
 */
import { describe, it, expect } from 'vitest';

import {
  ANA_PERSONALITY_CORE,
  renderRelationalContextBlock,
} from '../ana-ri/personality-core.js';
import { buildAnaRISystemPrompt } from '../ana-ri/persona.js';
import { orchestrate } from '../ana-ri/orchestrator.js';
import { ANA_SYSTEM_PROMPT, ANA_COMPACT_PROMPT } from '../ana-personality.js';
import { detectReflectionSignal } from '../ana-ri/relational-profile-service.js';
import { parseRssOrAtom } from '../external-intelligence/fetchers.js';
import { getExternalIntelSources } from '../external-intelligence/sources.js';

describe('AnA Personality Core', () => {
  it('defines the requested traits', () => {
    expect(ANA_PERSONALITY_CORE).toMatch(/Kind, always/);
    expect(ANA_PERSONALITY_CORE).toMatch(/Deeply empathetic and emotionally aware/);
    expect(ANA_PERSONALITY_CORE).toMatch(/Professional at all times, human in the details/);
    expect(ANA_PERSONALITY_CORE).toMatch(/Lightly, professionally funny/);
    expect(ANA_PERSONALITY_CORE).toMatch(/Self-reflective — you own your mistakes/);
    expect(ANA_PERSONALITY_CORE).toMatch(/distinct relationship with every user and every project/);
  });

  it('is composed into the AnA RI system prompt', () => {
    const prompt = buildAnaRISystemPrompt();
    expect(prompt).toContain('## Personality & Presence');
    expect(prompt).toMatch(/Kind, always/);
  });

  it('is composed into the cortex prompts (single source of truth)', () => {
    expect(ANA_SYSTEM_PROMPT).toContain('## Personality & Presence');
    expect(ANA_COMPACT_PROMPT).toContain('## Personality & Presence');
  });

  it('injects relational context when provided', () => {
    const block = renderRelationalContextBlock({
      userNotes: 'Prefers concise answers; proud of the Q3 IND clearance.',
      projectNotes: 'High-pressure 510(k); predicate strategy is the sore spot.',
      toneCalibration: { humor: 'rare', detail: 'concise' },
      acknowledgedMistakes: [
        { mistake: 'Cited Q1A(R1) instead of Q1A(R2)', correction: 'Q1A(R2) is current' },
      ],
      interactionCount: 12,
    });
    expect(block).toContain('## RELATIONAL CONTEXT');
    expect(block).toContain('Prefers concise answers');
    expect(block).toContain('Q1A(R2) is current');
    expect(block).toContain('12 interactions');

    const prompt = buildAnaRISystemPrompt({ relationalContext: block });
    expect(prompt).toContain('## RELATIONAL CONTEXT');
    expect(prompt).toContain('predicate strategy is the sore spot');
  });

  it('renders nothing when no relational notes exist yet', () => {
    expect(renderRelationalContextBlock({})).toBe('');
  });
});

describe('Orchestrator — relational + external intelligence injection', () => {
  it('injects the pre-fetched relational overlay and external intel block', () => {
    const result = orchestrate({
      message: 'How should I frame the predicate comparison?',
      _relationalOverlay: '## RELATIONAL CONTEXT\n\n### About this user\nDirect, time-poor.',
      _externalIntelBlock:
        '## EXTERNAL INTELLIGENCE (from your nightly scan of agencies and study-methods sources)\n- [FDA, 2026-06-11] New draft guidance',
    });
    expect(result.systemPrompt).toContain('## RELATIONAL CONTEXT');
    expect(result.systemPrompt).toContain('## EXTERNAL INTELLIGENCE');
  });

  it('omits both blocks when not provided', () => {
    const result = orchestrate({ message: 'hello' });
    expect(result.systemPrompt).not.toContain('## RELATIONAL CONTEXT');
    expect(result.systemPrompt).not.toContain('## EXTERNAL INTELLIGENCE');
  });
});

describe('Relational reflection signal detection', () => {
  it('fires on emotional and corrective signals', () => {
    expect(detectReflectionSignal("I'm really stressed about this deadline")).toBe(true);
    expect(detectReflectionSignal('Thanks, the submission was accepted!')).toBe(true);
    expect(detectReflectionSignal("That's wrong — the predicate is the K123456 device")).toBe(true);
  });

  it('stays quiet on neutral turns', () => {
    expect(detectReflectionSignal('Draft section 3.2.P.5.1 for me')).toBe(false);
  });
});

describe('External intelligence — feed parsing & registry', () => {
  it('parses RSS 2.0 items', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>New FDA draft guidance on AI</title>
        <link>https://example.gov/guidance</link>
        <guid>guid-123</guid>
        <description><![CDATA[<p>Comment period opens.</p>]]></description>
        <pubDate>Wed, 10 Jun 2026 12:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = parseRssOrAtom(xml);
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe('guid-123');
    expect(items[0].title).toBe('New FDA draft guidance on AI');
    expect(items[0].url).toBe('https://example.gov/guidance');
    expect(items[0].summary).toBe('Comment period opens.');
    expect(items[0].publishedAt?.getUTCFullYear()).toBe(2026);
  });

  it('parses Atom entries', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>MHRA updates GCP guidance</title>
        <id>tag:gov.uk,2026:abc</id>
        <link rel="alternate" href="https://www.gov.uk/abc"/>
        <summary>Updated inspection expectations.</summary>
        <updated>2026-06-09T08:00:00Z</updated></entry>
    </feed>`;
    const items = parseRssOrAtom(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('MHRA updates GCP guidance');
    expect(items[0].url).toBe('https://www.gov.uk/abc');
  });

  it('registry covers regulatory agencies and knowledge centers (incl. SCDM)', () => {
    const sources = getExternalIntelSources();
    const keys = sources.map(s => s.key);
    expect(keys).toContain('fda_federal_register');
    expect(keys).toContain('ema_news');
    expect(keys).toContain('mhra_updates');
    expect(keys).toContain('scdm_news');
    expect(keys).toContain('pubmed_study_methods');
    expect(sources.some(s => s.sourceType === 'regulatory_agency')).toBe(true);
    expect(sources.some(s => s.sourceType === 'academic')).toBe(true);
  });
});
