/**
 * The safety-narrative POST routes must never coerce a MISSING safety input
 * into a fabricated value that ships into an ICH E3 / DSUR / benefit-risk
 * section. Guards the fix in "fix(safety): safety-narrative routes reject
 * missing data instead of fabricating zero-events / age 0 / a default
 * population".
 *
 *  - /aggregate: an omitted teae/sae/deaths dataset must 400, not default to []
 *    (which renders "No SAEs/deaths were reported during the study.").
 *  - /sae: an omitted patientAge / onsetStudyDay must pass null (rendered "age
 *    not reported" / "study day not reported"), never the fabricated number 0.
 *  - /benefit-risk: an omitted context must not fabricate diseaseSeverity
 *    'moderate' / patientPopulation 'adults'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const generateAggregateSafetyNarrative = vi.fn();
const generateSAENarrative = vi.fn();
const generateBenefitRiskSummary = vi.fn();

vi.mock('../../services/safety-narrative-service', () => ({
  safetyNarrativeService: {
    generateAggregateSafetyNarrative: (...a: unknown[]) => generateAggregateSafetyNarrative(...a),
    generateSAENarrative: (...a: unknown[]) => generateSAENarrative(...a),
    generateBenefitRiskSummary: (...a: unknown[]) => generateBenefitRiskSummary(...a),
  },
}));
vi.mock('../../services/pv/sae-cases-view-assembler', () => ({
  assembleOrgSaeCases: vi.fn(),
}));

import snRouter from '../safety-narrative';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 7 };
    next();
  });
  a.use('/api/safety-narratives', snRouter);
  return a;
}

beforeEach(() => {
  generateAggregateSafetyNarrative.mockReset().mockResolvedValue({ narrative: 'ok' });
  generateSAENarrative.mockReset().mockResolvedValue('ok narrative');
  generateBenefitRiskSummary.mockReset().mockResolvedValue({ narrative: 'ok' });
});

const baseAggregate = {
  studyId: 'S1', studyTitle: 'T', indication: 'I', treatmentArms: ['A'], narrativeType: 'aggregate',
};

describe('POST /aggregate — missing safety datasets are rejected, not zero-filled', () => {
  it('400 when saeData/deaths are omitted (would otherwise assert "no SAEs/deaths")', async () => {
    const res = await request(app()).post('/api/safety-narratives/aggregate').send({
      ...baseAggregate, teaeData: [], // saeData + deaths omitted
    });
    expect(res.status).toBe(400);
    expect(generateAggregateSafetyNarrative).not.toHaveBeenCalled();
  });

  it('proceeds when all three datasets are explicit arrays (empty [] = affirmatively none)', async () => {
    const res = await request(app()).post('/api/safety-narratives/aggregate').send({
      ...baseAggregate, teaeData: [], saeData: [], deaths: [],
    });
    expect(res.status).toBe(200);
    expect(generateAggregateSafetyNarrative).toHaveBeenCalledTimes(1);
    const arg = generateAggregateSafetyNarrative.mock.calls[0][0];
    expect(arg.saeData).toEqual([]);
    expect(arg.deaths).toEqual([]);
  });
});

describe('POST /sae — missing age / onset day pass null, never fabricated 0', () => {
  it('patientAge and onsetStudyDay are null when omitted', async () => {
    const res = await request(app()).post('/api/safety-narratives/sae').send({
      caseId: 'C1', eventTerm: 'headache', drugName: 'DrugX', // age + onset omitted
    });
    expect(res.status).toBe(200);
    const arg = generateSAENarrative.mock.calls[0][0];
    expect(arg.patientAge).toBeNull();
    expect(arg.onsetStudyDay).toBeNull();
    expect(arg.patientAge).not.toBe(0);
  });
});

describe('POST /benefit-risk — missing context is not fabricated as moderate/adults', () => {
  it('omitted context yields "not specified", not clinically specific defaults', async () => {
    const res = await request(app()).post('/api/safety-narratives/benefit-risk').send({
      indication: 'I', treatmentName: 'Tx', efficacySummary: {}, safetySummary: {}, // context omitted
    });
    expect(res.status).toBe(200);
    const arg = generateBenefitRiskSummary.mock.calls[0][0];
    expect(arg.context.diseaseSeverity).toBe('not specified');
    expect(arg.context.patientPopulation).toBe('not specified');
    expect(arg.context.diseaseSeverity).not.toBe('moderate');
  });
});
