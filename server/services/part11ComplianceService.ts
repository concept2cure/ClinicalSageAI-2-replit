/**
 * 21 CFR Part 11 — the submission release signature.
 *
 * createElectronicSignature applies a §11.50/§11.70/§11.200 signature to the
 * latest stored version of a document (or a caller's pre-bound release
 * digest), with its device_audit_trail event in the same transaction, and
 * records what the signing ceremony verified. computeVersionBindingDigest
 * re-derives the §11.70 binding for the verifier.
 *
 * REMOVED 2026-10-15 — methods with no caller, each of which wrote or returned
 * a conclusion nothing had established: generateSystemValidationReport
 * ("validationStatus: VALIDATED", four tests "PASS", written to the audit trail
 * as user 0), getSystemValidationStatus ("validated: true", "nextValidation"
 * in 90 days), checkAccessControl with getRolePermissions (a second, unused
 * RBAC table that audited denials as entity 0), and verifyDataIntegrity with
 * createAuditTrail, getAuditTrail and their record readers (integrity checks
 * audited as user 0 / entity 0 / "Unknown"). The live signature also stopped
 * writing "Electronic signature complies with 21 CFR Part 11" on every row.
 */

import { db } from '../db';
import { writeChainedAuditRow } from './auditService.js';
import { deviceAuditTrail, users } from '../../shared/schema';
import { documentVersions } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import crypto from 'crypto';
import auditService from './auditService';
import { buildVersionBindingDigest } from './part11/version-binding';
import type { SignerReverified } from './part11/reverify-signer';
import {
  BINDING_BASIS,
  drizzleSignatureClient,
  persistElectronicSignature,
} from './part11/signature-persistence';


class Part11ComplianceService {
  private signatureAlgorithm: string;
  private hashAlgorithm: string;

  private getDb() {
    if (!db) {
      throw new Error('Database unavailable');
    }
    return db;
  }

  constructor() {
    this.signatureAlgorithm = 'RSA-SHA256';
    this.hashAlgorithm = 'sha256';
  }

