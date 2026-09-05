/**
 * Submission gateway abstractions — shared types for FDA ESG, EMA CESP /
 * EUDAMED, and PMDA Gateway. Every gateway implementation conforms to the
 * SubmissionGateway interface so the route layer and AnA tools dispatch
 * by region without branching on protocol details.
 *
 * Real protocol code lives in the per-gateway files (fda-esg.ts,
 * ema-cesp.ts, eudamed.ts, pmda-gateway.ts). When credentials aren't
 * configured for an org × region, the gateway throws a structured
 * CredentialError instead of silently failing — the kit surfaces this
 * as a "gateway not configured" state.
 */

import {
  resolveToRegistryEntry,
  resolveToDeficiencyType,
  getSubmissionTypeContext,
  getSubmissionTypeLabel,
  isKnownSubmissionType,
  type SubmissionTypeContext,
} from '../../../shared/regulatory/submission-type-bridge.js';

export {
  resolveToRegistryEntry,
  resolveToDeficiencyType,
  getSubmissionTypeContext,
  getSubmissionTypeLabel,
  isKnownSubmissionType,
  type SubmissionTypeContext,
};

export type Region =
  | 'fda'   // US — FDA
  | 'ema'   // EU — EMA / EUDAMED
  | 'pmda'  // JP — PMDA
  | 'ca'    // Canada — Health Canada
  | 'uk'    // UK — MHRA
  | 'cn'    // China — NMPA / CDE
  | 'au'    // Australia — TGA
  | 'ch'    // Switzerland — Swissmedic
  | 'br'    // Brazil — ANVISA
  | 'in'    // India — CDSCO / SUGAM
  | 'kr'    // South Korea — MFDS / dBio
  | 'sg';   // Singapore — HSA / PRISM

export type GatewayName =
  | 'esg'                   // FDA Electronic Submissions Gateway (AS2 + SFTP)
  | 'cesp'                  // EMA Common European Submission Portal
  | 'eudamed'               // EU EUDAMED (device registration + vigilance)
  | 'pmda_gateway'          // PMDA Gateway secure file transfer
  | 'hc_cesg'               // Health Canada Common Electronic Submissions Gateway
  | 'mhra_gateway'          // MHRA Product Submissions REST API (post-Brexit)
  | 'nmpa_gateway'          // NMPA / CDE electronic submission portal (China)
  | 'tga_ebs'               // TGA eBusiness Services REST API (Australia)
  | 'swissmedic_egateway'   // Swissmedic eGateway REST API (Switzerland)
  | 'anvisa_gateway'        // ANVISA SOLICITA electronic submissions (Brazil)
  | 'cdsco_sugam'           // CDSCO SUGAM portal REST API (India)
  | 'mfds_dbio'             // MFDS dBio system REST + mTLS (South Korea)
  | 'hsa_prism';            // HSA PRISM / MEDICS REST API (Singapore)

export type SubmissionFormat =
  | 'ectd'             // ICH eCTD (all regions accept; backbone differs — incl. CA Module 1)
  | 'estar'            // FDA 510(k) eSTAR
  | 'eudamed_register' // EUDAMED device / UDI / certificate registration
  | 'pmda_ectd';       // PMDA-specific eCTD-JP

export type Transport = 'as2' | 'sftp' | 'rest' | 'soap';

export type SubmissionStatus =
  | 'pending'           // not yet transmitted
  | 'in_transit'        // bytes on the wire
  | 'received'          // gateway returned a receipt (HTTP 200 / MDN)
  | 'rejected'          // gateway rejected (auth, format, validation)
  | 'rolled_back'       // operator-initiated rollback after transmit; paired with
                        // a `transmittal_rollback` governed action (audit trail)
                        // and a WebTrader retraction per the FDA ESG UAT runbook
  | 'ack1_received'     // FDA: receipt-of-transmission
  | 'ack2_received'     // FDA: virus scan / structure check passed
  | 'ack3_received'     // FDA: center-specific acceptance
  | 'validation_passed' // post-receipt regional validator passed
  | 'validation_failed' // post-receipt validator returned errors
  | 'review_started'    // agency review opened
  | 'response_required' // deficiency letter / RTA notice received
  | 'completed';        // final agency action

export type ErrorClass =
  | 'auth'              // missing/invalid credentials
  | 'transport'         // network / TLS / connection failure
  | 'validation'        // package failed pre-transmit or post-receipt validation
  | 'gateway'           // gateway returned a structured error
  | 'timeout';

