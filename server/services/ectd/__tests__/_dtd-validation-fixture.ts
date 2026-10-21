/** Structural proof fixture only; no agency or actual engine acceptance claimed. */
import type { DtdValidationEvidence } from '@shared/regulatory/ectd-dtd-validation';
export const REGIONAL_XML = 'm1/us/us-regional.xml';
const xml = (mode: 'well-formed' | 'dtd') => ({ ran: true, valid: true, errors: [], mode });
export function syntheticDtdStatus() {
  const validation: DtdValidationEvidence = { version: 1, passed: true, expectedFiles: ['index.xml', REGIONAL_XML],
    files: ['index.xml', REGIONAL_XML].map(relPath => ({ relPath, wellFormed: xml('well-formed'), doctype: { valid: true, errors: [] }, dtd: xml('dtd') })),
    integrity: { verified: ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd', 'ectd-2-0.xsl', 'us-regional.xsl'], mismatched: [], missingFiles: [], unlistedFiles: [], ok: true } };
  return { required: ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd'], present: ['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd'], missing: [],
    requiredStylesheets: ['ectd-2-0.xsl', 'us-regional.xsl'], presentStylesheets: ['ectd-2-0.xsl', 'us-regional.xsl'], missingStylesheets: [], selfContained: true, validation };
}
