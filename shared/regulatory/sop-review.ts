/**
 * SOP review: a client's SOP text read against the requirements for its topic
 * and product (./sop-requirements.ts), sentence by sentence.
 *
 * WHY (2026-10-08, D2): AnA could write an SOP but not read one back, so "is
 * our CAPA SOP inspection-ready?" was answered by a model reading the text.
 * This is the deterministic half: per requirement, the sentence whose wording
 * addresses it, or that none was found. It is not a compliance verdict, and
 * says so in `method`.
 *
 * No IO, no clock, no model. Client- and server-safe.
 *
 * @module shared/regulatory/sop-review
 */

import { basisLabel } from './regulatory-basis.js';
import { sopRequirementsFor, type SopProductDomain, type SopTopic } from './sop-requirements.js';

export interface SopElementFinding {
  id: string;
  requirement: string;
  basis: string;
  status: 'addressed' | 'not_found';
  /** The sentence whose wording addresses it. */
  evidence?: string;
}

export interface SopReview {
  topic: SopTopic;
  domain: SopProductDomain;
  status: 'reviewed' | 'no_text';
  governing: string[];
  elements: SopElementFinding[];
  summary: { addressed: number; notFound: number };
  notes: string[];
  method: string;
}

const REVIEW_METHOD =
  'Each requirement is matched against the SOP’s own wording, sentence by sentence. "addressed" quotes the sentence that addresses it; ' +
  '"not_found" means the check found no wording for it. This is not a verdict on the procedure: read the SOP for anything marked not found.';

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.;:!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matches(sentence: string, alt: RegExp | readonly RegExp[]): boolean {
  return (Array.isArray(alt) ? alt : [alt]).every((re) => re.test(sentence));
}

/** Review `text` against the requirements for `topic` and `domain`. Deterministic; no model. */
export function reviewSopText(text: string, topic: SopTopic, domain: SopProductDomain, asOf: string): SopReview {
  const req = sopRequirementsFor(topic, domain, asOf);
  const parts = sentences(text ?? '');
  const elements: SopElementFinding[] = req.elements.map((el) => {
    const evidence = parts.find((s) => el.detect.some((alt) => matches(s, alt)));
    return {
      id: el.id,
      requirement: el.requirement,
      basis: basisLabel(el.basis),
      status: evidence ? 'addressed' : 'not_found',
      ...(evidence ? { evidence: evidence.length > 300 ? `${evidence.slice(0, 297)}…` : evidence } : {}),
    };
  });
  const addressed = elements.filter((e) => e.status === 'addressed').length;
  return {
    topic,
    domain,
    status: parts.length === 0 ? 'no_text' : 'reviewed',
    governing: req.governing.map(basisLabel),
    elements,
    summary: { addressed, notFound: elements.length - addressed },
    notes: req.notes,
    method: REVIEW_METHOD,
  };
}
