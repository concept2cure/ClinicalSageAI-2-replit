/**
 * What the assembly says about PDF/A is read by the person assembling the report ("Assemble CSR files", in the CSR
 * document's build section). Showcase walk, 2026-11-10: it named a function and a setting, "PDF/A conversion is the
 * packager's finalizePdfA (Ghostscript) at packaging, where installed; ECTD_REQUIRE_PDFA=true refuses an unconverted
 * leaf."
 */
import { expect, it } from 'vitest';
import { CSR_ASSEMBLY_PDFA_STATEMENT } from '../csr-assembly';

it('says in words when the files become PDF/A, and names no function, tool or setting', () => {
  expect(CSR_ASSEMBLY_PDFA_STATEMENT).not.toMatch(/finalizePdfA|Ghostscript|ECTD_REQUIRE_PDFA|=true/);
  expect(CSR_ASSEMBLY_PDFA_STATEMENT).toMatch(/PDF 1\.7/);
  expect(CSR_ASSEMBLY_PDFA_STATEMENT).toMatch(/converted to PDF\/A when the sequence is packaged/);
  expect(CSR_ASSEMBLY_PDFA_STATEMENT).toMatch(/requires PDF\/A refuses a file that was not converted/);
});
