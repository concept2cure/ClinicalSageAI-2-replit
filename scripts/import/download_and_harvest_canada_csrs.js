import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const logger = {
  info: (...args) => console.log('[CANADA-CSR-REAL]', ...args),
  warn: (...args) => console.warn('[CANADA-CSR-REAL]', ...args),
  error: (...args) => console.error('[CANADA-CSR-REAL]', ...args),
};

const DEFAULTS = {
  manifestPath:
    process.env.CANADA_CSR_MANIFEST || path.join(process.cwd(), 'data/sources/canada_csr_manifest.json'),
  rawDir: path.join(process.cwd(), 'data/raw_documents/canada_csrs'),
  processedDir: path.join(process.cwd(), 'data/processed_csrs'),
  intelligenceDir: path.join(process.cwd(), 'data/knowledge_structure'),
  atomsJsonl: path.join(process.cwd(), 'data/knowledge_structure/ana_csr_intelligence_atoms.jsonl'),
  reportPath: path.join(process.cwd(), 'data/test_output/canada_csr_ingestion_report.json'),
  maxDownloadBytes: Number(process.env.CANADA_CSR_MAX_DOWNLOAD_BYTES || 25 * 1024 * 1024),
};

export function parseCliArgs(argv = process.argv.slice(2)) {
  return {
    useLocalFixtures: argv.includes('--use-local-fixtures'),
    requireDownload: argv.includes('--require-download'),
    strictPdfOnly: argv.includes('--strict-pdf-only'),
  };
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function resolveRecordUrl(record) {
  return record.directPdfUrl || record.downloadUrl || null;
}

export function isPdfLike(url) {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return normalized.endsWith('.pdf') || normalized.includes('.pdf?') || normalized.includes('format=pdf');
}

function ensureDirs(pathsCfg) {
  fs.mkdirSync(pathsCfg.rawDir, { recursive: true });
  fs.mkdirSync(pathsCfg.processedDir, { recursive: true });
  fs.mkdirSync(pathsCfg.intelligenceDir, { recursive: true });
  fs.mkdirSync(path.dirname(pathsCfg.reportPath), { recursive: true });
}

async function downloadBinary(url, attempts = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get('content-type') || '';
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { buffer: Buffer.from(bytes), contentType };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
      }
    }
  }

  throw lastError;
}

function getFixtureFiles() {
  const candidateFiles = [
    path.join(process.cwd(), 'csrs/A0221045_Synopsis.pdf'),
    path.join(process.cwd(), 'csrs/NCT01561027-Synopsis.pdf'),
    path.join(process.cwd(), 'csrs/A0081186_Synopsis.pdf'),
  ];

  return candidateFiles.filter(file => fs.existsSync(file)).map((file, i) => ({
    id: `FIXTURE-${i + 1}`,
    nctId: `LOCAL-FIXTURE-${i + 1}`,
    title: path.basename(file, '.pdf'),
    sponsor: 'Fixture Sponsor',
    country: 'Canada',
    source: 'Local fixture for end-to-end workflow validation',
    localFile: file,
  }));
}

function validateManifestRecords(records) {
  const issues = [];
  records.forEach((record, idx) => {
    if (!record.id) issues.push(`record[${idx}] missing id`);
    if (!record.title) issues.push(`record[${idx}] missing title`);
    if (!record.nctId && !record.id) issues.push(`record[${idx}] missing nctId`);
  });
  return issues;
}

async function harvestPdf(record, pdfBuffer, localPdfPath, cfg, mode) {
  const parsed = await pdfParse(pdfBuffer);
  const normalizedText = (parsed.text || '').replace(/\s+/g, ' ').trim();
  const snippet = normalizedText.slice(0, 1200);

  const processed = {
    nctrialId: record.nctId || record.id,
    title: record.title,
    sponsor: record.sponsor || 'Unknown',
    country: record.country || 'Canada',
    source: record.source || 'Health Canada Clinical Information Portal',
    ingestionMode: mode,
    fileName: path.basename(localPdfPath),
    filePath: localPdfPath,
    fileSha256: sha256(pdfBuffer),
    harvestedAt: new Date().toISOString(),
    extractedTextPreview: snippet,
  };

  const processedPath = path.join(cfg.processedDir, `${processed.nctrialId}.json`);
  fs.writeFileSync(processedPath, JSON.stringify(processed, null, 2));

  const atom = {
    atom_type: 'csr_pdf_harvest',
    id: processed.nctrialId,
    title: processed.title,
    country: processed.country,
    source: processed.source,
    evidence_text: snippet,
    file_sha256: processed.fileSha256,
    harvested_at: processed.harvestedAt,
  };

  fs.appendFileSync(cfg.atomsJsonl, `${JSON.stringify(atom)}\n`);
  return processedPath;
}

