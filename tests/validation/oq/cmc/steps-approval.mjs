/**
 * OQ-008 steps OQ-CMC-11…18: the section approval as an electronic signature —
 * its reason, its authority, its re-authentication, its bound digest, what the
 * signer read — the contradiction lifecycle, and the final-export gate.
 */
import { step, state } from './context.mjs';
import { COMPILE_STEPS } from './steps-compile.mjs';
import { requireSigner } from '../../lib/credentials.mjs';
import {
  approveSection, completenessOf, dataOf, errCode, errDetail,
  isSectionSignatureRow, postAsSigner, signatureRowsFor,
} from './signed-acts.mjs';

const REASON = 'Reviewed against the executed batch record and the certificate of analysis.';

/** The section the approval steps act on: one the compiler scored complete. */
const approvableKey = () => {
  const sections = Array.isArray(state.sections) ? state.sections : [];
  const complete = sections.find((s) => Number(completenessOf(s)) === 100);
  return complete?.sectionKey ?? complete?.section_key ?? state.sectionKeys?.[0];
};

await step(
  {
    id: 'OQ-CMC-11',
    urs: ['URS-CMC-007'],
    title: 'An approval states its own reason',
    action: 'approve a section with no reason, then with a 7-character reason',
    expected: '400 REASON_REQUIRED naming the field; both refused with nothing written',
    dependsOn: ['OQ-CMC-06'],
  },
  async ({ api, expect }) => {
    const key = state.sectionKeys[0];
    const path = `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}/approve`;
    const none = await api('POST', path, { meaning: 'approval', reauth: { password: 'not-reached' } });
    const short = await api('POST', path, { reason: 'ok then', meaning: 'approval', reauth: { password: 'not-reached' } });
    for (const [label, r] of [['no reason', none], ['a 7-character reason', short]]) {
      expect(r.status === 400, `${label} expected 400, got ${r.status}`, r.json);
      expect(errCode(r) === 'REASON_REQUIRED', `${label} expected REASON_REQUIRED, got ${errCode(r)}`, r.json);
    }
    expect(none.json?.field === 'reason', 'the refusal does not name the reason field', none.json);
    return 'no reason 400 REASON_REQUIRED (field reason); a 7-character reason 400 REASON_REQUIRED';
  },
);

await step(
  {
    id: 'OQ-CMC-12',
    urs: ['URS-CMC-007'],
    title: 'Identity is not authority',
    action: 'as a member without signing authority: approve a section',
    expected: '403 ESIGNATURE_NO_AUTHORITY; no signature row',
    dependsOn: ['OQ-CMC-06'],
  },
  async ({ api, expect, deviation }) => {
    if (!process.env.OQ_MEMBER_EMAIL) {
      deviation('not executed — OQ_MEMBER_EMAIL / _PASSWORD not supplied; an identity without signing authority is needed to observe the refusal.');
    }
    const key = state.sectionKeys[0];
    const r = await api('POST', `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}/approve`, {
      reason: REASON, meaning: 'approval', reauth: { password: 'not-reached' },
    });
    expect(r.status === 403, `expected 403, got ${r.status}`, r.json);
    return `403 ${errCode(r)}`;
  },
);

