/**
 * eCTD v4.0 (ICH / HL7 RPS) canonical model.
 *
 * eCTD v4.0 replaces the v3.2.2 folder+heading model with an object graph:
 * a single `submissionUnit.xml` HL7 RPS message binds a Submission Unit → a
 * Submission → an Application, and carries a flat list of **Contexts of Use**
 * (CoU). Each CoU points at a **Document** (documents are reusable across CoUs),
 * carries a **priority number** (ordering), optional **keywords**, and — for
 * lifecycle — a **relatedContextOfUse** reference to the CoU it supersedes.
 *
 * This is the region-agnostic input model consumed by the RPS message builder,
 * the v3.2.2 → v4.0 forward-compat mapper, and the RPS validator.
 *
 * @module server/services/ectd/ectd4/types
 */

/** RPS lifecycle operation codes (the v4.0 analogue of v3.2.2 new/replace/append/delete). */
export type RpsOperation = 'create' | 'revise' | 'append' | 'remove' | 'nullify';

/** FDA review center — selects the Application Id root OID. */
export type FdaCenter = 'cder' | 'cber' | 'cdrh';

/** A physical document referenced by one or more Contexts of Use. Documents are
 *  reusable: the same document id may be pointed at by multiple CoUs. */
export interface RpsDocument {
  /** Stable UUID (id@root). Derive deterministically for reproducibility. */
  id: string;
  /** Document title (required, must be stable across lifecycle operations). */
  title: string;
  /** Package-relative href to the physical file. */
  href: string;
  /** IANA media type, e.g. 'application/pdf'. */
  mediaType: string;
  /** Integrity hash of the referenced file. */
  checksum: string;
  /** Hash algorithm. eCTD v4.0 uses SHA-256 for document integrity. */
  checksumType: 'SHA256';
}

/** A keyword applied to a Context of Use (e.g. manufacturer, substance, study id). */
export interface RpsKeyword {
  /** Keyword-definition code (from a keyword code system, e.g. CL3). */
  code: string;
  /** Code-system OID governing `code`. */
  codeSystem: string;
  /** Optional free-text value (e.g. the actual study id / material id). */
  value?: string;
  /** Optional display name. */
  displayName?: string;
}

/** One Context of Use — binds a document into the CTD at a section, with order + lifecycle. */
export interface RpsContextOfUse {
  /** Stable UUID (contextOfUse.id@root). */
  id: string;
  /** CoU code — the CTD "section", from the context-of-use code list (CL2). */
  code: string;
  /** Code-system OID governing `code`. */
  codeSystem: string;
  /** Optional human title. */
  title?: string;
  /** Priority number: a whole number giving CoU order within the section. */
  priorityNumber: number;
  /** Lifecycle status. */
  status: 'active' | 'suspended';
  /** The document this CoU presents (documentReference → RpsDocument.id). */
  documentId: string;
  /** Keywords qualifying this CoU. */
  keywords?: RpsKeyword[];
  /** For a lifecycle operation, the id of the prior CoU this one supersedes. */
  relatedContextOfUseId?: string;
  /** RPS operation this CoU represents (defaults to 'create'). */
  operation?: RpsOperation;
}

/** The Application the submission belongs to. */
export interface RpsApplication {
  /** Application number, e.g. '123456' (NDA) or the IND number. */
  number: string;
  /** Application-type code (application-type code list, CL1). */
  typeCode: string;
  /** Review center — selects the Application Id root OID. */
  center: FdaCenter;
}

/** The Submission (regulatory activity) the unit belongs to. */
export interface RpsSubmission {
  /** Submission-type code (submission-type code list, CL12). */
  typeCode: string;
  /** Optional submission id/number (e.g. the efficacy-supplement number). */
  number?: string;
}

/** The Submission Unit (this sequence). */
export interface RpsSubmissionUnit {
  /** Stable UUID (submissionUnit.id@root). */
  id: string;
  /** Submission-unit-type code (submission-unit-type code list, CL13). */
  unitTypeCode: string;
  /** Title (FDA limit: 128 characters). */
  title: string;
  /** Four-digit zero-padded sequence number, matching the folder name. */
  sequenceNumber: string;
  /** Lifecycle status — a live submission unit is always 'active'. */
  status: 'active';
}

/** Full input to the RPS message builder. */
export interface RpsMessageInput {
  submissionUnit: RpsSubmissionUnit;
  submission: RpsSubmission;
  application: RpsApplication;
  contextsOfUse: RpsContextOfUse[];
  documents: RpsDocument[];
  /** Message id (UUID). Derived deterministically when omitted. */
  messageId?: string;
  /** HL7 creationTime, `YYYYMMDDHHMMSS`. Caller supplies for determinism. */
  creationTime?: string;
}
