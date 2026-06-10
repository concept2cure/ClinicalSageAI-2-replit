import { describe, it, expect } from 'vitest';
import { buildModelCard, qualityTier, buildModelCardsDocument } from '../model-cards';
import { APPROVED_MODELS } from '../approved-models';
import { DEFAULT_MODELS } from '../../ai-gateway/gateway';
import type { ModelConfig } from '../../ai-gateway/types';

const opus = DEFAULT_MODELS.find(m => m.id === 'claude-opus-4') as ModelConfig;
const approvedOpus = APPROVED_MODELS.find(m => m.id === 'claude-opus-4');

describe('model cards', () => {
  it('qualityTier maps scores to tiers', () => {
    expect(qualityTier(99)).toBe('flagship');
    expect(qualityTier(95)).toBe('high');
    expect(qualityTier(85)).toBe('standard');
    expect(qualityTier(80)).toBe('economy');
  });

  it('builds a card carrying pinned version, role, intended use, and limitations', () => {
    const card = buildModelCard(opus, approvedOpus);
    expect(card.pinnedVersion).toBe('claude-opus-4-7');
    expect(card.role).toBe('primary');
    expect(card.qualityTier).toBe('flagship');
    expect(card.intendedUse).toContain('require human review');
    // Universal limitations must spell out the non-determinism + groundedness posture.
    expect(card.limitations.join(' ')).toContain('Non-deterministic');
    expect(card.limitations.join(' ')).toContain('groundedness');
    expect(card.evalStatus.versionPinned).toBe(true);
    expect(card.evalStatus.accuracyMeasuredPerDocType).toBe(false);
  });

  it('marks an unpinned model as such', () => {
    const card = buildModelCard(opus); // no approved entry
    expect(card.role).toBe('unpinned');
    expect(card.evalStatus.versionPinned).toBe(false);
  });

  it('renders a document covering every gateway model', () => {
    const doc = buildModelCardsDocument(DEFAULT_MODELS, APPROVED_MODELS);
    expect(doc).toContain('# Model cards');
    expect(doc).toContain('Drift gate');
    for (const m of DEFAULT_MODELS) {
      expect(doc).toContain(`## ${m.id}`);
    }
  });
});
