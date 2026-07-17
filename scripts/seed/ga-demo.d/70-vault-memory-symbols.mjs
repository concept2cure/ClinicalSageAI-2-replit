/**
 * 70-vault-memory-symbols.mjs — GA demo seed: Vault artifacts + AnA memory atoms
 * + ISO 15223-1 labeling symbols.
 *
 * Surfaces fed by this module:
 *   1. GET /api/mdx/vault (server/routes/mdx-vault.ts:70)
 *      → SELECT a.id, a.artifact_id, a.title, a.type, a.category, a.ctd_section,
 *               a.status, a.version, a.content_hash, a.created_by_id, a.created_at,
 *               a.updated_at, a.locked_at, a.metadata
 *          FROM concept2cure_artifacts a
 *          LEFT JOIN projects p ON p.id = a.project_id
 *         WHERE a.organization_id = $org AND a.status != 'archived'
 *         ORDER BY a.updated_at DESC
 *      The list derives a "family" from ctd_section (first char 1-5 → Module N,
 *      /cover/i → Cover letters, /form/i → Forms, else → Working files) and reads
 *      metadata.eSig, so the fixture spreads those. GET /vault/:id/versions
 *      (mdx-vault.ts:177) reads concept2cure_artifact_versions
 *      (version AS version_number, change_description AS change_summary), so a
 *      short version history is seeded per artifact.
 *   2. GET /api/mdx/ana/memory (server/routes/mdx-ana-memory.ts:56)
 *      → SELECT id, profile_id, category, subcategory, title, content,
 *               source_document_name, confidence_score, importance_level,
 *               is_verified_by_user, verified_at, verified_by, status,
 *               superseded_by_id, extracted_at, extracted_by, created_at, updated_at
 *          FROM client_memory_entries WHERE organization_id = $org
 *         ORDER BY CASE importance_level WHEN 'critical' THEN 0 ... END, updated_at DESC
 *   3. GET /api/mdx/labeling/:id (+ /:id/symbols) (server/routes/mdx-labeling.ts:144,311)
 *      → SELECT * FROM labeling_symbols WHERE labeling_document_id = $doc
 *         ORDER BY symbol_code   (parent doc is org-scoped via requireDocInOrg)
 *
 * DDL sources:
 *   shared/schema.ts:5429   concept2cure_artifacts (org col organization_id int;
 *                           project_id NOT NULL FK; artifact_id UNIQUE)
 *   shared/schema.ts:5489   concept2cure_artifact_versions
 *   shared/schema.ts:14991  client_memory_entries (org col organization_id int;
 *                           profile_id NOT NULL FK → client_intelligence_profiles)
 *   migrations/20260511_qms_and_labeling.sql:209  labeling_symbols (org col
 *                           organization_id int; labeling_document_id NOT NULL FK)
 *
 * Tenant scoping matches the routes exactly: organization_id (integer) on all
 * three primary tables; labeling symbols additionally hang off an org-scoped
 * labeling_documents row.
 *
 * Dependency chain (all resolve-or-create under SAVEPOINTs so a missing parent
 * degrades to a skipped part rather than aborting the orchestrator transaction):
 *   • Vault artifacts need a projects row (project_id NOT NULL). In a full seed
 *     the orchestrator creates projects before domain modules; this module
 *     resolves the first one, and only fabricates a minimal holder project
 *     (+ client_workspace when that column is NOT NULL) in a bare DB.
 *   • Memory atoms need a client_intelligence_profiles row.
 *   • Labeling symbols need a labeling_documents row (the orchestrator seeds the
 *     BX-204 CGM IFU before domain modules; resolved here, created if absent).
 *
 * Idempotency: artifacts key on the UNIQUE artifact_id; artifact versions on the
 * UNIQUE (artifact_id, version); memory atoms SELECT-before-INSERT on
 * (organization_id, profile_id, title); symbols on (labeling_document_id,
 * symbol_code). Re-running inserts nothing new.
 */

