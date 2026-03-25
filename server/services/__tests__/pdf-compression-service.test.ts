import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('child_process', () => ({
  execFile: jest.fn((cmd: string, args: string[], opts: any, cb: any) => {
    const callback = typeof opts === 'function' ? opts : cb;
    if (args.includes('--version')) {
      callback(null, { stdout: '10.0.0', stderr: '' });
      return;
    }

    const outArg = args.find(arg => arg.startsWith('-sOutputFile='));
    const outputPath = outArg?.replace('-sOutputFile=', '');
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, Buffer.alloc(50, 0));
    }
    callback(null, { stdout: '', stderr: '' });
  }),
}));

import {
  compressPdfBatch,
  compressPdfWithGhostscript,
  isGhostscriptAvailable,
  recommendCompressionQuality,
} from '../pdf-compression-service';

describe('pdf-compression-service', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-compression-test-'));
  const validPdfBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(128, 1)]);

  beforeEach(() => {
    process.env.PDF_COMPRESSION_ALLOWED_ROOTS = tmpRoot;
  });

  afterAll(() => {
    delete process.env.PDF_COMPRESSION_ALLOWED_ROOTS;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns true when ghostscript binary is callable', async () => {
    await expect(isGhostscriptAvailable()).resolves.toBe(true);
  });

  it('rejects non-pdf input files', async () => {
    const inputPath = path.join(tmpRoot, 'input.txt');
    fs.writeFileSync(inputPath, 'not a pdf');
    await expect(compressPdfWithGhostscript({ inputPath })).rejects.toThrow(
      'inputPath must point to a .pdf file'
    );
  });

  it('rejects pdf extension files without PDF header magic', async () => {
    const inputPath = path.join(tmpRoot, 'fake.pdf');
    fs.writeFileSync(inputPath, Buffer.from('not-a-pdf'));
    await expect(compressPdfWithGhostscript({ inputPath })).rejects.toThrow(
      'missing %PDF- header'
    );
  });

  it('rejects paths outside allowed roots', async () => {
    const outsidePath = path.join(process.cwd(), 'outside.pdf');
    fs.writeFileSync(outsidePath, validPdfBuffer);
    await expect(compressPdfWithGhostscript({ inputPath: outsidePath })).rejects.toThrow(
      'inputPath must be within allowed roots'
    );
    fs.rmSync(outsidePath, { force: true });
  });

  it('compresses a PDF and returns stats', async () => {
    const inputPath = path.join(tmpRoot, 'input.pdf');
    const outputPath = path.join(tmpRoot, 'input.compressed.pdf');
    fs.writeFileSync(inputPath, validPdfBuffer);

    const result = await compressPdfWithGhostscript({ inputPath, outputPath, quality: 'ebook' });

    expect(result.outputPath).toBe(outputPath);
    expect(result.originalSizeBytes).toBe(100);
    expect(result.compressedSizeBytes).toBe(50);
    expect(result.compressionRatio).toBe(0.5);
  });

  it('recommends quality based on file size', async () => {
    const inputPath = path.join(tmpRoot, 'large.pdf');
    fs.writeFileSync(
      inputPath,
      Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(12 * 1024 * 1024, 1)])
    );

    const recommendation = await recommendCompressionQuality(inputPath);
    expect(recommendation.recommendedQuality).toBe('ebook');
  });

  it('supports batch compression with partial failure reporting', async () => {
    const goodInputPath = path.join(tmpRoot, 'good.pdf');
    const badInputPath = path.join(tmpRoot, 'bad.txt');
    fs.writeFileSync(goodInputPath, validPdfBuffer);
    fs.writeFileSync(badInputPath, 'not pdf');

    const batch = await compressPdfBatch({
      files: [
        { inputPath: goodInputPath, quality: 'ebook' },
        { inputPath: badInputPath, quality: 'ebook' },
      ],
    });

    expect(batch.results).toHaveLength(2);
    expect(batch.results[0].ok).toBe(true);
    expect(batch.results[1].ok).toBe(false);
  });
});
