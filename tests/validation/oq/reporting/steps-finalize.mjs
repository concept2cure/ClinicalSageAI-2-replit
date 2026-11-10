/**
 * OQ-007 steps OQ-RPT-08…12: the finalize as an electronic signature, the seal it leaves, the seal's verification,
 * the recorded export and the reporting library's reads.
 */
import { step, state } from './context.mjs';
import {
  errCode, fetchBytes, finalizeAnswerProblems, finalizePath, isFinalizeRow, isHex64, reauthOf, runReauth, runRequest,
  sealOf, sealProblems, signatureRows,
} from './signed-acts.mjs';
import { requireIdentity, requireSigner } from '../../lib/credentials.mjs';
import { ACCESS_STEPS } from './steps-access.mjs';

const REASON = 'OQ-007: the report was read against the register it is drawn from.';

/** The refusals a finalize gives before anything is signed, each with the code the ceremony commits to. */
async function refusedFinalizes(ctx, signer) {
  const asSigner = ctx.apiAs(signer.session);
  const path = finalizePath(state.run.id);
  const cases = [
    ['no reason', 400, 'REASON_REQUIRED', await asSigner('POST', path, { meaning: 'approval', reauth: { password: 'not-reached' } })],
    ['no meaning', 400, 'MEANING_REQUIRED', await asSigner('POST', path, { reason: REASON, reauth: { password: 'not-reached' } })],
    ['a wrong password', 401, 'REAUTH_PASSWORD_INVALID', await asSigner('POST', path, { reason: REASON, meaning: 'approval', reauth: { password: 'wrong-password' } })],
  ];
  if (signer.totpSecret) {
    cases.push(['the password with no authenticator code', 401, 'REAUTH_TOTP_REQUIRED', await asSigner('POST', path, { reason: REASON, meaning: 'approval', reauth: { password: signer.password } })]);
  }
  cases.push(['an approval by the run\'s requester', 403, 'SEPARATION_OF_DUTIES', await ctx.api('POST', path, { reason: REASON, meaning: 'approval', reauth: await runReauth() })]);
  for (const [label, status, code, r] of cases) {
    ctx.expect(r.status === status && errCode(r) === code, `${label} expected ${status} ${code}, got ${r.status} ${errCode(r)}`, r.json);
  }
  return cases.map(([label, status, code]) => `${label} ${status} ${code}`);
}

await step(
  {
    id: 'OQ-RPT-08',
    urs: ['URS-RPT-006'],
    title: 'CREDENTIALED: a finalize is refused without its reason, its meaning, the signer\'s credential, independence, authority or an admissible report',
    action: 'as the signer: finalize with no reason, with no meaning, with a wrong password, with the password and no authenticator code; as the run identity (the run\'s requester): an approval; as a member with no signing authority (OQ_MEMBER): an approval; as the signer: a run whose report is not admissible as final',
    expected: '400 REASON_REQUIRED; 400 MEANING_REQUIRED; 401 REAUTH_PASSWORD_INVALID; 401 REAUTH_TOTP_REQUIRED (when a second factor is enrolled); 403 SEPARATION_OF_DUTIES; the member 403; the inadmissible run 409 with its reasons; the run still not final, not sealed, no signature row',
    dependsOn: ['OQ-RPT-03'],
  },
  async (ctx) => {
    const { api, apiAs, expect, deviation, baseUrl } = ctx;
    const signer = await requireSigner(ctx, baseUrl);
    state.signer = signer;
    const seen = await refusedFinalizes(ctx, signer);

    const member = await requireIdentity({ deviation, expect }, baseUrl, 'OQ_MEMBER', 'a member with no signing authority is needed to observe the authority refusal.');
    const asMember = await apiAs(member.session)('POST', finalizePath(state.run.id), { reason: REASON, meaning: 'approval', reauth: { password: 'not-reached' } });
    expect(asMember.status === 403, `the member's finalize expected 403, got ${asMember.status}`, asMember.json);
    seen.push(`the member 403 ${errCode(asMember) ?? ''}`.trim());

    const blocked = state.catalog.find((t) => t.typeId === 'lifecycle.obligation_calendar' && t.runnable);
    if (blocked) {
      const created = await api('POST', '/api/report-os/runs', runRequest(blocked));
      expect(created.status === 201, `the second run expected 201, got ${created.status}`, created.json);
      const refused = await apiAs(signer.session)('POST', finalizePath(created.json.data.run.id), { reason: REASON, meaning: 'approval', reauth: await reauthOf(signer) });
      expect(refused.status === 409 && Array.isArray(refused.json?.reasons) && refused.json.reasons.length > 0, `an inadmissible report expected 409 with reasons, got ${refused.status}`, refused.json);
      seen.push(`an inadmissible report 409 (${refused.json.reasons[0]})`);
    }

    const seal = await sealOf(api, state.run.id);
    const rows = await signatureRows(api, state.run.id);
    const read = await api('GET', `/api/report-os/runs/${state.run.id}`);
    expect(seal.view.sealed === false && rows.length === 0 && read.json?.data?.status !== 'final', 'a refused finalize left a seal, a signature row or a final status', { seal: seal.view, rows, status: read.json?.data?.status });
    return `${seen.join('; ')}; run ${state.run.id} still ${read.json?.data?.status}, sealed: false, 0 signature rows`;
  },
);

