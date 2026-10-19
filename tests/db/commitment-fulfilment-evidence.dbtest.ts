/**
 * A commitment's fulfilment names what met it (rows D2 and D5, 2026-10-19;
 * decision P-40, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * ── The gap this pins (trunk at ae287394) ────────────────────────────────────
 * Recording a PMR, PMC or REMS as fulfilled took a date and a reason, from any
 * editor, with no signature: the obligation left the overdue register and the
 * annual status report on a sentence. Nothing recorded which submission or
 * document met it, so "Final study report submitted in sequence 0042" was a
 * string nobody could check.
 *
 * ── What is held, and where ──────────────────────────────────────────────────
 *   - A PMR, PMC or REMS is recorded fulfilled only by a Part 11 signature
 *     (the one ceremony, governed-signed-act.ts) that names a dispatched
 *     sequence the agency received (sent or acknowledged) or a Vault version,
 *     with its sha256, and the date. Every refusal the server can give without
 *     a password is given before one is asked for.
 *   - The database holds it: a fulfilled PMR/PMC/REMS commits only with a live
 *     signature written in the same transaction, by the recorder, meaning
 *     approval or responsibility, whose manifest names the same evidence and
 *     date. A recorded fulfilment cannot be changed afterwards.
 *   - A meeting commitment or other is a governed write with a reason.
 *   - The organisation's register shows evidence in a project the reader
 *     cannot open as "a project you cannot open", and carries no id of it.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * Everything but the per-signer attempt limiter (its own suite; a pass-through
 * here): the Communication Center router and the organisation's register with
 * their own chains (signed access token, tenant context, project admission),
 * the runtime role through APP_DATABASE_URL with RLS enforcing, reverifySigner
 * with bcrypt, the ledger pair, the electronic_signatures writer and its
 * content binder, and the migration's triggers.
 *
 * ── This file and its sibling ───────────────────────────────────────────────
 * This file holds the routes: what can be named, what is refused before a
 * password, the signed and the unsigned fulfilment, and what each reader is
 * shown. tests/db/commitment-fulfilment-database.dbtest.ts holds what the
 * database refuses whatever the route, and the purge. Both use
 * tests/db/commitment-fulfilment-fixture.ts.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Each file creates its own organizations, users, programs and projects
 * (`dbcf-<label>-<uuid>`). Signatures and ledger rows are permanent by design.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { commitmentFulfilmentDigest } from '../../server/services/ha-interactions/ha-logic';
import { FILED_DISPATCH_STATUSES } from '../../server/services/submission-service/filed-dispatch';
import {
  ORG, PREFIX, app, as, failedAttempts, fulfilUrl, hashes, optionsUrl, orgCommitment, owner, orgId, foreignOrgId, project,
  program, projectBase, projectCommitment, regulatoryProgram, seq, setupFixture, signaturesOn, signedBody, stateOf, sub,
  submission, teardownFixture, users, vault,
} from './commitment-fulfilment-fixture';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

/** The project PMR the first two describes name evidence for and sign. */
let cid: number;

beforeAll(() => setupFixture('routes'), 120_000);
afterAll(() => teardownFixture());

describe('the record a fulfilment is made on', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('commitment-fulfilment-evidence.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls, current_user AS who FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('the filed rule is the platform one: sent and acknowledged', () => {
    expect([...FILED_DISPATCH_STATUSES]).toEqual(['sent', 'acknowledged']);
  });
});

