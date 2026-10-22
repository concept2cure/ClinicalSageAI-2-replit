/** Independent actual PostgreSQL/HTTP proof; no mocked authorization or source arrays. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PathwayManifestResponse } from '../../shared/types/submission-api';
import { readSubmissionSequenceForRequest, readSubmissionLeavesForRequest } from '../../server/services/submission-service/submission-request-read';
import { readSubmissionLeafSourceEvidence, requireSubmissionLeafSourceEvidenceStillCurrent } from '../../server/services/ectd/submission-leaf-source-evidence';
import { withNativeCatalogClient } from './catalog-native-fixture';
import { BODY, NativeSubmissionFixture, type Filing } from './submission-required-deliverables-fixture';

const h = new NativeSubmissionFixture();
beforeAll(async () => { await h.setup(); }, 120_000);
afterAll(async () => { await h.close(); });
const slot = (body: PathwayManifestResponse) => body.entries.find(entry => entry.id === 'device-description')!;
const noPane = (body: Record<string, unknown>) => {
  expect(body.scope).toBeUndefined(); expect(body.entries).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain(BODY);
};
const changedAfter = (boundary: string, mutation: () => Promise<unknown>) => {
  let changed = false;
  return { afterQuery: async (sql: string) => { if (!changed && sql.includes(boundary)) { changed = true; await mutation(); } }, wasChanged: () => changed };
};

describe('actual required-deliverables current sharing and metadata', () => {
  it.each(['owner', 'member', 'unassigned'])('admits a genuine %s positive control on current canonical sharing', async name => {
    const filing = h.filings[name === 'unassigned' ? 'public' : 'private'];
    const probe = h.manifest(h.actors[name], filing); const response = await probe.response;
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.scope).toMatchObject({ organizationId: h.organizationId, programId: filing.program!.id,
      projectId: filing.program!.projectId, submissionId: filing.id, sequenceId: filing.sequenceId,
      recordedApplicationType: 'US_510K', recordedPathway: 'estar_510k', evaluatedPathway: 'estar_510k',
      sequenceRegion: 'fda', inputOrigin: 'recorded', dispatchReadiness: 'separate-governed-assessment' });
    const entry = slot(response.body); expect(entry.status).toBe('present');
    expect(entry.sourceRefs).toHaveLength(1);
    expect(entry.sourceRefs[0]).toMatchObject({ leafId: filing.leafId, sequenceId: filing.sequenceId,
      document: { table: 'c2c_document_sections', keyKind: 'integer', id: filing.sectionId },
      section: { id: String(filing.sectionId), code: 'actual-source-key' }, editor: null,
      evidence: { content: 'substantive', pin: 'match', lifecycle: 'finalized', reasonCode: null } });
    expect(response.body.ready).toBe(false); expect(response.body.totals.requiredMissing).toBeGreaterThan(0);
    expect(JSON.stringify(response.body)).not.toContain(BODY);
    const facts = h.facts.get(probe.key)!; h.verifyPosture(facts, h.organizationId);
    expect(new Set(facts.pids)).toEqual(new Set([Number(facts.posture.pid)]));
    expect(facts.sql.some(sql => sql.includes('SELECT s.id::text AS id,s.section_key,s.content'))).toBe(true);
    const metadata = await h.probe(h.actors[name], `/${filing.id}?programId=${filing.program!.id}`).response;
    expect(metadata.status).toBe(200); expect(metadata.body).toMatchObject({ id: filing.id, programId: filing.program!.id });
    const sequences = await h.probe(h.actors[name], `/${filing.id}/sequences`).response;
    expect(sequences.status).toBe(200); expect(sequences.body[0].deliverables).toMatchObject({ available: true, recordedPathway: 'estar_510k' });
    const placements = await h.probe(h.actors[name], `/sequences/${filing.sequenceId}/leaves`).response;
    expect(placements.status).toBe(200); expect(placements.body).toHaveLength(1);
    expect(placements.body[0].sourceRef.evidence).toMatchObject({ content: 'substantive', pin: 'match' });
    const readiness = await h.probe(h.actors[name], `/sequences/${filing.sequenceId}/pathway-readiness`).response;
    expect(readiness.status).toBe(200); expect(readiness.body).toMatchObject({ pathway: 'estar_510k', ready: false, scope: { programId: filing.program!.id, sequenceId: filing.sequenceId } });
  });

  it('lists only accessible records, and the scoped list returns no withheld-row oracle', async () => {
    const actor = h.actors.unassigned;
    const list = await h.probe(actor, '').response;
    expect(list.status).toBe(200); expect(list.body.map((row: { id: number }) => row.id)).toEqual([h.filings.public.id]);
    expect(JSON.stringify(list.body)).not.toContain(h.filings.private.title);
    const scoped = await h.probe(actor, `?programId=${h.programs.public.id}`).response;
    expect(scoped.status).toBe(200); expect(scoped.body.data.map((row: { id: number }) => row.id)).toEqual([h.filings.public.id]);
    expect(scoped.body.meta?.notOffered).toBeUndefined(); expect(scoped.body.notOffered).toBeUndefined();
  });

  it.each(['submission', 'sequences', 'leaves', 'manifest'])('refuses an unassigned private %s read before placement or source SQL', async endpoint => {
    const f = h.filings.private;
    const paths = { submission: `/${f.id}`, sequences: `/${f.id}/sequences`, leaves: `/sequences/${f.sequenceId}/leaves`, manifest: `/sequences/${f.sequenceId}/pathway-manifest` };
    const probe = h.probe(h.actors.unassigned, paths[endpoint as keyof typeof paths]); const response = await probe.response;
    expect(response.status).toBe(403); expect(response.body.error.code).toBe('PROJECT_PERMISSION_DENIED'); noPane(response.body);
    expect(JSON.stringify(response.body)).not.toContain(f.title);
    expect(h.facts.get(probe.key)!.sql.some(sql => sql.includes('submission_leaves') || sql.includes('c2c_document_sections'))).toBe(false);
  });

  it('keeps the current-manager unanchored metadata remedy reachable without admitting sources', async () => {
    const actor = h.actors.manager; const f = h.filings.unanchored;
    const list = await h.probe(actor, '').response;
    expect(list.status).toBe(200); expect(list.body.map((row: { id: number }) => row.id)).toContain(f.id);
    const direct = await h.probe(actor, `/${f.id}`).response;
    expect(direct.status).toBe(200); expect(direct.body).toMatchObject({ id: f.id, programId: null });
    const sequences = await h.probe(actor, `/${f.id}/sequences`).response;
    expect(sequences.status).toBe(409); expect(sequences.body.error.code).toBe('UNANCHORED_SUBMISSION');
    const source = await h.probe(actor, `/sequences/${f.sequenceId}/pathway-manifest`).response;
    expect(source.status).toBe(409); expect(source.body.error.code).toBe('UNANCHORED_SUBMISSION'); noPane(source.body);
    const other = await h.probe(h.actors.member, `/${f.id}`).response;
    expect(other.status).toBe(409); expect(other.body.error.code).toBe('UNANCHORED_SUBMISSION');
  });

});

describe('actual required-deliverables current actor, parent and selected scope', () => {
  it('refuses a signed token without an actual organization membership', async () => {
    const probe = h.manifest(h.actors['missing-ou'], h.filings.public); const response = await probe.response;
    expect(response.status).toBe(403); noPane(response.body); expect(h.facts.has(probe.key)).toBe(false);
  });

  it('refuses a formerly capable role after actual persisted demotion', async () => {
    const actor = h.actors.demoted; await h.member(h.programs.private, actor);
    const positive = await h.manifest(actor, h.filings.private).response; expect(positive.status).toBe(200);
    await h.owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [h.organizationId, actor.id]);
    const probe = h.manifest(actor, h.filings.private); const response = await probe.response;
    expect(response.status).toBe(403); noPane(response.body);
    expect(h.facts.get(probe.key)?.sql.some(sql => sql.includes('submission_leaves') || sql.includes('c2c_document_sections')) ?? false).toBe(false);
  });

  it('refuses an actual disabled account at the JWT boundary', async () => {
    const actor = h.actors.disabled;
    expect((await h.manifest(actor, h.filings.public).response).status).toBe(200);
    await h.owner.query("UPDATE users SET status='inactive' WHERE id=$1 AND default_organization_id=$2", [actor.id, h.organizationId]);
    const probe = h.manifest(actor, h.filings.public); const response = await probe.response;
    expect(response.status).toBe(401); expect(response.body.error.code).toBe('ACCOUNT_INACTIVE'); noPane(response.body);
    expect(h.facts.has(probe.key)).toBe(false);
  });

  it('fails safely when the real authenticated request executor is removed', async () => {
    const probe = h.probe(h.actors.member, `/sequences/${h.filings.private.sequenceId}/pathway-manifest`, undefined, true);
    const response = await probe.response; expect(response.status).toBe(500); noPane(response.body);
    expect(h.facts.get(probe.key)!.sql).toEqual([]);
  });

  it('refuses the actual foreign submission and sequence identities', async () => {
    const f = h.filings.foreign;
    for (const path of [`/${f.id}`, `/sequences/${f.sequenceId}/pathway-manifest`]) {
      const probe = h.probe(h.actors.member, path); const response = await probe.response;
      expect(response.status).toBe(404); expect(response.body.error.code).toBe('NOT_FOUND'); noPane(response.body);
      expect(h.facts.get(probe.key)!.sql.some(sql => sql.includes('submission_leaves') || sql.includes('c2c_document_sections'))).toBe(false);
    }
  });

  it('refuses an existing sequence when its actual parent is soft-deleted', async () => {
    const f = await h.filing('deleted-parent', h.programs.private, { deleted: true });
    const response = await h.manifest(h.actors.owner, f).response;
    expect(response.status).toBe(404); expect(response.body.error.code).toBe('NOT_FOUND'); noPane(response.body);
    const retained = (await h.owner.query('SELECT id,deleted_at FROM submissions WHERE id=$1 AND organization_id=$2', [f.id, h.organizationId])).rows[0];
    expect(retained.id).toBe(f.id); expect(retained.deleted_at).not.toBeNull();
  });

  it.each(['program', 'submission'])('refuses a conflicting selected %s identity before leaves', async selected => {
    const f = h.filings.public;
    const query = selected === 'program' ? `programId=${h.programs.private.id}&submissionId=${f.id}` : `programId=${h.programs.public.id}&submissionId=${h.filings.private.id}`;
    const probe = h.probe(h.actors.unassigned, `/sequences/${f.sequenceId}/pathway-manifest?${query}`); const response = await probe.response;
    expect(response.status).toBe(404); expect(response.body.error.code).toBe('NOT_FOUND'); noPane(response.body);
    expect(h.facts.get(probe.key)!.sql.some(sql => sql.includes('submission_leaves'))).toBe(false);
  });

});

describe('actual required-deliverables recorded filing frameworks', () => {
  it('uses the actual filing framework, not the amendment lifecycle type or requested friendlier pathway', async () => {
    const f = h.filings.private;
    const response = await h.probe(h.actors.member, `/sequences/${f.sequenceId}/pathway-manifest?pathway=ctis`).response;
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('PATHWAY_INCOMPATIBLE'); noPane(response.body);
    const stored = (await h.owner.query('SELECT type FROM ectd_sequences WHERE id=$1 AND organization_id=$2', [f.sequenceId, h.organizationId])).rows[0];
    expect(stored.type).toBe('amendment');
  });

  it('requires an explicit compatible choice when no live framework is recorded', async () => {
    const f = await h.filing('missing-framework', h.programs.public, { recorded: false });
    const absent = await h.manifest(h.actors.unassigned, f).response;
    expect(absent.status).toBe(409); expect(absent.body.error.code).toBe('PATHWAY_SELECTION_REQUIRED'); noPane(absent.body);
    const chosen = await h.probe(h.actors.unassigned, `/sequences/${f.sequenceId}/pathway-manifest?pathway=estar_510k&programId=${f.program!.id}&submissionId=${f.id}`).response;
    expect(chosen.status).toBe(200); expect(chosen.body.scope).toMatchObject({ inputOrigin: 'explicit-compatible', recordedPathway: null, evaluatedPathway: 'estar_510k' });
  });

  it('refuses a recorded incompatible framework instead of selecting the requested compatible one', async () => {
    const f = await h.filing('recorded-conflict', h.programs.public);
    await h.owner.query("UPDATE submission_regions SET pathway='ctis' WHERE submission_id=$1 AND organization_id=$2", [f.id, h.organizationId]);
    const response = await h.probe(h.actors.unassigned, `/sequences/${f.sequenceId}/pathway-manifest?pathway=estar_510k`).response;
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('PATHWAY_RECORD_CONFLICT'); noPane(response.body);
  });

  it('refuses a recorded sequence-region conflict', async () => {
    const f = await h.filing('region-conflict', h.programs.public);
    await h.owner.query("UPDATE ectd_sequences SET region='jp' WHERE id=$1 AND organization_id=$2", [f.sequenceId, h.organizationId]);
    const response = await h.manifest(h.actors.unassigned, f).response;
    expect(response.status).toBe(409); expect(response.body.error.code).toBe('PATHWAY_REGION_CONFLICT'); noPane(response.body);
  });

  it('keeps actual unsupported IND coverage unavailable in both list metadata and direct assessment', async () => {
    const f = h.filings.ind;
    const list = await h.probe(h.actors.owner, `/${f.id}/sequences`).response;
    expect(list.status).toBe(200); expect(list.body[0].deliverables).toMatchObject({ available: false, compatiblePathways: [], reasonCode: 'PATHWAY_COVERAGE_UNAVAILABLE' });
    const response = await h.manifest(h.actors.owner, f).response;
    expect(response.status).toBe(422); expect(response.body.error.code).toBe('PATHWAY_COVERAGE_UNAVAILABLE'); noPane(response.body);
  });

  it('returns current retained technical-file coverage for the actual MDR filing only', async () => {
    const f = h.filings.mdr;
    const response = await h.probe(h.actors.owner, `/sequences/${f.sequenceId}/technical-file`).response;
    expect(response.status).toBe(200); expect(response.body.regulation).toBe('mdr'); expect(slot(response.body).status).toBe('present');
    expect(response.body.scope).toMatchObject({ recordedApplicationType: 'EU_MDR_TECHDOC', regulation: 'mdr', evaluatedPathway: 'mdr' });
    const wrong = await h.probe(h.actors.owner, `/sequences/${f.sequenceId}/technical-file?regulation=ivdr`).response;
    expect(wrong.status).toBe(409); expect(wrong.body.error.code).toBe('PATHWAY_INCOMPATIBLE'); noPane(wrong.body);
  });

});

describe('actual required-deliverables retained source evidence and late changes', () => {
  it.each([
    { name: 'draft', options: { status: 'drafted' }, expected: { status: 'missing', content: 'non-substantive', pin: 'match', lifecycle: 'draft' } },
    { name: 'unpinned', options: { pin: null }, expected: { status: 'undetermined', content: 'undetermined', pin: 'unpinned', lifecycle: 'unverified' } },
    { name: 'changed-pin', options: { pin: 'a'.repeat(64) }, expected: { status: 'undetermined', content: 'undetermined', pin: 'mismatch', lifecycle: 'unverified' } },
    { name: 'empty', options: { body: '' }, expected: { status: 'undetermined', content: 'undetermined', pin: 'unverifiable', lifecycle: 'unverified' } },
    { name: 'placeholder', options: { body: 'TBD' }, expected: { status: 'missing', content: 'non-substantive', pin: 'match', lifecycle: 'finalized' } },
    { name: 'unknown-pointer', options: { pointer: false }, expected: { status: 'undetermined', content: 'undetermined', pin: 'unverifiable', lifecycle: 'unverified' } },
  ] as const)('keeps the actual $name source content qualification honest', async ({ name, options, expected: { status, content, pin, lifecycle } }) => {
    const f = await h.filing(name, h.programs.private, options);
    const response = await h.manifest(h.actors.member, f).response;
    expect(response.status, JSON.stringify(response.body)).toBe(200); const entry = slot(response.body);
    expect(entry.status).toBe(status); expect(entry.sourceRefs[0].evidence).toMatchObject({ content, pin, lifecycle });
    expect(response.body.ready).toBe(false); expect(entry.status).not.toBe('present');
    if (name === 'unknown-pointer') expect(entry.sourceRefs[0].document).toBeNull();
  });

  it('refuses a same-org source that was moved to a sibling programme before its body query', async () => {
    const f = await h.filing('sibling-source', h.programs.private);
    await h.owner.query('UPDATE c2c_documents SET project_id=$1 WHERE id=$2 AND org_id=$3', [h.programs.public.id, f.documentId, h.organizationId]);
    const probe = h.manifest(h.actors.member, f); const response = await probe.response;
    expect(response.status).toBe(404); expect(response.body.error.code).toBe('SUBMISSION_SOURCE_SCOPE_MISMATCH'); noPane(response.body);
    expect(h.facts.get(probe.key)!.sql.some(sql => sql.includes('SELECT s.id::text AS id,s.section_key,s.content'))).toBe(false);
  });

  it('withholds the combined pane after a real committed source-content change and retains its attributed old version', async () => {
    const f = await h.filing('late-body', h.programs.private);
    const change = changedAfter('SELECT s.id::text AS id,s.section_key,s.content', () => h.changeBody(f));
    const response = await h.manifest(h.actors.member, f, change.afterQuery).response;
    expect(change.wasChanged()).toBe(true); expect(response.status).toBe(503); expect(response.body.error.code).toBe('SUBMISSION_SOURCE_READ_CHANGED'); noPane(response.body);
    const versions = (await h.owner.query('SELECT content,author_id,reason FROM c2c_document_section_versions WHERE section_id=$1', [f.sectionId])).rows;
    expect(versions).toHaveLength(1); expect(versions[0]).toMatchObject({ content: { text: BODY }, author_id: h.actors.owner.id, reason: `${h.tag}: committed late-content native witness` });
  });

  it('withholds already-read content after actual current project membership withdrawal', async () => {
    const program = await h.program('late-permission'); await h.member(program, h.actors.late);
    const f = await h.filing('late-permission', program);
    expect((await h.manifest(h.actors.late, f).response).status).toBe(200);
    const change = changedAfter('SELECT s.id::text AS id,s.section_key,s.content', () => h.owner.query("UPDATE project_members SET status='inactive' WHERE project_id=$1 AND organization_id=$2 AND user_id=$3", [program.projectId, h.organizationId, h.actors.late.id]));
    const response = await h.manifest(h.actors.late, f, change.afterQuery).response;
    expect(change.wasChanged()).toBe(true); expect(response.status).toBe(503); noPane(response.body);
  });

  it.each(['leaf-pin', 'programme-type', 'framework'])('withholds the pane after actual late %s binding facts change', async name => {
    const program = await h.program(`late-${name}`, { visibility: 'org_public' }); const f = await h.filing(`late-${name}`, program);
    const mutations = {
      'leaf-pin': () => h.owner.query("UPDATE submission_leaves SET document_content_sha256=repeat('b',64) WHERE id=$1 AND sequence_id=$2 AND organization_id=$3", [f.leafId, f.sequenceId, h.organizationId]),
      'programme-type': () => h.owner.query("UPDATE regulatory_programs SET program_type='US_NDA' WHERE id=$1 AND organization_id=$2", [program.id, h.organizationId]),
      framework: () => h.owner.query("UPDATE submission_regions SET pathway='ctis' WHERE submission_id=$1 AND organization_id=$2", [f.id, h.organizationId]),
    };
    const change = changedAfter('SELECT s.id::text AS id,s.section_key,s.content', mutations[name as keyof typeof mutations]);
    const response = await h.manifest(h.actors.unassigned, f, change.afterQuery).response;
    expect(change.wasChanged()).toBe(true); expect(response.status).toBe(503); noPane(response.body);
  });

  it('binds native sequence/source admission to the exact held actual executor, even for equivalent current actors', async () => {
    const actor = h.actors.member; const f: Filing = h.filings.private;
    const identity = { organizationId: actor.organizationId, organizationUuid: actor.organizationUuid, userId: actor.id, role: actor.role, caller: 'sdd-native-binding' };
    await withNativeCatalogClient(identity, async q => {
      const admitted = await readSubmissionSequenceForRequest(q, { organizationId: actor.organizationId, userId: actor.id }, f.sequenceId, { expectedProgramId: f.program!.id, expectedSubmissionId: f.id });
      const leaves = await readSubmissionLeavesForRequest(q, admitted);
      const sources = await readSubmissionLeafSourceEvidence(q, { ...admitted, leaves });
      expect(sources.leaves[0].contentEvidence?.content).toBe('substantive');
      await requireSubmissionLeafSourceEvidenceStillCurrent(q, sources.admission);
      await expect(readSubmissionLeavesForRequest(q, { ...admitted })).rejects.toMatchObject({ status: 403, code: 'SUBMISSION_SCOPE_UNVERIFIED' });
      await withNativeCatalogClient(identity, async other => {
        const firstPid = (await q.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const otherPid = (await other.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        expect(firstPid).not.toBe(otherPid);
        let attemptedReads = 0;
        const equivalent = { query: (sql: string, params?: unknown[]) => { attemptedReads += 1; return other.query(sql, params); } };
        await expect(readSubmissionLeavesForRequest(equivalent, admitted)).rejects.toMatchObject({ status: 403, code: 'SUBMISSION_SCOPE_UNVERIFIED' });
        await expect(requireSubmissionLeafSourceEvidenceStillCurrent(equivalent, sources.admission)).rejects.toMatchObject({ status: 503 });
        expect(attemptedReads).toBe(0);
        (h.observations.cases as Record<string, unknown>).nativeBinding = { firstPid, otherPid, attemptedReads, actualSameActorDifferentExecutorsRefused: true };
      });
    });
  });
});

describe('actual repaired anchor and Vault-tenant read boundaries', () => {
  it('withholds the pane after the same programme moves to another actual unique integer anchor', async () => {
    const program=await h.program('late-anchor-transfer',{visibility:'org_public'});
    const filing=await h.filing('late-anchor-transfer',program);const spare=await h.spareAnchor(program);
    expect((await h.manifest(h.actors.unassigned,filing).response).status).toBe(200);
    const sourceBefore=(await h.owner.query('SELECT row_to_json(s) AS image FROM c2c_document_sections s WHERE id=$1 AND document_id=$2',
      [filing.sectionId,filing.documentId])).rows[0].image;
    const versionsBefore=(await h.owner.query('SELECT row_to_json(v) AS image FROM c2c_document_section_versions v WHERE section_id=$1 ORDER BY id',
      [filing.sectionId])).rows;
    const change=changedAfter('SELECT s.id::text AS id,s.section_key,s.content',()=>h.transferAnchor(program,spare));
    const probe=h.manifest(h.actors.unassigned,filing,change.afterQuery);const response=await probe.response;
    expect(change.wasChanged()).toBe(true);expect(response.status).toBe(503);noPane(response.body);
    expect(response.body.error.code).toBe('SUBMISSION_SOURCE_READ_CHANGED');
    const anchors=(await h.owner.query('SELECT id FROM projects WHERE organization_id=$1 AND regulatory_program_id=$2',
      [program.organizationId,program.id])).rows;
    expect(anchors).toEqual([{id:spare}]);
    const retainedOld=(await h.owner.query('SELECT id,regulatory_program_id FROM projects WHERE id=$1 AND organization_id=$2',
      [program.projectId,program.organizationId])).rows;
    expect(retainedOld).toEqual([{id:program.projectId,regulatory_program_id:null}]);
    const sourceAfter=(await h.owner.query('SELECT row_to_json(s) AS image FROM c2c_document_sections s WHERE id=$1 AND document_id=$2',
      [filing.sectionId,filing.documentId])).rows[0].image;
    expect(sourceAfter).toEqual(sourceBefore);
    const versionsAfter=(await h.owner.query('SELECT row_to_json(v) AS image FROM c2c_document_section_versions v WHERE section_id=$1 ORDER BY id',
      [filing.sectionId])).rows;
    expect(versionsAfter).toEqual(versionsBefore);
    (h.observations.cases as Record<string,unknown>).anchorTransfer={programId:program.id,oldProjectId:program.projectId,
      currentProjectId:spare,oldProjectRetained:true,sourceRowUnchanged:true,retainedVersionRows:versionsBefore.length,refusedCode:response.body.error.code};
  });

  it('refuses an actual NULL-tenant genesis Vault placement before metadata or local provider reads', async () => {
    const program=await h.program('null-vault-denial',{visibility:'org_public'});
    const filing=await h.filing('null-vault-denial',program);
    expect((await h.manifest(h.actors.unassigned,filing).response).status).toBe(200);
    const vault=await h.addNullVaultLeaf(filing);
    const probe=h.manifest(h.actors.unassigned,filing);const response=await probe.response;
    expect(response.status).toBe(409);expect(response.body.error.code).toBe('VAULT_TENANT_RECONCILIATION_REQUIRED');noPane(response.body);
    expect(JSON.stringify(response.body)).not.toContain(vault.title);
    const sql=h.facts.get(probe.key)!.sql;
    expect(sql.some(statement=>statement.includes('d.organization_id AS source_org FROM vault.documents'))).toBe(true);
    expect(sql.some(statement=>statement.includes('COALESCE(d.document_title,d.file_name) AS source_label'))).toBe(false);
    const retained=(await h.owner.query('SELECT row_to_json(d) AS image FROM vault.documents d WHERE d.id=$1::uuid',[vault.id])).rows[0].image;
    expect(retained).toEqual(vault.image);
    (h.observations.cases as Record<string,unknown>).nullVaultDenial={documentId:vault.id,organizationId:null,
      genesis:true,recordUnchanged:true,metadataSqlObserved:false,providerPositiveClaim:false,refusedCode:response.body.error.code};
  });
});
