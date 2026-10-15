/**
 * The writing-role gate for everything under /api/cmc.
 *
 * Mounted ONCE, ahead of every /api/cmc router (server/bootstrap/
 * register-core-routes.ts), so a write route added later is gated without
 * anyone remembering to gate it. Before this, the register, specification,
 * batch, compile, contradiction-sweep, refresh, build-section and agency-
 * question writes checked no role at all: a viewer could edit GxP register
 * rows, and a viewer's recompile returned an approved Module 3 section to
 * draft. Only contradiction resolve, source-evidence linking and placement
 * were gated, each on its own.
 *
 * A viewer reads. The computations below take a POST body but save nothing,
 * so they are reads and a viewer may run them; each was checked to write no
 * row. Signing routes still check signing authority on top of this gate.
 */
import { requireEditorAccessForWrites } from '../../middleware/orgMembership';

/** POST computations that persist nothing (paths relative to /api/cmc). */
export const CMC_VIEWER_COMPUTATIONS: readonly RegExp[] = [
  /^\/ich-compliance\/?$/,
  /^\/control-strategy\/?$/,
  /^\/variations\/classify\/?$/,
  /^\/stability-studies\/[^/]+\/(shelf-life|trending)\/?$/,
  /^\/stability-studies\/poolability\/?$/,
  /^\/module3-os\/guard\/final-export\/[^/]+\/?$/,
];

export function cmcWriteRoleGate(req: any, res: any, next: () => void) {
  const path = String(req.path ?? '');
  if (String(req.method).toUpperCase() === 'POST' && CMC_VIEWER_COMPUTATIONS.some((re) => re.test(path))) {
    return next();
  }
  return requireEditorAccessForWrites(req, res, next);
}
