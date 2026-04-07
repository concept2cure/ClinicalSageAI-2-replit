/**
 * ctdHierarchy.ts — Single source of truth for ICH CTD hierarchy.
 *
 * Defines the full eCTD Module 1-5 structure, node types, statuses,
 * template keys, and utility functions used by DossierTree, TemplateTree,
 * and placement/move operations.
 *
 * References:
 *  - ICH M4 Common Technical Document
 *  - FDA eCTD Guidance
 *  - DossierNavigator.tsx ECTD_STRUCTURE (refactored here as canonical)
 */

// ── Node / status / placement types ──────────────────────────────────────────

export type DossierNodeType = 'module' | 'section' | 'subsection' | 'placeholder' | 'document' | 'leaf';

export type DossierNodeStatus =
  | 'empty'
  | 'draft_present'
  | 'under_review'
  | 'approved'
  | 'locked'
  | 'missing_evidence'
  | 'ready';

export type PlacementStatus = 'unplaced' | 'placed' | 'relocated' | 'archived';

export type SubmissionStatus = 'not_started' | 'drafting' | 'review' | 'qc' | 'final' | 'published';

export type RegulatoryRegion = 'FDA' | 'EMA' | 'PMDA' | 'HC' | 'TGA' | 'ICH';

// ── Core node interface ──────────────────────────────────────────────────────

export interface DossierNode {
  nodeId: string; // e.g. "m2-2.5" or "m3-3.2.S.1"
  parentNodeId: string | null;
  label: string;
  ctdSection: string; // e.g. "2.5", "3.2.S.1"
  region?: RegulatoryRegion;
  nodeType: DossierNodeType;
  isTemplate?: boolean;
  templateKey?: string;
  allowedDocTypes?: string[];
  children: DossierNode[];
}

// ── Placement record (mirrors DB placement concept) ──────────────────────────

export interface ArtifactPlacement {
  projectId: string;
  artifactId: string;
  ctdSection: string;
  documentType?: string;
  placementStatus: PlacementStatus;
  submissionStatus: SubmissionStatus;
  region?: RegulatoryRegion;
  sourceTemplateKey?: string;
  placedAt?: string;
  placedBy?: string;
}

// ── Full ICH CTD Hierarchy ───────────────────────────────────────────────────
// Canonical structure. All trees derive from this.

