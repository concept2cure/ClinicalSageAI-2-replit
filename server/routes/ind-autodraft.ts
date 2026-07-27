/**
 * IND AutoDraft Engine — Compete with Weave.bio AutoIND
 *
 * Closes Gap #2: AI-powered IND section auto-drafting from source data.
 *
 * Features:
 *  1. Upload source documents (nonclinical reports, CMC data, protocols)
 *  2. AI extracts structured data and builds knowledge graph
 *  3. Auto-generates complete IND sections with source traceability
 *  4. Sentence-level source linking for every generated claim
 *  5. One-click full IND draft generation
 *
 * Covers all 5 CTD modules for IND:
 *  - Module 1: Administrative (cover letter, forms 1571/1572)
 *  - Module 2: CTD Summaries (2.4 Nonclinical, 2.5 Clinical, 2.6 Pharm/Tox, 2.7 Clinical Summary)
 *  - Module 3: Quality (drug substance, drug product, stability)
 *  - Module 4: Nonclinical Study Reports
 *  - Module 5: Clinical Study Reports
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ─── Section Definitions ────────────────────────────────────────────────────

interface INDSection {
  id: string;
  module: string;
  sectionCode: string;
  title: string;
  required: boolean;
  autoGeneratable: boolean;
  sourceTypes: string[];
  estimatedMinutes: number;
}

const IND_SECTIONS: INDSection[] = [
  // Module 1
  { id: 'm1-cover', module: '1', sectionCode: '1.0', title: 'Cover Letter', required: true, autoGeneratable: true, sourceTypes: ['protocol', 'cmc'], estimatedMinutes: 2 },
  { id: 'm1-1571', module: '1', sectionCode: '1.1', title: 'FDA Form 1571', required: true, autoGeneratable: true, sourceTypes: ['protocol', 'sponsor_info'], estimatedMinutes: 3 },
  { id: 'm1-toc', module: '1', sectionCode: '1.2', title: 'Table of Contents', required: true, autoGeneratable: true, sourceTypes: [], estimatedMinutes: 1 },

  // Module 2 — Summaries
  { id: 'm2-intro', module: '2', sectionCode: '2.1', title: 'CTD Introduction', required: true, autoGeneratable: true, sourceTypes: ['protocol', 'ib'], estimatedMinutes: 5 },
  { id: 'm2-quality', module: '2', sectionCode: '2.3', title: 'Quality Overall Summary', required: true, autoGeneratable: true, sourceTypes: ['cmc', 'stability', 'analytical'], estimatedMinutes: 15 },
  { id: 'm2-nonclinical', module: '2', sectionCode: '2.4', title: 'Nonclinical Overview', required: true, autoGeneratable: true, sourceTypes: ['pharmacology', 'toxicology', 'pk'], estimatedMinutes: 20 },
  { id: 'm2-clinical', module: '2', sectionCode: '2.5', title: 'Clinical Overview', required: true, autoGeneratable: true, sourceTypes: ['protocol', 'csr', 'clinical_pharm'], estimatedMinutes: 20 },
  { id: 'm2-nonclin-summary', module: '2', sectionCode: '2.6', title: 'Nonclinical Written & Tabulated Summaries', required: true, autoGeneratable: true, sourceTypes: ['pharmacology', 'toxicology', 'pk'], estimatedMinutes: 30 },
  { id: 'm2-clinical-summary', module: '2', sectionCode: '2.7', title: 'Clinical Summary', required: false, autoGeneratable: true, sourceTypes: ['csr', 'protocol', 'clinical_pharm'], estimatedMinutes: 25 },

  // Module 3 — Quality
  { id: 'm3-ds', module: '3', sectionCode: '3.2.S', title: 'Drug Substance', required: true, autoGeneratable: true, sourceTypes: ['cmc', 'analytical', 'stability'], estimatedMinutes: 20 },
  { id: 'm3-dp', module: '3', sectionCode: '3.2.P', title: 'Drug Product', required: true, autoGeneratable: true, sourceTypes: ['cmc', 'analytical', 'stability'], estimatedMinutes: 20 },

  // Module 4 — Nonclinical
  { id: 'm4-pharm', module: '4', sectionCode: '4.2.1', title: 'Pharmacology Studies', required: true, autoGeneratable: true, sourceTypes: ['pharmacology'], estimatedMinutes: 10 },
  { id: 'm4-pk', module: '4', sectionCode: '4.2.2', title: 'Pharmacokinetics', required: true, autoGeneratable: true, sourceTypes: ['pk'], estimatedMinutes: 10 },
  { id: 'm4-tox', module: '4', sectionCode: '4.2.3', title: 'Toxicology', required: true, autoGeneratable: true, sourceTypes: ['toxicology'], estimatedMinutes: 15 },

  // Module 5 — Clinical
  { id: 'm5-protocol', module: '5', sectionCode: '5.3.5', title: 'Clinical Study Protocol', required: true, autoGeneratable: false, sourceTypes: ['protocol'], estimatedMinutes: 0 },
  { id: 'm5-ib', module: '5', sectionCode: '5.3.5.2', title: "Investigator's Brochure", required: true, autoGeneratable: true, sourceTypes: ['pharmacology', 'toxicology', 'pk', 'clinical_pharm'], estimatedMinutes: 30 },
];

interface AutoDraftResult {
  sectionId: string;
  sectionCode: string;
  title: string;
  status: 'generated' | 'pending' | 'error';
  content?: string | null;
  wordCount?: number;
  sourceLinks?: { sentenceIndex: number; sourceDoc: string; sourceSection: string; sourceExcerpt: string; confidence: number }[];
  generatedAt?: string;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** GET /api/ind-autodraft/sections — list all IND sections with auto-draft capability */
