/**
 * Types for the shared accessibility rules.
 *
 * The rules live in `.mjs` because `check-a11y-semantics.mjs` runs them under
 * plain node with no build step, while `a11ySemantics.test.tsx` imports the
 * same file from TypeScript. A declaration file is what lets one module serve
 * both without a second copy — and a second copy of a judgement call is how a
 * guard starts disagreeing with the thing it guards.
 */

export interface A11yFinding {
  /** The WCAG success criterion, e.g. "4.1.2 control has no accessible name". */
  rule: string;
  detail: string;
  selector: string;
  html: string;
}

/**
 * Audit a DOM subtree for the WCAG failures visible without layout or cascade.
 * `doc` is passed explicitly so the same code runs under Chromium and jsdom.
 */
export function auditA11y(root: Element, doc: Document): A11yFinding[];

/** Markup exercising every rule, plus the correct forms none may flag. */
export const SELF_CHECK_HTML: string;
export const SELF_CHECK_EXPECTED: string[];
export const SELF_CHECK_MUST_NOT_FLAG: RegExp[];
