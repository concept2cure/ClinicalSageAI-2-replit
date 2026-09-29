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
   * Stable cross-sequence identity of the DOCUMENT this leaf carries, when the
   * caller has one. Republished in the bundle's leaf manifest so the next
   * sequence can recognise the same document even though its file name moved.
   * `fileName` is composed from the section it sits in, and a section can be
   * renamed in place, so a name is presentation — not identity.
   */
  leafKey?: string;
  /**
   * For a lifecycle operation (replace/delete/append), the prior leaf this one
   * modifies, named as ICH eCTD v3.2.2 requires: the backbone of the sequence
   * that filed it, '#', and that leaf's ID — from the sequence root, e.g.
   * `../0000/index.xml#leaf-3-2-S-1-general` or
   * `../0000/m1/us/us-regional.xml#leaf-1-2-cover` (the packager rebases a
   * pointer carried by the regional backbone onto that backbone's folder).
   * Emitted as the `modified-file` attribute. For grouped submissions the path
   * must carry the application prefix + number (Module 1 Backbone Spec
   * Addendum 1), e.g. `../../../../nda456789/0001/m1/us/us-regional.xml#id2`.
   *
   * 2026-09-29 (W5/D7): this carried the superseded FILE's path
   * (`../0000/m3/…/x.pdf`), which names no leaf.
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
  /**
   * The directory that backbone lives in, relative to the sequence root —
   * `''` for index.xml, `m1/us` for the FDA regional backbone.
   *
   * `modified-file` sits on the same element as `href` and resolves against the
   * same base, so it needs this too. Without it a cross-sequence pointer
   * authored from the sequence root ('../0000/m1/us/1-2/x.pdf') was written
   * verbatim into a backbone two directories down and resolved to
   * 0001/m1/0000/m1/us/1-2/x.pdf — a path in no layout, on every Module 1 leaf
   * a follow-up sequence supersedes.
   */
  backboneDir: string;
  /**
   * The leaf's XML ID in the backbone that carries it, and that backbone's path
   * from the sequence root (`index.xml`, `m1/us/us-regional.xml`). Assigned once
   * per backbone, after every leaf is known, so the ID a backbone carries and
   * the ID the leaf manifest records are the same value; a later sequence's
   * `modified-file` names the leaf by exactly these two. 2026-09-29 (W5/D7).
   */
  id?: string;
  backbone?: string;
}

/** One entry in the index-md5.txt manifest: a package-relative path + its MD5. */
export interface ChecksumEntry {
  relPath: string;
  md5: string;
}
