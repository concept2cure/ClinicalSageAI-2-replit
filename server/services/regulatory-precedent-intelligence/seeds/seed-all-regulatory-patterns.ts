/**
 * Central orchestrator that seeds every regulatory precedent pattern
 * library for an organization. Idempotent — each individual seeder skips
 * patterns whose patternCode is already present, so this can be invoked
 * safely on every org creation and on demand for backfills.
 *
 * Fire-and-forget callers should `.catch()` the returned promise; this
 * function itself never rejects. Individual seeder failures are logged
 * but do not prevent the others from running.
 */

import { createScopedLogger } from '../../../utils/logger';
import { seedCrlTriggers } from './seed-crl-triggers';
import { seedNonclinicalRtf } from './seed-nonclinical-rtf';
import { seedCmcRtf } from './seed-cmc-rtf';
import { seedAdvisoryCommittee } from './seed-advisory-committee';
import { seedEmaQuestions } from './seed-ema-questions';
import { seedCrossJurisdictional } from './seed-cross-jurisdictional';
import { seedConfidenceCalibration } from './seed-confidence-calibration';

const log = createScopedLogger('seed-all-regulatory-patterns');

export interface SeedAllResult {
  crl: { inserted: number; skipped: number; error?: string };
  rtfNonclinical: { inserted: number; skipped: number; error?: string };
  rtfCmc: { inserted: number; skipped: number; error?: string };
  advisoryCommittee: { inserted: number; skipped: number; error?: string };
  emaQuestions: { inserted: number; skipped: number; error?: string };
  crossJurisdictional: { inserted: number; skipped: number; error?: string };
  confidenceCalibration: { inserted: number; skipped: number; error?: string };
}

export async function seedAllRegulatoryPatterns(
  organizationId: string,
): Promise<SeedAllResult> {
  log.info('Starting regulatory pattern seed for org', { organizationId });

  const [crl, rtfNonclinical, rtfCmc, ac, ema, xj, cc] = await Promise.all([
    safeSeed(() => seedCrlTriggers(organizationId), 'crl'),
    safeSeed(() => seedNonclinicalRtf(organizationId), 'rtf-nonclinical'),
    safeSeed(() => seedCmcRtf(organizationId), 'rtf-cmc'),
    safeSeed(() => seedAdvisoryCommittee(organizationId), 'advisory-committee'),
    safeSeed(() => seedEmaQuestions(organizationId), 'ema-questions'),
    safeSeed(() => seedCrossJurisdictional(organizationId), 'cross-jurisdictional'),
    safeSeed(() => seedConfidenceCalibration(organizationId), 'confidence-calibration'),
  ]);

  const result: SeedAllResult = {
    crl,
    rtfNonclinical,
    rtfCmc,
    advisoryCommittee: ac,
    emaQuestions: ema,
    crossJurisdictional: xj,
    confidenceCalibration: cc,
  };

  log.info('Regulatory pattern seed complete', {
    organizationId,
    inserted: {
      crl: crl.inserted,
      rtfNonclinical: rtfNonclinical.inserted,
      rtfCmc: rtfCmc.inserted,
      advisoryCommittee: ac.inserted,
      emaQuestions: ema.inserted,
      crossJurisdictional: xj.inserted,
      confidenceCalibration: cc.inserted,
    },
  });

  return result;
}

async function safeSeed(
  fn: () => Promise<{ inserted: string[]; skipped: string[] }>,
  label: string,
): Promise<{ inserted: number; skipped: number; error?: string }> {
  try {
    const r = await fn();
    return { inserted: r.inserted.length, skipped: r.skipped.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Seeder failed', { seeder: label, error: message });
    return { inserted: 0, skipped: 0, error: message };
  }
}
