/** Evidence from the existing XML engine for the exact captured eCTD package.
 * Type-only transport contract; no validator or enforcement policy lives here. */
export interface DtdXmlResult {
  ran: boolean;
  valid: boolean;
  errors: string[];
  mode: 'well-formed' | 'dtd' | 'xsd';
}

export interface DtdFileValidation {
  relPath: string;
  wellFormed: DtdXmlResult;
  doctype: { valid: boolean; errors: string[] };
  dtd: DtdXmlResult;
}

export interface DtdValidationEvidence {
  version: 1;
  expectedFiles: string[];
  files: DtdFileValidation[];
  integrity: {
    verified: string[];
    mismatched: Array<{ fileName: string; expected: string; actual: string }>;
    missingFiles: string[];
    unlistedFiles: string[];
    ok: boolean;
  };
  passed: boolean;
}
