/**
 * License-gated medical-coding service — MedDRA and WHODrug.
 *
 * MedDRA (the Medical Dictionary for Regulatory Activities) and WHODrug (the WHO
 * Drug Dictionary) are PROPRIETARY, LICENSED terminologies. Their content is NOT
 * shipped with this platform and MUST NOT be committed to the repository. This
 * service therefore FAILS CLOSED: with no dictionary configured every coding call
 * returns an honest `license_required` envelope (never a fabricated code). When a
 * licensed dictionary file is provided via the configured path/env, the service
 * activates and performs DETERMINISTIC matching over that governed data — there is
 * no LLM and no network in the matching path, so identical input over the same
 * dictionary snapshot always yields identical output.
 *
 * Configuration (paths to caller-provided, license-covered JSON dictionaries):
 *   - MEDDRA_DICTIONARY_PATH   → a MedDRA dictionary file (array of {@link MeddraRow}).
 *   - WHODRUG_DICTIONARY_PATH  → a WHODrug dictionary file (array of {@link WhodrugRow}).
 * Both are optional and independent: configuring one activates that dictionary only.
 * Tests inject a tiny SYNTHETIC (clearly non-licensed) fixture via these same envs.
 *
 * Matching is deterministic: normalized exact match first, then synonym match, then
 * a conservative substring/token rank. No fuzzy edit-distance, no model estimation.
 *
 * @module server/services/medical-coding/medical-coding-service
 */

import { readFileSync } from 'node:fs';

/** Provenance/result status for a coding call. */
export type CodingStatus = 'coded' | 'no_match' | 'license_required';

/** A single MedDRA dictionary row (Preferred Term centric). */
export interface MeddraRow {
  /** Preferred Term code (the canonical MedDRA PT identifier). */
  ptCode: string;
  /** Preferred Term name. */
  ptName: string;
  /** Lowest Level Terms that map to this PT (verbatim synonyms). */
  llt?: string[];
  /** High Level Term (optional context). */
  hlt?: string;
  /** System Organ Class (optional context). */
  soc?: string;
}

/** A single WHODrug dictionary row (ingredient/ATC centric). */
export interface WhodrugRow {
  /** Active ingredient / substance name (the canonical WHODrug concept). */
  ingredient: string;
  /** Anatomical Therapeutic Chemical (ATC) code, when classified. */
  atcCode?: string;
  /** ATC text (the ATC class description). */
  atcText?: string;
  /** Trade/brand names and other verbatim synonyms that map to this ingredient. */
  synonyms?: string[];
}

/** A successful MedDRA match. */
export interface MeddraMatch {
  status: 'coded';
  dictionary: 'MedDRA';
  query: string;
  ptCode: string;
  ptName: string;
  llt?: string;
  hlt?: string;
  soc?: string;
  /** Deterministic match confidence: 1 = normalized exact, <1 = synonym/substring. */
  confidence: number;
  matchType: 'exact' | 'synonym' | 'substring';
}

/** A successful WHODrug match. */
export interface WhodrugMatch {
  status: 'coded';
  dictionary: 'WHODrug';
  query: string;
  ingredient: string;
  atcCode?: string;
  atcText?: string;
  confidence: number;
  matchType: 'exact' | 'synonym' | 'substring';
}

/** No dictionary entry matched the term (honest empty result — not a fabricated code). */
export interface NoMatch {
  status: 'no_match';
  dictionary: 'MedDRA' | 'WHODrug';
  query: string;
  message: string;
}

/** The dictionary is not licensed/configured — fail closed (never guess a code). */
export interface LicenseRequired {
  status: 'license_required';
  dictionary: 'MedDRA' | 'WHODrug';
  message: string;
}

export type MeddraResult = MeddraMatch | NoMatch | LicenseRequired;
export type WhodrugResult = WhodrugMatch | NoMatch | LicenseRequired;

