/**
 * Registry rows for tests that hold a model to its approved-models entry
 * (CLAUDE.md Rule 2). One copy, imported by effort.test.ts, reasoning.test.ts
 * and tier-model-approval.test.ts, which each used to write out the entry
 * lookup and "the row that IS this entry" for themselves.
 *
 * Registry side: synthetic rows. Governance side: the real APPROVED_MODELS,
 * looked up by id and never guessed.
 */
import { APPROVED_MODELS, type ApprovedModel } from '../../../ai-governance/approved-models';
import type { ModelConfig } from '../../types';

/** A synthetic, enabled registry row. Every field a case does not name is filler. */
export function registryRow(overrides: Partial<ModelConfig>): ModelConfig {
  return {
    id: 'm',
    provider: 'anthropic',
    model: 'm-wire',
    contextWindow: 200000,
    qualityScore: 90,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: ['chat', 'general'],
    enabled: true,
    thinkingMode: 'adaptive',
    supportsSamplingParams: false,
    ...overrides,
  };
}

/** A real approved-models entry, by id. Throws rather than guess. */
export function entry(id: string): ApprovedModel {
  const found = APPROVED_MODELS.find((e) => e.id === id);
  if (!found) throw new Error(`APPROVED_MODELS has no '${id}'`);
  return found;
}

/**
 * The registry row that IS this entry: its id, provider and pinned wire
 * version, so the fixture is the model the gateway would actually serve rather
 * than a string that merely looks like it.
 */
export function approvedRow(id: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const e = entry(id);
  return registryRow({ id: e.id, provider: e.provider, model: e.pinnedVersion, ...overrides });
}

/**
 * True when no approved-models entry carries this row's id or pins its wire
 * model: a case that means "a model with no governance entry at all" asserts
 * this first, so a later governance entry fails that case by name.
 */
export function hasNoEntry(row: Pick<ModelConfig, 'id' | 'model'>): boolean {
  return !APPROVED_MODELS.some((e) => e.id === row.id || e.pinnedVersion === row.model);
}
