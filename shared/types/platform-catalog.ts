/**
 * Platform capability catalog — typed contract (UI ⇄ /api/platform/capabilities).
 *
 * The platform exposes several deterministic capability surfaces (global-RI,
 * Submission Center, …), each with its own discovery index. The UI shell needs ONE
 * normalized call to render a cross-surface "what can this platform do" map. This is
 * that unified contract: each surface becomes a `PlatformDomain`, each capability is
 * normalized to a common `PlatformCapability` shape.
 *
 * Zero runtime dependencies (pure types). Safe to import from server, client,
 * scripts, and tests.
 *
 * @module shared/types/platform-catalog
 */

/** A capability normalized across every platform surface. */
export interface PlatformCapability {
  /** Stable id (unique within its domain). */
  id: string;
  /** Display label. */
  label: string;
  /** Plain-language description. */
  description: string;
  /** Absolute HTTP routes, e.g. 'POST /api/global-ri/exclusivity/compute'. */
  routes: string[];
  /** AnA tool names backing this capability (may be empty). */
  anaTools: string[];
  /** Whether the capability is deterministic / registry-grounded. */
  deterministic: boolean;
  /** Sub-group within the domain (the domain's own taxonomy), where one exists. */
  group?: string;
}

/** One platform surface (e.g. global-RI, Submission Center). */
export interface PlatformDomain {
  /** Stable domain id. */
  id: string;
  /** Display label. */
  label: string;
  /** API base path for the domain, e.g. '/api/global-ri'. */
  basePath: string;
  /** One-line description of the domain. */
  description: string;
  /** Number of capabilities in the domain. */
  capabilityCount: number;
  /** The domain's normalized capabilities. */
  capabilities: PlatformCapability[];
}

/** A compact AI-provider summary embedded in the platform catalog. */
export interface PlatformAiProviders {
  /** The platform default provider — always Claude (anthropic). */
  defaultProvider: string;
  /** Selectable provider ids the UI may offer. */
  selectable: string[];
}

/** Response of `GET /api/platform/capabilities` — cross-surface discovery in one call. */
export interface PlatformCatalog {
  /** Total capabilities across all domains. */
  total: number;
  /** Total deterministic capabilities across all domains. */
  deterministicTotal: number;
  /** The platform surfaces. */
  domains: PlatformDomain[];
  /** Client AI-provider choice summary (Claude-first). Full catalog at /api/platform/ai-providers. */
  aiProviders: PlatformAiProviders;
}
