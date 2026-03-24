import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseCliArgs,
  isPdfLike,
  resolveRecordUrl,
  runCanadaCsrIngestion,
} from '../import/download_and_harvest_canada_csrs.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const parsed = parseCliArgs(['--use-local-fixtures', '--strict-pdf-only']);
  assert(parsed.useLocalFixtures === true, 'parseCliArgs should parse --use-local-fixtures');
  assert(parsed.strictPdfOnly === true, 'parseCliArgs should parse --strict-pdf-only');

  assert(isPdfLike('https://example.com/doc.pdf') === true, 'isPdfLike should recognize .pdf URL');
  assert(
    isPdfLike('https://example.com/download?id=1') === false,
    'isPdfLike should reject non-pdf URL'
  );

  assert(
    resolveRecordUrl({ directPdfUrl: 'https://x/doc.pdf', downloadUrl: 'https://x/fallback.pdf' }) ===
      'https://x/doc.pdf',
    'resolveRecordUrl should prefer directPdfUrl'
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canada-csr-test-'));
  const cfg = {
    useLocalFixtures: true,
    requireDownload: false,
    strictPdfOnly: false,
    rawDir: path.join(tmpRoot, 'raw'),
    processedDir: path.join(tmpRoot, 'processed'),
    intelligenceDir: path.join(tmpRoot, 'knowledge'),
    atomsJsonl: path.join(tmpRoot, 'knowledge', 'atoms.jsonl'),
    reportPath: path.join(tmpRoot, 'report.json'),
  };

  const report = await runCanadaCsrIngestion(cfg);
  assert(report.successCount >= 1, 'fixture ingestion should harvest at least one record');
  assert(fs.existsSync(cfg.reportPath), 'report should be created');
  assert(fs.existsSync(cfg.atomsJsonl), 'atoms jsonl should be created');

  console.log('✅ canada csr ingestion tests passed');
}

main().catch(error => {
  console.error('❌ canada csr ingestion tests failed:', error.message);
  process.exit(1);
});
