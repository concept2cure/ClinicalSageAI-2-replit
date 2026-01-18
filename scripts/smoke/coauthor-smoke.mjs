#!/usr/bin/env node
import process from 'node:process';

const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
const orgId = process.env.ORG_ID || process.argv[2];
const documentId = process.env.DOCUMENT_ID || process.argv[3] || '101';

const headers = {
  'Content-Type': 'application/json',
  ...(orgId ? { 'X-Organization-Id': orgId } : {}),
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const fetchJson = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  assert(response.status === 200, `${path} returned status ${response.status}`);
  const data = await response.json();
  return data;
};

const run = async () => {
  const documents = await fetchJson('/api/coauthor/documents');
  assert(typeof documents.success === 'boolean', 'documents.success must be boolean');
  assert(Array.isArray(documents.documents), 'documents.documents must be an array');
  assert(documents.pagination, 'documents.pagination must be present');

  const modules = await fetchJson('/api/coauthor/ectd-modules/tree-with-counts');
  assert(typeof modules.success === 'boolean', 'modules.success must be boolean');
  assert(Array.isArray(modules.tree), 'modules.tree must be an array');
  assert(typeof modules.totalModules === 'number', 'modules.totalModules must be number');

  const validation = await fetchJson(`/api/coauthor/validate/latest/${documentId}`);
  assert(typeof validation.success === 'boolean', 'validation.success must be boolean');
  assert(typeof validation.hasValidation === 'boolean', 'validation.hasValidation must be boolean');
  if (validation.hasValidation) {
    assert(validation.validation, 'validation.validation must be present when hasValidation is true');
    assert(
      typeof validation.validation.complianceScore === 'number',
      'validation.validation.complianceScore must be number'
    );
  }

  console.log('Co-Author smoke checks passed.');
};

run().catch((error) => {
  console.error(`Co-Author smoke checks failed: ${error.message}`);
  process.exit(1);
});
