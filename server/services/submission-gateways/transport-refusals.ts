/**
 * Why a gateway adapter cannot send to its agency, in one sentence each.
 *
 * Shared by the adapters that refuse (so the refusal a transmit throws and the
 * line a market states are one text) and by
 * server/services/regulatory/market-support.ts (FILING_SPINE.md F19), which
 * must not import an adapter: adapters open the database pool, and the
 * submission resolver that reads market support is a pure module.
 */

/** Why nothing is sent to, or read from, PMDA (pmda-gateway.ts refuses every transmit and poll). */
export const PMDA_PROTOCOL_UNVERIFIED =
  "PMDA's electronic submission channel is 申請電子データシステム (https://esg.pmda.go.jp/); this platform holds no " +
  'regulator-sourced specification of its protocol, so it neither sends to PMDA nor polls it. Submit through the ' +
  'gateway system directly.';

/**
 * Why FDA ESG transmit is wired but not proven (fda-esg.ts header, "KNOWN
 * CONFORMANCE GAP"; launch row D7).
 */
export const FDA_ESG_NOT_PROVEN =
  'the ESG transmission is not signed as FDA requires, so FDA would reject it, and no ESG account, DTDs or ' +
  'accepted test sequence are in place';

/**
 * Why an adapter that posts to an agency endpoint is not a channel: its
 * endpoint and message format were written from no agency source
 * (health-canada-gateway.ts header; the generic adapters for MHRA, NMPA, TGA,
 * Swissmedic, ANVISA, CDSCO, MFDS and HSA). FILING_SPINE.md §3 records that
 * this follows regulatory practice as the design judges described it and was
 * not checked against agency documents.
 */
export const ADAPTER_UNSOURCED =
  'its adapter posts to an endpoint written from no agency source, so nothing is sent through it';
