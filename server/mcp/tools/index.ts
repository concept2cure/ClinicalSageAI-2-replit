/**
 * The hand-curated tool catalog. Nineteen tools, one governed write.
 * Order is the order clients list them in.
 */

import type { AnyToolSpec } from './runtime';
import { listProjects, listSubmissions, listSequences, getSequenceStatus } from './catalog';
import { assessSequenceReadiness, readinessOverview, gaReadinessProbe } from './readiness';
import { validateEctdStructure, sweepContradictions } from './validation';
import { lookupIchGuideline, checkRegulatoryCurrency, lookupSubmissionDeficiencies } from './reference';
import { runCrlPremortem, searchPrecedents } from './intelligence';
import { listVaultDocuments, searchVaultDocuments } from './vault';
import { draftCoverLetter, draftAgencyResponse } from './drafting';
import { fileDraftForReview } from './governed';

export const CONNECTOR_TOOLS: readonly AnyToolSpec[] = [
  listProjects,
  listSubmissions,
  listSequences,
  getSequenceStatus,
  assessSequenceReadiness,
  readinessOverview,
  validateEctdStructure,
  sweepContradictions,
  lookupIchGuideline,
  checkRegulatoryCurrency,
  lookupSubmissionDeficiencies,
  runCrlPremortem,
  searchPrecedents,
  listVaultDocuments,
  searchVaultDocuments,
  gaReadinessProbe,
  draftCoverLetter,
  draftAgencyResponse,
  fileDraftForReview,
];
