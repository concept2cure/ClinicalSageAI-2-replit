/**
 * A viewer cannot write through the research-administration routers.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Eleven routers are mounted behind `authMiddleware` alone
 * (`server/bootstrap/register-inline-routes.ts`) and installed no role gate of
 * their own:
 *
 *   /api/financial-disclosures   routes/financial-disclosures.ts
 *   /api/grants                  routes/grants.ts
 *   /api/dmsp                    routes/dmsp.ts
 *   /api/research-agreements     routes/research-agreements.ts
 *   /api/nonclinical             routes/nonclinical.ts
 *   /api/translation             routes/translation.routes.ts
 *   /api/biosketch               routes/biosketch.ts
 *   /api/coverage-analysis       routes/coverage-analysis.ts
 *   /api/effort-certification    routes/effort-certification.ts
 *   /api/export-control          routes/export-control.ts
 *   /api/other-support           routes/other-support.ts
 *
 * So an organization `viewer` — the one role whose meaning is "does not write"
 * (`server/middleware/orgMembership.ts`) — could create, change and delete on
 * every one of them, each write with a ledger row attributing it to them. It
 * is the defect a3da1f666a fixed on `/api/biostat-bridge`
 * (biostat-bridge-governed-writes.test.ts), on eleven more URLs.
 *
 * The repair is the same: `requireEditorAccessForWrites` once at each router's
 * top, so a read passes and a write needs a writing role, including a write
 * route added later.
 *
 * `/api/committees` is mounted the same way and is NOT given that gate: each
 * of its writes already asks the governance engine (`can(orgId, role, …)`) for
 * the privilege the act needs, which is a finer question than "may this role
 * write". The last block pins what that gate answers a viewer.
 *
 * ── What runs here ───────────────────────────────────────────────────────────
 * The real routers, their validators and the real gates. Only the edges are
 * replaced (the pool, the ledger write, the signing ceremony, each domain
 * service), and that is what lets a case assert the refusal came BEFORE any of
 * them was reached.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import request from 'supertest';
import express from 'express';

const S = vi.hoisted(() => {
  const fns = <K extends string>(names: readonly K[]) =>
    Object.fromEntries(names.map((n) => [n, vi.fn()])) as Record<K, Mock>;
  return {
    connect: vi.fn(),
    poolQuery: vi.fn(),
    clientQuery: vi.fn(),
    recordGovernedAction: vi.fn(),
    verifyReauth: vi.fn(),
    signGovernedAct: vi.fn(),
    setTenantContextTx: vi.fn(),
    checkSigningAuthority: vi.fn(),
    getGateway: vi.fn(),
    fcoi: fns([
      'createInvestigatorTx', 'listInvestigators', 'createDisclosureTx', 'updateDisclosureTx',
      'softDeleteDisclosureTx', 'addInterestTx', 'certifyDisclosureTx', 'loadDisclosureSnapshot', 'listDisclosures',
    ] as const),
    grants: fns([
      'createOpportunityTx', 'createProposalTx', 'setProposalStatusTx', 'createAwardTx', 'addMilestoneTx',
      'createInvoiceTx', 'setInvoiceStatusTx', 'setMilestoneStatusTx', 'openCloseoutTx', 'updateCloseoutTx',
      'finalizeCloseoutTx', 'getCloseoutRecord', 'createSubawardTx', 'screenSubawardTx', 'executeSubawardTx',
      'listSubawards', 'addBudgetLineTx', 'recordExpenditureTx', 'getBudgetVsActual', 'setCostShareCommitmentTx',
      'recordCostShareContributionTx', 'getCostShareStatus', 'requestNceTx', 'approveNceTx', 'listNce',
      'listAwards', 'listMilestones', 'listProposals', 'listInvoices', 'getAwardPeriod',
    ] as const),
    dmsp: fns(['createPlanTx', 'updateElementTx', 'finalizePlanTx', 'getCompleteness', 'listPlans', 'getPlan'] as const),
    agreements: fns([
      'createAgreementTx', 'updateAgreementTx', 'executeAgreementTx', 'getReadiness', 'getPortfolio',
      'listAgreements', 'getAgreement',
    ] as const),
    nonclinical: fns([
      'createStudyTx', 'setStudyStatusTx', 'upsertSendDatasetTx', 'listStudies', 'getSendReadinessInput',
    ] as const),
    translation: fns([
      'createProject', 'getProject', 'listProjects', 'addSegment', 'updateSegment', 'getSegment', 'getSegments',
      'upsertGlossaryTerm', 'listGlossary', 'tmLookup', 'tmStore',
    ] as const),
    biosketch: fns([
      'createBiosketchTx', 'updateSectionTx', 'finalizeBiosketchTx', 'getCompleteness', 'listBiosketches', 'getBiosketch',
    ] as const),
    coverage: fns([
      'createAnalysisTx', 'setQualifyingDeterminationTx', 'addItemTx', 'classifyItemTx', 'setItemIcd10Tx',
      'finalizeAnalysisTx', 'listAnalyses', 'getAnalysis', 'listItems', 'getBillingGrid', 'suggestItemClassifications',
    ] as const),
    effort: fns(['createCertificationTx', 'addLineTx', 'certifyTx', 'loadStatement', 'listCertifications'] as const),
    exportControl: fns([
      'createReviewTx', 'updateReviewTx', 'determineReviewTx', 'getAssessment', 'getReadiness', 'listReviews', 'getReview',
    ] as const),
    otherSupport: fns([
      'createDocumentTx', 'addEntryTx', 'updateEntryTx', 'certifyDocumentTx', 'getSummary', 'getReadiness',
      'listDocuments', 'getDocument',
    ] as const),
    committees: fns([
      'addCommitteeMemberTx', 'listCommitteeMembers', 'getCompositionStatus', 'createMeetingTx', 'conveneMeetingTx',
      'addAgendaItemTx', 'castVoteTx', 'finalizeAgendaItemTx', 'getActorTrainingStatus', 'listMeetings', 'getMeeting',
      'getProtocolPortfolio',
    ] as const),
  };
});

vi.mock('../../db', () => ({ pool: { connect: S.connect, query: S.poolQuery } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: S.recordGovernedAction, verifyReauth: S.verifyReauth }));
/* The signing ceremony is an edge here: its own refusals (authority, password)
   are pinned by tests/db/research-admin-sign-ceremony.dbtest.ts. What matters
   in this file is whether a request reaches it at all. */
