/* global */

/* Artifact content — each section is a structured doc the artifact pane renders.
   Paragraphs carry provenance (source, model, confidence 0..1).
   Confidence drives the left-gutter color intensity. */

const ARTIFACTS = {
  '2.5': {
    path: '2.5',
    title: 'Clinical overview',
    module: 'Module 2 — Common technical document summaries',
    version: 'v0.4',
    lastEditedBy: 'AnA 1.0',
    lastEdited: '2 sec ago',
    masthead: [
      { lbl: 'Application', val: 'NDA 212345' },
      { lbl: 'Sponsor',     val: 'Concept2Cure Bio' },
      { lbl: 'Module',      val: '2.5 Clinical overview' },
      { lbl: 'Version',     val: 'v0.4 · draft' },
    ],
    blocks: [
      { kind: 'h2', text: '2.5.1  Product development rationale' },
      { kind: 'p',  id: 'p1', confidence: 0.94, prov: { source: 'Protocol-001 §1.2', model: 'AnA 1.0', audit: 'c2c-A9C21', foot: '21 CFR Part 11 · signed artifact' },
        spans: [
          { t: 'BX-204 is a humanized IgG1κ monoclonal antibody directed against the extracellular domain of receptor tyrosine kinase X, developed for the treatment of advanced or metastatic solid tumors with confirmed RTK-X overexpression.' },
          { cite: 'Protocol §1.2' },
        ] },
      { kind: 'p',  id: 'p2', confidence: 0.88, prov: { source: 'CSR-099 §10.3', model: 'AnA 1.0', audit: 'c2c-B4A02', foot: 'RIM precedent: FDA 2023 bridging guidance' },
        spans: [
          { t: 'The Phase I first-in-human study (BX204-101) established tolerability and identified the recommended Phase II dose of 12 mg/kg administered intravenously every three weeks,' },
          { cite: 'CSR-099' },
          { t: ' supported by population-PK modeling in the target population.' },
        ] },

      { kind: 'h2', text: '2.5.4  Overview of efficacy' },
      { kind: 'p',  id: 'p3', confidence: 0.96, prov: { source: 'CSR-201 §7.1', model: 'AnA 1.0', audit: 'c2c-C7E19', foot: 'Cross-cited in Module 5.3.5' },
        spans: [
          { t: 'Efficacy was evaluated in the pivotal Phase II study (BX204-201), an open-label, single-arm trial in 184 patients with RTK-X–positive advanced solid tumors who had progressed on at least one prior line of systemic therapy.' },
          { cite: 'CSR-201' },
          { t: ' The primary endpoint was objective response rate (ORR) by blinded independent central review.' },
        ] },

      { kind: 'table',
        head: ['Endpoint', 'BX-204 (n=184)', 'Historical control', 'Result'],
        rows: [
          ['Objective response rate',        '38.6% (95% CI 31.5–46.0)', '14% (pooled, 2019–2023)', { pill: 'ok',   text: 'Met' }],
          ['Median duration of response',    '11.8 mo (95% CI 8.9–NE)',  '4.2 mo',                   { pill: 'ok',   text: 'Met' }],
          ['Median progression-free survival','6.4 mo (95% CI 5.1–8.2)', '2.9 mo',                   { pill: 'ok',   text: 'Met' }],
          ['Overall survival (interim)',     'NR (min follow-up 9 mo)',   '—',                        { pill: 'warn', text: 'Immature' }],
        ] },

      { kind: 'p', id: 'p4', confidence: 0.91, prov: { source: 'SAP §9.4, RIM-0.87', model: 'AnA 1.0', audit: 'c2c-D2F88', foot: 'Precedent match: 0.87 (RIM)' },
        spans: [
          { t: 'The observed ORR of 38.6% exceeds the pre-specified threshold of 25% derived from pooled historical controls, and the treatment effect is consistent across pre-specified subgroups including prior lines of therapy, ECOG status, and RTK-X expression level.' },
          { cite: 'SAP §9.4' },
          { t: ' The regulatory precedent for accelerated approval in this setting is established by ' },
          { cite: 'EMEA/H/C/005612' },
          { t: ' and supported by the FDA 2023 bridging guidance.' },
        ] },
    ],
  },

  '2.3': {
    path: '2.3',
    title: 'Quality overall summary',
    module: 'Module 2 — Common technical document summaries',
    version: 'v0.3',
    lastEditedBy: 'AnA 1.0',
    lastEdited: '14 min ago',
    masthead: [
      { lbl: 'Application', val: 'NDA 212345' },
      { lbl: 'Sponsor',     val: 'Concept2Cure Bio' },
      { lbl: 'Module',      val: '2.3 Quality overall summary' },
      { lbl: 'Version',     val: 'v0.3 · in review' },
    ],
    blocks: [
      { kind: 'h2', text: '2.3.S  Drug substance' },
      { kind: 'p', id: 'q1', confidence: 0.92, prov: { source: 'Module 3.2.S.1', model: 'AnA 1.0', audit: 'c2c-Q1A77', foot: 'Cross-linked with CMC Module 3.2.S' },
        spans: [
          { t: 'The drug substance, BX-204, is a recombinant humanized IgG1κ monoclonal antibody produced by fed-batch mammalian cell culture using a proprietary CHO-K1 host cell line, followed by a three-step chromatography purification train and two orthogonal viral clearance steps.' },
          { cite: '3.2.S.2.2' },
        ] },
      { kind: 'p', id: 'q2', confidence: 0.85, prov: { source: 'Stability report SR-204-2024', model: 'AnA 1.0', audit: 'c2c-Q2B15', foot: 'Stability commitment per ICH Q1A(R2)' },
        spans: [
          { t: 'Long-term stability studies at 2–8 °C support a proposed shelf life of 24 months based on 18 months of primary stability data and supporting accelerated data at 25 °C / 60% RH.' },
          { cite: 'SR-204-2024' },
        ] },
      { kind: 'h2', text: '2.3.P  Drug product' },
      { kind: 'p', id: 'q3', confidence: 0.79, prov: { source: 'Module 3.2.P.3', model: 'AnA 1.0', audit: 'c2c-Q3C09', foot: 'Medium confidence — container-closure study still enrolling' },
        spans: [
          { t: 'The drug product is supplied as a sterile, preservative-free liquid formulation in single-dose Type-I glass vials containing 20 mg/mL BX-204 at a target fill volume of 5.0 mL, closed with a chlorobutyl stopper and aluminum flip-off seal.' },
          { cite: '3.2.P.3.2' },
        ] },
    ],
  },

  '3.2.S': {
    path: '3.2.S',
    title: 'Drug substance',
    module: 'Module 3 — Quality (CMC)',
    version: 'v0.2',
    lastEditedBy: 'AnA 1.0',
    lastEdited: '1 hour ago',
    masthead: [
      { lbl: 'Application', val: 'NDA 212345' },
      { lbl: 'Sponsor',     val: 'Concept2Cure Bio' },
      { lbl: 'Module',      val: '3.2.S Drug substance' },
      { lbl: 'Version',     val: 'v0.2 · draft' },
    ],
    blocks: [
      { kind: 'h2', text: '3.2.S.1  General information' },
      { kind: 'p', id: 's1', confidence: 0.97, prov: { source: 'IND 187432', model: 'AnA 1.0', audit: 'c2c-S1A03', foot: 'Identity carried forward from IND' },
        spans: [
          { t: 'Nonproprietary name: BX-204. Proprietary name (proposed): pending. International Nonproprietary Name: rotuxizumab. CAS Registry Number: 2387451-22-9.' },
        ] },
      { kind: 'h2', text: '3.2.S.2  Manufacture' },
      { kind: 'p', id: 's2', confidence: 0.88, prov: { source: 'Batch records BR-204-2024-Q1', model: 'AnA 1.0', audit: 'c2c-S2B48', foot: 'Master cell bank fully characterized' },
        spans: [
          { t: 'BX-204 is manufactured at the Concept2Cure Bio Raleigh facility using a 2000-L fed-batch bioreactor, a master cell bank (MCB) qualified per ICH Q5A/Q5D, and a working cell bank (WCB) released to predefined acceptance criteria.' },
          { cite: '3.2.S.2.3' },
        ] },
      { kind: 'p', id: 's3', confidence: 0.74, prov: { source: 'Process validation PV-204-R2', model: 'AnA 1.0', audit: 'c2c-S3C91', foot: 'Low confidence — PPQ runs 2 of 3 complete' },
        spans: [
          { t: 'Process performance qualification (PPQ) is proposed across three consecutive at-scale runs to demonstrate reproducible performance; two of three runs are complete with all CQAs within established acceptance criteria.' },
          { cite: 'PV-204-R2' },
        ] },
    ],
  },
};

window.ARTIFACTS = ARTIFACTS;
