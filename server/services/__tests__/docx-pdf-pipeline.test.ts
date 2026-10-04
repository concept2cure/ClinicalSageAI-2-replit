import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process.spawn so we can exercise runDocxPdfPipeline's parsing /
// contract without invoking the real python3 + LibreOffice + Ghostscript chain.
vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';
import { runDocxPdfPipeline } from '../docx-pdf-pipeline';

/** A fake ChildProcess that emits the given stdout/stderr then closes. */
function fakeProc(opts: { stdout?: string; stderr?: string; code?: number }) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  setImmediate(() => {
    if (opts.stdout) proc.stdout.emit('data', Buffer.from(opts.stdout));
    if (opts.stderr) proc.stderr.emit('data', Buffer.from(opts.stderr));
    proc.emit('close', opts.code ?? 0);
  });
  return proc;
}

describe('runDocxPdfPipeline', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it('surfaces compressionSkipped when Ghostscript was unavailable', async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProc({
        stdout: JSON.stringify({
          ok: true,
          inputDocx: 'in.docx',
          convertedPdf: '/tmp/out.pdf',
          finalPdf: '/tmp/out.pdf',
          compression: null,
          compressionSkipped: 'ghostscript_unavailable',
        }),
      })
    );

    const res = await runDocxPdfPipeline({ inputDocxPath: 'in.docx', compress: true });

    expect(res.ok).toBe(true);
    expect(res.compression).toBeNull();
    expect(res.compressionSkipped).toBe('ghostscript_unavailable');
    // The produced PDF is preserved, not lost.
    expect(res.finalPdf).toBe('/tmp/out.pdf');
    expect(res.finalPdf).toBe(res.convertedPdf);
  });

  it('returns compression details when the pass ran', async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProc({
        stdout: JSON.stringify({
          ok: true,
          inputDocx: 'in.docx',
          convertedPdf: '/tmp/out.pdf',
          finalPdf: '/tmp/out.compressed.pdf',
          compression: {
            quality: 'screen',
            originalSizeBytes: 100,
            compressedSizeBytes: 60,
            compressionRatio: 0.6,
          },
          compressionSkipped: null,
        }),
      })
    );

    const res = await runDocxPdfPipeline({
      inputDocxPath: 'in.docx',
      compress: true,
      quality: 'screen',
    });

    expect(res.compressionSkipped).toBeNull();
    expect(res.compression?.compressedSizeBytes).toBe(60);
    expect(res.finalPdf.endsWith('.compressed.pdf')).toBe(true);
  });

  it('rejects when the pipeline exits non-zero', async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProc({ stderr: 'LibreOffice not installed', code: 1 })
    );

    await expect(
      runDocxPdfPipeline({ inputDocxPath: 'in.docx' })
    ).rejects.toThrow(/LibreOffice not installed/);
  });

  it('passes --compress and --quality through to the script', async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProc({
        stdout: JSON.stringify({
          ok: true,
          inputDocx: 'in.docx',
          convertedPdf: '/tmp/out.pdf',
          finalPdf: '/tmp/out.pdf',
          compression: null,
          compressionSkipped: null,
        }),
      })
    );

    await runDocxPdfPipeline({ inputDocxPath: 'in.docx', compress: true, quality: 'prepress' });

    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toContain('--compress');
    expect(args).toContain('--quality');
    expect(args).toContain('prepress');
    expect(args).toContain('--input-docx');
  });

});

describe('runDocxPdfPipeline — limits', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
  });

  // A LibreOffice that hangs held the tool call for ever: nothing timed the
  // conversion, and a spawn that failed (no python3) emitted 'error', which
  // nothing listened for, so the promise never settled either.
  it('stops a conversion that runs past its time limit, the whole process group, and says so', async () => {
    vi.useFakeTimers();
    try {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.pid = 4242;
      proc.kill = vi.fn();
      vi.mocked(spawn).mockReturnValue(proc);
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      const pending = runDocxPdfPipeline({ inputDocxPath: 'in.docx', timeoutMs: 1_000 });
      const settled = pending.then(() => 'resolved', (e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(1_000);
      proc.emit('close', null);

      expect(await settled).toMatch(/stopped after 1s/);
      expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
      expect(vi.mocked(spawn).mock.calls[0][2]).toMatchObject({ detached: true });
      killSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when the converter cannot be started at all', async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(proc);
    setTimeout(() => proc.emit('error', Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' })), 0);
    await expect(runDocxPdfPipeline({ inputDocxPath: 'in.docx' })).rejects.toThrow(/could not be started: spawn python3 ENOENT/);
  });
});
