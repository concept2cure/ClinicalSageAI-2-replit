import { executeHarvest } from '../services/harvestEngine.js';

const submissionId = process.env.HARVEST_SUBMISSION_ID;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!submissionId) {
  console.error('HARVEST_SUBMISSION_ID is required.');
  process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for harvest worker.');
  process.exit(1);
}

const options = {
  dryRun: process.env.HARVEST_DRY_RUN === 'true',
};

try {
  const result = await executeHarvest(submissionId, options);
  console.log('HARVEST_COMPLETE', {
    submissionId,
    rulesExecuted: result.rulesExecuted,
    rulesMatched: result.rulesMatched,
    blocksCreated: result.blocksCreated,
  });
  process.exit(0);
} catch (error) {
  console.error('HARVEST_FAILED', {
    submissionId,
    error: error instanceof Error ? error.message : error,
  });
  process.exit(1);
}
