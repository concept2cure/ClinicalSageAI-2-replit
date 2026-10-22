import { getApplicationType } from '../../../shared/regulatory/global-document-registry';
import { resolveRegistryId } from '../regulatory/registry/legacySubmissionTypeMapper';

export class ReportRegistryError extends Error {
  readonly code = 'INVALID_REPORT_REGISTRY';
}

/** Explicit choices never silently fall back to another jurisdiction. */
export function explicitReportRegistry(options?: { explicitRegistryId?: string; explicitSubmissionType?: string }): string | undefined {
  const resolve = (input: string): string => {
    const id = resolveRegistryId(input) ?? input;
    if (!getApplicationType(id)) throw new ReportRegistryError(`Unknown reporting registry context: ${input}`);
    return id;
  };
  const registry = options?.explicitRegistryId ? resolve(options.explicitRegistryId) : undefined;
  const submission = options?.explicitSubmissionType ? resolve(options.explicitSubmissionType) : undefined;
  if (registry && submission && registry !== submission) throw new ReportRegistryError('registryId and submissionType name different reporting requirements.');
  return registry ?? submission;
}
