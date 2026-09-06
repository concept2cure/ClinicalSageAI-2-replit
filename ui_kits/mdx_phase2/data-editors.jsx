/* PMA + CER editor data — feeds DocumentEditor.
   The 510(k) editor still uses EDITOR_* (data.jsx); these mirror that shape. */

/* ═══════════ PMA Editor ═══════════ */
window.PMA_EDITOR_PROGRAM = {
  id: 'cv330',
  code: 'CV-330',
  title: 'CV-330 Implantable Cardiac Monitor',
  dueLabel: 'PMA filing · Q2 2026',
};

/* PMA structure follows 21 CFR 814 — six modules, each with sub-sections.
   This is the standard PMA outline; CDRH expects every module addressed. */
window.PMA_EDITOR_SECTIONS = [
  { volume: 'Module 1 · Administrative',
    items: [
      { id: 'm1-1', num: '1.1',  label: 'Cover letter',                     status: 'complete' },
      { id: 'm1-2', num: '1.2',  label: 'Table of contents',                status: 'complete' },
      { id: 'm1-3', num: '1.3',  label: 'Indications for use',              status: 'complete' },
      { id: 'm1-4', num: '1.4',  label: 'Device description',               status: 'review' },
      { id: 'm1-5', num: '1.5',  label: 'Alternative practices',            status: 'draft' },
    ],
  },
  { volume: 'Module 2 · Summary of safety and effectiveness',
    items: [
      { id: 'm2-1', num: '2.1',  label: 'Summary of safety and effectiveness',  status: 'draft', words: 4810 },
      { id: 'm2-2', num: '2.2',  label: 'Risk analysis',                        status: 'review' },
      { id: 'm2-3', num: '2.3',  label: 'Benefit-risk determination',           status: 'draft' },
    ],
  },
  { volume: 'Module 3 · Manufacturing',
    items: [
      { id: 'm3-1', num: '3.1',  label: 'Manufacturing site information',   status: 'complete' },
      { id: 'm3-2', num: '3.2',  label: 'Quality system summary',           status: 'review',  blocker: true },
      { id: 'm3-3', num: '3.3',  label: 'Sterilization validation',         status: 'complete' },
      { id: 'm3-4', num: '3.4',  label: 'Packaging and labeling',           status: 'draft' },
    ],
  },
  { volume: 'Module 4 · Non-clinical',
    items: [
      { id: 'm4-1', num: '4.1',  label: 'Bench performance testing',        status: 'complete' },
      { id: 'm4-2', num: '4.2',  label: 'Animal studies',                   status: 'complete' },
      { id: 'm4-3', num: '4.3',  label: 'Biocompatibility',                 status: 'complete' },
      { id: 'm4-4', num: '4.4',  label: 'Software verification',            status: 'review' },
      { id: 'm4-5', num: '4.5',  label: 'Electromagnetic compatibility',    status: 'complete' },
    ],
  },
  { volume: 'Module 5 · Clinical',
    items: [
      { id: 'm5-1', num: '5.1',  label: 'Clinical investigation summary',   status: 'draft', words: 6230 },
      { id: 'm5-2', num: '5.2',  label: 'Clinical data — primary endpoint', status: 'draft', blocker: true },
      { id: 'm5-3', num: '5.3',  label: 'Adverse events and SAEs',          status: 'review' },
      { id: 'm5-4', num: '5.4',  label: 'Statistical analysis plan',        status: 'complete' },
      { id: 'm5-5', num: '5.5',  label: 'Conclusions',                      status: 'empty' },
    ],
  },
  { volume: 'Module 6 · Post-approval',
    items: [
      { id: 'm6-1', num: '6.1',  label: 'Post-approval study plan',         status: 'draft' },
      { id: 'm6-2', num: '6.2',  label: 'Post-market surveillance',         status: 'draft' },
      { id: 'm6-3', num: '6.3',  label: 'Tracking and reporting',           status: 'empty' },
    ],
  },
];

