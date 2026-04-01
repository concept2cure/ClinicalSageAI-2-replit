import type { Request, Response } from 'express';
import type { AdminBootstrapContext } from './types';
import reportsManifestRoutes from '../routes/reports/manifest-routes';
import reportsGenerationRoutes from '../routes/reports/generate-report';
import { registerSubscriptionsRoutes } from '../routes/reports/subscriptions-routes';

export function registerAdminRoutes({ app, pool }: AdminBootstrapContext) {
  app.use('/api/reports', reportsGenerationRoutes);
  app.use('/api/reports', reportsManifestRoutes);
  registerSubscriptionsRoutes(app);

  app.get('/api/reports', async (req: Request, res: Response) => {
    try {
      const reportType = req.query.type as string | undefined;

      if (reportType === 'section-generation-log') {
        const result = await pool.query(
          `SELECT event_type, user_name, metadata, timestamp FROM audit_events
           WHERE event_type LIKE 'report.%' ORDER BY timestamp DESC LIMIT 20`
        );
        return res.json({
          summary: { totalCalls: result.rows.length, avgLatency: 0, errorRate: 0 },
          rows: result.rows.map((r: any) => ({
            timestamp: r.timestamp,
            user: r.user_name,
            section: r.metadata?.section || 'N/A',
            modelVersion: 'ana-cortex-v2',
            status: 'success',
            latency: 0,
          })),
        });
      }

      const result = await pool.query(
        `SELECT id, title, report_type, status, metadata, created_at, updated_at
         FROM reports ORDER BY created_at DESC LIMIT 50`
      );

      return res.json(
        result.rows.map((r: any) => ({
          id: r.id,
          title: r.title || `Report ${r.id}`,
          type: r.report_type,
          status: r.status || 'draft',
          sponsor: r.metadata?.sponsor || '',
          indication: r.metadata?.indication || '',
          phase: r.metadata?.phase || '',
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }))
      );
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  app.post('/api/reports', async (req: Request, res: Response) => {
    try {
      const { title, reportType, content, metadata } = req.body;
      const result = await pool.query(
        `INSERT INTO reports (organization_id, title, report_type, status, content, metadata, created_at, updated_at)
         VALUES (1, $1, $2, 'draft', $3, $4, NOW(), NOW()) RETURNING id`,
        [
          title || 'Untitled Report',
          reportType || 'general',
          JSON.stringify(content || {}),
          JSON.stringify(metadata || {}),
        ]
      );
      return res.status(201).json({
        success: true,
        message: 'Report created successfully',
        reportId: result.rows[0].id,
      });
    } catch (error) {
      console.error('Failed to create report:', error);
      return res.status(500).json({ error: 'Failed to create report' });
    }
  });

  app.get('/api/reports/count', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query('SELECT COUNT(*)::int AS count FROM reports');
      return res.json({ count: result.rows[0]?.count || 0 });
    } catch {
      return res.json({ count: 0 });
    }
  });

  app.get('/api/reports/ana-bio', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, title, report_type, status, created_at FROM reports WHERE report_type = 'ana-bio' ORDER BY created_at DESC`
      );
      return res.json({ reports: result.rows, status: 'available' });
    } catch {
      return res.json({ reports: [], status: 'available' });
    }
  });

  app.get('/api/reports/ana-bio/recent', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, title, report_type, status, created_at FROM reports WHERE report_type = 'ana-bio' ORDER BY created_at DESC LIMIT 5`
      );
      return res.json({ reports: result.rows, status: 'available' });
    } catch {
      return res.json({ reports: [], status: 'available' });
    }
  });

  app.get('/api/reports/export.pdf', async (_req: Request, res: Response) => {
    const pdfContent = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 66 >>
stream
BT
/F1 18 Tf
72 720 Td
(Concept2Cure.RI Report Export) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000117 00000 n
0000000243 00000 n
0000000361 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
431
%%EOF`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="concept2cure-ri-report.pdf"');
    return res.send(Buffer.from(pdfContent, 'utf-8'));
  });

  console.log('✅ Admin/report routes mounted');
}
