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

const AUDITOR_REGISTRY: Record<WarGameCategory, () => WarGameAuditor> = {
  protocol: createProtocolAuditor,
  ind: createIndAuditor,
  csr: createCsrAuditor,
  '510k': createDevice510kAuditor,
  cer: createCerAuditor,
  sop: createSopAuditor,
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
