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

export type DossierNodeType = 'module' | 'section' | 'subsection' | 'placeholder' | 'document';

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

// ── Template node (for TemplateTree) ─────────────────────────────────────────

export interface TemplateNode {
  templateKey: string;
  label: string;
  ctdSection: string;
  description?: string;
  parentTemplateKey?: string;
  children: TemplateNode[];
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

export const IND_TEMPLATES: TemplateNode[] = [
  {
    templateKey: 'tpl-m2-2.5',
    label: 'Clinical Overview',
    ctdSection: '2.5',
    children: [
      {
        templateKey: 'tpl-benefit-risk',
        label: 'Benefit-Risk Assessment',
        ctdSection: '2.5',
        children: [],
      },
      {
        templateKey: 'tpl-clinical-context',
        label: 'Clinical Context',
        ctdSection: '2.5',
        children: [],
      },
      {
        templateKey: 'tpl-key-supporting-studies',
        label: 'Key Supporting Studies',
        ctdSection: '2.5',
        children: [],
      },
      {
        templateKey: 'tpl-regulatory-positioning',
        label: 'Regulatory Positioning',
        ctdSection: '2.5',
        children: [],
      },
      {
        templateKey: 'tpl-regional-differences',
        label: 'Regional Differences',
        ctdSection: '2.5',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m2-2.7',
    label: 'Clinical Summary',
    ctdSection: '2.7',
    children: [
      {
        templateKey: 'tpl-biopharm-summary',
        label: 'Biopharmaceutic Summary',
        ctdSection: '2.7.1',
        children: [],
      },
      {
        templateKey: 'tpl-pk-summary',
        label: 'Clinical Pharmacology Summary',
        ctdSection: '2.7.2',
        children: [],
      },
      {
        templateKey: 'tpl-efficacy-summary',
        label: 'Efficacy Summary',
        ctdSection: '2.7.3',
        children: [],
      },
      {
        templateKey: 'tpl-safety-summary',
        label: 'Safety Summary',
        ctdSection: '2.7.4',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m3-3.2.S',
    label: 'Drug Substance',
    ctdSection: '3.2.S',
    children: [
      {
        templateKey: 'tpl-ds-gen-info',
        label: 'General Information',
        ctdSection: '3.2.S.1',
        children: [],
      },
      {
        templateKey: 'tpl-ds-manufacture',
        label: 'Manufacture',
        ctdSection: '3.2.S.2',
        children: [],
      },
      {
        templateKey: 'tpl-ds-characterisation',
        label: 'Characterisation',
        ctdSection: '3.2.S.3',
        children: [],
      },
      {
        templateKey: 'tpl-ds-control',
        label: 'Control of Drug Substance',
        ctdSection: '3.2.S.4',
        children: [],
      },
      {
        templateKey: 'tpl-ds-ref-standards',
        label: 'Reference Standards',
        ctdSection: '3.2.S.5',
        children: [],
      },
      {
        templateKey: 'tpl-ds-container',
        label: 'Container Closure System',
        ctdSection: '3.2.S.6',
        children: [],
      },
      { templateKey: 'tpl-ds-stability', label: 'Stability', ctdSection: '3.2.S.7', children: [] },
    ],
  },
  {
    templateKey: 'tpl-m3-3.2.P',
    label: 'Drug Product',
    ctdSection: '3.2.P',
    children: [
      {
        templateKey: 'tpl-dp-desc',
        label: 'Description & Composition',
        ctdSection: '3.2.P.1',
        children: [],
      },
      {
        templateKey: 'tpl-dp-devt',
        label: 'Pharmaceutical Development',
        ctdSection: '3.2.P.2',
        children: [],
      },
      {
        templateKey: 'tpl-dp-manufacture',
        label: 'Manufacture',
        ctdSection: '3.2.P.3',
        children: [],
      },
      {
        templateKey: 'tpl-dp-excipients',
        label: 'Control of Excipients',
        ctdSection: '3.2.P.4',
        children: [],
      },
      {
        templateKey: 'tpl-dp-control',
        label: 'Control of Drug Product',
        ctdSection: '3.2.P.5',
        children: [],
      },
      {
        templateKey: 'tpl-dp-ref-standards',
        label: 'Reference Standards',
        ctdSection: '3.2.P.6',
        children: [],
      },
      {
        templateKey: 'tpl-dp-container',
        label: 'Container Closure System',
        ctdSection: '3.2.P.7',
        children: [],
      },
      { templateKey: 'tpl-dp-stability', label: 'Stability', ctdSection: '3.2.P.8', children: [] },
    ],
  },
  {
    templateKey: 'tpl-m2-2.4',
    label: 'Nonclinical Overview',
    ctdSection: '2.4',
    children: [
      {
        templateKey: 'tpl-nc-pharmacology',
        label: 'Pharmacology Overview',
        ctdSection: '2.4',
        children: [],
      },
      {
        templateKey: 'tpl-nc-pk',
        label: 'Pharmacokinetics Overview',
        ctdSection: '2.4',
        children: [],
      },
      { templateKey: 'tpl-nc-tox', label: 'Toxicology Overview', ctdSection: '2.4', children: [] },
    ],
  },
  {
    templateKey: 'tpl-m1-cover',
    label: 'Cover Letter',
    ctdSection: '1.2',
    children: [
      {
        templateKey: 'tpl-cover-initial',
        label: 'Initial IND Cover Letter',
        ctdSection: '1.2',
        children: [],
      },
      {
        templateKey: 'tpl-cover-amendment',
        label: 'Amendment Cover Letter',
        ctdSection: '1.2',
        children: [],
      },
    ],
  },
  {
    templateKey: 'tpl-m5-csr',
    label: 'Clinical Study Report',
    ctdSection: '5.3.5',
    children: [
      { templateKey: 'tpl-csr-synopsis', label: 'Synopsis', ctdSection: '5.3.5', children: [] },
      {
        templateKey: 'tpl-csr-protocol',
        label: 'Study Protocol',
        ctdSection: '5.3.5',
        children: [],
      },
      {
        templateKey: 'tpl-csr-sap',
        label: 'Statistical Analysis Plan',
        ctdSection: '5.3.5',
        children: [],
      },
      {
        templateKey: 'tpl-csr-efficacy',
        label: 'Efficacy Results',
        ctdSection: '5.3.5',
        children: [],
      },
      { templateKey: 'tpl-csr-safety', label: 'Safety Results', ctdSection: '5.3.5', children: [] },
    ],
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
