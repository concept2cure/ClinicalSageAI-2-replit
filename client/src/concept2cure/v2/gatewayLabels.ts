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

/* ── P-92: a held FDA send, in words, for the Dispatch tab's transmissions and Gateway transmittals ─────── */

const UTC_MONTH = (d: Date) => d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
/** "3 November 2026", in UTC, as the server says a held send's day; null when there is no readable instant. */
export function heldSendDay(iso: string | null | undefined): string | null {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${UTC_MONTH(d)} ${d.getUTCFullYear()}` : null;
}
/** "3 November 2026 at 14:05 UTC", as the server says when a held send was made. */
export function heldSendWhen(iso: string | null | undefined): string | null {
  const day = heldSendDay(iso);
  if (!day) return null;
  const d = new Date(iso as string);
  return `${day} at ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
/** P-92: a held send settled by signature, as the transmittal keeps it (fda-esg-receipts.ts markHeldSendSettled). */
export interface HeldSendSettlementRecord { outcome?: string; kind?: string; settledAt?: string }
/** A verified FDA receipt kept with the transmittal; `contradicts` when it disagrees with a settlement (P-108 1(c)). */
export interface KeptReceipt { verified?: boolean; contradicts?: string; receivedAt?: string }
const SETTLED_ON: Record<string, string> = {
  ack2: "FDA's Ack2", ack3: "FDA's Ack3", 'fda-non-receipt-confirmation': "FDA's written confirmation",
  'platform-proof': "the platform's own record that it never left",
};
/** How a held send was settled, in words, and FDA's later verified answer against it; null for a row never settled.
 *  `style` is the transmissions list's ("on …, by signature, DAY") or Gateway transmittals' ("by signature · … · DAY"). */
export function heldSendSettlementWords(
  m: { heldSendSettlement?: HeldSendSettlementRecord | null; as2ReceiptHistory?: KeptReceipt[] | null } | null | undefined,
  style: 'row' | 'log',
): string | null {
  const s = m?.heldSendSettlement;
  if (!s || (s.outcome !== 'received' && s.outcome !== 'not-received')) return null;
  const way = s.outcome === 'received' ? 'recorded as received' : 'released as not received';
  const ground = SETTLED_ON[s.kind ?? ''] ?? 'evidence this screen does not name';
  const day = heldSendDay(s.settledAt) ?? 'an unrecorded day';
  const settled = style === 'row' ? `${way} on ${ground}, by signature, ${day}` : `${way} by signature · ${ground} · ${day}`;
  const kept = (m?.as2ReceiptHistory ?? []).find((e) => e?.verified === true && e.contradicts === s.outcome);
  if (!kept) return settled;
  const keptOn = heldSendDay(kept.receivedAt) ?? 'on an unrecorded day';
  return s.outcome === 'not-received'
    ? `${settled} · FDA's signed receipt, kept ${keptOn}, shows it was received`
    : `${settled} · FDA's signed answer, kept ${keptOn}, refuses it`;
}
