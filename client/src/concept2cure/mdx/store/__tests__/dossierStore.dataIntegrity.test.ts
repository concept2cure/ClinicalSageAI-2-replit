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

  it('excludes the synthesized audit seed from section activity outside sample mode', () => {
    /* Even with sample fixtures installed in the store, the drawer's Activity
       feed merges the kit's synthesized hash-chain events only when sample
       mode itself is on — otherwise only real in-store edits appear. */
    DossierStore.enableSampleFixtures();
    const activity = DossierStore.activityForSection('k510', 11);
    expect(activity.every((e) => e.live === true)).toBe(true);
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

  it('records a section edit with no invented source address', () => {
    DossierStore.writeSectionBody('k510', 11, 'Performance testing', 'first');
    DossierStore.writeSectionBody('k510', 11, 'Performance testing', 'second');
    const events = DossierStore.activityForSection('k510', 11);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.ip, 'a source address was invented').toBeUndefined();
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
    const events = DossierStore.activityForSection('k510', 11);
    expect(events.some((e) => e.kind === 'attach')).toBe(false);
    /* The attachment is still listed — the tab updates without a round trip.
       This called `listDir('k510', 11, 'Performance testing')`, which does not
       typecheck: listDir takes ONE argument, a path prefix. It also asserted
       `toBeDefined()` on a function that always returns an array, so even had
       it compiled it could never fail. Now it asserts what the comment above it
       says: the file is there, by name. */
    expect(
      DossierStore.readSectionAttachments('k510', 11, 'Performance testing').some(
        (a) => a.name === 'mard-by-age-band.pdf',
      ),
    ).toBe(true);
  });

  it('holds for every live event the store can emit, not only the two probed above', () => {
    DossierStore.writeSectionBody('k510', 7, 'Indications', 'a');
    DossierStore.writeSectionBody('k510', 7, 'Indications', 'b');
    DossierStore.attachFile('k510', 7, 'Indications', { name: 'x.pdf', size: 10, kind: 'pdf' });
    const live = DossierStore.liveEventsForPathway('k510');
    expect(live.length).toBeGreaterThan(0);
    expect(live.filter((e) => e.ip !== undefined)).toEqual([]);
  });
});
