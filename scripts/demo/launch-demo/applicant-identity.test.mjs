// A demo project with a sequence must record who files it: without an application number and a bound sponsor
// (D-U-N-S, FDA contact), Submission Center → Dispatch → "Download an inspection copy" answers 409
// PACKAGE_IDENTITY_MISSING. Found on the Lumen account's LMN-201, where "Demo access" lands (2026-11-10). The packs
// record a clearly fictional identity through the routes Submission Center's applicant identity uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureApplicantIdentity } from './packs/biotech-shared.mjs';

const IDENTITY = {
  applicationNumber: '194021', sponsorAddress: '1 Fictional Way, Demo City, WA 00000, USA',
  sponsor: { name: 'Demo sponsor (fictional)', duns: '999999902', contactName: 'Demo Contact', contactPhone: '+1 555 0101',
    contactEmail: 'regulatory@lumen-demo.example', signatoryName: 'Demo Contact', signatoryTitle: 'Head of Regulatory Affairs (fictional)' },
};

function stand({ program = {}, sponsors = [] } = {}) {
  const state = { program: { factsVersion: 'v1', applicationNumber: null, applicantSponsorId: null, ...program }, sponsors: [...sponsors], writes: [] };
  const api = async (method, path, body) => {
    if (method === 'GET' && path.startsWith('/api/ind-forms?projectIdent=')) return { status: 200, json: { program: state.program } };
    if (method === 'GET' && path === '/api/ind-master-data/sponsors') return { status: 200, json: state.sponsors };
    if (method === 'POST' && path === '/api/ind-master-data/sponsors') {
      state.writes.push(['sponsor', body]);
      const row = { id: `sponsor-${state.sponsors.length + 1}`, ...body }; state.sponsors.push(row);
      return { status: 201, json: row };
    }
    if (method === 'PUT' && path === '/api/ind-forms/program-facts') {
      state.writes.push(['facts', body]);
      if (body.expectedFactsVersion !== state.program.factsVersion) return { status: 409, text: 'PROGRAM_FACTS_CONFLICT' };
      Object.assign(state.program, { applicationNumber: body.applicationNumber, applicantSponsorId: body.applicantSponsorId, factsVersion: 'v2' });
      return { status: 200, json: { ...state.program } };
    }
    return { status: 404, text: 'not in the stand-in' };
  };
  const tally = { found: [], created: [] };
  const ctx = { api, run: { step: async (_title, fn) => fn() }, tally: { found: (k) => tally.found.push(k), created: (k) => tally.created.push(k) } };
  return { ctx, state, tally };
}

test('records the sponsor and binds it with the application number, each with a reason', async () => {
  const { ctx, state, tally } = stand();
  await ensureApplicantIdentity(ctx, { id: 'program-1', label: 'LMN-201' }, IDENTITY);
  assert.deepEqual(state.writes.map(([kind]) => kind), ['sponsor', 'facts']);
  const [, sponsor] = state.writes[0]; const [, facts] = state.writes[1];
  assert.equal(sponsor.duns, '999999902');
  assert.ok(sponsor.reason.length >= 8 && facts.reason.length >= 8);
  assert.deepEqual({ projectIdent: facts.projectIdent, expectedFactsVersion: facts.expectedFactsVersion, applicationNumber: facts.applicationNumber, applicantSponsorId: facts.applicantSponsorId },
    { projectIdent: 'program-1', expectedFactsVersion: 'v1', applicationNumber: '194021', applicantSponsorId: 'sponsor-1' });
  assert.deepEqual(tally.created, ['applicant-identity']);
});

test('a project that already records both is found, and nothing is written', async () => {
  const { ctx, state, tally } = stand({ program: { applicationNumber: '123456', applicantSponsorId: 'sponsor-9' } });
  await ensureApplicantIdentity(ctx, { id: 'program-1', label: 'LMN-201' }, IDENTITY);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(tally.found, ['applicant-identity']);
});

test('an existing sponsor of the same name is bound, not recorded twice', async () => {
  const { ctx, state } = stand({ sponsors: [{ id: 'sponsor-7', name: 'Demo sponsor (fictional)' }] });
  await ensureApplicantIdentity(ctx, { id: 'program-1', label: 'LMN-201' }, IDENTITY);
  assert.deepEqual(state.writes.map(([kind]) => kind), ['facts']);
  assert.equal(state.writes[0][1].applicantSponsorId, 'sponsor-7');
});