/* Drafted Module 5.1 — Clinical investigation summary. Same block grammar
   as 510(k) §11: spans + cite chips + provenance + flags. */
window.PMA_EDITOR_CONTENT = {
  'm5-1': {
    id: 'm5-1', num: '5.1', label: 'Clinical investigation summary', status: 'draft', wordCount: 6230,
    masthead: [
      { lbl: 'Pivotal trial',  val: 'CV-330-PIVOT · NCT05821491' },
      { lbl: 'Sites · enrolled', val: '38 sites · 612 of 600 (102%)' },
      { lbl: 'Primary endpoint', val: 'Detection sensitivity at 12 mo' },
      { lbl: 'Last edited',    val: '14 minutes ago · J. Adeyemi' },
    ],
    blocks: [
      { id: 'pb1', kind: 'p', confidence: 0.92,
        prov: { source: 'Final clinical study report · CSR-CV330-v4.1', model: 'Opus 4.5', audit: 'AUD-9112', foot: 'Drafted from CSR §10' },
        spans: [
          { t: 'The CV-330 Implantable Cardiac Monitor pivotal investigation (' },
          { cite: 'NCT05821491' },
          { t: ') was a prospective, multi-center, single-arm trial designed to evaluate detection sensitivity for clinically significant arrhythmias at 12 months post-implant. Enrollment occurred at 38 sites across the United States, Germany, and Japan, with 612 subjects implanted between February 2023 and August 2024.' },
        ],
      },
      { id: 'pb2', kind: 'h2', text: 'Primary endpoint results' },
      { id: 'pb3', kind: 'p', confidence: 0.86,
        prov: { source: 'Locked SAP analysis · BIO-CV330-001', model: 'Opus 4.5', audit: 'AUD-9113', foot: 'Per locked SAP v3.0' },
        spans: [
          { t: 'The primary endpoint was met. Detection sensitivity for clinically significant arrhythmias at 12 months was ' },
          { cite: '94.7% (95% CI: 92.3–96.5%)' },
          { t: ', which exceeded the pre-specified performance goal of 90% (lower bound > 85%). All 612 subjects contributed to the primary analysis. The Kaplan-Meier estimate of freedom from device-related serious adverse events at 12 months was 97.1%.' },
        ],
      },
      { id: 'pb4', kind: 'table',
        confidence: 0.94,
        prov: { source: 'BIO-CV330-001 §6.2', model: 'Sonnet 4.5', audit: 'AUD-9114', foot: 'Verified against locked dataset' },
        headers: ['Outcome', 'CV-330 (n=612)', '95% CI', 'Performance goal'],
        rows: [
          ['Detection sensitivity (primary)',     '94.7%',          '92.3–96.5%',  '≥ 90%'],
          ['False-positive rate',                  '2.4%',           '1.8–3.2%',    '≤ 5%'],
          ['Device-related SAE freedom · 12 mo',   '97.1%',          '95.4–98.3%',  '≥ 92%'],
          ['Sensor longevity · battery',           '4.2 yr (median)','3.9–4.4',     '≥ 3 yr'],
        ],
      },
      { id: 'pb5', kind: 'h2', text: 'Adverse events' },
      { id: 'pb6', kind: 'p', confidence: 0.71,
        flags: [{ kind: 'evidence-link', severity: 'warn', msg: 'AE narrative cites adjudication committee report ADJ-CV330-FINAL — not yet attached in §5.3.' }],
        prov: { source: 'CSR-CV330-v4.1 §11', model: 'Opus 4.5', audit: 'AUD-9115', foot: 'Pending §5.3 attachment' },
        spans: [
          { t: 'A total of 47 device- or procedure-related adverse events were reported across 612 subjects (7.7%). Of these, 18 were serious (2.9%), with the most common being implant-site infection (n = 9) and lead dislodgement (n = 5). Adjudication by an independent committee determined that one death was possibly device-related and 17 were unrelated. All adjudication results are tabulated in §5.3.' },
        ],
      },
      { id: 'pb7', kind: 'h2', text: 'Subgroup analysis' },
      { id: 'pb8', kind: 'p', confidence: 0.62,
        flags: [{ kind: 'claim-evidence', severity: 'err', msg: 'Subgroup claim implies pre-specified analysis; SAP v3.0 lists this as exploratory only. Reword or withdraw claim.' }],
        prov: { source: 'BIO-CV330-001 §7.3', model: 'Opus 4.5', audit: 'AUD-9116', foot: 'Blocker — see SAP scope' },
        spans: [
          { t: 'Pre-specified subgroup analysis demonstrated consistent performance across age, sex, and BMI strata, with no subgroup showing detection sensitivity below 92%. Geographic subgroup performance (US vs ex-US) was equivalent within the pre-specified non-inferiority margin.' },
        ],
      },
      { id: 'pb9', kind: 'h2', text: 'Conclusion' },
      { id: 'pb10', kind: 'p', confidence: 0.89,
        prov: { source: 'Drafted from §5.1 blocks 1–8', model: 'Opus 4.5', audit: 'AUD-9117', foot: 'Stock closing — review for Module 2 alignment' },
        spans: [
          { t: 'The CV-330 pivotal investigation met its primary endpoint with statistical and clinical significance. Safety findings were consistent with the device class and manageable through standard implant practice. The benefit-risk profile supports approval for the proposed indication.' },
        ],
      },
    ],
  },
};

