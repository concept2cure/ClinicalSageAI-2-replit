import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type PdfCompressionQuality = 'screen' | 'ebook' | 'printer' | 'prepress' | 'default';

export interface CompressPdfOptions {
  inputPath: string;
  outputPath?: string;
  quality?: PdfCompressionQuality;
}

export interface CompressPdfResult {
  outputPath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number;
}

export interface CompressionProfile {
  quality: PdfCompressionQuality;
  label: string;
  expectedUseCase: string;
}

export interface CompressionRecommendation {
  inputPath: string;
  originalSizeBytes: number;
  recommendedQuality: PdfCompressionQuality;
  reason: string;
}

export interface BatchCompressOptions {
  files: Array<{
    inputPath: string;
    outputPath?: string;
    quality?: PdfCompressionQuality;
  }>;
  defaultQuality?: PdfCompressionQuality;
}

export interface BatchCompressResult {
  results: Array<
    | { ok: true; inputPath: string; result: CompressPdfResult }
    | { ok: false; inputPath: string; error: string }
  >;
  summary: {
    total: number;
    success: number;
    failed: number;
  };
}

const SUPPORTED_QUALITIES: ReadonlySet<PdfCompressionQuality> = new Set([
  'screen',
  'ebook',
  'printer',
  'prepress',
  'default',
]);

export const COMPRESSION_PROFILES: CompressionProfile[] = [
  {
    quality: 'screen',
    label: 'Screen',
    expectedUseCase: 'Smallest size for on-screen review and chat sharing',
  },
  {
    quality: 'ebook',
    label: 'eBook',
    expectedUseCase: 'Balanced quality/size for collaboration and storage',
  },
  {
    quality: 'printer',
    label: 'Printer',
    expectedUseCase: 'High-quality print handoff with moderate compression',
  },
  {
    quality: 'prepress',
    label: 'Prepress',
    expectedUseCase: 'Near-source fidelity for submission-ready archival',
  },
  {
    quality: 'default',
    label: 'Default',
    expectedUseCase: 'Generic Ghostscript defaults when no profile preference exists',
  },
];

function getAllowedRoots(): string[] {
  const configured = process.env.PDF_COMPRESSION_ALLOWED_ROOTS;
  const rawRoots = configured
    ? configured.split(',').map(r => r.trim()).filter(Boolean)
    : [path.join(process.cwd(), 'data'), '/tmp'];
  return rawRoots.map(root => path.resolve(root));
}

function assertPathInsideAllowedRoots(targetPath: string, label: 'input' | 'output'): void {
  const resolved = path.resolve(targetPath);
  const allowedRoots = getAllowedRoots();
  const allowed = allowedRoots.some(root => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!allowed) {
    throw new Error(
      `${label}Path must be within allowed roots (${allowedRoots.join(', ')}). Received: ${resolved}`
    );
  }
}

function resolveGsBinary(): string {
  return process.env.GHOSTSCRIPT_BINARY || 'gs';
}

async function assertLikelyPdfHeader(filePath: string): Promise<void> {
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(5);
    await fileHandle.read(buffer, 0, 5, 0);
    const magic = buffer.toString('utf8');
    if (magic !== '%PDF-') {
      throw new Error(`inputPath is not a valid PDF (missing %PDF- header): ${filePath}`);
    }
  } finally {
    await fileHandle.close();
  }
}

function resolveOutputPath(inputPath: string, outputPath?: string): string {
  if (outputPath) return path.resolve(outputPath);
  const ext = path.extname(inputPath);
  const base = inputPath.slice(0, -ext.length);
  return `${base}.compressed${ext || '.pdf'}`;
}

