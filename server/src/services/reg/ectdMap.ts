/** Region-tunable mapping from 3.2 codes -> eCTD folder segments for Module 3.
 * NOTE: This is a practical, field-tested baseline, not a legal substitute for the regional specs.
 * Keep this config externalized to allow region-specific overrides.
 */
type MapEntry = { codePrefix: string; path: string };
export const FDA_M3_MAP: MapEntry[] = [
  { codePrefix: '3.2.P.3', path: 'm3/32-p-drug-product/32-p-3-manufacture' },
  { codePrefix: '3.2.P.5', path: 'm3/32-p-drug-product/32-p-5-control-of-drug-product' },
  { codePrefix: '3.2.P.8', path: 'm3/32-p-drug-product/32-p-8-stability' },
  { codePrefix: '3.2.S.', path: 'm3/32-s-drug-substance' }, // catch-all for S sections
];
export const EMA_M3_MAP: MapEntry[] = [
  { codePrefix: '3.2.P.3', path: 'm3/32-p/32-p-3' },
  { codePrefix: '3.2.P.5', path: 'm3/32-p/32-p-5' },
  { codePrefix: '3.2.P.8', path: 'm3/32-p/32-p-8' },
  { codePrefix: '3.2.S.', path: 'm3/32-s' },
];

export function findPath(code: string, region: string) {
  const entries = (region || 'FDA').toUpperCase() === 'EMA' ? EMA_M3_MAP : FDA_M3_MAP;
  const hit = entries.find(e => code.startsWith(e.codePrefix));
  return hit ? hit.path : 'm3/other';
}
