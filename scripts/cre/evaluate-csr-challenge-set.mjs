#!/usr/bin/env node
/**
 * Deterministic scorer for expert-reviewed AnA CSR challenge responses.
 * This is not a substitute for medical-writing or statistical review.
 * Responses and gold review must be externally supplied; never fabricate them.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function evaluateChallengeSet(spec, results) {
  if (!spec || !Array.isArray(spec.cases) || spec.cases.length === 0) throw new Error('Nonempty benchmark specification required');
  if (!results || !Array.isArray(results.cases)) throw new Error('Actual reviewed case results required');
  const expectedIds = new Set(spec.cases.map(c => c.id));
  if (expectedIds.size !== spec.cases.length) throw new Error('Duplicate benchmark case IDs');
  const providedIds = new Set(results.cases.map(c => c.id));
  if (providedIds.size !== results.cases.length || providedIds.size !== expectedIds.size ||
      [...expectedIds].some(id => !providedIds.has(id))) throw new Error('Exactly one reviewed result is required for every benchmark case');
  const byId = new Map(results.cases.map(c => [c.id, c]));
  const cases = spec.cases.map(c => {
    const result = byId.get(c.id);
    if (!result || typeof result.passed !== 'boolean' || typeof result.reviewer !== 'string' ||
        !result.reviewer.trim() || typeof result.evidenceReference !== 'string' || !result.evidenceReference.trim()) {
      throw new Error('Case ' + c.id + ' lacks a reviewed pass/fail and traceable evidence');
    }
    if (result.passed && (typeof result.reviewNotes !== 'string' || !result.reviewNotes.trim())) {
      throw new Error('Passing case ' + c.id + ' requires written review rationale');
    }
    return { id: c.id, severity: c.severity, passed: result.passed, reviewer: result.reviewer,
      evidenceReference: result.evidenceReference, reviewNotes: result.reviewNotes ?? '' };
  });
  const critical = cases.filter(c => c.severity === 'critical');
  const criticalPassed = critical.filter(c => c.passed).length;
  const requiredCritical = critical.length;
  const allPassed = cases.every(c => c.passed);
  return { benchmarkId: spec.targetStudy, caseCount: cases.length, passedCount: cases.filter(c => c.passed).length,
    criticalPassed, criticalCount: requiredCritical, verdict: allPassed ? 'reviewed_pass' : 'reviewed_fail',
    note: 'Reviewed benchmark result only; no regulator acceptance, model training or production readiness inferred.',
    cases };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [specPath, resultsPath] = process.argv.slice(2);
  if (!specPath || !resultsPath) {
    console.error('Usage: node scripts/cre/evaluate-csr-challenge-set.mjs <spec.json> <reviewed-results.json>');
    process.exitCode = 2;
  } else {
    try {
      const output = evaluateChallengeSet(JSON.parse(fs.readFileSync(specPath, 'utf8')),
        JSON.parse(fs.readFileSync(resultsPath, 'utf8')));
      console.log(JSON.stringify(output, null, 2));
      if (output.verdict !== 'reviewed_pass') process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
