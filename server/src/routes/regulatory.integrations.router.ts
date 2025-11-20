import { Router } from 'express';
import { getPool } from '../../db/pool';
import { aiNextActions } from '../services/ai/regulatory';

// Helper function for database queries
const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};
const r = Router();

r.get('/:programId/integrations', async (req, res) => {
  const pid = req.params.programId;

  // Biotech system integrations status
  const integrations = [
    {
      id: 'lims',
      name: 'LIMS Integration',
      description: 'Laboratory Information Management System connectivity',
      status: 'connected',
      lastSync: '2 hours ago',
      provider: 'LabWare',
      dataPoints: 1247,
    },
    {
      id: 'mes',
      name: 'Manufacturing Execution System',
      description: 'Real-time production data and batch records',
      status: 'connected',
      lastSync: '15 min ago',
      provider: 'Werum PAS-X',
      dataPoints: 892,
    },
    {
      id: 'qms',
      name: 'Quality Management System',
      description: 'Quality control and deviation management',
      status: 'pending',
      lastSync: 'Never',
      provider: 'TrackWise',
      dataPoints: 0,
    },
  ];

  res.json({ integrations });
});

r.post('/:programId/integrations/:integrationId/sync', async (req, res) => {
  const pid = req.params.programId;
  const integrationId = req.params.integrationId;

  // Simulate sync operation
  const syncResult = {
    status: 'success',
    recordsProcessed: Math.floor(Math.random() * 500) + 100,
    timestamp: new Date().toISOString(),
    errors: [],
  };

  res.json({ sync: syncResult });
});

r.get('/:programId/gateway', async (req, res) => {
  const pid = req.params.programId;

  // Gateway status and data flow
  const gateway = {
    status: 'online',
    throughput: '2.4k records/hour',
    uptime: '99.8%',
    connectedSystems: 5,
    dataLatency: '< 2 minutes',
  };

  res.json({ gateway });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'integrations', programId: req.params.programId });
  res.json(out);
});

export default r;
