/**
 * The startup line an operator reads to find the switch.
 *
 * ── Why this is worth a test ─────────────────────────────────────────────────
 * `feature_toggles` is empty on a fully migrated database, and
 * isFeatureEnabled returns false for a key with no row. So the whole
 * document-catalog surface — the tools, the coverage gate, session-start recall
 * of the client's files, the passage index — resolved OFF in every deployment,
 * and with no row in the table there was nothing for an operator to find. This
 * line is the fix's user interface: if it stops naming the way to turn the
 * feature on, the capability goes back to being invisible rather than merely
 * disabled.
 *
 * The formatter is pure, so the wording is asserted without a database.
 */
import { describe, expect, it, vi } from 'vitest';

/* The toggle store and the logger, for the bootstrap case at the bottom. The
   formatter cases above never reach either. */
const { initializeFeatureToggle, readFeatureState, warn } = vi.hoisted(() => ({
  initializeFeatureToggle: vi.fn(),
  readFeatureState: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('../../services/featureToggleService.js', () => ({
  FeatureToggleService: { initializeFeatureToggle, readFeatureState },
}));
vi.mock('../../utils/logger.js', () => ({
  createScopedLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { bootstrapDocumentCatalogToggles, describeCatalogToggles } from '../document-catalog-bootstrap';
import { DOCUMENT_CATALOG_FEATURE_KEY } from '../../services/vault/document-catalog.service';
import { VAULT_CHUNKING_FEATURE_KEY } from '../../services/vault/document-chunking.service';

describe('describeCatalogToggles', () => {
  it('names both feature keys, so the line is searchable against the toggle table', () => {
    const out = describeCatalogToggles({
      catalog: { enabled: false, source: 'off' },
      chunking: { enabled: false, source: 'off' },
    });
    expect(out).toContain(DOCUMENT_CATALOG_FEATURE_KEY);
    expect(out).toContain(VAULT_CHUNKING_FEATURE_KEY);
  });

  it('when off, says what is inactive AND both ways to turn it on', () => {
    const out = describeCatalogToggles({
      catalog: { enabled: false, source: 'off' },
      chunking: { enabled: false, source: 'off' },
    });
    expect(out).toContain('inactive platform-wide');
    expect(out).toContain('no session-start recall');
    expect(out).toContain('ANA_DOCUMENT_CATALOG_FORCE_ON=true');
    expect(out).toContain('feature toggle rows');
  });

  it('does not claim every tenant is off — a per-org enablement is invisible here', () => {
    // isFeatureEnabled without an organization id reads the platform flag only.
    // Reporting that as "off" full stop would be false for an org on the
    // toggle's per-org list.
    const out = describeCatalogToggles({
      catalog: { enabled: false, source: 'off' },
      chunking: { enabled: false, source: 'off' },
    });
    expect(out).toContain('per-org list are unaffected');
  });

  it('distinguishes an env override from a toggle so the source of ON is not guessed at', () => {
    const viaEnv = describeCatalogToggles({
      catalog: { enabled: true, source: 'env' },
      chunking: { enabled: true, source: 'env' },
    });
    expect(viaEnv).toContain('ON (env override)');
    const viaToggle = describeCatalogToggles({
      catalog: { enabled: true, source: 'toggle' },
      chunking: { enabled: true, source: 'toggle' },
    });
    expect(viaToggle).toContain('ON (feature toggle)');
  });

  it('says passage search has no index when the catalog is on but chunking is not', () => {
    // The half-on state is the confusing one: the tools work, and
    // search_document_passages truthfully finds nothing because nothing was
    // ever indexed. Saying so at boot is cheaper than diagnosing it later.
    const out = describeCatalogToggles({
      catalog: { enabled: true, source: 'toggle' },
      chunking: { enabled: false, source: 'off' },
    });
    expect(out).toContain('passage search has no index');
    expect(out).toContain('says so rather than returning nothing');
  });

  it('confirms the whole surface when both are on', () => {
    const out = describeCatalogToggles({
      catalog: { enabled: true, source: 'toggle' },
      chunking: { enabled: true, source: 'toggle' },
    });
    expect(out).toContain('list, read, catalog, file and passage-search');
  });
});

describe('a store it could not read is not a feature somebody turned off', () => {
  /* The two states were one word. `isFeatureEnabled` fails closed — correctly —
     so a refused read and a deliberately disabled toggle both arrived here as
     `false`, and the startup line reported "inactive platform-wide" with the
     same confidence for both. The operator whose flag did nothing needs those
     told apart; the operator whose flag is simply off does not need a database
     investigation. */
  it('says UNKNOWN, and says the flag was not turned off', () => {
    const line = describeCatalogToggles({
      catalog: { enabled: false, source: 'unreadable' },
      chunking: { enabled: false, source: 'unreadable' },
    });
    expect(line).toContain('UNKNOWN (toggle store unreadable)');
    expect(line).toContain('NOT because anyone turned it off');
    expect(line).toContain('[feature-toggle]');
    // And it must not hand out the turn-it-on instructions, which would be
    // advice for a different problem.
    expect(line).not.toContain('ANA_DOCUMENT_CATALOG_FORCE_ON=true');
  });

  it('an ordinary off still reads as off, with the two ways to turn it on', () => {
    const line = describeCatalogToggles({
      catalog: { enabled: false, source: 'off' },
      chunking: { enabled: false, source: 'off' },
    });
    expect(line).toContain('inactive platform-wide');
    expect(line).toContain('ANA_DOCUMENT_CATALOG_FORCE_ON=true');
    expect(line).not.toContain('UNKNOWN');
  });

  it('one unreadable flag is enough to stop claiming the other is simply off', () => {
    const line = describeCatalogToggles({
      catalog: { enabled: false, source: 'off' },
      chunking: { enabled: false, source: 'unreadable' },
    });
    expect(line).toContain('could not be read');
  });
});

describe('bootstrapDocumentCatalogToggles — a row it could not create is said, not swallowed', () => {
  /* Creating the rows was `.catch(() => undefined)`. When the insert is refused
     but the store is still readable, both flags read "off", and the startup line
     tells the operator to enable "the feature toggle rows above" — rows that do
     not exist — with nothing anywhere saying why. */
  it('warns with the key and the reason when a toggle row cannot be created', async () => {
    initializeFeatureToggle.mockRejectedValue(new Error('permission denied for table feature_toggles'));
    readFeatureState.mockResolvedValue({ enabled: false, readable: true });
    warn.mockReset();

    const state = await bootstrapDocumentCatalogToggles();

    expect(state.catalog).toEqual({ enabled: false, source: 'off' });
    const said = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(said).toContain(DOCUMENT_CATALOG_FEATURE_KEY);
    expect(said).toContain(VAULT_CHUNKING_FEATURE_KEY);
    expect(said).toContain('permission denied for table feature_toggles');
  });
});

