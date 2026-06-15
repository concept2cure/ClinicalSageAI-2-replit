/**
 * MDX global submission planner — barrel.
 *
 * Composes the global-markets registry + readiness scorer into a per-market,
 * honest submission plan for a device/IVD profile. No transmission capability
 * is ever asserted; capability flags are reported straight from the registry.
 *
 * @module server/services/mdx-submission-planner
 */

export * from './types';
export * from './planner';

import planner from './planner';

export default { ...planner };
