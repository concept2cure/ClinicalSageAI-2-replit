/**
 * Dossier spines -- the FULL document architecture per client type.
 * Verbatim from kit dossier-data.jsx.
 *
 *   pharma / biotech  -> ICH eCTD (CTD Modules 1-5)
 *   medtech           -> FDA eSTAR (510k) + EU MDR Annex II/III + global markets
 *   diagnostics (IVD) -> EU IVDR Annex II/III + FDA + global markets
 *
 * Grounded in: ICH M4 (CTD), 21 CFR 807 eSTAR, EU MDR 2017/745 Annex II/III,
 * EU IVDR 2017/746 Annex II/III + XIII, MDSAP, ISO 13485 / 14971.
 */

/* -- Document leaf -- */
export interface DossierDoc {
  id: string;
  num: string;
  title: string;
  type: string;
  status: string;
  pct: number;
  owner: string;
  ver: string;
  updated: string;
  preview: string;
  blocker?: boolean;
  flag?: string;
}

/* -- Folder node (may nest) -- */
export interface DossierFolder {
  id: string;
  code: string;
  label: string;
  children: DossierNode[];
}

export type DossierNode = DossierDoc | DossierFolder;

export interface DossierSpine {
  program: string;
  spine: string;
  standard: string;
  tree: DossierNode[];
}

/** Type guard: a node is a leaf (doc) if it has no children array. */
export function isLeaf(n: DossierNode): n is DossierDoc {
  return !('children' in n);
}

/** Flatten a tree to its leaf documents. */
export function flattenDocs(tree: DossierNode[]): DossierDoc[] {
  const out: DossierDoc[] = [];
  function walk(ns: DossierNode[]) {
    ns.forEach((n) => {
      if (isLeaf(n)) out.push(n);
      else walk(n.children);
    });
  }
  walk(tree);
  return out;
}

/** Find the folder-id path from root to a given leaf id. */
export function pathTo(tree: DossierNode[], id: string, acc: string[] = []): string[] | null {
  for (const n of tree) {
    if (n.id === id) return [...acc];
    if (!isLeaf(n)) {
      const r = pathTo(n.children, id, [...acc, n.id]);
      if (r) return r;
    }
  }
  return null;
}

/** Roll-up stats for a node (leaf count + avg pct). */
export function rollup(node: DossierNode): { n: number; pct: number } {
  const ds = isLeaf(node) ? [node] : flattenDocs((node as DossierFolder).children);
  const pct = Math.round(ds.reduce((a, d) => a + (d.pct || 0), 0) / (ds.length || 1));
  return { n: ds.length, pct };
}

/* -- Helper to build doc leaves concisely -- */
function doc(
  id: string, num: string, title: string, type: string, status: string,
  pct: number, owner: string, ver: string, updated: string, preview: string,
  extra?: Partial<DossierDoc>,
): DossierDoc {
  return { id, num, title, type, status, pct, owner, ver, updated, preview, ...extra };
}

