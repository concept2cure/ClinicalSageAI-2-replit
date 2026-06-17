/**
 * Platform capabilities aggregator — unifies the per-surface discovery indices into
 * one normalized cross-surface catalog for the UI shell.
 *
 * Today it composes two deterministic surfaces:
 *   - Global Regulatory Intelligence (server/services/global-ri/global-ri-capabilities)
 *   - Submission Center regulatory capabilities (server/services/market-specs/
 *     regulatory-capabilities-index)
 *
 * Each surface's native capability shape is normalized to the shared
 * `PlatformCapability` contract (absolute routes, anaTools[], deterministic, group).
 * Pure / deterministic — no DB, no network, no LLM. Extend `DOMAIN_BUILDERS` to add a
 * new surface; nothing else changes.
 *
 * @module server/services/platform/platform-capabilities
 */

import type { PlatformCapability, PlatformDomain, PlatformCatalog } from '@shared/types/platform-catalog';
import { getGlobalRiCatalog } from '../global-ri/global-ri-capabilities';
import { regulatoryCapabilitiesIndex } from '../market-specs/regulatory-capabilities-index';

export type { PlatformCapability, PlatformDomain, PlatformCatalog } from '@shared/types/platform-catalog';

/** Prefix a domain-relative route ("GET /x") with the domain base path. */
function absolutize(basePath: string, route: string): string {
  const [method, path] = route.split(' ');
  return path ? `${method} ${basePath}${path}` : `${method} ${basePath}`;
}

/** Build the Global-RI domain from its capability catalog. */
function buildGlobalRiDomain(): PlatformDomain {
  const base = '/api/global-ri';
  const cat = getGlobalRiCatalog();
  const capabilities: PlatformCapability[] = cat.capabilities.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    routes: c.routes.map((r) => absolutize(base, r)),
    anaTools: c.anaTools,
    deterministic: c.deterministic,
    group: c.group,
  }));
  return {
    id: 'global_ri',
    label: 'Global Regulatory Intelligence',
    basePath: base,
    description: 'Deterministic, citation-backed cross-market regulatory-intelligence experts.',
    capabilityCount: capabilities.length,
    capabilities,
  };
}

/** Build the Submission Center domain from its regulatory-capabilities index. */
function buildSubmissionsDomain(): PlatformDomain {
  const base = '/api/submissions';
  const idx = regulatoryCapabilitiesIndex();
  const capabilities: PlatformCapability[] = idx.capabilities.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    routes: c.route ? [absolutize(base, c.route)] : [],
    anaTools: c.anaTool ? [c.anaTool] : [],
    deterministic: c.deterministic,
    group: c.category,
  }));
  return {
    id: 'submissions',
    label: 'Submission Center',
    basePath: base,
    description: 'Deterministic submission/eCTD + device/IVD regulatory capabilities.',
    capabilityCount: capabilities.length,
    capabilities,
  };
}

/** Registered domain builders — add a surface here to include it in the platform catalog. */
const DOMAIN_BUILDERS: Array<() => PlatformDomain> = [buildGlobalRiDomain, buildSubmissionsDomain];

/**
 * Build the unified platform capability catalog across all registered surfaces.
 * Pure / deterministic.
 */
export function getPlatformCatalog(): PlatformCatalog {
  const domains = DOMAIN_BUILDERS.map((b) => b());
  const total = domains.reduce((n, d) => n + d.capabilityCount, 0);
  const deterministicTotal = domains.reduce((n, d) => n + d.capabilities.filter((c) => c.deterministic).length, 0);
  return { total, deterministicTotal, domains };
}

export default { getPlatformCatalog };
