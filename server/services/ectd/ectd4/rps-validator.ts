/**
 * eCTD v4.0 (HL7 RPS) validator.
 *
 * Implements the HIGH-severity structural criteria from the FDA *Specifications
 * for eCTD v4.0 Validation Criteria* (v1.5) against the canonical RPS model
 * (the object that gets serialized to `submissionUnit.xml`). Validating the
 * model — not a regex over XML — makes the checks exact and side-effect-free.
 * Syntactic well-formedness + XSD validity of the serialized bytes are handled
 * separately by the xmllint-backed `xml-validator`.
 *
 * Criteria covered (High/error unless noted):
 *   - message header carries the FDA Regional IG OID;
 *   - exactly one submission unit; its id@root is a UUID; code + valid
 *     code-system OID (CL13); title present (≤128 chars); status 'active';
 *     exactly one sequenceNumber, four digits, matching the folder;
 *   - application code system is a valid OID (CL1); application number present;
 *   - each contextOfUse: id@root is a UUID; code present; code-system a valid
 *     OID; statusCode is active|suspended; priorityNumber is one whole number;
 *     documentReference resolves to a document; relatedContextOfUse (when
 *     present) resolves to another CoU in the message;
 *   - keyword code systems are valid OIDs;
 *   - every document has a title and a resolvable reference.
 *
 * @module server/services/ectd/ectd4/rps-validator
 */

import {
  isValidOid,
  isValidV4Code,
  isCodeSystemOidValid,
  oidForV4List,
} from '../controlled-vocab';
import { isUuid } from './ids';
// The ICH context-of-use code system, imported rather than re-derived so the
// validator and the converter that emits these codes cannot drift apart.
import { ICH_COU_OID } from './forward-compat';
import type { RpsMessageInput } from './types';

export type RpsSeverity = 'error' | 'warning' | 'info';

export interface RpsFinding {
  /** Stable rule id, e.g. 'RPS-SU-ID-UUID'. */
  code: string;
  severity: RpsSeverity;
  message: string;
  /** Model path the finding is about, e.g. 'contextOfUse[2].priorityNumber'. */
  path?: string;
  /** Citation into the FDA v4.0 validation criteria. */
  criterion: string;
}

export interface RpsValidationResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  findings: RpsFinding[];
}

const SU_TITLE_MAX = 128;
const CRIT = 'FDA Specifications for eCTD v4.0 Validation Criteria v1.5';

/**
 * Validate an RPS message model.
 * @param input the canonical RPS message
 * @param expectedSequenceNumber the folder name the message ships under (NNNN);
 *        when provided, the sequenceNumber must match it.
 * @param knownContextIds the set of Context-of-Use ids that exist in the
 *        CUMULATIVE application (i.e. across all prior submission units). A
 *        `relatedContextOfUse` reference for a lifecycle operation normally
 *        points at a CoU from a PRIOR sequence, not the current message — so
 *        membership is only enforced when this cumulative set is supplied.
 *        Without it, a related reference is only checked for UUID validity.
 */
/**
 * §RPS Submission Unit checks — id, code + code system, title, status, sequence.
 *
 * Extracted from validateRpsMessage verbatim, to bring that function back under
 * the complexity and max-lines-per-function ceilings. Every check, code and
 * message is unchanged: these codes appear in validation reports a reviewer
 * reads, so renaming or merging any of them would change the record.
 */
function validateSubmissionUnit(
  su: RpsMessageInput['submissionUnit'],
  expectedSequenceNumber: string | undefined,
  err: (code: string, message: string, path?: string) => void,
): void {
  if (!isUuid(su.id)) {
    err('RPS-SU-ID-UUID', `submissionUnit.id@root "${su.id}" is not a valid UUID.`, 'submissionUnit.id');
  }
  if (!su.unitTypeCode) {
    err('RPS-SU-CODE-REQUIRED', 'submissionUnit code is required.', 'submissionUnit.code');
  } else if (!isValidV4Code('submissionUnitType', su.unitTypeCode)) {
    err('RPS-SU-CODE-VALID', `submissionUnit code "${su.unitTypeCode}" is not a valid submission-unit-type value.`, 'submissionUnit.code');
  }
  if (!isCodeSystemOidValid('submissionUnitType', oidForV4List('submissionUnitType'))) {
    // Defensive — our own OID constant must be valid.
    err('RPS-SU-CODESYSTEM-OID', 'submissionUnit code system is not a valid OID.', 'submissionUnit.code');
  }
  if (!su.title || !su.title.trim()) {
    err('RPS-SU-TITLE-REQUIRED', 'submissionUnit title is required.', 'submissionUnit.title');
  } else if (su.title.length > SU_TITLE_MAX) {
    err('RPS-SU-TITLE-LEN', `submissionUnit title exceeds ${SU_TITLE_MAX} characters (${su.title.length}).`, 'submissionUnit.title');
  }
  if (su.status !== 'active') {
    err('RPS-SU-STATUS', `submissionUnit statusCode must be "active" (got "${su.status}").`, 'submissionUnit.statusCode');
  }
  if (!/^\d{4}$/.test(su.sequenceNumber)) {
    err('RPS-SU-SEQ-FORMAT', `sequenceNumber "${su.sequenceNumber}" must be four digits.`, 'submissionUnit.sequenceNumber');
  } else if (expectedSequenceNumber && su.sequenceNumber !== expectedSequenceNumber) {
    err('RPS-SU-SEQ-FOLDER', `sequenceNumber "${su.sequenceNumber}" does not match the folder name "${expectedSequenceNumber}".`, 'submissionUnit.sequenceNumber');
  }

}