/* ---- BIOTECH (eCTD) ---- */
const BIOTECH_SPINE: DossierSpine = {
  program: 'BX-204 — BLA 761123',
  spine: 'eCTD v4.0 · ICH CTD',
  standard: 'eCTD',
  tree: [
    {
      id: 'm1', code: 'Module 1', label: 'Administrative & prescribing (regional)', children: [
        doc('d11', '1.1', 'Form FDA 356h', 'Form', 'final', 100, 'J. Chen', 'v3.0', '2d ago', 'Application to market a biologic — BX-204 (RTK-X mAb), BLA 761123, accelerated approval.'),
        doc('d114', '1.14.1', 'Draft prescribing information (USPI)', 'Labeling', 'review', 78, 'A. Müller', 'v0.8', '4h ago', 'HIGHLIGHTS OF PRESCRIBING INFORMATION — BX-204 injection. Indicated for advanced RTK-X–overexpressing solid tumors.'),
        doc('d19', '1.9', 'Pediatric study plan (iPSP)', 'Plan', 'draft', 40, 'Reg', 'v0.4', '1d ago', 'Initial Pediatric Study Plan per PREA. Deferral requested for ages 0–11.'),
        doc('d115', '1.15', 'Risk management plan / REMS assessment', 'Plan', 'draft', 30, 'PV', 'v0.3', '3d ago', 'REMS not proposed; routine pharmacovigilance with targeted follow-up of immunogenicity.'),
      ],
    },
    {
      id: 'm2', code: 'Module 2', label: 'CTD summaries', children: [
        doc('d21', '2.1', 'CTD table of contents', 'TOC', 'final', 100, 'Reg', 'v1.0', '1w ago', 'Comprehensive table of contents across Modules 2–5.'),
        doc('d23', '2.3', 'Quality overall summary (QOS)', 'Summary', 'draft', 55, 'M. Webb', 'v0.5', '1d ago', 'BX-204 drug substance is a humanized IgG1κ mAb produced in CHO cells; drug product is a lyophilized powder.'),
        doc('d24', '2.4', 'Nonclinical overview', 'Summary', 'draft', 50, 'Nonclin', 'v0.4', '4d ago', 'Integrated nonclinical pharmacology, PK and toxicology overview supporting first-in-human and pivotal dosing.'),
        doc('d25', '2.5', 'Clinical overview', 'Summary', 'review', 82, 'A. Müller', 'v0.9', '2h ago', 'The clinical development program comprises one pivotal study (BX204-201) and one dose-finding study (BX204-102). ORR 42.1% (95% CI 35.8–48.6).', { blocker: true }),
        doc('d271', '2.7.1', 'Summary of biopharmaceutic studies', 'Summary', 'draft', 38, 'Biostat', 'v0.3', '3d ago', 'Population-PK bridge between the bridging and pivotal formulations.'),
        doc('d273', '2.7.3', 'Summary of clinical efficacy', 'Summary', 'draft', 44, 'A. Müller', 'v0.4', '3d ago', 'Integrated efficacy across the BX-204 program.'),
        doc('d274', '2.7.4', 'Summary of clinical safety', 'Summary', 'draft', 36, 'PV', 'v0.3', '5d ago', 'Integrated safety; immunogenicity and infusion reactions characterized.'),
      ],
    },
    {
      id: 'm3', code: 'Module 3', label: 'Quality (CMC)', children: [
        {
          id: 'm3s', code: '3.2.S', label: 'Drug substance', children: [
            doc('d32s2', '3.2.S.2', 'Manufacture', 'CMC', 'draft', 58, 'M. Webb', 'v0.5', '3d ago', 'CHO cell culture, harvest, and multi-step chromatography purification process.'),
            doc('d32s4', '3.2.S.4', 'Control of drug substance', 'CMC', 'review', 70, 'M. Webb', 'v0.7', '5h ago', 'Specifications: identity, purity, potency, impurities. Comparability protocol for pre/post process-change lots.', { flag: 'Comparability acceptance criteria unreconciled vs 3 post-change lots' }),
          ],
        },
        {
          id: 'm3p', code: '3.2.P', label: 'Drug product', children: [
            doc('d32p5', '3.2.P.5', 'Control of drug product', 'CMC', 'draft', 52, 'M. Webb', 'v0.4', '4d ago', 'Release and shelf-life specifications for the lyophilized drug product.'),
            doc('d32p8', '3.2.P.8', 'Stability', 'CMC', 'draft', 60, 'M. Webb', 'v0.6', '2d ago', 'Long-term (5°C) and accelerated (25°C) stability support a provisional 24-month shelf life.'),
          ],
        },
      ],
    },
    {
      id: 'm4', code: 'Module 4', label: 'Nonclinical study reports', children: [
        doc('d423', '4.2.3', 'Toxicology — repeat-dose', 'Study report', 'approved', 100, 'Nonclin', 'v1.0', '2w ago', '13-week repeat-dose toxicology in cynomolgus monkeys; NOAEL 30 mg/kg/week.'),
        doc('d422', '4.2.2', 'Pharmacokinetics', 'Study report', 'approved', 100, 'Nonclin', 'v1.0', '3w ago', 'ADME and TK across species supporting human dose projection.'),
      ],
    },
    {
      id: 'm5', code: 'Module 5', label: 'Clinical study reports', children: [
        doc('d5351', '5.3.5.1', 'CSR — BX204-201 (pivotal)', 'CSR', 'approved', 100, 'Clin', 'v1.0', '1w ago', 'Single-arm pivotal study (n=214). Primary endpoint ORR 42.1% (95% CI 35.8–48.6). Data lock 18 Apr 2026.'),
        doc('d5353', '5.3.5.3', 'Integrated summary of safety (ISS)', 'Summary', 'draft', 35, 'Biostat', 'v0.3', '3d ago', 'Pooled safety across BX204-201 and -102 at the RP2D (n=176 combined).'),
        doc('d5352', '5.3.5.2', 'Integrated summary of efficacy (ISE)', 'Summary', 'draft', 32, 'Biostat', 'v0.3', '4d ago', 'Integrated efficacy analysis across the development program.'),
      ],
    },
  ],
};

