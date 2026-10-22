/**
 * One converter limiter (MR-03 Stage 2 step 5, test 8.2; finding OPS-13).
 *
 * Production runs LibreOffice, the python3 DOCX→PDF pipeline, OCRmyPDF,
 * veraPDF and Ghostscript as child processes inside the one API task. Nothing
 * capped how many ran at once, so one large submission package could start a
 * child per leaf and starve the task until its health check failed.
 *
 * Every converter now takes a slot from `withConversionSlot`
 * (server/services/conversion-slots.ts), one FIFO limiter for the whole
 * process. These tests drive the REAL converter modules against a mocked
 * `child_process` that counts the children alive at any instant, so what is
 * measured is the property the finding is about: how many converter processes
 * exist at once, across every converter.
 *
 * A wait past CONVERTER_QUEUE_TIMEOUT_MS rejects with ConversionCapacityError:
 * the caller is told the converter is busy. It is never handed an empty result.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.CONVERTER_MAX_CONCURRENCY = '2';
  delete process.env.CONVERTER_QUEUE_TIMEOUT_MS;
});

/** What the fake child_process observed. Reset before every test. */
const cp = vi.hoisted(() => ({
  alive: 0,
  peak: 0,
  /** One entry per converter child started (version probes excluded). */
  started: [] as Array<{ command: string; args: string[] }>,
  /** How long each fake converter child stays alive. */
  holdMs: 120,
  /** Commands whose `--version` probe fails as if the binary were not installed. */
  missing: [] as string[],
}));

/**
 * A child_process whose converter children write their output, stay alive for
 * `cp.holdMs`, then exit 0. `--version` probes answer at once and are not
 * counted: they convert nothing and take no slot.
 */
const fakeChildProcess = vi.hoisted(() => async () => {
  const { EventEmitter } = await import('node:events');
  const nodeFs = await import('node:fs');
  const nodePath = await import('node:path');

  function writeOutputFor(command: string, args: string[]): string {
    if (command === 'libreoffice') {
      const input = args[args.length - 1];
      nodeFs.writeFileSync(input.replace(/\.docx$/, '.pdf'), '%PDF-1.4\nfake libreoffice output\n%%EOF');
      return '';
    }
    if (command === 'python3') {
      const input = args[args.indexOf('--input-docx') + 1];
      const pdf = input.replace(/\.docx$/, '.pdf');
      return JSON.stringify({ ok: true, inputDocx: input, convertedPdf: pdf, finalPdf: pdf, compression: null });
    }
    const out = args.find((a) => a.startsWith('-sOutputFile='))?.slice('-sOutputFile='.length);
    if (out) {
      nodeFs.mkdirSync(nodePath.dirname(out), { recursive: true });
      nodeFs.writeFileSync(out, '%PDF-1.4\nfake ghostscript output\n%%EOF');
    }
    return command === 'verapdf' ? 'PASS' : '';
  }

  function startChild(command: string, args: string[], done: (stdout: string) => void): void {
    cp.alive += 1;
    cp.peak = Math.max(cp.peak, cp.alive);
    cp.started.push({ command, args: [...args] });
    setTimeout(() => {
      const stdout = writeOutputFor(command, args);
      cp.alive -= 1;
      done(stdout);
    }, cp.holdMs);
  }

  const spawn = (command: string, args: string[] = []) => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 4242;
    child.kill = () => true;
    const finish = (stdout: string) => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      child.emit('exit', 0);
      child.emit('close', 0);
    };
    if (args.includes('--version')) setImmediate(() => finish('1.0'));
    else startChild(command, args, finish);
    return child;
  };

  const execFile: any = (command: string, args: string[], opts: unknown, cb?: unknown) => {
    const callback = (typeof opts === 'function' ? opts : cb) as (e: unknown, out: string, err: string) => void;
    if (args.includes('--version')) {
      const absent = cp.missing.includes(command) ? Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' }) : null;
      setImmediate(() => callback(absent, '10.0', ''));
      return;
    }
    startChild(command, args, (stdout) => callback(null, stdout, ''));
  };
  // util.promisify(execFile) resolves { stdout, stderr }, as the real one does.
  execFile[Symbol.for('nodejs.util.promisify.custom')] = (command: string, args: string[], opts: unknown) =>
    new Promise((resolve, reject) =>
      execFile(command, args, opts, (e: unknown, stdout: string, stderr: string) => (e ? reject(e) : resolve({ stdout, stderr }))),
    );

  const mod = { spawn, execFile, spawnSync: () => ({ status: 0, error: undefined }) };
  return { ...mod, default: mod };
});

