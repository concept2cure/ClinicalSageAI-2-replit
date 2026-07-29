/**
 * War Game auditor registry.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/index
 */

import type { WarGameCategory, WarGameAuditor } from '../types.js';
import { createProtocolAuditor } from './protocol-auditor.js';
import { createIndAuditor } from './ind-auditor.js';
import { createCsrAuditor } from './csr-auditor.js';
import { createDevice510kAuditor } from './device-510k-auditor.js';
import { createCerAuditor } from './cer-auditor.js';
import { createSopAuditor } from './sop-auditor.js';
import { createNdaAuditor } from './nda-auditor.js';
import { createBlaAuditor } from './bla-auditor.js';
import { createPmaAuditor } from './pma-auditor.js';
import { createCmcAuditor } from './cmc-auditor.js';
import { createRiskManagementAuditor } from './risk-management-auditor.js';
import { createSafetyNarrativeAuditor } from './safety-narrative-auditor.js';
import { createLabelingAuditor } from './labeling-auditor.js';
import { createBriefingBookAuditor } from './briefing-book-auditor.js';
import { createStabilityAuditor } from './stability-auditor.js';

const AUDITOR_REGISTRY: Record<WarGameCategory, () => WarGameAuditor> = {
  protocol: createProtocolAuditor,
  ind: createIndAuditor,
  csr: createCsrAuditor,
  '510k': createDevice510kAuditor,
  cer: createCerAuditor,
  sop: createSopAuditor,
  nda: createNdaAuditor,
  bla: createBlaAuditor,
  pma: createPmaAuditor,
  cmc: createCmcAuditor,
  risk_management: createRiskManagementAuditor,
  safety_narrative: createSafetyNarrativeAuditor,
  labeling: createLabelingAuditor,
  briefing_book: createBriefingBookAuditor,
  stability: createStabilityAuditor,
};

export function getAuditor(category: WarGameCategory): WarGameAuditor {
  const factory = AUDITOR_REGISTRY[category];
  if (!factory) throw new Error(`No auditor registered for category: ${category}`);
  return factory();
}

export function getAvailableAuditors(): Array<{ category: WarGameCategory; name: string; description: string }> {
  return Object.entries(AUDITOR_REGISTRY).map(([cat, factory]) => {
    const auditor = factory();
    return { category: cat as WarGameCategory, name: auditor.name, description: auditor.description };
  });
}