/**
 * The code + code-system pair of one context of use.
 *
 * Extracted from the context-of-use loop so that loop stays under the
 * complexity ceiling once it had to tell the two governing code systems apart.
 */
function validateCouCoding(
  cou: { code?: string; codeSystem: string },
  p: string,
  err: (code: string, message: string, path?: string) => void,
): void {
  if (!cou.code) {
    err('RPS-COU-CODE-REQUIRED', `${p} code is required.`, `${p}.code`);
  } else if (cou.codeSystem === ICH_COU_OID) {
    if (!/^ich_[0-9a-z.]+$/.test(cou.code)) {
      err(
        'RPS-COU-CODE-VALID',
        `${p} code "${cou.code}" is not a valid ICH-governed context-of-use code.`,
        `${p}.code`,
      );
    }
  } else if (!isValidV4Code('contextOfUse', cou.code)) {
    err('RPS-COU-CODE-VALID', `${p} code "${cou.code}" is not a valid context-of-use (CL2) value.`, `${p}.code`);
  }
  if (cou.codeSystem !== ICH_COU_OID && !isCodeSystemOidValid('contextOfUse', cou.codeSystem)) {
    err(
      'RPS-COU-CODESYSTEM-OID',
      `${p} code system "${cou.codeSystem}" is neither the FDA context-of-use nor the ICH context-of-use code-system OID.`,
      `${p}.code`,
    );
  }
}

