import bus from '../../lib/eventBus.js';
import repo from './repo.js';

/**
 * Compute KPIs from repository state.
 */
function computeKPIs() {
  const s = repo.load();

  // PPQ %
  const ppqTarget = s.validation?.ppq?.targetRuns ?? 0;
  const ppqDone = s.validation?.ppq?.completedRuns ?? 0;
  const ppqPct = ppqTarget > 0 ? Math.round((ppqDone / ppqTarget) * 100) : 0;

  // Deviation rate (last 90d) — demo uses total counts vs batches
  const devCount = (s.deviations || []).length;
  const batchCount = (s.batches || []).length || 1;
  const deviationRate90d = +(devCount / batchCount).toFixed(2);

  // Release lead time — demo static
  const releaseLeadTimeDays = 7.4;

  // OEE heuristic: penalize for overdue calibration and PQ gaps on critical equipment
  const eq = s.equipment || [];
  const critical = eq.filter(e => e.critical);
  const overdue = critical.filter(e => e.calibrationDue && new Date(e.calibrationDue).getTime() < Date.now());
  const pqMissing = critical.filter(e => e.pq !== true);
  let oeePct = 85;
  oeePct -= overdue.length * 4;
  oeePct -= pqMissing.length * 3;
  oeePct = Math.max(40, Math.min(95, oeePct));

  // AI Compliance Score — 100 − weight(open high/med)
  const findings = s.aiFindings || [];
  const high = findings.filter(f => f.severity === 'high').length;
  const med  = findings.filter(f => f.severity === 'medium').length;
  let aiComplianceScore = Math.max(50, 100 - (high*8 + med*4));

  // Submission readiness (manufacturing dimension) — blend
  const readinessPct = Math.max(0,
      Math.min(100,
        Math.round(0.35*ppqPct + 0.15*(100 - deviationRate90d*20) + 0.2*oeePct + 0.3*aiComplianceScore)
      )
  );

  return { readinessPct, ppqPct, deviationRate90d, releaseLeadTimeDays, oeePct, aiComplianceScore };
}

let cachedKPIs = computeKPIs();

function getKPIs() { return cachedKPIs; }
function recomputeAndCache() { cachedKPIs = computeKPIs(); return cachedKPIs; }

/**
 * Subscribe to events to keep KPIs fresh.
 */
function installKpiSubscribers() {
  const recalc = () => recomputeAndCache();

  bus.on('manufacturing.validation.updated', recalc);
  bus.on('manufacturing.deviation.created', recalc);
  bus.on('manufacturing.capa.closed', recalc);
  bus.on('manufacturing.mbr.approved', recalc);
  bus.on('manufacturing.cppcqa.updated', recalc);
  bus.on('manufacturing.changecontrol.created', recalc);
  bus.on('manufacturing.equipment.updated', recalc);
  bus.on('manufacturing.ai.findings.updated', recalc);
}

export { getKPIs, recomputeAndCache, installKpiSubscribers };