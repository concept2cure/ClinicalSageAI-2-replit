import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateClientValueMetrics } from '../import/generate_csr_value_metrics.js';
import { generateClientBrief } from '../import/generate_csr_client_brief.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csr-value-metrics-'));
  const processedDir = path.join(root, 'processed');
  const atomsPath = path.join(root, 'knowledge', 'atoms.jsonl');
  const outputPath = path.join(root, 'knowledge', 'client_value_metrics.json');
  const briefPath = path.join(root, 'knowledge', 'client_value_brief.md');

  writeJson(path.join(processedDir, 'one.json'), {
    nctrialId: 'A',
    indication: 'Oncology',
    sponsor: 'Sponsor A',
    country: 'Canada',
    harvestedAt: new Date().toISOString(),
  });

  writeJson(path.join(processedDir, 'two.json'), {
    nctrialId: 'B',
    indication: 'Cardiology',
    sponsor: 'Sponsor B',
    country: 'Canada',
    harvestedAt: new Date().toISOString(),
  });

  fs.mkdirSync(path.dirname(atomsPath), { recursive: true });
  fs.writeFileSync(
    atomsPath,
    [
      JSON.stringify({
        id: 'A',
        indication: 'Oncology',
        sponsor: 'Sponsor A',
        country: 'Canada',
        harvested_at: new Date().toISOString(),
        evidence_text: 'Strong endpoint achievement evidence across cohorts.',
      }),
      JSON.stringify({
        id: 'B',
        indication: 'Cardiology',
        sponsor: 'Sponsor B',
        country: 'Canada',
        harvested_at: new Date().toISOString(),
        evidence_text: 'Meaningful safety and efficacy balance observed in study population.',
      }),
    ].join('\n')
  );

  const metrics = generateClientValueMetrics({ processedDir, atomsPath, outputPath });

  assert(metrics.totals.processedCsrs === 2, 'processed count should be 2');
  assert(metrics.totals.intelligenceAtoms === 2, 'atom count should be 2');
  assert(metrics.valueReadinessScore > 0, 'value readiness should be positive');
  assert(metrics.diagnostics.diagnosticsScore > 0, 'diagnostics score should be present');
  assert(Array.isArray(metrics.humanValueSignals), 'human value signals should be array');
  assert(fs.existsSync(outputPath), 'metrics output file should exist');

  const brief = generateClientBrief({ metricsPath: outputPath, outputPath: briefPath });
  assert(fs.existsSync(briefPath), 'brief output file should exist');
  assert(brief.markdown.includes('CSR Intelligence Client Value Brief'), 'brief should include title');

  console.log('✅ csr value metrics + brief tests passed');
}

main().catch(error => {
  console.error('❌ csr value metrics + brief tests failed:', error.message);
  process.exit(1);
});
