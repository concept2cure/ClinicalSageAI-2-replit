const baseUrl = process.env.CERV2_BASE_URL || 'http://localhost:3000';
const healthPaths = ['/healthz', '/api/health'];

const requireEnv = name => {
  if (!process.env[name]) {
    logger.warn(`Missing ${name}.`);
    return false;
  }
  return true;
};

const checkHealth = async () => {
  for (const path of healthPaths) {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (response.ok) {
        logger.info(`✔ Health check OK: ${path}`);
        return true;
      }
      logger.warn(`Health check failed (${path}): ${response.status}`);
    } catch (error) {
      logger.warn(`Health check error (${path}): ${error.message}`);
    }
  }
  return false;
};

const run = async () => {
  let ok = true;
  const hasDb = requireEnv('DATABASE_URL');
  if (!hasDb) {
    logger.warn('Set DATABASE_URL in .env or your environment before verification.');
    ok = false;
  }

  const healthOk = await checkHealth();
  if (!healthOk) {
    logger.error(`Server not reachable at ${baseUrl}. Start the app before running verification.`);
    ok = false;
  }

  if (!ok) {
    process.exit(1);
  }

  logger.info('Environment preflight checks passed.');
  logger.info('Next steps:');
  logger.info('  npm run db:check');
  logger.info('  npm run db:status');
  logger.info('  npm run smoke:cerv2-workbench');
};

run().catch(error => {
  logger.error('Verification preflight failed:', error);
  process.exit(1);
});
