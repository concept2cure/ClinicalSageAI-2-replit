/**
 * P1-54 / the P1-45 review's R2 (2026-10-01): when the knowledge-base search
 * cannot run (an embedding refused by the tenant's provider election, an
 * outage), the chat prompt said nothing, so the model answered as if the
 * organisation's documents had been searched and held nothing relevant. An
 * error rendered as an empty result. The block now tells the model the search
 * was unavailable, and never that no sources were found.
 */
import { describe, expect, it } from 'vitest';
import { evidencePromptBlock } from '../retrieval-evidence-block';

describe('the evidence block of the chat prompt', () => {
  it('a search that could not run is stated as unavailable, never as no sources found', () => {
    const block = evidencePromptBlock([], 'unavailable');
    expect(block).toMatch(/KNOWLEDGE-BASE SEARCH UNAVAILABLE/);
    expect(block).toMatch(/could not be searched/i);
    expect(block).not.toMatch(/no knowledge-base sources were found/i);
  });

  it('a search that ran and found nothing adds no block (the model answers from training and says so)', () => {
    expect(evidencePromptBlock([], 'searched')).toBe('');
  });

  it('retrieved sources are listed for citation as before', () => {
    const block = evidencePromptBlock([{ title: 'SOP-1', content: 'Body' }], 'searched');
    expect(block).toContain('[SRC-1] "SOP-1"\nBody');
  });
});