  /**
   * Generate electronic signature for a document or submission
   */
  async createElectronicSignature({
    userId,
    organizationId,
    documentId,
    documentType,
    signatureReason,
    signatureMeaning,
    reverified,
    boundPayloadDigest: preboundPayloadDigest,
    signerRole,
    transactionalAuditEvent,
    transactionalGuard,
  }: {
    userId: number;
    organizationId: number;
    documentId: number;
    documentType: string;
    signatureReason: string;
    signatureMeaning: string;
    /**
     * What the platform's one signing ceremony verified for this signer
     * (services/part11/reverify-signer.ts), which the caller runs before calling
     * here. Recorded on the row as the authentication method and whether a
     * second factor was verified. This took the password until 2026-09-23 and
     * checked it with its own password-only verifier, so a release signature
     * never asked for an enrolled second factor and always recorded
     * authentication_method 'password', second_factor_verified false.
     */
    reverified: SignerReverified;
    /**
     * An audit event the CALLER needs committed with the signature, not after
     * it. Written on this transaction via `writeChainedAuditRow`, so it lands
     * or the signature does not exist (ledger L138). Distinct from the
     * best-effort secondary log below, which is a convenience record whose
     * durable counterpart is the in-transaction device_audit_trail row.
     */
    transactionalAuditEvent?: Parameters<typeof writeChainedAuditRow>[1];
    /** Optional current-record guard enlisted before any signature INSERT.
     * The actual signature transaction owns its locks and rollback. */
    transactionalGuard?: (client: ReturnType<typeof drizzleSignatureClient>) => Promise<void>;
    /**
     * Optional pre-computed §11.70 payload-binding digest (e.g. the submission
     * orchestrator's release digest). When provided it is persisted on the row
     * AT INSERT TIME, so the signature record is complete when it is born and
     * no post-insert UPDATE is ever needed (§11.70 append-only invariant).
     * When absent, the digest is derived from the latest version content of
     * `documentId` as before.
     */
    boundPayloadDigest?: string;
    /** Signer's organization role, snapshotted into the signature manifest. */
    signerRole?: string;
  }) {
    try {
      const dbInstance = this.getDb();
      // The caller re-verified the signer; the type admits only a verified
      // result, and this guards a caller that casts around it.
      if (reverified?.ok !== true) {
        throw new Error('Electronic signature refused: the signer was not re-verified (§11.200)');
      }
      // The audit event names the signer and the document by id. These were
      // written as 0 when a caller cast around the types — a §11.10(e) event
      // attributed to "user 0" about "entity 0". Refused instead.
      if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('Electronic signature refused: no signer id to attribute the record to (§11.50)');
      }
      if (!Number.isInteger(documentId) || documentId <= 0) {
        throw new Error('Electronic signature refused: no document id to bind the signature to (§11.70)');
      }

      // Snapshot ONLY the signer-display fields the signature record needs.
      // A full-row `select().from(users)` makes Drizzle enumerate every column
      // declared in shared/schema.ts, so ANY drift between the declared users
      // table and the physical one breaks signing (ledger C-20: 16 missing
      // columns made every signature attempt report a database error). The
      // narrow select keeps credential-verified signing decoupled from
      // unrelated schema evolution.
      const [user] = await dbInstance
        .select({
          id: users.id,
          name: users.name,
          title: users.title,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('User not found');
      }

      const timestamp = new Date();
      const signatureData = {
        userId,
        userName: user.name,
        userEmail: user.email,
        organizationId,
        signerRole: signerRole ?? null,
        documentId,
        documentType,
        timestamp: timestamp.toISOString(),
        reason: signatureReason,
        meaning: signatureMeaning,
        authenticationMethod: reverified.authenticationMethod,
      };

      // §11.70 content binding: resolve the latest version AND its content, and
      // bind the signature to a deterministic digest of that content (stored in
      // bound_payload_digest). Fail CLOSED if there is no version content — a
      // signature must not be applied to content that isn't there. When the
      // caller supplies a pre-bound digest, the version row still anchors
      // version_id but the caller's digest is authoritative and the content
      // column is not read.
      const versionRows = await dbInstance
        .select({
          id: documentVersions.id,
          versionNumber: documentVersions.versionNumber,
          content: documentVersions.content,
        })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, documentId))
        .orderBy(desc(documentVersions.createdAt))
        .limit(1);
      if (versionRows.length === 0) {
        throw new Error(
          `Part 11 §11.70: document ${documentId} has no stored version — cannot bind a signature.`,
        );
      }
      const versionId = versionRows[0].id;
      const boundPayloadDigest =
        preboundPayloadDigest ??
        buildVersionBindingDigest({
          documentId,
          versionId,
          versionNumber: versionRows[0].versionNumber,
          content: versionRows[0].content,
        });

      // The attribution hash is computed over the EXACT manifest that is
      // persisted. Previously the hash covered signatureData while the stored
      // manifest additionally carried boundPayloadDigest, so
      // verifySignatureIntegrity's integrity re-derivation (which hashes
      // the stored manifest) could never match — every signature verified as
      // "integrity compromised". Hash and manifest must be the same bytes.
      const signatureManifest = { ...signatureData, boundPayloadDigest };
      const signature = this.generateCryptographicSignature(signatureManifest, userId);

