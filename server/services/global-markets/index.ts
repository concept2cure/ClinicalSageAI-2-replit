/**
 * Global market registry — barrel.
 *
 * A self-contained, descriptive registry of the world's major regulated markets
 * for medical devices and IVDs, plus pure readiness scoring. Honest by
 * construction: no transmission capability is ever asserted.
 *
 * @module server/services/global-markets
 */

export * from './types';
export * from './market-registry';
export * from './market-readiness';

import registry from './market-registry';
import readiness from './market-readiness';

export default { ...registry, ...readiness };
