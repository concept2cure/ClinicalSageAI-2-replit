(() => {
/**
 * Documents the Engineering surface produces.
 *
 * Every regulatory artifact a device-engineering team is responsible for —
 * 21 CFR 820.30 design controls, ISO 14971 risk management, IEC 62304
 * software lifecycle, FDA 2023 cybersecurity guidance. Each row is a
 * single regulatory document with versioning, sections, sign-off, and
 * a route into the editor.
 *
 * Wire shape: GET /api/mdx/engineering/:programId/documents
 *
 * Status vocabulary aligns with the kit's section status pill:
 *   draft   → first-pass content, not yet reviewed
 *   review  → ready for peer review
 *   ready   → review complete, awaiting sign-off
 *   locked  → signed and version-frozen for the active submission cycle
 *   blocked → required content gap (red rail)
 */

const ENG_DOC_FRAMEWORKS = [
  { id: '820',   label: '21 CFR 820.30', desc: 'Design controls' },
  { id: '14971', label: 'ISO 14971',     desc: 'Risk management' },
  { id: '62304', label: 'IEC 62304',     desc: 'Software lifecycle' },
  { id: 'cyber', label: 'FDA Cyber 2023',desc: 'Premarket cybersecurity' },
];

/* Each doc owns a regulatory artifact. `dhfRef` links into the DHF strip;
   `editor` names which editor variant opens the doc; `sections` is the
   shape the document-editor reads to render its left tree (mirrors how
   eSTAR sections render today). */
const ENG_DOCUMENTS = [
  {
    id: 'doc-ddp-bx204', framework: '820', dhfRef: '01',
    type: 'Design and Development Plan',
    title: 'Design and Development Plan — BX-204',
    ver: 'v2.1', status: 'ready', completion: 100, blocker: false,
    owner: 'JC', reviewers: ['MW'], lastEdit: '4d ago',
    esigRequired: true, esigState: 'signed', signedBy: 'JC · 2026-04-08',
    sections: 12, sectionsComplete: 12,
    editor: 'engineering',
  },
  {
    id: 'doc-srs-bx204', framework: '820', dhfRef: '02',
    type: 'Design Input Specification (SRS)',
    title: 'Design inputs — BX-204',
    ver: 'v1.7', status: 'ready', completion: 100, blocker: false,
    owner: 'AK', reviewers: ['JC', 'RA'], lastEdit: '2d ago',
    esigRequired: true, esigState: 'signed', signedBy: 'AK · 2026-05-02',
    sections: 142, sectionsComplete: 142,
    editor: 'engineering',
  },
  {
    id: 'doc-sds-bx204', framework: '820', dhfRef: '03',
    type: 'Design Output Specification (SDS)',
    title: 'Design outputs — BX-204',
    ver: 'v1.4', status: 'review', completion: 94, blocker: false,
    owner: 'AK', reviewers: ['JC'], lastEdit: '1d ago',
    esigRequired: true, esigState: 'pending',
    sections: 218, sectionsComplete: 205, openComments: 11,
    editor: 'engineering',
  },
  {
    id: 'doc-vverp-bx204', framework: '820', dhfRef: '05',
    type: 'Verification protocols and reports',
    title: 'V&V package — BX-204',
    ver: 'v1.9', status: 'review', completion: 92, blocker: false,
    owner: 'LT', reviewers: ['AK', 'JC'], lastEdit: '12h ago',
    esigRequired: true, esigState: 'pending',
    sections: 94, sectionsComplete: 87, deviations: 3,
    editor: 'engineering',
  },
  {
    id: 'doc-val-bx204', framework: '820', dhfRef: '06',
    type: 'Design validation report',
    title: 'Validation — BX-204 (HF summative pending)',
    ver: 'v0.8', status: 'draft', completion: 64, blocker: true,
    owner: 'JC', reviewers: [], lastEdit: '4d ago',
    esigRequired: true, esigState: 'na',
    sections: 18, sectionsComplete: 11, blockerNote: 'HF summative report not received',
    editor: 'engineering',
  },
  {
    id: 'doc-rmp-bx204', framework: '14971',
    type: 'Risk Management Plan',
    title: 'Risk Management Plan — BX-204',
    ver: 'v2.0', status: 'ready', completion: 100, blocker: false,
    owner: 'AK', reviewers: ['JC', 'MW'], lastEdit: '11d ago',
    esigRequired: true, esigState: 'signed', signedBy: 'AK · 2026-04-22',
    sections: 8, sectionsComplete: 8,
    editor: 'engineering',
  },
  {
    id: 'doc-ra-bx204', framework: '14971',
    type: 'Risk Analysis + FMEA',
    title: 'Risk Analysis — BX-204',
    ver: 'v3.1', status: 'review', completion: 95, blocker: false,
    owner: 'AK', reviewers: ['JC', 'LT'], lastEdit: '8h ago',
    esigRequired: true, esigState: 'pending',
    sections: 8, sectionsComplete: 8, openRisks: 2,
    editor: 'engineering',
  },
  {
    id: 'doc-rmr-bx204', framework: '14971',
    type: 'Risk Management Report',
    title: 'Risk Management Report — BX-204 (residual + benefit-risk)',
    ver: 'v0.4', status: 'draft', completion: 38, blocker: true,
    owner: 'JC', reviewers: [], lastEdit: '6d ago',
    esigRequired: true, esigState: 'na',
    sections: 10, sectionsComplete: 4, blockerNote: 'Awaiting R-061 verification + R-071 closure',
    editor: 'engineering',
  },
  {
    id: 'doc-srs-sw',  framework: '62304',
    type: 'Software Requirements Specification (SRS)',
    title: 'Software SRS — BX-204 firmware 4.1',
    ver: 'v1.3', status: 'review', completion: 88, blocker: false,
    owner: 'PS', reviewers: ['AK'], lastEdit: '1d ago',
    esigRequired: true, esigState: 'pending',
    sections: 48, sectionsComplete: 42,
    editor: 'engineering',
  },
  {
    id: 'doc-vv-sw',   framework: '62304',
    type: 'Software V&V package',
    title: 'Software V&V — BX-204 firmware 4.1 (Class C)',
    ver: 'v0.9', status: 'review', completion: 71, blocker: false,
    owner: 'PS', reviewers: ['AK'], lastEdit: '3h ago',
    esigRequired: true, esigState: 'pending',
    sections: 32, sectionsComplete: 23, anomalies: 4,
    editor: 'engineering',
  },
  {
    id: 'doc-tm-cyber', framework: 'cyber',
    type: 'Cybersecurity threat model',
    title: 'Threat model — BX-204 (STRIDE × use-case × patient-harm)',
    ver: 'v1.6', status: 'review', completion: 90, blocker: false,
    owner: 'PS', reviewers: ['AK', 'JC'], lastEdit: '4h ago',
    esigRequired: true, esigState: 'pending',
    sections: 5, sectionsComplete: 5,
    editor: 'engineering',
  },
  {
    id: 'doc-sbom-cyber', framework: 'cyber',
    type: 'Software Bill of Materials (CycloneDX)',
    title: 'SBOM — BX-204 firmware 4.1',
    ver: 'v4.1.2', status: 'draft', completion: 47, blocker: true,
    owner: 'PS', reviewers: [], lastEdit: '1h ago',
    esigRequired: false, esigState: 'na',
    sections: 1, sectionsComplete: 0, blockerNote: '11 CVEs under review — patches pending for 4',
    editor: 'engineering',
  },
];

// Window globals (kit harness only — codebase uses ESM imports)
window.ENG_DOC_FRAMEWORKS = ENG_DOC_FRAMEWORKS;
window.ENG_DOCUMENTS = ENG_DOCUMENTS;

})();