      // Atomicity (§11.10(e)): the audit-trail event MUST commit together with
      // the §11.70 signature, or neither does. Previously the signature was
      // inserted and committed on its own and the audit write was a separate,
      // later statement — a failure there (DB blip, schema drift) left a
      // permanent, active signature with NO recorded event, and the caller's
      // idempotency pre-check then short-circuited every retry, so the missing
      // event could never be backfilled. One transaction closes that gap.
      const electronicSig = await dbInstance.transaction(async (tx) => {
      await transactionalGuard?.(drizzleSignatureClient(tx));
      // Ledger L37 — ONE INSERT per substrate. This used to be a second
      // `.insert(electronicSignatures)` builder living here beside the one in
      // services/part11/signature-persistence.ts. Both were conforming, and
      // that was the problem: two writers are two answers to what a Part 11 row
      // must contain, and they had already drifted — this one wrote 20 of the
      // table's 26 columns and had no way to say what `bound_payload_digest`
      // was a digest OF, while every row from the shared writer states its
      // basis. The record below is the same row, column for column, composed
      // for the shared writer and inserted by it.
      //
      // `drizzleSignatureClient(tx)` — not a pool client — so the INSERT runs on
      // THIS transaction and still commits or rolls back with the
      // device_audit_trail row below (§11.10(e), the atomicity note above).
      const sig = await persistElectronicSignature(drizzleSignatureClient(tx), {
        documentId,
        versionId,
        // The basis this row's digest actually has. A caller-supplied digest is
        // the submission orchestrator's release-package digest; otherwise it is
        // the digest buildVersionBindingDigest just took over the signed
        // version's content. Stated, never inferred: an inspector reads this
        // column to know which re-derivation answers "is this still the content
        // that was signed?".
        bindingBasis: preboundPayloadDigest
          ? BINDING_BASIS.SUBMISSION_RELEASE_PAYLOAD
          : BINDING_BASIS.DOCUMENT_VERSION_CONTENT,
        signatureType: documentType,
        signaturePurpose: signatureReason,
        signatureLevel: 1,
        signerId: userId,
        signerName: user.name,
        signerTitle: user.title,
        signerEmail: user.email,
        authenticationMethod: reverified.authenticationMethod,
        authenticationTimestamp: timestamp,
        secondFactorVerified: reverified.secondFactorVerified,
        signatureHash: signature.hash,
        signatureMeaning,
        signatureManifest,
        // The deleted builder omitted is_valid and let the column default to
        // true. Passed explicitly here because the shared writer requires it:
        // a signature's validity is an assertion, and a row should not carry it
        // by defaulting.
        isValid: true,
        verificationStatus: 'valid',
        // What was applied, in the words the other signing paths use — not a
        // conclusion. Every row used to read "Electronic signature complies
        // with 21 CFR Part 11", a determination this code does not make.
        complianceStatement:
          'Submission release signature applied after re-verification of the signer ' +
          `(${reverified.authenticationMethod}${reverified.secondFactorVerified ? ', second factor verified' : ''}) ` +
          'under 21 CFR Part 11 §11.50/§11.70/§11.200; bound to ' +
          (preboundPayloadDigest ? 'the release package digest' : 'the signed version\'s content') +
          (transactionalAuditEvent
            ? '; ledger-chained to the audit_logs sha256 chain in the same transaction.'
            : '; recorded in device_audit_trail in the same transaction.'),
        signedAt: timestamp,
        boundPayloadDigest,
        organizationId,
      });

      // Same transaction → the §11.10(e) event and the signature are
      // all-or-nothing. This inlines the primary device_audit_trail write from
      // createAuditTrail so it shares the signature's transaction.
      await tx.insert(deviceAuditTrail).values({
        organizationId,
        userId,
        action: 'ELECTRONIC_SIGNATURE_CREATED',
        entityType: documentType,
        entityId: documentId,
        previousValues: null,
        newValues: null,
        changedFields: null,
        changeReason: signatureReason,
        userName: user.name,
        userRole: null,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
      });

      // The caller's own §11.10(e) event, on THIS transaction. The release
      // route used to write `release_signature_created` after the signature had
      // already committed, on its own connection: an audit outage there left a
      // committed signature with no route-level event, and logAction resolves
      // normally on a failed write so nothing could even reject. Now the two
      // land together or neither does.
      if (transactionalAuditEvent) {
        await writeChainedAuditRow(drizzleSignatureClient(tx), transactionalAuditEvent);
      }
      return sig;
      });

