/**
 * Global Regulatory Intelligence — typed API contract (UI ⇄ /api/global-ri).
 *
 * The UI imports these so the global-RI surface is fully typed end-to-end. The
 * canonical capability/catalog DTOs live HERE (shared) and the server's
 * capabilities index (server/services/global-ri/global-ri-capabilities.ts) returns
 * objects of these exact types — one source of truth, no drift.
 *
 * Discovery is catalog-driven: the UI fetches `GET /api/global-ri/catalog` once to
 * learn the groups, capabilities, routes, AnA tools, and per-tool input JSON-schema
 * (render forms dynamically from `tools[].inputSchema`). Errors are uniform:
 * `{ error: { code, message?, details? } }`.
 *
 * Zero runtime dependencies (pure types + a re-export of the group taxonomy), so it
 * is safe to import from server, client, scripts, and tests.
 *
 * @module shared/types/global-ri-api
 */

import type { GlobalRiGroupId, GlobalRiGroupMeta } from '../constants/global-ri-ui';

export type { GlobalRiGroupId, GlobalRiGroupMeta } from '../constants/global-ri-ui';

/** Uniform error envelope returned by every /api/global-ri route. */
export interface ApiError {
  error: { code: string; message?: string; details?: unknown };
}

/** A single discoverable global-RI capability (one expert domain). */
export interface GlobalRiCapability {
  /** Stable capability id (machine key). */
  id: string;
  /** Display label for the UI. */
  label: string;
  /** Navigation group this capability belongs to. */
  group: GlobalRiGroupId;
  /** Plain-language description. */
  description: string;
  /** HTTP routes relative to /api/global-ri, e.g. 'POST /exclusivity/compute'. */
  routes: string[];
  /** AnA tool names backing this capability (may be empty). */
  anaTools: string[];
  /** Always true — every global-RI capability is deterministic / registry-grounded. */
  deterministic: true;
}

/** A capability enriched with each AnA tool's input JSON-schema (for dynamic forms). */
export interface EnrichedGlobalRiCapability extends GlobalRiCapability {
  tools: { name: string; description: string; inputSchema: unknown }[];
}

/** Response of `GET /api/global-ri/catalog` — one-call discovery of the whole surface. */
export interface GlobalRiCatalog {
  /** Total number of capabilities. */
  total: number;
  /** Navigation groups in display order. */
  groups: GlobalRiGroupMeta[];
  /** Capability count per group id. */
  byGroup: Record<string, number>;
  /** Every capability, enriched with input schemas. */
  capabilities: EnrichedGlobalRiCapability[];
  /** Number of AnA tools backing the surface. */
  anaToolCount: number;
}

/** Response of `GET /api/global-ri/catalog/:group`. */
export interface GlobalRiGroupCatalog {
  group: string;
  count: number;
  capabilities: GlobalRiCapability[];
}

// ── Representative request/response shapes for the most-used callables ─────────
// (The full per-endpoint input schema is discoverable at runtime via the catalog's
// `tools[].inputSchema`; these typed shapes cover the highest-traffic forms.)

export interface ExclusivityComputeRequest {
  market: 'FDA' | 'EMA' | 'PMDA';
  productClass: 'new_chemical_entity' | 'biologic' | 'new_indication' | 'generic_or_biosimilar';
  orphan?: boolean;
  pediatricExtension?: boolean;
  approvalDate?: string;
}

export interface DeviceClassifyRequest {
  region: 'FDA' | 'EU_MDR' | 'EU_IVDR';
  deviceClass: string;
}

export interface StrategyBriefRequest {
  productType: 'small_molecule_nce' | 'biologic' | 'biosimilar' | 'generic' | 'vaccine' | 'cell_gene_therapy';
  targetMarkets: Array<'US' | 'EU' | 'JP' | 'CA' | 'UK' | 'AU'>;
  developmentPhase?: 'preclinical' | 'phase1' | 'phase2' | 'phase3' | 'filed';
  nextMilestone?: string;
  pediatricDevelopment?: boolean;
}
