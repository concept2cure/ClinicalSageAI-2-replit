/**
 * The user fee rule: an orphan exemption from the application fee, claimed
 * where the rest of the interview says it does not hold.
 *
 * Split out of cross-node-rules.ts on 2026-11-02 (S4), as the shelf-life rule
 * was, to keep that file under its line limit (RULE 6: split, don't add). The
 * judgement is the fee vocabulary's own (flows/nda-submission-user-fee.ts
 * `userFeeVerdictOf`), which the war game's fee rules read too, so the
 * interview and the war game cannot disagree on whether an exemption holds.
 *
 * @module server/services/ana/intelligence-questions/cross-node-rules-user-fee
 */

import type { CrossNodeRule } from './cross-node-rules.js';
import {
  UNSUPPORTED_EXEMPTION_NOTE,
  isUnsupportedExemption,
  userFeeVerdictOf,
} from './flows/nda-submission-user-fee.js';

export const USER_FEE_EXEMPTION_RULE: CrossNodeRule = {
  id: 'xn_fee_exemption_unsupported',
  appliesTo: ['nda_submission', 'bla_submission'],
  /* The designation and the pathway are read, not waited on: a blank
     designation is itself the "cannot confirm" case. */
  triggeredBy: ['user_fee_paid'],
  check(flat, _state, definition) {
    const biosimilar = definition.category === 'bla_submission' && flat['bla_pathway'] === '351k_biosimilar';
    const verdict = userFeeVerdictOf(flat['user_fee_paid'], flat['orphan_designation'], biosimilar);
    if (!isUnsupportedExemption(verdict)) return null;
    return {
      checkId: 'xn_fee_exemption_unsupported',
      severity: verdict === 'exemption_unconfirmed' ? 'info' : 'warning',
      title: 'Orphan Fee Exemption Not Supported by the Interview',
      message: UNSUPPORTED_EXEMPTION_NOTE[verdict],
      reference: 'FD&C Act §736(a)(1)(F), §736(e) (21 USC 379h); FD&C Act §526 (21 USC 360bb); 21 CFR 316.24',
      questionId: '_cross_node',
      triggerValues: {
        user_fee_paid: flat['user_fee_paid'],
        orphan_designation: flat['orphan_designation'],
        ...(definition.category === 'bla_submission' ? { bla_pathway: flat['bla_pathway'] } : {}),
      },
    };
  },
};
