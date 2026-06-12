/**
 * ChEMBL client — curated bioactive-molecule data from EMBL-EBI.
 *
 * A small, governed wrapper over the public ChEMBL REST API for AnA's discovery /
 * developability tools. Returns citeable molecule records (ChEMBL ID + canonical
 * URL), the curated physicochemical / drug-likeness descriptors that ChEMBL
 * maintains (MW, ALogP, PSA, HBA/HBD, rotatable bonds, aromatic rings, Ro5
 * violations, QED), the highest development phase, and — for a given molecule —
 * its mechanism(s) of action and target(s).
 *
 * This is the authoritative source for physicochemical descriptors; the
 * deterministic `server/services/chem` layer owns only the structural-alert
 * screen, deliberately not recomputing MW/logP (which need a full toolkit).
 *
 * Base URL is configurable via CHEMBL_API_BASE_URL (egress proxy / tests).
 * Network/HTTP failures throw so callers can degrade gracefully.
 *
 * @module server/services/integrations/chembl-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://www.ebi.ac.uk/chembl/api/data';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 20;
const DEFAULT_RESULTS = 5;

const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

function baseUrl(): string {
  return (process.env.CHEMBL_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Human-readable label for ChEMBL's numeric `max_phase` development stage. */
export function maxPhaseLabel(phase: number | null | undefined): string {
  switch (phase) {
    case 4:
      return 'Approved (Phase 4)';
    case 3:
      return 'Phase 3';
    case 2:
      return 'Phase 2';
    case 1:
      return 'Phase 1';
    case 0:
    case null:
    case undefined:
      return 'Preclinical / not in clinical development';
    default:
      return `Phase ${phase}`;
  }
}

export interface ChemblMoleculeProperties {
  /** Full molecular weight (g/mol), curated by ChEMBL. */
  molecularWeight: number | null;
  /** Calculated logP (ALogP). */
  alogp: number | null;
  /** Polar surface area (Å²). */
  psa: number | null;
  hba: number | null;
  hbd: number | null;
  rotatableBonds: number | null;
  aromaticRings: number | null;
  /** Lipinski rule-of-five violations (0–4). */
  ro5Violations: number | null;
  /** Quantitative estimate of drug-likeness (0–1). */
  qed: number | null;
  molecularFormula: string | null;
}

export interface ChemblMolecule {
  chemblId: string;
  preferredName: string | null;
  /** Canonical SMILES from ChEMBL's structures record. */
  smiles: string | null;
  /** Numeric max development phase (0–4). */
  maxPhase: number | null;
  maxPhaseLabel: string;
  moleculeType: string | null;
  firstApproval: number | null;
  properties: ChemblMoleculeProperties;
  /** Canonical public URL — use for citation. */
  url: string;
}

export interface ChemblMechanism {
  mechanismOfAction: string | null;
  targetChemblId: string | null;
  actionType: string | null;
  /** Canonical target URL when a target id is present. */
  targetUrl: string | null;
}

export interface ChemblCompoundSearchResult {
  source: 'ChEMBL';
  query: string;
  totalCount: number;
  molecules: ChemblMolecule[];
}

export interface ChemblMechanismResult {
  source: 'ChEMBL';
  chemblId: string;
  mechanisms: ChemblMechanism[];
}

async function getJson(url: string): Promise<any> {
  const res = await fetchWithRetry(
    url,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  );
  if (!res.ok) throw new Error(`ChEMBL API returned HTTP ${res.status}`);
  return res.json();
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Build the molecule-search URL (exported for testability). */
export function buildMoleculeSearchUrl(query: string, limit: number): string {
  const retmax = Math.min(Math.max(Math.trunc(limit) || DEFAULT_RESULTS, 1), MAX_RESULTS);
  // ChEMBL's `pref_name__icontains` matches preferred names (e.g. "pembrolizumab").
  const qs = new URLSearchParams({
    pref_name__icontains: query,
    format: 'json',
    limit: String(retmax),
  });
  return `${baseUrl()}/molecule?${qs.toString()}`;
}

/** Normalize a raw ChEMBL molecule record into our shape. */
export function normalizeMolecule(raw: any): ChemblMolecule {
  const m = raw ?? {};
  const props = m.molecule_properties ?? {};
  const structs = m.molecule_structures ?? {};
  const chemblId: string = m.molecule_chembl_id || '';
  return {
    chemblId,
    preferredName: m.pref_name ?? null,
    smiles: structs.canonical_smiles ?? null,
    maxPhase: num(m.max_phase),
    maxPhaseLabel: maxPhaseLabel(num(m.max_phase)),
    moleculeType: m.molecule_type ?? null,
    firstApproval: num(m.first_approval),
    properties: {
      molecularWeight: num(props.full_mwt),
      alogp: num(props.alogp),
      psa: num(props.psa),
      hba: num(props.hba),
      hbd: num(props.hbd),
      rotatableBonds: num(props.rtb),
      aromaticRings: num(props.aromatic_rings),
      ro5Violations: num(props.num_ro5_violations),
      qed: num(props.qed_weighted),
      molecularFormula: props.full_molformula ?? null,
    },
    url: chemblId ? `https://www.ebi.ac.uk/chembl/compound_report_card/${chemblId}/` : 'https://www.ebi.ac.uk/chembl/',
  };
}

/**
 * Search ChEMBL for molecules by preferred name (drug/compound name). Throws on
 * network/HTTP error so the caller can fall back to manual-search guidance.
 */
export async function searchChemblCompounds(
  query: string,
  limit = DEFAULT_RESULTS
): Promise<ChemblCompoundSearchResult> {
  const trimmed = (query ?? '').trim();
  if (!trimmed) {
    return { source: 'ChEMBL', query: '', totalCount: 0, molecules: [] };
  }
  const data = await getJson(buildMoleculeSearchUrl(trimmed, limit));
  const list: any[] = Array.isArray(data?.molecules) ? data.molecules : [];
  const totalCount = Number(data?.page_meta?.total_count ?? list.length) || list.length;
  return {
    source: 'ChEMBL',
    query: trimmed,
    totalCount,
    molecules: list.map(normalizeMolecule),
  };
}

/** Build the mechanism-lookup URL (exported for testability). */
export function buildMechanismUrl(chemblId: string): string {
  const qs = new URLSearchParams({
    molecule_chembl_id: chemblId,
    format: 'json',
    limit: '20',
  });
  return `${baseUrl()}/mechanism?${qs.toString()}`;
}

/**
 * Look up mechanism(s) of action and target(s) for a specific ChEMBL molecule id.
 */
export async function getChemblMechanisms(chemblId: string): Promise<ChemblMechanismResult> {
  const id = (chemblId ?? '').trim();
  if (!id) return { source: 'ChEMBL', chemblId: '', mechanisms: [] };
  const data = await getJson(buildMechanismUrl(id));
  const list: any[] = Array.isArray(data?.mechanisms) ? data.mechanisms : [];
  const mechanisms: ChemblMechanism[] = list.map(raw => {
    const targetId: string | null = raw?.target_chembl_id ?? null;
    return {
      mechanismOfAction: raw?.mechanism_of_action ?? null,
      targetChemblId: targetId,
      actionType: raw?.action_type ?? null,
      targetUrl: targetId
        ? `https://www.ebi.ac.uk/chembl/target_report_card/${targetId}/`
        : null,
    };
  });
  return { source: 'ChEMBL', chemblId: id, mechanisms };
}
