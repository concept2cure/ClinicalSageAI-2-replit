const baseUrl = process.env.CERV2_BASE_URL || 'http://localhost:3000';
const healthPaths = ['/healthz', '/api/health'];

const requireEnv = name => {
  if (!process.env[name]) {
    console.warn(`Missing ${name}.`);
    return false;
  }
  return true;
};

const checkHealth = async () => {
  for (const path of healthPaths) {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (response.ok) {
        console.log(`✔ Health check OK: ${path}`);
        return true;
      }
      console.warn(`Health check failed (${path}): ${response.status}`);
    } catch (error) {
      console.warn(`Health check error (${path}): ${error.message}`);
    }
  }
  return false;
};

const run = async () => {
  let ok = true;
  const hasDb = requireEnv('DATABASE_URL');
  if (!hasDb) {
    console.warn('Set DATABASE_URL in .env or your environment before verification.');
    ok = false;
  }

  const healthOk = await checkHealth();
  if (!healthOk) {
    console.error(`Server not reachable at ${baseUrl}. Start the app before running verification.`);
    ok = false;
  }

  if (!ok) {
    process.exit(1);
  }

  console.log('Environment preflight checks passed.');
  console.log('Next steps:');
  console.log('  npm run db:check');
  console.log('  npm run db:status');
  console.log('  npm run smoke:cerv2-workbench');
};

run().catch(error => {
  console.error('Verification preflight failed:', error);
  process.exit(1);
});
