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

import { OTHER_POSITION } from '../../../../shared/types/intelligence-questions.js';
import { agencyFor } from '../../../../shared/regulatory/agency-positions.js';
import { IVDR_CLASSES } from '../../../../shared/regulatory/device-class.js';
import { MODALITY_FRAME, MODALITY_LABEL } from '../../../../shared/regulatory/modality.js';
import { IVDR_CONFORMITY_ROUTES } from '../../regulatory/ivdr-classification.js';
import { basisLabel } from '../../../../shared/regulatory/regulatory-basis.js';
import type { ProgrammeFacts } from '../../../../shared/regulatory/pathway-cautions.js';
import { AGENCY_FIELDS } from './programme-facts.js';
import {
  pathwayOptions,
  pathwayRegionOf,
  type PathwayDomain,
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

/**
 * Whose routes a list belongs to, in the words that are true of it.
 *
 * For a medicine the regulator IS the agency: EMA grants a marketing
 * authorisation. For a device or a diagnostic in the EU it is not — the MDR
 * and IVDR routes are assessed by a notified body, and EMA has no part in
 * them beyond the companion-diagnostic consultation. Saying "these are EMA's
 * routes" over the MDR class routes is a deterministic sentence that is
 * simply false, which a review caught (founder's directive, 2026-10-12).
 */
function euRoutesAre(domain: PathwayDomain): string {
  if (domain === 'pharma_biotech') return `These are ${agencyFor('EU')}’s routes.`;
  const regulation = domain === 'diagnostics_ivd' ? 'IVDR' : 'MDR';
  return (
    `These are the EU ${regulation} conformity assessment routes. A notified body assesses them — ` +
    `${agencyFor('EU')} has no part in them, beyond the companion-diagnostic consultation.`
  );
}

/** Whose routes a list belongs to, said plainly, including when it was assumed. */
function whoseRoutes(
  facts: ProgrammeFacts,
  domain: PathwayDomain,
  /** The person named an agency AnA does not hold, in their own words. */
  agencyInOwnWords: boolean,
): { region: 'US' | 'EU' | null; note: string } {
  const named = facts.primaryRegion;
  if (!named) {
    return {
      region: 'US',
      /* "No agency has been named" is false where they named one AnA does not
         hold: she was told, she could not place it, and saying otherwise
         contradicts the person's own answer (2026-10-12 review). */
      note: agencyInOwnWords
        ? 'AnA does not hold the agency you named, so she cannot offer its routes — these are FDA’s. If you are filing elsewhere, describe the route you are taking and she will record it in your words.'
        : 'No primary agency has been named yet, so these are FDA’s routes. Name the agency and AnA offers that regulator’s instead.',
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
  /* FDA regulates medicines and devices alike, so its name is right for both;
     only the EU splits the two. */
  return { region, note: region === 'EU' ? euRoutesAre(domain) : `These are ${agencyFor(named)}’s routes.` };
}

/**
 * The routes a medicine may take: the modality frame narrows and orders the US
 * list (default first), and for the EU — where the frame holds nothing — all
 * four positions are offered and the stated modality MARKS the ones it
 * contradicts. That asymmetry is deliberate: the frame is the governed source
 * for which US pathways a modality may take, nothing holds its European
 * equivalent, and inventing a second frame would be worse than offering the
 * four and saying which the answers speak against.
 */
function medicineOptions(input: GovernedOptionInput, region: 'US' | 'EU') {
  return pathwayOptions({ domain: 'pharma_biotech', region, modality: input.facts.modality ?? null });
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
/**
 * The IVDR risk classes, each saying the Article 48 route that follows from
 * it. The classes and the routes are both the platform's own
 * (`shared/regulatory/device-class.ts` and
 * `server/services/regulatory/ivdr-classification.ts`, which holds the one
 * statement of Article 48 per class) — this only puts them in a question.
 *
 * The class is not a preference and the question does not pretend it is: the
 * Annex VIII rules decide it, the rule engine can derive it from the device's
 * facts, and what a sponsor states here is their declaration of the outcome.
 */
function ivdrClassOptions(): Array<{ value: string; label: string; commits: string; authority: string }> {
  return IVDR_CLASSES.map(cls => {
    const route = IVDR_CONFORMITY_ROUTES[cls];
    return {
      value: cls,
      label: `Class ${cls} — ${route.notifiedBodyRequired ? 'notified body' : 'no notified body'}`,
      commits: route.summary,
      /* The route's OWN basis, rendered by the one renderer that never
         presents recall as checked regulator text. These routes are a
         paraphrase from recall, corroborated by secondary extracts and with a
         verbatim re-read owed — and the citation line said
         'IVDR Art 48; <annexes>' flat, which reads as checked. The platform
         keeps a `basis` for exactly this, and discarding it was the defect
         (2026-10-12 review). */
      authority: basisLabel(route.basis),
    };
  });
}

/**
 * Why a regulator this catalogue DOES cover can still hold no route for this
 * programme. One case reaches it: a combination product, for which the frame
 * holds no pathways at all — and the frame says why in its own words, so that
 * is what the person is told rather than a sentence written here.
 */
function nothingToOffer(input: GovernedOptionInput): string {
  const modality = input.facts.modality;
  if (modality && MODALITY_FRAME[modality].pathways.length === 0) {
    return (
      `AnA holds no route for ${MODALITY_LABEL[modality].toLowerCase()}: ` +
      `${MODALITY_FRAME[modality].centerBasis} Until that determination is made the route follows from it rather ` +
      'than from the product type, so describe the route you are taking and she will record it in your words.'
    );
  }
  return (
    'AnA holds no route to market for this programme — describe the route you are taking and she will record it ' +
    'in your words.'
  );
}

/** A question with no positions: the reason in their place, and the hatch as the answer. */
function withoutOptions(field: QuestionField, helpText: string): QuestionField {
  const bare: QuestionField = { ...field, helpText };
  delete bare.options;
  bare.allowOther = field.allowOther ?? { prompt: 'Which route are you taking, in your own words?' };
  return bare;
}

function resolveField(field: QuestionField, input: GovernedOptionInput): QuestionField {
  if (!field.optionsFrom) return field;
  /* The IVDR classes do not depend on the regulator named: they ARE the
     European classification, and a question that asks them is asking about
     the EU whatever else the programme is doing. */
  if (field.optionsFrom === 'ivdr_class_positions') {
    return { ...field, options: ivdrClassOptions() };
  }
  const domain: PathwayDomain =
    field.optionsFrom === 'medicine_pathway_positions' ? 'pharma_biotech' : deviceDomainOf(input);
  const agencyInOwnWords = AGENCY_FIELDS.some(f => input.answers[f] === OTHER_POSITION);
  const { region, note } = whoseRoutes(input.facts, domain, agencyInOwnWords);
  const said = (reason: string) => (field.helpText ? `${field.helpText} ${reason}` : reason);
  /* No positions, and the reason in their place. The escape hatch is the
     answer here, so it is never dropped. */
  if (!region) return withoutOptions(field, said(note));
  const options =
    field.optionsFrom === 'medicine_pathway_positions'
      ? medicineOptions(input, region)
      : pathwayOptions({ domain, region });
  /* A regulator this catalogue covers, and still nothing for this programme —
     an empty select would say "choose one of none". */
  if (options.length === 0) return withoutOptions(field, said(nothingToOffer(input)));
  return {
    ...field,
    helpText: said(note),
    options,
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
