/**
 * Phase 3 Projects — instruction templates (PINSTR_TEMPLATES).
 *
 * Verbatim from design-system/ui_kits/home/Projects.jsx (lines 613–618).
 */
import type { InstructionTemplate } from '../types';

export const PINSTR_TEMPLATES: InstructionTemplate[] = [
  {
    id: 'fda-510k',
    label: 'FDA 510(k) drafting',
    hint: 'Cite 21 CFR 807.92, sentence case, predicate-first',
    body: 'Always cite the FDA reference in parentheses. Use sentence case throughout. Default to 21 CFR 807.92 ordering. When discussing substantial equivalence, lead with the predicate device characteristics, then describe differences.',
  },
  {
    id: 'eu-mdr',
    label: 'EU MDR CER',
    hint: 'MEDDEV 2.7/1 Rev 4 structure, Article 61',
    body: 'Follow MEDDEV 2.7/1 Rev 4 section ordering. Cite Article 61 of the MDR for clinical evaluation requirements. Use British English spelling. Always note the device class (I, IIa, IIb, III) and conformity-assessment route.',
  },
  {
    id: 'eCTD',
    label: 'eCTD authoring',
    hint: 'CTD module structure, granularity, leaf metadata',
    body: 'Follow ICH CTD module structure (M1 regional, M2 summaries, M3 quality, M4 nonclinical, M5 clinical). Each leaf must include eCTD operation (new/replace/append/delete), MD5 checksum reference, and STF if applicable.',
  },
  {
    id: 'house',
    label: 'House style',
    hint: 'Sentence case, no emoji, numbers over adjectives',
    body: 'Sentence case throughout. No emoji. No exclamation marks. Prefer numbers over adjectives ("28% reduction" not "significant reduction"). Be direct and specific. When uncertain, ask before assuming.',
  },
];