vi.mock('node:child_process', () => fakeChildProcess());
vi.mock('child_process', () => fakeChildProcess());

import { convertDocxToPdf } from '../pdf-converter';
import { runDocxPdfPipeline } from '../docx-pdf-pipeline';
import { OcrMyPdfClient } from '../../integrations/ocrmypdf/client';
import { VeraPdfClient } from '../../integrations/verapdf/client';
import { compressPdfBatch, compressPdfWithGhostscript, isGhostscriptAvailable } from '../pdf-compression-service';
import { finalizePdfA } from '../ectd/pdfa-pipeline';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'conversion-slots-test-'));
const iccPath = path.join(tmpRoot, 'srgb.icc');
fs.writeFileSync(iccPath, Buffer.alloc(16, 1));
const docx = Buffer.from('PK\u0003\u0004 not really a docx; the converter is faked');

function pdfOnDisk(name: string): string {
  const p = path.join(tmpRoot, name);
  fs.writeFileSync(p, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 1)]));
  return p;
}

const savedEnv = { ...process.env };

beforeEach(() => {
  cp.alive = 0;
  cp.peak = 0;
  cp.started.length = 0;
  cp.holdMs = 120;
  cp.missing.length = 0;
  process.env.PDF_COMPRESSION_ALLOWED_ROOTS = tmpRoot;
  process.env.PDFA_SRGB_ICC = iccPath;
});

afterEach(() => {
  for (const key of ['CONVERTER_MAX_CONCURRENCY', 'CONVERTER_QUEUE_TIMEOUT_MS', 'PDF_COMPRESSION_ALLOWED_ROOTS', 'PDFA_SRGB_ICC']) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});


/**
 * Wait until the two holder conversions are running. Each writes its input
 * file before it queues, so a fixed delay is a guess under a loaded runner.
 */
async function bothSlotsHeld(): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (cp.alive < 2) {
    if (Date.now() > deadline) throw new Error(`holders never took both slots (alive ${cp.alive})`);
    await new Promise((r) => setTimeout(r, 2));
  }
}

describe('peak converter children never exceed CONVERTER_MAX_CONCURRENCY', () => {
  it('five concurrent LibreOffice conversions keep at most two children alive, and all five complete', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => convertDocxToPdf(docx, { backend: 'libreoffice' })),
    );

    expect(cp.started).toHaveLength(5);
    expect(cp.peak).toBeLessThanOrEqual(2);
    // Every request got its PDF: the cap queues work, it never drops it.
    for (const r of results) {
      expect(r.backend).toBe('libreoffice');
      expect(r.pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }
  });

  it('the cap is one budget for the whole process, across every converter', async () => {
    const jobs: Array<Promise<unknown>> = [
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      runDocxPdfPipeline({ inputDocxPath: path.join(tmpRoot, 'a.docx') }),
      runDocxPdfPipeline({ inputDocxPath: path.join(tmpRoot, 'b.docx') }),
      new OcrMyPdfClient('ocrmypdf').run(pdfOnDisk('scan.pdf'), path.join(tmpRoot, 'scan.ocr.pdf')),
      new VeraPdfClient('verapdf').validate(pdfOnDisk('vera.pdf')),
      compressPdfWithGhostscript({ inputPath: pdfOnDisk('big.pdf'), outputPath: path.join(tmpRoot, 'big.small.pdf') }),
      finalizePdfA(Buffer.from('%PDF-1.7\nleaf body\n%%EOF')),
    ];
    const settled = await Promise.allSettled(jobs);

    expect(settled.map((s) => s.status)).toEqual(Array(jobs.length).fill('fulfilled'));
    const commands = cp.started.map((s) => s.command);
    expect(commands).toEqual(
      expect.arrayContaining(['libreoffice', 'python3', 'ocrmypdf', 'verapdf', 'gs']),
    );
    expect(cp.started).toHaveLength(jobs.length);
    expect(cp.peak).toBeLessThanOrEqual(2);
  });

  it('OCRmyPDF is told to run one job, so its own worker pool cannot multiply the slot', async () => {
    await new OcrMyPdfClient('ocrmypdf').run(pdfOnDisk('one-job.pdf'), path.join(tmpRoot, 'one-job.ocr.pdf'));
    const ocr = cp.started.find((s) => s.command === 'ocrmypdf');
    expect(ocr).toBeDefined();
    const at = ocr!.args.indexOf('--jobs');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(ocr!.args[at + 1]).toBe('1');
  });
});

