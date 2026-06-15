/**
 * MDX / global-capabilities entitlements — barrel.
 *
 * Pure, deterministic entitlement logic mapping the NEW MDX/global capabilities
 * (governed reports + prediction, device/IVD assembly readiness, global-market
 * planning, AnA advisory) to the platform's REAL subscription tiers
 * (free / standard / professional / enterprise). No DB, no network, no LLM.
 *
 * @module server/services/entitlements
 */

export * from './types';
export * from './mdx-entitlements';

import entitlements from './mdx-entitlements';

export default entitlements;