/** Options for a MedDRA coding call. */
export interface MeddraOptions {
  /** Optional free-text context (e.g. SOC hint) for the caller's audit trail. */
  context?: string;
}

/** Explicit dictionary paths, overriding the environment (used by tests). */
export interface MedicalCodingConfig {
  meddraPath?: string;
  whodrugPath?: string;
}

const MEDDRA_ENV = 'MEDDRA_DICTIONARY_PATH';
const WHODRUG_ENV = 'WHODRUG_DICTIONARY_PATH';

/** Collapse case/whitespace/punctuation so verbatim variants compare equal. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRows<T>(path: string): T[] {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Dictionary at ${path} must be a JSON array of rows.`);
  }
  return parsed as T[];
}

/**
 * Loads and indexes a licensed dictionary on first use and serves deterministic
 * lookups. A fresh instance is created per resolved path so tests can point at a
 * synthetic fixture without leaking state into production configuration.
 */
class DictionaryIndex<TRow> {
  private exact = new Map<string, TRow>();
  private synonym = new Map<string, TRow>();
  private rows: Array<{ row: TRow; normName: string }> = [];

  constructor(
    rows: TRow[],
    keyOf: (row: TRow) => string,
    synonymsOf: (row: TRow) => string[],
  ) {
    for (const row of rows) {
      const primary = normalize(keyOf(row));
      if (primary) {
        if (!this.exact.has(primary)) this.exact.set(primary, row);
        this.rows.push({ row, normName: primary });
      }
      for (const syn of synonymsOf(row)) {
        const normSyn = normalize(syn);
        if (normSyn && !this.synonym.has(normSyn)) this.synonym.set(normSyn, row);
      }
    }
  }

  /**
   * Deterministic best match: exact → synonym → shortest containing primary name.
   * Returns null when nothing matches (the caller emits an honest no_match).
   */
  match(query: string): { row: TRow; matchType: 'exact' | 'synonym' | 'substring' } | null {
    const norm = normalize(query);
    if (!norm) return null;

    const exact = this.exact.get(norm);
    if (exact) return { row: exact, matchType: 'exact' };

    const synonym = this.synonym.get(norm);
    if (synonym) return { row: synonym, matchType: 'synonym' };

    // Conservative substring rank: candidates whose primary name contains, or is
    // contained by, the query. Shortest name wins (most specific), with the
    // normalized name as a stable tie-break so the result is fully reproducible.
    let best: { row: TRow; normName: string } | null = null;
    for (const candidate of this.rows) {
      if (candidate.normName.includes(norm) || norm.includes(candidate.normName)) {
        if (
          best === null ||
          candidate.normName.length < best.normName.length ||
          (candidate.normName.length === best.normName.length &&
            candidate.normName < best.normName)
        ) {
          best = candidate;
        }
      }
    }
    return best ? { row: best.row, matchType: 'substring' } : null;
  }
}

const CONFIDENCE: Record<'exact' | 'synonym' | 'substring', number> = {
  exact: 1,
  synonym: 0.9,
  substring: 0.6,
};

/**
 * License-gated coding service. Holds no global mutable state beyond a per-path
 * dictionary cache, so it is safe to instantiate ad hoc (tests) or share.
 */
export class MedicalCodingService {
  private meddraCache = new Map<string, DictionaryIndex<MeddraRow>>();
  private whodrugCache = new Map<string, DictionaryIndex<WhodrugRow>>();

  constructor(private readonly config: MedicalCodingConfig = {}) {}

  private resolveMeddraPath(): string | undefined {
    return this.config.meddraPath ?? process.env[MEDDRA_ENV] ?? undefined;
  }

  private resolveWhodrugPath(): string | undefined {
    return this.config.whodrugPath ?? process.env[WHODRUG_ENV] ?? undefined;
  }

  /** True when a MedDRA dictionary is configured (does not validate contents). */
  isMeddraLicensed(): boolean {
    return Boolean(this.resolveMeddraPath());
  }

