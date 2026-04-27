/**
 * Smoke tests for the 5 new AnA tool handlers wired in 88c1138:
 *   - lookup_regulatory_precedents
 *   - compare_submission_against_precedent
 *   - assess_claim_evidence_integrity
 *   - simulate_reviewer_challenges
 *   - predict_change_impact
 *
 * These verify the wiring without exercising the underlying services
 * (precedent-engine, submission-twin-service), so they run without a DB:
 *
 *   1. Each tool is registered (getToolHandler returns a function)
 *   2. Each tool returns a structured JSON error when required inputs are missing
 *   3. The submission-twin tools refuse to run without ToolContext.organizationId
 *
 * The actual service-call path is exercised by integration tests against
 * a seeded fixture (TODO).
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler, type ToolContext } from '../ClaudeToolExecutor.js';

const NEW_TOOLS = [
  'lookup_regulatory_precedents',
  'compare_submission_against_precedent',
  'assess_claim_evidence_integrity',
  'simulate_reviewer_challenges',
  'predict_change_impact',
] as const;

describe('AnA new tool handlers — registration', () => {
  for (const name of NEW_TOOLS) {
    it(`registers a handler for ${name}`, () => {
      const handler = getToolHandler(name);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });
  }
});

describe('AnA new tool handlers — input validation (no DB needed)', () => {
  it('lookup_regulatory_precedents rejects missing submission_type', async () => {
    const handler = getToolHandler('lookup_regulatory_precedents')!;
    const result = JSON.parse(await handler({}, {}));
    expect(result.error).toMatch(/submission_type/);
  });

  it('compare_submission_against_precedent rejects missing precedent_id', async () => {
    const handler = getToolHandler('compare_submission_against_precedent')!;
    const result = JSON.parse(await handler({ submission_type: '510(k)' }, {}));
    expect(result.error).toMatch(/precedent_id/);
  });

  it('compare_submission_against_precedent rejects missing submission_type', async () => {
    const handler = getToolHandler('compare_submission_against_precedent')!;
    const result = JSON.parse(await handler({ precedent_id: 'p_123' }, {}));
    expect(result.error).toMatch(/submission_type/);
  });

  it('assess_claim_evidence_integrity rejects missing package_id', async () => {
    const handler = getToolHandler('assess_claim_evidence_integrity')!;
    const result = JSON.parse(await handler({}, { organizationId: 1 }));
    expect(result.error).toMatch(/package_id/);
  });

  it('simulate_reviewer_challenges rejects missing assessment_id', async () => {
    const handler = getToolHandler('simulate_reviewer_challenges')!;
    const result = JSON.parse(
      await handler({ package_id: 42 }, { organizationId: 1 })
    );
    expect(result.error).toMatch(/assessment_id/);
  });

  it('predict_change_impact rejects missing change_type', async () => {
    const handler = getToolHandler('predict_change_impact')!;
    const result = JSON.parse(
      await handler(
        {
          package_id: 42,
          changed_artifact_id: 7,
          change_description: 'added 12-month safety follow-up',
        },
        { organizationId: 1 }
      )
    );
    expect(result.error).toMatch(/change_type/);
  });
});

describe('AnA new tool handlers — tenant context enforcement', () => {
  // Submission Twin tools must refuse to run without organizationId because
  // they hit org-scoped DB queries. The LLM cannot pass tenant identifiers
  // as inputs by design — they come from request-scoped ToolContext only.

  it('assess_claim_evidence_integrity refuses without organizationId', async () => {
    const handler = getToolHandler('assess_claim_evidence_integrity')!;
    const result = JSON.parse(await handler({ package_id: 42 }, {} as ToolContext));
    expect(result.error).toMatch(/organizationId/);
  });

  it('simulate_reviewer_challenges refuses without organizationId', async () => {
    const handler = getToolHandler('simulate_reviewer_challenges')!;
    const result = JSON.parse(
      await handler({ package_id: 42, assessment_id: 7 }, {} as ToolContext)
    );
    expect(result.error).toMatch(/organizationId/);
  });

  it('predict_change_impact refuses without organizationId', async () => {
    const handler = getToolHandler('predict_change_impact')!;
    const result = JSON.parse(
      await handler(
        {
          package_id: 42,
          changed_artifact_id: 7,
          change_description: 'data update',
          change_type: 'data_source',
        },
        {} as ToolContext
      )
    );
    expect(result.error).toMatch(/organizationId/);
  });

  // Precedent tools accept optional organizationId, so absence is not an
  // error — they fall back to a global-corpus search.
  it('lookup_regulatory_precedents accepts missing organizationId (global lookup)', async () => {
    const handler = getToolHandler('lookup_regulatory_precedents')!;
    // We can't fully exercise the search path without a DB, but we can
    // confirm the validation doesn't reject the call before the DB layer.
    // If the DB is unavailable the handler will return its own error
    // string; we only care that it didn't reject on context grounds.
    const raw = await handler({ submission_type: '510(k)' }, {});
    const result = JSON.parse(raw);
    // Either succeeds with a count, or fails with a *non-tenant-context* error.
    if (result.error) {
      expect(result.error).not.toMatch(/organizationId/);
    } else {
      expect(typeof result.count).toBe('number');
    }
  });
});
