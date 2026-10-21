/** Existing forms-panel record parsing, field receipts and download descriptions. */
import { serverMessage } from '@/lib/queryClient';
import { isIndProgramFacts, type IndProgramFacts as ProgramFacts } from './IndApplicantIdentity';

export interface BuildResult { formId?: string; missingRequired?: string[]; fields?: Record<string, unknown> | Array<unknown>; }

/** What the engine will produce for a form — the server's own plan. */
export interface RenderPlan {
  formId: string;
  method: 'official-acroform' | 'official-xfa-datasets' | 'reconstruction' | 'draft';
  officialTemplate: boolean;
  edition: string | null;
  reviewedBy: string | null;
  platformWrites: string[];
  sponsorCompletes: Array<{ id: string; label: string }>;
}

/** A sponsor-completed official form already filed into a sequence. */
export interface Placement {
  formId: string;
  leafId: number;
  sectionCode: string;
  /** The sequence it is in — the listing covers every sequence of the submission. */
  sequenceId?: number;
  sequenceNumber: string;
  fileName: string;
  sha256: string;
  byteSize: number;
  /**
   * The forms engine's check recorded with the attachment: [] = complete;
   * a list = attached, not complete (these are missing); null or absent = never
   * checked, not complete (QA 2026-10-08, second walk, j7).
   */
  requiredFieldsMissing?: string[] | null;
  /**
   * When the uploader attested the file is the completed, signed form; null =
   * nobody did; absent = the listing does not say (never read as either).
   */
  attestedAt?: string | null;
}

/** A registry form definition, as GET /api/ind-forms returns it (only what the panel reads). */
interface FormDefinition { formId?: string; fields?: Array<{ id?: string; options?: unknown }> }

/** The registry's options for one field of one form, or [] when the server sent none. */
function registryOptions(defs: FormDefinition[], formId: string, fieldId: string): string[] {
  const field = defs.find((d) => d?.formId === formId)?.fields?.find((f) => f?.id === fieldId);
  return Array.isArray(field?.options) ? field!.options.map(String) : [];
}

/** `FDA_1571` → `1571`. Notes read "FDA 1571", not "FDA FDA_1571": the engine's
 *  ids are canonical (`FDA_1571`) and were being pasted after another "FDA". */
export const shortFormId = (formId: string): string => formId.replace(/^FDA[_-]?/i, '');

interface FormsListing {
  forms: string[]; choices: { indType: string[]; studyPhase: string[] }; plans: Record<string, RenderPlan>;
  program: ProgramFacts | null; placements: Record<string, Placement[]>;
}
const isObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value);
function matchingProgram(value: unknown, ident: string | null): value is ProgramFacts | null {
  if (value === null) return ident === null;
  if (!isIndProgramFacts(value)) return false;
  return ident === null || value.id.toLowerCase() === ident.toLowerCase() || value.code === ident;
}
export function parseFormsListing(value: unknown, ident: string | null): FormsListing | null {
  if (!isObject(value) || !Array.isArray(value.forms) || !value.forms.every(form => typeof form === 'string')) return null;
  const program: unknown = value.program ?? null;
  if (!matchingProgram(program, ident)) return null;
  const defs = (Array.isArray(value.formDefinitions) ? value.formDefinitions : []) as FormDefinition[];
  const plans = (Array.isArray(value.renderPlans) ? value.renderPlans : []) as RenderPlan[];
  const placements: Record<string, Placement[]> = {};
  for (const row of (Array.isArray(value.placements) ? value.placements : []) as Placement[]) (placements[row.formId] ??= []).push(row);
  return {
    forms: value.forms, program, placements,
    choices: { indType: registryOptions(defs, 'FDA_1571', 'ind_type'), studyPhase: registryOptions(defs, 'FDA_1571', 'phase_of_study') },
    plans: Object.fromEntries(plans.map(plan => [plan.formId, plan])),
  };
}
export function formsReadFailure(status: unknown, loaded: boolean): 'forbidden' | 'error' | null {
  if ([401, 403].includes(Number(status))) return 'forbidden';
  return loaded ? null : 'error';
}
export function requestFailure(error: unknown, fallback: string): string {
  return serverMessage((error as { payload?: unknown } | null)?.payload) ?? fallback;
}
export function startable(current: () => boolean, busy: string | null): boolean { return current() && busy === null; }
type VerifiedBuildResult = BuildResult & { formId: string; missingRequired: string[]; fields: Record<string, unknown> | unknown[] };
function isBuildResult(value: unknown, formId: string): value is VerifiedBuildResult {
  if (!isObject(value) || typeof value.formId !== 'string' || shortFormId(value.formId).toUpperCase() !== shortFormId(formId).toUpperCase()) return false;
  if (!Array.isArray(value.missingRequired) || !value.missingRequired.every(field => typeof field === 'string' && field.trim() !== '')) return false;
  return value.fields != null && typeof value.fields === 'object';
}
export function checkedBuildResult(value: unknown, formId: string): VerifiedBuildResult | null {
  const rows: VerifiedBuildResult[] = [];
  for (const row of Array.isArray(value) ? value : [value]) {
    if (!isBuildResult(row, formId)) return null;
    rows.push(row);
  }
  if (rows.length === 0) return null;
  return { ...rows[0], missingRequired: rows.flatMap((row, index) => row.missingRequired.map(field => rows.length > 1 ? `Investigator ${index + 1}: ${field}` : field)) };
}
export function programInputKey(program: ProgramFacts | null): string {
  return JSON.stringify(program && {
    id: program.id, factsVersion: program.factsVersion, applicantSponsorId: program.applicantSponsorId, boundSponsor: program.boundSponsor,
    sponsorName: program.sponsorName, productName: program.productName, indication: program.indication,
    applicationNumber: program.applicationNumber, sponsorAddress: program.sponsorAddress, indType: program.indType,
  });
}
export function downloadDescription(res: Response): { kind: string; detail: string } {
  const hdr = (key: string) => res.headers?.get?.(key) ?? null;
  const kind = hdr('X-Form-Used-Official-Template') === 'true' ? 'official FDA template'
    : hdr('X-Form-Reconstructed') === 'true' ? 'faithful reconstruction — NOT the official Adobe-rendered form' : 'labeled draft — official template not installed';
  const headerCount = (key: string): number | null => { const value = hdr(key); return value === null ? null : value.split(',').filter(Boolean).length; };
  const requiredBlank = headerCount('X-Form-Required-Blank');
  const missingCount = headerCount('X-Form-Missing-Required') ?? 0;
  const blankClause = requiredBlank === null ? ' · this server did not report which required boxes are still blank'
    : requiredBlank > 0 ? ` · ${requiredBlank} required box(es) blank on the form for you to complete${missingCount ? ` (${missingCount} because the project record has no value)` : ''}` : '';
  const coverage = hdr('X-Form-Field-Coverage');
  return { kind, detail: `${coverage ? ' · coverage ' + coverage : ''}${blankClause}` };
}


export function completedFormBody(file: File, programIdent: string, sequenceId: number, metadata: Record<string, unknown>, attested: boolean): FormData {
  const form = new FormData();
  form.append('file', file); form.append('projectIdent', programIdent); form.append('sequenceId', String(sequenceId));
  for (const [key, value] of Object.entries(metadata)) {
    if (key !== 'projectIdent' && typeof value === 'string') form.append(key, value);
  }
  if (attested) form.append('attestCompletedSigned', 'true');
  return form;
}