router.get('/sections', (_req: Request, res: Response) => {
  const totalMinutes = IND_SECTIONS.filter(s => s.autoGeneratable).reduce((sum, s) => sum + s.estimatedMinutes, 0);
  res.json({
    success: true,
    data: {
      sections: IND_SECTIONS,
      totalSections: IND_SECTIONS.length,
      autoGeneratable: IND_SECTIONS.filter(s => s.autoGeneratable).length,
      estimatedTotalMinutes: totalMinutes,
      estimatedHours: Math.round(totalMinutes / 60 * 10) / 10,
    },
  });
});

/** POST /api/ind-autodraft/generate-section — auto-draft a single IND section */
router.post('/generate-section', async (req: Request, res: Response) => {
  try {
    const { sectionId } = req.body;
    const section = IND_SECTIONS.find(s => s.id === sectionId);
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    res.json({
      success: true,
      data: pendingSectionResult(section),
      note: 'Auto-drafting requires the drafting pipeline and uploaded source documents. No content is generated or fabricated.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** POST /api/ind-autodraft/generate-full — auto-draft entire IND (all sections) */
router.post('/generate-full', async (_req: Request, res: Response) => {
  try {
    const results: AutoDraftResult[] = IND_SECTIONS.map(pendingSectionResult);

    res.json({
      success: true,
      data: {
        sections: results,
        summary: {
          totalSections: results.length,
          generated: 0,
          pending: results.length,
          totalWords: 0,
          totalSourceLinks: 0,
        },
      },
      note: 'Auto-drafting requires the drafting pipeline and uploaded source documents. No content is generated or fabricated.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

/** GET /api/ind-autodraft/source-map/:sectionId — get source traceability map for a section */
router.get('/source-map/:sectionId', (req: Request, res: Response) => {
  const section = IND_SECTIONS.find(s => s.id === req.params.sectionId);
  if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

  // No source-linking pipeline is wired. Return honest empty traceability rather
  // than fabricated source links or a hardcoded coverage percentage.
  res.json({
    success: true,
    data: {
      sectionId: section.id,
      sectionCode: section.sectionCode,
      title: section.title,
      sourceLinks: [],
      totalLinks: 0,
      coveragePercent: null,
    },
  });
});

// ─── Honest Un-generated Result ─────────────────────────────────────────────
// No drafting/LLM pipeline is wired to this route. Rather than fabricate IND
// prose, clinical/nonclinical values, or source citations, every section is
// returned as un-generated ('pending') with no content and no source links.
function pendingSectionResult(section: INDSection): AutoDraftResult {
  return {
    sectionId: section.id,
    sectionCode: section.sectionCode,
    title: section.title,
    status: 'pending',
    content: null,
    sourceLinks: [],
  };
}

export default router;