await step(
  {
    id: 'OQ-RPT-09',
    urs: ['URS-RPT-006', 'URS-RPT-007'],
    title: 'CREDENTIALED: the signer finalizes the run; it is sealed and signed once',
    action: 'as the signer: POST /runs/:id/finalize {reason, meaning:"approval", reauth:{password, totp?}}; read the run and the signatures by target; finalize again',
    expected: '200: status final, seal {algorithm sha256, contentHash (64 hex), sealedAt}, signature {signatureId, signedAt, meaning approval}; the run reads final; exactly one signature row by the signer, meaning approval, bound to the seal, valid, second factor verified when enrolled; the second finalize 409 RUN_ALREADY_FINAL and still one row',
    dependsOn: ['OQ-RPT-08'],
  },
  async (ctx) => {
    const { api, apiAs, expect, attach } = ctx;
    const signer = state.signer;
    const asSigner = apiAs(signer.session);
    const body = async () => ({ reason: REASON, meaning: 'approval', reauth: await reauthOf(signer) });
    const r = await asSigner('POST', finalizePath(state.run.id), await body());
    expect(r.status === 200, `the finalize expected 200, got ${r.status} ${errCode(r) ?? ''}`, r.json);
    const answer = finalizeAnswerProblems(r.json.data);
    expect(answer.length === 0, `the finalize's answer: ${answer.join('; ')}`, r.json.data);
    const { seal, signature } = r.json.data;
    state.seal = seal;

    const read = await api('GET', `/api/report-os/runs/${state.run.id}`);
    const rows = await signatureRows(api, state.run.id);
    attach('signature-rows.json', rows);
    expect(read.json.data.status === 'final', `the run reads ${read.json.data.status}, not final`, read.json);
    expect(rows.length === 1 && isFinalizeRow(rows[0], signer.session.user.id, 'approval'), `expected one valid approval row by the signer bound to the seal, got ${rows.length}`, rows);
    expect(!signer.totpSecret || rows[0].second_factor_verified === true, 'the row does not record the verified second factor', rows[0]);

    const again = await asSigner('POST', finalizePath(state.run.id), await body());
    expect(again.status === 409 && errCode(again) === 'RUN_ALREADY_FINAL', `a second finalize expected 409 RUN_ALREADY_FINAL, got ${again.status} ${errCode(again)}`, again.json);
    const after = await signatureRows(api, state.run.id);
    expect(after.length === 1, `the refused second finalize wrote a row (${after.length})`, after);
    return `finalized by ${signer.session.user.email} (user ${signer.session.user.id}), not the requester; seal sha256 ${String(seal.contentHash).slice(0, 12)}…, signature ${signature.signatureId}, meaning approval; one row; second finalize 409 RUN_ALREADY_FINAL`;
  },
);

await step(
  {
    id: 'OQ-RPT-10',
    urs: ['URS-RPT-008'],
    title: 'The seal verifies',
    action: 'GET /runs/:id/seal; GET /runs/:id/rendered; GET the seal of the run OQ-RPT-04 left unfinalized',
    expected: 'sealed: true with the finalize\'s content hash; verdict intact with every check ok (audit chain, stored seal, stored document, signature); the signer\'s printed name, the time and the meaning approval; the reason; the rendered report is the sealed one; the unfinalized run reads sealed: false, not-verifiable',
    dependsOn: ['OQ-RPT-09'],
  },
  async ({ api, expect, attach }) => {
    const { status, view } = await sealOf(api, state.run.id);
    attach('seal.json', view);
    const problems = sealProblems(view, state.seal, REASON);
    expect(status === 200 && problems.length === 0, `the seal read (${status}): ${problems.join('; ')}`, view);
    const checks = view.verification.checks;
    const rendered = await api('GET', `/api/report-os/runs/${state.run.id}/rendered`);
    expect(rendered.status === 200 && rendered.json.sealed === true, 'the rendered report is not the sealed one', { status: rendered.status, sealed: rendered.json?.sealed });
    const others = await api('GET', '/api/report-os/runs?limit=50');
    const open = others.json.data.find((x) => x.status !== 'final');
    expect(Boolean(open), 'the run history holds no unfinalized run to compare with', others.json.meta);
    const unsealed = await sealOf(api, open.id);
    expect(unsealed.view.sealed === false && unsealed.view.verification.verdict === 'not-verifiable', 'an unfinalized run reads sealed or verifiable', unsealed.view);
    return `verdict intact, ${checks.length} checks ok (${checks.map((c) => c.check).join(', ')}); signed by ${view.signature.signerName} at ${view.signature.signedAt}, meaning approval; run ${open.id} (not final) reads sealed: false, not-verifiable`;
  },
);

