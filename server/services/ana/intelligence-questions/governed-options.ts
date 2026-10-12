/**
 * The positions a question offers, resolved from the answers already given
 * (founder's directive, 2026-10-12).
 *
 * Some questions cannot hold a static list. Which routes to market exist
 * depends on the regulator the project named, and `project-setup` wrote its
 * device pathway list for **the United States, whatever agency was named** —
 * so once the catalogue learned to mark a position the answers contradict, a
 * European device programme was shown the four FDA routes with every one of
 * them marked inapplicable. Correct, and the wrong question.
 *
 * A field declares the catalogue it draws from (`optionsFrom`) and this
 * resolves it. Two rules it keeps:
 *
 *   - **It never draws an empty select.** Where the catalogue holds nothing
 *     for the programme's own regulator — Japan's filings are in the registry,
 *     but what they commit a sponsor to is not written — the field says so by
 *     name and the person answers in their own words. An empty list that looks
 *     like a list is the "error rendered as an empty result" this repository
 *     forbids.
 *   - **It says whose routes these are**, in every case, including when no
 *     agency has been named yet and the list therefore falls back to FDA's.
 *     A person must not have to infer which regulator a list belongs to.
 *
 * The same resolution is what the validator judges an answer against
 * (`engine.ts` resolves the node once, for both). A question that offered
 * positions the validator did not enforce would not be a closed list at all.
 *
 * @module server/services/ana/intelligence-questions/governed-options
 */

import { agencyFor } from '../../../../shared/regulatory/agency-positions.js';
import {
  pathwayOptions,
  pathwayRegionOf,
  type PathwayDomain,
  type ProgrammeFacts,
} from '../../../../shared/regulatory/pathway-positions.js';
import type { FlowEngineContext, QuestionField } from './types.js';

export interface GovernedOptionInput {
  facts: ProgrammeFacts;
  /** Every answer the interview holds, flattened — the question's own context. */
  answers: Record<string, unknown>;
  ctx: FlowEngineContext;
}

/**
 * Device or diagnostics, for a question that is about one of the two. An IVD
 * files a 510(k) and a PMA like a device but classifies and performs like an
 * assay, and the registry keeps the two apart (`US_510K` against
 * `US_510K_IVD`), so this must not fall back to the device list for a
 * diagnostics programme.
 */
function deviceDomainOf(input: GovernedOptionInput): PathwayDomain {
  const product = String(input.answers['product_type'] ?? '').toLowerCase();
  if (product === 'diagnostic' || input.ctx.clientType === 'ivd') return 'diagnostics_ivd';
  return 'medical_devices';
}

/** Whose routes a list belongs to, said plainly, including when it was assumed. */
function whoseRoutes(facts: ProgrammeFacts): { region: 'US' | 'EU' | null; note: string } {
  const named = facts.primaryRegion;
  if (!named) {
    return {
      region: 'US',
      note: 'No primary agency has been named yet, so these are FDA’s routes. Name the agency and AnA offers that regulator’s instead.',
    };
  }
  const region = pathwayRegionOf(named);
  if (!region) {
    return {
      region: null,
      note:
        `AnA holds no routes to market for ${agencyFor(named)} — its filings are in the registry, but what taking one ` +
        'commits a programme to is not written, and she will not offer another regulator’s routes in their place. ' +
        'Describe the route you are taking and she will record it in your words.',
    };
  }
  return { region, note: `These are ${agencyFor(named)}’s routes.` };
}

/**
 * One field, with the catalogue it declared resolved for this programme.
 *
 * The escape hatch is guaranteed, not merely preserved: this catalogue holds
 * routes for the US and the EU only and says so, so a question drawn from it
 * must always take an answer in the person's own words — otherwise a required
 * field for a Japanese programme would have no answer that satisfies it, which
 * is a deadlock rather than a closed list.
 */
function resolveField(field: QuestionField, input: GovernedOptionInput): QuestionField {
  if (field.optionsFrom !== 'device_pathway_positions') return field;
  const { region, note } = whoseRoutes(input.facts);
  const helpText = field.helpText ? `${field.helpText} ${note}` : note;
  if (!region) {
    /* No positions, and the reason in their place. The escape hatch is the
       answer here, so it is never dropped. */
    const bare: QuestionField = { ...field, helpText };
    delete bare.options;
    bare.allowOther = field.allowOther ?? { prompt: 'Which route are you taking, in your own words?' };
    return bare;
  }
  return {
    ...field,
    helpText,
    options: pathwayOptions({ domain: deviceDomainOf(input), region }),
    allowOther: field.allowOther ?? { prompt: 'Which route are you taking, in your own words?' },
  };
}

/**
 * The fields with every declared catalogue resolved. A field that declares
 * none is returned untouched, so this is safe to run over every node.
 */
export function withGovernedOptions(
  fields: readonly QuestionField[],
  input: GovernedOptionInput,
): QuestionField[] {
  return fields.map(field => resolveField(field, input));
}
