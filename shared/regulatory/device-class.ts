/**
 * The risk classes a device or a diagnostic is put in, in one place
 * (founder's directive, 2026-10-12).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * A read-only sweep before writing the classification question found the US
 * class enumerated at least fifteen times across the repository (three of them
 * with a different value set), the EU MDR class in two irreconcilable shapes,
 * and the IVDR class A–D enumerated eight times — and asked by no question
 * anywhere. The knowledge was not missing; it was scattered, so two interviews
 * had already drifted out of the fact reader's vocabulary without a test
 * noticing.
 *
 * ── The two MDR shapes, and why both are right ──────────────────────────────
 * A sponsor DECLARES one of seven classes: I, Is, Im, Ir, IIa, IIb, III. The
 * Annex VIII rules YIELD one of four: I, IIa, IIb, III. Is, Im and Ir are not
 * rule outcomes — they are a Class I device that is sterile, has a measuring
 * function, or is a reusable surgical instrument, each of which brings a
 * notified body in for that aspect alone (MDR Art 52(7)). So a classification
 * ENGINE has four outputs and a classification QUESTION has seven answers, and
 * `mdrRuleClassOf` is the relation between them.
 *
 * ── What this module is not ─────────────────────────────────────────────────
 * It is not a classifier: the Annex VIII rule engines live in
 * `server/services/market-specs/device-classification.ts` and are the only
 * thing that decides a class. It is not the US taxonomy either — that is
 * `shared/constants/domain/device-classification.ts`, which this module
 * re-exports rather than restates.
 *
 * @module shared/regulatory/device-class
 */

import { DEVICE_CLASSES, type DeviceClass } from '../constants/domain/device-classification.js';

/** The US 21 CFR 860 classes, from the taxonomy that already governs them. */
export { DEVICE_CLASSES, type DeviceClass };

/** The MDR classes a sponsor can declare — the question's vocabulary. */
export const MDR_DECLARED_CLASSES = ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'] as const;
export type MdrDeclaredClass = (typeof MDR_DECLARED_CLASSES)[number];

/** The MDR classes the Annex VIII rules yield — the engine's vocabulary. */
export const MDR_RULE_CLASSES = ['I', 'IIa', 'IIb', 'III'] as const;
export type MdrRuleClass = (typeof MDR_RULE_CLASSES)[number];

/** The IVDR classes. One vocabulary: the rules yield these and a sponsor declares these. */
export const IVDR_CLASSES = ['A', 'B', 'C', 'D'] as const;
export type IvdrClass = (typeof IVDR_CLASSES)[number];

/**
 * The rule class behind a declared class: Is, Im and Ir are Class I devices,
 * with a notified body for the sterile, metrological or reprocessing aspects
 * alone (MDR Art 52(7)).
 */
export function mdrRuleClassOf(declared: MdrDeclaredClass): MdrRuleClass {
  return declared === 'Is' || declared === 'Im' || declared === 'Ir' ? 'I' : declared;
}

/** Whether a declared Class I device brings a notified body in for one aspect. */
export function mdrClassINeedsNotifiedBody(declared: MdrDeclaredClass): boolean {
  return declared === 'Is' || declared === 'Im' || declared === 'Ir';
}

const MDR_BY_KEY: Readonly<Record<string, MdrDeclaredClass>> = Object.fromEntries(
  MDR_DECLARED_CLASSES.map(c => [c.toUpperCase(), c]),
);

const IVDR_BY_KEY: Readonly<Record<string, IvdrClass>> = Object.fromEntries(
  IVDR_CLASSES.map(c => [c.toUpperCase(), c]),
);

/**
 * A class written as a person or another system writes it — 'Class IIa',
 * 'iia', 'D' — read onto the canonical spelling, or null for anything else.
 * Null means "not a class this platform knows", which a caller must say
 * rather than treat as a class.
 */
export function euDeviceClassOf(value: string | null | undefined): MdrDeclaredClass | IvdrClass | null {
  if (typeof value !== 'string') return null;
  /* One pass, because two would turn 'class_iii' into '_iii': the first
     strips 'class' and leaves the separator behind. */
  const key = value.trim().replace(/^class[\s_]*/i, '').toUpperCase();
  if (!key) return null;
  return MDR_BY_KEY[key] ?? IVDR_BY_KEY[key] ?? null;
}
