/**
 * Forensic audit HI-1 / HI-2 / HI-3 — honesty remediation guards
 *
 * These tests lock in the fixes from FORENSIC_CODE_AUDIT_2026-05-29.md:
 *
 *  HI-1  regulatory-digital-twin: stochastic "predictions" must carry an explicit
 *        non-predictive disclosure on every prediction-bearing response.
 *  HI-2  power/sample-size, report-generator, SAP generator: no fabricated
 *        statistical priors / Math.random() power figures presented as real data.
 *  HI-3  regulatory-intelligence: substring-match "compliance analysis" must not
 *        emit a percentage compliance score.
 *
 * Part behavioral (the one service that imports cleanly), part source-integrity —
 * the source guards fail loudly if the fabrication patterns ever return, mirroring
 * the repo's existing CI guard style (e.g. check-no-mock-in-prod-routes).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SERVER = path.resolve(__dirname, '../server');
const read = (rel: string) => fs.readFileSync(path.join(SERVER, rel), 'utf8');

// ── HI-2: behavioral — fabricated statistical priors are gone ───────────────
describe('HI-2 · power-sample-size-service no longer fabricates historical priors', () => {
  it('getHistoricalEffectSizes returns an explicit unavailable result, not canned numbers', async () => {
    const { PowerSampleSizeService } = await import(
      '../server/services/power-sample-size-service'
    );
    const svc = new PowerSampleSizeService();

    for (const endpointType of ['continuous', 'binary', 'timeToEvent', 'anything']) {
      const result = await svc.getHistoricalEffectSizes('oncology', endpointType);
      expect(result.available).toBe(false);
      expect(result.source).toBe('none');
      // None of the old fabricated constants may resurface.
      const blob = JSON.stringify(result);
      expect(blob).not.toContain('0.5');
      expect(blob).not.toContain('1.8');
      expect(blob).not.toContain('0.75');
      expect(result).not.toHaveProperty('mean');
      expect(result).not.toHaveProperty('meanHazardRatio');
    }
  });

  it('getHistoricalDropoutRates returns an explicit unavailable result, not a fabricated rate', async () => {
    const { PowerSampleSizeService } = await import(
      '../server/services/power-sample-size-service'
    );
    const svc = new PowerSampleSizeService();
    const result = await svc.getHistoricalDropoutRates('oncology', 'Phase 3');
    expect(result.available).toBe(false);
    expect(result.source).toBe('none');
    expect(result).not.toHaveProperty('mean');
    expect(result).not.toHaveProperty('byDuration');
  });
});

// ── HI-2: source — report-generator + SAP generator stop fabricating ────────
describe('HI-2 · report/SAP generators no longer fabricate', () => {
  it('report-generator generateSuccessProbability has no canned phase-transition constants', () => {
    const src = read('services/report-generator-service.ts');
    // These fabricated constants were unique to generateSuccessProbability.
    expect(src).not.toContain('phase1to2: 0.78');
    expect(src).not.toContain('phase2to3: 0.42');
    expect(src).not.toContain('phase3toApproval: 0.64');
    expect(src).not.toContain('industryAverage: 0.14');
    // The unavailable branch must exist in the success-probability path.
    expect(src).toContain("source: 'none'");
    expect(src).toContain('available: false');
  });

  it('SAP generator computes no Math.random() power or effect size', () => {
    const src = read('services/sap-generator-service.ts');
    expect(src).not.toContain('0.8 + Math.random()');
    expect(src).not.toContain('0.3 + Math.random()');
    // Caller-supplied assumptions, or an honest deferral to the statistician.
    expect(src).toContain('target_power');
    expect(src).toContain('must be specified and computed by the study statistician');
  });
});

// ── HI-3: source — compliance percentage is gone ────────────────────────────
describe('HI-3 · regulatory-intelligence emits no fabricated compliance percentage', () => {
  it('analyzeProtocolCompliance does not print a "COMPLIANCE SUMMARY: N%" score', () => {
    const src = read('services/regulatory-intelligence-service.ts');
    expect(src).not.toContain('COMPLIANCE SUMMARY:');
    expect(src).not.toMatch(/complianceRate/);
    // It must disclose the heuristic method instead.
    expect(src).toContain('heuristic keyword screen');
    expect(src).toContain('not a compliance score');
  });
});

// ── HI-1: source — every prediction route carries the disclosure ────────────
describe('HI-1 · regulatory-digital-twin discloses non-predictive simulations', () => {
  const src = read('routes/regulatory-digital-twin.ts');

  it('defines a SIMULATION_DISCLOSURE marked predictive:false', () => {
    expect(src).toContain('const SIMULATION_DISCLOSURE');
    expect(src).toContain('predictive: false');
    expect(src).toContain('validatedAgainstHistoricalDecisions: false');
  });

  it('attaches the disclosure to every prediction-bearing response', () => {
    // One per prediction route + persisted reads: simulations(POST/GET/list),
    // predict-questions, rtf-assessment, deficiency-prediction,
    // advisory-committee, monte-carlo-timing, cross-agency = 9 attachments.
    const attachments = src.match(/_disclosure: SIMULATION_DISCLOSURE/g) ?? [];
    expect(attachments.length).toBeGreaterThanOrEqual(9);
  });
});