describe('a project PMR: what can be named, and what is refused before a password', () => {
  beforeAll(async () => {
    cid = await projectCommitment(project.X, 'pmr', 'Pediatric study under PREA');
  });

  it("offers only this project's sequences the agency received, and this project's Vault", async () => {
    const res = await request(app).get(optionsUrl(project.X, cid)).set(as('signer'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    expect(d.rule).toMatchObject({ signatureRequired: true, evidenceRequired: true, dateRequired: true, meanings: ['approval', 'responsibility'] });
    expect(d.projectLinked).toBe(true);
    expect(d.sequences.map((s: { id: number }) => s.id).sort()).toEqual([seq.ok, seq.ack].sort());
    expect(d.sequences.find((s: { id: number }) => s.id === seq.ok)).toMatchObject({ sequenceNumber: '0042', dispatchStatus: 'sent', submission: { id: sub.P } });
    expect(d.sequencesTruncated).toBe(false);
    expect(d.vault).toEqual({ programId: program.P });
    expect(d.viewer).toMatchObject({ canWrite: true, canSign: true });
  });

  it('a viewer reads the options as unable to write or sign', async () => {
    const res = await request(app).get(optionsUrl(project.X, cid)).set(as('viewer'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.viewer).toMatchObject({ canWrite: false, canSign: false });
  });

  it('a PMR that names nothing is refused before the password, which is never checked', async () => {
    const before = await failedAttempts('prober');
    const res = await request(app).post(fulfilUrl(project.X, cid)).set(as('prober')).send(signedBody(undefined, { password: 'wrong-password' }));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe('EVIDENCE_REQUIRED');
    expect(await failedAttempts('prober')).toBe(before);
    expect((await stateOf(cid)).status).toBe('open');
  });

  it('a PMR with no date is refused before the password: the server never chooses the signed date', async () => {
    const before = await failedAttempts('prober');
    const res = await request(app).post(fulfilUrl(project.X, cid)).set(as('prober'))
      .send(signedBody({ sequenceId: seq.ok }, { fulfilledDate: undefined, password: 'wrong-password' }));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe('FULFILMENT_DATE_REQUIRED');
    expect(await failedAttempts('prober')).toBe(before);
  });

  it('evidence but no password is a missing signature component', async () => {
    const res = await request(app).post(fulfilUrl(project.X, cid)).set(as('signer')).send(signedBody({ sequenceId: seq.ok }, { password: undefined }));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe('ESIGNATURE_COMPONENT_MISSING');
  });

  it.each([
    ['a sequence still pending transmit', () => ({ sequenceId: seq.pending }), 409, 'SEQUENCE_NOT_FILED'],
    ['a sequence the agency rejected', () => ({ sequenceId: seq.rejected }), 409, 'SEQUENCE_NOT_FILED'],
    ['a frozen sequence never dispatched', () => ({ sequenceId: seq.frozen }), 409, 'SEQUENCE_NOT_FILED'],
    ["another project's sequence", () => ({ sequenceId: seq.q }), 404, 'SEQUENCE_NOT_FOUND'],
    ["another organisation's sequence", () => ({ sequenceId: seq.foreign }), 404, 'SEQUENCE_NOT_FOUND'],
    ["another project's Vault version", () => ({ vaultDocumentId: vault.Q }), 404, 'VAULT_VERSION_NOT_FOUND'],
    ["another organisation's Vault version", () => ({ vaultDocumentId: vault.B }), 404, 'VAULT_VERSION_NOT_FOUND'],
    ['a version that does not exist', () => ({ vaultDocumentId: randomUUID() }), 404, 'VAULT_VERSION_NOT_FOUND'],
    ['a version whose data was withdrawn', () => ({ vaultDocumentId: vault.withdrawn }), 409, 'VAULT_VERSION_WITHDRAWN'],
  ] as const)('refuses %s, before the password, and records nothing', async (_label, evidence, status, code) => {
    const before = await failedAttempts('prober');
    const res = await request(app).post(fulfilUrl(project.X, cid)).set(as('prober')).send(signedBody(evidence(), { password: 'wrong-password' }));
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(await failedAttempts('prober'), 'a refused fulfilment spent a password attempt').toBe(before);
    expect((await stateOf(cid)).status).toBe('open');
    expect(await signaturesOn(cid)).toEqual([]);
  });

  it('a viewer cannot fulfil it at either door', async () => {
    for (const url of [fulfilUrl(project.X, cid), fulfilUrl('org', cid)]) {
      const res = await request(app).post(url).set(as('viewer')).send(signedBody({ sequenceId: seq.ok }));
      expect(res.status, url).toBe(403);
    }
    expect((await stateOf(cid)).status).toBe('open');
  });

});

describe('a project PMR, signed', () => {
  it('signs: the row names the sequence and the version with its sha256, and the signature binds them', async () => {
    const res = await request(app).post(fulfilUrl(project.X, cid)).set(as('signer'))
      .send(signedBody({ sequenceId: seq.ok, vaultDocumentId: vault.P }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ success: true, meaning: 'responsibility', data: { id: cid, status: 'fulfilled', fulfilledDate: '2026-10-01', signed: true } });
    expect(typeof res.body.signatureId).toBe('number');
    expect(typeof res.body.actionId).toBe('string');

    const row = await stateOf(cid);
    expect(row).toMatchObject({ status: 'fulfilled', fulfilled_date: '2026-10-01', fulfilment_sequence_id: seq.ok, vault: vault.P, sha: hashes[vault.P], recorded_by: users.signer.id, recorded: true });

    const sigs = await signaturesOn(cid);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ id: res.body.signatureId, signer_id: users.signer.id, signature_type: 'governed-action', signature_meaning: 'responsibility', binding_basis: 'commitment-fulfilment-content-sha256' });
    const c = (await owner.query(`SELECT commitment_type, description, regulatory_basis, to_char(due_date, 'YYYY-MM-DD') AS due FROM regulatory_commitments WHERE id = $1`, [cid])).rows[0];
    expect(sigs[0].bound_payload_digest).toBe(commitmentFulfilmentDigest({
      commitmentId: cid, commitmentType: c.commitment_type, description: c.description, regulatoryBasis: c.regulatory_basis,
      dueDate: c.due, fulfilledDate: '2026-10-01', sequenceId: seq.ok, sequenceNumber: '0042', submissionId: sub.P,
      vaultDocumentId: vault.P, vaultSha256: hashes[vault.P],
    }));
    expect(sigs[0].manifest.act).toMatchObject({ fulfilledDate: '2026-10-01', sequenceId: seq.ok, vaultDocumentId: vault.P, vaultSha256: hashes[vault.P] });

    const ledger = await owner.query(`SELECT command FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 ORDER BY proposed_at`, [orgId, `regulatory-commitment:${cid}`]);
    expect(ledger.rows.map((r) => r.command)).toEqual(['create', 'sign']);
  });

  it('the list names what met it, who signed, and that the signature matches the record', async () => {
    const res = await request(app).get(`${projectBase(project.X)}/commitments`).set(as('viewer'));
    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
    const row = res.body.data.commitments.find((c: { id: number }) => c.id === cid);
    expect(row.fulfilment).toMatchObject({
      state: 'signed',
      recordedBy: { id: users.signer.id, name: 'Fulfil Signer' },
      sequence: { readable: true, id: seq.ok, sequenceNumber: '0042', dispatchStatus: 'sent', filed: true, submissionId: sub.P },
      vaultVersion: { readable: true, id: vault.P, title: 'Final CSR', version: '2.0', sha256: hashes[vault.P], superseded: false, removed: false },
      signature: { signerName: 'Fulfil Signer', meaning: 'responsibility', bindsRecord: true },
    });
    // An explicit allow-list: no raw column of the row reaches the reader.
    expect(Object.keys(row).filter((k) => k.startsWith('fulfilment_'))).toEqual([]);
  });

  it('a second fulfilment is refused', async () => {
    const res = await request(app).post(fulfilUrl(project.X, cid)).set(as('signer')).send(signedBody({ sequenceId: seq.ack }));
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
    expect(await signaturesOn(cid)).toHaveLength(1);
  });

});

describe('a project with no program', () => {
  /* Project admission (communication-center.ts router.param) admits only a
     project anchored to a program, so a project with none is refused at the
     door, before the fulfilment's own PROJECT_NOT_LINKED (which stays as the
     service's answer if a link is gone between admission and the read). */
  it('is refused at the project door, and nothing about the commitment changes', async () => {
    const cid = Number((await owner.query(
      `INSERT INTO regulatory_commitments (organization_id, commitment_type, description, status, created_by, project_id)
       VALUES ($1, 'pmc', 'PMC in an unlinked project', 'open', $2, $3) RETURNING id`,
      [orgId, users.signer.id, project.Z],
    )).rows[0].id);
    const opts = await request(app).get(optionsUrl(project.Z, cid)).set(as('signer'));
    expect(opts.status, JSON.stringify(opts.body)).toBe(404);
    const res = await request(app).post(fulfilUrl(project.Z, cid)).set(as('signer')).send(signedBody({ sequenceId: seq.ok }));
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect((await stateOf(cid)).status).toBe('open');
  });
});

describe('a meeting commitment is a governed write with a reason', () => {
  it('fulfils unsigned, naming a sequence, with a resolve ledger row', async () => {
    const cid = await orgCommitment('meeting_commitment', 'Send the briefing package');
    const res = await request(app).post(fulfilUrl('org', cid)).set(as('signer'))
      .send({ fulfilledDate: '2026-10-02', reason: 'Briefing package sent in sequence 0042.', evidence: { sequenceId: seq.ok } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { id: cid, status: 'fulfilled', signed: false } });
    expect(res.body.signatureId).toBeUndefined();
    expect(await stateOf(cid)).toMatchObject({ status: 'fulfilled', fulfilment_sequence_id: seq.ok, recorded_by: users.signer.id });
    const ledger = await owner.query(`SELECT command FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 ORDER BY proposed_at`, [orgId, `regulatory-commitment:${cid}`]);
    expect(ledger.rows.map((r) => r.command)).toEqual(['create', 'resolve']);
    expect(await signaturesOn(cid)).toEqual([]);
  });

  it('refuses a password: it takes none', async () => {
    const cid = await orgCommitment('meeting_commitment', 'Password probe');
    const res = await request(app).post(fulfilUrl('org', cid)).set(as('signer')).send(signedBody(undefined));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe('SIGNATURE_NOT_TAKEN');
    expect((await stateOf(cid)).status).toBe('open');
  });
});

describe("the organisation's register and a program the reader cannot open", () => {
  let cid: number;
  beforeAll(async () => {
    cid = await orgCommitment('pmr', 'Organisation PMR met in a private program');
  });

  it("offers a member only the sequences of programs they can open; the signer, who can open Q, is offered its sequence too", async () => {
    const theirs = await request(app).get(optionsUrl('org', cid)).set(as('member'));
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    const ids = theirs.body.data.sequences.map((s: { id: number }) => s.id);
    expect(ids).toEqual(expect.arrayContaining([seq.ok, seq.ack]));
    expect(ids).not.toContain(seq.q);
    for (const leak of ['0917', 'hidden-IND']) expect(JSON.stringify(theirs.body), `leaked ${leak}`).not.toContain(leak);
    expect(theirs.body.data.commitment.submission).toBeNull();

    const mine = await request(app).get(optionsUrl('org', cid)).set(as('signer'));
    expect(mine.status).toBe(200);
    expect(mine.body.data.sequences.map((s: { id: number }) => s.id)).toEqual(expect.arrayContaining([seq.ok, seq.ack, seq.q]));
  });

  it("a commitment made under a submission is offered only that submission's sequences, and names it to a reader who can open it", async () => {
    const made = async (submissionId: number, description: string) => {
      const res = await request(app).post(ORG).set(as('signer')).send({ commitmentType: 'pmr', description, submissionId, reason: 'Recording the commitment for the dbtest.' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return Number(res.body.id);
    };
    const underP = await made(sub.P, 'PMR made under IND 123456');
    const res = await request(app).get(optionsUrl('org', underP)).set(as('member'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.commitment.submission).toEqual({ readable: true, id: sub.P, title: `${PREFIX} IND 123456` });
    expect(res.body.data.sequences.map((s: { id: number }) => s.id).sort()).toEqual([seq.ok, seq.ack].sort());

    const underQ = await made(sub.Q, 'PMR made under the private IND');
    const hidden = await request(app).get(optionsUrl('org', underQ)).set(as('member'));
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(200);
    expect(hidden.body.data.commitment.submission).toEqual({ readable: false });
    expect(hidden.body.data.sequences).toEqual([]);
    for (const leak of ['0917', 'hidden-IND', `"id":${sub.Q}`]) expect(JSON.stringify(hidden.body), `leaked ${leak}`).not.toContain(leak);
    const named = await request(app).get(optionsUrl('org', underQ)).set(as('signer'));
    expect(named.body.data.commitment.submission).toMatchObject({ readable: true, id: sub.Q });
    expect(named.body.data.sequences.map((s: { id: number }) => s.id)).toEqual([seq.q]);
  });

  it("a member who cannot open program Q cannot name its sequence: 404, nothing about it said", async () => {
    const res = await request(app).post(fulfilUrl('org', cid)).set(as('member')).send(signedBody({ sequenceId: seq.q }));
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.error.code).toBe('SEQUENCE_NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('0917');
  });

  it("the signer, who can open it, signs; the member's list says only that it is in a project they cannot open", async () => {
    const signed = await request(app).post(fulfilUrl('org', cid)).set(as('signer')).send(signedBody({ sequenceId: seq.q, vaultDocumentId: vault.Q }));
    expect(signed.status, JSON.stringify(signed.body)).toBe(201);

    const mine = await request(app).get(ORG).set(as('signer'));
    expect(mine.status).toBe(200);
    expect(mine.body.commitments.find((c: { id: number }) => c.id === cid).fulfilment).toMatchObject({
      state: 'signed', sequence: { readable: true, sequenceNumber: '0917' }, vaultVersion: { readable: true, title: 'Hidden protocol' },
    });

    const theirs = await request(app).get(ORG).set(as('member'));
    expect(theirs.status, JSON.stringify(theirs.body).slice(0, 300)).toBe(200);
    const row = theirs.body.commitments.find((c: { id: number }) => c.id === cid);
    expect(row.fulfilment.sequence).toEqual({ readable: false });
    expect(row.fulfilment.vaultVersion).toEqual({ readable: false });
    const text = JSON.stringify(row);
    for (const leak of ['0917', 'hidden-IND', 'Hidden protocol', vault.Q, hashes[vault.Q], `"${seq.q}"`, `:${seq.q},`]) {
      expect(text, `leaked ${leak}`).not.toContain(leak);
    }
  });
});

describe('tenant isolation', () => {
  it("another organisation's admin reaches neither the options nor the fulfilment", async () => {
    const cid = await orgCommitment('pmr', 'Isolation probe');
    expect((await request(app).get(optionsUrl('org', cid)).set(as('foreign'))).status).toBe(404);
    const res = await request(app).post(fulfilUrl('org', cid)).set(as('foreign')).send(signedBody({ sequenceId: seq.foreign }));
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    const proj = await request(app).get(`${projectBase(project.X)}/commitments`).set(as('foreign'));
    expect([403, 404]).toContain(proj.status);
  });

  it('under RLS, the runtime role in another tenant scope reads none of these rows', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const seen = await runWithTenantScope(
      { tenantId: String(foreignOrgId), role: 'admin', source: 'request', caller: 'commitment-fulfilment-evidence.dbtest' },
      () => getPool().query(`SELECT count(*)::int AS n FROM regulatory_commitments WHERE organization_id = $1`, [orgId]),
    );
    expect(seen.rows[0].n).toBe(0);
  });
});

describe('more than 200 sequences the agency received: the list keeps the most recent', () => {
  /* A program with an older submission holding 230 filed sequences and a newer
     one holding 3. Cut to 200, the list keeps the newest recorded sequences,
     so the newer submission's are all offered, and says it was cut. (It used
     to order by submission id ascending, keeping the oldest submission's.) */
  let programR: string;
  let projectW: number;
  let older: number[];
  let newer: number[];
  beforeAll(async () => {
    programR = await regulatoryProgram(orgId, 'R');
    // In project X's client workspace: project admission reads the project in the request's workspace.
    const ws = (await owner.query('SELECT client_workspace_id FROM projects WHERE id = $1', [project.X])).rows[0].client_workspace_id;
    projectW = Number((await owner.query(
      `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, regulatory_program_id, settings)
       VALUES ($1, $2, $3, 'regulatory', 'active', $4, $4, $5, '{}'::jsonb) RETURNING id`,
      [orgId, ws, `${PREFIX}-W`, users.signer.id, programR],
    )).rows[0].id);
    const oldSub = await submission(orgId, 'old IND 111111', programR, users.signer.id);
    const newSub = await submission(orgId, 'new NDA 222222', programR, users.signer.id);
    older = (await owner.query(
      `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, dispatch_status, organization_id, created_by)
       SELECT $1, 'fda', lpad(g::text, 4, '0'), 'dispatched', 'acknowledged', $2, $3 FROM generate_series(1, 230) g ORDER BY g
       RETURNING id`,
      [oldSub, orgId, users.signer.id],
    )).rows.map((r) => Number(r.id)).sort((a, b) => a - b);
    newer = (await owner.query(
      `INSERT INTO ectd_sequences (submission_id, region, sequence_number, status, dispatch_status, organization_id, created_by)
       SELECT $1, 'fda', lpad(g::text, 4, '0'), 'dispatched', 'sent', $2, $3 FROM generate_series(1, 3) g ORDER BY g
       RETURNING id`,
      [newSub, orgId, users.signer.id],
    )).rows.map((r) => Number(r.id)).sort((a, b) => a - b);
  }, 60_000);

  it("on a project's door: the newer submission's sequences are offered, newest first, and the oldest are the ones cut", async () => {
    const cid = await projectCommitment(projectW, 'pmr', 'PMR met by the newest NDA sequence');
    const res = await request(app).get(optionsUrl(projectW, cid)).set(as('signer'));
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const ids: number[] = res.body.data.sequences.map((s: { id: number }) => s.id);
    expect(res.body.data.sequencesTruncated).toBe(true);
    expect(ids).toHaveLength(200);
    expect(ids, 'the newest submission was cut from the list').toEqual(expect.arrayContaining(newer));
    expect(ids[0]).toBe(newer[newer.length - 1]);
    expect(ids).not.toContain(older[0]);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it("on the organisation's door, with no submission: the same, across every program the person can open", async () => {
    const cid = await orgCommitment('pmr', 'Organisation PMR met by the newest NDA sequence');
    const res = await request(app).get(optionsUrl('org', cid)).set(as('signer'));
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const ids: number[] = res.body.data.sequences.map((s: { id: number }) => s.id);
    expect(res.body.data.sequencesTruncated).toBe(true);
    expect(ids, 'the newest submission was cut from the list').toEqual(expect.arrayContaining(newer));
    expect(ids).not.toContain(older[0]);
  });
});
