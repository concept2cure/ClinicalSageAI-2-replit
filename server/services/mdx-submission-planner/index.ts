/**
 * MDX global submission planner — barrel.
 *
 * Composes the global-markets registry + readiness scorer into a per-market,
 * honest submission plan for a device/IVD profile. Capability flags are
 * reported straight from the registry, which reads transmission from
 * regulatory/market-support.ts.
 *
 * @module server/services/mdx-submission-planner
 */

export * from './types';
export * from './planner';

import planner from './planner';

export default { ...planner };