window.PMA_EDITOR_VALIDATION = {
  'm5-1': [
    { id: 'pv1', severity: 'err',  rule: 'PMA-5.1',  msg: 'Subgroup claim in ¶ 8 not supported by SAP scope (exploratory only).', blockId: 'pb8' },
    { id: 'pv2', severity: 'warn', rule: 'PMA-5.3',  msg: 'AE narrative references ADJ-CV330-FINAL — attachment missing.', blockId: 'pb6' },
    { id: 'pv3', severity: 'ok',   rule: 'PMA-5.1a', msg: 'Trial registration NCT-number cited.' },
    { id: 'pv4', severity: 'ok',   rule: 'PMA-5.1b', msg: 'Primary endpoint result with confidence interval.' },
    { id: 'pv5', severity: 'ok',   rule: 'PMA-5.1c', msg: 'Performance goal pre-specified and met.' },
    { id: 'pv6', severity: 'ok',   rule: 'PMA-5.1d', msg: 'AE adjudication independence stated.' },
  ],
};

window.PMA_EDITOR_COMMENTS = [
  { id: 'pc1', blockId: 'pb8', author: 'Linh Tran', role: 'Reg Affairs', when: '1h ago', resolved: false,
    body: 'FDA will push back on calling this pre-specified — SAP v3.0 lists subgroup analysis as exploratory. Suggest rewording to "post-hoc subgroup analysis was consistent with…"' },
  { id: 'pc2', blockId: 'pb8', author: 'Claude', role: 'Opus 4.5', when: '1h ago', resolved: false, ai: true,
    body: 'Suggested rewrite that addresses Linh\'s comment and stays factual:',
    suggest: { blockId: 'pb8', text: 'Post-hoc subgroup analysis demonstrated consistent performance across age, sex, and BMI strata, with no subgroup showing detection sensitivity below 92% (95% CI lower bound). Geographic subgroup performance (US vs ex-US) was numerically similar; formal non-inferiority testing was not pre-specified.' } },
  { id: 'pc3', blockId: 'pb6', author: 'Maya Patel', role: 'Clinical Lead', when: 'yesterday', resolved: false,
    body: 'Adjudication committee finalized last week — ADJ-CV330-FINAL is locked. I\'ll attach to §5.3 today.' },
  { id: 'pc4', blockId: 'pb3', author: 'Jordan Chen', role: 'Lead', when: '3d ago', resolved: true,
    body: 'CI tightened from interim — looks good. Lock when SAP closes.' },
];

window.PMA_EDITOR_SEED = [
  { role: 'ana', mode: 'deep-research', when: '1h ago',
    body: 'Reading Module 5.1. The subgroup claim in ¶ 8 conflicts with SAP scope — that\'s the §5.1 blocker. I drafted a safer phrasing in comments. AE adjudication report attaches today per Maya.' },
];

