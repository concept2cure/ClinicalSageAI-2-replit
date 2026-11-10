// The CSR study's open IND (P-115 item 4), split out of walk-prepare.cjs. A CSR goes to an open IND: the study's IND
// number and its sponsor (D-U-N-S, FDA contact) are recorded through the routes Submission Center's applicant identity
// uses (IndApplicantIdentity.tsx), so the package identity a compile, an export or an inspection copy reads is complete.
// Without them Dispatch → "Download an inspection copy" answered 409 PACKAGE_IDENTITY_MISSING (the Codespace
// click-through, 2026-11-06). Found or recorded, never replaced.
const { PEOPLE, state, api, expect } = require('./walk-common.cjs');

/** Clearly fictional: a 999… IND and D-U-N-S, a 555-01xx telephone number, and a sponsor named as a demo. */
const FICTIONAL_IND = '999901';
const FICTIONAL_SPONSOR = {
  name: 'Concept2Cure Therapeutics (fictional demo sponsor)', duns: '999999901',
  contactName: 'Ana Author', contactPhone: '+1 555 0100', contactEmail: 'ana.author@concept2cure.pro',
  signatoryName: 'Ana Author', signatoryTitle: 'Head of Regulatory Affairs (fictional)',
};
const unwrap = (res) => (res.body && res.body.data !== undefined ? res.body.data : res.body);
const brief = (res) => `${res.status} ${JSON.stringify(res.body).slice(0, 160)}`;

async function readFacts(page) {
  const forms = await api(page, 'GET', `/api/ind-forms?projectIdent=${state.data.programId}`);
  const program = (unwrap(forms) || {}).program;
  expect(forms.status === 200 && program && program.factsVersion, `the project's IND facts are read (got ${forms.status})`);
  return program;
}

async function fictionalSponsor(page) {
  const listed = unwrap(await api(page, 'GET', '/api/ind-master-data/sponsors'));
  const found = (Array.isArray(listed) ? listed : []).find((row) => row.name === FICTIONAL_SPONSOR.name);
  if (found) return found;
  const made = await api(page, 'POST', '/api/ind-master-data/sponsors',
    { ...FICTIONAL_SPONSOR, reason: 'Demo: the fictional sponsor of the CDISC pilot study, for its open IND.' });
  const sponsor = unwrap(made);
  expect(made.status === 201 && sponsor && sponsor.id, `the fictional sponsor is recorded (got ${brief(made)})`);
  return sponsor;
}

async function bindIdentity(page, program, sponsor) {
  const put = await api(page, 'PUT', '/api/ind-forms/program-facts', {
    projectIdent: state.data.programId, expectedFactsVersion: program.factsVersion,
    reason: 'Demo: the CDISC pilot study is an open IND (fictional number) of the fictional sponsor.',
    applicationNumber: FICTIONAL_IND, applicantSponsorId: sponsor.id, sponsorAddress: '1 Fictional Way, Demo City, CA 00000, USA',
  });
  const facts = unwrap(put) || {};
  expect(put.status === 200 && facts.applicationNumber === FICTIONAL_IND && facts.applicantSponsorId === sponsor.id,
    `the IND number and sponsor are bound to the project (got ${brief(put)})`);
}

async function prepareIdentity() {
  const page = PEOPLE.author.page;
  const program = await readFacts(page);
  if (program.applicationNumber && program.applicantSponsorId) {
    return { outcome: 'skipped', applicationNumber: program.applicationNumber, sponsor: program.sponsorName || null };
  }
  const sponsor = await fictionalSponsor(page);
  await bindIdentity(page, program, sponsor);
  return { outcome: 'pass', applicationNumber: FICTIONAL_IND, sponsor: sponsor.name };
}

module.exports = { prepareIdentity, FICTIONAL_IND, FICTIONAL_SPONSOR };
