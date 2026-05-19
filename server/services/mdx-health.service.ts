/**
 * MDX module health probe.
 *
 * Used by ops to verify that every backing table the kit's surfaces
 * depend on is provisioned and accessible, plus the optional shadow
 * services that gate enriched panels (predicate intelligence). The
 * /api/mdx/health endpoint is the canonical "is the MDX module ready
 * for paying-client traffic" check — one round-trip, full picture.
 *
 * No surface depends on this at runtime; it's an operator/investor
 * tool. Output is shaped for both human reading (warnings array) and
 * automated monitoring (per-table booleans).
 */

import { pool } from '../db';
import {
  REGULATORY_PATHWAYS,
  type RegulatoryPathway,
} from '../../shared/constants/mdx';

export interface TableHealth {
  /** Schema-qualified name (e.g. 'public.regulatory_programs',
   *  'clinical_ops.studies'). */
  name: string;
  /** Logical role this table plays in the MDX surfaces. */
  role: string;
  /** True when the table exists and is selectable. */
  exists: boolean;
  /** Row count when present, null when the table is missing. */
  rowCount: number | null;
  /** True when this table is required for the module's core function;
   *  false when its absence degrades a panel but doesn't block beta. */
  required: boolean;
}

export interface ShadowServiceHealth {
  name: string;
  /** True when the env var is set. Doesn't probe the actual service —
   *  that's a separate concern (the proxy calls themselves report 502
   *  when the configured host is unreachable). */
  configured: boolean;
  /** Surfaces affected when this service is down. */
  affectsSurfaces: string[];
}

export interface PathwayCoverage {
  pathway: RegulatoryPathway;
  /** True when at least one program in any org uses this pathway —
   *  signal to ops that the seed is broad enough for paying-client
   *  demos. */
  hasPrograms: boolean;
  programCount: number;
}

export type ReadinessLevel = 'ready' | 'partial' | 'not_ready';

export interface MdxHealthReport {
  module: 'mdx';
  /** Per-commit version stamp. Filled by the route handler with the
   *  current git head when available, else the deployed env var. */
  version: string | null;
  readiness: ReadinessLevel;
  tables: TableHealth[];
  shadowServices: ShadowServiceHealth[];
  pathwayCoverage: PathwayCoverage[];
  /** Human-readable advisories, ordered by severity. Empty when
   *  readiness === 'ready'. */
  warnings: string[];
  /** ISO timestamp the probe ran. */
  probedAt: string;
}

/* Tables backing the kit surfaces. The `required` flag separates
   beta-blocking infrastructure from optional-but-recommended enrichment.
   When `required` is missing we report readiness=not_ready. */
