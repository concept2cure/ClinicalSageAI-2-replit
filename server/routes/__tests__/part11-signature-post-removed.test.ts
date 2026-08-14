/**
 * Contract: `POST /api/part11/signatures` is GONE, and nothing in the Part 11
 * router writes electronic_signatures.
 *
 * HISTORY. This file replaces part11-signature-identity-binding.test.ts, which
 * exercised a §11.200(a)(2) signer-identity fix on an endpoint that could never
 * reach its own INSERT in production: the statement named columns that do not
 * exist on the physical `electronic_signatures` table (document_version,
 * signer_organization, meaning, custom_meaning, password_verified,
 * mfa_verified, user_agent, timestamp, and a uuid `id` against a serial PK).
 * Every real call raised 42703 → 500. The old suite passed only because its
 * fake pool accepted any SQL as a no-op — the phantom columns were invisible to
 * it, which is exactly why an "endpoint works" assertion over a stubbed pool is
 * not evidence.
 *
 * The endpoint was deleted rather than migrated onto persistElectronicSignature:
 * it had no caller in client/ or server/, and repairing it would have produced a
 * second live document-signing surface whose §11.70 binding is a hash of
 * CALLER-SUPPLIED content (unre-derivable by an inspector) next to
 * /api/esignature/sign, which binds the STORED version bytes. Zero duplication:
 * one signing entry point per substrate, one INSERT
 * (server/services/part11/signature-persistence.ts).
 *
 * These tests hold that line: the route is absent, the read/verification
 * endpoints that serve BOTH write paths survive, and the router source contains
 * no INSERT into electronic_signatures at all (so no phantom-column statement
 * can be reintroduced here unnoticed).
 *
 * @compliance 21 CFR Part 11 §11.70, §11.200
 */

import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import part11Router from '../part11-compliance';

const ROUTER_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'part11-compliance.ts'),
  'utf8',
);

/**
 * The router's CODE with comments stripped. The surviving comments deliberately
 * NAME the phantom columns (that is the record of why the statements that used
 * them were removed), so the scan below must look at executable source only —
 * otherwise the documentation of the fix would read as the defect.
 */
const ROUTER_CODE = ROUTER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: 42, userId: 42, email: 'genuine.owner@example.com', role: 'admin', organizationId: 7 };
    // A pool that THROWS on any query: if some handler still tried to sign here,
    // the test would surface it rather than silently accepting stubbed SQL.
    req.pool = { query: async () => { throw new Error('no query expected on this path'); } };
    next();
  });
  app.use('/api/part11', part11Router);
  return app;
}

describe('POST /api/part11/signatures — removed (single e-signature write path)', () => {
  it('is not routed: the signing entry point no longer exists', async () => {
    const res = await request(buildApp())
      .post('/api/part11/signatures')
      .send({
        documentId: 'doc-2',
        documentContent: '<p>Clinical Overview v0.7</p>',
        meaning: 'approval',
        password: 'correct-horse',
      });
    expect(res.status).toBe(404);
  });

  it('the Part 11 router never INSERTs into electronic_signatures (no phantom columns)', () => {
    expect(/INSERT\s+INTO\s+electronic_signatures/i.test(ROUTER_CODE)).toBe(false);
    // The phantom column names that made the old statement unexecutable must not
    // reappear in any statement in this router.
    // ('signer_organization' is deliberately absent from this list: the manifest
    //  endpoint produces it as an OUTPUT ALIAS over organizations.name —
    //  `o.name AS signer_organization` — never as a column of the signature row.)
    for (const phantom of [
      'document_version',
      'custom_meaning',
      'password_verified',
      'mfa_verified',
      'user_agent',
    ]) {
      expect(
        new RegExp(`\\b${phantom}\\b`).test(ROUTER_CODE),
        `physical electronic_signatures has no '${phantom}' column`,
      ).toBe(false);
    }
  });

  it('keeps the read/verification surface that serves BOTH write paths', () => {
    const routes = (part11Router as any).stack
      .filter((l: any) => l.route)
      .map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);

    expect(routes).toContain('GET /signatures/:documentId');
    expect(routes).toContain('GET /signatures/:signatureId/manifest');
    // …and no POST signing route survives.
    expect(routes).not.toContain('POST /signatures');
  });
});
