import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NativeAuthoringReadFixture, readsProseOrMetadata, type ReadDocument } from './authoring-current-read-fixture';

type ReadResponse = Awaited<ReturnType<NativeAuthoringReadFixture['probe']>['response']>;
const fixture = new NativeAuthoringReadFixture();
const endpoints = ['list', 'detail', 'sections'] as const;
const path = (endpoint: typeof endpoints[number], doc: ReadDocument) => endpoint === 'list' ? '/docs' : `/docs/${doc.id}${endpoint === 'sections' ? '/sections' : ''}`;
const paneAbsent = (res: ReadResponse) => {
  for (const key of ['documents', 'document', 'sections', 'provenance', 'access']) expect(res.body).not.toHaveProperty(key);
};
const noPrivateSection = (res: ReadResponse, doc: ReadDocument) => {
  const body = JSON.stringify(res.body);
  for (const section of doc.sections.slice(1)) {
    for (const marker of [section.id, section.title, section.content]) expect(body).not.toContain(marker);
  }
  for (const marker of ['HIDDEN_SOURCE_REFERENCE', 'HIDDEN_TEMPLATE', 'HIDDEN_IMPORT', 'HIDDEN_MODEL', 'HIDDEN_FIGURE', 'HIDDEN_CLAIM', 'PRIVATE_OTHER_DOCUMENT_COMMENT']) expect(body).not.toContain(marker);
};
const admittedQueryOrder = (key: string) => {
  const facts = fixture.facts.get(key)!;
  fixture.verifyPosture(facts, fixture.organizationId);
  const firstContent = facts.sql.findIndex(readsProseOrMetadata);
  const firstAcl = facts.sql.findIndex(sql => sql.includes('FROM doc_permissions'));
  expect(firstAcl).toBeGreaterThanOrEqual(0); expect(firstContent).toBeGreaterThan(firstAcl);
  expect(facts.pids.every(pid => pid === facts.posture.pid)).toBe(true);
};
const refusalBeforeMetadata = (key: string) => expect(fixture.facts.get(key)?.sql.filter(readsProseOrMetadata) ?? []).toEqual([]);
const currentViewerHints = (res: ReadResponse) => {
  expect(Object.keys(res.body.access).sort()).toEqual(['assignReview', 'edit', 'esign', 'esignReview', 'fileToVault', 'freeze', 'placeIntoFiling']);
  for (const gate of Object.values(res.body.access) as { allowed: boolean; reason: string | null }[]) {
    expect(gate).toMatchObject({ allowed: false }); expect(gate.reason).toEqual(expect.any(String));
  }
};

beforeAll(async () => { await fixture.setup(); }, 180_000);
afterAll(async () => { await fixture.close(); });

describe('native current Authoring request and durable authority', () => {
  it('pins actual app_service/NOSUPERUSER/NOBYPASSRLS/FORCE RLS before fixture writes and on a real authenticated read', async () => {
    expect(fixture.observations.stores).toHaveLength(12);
    const probe = fixture.probe(fixture.actors.reader, `/docs/${fixture.documents.full.id}/sections`);
    const res = await probe.response; expect(res.status).toBe(200); admittedQueryOrder(probe.key);
    expect(fixture.facts.get(probe.key)!.posture.user_role).toBe('viewer');
  });

  it.each(endpoints)('retains full Viewer %s content, counters and source semantics', async endpoint => {
    const doc = fixture.documents.full; const probe = fixture.probe(fixture.actors.reader, path(endpoint, doc));
    const res = await probe.response; expect(res.status).toBe(200); admittedQueryOrder(probe.key);
    if (endpoint === 'list') {
      const row = res.body.documents.find((item: { id: string }) => item.id === doc.id);
      expect(row).toMatchObject({ id: doc.id, readScope: 'document', provenance_source: 'ana', conversation_id: fixture.conversation });
      expect(Number(row.section_count)).toBe(2); expect(Number(row.total_content_length)).toBe(doc.sections.reduce((sum, section) => sum + section.content.length, 0));
      expect(res.body.count).toBe(res.body.documents.length);
    } else if (endpoint === 'detail') {
      expect(res.body.document).toMatchObject({ id: doc.id, readScope: 'document', sourceMetadataState: 'available', provenance: doc.provenance });
      for (const name of ['section_count', 'comment_count', 'revision_count']) expect(Number(res.body.document[name])).toBe(2);
      currentViewerHints(res);
    } else {
      expect(res.body.readScope).toBe('document'); expect(res.body.sections.map((section: { id: string }) => section.id)).toEqual(doc.sections.map(section => section.id));
      expect(res.body.structure).toEqual({ duplicateCodes: [], outOfOrder: false, suggestedOrder: ['2.5.1', '2.5.2'] });
      expect(res.body.count).toBe(2);
      for (const section of res.body.sections) {
        expect(section.content).toBe(doc.sections.find(item => item.id === section.id)!.content);
        for (const counter of ['comment_count', 'revision_count', 'citation_count']) expect(Number(section[counter])).toBe(1);
      }
    }
  });

  it.each(endpoints)('requires independent object permission for %s within an accessible public project', async endpoint => {
    const doc = fixture.documents['object-private']; const probe = fixture.probe(fixture.actors.bystander, path(endpoint, doc));
    const res = await probe.response;
    if (endpoint === 'list') {
      expect(res.status).toBe(200); expect(res.body.documents).toEqual([]); expect(res.body.count).toBe(0);
    } else {
      expect(res.status).toBe(404); expect(res.body.code).toBe('AUTHORING_DOCUMENT_NOT_FOUND'); paneAbsent(res); refusalBeforeMetadata(probe.key);
    }
    for (const marker of [doc.id, doc.title, doc.sections[0].id, doc.sections[0].content]) expect(JSON.stringify(res.body)).not.toContain(marker);
  });

  it.each(endpoints)('requires independent current project sharing for %s despite a full object grant', async endpoint => {
    const doc = fixture.documents['parent-private']; const probe = fixture.probe(fixture.actors.reader, path(endpoint, doc));
    const res = await probe.response;
    if (endpoint === 'list') {
      expect(res.status).toBe(200); expect(res.body.documents.map((row: { id: string }) => row.id)).not.toContain(doc.id);
    } else {
      expect(res.status).toBe(404); paneAbsent(res); refusalBeforeMetadata(probe.key);
    }
    expect(JSON.stringify(res.body)).not.toContain(doc.title); expect(JSON.stringify(res.body)).not.toContain(doc.sections[0].content);
  });

});

