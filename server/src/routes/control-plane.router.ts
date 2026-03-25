import { Router } from 'express';
import { z } from 'zod';
import {
  getKernelDecisionSummary,
  getRecentKernelDecisions,
  clearKernelDecisionLog,
} from '../control-plane/decision-log';
import { anaMicrokernel } from '../control-plane/kernel';
import { defaultAnaPolicyBundle } from '../control-plane/policy-bundle';
import { getPersistentKernelDecisionSummary } from '../control-plane/persistent-queries';
import { buildAnaAuditReport } from '../control-plane/audit-report';
import { ANA_RULE_CATALOG } from '../control-plane/rule-catalog';

const router = Router();

function requireControlPlaneAccess(req: any, res: any, next: any) {
  const role = req?.user?.role || req?.user?.roles?.[0];
  const hasAdminRole = typeof role === 'string' && role.toLowerCase().includes('admin');
  const hasOpsHeader = req.headers['x-ana-ops-token'] && req.headers['x-ana-ops-token'] === process.env.ANA_OPS_TOKEN;
  const nonProd = process.env.NODE_ENV !== 'production';

  if (hasAdminRole || hasOpsHeader || nonProd) {
    return next();
  }

  return res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: 'Control plane endpoint requires admin/operator access.',
    },
  });
}

const simulateSchema = z.object({
  method: z.string().default('POST'),
  path: z.string().default('/api/ana/simulate'),
  actorId: z.string().optional(),
  tenantId: z.string().optional(),
  bodySnippet: z.string().optional(),
});

router.get('/kernel/policy', requireControlPlaneAccess, (_req, res) => {
  res.json({
    policy: {
      id: defaultAnaPolicyBundle.id,
      version: defaultAnaPolicyBundle.version,
      mode: defaultAnaPolicyBundle.mode,
      reviewThreshold: defaultAnaPolicyBundle.reviewThreshold,
      denyThreshold: defaultAnaPolicyBundle.denyThreshold,
      biasTermThreshold: defaultAnaPolicyBundle.biasTermThreshold,
      scientificIntegrityTermCount: defaultAnaPolicyBundle.scientificIntegrityTerms.length,
      identityExemptRoutePatterns: defaultAnaPolicyBundle.identityExemptRoutePatterns.map(p => p.toString()),
      highRiskRegulatoryRoutePatterns: defaultAnaPolicyBundle.highRiskRegulatoryRoutePatterns.map(p => p.toString()),
      immutableRoutePatterns: defaultAnaPolicyBundle.immutableRoutePatterns.map(p => p.toString()),
    },
  });
});

router.get('/kernel/summary', requireControlPlaneAccess, (_req, res) => {
  res.json({ summary: getKernelDecisionSummary() });
});


router.get('/kernel/rules', requireControlPlaneAccess, (_req, res) => {
  res.json({ rules: ANA_RULE_CATALOG });
});


router.get('/kernel/summary/persistent', requireControlPlaneAccess, async (req, res) => {
  const rawHours = Number(req.query.hours || 24);
  const hours = Number.isFinite(rawHours) ? Math.max(1, Math.min(rawHours, 24 * 90)) : 24;
  const summary = await getPersistentKernelDecisionSummary(hours);
  res.json({
    persistenceEnabled: process.env.ANA_KERNEL_PERSIST === 'true',
    windowHours: hours,
    summary,
  });
});


router.get('/kernel/audit-report', requireControlPlaneAccess, async (req, res) => {
  const rawHours = Number(req.query.hours || 24);
  const hours = Number.isFinite(rawHours) ? Math.max(1, Math.min(rawHours, 24 * 90)) : 24;
  const report = await buildAnaAuditReport(hours);
  res.json({ report });
});

router.get('/kernel/recent', requireControlPlaneAccess, (req, res) => {
  const raw = Number(req.query.limit || 50);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 500)) : 50;
  res.json({ entries: getRecentKernelDecisions(limit) });
});

router.post('/kernel/simulate', requireControlPlaneAccess, (req, res) => {
  const parsed = simulateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'INVALID_SIMULATION_INPUT',
        details: parsed.error.flatten(),
      },
    });
  }

  const decision = anaMicrokernel.evaluate(parsed.data);
  return res.json({ decision });
});

router.post('/kernel/recent/clear', requireControlPlaneAccess, (_req, res) => {
  clearKernelDecisionLog();
  res.json({ ok: true });
});

export default router;
