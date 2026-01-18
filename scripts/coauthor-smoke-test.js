const baseUrl = process.env.COAUTHOR_BASE_URL || 'http://localhost:5000';

const orgId = process.env.COAUTHOR_ORG_ID;

const assertOk = async (path, validator) => {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: orgId ? { 'x-organization-id': orgId } : {},
  });
  if (!res.ok) {
    throw new Error(`${path} failed with status ${res.status}`);
  }
  const data = await res.json();
  validator(data);
  console.log(`✅ ${path} ok`);
  return data;
};

const run = async () => {
  const documents = await assertOk('/api/coauthor/documents?limit=2', data => {
    if (!data.success || !Array.isArray(data.documents)) {
      throw new Error('documents response missing expected keys');
    }
  });

  await assertOk('/api/coauthor/ectd-modules/tree-with-counts', data => {
    if (!data.success || !Array.isArray(data.tree)) {
      throw new Error('module tree response missing expected keys');
    }
  });

  const documentId = documents.documents[0]?.id;
  if (!documentId) {
    throw new Error('no document id available for validation check');
  }

  await assertOk(`/api/coauthor/validate/latest/${documentId}`, data => {
    if (!data.success || typeof data.hasValidation !== 'boolean') {
      throw new Error('validation response missing expected keys');
    }
  });
};

run().catch(error => {
  console.error(`❌ smoke test failed: ${error.message}`);
  process.exit(1);
});
