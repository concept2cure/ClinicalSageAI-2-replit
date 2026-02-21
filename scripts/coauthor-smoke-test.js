const baseUrl = process.env.COAUTHOR_BASE_URL || 'http://localhost:5000';

const orgId = process.env.COAUTHOR_ORG_ID;
const logger = console;

const getAuthToken = async () => {
  const email = process.env.SMOKE_EMAIL || 'jm.smith@concept2cure.pro';
  const password = process.env.SMOKE_PASSWORD || 'Concept2Cure2026!';

  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload?.accessToken || payload?.token || null;
  } catch (_error) {
    return null;
  }
};

const assertOk = async (path, validator, token) => {
  const headers = {
    ...(orgId ? { 'x-organization-id': orgId } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`${path} failed with status ${res.status}`);
  }
  const data = await res.json();
  validator(data);
  logger.info(`✅ ${path} ok`);
  return data;
};

const run = async () => {
  const token = await getAuthToken();

  const documents = await assertOk(
    '/api/coauthor/documents?limit=2',
    data => {
      if (!Array.isArray(data.documents)) {
        throw new Error('documents response missing expected keys');
      }
    },
    token
  );

  await assertOk(
    '/api/coauthor/templates',
    data => {
      if (!Array.isArray(data.templates)) {
        throw new Error('templates response missing expected keys');
      }
    },
    token
  );

  await assertOk(
    '/api/ectd-documents/meta/structure',
    data => {
      if (!Array.isArray(data.modules)) {
        throw new Error('eCTD structure response missing expected keys');
      }
    },
    token
  );

  const created = await fetch(`${baseUrl}/api/coauthor/documents`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(orgId ? { 'x-organization-id': orgId } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ title: `Smoke CoAuthor ${Date.now()}`, moduleNumber: '3.2.P' }),
  });

  if (!created.ok) {
    throw new Error(`/api/coauthor/documents create failed with status ${created.status}`);
  }

  const createdPayload = await created.json();
  if (!createdPayload?.success || !createdPayload?.document?.id) {
    throw new Error('coauthor create response missing document id');
  }
  logger.info('✅ /api/coauthor/documents create ok');

  const documentId = createdPayload.document.id || documents.documents[0]?.id;
  if (!documentId) {
    throw new Error('no document id available for validation check');
  }

  await assertOk(
    `/api/coauthor/documents/${documentId}`,
    data => {
      if (!data.document || !data.document.id) {
        throw new Error('document fetch response missing expected keys');
      }
    },
    token
  );

  await assertOk(
    '/api/coauthor/sessions',
    data => {
      if (!Array.isArray(data.sessions)) {
        throw new Error('sessions response missing expected keys');
      }
    },
    token
  );
};

run().catch(error => {
  logger.error(`❌ smoke test failed: ${error.message}`);
  process.exit(1);
});
