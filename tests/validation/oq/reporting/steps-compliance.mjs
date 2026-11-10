/**
 * OQ-007 steps OQ-RPT-13…16: the compliance reports (who may run one, the seal on a run, what the integrity report
 * says it could not verify) and the plan tier the catalog states.
 */
import { step, state } from './context.mjs';
import { errCode, integrityVerdicts, registerRowFor, sealedReportProblems } from './signed-acts.mjs';
import { requireIdentity } from '../../lib/credentials.mjs';
import { FINALIZE_STEPS } from './steps-finalize.mjs';

const CATALOG = '/api/audit/reports';
const REPORT_IDS = ['access-review', 'authentication-events', 'administrative-changes', 'electronic-signatures', 'audit-trail-integrity', 'retention-legal-holds', 'controlled-documents'];
const TIER_RANK = { free: 0, standard: 1, professional: 2, enterprise: 3 };

/** A report's data: the sealed export carries it as a JSON string. */
const dataOf = (signed) => {
  try {
    return JSON.parse(signed?.data ?? 'null');
  } catch {
    return null;
  }
};

await step(
  {
    id: 'OQ-RPT-13',
    urs: ['URS-RPT-011'],
    title: 'The compliance catalog is listed for a member; a run is the readers\'',
    action: 'as the run identity (an admin): GET /api/audit/reports; as a member (OQ_MEMBER): GET the catalog, then GET /api/audit/reports/access-review',
    expected: 'the seven reports listed, canRun true for the admin; the member reads the catalog with canRun false and the run is refused 403 AUDIT_READ_RESTRICTED',
  },
  async ({ api, apiAs, expect, deviation, baseUrl }) => {
    const catalog = await api('GET', CATALOG);
    const ids = (catalog.json?.reports ?? []).map((r) => r.id);
    expect(catalog.status === 200 && REPORT_IDS.every((id) => ids.includes(id)), `the catalog does not list the seven reports: ${ids.join(', ')}`, catalog.json);
    expect(catalog.json?.canRun === true, 'the admin\'s catalog does not say it may run a report', { canRun: catalog.json?.canRun });
    const member = await requireIdentity({ deviation, expect }, baseUrl, 'OQ_MEMBER', 'a member who is not an audit reader is needed to observe the refusal.');
    const asMember = apiAs(member.session);
    const theirs = await asMember('GET', CATALOG);
    expect(theirs.status === 200 && theirs.json?.canRun === false, `the member's catalog expected 200 with canRun false, got ${theirs.status} ${theirs.json?.canRun}`, { canRun: theirs.json?.canRun });
    const run = await asMember('GET', `${CATALOG}/access-review`);
    expect(run.status === 403 && errCode(run) === 'AUDIT_READ_RESTRICTED', `the member's run expected 403 AUDIT_READ_RESTRICTED, got ${run.status} ${errCode(run)}`, run.json);
    return `${ids.length} reports; admin canRun true; member canRun false and the run 403 AUDIT_READ_RESTRICTED`;
  },
);

await step(
  {
    id: 'OQ-RPT-14',
    urs: ['URS-RPT-012'],
    title: 'A compliance report is sealed, and a saved one verifies until it is changed',
    action: 'GET /api/audit/reports/electronic-signatures; compute SHA-256 of the data; find the report finalization (OQ-RPT-09) in the register; POST /api/audit/export/verify with the saved export; then with one character of the data changed',
    expected: '200 with data, a manifest (kind compliance-report, the organisation, dataHash, signingKeyId) and a signature; dataHash = SHA-256 of the data = the X-Report-Data-Hash header; the register lists the finalization, valid, its bound digest the seal\'s content hash; the saved export verifies; the changed one does not. With no signing key: 503 REPORT_SIGNING_UNAVAILABLE and nothing sent, recorded as a deviation',
    dependsOn: ['OQ-RPT-09'],
  },
  async ({ api, expect, attach, deviation }) => {
    const r = await api('GET', `${CATALOG}/electronic-signatures`);
    if (r.status === 503 && errCode(r) === 'REPORT_SIGNING_UNAVAILABLE') {
      deviation('not executed — no audit export signing key is configured, so the report was refused 503 REPORT_SIGNING_UNAVAILABLE and nothing was sent unsealed. The sealed run was not observed.', r.json);
    }
    expect(r.status === 200, `expected 200, got ${r.status} ${errCode(r) ?? ''}`, r.json);
    const signed = r.json.export;
    const { manifest, signature } = signed;
    attach('manifest.json', { manifest, signatureLength: String(signature).length });
    const problems = sealedReportProblems(signed, r.headers.get('x-report-data-hash'), state.run.organizationId);
    expect(problems.length === 0, `the sealed report: ${problems.join('; ')}`, manifest);
    const row = registerRowFor(dataOf(signed), 'report-run', state.run.id);
    expect(row?.bound_payload_digest === state.seal.contentHash && row.is_valid === true, 'the e-signature register does not list the report\'s finalization bound to its seal', row ?? { looked: `report-run ${state.run.id}` });

    const saved = { data: signed.data, manifest, signature };
    const ok = await api('POST', '/api/audit/export/verify', saved);
    expect(ok.status === 200 && ok.json.verification.valid === true, `the saved export expected valid, got ${ok.status}`, ok.json);
    const changed = await api('POST', '/api/audit/export/verify', { ...saved, data: String(signed.data).replace('"report"', '"Report"') });
    expect(changed.status === 200 && changed.json.verification.valid === false, 'a changed export still verifies', changed.json);
    return `sealed (export ${manifest.exportId}, key ${manifest.signingKeyId}); dataHash = sha256(data) = header; the register lists the finalization of run ${state.run.id} (signature ${row.id}, bound to the seal); the saved export verifies; one changed character does not (${changed.json.verification.errors.join('; ').slice(0, 120)})`;
  },
);