const PROBED_TABLES: Array<{ name: string; role: string; required: boolean }> = [
  /* Beta-blocking. */
  { name: 'public.regulatory_programs',           role: 'Programs list, every per-program endpoint',   required: true  },
  { name: 'public.saved_precedent_queries',       role: 'PrecedentSurface saved queries panel',        required: true  },
  { name: 'public.audit_logs',                    role: 'ProjectHome activity feed + 21 CFR Part 11', required: true  },
  { name: 'public.q_submissions',                 role: 'PreSubManager list + KPIs',                   required: true  },
  { name: 'public.q_sub_questions',               role: 'PreSubManager detail',                        required: true  },
  { name: 'public.q_sub_commitments',             role: 'PreSubManager detail + RIM recs',             required: true  },
  { name: 'public.q_sub_meetings',                role: 'PreSubManager detail + milestones',           required: true  },
  { name: 'public.cerv2_510k_sections',           role: 'eSTAR list, PMA modules, CER sections',       required: true  },
  /* Optional enrichment — degrades panels but doesn't block beta. */
  { name: 'public.safety_signals',                role: 'CerSurface signals table',                    required: false },
  { name: 'public.literature_entries',            role: 'CerSurface literature corpus + insights',     required: false },
  { name: 'public.c2c_submission_packages',       role: 'Workbench Submissions pane',                  required: false },
  { name: 'public.c2c_blockers',                  role: 'Workbench Validation rules matrix',           required: false },
  { name: 'clinical_ops.studies',                 role: 'PmaSurface trial metrics (Enrolled/Sites)',   required: false },
  { name: 'clinical_ops.deviations',              role: 'PmaSurface AE rate KPI',                      required: false },
  { name: 'clinical_ops.endpoint_results',        role: 'PmaSurface endpoints-achieved KPI',           required: false },
  /* Beta-surface tables (migration 20260507). Required for the kit
     surfaces UDI, Risk Management, Software lifecycle, and the Q-Sub
     briefing-document editor. */
  { name: 'public.udi_records',                   role: 'UdiSurface device records table',             required: true  },
  { name: 'public.risk_items',                    role: 'Risk management ISO 14971 hazard matrix',     required: true  },
  { name: 'public.risk_controls',                 role: 'Risk control measures (per risk item)',       required: true  },
  { name: 'public.software_lifecycle_items',      role: 'Software lifecycle IEC 62304 deliverables',   required: true  },
  { name: 'public.q_sub_section_bodies',          role: 'Q-Sub briefing-document section bodies',      required: true  },
  /* IVD + diagnostic tables (migration 20260508). Required when serving
     IVD / CDx / LDT clients; classed as 'required' so the health probe
     keeps the operator honest about applying the migration. */
  { name: 'public.ivd_analytical_performance',    role: 'IVD analytical performance studies',          required: true  },
  { name: 'public.ivd_clinical_performance',      role: 'IVD clinical performance studies',            required: true  },
  { name: 'public.ivdr_classifications',          role: 'EU IVDR Class A/B/C/D classifications',       required: true  },
  { name: 'public.ivdr_per_documents',            role: 'IVDR Performance Evaluation Reports',         required: true  },
  { name: 'public.ivd_clia_categorization',       role: 'CLIA complexity + waiver tracking',           required: true  },
  { name: 'public.cdx_pairings',                  role: 'Companion diagnostic pairings (drug ↔ device)', required: true },
  { name: 'public.cdx_concordance_studies',       role: 'CDx concordance to trial assay',              required: true  },
  { name: 'public.ldt_inventory',                 role: 'Laboratory-developed test inventory',         required: true  },
  { name: 'public.ldt_phase_milestones',          role: 'FDA LDT phase tracker milestones',            required: true  },
  /* Submission gateway tables (migration 20260509). */
  { name: 'public.submission_transmittals',       role: 'Multi-region submission transmittal log',     required: true  },
  { name: 'public.submission_validation_findings',role: 'Per-transmittal validator findings',          required: true  },
  { name: 'public.submission_gateway_credentials',role: 'Per-org gateway credentials registry',        required: true  },
  /* Notifications + clinical study tables (migration 20260510). */
  { name: 'public.mdx_notifications',             role: 'Cross-cutting MDX notification inbox',        required: true  },
  { name: 'public.mdx_notification_subscriptions',role: 'Per-user MDX notification opt-in matrix',     required: true  },
  { name: 'public.clinical_studies',              role: 'PMA / 510(k) clinical study records',         required: true  },
  { name: 'public.clinical_study_sites',          role: 'Study site list + enrollment counts',         required: true  },
  { name: 'public.clinical_study_deviations',     role: 'Study deviation log',                         required: true  },
  { name: 'public.clinical_study_aes',            role: 'Adverse event log + UADE flag',               required: true  },
  { name: 'public.clinical_study_endpoints',      role: 'Pre-specified endpoint results',              required: true  },
  /* QMS + labeling tables (migration 20260511). */
  { name: 'public.qms_documents',                 role: 'Controlled-document register (QMSR)',         required: true  },
  { name: 'public.qms_training_records',          role: 'Per-user training acknowledgments',           required: true  },
  { name: 'public.qms_suppliers',                 role: 'Approved supplier list + quality agreements', required: true  },
  { name: 'public.qms_internal_audits',           role: 'Internal audit schedule + reports',           required: true  },
  { name: 'public.qms_management_reviews',        role: 'Management review records',                   required: true  },
  { name: 'public.qms_nonconforming_products',    role: 'Nonconforming product log + dispositions',    required: true  },
  { name: 'public.labeling_documents',            role: 'IFU / package insert / patient label / manual', required: true },
  { name: 'public.labeling_translations',         role: 'Language variants per labeling document',     required: true  },
  { name: 'public.labeling_symbols',              role: 'ISO 15223-1 symbols per labeling document',   required: true  },
  /* Legacy archive importer (migration 20260512). */
  { name: 'public.import_jobs',                   role: 'Legacy archive import jobs',                  required: true  },
  { name: 'public.import_job_files',              role: 'Per-file mapping outcome for imports',        required: true  },
  { name: 'public.import_job_findings',           role: 'Import job validation findings',              required: true  },
];

/* Shadow services we proxy to. Configured = env var present; we don't
   actively probe the host because that adds startup latency and the
   service's first real request reports 502 quickly. */
const PROBED_SHADOW_SERVICES: Array<{
  name: string;
  envVar: string;
  affectsSurfaces: string[];
}> = [
  {
    name: 'predicate-intelligence',
    envVar: 'SHADOW_SERVICE_URL',
    affectsSurfaces: ['K510Surface predicate table', 'K510Surface SE matrix'],
  },
];