export function validateRpsMessage(
  input: RpsMessageInput,
  expectedSequenceNumber?: string,
  knownContextIds?: Set<string>,
): RpsValidationResult {
  const f: RpsFinding[] = [];
  const err = (code: string, message: string, path?: string) =>
    f.push({ code, severity: 'error', message, path, criterion: CRIT });
  const warn = (code: string, message: string, path?: string) =>
    f.push({ code, severity: 'warning', message, path, criterion: CRIT });

  const { submissionUnit: su, submission, application, contextsOfUse, documents } = input;

  validateSubmissionUnit(su, expectedSequenceNumber, err);

  /* ── Submission / Application ────────────────────────────────── */
  if (!submission.typeCode || !isValidV4Code('submissionType', submission.typeCode)) {
    err('RPS-SUB-CODE-VALID', `submission code "${submission.typeCode}" is not a valid submission-type value.`, 'submission.code');
  }
  if (!application.number || !application.number.trim()) {
    err('RPS-APP-NUMBER-REQUIRED', 'application number is required in submissionUnit.xml.', 'application.id');
  }
  if (!application.typeCode || !isValidV4Code('applicationType', application.typeCode)) {
    err('RPS-APP-CODE-VALID', `application code "${application.typeCode}" is not a valid application-type value.`, 'application.code');
  }
  if (!isCodeSystemOidValid('applicationType', oidForV4List('applicationType'))) {
    err('RPS-APP-CODESYSTEM-OID', 'application code system is not a valid OID.', 'application.code');
  }

  /* ── Contexts of Use ─────────────────────────────────────────── */
  const couIds = new Set<string>();
  if (contextsOfUse.length === 0) {
    warn('RPS-SU-NO-COU', 'submission unit has no contexts of use.', 'contextOfUse');
  }
  contextsOfUse.forEach((cou, i) => {
    const p = `contextOfUse[${i}]`;
    if (!isUuid(cou.id)) {
      err('RPS-COU-ID-UUID', `${p}.id@root "${cou.id}" is not a valid UUID.`, `${p}.id`);
    } else {
      if (couIds.has(cou.id)) err('RPS-COU-ID-DUP', `${p}.id@root "${cou.id}" is duplicated.`, `${p}.id`);
      couIds.add(cou.id);
    }
    // A context of use is governed by ONE OF TWO code systems in eCTD v4.0, and
    // which one decides how its code is checked. Module 1 is regional: an FDA
    // submission uses the FDA CL2 list, and presence alone is not enough there —
    // a syntactically-fine but non-catalogued code binds content to a section
    // FDA's list does not contain, and the ESG/JANUS gateway rejects or mis-files
    // it. Modules 2–5 are ICH-governed and carry the ICH CoU code system with an
    // `ich_<section>` code; those are NOT in the FDA list and never will be.
    //
    // This checked every CoU against the FDA list and the FDA OID alone, so every
    // Module 2–5 context — which is most of a real dossier, and exactly what
    // sectionToCou() in forward-compat.ts deliberately emits — was reported as an
    // invalid code AND an invalid code system. A validator that fails every valid
    // submission is not strict, it is broken, and the two findings it raised named
    // the wrong cause.
    //
    // Strictness is preserved: an unrecognised code system is still an error, an
    // FDA-governed code must still be in CL2, and an ICH-governed code must still
    // match the governed shape rather than being accepted on the code system alone.
    validateCouCoding(cou, p, err);
    if (cou.status !== 'active' && cou.status !== 'suspended') {
      err('RPS-COU-STATUS', `${p}.statusCode must be "active" or "suspended".`, `${p}.statusCode`);
    }
    if (!Number.isInteger(cou.priorityNumber) || cou.priorityNumber < 0) {
      err('RPS-COU-PRIORITY', `${p}.priorityNumber must be a whole number (got ${cou.priorityNumber}).`, `${p}.priorityNumber`);
    }
    if (!cou.documentId || !documents.some((d) => d.id === cou.documentId)) {
      err('RPS-COU-DOCREF', `${p}.documentReference does not resolve to a document in the message.`, `${p}.documentReference`);
    }
    for (const kw of cou.keywords ?? []) {
      // Keyword code was never checked for presence. Keyword code systems are
      // polymorphic (manufacturer / substance / study id, each its own code
      // system), so the code system stays a generic OID check rather than being
      // pinned to one list, but a keyword with no code at all is invalid.
      if (!kw.code || !kw.code.trim()) {
        err('RPS-KEYWORD-CODE-REQUIRED', `${p} keyword code is required.`, `${p}.keyword`);
      }
      if (!isValidOid(kw.codeSystem)) {
        err('RPS-KEYWORD-CODESYSTEM-OID', `${p} keyword code system "${kw.codeSystem}" is not a valid OID.`, `${p}.keyword`);
      }
    }
  });

  // relatedContextOfUse (lifecycle): the referenced CoU normally lives in a
  // PRIOR sequence, so require UUID validity always, but only require it to
  // resolve when the cumulative application CoU set is supplied.
  contextsOfUse.forEach((cou, i) => {
    if (!cou.relatedContextOfUseId) return;
    const p = `contextOfUse[${i}].relatedContextOfUse`;
    if (!isUuid(cou.relatedContextOfUseId)) {
      err('RPS-COU-RELATED-UUID', `${p}.id@root "${cou.relatedContextOfUseId}" is not a valid UUID.`, p);
    } else if (knownContextIds && !knownContextIds.has(cou.relatedContextOfUseId) && !couIds.has(cou.relatedContextOfUseId)) {
      err('RPS-COU-RELATED', `${p}.id@root "${cou.relatedContextOfUseId}" does not reference a known context of use in the application.`, p);
    }
  });

  /* ── Documents ───────────────────────────────────────────────── */
  const docIds = new Set<string>();
  documents.forEach((doc, i) => {
    const p = `document[${i}]`;
    if (!isUuid(doc.id)) err('RPS-DOC-ID-UUID', `${p}.id@root "${doc.id}" is not a valid UUID.`, `${p}.id`);
    else {
      if (docIds.has(doc.id)) err('RPS-DOC-ID-DUP', `${p}.id@root "${doc.id}" is duplicated.`, `${p}.id`);
      docIds.add(doc.id);
    }
    if (!doc.title || !doc.title.trim()) err('RPS-DOC-TITLE', `${p} document title is required.`, `${p}.title`);
    if (!doc.href || !doc.href.trim()) err('RPS-DOC-HREF', `${p} document reference (href) is required.`, `${p}.text.reference`);
    if (!doc.checksum || doc.checksumType !== 'SHA256') warn('RPS-DOC-INTEGRITY', `${p} should carry a SHA-256 integrity check.`, `${p}.text`);
  });

  const errorCount = f.filter((x) => x.severity === 'error').length;
  const warningCount = f.filter((x) => x.severity === 'warning').length;
  return { valid: errorCount === 0, errorCount, warningCount, findings: f };
}
