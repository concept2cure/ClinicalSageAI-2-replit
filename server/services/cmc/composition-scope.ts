/**
 * @fileoverview What Module 3 this platform composes, and what it refuses.
 * @module server/services/cmc/composition-scope
 *
 * ## Why a boundary exists at all
 *
 * The CMC module composes **small-molecule Module 3 for a US IND**. That is
 * the scope the launch decision ships (P-28, 2026-10-05), and it is the scope
 * the composer was built and verified against.
 *
 * Everything outside it was being composed anyway, with content that is wrong
 * rather than merely incomplete:
 *
 * | Out of scope | What the composer produced for it |
 * |---|---|
 * | biologic / ATMP substance | ICH Q3A impurity reasoning applied to a biologic; no Q6B specification model, no Q5A(R2) viral safety, no Q5C stability, no cell-bank section |
 * | NDA / ANDA / BLA marketing | 3.2.R location statements that are false for a marketing application, no S.4.5 / P.5.6 justification of specification, and 4-level granularity the packager cannot emit |
 * | EU CTA | an IMPD Quality part is not CTD Module 3 |
 * | Health Canada CTA | mis-mapped to `ctis`, and no QOS-CE |
 * | Japan CTN / J-NDA | no regional 3.2.R for the jurisdiction |
 *
 * The staff simulation itself ran against a monoclonal antibody — modality
 * `biologic`, CHO cell culture, an INN ending `-mab` — and composed a
 * small-molecule Module 3 for it without a word of complaint.
 *
 * ## The rule
 *
 * Composition proceeds when **all** hold:
 *
 *   • the program's own recorded product class is `drug`. Since P-21 (QA
 *     2026-10-08) `regulatory_programs.product_type` is NOT NULL and the
 *     person states it on a filing that covers both — an IND, a CTA, an MAA, a
 *     J-NDA — rather than it being derived, which used to record every IND as
 *     a biologic. It is the sponsor's own statement of what the product is, so
 *     it is asked first;
 *   • the drug substance's modality resolves to `small_molecule`
 *     (`substance-modality.ts` — the same rule §3.2.A.2 uses, so the two
 *     cannot disagree). Asked as well as the class, not instead of it: a
 *     program declared `drug` whose substance record is a CHO cell-culture mAb
 *     is a contradiction, and the record refuses it;
 *   • the application resolves to a **US IND** — the linked submission's
 *     `application_type` when a spine exists, otherwise the program's own
 *     `program_type`, which is NOT NULL and is the sponsor's own declaration
 *     of what they are filing.
 *
 * Both are consulted because a spine is not required to exist. A program
 * created as a CTA or an NDA need only have no `submissions` row yet for the
 * spine to resolve null, and "no spine yet" would then have waved through
 * exactly the filings this boundary exists to refuse. `resolveSubmissionSpine`
 * also only ever matches a submission whose `application_type` equals the
 * program's `program_type`, so the two agree when both are present — and when
 * only the program's is, it is still the answer.
 *
 * Otherwise the caller is refused **409** with a reason that names the real
 * path: *Document editor & authoring* for the quality content, *Vault (DMS)*
 * for the evidence, and the *Submission center* to file it. A refusal that
 * only says "unsupported" sends the reader nowhere.
 *
 * ## Why a throw
 *
 * `composeProjectModule3` has four callers (the compile route, the
 * build-section route, and AnA's QOS tool and build commands). A refusal
 * returned as "zero sections" would reach a screen as *this program has no CMC
 * data* — the empty-state-for-an-error pattern the working agreement forbids.
 * A typed throw cannot be read as an empty result: a caller either handles it
 * or fails loudly.
 */

import { classifySubstanceModality, type SubstanceModality } from './substance-modality.js';
import { isUsClinicalTrialApplication } from './us-ind-regional.js';
import type { CanonicalSource } from '../module3Composer';

/** Why composition was refused. The `code` is what a route returns. */
export interface CompositionRefusal {
  code:
    | 'CMC_PRODUCT_CLASS_OUT_OF_SCOPE'
    | 'CMC_MODALITY_OUT_OF_SCOPE'
    | 'CMC_MODALITY_NOT_ESTABLISHED'
    | 'CMC_APPLICATION_OUT_OF_SCOPE'
    | 'CMC_APPLICATION_NOT_READABLE'
    | 'CMC_PROGRAM_NOT_RECORDED';
  message: string;
  /** What the record established, for the audit row. */
  modality?: SubstanceModality;
  /** The application the linked submission files, when that is what refused. */
  applicationType?: string | null;
  /** The product class the program records, when that is what refused. */
  productType?: string | null;
}

/** Thrown by `composeProjectModule3`; routes answer it 409. */
export class CompositionOutOfScopeError extends Error {
  readonly refusal: CompositionRefusal;
  constructor(refusal: CompositionRefusal) {
    super(refusal.message);
    this.name = 'CompositionOutOfScopeError';
    this.refusal = refusal;
  }
}