/**
 * Probe a single table for existence and row count. Uses
 * to_regclass for existence (no error on missing schema) and a
 * SELECT COUNT(*) when present. Returns rowCount=null on missing
 * table or query failure.
 */
async function probeTable(
  name: string,
  role: string,
  required: boolean,
): Promise<TableHealth> {
  try {
    const existsResult = await pool.query<{ exists: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [name],
    );
    const exists = existsResult.rows[0]?.exists === true;
    if (!exists) return { name, role, exists: false, rowCount: null, required };

    /* Count rows. Wrap in try so a permissions issue doesn't crash
       the whole probe — return rowCount: null in that case. */
    try {
      const countResult = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM ${name}`,
      );
      return { name, role, exists: true, rowCount: countResult.rows[0]?.n ?? 0, required };
    } catch {
      return { name, role, exists: true, rowCount: null, required };
    }
  } catch {
    return { name, role, exists: false, rowCount: null, required };
  }
}

/**
 * Probe pathway coverage across the entire database. Reports whether
 * each pathway (k510 / pma / cer) has at least one program — the
 * kit's pathway tabs need this so a paying-client demo can navigate
 * each tab and see real data.
 */
async function probePathwayCoverage(): Promise<PathwayCoverage[]> {
  try {
    const result = await pool.query<{ pathway: string; n: number }>(
      `SELECT regulatory_path AS pathway, COUNT(*)::int AS n
         FROM regulatory_programs
        WHERE regulatory_path IS NOT NULL
        GROUP BY 1`,
    );
    /* Normalize pathway codes to the kit closed-enum
       (regulatoryPath='510k' → kit pathway='k510'). */
    const PATH_TO_KIT: Record<string, RegulatoryPathway> = {
      '510k':    'k510',
      'de_novo': 'k510',
      'pma':     'pma',
      'cer':     'cer',
    };
    const counts = new Map<RegulatoryPathway, number>();
    for (const r of result.rows) {
      const kit = PATH_TO_KIT[(r.pathway ?? '').toLowerCase()];
      if (!kit) continue;
      counts.set(kit, (counts.get(kit) ?? 0) + r.n);
    }
    return REGULATORY_PATHWAYS.map((p) => ({
      pathway:      p,
      hasPrograms:  (counts.get(p) ?? 0) > 0,
      programCount: counts.get(p) ?? 0,
    }));
  } catch {
    return REGULATORY_PATHWAYS.map((p) => ({ pathway: p, hasPrograms: false, programCount: 0 }));
  }
}

/** Run the full health probe. Returns a single shaped report. */
export async function probeMdxHealth(): Promise<MdxHealthReport> {
  const [tables, pathwayCoverage] = await Promise.all([
    Promise.all(PROBED_TABLES.map((t) => probeTable(t.name, t.role, t.required))),
    probePathwayCoverage(),
  ]);

  const shadowServices: ShadowServiceHealth[] = PROBED_SHADOW_SERVICES.map((s) => ({
    name:            s.name,
    configured:      Boolean(process.env[s.envVar]),
    affectsSurfaces: s.affectsSurfaces,
  }));

  /* Compose readiness + warnings. */
  const warnings: string[] = [];

  const missingRequired = tables.filter((t) => t.required && !t.exists);
  for (const t of missingRequired) {
    warnings.push(
      `Required table ${t.name} is not provisioned — apply the relevant migration. Affects: ${t.role}.`,
    );
  }

  const missingOptional = tables.filter((t) => !t.required && !t.exists);
  for (const t of missingOptional) {
    warnings.push(
      `Optional table ${t.name} is not provisioned — ${t.role} will render the empty-state copy until provisioned.`,
    );
  }

  const emptyPathways = pathwayCoverage.filter((p) => !p.hasPrograms);
  for (const p of emptyPathways) {
    warnings.push(
      `No programs found for pathway '${p.pathway}' — run scripts/seed-mdx-beta.mjs to seed all pathways before paying-client demo.`,
    );
  }

  const unconfiguredShadows = shadowServices.filter((s) => !s.configured);
  for (const s of unconfiguredShadows) {
    warnings.push(
      `Shadow service '${s.name}' is not configured — ${s.affectsSurfaces.join(', ')} will render their fallback banners.`,
    );
  }

  let readiness: ReadinessLevel;
  if (missingRequired.length > 0) {
    readiness = 'not_ready';
  } else if (warnings.length > 0) {
    readiness = 'partial';
  } else {
    readiness = 'ready';
  }

  return {
    module:          'mdx',
    version:         process.env.GIT_COMMIT_SHA ?? null,
    readiness,
    tables,
    shadowServices,
    pathwayCoverage,
    warnings,
    probedAt:        new Date().toISOString(),
  };
}