import crypto from 'node:crypto';

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/* Resolve a user id by email once (team members are created by the parent
   script before domain modules run); fall back to admin. */
async function resolveUserId(client, email, admin) {
  const { rows } = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0]?.id ?? admin.id;
}

/* ── Parent resolvers (SAVEPOINT-guarded) ─────────────────────────────────── */

async function resolveWorkspaceId(client, org, admin) {
  if (!(await tableExists(client, 'client_workspaces'))) return null;
  try {
    await client.query('SAVEPOINT sp_vault_ws');
    let { rows } = await client.query(
      'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
      [org.id],
    );
    if (!rows[0]) {
      await client.query(
        `INSERT INTO client_workspaces (organization_id, name, slug, status, created_by_id)
         VALUES ($1, 'Concept2Cure Therapeutics', 'concept2cure', 'active', $2)
         ON CONFLICT (organization_id, slug) DO NOTHING`,
        [org.id, admin.id],
      );
      ({ rows } = await client.query(
        'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
        [org.id],
      ));
    }
    await client.query('RELEASE SAVEPOINT sp_vault_ws');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_vault_ws');
    return null;
  }
}

/* Prefer an existing org project (production: the orchestrator seeds these
   before domain modules). Only fabricate a minimal holder project in a bare DB
   so the vault surface has a valid project_id to hang artifacts on. */
