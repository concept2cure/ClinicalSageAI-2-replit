import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('audit export manifest has a single exportSource key', () => {
  const source = readFileSync('server/services/audit/signedAuditExport.ts', 'utf8');
  assert.ok(source.includes("exportSource: 'Concept2Cure / Concept2Cure Platform'"));
  assert.ok(!source.includes("exportSource: 'Concept2Cure.RI / Concept2Cure Platform'"));
});

test('docx generator has a single creator/text key for document metadata', () => {
  const source = readFileSync('server/services/docxGenerator.ts', 'utf8');
  const creatorMatches = source.match(/creator:\s*'Concept2Cure/g) || [];
  assert.equal(creatorMatches.length, 1, 'expected exactly one creator metadata key');
  assert.ok(!source.includes('Concept2Cure.RI | Pack ${meta.packId}'));
});

/**
 * This replaces a guard that read `server/services/foresight-ai-engine.ts` and
 * asserted its dose methods were each declared once. That file was deleted in
 * 796c9ac9 ("Phase 8 — delete the orphaned foresight subtree"), so the
 * readFileSync raised ENOENT and the suite failed on every branch — reported
 * under the old test's name, which pointed at "duplicate method declarations"
 * and described nothing that was actually wrong.
 *
 * The guard is inverted rather than deleted. Phase 8 retired this path because
 * it surfaced FABRICATED dose "confidence intervals" — a flat ±20 %/±25 % of
 * the computed dose, presented as a statistical interval (see
 * docs/architecture/CLINICAL_REGULATORY_EVIDENCE_PHASE8_RETIREMENT.md, part B).
 * The honest replacement is `assessDoseStrategy`, which emits no dose value and
 * states that a next dose requires a governing exposure–response/MTD
 * calculation. A path that invents a dose interval must not return by accident,
 * so this asserts it stays gone.
 */
test('the retired foresight subtree stays deleted', () => {
  const retired = [
    'server/services/foresight-ai-engine.ts',
    'server/services/foresight-csr-integration.ts',
    'server/services/foresight-feedback-orchestrator.ts',
    'server/services/foresight-knowledge-graph.ts',
    'server/services/foresight-rag-service.ts',
    'server/services/foresight/index.ts',
    'server/services/csr-foresight-orchestrator.ts',
    'server/routes/foresight-api.ts',
    'server/routes/foresight-ai-advanced.ts',
    'server/routes/foresight-feedback.ts',
    'server/scripts/generate-foresight-mock-data.ts',
    'server/scripts/seed-foresight-from-csr.ts',
    'server/__tests__/security/tenant-isolation-foresight.contract.test.ts',
  ];

  const returned = retired.filter((file) => existsSync(file));
  assert.deepEqual(
    returned,
    [],
    `these files were retired in Phase 8 (796c9ac9) and must not come back: ${returned.join(', ')}. ` +
      'The foresight path emitted fabricated dose confidence intervals; use assessDoseStrategy instead.',
  );
});

test('core table enforcement includes schema and vector extension readiness checks', () => {
  const source = readFileSync('server/db/ensureCoreTables.ts', 'utf8');
  assert.ok(source.includes("const requiredSchemas = ['public', 'vault', 'extensions'];"));
  assert.ok(source.includes('CREATE EXTENSION IF NOT EXISTS vector'));
  assert.ok(source.includes('missingExtensions'));
  assert.ok(source.includes('ALLOW_EXTENSION_DDL'));
  assert.ok(source.includes('Neon managed mode'));
});