window.PMA_EDITOR_QUICK = [
  { id: 'pq1', label: 'Draft from CSR §10',                     tool: 'draft_section_from_csr' },
  { id: 'pq2', label: 'Check claim against SAP scope',          tool: 'verify_sap_scope' },
  { id: 'pq3', label: 'Pull adjudication results into §5.3',    tool: 'attach_adjudication' },
  { id: 'pq4', label: 'Generate Module 2 summary from this',    tool: 'generate_summary' },
];

/* ═══════════ CER Editor ═══════════ */
window.CER_EDITOR_PROGRAM = {
  id: 'iv415',
  code: 'IV-415',
  title: 'IV-415 Companion Diagnostic',
  dueLabel: 'NB review · Q1 2026',
};

/* CER follows EU MDR Annex XIV Part A · MEDDEV 2.7/1 rev 4 outline. */
window.CER_EDITOR_SECTIONS = [
  { volume: 'Part A · Scope',
    items: [
      { id: 'cs1', num: '§1', label: 'Scope and device description',          status: 'complete' },
      { id: 'cs2', num: '§2', label: 'Intended purpose and target population', status: 'complete' },
      { id: 'cs3', num: '§3', label: 'Equivalence claim',                     status: 'review' },
    ],
  },
  { volume: 'Part B · Clinical evaluation',
    items: [
      { id: 'cs4', num: '§4', label: 'State-of-the-art analysis',             status: 'complete', words: 5210 },
      { id: 'cs5', num: '§5', label: 'Clinical data summary',                 status: 'draft',    words: 7480 },
      { id: 'cs6', num: '§6', label: 'Safety and risk-benefit',               status: 'draft',    words: 4360, blocker: true },
      { id: 'cs7', num: '§7', label: 'Conformity to GSPR',                    status: 'review' },
    ],
  },
  { volume: 'Part C · Conclusions and PMS',
    items: [
      { id: 'cs8',  num: '§8',  label: 'Conclusions',                         status: 'empty' },
      { id: 'cs9',  num: '§9',  label: 'Post-market surveillance plan',       status: 'draft' },
      { id: 'cs10', num: '§10', label: 'Post-market clinical follow-up plan', status: 'draft' },
    ],
  },
  { volume: 'Annexes',
    items: [
      { id: 'cs11', num: 'A',  label: 'Literature search protocol',           status: 'complete' },
      { id: 'cs12', num: 'B',  label: 'Excluded literature log',              status: 'complete' },
      { id: 'cs13', num: 'C',  label: 'Risk management file cross-reference', status: 'review' },
    ],
  },
];

/* Drafted §6 — Safety and risk-benefit. Cite chips link to FAERS/MAUDE/PubMed
   IDs from CER_SIGNALS — this is the "live dossier" effect: surfaces and the
   document share the same identifiers. */