await step(
  {
    id: 'OQ-RPT-15',
    urs: ['URS-RPT-013'],
    title: 'The integrity report says what it verified and what it could not',
    action: 'GET /api/audit/reports/audit-trail-integrity; read its verdicts section and its overall chain statement',
    expected: 'the audit_logs hash chain row reads intact over at least one row; every row that is not intact says why; when any check could not run, the overall statement is not ok: true. With no signing key: 503, recorded as a deviation',
  },
  async ({ api, expect, attach, deviation }) => {
    const r = await api('GET', `${CATALOG}/audit-trail-integrity`);
    if (r.status === 503 && errCode(r) === 'REPORT_SIGNING_UNAVAILABLE') {
      deviation('not executed — no audit export signing key is configured, so the report was refused 503 REPORT_SIGNING_UNAVAILABLE.', r.json);
    }
    expect(r.status === 200, `expected 200, got ${r.status} ${errCode(r) ?? ''}`, r.json);
    const data = dataOf(r.json.export) ?? {};
    const overall = data.chain ?? {};
    const { verdicts, chain, notVerified, unexplained, chainIntact } = integrityVerdicts(data);
    attach('verdicts.json', { chain: overall, verdicts });
    expect(chainIntact, 'the audit_logs hash chain is not reported intact', chain ?? verdicts);
    expect(unexplained.length === 0, 'a check that is not intact gives no reason', unexplained);
    expect(notVerified.length === 0 || overall.ok !== true, 'the overall statement reads ok while a check could not verify', overall);
    return `audit_logs hash chain intact over ${chain.rows_checked} rows; ${notVerified.length} of ${verdicts.length} checks not verified (${notVerified.map((v) => v.check).join('; ') || 'none'}), each with its reason; overall ok: ${overall.ok} (${overall.reason})`;
  },
);

await step(
  {
    id: 'OQ-RPT-16',
    urs: ['URS-RPT-014'],
    title: 'The catalog states the plan, and what each report needs',
    action: 'from the canvas bootstrap (OQ-RPT-03): the organisation\'s tier, and each type\'s requiredTier and entitled; then, for a type above the plan if there is one, POST a run',
    expected: 'the tier was read; every type is entitled exactly when the tier covers its requiredTier; a type above the plan is refused 403 with its feature and requiredTier. On an organisation whose plan covers every type the refusal is not observable, recorded as a deviation',
    dependsOn: ['OQ-RPT-03'],
  },
  async ({ api, expect, deviation }) => {
    const { tier, tierResolved } = state.tier;
    expect(tierResolved === true && tier in TIER_RANK, `the plan was not read: ${tier} (resolved ${tierResolved})`, state.tier);
    const wrong = state.catalog.filter((t) => t.entitled !== (TIER_RANK[tier] >= (TIER_RANK[t.requiredTier] ?? 0)));
    expect(wrong.length === 0, 'a type\'s entitled flag does not follow the tier and its requiredTier', wrong.map((t) => ({ typeId: t.typeId, requiredTier: t.requiredTier, entitled: t.entitled })));
    const above = state.catalog.find((t) => !t.entitled && t.allowedScopes?.includes('account'));
    if (!above) {
      deviation(`partly executed — the organisation is on the ${tier} plan, which covers all ${state.catalog.length} types, and each type's entitled flag follows its requiredTier. No type is above the plan, so the 403 plan refusal was not observed. Observe it with an organisation on a lower plan.`, { tier, types: state.catalog.length });
    }
    const r = await api('POST', '/api/report-os/runs', { scopeType: 'account', scopeId: String(state.run.organizationId), reportTypeId: above.typeId });
    expect(r.status === 403 && r.json?.requiredTier === above.requiredTier && Boolean(r.json?.feature), `a type above the plan expected 403 with feature and requiredTier, got ${r.status}`, r.json);
    return `tier ${tier}; ${state.catalog.length} types follow it; ${above.typeId} refused 403 (${r.json.feature}, requires ${r.json.requiredTier})`;
  },
);

/** Imports the previous module's name so the modules run in order; see run.mjs. */
export const COMPLIANCE_STEPS = FINALIZE_STEPS && 'steps-compliance.mjs';