await step(
  {
    id: 'OQ-RPT-11',
    urs: ['URS-RPT-009'],
    title: 'The export carries the SHA-256 of the bytes sent, and is on the audit trail',
    action: 'GET /runs/:id/export.pdf, read as bytes; compute SHA-256 of the body; read the audit ledger',
    expected: '200 application/pdf, a %PDF body; the X-Export-Sha256 header equals the SHA-256 of the body; the ledger lists the finalization and the export against the run',
    dependsOn: ['OQ-RPT-09'],
  },
  async ({ api, auth, expect, attach, deviation, baseUrl }) => {
    const path = `/api/report-os/runs/${state.run.id}/export.pdf`;
    const file = await fetchBytes(baseUrl, path, auth.accessToken);
    attach('export.json', { request: { method: 'GET', url: `${baseUrl}${path}` }, response: file });
    if (file.status === 503 && file.json?.error?.code === 'REPORT_PDF_FONTS_UNAVAILABLE') {
      deviation('not executed — this installation lacks the Noto fonts the reporting PDF embeds (the production image installs fonts-noto-core and fonts-noto-cjk, Dockerfile.optimized). The export was refused 503 REPORT_PDF_FONTS_UNAVAILABLE and nothing was sent.', file.json);
    }
    expect(file.status === 200 && String(file.contentType).includes('application/pdf') && file.startsWith === '%PDF-', `expected a PDF, got ${file.status} ${file.contentType}`, file);
    expect(isHex64(file.headerSha256) && file.headerSha256 === file.bodySha256, 'X-Export-Sha256 is not the SHA-256 of the body', { header: file.headerSha256, body: file.bodySha256 });
    const ledger = await api('GET', '/api/audit-trail/ledger?limit=200');
    const mine = (ledger.json?.data ?? []).filter((row) => String(row.target) === `report_run:${state.run.id}`);
    const events = mine.map((row) => row.event);
    attach('ledger-rows.json', mine);
    expect(events.some((e) => /finaliz/i.test(e)) && events.some((e) => /export/i.test(e)), `the ledger does not list the finalization and the export for the run: ${events.join(', ') || 'none'}`, mine);
    return `${file.byteLength} bytes, ${file.disposition}; X-Export-Sha256 = sha256(body) = ${file.bodySha256.slice(0, 12)}…; ledger: ${events.join(', ')}`;
  },
);

await step(
  {
    id: 'OQ-RPT-12',
    urs: ['URS-RPT-010'],
    kind: 'ad-hoc',
    title: 'The reporting library\'s reads',
    action: 'GET /api/report-os/runs; GET /api/report-os/bundles; GET /api/insights/subscriptions',
    expected: 'each 200; the run history lists the finalized run as final',
    dependsOn: ['OQ-RPT-09'],
  },
  async ({ api, expect }) => {
    const runs = await api('GET', '/api/report-os/runs?limit=100');
    const bundles = await api('GET', '/api/report-os/bundles');
    const schedules = await api('GET', '/api/insights/subscriptions');
    expect([runs, bundles, schedules].every((r) => r.status === 200), `expected 200/200/200, got ${runs.status}/${bundles.status}/${schedules.status}`, { runs: runs.json?.meta });
    const listed = (runs.json?.data ?? []).find((x) => String(x.id) === String(state.run.id));
    expect(listed?.status === 'final', `the run history lists run ${state.run.id} as ${listed?.status}`, listed);
    return `runs ${runs.json?.meta?.total} (run ${state.run.id} final); bundles ${(bundles.json?.data ?? []).length}; schedules ${(schedules.json?.data ?? []).length}`;
  },
);

/** Imports the previous module's name so the modules run in order; see run.mjs. */
export const FINALIZE_STEPS = ACCESS_STEPS && 'steps-finalize.mjs';
