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

export type Region = 'fda' | 'ema' | 'pmda';

export type GatewayName =
  | 'esg'              // FDA Electronic Submissions Gateway (AS2 + SFTP)
  | 'cesp'             // EMA Common European Submission Portal
  | 'eudamed'          // EU EUDAMED (device registration + vigilance)
  | 'pmda_gateway';    // PMDA Gateway secure file transfer

export type SubmissionFormat =
  | 'ectd'             // ICH eCTD (all three regions accept; backbone differs)
  | 'estar'            // FDA 510(k) eSTAR
  | 'eudamed_register' // EUDAMED device / UDI / certificate registration
  | 'pmda_ectd';       // PMDA-specific eCTD-JP

export type Transport = 'as2' | 'sftp' | 'rest' | 'soap';

export type SubmissionStatus =
  | 'pending'           // not yet transmitted
  | 'in_transit'        // bytes on the wire
  | 'received'          // gateway returned a receipt (HTTP 200 / MDN)
  | 'rejected'          // gateway rejected (auth, format, validation)
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
  /** Optional human-readable display name. */
  displayName?: string;
}

export interface GatewayTransmitRequest {
  organizationId: number;
  userId: number | null;
  programId: string | null;
  packageId: number | null;
  bundle: SubmissionBundle;
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
