/**
 * Region selector configuration for the MAA / Module-1 cockpit.
 *
 * ── This file is not a fixture, despite living in fixtures/ ───────────────────
 * Everything below is display configuration for the market chips — the non-US
 * `RegulatoryMarket` codes the requirements engine models, plus the agency name
 * and procedure shown beside each. No submission data, no readiness state, no
 * checklist content. MaaCockpit gets all of that live from
 * `GET /api/maa-module1/:market`.
 *
 * ── What was removed, and why ─────────────────────────────────────────────────
 * This file previously also exported `MAA_REQUIREMENTS`: a complete, hand-copied
 * transcription of the regional Module-1 checklists — the EU eAF and ERA, the
 * Japanese 承認申請書 and 添付文書, Health Canada's HC/SC 3011 and CPID, and the
 * rest — duplicating `REGIONAL_MODULE1_REQUIREMENTS` in
 * server/services/global-ri/regional-module1-requirements.ts.
 *
 * Nothing imported it. It was a second copy of regulatory content with no
 * consumer, which is the same trap that let the served design-system mirror
 * drift 119 lines behind its canonical file without anyone noticing: the copy
 * costs nothing to keep and nobody updates it, so the day something does start
 * reading it, it is quietly wrong about which components an agency requires.
 * Checked before deleting — it still matched the server exactly, so no
 * behaviour depended on the difference. Removed while that was still true.
 *
 * If a client-side copy is ever genuinely needed, generate it from the server
 * constant rather than retyping it.
 *
 * ── The header this replaces was false ────────────────────────────────────────
 * It read: "The live surface fetches GET
 * /api/global-ri/module1/requirements/:market; this is the fail-closed fallback
 * (marked 'Sample data')." Three claims, none of them true any more. MaaCockpit
 * calls `/api/maa-module1/:market` (MaaCockpit.tsx:43), never falls back to this
 * module for data, and renders no "Sample data" marker — it shows an honest
 * empty or failed-load state instead. The `/api/global-ri/module1/*` routes do
 * exist and are mounted, but this surface is not what calls them.
 */

/**
 * One required regional Module-1 component. Matches the server contract in
 * regional-module1-requirements.ts; imported by MaaCockpit as a type only.
 */
export interface Module1Component {
  code: string;
  label: string;
  section: string;
}

/** A supported non-US market + its display metadata. */
export interface MaaMarket {
  /** Backend RegulatoryMarket code — the :market path param. */
  key: string;
  /** Short label for the region selector. */
  label: string;
  /** Agency / application context. */
  agency: string;
  procedure: string;
}

/**
 * The non-US markets the Module-1 requirements service models.
 *
 * `key` must stay in step with the `RegulatoryMarket` union in
 * regional-module1-requirements.ts — a key with no server counterpart gives the
 * user a chip that always fails to load. FDA is absent deliberately: this is the
 * non-US marketing-application cockpit.
 */
export const MAA_MARKETS: MaaMarket[] = [
  { key: 'EMA', label: 'EU (EMA)', agency: 'European Medicines Agency', procedure: 'Centralised MAA' },
  { key: 'PMDA', label: 'Japan (PMDA)', agency: 'Pharmaceuticals and Medical Devices Agency', procedure: 'J-NDA' },
  { key: 'MHRA', label: 'UK (MHRA)', agency: 'Medicines and Healthcare products Regulatory Agency', procedure: 'UK MA' },
  { key: 'TGA', label: 'Australia (TGA)', agency: 'Therapeutic Goods Administration', procedure: 'Registration' },
  { key: 'HEALTH_CANADA', label: 'Canada (HC)', agency: 'Health Canada', procedure: 'NDS' },
  { key: 'SWISSMEDIC', label: 'Switzerland (Swissmedic)', agency: 'Swissmedic', procedure: 'Swiss MA' },
  { key: 'NMPA', label: 'China (NMPA)', agency: 'National Medical Products Administration', procedure: 'NDA' },
];