describe('a wait past CONVERTER_QUEUE_TIMEOUT_MS', () => {
  it('rejects with ConversionCapacityError and starts no child for that request', async () => {
    const { ConversionCapacityError } = await import('../conversion-slots');
    process.env.CONVERTER_QUEUE_TIMEOUT_MS = '80';
    cp.holdMs = 400;

    const settled = await Promise.allSettled([
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
    ]);

    // Each conversion writes its input file before it queues, so which of the
    // three arrives last depends on the filesystem; FIFO order has its own test
    // below. What holds whatever the order: two ran, one was refused.
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(2);
    const refused = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    expect(refused).toHaveLength(1);
    const reason = refused[0].reason;
    expect(reason).toBeInstanceOf(ConversionCapacityError);
    expect(reason.kind).toBe('libreoffice');
    expect(reason.retryAfterSeconds).toBeGreaterThan(0);
    expect(reason.statusCode).toBe(503);
    expect(reason.message).toMatch(/busy/i);
    // The third request was refused while queued: no third child ever started.
    expect(cp.started).toHaveLength(2);
    expect(cp.peak).toBeLessThanOrEqual(2);
  });

  it('a capacity refusal inside PDF/A finalization is not reported as "returned unchanged"', async () => {
    const { ConversionCapacityError } = await import('../conversion-slots');
    process.env.CONVERTER_QUEUE_TIMEOUT_MS = '80';
    cp.holdMs = 400;
    // Two long conversions hold both slots; the leaf finalization then waits past the timeout.
    const holders = [
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
    ];
    await bothSlotsHeld();
    // finalizePdfA otherwise never throws; a busy converter is the one thing it
    // must not turn into converted:false, because the packager would then ship
    // the leaf as not-PDF/A on the strength of a queue, not of the bytes.
    await expect(finalizePdfA(Buffer.from('%PDF-1.7\nleaf\n%%EOF'))).rejects.toBeInstanceOf(ConversionCapacityError);
    await Promise.all(holders);
  });

  it('with no Ghostscript, a veraPDF run that never started is refused, not written up as a validation note', async () => {
    const { ConversionCapacityError } = await import('../conversion-slots');
    process.env.CONVERTER_QUEUE_TIMEOUT_MS = '80';
    cp.holdMs = 400;
    cp.missing.push('gs');
    const holders = [
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
    ];
    await bothSlotsHeld();
    await expect(finalizePdfA(Buffer.from('%PDF-1.7\nleaf\n%%EOF'))).rejects.toBeInstanceOf(ConversionCapacityError);
    await Promise.all(holders);
    expect(cp.started.some((s) => s.command === 'verapdf')).toBe(false);
  });

  it('stops a compression batch at the first refusal instead of failing each file in turn', async () => {
    const { ConversionCapacityError } = await import('../conversion-slots');
    process.env.CONVERTER_QUEUE_TIMEOUT_MS = '80';
    cp.holdMs = 400;
    const holders = [
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
    ];
    await bothSlotsHeld();
    // Each later file would otherwise wait out the queue timeout again and be
    // listed as one more failed file; at 120 s a 50-file batch is 100 minutes.
    await expect(
      compressPdfBatch({ files: ['b1.pdf', 'b2.pdf', 'b3.pdf'].map((n) => ({ inputPath: pdfOnDisk(n) })) }),
    ).rejects.toBeInstanceOf(ConversionCapacityError);
    await Promise.all(holders);
    expect(cp.started.filter((s) => s.command === 'gs')).toHaveLength(0);
  });

  it('a version probe takes no slot: Ghostscript is reported present while every slot is held', async () => {
    process.env.CONVERTER_QUEUE_TIMEOUT_MS = '80';
    cp.holdMs = 400;
    const holders = [
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
      convertDocxToPdf(docx, { backend: 'libreoffice' }),
    ];
    await bothSlotsHeld();
    // Queued behind the holders, the probe would be refused for capacity and
    // read as "not installed": a busy converter disguised as a missing one.
    await expect(isGhostscriptAvailable()).resolves.toBe(true);
    await Promise.all(holders);
  });
});