export const CTD_HIERARCHY: DossierNode[] = [
  // ── Module 1: Administrative Information ──
  {
    nodeId: 'm1',
    parentNodeId: null,
    label: 'Module 1 — Administrative Information & Prescribing Information',
    ctdSection: '1',
    nodeType: 'module',
    children: [
      {
        nodeId: 'm1-1.1',
        parentNodeId: 'm1',
        label: 'Forms',
        ctdSection: '1.1',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm1-1.2',
        parentNodeId: 'm1',
        label: 'Cover Letters',
        ctdSection: '1.2',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm1-1.3',
        parentNodeId: 'm1',
        label: 'Administrative Information',
        ctdSection: '1.3',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm1-1.3.1',
            parentNodeId: 'm1-1.3',
            label: 'Contact/Sponsor Information',
            ctdSection: '1.3.1',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.3.2',
            parentNodeId: 'm1-1.3',
            label: 'Field Copy Certification',
            ctdSection: '1.3.2',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.3.3',
            parentNodeId: 'm1-1.3',
            label: 'Debarment Certification',
            ctdSection: '1.3.3',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.3.4',
            parentNodeId: 'm1-1.3',
            label: 'Financial Disclosure',
            ctdSection: '1.3.4',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.3.5',
            parentNodeId: 'm1-1.3',
            label: 'Patent/Exclusivity',
            ctdSection: '1.3.5',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
      {
        nodeId: 'm1-1.4',
        parentNodeId: 'm1',
        label: 'References',
        ctdSection: '1.4',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm1-1.5',
        parentNodeId: 'm1',
        label: 'IND Safety Reports',
        ctdSection: '1.5',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm1-1.5.1',
            parentNodeId: 'm1-1.5',
            label: '15-Day Alert Reports',
            ctdSection: '1.5.1',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.5.2',
            parentNodeId: 'm1-1.5',
            label: 'Non-IND Safety Reports',
            ctdSection: '1.5.2',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
      {
        nodeId: 'm1-1.7',
        parentNodeId: 'm1',
        label: 'Meeting Information',
        ctdSection: '1.7',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm1-1.7.1',
            parentNodeId: 'm1-1.7',
            label: 'Pre-IND Meeting Request & Minutes',
            ctdSection: '1.7.1',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.7.2',
            parentNodeId: 'm1-1.7',
            label: 'End-of-Phase 2 Meeting',
            ctdSection: '1.7.2',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.7.3',
            parentNodeId: 'm1-1.7',
            label: 'Pre-NDA/BLA Meeting',
            ctdSection: '1.7.3',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
      {
        nodeId: 'm1-1.13',
        parentNodeId: 'm1',
        label: 'Environmental Assessment / Categorical Exclusion',
        ctdSection: '1.13',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm1-1.12',
        parentNodeId: 'm1',
        label: 'REMS',
        ctdSection: '1.12',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm1-1.14',
        parentNodeId: 'm1',
        label: 'Labeling',
        ctdSection: '1.14',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm1-1.14.1',
            parentNodeId: 'm1-1.14',
            label: 'Prescribing Information',
            ctdSection: '1.14.1',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm1-1.14.2',
            parentNodeId: 'm1-1.14',
            label: 'Patient Labeling',
            ctdSection: '1.14.2',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
    ],
  },

  // ── Module 2: Summaries ──
  {
    nodeId: 'm2',
    parentNodeId: null,
    label: 'Module 2 — Common Technical Document Summaries',
    ctdSection: '2',
    nodeType: 'module',
    children: [
      {
        nodeId: 'm2-2.1',
        parentNodeId: 'm2',
        label: 'Table of Contents',
        ctdSection: '2.1',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm2-2.2',
        parentNodeId: 'm2',
        label: 'Introduction',
        ctdSection: '2.2',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm2-2.3',
        parentNodeId: 'm2',
        label: 'Quality Overall Summary',
        ctdSection: '2.3',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm2-2.3.S',
            parentNodeId: 'm2-2.3',
            label: 'Drug Substance',
            ctdSection: '2.3.S',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.3.P',
            parentNodeId: 'm2-2.3',
            label: 'Drug Product',
            ctdSection: '2.3.P',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.3.A',
            parentNodeId: 'm2-2.3',
            label: 'Appendices',
            ctdSection: '2.3.A',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.3.R',
            parentNodeId: 'm2-2.3',
            label: 'Regional Information',
            ctdSection: '2.3.R',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
      {
        nodeId: 'm2-2.4',
        parentNodeId: 'm2',
        label: 'Nonclinical Overview',
        ctdSection: '2.4',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm2-2.5',
        parentNodeId: 'm2',
        label: 'Clinical Overview',
        ctdSection: '2.5',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm2-2.6',
        parentNodeId: 'm2',
        label: 'Nonclinical Written & Tabulated Summaries',
        ctdSection: '2.6',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm2-2.6.1',
            parentNodeId: 'm2-2.6',
            label: 'Introduction',
            ctdSection: '2.6.1',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.6.2',
            parentNodeId: 'm2-2.6',
            label: 'Pharmacology Written Summary',
            ctdSection: '2.6.2',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.6.3',
            parentNodeId: 'm2-2.6',
            label: 'Pharmacology Tabulated Summary',
            ctdSection: '2.6.3',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.6.4',
            parentNodeId: 'm2-2.6',
            label: 'Pharmacokinetics Written Summary',
            ctdSection: '2.6.4',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.6.5',
            parentNodeId: 'm2-2.6',
            label: 'Pharmacokinetics Tabulated Summary',
            ctdSection: '2.6.5',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.6.6',
            parentNodeId: 'm2-2.6',
            label: 'Toxicology Written Summary',
            ctdSection: '2.6.6',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.6.7',
            parentNodeId: 'm2-2.6',
            label: 'Toxicology Tabulated Summary',
            ctdSection: '2.6.7',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
      {
        nodeId: 'm2-2.7',
        parentNodeId: 'm2',
        label: 'Clinical Summary',
        ctdSection: '2.7',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm2-2.7.1',
            parentNodeId: 'm2-2.7',
            label: 'Summary of Biopharmaceutic Studies',
            ctdSection: '2.7.1',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.7.2',
            parentNodeId: 'm2-2.7',
            label: 'Summary of Clinical Pharmacology',
            ctdSection: '2.7.2',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.7.3',
            parentNodeId: 'm2-2.7',
            label: 'Summary of Clinical Efficacy',
            ctdSection: '2.7.3',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.7.4',
            parentNodeId: 'm2-2.7',
            label: 'Summary of Clinical Safety',
            ctdSection: '2.7.4',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.7.5',
            parentNodeId: 'm2-2.7',
            label: 'Literature References',
            ctdSection: '2.7.5',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm2-2.7.6',
            parentNodeId: 'm2-2.7',
            label: 'Synopses of Individual Studies',
            ctdSection: '2.7.6',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
    ],
  },

  // ── Module 3: Quality ──
  {
    nodeId: 'm3',
    parentNodeId: null,
    label: 'Module 3 — Quality',
    ctdSection: '3',
    nodeType: 'module',
    children: [
      {
        nodeId: 'm3-3.1',
        parentNodeId: 'm3',
        label: 'Table of Contents',
        ctdSection: '3.1',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm3-3.2',
        parentNodeId: 'm3',
        label: 'Body of Data',
        ctdSection: '3.2',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm3-3.2.S',
            parentNodeId: 'm3-3.2',
            label: 'Drug Substance',
            ctdSection: '3.2.S',
            nodeType: 'subsection',
            children: [
              {
                nodeId: 'm3-3.2.S.1',
                parentNodeId: 'm3-3.2.S',
                label: 'General Information',
                ctdSection: '3.2.S.1',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.S.2',
                parentNodeId: 'm3-3.2.S',
                label: 'Manufacture',
                ctdSection: '3.2.S.2',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.S.3',
                parentNodeId: 'm3-3.2.S',
                label: 'Characterisation',
                ctdSection: '3.2.S.3',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.S.4',
                parentNodeId: 'm3-3.2.S',
                label: 'Control of Drug Substance',
                ctdSection: '3.2.S.4',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.S.5',
                parentNodeId: 'm3-3.2.S',
                label: 'Reference Standards',
                ctdSection: '3.2.S.5',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.S.6',
                parentNodeId: 'm3-3.2.S',
                label: 'Container Closure System',
                ctdSection: '3.2.S.6',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.S.7',
                parentNodeId: 'm3-3.2.S',
                label: 'Stability',
                ctdSection: '3.2.S.7',
                nodeType: 'subsection',
                children: [],
              },
            ],
          },
          {
            nodeId: 'm3-3.2.P',
            parentNodeId: 'm3-3.2',
            label: 'Drug Product',
            ctdSection: '3.2.P',
            nodeType: 'subsection',
            children: [
              {
                nodeId: 'm3-3.2.P.1',
                parentNodeId: 'm3-3.2.P',
                label: 'Description & Composition',
                ctdSection: '3.2.P.1',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.P.2',
                parentNodeId: 'm3-3.2.P',
                label: 'Pharmaceutical Development',
                ctdSection: '3.2.P.2',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.P.3',
                parentNodeId: 'm3-3.2.P',
                label: 'Manufacture',
                ctdSection: '3.2.P.3',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.P.4',
                parentNodeId: 'm3-3.2.P',
                label: 'Control of Excipients',
                ctdSection: '3.2.P.4',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.P.5',
                parentNodeId: 'm3-3.2.P',
                label: 'Control of Drug Product',
                ctdSection: '3.2.P.5',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.P.6',
                parentNodeId: 'm3-3.2.P',
                label: 'Reference Standards',
                ctdSection: '3.2.P.6',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.P.7',
                parentNodeId: 'm3-3.2.P',
                label: 'Container Closure System',
                ctdSection: '3.2.P.7',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm3-3.2.P.8',
                parentNodeId: 'm3-3.2.P',
                label: 'Stability',
                ctdSection: '3.2.P.8',
                nodeType: 'subsection',
                children: [],
              },
            ],
          },
          {
            nodeId: 'm3-3.2.A',
            parentNodeId: 'm3-3.2',
            label: 'Appendices',
            ctdSection: '3.2.A',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm3-3.2.R',
            parentNodeId: 'm3-3.2',
            label: 'Regional Information',
            ctdSection: '3.2.R',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
      {
        nodeId: 'm3-3.3',
        parentNodeId: 'm3',
        label: 'Literature References',
        ctdSection: '3.3',
        nodeType: 'section',
        children: [],
      },
    ],
  },

  // ── Module 4: Nonclinical Study Reports ──
  {
    nodeId: 'm4',
    parentNodeId: null,
    label: 'Module 4 — Nonclinical Study Reports',
    ctdSection: '4',
    nodeType: 'module',
    children: [
      {
        nodeId: 'm4-4.1',
        parentNodeId: 'm4',
        label: 'Table of Contents',
        ctdSection: '4.1',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm4-4.2',
        parentNodeId: 'm4',
        label: 'Study Reports',
        ctdSection: '4.2',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm4-4.2.1',
            parentNodeId: 'm4-4.2',
            label: 'Pharmacology',
            ctdSection: '4.2.1',
            nodeType: 'subsection',
            children: [
              {
                nodeId: 'm4-4.2.1.1',
                parentNodeId: 'm4-4.2.1',
                label: 'Primary Pharmacodynamics',
                ctdSection: '4.2.1.1',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.1.2',
                parentNodeId: 'm4-4.2.1',
                label: 'Secondary Pharmacodynamics',
                ctdSection: '4.2.1.2',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.1.3',
                parentNodeId: 'm4-4.2.1',
                label: 'Safety Pharmacology',
                ctdSection: '4.2.1.3',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.1.4',
                parentNodeId: 'm4-4.2.1',
                label: 'Pharmacodynamic Drug Interactions',
                ctdSection: '4.2.1.4',
                nodeType: 'subsection',
                children: [],
              },
            ],
          },
          {
            nodeId: 'm4-4.2.2',
            parentNodeId: 'm4-4.2',
            label: 'Pharmacokinetics',
            ctdSection: '4.2.2',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm4-4.2.3',
            parentNodeId: 'm4-4.2',
            label: 'Toxicology',
            ctdSection: '4.2.3',
            nodeType: 'subsection',
            children: [
              {
                nodeId: 'm4-4.2.3.1',
                parentNodeId: 'm4-4.2.3',
                label: 'Single-Dose Toxicity',
                ctdSection: '4.2.3.1',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.3.2',
                parentNodeId: 'm4-4.2.3',
                label: 'Repeat-Dose Toxicity',
                ctdSection: '4.2.3.2',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.3.3',
                parentNodeId: 'm4-4.2.3',
                label: 'Genotoxicity',
                ctdSection: '4.2.3.3',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.3.4',
                parentNodeId: 'm4-4.2.3',
                label: 'Carcinogenicity',
                ctdSection: '4.2.3.4',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.3.5',
                parentNodeId: 'm4-4.2.3',
                label: 'Reproductive & Developmental Toxicity',
                ctdSection: '4.2.3.5',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.3.6',
                parentNodeId: 'm4-4.2.3',
                label: 'Local Tolerance',
                ctdSection: '4.2.3.6',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm4-4.2.3.7',
                parentNodeId: 'm4-4.2.3',
                label: 'Other Toxicity Studies',
                ctdSection: '4.2.3.7',
                nodeType: 'subsection',
                children: [],
              },
            ],
          },
        ],
      },
      {
        nodeId: 'm4-4.3',
        parentNodeId: 'm4',
        label: 'Literature References',
        ctdSection: '4.3',
        nodeType: 'section',
        children: [],
      },
    ],
  },

  // ── Module 5: Clinical Study Reports ──
  {
    nodeId: 'm5',
    parentNodeId: null,
    label: 'Module 5 — Clinical Study Reports',
    ctdSection: '5',
    nodeType: 'module',
    children: [
      {
        nodeId: 'm5-5.1',
        parentNodeId: 'm5',
        label: 'Table of Contents',
        ctdSection: '5.1',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm5-5.2',
        parentNodeId: 'm5',
        label: 'Tabular Listing of Clinical Studies',
        ctdSection: '5.2',
        nodeType: 'section',
        children: [],
      },
      {
        nodeId: 'm5-5.3',
        parentNodeId: 'm5',
        label: 'Clinical Study Reports',
        ctdSection: '5.3',
        nodeType: 'section',
        children: [
          {
            nodeId: 'm5-5.3.1',
            parentNodeId: 'm5-5.3',
            label: 'Reports of Biopharmaceutic Studies',
            ctdSection: '5.3.1',
            nodeType: 'subsection',
            children: [
              {
                nodeId: 'm5-5.3.1.1',
                parentNodeId: 'm5-5.3.1',
                label: 'Bioavailability Studies',
                ctdSection: '5.3.1.1',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm5-5.3.1.2',
                parentNodeId: 'm5-5.3.1',
                label: 'Comparative BA & BE Studies',
                ctdSection: '5.3.1.2',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm5-5.3.1.3',
                parentNodeId: 'm5-5.3.1',
                label: 'In Vitro–In Vivo Correlation',
                ctdSection: '5.3.1.3',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm5-5.3.1.4',
                parentNodeId: 'm5-5.3.1',
                label: 'Bioanalytical & Analytical Methods',
                ctdSection: '5.3.1.4',
                nodeType: 'subsection',
                children: [],
              },
            ],
          },
          {
            nodeId: 'm5-5.3.2',
            parentNodeId: 'm5-5.3',
            label: 'Reports of Clinical Pharmacology Studies',
            ctdSection: '5.3.2',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm5-5.3.3',
            parentNodeId: 'm5-5.3',
            label: 'Reports of Clinical Pharmacokinetic Studies',
            ctdSection: '5.3.3',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm5-5.3.4',
            parentNodeId: 'm5-5.3',
            label: 'Reports of Human Pharmacodynamic Studies',
            ctdSection: '5.3.4',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm5-5.3.5',
            parentNodeId: 'm5-5.3',
            label: 'Reports of Efficacy & Safety Studies',
            ctdSection: '5.3.5',
            nodeType: 'subsection',
            children: [
              {
                nodeId: 'm5-5.3.5.1',
                parentNodeId: 'm5-5.3.5',
                label: 'Controlled Clinical Studies',
                ctdSection: '5.3.5.1',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm5-5.3.5.2',
                parentNodeId: 'm5-5.3.5',
                label: 'Uncontrolled Clinical Studies',
                ctdSection: '5.3.5.2',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm5-5.3.5.3',
                parentNodeId: 'm5-5.3.5',
                label: 'Multi-Study Analyses',
                ctdSection: '5.3.5.3',
                nodeType: 'subsection',
                children: [],
              },
              {
                nodeId: 'm5-5.3.5.4',
                parentNodeId: 'm5-5.3.5',
                label: 'Other Study Reports',
                ctdSection: '5.3.5.4',
                nodeType: 'subsection',
                children: [],
              },
            ],
          },
          {
            nodeId: 'm5-5.3.6',
            parentNodeId: 'm5-5.3',
            label: 'Reports of Post-marketing Experience',
            ctdSection: '5.3.6',
            nodeType: 'subsection',
            children: [],
          },
          {
            nodeId: 'm5-5.3.7',
            parentNodeId: 'm5-5.3',
            label: 'Case Report Forms & Individual Patient Listings',
            ctdSection: '5.3.7',
            nodeType: 'subsection',
            children: [],
          },
        ],
      },
      {
        nodeId: 'm5-5.4',
        parentNodeId: 'm5',
        label: 'Literature References',
        ctdSection: '5.4',
        nodeType: 'section',
        children: [],
      },
    ],
  },
];

// ── IND Template Pyramid ─────────────────────────────────────────────────────
// Templates layered on CTD nodes with parent→sub→micro hierarchy.

export type TemplateType = 'starter' | 'subsection' | 'micro';

export interface TemplateNode {
  templateKey: string;
  label: string;
  ctdSection: string;
  description?: string;
  templateType?: TemplateType;
  parentTemplateKey?: string;
  appliesTo?: string;
  suggestedChildren?: string[];
  requiredBlocks?: string[];
  optionalBlocks?: string[];
  children: TemplateNode[];
}

// ── Template structure map: expected subsections per template ─────────────────
// Used by the "Template Structure" view to show what a document should contain.

export interface TemplateStructureNode {
  key: string;
  label: string;
  description?: string;
  required: boolean;
}

/**
 * Returns expected subsection structure for a given template key.
 * Used to drive the "Document Outline | Template Structure" subview.
 */
export function getTemplateStructure(templateKey: string): TemplateStructureNode[] | null {
  return TEMPLATE_STRUCTURE_MAP[templateKey] ?? null;
}

const TEMPLATE_STRUCTURE_MAP: Record<string, TemplateStructureNode[]> = {
  'tpl-ds-gen-info': [
    { key: 'nomenclature', label: 'Nomenclature', required: true },
    { key: 'structure', label: 'Structure', required: true },
    { key: 'general-properties', label: 'General Properties', required: true },
  ],
  'tpl-ds-manufacture': [
    { key: 'manufacturer', label: 'Manufacturer(s)', required: true },
    {
      key: 'mfg-process',
      label: 'Description of Manufacturing Process and Process Controls',
      required: true,
    },
    { key: 'materials-control', label: 'Control of Materials', required: true },
    {
      key: 'critical-steps',
      label: 'Controls of Critical Steps and Intermediates',
      required: true,
    },
    { key: 'process-validation', label: 'Process Validation / Evaluation', required: false },
    { key: 'mfg-process-devt', label: 'Manufacturing Process Development', required: false },
  ],
  'tpl-ds-characterisation': [
    { key: 'structure-elucidation', label: 'Elucidation of Structure', required: true },
    { key: 'impurities', label: 'Impurities', required: true },
  ],
  'tpl-ds-control': [
    { key: 'specification', label: 'Specification', required: true },
    { key: 'analytical-procedures', label: 'Analytical Procedures', required: true },
    { key: 'validation', label: 'Validation of Analytical Procedures', required: true },
    { key: 'batch-analyses', label: 'Batch Analyses', required: true },
    { key: 'justification', label: 'Justification of Specification', required: true },
  ],
  'tpl-ds-stability': [
    { key: 'stability-summary', label: 'Stability Summary and Conclusions', required: true },
    {
      key: 'post-approval',
      label: 'Post-Approval Stability Protocol and Stability Commitment',
      required: false,
    },
    { key: 'stability-data', label: 'Stability Data', required: true },
  ],
  'tpl-dp-desc': [
    { key: 'dosage-form', label: 'Description of Dosage Form', required: true },
    { key: 'composition', label: 'Composition', required: true },
  ],
  'tpl-dp-devt': [
    { key: 'formulation-devt', label: 'Formulation Development', required: true },
    { key: 'overages', label: 'Overages', required: false },
    { key: 'physicochemical', label: 'Physicochemical and Biological Properties', required: true },
    { key: 'mfg-process-devt', label: 'Manufacturing Process Development', required: true },
    { key: 'container-closure', label: 'Container Closure System', required: true },
    { key: 'microbiological', label: 'Microbiological Attributes', required: false },
    { key: 'compatibility', label: 'Compatibility', required: false },
  ],
  'tpl-dp-manufacture': [
    { key: 'batch-formula', label: 'Batch Formula', required: true },
    { key: 'mfg-process', label: 'Manufacturing Process and Process Controls', required: true },
    { key: 'process-validation', label: 'Process Validation / Evaluation', required: false },
  ],
  'tpl-m2-2.3': [
    { key: 'intro', label: 'Introduction', required: true },
    { key: 'drug-substance', label: 'Drug Substance', required: true },
    { key: 'drug-product', label: 'Drug Product', required: true },
    { key: 'appendices', label: 'Appendices', required: false },
    { key: 'regional-info', label: 'Regional Information', required: false },
  ],
  'tpl-m2-2.5': [
    { key: 'product-devt-rationale', label: 'Product Development Rationale', required: true },
    { key: 'overview-clinical-pharm', label: 'Overview of Clinical Pharmacology', required: true },
    { key: 'overview-efficacy', label: 'Overview of Efficacy', required: true },
    { key: 'overview-safety', label: 'Overview of Safety', required: true },
    { key: 'benefit-risk', label: 'Benefits and Risks Conclusions', required: true },
  ],
  'tpl-m2-2.6': [
    { key: 'intro', label: 'Introduction', required: true },
    { key: 'pharmacology-written', label: 'Pharmacology Written Summary', required: true },
    { key: 'pharmacology-tabulated', label: 'Pharmacology Tabulated Summary', required: true },
    { key: 'pk-written', label: 'Pharmacokinetics Written Summary', required: true },
    { key: 'pk-tabulated', label: 'Pharmacokinetics Tabulated Summary', required: true },
    { key: 'tox-written', label: 'Toxicology Written Summary', required: true },
    { key: 'tox-tabulated', label: 'Toxicology Tabulated Summary', required: true },
  ],
  'tpl-m2-2.7': [
    {
      key: 'biopharm',
      label: 'Summary of Biopharmaceutic Studies and Associated Analytical Methods',
      required: true,
    },
    { key: 'clin-pharm', label: 'Summary of Clinical Pharmacology Studies', required: true },
    { key: 'efficacy', label: 'Summary of Clinical Efficacy', required: true },
    { key: 'safety', label: 'Summary of Clinical Safety', required: true },
    { key: 'lit-refs', label: 'Literature References', required: false },
    { key: 'synopses', label: 'Synopses of Individual Studies', required: false },
  ],
  'tpl-m5-csr': [
    { key: 'synopsis', label: 'Synopsis', required: true },
    { key: 'intro', label: 'Introduction', required: true },
    { key: 'study-objectives', label: 'Study Objectives', required: true },
    { key: 'investigational-plan', label: 'Investigational Plan', required: true },
    { key: 'study-patients', label: 'Study Patients', required: true },
    { key: 'efficacy-evaluation', label: 'Efficacy Evaluation', required: true },
    { key: 'safety-evaluation', label: 'Safety Evaluation', required: true },
    { key: 'discussion', label: 'Discussion and Overall Conclusions', required: true },
    {
      key: 'tables-figures',
      label: 'Tables, Figures, and Graphs Referred to but Not Included in Text',
      required: false,
    },
    { key: 'reference-list', label: 'Reference List', required: false },
    { key: 'appendices', label: 'Appendices', required: false },
  ],
  'tpl-m5-5.2': [
    { key: 'study-listing', label: 'Tabular Listing of All Clinical Studies', required: true },
  ],
  'tpl-m4-4.2': [
    { key: 'pharmacology', label: 'Pharmacology Studies', required: true },
    { key: 'pharmacokinetics', label: 'Pharmacokinetics Studies', required: true },
    { key: 'toxicology', label: 'Toxicology Studies', required: true },
  ],
};

// ── Section requirement descriptors ──────────────────────────────────────────

export interface SectionRequirement {
  ctdSection: string;
  section: string; // alias for UI convenience
  label: string;
  description: string;
  expectedDocTypes: string[];
  requiredDocTypes: string[]; // alias
  required: boolean;
  optional: boolean;
  hasTemplates: boolean;
  templateKeys: string[];
  requiredChildren: string[];
  optionalChildren: string[];
  commonMissingBlocks: string[];
  starterTemplatesAvailable: string[];
}

export function getSectionRequirements(ctdSection: string): SectionRequirement | null {
  const node = findNodeBySection(CTD_HIERARCHY, ctdSection);
  if (!node) return null;
  const templates = findTemplatesByCTDSection(IND_TEMPLATES, ctdSection);
  const docTypes = SECTION_DOC_TYPES[ctdSection] || ['regulatory_document'];
  const childSections = node.children || [];
  const requiredChildren = childSections
    .filter(c => !OPTIONAL_SECTIONS.has(c.ctdSection))
    .map(c => `${c.ctdSection} — ${c.label}`);
  const optionalChildren = childSections
    .filter(c => OPTIONAL_SECTIONS.has(c.ctdSection))
    .map(c => `${c.ctdSection} — ${c.label}`);

  // Find starter templates for this section
  const starters = templates.filter(t => t.templateType === 'starter').map(t => t.label);

  // Common missing blocks from template structure
  const templateStructures = templates.flatMap(t => TEMPLATE_STRUCTURE_MAP[t.templateKey] ?? []);
  const commonMissing = templateStructures.filter(s => s.required).map(s => s.label);

  return {
    ctdSection,
    section: ctdSection,
    label: node.label,
    description: SECTION_DESCRIPTIONS[ctdSection] || `Content for CTD section ${ctdSection}.`,
    expectedDocTypes: docTypes,
    requiredDocTypes: docTypes,
    required: !OPTIONAL_SECTIONS.has(ctdSection),
    optional: OPTIONAL_SECTIONS.has(ctdSection),
    hasTemplates: templates.length > 0,
    templateKeys: templates.map(t => t.templateKey),
    requiredChildren,
    optionalChildren,
    commonMissingBlocks: commonMissing,
    starterTemplatesAvailable: starters,
  };
}

function findTemplatesByCTDSection(nodes: TemplateNode[], section: string): TemplateNode[] {
  const result: TemplateNode[] = [];
  function walk(n: TemplateNode) {
    if (n.ctdSection === section) result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

const OPTIONAL_SECTIONS = new Set([
  '1.4',
  '1.12',
  '3.3',
  '4.3',
  '5.4',
  '2.3.A',
  '2.3.R',
  '3.2.A',
  '3.2.R',
]);

const SECTION_DESCRIPTIONS: Record<string, string> = {
  '1.1': 'FDA forms required for the submission (e.g., Form 1571, 356h).',
  '1.2': 'Cover letter(s) addressing the submission purpose and contents.',
  '1.3': 'Sponsor/contact information, financial disclosures, certifications.',
  '1.14': 'Proposed labeling including prescribing information and patient labeling.',
  '1.5': 'IND safety reports including 15-day alert reports and follow-up safety reports.',
  '1.5.1': '15-day alert reports for serious and unexpected suspected adverse reactions.',
  '1.5.2': 'Non-IND safety reports and follow-up correspondence.',
  '1.7': 'Meeting information including briefing documents and minutes.',
  '1.7.1': 'Pre-IND meeting request, briefing document, and minutes.',
  '1.7.2': 'End-of-Phase 2 meeting briefing document and minutes.',
  '1.7.3': 'Pre-NDA/BLA meeting briefing document and minutes.',
  '1.13': 'Environmental assessment or claim of categorical exclusion per 21 CFR 25.',
  '2.1': 'Table of contents for the CTD.',
  '2.2': 'Brief introduction to the drug substance and product.',
  '2.3': 'Quality overall summary covering drug substance and drug product.',
  '2.4': 'Nonclinical overview summarizing pharmacology, PK and toxicology.',
  '2.5': 'Clinical overview including benefit-risk assessment.',
  '2.6': 'Written and tabulated summaries for nonclinical studies.',
  '2.7': 'Clinical summary of biopharmaceutic, pharmacology, efficacy and safety studies.',
  '3.2.S':
    'Drug substance data: general properties, manufacture, characterization, control, stability.',
  '3.2.S.1': 'Nomenclature, structure, and general properties of the drug substance.',
  '3.2.S.2':
    'Manufacturer information, process description, process controls, and controls of materials.',
  '3.2.S.3': 'Elucidation of structure and other characteristics.',
  '3.2.S.4':
    'Specification, analytical procedures, validation, batch analyses, and justification of specification.',
  '3.2.S.5': 'Description of reference standards or reference materials.',
  '3.2.S.6': 'Description and suitability of the container closure system.',
  '3.2.S.7': 'Stability summary, post-approval stability protocol, and stability data.',
  '3.2.P': 'Drug product data: description, development, manufacture, control, stability.',
  '3.2.P.1': 'Description of the dosage form and composition.',
  '3.2.P.2':
    'Development studies including formulation, manufacturing process, and container closure.',
  '3.2.P.3': 'Batch formula, manufacturing process description, and process controls.',
  '3.2.P.4': 'Specifications and analytical procedures for excipients.',
  '3.2.P.5': 'Specifications, analytical procedures, validation, batch analyses.',
  '3.2.P.6': 'Description of reference standards used for drug product testing.',
  '3.2.P.7': 'Description and suitability of the container closure system for drug product.',
  '3.2.P.8': 'Stability summary, post-approval stability protocol, and stability data.',
  '4.2.1': 'Reports of pharmacology studies: primary, secondary, safety pharmacology.',
  '4.2.2': 'Reports of pharmacokinetics studies.',
  '4.2.3': 'Reports of toxicology studies: single/repeat dose, geno/carcinogenicity, reproductive.',
  '5.3.5': 'Reports of controlled and uncontrolled clinical efficacy and safety studies.',
  '5.3.5.1': 'Reports of controlled clinical studies pertinent to the claimed indication.',
  '5.3.5.2': 'Reports of uncontrolled clinical studies.',
  '5.3.5.3': 'Reports of analyses of data from more than one study.',
  '5.3.7': 'Case report forms and individual patient listings.',
};

const SECTION_DOC_TYPES: Record<string, string[]> = {
  '1.1': ['form'],
  '1.2': ['cover_letter'],
  '1.3': ['administrative_document'],
  '1.14': ['labeling'],
  '1.5': ['safety_report'],
  '1.5.1': ['safety_report'],
  '1.5.2': ['safety_report'],
  '1.7': ['meeting_document'],
  '1.7.1': ['meeting_document'],
  '1.7.2': ['meeting_document'],
  '1.7.3': ['meeting_document'],
  '1.13': ['environmental_assessment'],
  '2.3': ['quality_overall_summary'],
  '2.4': ['nonclinical_overview'],
  '2.5': ['clinical_overview'],
  '2.6': ['nonclinical_summary'],
  '2.7': ['clinical_summary'],
  '3.2.S': ['regulatory_document'],
  '3.2.P': ['regulatory_document'],
  '4.2': ['study_report'],
  '5.3.5': ['clinical_study_report'],
};

export const IND_TEMPLATES: TemplateNode[] = [
  // ── Module 1: Administrative ──
  {
    templateKey: 'tpl-m1-forms',
    label: 'FDA Forms',
    ctdSection: '1.1',
    templateType: 'starter',
    children: [
      {
        templateKey: 'tpl-form-1571',
        label: 'Form FDA 1571',
        ctdSection: '1.1',
        templateType: 'micro',
        children: [],
      },
      {
        templateKey: 'tpl-form-356h',
        label: 'Form FDA 356h',
        ctdSection: '1.1',
        templateType: 'micro',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m1-cover',
    label: 'Cover Letters',
    ctdSection: '1.2',
    templateType: 'starter',
    children: [
      {
        templateKey: 'tpl-cover-initial',
        label: 'Initial IND Cover Letter',
        ctdSection: '1.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-cover-amendment',
        label: 'Amendment Cover Letter',
        ctdSection: '1.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-cover-annual',
        label: 'Annual Report Cover Letter',
        ctdSection: '1.2',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m1-admin',
    label: 'Administrative Information',
    ctdSection: '1.3',
    templateType: 'starter',
    children: [
      {
        templateKey: 'tpl-admin-sponsor',
        label: 'Sponsor/Contact Information',
        ctdSection: '1.3.1',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-admin-financial',
        label: 'Financial Disclosure',
        ctdSection: '1.3.4',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-admin-debarment',
        label: 'Debarment Certification',
        ctdSection: '1.3.3',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m1-safety-reports',
    label: 'IND Safety Reports',
    ctdSection: '1.5',
    templateType: 'starter',
    children: [
      {
        templateKey: 'tpl-15day-alert',
        label: '15-Day Alert Report',
        ctdSection: '1.5.1',
        templateType: 'micro',
        children: [],
      },
      {
        templateKey: 'tpl-non-ind-safety',
        label: 'Non-IND Safety Report',
        ctdSection: '1.5.2',
        templateType: 'micro',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m1-meetings',
    label: 'Meeting Information',
    ctdSection: '1.7',
    templateType: 'starter',
    children: [
      {
        templateKey: 'tpl-pre-ind-meeting',
        label: 'Pre-IND Meeting Briefing Document',
        ctdSection: '1.7.1',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-eop2-meeting',
        label: 'End-of-Phase 2 Meeting Briefing Document',
        ctdSection: '1.7.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-pre-nda-meeting',
        label: 'Pre-NDA/BLA Meeting Briefing Document',
        ctdSection: '1.7.3',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m1-env-assessment',
    label: 'Environmental Assessment / Categorical Exclusion',
    ctdSection: '1.13',
    templateType: 'starter',
    children: [],
  },
  // ── Module 2: Summaries ──
  {
    templateKey: 'tpl-m2-2.3',
    label: 'Quality Overall Summary',
    ctdSection: '2.3',
    templateType: 'starter',
    appliesTo: 'IND, NDA, BLA',
    suggestedChildren: ['QOS Drug Substance', 'QOS Drug Product'],
    requiredBlocks: ['Introduction', 'Drug Substance', 'Drug Product'],
    optionalBlocks: ['Appendices', 'Regional Information'],
    children: [
      {
        templateKey: 'tpl-qos-ds',
        label: 'QOS Drug Substance',
        ctdSection: '2.3.S',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-qos-dp',
        label: 'QOS Drug Product',
        ctdSection: '2.3.P',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m2-2.4',
    label: 'Nonclinical Overview',
    ctdSection: '2.4',
    templateType: 'starter',
    children: [
      {
        templateKey: 'tpl-nc-pharmacology',
        label: 'Pharmacology Overview',
        ctdSection: '2.4',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-pk',
        label: 'Pharmacokinetics Overview',
        ctdSection: '2.4',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-tox',
        label: 'Toxicology Overview',
        ctdSection: '2.4',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m2-2.5',
    label: 'Clinical Overview',
    ctdSection: '2.5',
    templateType: 'starter',
    appliesTo: 'IND, NDA, BLA',
    suggestedChildren: ['Benefit-Risk Assessment', 'Clinical Context', 'Key Supporting Studies'],
    requiredBlocks: [
      'Product Development Rationale',
      'Overview of Clinical Pharmacology',
      'Overview of Efficacy',
      'Overview of Safety',
      'Benefits and Risks Conclusions',
    ],
    optionalBlocks: ['Regulatory Positioning', 'Regional Differences'],
    children: [
      {
        templateKey: 'tpl-benefit-risk',
        label: 'Benefit-Risk Assessment',
        ctdSection: '2.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-product-devt-rationale',
        label: 'Product Development Rationale',
        ctdSection: '2.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-clinical-context',
        label: 'Clinical Pharmacology Interpretation',
        ctdSection: '2.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-efficacy-interp',
        label: 'Efficacy Interpretation',
        ctdSection: '2.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-safety-interp',
        label: 'Safety Interpretation',
        ctdSection: '2.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-key-supporting-studies',
        label: 'Key Supporting Studies',
        ctdSection: '2.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-regulatory-positioning',
        label: 'Regulatory Positioning',
        ctdSection: '2.5',
        templateType: 'micro',
        children: [],
      },
      {
        templateKey: 'tpl-regional-differences',
        label: 'Regional Differences',
        ctdSection: '2.5',
        templateType: 'micro',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m2-2.6',
    label: 'Nonclinical Written & Tabulated Summaries',
    ctdSection: '2.6',
    templateType: 'starter',
    appliesTo: 'IND, NDA, BLA',
    suggestedChildren: [
      'Pharmacology Written Summary',
      'Pharmacology Tabulated Summary',
      'PK Written Summary',
      'PK Tabulated Summary',
      'Toxicology Written Summary',
      'Toxicology Tabulated Summary',
    ],
    requiredBlocks: [
      'Introduction',
      'Pharmacology Written Summary',
      'Pharmacology Tabulated Summary',
      'PK Written Summary',
      'PK Tabulated Summary',
      'Toxicology Written Summary',
      'Toxicology Tabulated Summary',
    ],
    optionalBlocks: [],
    children: [
      {
        templateKey: 'tpl-nc-pharm-written',
        label: 'Pharmacology Written Summary',
        ctdSection: '2.6.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-pharm-tab',
        label: 'Pharmacology Tabulated Summary',
        ctdSection: '2.6.3',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-pk-written',
        label: 'Pharmacokinetics Written Summary',
        ctdSection: '2.6.4',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-pk-tab',
        label: 'Pharmacokinetics Tabulated Summary',
        ctdSection: '2.6.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-tox-written',
        label: 'Toxicology Written Summary',
        ctdSection: '2.6.6',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-tox-tab',
        label: 'Toxicology Tabulated Summary',
        ctdSection: '2.6.7',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m2-2.7',
    label: 'Clinical Summary',
    ctdSection: '2.7',
    templateType: 'starter',
    appliesTo: 'IND, NDA, BLA',
    suggestedChildren: [
      'Biopharmaceutic Summary',
      'Clinical Pharmacology Summary',
      'Efficacy Summary',
      'Safety Summary',
    ],
    requiredBlocks: [
      'Summary of Biopharmaceutic Studies',
      'Summary of Clinical Pharmacology',
      'Summary of Clinical Efficacy',
      'Summary of Clinical Safety',
    ],
    optionalBlocks: ['Literature References', 'Synopses of Individual Studies'],
    children: [
      {
        templateKey: 'tpl-biopharm-summary',
        label: 'Biopharmaceutic Summary',
        ctdSection: '2.7.1',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-pk-summary',
        label: 'Clinical Pharmacology Summary',
        ctdSection: '2.7.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-efficacy-summary',
        label: 'Efficacy Summary',
        ctdSection: '2.7.3',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-safety-summary',
        label: 'Safety Summary',
        ctdSection: '2.7.4',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-clin-lit-refs',
        label: 'Literature References',
        ctdSection: '2.7.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-synopses-individual',
        label: 'Synopses of Individual Studies',
        ctdSection: '2.7.6',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  // ── Module 3: Quality ──
  {
    templateKey: 'tpl-m3-3.2.S',
    label: 'Drug Substance',
    ctdSection: '3.2.S',
    templateType: 'starter',
    appliesTo: 'IND, NDA, BLA, ANDA',
    suggestedChildren: [
      'General Information',
      'Manufacture',
      'Characterisation',
      'Control of Drug Substance',
      'Reference Standards',
      'Container Closure System',
      'Stability',
    ],
    requiredBlocks: [
      'General Information',
      'Manufacture',
      'Control of Drug Substance',
      'Stability',
    ],
    optionalBlocks: ['Reference Standards', 'Container Closure System'],
    children: [
      {
        templateKey: 'tpl-ds-gen-info',
        label: 'General Information',
        ctdSection: '3.2.S.1',
        templateType: 'subsection',
        children: [
          {
            templateKey: 'tpl-ds-nomenclature',
            label: 'Nomenclature',
            ctdSection: '3.2.S.1',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-ds-structure',
            label: 'Structure',
            ctdSection: '3.2.S.1',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-ds-gen-properties',
            label: 'General Properties',
            ctdSection: '3.2.S.1',
            templateType: 'micro',
            children: [],
          },
        ],
      },
      {
        templateKey: 'tpl-ds-manufacture',
        label: 'Manufacture',
        ctdSection: '3.2.S.2',
        templateType: 'subsection',
        children: [
          {
            templateKey: 'tpl-ds-mfg-info',
            label: 'Manufacturer Info',
            ctdSection: '3.2.S.2',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-ds-process-desc',
            label: 'Process Description',
            ctdSection: '3.2.S.2',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-ds-materials-ctrl',
            label: 'Controls of Materials',
            ctdSection: '3.2.S.2',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-ds-process-ctrl',
            label: 'Process Controls',
            ctdSection: '3.2.S.2',
            templateType: 'micro',
            children: [],
          },
        ],
      },
      {
        templateKey: 'tpl-ds-characterisation',
        label: 'Characterisation',
        ctdSection: '3.2.S.3',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-ds-control',
        label: 'Control of Drug Substance',
        ctdSection: '3.2.S.4',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-ds-ref-standards',
        label: 'Reference Standards',
        ctdSection: '3.2.S.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-ds-container',
        label: 'Container Closure System',
        ctdSection: '3.2.S.6',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-ds-stability',
        label: 'Stability',
        ctdSection: '3.2.S.7',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m3-3.2.P',
    label: 'Drug Product',
    ctdSection: '3.2.P',
    templateType: 'starter',
    appliesTo: 'IND, NDA, BLA, ANDA',
    suggestedChildren: [
      'Description & Composition',
      'Pharmaceutical Development',
      'Manufacture',
      'Control of Excipients',
      'Control of Drug Product',
      'Reference Standards',
      'Container Closure',
      'Stability',
    ],
    requiredBlocks: [
      'Description & Composition',
      'Pharmaceutical Development',
      'Manufacture',
      'Control of Drug Product',
      'Stability',
    ],
    optionalBlocks: ['Control of Excipients', 'Reference Standards', 'Container Closure System'],
    children: [
      {
        templateKey: 'tpl-dp-desc',
        label: 'Description & Composition',
        ctdSection: '3.2.P.1',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-dp-devt',
        label: 'Pharmaceutical Development',
        ctdSection: '3.2.P.2',
        templateType: 'subsection',
        children: [
          {
            templateKey: 'tpl-dp-formulation',
            label: 'Formulation Development',
            ctdSection: '3.2.P.2',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-dp-mfg-process-devt',
            label: 'Manufacturing Process Development',
            ctdSection: '3.2.P.2',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-dp-container-devt',
            label: 'Container Closure Development',
            ctdSection: '3.2.P.2',
            templateType: 'micro',
            children: [],
          },
        ],
      },
      {
        templateKey: 'tpl-dp-manufacture',
        label: 'Manufacture',
        ctdSection: '3.2.P.3',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-dp-excipients',
        label: 'Control of Excipients',
        ctdSection: '3.2.P.4',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-dp-control',
        label: 'Control of Drug Product',
        ctdSection: '3.2.P.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-dp-ref-standards',
        label: 'Reference Standards',
        ctdSection: '3.2.P.6',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-dp-container',
        label: 'Container Closure System',
        ctdSection: '3.2.P.7',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-dp-stability',
        label: 'Stability',
        ctdSection: '3.2.P.8',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  // ── Module 4: Nonclinical ──
  {
    templateKey: 'tpl-m4-4.2',
    label: 'Nonclinical Study Reports',
    ctdSection: '4.2',
    templateType: 'starter',
    children: [
      {
        templateKey: 'tpl-nc-pharm-primary',
        label: 'Primary Pharmacodynamics',
        ctdSection: '4.2.1.1',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-pharm-secondary',
        label: 'Secondary Pharmacodynamics',
        ctdSection: '4.2.1.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-safety-pharm',
        label: 'Safety Pharmacology',
        ctdSection: '4.2.1.3',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-pk-studies',
        label: 'Pharmacokinetics Studies',
        ctdSection: '4.2.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-tox-single',
        label: 'Single-Dose Toxicity',
        ctdSection: '4.2.3.1',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-tox-repeat',
        label: 'Repeat-Dose Toxicity',
        ctdSection: '4.2.3.2',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-genotox',
        label: 'Genotoxicity',
        ctdSection: '4.2.3.3',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-nc-repro-tox',
        label: 'Reproductive & Developmental Toxicity',
        ctdSection: '4.2.3.5',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  // ── Module 5: Clinical ──
  {
    templateKey: 'tpl-m5-5.2',
    label: 'Tabular Listing of Clinical Studies',
    ctdSection: '5.2',
    templateType: 'starter',
    children: [],
  },
  {
    templateKey: 'tpl-m5-csr',
    label: 'Clinical Study Report',
    ctdSection: '5.3.5',
    templateType: 'starter',
    appliesTo: 'IND, NDA, BLA',
    suggestedChildren: [
      'Study Synopsis',
      'Study Protocol',
      'Statistical Analysis Plan',
      'Efficacy Results',
      'Safety Results',
    ],
    requiredBlocks: [
      'Synopsis',
      'Introduction',
      'Study Objectives',
      'Investigational Plan',
      'Study Patients',
      'Efficacy Evaluation',
      'Safety Evaluation',
      'Discussion and Overall Conclusions',
    ],
    optionalBlocks: ['Tables, Figures, and Graphs', 'Reference List', 'Appendices'],
    children: [
      {
        templateKey: 'tpl-csr-synopsis',
        label: 'Study Synopsis',
        ctdSection: '5.3.5',
        templateType: 'subsection',
        children: [
          {
            templateKey: 'tpl-csr-synopsis-design',
            label: 'Study Design Summary',
            ctdSection: '5.3.5',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-csr-synopsis-results',
            label: 'Results Summary',
            ctdSection: '5.3.5',
            templateType: 'micro',
            children: [],
          },
        ],
      },
      {
        templateKey: 'tpl-csr-protocol',
        label: 'Study Protocol',
        ctdSection: '5.3.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-csr-sap',
        label: 'Statistical Analysis Plan',
        ctdSection: '5.3.5',
        templateType: 'subsection',
        children: [],
      },
      {
        templateKey: 'tpl-csr-efficacy',
        label: 'Efficacy Results',
        ctdSection: '5.3.5',
        templateType: 'subsection',
        children: [
          {
            templateKey: 'tpl-csr-endpoint-rationale',
            label: 'Endpoint Rationale',
            ctdSection: '5.3.5',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-csr-population',
            label: 'Population Summary',
            ctdSection: '5.3.5',
            templateType: 'micro',
            children: [],
          },
          {
            templateKey: 'tpl-csr-stat-interp',
            label: 'Statistical Interpretation',
            ctdSection: '5.3.5',
            templateType: 'micro',
            children: [],
          },
        ],
      },
      {
        templateKey: 'tpl-csr-safety',
        label: 'Safety Results',
        ctdSection: '5.3.5',
        templateType: 'subsection',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m5-5.3.7',
    label: 'Case Report Forms & Patient Listings',
    ctdSection: '5.3.7',
    templateType: 'starter',
    children: [],
  },
];

// ── Utilities ────────────────────────────────────────────────────────────────

/** Flatten the tree into an array of all nodes. */
export function flattenDossierTree(nodes: DossierNode[]): DossierNode[] {
  const result: DossierNode[] = [];
  function walk(n: DossierNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Find a node by ctdSection code (e.g. "3.2.S.1"). */
export function findNodeBySection(nodes: DossierNode[], section: string): DossierNode | undefined {
  for (const n of nodes) {
    if (n.ctdSection === section) return n;
    const found = findNodeBySection(n.children, section);
    if (found) return found;
  }
  return undefined;
}

/** Get CTD section label from code. */
export function getSectionLabel(section: string): string {
  const node = findNodeBySection(CTD_HIERARCHY, section);
  return node?.label ?? section;
}

/** Check if a CTD section code is a valid node in the hierarchy. */
export function isValidSection(section: string): boolean {
  return !!findNodeBySection(CTD_HIERARCHY, section);
}

/** Count all leaf (bottommost) nodes. */
export function countLeafNodes(nodes: DossierNode[]): number {
  let count = 0;
  function walk(n: DossierNode) {
    if (n.children.length === 0) count++;
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return count;
}

/** Find a TemplateNode by templateKey in the IND_TEMPLATES tree. */
export function findTemplateByKey(key: string): TemplateNode | null {
  function walk(nodes: TemplateNode[]): TemplateNode | null {
    for (const n of nodes) {
      if (n.templateKey === key) return n;
      const found = walk(n.children);
      if (found) return found;
    }
    return null;
  }
  return walk(IND_TEMPLATES);
}

// ── Phase 4 helpers ──────────────────────────────────────────────────────────

/** Get expected template structure for a given artifact based on its templateId. */
export function getTemplateStructureForArtifact(artifact: {
  templateId?: string | null;
  ctdSection?: string | null;
}): TemplateStructureNode[] | null {
  if (artifact.templateId) {
    const structure = TEMPLATE_STRUCTURE_MAP[artifact.templateId];
    if (structure) return structure;
  }
  // Fallback: find templates for the artifact's CTD section
  if (artifact.ctdSection) {
    const templates = findTemplatesByCTDSection(IND_TEMPLATES, artifact.ctdSection);
    for (const t of templates) {
      const structure = TEMPLATE_STRUCTURE_MAP[t.templateKey];
      if (structure) return structure;
    }
  }
  return null;
}

/** Get expected document types for a given CTD section. */
export function getExpectedDocTypesForSection(section: string): string[] {
  return SECTION_DOC_TYPES[section] || ['regulatory_document'];
}

/** Verification rules for a section: placement, template, governance checks. */
export interface VerificationRule {
  dimension: 'placement' | 'template' | 'evidence' | 'governance';
  label: string;
  check: string; // deterministic | heuristic | inferred
}

export function getVerificationRulesForSection(section: string): VerificationRule[] {
  const rules: VerificationRule[] = [];
  const node = findNodeBySection(CTD_HIERARCHY, section);
  if (!node) return rules;

  // Placement rules
  const expectedTypes = SECTION_DOC_TYPES[section];
  if (expectedTypes) {
    rules.push({ dimension: 'placement', label: `Expected doc types: ${expectedTypes.join(', ')}`, check: 'deterministic' });
  }
  rules.push({ dimension: 'placement', label: `Section is ${OPTIONAL_SECTIONS.has(section) ? 'optional' : 'required'}`, check: 'deterministic' });

  // Template rules
  const templates = findTemplatesByCTDSection(IND_TEMPLATES, section);
  if (templates.length > 0) {
    const structure = TEMPLATE_STRUCTURE_MAP[templates[0].templateKey];
    if (structure) {
      const requiredBlocks = structure.filter(s => s.required);
      rules.push({ dimension: 'template', label: `${requiredBlocks.length} required subsections`, check: 'deterministic' });
    }
  }

  // Evidence rules
  rules.push({ dimension: 'evidence', label: 'Evidence linkage via source_input events', check: 'inferred' });

  // Governance rules
  rules.push({ dimension: 'governance', label: 'Status lifecycle + signature + integrity', check: 'deterministic' });

  return rules;
}

/** Submission app candidate definition. */
export interface SubmissionAppCandidate {
  appId: string;
  label: string;
  targetDocType: string;
  defaultCtdSection: string;
  templateKey?: string;
  requiredInputs: string[];
  description: string;
}

const SUBMISSION_APPS: SubmissionAppCandidate[] = [
  {
    appId: 'evidence-memo',
    label: 'Evidence Memo',
    targetDocType: 'evidence_memo',
    defaultCtdSection: '5.3',
    templateKey: 'tpl-m5-csr',
    requiredInputs: ['evidence_set', 'target_topic'],
    description: 'Generate an evidence summary memo from CSR/precedent search results.',
  },
  {
    appId: 'protocol-rationale',
    label: 'Protocol Rationale',
    targetDocType: 'protocol_rationale',
    defaultCtdSection: '5.3.5',
    templateKey: 'tpl-m5-csr',
    requiredInputs: ['study_design', 'indication'],
    description: 'Generate rationale document for clinical protocol design choices.',
  },
  {
    appId: 'clinical-overview',
    label: 'Clinical Overview',
    targetDocType: 'clinical_overview',
    defaultCtdSection: '2.5',
    templateKey: 'tpl-m2-2.5',
    requiredInputs: ['clinical_data', 'indication'],
    description: 'Generate CTD Module 2.5 Clinical Overview document.',
  },
  {
    appId: 'module3-builder',
    label: 'Module 3 Builder',
    targetDocType: 'regulatory_document',
    defaultCtdSection: '3.2.S',
    templateKey: 'tpl-ds-gen-info',
    requiredInputs: ['cmc_data', 'target_subsection'],
    description: 'Generate or extend Module 3 Quality section documents.',
  },
  {
    appId: 'risk-benefit',
    label: 'Risk-Benefit Analysis',
    targetDocType: 'risk_benefit_analysis',
    defaultCtdSection: '2.5',
    templateKey: 'tpl-m2-2.5',
    requiredInputs: ['efficacy_data', 'safety_data'],
    description: 'Generate structured risk-benefit assessment for submission.',
  },
  {
    appId: 'audit-report',
    label: 'Audit Report',
    targetDocType: 'audit_report',
    defaultCtdSection: '1.3',
    requiredInputs: ['artifact_id'],
    description: 'Generate inspection-ready audit report for a governed artifact.',
  },
];

/** Get submission app candidates that match a section + artifact type. */
export function getSubmissionAppCandidates(
  section?: string,
  artifactType?: string,
  templateKey?: string
): SubmissionAppCandidate[] {
  return SUBMISSION_APPS.filter(app => {
    if (section && app.defaultCtdSection === section) return true;
    if (artifactType && app.targetDocType === artifactType) return true;
    if (templateKey && app.templateKey === templateKey) return true;
    return false;
  });
}

/** Get all available submission apps. */
export function getAllSubmissionApps(): SubmissionAppCandidate[] {
  return SUBMISSION_APPS;
}