vi.mock('../governed-signed-act', () => ({
  signedActAttempts: (_req: unknown, _res: unknown, next: () => void) => next(),
  signGovernedAct: S.signGovernedAct,
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: S.setTenantContextTx }));
vi.mock('../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: S.checkSigningAuthority }));
vi.mock('../../services/ai-gateway', () => ({ getGateway: S.getGateway }));
vi.mock('../../services/ai-gateway/gateway.js', () => ({ getGateway: S.getGateway }));
vi.mock('../../services/financial-disclosures/fcoi-service', () => S.fcoi);
vi.mock('../../services/grants/grants-service', () => S.grants);
vi.mock('../../services/dmsp/dmsp-service', () => S.dmsp);
vi.mock('../../services/research-agreements/research-agreements-service', () => S.agreements);
vi.mock('../../services/nonclinical/nonclinical-service', () => S.nonclinical);
vi.mock('../../services/translation/repository', () => ({ createDrizzleTranslationRepository: () => S.translation }));
vi.mock('../../services/biosketch/biosketch-service', () => S.biosketch);
vi.mock('../../services/coverage-analysis/coverage-service', () => S.coverage);
vi.mock('../../services/effort-certification/effort-service', () => S.effort);
vi.mock('../../services/export-control/export-control-service', () => S.exportControl);
vi.mock('../../services/other-support/other-support-service', () => S.otherSupport);
vi.mock('../../services/committees/committee-service', () => ({ ...S.committees, CommitteeError: class extends Error {} }));

import financialDisclosuresRouter from '../financial-disclosures';
import grantsRouter from '../grants';
import dmspRouter from '../dmsp';
import researchAgreementsRouter from '../research-agreements';
import nonclinicalRouter from '../nonclinical';
import translationRouter from '../translation.routes';
import biosketchRouter from '../biosketch';
import coverageAnalysisRouter from '../coverage-analysis';
import effortCertificationRouter from '../effort-certification';
import exportControlRouter from '../export-control';
import otherSupportRouter from '../other-support';
import committeesRouter from '../committees';

/** What `requireEditorAccess` answers a role that may not write. */
const ROLE_REFUSAL = { error: 'Insufficient permissions' };
const REASON = 'Recorded during the periodic access review.';
/** The components a signed act's body carries (routes/governed-signed-act.ts). */
const SIGN = { reason: REASON, meaning: 'approval', password: 'pw' };

/** The app as `register-inline-routes.ts` builds it: what authMiddleware leaves on the request, then the router. */
function makeApp(base: string, router: express.Router, role: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 7, organizationId: 2, ...(role ? { role } : {}) };
    (req as any).userId = 7;
    if (role) (req as any).userRole = role;
    (req as any).tenantId = 2;
    (req as any).tenantContext = { organizationId: 2 };
    next();
  });
  app.use(base, router);
  return app;
}