describe('withConversionSlot', () => {
  afterEach(async () => {
    (await import('../conversion-slots')).resetConversionSlotsForTests();
  });

  it('grants slots in arrival order (FIFO)', async () => {
    const slots = await import('../conversion-slots');
    process.env.CONVERTER_MAX_CONCURRENCY = '1';
    slots.resetConversionSlotsForTests();

    let releaseHolder!: () => void;
    const holder = slots.withConversionSlot('holder', () => new Promise<void>((r) => { releaseHolder = r; }));
    await new Promise((r) => setTimeout(r, 5));

    const order: string[] = [];
    const queued = ['a', 'b', 'c', 'd'].map((name) =>
      slots.withConversionSlot(name, async () => { order.push(name); }),
    );
    releaseHolder();
    await Promise.all([holder, ...queued]);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('releases the slot when the conversion throws, and passes the error through unchanged', async () => {
    const slots = await import('../conversion-slots');
    process.env.CONVERTER_MAX_CONCURRENCY = '1';
    process.env.CONVERTER_QUEUE_TIMEOUT_MS = '100';
    slots.resetConversionSlotsForTests();

    const boom = new Error('LibreOffice exited with code 77');
    await expect(slots.withConversionSlot('libreoffice', async () => { throw boom; })).rejects.toBe(boom);
    // Were the slot leaked, this would wait 100 ms and fail with ConversionCapacityError.
    await expect(slots.withConversionSlot('libreoffice', async () => 'next')).resolves.toBe('next');
  });

  it('a conversion started inside a slot runs under that slot, so nesting cannot deadlock', async () => {
    const slots = await import('../conversion-slots');
    process.env.CONVERTER_MAX_CONCURRENCY = '1';
    process.env.CONVERTER_QUEUE_TIMEOUT_MS = '100';
    slots.resetConversionSlotsForTests();

    const result = await slots.withConversionSlot('outer', () =>
      slots.withConversionSlot('inner', async () => 'inner ran'),
    );
    expect(result).toBe('inner ran');
  });

  it('reads CONVERTER_MAX_CONCURRENCY and CONVERTER_QUEUE_TIMEOUT_MS, falling back to 2 and 120000', async () => {
    const { resolveConverterMaxConcurrency, resolveConverterQueueTimeoutMs } = await import('../conversion-slots');
    for (const bad of [undefined, '', '0', '-3', 'abc', '1.5']) {
      expect(resolveConverterMaxConcurrency({ CONVERTER_MAX_CONCURRENCY: bad })).toBe(2);
      expect(resolveConverterQueueTimeoutMs({ CONVERTER_QUEUE_TIMEOUT_MS: bad })).toBe(120_000);
    }
    expect(resolveConverterMaxConcurrency({ CONVERTER_MAX_CONCURRENCY: '3' })).toBe(3);
    expect(resolveConverterQueueTimeoutMs({ CONVERTER_QUEUE_TIMEOUT_MS: '45000' })).toBe(45_000);
  });
});
