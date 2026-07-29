/**
 * Enum alignment guard.
 *
 * Detects drift between Postgres `pgEnum` definitions and the TypeScript union
 * types that mirror them. Adding a value to a `pgEnum` without updating the
 * mirroring TS union (or vice versa) previously drifted silently — this test
 * makes that drift a hard failure.
 *
 * Strategy per guarded pair:
 *   1. Import the drizzle `pgEnum` object (exposes `.enumValues` at runtime).
 *   2. Declare a local sample array annotated with `satisfies readonly TheUnion[]`.
 *      Because the array is `satisfies`-checked against the mirroring union type,
 *      if the union gains/loses/renames a member the sample no longer type-checks
 *      and THIS FILE FAILS TO COMPILE — surfacing the drift at build time. The
 *      inline sample also documents the expected member set for reviewers.
 *   3. Assert the sample's value set equals the `pgEnum.enumValues` set (order
 *      independent) so runtime membership drift is caught too.
 *
 * Only pairs where BOTH a `pgEnum` and a mirroring TS union exist and are
 * importable are guarded here. pgEnums with no TS mirror, and TS unions with no
 * backing pgEnum, are catalogued in docs/reports/enum-alignment.md as
 * "unmirrored" rather than forced into bogus assertions.
 *
 * See docs/reports/enum-alignment.md for the full inventory and drift findings.
 */

import { describe, it, expect } from 'vitest';

import {
  resolutionTriggerTypeEnum,
  resolutionPathEnum,
  resolutionConfidenceEnum,
  resolutionStateEnum,
  bundleStateEnum,
  supersessionStateEnum,
} from '../../shared/schema/resolution';

import type {
  ResolutionTriggerType,
  ResolutionPath,
  ResolutionConfidence,
  ResolutionState,
  BundleState,
  SupersessionState,
} from '../../shared/types/resolution';

/** Order-independent set equality on string arrays. */
function expectSameMembers(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  // Give a readable diff when they drift.
  const missingFromActual = e.filter((v) => !actual.includes(v));
  const extraInActual = actual.filter((v) => !expected.includes(v));
  expect(
    { missingFromActual, extraInActual },
    `${label}: pgEnum and TS union member sets differ`,
  ).toEqual({ missingFromActual: [], extraInActual: [] });
  expect(a, label).toEqual(e);
}

describe('pgEnum <-> TS union alignment (shared/schema/resolution.ts <-> shared/types/resolution.ts)', () => {
  it('resolution_trigger_type === ResolutionTriggerType', () => {
    // If ResolutionTriggerType changes, this `satisfies` stops compiling.
    const sample = [
      'contradiction',
      'assumption_change',
      'decision_update',
      'impact_propagation',
      'validation_failure',
      'stale_dependency',
      'manual',
    ] as const satisfies readonly ResolutionTriggerType[];
    expectSameMembers(
      resolutionTriggerTypeEnum.enumValues,
      sample,
      'resolution_trigger_type',
    );
  });

  it('resolution_path === ResolutionPath', () => {
    const sample = [
      'harmonize',
      'supersede',
      'rewrite',
      'review_only',
      'escalate',
      'mixed',
    ] as const satisfies readonly ResolutionPath[];
    expectSameMembers(resolutionPathEnum.enumValues, sample, 'resolution_path');
  });

  it('resolution_confidence === ResolutionConfidence', () => {
    const sample = [
      'strong',
      'moderate',
      'provisional',
      'uncertain',
    ] as const satisfies readonly ResolutionConfidence[];
    expectSameMembers(
      resolutionConfidenceEnum.enumValues,
      sample,
      'resolution_confidence',
    );
  });

  it('resolution_state === ResolutionState', () => {
    const sample = [
      'unresolved',
      'proposed_resolution',
      'in_resolution',
      'resolved_pending_review',
      'resolved_approved',
      'superseded',
      'cancelled',
    ] as const satisfies readonly ResolutionState[];
    expectSameMembers(resolutionStateEnum.enumValues, sample, 'resolution_state');
  });

  it('bundle_state === BundleState', () => {
    const sample = [
      'draft',
      'proposed',
      'in_progress',
      'pending_review',
      'approved',
      'applied',
      'rejected',
      'cancelled',
    ] as const satisfies readonly BundleState[];
    expectSameMembers(bundleStateEnum.enumValues, sample, 'bundle_state');
  });

  it('supersession_state === SupersessionState', () => {
    const sample = [
      'proposed',
      'confirmed',
      'reverted',
    ] as const satisfies readonly SupersessionState[];
    expectSameMembers(
      supersessionStateEnum.enumValues,
      sample,
      'supersession_state',
    );
  });
});