/* ---- MEDTECH (eSTAR + MDR + global) ---- */
const MEDTECH_SPINE: DossierSpine = {
  program: 'Aurora CGM System — global device dossier',
  spine: 'FDA eSTAR · EU MDR Annex II/III · global',
  standard: 'multi',
  tree: [
    {
      id: 'fda', code: 'FDA', label: '510(k) — eSTAR (United States)', children: [
        {
          id: 'fda-admin', code: 'Admin', label: 'Administrative', children: [
            doc('k1', '510K.1', 'Cover letter', 'Narrative', 'complete', 100, 'RA', 'v2.0', '2d ago', '510(k) cover letter — applicant, device trade name, predicate, submission purpose. Per 21 CFR 807.87.'),
            doc('k-3514', '—', 'Form FDA 3514 — CDRH cover sheet', 'Form', 'complete', 100, 'RA', 'v1.0', '2d ago', 'CDRH Premarket Review Submission Cover Sheet.'),
            doc('k2', '510K.2', 'Indications for use (Form FDA 3881)', 'Form', 'complete', 100, 'RA', 'v1.0', '3d ago', 'Indications for Use statement — device name, indications, population, OTC/Rx.'),
            doc('k-truth', '—', 'Truthful & accuracy statement', 'Form', 'complete', 100, 'RA', 'v1.0', '3d ago', 'Truthful and Accuracy statement per 21 CFR 807.87(k).'),
          ],
        },
        doc('k3', '510K.3', '510(k) summary', 'Narrative', 'draft', 62, 'RA', 'v0.6', '3h ago', 'Device description, predicate comparison, technological characteristics and SE conclusions. Per 21 CFR 807.92.'),
        doc('k4', '510K.4', 'Device description', 'Mixed', 'complete', 100, 'Eng', 'v1.2', '1d ago', 'Physical description, principles of operation, materials, components, sterilization.'),
        doc('k5', '510K.5', 'Substantial equivalence comparison', 'Table', 'draft', 70, 'RA', 'v0.7', '3m ago', 'SE comparison vs predicate K221847 — intended use, technology, performance. Per 21 CFR 807.87(f).', { blocker: true }),
        {
          id: 'fda-perf', code: 'Performance', label: 'Performance testing', children: [
            doc('k6', '510K.6', 'Bench performance', 'Mixed', 'draft', 65, 'Eng', 'v0.6', '2d ago', 'Accuracy (MARD 8.2%), sensor life, alarms. Test objectives, methods, acceptance, results.'),
            doc('k7', '510K.7', 'Biocompatibility (ISO 10993)', 'Mixed', 'not_started', 0, 'Eng', 'v0.1', '—', 'Material characterization, contact categorization, endpoint testing, risk.'),
            doc('k8', '510K.8', 'Software documentation (IEC 62304)', 'Mixed', 'draft', 55, 'SW', 'v0.5', '1d ago', 'Level of concern, architecture, hazard analysis, V&V, cybersecurity (SBOM + threat model).', { flag: 'Cybersecurity SBOM + threat model still draft — blocks eValidator' }),
          ],
        },
        doc('k9', '510K.9', 'Labeling', 'Mixed', 'draft', 60, 'RA', 'v0.5', '2d ago', 'Device label, IFU, package insert, required warnings. Per 21 CFR 801.'),
      ],
    },
    {
      id: 'eu', code: 'EU MDR', label: 'Technical documentation (Annex II / III)', children: [
        {
          id: 'eu-ii', code: 'Annex II', label: 'Technical documentation', children: [
            doc('e21', 'II.1', 'Device description & specification', 'Mixed', 'complete', 100, 'RA-EU', 'v1.1', '3d ago', 'Device description, variants/accessories, intended purpose, classification (Rule 11), and prior generations.'),
            doc('e22', 'II.2', 'Information supplied by the manufacturer', 'Mixed', 'draft', 58, 'RA-EU', 'v0.5', '2d ago', 'Label, IFU and packaging in required EU languages.'),
            doc('e23', 'II.3', 'Design & manufacturing information', 'Mixed', 'draft', 50, 'Eng', 'v0.4', '4d ago', 'Design stages, manufacturing processes and sites.'),
            doc('e24', 'II.4', 'GSPR checklist (Annex I)', 'Table', 'draft', 64, 'RA-EU', 'v0.6', '1d ago', 'General Safety & Performance Requirements conformity — standards and evidence per requirement.', { flag: '3 GSPRs in gap incl. IT-security 17.4' }),
            doc('e25', 'II.5', 'Benefit-risk & risk management (ISO 14971)', 'Mixed', 'draft', 55, 'Eng', 'v0.5', '2d ago', 'Risk management file: hazard analysis, risk controls, residual risk and benefit-risk conclusion.'),
            doc('e26', 'II.6.1', 'Clinical evaluation report (CER)', 'Mixed', 'draft', 66, 'Clin-EU', 'v0.5', '25m ago', 'MDR Article 61 clinical evaluation — state of the art, literature appraisal, equivalence, benefit-risk.'),
          ],
        },
        {
          id: 'eu-iii', code: 'Annex III', label: 'Post-market surveillance', children: [
            doc('e31', 'III.1', 'PMS plan', 'Plan', 'draft', 40, 'RA-EU', 'v0.3', '3d ago', 'Post-market surveillance plan per Article 84.'),
            doc('e32', 'III.1.b', 'PMCF plan', 'Plan', 'not_started', 0, 'Clin-EU', 'v0.1', '—', 'Post-market clinical follow-up plan per Annex XIV Part B.'),
            doc('e33', 'III.2', 'PSUR', 'Report', 'not_started', 0, 'PV', 'v0.1', '—', 'Periodic Safety Update Report (Class IIb — annual).'),
          ],
        },
        {
          id: 'eu-decl', code: 'Conformity', label: 'Conformity & registration', children: [
            doc('e41', '—', 'Declaration of Conformity', 'Form', 'draft', 30, 'RA-EU', 'v0.2', '5d ago', 'EU Declaration of Conformity per Annex IV.'),
            doc('e42', '—', 'SSCP (summary of safety & clinical performance)', 'Narrative', 'not_started', 0, 'RA-EU', 'v0.1', '—', 'Summary of Safety and Clinical Performance for implantable/Class III (where applicable).'),
            doc('e43', '—', 'UDI / EUDAMED registration', 'Data', 'draft', 25, 'RA-EU', 'v0.2', '6d ago', 'Basic UDI-DI, UDI-DI assignment and EUDAMED actor/device registration.'),
          ],
        },
      ],
    },
    {
      id: 'global', code: 'Global markets', label: 'Other jurisdictions', children: [
        doc('g-ca', '—', 'Health Canada — MDL (CMDR)', 'Application', 'draft', 35, 'RA-Intl', 'v0.3', '1w ago', 'Medical Device Licence application for Class II–IV (CMDR); leverages MDSAP certificate.'),
        doc('g-jp', '—', 'PMDA — Shonin (STED)', 'Application', 'not_started', 0, 'RA-Intl', 'v0.1', '—', 'Japanese marketing approval; STED-based dossier to PMDA/MHLW.'),
        doc('g-au', '—', 'TGA — ARTG inclusion', 'Application', 'not_started', 0, 'RA-Intl', 'v0.1', '—', 'Australian Register of Therapeutic Goods inclusion; MDSAP accepted.'),
        doc('g-cn', '—', 'NMPA — China registration', 'Application', 'not_started', 0, 'RA-Intl', 'v0.1', '—', 'NMPA device registration with type testing and clinical evaluation.'),
        doc('g-uk', '—', 'MHRA — UKCA marking', 'Application', 'not_started', 0, 'RA-Intl', 'v0.1', '—', 'UKCA marking and device registration for Great Britain.'),
      ],
    },
    {
      id: 'qms', code: 'Quality & lifecycle', label: 'Cross-cutting evidence', children: [
        doc('q-13485', '—', 'ISO 13485 QMS', 'System', 'complete', 100, 'QA', 'v2.0', '1mo ago', 'Quality management system certificate and procedures; MDSAP audit coverage.'),
        doc('q-14971', '—', 'ISO 14971 risk management file', 'File', 'draft', 55, 'Eng', 'v0.5', '2d ago', 'Master risk management file shared across markets.'),
        doc('q-cyber', '—', 'Cybersecurity file (SBOM, threat model)', 'File', 'draft', 45, 'SW', 'v0.4', '1d ago', 'Premarket cybersecurity documentation per FDA + EU guidance.'),
      ],
    },
  ],
};

