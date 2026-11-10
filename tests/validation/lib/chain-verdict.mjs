/**
 * The organisation's audit-chain verdict, read where the release serves it.
 *
 * Until OQ-001 v0.12 / OQ-002 v0.17 the chain steps read GET /api/c2c/actions/verify-chain. No launch screen calls
 * that route and no surface claims it (launchScopeApiVerdict: `unmapped`), so a server that refuses unattributed
 * paths, which is production's default (LAUNCH_SCOPE_API_UNATTRIBUTED unset = enforce), answers it 403 LAUNCH_SCOPE
 * (re-execution of 2026-11-10: OQ-PROJ-06, OQ-VAULT-08). The verdict a customer can reach is the Audit trail
 * integrity attestation on Audit & compliance reports: GET /api/audit/reports/audit-trail-integrity walks the
 * organisation's audit_logs chain and reports it as the `audit_logs hash chain` row of its `verdicts` section
 * (server/services/audit/compliance-reports/). The report is sealed, and each run is itself recorded on the chain.
 */

/** The report's data, which the sealed export carries as a JSON string; null when it is absent or unreadable. */
function reportData(json) {
  try {
    return JSON.parse(json?.export?.data ?? 'null');
  } catch {
    return null;
  }
}

/** The `audit_logs hash chain` row of the report's `verdicts` section, or null. */
function chainRow(data) {
  const verdicts = (data?.sections ?? []).find((s) => s.key === 'verdicts')?.rows ?? [];
  return verdicts.find((x) => x.store === 'audit_logs' && /hash chain/i.test(String(x.check))) ?? null;
}

/** The `audit_logs hash chain` row of the attestation, with the answer's status and export id. */
export async function organisationChainVerdict(api) {
  const r = await api('GET', '/api/audit/reports/audit-trail-integrity');
  const row = chainRow(reportData(r.json));
  const intact = r.status === 200 && row?.verdict === 'intact' && Number(row.rows_checked) > 0;
  return { status: r.status, code: r.json?.error?.code ?? null, exportId: r.json?.export?.manifest?.exportId ?? null, row, intact };
}