      // Best-effort SECONDARY log to the general audit service — OUTSIDE the
      // transaction and non-throwing. The durable §11.10(e) record is the
      // device_audit_trail row committed atomically above; a failure of this
      // convenience log must never orphan the signature nor fail the signing.
      // logAction resolves an outcome rather than rejecting when a write does
      // not persist, so the previous bare try/catch here could never fire: a
      // silently unpersisted secondary log read as handled. The outcome is now
      // inspected, with the catch kept only as belt-and-braces for a promise
      // documented never to reject — and recorded into the same variable the
      // check below reads, so either failure path is actually observable.
      let secondaryAudit: { persisted?: boolean; error?: string } | undefined;
      try {
        secondaryAudit = await auditService.logAction({
          userId,
          action: 'ELECTRONIC_SIGNATURE_CREATED',
          resourceType: documentType,
          details: {
            signatureId: electronicSig.id,
            reason: signatureReason,
            meaning: signatureMeaning,
            userName: user.name,
          },
        });
      } catch (secondaryErr) {
        secondaryAudit = {
          persisted: false,
          error: secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr),
        };
      }
      if (!secondaryAudit?.persisted) {
        console.error(
          '[part11] secondary audit log (best-effort) did NOT persist for signature',
          electronicSig.id,
          secondaryAudit?.error,
        );
      }

      return {
        success: true,
        signatureId: electronicSig.id,
        signedBy: signatureData.userName,
        signedAt: timestamp,
        signatureHash: signature.hash,
        verificationCode: signature.verificationCode,
      };
    } catch (error) {
      console.error('Error creating electronic signature:', error);
      throw error;
    }
  }

  /**
   * Re-derive the §11.70 content-binding digest for a specific stored version.
   * Returns null when the version row or its content is absent, so the caller can
   * report the binding as UNVERIFIABLE rather than silently valid.
   */
  async computeVersionBindingDigest(versionId: number): Promise<string | null> {
    const [version] = await this.getDb()
      .select({
        id: documentVersions.id,
        documentId: documentVersions.documentId,
        versionNumber: documentVersions.versionNumber,
        content: documentVersions.content,
      })
      .from(documentVersions)
      .where(eq(documentVersions.id, versionId))
      .limit(1);
    if (!version || version.content == null || version.content === '') return null;
    return buildVersionBindingDigest({
      documentId: version.documentId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      content: version.content,
    });
  }

  // Helper methods

  // verifyUserCredentials lived here until 2026-09-23: a password-only check
  // with its own lockout counting, used by the submission release signature and
  // by createElectronicSignature. The release now re-verifies with the platform's
  // one signing ceremony (services/part11/reverify-signer.ts), which also
  // requires an enrolled second factor and keeps the sign-in's lockout, and this
  // service records what that ceremony verified (VSR-001 §16).

  /**
   * Generate cryptographic signature
   */
  generateCryptographicSignature(
    data: Record<string, any>,
    userId: number,
    ipAddress?: string | null
  ) {
    const dataString = JSON.stringify(data);
    const hash = crypto.createHash(this.hashAlgorithm).update(dataString).digest('hex');

    const verificationCode = crypto
      .createHash('md5')
      .update(`${hash}-${userId}`)
      .digest('hex')
      .substring(0, 8)
      .toUpperCase();

    return {
      hash,
      data: dataString,
      verificationCode,
      // Honest attribution: record the real client IP when the caller threads it
      // (route handlers have req.ip), or null when unknown — never a fabricated
      // 127.0.0.1. See FORENSIC_CODE_AUDIT_2026-05-29.md (MEDIUM: Part 11 attribution).
      ipAddress: ipAddress ?? null,
    };
  }

}

// Export singleton instance
export default new Part11ComplianceService();