/* ---- DIAGNOSTICS (IVDR) ---- */
const DIAGNOSTICS_SPINE: DossierSpine = {
  program: 'DxAssay RT-PCR — companion diagnostic',
  spine: 'EU IVDR Annex II/III · FDA · global',
  standard: 'multi',
  tree: [
    {
      id: 'eu', code: 'EU IVDR', label: 'Technical documentation (Annex II / III)', children: [
        doc('i1', 'II.1', 'Device description & intended purpose', 'Mixed', 'complete', 100, 'RA-EU', 'v1.1', '3d ago', 'Assay description, intended purpose, target markers and intended user/population.'),
        doc('i2', 'II.1.1', 'Classification (Annex VIII)', 'Narrative', 'complete', 100, 'RA-EU', 'v1.0', '4d ago', 'Class C — Rule 3(c) companion diagnostic; Notified-Body + EU reference-lab involvement.'),
        {
          id: 'iv-perf', code: 'Performance', label: 'Performance evidence', children: [
            doc('i3', 'II.6.1', 'Analytical performance (Annex I §9.1)', 'Mixed', 'draft', 62, 'R&D', 'v0.6', '2d ago', 'LoD 120 copies/mL, linearity R²=0.997, precision 3.8% CV.', { flag: 'Cross-reactivity panel pending' }),
            doc('i4', 'II.6.2', 'Clinical performance', 'Mixed', 'draft', 58, 'Clin', 'v0.5', '16m ago', '2×2 vs reference — sensitivity 96.4%, specificity 97.1%, AUC 0.96.'),
            doc('i5', 'II.6.3', 'Scientific validity', 'Narrative', 'draft', 50, 'Clin', 'v0.4', '3d ago', 'Association of the analyte with the targeted clinical condition (Annex XIII Part A).'),
          ],
        },
        doc('i6', '—', 'Companion-diagnostic linkage', 'Mixed', 'draft', 45, 'Clin', 'v0.4', '1h ago', 'Drug-CDx co-development with the therapeutic sponsor; bridging-study concordance 97.2%.'),
        doc('i7', 'II.4', 'GSPR conformity', 'Table', 'not_started', 0, 'RA-EU', 'v0.1', '—', 'IVDR General Safety & Performance Requirements conformity.'),
        doc('i8', '—', 'Performance evaluation report (PER)', 'Mixed', 'not_started', 0, 'Clin', 'v0.1', '—', 'PER per Annex XIII: scientific validity + analytical + clinical performance.'),
        doc('i9', 'III', 'PMS / PMPF', 'Plan', 'draft', 30, 'RA-EU', 'v0.2', '4d ago', 'Post-market performance follow-up plan and periodic reporting (Class C — annual).'),
      ],
    },
    {
      id: 'fda', code: 'FDA', label: '510(k) / De Novo / PMA (IVD)', children: [
        doc('fi1', '—', 'Analytical performance package', 'Mixed', 'draft', 55, 'R&D', 'v0.5', '3d ago', 'FDA analytical validation — LoD/LoQ, linearity, precision, interference.'),
        doc('fi2', '—', 'Clinical performance package', 'Mixed', 'draft', 48, 'Clin', 'v0.4', '5d ago', 'Method comparison and clinical agreement study.'),
        doc('fi3', '—', 'CLIA categorization', 'Form', 'not_started', 0, 'RA', 'v0.1', '—', 'CLIA complexity categorization request.'),
      ],
    },
    {
      id: 'global', code: 'Global markets', label: 'Other jurisdictions', children: [
        doc('di-ca', '—', 'Health Canada — IVDD licence', 'Application', 'not_started', 0, 'RA-Intl', 'v0.1', '—', 'IVD device licence under CMDR.'),
        doc('di-jp', '—', 'PMDA — IVD approval', 'Application', 'not_started', 0, 'RA-Intl', 'v0.1', '—', 'Japanese IVD marketing approval.'),
      ],
    },
  ],
};

/* pharma reuses the biotech eCTD spine with a small-molecule program label */
const PHARMA_SPINE: DossierSpine = {
  program: 'AltexaTab — NDA 213900',
  spine: 'eCTD v4.0 · ICH CTD',
  standard: 'eCTD',
  tree: BIOTECH_SPINE.tree,
};

export const DOSSIER_SPINES: Record<string, DossierSpine> = {
  biotech: BIOTECH_SPINE,
  medtech: MEDTECH_SPINE,
  diagnostics: DIAGNOSTICS_SPINE,
  pharma: PHARMA_SPINE,
  cro: BIOTECH_SPINE,
  health: BIOTECH_SPINE,
};

export function getDossierSpine(seg: string): DossierSpine {
  return DOSSIER_SPINES[seg] || DOSSIER_SPINES.biotech;
}