window.CER_EDITOR_CONTENT = {
  'cs6': {
    id: 'cs6', num: '§6', label: 'Safety and risk-benefit', status: 'draft', wordCount: 4360,
    masthead: [
      { lbl: 'Standard',       val: 'EU MDR Annex XIV Part A · MEDDEV 2.7/1 rev 4' },
      { lbl: 'Signal sources', val: 'FAERS · MAUDE · Eudamed · PubMed (4 incl, 2 review)' },
      { lbl: 'Lit corpus',     val: '2,326 hits · 6-yr window · 412 in 2025' },
      { lbl: 'Last edited',    val: '8 minutes ago · A. Romero' },
    ],
    blocks: [
      { id: 'cb1', kind: 'p', confidence: 0.91,
        prov: { source: 'CER §6 outline + included signals', model: 'Opus 4.5', audit: 'AUD-9301', foot: 'Drafted from CER_SIGNALS (4 included)' },
        spans: [
          { t: 'The safety profile of the IV-415 Companion Diagnostic was evaluated against post-market signals from FAERS, MAUDE, Eudamed, and the published literature, supplemented by adjudicated complaints from internal vigilance. Of seven candidate signals identified during the evaluation window, four were included as relevant (' },
          { cite: 'FR-8812' },
          { t: ', ' },
          { cite: 'FR-8802' },
          { t: ', ' },
          { cite: 'LIT-2241' },
          { t: ', ' },
          { cite: 'LIT-2203' },
          { t: '), one was excluded as non-representative (' },
          { cite: 'FR-8784' },
          { t: '), and two remain under adjudication (' },
          { cite: 'FR-8809' },
          { t: ', ' },
          { cite: 'EU-4412' },
          { t: ').' },
        ],
      },
      { id: 'cb2', kind: 'h2', text: 'Included safety signals' },
      { id: 'cb3', kind: 'table',
        confidence: 0.93,
        prov: { source: 'CER_SIGNALS · status = included', model: 'Sonnet 4.5', audit: 'AUD-9302', foot: 'Synced with CER Workbench Overview' },
        headers: ['Signal', 'Source', 'Severity', 'N', 'Causality assessment'],
        rows: [
          ['FR-8812',  'FAERS',  'serious',     '14', 'Causality assessed · device-related (implant site infection)'],
          ['FR-8802',  'FAERS',  'non-serious', '28', 'Expected · labeling covers (skin irritation)'],
          ['LIT-2241', 'PubMed', 'serious',     '6',  'Literature · 2 cohort studies (late-stage threshold rise)'],
          ['LIT-2203', 'PubMed', 'non-serious', '91', 'Literature · 5 survey studies (patient-reported)'],
        ],
      },
      { id: 'cb4', kind: 'h2', text: 'Risk-benefit determination' },
      { id: 'cb5', kind: 'p', confidence: 0.78,
        flags: [{ kind: 'pending-adjudication', severity: 'warn', msg: 'Two signals under adjudication (FR-8809, EU-4412) may shift conclusion. Re-run risk-benefit on adjudication close.' }],
        prov: { source: 'Risk file RMF-IV415 v3.1 + included signals', model: 'Opus 4.5', audit: 'AUD-9303', foot: 'Pending two adjudications' },
        spans: [
          { t: 'When weighed against the demonstrated clinical benefit (sensitivity 98.4%, specificity 96.1% for EGFR exon-19/21 stratification per ' },
          { cite: '§5.2' },
          { t: '), the residual risks fall within the acceptability thresholds defined in the risk management file (' },
          { cite: 'RMF-IV415 v3.1' },
          { t: '). The most material residual risk — late-stage pacing threshold rise — is mitigated through the labeling and PMCF surveillance plan in §10. No included signal alters the favorable benefit-risk balance.' },
        ],
      },
      { id: 'cb6', kind: 'h2', text: 'Equivalence-derived safety data' },
      { id: 'cb7', kind: 'p', confidence: 0.69,
        flags: [{ kind: 'equivalence-gap', severity: 'err', msg: 'Equivalence to PrecisionPath CDx 3.0 is "Conditional" per §3 — gap narrative on variant scope (28 vs 26) must be cross-referenced here.' }],
        prov: { source: 'CER_EQUIV_MATRIX · eqA verdicts', model: 'Opus 4.5', audit: 'AUD-9304', foot: 'Blocker — see §3' },
        spans: [
          { t: 'Where data on the subject device is sparse, equivalence to PrecisionPath CDx 3.0 (CE-marked 2022) per §3 was used to support the safety profile. PrecisionPath\'s post-market surveillance through 2024 reports a comparable adverse-event spectrum, with no signals attributable to the additional two variants in the IV-415 panel.' },
        ],
      },
      { id: 'cb8', kind: 'h2', text: 'Conclusion' },
      { id: 'cb9', kind: 'p', confidence: 0.84,
        prov: { source: 'Drafted from §6 blocks 1–7', model: 'Opus 4.5', audit: 'AUD-9305', foot: 'Stock closing — refresh when adjudications close' },
        spans: [
          { t: 'On the basis of included signals, equivalence-derived data, and the demonstrated clinical performance, the benefit-risk profile of the IV-415 Companion Diagnostic supports its intended purpose under the conditions of use stated in §2. Residual uncertainty is addressed through the post-market surveillance and PMCF plans in §9 and §10.' },
        ],
      },
    ],
  },
};

