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
    /** For replace/append/delete: the filed leaf acted on, from this sequence's root. */
    modifiedFile?: string;
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
    /** Agency forms shipped as issued; absent on bundles built before 2026-09-22. */
    agencyFormsAsIssued?: string[];
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
    /**
     * The util/style/*.xsl stylesheets the region's backbones reference and the
     * package does NOT contain. `selfContained` has always accounted for these
     * (assessDtdReadiness ORs both gaps), but only the DTD half was carried
     * here — so the pre-transmit gate refused a stylesheet-only gap with an
     * empty file list, naming nothing the operator could act on. Optional
     * because bundles assembled before this field existed carry no value; the
     * gate must read its absence as "not itemised", never as "none missing".
     */
    missingStylesheets?: string[];
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
  /**
   * What the transmit guard (getGateway) checked on the package before sending,
   * including checks that FAILED without blocking (a flag-gated check not
   * enforced in this environment) and its warnings. Attached by the guard, not
   * by a gateway. 2026-09-22 (W5/D7): these were computed and discarded, so a
   * package that failed DTD self-containment transmitted with no trace of it.
   * Shape mirrors PreTransmitCheck (pre-transmit-check.ts), kept structural to
   * avoid an import cycle.
   */
  preTransmit?: {
    checks: Array<{ name: string; passed: boolean; detail: string }>;
    warnings: string[];
    /** PDF entries whose security was judged from the signed bundle, and agency forms shipped as issued. */
    leafSecurity: { pdfEntries: number; agencyFormsAsIssued: string[] } | null;
  };
}

