/**
 * WO-16B findings 28, 29 and 30 — two signature writers beside the canonical
 * one, and a verifier that verified nothing.
 *
 *   28  grdheService.createElectronicSignature wrote the USER ID into the
 *       §11.50 printed-name field, hashed `type|id|version|now()` rather than
 *       any content, and recorded `authentication_method` and an
 *       `authentication_timestamp` for a password it never checked.
 *   29  grdheService.verifyElectronicSignature computed a hash, discarded it,
 *       and returned `{ valid: true }` for every non-invalidated row.
 *   30  POST /api/stability/studies/:id/request-signoff demanded a password it
 *       never verified, derived the signer's printed name from an email
 *       local-part, and stored `${stage}-${Date.now()}` as the "hash".
 *
 * There is ONE conforming signature write path (services/part11/
 * signature-persistence.ts, behind /api/esignature/sign, password verified by
 * part11ComplianceService.verifyUserCredentials). The precedent for a second
 * one is server/services/__tests__/signature-write-path-single.test.ts: the
 * writer is deleted and the route answers 410 naming the canonical one. This
 * file extends that contract to the two writers WO-16B found. Source-level on
 * purpose — reintroduction is the failure mode, and it would look like working
 * code.
 *
 * RED on the pre-fix head on every assertion below.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
/** Comments stripped: the retirement notes NAME the deleted calls. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const GRDHE_SERVICE = 'server/services/grdhe/grdheService.ts';
const GRDHE_ROUTES = 'server/routes/grdheRoutes.ts';
const STABILITY = 'server/src/routes/stability.router.ts';

describe('no second electronic-signature writer (WO-16B)', () => {
  it('grdheService no longer writes or "verifies" signatures', () => {
    const src = code(read(GRDHE_SERVICE));
    expect(/INSERT\s+INTO\s+regulatory_harmonization\.electronic_signatures/i.test(src)).toBe(false);
    expect(/async\s+createElectronicSignature\s*\(/.test(src)).toBe(false);
    expect(/async\s+verifyElectronicSignature\s*\(/.test(src)).toBe(false);
  });

  it('the GRDHE signing route answers 410 and names the canonical route', () => {
    const src = read(GRDHE_ROUTES);
    expect(src).toContain("router.post('/signatures'");
    expect(src).toContain('410');
    expect(src).toContain('ESIGNATURE_ENDPOINT_REMOVED');
    expect(src).toContain('/api/esignature/sign');
    expect(code(src)).not.toContain('grdheService.createElectronicSignature');
  });

  it('the GRDHE verify route no longer answers valid:true for every row', () => {
    const src = code(read(GRDHE_ROUTES));
    expect(src).not.toContain('grdheService.verifyElectronicSignature');
    expect(src).toContain('/electronic-signature/:id/verify');
  });

  it('the stability sign-off no longer records an unverified signature', () => {
    const src = code(read(STABILITY));
    expect(/insert\s+into\s+stab_signoffs/i.test(src)).toBe(false);
    expect(src).toContain("router.post('/studies/:id/request-signoff'");
    expect(src).toContain('410');
    expect(src).toContain('STABILITY_SIGNOFF_REMOVED');
  });
});
