/**
 * Reasoning Engine — HRM resolver stub (WO-5)
 *
 * Placeholder for a future Hierarchical Reasoning Model. It declines every task
 * today (`supports` → false) so `resolve()` falls back to the deterministic
 * rules-resolver. When an HRM is wired in, only this file changes; callers and
 * the rules-resolver are untouched. It NEVER fabricates an answer.
 */

import { ReasoningError, type ReasoningRequest, type ReasoningResolver, type ReasoningResult } from './types.js';

export const HRM_ENABLED = false;

export const hrmResolver: ReasoningResolver = {
  name: 'hrm',

  supports(_req: ReasoningRequest): boolean {
    return HRM_ENABLED; // false until an HRM is actually wired in
  },

  resolve<T = unknown>(_req: ReasoningRequest): ReasoningResult<T> {
    throw new ReasoningError(
      'NO_RESOLVER',
      'HRM resolver is not enabled; the engine falls back to the deterministic rules resolver.'
    );
  },
};
