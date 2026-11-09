/**
 * S12, for the CMC work project: what each deliverable feeds, and what is out
 * of date because of it.
 *
 * ## What S12 asks for, and what this lane already has
 *
 * P-83 (founder, 2026-11-01): a work project's deliverables are "mapped
 * downstream… A section records the version it was written from. A new version
 * flags the sections that used the old one."
 * `docs/design/THE_PROGRAM_2026-11-01.md` §7a lists four things as missing:
 * the deliverable list, the feeds links, the flag on a downstream section, and
 * the program's map.
 *
 * **Two of those four are already true for CMC, and better than the plan's own
 * description of them**:
 *
 * - *the section records the version it was written from* — `cmc_section_lineage`
 *   holds every source a section composed from, with that source's hash at
 *   compile;
 * - *a new version flags the sections that used the old one* — `findSectionDrift`
 *   derives it from that lineage rather than from a flag, deliberately: the
 *   `stale` column is written by only one of the three writers of
 *   `cmc_source_objects`, so an approved section could read "current" over data
 *   it no longer matched (`section-drift.ts`'s own header).
 *
 * What was missing is the DELIVERABLE view of the same facts: not "section
 * 3.2.S.4 is drifted", but "the specifications this project holds feed
 * §3.2.S.4 and §3.2.P.5, and two of those are out of date because of them".
 * That is what a work project's "Feeds" list shows (§7a, "In the UI (no new
 * screen)"), and it is the same data read the other way round.
 *
 * ## What these cases hold
 *
 * `projectDeliverableFeeds` composes what exists — `sectionsFedBy` (the
 * write-through's own impact map) and `findSectionDrift` — and attributes each
 * drifted section to the deliverable responsible, so a reader is never told
 * that their specifications are stale when a batch record changed.
 *
 * No route: the screen that renders this is the project page, held by another
 * lane. An API handler nobody calls is a defect this repository has deleted
 * seven of (`cmcConvergenceMap.ts`'s header), so the read lands first and the
 * handler lands with its caller.
 */
import { describe, expect, it } from 'vitest';

import { projectDeliverableFeeds } from '../section-drift';

const ORG = 7;
const PROJECT = 'c0ffee00-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;

/**
 * The two reads `findSectionDrift` makes, answered from fixtures: the sections
 * with their lineage, and the project's source objects.
 */
function fakeDb(sections: Row[], sources: Row[]) {
  return {
    query: async (sql: string) => {
      if (/FROM cmc_module3_sections/.test(sql)) return { rows: sections };
      if (/FROM cmc_source_objects/.test(sql)) return { rows: sources };
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    },
  };
}

const COMPILED = new Date('2026-11-01T00:00:00.000Z');
const LATER = new Date('2026-11-08T00:00:00.000Z');

/** A section row joined to one of its lineage entries. */
/**
 * A section row joined to one of its lineage entries, as the query returns it:
 * `liveHash` comes from the LIVE source object, so a source that changed after
 * the compile shows here as a hash that is no longer the one it read.
 */
const lineage = (sectionKey: string, source: Row, over: Row = {}) => ({
  sectionKey,
  sourceObjectId: source.id,
  hashAtCompile: source.source_hash ?? 'h',
  compiledAt: COMPILED,
  liveId: source.id,
  liveHash: source.source_hash ?? 'h',
  sourceType: source.sourceType,
  sourceKey: source.sourceKey,
  ...over,
});

/** The same entry, for a source whose record has since changed. */
const changedSince = (sectionKey: string, source: Row) =>
  lineage(sectionKey, source, { liveHash: `${source.source_hash}-v2` });

const source = (id: string, sourceType: string, sourceKey: string, over: Row = {}) => ({
  id, sourceType, sourceKey, source_hash: `hash-${id}`,
  sourcePayload: {}, touchedAt: COMPILED, ...over,
});