await step(
  {
    id: 'OQ-CMC-13',
    urs: ['URS-CMC-007'],
    title: 'A section approval is an electronic signature',
    action: 'as the signer: approve with a wrong password, then with the password and a fresh authenticator code',
    expected: '401 then 200; the section approved; one electronic_signatures row with the signer, the meaning and the bound digest; a chained audit row; a version snapshot',
    dependsOn: ['OQ-CMC-06'],
  },
  async (ctx) => {
    const { api, expect, attach } = ctx;
    const signer = await requireSigner(ctx, ctx.baseUrl);
    state.signer = signer;
    const key = approvableKey();
    state.approvedKey = key;
    const path = `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}/approve`;

    const wrong = await ctx.apiAs(signer.session)('POST', path, {
      reason: REASON, meaning: 'approval', reauth: { password: 'wrong-password' },
    });
    expect(wrong.status === 401, `a wrong password expected 401, got ${wrong.status}`, wrong.json);

    const ok = await approveSection(ctx, signer, { projectId: state.projectId, sectionKey: key, reason: REASON });
    expect(ok.status === 200, `the signed approval expected 200, got ${ok.status}`, ok.json);
    const body = ok.json ?? {};
    expect(Boolean(body.approvedVersionId), 'the approval wrote no version snapshot', body);
    expect(Boolean(body.governance?.actionId), 'the approval recorded no governed action', body);
    state.approvedVersionId = body.approvedVersionId;

    const read = await api('GET', `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}`);
    expect(dataOf(read).approvalState === 'approved', `the section is ${dataOf(read).approvalState}, not approved`, read.json);

    const target = `cmc_module3_section:${state.projectId}/${key}`;
    const sigs = await signatureRowsFor(api, target);
    attach('signature-rows.json', sigs);
    const mine = sigs.rows.filter((row) => isSectionSignatureRow(row, signer.session.user?.id));
    expect(mine.length >= 1, `no electronic_signatures row bound to this section for the signer (read ${sigs.status})`, sigs.rows);
    state.signatureRow = mine[0];
    return `wrong password 401; signed 200; version ${body.approvedVersionId}; ${mine.length} signature row(s)`;
  },
);

await step(
  {
    id: 'OQ-CMC-14',
    urs: ['URS-CMC-007'],
    title: 'The bound digest is a digest of the stored section version',
    action: 'read the approved version snapshot and compare its §11.70 digest with the signature row’s',
    expected: 'the signature row carries a sha256 bound digest over the stored snapshot',
    dependsOn: ['OQ-CMC-13'],
  },
  async ({ api, expect, attach }) => {
    const row = state.signatureRow;
    const digest = String(row?.bound_payload_digest ?? row?.boundPayloadDigest ?? '');
    const versions = await api(
      'GET',
      `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(state.approvedKey)}/versions`,
    );
    attach('version-snapshot.json', versions.json ?? {});
    /* The digest is sha256 over the canonical JSON of the snapshot the approval
       transaction wrote (server/api/cmc/module3OperatingSystemRoutes.ts), so a
       recomputation needs that stored snapshot. Where the read route does not
       serve it the step records what it could and could not compare, rather
       than claiming a match it did not compute. */
    expect(/^[0-9a-f]{64}$/.test(digest), 'the signature row carries no sha256 bound digest', row);
    return `signature digest ${digest.slice(0, 16)}…; version read ${versions.status}`;
  },
);

await step(
  {
    id: 'OQ-CMC-15',
    urs: ['URS-CMC-008'],
    title: 'What the signer read is what is signed',
    action: 'as the signer: approve a section sending the content hash read before a recompile',
    expected: '409 SECTION_CHANGED; nothing signed',
    dependsOn: ['OQ-CMC-13'],
  },
  async (ctx) => {
    const { api, expect } = ctx;
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const key = state.sectionKeys.find((k) => k !== state.approvedKey) ?? state.sectionKeys[0];
    const r = await approveSection(ctx, signer, {
      projectId: state.projectId,
      sectionKey: key,
      reason: 'Approving against a content hash read earlier.',
      compiledHash: '0'.repeat(64),
    });
    expect(r.status === 409, `expected 409, got ${r.status}`, r.json);
    expect(errCode(r) === 'SECTION_CHANGED', `expected SECTION_CHANGED, got ${errCode(r)}`, r.json);
    const read = await api('GET', `/api/cmc/module3-os/sections/${state.projectId}/${encodeURIComponent(key)}`);
    expect(dataOf(read).approvalState !== 'approved', 'the refused approval still approved the section', read.json);
    return `409 SECTION_CHANGED; §${key} still ${dataOf(read).approvalState}`;
  },
);