describe('native full and exact section projections', () => {
  it.each(endpoints)('keeps the exact section-only %s projection without sibling prose, source facts or counts', async endpoint => {
    const doc = fixture.documents.partial; const probe = fixture.probe(fixture.actors.section, path(endpoint, doc));
    const res = await probe.response; expect(res.status).toBe(200); admittedQueryOrder(probe.key); noPrivateSection(res, doc);
    if (endpoint === 'list') {
      const row = res.body.documents.find((item: { id: string }) => item.id === doc.id);
      expect(row).toMatchObject({ id: doc.id, readScope: 'sections' }); expect(Number(row.section_count)).toBe(1);
      expect(Number(row.total_content_length)).toBe(doc.sections[0].content.length);
      expect(row).not.toHaveProperty('conversation_id'); expect(row).not.toHaveProperty('provenance_source');
    } else if (endpoint === 'detail') {
      expect(res.body.document).toMatchObject({ id: doc.id, readScope: 'sections', sourceMetadataState: 'unavailable' });
      expect(res.body.document).not.toHaveProperty('provenance'); expect(res.body).not.toHaveProperty('provenanceStore');
      for (const counter of ['section_count', 'comment_count', 'revision_count']) expect(Number(res.body.document[counter])).toBe(1);
      expect(fixture.facts.get(probe.key)!.sql.some(sql => /^SELECT provenance FROM/.test(sql))).toBe(false);
      currentViewerHints(res);
    } else {
      expect(res.body.readScope).toBe('sections'); expect(res.body.structure).toBeNull(); expect(res.body.count).toBe(1);
      expect(res.body.sections.map((section: { id: string }) => section.id)).toEqual([doc.sections[0].id]);
      expect(res.body.sections[0].content).toBe(doc.sections[0].content);
      for (const counter of ['comment_count', 'revision_count', 'citation_count']) expect(Number(res.body.sections[0][counter])).toBe(1);
    }
  });

  it.each(['conversation', 'source'] as const)('withholds partial whole-document %s associations even from matching filter predicates', async filter => {
    const query = filter === 'source' ? 'source=ana' : `conversationId=${fixture.conversation}`;
    const res = await fixture.probe(fixture.actors.section, `/docs?${query}`).response;
    expect(res.status).toBe(200); expect(res.body.documents.map((doc: { id: string }) => doc.id)).toEqual([fixture.documents.full.id]);
    expect(res.body.documents[0].readScope).toBe('document'); expect(res.body.count).toBe(1);
  });

  it('distinguishes an actual accessible zero-section full document from a missing parent', async () => {
    const empty = fixture.documents.empty;
    const found = await fixture.probe(fixture.actors.reader, `/docs/${empty.id}/sections`).response;
    expect(found.status).toBe(200); expect(found.body).toMatchObject({ sections: [], count: 0, readScope: 'document', structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: [] } });
    const detail = await fixture.probe(fixture.actors.reader, `/docs/${empty.id}`).response;
    expect(detail.status).toBe(200); expect(detail.body.document).toMatchObject({ id: empty.id, sourceMetadataState: 'available', provenance: null });
    const missing = await fixture.probe(fixture.actors.reader, `/docs/${randomUUID()}/sections`).response;
    expect(missing.status).toBe(404); paneAbsent(missing);
  });

  it('retains legitimate ACL-controlled NULL-program records only in organization mode', async () => {
    const doc = fixture.documents.historical;
    for (const suffix of ['', '/sections']) {
      const org = await fixture.probe(fixture.actors.reader, `/docs/${doc.id}${suffix}`).response; expect(org.status).toBe(200);
      const selected = await fixture.probe(fixture.actors.reader, `/docs/${doc.id}${suffix}?programId=${fixture.programs.public.id}`).response;
      expect(selected.status).toBe(404); paneAbsent(selected);
    }
    const org = await fixture.probe(fixture.actors.reader, '/docs').response; expect(org.status).toBe(200);
    expect(org.body.documents.map((row: { id: string }) => row.id)).toContain(doc.id);
    const selected = await fixture.probe(fixture.actors.reader, `/docs?programId=${fixture.programs.public.id}`).response;
    expect(selected.status).toBe(200); expect(selected.body.documents.map((row: { id: string }) => row.id)).not.toContain(doc.id);
    expect((await fixture.owner.query('SELECT client_program_id FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [doc.id, fixture.organizationId])).rows[0].client_program_id).toBeNull();
  });

  it('does not turn an ungranted NULL-program zero-section parent into an empty successful read', async () => {
    for (const suffix of ['', '/sections']) {
      const probe = fixture.probe(fixture.actors.reader, `/docs/${fixture.documents['historical-private'].id}${suffix}`);
      const res = await probe.response; expect(res.status).toBe(404); paneAbsent(res); refusalBeforeMetadata(probe.key);
    }
  });

  it.each(['detail', 'sections'] as const)('refuses a real foreign %s identity despite forged context/role headers', async endpoint => {
    const doc = fixture.documents.foreign; const probe = fixture.probe(fixture.actors.reader, path(endpoint, doc), undefined, false,
      { 'X-Org-ID': String(fixture.foreignOrganizationId), 'X-Tenant-ID': String(fixture.foreignOrganizationId), 'X-Roles': 'ADMIN', 'X-User-Email': fixture.actors.foreign.email });
    const res = await probe.response; expect(res.status).toBe(404); paneAbsent(res); refusalBeforeMetadata(probe.key);
    expect(JSON.stringify(res.body)).not.toContain(doc.id); expect(JSON.stringify(res.body)).not.toContain(doc.title);
  });

  it('excludes legal hidden/foreign counters while retaining a separate physical cross-tenant 23503 control', async () => {
    await fixture.rejectCrossTenantChild();
    const doc = fixture.documents.partial;
    const full = await fixture.probe(fixture.actors.reader, `/docs/${doc.id}`).response; expect(full.status).toBe(200);
    expect(Number(full.body.document.comment_count)).toBe(2); expect(Number(full.body.document.revision_count)).toBe(2);
    const partial = await fixture.probe(fixture.actors.section, `/docs/${doc.id}`).response; expect(partial.status).toBe(200);
    expect(Number(partial.body.document.comment_count)).toBe(1); expect(Number(partial.body.document.revision_count)).toBe(1);
    const retained = (await fixture.owner.query('SELECT doc_id,section_id,body FROM authoring_comments WHERE id=$1 AND tenant_id=$2', [fixture.crossDocumentCommentId, fixture.organizationId])).rows[0];
    expect(retained.doc_id).toBe(doc.id); expect(retained.section_id).toBe(fixture.documents['object-private'].sections[0].id);
    const list = await fixture.probe(fixture.actors.reader, '/docs').response; expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(fixture.documents.foreign.id);
    noPrivateSection(partial, doc);
  });

});

describe('native current identity and late read refusal', () => {
  it('uses the persisted current viewer for ceremony hints despite a signed stale-admin claim', async () => {
    const probe = fixture.probe(fixture.actors.reader, `/docs/${fixture.documents.full.id}`); const res = await probe.response;
    expect(res.status).toBe(200); currentViewerHints(res); expect(fixture.facts.get(probe.key)!.posture.user_role).toBe('viewer');
    const current = (await fixture.owner.query('SELECT role FROM organization_users WHERE user_id=$1 AND organization_id=$2', [fixture.actors.reader.id, fixture.organizationId])).rows[0];
    expect(current.role).toBe('viewer');
  });

  it.each(['missing-ou', 'inactive'] as const)('refuses actual %s standing before any pane is assembled', async name => {
    const probe = fixture.probe(fixture.actors[name], `/docs/${fixture.documents.full.id}`); const res = await probe.response;
    expect(res.status).toBe(name === 'inactive' ? 401 : 403);
    if (name === 'inactive') expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    paneAbsent(res); refusalBeforeMetadata(probe.key);
  });

  it.each(['expired', 'revoked'] as const)('refuses a retained real %s object grant before private metadata', async name => {
    const doc = fixture.documents[name]; const probe = fixture.probe(fixture.actors.reader, `/docs/${doc.id}/sections`); const res = await probe.response;
    expect(res.status).toBe(404); expect(res.body.code).toBe('AUTHORING_DOCUMENT_NOT_FOUND'); paneAbsent(res); refusalBeforeMetadata(probe.key);
    expect((await fixture.owner.query('SELECT COUNT(*) AS count FROM doc_permissions WHERE doc_id=$1 AND principal_id=$2 AND tenant_id=$3', [doc.id, String(fixture.actors.reader.id), fixture.organizationId])).rows[0].count).toBe('1');
  });

  it.each(['ou', 'role', 'sharing', 'section', 'email'] as const)('refuses actual late %s withdrawal/change after the real native content query settles', async suffix => {
    const name = `late-${suffix}`; const doc = fixture.documents[name]; let mutated = false;
    const probe = fixture.probe(fixture.actors[name], `/docs/${doc.id}/sections`, async sql => {
      if (mutated || !sql.includes('s.content')) return;
      mutated = true; await fixture.withdraw(name);
    });
    const res = await probe.response; expect(mutated).toBe(true); expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUTHORING_READ_ACCESS_CHANGED'); paneAbsent(res);
    expect(JSON.stringify(res.body)).not.toContain(doc.sections[0].content);
    expect(fixture.facts.get(probe.key)!.sql.some(sql => sql.includes('s.content'))).toBe(true);
  });

  it.each(['malformed', 'multivalued', 'wrong-program'] as const)('preserves exact selected input refusal for %s', async kind => {
    const query = kind === 'malformed' ? 'programId=not-a-uuid' : kind === 'multivalued' ? `programId=${fixture.programs.public.id}&programId=${fixture.programs.private.id}` : `programId=${fixture.programs['late-status'].id}`;
    const probe = fixture.probe(fixture.actors.reader, `/docs/${fixture.documents.full.id}/sections?${query}`); const res = await probe.response;
    expect(res.status).toBe(kind === 'wrong-program' ? 404 : 400); paneAbsent(res); refusalBeforeMetadata(probe.key);
    if (kind !== 'wrong-program') expect(res.body.code).toBe('AUTHORING_READ_INPUT_INVALID');
  });

  it('preserves mixed modules/statuses, full source/conversation positives and no implicit status filter', async () => {
    const ids = (res: ReadResponse) => res.body.documents.map((doc: { id: string }) => doc.id).sort();
    const all = await fixture.probe(fixture.actors.reader, '/docs').response; expect(all.status).toBe(200);
    expect(ids(all)).toContain(fixture.documents.full.id); expect(ids(all)).toContain(fixture.documents.empty.id);
    for (const status of ['all', '']) {
      const res = await fixture.probe(fixture.actors.reader, `/docs?status=${status}`).response; expect(res.status).toBe(200); expect(ids(res)).toEqual(ids(all));
    }
    const frozen = await fixture.probe(fixture.actors.reader, '/docs?status=frozen&module=M3').response; expect(frozen.status).toBe(200);
    expect(ids(frozen)).toEqual([fixture.documents.empty.id]); expect(frozen.body.filters).toMatchObject({ status: 'frozen', module: 'M3' });
    const source = await fixture.probe(fixture.actors.reader, `/docs?conversationId=${fixture.conversation}&source=ana`).response; expect(source.status).toBe(200);
    expect(ids(source)).toEqual([fixture.documents.full.id, fixture.documents.partial.id].sort());
  });

  it('refuses mismatched saved status between actual header and hint-scope reads', async () => {
    const doc = fixture.documents['late-status']; let mutated = false;
    const probe = fixture.probe(fixture.actors['late-status'], `/docs/${doc.id}`, async sql => {
      if (mutated || !sql.includes('d.title')) return;
      mutated = true; await fixture.withdraw('late-status');
    });
    const res = await probe.response; expect(mutated).toBe(true); expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUTHORING_READ_ACCESS_CHANGED'); paneAbsent(res);
  });

  it('fails closed when the real authenticated request executor is absent instead of using a shared pool', async () => {
    const probe = fixture.probe(fixture.actors.reader, `/docs/${fixture.documents.full.id}`, undefined, true); const res = await probe.response;
    expect(res.status).toBe(500); paneAbsent(res); refusalBeforeMetadata(probe.key); fixture.verifyPosture(fixture.facts.get(probe.key)!, fixture.organizationId);
  });
});