function loadManifest(cfg, useLocalFixtures) {
  if (useLocalFixtures) return getFixtureFiles();
  if (!fs.existsSync(cfg.manifestPath)) throw new Error(`Manifest not found: ${cfg.manifestPath}`);
  return JSON.parse(fs.readFileSync(cfg.manifestPath, 'utf8'));
}

export async function runCanadaCsrIngestion(options = {}) {
  const flags = { ...parseCliArgs(), ...options };
  const cfg = { ...DEFAULTS, ...options };
  const mode = flags.useLocalFixtures ? 'local-fixture' : 'remote-download';

  ensureDirs(cfg);

  const manifest = loadManifest(cfg, flags.useLocalFixtures);
  const manifestIssues = validateManifestRecords(manifest);
  if (manifestIssues.length) {
    throw new Error(`Manifest validation failed: ${manifestIssues.join('; ')}`);
  }
  logger.info(`Loaded ${manifest.length} record(s) in ${mode} mode.`);

  const report = {
    startedAt: new Date().toISOString(),
    mode,
    manifestPath: cfg.manifestPath,
    downloaded: [],
    failed: [],
    harvested: [],
  };

  for (const record of manifest) {
    try {
      let pdfBuffer;
      let localPdfPath;

      if (flags.useLocalFixtures) {
        localPdfPath = path.join(cfg.rawDir, `${record.id}.pdf`);
        pdfBuffer = fs.readFileSync(record.localFile);
        fs.writeFileSync(localPdfPath, pdfBuffer);
      } else {
        const sourceUrl = resolveRecordUrl(record);
        if (!sourceUrl) throw new Error('Missing directPdfUrl/downloadUrl in manifest record');
        if (flags.strictPdfOnly && !isPdfLike(sourceUrl)) {
          throw new Error('URL does not appear to be a direct PDF link');
        }

        const { buffer, contentType } = await downloadBinary(sourceUrl);
        if (buffer.length > cfg.maxDownloadBytes) {
          throw new Error(`Downloaded file exceeds size limit (${buffer.length} bytes)`);
        }
        if (flags.strictPdfOnly && !contentType.toLowerCase().includes('pdf')) {
          throw new Error(`Downloaded content-type is not PDF: ${contentType || 'unknown'}`);
        }

        pdfBuffer = buffer;
        localPdfPath = path.join(cfg.rawDir, `${record.id}.pdf`);
        fs.writeFileSync(localPdfPath, pdfBuffer);
      }

      report.downloaded.push({ id: record.id, path: localPdfPath, bytes: pdfBuffer.length });
      const processedPath = await harvestPdf(record, pdfBuffer, localPdfPath, cfg, mode);
      report.harvested.push({ id: record.id, processedPath });
      logger.info(`Ingested ${record.id}`);
    } catch (error) {
      report.failed.push({ id: record.id, error: error.message });
      logger.warn(`Failed ${record.id}: ${error.message}`);
    }
  }

  report.completedAt = new Date().toISOString();
  report.successCount = report.harvested.length;
  report.failureCount = report.failed.length;
  fs.writeFileSync(cfg.reportPath, JSON.stringify(report, null, 2));

  logger.info(`Run complete. success=${report.successCount}, failed=${report.failureCount}`);
  logger.info(`Report: ${cfg.reportPath}`);

  if (flags.requireDownload && report.downloaded.length === 0) {
    throw new Error('No records were downloaded.');
  }

  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runCanadaCsrIngestion().catch(error => {
    logger.error(error.message);
    process.exit(1);
  });
}
