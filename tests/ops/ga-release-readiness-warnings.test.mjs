import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('foresight AI engine has no duplicate method declarations for core dose logic', () => {
  const source = readFileSync('server/services/foresight-ai-engine.ts', 'utf8');

  const methodCounts = {
    calculateBayesianMTD: (source.match(/private async calculateBayesianMTD\(/g) || []).length,
    calculateSafetyMargin: (source.match(/private calculateSafetyMargin\(/g) || []).length,
    checkDoseEscalationCompliance: (source.match(/private async checkDoseEscalationCompliance\(/g) || []).length,
    performCrossSpeciesAnalysis: (source.match(/async performCrossSpeciesAnalysis\(/g) || []).length,
  };

  for (const [methodName, count] of Object.entries(methodCounts)) {
    assert.equal(count, 1, `expected ${methodName} to be declared once`);
  }
});

test('core table enforcement includes schema and vector extension readiness checks', () => {
  const source = readFileSync('server/db/ensureCoreTables.ts', 'utf8');
  assert.ok(source.includes("const requiredSchemas = ['public', 'vault', 'extensions'];"));
  assert.ok(source.includes('CREATE EXTENSION IF NOT EXISTS vector'));
  assert.ok(source.includes('missingExtensions'));
  assert.ok(source.includes('ALLOW_EXTENSION_DDL'));
  assert.ok(source.includes('Neon managed mode'));
});