export interface GatewayStatusResult {
  transmittalId: number;
  transmissionId: string;
  status: SubmissionStatus;
  ackLevel?: 1 | 2 | 3;
  ackReceivedAt: Date | null;
  rawResponse?: unknown;
  /**
   * Where this status came from: 'agency' when checkStatus() asked the agency
   * just now, 'stored' when it re-read the platform's own last-known row.
   * FDA ESG has no live poll yet; its stored row was presented as a live check.
   */
  source: 'agency' | 'stored';
  /**
   * Why the agency was not asked, when source is 'stored' after a poll was
   * attempted: the poll threw, or the agency answered something other than a
   * status. Every gateway used to swallow this and hand back the stored row
   * as if it were the poll's answer.
   */
  pollError?: string | null;
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

/**
 * Thrown when an (org, environment) is missing required credentials.
 *
 * refusedBeforeWire (index.ts) reads every CredentialError as proof nothing was
 * sent, so a transmit claim is released on it. Throw it only from a credential
 * check made before any request is opened — never after bytes may have left.
 * The audited sites are pinned in __tests__/refused-before-wire.test.ts.
 * 2026-09-23 (W5/D7, round-3 skeptic): it was not recognised, so a >1 GiB FDA
 * sequence refused by transmitViaSftp for missing SFTP credentials (which
 * isConfigured, AS2 only, does not check) was stranded at 'transmitting'.
 */
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

/**
 * Thrown by transports when the network call itself fails (TLS, DNS, timeout),
 * or when the transport cannot be used at all.
 *
 * Delivery is unknown unless the throw site passed NOTHING_TRANSMITTED. The
 * proof may be passed only by a site that HAS proof:
 *   - a refusal made before any connection is opened (e.g. the transport's
 *     client module is unavailable); or
 *   - a NOT_DELIVERED verdict of the delivery classifier (classifyDelivery,
 *     ./as2-transport.ts), which is itself the proof that nothing reached an
 *     authenticated agency server: a failure before the server accepted our
 *     client (the request still corked, not a byte written) or the server's
 *     own TLS refusal alert. That verdict never rests on the timing of Node's
 *     request 'finish', which can trail the server's read of the whole
 *     body (2026-09-23, W5/D7, MDN close, repair).
 * Never for a DELIVERED_UNCONFIRMED verdict, and never from a connect/send
 * failure that has not been through the classifier: the agency may hold the
 * bytes, and a false proof resets the sequence to 'pending' and invites a
 * second transmission.
 * 2026-09-23 (W5/D7, round-3 skeptic): the proof was added for the FDA SFTP
 * client-module refusal, which stranded a >1 GiB sequence at 'transmitting'.
 * 2026-09-23 (W5/D7, MDN close): extended to the classifier's NOT_DELIVERED
 * (FDA ESG recordAs2Outcome), which recorded its row 'rejected' but left the
 * sequence claim 'transmitting' — e.g. after FDA refused our client
 * certificate.
 */
export class TransportError extends Error {
  readonly errorClass = 'transport' as const;
  /** `false` only when the throw site passed NOTHING_TRANSMITTED; absent proves nothing. */
  readonly transmitted?: false;
  constructor(message: string, readonly cause?: unknown, proof?: typeof NOTHING_TRANSMITTED) {
    super(message);
    this.name = 'TransportError';
    if (proof?.transmitted === false) this.transmitted = false;
  }
}

/**
 * Thrown by a transport whose credentials resolved but whose wire contract has
 * NOT been verified against the agency's published specification, so the
 * platform refuses to put bytes on it. Distinct from CredentialError (you are
 * not provisioned) and TransportError (the network call failed): this is "the
 * platform will not guess the agency's API". Nothing is transmitted, no
 * transmittal row is created, no identifier is minted. `transmitted` is a
 * literal false so a caller reading the error as data cannot mistake it for an
 * acknowledgement — and so refusedBeforeWire (index.ts) releases a transmit
 * claim on it. 2026-09-23 (W5/D7, round-2 skeptic): it did not, so every FDA
 * sequence transmit with FDA_ESG_TRANSPORT=rest was stranded at 'transmitting'.
 * Throw it only where nothing can have left the process.
 *
 * Today: the FDA ESG NextGen REST transport (`FDA_ESG_TRANSPORT=rest`). FDA
 * retired WebTrader in April 2025 and offers a REST API beside AS2; the request
 * and response shapes must be taken from FDA's ESG NextGen API documentation
 * and exercised in FDA's pre-production environment before the refusal below is
 * replaced by a real call.
 */
export class UnverifiedTransportError extends Error {
  readonly errorClass = 'transport' as const;
  readonly transmitted = false as const;
  constructor(
    readonly region: Region,
    readonly gateway: GatewayName,
    readonly transport: Transport,
    detail: string,
  ) {
    super(
      `${region.toUpperCase()} ${gateway} ${transport} transport is configured but its wire contract has not been ` +
      `verified against the agency specification; nothing was transmitted. ${detail}`,
    );
    this.name = 'UnverifiedTransportError';
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

/**
 * The eCTD sequence number and submission type a gateway writes into the
 * agency's metadata. Refuses to default them: every gateway used to fill an
 * absent sequence with '0000' (or '0001') and an absent type with 'initial',
 * so a follow-up sequence whose caller forgot the metadata was announced to
 * the agency as an original submission.
 */
export function requiredAgencyMetadata(req: GatewayTransmitRequest): { sequenceNumber: string; submissionType: string } {
  const raw = req.metadata?.sequence;
  const sequenceNumber = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw).padStart(4, '0') : '';
  // 2026-09-23 (W5/D7, round-2 skeptic): both refusals carry the typed
  // `transmitted: false` proof. This is a pure check of the request, and every
  // gateway runs it before its transmittal row and before any socket, so a
  // claim held by the caller is released (refusedBeforeWire) instead of left
  // 'transmitting' for a sequence that was never sent.
  if (!/^\d{4}$/.test(sequenceNumber)) {
    throw new ValidationError('Transmit requires the four-digit eCTD sequence number in metadata.sequence; nothing is sent without it.', [], NOTHING_TRANSMITTED);
  }
  const submissionType = typeof req.submissionType === 'string' ? req.submissionType.trim() : '';
  if (!submissionType) {
    throw new ValidationError('Transmit requires the submission type; nothing is sent without it.', [], NOTHING_TRANSMITTED);
  }
  return { sequenceNumber, submissionType };
}

/**
 * The typed proof a throw site passes when it can show nothing was sent — a
 * check made before any connection is opened and before any byte leaves the
 * process. ValidationError and TransportError accept it. Read only by
 * refusedBeforeWire (index.ts). Never pass it from a site that can run after a
 * request was opened, with ONE exception: the delivery classifier's
 * NOT_DELIVERED verdict (see TransportError), whose rule is exactly the proof
 * that the request never reached an authenticated agency server. A false
 * proof resets a sequence that may be at the agency to 'pending' and invites
 * a second transmission. A site after the gateway's transmittal row may pass
 * it only when that row is then recorded as refused. 2026-09-23 (W5/D7,
 * round-2 skeptic; round-3 skeptic: extended to TransportError; MDN close:
 * the classifier's NOT_DELIVERED).
 */
export const NOTHING_TRANSMITTED = Object.freeze({ transmitted: false as const });

/** Thrown when the package fails pre-transmit validation. */
export class ValidationError extends Error {
  readonly errorClass = 'validation' as const;
  /**
   * `false` only when the throw site passed NOTHING_TRANSMITTED; absent means
   * delivery is unknown and the error proves nothing. 2026-09-23 (W5/D7,
   * round-2 skeptic).
   */
  readonly transmitted?: false;
  constructor(message: string, readonly findings: unknown[], proof?: typeof NOTHING_TRANSMITTED) {
    super(message);
    this.name = 'ValidationError';
    if (proof?.transmitted === false) this.transmitted = false;
  }
}
