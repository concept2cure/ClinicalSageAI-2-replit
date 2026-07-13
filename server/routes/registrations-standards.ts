/**
 * Registrations — submission data-standards capability status.
 *
 *   GET /api/registrations/data-standards
 *
 * Read-only capability report that makes the ui-v2 Registrations surface's
 * "submission data standards" chips server-truthful instead of hardcoded
 * literals. Each entry carries an honest status:
 *   shipped         — implemented and in the platform.
 *   not_integrated  — acknowledged gap; `detail` states exactly what does and
 *                     does not exist, so the chip never over-claims (GAP RULE).
 *
 * The EUDAMED entry reflects real config: a read-only public-search client
 * backs AnA today, and a transmit gateway exists but ships an opaque bundle
 * with synthesized identifiers — neither is a first-class EUDAMED registration
 * data model wired to this surface, so the status stays `not_integrated`.
 * EU IDMP/xEVMPD has only orphaned ISO 11238 substance DDL, unused.
 *
 * Mounted at /api/registrations via register-inline-routes.ts. Returns the
 * bare array (no envelope) so the client's useLive hook consumes it directly.
 */
import { Router, Request, Response } from 'express';

const router = Router();

type StandardStatus = 'shipped' | 'not_integrated';

interface DataStandard {
  id: string;
  label: string;
  status: StandardStatus;
  detail?: string;
}

router.get('/data-standards', (_req: Request, res: Response) => {
  const eudamedTransmitConfigured = Boolean(process.env.EUDAMED_URL && process.env.EUDAMED_BEARER);

  const standards: DataStandard[] = [
    { id: 'estar', label: 'eSTAR (FDA CDRH)', status: 'shipped' },
    { id: 'ectd', label: 'eCTD compile · validate · export', status: 'shipped' },
    {
      id: 'eudamed_m2m',
      label: 'EUDAMED M2M',
      status: 'not_integrated',
      detail: eudamedTransmitConfigured
        ? 'Read-only EUDAMED search backs AnA, and a transmit gateway is configured, but no first-class EUDAMED registration data model is wired to Registrations yet.'
        : 'Read-only EUDAMED search backs AnA; no M2M device/certificate registration is wired to Registrations yet.',
    },
    {
      id: 'idmp_xevmpd',
      label: 'EU IDMP / xEVMPD',
      status: 'not_integrated',
      detail:
        'A partial ISO 11238 substance schema exists but is unused; no IDMP/xEVMPD product model or export generator yet.',
    },
  ];

  res.json(standards);
});

export default router;