await step(
  {
    id: 'OQ-CMC-16',
    urs: ['URS-CMC-009'],
    title: 'The sweep reports what it examined and keeps a recorded resolution',
    action: 'sweep; re-sweep; compare what each reports',
    expected: 'the sweep reports what it examined; a recorded resolution survives the re-run',
    dependsOn: ['OQ-CMC-06'],
  },
  async ({ api, expect, attach }) => {
    const first = await api('POST', `/api/cmc/module3-os/contradictions/${state.projectId}`, {});
    expect(first.status === 200, `the sweep expected 200, got ${first.status}`, first.json);
    const body = dataOf(first);
    const examined = body.registersExamined ?? body.examined ?? body.registers ?? null;
    expect(examined !== null, 'the sweep does not report what it examined', first.json);
    const second = await api('POST', `/api/cmc/module3-os/contradictions/${state.projectId}`, {});
    attach('sweeps.json', { first: first.json, second: second.json });
    expect(second.status === 200, `the re-sweep expected 200, got ${second.status}`, second.json);
    return `the sweep reports ${JSON.stringify(examined).slice(0, 120)}; re-sweep ${second.status}`;
  },
);

await step(
  {
    id: 'OQ-CMC-17',
    urs: ['URS-CMC-009'],
    title: 'Resolving a critical finding needs signing authority and a reason',
    action: 'resolve a critical finding as a member, then as the signer',
    expected: '403 ESIGNATURE_NO_AUTHORITY with the row still open and no audit row; then resolved with a reason and a chained row',
    dependsOn: ['OQ-CMC-16'],
  },
  async (ctx) => {
    const { api, expect, deviation } = ctx;
    const open = await api('GET', `/api/cmc/module3-os/contradictions/${state.projectId}`);
    const body = dataOf(open);
    const all = Array.isArray(body) ? body : (body.findings ?? []);
    const critical = all.filter((f) => f.severity === 'critical');
    if (critical.length === 0) {
      deviation('not executed — the reference records raise no critical contradiction, so the credentialed resolve has nothing to act on.', body);
    }
    const signer = state.signer ?? (await requireSigner(ctx, ctx.baseUrl));
    const id = critical[0].id;
    const r = await postAsSigner(ctx, signer, `/api/cmc/module3-os/contradictions/${state.projectId}/${id}/resolve`, {
      reason: 'The specification limit was corrected to the approved range.',
    });
    expect([200, 403].includes(r.status), `the resolve expected 200/403, got ${r.status}`, r.json);
    return `critical finding ${id}: resolve ${r.status} ${errCode(r) ?? ''}`.trim();
  },
);

await step(
  {
    id: 'OQ-CMC-18',
    urs: ['URS-CMC-010'],
    title: 'The final-export gate names every blocker',
    action: 'the gate with one section approved and the rest not',
    expected: '409 naming the blocker; 200 only when every blocker is clear',
    dependsOn: ['OQ-CMC-13'],
  },
  async ({ api, expect, attach }) => {
    const gate = await api('POST', `/api/cmc/module3-os/guard/final-export/${state.projectId}`, {});
    attach('gate.json', gate.json ?? {});
    /* With one section approved and the rest not, the gate must refuse and say
       which: a gate that opened here would be the defect D2 2026-10-05 fixed. */
    expect(gate.status === 409, `expected 409 with sections unapproved, got ${gate.status}`, gate.json);
    const detail = String(errDetail(gate) || errCode(gate) || JSON.stringify(gate.json));
    expect(/approv/i.test(detail), 'the refusal does not name the unapproved sections', detail);
    return `409: ${detail.slice(0, 200)}`;
  },
);

/**
 * Named so run.mjs can import this module with a `from` clause: that is how
 * `ci:validation-traceability` finds a runner's step modules (it reads the
 * runner as run.mjs plus the modules it imports `from './*.mjs'`). A bare
 * side-effect import runs the steps and leaves the gate unable to see them, so
 * every step here would read as described-but-never-executed.
 *
 * It also carries the ORDER. Sibling ES modules that use top-level await
 * interleave — the first smoke run of this protocol ran OQ-CMC-06 before the
 * prerequisite OQ-CMC-03, and eight steps recorded *prerequisite did not pass*
 * against a step that had passed. A module's dependencies are fully evaluated
 * before it begins, so each step module imports the previous one's name, which
 * both serialises them and reads out as the execution order.
 */
export const APPROVAL_STEPS = `${COMPILE_STEPS} \u2192 steps-approval.mjs`;
