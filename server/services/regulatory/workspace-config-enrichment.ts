/**
 * Workspace-config enrichment (server).
 *
 * The pure shared resolver (shared/regulatory/workspace-config.ts) produces the
 * document-type config plus the CORE of the region and client-type overlays.
 * This server layer overlays the SERVER-ONLY data those overlays need but that
 * cannot live in the pure shared module:
 *
 *   REGION       → format-scoped M1 backbone/size hints and initial-marketing
 *                  checklist/language guidance, only where applicable.
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
import { getGatewaySizeLimitOnFile, type RegulatoryRegion } from '../ectd/ectd-regional-rules';
import { REGIONAL_MODULE1_REQUIREMENTS } from '../global-ri/regional-module1-requirements';
import { getLicenseInfo } from '../license-manager';
import { appModuleId, appModuleEnabled } from '../../../shared/regulatory/app-registry';
import { toMarket, isCanonicalRegion, m1BackbonePath } from '../../../shared/regulatory/region-identity';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry';

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
    const standard = config.editor.dossierStandard;
    const ctdDossier = config.known && config.scope === 'dossier' &&
      (standard === 'eCTD' || standard === 'CTD');

    // Regional language/format context is not evidence that every selected
    // document is an electronic medicines dossier. Keep eSTAR, regional
    // device/IVD filings, SOPs and standalone reports out of this overlay.
    // These are recorded path/size hints, not a qualified builder or channel.
    if (ctdDossier && standard === 'eCTD') {
      const backbone = m1BackbonePath(code);
      if (backbone) config.region.m1BackbonePath = backbone;
      if (isCanonicalRegion(code)) {
        const limit = getGatewaySizeLimitOnFile(code as RegulatoryRegion);
        if (limit) config.region.gatewaySizeLimitBytes = limit.bytes;
      }
    }

    // This existing checklist explicitly covers INITIAL MARKETING
    // applications. Applying it to an IND introduced Form 356h and marketing
    // requirements into a trial application; it also leaked into QMS/CSR and
    // device workspaces. Consult the selected canonical record's family and
    // stage rather than guessing applicability from its country or label.
    const entry = ctdDossier ? getApplicationType(config.resolved.id) : undefined;
    const initialMarketing = entry?.active === true &&
      entry.applicationFamily === 'marketing_authorization' && entry.stage === 'initial';
    if (initialMarketing) {
      const market = toMarket(code);
      if (market && REGIONAL_MODULE1_REQUIREMENTS[market]) {
        config.region.requiredModule1Components = REGIONAL_MODULE1_REQUIREMENTS[market].map(
          component => component.code,
        );
      }

      // Retain the existing marketing-application language guidance only in
      // that context. Omission elsewhere is unassessed, not an exemption from
      // document-specific translation/labeling requirements.
      const lang = config.region.language;
      if (code === 'CA') {
        config.region.translationMandate = 'Bilingual English/French labeling required.';
      } else if (lang && lang !== 'en') {
        config.region.translationMandate = `Module 1 and product information required in ${LANGUAGE_NAMES[lang] ?? lang}.`;
      }
    }
  }

  // ── CLIENT-TYPE enrichment overlay (license entitlement + app gating) ──
  if (config.clientType && input.organizationId != null) {
    try {
      const lic = await getLicenseInfo(input.organizationId);
      if (lic) {
        // Treat an unavailable or malformed license projection as unknown,
        // never as an empty grant or an upgrade decision. These are shape
        // checks, not a second tier/module policy; the existing registry still
        // owns which grant permits an app.
        const enabledModules = Array.isArray(lic.enabledModules) ? [...lic.enabledModules] : null;
        if (typeof lic.tier !== 'string' || !lic.tier.trim() ||
            !enabledModules ||
            !enabledModules.every(moduleId => typeof moduleId === 'string' && !!moduleId.trim())) {
          return config;
        }
        // Detach the cached/source array before deriving app availability.
        // The returned tier/modules and the access lists must describe the
        // same read even if the provider's cached object is changed later.
        const entitlement = { tier: lic.tier, enabledModules };

        // App-level gating falls straight out of the unified app-registry: an app
        // accepts its canonical owner and the explicit legacy grant keys retained
        // by that registry. This projection does not replace effective route/
        // tool access checks. Apps with no moduleId remain always accessible.
        const enabled = new Set(entitlement.enabledModules);
        const accessible: typeof config.clientType.accessibleApps = [];
        const locked: typeof config.clientType.lockedApps = [];
        for (const a of config.apps) {
          const mod = appModuleId(a.id);
          if (mod && !appModuleEnabled(a.id, enabled)) locked.push({ id: a.id, requiredModule: mod });
          else accessible.push(a.id);
        }
        // Publish the entitlement and both lists together, only after every
        // app was evaluated. A failed registry lookup must not leave a partial
        // entitlement that looks successfully assessed.
        config.clientType.entitlement = entitlement;
        config.clientType.accessibleApps = accessible;
        config.clientType.lockedApps = locked;
      }
    } catch {
      /* entitlement is best-effort — never block the config on it */
    }
  }

  return config;
}

export default { enrichWorkspaceConfig };
