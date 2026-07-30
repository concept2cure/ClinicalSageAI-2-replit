/**
 * Wave-3 domain seed — document journey into the REAL authoring store.
 *
 * The DocJourney surface's journey is now reconstructed from the real authoring
 * document loop, NOT the deprecated c2c_doc_journeys blob. So this seed creates a
 * genuine authoring_documents row and the history the real writers
 * (server/routes/authoring.router.ts) would leave behind — sections, a section
 * revision, a resolved review comment, and an immutable freeze snapshot — with the
 * document walked through its real status transitions (draft → submitted → approved).
 * GET /api/doc-journey then assembles the six lifecycle stages (created, authoring,
 * review, submitted, approved, frozen) straight from these rows
 * (see server/services/authoring/doc-journey-view-assembler.ts). No blob, no fixture.
 *
 * Column lists mirror authoring.router.ts exactly (UUID ids, created_by = String(user.id),
 * tenant_id scoping, frozen_documents Part 11 snapshot). Idempotent (skips when the demo
 * document already exists for the org), org-scoped, created_by resolved from a real org
 * member, and each table is to_regclass-guarded. Grounded in the app's BX-204 program.
 */
import crypto from 'node:crypto';

const REQUIRED = ['authoring_documents', 'authoring_sections', 'doc_revisions', 'authoring_comments', 'frozen_documents'];

const TITLE = 'Clinical Overview (CTD Module 2.5)';
const MODULE = 'M2';
const PRODUCT = 'BX-204';
const VERSION = '1.0';

// The document's real section skeleton (CTD §2.5), with authored content on §2.5.4.
const SECTIONS = [
  { code: '2.5.1', title: '2.5.1  Product development rationale', order: 0,
    content: 'BX-204 (rezatinib) is developed for advanced RTK-X–overexpressing solid tumors under an accelerated-approval framework.' },
  { code: '2.5.4', title: '2.5.4  Overview of efficacy', order: 1,
    content: 'In pivotal study BX204-201, the confirmed objective response rate was 42.1% (95% CI 35.8–48.6; n=214), with a median duration of response of 8.3 months (95% CI 6.1–11.2), per the locked CSR-201 primary analysis (ADaM ADRS, data lock 18 Apr 2026).' },
  { code: '2.5.6', title: '2.5.6  Benefits and risks conclusions', order: 2,
    content: 'The benefit–risk profile is favorable in the intended population: durable responses on a validated endpoint against a manageable, monitorable safety profile.' },
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

export default async function seed(client, { org, admin }) {
  for (const t of REQUIRED) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping doc-journey seed`);
      return;
    }
  }

  // Own the document as a real org member (users.id), falling back to the admin.
  const u = await client.query(
    `SELECT u.id, u.email, u.name
       FROM organization_users ou JOIN users u ON u.id = ou.user_id
      WHERE ou.organization_id = $1 ORDER BY ou.user_id LIMIT 1`,
    [org.id],
  );
  const user = u.rows[0] ?? (admin ? { id: admin.id, email: admin.email, name: admin.name } : null);
  if (!user?.id) {
    console.log('   ⚠ no org member to own the document — skipping');
    return;
  }
  const createdBy = String(user.id);
  const frozenBy = user.email || createdBy;

  // Idempotent: the authoring store hard-deletes and carries no seed marker, so skip
  // when this demo document already exists for the org.
  const already = await client.query(
    `SELECT id FROM authoring_documents WHERE tenant_id = $1 AND title = $2 LIMIT 1`,
    [org.id, TITLE],
  );
  if (already.rows.length > 0) {
    console.log('   ✓ doc journey: already seeded');
    return;
  }

  const createdAt = daysAgo(28);
  const revisedAt = daysAgo(22);
  const commentAt = daysAgo(18);
  const resolvedAt = daysAgo(16);
  const submittedAt = daysAgo(14);
  const approvedAt = daysAgo(7);

  // 1. The document — created, then walked to APPROVED with its real transition stamps.
  const docId = crypto.randomUUID();
  await client.query(
    `INSERT INTO authoring_documents
       (id, title, module, product_code, locale, status, created_by, template_id,
        submitted_at, approved_at, version, tenant_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'en-US', 'APPROVED', $5, NULL, $6, $7, $8, $9, $10, $11)`,
    [docId, TITLE, MODULE, PRODUCT, createdBy, submittedAt, approvedAt, VERSION, org.id, createdAt, approvedAt],
  );

  // 2. Sections (the §2.5 skeleton with authored content).
  const sectionIds = {};
  for (const s of SECTIONS) {
    const id = crypto.randomUUID();
    sectionIds[s.code] = id;
    await client.query(
      `INSERT INTO authoring_sections
         (id, doc_id, code, title, content, order_index, tenant_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, docId, s.code, s.title, s.content, s.order, org.id, createdAt, revisedAt],
    );
  }

  // 3. A revision on §2.5.4 (the author edit the revision trail records).
  await client.query(
    `INSERT INTO doc_revisions (id, section_id, content, created_by, tenant_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), sectionIds['2.5.4'], SECTIONS[1].content, createdBy, org.id, revisedAt],
  );

  // 4. A resolved internal-review comment on §2.5.4.
  await client.query(
    `INSERT INTO authoring_comments
       (id, section_id, doc_id, body, anchor, status, created_by, user_name, user_email,
        tenant_id, created_at, resolved_at, resolved_by)
     VALUES ($1, $2, $3, $4, NULL, 'resolved', $5, $6, $7, $8, $9, $10, $11)`,
    [
      crypto.randomUUID(), sectionIds['2.5.4'], docId,
      'Add the data-lock provenance for the ORR claim.',
      createdBy, user.name || null, user.email || null, org.id, commentAt, resolvedAt, frozenBy,
    ],
  );

  // 5. The immutable freeze snapshot (Part 11) the approval produced.
  const frozenContent = JSON.stringify({
    document: { id: docId, title: TITLE, version: VERSION, status: 'APPROVED' },
    sections: SECTIONS.map((s) => ({ code: s.code, title: s.title, content: s.content })),
    frozenAt: approvedAt,
  });
  const contentHash = crypto.createHash('sha256').update(frozenContent).digest('hex');
  await client.query(
    `INSERT INTO frozen_documents
       (document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, tenant_id, frozen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [docId, VERSION, frozenContent, contentHash, frozenBy, 'Approved and frozen', org.id, approvedAt],
  );

  console.log(`   ✓ doc journey: 1 document + ${SECTIONS.length} sections, 1 revision, 1 comment, 1 freeze seeded into the real authoring store (doc ${docId})`);
}
