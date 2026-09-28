/**
 * AnA's flagship is Claude Opus 5.5, with Opus 5 directly beneath it.
 *
 * The move is a registry change, and the registry is what every caller that
 * pins the flagship alias ('claude-opus-4' — drafting, the unified client, the
 * preclinical extractor) resolves through, so it is pinned here field by field
 * against Anthropic's model table for Opus 5.5:
 *
 *   $4 / $20 per MTok · 1M context · adaptive thinking that cannot be disabled
 *   · no sampling parameters · effort low–max, API default `medium` ·
 *   structured outputs · mid-conversation system messages.
 *
 * The rung below it is Opus 5, the previous flagship, so a request Opus 5.5
 * cannot serve — an outage, a model this account cannot reach yet, a classifier
 * decline — lands on the model that was reviewed as primary until this change,
 * not on Sonnet.
 */

import { describe, it, expect } from 'vitest';

import { DEFAULT_MODELS } from '../gateway';
import { apiEffortForModel } from '../effort';
import { APPROVED_MODELS, detectModelDrift } from '../../ai-governance/approved-models';

const byModel = (model: string) => DEFAULT_MODELS.find(m => m.model === model);

describe('the flagship slot serves Claude Opus 5.5', () => {
  const flagship = DEFAULT_MODELS.find(m => m.id === 'claude-opus-4');

  it('is pinned to claude-opus-5-5 with its documented surface', () => {
    expect(flagship).toMatchObject({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      contextWindow: 1_000_000,
      costPer1kInput: 0.004,
      costPer1kOutput: 0.02,
      thinkingMode: 'adaptive',
      supportsSamplingParams: false,
      supportsInlineSystem: true,
      supportsStructuredOutputs: true,
      maxApiEffort: 'max',
      enabled: true,
    });
  });

  it('states its effort rather than inheriting an API default one level below Opus 5', () => {
    // Omitting effort on Opus 5.5 runs `medium`; on Opus 5 it ran `high`. The
    // level is declared on the entry so the record says what ran.
    expect(flagship?.defaultApiEffort).toBe('medium');
  });
});

describe('the ladder under it', () => {
  it('drops to Opus 5, then Opus 4.8, before anything else', () => {
    const anthropic = DEFAULT_MODELS.filter(m => m.provider === 'anthropic' && m.enabled).sort(
      (a, b) => b.qualityScore - a.qualityScore,
    );
    expect(anthropic.slice(0, 3).map(m => m.model)).toEqual([
      'claude-opus-5-5',
      'claude-opus-5',
      'claude-opus-4-8',
    ]);
  });

  it('keeps Opus 5 on its own surface and price', () => {
    expect(byModel('claude-opus-5')).toMatchObject({
      costPer1kInput: 0.005,
      costPer1kOutput: 0.025,
      thinkingMode: 'adaptive',
      supportsSamplingParams: false,
      maxApiEffort: 'max',
    });
    // No declared default: Opus 5's own API default (`high`) is what it ran
    // as primary, and a fallback should behave as it was reviewed.
    expect(byModel('claude-opus-5')?.defaultApiEffort).toBeUndefined();
  });
});

describe('governance moves with the registry', () => {
  it('the lockfile pins both, and both may serve high-risk drafting', () => {
    const primary = APPROVED_MODELS.find(m => m.id === 'claude-opus-4');
    const prior = APPROVED_MODELS.find(m => m.pinnedVersion === 'claude-opus-5');
    expect(primary).toMatchObject({ pinnedVersion: 'claude-opus-5-5', role: 'primary', approvedForHighRisk: true });
    expect(prior).toMatchObject({ role: 'fallback', approvedForHighRisk: true });
    // Neither has a PQ run, and the entries must not claim one.
    expect(primary?.pq.status).toBe('pending');
    expect(prior?.pq.status).toBe('pending');
  });

  it('the drift gate is clean against the live registry', () => {
    expect(detectModelDrift(DEFAULT_MODELS.map(m => ({ id: m.id, model: m.model })))).toEqual([]);
  });
});

describe('effort: a declared default applies only when the caller chose nothing', () => {
  const entry = { maxApiEffort: 'max', defaultApiEffort: 'medium' } as const;

  it('is sent when no effort was chosen', () => {
    expect(apiEffortForModel(entry, undefined)).toBe('medium');
  });

  it("never overrides the person's choice", () => {
    expect(apiEffortForModel(entry, 'high')).toBe('high');
    expect(apiEffortForModel(entry, 'low')).toBe('low');
  });

  it('is withheld from a model that takes no effort at all', () => {
    expect(apiEffortForModel({ maxApiEffort: null, defaultApiEffort: 'medium' }, undefined)).toBeUndefined();
  });
});
