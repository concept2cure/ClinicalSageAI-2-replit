/**
 * A service must not advertise models it does not run.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * GET /api/document-understanding/models returned five entries, every one
 * `status: 'active'`:
 *
 *   layoutlmv3        "LayoutLMv3 (Microsoft)"        pretrainedOn: IIT-CDIP
 *                                                     (11M documents), PubLayNet,
 *                                                     DocBank
 *   donut             "Donut (NAVER)"                 pretrainedOn: SynthDoG, IIT-CDIP
 *   table-transformer "Table Transformer (Microsoft)" pretrainedOn: PubTables-1M,
 *                                                     FinTabNet, SciTSR
 *   dit               "Document Image Transformer"    pretrainedOn: IIT-CDIP
 *                                                     (42M pages), RVL-CDIP
 *   ensemble          "Bayesian ensemble of all models with regulatory-domain
 *                      calibration"
 *
 * None is loaded. There is no transformers / onnx / torch / @huggingface import
 * in the service, no weights, and no inference call. GET /health reported
 * `primaryModel: 'LayoutLMv3'` and `ocrFallback: true` while the analyzer sets
 * `ocrApplied: false` unconditionally — there is no OCR path at all. And the
 * request accepted a `model` option from that same fictional union, echoing the
 * caller's choice straight back as `processingInfo.modelUsed`, so asking for
 * Donut produced a response asserting Donut had run.
 *
 * ── WHY THIS IS FIXED RATHER THAN DELETED ────────────────────────────────────
 * Unlike /api/leaves (deleted at 890260a77), the extraction here is real: it
 * reads the caller's actual document and reports what it found. Only the
 * provenance was false. Deleting a working heuristic extractor over a labelling
 * defect would scale the product down for the wrong reason — and it would strand
 * server/utils/document-file-roots.ts, whose ONLY non-test importer is this
 * router and whose test is a cross-tenant path-traversal regression guard
 * (audit findings EXP-06 / INJ-PATH-001).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import duRouter from '../document-understanding';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/document-understanding', duRouter);
  return a;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const PHANTOMS = ['layoutlmv3', 'donut', 'table-transformer', 'dit', 'ensemble'];

describe('GET /models advertises only what runs', () => {
  it('lists no model as active except the rule-based extractor', async () => {
    const res = await request(app()).get('/api/document-understanding/models');

    expect(res.status).toBe(200);
    const active = res.body.data.filter((m: { status: string }) => m.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('rule-based');
  });

  it('claims no pretraining corpus, because nothing was pretrained', async () => {
    const res = await request(app()).get('/api/document-understanding/models');
    const body = JSON.stringify(res.body);

    // Each of these named a real dataset in the old response.
    for (const corpus of ['IIT-CDIP', 'PubLayNet', 'DocBank', 'PubTables-1M', 'RVL-CDIP']) {
      expect(body).not.toContain(corpus);
    }
    expect(body).not.toContain('Bayesian ensemble');
    expect(res.body.data.every((m: Record<string, unknown>) => !('pretrainedOn' in m))).toBe(true);
  });

  it('still names the retired ids, so an integrator can see what changed', async () => {
    // Silently dropping them would leave a caller who read the old response with
    // no way to learn that the model they selected never existed.
    const res = await request(app()).get('/api/document-understanding/models');
    expect(res.body.notImplemented.models.sort()).toEqual([...PHANTOMS].sort());
  });

  it('states the limitations that decide whether the output is usable', async () => {
    const res = await request(app()).get('/api/document-understanding/models');
    const limitations = res.body.data[0].limitations.join(' ');

    expect(limitations).toMatch(/no OCR|performs no OCR/i);
    expect(limitations).toMatch(/scanned/i);
    expect(limitations).toMatch(/not calibrated probabilities/i);
  });
});

describe('a request for a model that does not exist is refused, not echoed', () => {
  it.each(PHANTOMS)('POST /analyze rejects model=%s', async model => {
    const res = await request(app())
      .post('/api/document-understanding/analyze')
      .send({ base64Content: Buffer.from('Clinical Study Report').toString('base64'), options: { model } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MODEL_NOT_IMPLEMENTED');
    expect(res.body.error.requested).toBe(model);
    // The old response carried processingInfo.modelUsed === the requested name.
    expect(JSON.stringify(res.body)).not.toContain('modelUsed');
  });
});

describe('GET /health describes the mechanism it has', () => {
  it('names no primary model', async () => {
    const res = await request(app()).get('/api/document-understanding/health');

    expect(res.body.primaryModel).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('LayoutLMv3');
    expect(res.body.extractor).toContain('rule-based');
  });

  it('does not claim an OCR fallback it never applies', async () => {
    // The analyzer sets ocrApplied: false unconditionally; there is no OCR path.
    const res = await request(app()).get('/api/document-understanding/health');
    expect(res.body.capabilities.ocrFallback).toBe(false);
  });

  it('says what its scores are', async () => {
    const res = await request(app()).get('/api/document-understanding/health');
    expect(res.body.scoring.basis).toBe('regex_hit_rate');
    expect(res.body.scoring.note).toMatch(/not\s+calibrated probabilities/i);
  });
});
