/**
 * AnA device & global-market advisory — barrel.
 *
 * A NEW, self-contained advisory layer the regulatory-intelligence assistant
 * (AnA 1.0 RI) can call to give grounded device/IVD + global-market guidance.
 * Pure, deterministic, honest by construction: no LLM, no fabrication, and never
 * a claim of transmission to any authority.
 *
 * @module server/services/ana-advisory
 */

export * from './types';
export * from './device-market-advisor';
export * from './submission-plan-advisor';
export * from './pma-advisor';

import advisor from './device-market-advisor';

export default advisor;
