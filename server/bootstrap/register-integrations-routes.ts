import type { Express } from 'express';

/**
 * @deprecated Foresight integration routes retired (Phase 8, Clinical Regulatory
 * Evidence migration). `/api/foresight`, `/api/foresight-ai` and
 * `/api/foresight-feedback` were past their 2026-04-01 Sunset and surfaced fabricated
 * dose "confidence intervals"; they are unmounted here. Honest dose-strategy evidence
 * now lives in clinical-regulatory-evidence/study-design-evidence.service.ts
 * (assessDoseStrategy — emits no dose value, requires a governing calculation + expert
 * review), and the canonical AI surface is Cortex.
 *
 * Kept as a no-op so the startup sequence (server/startup/routes.ts) resolves without
 * change; remove the call and this file together once the orphaned foresight route
 * files are deleted. See docs/architecture/CLINICAL_REGULATORY_EVIDENCE_PHASE8_RETIREMENT.md.
 */
export function registerIntegrationRoutes(_app: Express): void {
  // Foresight routes retired — intentionally nothing to mount.
}
