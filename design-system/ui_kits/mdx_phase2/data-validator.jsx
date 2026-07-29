/* global window */
/* ═════════════════════════════════════════════════════════════════
   eSTAR per-section validator — rich rule definitions.

   The Validation Center's flat rule list can't carry enough context
   for a reviewer to actually fix a finding. This file expands each
   rule with: FDA reference, expected vs current value, evidence
   pointers, and concrete fix actions. Keyed first by program code,
   then by eSTAR section number. Surfaces consume it via
   ESTAR_DETAIL[progCode]?.[sectionNum].
   ═════════════════════════════════════════════════════════════════ */

/* eSTAR section catalogue. Mirrors the FDA template (Sep 2023).
   Used to list every section in the drawer even if there are no
   active findings — that's how reviewers see "this section is clean". */
window.ESTAR_SECTIONS = [
  { num: '01', label: 'Cover letter',                volume: 'Admin' },
  { num: '02', label: 'Submission overview',         volume: 'Admin' },
  { num: '03', label: 'Indications for use',         volume: 'Device' },
  { num: '04', label: 'Device description',          volume: 'Device' },
  { num: '05', label: 'Proposed labeling',           volume: 'Device' },
  { num: '06', label: '510(k) summary',              volume: 'Substantial Equivalence' },
  { num: '07', label: 'Truthful and accurate statement',volume: 'Admin' },
  { num: '08', label: 'Standards data',              volume: 'Performance' },
  { num: '09', label: 'Software documentation',      volume: 'Performance' },
  { num: '10', label: 'Cybersecurity / SBOM',        volume: 'Performance' },
  { num: '11', label: 'Substantial equivalence',     volume: 'Substantial Equivalence' },
  { num: '12', label: 'Sterility',                   volume: 'Performance' },
  { num: '13', label: 'Shelf life',                  volume: 'Performance' },
  { num: '14', label: 'Biocompatibility',            volume: 'Performance' },
  { num: '15', label: 'Animal testing',              volume: 'Performance' },
  { num: '16', label: 'Bench performance',           volume: 'Performance' },
  { num: '17', label: 'Clinical performance',        volume: 'Performance' },
  { num: '18', label: 'Electromagnetic compatibility', volume: 'Performance' },
  { num: '19', label: 'Wireless coexistence',        volume: 'Performance' },
  { num: '20', label: 'Other',                       volume: 'Admin' },
];

/* Per-program · per-section findings. Each finding carries enough
   context that a reviewer never has to leave this drawer to know
   what's wrong and what would clear it. */
