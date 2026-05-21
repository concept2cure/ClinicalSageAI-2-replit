/**
 * PDEV kit · closed-enum + fixture data.
 *
 * Mirrors the canonical contracts from PDEV_IND_DESIGN_BRIEF.md §3.
 * Workstream + stage + state enums are hard-coded (the kit owns them).
 * Activity registry is a fixture stand-in for runtime fetch from
 * GET /api/pdev/registry — in production, replace with the live fetch.
 */

(() => {

const PDEV_WORKSTREAMS = ['cmc', 'nonclinical', 'clinical', 'regulatory'];
const PDEV_WORKSTREAM_LABELS = {
  cmc: 'CMC', nonclinical: 'Nonclinical', clinical: 'Clinical', regulatory: 'Regulatory',
};
const PDEV_STAGES = ['early_pdev', 'late_pdev', 'pre_ind_meeting', 'ind_package', 'post_ind'];
const PDEV_STAGE_LABELS = {
  early_pdev: 'Early PDEV', late_pdev: 'Late PDEV', pre_ind_meeting: 'Pre-IND meeting',
  ind_package: 'IND package', post_ind: 'Post-IND',
};

const PDEV_ACTIVITY_STATES = [
  'not_started','drafting','ai_draft_generated','evidence_linked','human_review_required',
  'in_review','changes_requested','approved','locked','submission_ready','submitted',
  'agency_feedback_received','revision_required','superseded',
];
const PDEV_COMPLETED_STATES = ['approved','locked','submission_ready','submitted'];
const PDEV_BLOCKED_STATES = ['revision_required'];
const PDEV_IN_FLIGHT_STATES = ['drafting','ai_draft_generated','evidence_linked','human_review_required','in_review','changes_requested','agency_feedback_received'];

const PDEV_STATE_LABELS = {
  not_started: 'Not started', drafting: 'Drafting', ai_draft_generated: 'AI draft ready',
  evidence_linked: 'Evidence linked', human_review_required: 'Review required',
  in_review: 'In review', changes_requested: 'Changes requested', approved: 'Approved',
  locked: 'Locked', submission_ready: 'Submission ready', submitted: 'Submitted',
  agency_feedback_received: 'Agency feedback', revision_required: 'Revision required',
  superseded: 'Superseded',
};

const ECTD_MODULES = ['m1','m2','m3','m4','m5'];
const ECTD_MODULE_LABELS = { m1:'Module 1', m2:'Module 2', m3:'Module 3', m4:'Module 4', m5:'Module 5' };

const CONTRADICTION_SEVERITIES = ['critical','high','medium','low'];
const CONTRADICTION_AUTHORITY_STATES = ['advisory_only','requires_review','requires_approval','blocks_promotion','requires_escalation'];
const CONTRADICTION_REVIEW_STATES = ['unresolved','under_review','reviewed','approved_resolution','superseded'];

const WORKFLOW_RUN_STATUSES = ['pending','running','paused','awaiting_approval','completed','failed','cancelled'];
const APPROVAL_CHECKPOINT_STATUSES = ['proposed','awaiting_review','approved','executed','failed','skipped'];

/* PDEV rail (sub-nav under the PDEV domain item) */
const PDEV_NAV_GROUPS = [
  { id: 'workstream', label: 'Workstream' },
  { id: 'workspace',  label: 'Workspace' },
  { id: 'system',     label: '' },
];
const PDEV_NAV_ITEMS = [
  { id: 'overview',         label: 'Overview',          icon: 'grid',        group: 'workstream' },
  { id: 'cmc',              label: 'CMC',               icon: 'beaker',      group: 'workstream' },
  { id: 'nonclinical',      label: 'Nonclinical',       icon: 'microscope',  group: 'workstream' },
  { id: 'clinical',         label: 'Clinical',          icon: 'stethoscope', group: 'workstream' },
  { id: 'regulatory',       label: 'Regulatory',        icon: 'shieldCheck', group: 'workstream' },
  { id: 'ind_assembly',     label: 'IND assembly',      icon: 'rocket',      group: 'workspace' },
  { id: 'contradictions',   label: 'Contradictions',    icon: 'alertCircle', group: 'workspace' },
  { id: 'fda_interactions', label: 'FDA interactions',  icon: 'chat',        group: 'workspace' },
];

/* PDEV programs — 3 in flight */
const PDEV_PROGRAMS = [
  { id: 'pdev-bx501', code: 'BX-501', productName: 'Vorelinib · KIT-mutant GIST', indication: 'KIT-mutant GIST · 4L+', agency: 'FDA', status: 'active', targetIndDate: '2027-03-15', daysToInd: 304, readiness: 58, topBlocker: 'GLP toxicology summary missing for Module 4', programType: 'IND' },
  { id: 'pdev-pn310', code: 'PN-310', productName: 'Selevadex · oral RA',           indication: 'Rheumatoid arthritis · DMARD-IR', agency: 'FDA', status: 'active', targetIndDate: '2027-06-30', daysToInd: 411, readiness: 41, topBlocker: 'CMC formulation lot stability under review', programType: 'IND' },
  { id: 'pdev-ax208', code: 'AX-208', productName: 'Aximab · inflammatory bowel',   indication: 'Moderate-to-severe UC',          agency: 'FDA', status: 'active', targetIndDate: '2026-11-22', daysToInd: 186, readiness: 71, topBlocker: 'Pre-IND meeting feedback rollup pending', programType: 'IND' },
];

/* Activity-registry fixture — 24 representative activities (out of 52).
   Production: replace with runtime fetch from GET /api/pdev/registry. */
const PDEV_ACTIVITIES = [
  // CMC
  { key: 'cmc.development_plan',           workstream: 'cmc',          stage: 'early_pdev',       title: 'CMC development plan',                              docs: 3, state: 'approved',              owner: 'PS', due: 'completed',          dueIn: null, hasDeps: false, evidenceN: 14 },
  { key: 'cmc.formulation_development',    workstream: 'cmc',          stage: 'late_pdev',        title: 'Formulation development report',                    docs: 6, state: 'in_review',             owner: 'PS', due: 'Aug 12',             dueIn: 84,   hasDeps: false, evidenceN: 22 },
  { key: 'cmc.process_development',        workstream: 'cmc',          stage: 'late_pdev',        title: 'Manufacturing process development',                 docs: 8, state: 'evidence_linked',       owner: 'AK', due: 'Sep 04',             dueIn: 107,  hasDeps: false, evidenceN: 31 },
  { key: 'cmc.stability_program',          workstream: 'cmc',          stage: 'late_pdev',        title: 'Stability program (ICH Q1A)',                       docs: 4, state: 'drafting',              owner: 'PS', due: 'Oct 22',             dueIn: 155,  hasDeps: false, evidenceN: 8 },
  { key: 'cmc.lot_release_specs',          workstream: 'cmc',          stage: 'ind_package',      title: 'Lot release specifications',                        docs: 3, state: 'revision_required',     owner: 'PS', due: 'overdue 4d',         dueIn: -4,   hasDeps: true,  evidenceN: 5 },
  { key: 'cmc.gmp_certification',          workstream: 'cmc',          stage: 'ind_package',      title: 'GMP certification of clinical-supply facility',     docs: 2, state: 'human_review_required',owner: 'JC', due: 'Nov 30',             dueIn: 194,  hasDeps: true,  evidenceN: 6 },

  // Nonclinical
  { key: 'nonclinical.development_plan',   workstream: 'nonclinical',  stage: 'early_pdev',       title: 'Nonclinical development plan',                      docs: 2, state: 'approved',              owner: 'AM', due: 'completed',          dueIn: null, hasDeps: false, evidenceN: 11 },
  { key: 'nonclinical.glp_tox',            workstream: 'nonclinical',  stage: 'late_pdev',        title: 'GLP toxicology · 28-day repeat-dose',               docs: 5, state: 'changes_requested',     owner: 'AM', due: 'Jul 18',             dueIn: 59,   hasDeps: false, evidenceN: 47 },
  { key: 'nonclinical.pk_dispo',           workstream: 'nonclinical',  stage: 'late_pdev',        title: 'Pharmacokinetics + disposition',                    docs: 4, state: 'in_review',             owner: 'AM', due: 'Aug 04',             dueIn: 76,   hasDeps: false, evidenceN: 28 },
  { key: 'nonclinical.safety_pharm',       workstream: 'nonclinical',  stage: 'late_pdev',        title: 'Safety pharmacology (ICH S7A)',                     docs: 3, state: 'ai_draft_generated',    owner: 'AM', due: 'Aug 22',             dueIn: 94,   hasDeps: false, evidenceN: 16 },
  { key: 'nonclinical.dose_justification', workstream: 'nonclinical',  stage: 'pre_ind_meeting',  title: 'First-in-human dose justification',                  docs: 1, state: 'not_started',           owner: null, due: 'Sep 30',             dueIn: 133,  hasDeps: true,  evidenceN: 0 },

  // Clinical
  { key: 'clinical.development_plan',      workstream: 'clinical',     stage: 'early_pdev',       title: 'Clinical development plan',                          docs: 2, state: 'approved',              owner: 'MW', due: 'completed',          dueIn: null, hasDeps: false, evidenceN: 9 },
  { key: 'clinical.protocol_p1',           workstream: 'clinical',     stage: 'late_pdev',        title: 'Phase 1 protocol · BX-501-001',                     docs: 4, state: 'in_review',             owner: 'MW', due: 'Jul 25',             dueIn: 66,   hasDeps: false, evidenceN: 18 },
  { key: 'clinical.investigator_brochure', workstream: 'clinical',     stage: 'late_pdev',        title: 'Investigator brochure v2',                          docs: 1, state: 'drafting',              owner: 'JC', due: 'Aug 15',             dueIn: 87,   hasDeps: false, evidenceN: 12 },
  { key: 'clinical.icf',                   workstream: 'clinical',     stage: 'pre_ind_meeting',  title: 'Informed consent · master',                         docs: 1, state: 'not_started',           owner: null, due: 'Oct 04',             dueIn: 137,  hasDeps: true,  evidenceN: 0 },
  { key: 'clinical.sap_skeleton',          workstream: 'clinical',     stage: 'ind_package',      title: 'Statistical analysis plan skeleton',                docs: 1, state: 'not_started',           owner: null, due: 'Dec 22',             dueIn: 216,  hasDeps: true,  evidenceN: 0 },

  // Regulatory
  { key: 'regulatory.strategy_memo',       workstream: 'regulatory',   stage: 'early_pdev',       title: 'Regulatory strategy memo',                          docs: 1, state: 'approved',              owner: 'JC', due: 'completed',          dueIn: null, hasDeps: false, evidenceN: 7 },
  { key: 'regulatory.pre_ind_briefing',    workstream: 'regulatory',   stage: 'pre_ind_meeting',  title: 'Pre-IND briefing document',                         docs: 6, state: 'submitted',             owner: 'JC', due: 'sent Feb 18',        dueIn: null, hasDeps: false, evidenceN: 23 },
  { key: 'regulatory.pre_ind_minutes',     workstream: 'regulatory',   stage: 'pre_ind_meeting',  title: 'Pre-IND meeting minutes + commitments',             docs: 2, state: 'agency_feedback_received',owner:'JC', due: 'received 3d ago',    dueIn: null, hasDeps: false, evidenceN: 4 },
  { key: 'regulatory.feedback_rollup',     workstream: 'regulatory',   stage: 'pre_ind_meeting',  title: 'FDA commitment rollup into PDEV activities',         docs: 0, state: 'human_review_required',owner: 'JC', due: 'this week',          dueIn: 4,    hasDeps: false, evidenceN: 0 },
  { key: 'regulatory.ind_cover_letter',    workstream: 'regulatory',   stage: 'ind_package',      title: 'IND cover letter (Form FDA 1571)',                  docs: 1, state: 'not_started',           owner: null, due: 'Jan 12',             dueIn: 237,  hasDeps: true,  evidenceN: 0 },
  { key: 'regulatory.ind_assembly_qc',     workstream: 'regulatory',   stage: 'ind_package',      title: 'IND assembly QC review',                            docs: 1, state: 'not_started',           owner: null, due: 'Feb 05',             dueIn: 261,  hasDeps: true,  evidenceN: 0 },
  { key: 'regulatory.ind_transmit',        workstream: 'regulatory',   stage: 'ind_package',      title: 'IND transmittal · FDA ESG',                          docs: 1, state: 'not_started',           owner: null, due: 'Mar 15 target',      dueIn: 299,  hasDeps: true,  evidenceN: 0 },
  { key: 'regulatory.annual_report',       workstream: 'regulatory',   stage: 'post_ind',         title: 'Annual report (Form FDA 2252)',                     docs: 1, state: 'not_started',           owner: null, due: 'after IND',          dueIn: null, hasDeps: true,  evidenceN: 0 },
];

/* Required documents per activity (sample for first 6 activities) */
const PDEV_DOCUMENTS = {
  'cmc.development_plan':         [{ code: 'CMC-DP-001', title: 'CMC development plan', ectd: 'm3.2.s.1', mandatoryForInd: true,  artifactId: 'art-1024', state: 'approved' }],
  'cmc.formulation_development':  [{ code: 'CMC-FD-001', title: 'Formulation development report', ectd: 'm3.2.p.2.2', mandatoryForInd: true,  artifactId: 'art-1041', state: 'in_review' },
                                   { code: 'CMC-FD-002', title: 'Compatibility study results',     ectd: 'm3.2.p.2.6', mandatoryForInd: false, artifactId: null,        state: 'missing' }],
  'nonclinical.glp_tox':          [{ code: 'NC-TOX-001', title: 'GLP 28-day rat toxicology study report', ectd: 'm4.2.3.2', mandatoryForInd: true, artifactId: 'art-2014', state: 'changes_requested' },
                                   { code: 'NC-TOX-002', title: 'GLP 28-day dog toxicology study report', ectd: 'm4.2.3.2', mandatoryForInd: true, artifactId: 'art-2015', state: 'changes_requested' }],
  'clinical.protocol_p1':         [{ code: 'CLN-P1-001', title: 'Protocol BX-501-001 v0.7',         ectd: 'm5.3.5.1', mandatoryForInd: true, artifactId: 'art-3001', state: 'in_review' },
                                   { code: 'CLN-P1-002', title: 'Schema diagrams',                  ectd: 'm5.3.5.1', mandatoryForInd: false, artifactId: 'art-3002', state: 'approved' }],
  'regulatory.pre_ind_briefing':  [{ code: 'REG-PB-001', title: 'Pre-IND briefing document v1.2', ectd: 'm1.6.3',  mandatoryForInd: false, artifactId: 'art-5001', state: 'submitted' }],
  'regulatory.feedback_rollup':   [{ code: 'REG-RU-001', title: 'FDA commitment rollup matrix',   ectd: 'm1.6.4',  mandatoryForInd: false, artifactId: null,        state: 'missing' }],
};

/* IND assembly view — module-by-module readiness for the active program */
const PDEV_IND_ASSEMBLY = {
  overallReadiness: 58,
  threshold: 85,
  modules: [
    { id: 'm1', label: 'Module 1', readiness: 64, mandatory: { present: 7,  total: 11 }, total: { present: 14, total: 21 }, blockers: ['IND cover letter not drafted', 'Form FDA 1572 outstanding for 3 PIs', 'Financial disclosures pending'] },
    { id: 'm2', label: 'Module 2', readiness: 41, mandatory: { present: 3,  total: 9  }, total: { present: 6,  total: 14 }, blockers: ['Quality summary (M2.3) needs CMC sign-off', 'Nonclinical overview (M2.6) pending GLP-tox revision', 'Clinical overview (M2.5) skeleton only'] },
    { id: 'm3', label: 'Module 3', readiness: 49, mandatory: { present: 8,  total: 17 }, total: { present: 12, total: 24 }, blockers: ['Lot release specifications revision required', 'Stability data still maturing'] },
    { id: 'm4', label: 'Module 4', readiness: 72, mandatory: { present: 6,  total: 8  }, total: { present: 9,  total: 11 }, blockers: ['GLP tox summary pending revision', 'Safety pharmacology in draft'] },
    { id: 'm5', label: 'Module 5', readiness: 68, mandatory: { present: 4,  total: 6  }, total: { present: 5,  total: 8  }, blockers: ['Protocol in review', 'IB v2 in draft'] },
  ],
};

/* FDA interactions — for AX-208 with closed Pre-IND, for BX-501 in-flight */
const PDEV_FDA_INTERACTIONS = [
  { id: 'fda-101', when: '3d ago',    kind: 'q_sub_commitment',  title: 'Justify 28-day vs 90-day GLP duration for FIH', summary: 'FDA requested explicit rationale per ICH M3(R2) §5.1.', status: 'pending-rollup',  blocker: true,  rolled: false, proposedKey: 'nonclinical.glp_tox', confidence: 0.94 },
  { id: 'fda-100', when: '3d ago',    kind: 'q_sub_commitment',  title: 'Provide updated stability data through 6 months', summary: 'FDA expects 6-mo accelerated data before IND filing.', status: 'pending-rollup',  blocker: false, rolled: false, proposedKey: 'cmc.stability_program', confidence: 0.88 },
  { id: 'fda-099', when: '3d ago',    kind: 'q_sub_commitment',  title: 'Add cardiotoxicity assessment to safety pharm panel', summary: 'FDA noted hERG channel data was sufficient but in-vivo telemetry is recommended.', status: 'pending-rollup', blocker: false, rolled: false, proposedKey: 'nonclinical.safety_pharm', confidence: 0.82 },
  { id: 'fda-097', when: '3d ago',    kind: 'q_sub_meeting',     title: 'Type B Pre-IND meeting · written response in lieu of meeting', summary: 'CDER agreed to written response. Minutes attached.', status: 'responded',       blocker: false, rolled: true, proposedKey: null,                       confidence: null },
  { id: 'fda-082', when: '42d ago',   kind: 'q_submission',      title: 'Pre-IND briefing submitted (Q-Sub Q26-0042)',  summary: 'Sponsor requested feedback on 4 questions: CMC, GLP duration, FIH dose, safety pharm.', status: 'closed',     blocker: false, rolled: true, proposedKey: null, confidence: null },
];

/* Contradictions — cross-artifact inconsistencies */
const PDEV_CONTRADICTIONS = [
  { id: 'c-441', severity: 'critical', type: 'dose_mismatch',  objectA: 'nonclinical.dose_justification · FIH NOAEL 50 mg/kg', objectB: 'clinical.protocol_p1 · starting dose 100 mg/kg', authorityState: 'blocks_promotion', reviewState: 'unresolved', when: '2d ago', desc: 'Protocol starting dose exceeds NOAEL-derived MRSD from the GLP tox study by 2×.', regulatoryBody: 'FDA' },
  { id: 'c-440', severity: 'high',     type: 'spec_mismatch',  objectA: 'cmc.lot_release_specs · purity ≥98%',                 objectB: 'clinical.investigator_brochure · purity ≥97%',  authorityState: 'requires_review',   reviewState: 'under_review', when: '5d ago', desc: 'Specification floor differs between lot-release and IB.', regulatoryBody: 'FDA' },
  { id: 'c-438', severity: 'medium',   type: 'endpoint_drift', objectA: 'clinical.development_plan · PK endpoint AUC0-24',     objectB: 'clinical.protocol_p1 · PK endpoint AUC0-inf',   authorityState: 'requires_review',   reviewState: 'reviewed',     when: '8d ago', desc: 'Endpoint definition shifted between plan and protocol.', regulatoryBody: 'FDA' },
  { id: 'c-435', severity: 'low',      type: 'reference_drift',objectA: 'regulatory.strategy_memo · ICH M3(R2) cited',         objectB: 'nonclinical.development_plan · ICH M3(R2) v2009 cited', authorityState: 'advisory_only',  reviewState: 'approved_resolution', when: '14d ago', desc: 'Different ICH M3(R2) revision references.', regulatoryBody: 'ICH' },
];

/* Approval chain run — for nonclinical.glp_tox awaiting approval */
const PDEV_WORKFLOW = {
  runId: 'wfr-2014',
  workflowType: 'state_promotion',
  activityKey: 'nonclinical.glp_tox',
  programCode: 'BX-501',
  targetState: 'approved',
  workflowStatus: 'awaiting_approval',
  steps: [
    { stepIdx: 1, name: 'Peer reviewer (nonclinical lead)', status: 'approved',         requiredRoles: ['nonclinical_lead'], approvals: [{ approver: 'AM', role: 'nonclinical_lead', when: '2d ago', comment: 'GLP tox summary aligned with study reports. One typo flagged.' }] },
    { stepIdx: 2, name: 'Regulatory approver',              status: 'awaiting_review',  requiredRoles: ['regulatory_lead'],  approvals: [] },
    { stepIdx: 3, name: 'Auto-execute state change',         status: 'proposed',         requiredRoles: ['system'],           approvals: [] },
  ],
};

/* Provenance trace — for nonclinical.glp_tox */
const PDEV_PROVENANCE = {
  activity: { key: 'nonclinical.glp_tox', title: 'GLP toxicology · 28-day repeat-dose', workstream: 'nonclinical', stage: 'late_pdev', currentState: 'changes_requested', ownerUserId: 'AM', reviewerUserId: 'JC' },
  artifacts: [
    { id: 'art-2014', title: 'GLP 28-day rat tox study report v1.2',   type: 'pdf',  status: 'changes_requested', version: 'v1.2', ctdSection: 'm4.2.3.2', contentHash: 'd6f12233', citationCount: 47, createdAt: '14d ago' },
    { id: 'art-2015', title: 'GLP 28-day dog tox study report v1.1',   type: 'pdf',  status: 'changes_requested', version: 'v1.1', ctdSection: 'm4.2.3.2', contentHash: '5f7c0091', citationCount: 38, createdAt: '11d ago' },
    { id: 'art-2016', title: 'Tox summary memo (M2.6.7 source)',       type: 'docx', status: 'draft',             version: 'v0.6', ctdSection: 'm2.6.7',  contentHash: '710a3349', citationCount: 12, createdAt: '4d ago' },
  ],
  evidence: [
    { id: 'ev-3001', title: 'Vorelinib rat plasma PK · GLP run 11',    type: 'study-data', category: 'nonclinical', source: 'In-vivo lab', linkType: 'supports',   strength: 'strong' },
    { id: 'ev-3002', title: 'Vorelinib rat brain TK · GLP run 12',     type: 'study-data', category: 'nonclinical', source: 'In-vivo lab', linkType: 'supports',   strength: 'strong' },
    { id: 'ev-3003', title: 'Hepatocellular vacuolation findings',     type: 'finding',    category: 'nonclinical', source: 'Pathology',   linkType: 'contradicts',strength: 'moderate' },
    { id: 'ev-3004', title: 'ICH M3(R2) §5.1 duration guidance',       type: 'reference',  category: 'regulatory',  source: 'ICH',         linkType: 'references', strength: 'strong' },
  ],
  lineage: [
    { id: 'ln-501', sourceObjectType: 'evidence_object', sourceTitle: 'GLP run 11 plasma PK',  linkageType: 'derived_from', transformationType: 'aggregation',  confidenceScore: 0.97, aiModelUsed: null,           createdAt: '14d ago' },
    { id: 'ln-502', sourceObjectType: 'evidence_object', sourceTitle: 'GLP run 12 brain TK',   linkageType: 'derived_from', transformationType: 'aggregation',  confidenceScore: 0.97, aiModelUsed: null,           createdAt: '14d ago' },
    { id: 'ln-503', sourceObjectType: 'evidence_object', sourceTitle: 'ICH M3(R2) §5.1',       linkageType: 'cites',        transformationType: 'reference',     confidenceScore: 1.00, aiModelUsed: null,           createdAt: '12d ago' },
    { id: 'ln-504', sourceObjectType: 'ana_session',     sourceTitle: 'AnA tox summary draft', linkageType: 'ai_drafted',   transformationType: 'synthesis',     confidenceScore: 0.84, aiModelUsed: 'Opus 4.5',    createdAt: '4d ago' },
  ],
  audit: [
    { id: 'aud-9931', when: '4h ago',  actor: 'JC', action: 'changes_requested', detail: 'Reviewer requested 2-week reissue with corrected duration rationale' },
    { id: 'aud-9924', when: '1d ago',  actor: 'AM', action: 'in_review',          detail: 'Submitted GLP tox report v1.2 for review' },
    { id: 'aud-9918', when: '4d ago',  actor: 'AnA', action: 'ai_draft_generated', detail: 'Opus 4.5 drafted tox summary · cited 47 sources · grade A' },
    { id: 'aud-9912', when: '14d ago', actor: 'AM', action: 'drafting',           detail: 'Activity moved from not_started to drafting' },
  ],
};

/* AnA dock — context + suggestions */
const PDEV_SUGGESTIONS = {
  overview: ['What is blocking IND for this program?', 'Snapshot readiness now', 'Show me the critical contradictions'],
  cmc: ['What is the CMC status?', 'Draft cmc.formulation_development', 'Show overdue CMC activities'],
  nonclinical: ['What is the nonclinical status?', 'Draft my GLP toxicology summary into Module 4', 'What evidence is attached to nonclinical.glp_tox?'],
  clinical: ['What is the clinical status?', 'Show me protocol risk assessment progress', 'Roll up FDA commitments into clinical activities'],
  regulatory: ['What is the regulatory status?', 'Walk me through every FDA interaction', 'Compile the IND assembly readiness'],
  ind_assembly: ['How ready is each module for IND?', 'Compile the IND eCTD assembly', 'What documents are missing from Module 3?'],
  contradictions: ['Show me critical contradictions', 'What needs reviewer escalation?', 'Which contradictions block promotion?'],
  fda_interactions: ['What FDA commitments need to be rolled into PDEV?', 'Show all Pre-IND interactions', 'Which FDA questions are still awaiting response?'],
};

/* The 20 AnA commands — slash-menu listing */
const PDEV_COMMANDS = [
  { id: 'pdev.program.summary',          group: 'Program',    example: 'What is the status of BX-501?' },
  { id: 'pdev.program.fda_interactions', group: 'Program',    example: 'Walk me through every FDA interaction for BX-501' },
  { id: 'pdev.readiness.snapshot',       group: 'Program',    example: 'Snapshot readiness now' },
  { id: 'pdev.readiness.findings',       group: 'Program',    example: 'What is blocking IND for BX-501?' },
  { id: 'pdev.workstream.summary',       group: 'Workstream', example: 'Show me the CMC workstream status' },
  { id: 'pdev.activity.summary',         group: 'Activity',   example: 'What is the status of nonclinical.glp_tox?' },
  { id: 'pdev.activity.state_change',    group: 'Activity',   example: 'Move clinical.protocol_p1 to in_review' },
  { id: 'pdev.activity.ai_draft',        group: 'Activity',   example: 'Draft my GLP tox summary into Module 4' },
  { id: 'pdev.activity.evidence_attach', group: 'Activity',   example: 'Attach ICH M3(R2) §5.1 as a reference to nonclinical.glp_tox' },
  { id: 'pdev.activity.evidence_detach', group: 'Activity',   example: 'Detach evidence ev-3003 from nonclinical.glp_tox' },
  { id: 'pdev.activity.provenance',      group: 'Activity',   example: 'Show me the full provenance trace for nonclinical.glp_tox' },
  { id: 'pdev.activity.workflow_kickoff',group: 'Activity',   example: 'Kick off the approval chain for nonclinical.glp_tox' },
  { id: 'pdev.workflow.decide',          group: 'Workflow',   example: 'Approve checkpoint 2 of wfr-2014' },
  { id: 'pdev.ind_assembly.summary',     group: 'Assembly',   example: 'How ready is each module for IND?' },
  { id: 'pdev.ind_assembly.compile',     group: 'Assembly',   example: 'Compile the IND assembly for BX-501' },
  { id: 'pdev.contradictions.list',      group: 'Contradiction', example: 'Show me the critical contradictions for BX-501' },
  { id: 'pdev.contradictions.transition',group: 'Contradiction', example: 'Move c-441 to under_review' },
  { id: 'pdev.fda.feedback_propose',     group: 'FDA',        example: 'Propose PDEV activity matches for unrolled FDA commitments' },
  { id: 'pdev.fda.feedback_apply',       group: 'FDA',        example: 'Apply the proposed rollup for fda-101' },
  { id: 'pdev.audit.export',             group: 'Audit',      example: 'Export the full audit chain for BX-501' },
];

Object.assign(window, {
  PDEV_WORKSTREAMS, PDEV_WORKSTREAM_LABELS,
  PDEV_STAGES, PDEV_STAGE_LABELS,
  PDEV_ACTIVITY_STATES, PDEV_COMPLETED_STATES, PDEV_BLOCKED_STATES, PDEV_IN_FLIGHT_STATES, PDEV_STATE_LABELS,
  ECTD_MODULES, ECTD_MODULE_LABELS,
  CONTRADICTION_SEVERITIES, CONTRADICTION_AUTHORITY_STATES, CONTRADICTION_REVIEW_STATES,
  WORKFLOW_RUN_STATUSES, APPROVAL_CHECKPOINT_STATUSES,
  PDEV_NAV_GROUPS, PDEV_NAV_ITEMS,
  PDEV_PROGRAMS, PDEV_ACTIVITIES, PDEV_DOCUMENTS,
  PDEV_IND_ASSEMBLY, PDEV_FDA_INTERACTIONS, PDEV_CONTRADICTIONS,
  PDEV_WORKFLOW, PDEV_PROVENANCE,
  PDEV_SUGGESTIONS, PDEV_COMMANDS,
});

})();
