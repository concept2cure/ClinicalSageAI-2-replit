/**
 * eSTAR canonical → AcroForm field maps (Device eSTAR, B2).
 *
 * Maps our canonical field keys to the exact AcroForm field names inside each
 * official FDA eSTAR template, per template descriptor id (see
 * estar-template-registry's ESTAR_TEMPLATE_MANIFEST).
 *
 * HONEST-BY-CONSTRUCTION: these maps are intentionally EMPTY until a maintainer
 * vendors the official eSTAR PDF (see assets/estar-templates/README.md) and reads
 * its real AcroForm field names (e.g. via `listAcroFields` from
 * server/services/forms/fill-official-pdf). We do NOT guess field names — a wrong
 * `acroField` would silently fail to fill the official form. Until a map is
 * populated and verified against the vendored template version, the fill
 * orchestration (estar-fill) refuses to claim a filled eSTAR and reports it as a
 * blocker. A populated map is a version-pinned data change, not new code.
 *
 * @module server/services/pathway-engines/estar/estar-field-map
 */

import type { OfficialPdfFieldMap } from '../../forms/fill-official-pdf';

/**
 * Per-descriptor field maps. Keys are descriptor ids from ESTAR_TEMPLATE_MANIFEST
 * ('510k-device', '510k-ivd', 'de_novo-device', 'de_novo-ivd'). Empty until the
 * official template's AcroForm field names are verified and filled in here.
 *
 * To populate one:
 *   1. Drop the official eSTAR PDF into assets/estar-templates/.
 *   2. `listAcroFields(templateBytes)` to enumerate the real field names.
 *   3. Map each canonical key → { acroField: '<exact name>', type }.
 *   4. Pin the template `version` in ESTAR_TEMPLATE_MANIFEST and re-validate.
 */
export const ESTAR_FIELD_MAPS: Record<string, OfficialPdfFieldMap> = {
  '510k-device': {},
  '510k-ivd': {},
  'de_novo-device': {},
  'de_novo-ivd': {},
};

/** The field map for a descriptor id, or undefined if the descriptor is unknown. */
export function getEstarFieldMap(descriptorId: string): OfficialPdfFieldMap | undefined {
  return ESTAR_FIELD_MAPS[descriptorId];
}

/** True when a descriptor's field map has at least one verified field mapping. */
export function isFieldMapPopulated(descriptorId: string): boolean {
  const m = ESTAR_FIELD_MAPS[descriptorId];
  return !!m && Object.keys(m).length > 0;
}

export default { ESTAR_FIELD_MAPS, getEstarFieldMap, isFieldMapPopulated };
