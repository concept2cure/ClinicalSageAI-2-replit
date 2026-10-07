/** Adapter into the existing outline renderer; heading ownership stays shared. */
import {
  ICH_M11_PROTOCOL_BASIS,
  ICH_M11_PROTOCOL_SECTIONS,
} from '../../../../shared/regulatory/protocol-m11';
import type { DocumentOutline } from './types';

export const ICH_M11_PROTOCOL_OUTLINE: DocumentOutline = {
  id: 'protocol-m11',
  title: 'Interventional Clinical Trial Protocol (ICH M11 CeSHarP)',
  jurisdictions: 'ich',
  governing: [ICH_M11_PROTOCOL_BASIS, {
    ref: 'Concept2Cure M11 projection: front matter and L1/L2 only; heading retention is distinct from trial-content applicability; purposes are platform summaries; no technical exchange or filing approval assessment',
    confidence: 'platform-convention',
  }],
  aliases: ['protocol', 'clinical protocol', 'csp', 'protocol-m11'],
  owner: 'shared/regulatory/protocol-m11.ts',
  nodes: ICH_M11_PROTOCOL_SECTIONS.map((s) => ({
    ...(s.number ? { number: s.number } : {}),
    title: s.title,
    // M11 level 1/2 heading retention. Content applicability is not inferred.
    applies: 'always',
    purpose: `Retain this heading when using M11; assess whether its content applies to this trial. Platform authoring summary: ${s.purpose}`,
  })),
};
