/**
 * shouldEnforceExportReviewGate — the ONE enable decision for every export
 * review gate (concept2cure chat exports, eCTD package export, CERV2 document
 * exports, Artifacts Center export).
 *
 * Canonical semantics pinned here:
 *   • NODE_ENV=production → ALWAYS enforced. No environment variable may
 *     disable it. (This deliberately closes the former fail-open hole where
 *     CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW='false' disabled the gate even
 *     in production.)
 *   • Non-production → enforced when EITHER legacy spelling enables it:
 *     CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW='true' or
 *     EXPORT_REVIEW_GATE='enforce' (the spelling used by
 *     docs/proof/golden-journeys/WO-06_GOVERNED_EVIDENCE_DRAFT.md). Otherwise
 *     off.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { shouldEnforceExportReviewGate } from '../exportReviewGate';

const GATE_VARS = ['CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW', 'EXPORT_REVIEW_GATE'] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved.NODE_ENV = process.env.NODE_ENV;
  for (const name of GATE_VARS) saved[name] = process.env[name];
  process.env.NODE_ENV = 'test';
  for (const name of GATE_VARS) delete process.env[name];
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('shouldEnforceExportReviewGate — production posture', () => {
  it('enforces in production with no toggles set', () => {
    process.env.NODE_ENV = 'production';
    expect(shouldEnforceExportReviewGate()).toBe(true);
  });

  it("cannot be disabled in production by CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW='false'", () => {
    // The exact fail-open hole the unification closes: the pre-unification
    // gate returned false here, silently disabling human review in production.
    process.env.NODE_ENV = 'production';
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';
    expect(shouldEnforceExportReviewGate()).toBe(true);
  });

  it("cannot be disabled in production by EXPORT_REVIEW_GATE='off'", () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPORT_REVIEW_GATE = 'off';
    expect(shouldEnforceExportReviewGate()).toBe(true);
  });

  it('cannot be disabled in production even with both legacy disable spellings set', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';
    process.env.EXPORT_REVIEW_GATE = 'off';
    expect(shouldEnforceExportReviewGate()).toBe(true);
  });
});

describe('shouldEnforceExportReviewGate — non-production toggles', () => {
  it("enforces when CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW='true'", () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';
    expect(shouldEnforceExportReviewGate()).toBe(true);
  });

  it("enforces when EXPORT_REVIEW_GATE='enforce' (WO-06 runbook spelling)", () => {
    process.env.EXPORT_REVIEW_GATE = 'enforce';
    expect(shouldEnforceExportReviewGate()).toBe(true);
  });

  it('enforces when either spelling enables while the other disables', () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';
    process.env.EXPORT_REVIEW_GATE = 'off';
    expect(shouldEnforceExportReviewGate()).toBe(true);

    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';
    process.env.EXPORT_REVIEW_GATE = 'enforce';
    expect(shouldEnforceExportReviewGate()).toBe(true);
  });

  it('is off by default outside production', () => {
    expect(shouldEnforceExportReviewGate()).toBe(false);
  });

  it('stays off outside production under the legacy disable spellings', () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';
    process.env.EXPORT_REVIEW_GATE = 'off';
    expect(shouldEnforceExportReviewGate()).toBe(false);
  });
});