async function resolveProjectId(client, org, admin) {
  const existing = await client.query(
    'SELECT id FROM projects WHERE organization_id = $1 ORDER BY id LIMIT 1',
    [org.id],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const wsId = await resolveWorkspaceId(client, org, admin);
  const name = 'Concept2Cure regulatory workspace';
  const desc = 'Container program for demo vault artifacts.';

  // Attempt 1: include client_workspace_id (required where that column is NOT NULL).
  if (wsId !== null) {
    try {
      await client.query('SAVEPOINT sp_vault_proj');
      const ins = await client.query(
        `INSERT INTO projects (organization_id, client_workspace_id, name, code, description,
           status, type, depth, priority)
         VALUES ($1, $2, $3, 'BX-DEMO', $4, 'active', 'regulatory', 0, 'high')
         RETURNING id`,
        [org.id, wsId, name, desc],
      );
      await client.query('RELEASE SAVEPOINT sp_vault_proj');
      return ins.rows[0].id;
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT sp_vault_proj');
    }
  }

  // Attempt 2: schema variants where client_workspace_id is nullable / absent.
  try {
    await client.query('SAVEPOINT sp_vault_proj2');
    const ins = await client.query(
      `INSERT INTO projects (organization_id, name, code, description,
         status, type, depth, priority)
       VALUES ($1, $2, 'BX-DEMO', $3, 'active', 'regulatory', 0, 'high')
       RETURNING id`,
      [org.id, name, desc],
    );
    await client.query('RELEASE SAVEPOINT sp_vault_proj2');
    return ins.rows[0].id;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_vault_proj2');
    return null;
  }
}

async function resolveProfileId(client, org, admin) {
  const sel = 'SELECT id FROM client_intelligence_profiles WHERE organization_id = $1 ORDER BY id LIMIT 1';
  try {
    await client.query('SAVEPOINT sp_vault_profile');
    let { rows } = await client.query(sel, [org.id]);
    if (!rows[0]) {
      await client.query(
        `INSERT INTO client_intelligence_profiles (
           organization_id, company_name, company_slug, industry, sub_industry,
           company_size, headquarters, profile_status, created_by
         ) VALUES ($1, 'Concept2Cure Therapeutics', 'concept2cure', 'biotech',
           'rare-disease', 'mid', 'Cambridge, MA', 'active', $2)`,
        [org.id, admin.id],
      );
      ({ rows } = await client.query(sel, [org.id]));
    }
    await client.query('RELEASE SAVEPOINT sp_vault_profile');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_vault_profile');
    return null;
  }
}

async function resolveLabelingDocId(client, org) {
  const sel = `SELECT id FROM labeling_documents
                WHERE organization_id = $1 AND deleted_at IS NULL
                ORDER BY id LIMIT 1`;
  try {
    await client.query('SAVEPOINT sp_vault_lbl');
    let { rows } = await client.query(sel, [org.id]);
    if (!rows[0]) {
      await client.query(
        `INSERT INTO labeling_documents (organization_id, device_name, doc_kind,
           version, status, language, region)
         VALUES ($1, 'BX-204 CGM', 'ifu', '1.0', 'review', 'en', 'eu')`,
        [org.id],
      );
      ({ rows } = await client.query(sel, [org.id]));
    }
    await client.query('RELEASE SAVEPOINT sp_vault_lbl');
    return rows[0]?.id ?? null;
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_vault_lbl');
    return null;
  }
}

/* ── Vault artifact fixture ───────────────────────────────────────────────────
   ctd_section is deliberately spread so the route's family grouping renders every
   bucket: Module 1/2/3, Cover letters, Forms, Working files. type ∈ markdown|
   table|form|chart; category ∈ document|interactive|visualization. */
const ARTIFACTS = [
  {
    slug: 'bx204-510k-cover-letter',
    title: 'BX-204 510(k) cover letter',
    type: 'markdown', category: 'document',
    ctdSection: '1.1', status: 'approved', eSig: true, version: 3,
    author: 'reg', createdDaysAgo: 60, updatedDaysAgo: 3,
    content:
      '# 510(k) cover letter — BX-204 Continuous Glucose Monitor\n\n' +
      'Concept2Cure Therapeutics submits this Traditional 510(k) premarket ' +
      'notification for the BX-204 Continuous Glucose Monitor (product code QBJ, ' +
      'class II). Substantial equivalence is claimed to the identified predicate ' +
      'device. The submission is provided in eSTAR v5.1 format.\n',
    changes: ['Initial draft', 'Incorporated regulatory review comments', 'Approved for filing'],
  },
  {
    slug: 'bx204-se-summary',
    title: 'BX-204 substantial equivalence summary',
    type: 'markdown', category: 'document',
    ctdSection: null, status: 'review', eSig: false, version: 2,
    author: 'writer', createdDaysAgo: 58, updatedDaysAgo: 5,
    content:
      '# Substantial equivalence discussion — BX-204\n\n' +
      'The subject device shares the intended use, technological characteristics, ' +
      'and performance profile of the predicate. Differences in the adhesive ' +
      'overpatch and applicator do not raise new questions of safety or ' +
      'effectiveness, as supported by biocompatibility and human-factors data.\n',
    changes: ['Initial draft', 'Expanded technological-characteristics comparison'],
  },
  {
    slug: 'bx204-predicate-comparison',
    title: 'BX-204 predicate comparison table',
    type: 'table', category: 'interactive',
    ctdSection: null, status: 'review', eSig: false, version: 2,
    author: 'writer', createdDaysAgo: 58, updatedDaysAgo: 8,
    content:
      '| Characteristic | BX-204 (subject) | Predicate |\n' +
      '| --- | --- | --- |\n' +
      '| Intended use | Continuous glucose monitoring | Continuous glucose monitoring |\n' +
      '| Sensor wear | 10 days | 10 days |\n' +
      '| MARD | 8.4% | 9.0% |\n' +
      '| Calibration | Factory-calibrated | Factory-calibrated |\n',
    changes: ['Initial draft', 'Added MARD row from pivotal study'],
  },
  {
    slug: 'bx099-maa-cover-letter',
    title: 'BX-099 MAA cover letter',
    type: 'markdown', category: 'document',
    ctdSection: 'cover', status: 'approved', eSig: true, version: 4,
    author: 'reg', createdDaysAgo: 90, updatedDaysAgo: 2,
    content:
      '# Cover letter — BX-099 marketing authorisation application\n\n' +
      'Concept2Cure Therapeutics submits this marketing authorisation application ' +
      'for BX-099 under the centralised procedure. The application is filed in ' +
      'eCTD format for the European Union.\n',
    changes: ['Initial draft', 'Reviewer revision', 'Legal review', 'Approved for filing'],
  },
  {
    slug: 'bx099-clinical-overview',
    title: 'BX-099 Module 2.5 clinical overview',
    type: 'markdown', category: 'document',
    ctdSection: '2.5', status: 'locked', eSig: true, version: 6,
    author: 'writer', createdDaysAgo: 120, updatedDaysAgo: 10,
    content:
      '# Clinical overview — BX-099\n\n' +
      'The clinical development program for BX-099 comprises one pivotal phase 3 ' +
      'study and two supportive phase 2 studies. The benefit-risk assessment ' +
      'supports the proposed indication in the target population.\n',
    changes: [
      'Initial draft', 'Efficacy section revision', 'Safety section revision',
      'Benefit-risk update', 'QC pass', 'Locked for submission',
    ],
  },
  {
    slug: 'bx256-drug-substance-summary',
    title: 'BX-256 Module 3.2.S drug substance summary',
    type: 'markdown', category: 'document',
    ctdSection: '3.2.S', status: 'draft', eSig: false, version: 1,
    author: 'cmc', createdDaysAgo: 20, updatedDaysAgo: 1,
    content:
      '# Drug substance (3.2.S) — BX-256\n\n' +
      'BX-256 drug substance is manufactured by a mammalian cell-culture process. ' +
      'This summary describes nomenclature, structure, manufacture, ' +
      'characterisation, control, and stability.\n',
    changes: ['Initial draft'],
  },
  {
    slug: 'bx301-clinical-summary',
    title: 'BX-301 Module 2.7 clinical summary',
    type: 'markdown', category: 'document',
    ctdSection: '2.7', status: 'review', eSig: false, version: 2,
    author: 'writer', createdDaysAgo: 45, updatedDaysAgo: 6,
    content:
      '# Summary of clinical efficacy — BX-301\n\n' +
      'This summary integrates efficacy results across the BX-301 controlled ' +
      'studies. Primary and key secondary endpoints are presented with the ' +
      'corresponding statistical analyses.\n',
    changes: ['Initial draft', 'Integrated pooled efficacy analysis'],
  },
  {
    slug: 'bx420-jnda-application-form',
    title: 'BX-420 J-NDA Module 1 application form (form 22-1)',
    type: 'form', category: 'interactive',
    ctdSection: 'form 22-1', status: 'draft', eSig: false, version: 1,
    author: 'reg', createdDaysAgo: 30, updatedDaysAgo: 12,
    content:
      '# JP Module 1 application form (form 22-1) — BX-420\n\n' +
      'Applicant, product name, and dosage-and-administration fields for the ' +
      'BX-420 J-NDA. Prepared for PMDA gateway submission; pending JP Module 1 ' +
      'XML validation before transmission.\n',
    changes: ['Initial draft'],
  },
  {
    slug: 'bx204-benefit-risk-dashboard',
    title: 'BX-204 benefit-risk dashboard',
    type: 'chart', category: 'visualization',
    ctdSection: null, status: 'draft', eSig: false, version: 1,
    author: 'qa', createdDaysAgo: 14, updatedDaysAgo: 0,
    content:
      '# Benefit-risk dashboard — BX-204\n\n' +
      'Interactive summary of accuracy (MARD), alarm performance, and adverse-event ' +
      'rates across the pivotal and supportive studies, with predicate benchmarks.\n',
    changes: ['Initial draft'],
  },
];

/* ── AnA memory atom fixture ──────────────────────────────────────────────────
   category ∈ persona|regulatory|pipeline|competitive|operational|preference|
   history; importance_level ∈ low|medium|high|critical; status active. */
const MEMORY_ATOMS = [
  {
    category: 'regulatory', subcategory: 'agency_feedback',
    title: 'FDA Q-Sub feedback supports BX-204 predicate strategy',
    content:
      'In the pre-submission meeting, FDA agreed the identified predicate is ' +
      'appropriate for the BX-204 Continuous Glucose Monitor and requested that ' +
      'human-factors validation be included in the 510(k). No new nonclinical ' +
      'testing was requested beyond the proposed biocompatibility plan.',
    sourceDocumentName: 'BX-204 Q-Sub meeting minutes.pdf', sourceDocumentType: 'pdf',
    confidence: 0.96, importance: 'critical', verified: true, verifiedBy: 'reg',
    extractedBy: 'ai', updatedDaysAgo: 4,
  },
  {
    category: 'persona', subcategory: 'regulatory_posture',
    title: 'Concept2Cure favors conservative, data-first regulatory positioning',
    content:
      'The organization consistently prefers well-supported, conservative ' +
      'regulatory claims and front-loads agency interactions (pre-submissions, ' +
      'scientific advice) before committing to a filing pathway.',
    sourceDocumentName: 'Regulatory strategy charter.docx', sourceDocumentType: 'docx',
    confidence: 0.9, importance: 'high', verified: true, verifiedBy: 'admin',
    extractedBy: 'manual', updatedDaysAgo: 12,
  },
  {
    category: 'pipeline', subcategory: 'program_status',
    title: 'BX-099 MAA is in the centralised procedure clock',
    content:
      'BX-099 marketing authorisation application was validated by the EMA and is ' +
      'progressing through the centralised procedure. Day-120 list of questions is ' +
      'anticipated; the clinical overview (Module 2.5) is locked for the sequence.',
    sourceDocumentName: 'BX-099 submission tracker.xlsx', sourceDocumentType: 'xlsx',
    confidence: 0.88, importance: 'high', verified: false, verifiedBy: null,
    extractedBy: 'ai', updatedDaysAgo: 6,
  },
  {
    category: 'regulatory', subcategory: 'gateway_requirements',
    title: 'PMDA pre-check requires valid JP Module 1 XML for BX-420',
    content:
      'The BX-420 J-NDA sequence failed PMDA pre-check on JP Module 1 application ' +
      'form XML schema validation and one Module 3 leaf checksum mismatch. Both ' +
      'must be corrected before the sequence can be resubmitted through the gateway.',
    sourceDocumentName: 'PMDA pre-check report.pdf', sourceDocumentType: 'pdf',
    confidence: 0.93, importance: 'high', verified: true, verifiedBy: 'reg',
    extractedBy: 'ai', updatedDaysAgo: 8,
  },
  {
    category: 'operational', subcategory: 'publishing_sop',
    title: 'Two-person review is required before any eCTD publish',
    content:
      'Internal SOP requires an independent second reviewer to sign off on the ' +
      'assembled sequence before publishing to a gateway. This applies to all ' +
      'regions and is enforced through the submission checklist.',
    sourceDocumentName: 'SOP-REG-014 eCTD publishing.pdf', sourceDocumentType: 'pdf',
    confidence: 0.94, importance: 'medium', verified: true, verifiedBy: 'qa',
    extractedBy: 'manual', updatedDaysAgo: 15,
  },
  {
    category: 'competitive', subcategory: 'market_intelligence',
    title: 'A competing CGM cleared via Special 510(k) in 2025',
    content:
      'A competitor obtained clearance for a continuous glucose monitor through a ' +
      'Special 510(k) covering an algorithm update in 2025, signaling that ' +
      'iterative algorithm changes can be handled through the Special pathway.',
    sourceDocumentName: 'Competitive landscape brief.pdf', sourceDocumentType: 'pdf',
    confidence: 0.79, importance: 'medium', verified: false, verifiedBy: null,
    extractedBy: 'ai', updatedDaysAgo: 22,
  },
  {
    category: 'history', subcategory: 'submission_history',
    title: 'BX-099 IND information-request response was filed as sequence 0042',
    content:
      'The BX-099 IND information-request response was transmitted to the FDA ESG ' +
      'as sequence 0042 and reached ACK2. The response cross-references study data ' +
      'submitted in sequence 0038.',
    sourceDocumentName: 'BX-099 IND sequence log.csv', sourceDocumentType: 'csv',
    confidence: 0.91, importance: 'medium', verified: false, verifiedBy: null,
    extractedBy: 'import', updatedDaysAgo: 9,
  },
  {
    category: 'preference', subcategory: 'authoring_style',
    title: 'Reviewers prefer concise Module 2 summaries',
    content:
      'The medical-writing team keeps Module 2 clinical summaries tightly scoped, ' +
      'favoring tables and cross-references over long narrative sections to speed ' +
      'internal and agency review.',
    sourceDocumentName: 'Medical writing style guide.docx', sourceDocumentType: 'docx',
    confidence: 0.82, importance: 'low', verified: false, verifiedBy: null,
    extractedBy: 'manual', updatedDaysAgo: 30,
  },
  {
    category: 'pipeline', subcategory: 'portfolio_snapshot',
    title: 'BX-256, BX-301, and BX-420 span three regulatory pathways',
    content:
      'BX-256 is in CMC authoring for drug substance (Module 3), BX-301 is in ' +
      'clinical-summary review (Module 2), and BX-420 is preparing a J-NDA for ' +
      'PMDA. The portfolio therefore spans EU, US, and Japan filing pathways ' +
      'simultaneously.',
    sourceDocumentName: 'Portfolio review deck.pptx', sourceDocumentType: 'pdf',
    confidence: 0.86, importance: 'high', verified: false, verifiedBy: null,
    extractedBy: 'ai', updatedDaysAgo: 3,
  },
];

/* ── ISO 15223-1 standard symbol set (medical-device labeling glossary) ─────── */
const SYMBOLS = [
  { code: '5.1.1', name: 'Manufacturer',
    description: 'Indicates the medical device manufacturer.',
    requiredBy: ['FDA', 'EU', 'PMDA'] },
  { code: '5.1.3', name: 'Date of manufacture',
    description: 'Indicates the date when the medical device was manufactured.',
    requiredBy: ['EU'] },
  { code: '5.1.4', name: 'Use-by date',
    description: 'Indicates the date after which the medical device is not to be used.',
    requiredBy: ['FDA', 'EU', 'PMDA'] },
  { code: '5.1.5', name: 'Batch code',
    description: "Indicates the manufacturer's batch code so the batch or lot can be identified.",
    requiredBy: ['FDA', 'EU', 'PMDA'] },
  { code: '5.1.6', name: 'Catalogue number',
    description: "Indicates the manufacturer's catalogue number so the medical device can be identified.",
    requiredBy: ['FDA', 'EU'] },
  { code: '5.1.7', name: 'Serial number',
    description: "Indicates the manufacturer's serial number so a specific medical device can be identified.",
    requiredBy: ['FDA', 'EU'] },
  { code: '5.2.8', name: 'Do not use if package is damaged',
    description: 'Indicates that the device should not be used if the package has been damaged or opened.',
    requiredBy: ['EU'] },
  { code: '5.3.7', name: 'Temperature limit',
    description: 'Indicates the temperature limits to which the medical device can be safely exposed.',
    requiredBy: ['FDA', 'EU', 'PMDA'] },
  { code: '5.4.2', name: 'Do not re-use',
    description: 'Indicates a medical device intended for a single use, or for use on a single patient during a single procedure.',
    requiredBy: ['FDA', 'EU'] },
  { code: '5.4.3', name: 'Consult instructions for use',
    description: 'Indicates the need for the user to consult the instructions for use.',
    requiredBy: ['FDA', 'EU', 'PMDA'] },
  { code: '5.4.4', name: 'Caution',
    description: 'Indicates that caution is necessary when operating the device or control close to where the symbol is placed.',
    requiredBy: ['FDA', 'EU'] },
  { code: '5.7.7', name: 'Medical device',
    description: 'Indicates that the item is a medical device.',
    requiredBy: ['EU'] },
];

/* ── Seed steps ───────────────────────────────────────────────────────────── */

async function seedVaultArtifacts(client, org, admin) {
  if (!(await tableExists(client, 'concept2cure_artifacts'))) {
    console.log('   ⚠ concept2cure_artifacts not found — skipping');
    return;
  }
  const projectId = await resolveProjectId(client, org, admin);
  if (projectId === null) {
    console.log('   ⚠ no usable project for vault artifacts — skipping');
    return;
  }
  const versionsAvailable = await tableExists(client, 'concept2cure_artifact_versions');

  const authors = {
    reg: await resolveUserId(client, 'sarah.chen@concept2cure.pro', admin),
    writer: await resolveUserId(client, 'emily.watson@concept2cure.pro', admin),
    cmc: await resolveUserId(client, 'lisa.johnson@concept2cure.pro', admin),
    qa: await resolveUserId(client, 'david.kim@concept2cure.pro', admin),
  };

  let inserted = 0;
  let existing = 0;
  let versionRows = 0;

  for (const a of ARTIFACTS) {
    const artifactId = `artifact_gademo_${a.slug.replace(/-/g, '_')}`;
    const found = await client.query(
      'SELECT id FROM concept2cure_artifacts WHERE organization_id = $1 AND artifact_id = $2 LIMIT 1',
      [org.id, artifactId],
    );
    let id = found.rows[0]?.id;
    const authorId = authors[a.author] ?? admin.id;

    if (id) {
      existing += 1;
    } else {
      const contentHash = sha256(a.content);
      const ins = await client.query(
        `INSERT INTO concept2cure_artifacts (
           artifact_id, project_id, organization_id, type, category, title, content,
           content_hash, version, ctd_section, status, locked_at, created_by_id,
           metadata, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11,
           CASE WHEN $11 = 'locked' THEN NOW() - ($13::numeric * interval '1 day') ELSE NULL END,
           $12,
           $14::json,
           NOW() - ($15::numeric * interval '1 day'),
           NOW() - ($13::numeric * interval '1 day')
         )
         ON CONFLICT (artifact_id) DO NOTHING
         RETURNING id`,
        [
          artifactId, projectId, org.id, a.type, a.category, a.title, a.content,
          contentHash, a.version, a.ctdSection, a.status,
          authorId,
          a.updatedDaysAgo,
          JSON.stringify({ eSig: a.eSig === true, program: a.slug.split('-')[0].toUpperCase(), seed_key: a.slug }),
          a.createdDaysAgo,
        ],
      );
      id = ins.rows[0]?.id;
      if (id) inserted += 1;
    }

    // Version history (child table): one row per version 1..N.
    if (id && versionsAvailable) {
      for (let v = 1; v <= a.version; v += 1) {
        const changeDesc = a.changes?.[v - 1] ?? `Revision ${v}`;
        const versionHash = sha256(`${a.content}::v${v}`);
        // Earlier versions are older; later ones approach the created date.
        const verDaysAgo = Math.max(a.createdDaysAgo - (v - 1), 0);
        const r = await client.query(
          `INSERT INTO concept2cure_artifact_versions (
             artifact_id, organization_id, version, content, content_hash,
             change_description, created_by_id, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7,
             NOW() - ($8::numeric * interval '1 day'))
           ON CONFLICT (artifact_id, version) DO NOTHING`,
          [id, org.id, v, a.content, versionHash, changeDesc, authorId, verDaysAgo],
        );
        versionRows += r.rowCount ?? 0;
      }
    }
  }

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  const verNote = versionsAvailable ? ` + ${versionRows} version rows` : '';
  console.log(`   ✓ vault: ${inserted} artifacts${verNote} seeded${skippedNote}`);
}

async function seedMemoryAtoms(client, org, admin) {
  if (!(await tableExists(client, 'client_memory_entries'))) {
    console.log('   ⚠ client_memory_entries not found — skipping');
    return;
  }
  if (!(await tableExists(client, 'client_intelligence_profiles'))) {
    console.log('   ⚠ client_intelligence_profiles not found — skipping memory atoms');
    return;
  }
  const profileId = await resolveProfileId(client, org, admin);
  if (profileId === null) {
    console.log('   ⚠ no client intelligence profile for memory atoms — skipping');
    return;
  }

  const verifiers = {
    reg: await resolveUserId(client, 'sarah.chen@concept2cure.pro', admin),
    qa: await resolveUserId(client, 'david.kim@concept2cure.pro', admin),
    admin: admin.id,
  };

  let inserted = 0;
  let existing = 0;

  for (const m of MEMORY_ATOMS) {
    const found = await client.query(
      `SELECT id FROM client_memory_entries
        WHERE organization_id = $1 AND profile_id = $2 AND title = $3 LIMIT 1`,
      [org.id, profileId, m.title],
    );
    if (found.rows[0]) {
      existing += 1;
      continue;
    }
    const verifierId = m.verified ? (verifiers[m.verifiedBy] ?? admin.id) : null;
    await client.query(
      `INSERT INTO client_memory_entries (
         profile_id, organization_id, category, subcategory, title, content,
         source_document_name, source_document_type, confidence_score,
         importance_level, is_verified_by_user, verified_at, verified_by,
         status, extracted_at, extracted_by, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9,
         $10, $11,
         CASE WHEN $11 = true THEN NOW() - ($12::numeric * interval '1 day') ELSE NULL END,
         $13,
         'active',
         NOW() - (($14::numeric + 1) * interval '1 day'),
         $15,
         NOW() - (($14::numeric + 1) * interval '1 day'),
         NOW() - ($12::numeric * interval '1 day')
       )`,
      [
        profileId, org.id, m.category, m.subcategory, m.title, m.content,
        m.sourceDocumentName, m.sourceDocumentType, m.confidence,
        m.importance, m.verified === true,
        m.updatedDaysAgo, verifierId,
        m.updatedDaysAgo, m.extractedBy,
      ],
    );
    inserted += 1;
  }

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ memory: ${inserted} AnA memory atoms seeded${skippedNote}`);
}

async function seedLabelingSymbols(client, org) {
  if (!(await tableExists(client, 'labeling_symbols'))) {
    console.log('   ⚠ labeling_symbols not found — skipping');
    return;
  }
  if (!(await tableExists(client, 'labeling_documents'))) {
    console.log('   ⚠ labeling_documents not found — skipping symbols');
    return;
  }
  const docId = await resolveLabelingDocId(client, org);
  if (docId === null) {
    console.log('   ⚠ no labeling document for symbols — skipping');
    return;
  }

  let inserted = 0;
  let existing = 0;

  for (const s of SYMBOLS) {
    const found = await client.query(
      'SELECT id FROM labeling_symbols WHERE labeling_document_id = $1 AND symbol_code = $2 LIMIT 1',
      [docId, s.code],
    );
    if (found.rows[0]) {
      existing += 1;
      continue;
    }
    await client.query(
      `INSERT INTO labeling_symbols (
         labeling_document_id, organization_id, symbol_code, symbol_name,
         description, required_by, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb)`,
      [
        docId, org.id, s.code, s.name, s.description,
        s.requiredBy ?? null,
        JSON.stringify({ standard: 'ISO 15223-1' }),
      ],
    );
    inserted += 1;
  }

  const skippedNote = existing > 0 ? ` (${existing} already present)` : '';
  console.log(`   ✓ symbols: ${inserted} ISO 15223-1 labeling symbols seeded${skippedNote}`);
}

export default async function seed(client, { org, admin }) {
  await seedVaultArtifacts(client, org, admin);
  await seedMemoryAtoms(client, org, admin);
  await seedLabelingSymbols(client, org);
}
