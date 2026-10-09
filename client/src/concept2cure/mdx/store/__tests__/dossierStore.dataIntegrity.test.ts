import { afterEach, describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../../../lib/queryClient';
import { deriveDossierStatus } from '../../hooks/useDossier';
import { DossierStore } from '../dossierStore';

afterEach(() => DossierStore.clearAllPathways());

describe('dossierStore live-data integrity', () => {
  it('does not seed fictional evidence merely by importing the store', () => {
    expect(DossierStore.fs.size).toBe(0);
    expect(DossierStore.listDir(DossierStore.rootFor('k510'))).toEqual([]);
  });

  it('installs kit evidence only through the explicit sample boundary', () => {
    DossierStore.enableSampleFixtures();
    expect(DossierStore.fs.size).toBeGreaterThan(0);
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).toContain('BX-204');
  });

  it('exposes no audit feed of its own — a section\'s history is the server\'s', () => {
    /* This asserted that the Activity feed held only "real in-store edits".
       Those were not real either: events this browser wrote about itself. The
       feed now reads c2c_document_section_versions (useSectionVersions), and
       the store has no event API left to render from. */
    const store = DossierStore as unknown as Record<string, unknown>;
    expect(store.activityForSection).toBeUndefined();
    expect(store.liveEventsForPathway).toBeUndefined();
  });

  it('empty backend hydration removes prior sample evidence', () => {
    DossierStore.enableSampleFixtures();
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).not.toBe('');
    DossierStore.hydratePathway('k510', 'doc-empty', []);
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).toBe('');
    expect(DossierStore.getBackendDocId('k510')).toBeUndefined();
  });

  it('live hydration replaces sample evidence rather than merging it', () => {
    DossierStore.enableSampleFixtures();
    DossierStore.hydratePathway('k510', 'doc-live', [{ key: 99, label: 'Tenant section', body: 'tenant evidence' }]);
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).toBe('');
    expect(DossierStore.readSectionBody('k510', 99, 'Tenant section')).toBe('tenant evidence');
    expect(DossierStore.getBackendDocId('k510')).toBe('doc-live');
  });

  it('distinguishes authorization failures, outages, and empty live data', () => {
    const base = { hasSections: false, sampleOn: false, isLoading: false };
    expect(deriveDossierStatus({ ...base, error: new ApiRequestError('Forbidden', 403) })).toBe(
      'permission-denied',
    );
    expect(deriveDossierStatus({ ...base, error: new ApiRequestError('Unauthorized', 401) })).toBe(
      'permission-denied',
    );
    expect(deriveDossierStatus({ ...base, error: new ApiRequestError('Unavailable', 503) })).toBe('unavailable');
    expect(deriveDossierStatus({ ...base, error: null })).toBe('empty');
  });

  it('uses live and explicit sample states without masking loading implicitly', () => {
    expect(deriveDossierStatus({ hasSections: true, sampleOn: false, isLoading: false, error: null })).toBe(
      'live-data',
    );
    expect(deriveDossierStatus({ hasSections: false, sampleOn: true, isLoading: false, error: null })).toBe(
      'sample',
    );
    expect(deriveDossierStatus({ hasSections: false, sampleOn: false, isLoading: true, error: null })).toBe(
      'loading',
    );
  });
});

describe('live audit events attribute only what the client can actually observe', () => {
  /* A browser cannot see its own source address. Both writers used to stamp one
     hard-coded private address onto every event, so the Activity drawer showed
     a specific, identical, invented origin for every action in a 21 CFR Part 11
     surface. That is a fabricated attribution, not a placeholder — and the kind
     of thing that is only ever noticed when someone is asked to defend the
     record. `AuditEvent.ip` is optional and the detail pane renders an em dash
     when it is absent, so the honest value here is none.

     Falsified by re-adding the literal to attachFile and re-running: two of the
     three assertions below go red. */

  /* 'records a section edit with no invented source address' checked that the
     store's client-authored edit event carried no `ip` — the right fix for the
     narrower defect, which left the wider one standing: the event itself was
     fabricated (actor "You", role "Reg Lead", Math.random id, pushed before and
     regardless of the governed PATCH). The attach case below reached the same
     conclusion first. Edits now write content only. */
  it('records NO audit event for a section edit — the server owns that entry', () => {
    const store = DossierStore as unknown as Record<string, unknown>;
    DossierStore.writeSectionBody('k510', 11, 'Performance testing', 'first');
    DossierStore.writeSectionBody('k510', 11, 'Performance testing', 'second');
    expect(DossierStore.readSectionBody('k510', 11, 'Performance testing')).toBe('second');
    expect(store.activityForSection).toBeUndefined();
  });

  it('records NO audit event for a file attach — the server owns that entry', () => {
    /* This assertion is inverted from what it used to be, deliberately.
       It read `expect(events.some((e) => e.kind === 'attach')).toBe(true)`,
       pinning the store's client-authored attach event and checking only that
       it carried no invented `ip`. That was the right fix for the narrower
       defect and it left the wider one standing: the event itself was
       fabricated. `attachFile` wrote name and size into an in-memory Map, never
       touched the bytes, and then logged a Part 11 'attach' with a hardcoded
       'Reg Lead' for a transfer that had not happened.
       W0-6 made the attachment a real upload (POST /api/vault/ingest), and the
       server writes the audit row in the same transaction as the document. A
       browser cannot witness a governed event — it does not know the actor's
       real role, cannot see its own source address, and has nothing to chain
       to — so the honest count of client-authored audit events is zero. */
    DossierStore.attachFile(
      'k510',
      11,
      'Performance testing',
      { name: 'mard-by-age-band.pdf', size: 1_400_000, kind: 'pdf' },
      { who: 'You', role: 'Reg Lead' },
    );
    expect((DossierStore as unknown as Record<string, unknown>).activityForSection).toBeUndefined();
    /* The attachment is still listed — the tab updates without a round trip.
       This read used to be `listDir('k510', 11, 'Performance testing')`, which
       was wrong twice over: `listDir` takes ONE argument, a path prefix, so
       this did not typecheck; and `.toBeDefined()` on a function that always
       returns an array cannot fail, so it asserted nothing the comment above
       it claims. The store's own reader takes the three parts and returns what
       the tab renders. */
    expect(
      DossierStore.readSectionAttachments('k510', 11, 'Performance testing').map((a) => a.name),
    ).toContain('mard-by-age-band.pdf');
  });


});
