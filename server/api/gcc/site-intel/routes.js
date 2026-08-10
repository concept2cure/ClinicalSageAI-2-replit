/**
 * Site intelligence and investigator scorecards — mounted, not implemented.
 *
 * Previously four lines answering `GET /status` with `{ status: 'operational' }`.
 * Nothing has ever been behind this mount. See ../modules.ts.
 */
import { notImplementedRouter } from '../not-implemented.js';

export default notImplementedRouter('site-intel');