window.CER_EDITOR_VALIDATION = {
  'cs6': [
    { id: 'cv1', severity: 'err',  rule: 'CER-§3',    msg: 'Equivalence verdict in §3 is Conditional — §6 must cross-reference the gap narrative.', blockId: 'cb7' },
    { id: 'cv2', severity: 'warn', rule: 'CER-Adj',   msg: 'Two FAERS signals (FR-8809, EU-4412) under adjudication — re-validate on close.', blockId: 'cb5' },
    { id: 'cv3', severity: 'ok',   rule: 'MEDDEV-6.1', msg: 'Signal sources cited (FAERS, MAUDE, Eudamed, PubMed).' },
    { id: 'cv4', severity: 'ok',   rule: 'MEDDEV-6.2', msg: 'Causality assessment provided per signal.' },
    { id: 'cv5', severity: 'ok',   rule: 'MEDDEV-6.3', msg: 'Risk-benefit weighed against measured clinical performance.' },
    { id: 'cv6', severity: 'ok',   rule: 'GSPR-§4',    msg: 'Risk management file cited (RMF-IV415 v3.1).' },
  ],
};

window.CER_EDITOR_COMMENTS = [
  { id: 'cec1', blockId: 'cb7', author: 'Sofia Marchetti', role: 'Author', when: '20m ago', resolved: false,
    body: 'Equivalence gap on variant scope needs explicit handling — NB will not accept the implicit "no signals attributable" claim without a methods footnote.' },
  { id: 'cec2', blockId: 'cb7', author: 'Claude', role: 'Opus 4.5', when: '20m ago', resolved: false, ai: true,
    body: 'Suggested rewrite that adds the methods footnote and links to §3:',
    suggest: { blockId: 'cb7', text: 'Where data on the subject device is sparse, equivalence to PrecisionPath CDx 3.0 (CE-marked 2022) per §3 was used to support the safety profile. The variant-scope gap (IV-415 detects 28 variants vs 26 in PrecisionPath; see §3.4) is addressed through analytical performance data on the two added variants in §5.1 and ongoing PMCF surveillance in §10. With these mitigations, PrecisionPath\'s post-market surveillance through 2024 — reporting a comparable adverse-event spectrum — provides supportive safety evidence within the limits stated in §3.' } },
  { id: 'cec3', blockId: 'cb5', author: 'Maya Patel', role: 'Clinical Lead', when: 'yesterday', resolved: false,
    body: 'When FR-8809 closes (expected this week), please regenerate this paragraph — it shifts the residual-risk count.' },
  { id: 'cec4', blockId: 'cb1', author: 'Jordan Chen', role: 'Lead', when: '4d ago', resolved: true,
    body: 'Signal IDs match Workbench Overview — good. Keep them as live citations so they update when status changes.' },
];

window.CER_EDITOR_SEED = [
  { role: 'ana', mode: 'deep-research', when: '20m ago',
    body: 'Reading §6. The equivalence-derived paragraph (cb7) is the blocker — §3 verdict is Conditional, not Equivalent. I drafted a methods footnote that closes the gap. Two signals are still under adjudication — I\'ll watch and re-trigger §6 when they close.' },
];

window.CER_EDITOR_QUICK = [
  { id: 'cq1', label: 'Sync signals from CER Workbench',         tool: 'sync_cer_signals' },
  { id: 'cq2', label: 'Cross-reference equivalence gap to §3',   tool: 'link_equivalence_gap' },
  { id: 'cq3', label: 'Pull GSPR §7 conformity into §6',         tool: 'pull_gspr' },
  { id: 'cq4', label: 'Draft conclusion (§8) from this section', tool: 'draft_conclusion' },
];