  /** True when a WHODrug dictionary is configured (does not validate contents). */
  isWhodrugLicensed(): boolean {
    return Boolean(this.resolveWhodrugPath());
  }

  private getMeddraIndex(path: string): DictionaryIndex<MeddraRow> {
    let index = this.meddraCache.get(path);
    if (!index) {
      index = new DictionaryIndex<MeddraRow>(
        parseRows<MeddraRow>(path),
        (r) => r.ptName,
        (r) => [r.ptName, ...(r.llt ?? [])],
      );
      this.meddraCache.set(path, index);
    }
    return index;
  }

  private getWhodrugIndex(path: string): DictionaryIndex<WhodrugRow> {
    let index = this.whodrugCache.get(path);
    if (!index) {
      index = new DictionaryIndex<WhodrugRow>(
        parseRows<WhodrugRow>(path),
        (r) => r.ingredient,
        (r) => [r.ingredient, ...(r.synonyms ?? [])],
      );
      this.whodrugCache.set(path, index);
    }
    return index;
  }

  /**
   * Code a free-text adverse-event/condition term to a MedDRA Preferred Term.
   * Returns `license_required` when no MedDRA dictionary is configured (fail closed).
   */
  codeMeddra(term: string, _opts: MeddraOptions = {}): MeddraResult {
    const path = this.resolveMeddraPath();
    if (!path) {
      return {
        status: 'license_required',
        dictionary: 'MedDRA',
        message:
          'MedDRA is a proprietary, licensed dictionary and is not configured. Provide a licensed ' +
          `MedDRA dictionary via ${MEDDRA_ENV} to enable coding. No code is returned without a license.`,
      };
    }
    const query = term.trim();
    const found = this.getMeddraIndex(path).match(query);
    if (!found) {
      return {
        status: 'no_match',
        dictionary: 'MedDRA',
        query,
        message: 'No MedDRA Preferred Term matched. Refine the verbatim term or code manually; no code was fabricated.',
      };
    }
    const { row, matchType } = found;
    return {
      status: 'coded',
      dictionary: 'MedDRA',
      query,
      ptCode: row.ptCode,
      ptName: row.ptName,
      llt: matchType === 'synonym' ? query : undefined,
      hlt: row.hlt,
      soc: row.soc,
      confidence: CONFIDENCE[matchType],
      matchType,
    };
  }

  /**
   * Code a free-text drug/substance name to a WHODrug ingredient (with ATC).
   * Returns `license_required` when no WHODrug dictionary is configured (fail closed).
   */
  codeWhodrug(drugName: string): WhodrugResult {
    const path = this.resolveWhodrugPath();
    if (!path) {
      return {
        status: 'license_required',
        dictionary: 'WHODrug',
        message:
          'WHODrug is a proprietary, licensed dictionary and is not configured. Provide a licensed ' +
          `WHODrug dictionary via ${WHODRUG_ENV} to enable coding. No code is returned without a license.`,
      };
    }
    const query = drugName.trim();
    const found = this.getWhodrugIndex(path).match(query);
    if (!found) {
      return {
        status: 'no_match',
        dictionary: 'WHODrug',
        query,
        message: 'No WHODrug ingredient matched. Refine the drug name or code manually; no code was fabricated.',
      };
    }
    const { row, matchType } = found;
    return {
      status: 'coded',
      dictionary: 'WHODrug',
      query,
      ingredient: row.ingredient,
      atcCode: row.atcCode,
      atcText: row.atcText,
      confidence: CONFIDENCE[matchType],
      matchType,
    };
  }
}

/** Process-wide singleton reading dictionary paths from the environment. */
let defaultService: MedicalCodingService | null = null;

/** The shared, env-configured coding service (lazily created). */
export function getMedicalCodingService(): MedicalCodingService {
  if (!defaultService) defaultService = new MedicalCodingService();
  return defaultService;
}
