/**
 * Cardiometabolic biomarker scientific-validity corpus.
 *
 * Extends the oncology / CNS / immunology corpora into cardiology, metabolic
 * disease, and cardiovascular risk — the third therapeutic-area expansion. Same
 * KnowledgeEntry schema and citation discipline: each entry documents the
 * analyte → clinical-condition association with established intended uses, the
 * guideline/consensus backing, and the assay/interpretation specifics that make
 * scientific validity intended-use specific.
 *
 * Coverage: high-sensitivity troponin (acute MI), natriuretic peptides
 * (heart failure), HbA1c (diabetes diagnosis/monitoring), LDL-cholesterol
 * (ASCVD risk / statin target), lipoprotein(a) (independent genetic risk),
 * hs-CRP (residual inflammatory risk), and the eGFR / urine ACR pair (chronic
 * kidney disease staging — the cardio-renal-metabolic hinge).
 */

import type { KnowledgeEntry } from '../types';

export const BIOMARKER_VALIDITY_CARDIOMETABOLIC_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'bio.cm.hs-troponin',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'High-sensitivity cardiac troponin — acute myocardial infarction',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'High-sensitivity cardiac troponin (hs-cTn) is the preferred biomarker for diagnosing acute myocardial infarction, interpreted against the 99th-percentile upper reference limit with a rising/falling pattern on serial testing and validated rapid (0/1-h or 0/2-h) rule-out/rule-in algorithms.',
    detail:
      'Cardiac troponin (I or T) is the most specific and sensitive blood marker of myocardial injury and is central to the Fourth Universal Definition of Myocardial Infarction. High-sensitivity assays detect troponin in most healthy people, so interpretation hinges on (1) the assay- and sex-specific 99th-percentile upper reference limit and (2) a dynamic change (rise and/or fall) on serial sampling, which distinguishes acute injury from chronic elevation. Guideline-endorsed rapid algorithms (ESC 0/1-h and 0/2-h) use absolute change thresholds to rule out and rule in MI quickly in the emergency setting. Scientific validity is for *myocardial injury*, which is not synonymous with MI: troponin rises in heart failure, renal failure, sepsis, and myocarditis (type-2 MI / non-ischaemic injury), so a positive result must be read with the clinical context and ECG. Values and cut-offs are assay-specific and not interchangeable.',
    keyPoints: [
      'Preferred marker for acute MI (Fourth Universal Definition).',
      'Interpret against the assay- and sex-specific 99th-percentile URL with a rising/falling pattern.',
      'Validated rapid 0/1-h and 0/2-h ESC algorithms for ED rule-out/rule-in.',
      'Marks myocardial injury, not only MI — also raised in HF, renal failure, sepsis, myocarditis.',
    ],
    pitfalls: [
      'Reading a single elevated value as MI without a dynamic change or clinical context.',
      'Transferring cut-offs / algorithms across non-equivalent hs-cTn assays.',
    ],
    citations: [
      { label: 'Fourth Universal Definition of Myocardial Infarction', source: 'consensus' },
      { label: 'ESC 0/1-h and 0/2-h hs-cTn algorithms', source: 'ESC' },
    ],
    related: ['bio.cm.natriuretic-peptides', 'sci.ivd.scientific-validity'],
    tags: ['troponin', 'hs-ctn', 'myocardial-infarction', 'acs', 'esc', 'cardiometabolic', 'cardiology'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cm.natriuretic-peptides',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Natriuretic peptides (BNP / NT-proBNP) — heart failure',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'BNP and NT-proBNP reflect myocardial wall stress and are guideline-recommended for ruling out heart failure (high negative predictive value), supporting diagnosis, and prognosis — with age-adjusted thresholds and important confounders (renal function, obesity, atrial fibrillation, sacubitril/valsartan).',
    detail:
      'B-type natriuretic peptide (BNP) and the N-terminal prohormone (NT-proBNP) are released in response to ventricular wall stress and are the principal biomarkers in heart failure. Their strongest scientific validity is the high negative predictive value: a low level effectively rules out HF in patients with dyspnoea, while elevated levels support the diagnosis and carry independent prognostic weight. Thresholds are age-adjusted (NT-proBNP rises with age) and context-specific (acute vs chronic / ambulatory). Key confounders shift interpretation: levels rise with renal impairment, atrial fibrillation, and age, and fall with obesity (lower levels at any given filling pressure). A crucial assay caveat: the neprilysin inhibitor sacubitril/valsartan raises BNP (a neprilysin substrate) but not NT-proBNP — so NT-proBNP is preferred for monitoring patients on that therapy.',
    keyPoints: [
      'Reflect ventricular wall stress; strongest use is HF rule-out (high NPV) plus diagnosis and prognosis.',
      'Age-adjusted thresholds; acute vs chronic cut-offs differ.',
      'Confounders: ↑ with renal impairment / AF / age, ↓ with obesity.',
      'Sacubitril/valsartan raises BNP but not NT-proBNP — use NT-proBNP on that therapy.',
    ],
    pitfalls: [
      'Ignoring obesity (falsely low) or renal impairment / AF (falsely high) when interpreting.',
      'Monitoring BNP (not NT-proBNP) in patients on sacubitril/valsartan.',
    ],
    citations: [
      { label: 'ESC / ACC-AHA heart failure guidelines (natriuretic peptides)', source: 'consensus' },
      { label: 'PARADIGM-HF / neprilysin-inhibitor BNP vs NT-proBNP literature', source: 'literature' },
    ],
    related: ['bio.cm.hs-troponin', 'bio.cm.egfr-acr', 'sci.ivd.scientific-validity'],
    tags: ['bnp', 'nt-probnp', 'heart-failure', 'natriuretic-peptide', 'sacubitril-valsartan', 'cardiometabolic', 'cardiology'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cm.hba1c',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'HbA1c — diabetes diagnosis and glycaemic monitoring',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Glycated haemoglobin (HbA1c) reflects average glycaemia over ~2–3 months and is a standardised (IFCC/NGSP) diagnostic threshold (≥6.5%) and the principal monitoring target for diabetes — with well-defined conditions (haemoglobinopathies, altered red-cell turnover) that invalidate it.',
    detail:
      'HbA1c integrates blood glucose exposure over the ~120-day red-cell lifespan and is both a diagnostic test (≥6.5% / 48 mmol/mol, on a standardised assay, confirmed) and the cornerstone monitoring measure for glycaemic control. Standardisation to the IFCC reference and NGSP alignment makes results comparable across laboratories — a prerequisite for using a fixed diagnostic cut-off. Scientific validity depends on normal red-cell kinetics: it is unreliable (falsely low or high) in haemoglobinopathies and haemoglobin variants, haemolysis, recent transfusion, iron-deficiency anaemia, pregnancy, and chronic kidney disease — where direct glucose measures or fructosamine are preferred. It reflects *average* glycaemia and misses variability and hypoglycaemia, so it complements rather than replaces glucose monitoring / CGM-derived metrics (e.g., time-in-range).',
    keyPoints: [
      'Reflects ~2–3-month average glycaemia; diagnostic at ≥6.5% (standardised, confirmed).',
      'IFCC/NGSP standardisation enables a fixed cross-lab cut-off.',
      'Invalidated by haemoglobinopathies, altered RBC turnover, transfusion, pregnancy, CKD.',
      'Misses glycaemic variability and hypoglycaemia — complements glucose/CGM metrics.',
    ],
    pitfalls: [
      'Using HbA1c diagnostically where red-cell kinetics are abnormal.',
      'Treating a target HbA1c as capturing variability or hypoglycaemia risk.',
    ],
    citations: [
      { label: 'ADA Standards of Care / WHO HbA1c diagnostic criteria', source: 'consensus' },
      { label: 'IFCC/NGSP HbA1c standardisation', source: 'IFCC' },
    ],
    related: ['bio.cm.ldl', 'bio.cm.egfr-acr', 'sci.ivd.scientific-validity'],
    tags: ['hba1c', 'diabetes', 'glycaemic-control', 'ifcc', 'ngsp', 'cardiometabolic', 'metabolic'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cm.ldl',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'LDL-cholesterol (and apoB) — ASCVD risk and lipid-lowering target',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'LDL-cholesterol is the central causal, guideline-defined treatment target for atherosclerotic cardiovascular disease risk; apolipoprotein B (apoB) counts atherogenic particles and is a more accurate target in high-triglyceride / diabetic / metabolic-syndrome states where calculated LDL-C underestimates risk.',
    detail:
      'A large body of genetic and trial evidence establishes LDL-cholesterol as causal in atherosclerotic cardiovascular disease (ASCVD), and guidelines define LDL-C goals that scale with risk (lower for higher-risk patients), achieved with statins, ezetimibe, and PCSK9-pathway therapies. Scientific validity as a target is strong, with caveats about measurement: the commonly *calculated* LDL-C (Friedewald and newer equations) loses accuracy at high triglycerides and low LDL-C, where direct LDL-C or — better — apolipoprotein B is preferred. ApoB counts the number of atherogenic (LDL/VLDL/Lp(a)) particles and is a more accurate risk marker and target than LDL-C in discordant states (hypertriglyceridaemia, diabetes, metabolic syndrome), where particle number and cholesterol content diverge. Non-HDL-cholesterol is a practical, non-fasting alternative that captures all atherogenic lipoproteins.',
    keyPoints: [
      'LDL-C is causal in ASCVD and the central, risk-stratified treatment target.',
      'Calculated LDL-C is inaccurate at high triglycerides / low LDL-C — use direct LDL-C or apoB.',
      'apoB (atherogenic particle count) is a better target in hypertriglyceridaemia / diabetes / metabolic syndrome.',
      'Non-HDL-C is a practical non-fasting alternative capturing all atherogenic lipoproteins.',
    ],
    pitfalls: [
      'Relying on calculated LDL-C in hypertriglyceridaemia or at very low LDL-C.',
      'Missing residual particle risk by not measuring apoB in discordant metabolic states.',
    ],
    citations: [
      { label: 'ESC/EAS and ACC/AHA lipid guidelines (LDL-C goals)', source: 'consensus' },
      { label: 'apoB vs LDL-C discordance literature', source: 'literature' },
    ],
    related: ['bio.cm.lpa', 'bio.cm.hscrp', 'sci.ivd.scientific-validity'],
    tags: ['ldl', 'ldl-cholesterol', 'apob', 'non-hdl', 'ascvd', 'statin', 'pcsk9', 'cardiometabolic', 'lipids'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cm.lpa',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'Lipoprotein(a) — independent genetic cardiovascular risk',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Lipoprotein(a) [Lp(a)] is a largely genetically determined, lifelong-stable independent risk factor for ASCVD and aortic stenosis; guidelines recommend measuring it once in adults to refine risk, with reporting in nmol/L (particle concentration) preferred over mg/dL.',
    detail:
      'Lipoprotein(a) is an LDL-like particle with apolipoprotein(a); its plasma level is ~70–90% genetically determined, stable across life, and largely unaffected by lifestyle or statins. Mendelian-randomisation and epidemiological evidence support it as an independent, causal risk factor for atherosclerotic cardiovascular disease and calcific aortic valve stenosis. Scientific validity is as a once-in-a-lifetime risk-refinement measurement (most guidelines now recommend measuring Lp(a) at least once in adulthood), identifying a high-risk group for intensified management of modifiable risk and, prospectively, for emerging Lp(a)-lowering therapeutics in trials. A key assay caveat: apo(a) is highly size-polymorphic (variable kringle-IV repeats), so mass-based mg/dL assays are isoform-sensitive and biased; molar nmol/L assays that count particles independent of size are preferred, and results/thresholds are not interchangeable across methods.',
    keyPoints: [
      '~70–90% genetically determined, lifelong-stable; independent causal ASCVD + aortic-stenosis risk.',
      'Guidelines recommend measuring once in adulthood to refine risk.',
      'Largely unaffected by lifestyle and statins; Lp(a)-lowering agents are in trials.',
      'Report in nmol/L (particle count); mg/dL mass assays are isoform-biased and not interchangeable.',
    ],
    pitfalls: [
      'Comparing mg/dL and nmol/L results or thresholds across methods.',
      'Expecting statins/lifestyle to meaningfully lower Lp(a).',
    ],
    citations: [
      { label: 'EAS / guideline consensus on Lp(a) measurement and risk', source: 'consensus' },
      { label: 'Lp(a) Mendelian-randomisation causal evidence', source: 'literature' },
    ],
    related: ['bio.cm.ldl', 'sci.ivd.scientific-validity'],
    tags: ['lipoprotein-a', 'lp(a)', 'ascvd', 'aortic-stenosis', 'genetic-risk', 'cardiometabolic', 'lipids'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cm.hscrp',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'High-sensitivity CRP — residual inflammatory cardiovascular risk',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'High-sensitivity C-reactive protein (hs-CRP) marks low-grade vascular inflammation and refines cardiovascular risk and treatment response (it identified the population that benefited from anti-inflammatory therapy in CANTOS), but is non-specific and must be measured away from acute infection/inflammation.',
    detail:
      'High-sensitivity CRP quantifies low-grade systemic inflammation and adds independent information to lipid-based cardiovascular risk assessment. Its scientific validity is for *residual inflammatory risk*: elevated hs-CRP despite controlled LDL-C identifies patients with ongoing inflammatory atherosclerosis, and the concept was validated when anti-inflammatory therapy (canakinumab in CANTOS; and supportively, low-dose colchicine trials) reduced events in this group — establishing inflammation as a modifiable cardiovascular target. The major limitation is non-specificity: CRP is an acute-phase reactant that rises with any infection, injury, or inflammatory disease, so a cardiovascular-risk measurement must be taken in a stable state, ideally as the average of two readings, and a markedly elevated value should prompt a search for acute causes rather than be ascribed to vascular risk. It complements, not replaces, lipid and clinical risk assessment.',
    keyPoints: [
      'Marks low-grade vascular inflammation; adds independent CV risk information beyond lipids.',
      'Identifies residual inflammatory risk; the CANTOS population that benefited from anti-inflammatory therapy.',
      'Non-specific acute-phase reactant — measure in a stable state, average two readings.',
      'Complements, does not replace, lipid and clinical risk assessment.',
    ],
    pitfalls: [
      'Measuring hs-CRP during intercurrent infection/inflammation and ascribing it to CV risk.',
      'Using a single reading rather than the average of two stable-state values.',
    ],
    citations: [
      { label: 'CANTOS (canakinumab) and residual-inflammatory-risk literature', source: 'literature' },
      { label: 'AHA/CDC scientific statement on hs-CRP in CV risk', source: 'consensus' },
    ],
    related: ['bio.cm.ldl', 'sci.ivd.scientific-validity'],
    tags: ['hs-crp', 'crp', 'inflammation', 'residual-risk', 'cantos', 'cardiometabolic', 'cardiology'],
    lastReviewed: '2026-06-12',
  },
  {
    id: 'bio.cm.egfr-acr',
    domain: 'scientific',
    topic: 'biomarker-validity',
    title: 'eGFR + urine albumin-creatinine ratio — chronic kidney disease (cardio-renal-metabolic)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Estimated GFR (from creatinine and/or cystatin C) and the urine albumin-creatinine ratio (uACR) jointly stage chronic kidney disease (KDIGO G and A categories) and are powerful, independent predictors of cardiovascular and renal outcomes — the hinge of cardio-renal-metabolic risk.',
    detail:
      'Chronic kidney disease is staged on two axes: glomerular filtration rate, estimated from serum creatinine (and increasingly cystatin C, which avoids muscle-mass bias and is recommended for confirmation), and albuminuria, measured as the urine albumin-creatinine ratio. The KDIGO heatmap combines GFR (G1–G5) and albuminuria (A1–A3) categories to stage CKD and stratify risk. Scientific validity is strong and dual: these markers define and stage CKD *and* are independent predictors of cardiovascular events, heart failure, and mortality — uACR in particular is an early, modifiable marker that predicts outcomes even within the normal-GFR range, making this pair the operational hinge of cardio-renal-metabolic medicine (it defines eligibility and monitoring for SGLT2 inhibitors and other organ-protective therapies). Key caveats: race-free creatinine equations are now standard; a single eGFR can be confounded (acute changes, muscle mass, diet), so CKD requires chronicity (≥3 months); and uACR should be confirmed (spot-sample variability) and read with the clinical context.',
    keyPoints: [
      'eGFR (creatinine ± cystatin C) + uACR jointly stage CKD on the KDIGO G/A heatmap.',
      'Independent predictors of cardiovascular and renal outcomes — uACR predicts even at normal GFR.',
      'Operational hinge for organ-protective therapy (e.g. SGLT2 inhibitors) eligibility/monitoring.',
      'Race-free equations standard; require chronicity (≥3 months); confirm uACR (spot variability).',
    ],
    pitfalls: [
      'Diagnosing CKD from a single eGFR without confirming chronicity.',
      'Relying on creatinine eGFR alone where cystatin C confirmation is indicated; not confirming uACR.',
    ],
    citations: [
      { label: 'KDIGO CKD evaluation and staging guideline', source: 'KDIGO' },
      { label: 'Race-free eGFR equations (creatinine / cystatin C)', source: 'consensus' },
    ],
    related: ['bio.cm.hba1c', 'bio.cm.natriuretic-peptides', 'sci.ivd.scientific-validity'],
    tags: ['egfr', 'uacr', 'albuminuria', 'ckd', 'cystatin-c', 'kdigo', 'cardio-renal', 'sglt2', 'cardiometabolic'],
    lastReviewed: '2026-06-12',
  },
];