export function isCompositionOutOfScope(err: unknown): err is CompositionOutOfScopeError {
  return err instanceof CompositionOutOfScopeError;
}

/**
 * The program's submission could not be read, so its application type is not
 * established.
 *
 * Fail closed rather than compose: the spine is what says this program files a
 * US IND and not an NDA, and composing without it is how marketing-application
 * text reaches an IND. Distinct from `CMC_APPLICATION_OUT_OF_SCOPE` because the
 * remedy is different — nothing is wrong with the program, the read failed.
 */
export function applicationNotReadable(): CompositionRefusal {
  /* The read's own error stays in the server log, where the caller writes it
     (module3-compile.ts judgeProgramComposition). It used to be quoted here,
     so a driver message (`invalid input syntax for type uuid`, a relation
     name) reached the 409 body and AnA's answer (2026-10-22). */
  return {
    code: 'CMC_APPLICATION_NOT_READABLE',
    message:
      `This program's submission could not be read, so whether it files a US IND is not established, and ` +
      `Module 3 is not composed on an unestablished application type — a marketing application's content ` +
      `differs from an IND's. Try again; if it persists, the failure is in the server log.`,
  };
}

/**
 * The project named is not one of the organisation's regulatory programs (a
 * legacy numeric project, from before programs), so what it files is not
 * recorded. A settled answer, not a failed read: trying again changes nothing.
 * It used to reach the boundary as a uuid cast error, answered "could not be
 * read … try again" for as long as the project existed (2026-10-22).
 */
export function programNotRecorded(): CompositionRefusal {
  return {
    code: 'CMC_PROGRAM_NOT_RECORDED',
    message:
      `This project is not one of this organisation's regulatory programs, so the application it files is not ` +
      `recorded, and Module 3 is composed here only for a program recorded as filing a US IND. Open the ` +
      `program this project belongs to and work on its Module 3 there.`,
  };
}

/**
 * A stability study filed under no program. The boundary judges a program, and
 * a study with none has no product class, no substance and no application to
 * judge: whether its product is a small molecule is not established, and an
 * ICH Q1E figure is not produced on an unestablished modality (2026-10-22).
 */
export function studyFiledUnderNoProgram(studyIds: readonly number[]): CompositionRefusal {
  const which = studyIds.length === 1 ? `Stability study ${studyIds[0]} is` : `Stability studies ${studyIds.join(', ')} are`;
  return {
    code: 'CMC_MODALITY_NOT_ESTABLISHED',
    modality: 'unknown',
    message:
      `${which} filed under no program, so whether the product is a small molecule is not established, and an ` +
      `ICH Q1E shelf life is produced here only for a small-molecule product of a US IND. File the study under ` +
      `its program, then estimate again.`,
  };
}

/** Where a program outside the composition scope does its Module 3 work. */
const AUTHORED_INSTEAD =
  'Author its quality content in Document editor & authoring, keep the evidence in Vault (DMS), and file it ' +
  'through the Submission center.';

/**
 * The substance whose modality decides the program's.
 *
 * The newest recorded drug substance (`loadCanonicalSources` orders by
 * `updated_at DESC`). A program with several is judged on the one its record
 * most recently established, not on whichever happens to be first in an
 * arbitrary order.
 */
function newestDrugSubstance(sources: readonly CanonicalSource[]): CanonicalSource | undefined {
  return sources.find((s) => s.sourceType === 'drug_substance');
}

/**
 * Is the program's Module 3 composable here?
 *
 * Pure: the caller supplies the sources and what the submission spine resolved,
 * so this is the whole rule in one place and testable without a database.
 *
 * @param sources          The program's canonical sources.
 * @param applicationType  What the program files: the spine's application type
 *                         when there is one, else the program's own
 *                         `program_type`. Null only when the program row
 *                         itself could not be read.
 * @param productType      The program's recorded product class (`drug`,
 *                         `biologic`, `device`, `ivd`, `combination`).
 */
