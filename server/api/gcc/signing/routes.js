/**
 * E-signature workflows — mounted, not implemented.
 *
 * This file used to be four lines that answered `GET /status` with
 * `{ status: 'operational' }`, byte-identical to site-intel and labeling. The
 * implemented e-signature endpoints are under /api/esignature; this mount has
 * never had code behind it. See ../modules.ts.
 */
import { notImplementedRouter } from '../not-implemented.js';

export default notImplementedRouter('signing');
