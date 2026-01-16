import auditService from '../services/auditService.js';

export const AlertDispatcher = {
  async dispatch(
    findings: any[],
    config: { slack: boolean; email: boolean; jira: boolean; threshold: string },
    context?: {
      tenantId?: number;
      userId?: number;
      ipAddress?: string | null;
      userAgent?: string | null;
      sessionId?: string | null;
    }
  ) {
    if (findings.length === 0) return;

    const criticals = findings.filter(f => f.severity === 'CRITICAL');
    const highs = findings.filter(f => f.severity === 'HIGH');

    const shouldSend =
      config.threshold === 'ALL' ||
      (config.threshold === 'MEDIUM' && findings.length > 0) ||
      (config.threshold === 'HIGH' && (highs.length > 0 || criticals.length > 0)) ||
      (config.threshold === 'CRITICAL' && criticals.length > 0);

    if (!shouldSend) return;

    if (config.slack) {
      console.log(`[SLACK] Posting ${findings.length} alerts to channel...`);
    }

    if (config.jira && criticals.length > 0) {
      console.log(`[JIRA] Auto-creating tickets for ${criticals.length} Critical items...`);
    }

    if (context?.tenantId) {
      await auditService.logAction({
        tenantId: context.tenantId,
        userId: context.userId || null,
        action: 'lumen.alert.dispatched',
        resourceType: 'lumen_cortex',
        resourceId: null,
        details: {
          timestamp: new Date().toISOString(),
          count: findings.length,
          channels: config,
          triggered_by: 'Lumen Cortex Automaton',
        },
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
        sessionId: context.sessionId || null,
        severity: 'info',
      });
    }
  },
};