export interface SubmissionBundle {
  /** Absolute path to the assembled package on disk. */
  path: string;
  /** SHA-256 of the package — recorded for integrity + audit. */
  sha256: string;
  /** Bytes on disk after assembly. */
  sizeBytes: number;
  /** Region-specific format flag. */
  format: SubmissionFormat;
  /**
   * Per-sequence leaf manifest: each SHIPPED leaf's CTD section + final package
   * href + md5 (+ optional op/title). The exporter/compiler persists this as the
   * sequence's immutable `leaf_manifest`; the NEXT sequence loads it
   * (loadPriorSequenceManifest) and diffs to derive replace/append/delete
   * lifecycle operations. Raw shape (fed through buildLeafManifest before
   * persisting) so the packager needs no ectd/ import. Optional: a bundle may be
   * constructed outside the packager (integrity checks) without one.
   */
  leafManifest?: Array<{
    ctdSection: string;
    fileName: string;
    href: string;
    md5: string;
    operation?: string;
    title?: string;
  }>;
  /** Optional human-readable display name. */
  displayName?: string;
  /**
   * Optional PDF/A submission-grade roll-up for the package's leaves — whether
   * every PDF leaf was converted to PDF/A-1b and, if not, which were not. Set by
   * the packager; consumed by the PDF/A readiness gate. Shape matches
   * `SubmissionGradeSummary` in server/services/ectd/pdfa-readiness.ts (kept
   * structural here to avoid a cross-layer import cycle).
   */
  submissionGrade?: {
    total: number;
    pdfLeaves: number;
    pdfaConverted: number;
    notConverted: string[];
    allPdfA: boolean;
  };
  /**
   * Optional eCTD DTD self-containment status: whether every DTD the backbones
   * reference is bundled in the package, and which are missing. Set by the
   * packager; consumed by the DTD readiness gate. Shape matches the relevant
   * fields of `DtdReadinessResult` in server/services/ectd/dtd-bundler.ts.
   */
  dtdStatus?: {
    required: string[];
    present: string[];
    missing: string[];
    selfContained: boolean;
  };
  /**
   * Optional regional Module 1 backbone status: whether the region has its OWN
   * conformant M1 backbone (fda / ema / pmda / ca) or the written
   * `<cc>-regional.xml` is an EMA-structure PLACEHOLDER (the eight widened
   * regions). Set by the packager; consumed by the pre-transmit gate so a
   * placeholder can never be read as region-conformant. Shape matches
   * `RegionalBackboneStatus` in server/services/ectd/regional-backbone-readiness.ts.
   */
  regionalBackbone?: {
    region: Region;
    file: string;
    regionConformant: boolean;
    /** Not conformant because another region's structure is reused. */
    placeholderOf?: Region;
    /** Not conformant for the region's own builder: the specific gap. */
    conformanceGap?: string;
  };
  /** The region the bundle was BUILT for, as recorded on its descriptor by the
   *  assemble route. Lets the pre-transmit region-identity check hold for
   *  bundles with no backbone evidence (device formats). */
  builtRegion?: Region;
  /**
   * Optional Study Tagging File (STF) roll-up: how many per-study stf.xml files
   * were generated + cross-linked into M4/M5, and how many study leaves were
   * untagged (missing a studyId). Set by the packager when study leaves are
   * present; absent otherwise.
   */
  stf?: {
    studies: number;
    leaves: number;
    untagged: number;
  };
  /**
   * Optional intra-package cross-reference resolution result: how many declared
   * hyperlinks between leaves resolved, and which are broken (dangling /
   * withdrawn target). Set by the packager only when `crossReferences` were
   * declared; absent otherwise.
   */
  crossReferenceStatus?: {
    resolved: number;
    broken: Array<{ source: string; target: string; reason: 'TARGET_NOT_FOUND' | 'TARGET_DELETED' }>;
    ok: boolean;
  };
}

/**
 * Proof that a HUMAN authorised this specific transmission.
 *
 * Transmitting is the one irreversible action in the platform: once bytes reach
 * an agency gateway nothing here can un-send them (see FdaEsgGateway.rollback,
 * which records a rollback in this platform's audit trail and says so). It must
 * therefore never be reachable from an automated caller that has not passed a
 * human gate.
 *
 * It was. Three callers reached the gateways; two enforced re-authentication, a
 * reason, a structural gate and a governed-action ledger write, and the third —
 * the AnA `transmit_submission` tool — enforced only that a tenant context
 * existed, and defaulted `environment` to 'production' when the model omitted
 * it. A conversational agent could file to the real FDA ESG endpoint with no
 * human in the loop at all.
 *
 * This union is the fix, and its shape is the point: there is no variant an
 * autonomous caller can honestly construct, and because the field is required,
 * the compiler enumerates every call site that has to declare which human gate
 * it passed. Adding a new transmit caller is now a decision rather than an
 * oversight.
 */
export type TransmitAuthorization =
  /** The governed HTTP route: re-authentication verified, reason recorded, structural gate passed. */
  | {
      kind: 'governed-http';
      /** The human whose credentials were re-verified for this transmission. */
      actorUserId: number;
      /** Operator-supplied reason, already length-validated by the route. */
      reason: string;
      /** When the re-authentication succeeded. */
      reauthVerifiedAt: Date;
    }
  /** The sequence dispatch path: a Part 11 electronic signature over this sequence. */
  | {
      kind: 'governed-signature';
      /** governed_actions row proving the signature. */
      signatureActionId: string;
      actorUserId: number;
    };

