/**
 * Nonclinical + SEND deterministic logic (C2C-04) — CTD Module 4 mapping, SENDIG
 * required-domain catalog, and the SEND readiness gate. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  ctdSectionFor,
  requiredSendDomains,
  sendInScope,
  evaluateSendReadiness,
  type SendReadinessInput,
} from '../nonclinical-logic';

const ready: SendReadinessInput = {
  studyType: 'repeat_dose_tox',
  domainsPresent: ['TS', 'DM', 'EX', 'BW', 'CL', 'LB', 'OM', 'MA', 'MI', 'FW'],
  defineXmlPresent: true,
  nsdrcPresent: true,
  validationStatus: 'passed',
  validatorErrorCount: 0,
};

describe('ctdSectionFor', () => {
  it('maps study types to CTD Module 4 sections', () => {
    expect(ctdSectionFor('repeat_dose_tox')).toBe('4.2.3.2');
    expect(ctdSectionFor('carcinogenicity')).toBe('4.2.3.4');
    expect(ctdSectionFor('reproductive_tox')).toBe('4.2.3.5');
  });
});

describe('sendInScope / requiredSendDomains', () => {
  it('treats general tox / carc / safety pharm / repro as in scope', () => {
    expect(sendInScope('repeat_dose_tox')).toBe(true);
    expect(sendInScope('carcinogenicity')).toBe(true);
    expect(sendInScope('adme_pk')).toBe(false);
  });
  it('always includes the trial-summary and demographics domains', () => {
    for (const t of ['repeat_dose_tox', 'carcinogenicity'] as const) {
      expect(requiredSendDomains(t)).toEqual(expect.arrayContaining(['TS', 'DM', 'EX']));
    }
  });
});

describe('evaluateSendReadiness', () => {
  it('passes a complete, validated package (low risk)', () => {
    expect(evaluateSendReadiness(ready).riskLevel).toBe('low');
  });
  it('flags an out-of-scope study type as minor only', () => {
    const r = evaluateSendReadiness({ ...ready, studyType: 'adme_pk' });
    expect(r.riskLevel).toBe('low');
    expect(r.findings[0].message).toMatch(/outside mandatory SEND scope/);
  });
  it('flags missing required domains', () => {
    const r = evaluateSendReadiness({ ...ready, domainsPresent: ['TS', 'DM', 'EX'] });
    expect(r.missingDomains).toEqual(expect.arrayContaining(['BW', 'MI']));
    expect(r.riskLevel).toBe('medium');
  });
  it('treats missing define.xml as critical', () => {
    const r = evaluateSendReadiness({ ...ready, defineXmlPresent: false });
    expect(r.riskLevel).toBe('high');
    expect(r.findings.some((f) => /define\.xml/.test(f.message))).toBe(true);
  });
  it('treats open validation errors as critical', () => {
    const r = evaluateSendReadiness({ ...ready, validationStatus: 'errors', validatorErrorCount: 5 });
    expect(r.riskLevel).toBe('high');
  });
  it('flags an unvalidated package as major', () => {
    const r = evaluateSendReadiness({ ...ready, validationStatus: 'not_validated' });
    expect(r.findings.some((f) => /not been validated/.test(f.message))).toBe(true);
  });
});
