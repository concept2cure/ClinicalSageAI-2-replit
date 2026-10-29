/**
 * Load a concept2cure.csr-adam-bundle.v1 manifest's files and derive the CSR
 * source from them (CSR slice 6, 2026-10-29). The caller
 * (vault-source-input.ts) supplies each file under the same exact-version,
 * digest and lifecycle checks as the manifest itself; this module only reads,
 * validates and derives. Every failure is typed and names no uploaded value.
 */
import {
  ADAM_DATASET_NAMES, CSR_ADAM_BUNDLE_FORMAT, CsrAdamBundleSchema, CsrEfficacyResultsSchema,
} from '../../../shared/csr-adam-bundle.js';
import type { CsrSourceEnvelope, CsrSourceSelection } from '../../../shared/csr-source-input.js';
import { readAdamDataset } from './adam-dataset-reader.js';
import { deriveCsrSourceFromAdam, type AdamDatasets } from './adam-source-derivation.js';
import { CsrSourceInputError } from './source-access.js';

export interface AdamComponent { bytes: Buffer; fileName: string; approved: boolean }
type LoadComponent = (selection: CsrSourceSelection) => Promise<AdamComponent>;

export const isAdamBundle = (raw: unknown): boolean =>
  !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).format === CSR_ADAM_BUNDLE_FORMAT;

const issuesOf = (issues: Array<{ path: (string | number)[]; code: string; message: string }>) =>
  issues.slice(0, 30).map(issue => ({ path: issue.path.join('.'),
    message: issue.code === 'custom' ? issue.message : 'Invalid or missing value. Check the documented field type and bounds.' }));

function parseBundle(raw: unknown) {
  const parsed = CsrAdamBundleSchema.safeParse(raw);
  if (!parsed.success) throw new CsrSourceInputError(422, 'CSR_ADAM_BUNDLE_INVALID', 'The ADaM bundle manifest does not meet its documented contract. No tables were saved.', issuesOf(parsed.error.issues));
  const ids = [...Object.values(parsed.data.datasets), parsed.data.efficacyResults].map(r => r!.documentId);
  if (new Set(ids).size !== ids.length) throw new CsrSourceInputError(422, 'CSR_ADAM_BUNDLE_INVALID', 'Each dataset and the efficacy results must be a different Vault document.');
  return parsed.data;
}

async function readEfficacy(component: AdamComponent) {
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(component.bytes)); }
  catch { throw new CsrSourceInputError(422, 'CSR_ADAM_EFFICACY_INVALID', 'The efficacy results file is not valid UTF-8 JSON.'); }
  const parsed = CsrEfficacyResultsSchema.safeParse(raw);
  if (!parsed.success) throw new CsrSourceInputError(422, 'CSR_ADAM_EFFICACY_INVALID', 'The efficacy results file does not meet its documented contract.', issuesOf(parsed.error.issues));
  return parsed.data;
}

/** The derived source, and whether every file the manifest names is lifecycle-approved at its pinned version. */
export async function loadAdamBundleEnvelope(raw: unknown, loadComponent: LoadComponent): Promise<{ envelope: CsrSourceEnvelope; componentsApproved: boolean }> {
  const bundle = parseBundle(raw);
  const datasets: Partial<AdamDatasets> = {};
  let componentsApproved = true;
  for (const name of ADAM_DATASET_NAMES) {
    const ref = bundle.datasets[name];
    if (!ref) continue;
    const component = await loadComponent(ref);
    componentsApproved &&= component.approved;
    const read = readAdamDataset(component.bytes, component.fileName);
    if (!read.ok) throw new CsrSourceInputError(422, 'CSR_ADAM_DATASET_UNREADABLE', `The ${name} file could not be read as one ADaM dataset (${read.reason}).`, [{ path: `datasets.${name}`, message: read.reason }]);
    datasets[name] = read.dataset;
  }
  const efficacyFile = await loadComponent(bundle.efficacyResults);
  componentsApproved &&= efficacyFile.approved;
  const envelope = deriveCsrSourceFromAdam(bundle, datasets as AdamDatasets, await readEfficacy(efficacyFile));
  return { envelope, componentsApproved };
}