export interface GatewayTransmitRequest {
  organizationId: number;
  userId: number | null;
  programId: string | null;
  packageId: number | null;
  bundle: SubmissionBundle;
  /**
   * Which human gate this transmission passed. Required — see
   * TransmitAuthorization. Enforced at runtime by the guard in ./index.ts, so a
   * caller that defeats the type system still cannot transmit.
   */
  authorization: TransmitAuthorization;
  /** Environment to transmit against — 'production' for real agency
   *  submission, 'staging' for the gateway's pre-production endpoint
   *  (used by ops + AnA dry-run flows). */
  environment: 'staging' | 'production';
  /** Submission type tag stored on the transmittal row. */
  submissionType?: string;
  /** Free-form metadata stored on the transmittal row. */
  metadata?: Record<string, unknown>;
}

export interface GatewayTransmitResult {
  transmittalId: number;
  transmissionId: string | null;
  status: SubmissionStatus;
  transport: Transport;
  httpStatus: number | null;
  ackReceivedAt: Date | null;
  message: string;
}

export interface GatewayStatusResult {
  transmittalId: number;
  transmissionId: string;
  status: SubmissionStatus;
  ackLevel?: 1 | 2 | 3;
  ackReceivedAt: Date | null;
  rawResponse?: unknown;
}

export interface GatewayAcknowledgment {
  transmittalId: number;
  transmissionId: string;
  contentType: string;
  buffer: Buffer;
  receivedAt: Date;
  /**
   * Who authored these bytes.
   *
   * 'agency'          — the agency's own response, stored verbatim at transmit
   *                     time (today: an FDA AS2 MDN). Evidence of receipt.
   * 'platform-record' — a summary this platform composed from its own
   *                     transmittal row. NOT evidence of receipt.
   *
   * This field exists because the difference was previously invisible. Twelve
   * gateways composed a text file headed "<Agency> Acknowledgement" out of
   * their own database row, the download route served it as
   * `ack-<id>.txt` with no marker, and the surface told the user it was "the
   * agency's actual bytes" — so a sponsor could file a self-authored document
   * in a regulatory archive as proof an agency received a submission.
   */
  provenance: 'agency' | 'platform-record';
}

export interface SubmissionGateway {
  readonly region: Region;
  readonly gateway: GatewayName;
  readonly transport: Transport;

  /** Returns true when the (org, environment) tuple has configured
   *  credentials. False means the gateway throws CredentialError on
   *  transmit / status / ack. The kit surfaces this as a "gateway
   *  not configured" state. */
  isConfigured(organizationId: number, environment: 'staging' | 'production'): Promise<boolean>;

  /** Transmit the bundle. Real wire-level activity happens here. */
  transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult>;

  /** Poll the gateway for the current status of a transmission. */
  checkStatus(transmittalId: number): Promise<GatewayStatusResult>;

  /** Download the latest acknowledgement payload for a transmission. */
  downloadAcknowledgment(transmittalId: number): Promise<GatewayAcknowledgment>;
}

/**
 * Thrown when a transmit request carries no valid human authorization.
 *
 * Deliberately NOT a subclass of GatewayError: this is refused before any
 * transport is touched, and callers must not report it as an agency failure.
 */
export class TransmitAuthorizationError extends Error {
  readonly errorClass = 'authorization' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TransmitAuthorizationError';
  }
}

/** Thrown when an (org, environment) is missing required credentials. */
export class CredentialError extends Error {
  readonly errorClass = 'auth' as const;
  constructor(
    readonly region: Region,
    readonly gateway: GatewayName,
    readonly environment: 'staging' | 'production',
    readonly missing: string[],
  ) {
    super(
      `${region.toUpperCase()} ${gateway} (${environment}) — missing credentials: ${missing.join(', ')}. ` +
      `See docs/runbooks/${region}-${gateway}-setup.md.`,
    );
    this.name = 'CredentialError';
  }
}

/** Thrown by transports when the network call itself fails (TLS, DNS, timeout). */
export class TransportError extends Error {
  readonly errorClass = 'transport' as const;
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TransportError';
  }
}

/** Thrown by gateways when they return a structured error (HTTP 4xx/5xx,
 *  MDN with disposition=error, SOAP fault, etc.). */
export class GatewayError extends Error {
  readonly errorClass = 'gateway' as const;
  constructor(
    message: string,
    readonly httpStatus: number | null,
    readonly gatewayCode: string | null,
    readonly raw: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/** Thrown when the package fails pre-transmit validation. */
export class ValidationError extends Error {
  readonly errorClass = 'validation' as const;
  constructor(message: string, readonly findings: unknown[]) {
    super(message);
    this.name = 'ValidationError';
  }
}