window.ESTAR_DETAIL = {

  /* ═══ OR-801 · Pedicle screw system · 510(k) ═══════════════════ */
  'OR-801': {
    progTitle: 'OR-801 Pedicle Screw System',
    pathway: '510(k)',
    overall: { complete: 15, warn: 4, err: 1, total: 20, readiness: 84 },
    summary: 'One blocker in §11 SE discussion gates transmit. Four warnings across §3, §11, §17 do not block but should be cleared before cover-letter sign-off.',
    sections: {
      '03': {
        status: 'warn',
        complete: 'Indications statement, Rx-only flag, intended user, target population.',
        findings: [
          {
            id: 'DR-07',
            severity: 'warn',
            category: 'Drafting',
            ref: 'eSTAR §VII-3.1 · Cover-letter convention',
            rule: 'Cover letter typically includes regulatory class, product code, and a one-paragraph indication recap.',
            current: 'Cover letter is 640 words. Missing the regulatory class line ("Class II, 21 CFR 888.3070, product code MNH").',
            expected: 'Include the standard FDA framing: device class · CFR cite · product code · pathway · indication recap.',
            evidence: [
              { kind: 'doc', label: 'Cover letter — OR-801.docx', vaultId: 'f-or801-cover', version: 'v0.4 draft' },
            ],
            fixes: [
              { kind: 'open-editor', label: 'Open §1 in editor', target: { sectionId: 1 } },
              { kind: 'attach',      label: 'Attach revised cover', target: { fileTypes: '.docx,.pdf' } },
              { kind: 'ask-claude',  label: 'Draft the framing line', prompt: 'Add Class II · 21 CFR 888.3070 · product code MNH framing to OR-801 cover letter.' },
            ],
            since: '5h ago',
            owner: 'L. Tran',
          },
        ],
      },
      '11': {
        status: 'err',
        complete: 'Predicate identification (K191822), comparison table, technological characteristics matrix.',
        findings: [
          {
            id: 'CE-01',
            severity: 'err',
            category: 'Claim-evidence',
            ref: '21 CFR 807.92(a)(3) · Substantial-equivalence basis must reference locked evidence',
            rule: 'Every performance claim in the SE discussion must cite an evidence document whose status is "approved" — not "draft" or "review".',
            current: 'Biocompat equivalence claim cites TR-OR801-014 · status = "review" · approver gate not crossed.',
            expected: 'TR-OR801-014 must be approved (signed, locked) before §11 can be transmitted.',
            evidence: [
              { kind: 'doc', label: 'TR-OR801-014 · Biocompat report', vaultId: 'f-or801-bc', version: 'v2.1', status: 'review' },
              { kind: 'doc', label: '§11 SE discussion', vaultId: 'f-or801-se', version: 'v1.6 draft', status: 'draft' },
            ],
            fixes: [
              { kind: 'open-editor', label: 'Open §11 in editor', target: { sectionId: 11 } },
              { kind: 'attach',      label: 'Attach approved -014', target: { fileTypes: '.pdf' } },
              { kind: 'esign',       label: 'Send -014 for e-signature', target: { vaultId: 'f-or801-bc' } },
              { kind: 'ask-claude',  label: 'Suggest a workaround', prompt: 'CE-01 is gating OR-801 §11. The biocompat report is in review. What are options to unblock without waiting for the lock?' },
            ],
            since: '2h ago',
            owner: 'L. Tran',
            blockingTransmit: true,
          },
          {
            id: 'CE-02',
            severity: 'warn',
            category: 'Claim-evidence',
            ref: '21 CFR 807.87(g) · Performance-data attachments',
            rule: 'When a performance claim cites a test report, the report must be attached in §17 or §16 and the cross-reference must resolve.',
            current: 'Pull-out force claim cites TR-OR801-009. Cross-reference points to §17 but no attachment exists at §17.path[3].',
            expected: 'TR-OR801-009 attached at §17 with the right vault hash, or claim removed from §11.',
            evidence: [
              { kind: 'doc', label: 'TR-OR801-009 · Pull-out force', vaultId: 'f-or801-pof', version: 'v1.0', status: 'approved' },
            ],
            fixes: [
              { kind: 'attach',      label: 'Attach to §17', target: { sectionId: 17, vaultId: 'f-or801-pof' } },
              { kind: 'open-editor', label: 'Open §11 in editor', target: { sectionId: 11 } },
            ],
            since: '5h ago',
            owner: 'J. Chen',
          },
        ],
      },
      '14': {
        status: 'warn',
        complete: 'ISO 10993-1 risk evaluation, supplier extractables data, lot traceability.',
        findings: [
          {
            id: 'BC-03',
            severity: 'warn',
            category: 'Documentation',
            ref: 'ISO 10993-18:2020 · §5.3 — Test-article statement',
            rule: 'Test-article statement must reference the lot used and confirm finished-device equivalence.',
            current: 'Test-article statement names supplier lot 22K but does not confirm equivalence to OR-801 finished device.',
            expected: 'Add finished-device equivalence statement per Q-Sub Q250844 commitment cm-844-1.',
            evidence: [
              { kind: 'qsub', label: 'Q250844 commitment cm-844-1', qsubId: 'qs-2025-0844' },
              { kind: 'doc',  label: 'Biocompat -014 §3 test-article', vaultId: 'f-or801-bc' },
            ],
            fixes: [
              { kind: 'open-editor', label: 'Open §14 in editor', target: { sectionId: 14 } },
              { kind: 'open-qsub',   label: 'Open Q250844', target: { qsubId: 'qs-2025-0844' } },
            ],
            since: '1d ago',
            owner: 'L. Tran',
          },
        ],
      },
      '17': {
        status: 'warn',
        complete: 'Bench testing protocols, ASTM F1717 fatigue test plan.',
        findings: [
          {
            id: 'CL-12',
            severity: 'warn',
            category: 'Required field',
            ref: 'eSTAR §VII-17.4 · Performance summary table',
            rule: 'Performance summary table must list every test with method, acceptance criterion, and result.',
            current: '3 of 11 rows missing acceptance criterion (rows 4, 7, 9 — torsional yield, axial pull-out, insertion torque).',
            expected: 'Acceptance criterion populated for every row; pull from protocol PR-OR801-007.',
            evidence: [
              { kind: 'doc', label: 'PR-OR801-007 · Bench protocol', vaultId: 'f-or801-prot', version: 'v3.0', status: 'approved' },
            ],
            fixes: [
              { kind: 'open-editor', label: 'Open §17 in editor', target: { sectionId: 17 } },
              { kind: 'auto-fill',   label: 'Auto-fill from PR-OR801-007', target: { sectionId: 17, vaultId: 'f-or801-prot' } },
            ],
            since: '8h ago',
            owner: 'M. Webb',
          },
        ],
      },
    },
  },

  /* ═══ DX-102 · IVD cartridge · 510(k) ═══ */
  'DX-102': {
    progTitle: 'DX-102 IVD Cartridge',
    pathway: '510(k)',
    overall: { complete: 13, warn: 5, err: 1, total: 20, readiness: 76 },
    summary: 'Analyte panel completeness blocks §17. Performance volume is otherwise strong.',
    sections: {
      '17': {
        status: 'err',
        complete: 'Analytical specificity, interference panel, lot-to-lot reproducibility.',
        findings: [
          {
            id: 'eSTAR-17.4',
            severity: 'err',
            category: 'Required field',
            ref: 'eSTAR §VII-17.4 · Analytical sensitivity table',
            rule: 'Sensitivity table must include LoB, LoD, LoQ for every claimed analyte.',
            current: '11 of 14 analytes complete. Missing: thyroxine, cortisol, troponin-I.',
            expected: 'LoB / LoD / LoQ values per CLSI EP17-A2 for all 14 claimed analytes.',
            evidence: [
              { kind: 'doc', label: 'CLSI EP17 study results — 11 analytes', vaultId: 'f-dx102-ep17', version: 'v1.2', status: 'approved' },
            ],
            fixes: [
              { kind: 'open-editor', label: 'Open §17 in editor', target: { sectionId: 17 } },
              { kind: 'attach',      label: 'Attach 3 analyte study runs', target: { fileTypes: '.pdf,.xlsx' } },
              { kind: 'ask-claude',  label: 'Draft justification to defer', prompt: 'Can DX-102 defer thyroxine/cortisol/troponin-I to a post-clearance amendment?' },
            ],
            since: '4h ago',
            owner: 'A. Patel',
            blockingTransmit: true,
          },
        ],
      },
    },
  },

  /* ═══ CV-330 · Implantable monitor · PMA ═══ */
  'CV-330': {
    progTitle: 'CV-330 Implantable Monitor',
    pathway: 'PMA',
    overall: { complete: 12, warn: 4, err: 1, total: 20, readiness: 71 },
    summary: 'Clinical evidence package blocks Module 5. SAP signature is the gating item.',
    sections: {
      '17': {
        status: 'err',
        complete: 'Pivotal trial protocol, enrollment plan, DSMB charter.',
        findings: [
          {
            id: 'eSTAR-11.2',
            severity: 'err',
            category: 'Required field',
            ref: '21 CFR 814.20(b)(11) · Statistical analysis plan',
            rule: 'Primary endpoint power calculation must be attached as a signed Statistical Analysis Plan.',
            current: 'SAP attached as v0.7 draft · biostatistician signature missing.',
            expected: 'SAP locked, biostatistician e-signature on file, version 1.0.',
            evidence: [
              { kind: 'doc', label: 'CV-330 SAP', vaultId: 'f-cv330-sap', version: 'v0.7 draft', status: 'review' },
            ],
            fixes: [
              { kind: 'esign',       label: 'Send SAP for e-signature', target: { vaultId: 'f-cv330-sap' } },
              { kind: 'open-editor', label: 'Open Module 5.1 in editor', target: { editorKind: 'pma-editor', sectionId: 51 } },
            ],
            since: '1d ago',
            owner: 'D. Park',
            blockingTransmit: true,
          },
        ],
      },
    },
  },

  /* ═══ BX-204 · CGM · 510(k) ═══ */
  'BX-204': {
    progTitle: 'BX-204 Continuous Glucose Monitor',
    pathway: '510(k)',
    overall: { complete: 16, warn: 2, err: 0, total: 20, readiness: 89 },
    summary: 'No blockers. Two predicate-related warnings to clear before sign-off.',
    sections: {
      '11': {
        status: 'warn',
        complete: 'Primary predicate K212284, technological characteristics matrix, indications mapping.',
        findings: [
          {
            id: 'VR-22',
            severity: 'warn',
            category: 'Predicate',
            ref: '21 CFR 807.92(a)(3) · Performance comparison',
            rule: 'When subject device performance differs from predicate by >0.5%, rationale required.',
            current: 'BX-204 MARD = 8.9%. Predicate K221847 MARD = 8.3%. Delta = 0.6%.',
            expected: 'Rationale paragraph explaining clinical equivalence despite the delta.',
            evidence: [
              { kind: 'qsub', label: 'Q251142 question 1 — predicate strategy', qsubId: 'qs-2025-1142' },
            ],
            fixes: [
              { kind: 'open-editor', label: 'Open §11 in editor', target: { sectionId: 11 } },
              { kind: 'open-qsub',   label: 'Reference Q251142', target: { qsubId: 'qs-2025-1142' } },
              { kind: 'ask-claude',  label: 'Draft the rationale', prompt: 'Draft a clinical-equivalence rationale for BX-204 MARD 8.9 vs predicate 8.3.' },
            ],
            since: '2d ago',
            owner: 'J. Chen',
          },
        ],
      },
    },
  },

  /* ═══ PM-660 · Patient monitor · 510(k) (SaMD) ═══ */
  'PM-660': {
    progTitle: 'PM-660 Patient Monitor — software',
    pathway: '510(k) · SaMD',
    overall: { complete: 14, warn: 3, err: 0, total: 20, readiness: 82 },
    summary: 'Cybersecurity volume is the long pole. SBOM completeness is being tracked under Q-Sub Q251187.',
    sections: {
      '10': {
        status: 'warn',
        complete: 'Threat model, security architecture, vulnerability disclosure policy.',
        findings: [
          {
            id: 'CYB-08',
            severity: 'warn',
            category: 'Cybersecurity',
            ref: 'FDA Premarket Cyber Guidance (Sep 2023) · §V.B.4',
            rule: 'SBOM must enumerate every third-party component with version and license.',
            current: 'SBOM lists 47 of 51 components. Missing: openssl 3.2.1, mbedtls 2.28, libcurl 8.4.0, busybox 1.36.',
            expected: 'Complete SBOM in CycloneDX 1.5 JSON format.',
            evidence: [
              { kind: 'qsub', label: 'Q251187 cybersecurity premarket scope', qsubId: 'qs-2025-1187' },
            ],
            fixes: [
              { kind: 'attach',    label: 'Re-upload SBOM', target: { fileTypes: '.json,.xml' } },
              { kind: 'open-qsub', label: 'Open Q251187', target: { qsubId: 'qs-2025-1187' } },
            ],
            since: '6h ago',
            owner: 'R. Singh',
          },
        ],
      },
      'Labeling': {
        status: 'warn',
        complete: 'Indications, contraindications, instructions for use draft.',
        findings: [
          {
            id: 'UDI-04',
            severity: 'warn',
            category: 'UDI',
            ref: '21 CFR 830.20 · DI-PI attribute requirements',
            rule: 'Each DI-level GUDID record must carry every required PI attribute for the device class.',
            current: 'PM-660 GUDID record missing 2 attributes: lot number indicator, manufacture date indicator.',
            expected: 'Both PI attributes set; record re-submitted to GUDID.',
            evidence: [
              { kind: 'doc', label: 'PM-660 GUDID export', vaultId: 'f-pm660-gudid', version: 'v0.3', status: 'draft' },
            ],
            fixes: [
              { kind: 'open-editor', label: 'Open §05 labeling', target: { sectionId: 5 } },
              { kind: 'attach',      label: 'Attach corrected record', target: { fileTypes: '.csv,.json' } },
            ],
            since: '1d ago',
            owner: 'S. Marchetti',
          },
        ],
      },
    },
  },
};