describe('a deliverable lists the sections it feeds', () => {
  it('names each deliverable kind the project holds, with its record count', async () => {
    const specs = [source('s1', 'specification', 'specification:1'), source('s2', 'specification', 'specification:2')];
    const method = source('m1', 'method', 'method:1');
    const db = fakeDb(
      [lineage('3.2.S.4', specs[0]), lineage('3.2.P.5', specs[1]), lineage('3.2.S.4', method)],
      [...specs, method],
    );

    const out = await projectDeliverableFeeds(db, ORG, PROJECT);

    expect(out.deliverables.map((d) => d.sourceType).sort()).toEqual(['method', 'specification']);
    expect(out.deliverables.find((d) => d.sourceType === 'specification')?.records).toBe(2);
    expect(out.deliverables.find((d) => d.sourceType === 'method')?.records).toBe(1);
  });

  it('lists the sections from the write-through’s own impact map, not a copy of it', async () => {
    const spec = source('s1', 'specification', 'specification:1');
    const out = await projectDeliverableFeeds(fakeDb([lineage('3.2.S.4', spec)], [spec]), ORG, PROJECT);

    const feeds = out.deliverables[0].feeds;
    expect(feeds).toContain('3.2.S.4');
    expect(feeds).toContain('3.2.P.5');
    // Sorted, so the list reads the same every time a person opens it.
    expect([...feeds].sort()).toEqual(feeds);
  });

  it('reports a deliverable the project holds even when it has composed nothing yet', async () => {
    /* A recorded register with no compile is a deliverable with a downstream
       map and no section written from it — which is what a Feeds list must
       show rather than omitting the row. */
    const batch = source('b1', 'batch', 'batch:1');
    const out = await projectDeliverableFeeds(fakeDb([], [batch]), ORG, PROJECT);

    expect(out.deliverables).toHaveLength(1);
    expect(out.deliverables[0].feeds.length).toBeGreaterThan(0);
    expect(out.deliverables[0].drifted).toEqual([]);
  });
});

describe('drift is attributed to the deliverable responsible', () => {
  it('names the sections out of date because THIS deliverable changed', async () => {
    const spec = source('s1', 'specification', 'specification:1');
    const out = await projectDeliverableFeeds(
      fakeDb([changedSince('3.2.S.4', spec), changedSince('3.2.P.5', spec)], [spec]),
      ORG, PROJECT,
    );

    const specification = out.deliverables.find((d) => d.sourceType === 'specification')!;
    expect(specification.drifted.sort()).toEqual(['3.2.P.5', '3.2.S.4']);
  });

  it('does not blame one deliverable for another’s drift', async () => {
    /* The reader must never be told their specifications are out of date
       because a batch result changed. Both feed §3.2.S.4. */
    const spec = source('s1', 'specification', 'specification:1');
    const batch = source('b1', 'batch', 'batch:1');
    const out = await projectDeliverableFeeds(
      fakeDb([lineage('3.2.S.4', spec), changedSince('3.2.S.4', batch)], [spec, batch]),
      ORG, PROJECT,
    );

    expect(out.deliverables.find((d) => d.sourceType === 'specification')?.drifted).toEqual([]);
    expect(out.deliverables.find((d) => d.sourceType === 'batch')?.drifted).toEqual(['3.2.S.4']);
  });

  it('attributes a record added after the compile to its own deliverable', async () => {
    const spec = source('s1', 'specification', 'specification:1');
    const added = source('s2', 'specification', 'specification:2', { touchedAt: LATER });
    const out = await projectDeliverableFeeds(
      fakeDb([lineage('3.2.S.4', spec)], [spec, added]),
      ORG, PROJECT,
    );

    expect(out.deliverables.find((d) => d.sourceType === 'specification')?.drifted).toEqual(['3.2.S.4']);
  });

  it('says why, in the words the drift read already uses', async () => {
    const spec = source('s1', 'specification', 'specification:1');
    const out = await projectDeliverableFeeds(
      fakeDb([changedSince('3.2.S.4', spec)], [spec]),
      ORG, PROJECT,
    );

    expect(out.deliverables[0].reasons.join(' ')).toContain('specification "specification:1" changed after compile');
  });
});

describe('a read that failed is not a project with no deliverables', () => {
  it('reports the failure rather than an empty map', async () => {
    const broken = { query: async () => { throw new Error('connection terminated'); } };

    const out = await projectDeliverableFeeds(broken, ORG, PROJECT);

    expect(out.deliverables).toEqual([]);
    expect(out.notEvaluated, 'a failed read was rendered as a project with nothing recorded').toBeTruthy();
    expect(out.notEvaluated).toMatch(/could not be read/i);
  });
});
