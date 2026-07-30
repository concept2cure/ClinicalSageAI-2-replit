/**
 * eCTD packager — shared leaf/backbone types.
 *
 * The dependency-free type surface of the regional packager, split out so the
 * primitives (leaf-id, md5-index, paths) and the packager core can all share
 * them without importing the 800-line orchestrator. `regional-packager.ts`
 * re-exports the public ones (EctdLeaf, Fda*) so every existing importer keeps
 * its stable `../regional-packager` import path.
 *
 * @module server/services/submission-gateways/ectd-packager/types
 */

/** One leaf in the eCTD index — corresponds to one file under one CTD section. */
export interface EctdLeaf {
  /** CTD section code, e.g. '1.1', '2.5', '3.2.S.1.1', '5.3.5.1'. */
  ctdSection: string;
  /** Operation per ICH M2: 'new' | 'append' | 'replace' | 'delete'. */
  operation: 'new' | 'append' | 'replace' | 'delete';
  /** Absolute path to the leaf file on disk. */
  sourcePath: string;
  /** Output filename inside the package (e.g. 'cover-letter.pdf'). */
  fileName: string;
  /** Display title for the leaf in the backbone. */
  title: string;
  /** Optional pre-computed checksum; computed if absent. */
  md5?: string;
  /**
   * For a lifecycle operation (replace/delete/append), the package-relative
   * path (+ optional `#leafId` fragment) of the prior leaf this one modifies.
   * Emitted as the `modified-file` attribute. For grouped submissions the path
   * must carry the application prefix + number (Module 1 Backbone Spec
   * Addendum 1), e.g. `../../../../nda456789/0001/m1/us/us-regional.xml#id2`.
   */
  modifiedFile?: string;
  /**
   * Controlling study identifier for an M4/M5 study-report leaf. When set (with
   * `stfFileTag`), the leaf is tagged into its study's Study Tagging File
   * (`stf.xml`), which the packager generates + cross-links (FDA STF v2.6.1).
   */
  studyId?: string;
  /**
   * STF file-tag classifying the leaf within its study (e.g.
   * 'study-report-body', 'protocol-or-amendment', 'sample-crf'). Required when
   * `studyId` is set.
   */
  stfFileTag?: string;
}

/** One applicant contact rendered into the FDA us-regional admin block. */
export interface FdaApplicantContact {
  /** Contact role — resolved to `fdaactN` (regulatory/technical/us-agent). */
  type: string;
  name: string;
  email?: string;
  phone?: string;
}

/** One transmittal form rendered under `<submission-information>/<form>`. */
export interface FdaFormLeaf {
  /** Form type — resolved to `fdaftN` (e.g. '356h', '1571', '3674'). */
  formType: string;
  leaf: EctdLeaf;
}

/**
 * FDA us-regional admin metadata. When present, the FDA backbone emits the
 * spec-conformant `<admin>` block (applicant-contacts + application-set with
 * application-type / submission-type / submission-sub-type coded attributes +
 * transmittal form). When absent, sensible values are derived from the
 * top-level PackagerInput so existing callers keep working.
 */
export interface FdaRegionalAdmin {
  /** Application-type: `fdaatN` code or canonical string ('nda','ind',…). */
  applicationType?: string;
  /** Submission-type: `fdastN` code or canonical ('original application',…). */
  submissionType?: string;
  /** Submission-sub-type: `fdasstN` code or canonical ('original','amendment'). */
  submissionSubType?: string;
  /** submission-id value (defaults to the sequence number). */
  submissionId?: string;
  /** Applicant contacts (regulatory/technical/US agent). */
  contacts?: FdaApplicantContact[];
  /** Transmittal forms (356h/1571/…) nested under `<form>`. */
  forms?: FdaFormLeaf[];
}

/** A leaf's finalized reference data: backbone-relative href + shipped-bytes MD5. */
export interface LeafRef {
  /** href RELATIVE to the backbone that references it (regional backbone or index.xml). */
  href: string;
  /** MD5 of the bytes actually written for this leaf. */
  md5: string;
}

/** One entry in the index-md5.txt manifest: a package-relative path + its MD5. */
export interface ChecksumEntry {
  relPath: string;
  md5: string;
}
