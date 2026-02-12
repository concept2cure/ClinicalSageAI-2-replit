import { randomUUID } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const logger = console;

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

const programIdFlag = parseArgValue('--programId') || parseArgValue('--program-id');

const getProgramId = async () => {
  if (process.env.CERV2_PROGRAM_ID) {
    return process.env.CERV2_PROGRAM_ID;
  }

  if (programIdFlag) {
    return programIdFlag;
  }

  try {
    const filePath = path.resolve(process.cwd(), '.cerv2_program_id');
    const fileContents = await readFile(filePath, 'utf8');
    return fileContents.trim();
  } catch (error) {
    return null;
  }
};

const ensureProgramId = async () => {
  const programId = await getProgramId();
  if (programId) {
    return programId;
  }

  const fallbackProgramId = randomUUID();
  const filePath = path.resolve(process.cwd(), '.cerv2_program_id');
  await writeFile(filePath, `${fallbackProgramId}\n`, 'utf8');
  logger.warn('No CERV2 program ID provided. Generated a demo ID for this run:');
  logger.warn(fallbackProgramId);
  logger.warn(`Saved to ${filePath}. Override with CERV2_PROGRAM_ID or --programId if needed.`);
  return fallbackProgramId;
};

const buildEndpoints = programId => [
  {
    name: 'evidence',
    method: 'GET',
    path: `/api/cerv2/workbench/${programId}/evidence?limit=5`,
  },
  {
    name: 'claims',
    method: 'GET',
    path: `/api/cerv2/workbench/${programId}/claims?limit=5`,
  },
  {
    name: 'standards',
    method: 'GET',
    path: `/api/cerv2/workbench/${programId}/standards?limit=5`,
  },
  {
    name: 'outcomes',
    method: 'GET',
    path: `/api/cerv2/workbench/${programId}/outcomes?limit=5`,
  },
  {
    name: 'audit',
    method: 'GET',
    path: `/api/cerv2/workbench/${programId}/audit?limit=10`,
  },
];

const requestJson = async (name, options) => {
  const url = `${baseUrl}${options.path}`;
  const response = await fetch(url, {
    method: options.method,
    headers: {
      'content-type': 'application/json',
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

const getFirstId = (payload, fallbackKeys) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const items = Array.isArray(payload) ? payload : payload.items || payload.data || payload.results;
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const item = items[0];
  const keys = fallbackKeys || ['id', 'claimId', 'evidenceId'];
  for (const key of keys) {
    if (item && item[key]) {
      return item[key];
    }
  }

  return item?.id || null;
};

const run = async () => {
  const programId = await ensureProgramId();
  const endpoints = buildEndpoints(programId);
  const results = {};

  for (const endpoint of endpoints) {
    results[endpoint.name] = await requestJson(endpoint.name, endpoint);
  }

  const claimId = getFirstId(results.claims, ['id', 'claimId']);
  const evidenceId = getFirstId(results.evidence, ['id', 'evidenceId']);

  if (!claimId) {
    logger.error('No claim ID found in claims response.');
    process.exit(1);
  }

  if (!evidenceId) {
    logger.error('No evidence ID found in evidence response.');
    process.exit(1);
  }

  await requestJson('traceability-links-bulk', {
    method: 'POST',
    path: `/api/cerv2/workbench/${programId}/traceability/links/bulk`,
    body: {
      dryRun: true,
      links: [
        {
          evidenceId,
          claimId,
        },
      ],
    },
  });

  await requestJson('claim-status-patch', {
    method: 'PATCH',
    path: `/api/cerv2/workbench/${programId}/claims/${claimId}`,
    body: {
      status: 'reviewed',
    },
  });

  logger.info('Smoke test completed successfully.');
};

run().catch(error => {
  logger.error(error);
  process.exit(1);
});
