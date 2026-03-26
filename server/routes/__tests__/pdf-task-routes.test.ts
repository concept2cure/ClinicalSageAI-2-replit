import request from 'supertest';
import express from 'express';

jest.mock('../../services/pdf-compression-service.js', () => ({
  COMPRESSION_PROFILES: [
    { quality: 'ebook', label: 'eBook', expectedUseCase: 'balanced' },
    { quality: 'screen', label: 'Screen', expectedUseCase: 'smallest size' },
  ],
  isGhostscriptAvailable: jest.fn(),
  compressPdfWithGhostscript: jest.fn(),
  recommendCompressionQuality: jest.fn(),
  compressPdfBatch: jest.fn(),
}));

import pdfTaskRoutes from '../pdf-task-routes';
import {
  compressPdfBatch,
  isGhostscriptAvailable,
  compressPdfWithGhostscript,
  recommendCompressionQuality,
} from '../../services/pdf-compression-service.js';

describe('pdf-task-routes /compress', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/pdf-tasks', pdfTaskRoutes);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for invalid quality', async () => {
    const res = await request(app).post('/api/pdf-tasks/compress').send({
      inputPath: '/tmp/test.pdf',
      quality: 'ultra',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid request body');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('returns 503 when ghostscript is unavailable', async () => {
    (isGhostscriptAvailable as jest.Mock).mockResolvedValue(false);
    const res = await request(app).post('/api/pdf-tasks/compress').send({
      inputPath: '/tmp/test.pdf',
    });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('Ghostscript not available');
  });

  it('returns compression result when successful', async () => {
    (isGhostscriptAvailable as jest.Mock).mockResolvedValue(true);
    (compressPdfWithGhostscript as jest.Mock).mockResolvedValue({
      outputPath: '/tmp/test.compressed.pdf',
      originalSizeBytes: 1000,
      compressedSizeBytes: 500,
      compressionRatio: 0.5,
    });

    const res = await request(app).post('/api/pdf-tasks/compress').send({
      inputPath: '/tmp/test.pdf',
      quality: 'ebook',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.outputPath).toBe('/tmp/test.compressed.pdf');
  });

  it('lists compression profiles', async () => {
    const res = await request(app).get('/api/pdf-tasks/compress/profiles');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.profiles)).toBe(true);
  });

  it('returns recommendation for valid file input', async () => {
    (recommendCompressionQuality as jest.Mock).mockResolvedValue({
      inputPath: '/tmp/test.pdf',
      originalSizeBytes: 1024,
      recommendedQuality: 'ebook',
      reason: 'Balanced compression selected by default.',
    });

    const res = await request(app).post('/api/pdf-tasks/compress/recommend').send({
      inputPath: '/tmp/test.pdf',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.recommendation.recommendedQuality).toBe('ebook');
  });

  it('returns batch summary for mixed outcomes', async () => {
    (isGhostscriptAvailable as jest.Mock).mockResolvedValue(true);
    (compressPdfBatch as jest.Mock).mockResolvedValue({
      results: [
        { ok: true, inputPath: '/tmp/a.pdf', result: { outputPath: '/tmp/a.c.pdf' } },
        { ok: false, inputPath: '/tmp/b.pdf', error: 'failed' },
      ],
    });

    const res = await request(app).post('/api/pdf-tasks/compress/batch').send({
      files: [{ inputPath: '/tmp/a.pdf' }, { inputPath: '/tmp/b.pdf' }],
      defaultQuality: 'ebook',
    });

    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(2);
    expect(res.body.summary.success).toBe(1);
    expect(res.body.summary.failed).toBe(1);
  });

  it('returns 400 for malformed batch payload', async () => {
    const res = await request(app).post('/api/pdf-tasks/compress/batch').send({
      files: [{ inputPath: '' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid request body');
  });
});
