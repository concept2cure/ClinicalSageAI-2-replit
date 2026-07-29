const logger = console;

const getAuthToken = async () => {
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;
  if (!email || !password) {
    logger.error(
      '[smoke] SMOKE_EMAIL and SMOKE_PASSWORD must be set; refusing to use a hardcoded default.'
    );
    process.exit(1);
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json();
  const token = payload?.accessToken || payload?.token;
  if (!response.ok || !token) {
    throw new Error(`Unable to authenticate smoke user (${response.status})`);
  }
  return token;
};

const parseArgValue = flag => {
  const index = process.argv.findIndex(arg => arg === flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return null;
};

const baseUrl =
  process.env.CERV2_BASE_URL ||
  parseArgValue('--baseUrl') ||
  parseArgValue('--base-url') ||
  'http://localhost:3000';

const buildEndpoints = () => [
  {
    name: 'cerv2-documents',
    method: 'GET',
    path: '/api/cerv2/documents',
  },
  {
    name: 'cerv2-sections',
    method: 'GET',
    path: '/api/cerv2-sections',
  },
  {
    name: 'cerv2-versions',
    method: 'GET',
    path: '/api/cerv2-versions',
  },
  {
    name: 'cerv2-ai-health',
    method: 'GET',
    path: '/api/cerv2/ai/health',
  },
  {
    name: 'cerv2-export-health',
    method: 'GET',
    path: '/api/cerv2/export/health',
  },
];

const requestJson = async (name, options, token) => {
  const url = `${baseUrl}${options.path}`;
  const response = await fetch(url, {
    method: options.method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      logger.error(`Response for ${name} was not valid JSON.`);
      logger.error(text);
      throw error;
    }
  }

  if (!response.ok) {
    logger.error(`Request failed for ${name}: ${response.status} ${response.statusText}`);
    logger.error(json || text);
    throw new Error(`Smoke test failed for ${name}`);
  }

  logger.info(`✔ ${name}: ${response.status}`);
  return json;
};

const run = async () => {
  const token = await getAuthToken();
  const endpoints = buildEndpoints();
  const results = {};

  for (const endpoint of endpoints) {
    results[endpoint.name] = await requestJson(endpoint.name, endpoint, token);
  }

  const saveResult = await requestJson(
    'cerv2-document-save',
    {
      method: 'POST',
      path: '/api/cerv2/documents/new/save',
      body: {
        documentType: 'cerv2_510k',
        title: `Smoke ${new Date().toISOString()}`,
        sections: [{ id: 'summary', content: 'Smoke test content' }],
        metadata: { source: 'smoke_cerv2_workbench' },
      },
    },
    token
  );

  const documentId = saveResult?.documentId;
  if (documentId) {
    await requestJson(
      'cerv2-document-read',
      {
        method: 'GET',
        path: `/api/cerv2/documents/${documentId}`,
      },
      token
    );
  }

  logger.info('Smoke test completed successfully.');
};

run().catch(error => {
  logger.error(error);
  process.exit(1);
});
