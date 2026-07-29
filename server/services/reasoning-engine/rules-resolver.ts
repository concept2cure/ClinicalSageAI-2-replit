/**
 * Reasoning Engine — deterministic rules resolver (WO-5)
 *
 * Answers every reasoning task from the versioned rule data. Pure and
 * deterministic: no DB, no network, no LLM. This is the determinism boundary —
 * the structural answers callers rely on.
 */

import {
  ReasoningError,
  type ReasoningRequest,
  type ReasoningResolver,
  type ReasoningResult,
} from './types.js';
import {
  PROFILE_VERSION,
  ctdDependencies,
  granularityRule,
  requiredSections,
  reviewClock,
} from './rule-data.js';

function result<T>(req: ReasoningRequest, data: T, rationale: string): ReasoningResult<T> {
  return { ok: true, resolver: 'rules', task: req.task, data, rationale, profileVersion: PROFILE_VERSION };
}

export const rulesResolver: ReasoningResolver = {
  name: 'rules',

  supports(req: ReasoningRequest): boolean {
    return (
      req.task === 'required-sections' ||
      req.task === 'ctd-dependencies' ||
      req.task === 'granularity' ||
      req.task === 'review-clock'
    );
  },

  resolve<T = unknown>(req: ReasoningRequest): ReasoningResult<T> {
    switch (req.task) {
      case 'required-sections': {
        const sections = requiredSections(req.region, req.applicationType);
        return result(
          req,
          sections,
          `${sections.filter(s => s.required).length} required sections for ${req.region.toUpperCase()} ${req.applicationType.toUpperCase()} (Module 1 regional + ICH M4 common).`
        ) as ReasoningResult<T>;
      }
      case 'ctd-dependencies': {
        if (!req.sectionCode) throw new ReasoningError('BAD_INPUT', 'ctd-dependencies requires sectionCode.');
        const deps = ctdDependencies(req.sectionCode);
        return result(
          req,
          deps,
          deps.length
            ? `Section ${req.sectionCode} summarises and therefore depends on: ${deps.join(', ')}.`
            : `Section ${req.sectionCode} has no upstream CTD prerequisites.`
        ) as ReasoningResult<T>;
      }
      case 'granularity': {
        if (!req.sectionCode) throw new ReasoningError('BAD_INPUT', 'granularity requires sectionCode.');
        const rule = granularityRule(req.region, req.applicationType, req.sectionCode);
        return result(req, rule, `Granularity rule for ${req.sectionCode}: ${rule}.`) as ReasoningResult<T>;
      }
      case 'review-clock': {
        const clock = reviewClock(req.region, req.applicationType);
        return result(
          req,
          clock,
          `${clock.model}: ${clock.nominalDays === 0 ? 'no fixed statutory clock' : `${clock.nominalDays} days`}${clock.clockStops ? ' (with clock-stops)' : ''}. ${clock.basis}.`
        ) as ReasoningResult<T>;
      }
      default:
        throw new ReasoningError('UNSUPPORTED_TASK', `rules-resolver does not support task: ${(req as ReasoningRequest).task}`);
    }
  },
};