export function compositionRefusal(
  sources: readonly CanonicalSource[],
  applicationType: string | null,
  productType?: string | null,
): CompositionRefusal | null {
  /* The person's own statement of what the product is, asked before the
     substance record. `drug` is the only class whose Module 3 is composed
     here; a program with no class recorded is pre-P-21 data, and the substance
     record below is then the whole answer. */
  const declared = String(productType ?? '').trim().toLowerCase();
  if (declared && declared !== 'drug') {
    return {
      code: 'CMC_PRODUCT_CLASS_OUT_OF_SCOPE',
      productType,
      message:
        `This program records its product as a ${declared}, and Module 3 is composed here only for a drug ` +
        `(a small-molecule medicinal product). A biologic's quality requirements are ICH Q6B, Q5A(R2) and Q5C ` +
        `and its cell-bank sections; a device or IVD files no CTD Module 3 at all. ${AUTHORED_INSTEAD}`,
    };
  }

  const substance = newestDrugSubstance(sources);
  const verdict = classifySubstanceModality((substance?.sourcePayload ?? {}) as Record<string, unknown>);

  if (verdict.modality === 'biologic') {
    return {
      code: 'CMC_MODALITY_OUT_OF_SCOPE',
      modality: 'biologic',
      message:
        `This program's drug substance is biologically derived — ${verdict.basis} — and Module 3 for a biologic ` +
        `is not composed here. The quality requirements are ICH Q6B (specifications), Q5A(R2) (viral safety), ` +
        `Q5C (stability) and the cell-bank sections, none of which this composer models; composing anyway would ` +
        `apply small-molecule impurity reasoning (ICH Q3A) to a biologic. ${AUTHORED_INSTEAD}`,
    };
  }

  if (verdict.modality === 'unknown') {
    return {
      code: 'CMC_MODALITY_NOT_ESTABLISHED',
      modality: 'unknown',
      message:
        substance
          ? `Whether this program's drug substance is a small molecule is not established — ${verdict.basis}. ` +
            `Module 3 is composed only for a small-molecule substance, and that is not a question this platform ` +
            `will answer by assumption. Record the manufacturing route on the drug substance, and the source ` +
            `organism or cell line where one is used, then compile again.`
          : `This program records no drug substance, so whether its Module 3 is composable here is not ` +
            `established. Record the drug substance in the CMC registers, then compile again.`,
    };
  }

  return applicationRefusal(applicationType);
}

/**
 * The application half of the boundary: null for a US IND, the refusal
 * otherwise. Asked of the program by `compositionRefusal`, and of the
 * submission Module 3 is placed into by `placeModule3IntoSubmission` — the
 * boundary refused composing for an NDA and then let the IND-composed text be
 * placed into one, 3.2.R statements that are false for a marketing application
 * and all (2026-10-15 launch-boundary re-proof).
 */
export function applicationRefusal(
  applicationType: string | null | undefined,
  filer: 'program' | 'submission' = 'program',
): CompositionRefusal | null {
  const filed = String(applicationType ?? '').trim();
  if (!filed) {
    /* `regulatory_programs.program_type` is NOT NULL, so an empty answer means
       the program row could not be read — not that it files nothing. */
    return applicationNotReadable();
  }

  if (!isUsClinicalTrialApplication(filed)) {
    const subject = filer === 'program' ? 'This program files' : 'This submission files';
    const verb = filer === 'program' ? 'composed' : 'composed and placed';
    return {
      code: 'CMC_APPLICATION_OUT_OF_SCOPE',
      applicationType,
      message:
        `${subject} ${filed.toUpperCase()}, and Module 3 is ${verb} here only for a US ` +
        `IND (21 CFR 312.23(a)(7)). A marketing application needs the 3.2.R location statements, the ` +
        `§3.2.S.4.5 / §3.2.P.5.6 justification of specification and 4-level section granularity, none of which ` +
        `this composer produces; an EU or Health Canada clinical-trial application needs an IMPD Quality part, ` +
        `which is not CTD Module 3. ${AUTHORED_INSTEAD}`,
    };
  }

  return null;
}

/**
 * The status a refusal is answered with. A read that failed is not a verdict
 * about the program: it is 503, so a screen offers the retry the message asks
 * for instead of a settled answer. Every other refusal is 409.
 */
export function compositionRefusalStatus(refusal: CompositionRefusal): 409 | 503 {
  return refusal.code === 'CMC_APPLICATION_NOT_READABLE' ? 503 : 409;
}

/**
 * The 409 body, so every caller refuses identically.
 *
 * Matches the compile route's existing shape (`success`, `error`, `hint`) — the
 * one a CMC screen already reads — rather than inventing a second one. The
 * `code` is what a test and a log pin; the `hint` is where the reader goes.
 */
export function compositionRefusalBody(refusal: CompositionRefusal): {
  success: false;
  code: CompositionRefusal['code'];
  error: string;
  hint: string;
} {
  return {
    success: false,
    code: refusal.code,
    error: refusal.message,
    hint: AUTHORED_INSTEAD,
  };
}

/**
 * An AnA command result for a failed build: the composition boundary's own
 * words when it refused, and the handler's own message otherwise.
 *
 * Lives here, beside the rule, because three command handlers relay the same
 * refusal the same way. The assistant then repeats the reason and the path that
 * does author it, instead of reporting a tool failure.
 */
export function anaCompositionRefusal(
  err: unknown,
  action: string,
  fallbackMessage: string,
): { success: false; action: string; message: string } {
  return {
    success: false,
    action,
    message: isCompositionOutOfScope(err) ? err.refusal.message : fallbackMessage,
  };
}

/** True only when the boundary refused — for a handler that otherwise rethrows. */
export function refusedByCompositionScope(err: unknown): boolean {
  return isCompositionOutOfScope(err);
}

export default {
  compositionRefusal,
  applicationRefusal,
  anaCompositionRefusal,
  refusedByCompositionScope,
  compositionRefusalBody,
  compositionRefusalStatus,
  applicationNotReadable,
  CompositionOutOfScopeError,
  isCompositionOutOfScope,
};
