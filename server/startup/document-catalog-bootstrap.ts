/**
 * Make the document-catalog feature EXIST, and say out loud whether it is on.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `feature_toggles` is empty on a fully migrated database — no migration seeds
 * it, and only one key (UNIFIED_REGULATORY_SUBMISSIONS) is bootstrapped at
 * startup. `FeatureToggleService.isFeatureEnabled` returns false for a key with
 * no row, by design ("never enable a feature we cannot confirm is on"). So
 * `ana.document_catalog` and `ana.vault_chunking` resolve to OFF in every
 * deployment, and the whole document-catalog surface — the tools, the coverage
 * gate, the session-start recall of the client's files, the passage index — is
 * dark unless someone happens to set an env var that appears in no config file.
 *
 * Worse than off: INVISIBLE. With no row, an operator reading the toggles table
 * cannot tell the capability exists, and every tool call returns a refusal
 * naming a feature key that is nowhere to be found. A capability nobody can
 * discover is not a capability that is switched off; it is one that was not
 * shipped.
 *
 * ── What this does, and what it deliberately does not ───────────────────────
 * It creates both rows, idempotently, through the same
 * `initializeFeatureToggle` bootstrap UNIFIED_REGULATORY_SUBMISSIONS already
 * uses (system tenant scope, description refreshed, existing state untouched),
 * and then logs the state it resolves — including which way it is on, and, when
 * it is off, the two ways to turn it on.
 *
 * It does NOT enable anything. Defaulting the catalog on for every tenant is a
 * product decision with a per-upload embedding cost behind it (chunking embeds
 * every document at ingest), and an agent is not the right place to make it.
 * What this removes is the part that was not a decision at all: nobody could
 * see the switch.
 *
 * @module server/startup/document-catalog-bootstrap
 */

import { FeatureToggleService } from '../services/featureToggleService.js';
/* The keys come FROM the services that read them. Re-declaring the two string
   literals here would let a rename create rows for keys nothing consults —
   toggles an operator can flip that change nothing, which is worse than the
   missing rows this module exists to add. */
import { DOCUMENT_CATALOG_FEATURE_KEY } from '../services/vault/document-catalog.service.js';
import { VAULT_CHUNKING_FEATURE_KEY } from '../services/vault/document-chunking.service.js';

/**
 * How a flag came to be on, that it is not — or that the answer is not known.
 *
 * `unreadable` is not a tidier spelling of `off`, and collapsing the two is
 * what this bootstrap used to do. The toggle read is refused outright when it
 * runs without a tenant scope under RLS_ENFORCE=on, and `isFeatureEnabled`
 * fails closed to `false`, so a store that could not be reached and a feature
 * an operator deliberately disabled produced the same startup line. The one
 * line an operator reads to find this switch stated "inactive platform-wide"
 * with equal confidence in both cases.
 *
 * The feature is inactive either way — fail-closed is the right behaviour — but
 * "off" and "we could not find out" call for different next actions, so they
 * are different words.
 */
export type ToggleSource = 'env' | 'toggle' | 'off' | 'unreadable';

export interface CatalogToggleState {
  catalog: { enabled: boolean; source: ToggleSource };
  chunking: { enabled: boolean; source: ToggleSource };
}

/**
 * The startup line. Pure, so the wording that an operator relies on to find the
 * switch is testable without a database.
 *
 * "Globally off" is stated as exactly that: `isFeatureEnabled` without an
 * organization id reads the platform-wide flag only, so an organization on the
 * toggle's per-org list still has the feature. Reporting that as "off" without
 * the qualifier would be a false statement about those tenants.
 */
export function describeCatalogToggles(state: CatalogToggleState): string {
  const how = (s: ToggleSource): string => {
    if (s === 'env') return 'ON (env override)';
    if (s === 'toggle') return 'ON (feature toggle)';
    return s === 'unreadable' ? 'UNKNOWN (toggle store unreadable)' : 'off';
  };
  const head =
    `[ana-document-catalog] ${DOCUMENT_CATALOG_FEATURE_KEY}: ${how(state.catalog.source)} · ` +
    `${VAULT_CHUNKING_FEATURE_KEY}: ${how(state.chunking.source)}`;
  if (state.catalog.enabled) {
    return state.chunking.enabled
      ? `${head} — AnA can list, read, catalog, file and passage-search the client's project files.`
      : `${head} — AnA can list, read, catalog and file project files; passage search has no index ` +
          'until vault chunking is on, and says so rather than returning nothing.';
  }
  if (state.catalog.source === 'unreadable' || state.chunking.source === 'unreadable') {
    return (
      `${head} — the toggle store could not be read, so the flags cannot be resolved. The surface is ` +
      'inactive because the flag fails closed, NOT because anyone turned it off, and it stays inactive ' +
      'until the read succeeds. Check the database connection and the preceding [feature-toggle] error.'
    );
  }
  return (
    `${head} — the client-files surface is inactive platform-wide: no document tools, no session-start ` +
    'recall of project files, no passage index. Individual organizations on the toggle\'s per-org list are ' +
    'unaffected. Turn it on globally by enabling the feature toggle rows above, or per environment with ' +
    'ANA_DOCUMENT_CATALOG_FORCE_ON=true (and ANA_VAULT_CHUNKING_FORCE_ON=true for the passage index).'
  );
}

/**
 * Create the two toggle rows if they are absent and report the resolved state.
 *
 * Never throws: a toggle store that cannot be reached must not stop the server
 * from booting, and `isFeatureEnabled` already fails closed on the same
 * condition. The caller logs what comes back.
 */
export async function bootstrapDocumentCatalogToggles(): Promise<CatalogToggleState> {
  await FeatureToggleService.initializeFeatureToggle(
    DOCUMENT_CATALOG_FEATURE_KEY,
    "AnA's project-file surface: list, read (with a full-coverage gate), catalog, file and semantically " +
      "search the client's vault documents, and recall them at session start.",
    false,
  ).catch(() => undefined);
  await FeatureToggleService.initializeFeatureToggle(
    VAULT_CHUNKING_FEATURE_KEY,
    'Passage index for vault documents: chunk and embed every upload so AnA can search inside the ' +
      'client’s files. Embeds at ingest, so it carries a per-upload cost. Requires ' +
      DOCUMENT_CATALOG_FEATURE_KEY + '.',
    false,
  ).catch(() => undefined);

  /* Reads the STATE, not the boolean. `isDocumentCatalogEnabled` fails closed
     to false whether the feature is off or the store could not be read, and
     this line is the one place where telling those apart is the whole job. The
     env override is still checked here, exactly as those helpers check it, so
     an environment forcing the feature on is reported as such without a read. */
  const resolve = async (
    envOn: boolean,
    featureKey: string,
  ): Promise<{ enabled: boolean; source: ToggleSource }> => {
    if (envOn) return { enabled: true, source: 'env' };
    const { enabled, readable } = await FeatureToggleService.readFeatureState(featureKey).catch(
      () => ({ enabled: false, readable: false }),
    );
    if (!readable) return { enabled: false, source: 'unreadable' };
    return { enabled, source: enabled ? 'toggle' : 'off' };
  };

  return {
    catalog: await resolve(
      process.env.ANA_DOCUMENT_CATALOG_FORCE_ON === 'true',
      DOCUMENT_CATALOG_FEATURE_KEY,
    ),
    chunking: await resolve(
      process.env.ANA_VAULT_CHUNKING_FORCE_ON === 'true',
      VAULT_CHUNKING_FEATURE_KEY,
    ),
  };
}
