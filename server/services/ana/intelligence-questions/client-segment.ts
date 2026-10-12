/**
 * The client segment an interview runs under (founder's directive, 2026-10-12).
 *
 * `getFlowDefinition` withholds a flow whose `clientTypes` exclude the client
 * (flows/index.ts). The segment was derived in the executor as
 * `projectType === 'medtech' ? 'medtech' : projectType === 'biotech' ? … :
 * 'pharma'` — but `projectType` carries the SUBMISSION type ('IND', 'NDA',
 * '510k'), never a segment. So every interview ran as 'pharma', and the
 * 510(k), PMA and CER flows were withheld from the clients they are written
 * for. A diagnostics programme had no segment at all and was read as pharma
 * too.
 *
 * Here instead of in the executor so it can be tested without loading it, and
 * so the rule is readable in one screen.
 *
 * @module server/services/ana/intelligence-questions/client-segment
 */

export type InterviewClientType = 'pharma' | 'biotech' | 'medtech' | 'ivd';

/** A segment a caller may pass directly. */
const SEGMENT: Readonly<Record<string, InterviewClientType>> = {
  pharma: 'pharma',
  biotech: 'biotech',
  medtech: 'medtech',
  mdx: 'medtech',
  device: 'medtech',
  ivd: 'ivd',
  diagnostics: 'ivd',
};

/** A submission type implies the segment that files it. */
const DEVICE_SUBMISSION = /^(510k|510\(k\)|pma|de_novo|de novo|hde|ide|513g|eua)$/;
const MEDICINE_SUBMISSION = /^(ind|nda|bla|anda|maa|cta|jnda|505b2|351k)$/;

/**
 * The segment, or null when the value says nothing about it.
 *
 * Null means NO restriction, which is the honest reading of not knowing: a
 * wrong segment silently removes whole interviews, and a person who came to
 * start a 510(k) would be told no such flow exists.
 */
export function interviewClientType(projectType?: string | null): InterviewClientType | null {
  const value = (projectType ?? '').trim().toLowerCase();
  if (!value) return null;
  if (Object.hasOwn(SEGMENT, value)) return SEGMENT[value];
  if (DEVICE_SUBMISSION.test(value)) return 'medtech';
  if (MEDICINE_SUBMISSION.test(value)) return 'pharma';
  return null;
}
