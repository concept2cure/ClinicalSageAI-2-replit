/**
 * Workspace-config enrichment (server).
 *
 * The pure shared resolver (shared/regulatory/workspace-config.ts) produces the
 * document-type config plus the CORE of the region and client-type overlays.
 * This server layer overlays the SERVER-ONLY data those overlays need but that
 * cannot live in the pure shared module:
 *
 *   REGION       → M1 regional backbone path, required Module 1 components,
 *                  gateway size limit, translation mandate.
 *   CLIENT TYPE  → license entitlement (tier + enabled modules).
 *
 * Pure compute over existing registries/maps + one best-effort license read.
 * Never throws on overlay data — a missing piece is simply left unset.
 *
 * @module server/services/regulatory/workspace-config-enrichment
 */

import {
  resolveWorkspaceConfig,
  type WorkspaceConfig,
} from '../../../shared/regulatory/workspace-config';
import { getGatewaySizeLimit, type RegulatoryRegion } from '../ectd/ectd-regional-rules';
import {
  REGIONAL_MODULE1_REQUIREMENTS,
  type RegulatoryMarket,
} from '../global-ri/regional-module1-requirements';
import { getLicenseInfo } from '../license-manager';

/** Taxonomy region (uppercase) → the agency-keyed market used by M1 requirements. */
const REGION_TO_MARKET: Partial<Record<string, RegulatoryMarket>> = {
  US: 'FDA',
  EU: 'EMA',
  JP: 'PMDA',
  CA: 'HEALTH_CANADA',
  UK: 'MHRA',
  AU: 'TGA',
  CN: 'NMPA',
};

/** Regions with a live eCTD gateway + a regional Module 1 backbone. */
const GATEWAY_REGIONS = new Set<string>([
  'US', 'EU', 'JP', 'CA', 'CN', 'KR', 'UK', 'AU', 'CH', 'BR', 'IN', 'SG',
]);

const LANGUAGE_NAMES: Record<string, string> = {
  ja: 'Japanese',
  zh: 'Simplified Chinese',
  ko: 'Korean',
  pt: 'Portuguese',
};

export interface EnrichWorkspaceConfigInput {
  /** The selected need (submission type, document type, or QMS doc). */
  need: string;
  /** Org industry (or an explicit override). Drives the client-type overlay. */
  clientType?: string;
  /** Region override; defaults to the selected type's own region. */
  region?: string;
  /** Tenant for the license entitlement read. */
  organizationId?: number;
}

/**
 * Resolve + enrich the workspace config across all three axes. The region
 * defaults to the selected type's own region when no override is supplied.
 */
export async function enrichWorkspaceConfig(
  input: EnrichWorkspaceConfigInput,
): Promise<WorkspaceConfig> {
  // Probe the pure config to learn the type's own region, then resolve with the
  // effective region + client type so the CORE overlays are attached.
  const probe = resolveWorkspaceConfig(input.need);
  const region = input.region ?? probe.resolved.region ?? undefined;

  const config = resolveWorkspaceConfig({
    need: input.need,
    clientType: input.clientType,
    region: region ?? undefined,
  });

  // ── REGION enrichment overlay ──
  if (config.region) {
    const code = config.region.code;
    const lower = code.toLowerCase();
    config.region.m1BackbonePath = `m1/${lower}/${lower}-regional.xml`;

    if (GATEWAY_REGIONS.has(code)) {
      try {
        config.region.gatewaySizeLimitBytes = getGatewaySizeLimit(code as RegulatoryRegion);
      } catch {
        /* leave unset for regions without a published limit */
      }
    }

    const market = REGION_TO_MARKET[code];
    if (market && REGIONAL_MODULE1_REQUIREMENTS[market]) {
      config.region.requiredModule1Components = REGIONAL_MODULE1_REQUIREMENTS[market].map(
        (c) => c.code,
      );
    }

    const lang = config.region.language;
    if (code === 'CA') {
      config.region.translationMandate = 'Bilingual English/French labeling required.';
    } else if (lang && lang !== 'en') {
      config.region.translationMandate = `Module 1 and product information required in ${LANGUAGE_NAMES[lang] ?? lang}.`;
    }
  }

  // ── CLIENT-TYPE enrichment overlay (license entitlement) ──
  if (config.clientType && input.organizationId != null) {
    try {
      const lic = await getLicenseInfo(input.organizationId);
      if (lic) {
        config.clientType.entitlement = { tier: lic.tier, enabledModules: lic.enabledModules };
      }
    } catch {
      /* entitlement is best-effort — never block the config on it */
    }
  }

  return config;
}

export default { enrichWorkspaceConfig };
