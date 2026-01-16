import { Router } from 'express';
import { DeficiencyBank } from './agents/deficiency-bank';
import { AnalystAgent } from './agents/analyst';
import { db } from '../../../lib/database.js';
import { logEvent } from '../system.js';

const router = Router();

const severityWeights: Record<string, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

const normalize = (value: unknown) => String(value || '').trim();

const toKeywordList = (...values: Array<unknown>) => {
  const raw = values
    .flatMap((value) => normalize(value).split(/[,\n]/))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(raw));
};

const scoreToRiskLevel = (score: number) => {
  if (score >= 70) return 'CRITICAL';
  if (score >= 45) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
};

const buildActiveContext = async (tenantId: number) => {
  try {
    const result = await db.query(
      `
      SELECT id, name, type, status, priority
      FROM projects
      WHERE organization_id = $1
        AND status NOT IN ('archived', 'completed')
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 20
      `,
      [tenantId]
    );

    return result.rows.map(
      (row: any) => `[ID: ${row.id}] ${row.name} (${row.type || 'General'})`
    );
  } catch (error) {
    console.warn('[Lumen Guardrails] Context lookup failed:', error);
    return [];
  }
};

router.post('/supplier-check', async (req, res) => {
  const tenantHeader = req.headers['x-organization-id'] || req.headers['x-tenant-id'];
  const tenantId = tenantHeader ? Number(tenantHeader) : null;
  const { supplierName, material, productName, country, notes } = req.body || {};

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }

  const supplier = normalize(supplierName);
  if (!supplier) {
    return res.status(400).json({ error: 'Missing supplier name' });
  }

  const keywords = toKeywordList(supplierName, material, productName, country, notes);
  const stream = await DeficiencyBank.getStream(200);
  const lowerKeywords = keywords.map((item) => item.toLowerCase());

  const matches = stream.filter((item: any) => {
    const insight = String(item?.insight || '').toLowerCase();
    const tags = Array.isArray(item?.tags) ? item.tags.map((tag: string) => String(tag).toLowerCase()) : [];
    const sourceSystem = String(item?.source_system || '').toLowerCase();

    return lowerKeywords.some(
      (keyword) => insight.includes(keyword) || sourceSystem.includes(keyword) || tags.some((tag) => tag.includes(keyword))
    );
  });

  const weighted = matches.reduce((acc: number, item: any) => {
    const weight = severityWeights[String(item?.severity || 'LOW').toUpperCase()] || 1;
    return acc + weight;
  }, 0);

  const riskScore = Math.min(100, weighted * 8 + matches.length * 3);
  const riskLevel = scoreToRiskLevel(riskScore);

  const recommendations = matches.length
    ? [
        'Request latest GMP/ISO audit certificates from the supplier.',
        'Confirm change-control notifications and recent deviations.',
        'Validate incoming material specifications and traceability documentation.',
      ]
    : [
        'No live signals detected in the Deficiency Bank.',
        'Maintain routine supplier qualification cadence and update audits quarterly.',
      ];

  await logEvent(
    'SYSTEM_LUMEN',
    'SUPPLIER_CHECK',
    supplier,
    {
      supplierName: supplier,
      material: normalize(material) || null,
      productName: normalize(productName) || null,
      country: normalize(country) || null,
      riskScore,
      riskLevel,
      matches: matches.length,
      outcome: matches.length ? 'RISK_DETECTED' : 'NO_SIGNAL',
    },
    {
      tenantId,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      resourceType: 'supplier',
      severity: riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'warning' : 'info',
    }
  );

  return res.json({
    status: 'ok',
    supplier: supplier,
    riskScore,
    riskLevel,
    keywords,
    matches: matches.slice(0, 12),
    recommendations,
    meta: {
      totalSignals: matches.length,
      scanned: stream.length,
      generatedAt: new Date().toISOString(),
    },
  });
});

router.post('/copilot', async (req, res) => {
  const tenantHeader = req.headers['x-organization-id'] || req.headers['x-tenant-id'];
  const tenantId = tenantHeader ? Number(tenantHeader) : null;
  const { prompt, documentTitle, section, contextSnippet } = req.body || {};

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }

  const question = normalize(prompt);
  if (!question) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  const context = normalize(contextSnippet).slice(0, 1800);
  const insight = [
    `Prompt: ${question}`,
    documentTitle ? `Document: ${normalize(documentTitle)}` : null,
    section ? `Section: ${normalize(section)}` : null,
    context ? `Context: ${context}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const activeContext = await buildActiveContext(tenantId);
  const analysis = await AnalystAgent.analyzeImpact(insight, 'Regulatory Copilot', activeContext);

  if (!analysis) {
    return res.status(500).json({ error: 'Analysis failed' });
  }

  await logEvent(
    'SYSTEM_LUMEN',
    'COPILOT_GUARDRAIL',
    normalize(documentTitle) || 'unknown',
    {
      section: normalize(section) || null,
      prompt: question,
      riskLevel: analysis?.risk_level || null,
    },
    {
      tenantId,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      resourceType: 'document',
      severity: 'info',
    }
  );

  return res.json({
    ...analysis,
    meta: {
      contextLength: context.length,
      projectsConsidered: activeContext.length,
      generatedAt: new Date().toISOString(),
    },
  });
});

export default router;
