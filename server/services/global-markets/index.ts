/**
 * Global market registry — barrel.
 *
 * A self-contained, descriptive registry of the world's major regulated markets
 * for medical devices and IVDs, plus pure readiness scoring. Transmission
 * capability is read from regulatory/market-support.ts, never set by hand.
 *
 * @module server/services/global-markets
 */

export * from './types';
export * from './market-registry';
export * from './market-readiness';

import registry from './market-registry';
import readiness from './market-readiness';

export default { ...registry, ...readiness };
