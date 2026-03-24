import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  processedDir: path.join(process.cwd(), 'data/processed_csrs'),
  atomsPath: path.join(process.cwd(), 'data/knowledge_structure/ana_csr_intelligence_atoms.jsonl'),
  outputPath: path.join(process.cwd(), 'data/knowledge_structure/client_value_metrics.json'),
};

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readProcessedCsrs(processedDir) {
  if (!fs.existsSync(processedDir)) return [];
  return fs
    .readdirSync(processedDir)
    .filter(file => file.endsWith('.json'))
    .map(file => safeReadJson(path.join(processedDir, file)))
    .filter(Boolean);
}

function readAtoms(atomsPath) {
  if (!fs.existsSync(atomsPath)) return [];
  return fs
    .readFileSync(atomsPath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function computeFreshnessScore(lastHarvestedAt) {
  if (!lastHarvestedAt) return 0;
  const days = (Date.now() - new Date(lastHarvestedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 100;
  if (days <= 30) return 80;
  if (days <= 60) return 60;
  if (days <= 90) return 40;
  return 20;
}

function topCounts(values, limit = 5) {
  const map = new Map();
  values.filter(Boolean).forEach(v => map.set(v, (map.get(v) || 0) + 1));
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function deriveDiagnostics(processed, atoms) {
  const processedIds = new Set(processed.map(item => item.nctrialId || item.id).filter(Boolean));
  const atomIds = atoms.map(item => item.id).filter(Boolean);

  const missingEvidenceText = atoms.filter(item => !item.evidence_text || item.evidence_text.length < 40).length;
  const orphanAtoms = atoms.filter(item => item.id && !processedIds.has(item.id)).length;
  const duplicateAtomIds = atomIds.length - new Set(atomIds).size;

  const diagnosticsScore = Math.max(
    0,
    100 - Math.min(60, duplicateAtomIds * 5) - Math.min(30, orphanAtoms * 2) - Math.min(30, missingEvidenceText)
  );

  return {
    diagnosticsScore,
    missingEvidenceText,
    orphanAtoms,
    duplicateAtomIds,
    orphanAtomPercent: percentage(orphanAtoms, atoms.length),
    missingEvidencePercent: percentage(missingEvidenceText, atoms.length),
  };
}

function deriveHumanValueSignals({ valueReadinessScore, freshnessScore, qualityScore, coverageScore }) {
  const signals = [];

  if (freshnessScore < 70) {
    signals.push({
      severity: 'high',
      signal: 'Freshness risk',
      clientImpact: 'Advisory answers may rely on stale evidence in fast-changing indications.',
      action: 'Increase weekly direct PDF ingestion cadence for top client portfolios.',
    });
  }

  if (qualityScore < 75) {
    signals.push({
      severity: 'medium',
      signal: 'Atomization gap',
      clientImpact: 'Fewer retrieval-ready evidence snippets reduce explainability quality.',
      action: 'Increase extraction QA and enforce section-level evidence text checks.',
    });
  }

  if (coverageScore < 70) {
    signals.push({
      severity: 'medium',
      signal: 'Coverage concentration',
      clientImpact: 'Benchmarks may be narrow for emerging therapeutic programs.',
      action: 'Prioritize ingestion of underrepresented indications and sponsors.',
    });
  }

  if (valueReadinessScore >= 80) {
    signals.push({
      severity: 'low',
      signal: 'Go-to-market ready',
      clientImpact: 'Strong enough evidence base to launch premium benchmark products.',
      action: 'Package protocol benchmark packs and confidence briefs for client launch.',
    });
  }

  return signals;
}

export function buildClientValueMetrics({ processed, atoms }) {
  const totalRecords = Math.max(processed.length, atoms.length);

  const indications = [
    ...processed.map(item => item.indication),
    ...atoms.map(item => item.indication || item.therapeutic_area),
  ];
  const sponsors = [...processed.map(item => item.sponsor), ...atoms.map(item => item.sponsor)];
  const countries = [...processed.map(item => item.country), ...atoms.map(item => item.country)];

  const harvestedTimes = [
    ...processed.map(item => item.harvestedAt),
    ...atoms.map(item => item.harvested_at),
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const lastHarvestedAt = harvestedTimes.length ? harvestedTimes[harvestedTimes.length - 1] : null;
  const freshnessScore = computeFreshnessScore(lastHarvestedAt);

  const topIndications = topCounts(indications, 8);
  const topSponsors = topCounts(sponsors, 8);

  const qualityScore = Math.min(100, Math.round((atoms.length / Math.max(processed.length, 1)) * 100));
  const coverageScore = Math.min(100, topIndications.length * 12 + new Set(countries.filter(Boolean)).size * 8);
  const diagnostics = deriveDiagnostics(processed, atoms);

  const valueReadinessScore = Math.round(
    freshnessScore * 0.3 + qualityScore * 0.25 + coverageScore * 0.2 + diagnostics.diagnosticsScore * 0.25
  );

  const humanValueSignals = deriveHumanValueSignals({
    valueReadinessScore,
    freshnessScore,
    qualityScore,
    coverageScore,
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      processedCsrs: processed.length,
      intelligenceAtoms: atoms.length,
      totalRecords,
    },
    freshness: {
      lastHarvestedAt,
      freshnessScore,
    },
    quality: {
      atomizationCoveragePercent: qualityScore,
    },
    coverage: {
      countries: [...new Set(countries.filter(Boolean))].sort(),
      topIndications,
      topSponsors,
      coverageScore,
    },
    diagnostics,
    humanValueSignals,
    valueReadinessScore,
    recommendations:
      valueReadinessScore >= 80
        ? ['Promote intelligence-driven protocol benchmarking to clients.']
        : [
            'Increase direct PDF ingestion volume.',
            'Improve indication diversity for stronger benchmarking recommendations.',
            'Add feedback-loop telemetry from client edits into atom scoring.',
          ],
  };
}

export function generateClientValueMetrics(config = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const processed = readProcessedCsrs(cfg.processedDir);
  const atoms = readAtoms(cfg.atomsPath);

  const metrics = buildClientValueMetrics({ processed, atoms });

  fs.mkdirSync(path.dirname(cfg.outputPath), { recursive: true });
  fs.writeFileSync(cfg.outputPath, JSON.stringify(metrics, null, 2));
  return metrics;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const metrics = generateClientValueMetrics();
  console.log('[CSR-VALUE-METRICS] Generated:', metrics.valueReadinessScore);
  console.log('[CSR-VALUE-METRICS] Output:', DEFAULTS.outputPath);
}