export async function isGhostscriptAvailable(): Promise<boolean> {
  try {
    await execFileAsync(resolveGsBinary(), ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function compressPdfWithGhostscript(
  options: CompressPdfOptions
): Promise<CompressPdfResult> {
  const inputPath = path.resolve(options.inputPath);
  const outputPath = resolveOutputPath(inputPath, options.outputPath);
  const quality = options.quality || 'ebook';
  const inputExt = path.extname(inputPath).toLowerCase();
  const outputExt = path.extname(outputPath).toLowerCase();

  if (inputExt !== '.pdf') {
    throw new Error(`inputPath must point to a .pdf file: ${inputPath}`);
  }
  if (outputExt !== '.pdf') {
    throw new Error(`outputPath must use .pdf extension: ${outputPath}`);
  }
  if (!SUPPORTED_QUALITIES.has(quality)) {
    throw new Error(`Unsupported quality "${quality}".`);
  }
  if (inputPath === outputPath) {
    throw new Error('outputPath must be different from inputPath.');
  }

  assertPathInsideAllowedRoots(inputPath, 'input');
  assertPathInsideAllowedRoots(outputPath, 'output');

  const qualitySettingMap: Record<PdfCompressionQuality, string> = {
    screen: '/screen',
    ebook: '/ebook',
    printer: '/printer',
    prepress: '/prepress',
    default: '/default',
  };

  const qualitySetting = qualitySettingMap[quality] || '/ebook';

  const inputStat = await fs.stat(inputPath);
  if (!inputStat.isFile()) {
    throw new Error(`Input path is not a file: ${inputPath}`);
  }
  await assertLikelyPdfHeader(inputPath);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await execFileAsync(
    resolveGsBinary(),
    [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${qualitySetting}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ],
    { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
  );

  const outputStat = await fs.stat(outputPath);

  return {
    outputPath,
    originalSizeBytes: inputStat.size,
    compressedSizeBytes: outputStat.size,
    compressionRatio:
      inputStat.size > 0 ? Number((outputStat.size / inputStat.size).toFixed(4)) : 1,
  };
}

export async function recommendCompressionQuality(inputPath: string): Promise<CompressionRecommendation> {
  const resolved = path.resolve(inputPath);
  assertPathInsideAllowedRoots(resolved, 'input');
  if (path.extname(resolved).toLowerCase() !== '.pdf') {
    throw new Error(`inputPath must point to a .pdf file: ${resolved}`);
  }

  const stats = await fs.stat(resolved);
  const size = stats.size;

  let recommendedQuality: PdfCompressionQuality = 'ebook';
  let reason = 'Balanced compression selected by default.';

  if (size > 40 * 1024 * 1024) {
    recommendedQuality = 'screen';
    reason = 'File is very large (>40MB); prioritized aggressive compression.';
  } else if (size > 10 * 1024 * 1024) {
    recommendedQuality = 'ebook';
    reason = 'File is large (>10MB); selected balanced compression.';
  } else if (size < 2 * 1024 * 1024) {
    recommendedQuality = 'printer';
    reason = 'File is already small (<2MB); preserving higher fidelity.';
  }

  return {
    inputPath: resolved,
    originalSizeBytes: size,
    recommendedQuality,
    reason,
  };
}

export async function compressPdfBatch(options: BatchCompressOptions): Promise<BatchCompressResult> {
  const defaultQuality = options.defaultQuality || 'ebook';
  if (!SUPPORTED_QUALITIES.has(defaultQuality)) {
    throw new Error(`Unsupported defaultQuality "${defaultQuality}".`);
  }

  const tasks = options.files || [];
  const maxBatchFiles = Number(process.env.PDF_COMPRESSION_MAX_BATCH_FILES || 50);
  if (tasks.length > maxBatchFiles) {
    throw new Error(`Batch size ${tasks.length} exceeds maximum ${maxBatchFiles}.`);
  }
  if (tasks.length === 0) {
    return {
      results: [],
      summary: { total: 0, success: 0, failed: 0 },
    };
  }

  const results: BatchCompressResult['results'] = [];
  for (const task of tasks) {
    const inputPath = task.inputPath;
    try {
      const result = await compressPdfWithGhostscript({
        inputPath,
        outputPath: task.outputPath,
        quality: task.quality || defaultQuality,
      });
      results.push({ ok: true, inputPath, result });
    } catch (error: any) {
      results.push({ ok: false, inputPath, error: error?.message || 'Unknown error' });
    }
  }

  const success = results.filter(r => r.ok).length;
  const failed = results.length - success;
  return {
    results,
    summary: {
      total: results.length,
      success,
      failed,
    },
  };
}
