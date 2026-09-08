/**
 * WHICH REQUIRED BOXES ARE BLANK ON THE DOCUMENT A RENDER PRODUCED — one
 * computation, used by all four render paths.
 *
 * It lives in its own module for two reasons. It must not be duplicated: the
 * defect this replaces was two render paths each computing their own version of
 * "required and not filled", meaning different things, one of which reported a
 * genuinely incomplete FDA 356h as assessed-and-clean. And the reconstruction
 * renderer (`ind-form-reconstruct`) needs it too, while the fill service already
 * imports the reconstruction renderer — so a helper exported from there would
 * close a runtime import cycle.
 *
 * @module server/services/ind-forms/required-box-report
 */

import type { BuiltForm } from './ind-form-data-builders';

/**
 * Whether a built value is a VALUE — the builder's own `isPresent` rule,
 * restated here because this module decides what reached the page.
 *
 * Fail closed on anything else. `undefined` (a required id with no entry in
 * `built.fields`), `null`, a number a JavaScript caller slipped past the types:
 * none of those is a value this renderer wrote into a box, so the box is blank
 * and must be reported as blank. Returning `true` for an unexpected input is
 * exactly the shape that turns "we did not look" into "we looked and it is
 * fine".
 */
export function isValuePresent(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().length > 0;
  return false;
}

/**
 * The required boxes that carry no value in the document a render produced —
 * the ONE computation behind `IndFormPdfResult.requiredFieldsLeftBlank`, shared
 * by all four render paths so they cannot mean different things again.
 *
 * `wroteValueFor` is the set of field ids this render actually wrote onto the
 * output. The AcroForm path passes the ids whose widget accepted a value; the
 * XFA path passes `fillXfaDatasets`'s `filled`; the draft and the reconstruction
 * pass every built id, because they render every built field. It is an explicit
 * set on every path — never an "assume all" default — so a path that forgets to
 * track what it wrote reports MORE blank boxes, not fewer.
 *
 * A field counts as blank when the value was absent OR the render did not write
 * it. Both halves are needed: an unticked required checkbox is "written"
 * (`cb.uncheck()` succeeds) and an unmapped required field with data is
 * "present"; each alone would miss one of the two ways a required box ends up
 * empty on the page.
 *
 * `built.requiredFields` excludes the builder's derived QC gates by
 * construction, so a gate can never be reported as a box on the form.
 */
export function requiredFieldsLeftBlankOn(built: BuiltForm, wroteValueFor: ReadonlySet<string>): string[] {
  const required = built.requiredFields;
  if (!Array.isArray(required)) {
    // A BuiltForm with no requiredFields cannot be assessed, and an unassessed
    // render must never answer "no required box is blank". Refusing sends
    // renderBuiltForm down its fallback path and, if that fails too, out to the
    // caller as an error — which is the fail-closed direction.
    throw new Error(
      `BuiltForm for ${built.formId} carries no requiredFields array; the required boxes cannot be assessed.`,
    );
  }
  return required.filter((id) => !wroteValueFor.has(id) || !isValuePresent(built.fields?.[id]));
}

