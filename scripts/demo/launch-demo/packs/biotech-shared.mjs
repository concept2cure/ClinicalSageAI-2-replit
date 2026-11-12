/**
 * launch-demo/packs/biotech-shared.mjs — helpers shared by the biotech pack's
 * modules (idempotency tally, response-shape readers, signer constants).
 */
import fs from 'node:fs';
import path from 'node:path';
import { MANIFEST_ROOT, must } from '../lib.mjs';
import { PACK } from './biotech-content.mjs';

export const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unwrapData = (json) => (json && json.data !== undefined ? json.data : json);

/**
 * Who files the project: its agency application number and its bound sponsor (D-U-N-S, FDA contact), recorded through
 * the routes Submission Center's applicant identity uses (IndApplicantIdentity.tsx: POST /api/ind-master-data/sponsors,
 * PUT /api/ind-forms/program-facts), each with a reason. Without them a project with a sequence answered 409
 * PACKAGE_IDENTITY_MISSING to "Download an inspection copy" (found on the Lumen account's LMN-201, 2026-11-10).
 * A project that records both is found and left as it is; a sponsor of the same name is bound, never recorded twice.
 * `identity` is the pack's own, clearly fictional: { applicationNumber, sponsorAddress, sponsor: { name, duns, … } }.
 */
export async function ensureApplicantIdentity({ api, run, tally }, program, identity) {
  return run.step(`Applicant identity: ${program.label}'s application number and sponsor (fictional)`, async () => {
    const facts = unwrapData(must(await api('GET', `/api/ind-forms?projectIdent=${program.id}`), 200, `read ${program.label} facts`)).program;
    if (!facts?.factsVersion) throw new Error(`read ${program.label} facts: no factsVersion in the answer`);
    if (facts.applicationNumber && facts.applicantSponsorId) {
      tally.found('applicant-identity');
      return `already recorded (${facts.applicationNumber})`;
    }
    const listed = unwrapData(must(await api('GET', '/api/ind-master-data/sponsors'), 200, 'list sponsors'));
    let sponsor = (Array.isArray(listed) ? listed : []).find((row) => row.name === identity.sponsor.name) ?? null;
    if (!sponsor) {
      sponsor = unwrapData(must(await api('POST', '/api/ind-master-data/sponsors',
        { ...identity.sponsor, reason: `Demo: the fictional sponsor that files ${program.label}.` }), 201, 'record sponsor'));
    }
    if (!sponsor?.id) throw new Error(`record sponsor for ${program.label}: no id in the answer`);
    const bound = unwrapData(must(await api('PUT', '/api/ind-forms/program-facts', {
      projectIdent: program.id, expectedFactsVersion: facts.factsVersion,
      reason: `Demo: ${program.label}'s application number (fictional) and its sponsor.`,
      applicationNumber: identity.applicationNumber, applicantSponsorId: sponsor.id, sponsorAddress: identity.sponsorAddress,
    }), 200, `bind ${program.label} identity`));
    if (bound.applicationNumber !== identity.applicationNumber || bound.applicantSponsorId !== sponsor.id) {
      throw new Error(`bind ${program.label} identity: the answer does not carry the recorded facts`);
    }
    tally.created('applicant-identity');
    return `application ${identity.applicationNumber}, sponsor ${sponsor.name}`;
  });
}

/** Document statuses the server neither edits nor sends for review (server/services/authoring/authoring-permissions.ts
 *  IMMUTABLE_DOCUMENT_STATUSES). A document a previous run left in one is past review: a re-run finds it. */
const PAST_REVIEW = new Set(['APPROVED', 'FROZEN', 'LOCKED', 'SUBMITTED', 'EFFECTIVE', 'SUPERSEDED', 'OBSOLETE', 'ARCHIVED']);
export const pastReview = (status) => PAST_REVIEW.has(String(status ?? '').trim().toUpperCase());

export const NOT_EXECUTED_NO_SIGNER = 'not executed — signer credential not supplied (OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD)';

/** The array a list route answered with, whatever key it used. */
export const asArray = (j, ...keys) => {
  if (Array.isArray(j)) return j;
  for (const k of keys) if (Array.isArray(j?.[k])) return j[k];
  return [];
};

/** Read the previous manifest, if any, so ephemeral records (orchestration executions) are not re-run. */
export function previousManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(MANIFEST_ROOT, PACK, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Counters for the second-run proof: what this run created vs found already present. */
export function makeTally(run) {
  const tally = { created: {}, found: {} };
  run.record('tally', tally);
  return {
    created(kind) {
      tally.created[kind] = (tally.created[kind] ?? 0) + 1;
    },
    found(kind) {
      tally.found[kind] = (tally.found[kind] ?? 0) + 1;
    },
    tally,
  };
}
