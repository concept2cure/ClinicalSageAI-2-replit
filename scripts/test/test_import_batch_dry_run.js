import fs from 'fs';
import path from 'path';
import os from 'os';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-import-dry-run-'));
  process.chdir(root);
  process.env.HC_DRY_RUN = '1';
  process.env.HC_BATCH_SIZE = '3';

  const { runBatchOf50 } = await import('../../scripts/import/import_batch_of_50.js');
  const result = await runBatchOf50();

  const processedDir = path.join(root, 'data/processed_csrs');
  const atomsPath = path.join(root, 'data/knowledge_structure/ana_csr_intelligence_atoms.jsonl');
  const trackingPath = path.join(root, 'hc_import_tracker.json');

  assert(result.importedCount >= 1, 'dry-run should import at least one record');
  assert(fs.existsSync(processedDir), 'processed dir should exist');
  assert(fs.readdirSync(processedDir).length >= 1, 'processed files should be created');
  assert(fs.existsSync(atomsPath), 'atoms jsonl should be created');
  assert(fs.existsSync(trackingPath), 'tracking file should be created');

  console.log('✅ import batch dry-run tests passed');
}

main().catch(error => {
  console.error('❌ import batch dry-run tests failed:', error.message);
  process.exit(1);
});
