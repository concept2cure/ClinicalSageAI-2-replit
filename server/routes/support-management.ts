import { Router } from 'express';
import { healthCheck } from '../db';

const router = Router();

const isConfigured = (...values: Array<string | undefined>) =>
  values.every(value => typeof value === 'string' && value.trim().length > 0);

router.get('/diagnostics', async (_req, res) => {
  try {
    const dbHealthy = await healthCheck();

    const microsoftConfigured = isConfigured(
      process.env.MICROSOFT_TENANT_ID,
      process.env.MICROSOFT_CLIENT_ID,
      process.env.MICROSOFT_CLIENT_SECRET
    );

    const veevaConfigured = isConfigured(
      process.env.VEEVA_CLIENT_ID,
      process.env.VEEVA_CLIENT_SECRET
    );

    const redisConfigured = Boolean(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL);

    const objectStorageConfigured = isConfigured(
      process.env.AWS_ACCESS_KEY_ID,
      process.env.AWS_SECRET_ACCESS_KEY,
      process.env.AWS_REGION,
      process.env.AWS_S3_BUCKET
    );

    const dependencies = [
      {
        name: 'PostgreSQL',
        status: dbHealthy ? 'ok' : 'down',
        description: 'Primary transactional database',
      },
      {
        name: 'Redis / Queue',
        status: redisConfigured ? 'configured' : 'missing',
        description: 'Background workers and queueing',
      },
      {
        name: 'Object Storage',
        status: objectStorageConfigured ? 'configured' : 'missing',
        description: 'Vault document storage',
      },
    ];

    const integrations = [
      {
        name: 'Microsoft 365 (SharePoint/OneDrive)',
        status: microsoftConfigured ? 'configured' : 'missing',
        description: 'OAuth and Graph API connectivity',
      },
      {
        name: 'Veeva Vault',
        status: veevaConfigured ? 'configured' : 'missing',
        description: 'Vault API OAuth connectivity',
      },
    ];

    const dataFlows = [
      {
        name: 'Client Portal → API',
        direction: 'ingress',
        description: 'UI requests and document creation events',
      },
      {
        name: 'API → PostgreSQL',
        direction: 'egress',
        description: 'Persisting workspace, document, and audit data',
      },
      {
        name: 'API → Vault Storage',
        direction: 'egress',
        description: 'File uploads, exports, and archive storage',
      },
      {
        name: 'API → SharePoint/OneDrive',
        direction: 'egress',
        description: 'External collaboration sync',
      },
      {
        name: 'API → Veeva Vault',
        direction: 'egress',
        description: 'Regulatory submission sync',
      },
      {
        name: 'SSO → API',
        direction: 'ingress',
        description: 'Identity tokens and access assertions',
      },
    ];

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      dependencies,
      integrations,
      dataFlows,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to run diagnostics',
    });
  }
});

export default router;
