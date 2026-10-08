/**
 * Agency gateway display names, one map for every surface that names a gateway
 * (Gateway transmittals, the Submission Center's Dispatch tab). Moved here from
 * GatewayTransmittals.tsx on 2026-10-08 (QA j6) when the Dispatch tab began to
 * say which gateway a sequence would be sent to, so the two cannot disagree.
 */
/* ── Gateway names ───────────────────────────────────────────────────────────
   GET /api/mdx/gateways answers { region, gateway, transport, configured } — a
   registry key, no display name — and the table rendered `g.name ?? g.gateway`,
   so the operator read "pmda_gateway", "hc_cesg", "swissmedic_egateway". The
   names below are the ones each implementation's own header gives
   (server/services/submission-gateways/*.ts). A key not listed here is shown
   as sent, never guessed at. */
export const GATEWAY_LABEL: Record<string, string> = {
  esg: 'FDA ESG',
  cesp: 'CESP',
  eudamed: 'EUDAMED',
  pmda_gateway: 'PMDA Gateway',
  hc_cesg: 'Health Canada CESG',
  mhra_gateway: 'MHRA Gateway',
  nmpa_gateway: 'NMPA Gateway',
  tga_ebs: 'TGA eBusiness Services',
  swissmedic_egateway: 'Swissmedic eGateway',
  anvisa_gateway: 'ANVISA Gateway',
  cdsco_sugam: 'CDSCO SUGAM',
  mfds_dbio: 'MFDS dBio',
  hsa_prism: 'HSA PRISM',
};
export const gatewayLabel = (key: string | null | undefined): string =>
  key ? (GATEWAY_LABEL[key] ?? key) : '—';

/**
 * The tone a transmittal's gateway status is shown in: acknowledged or complete
 * reads ok, failed or rejected reads as an error, anything else is still in
 * flight. Moved here from GatewayTransmittals.tsx on 2026-10-08 (FILING_SPINE
 * F13) when the Dispatch tab began listing a market's transmittals, so the two
 * lists cannot colour one status differently.
 */
export function transmittalStatusTone(status: string): 'ok' | 'err' | 'warn' {
  const v = status.toLowerCase();
  if (v.includes('ack') || v.includes('complete') || v.includes('success')) return 'ok';
  if (v.includes('fail') || v.includes('error') || v.includes('reject')) return 'err';
  return 'warn';
}