type Verb = 'post' | 'patch' | 'put' | 'delete';
interface WriteCase {
  verb: Verb;
  path: string;
  /** A body the route's validators accept, so a refusal can only be the gate's. */
  body: Record<string, unknown>;
  /** The first edge a permitted request reaches, and the status it then gets. */
  reaches: Mock;
  status: number;
}
interface RouterCase {
  base: string;
  router: express.Router;
  writes: WriteCase[];
  /** A read a viewer uses, and the service it is answered from. */
  read: { path: string; from: Mock };
}

const ROUTERS: RouterCase[] = [
  {
    base: '/api/financial-disclosures',
    router: financialDisclosuresRouter,
    writes: [
      { verb: 'post', path: '/investigators', body: { fullName: 'Dr. A. Rivera', role: 'principal_investigator', reason: REASON }, reaches: S.fcoi.createInvestigatorTx, status: 201 },
      { verb: 'patch', path: '/disclosures/12', body: { hasDisclosableInterests: true, reason: REASON }, reaches: S.fcoi.updateDisclosureTx, status: 200 },
      { verb: 'delete', path: '/disclosures/12', body: { reason: REASON }, reaches: S.fcoi.softDeleteDisclosureTx, status: 200 },
      /* Certify keeps its own question. A member passes the role gate and is
         then refused by signing authority (§11.10(g)), which is a different
         refusal with a different body: the gate is in front of it, not instead of it. */
      { verb: 'post', path: '/disclosures/12/certify', body: { reason: REASON, meaning: 'approval', reauth: { password: 'pw' } }, reaches: S.checkSigningAuthority, status: 403 },
    ],
    read: { path: '/investigators', from: S.fcoi.listInvestigators },
  },
  {
    base: '/api/grants',
    router: grantsRouter,
    writes: [
      { verb: 'post', path: '/proposals', body: { title: 'Phase II SBIR', reason: REASON }, reaches: S.grants.createProposalTx, status: 201 },
      { verb: 'patch', path: '/milestones/3/status', body: { status: 'met', reason: REASON }, reaches: S.grants.setMilestoneStatusTx, status: 201 },
      { verb: 'post', path: '/awards/4/budget', body: { category: 'personnel', budgetedAmount: 1000, reason: REASON }, reaches: S.grants.addBudgetLineTx, status: 201 },
      { verb: 'post', path: '/awards/4/closeout/finalize', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/proposals', from: S.grants.listProposals },
  },
  {
    base: '/api/dmsp',
    router: dmspRouter,
    writes: [
      { verb: 'post', path: '/plans', body: { title: 'DMS plan for R01', reason: REASON }, reaches: S.dmsp.createPlanTx, status: 201 },
      { verb: 'patch', path: '/elements/5', body: { content: 'Data will be shared through a repository.', addressed: true, reason: REASON }, reaches: S.dmsp.updateElementTx, status: 201 },
      { verb: 'post', path: '/plans/5/finalize', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/plans', from: S.dmsp.listPlans },
  },
  {
    base: '/api/research-agreements',
    router: researchAgreementsRouter,
    writes: [
      { verb: 'post', path: '/agreements', body: { title: 'MTA for cell line', otherParty: 'A university', reason: REASON }, reaches: S.agreements.createAgreementTx, status: 201 },
      { verb: 'patch', path: '/agreements/6', body: { status: 'under_review', reason: REASON }, reaches: S.agreements.updateAgreementTx, status: 201 },
      { verb: 'post', path: '/agreements/6/execute', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/agreements', from: S.agreements.listAgreements },
  },
  {
    base: '/api/nonclinical',
    router: nonclinicalRouter,
    writes: [
      { verb: 'post', path: '/studies', body: { studyNumber: 'TOX-001', title: '28-day repeat dose', studyType: 'repeat_dose_tox', reason: REASON }, reaches: S.nonclinical.createStudyTx, status: 201 },
      { verb: 'patch', path: '/studies/7/status', body: { status: 'in_life', reason: REASON }, reaches: S.nonclinical.setStudyStatusTx, status: 201 },
      { verb: 'put', path: '/studies/7/send', body: { domainsPresent: ['DM'], reason: REASON }, reaches: S.nonclinical.upsertSendDatasetTx, status: 201 },
    ],
    read: { path: '/studies', from: S.nonclinical.listStudies },
  },
  {
    base: '/api/translation',
    router: translationRouter,
    writes: [
      { verb: 'post', path: '/projects', body: { name: 'PI German', sourceLang: 'en', targetLang: 'de', segments: [{ ordinal: 0, sourceText: 'Store below 25 degrees.' }] }, reaches: S.translation.createProject, status: 200 },
      { verb: 'post', path: '/glossary', body: { sourceTerm: 'BX-204', doNotTranslate: true, category: 'code' }, reaches: S.translation.upsertGlossaryTerm, status: 200 },
      /* No such segment in this tenant: a member gets the route's own 404. */
      { verb: 'post', path: '/segments/8/approve', body: {}, reaches: S.translation.getSegment, status: 404 },
    ],
    read: { path: '/projects', from: S.translation.listProjects },
  },
  {
    base: '/api/biosketch',
    router: biosketchRouter,
    writes: [
      { verb: 'post', path: '/biosketches', body: { personName: 'Dr. A. Rivera', reason: REASON }, reaches: S.biosketch.createBiosketchTx, status: 201 },
      { verb: 'patch', path: '/sections/5', body: { content: 'Personal statement.', addressed: true, reason: REASON }, reaches: S.biosketch.updateSectionTx, status: 201 },
      { verb: 'post', path: '/biosketches/5/finalize', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/biosketches', from: S.biosketch.listBiosketches },
  },
  {
    base: '/api/coverage-analysis',
    router: coverageAnalysisRouter,
    writes: [
      { verb: 'post', path: '/analyses', body: { title: 'Coverage analysis for BX-204', reason: REASON }, reaches: S.coverage.createAnalysisTx, status: 201 },
      { verb: 'patch', path: '/analyses/4/qualifying', body: { hasTherapeuticIntent: true, enrollsDiagnosisTreatment: true, hasMedicareBenefitCategory: true, reason: REASON }, reaches: S.coverage.setQualifyingDeterminationTx, status: 201 },
      { verb: 'post', path: '/analyses/4/items', body: { itemDescription: 'CBC with differential', reason: REASON }, reaches: S.coverage.addItemTx, status: 201 },
      { verb: 'patch', path: '/items/9/classify', body: { isStandardOfCare: true, sponsorPaidInBudget: false, reason: REASON }, reaches: S.coverage.classifyItemTx, status: 201 },
      { verb: 'patch', path: '/items/9/icd10', body: { icd10Code: 'C50.911', reason: REASON }, reaches: S.coverage.setItemIcd10Tx, status: 201 },
      { verb: 'post', path: '/analyses/4/finalize', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/analyses', from: S.coverage.listAnalyses },
  },
  {
    base: '/api/effort-certification',
    router: effortCertificationRouter,
    writes: [
      { verb: 'post', path: '/', body: { personnelId: 3, periodStart: '2026-01-01', periodEnd: '2026-06-30', reason: REASON }, reaches: S.effort.createCertificationTx, status: 201 },
      { verb: 'post', path: '/3/lines', body: { activityLabel: 'R01 aims 1 and 2', committedPct: 50, actualPct: 50, reason: REASON }, reaches: S.effort.addLineTx, status: 201 },
      { verb: 'post', path: '/3/certify', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/', from: S.effort.listCertifications },
  },
  {
    base: '/api/export-control',
    router: exportControlRouter,
    writes: [
      { verb: 'post', path: '/reviews', body: { projectTitle: 'Assay transfer to a foreign site', reason: REASON }, reaches: S.exportControl.createReviewTx, status: 201 },
      { verb: 'patch', path: '/reviews/2', body: { jurisdiction: 'ear', reason: REASON }, reaches: S.exportControl.updateReviewTx, status: 201 },
      { verb: 'post', path: '/reviews/2/determine', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/reviews', from: S.exportControl.listReviews },
  },
  {
    base: '/api/other-support',
    router: otherSupportRouter,
    writes: [
      { verb: 'post', path: '/documents', body: { personName: 'Dr. A. Rivera', reason: REASON }, reaches: S.otherSupport.createDocumentTx, status: 201 },
      { verb: 'post', path: '/documents/2/entries', body: { projectTitle: 'Phase II SBIR', fundingSource: 'NIH', reason: REASON }, reaches: S.otherSupport.addEntryTx, status: 201 },
      { verb: 'patch', path: '/entries/3', body: { status: 'pending', reason: REASON }, reaches: S.otherSupport.updateEntryTx, status: 201 },
      { verb: 'post', path: '/documents/2/certify', body: SIGN, reaches: S.signGovernedAct, status: 200 },
    ],
    read: { path: '/documents', from: S.otherSupport.listDocuments },
  },
];

/** Every edge a write could touch: none may be reached by a refused request. */
const EDGES: Mock[] = [
  S.connect, S.poolQuery, S.clientQuery, S.recordGovernedAction, S.verifyReauth, S.signGovernedAct,
  S.setTenantContextTx, S.checkSigningAuthority, S.getGateway,
  ...[
    S.fcoi, S.grants, S.dmsp, S.agreements, S.nonclinical, S.translation,
    S.biosketch, S.coverage, S.effort, S.exportControl, S.otherSupport, S.committees,
  ].flatMap((m) => Object.values(m)),
];

const send = (r: RouterCase, w: WriteCase, role: string | null) =>
  request(makeApp(r.base, r.router, role))[w.verb](`${r.base}${w.path}`).send(w.body);

const stamp = { createdAt: new Date(), updatedAt: new Date(), deletedAt: null };

beforeEach(() => {
  for (const edge of EDGES) edge.mockReset();

  S.clientQuery.mockResolvedValue({ rows: [] });
  S.connect.mockResolvedValue({ query: S.clientQuery, release: vi.fn() });
  S.recordGovernedAction.mockResolvedValue({ actionId: 'ACT-1', auditId: 'AUD-1', sha256Chain: 'abc' });
  S.signGovernedAct.mockImplementation(async (_req: unknown, res: express.Response) => { res.json({ signed: true }); });
  S.checkSigningAuthority.mockResolvedValue({ status: 403, code: 'ESIGNATURE_NO_AUTHORITY', message: 'Your role does not permit applying an electronic signature.' });

  S.fcoi.createInvestigatorTx.mockResolvedValue({ id: 1 });
  S.fcoi.updateDisclosureTx.mockResolvedValue({ formType: 'FDA_3454', signatureInvalidated: false });
  S.fcoi.listInvestigators.mockResolvedValue([]);
  S.grants.createProposalTx.mockResolvedValue({ id: 1 });
  S.grants.addBudgetLineTx.mockResolvedValue({ id: 1 });
  S.grants.listProposals.mockResolvedValue([]);
  S.dmsp.createPlanTx.mockResolvedValue({ id: 1, elementsSeeded: 6 });
  S.dmsp.listPlans.mockResolvedValue([]);
  S.agreements.createAgreementTx.mockResolvedValue({ id: 1 });
  S.agreements.listAgreements.mockResolvedValue([]);
  S.nonclinical.createStudyTx.mockResolvedValue({ id: 1, ctdSection: '4.2.3.2', provenanceLinkIds: [] });
  S.nonclinical.upsertSendDatasetTx.mockResolvedValue({ id: 1 });
  S.nonclinical.listStudies.mockResolvedValue([]);
  S.translation.createProject.mockResolvedValue({
    id: 1, organizationId: 2, name: 'PI German', sourceLanguage: 'en', targetLanguages: ['de'], status: 'draft',
    submissionContext: null, description: null, metadata: {}, createdBy: 7, ...stamp,
  });
  S.translation.addSegment.mockResolvedValue({
    id: 2, organizationId: 2, projectId: 1, targetLanguage: 'de', segmentKey: '00000000', sourceText: 'Store below 25 degrees.',
    targetText: null, sourceHash: 'h', method: 'machine', status: 'pending', metadata: {}, ...stamp,
  });
  S.translation.upsertGlossaryTerm.mockResolvedValue({
    id: 3, organizationId: 2, sourceTerm: 'BX-204', targetTerm: null, targetLanguage: null,
    termType: 'do_not_translate', metadata: { category: 'code' }, ...stamp,
  });
  S.translation.getSegment.mockResolvedValue(null);
  S.translation.listProjects.mockResolvedValue([]);
  S.biosketch.createBiosketchTx.mockResolvedValue({ id: 1, sectionsSeeded: 5 });
  S.biosketch.listBiosketches.mockResolvedValue([]);
  S.coverage.createAnalysisTx.mockResolvedValue({ id: 1, provenanceLinkId: 'PROV-1' });
  S.coverage.setQualifyingDeterminationTx.mockResolvedValue({ determination: 'qualifying' });
  S.coverage.addItemTx.mockResolvedValue({ id: 1 });
  S.coverage.classifyItemTx.mockResolvedValue({ classification: 'routine_cost', billingDesignation: 'medicare' });
  S.coverage.listAnalyses.mockResolvedValue([]);
  S.effort.createCertificationTx.mockResolvedValue({ id: 1 });
  S.effort.addLineTx.mockResolvedValue({ id: 1 });
  S.effort.listCertifications.mockResolvedValue([]);
  S.exportControl.createReviewTx.mockResolvedValue({ id: 1 });
  S.exportControl.listReviews.mockResolvedValue([]);
  S.otherSupport.createDocumentTx.mockResolvedValue({ id: 1 });
  S.otherSupport.addEntryTx.mockResolvedValue({ id: 1 });
  S.otherSupport.listDocuments.mockResolvedValue([]);
  // The governance engine reads per-organization grants here; none are set, so its code defaults decide.
  S.poolQuery.mockResolvedValue({ rows: [] });
  S.committees.addCommitteeMemberTx.mockResolvedValue({ id: 1 });
  S.committees.listCommitteeMembers.mockResolvedValue([]);
});

for (const r of ROUTERS) {
  describe(`${r.base}: a write needs a writing role`, () => {
    for (const w of r.writes) {
      const name = `${w.verb.toUpperCase()} ${w.path}`;

      it(`refuses ${name} from a viewer, before anything is opened or written`, async () => {
        const res = await send(r, w, 'viewer');
        expect(res.status, `${name} let a viewer through: ${JSON.stringify(res.body)}`).toBe(403);
        expect(res.body).toEqual(ROLE_REFUSAL);
        for (const edge of EDGES) expect(edge).not.toHaveBeenCalled();
      });

      it(`refuses ${name} from a session with no role at all`, async () => {
        const res = await send(r, w, null);
        expect(res.status).toBe(403);
        expect(res.body).toEqual(ROLE_REFUSAL);
        for (const edge of EDGES) expect(edge).not.toHaveBeenCalled();
      });

      it(`lets a member's ${name} past the gate`, async () => {
        const res = await send(r, w, 'member');
        expect(res.body, 'a member was refused by the role gate').not.toEqual(ROLE_REFUSAL);
        expect(w.reaches, `${name} never reached its handler's work`).toHaveBeenCalled();
        expect(res.status, JSON.stringify(res.body)).toBe(w.status);
      });
    }

    /* The reads stay open: a viewer reading these registers is the normal use
       of the role, and gating the whole router would have taken it away. */
    it(`still lets a viewer read ${r.read.path}`, async () => {
      const res = await request(makeApp(r.base, r.router, 'viewer')).get(`${r.base}${r.read.path}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(r.read.from).toHaveBeenCalled();
    });
  });
}

describe('the financial-disclosure certification keeps its own signing-authority question', () => {
  it('answers a member ESIGNATURE_NO_AUTHORITY, not the role refusal, and asks for no password', async () => {
    const r = ROUTERS[0];
    const res = await send(r, r.writes[3], 'member');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(S.verifyReauth).not.toHaveBeenCalled();
    expect(S.connect).not.toHaveBeenCalled();
  });
});

/* ── /api/committees: its own gate, left as it is ─────────────────────────────
 * Every committee write asks the governance engine for the privilege the act
 * needs (assign, review, approve) on a `committee` resource
 * (services/governance/permissions.ts). Under the default policy a viewer
 * holds `view` alone, so the defect above is not open here. The engine also
 * admits roles `requireEditorAccess` does not know (`irb_member`, an
 * administrator's per-organization grant), so mounting the write gate on this
 * router would refuse people the engine is there to admit. These cases pin
 * what the existing gate answers; nothing in committees.ts changed.
 */
describe('/api/committees: each write is refused to a viewer by the governance engine', () => {
  const BASE = '/api/committees';
  const WRITES: Array<{ path: string; body: Record<string, unknown> }> = [
    { path: '/members', body: { committeeType: 'irb', memberName: 'Dr. B. Okafor', reason: REASON } },
    { path: '/meetings', body: { committeeType: 'irb', title: 'Monthly convened meeting', reason: REASON } },
    { path: '/meetings/1/convene', body: { presentMemberIds: [1], reason: REASON } },
    { path: '/meetings/1/agenda', body: { protocolKind: 'irb_submission', protocolId: 1, title: 'Initial review', reason: REASON } },
    { path: '/agenda/1/votes', body: { memberId: 1, vote: 'approve', reason: REASON } },
    { path: '/agenda/1/finalize', body: SIGN },
  ];
  /** Everything a committee write opens or writes. The engine's own grant read (pool.query) is not one of them. */
  const written = (): Mock[] => [S.connect, S.recordGovernedAction, S.signGovernedAct, ...Object.values(S.committees)];

  for (const role of ['viewer', null]) {
    for (const w of WRITES) {
      it(`refuses POST ${w.path} from ${role ? `a ${role}` : 'a session with no role'}, NOT_AUTHORIZED, before anything is written`, async () => {
        const res = await request(makeApp(BASE, committeesRouter, role)).post(`${BASE}${w.path}`).send(w.body);
        expect(res.status, JSON.stringify(res.body)).toBe(403);
        expect(res.body.error?.code).toBe('NOT_AUTHORIZED');
        for (const edge of written()) expect(edge).not.toHaveBeenCalled();
      });
    }
  }

  /* Why this is not the write gate's question: a member may vote and may not
     seat a committee member. `requireEditorAccess` would answer both the same. */
  it('lets a member cast a vote (review)', async () => {
    const res = await request(makeApp(BASE, committeesRouter, 'member')).post(`${BASE}/agenda/1/votes`).send(WRITES[4].body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(S.committees.castVoteTx).toHaveBeenCalled();
  });

  it('refuses a member seating a committee member (assign)', async () => {
    const res = await request(makeApp(BASE, committeesRouter, 'member')).post(`${BASE}/members`).send(WRITES[0].body);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('NOT_AUTHORIZED');
    expect(S.committees.addCommitteeMemberTx).not.toHaveBeenCalled();
  });

  it('still lets a viewer read the committee roster', async () => {
    const res = await request(makeApp(BASE, committeesRouter, 'viewer')).get(`${BASE}/members`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(S.committees.listCommitteeMembers).toHaveBeenCalled();
  });
});
