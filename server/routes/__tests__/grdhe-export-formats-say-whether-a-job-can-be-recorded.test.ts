/**
 * GET /api/grdhe/exports/formats says, for each format, whether an export job
 * can be recorded for it and why not; and the regulatory_format type holds
 * only the values the database enum holds.
 *
 * What the code used to do (until 2026-10-22): the list was SUPPORTED_FORMATS
 * alone, so a client offered every format while POST /exports refused each one
 * with 422 EXPORT_FORMAT_NOT_RECORDABLE (no regulatory_format value names what
 * these files are). And RegulatoryFormat listed FDA_AE_3500A, FDA_AE_3500B and
 * EMA_AE_E2B_R3, generator keys the enum has no value for, so a key typed as a
 * database value compiled and failed at the cast.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/grdhe/grdheService', () => {
  class AuditScopeError extends Error {}
  class ExportJobNotFoundError extends Error {}
  class AdverseEventNotFoundError extends Error {}
  class ExportJobRefusedError extends Error {}
  return { grdheService: {}, AuditScopeError, ExportJobNotFoundError, AdverseEventNotFoundError, ExportJobRefusedError };
});

import router from '../grdheRoutes';
import { SUPPORTED_FORMATS } from '../../services/grdhe/exportGenerators';
import type { RegulatoryFormat } from '../../services/grdhe/types';

const app = () => express().use(express.json()).use('/api/grdhe', router);

describe('GET /exports/formats', () => {
  it('marks every format not recordable, with the reason, while no regulatory_format value records it', async () => {
    const r = await request(app()).get('/api/grdhe/exports/formats');
    expect(r.status).toBe(200);
    const data = r.body.data as Record<string, { recordable?: boolean; notRecordableReason?: string | null; name: string }>;
    expect(Object.keys(data).sort()).toEqual(Object.keys(SUPPORTED_FORMATS).sort());
    for (const [key, format] of Object.entries(data)) {
      expect(format.recordable, `${key} was listed with no word that POST /exports refuses it`).toBe(false);
      expect(format.notRecordableReason).toMatch(/EXPORT_FORMAT_NOT_RECORDABLE/);
      expect(format.name).toBe(SUPPORTED_FORMATS[key as keyof typeof SUPPORTED_FORMATS].name);
    }
  });
});

describe('RegulatoryFormat is the database enum', () => {
  it('holds no generator key (checked by the typecheck)', () => {
    // @ts-expect-error FDA_AE_3500A is an export generator key, not a regulatory_format value.
    const key: RegulatoryFormat = 'FDA_AE_3500A';
    // @ts-expect-error EMA_AE_E2B_R3 is an export generator key, not a regulatory_format value.
    const other: RegulatoryFormat = 'EMA_AE_E2B_R3';
    const value: RegulatoryFormat = 'EMA_E2B_R3';
    expect([key, other, value]).toHaveLength(3);
  });
});
