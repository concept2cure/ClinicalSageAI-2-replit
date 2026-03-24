import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  metricsPath: path.join(process.cwd(), 'data/knowledge_structure/client_value_metrics.json'),
  outputPath: path.join(process.cwd(), 'data/knowledge_structure/client_value_brief.md'),
};

function loadMetrics(metricsPath) {
  if (!fs.existsSync(metricsPath)) {
    throw new Error(`Metrics file not found: ${metricsPath}`);
  }
  return JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
}

function formatSignals(signals = []) {
  if (!signals.length) return '- No active risks detected.';
  return signals
    .map(
      s =>
        `- **${s.signal}** (${s.severity})\n  - Impact: ${s.clientImpact}\n  - Action: ${s.action}`
    )
    .join('\n');
}

export function buildClientBrief(metrics) {
  return `# CSR Intelligence Client Value Brief

Generated: ${metrics.generatedAt}

## Executive Snapshot

- Value readiness score: **${metrics.valueReadinessScore}/100**
- Freshness score: **${metrics.freshness?.freshnessScore ?? 0}/100**
- Atomization coverage: **${metrics.quality?.atomizationCoveragePercent ?? 0}%**
- Coverage score: **${metrics.coverage?.coverageScore ?? 0}/100**
- Diagnostics score: **${metrics.diagnostics?.diagnosticsScore ?? 0}/100**

## Human Value Signals

${formatSignals(metrics.humanValueSignals)}

## Coverage Highlights

Top indications:
${(metrics.coverage?.topIndications || []).map(i => `- ${i.name}: ${i.count}`).join('\n') || '- none'}

Top sponsors:
${(metrics.coverage?.topSponsors || []).map(i => `- ${i.name}: ${i.count}`).join('\n') || '- none'}

Countries:
${(metrics.coverage?.countries || []).map(c => `- ${c}`).join('\n') || '- none'}

## Priority Actions (Next Sprint)

${(metrics.recommendations || []).map(i => `- ${i}`).join('\n') || '- none'}
`;
}

export function generateClientBrief(config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const metrics = loadMetrics(cfg.metricsPath);
  const markdown = buildClientBrief(metrics);
  fs.mkdirSync(path.dirname(cfg.outputPath), { recursive: true });
  fs.writeFileSync(cfg.outputPath, markdown);
  return { outputPath: cfg.outputPath, markdown };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { outputPath } = generateClientBrief();
  console.log('[CSR-CLIENT-BRIEF] Output:', outputPath);
}
