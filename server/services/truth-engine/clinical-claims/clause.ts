/**
 * One clause read by every prose form, in a fixed order: effects (their
 * p-values and intervals) first, then deaths, exposure-adjusted rates,
 * exposure and demographics, disposition, incidence, responders, medians and
 * per-arm means. A form consumes the spans it reads, so a later form never
 * re-reads a figure an earlier one framed.
 */
import type { Ctx, Draft } from './context';
import type { Env } from './env';
import { armMeanForms, effectForms, ellipticEffect, medianForms, responderForms } from './forms-efficacy';
import { deathForms, incidenceForms, nonIncidenceForms } from './forms-safety';
import { dispositionForms } from './forms-disposition';
import { miscForms } from './forms-misc';
import type { Sentence } from './segment';

const FORMS = [effectForms, ellipticEffect, deathForms, nonIncidenceForms, miscForms, dispositionForms, incidenceForms, responderForms, medianForms, armMeanForms];

export function readClause(clause: Sentence, ctx: Ctx, env: Env): Draft[] {
  const out: Draft[] = [];
  for (const form of FORMS) out.push(...form(clause, ctx, env));
  return out;
}
