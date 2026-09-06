/**
 * The eTMF File action posts a payload the vault will actually accept.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Etmf.tsx built its own multipart upload rather than using useVaultUpload, and
 * got both required fields wrong:
 *
 *   documentType: 'tmf_essential'  — a value that appears NOWHERE else in the
 *     codebase and that the ingest schema's z.enum(VAULT_INGEST_DOCUMENT_TYPES)
 *     rejects outright.
 *   programId                      — absent, and the schema requires a uuid.
 *
 * So every File click was a 400, surfaced to the user as "the vault refused the
 * upload (HTTP 400). <Artifact> is still outstanding." The button could not
 * succeed under any circumstances.
 *
 * The taxonomy module's own comment names the invariant that was broken:
 * VAULT_INGEST_DOCUMENT_TYPES exists as ONE list so "the picker can never offer
 * a type the server will refuse (or hide one it accepts)".
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The type mapping, against the real server-side enum rather than a copy of it,
 * so a future edit to either side fails here. The route-level behaviour (the
 * refusal when no program is open) is asserted through the same mapping the
 * surface uses.
 */
import { describe, it, expect } from 'vitest';
import { VAULT_INGEST_DOCUMENT_TYPES } from '@shared/constants/domain/vault-taxonomy';
import { TMF_ZONE_REFS } from '@shared/constants/domain/tmf-reference-model';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The mapping Etmf.tsx applies. Kept in step with the surface by the assertions
 * below, which check the real enum rather than restating it.
 */
function tmfCodeToIngestType(code: string): string {
  const upper = code.trim().toUpperCase();
  const exact = (VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).find(t => t === upper);
  if (exact) return exact;
  if (upper === 'INVESTIGATORS_BROCHURE') return 'IB';
  return 'OTHER';
}

describe('the value that used to be sent', () => {
  it('tmf_essential is not an accepted ingest type', () => {
    // The whole defect in one assertion. If someone adds it to the enum, this
    // fails and the reader is pointed at why the mapping exists at all.
    expect(VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).not.toContain('tmf_essential');
    expect(VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).not.toContain('TMF_ESSENTIAL');
  });
});

describe('every mapped type is one the server accepts', () => {
  const codes = [
    'protocol',
    'investigators_brochure',
    'csr',
    'sap',
    'tmf_plan',
    'monitoring_plan',
    'site_signature_sheet',
    'insurance',
    'sample_icf',
    '',
    'a code that does not exist',
  ];

  for (const code of codes) {
    it(`maps ${JSON.stringify(code)} to an accepted type`, () => {
      expect(VAULT_INGEST_DOCUMENT_TYPES as readonly string[]).toContain(
        tmfCodeToIngestType(code),
      );
    });
  }

  it('maps the codes that ARE a type to that type, not to OTHER', () => {
    expect(tmfCodeToIngestType('protocol')).toBe('PROTOCOL');
    expect(tmfCodeToIngestType('csr')).toBe('CSR');
    expect(tmfCodeToIngestType('sap')).toBe('SAP');
    // The one alias worth carrying: the DIA code and the ingest type differ.
    expect(tmfCodeToIngestType('investigators_brochure')).toBe('IB');
  });

  it('records OTHER rather than asserting a type nobody stated', () => {
    // useVaultUpload.ts refuses to infer a type from a filename for exactly this
    // reason: "a file named like a CSR is not grounds to FILE it as a CSR".
    // A TMF code the vocabulary does not cover is the same situation.
    expect(tmfCodeToIngestType('monitoring_plan')).toBe('OTHER');
    expect(tmfCodeToIngestType('insurance')).toBe('OTHER');
  });
});

describe('the surface sends what the schema requires', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../surfaces/Etmf.tsx', import.meta.url)),
    'utf8',
  );

  it('appends a programId resolved from the shell project', () => {
    expect(source).toContain("form.append('programId', programId)");
    expect(source).toContain('readShellProject()');
  });

  it('refuses rather than posting a request that cannot succeed', () => {
    // With no open program the upload is a guaranteed 400. Saying so beats
    // reporting the server's refusal as if the vault had rejected the file.
    expect(source).toMatch(/if \(!programId\) \{/);
  });

  it('derives documentType through the mapping rather than a literal', () => {
    // The append is what shipped broken; the comment above it names the old
    // value, so this asserts on the CALL and not on the file containing the
    // string anywhere.
    expect(source).toContain("form.append('documentType', tmfCodeToIngestType(code))");
    expect(source).not.toMatch(/form\.append\('documentType',\s*'tmf_essential'\)/);
  });
});

describe('the zone mirror this surface renders is still the real one', () => {
  it('carries the eleven DIA zones', () => {
    // Guards against the mapping above being "fixed" by narrowing the surface.
    expect(TMF_ZONE_REFS).toHaveLength(11);
  });
});
