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
 * Why engineered FDA ESG transport is not yet agency-qualified (launch row D7).
 */
export const FDA_ESG_NOT_PROVEN =
  'AS2 CMS signing/encryption and pinned MDN verification are engineered, but environment-specific FDA UAT, ' +
  'credential onboarding, required submission artifacts and an accepted test sequence have not been verified';

/**
 * Why an adapter that posts to an agency endpoint is not a channel: its
 * endpoint and message format were written from no agency source
 * (health-canada-gateway.ts header; the generic adapters for MHRA, NMPA, TGA,
 * Swissmedic, ANVISA, CDSCO, MFDS and HSA). FILING_SPINE.md §3 records that
 * this follows regulatory practice as the design judges described it and was
 * not checked against agency documents.
 */
export const ADAPTER_UNSOURCED =
  'its agency wire contract has no verified regulator source; the canonical transmit path refuses it before any bytes are sent';
