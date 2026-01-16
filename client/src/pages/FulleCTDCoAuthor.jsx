/**
 * COMPLETE eCTD Co-Author System
 * Based on user's original working system from PDFs
 * Includes VAULT file explorer, document navigator, templates, and validation
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { indTemplates } from '@/data/ind-templates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import SENDValidationPanel from '@/components/ectd/SENDValidationPanel';
import ECTDDataCenterIntegration from '@/components/ectd/ECTDDataCenterIntegration';
import ECTDContentReuseManager from '@/components/ectd/ECTDContentReuseManager';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import CoAuthor_eCTD_Module_Review from '@/components/ectd/CoAuthor_eCTD_Module_Review';
import EnhancedDocumentEditor from '@/components/ectd/EnhancedDocumentEditor';
import ECTDValidationEngine from '@/components/ectd/ECTDValidationEngine';
import PredictiveRegulatoryAnalytics from '@/components/ectd/PredictiveRegulatoryAnalytics';
import GlobalSubmissionStrategy from '@/components/ectd/GlobalSubmissionStrategy';
import SmartSubmissionWizard from '@/components/ectd/SmartSubmissionWizard';
import IntegratedDataVisualization from '@/components/ectd/IntegratedDataVisualization';
import AutomatedSummarization from '@/components/ectd/AutomatedSummarization';
import LifecycleManager from '@/components/ectd/LifecycleManager';
import PublishingManager from '@/components/ectd/PublishingManager';
import ContextAwareGenerator from '@/components/ectd/ContextAwareGenerator';
import AuditTrailViewer from '@/components/ectd/AuditTrailViewer';
import GlobalConsistencyChecker from '@/components/ectd/GlobalConsistencyChecker';
import CollaborationHub from '@/components/ectd/CollaborationHub';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import {
  FileText, FolderOpen, Search, Plus, Download, Upload, Eye, Edit, Trash2, ChevronRight, ChevronDown, Lock, CheckCircle, AlertCircle, Clock, Users, BookOpen, Database, BarChart3, Filter, Settings, ExternalLink, Share2, History, Save, RefreshCw, Maximize2, Minimize2, Columns2 } from 'lucide-react'

export default function FulleCTDCoAuthor() {
  const { toast } = useToast();

  // Main state
  const [hideFileExplorer, setHideFileExplorer] = useState(false);
  const [hideNavigation, setHideNavigation] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('workspace');

  // Document creation state
  const [showNewDocumentDialog, setShowNewDocumentDialog] = useState(false);
  const [documentTitle, setDocumentTitle] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showCollaborationHub, setShowCollaborationHub] = useState(false);

  // In-app guidance
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState('quickstart');
  const [showQuickStart, setShowQuickStart] = useState(false);

  // Shared document model (same source as Data Center)
  const [apiDocuments, setApiDocuments] = useState([]);
  const [apiDocumentsLoading, setApiDocumentsLoading] = useState(false);
  const [apiDocumentsError, setApiDocumentsError] = useState(null);

  // View state for "View All" functionality
  const [showAllDocuments, setShowAllDocuments] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // Investor demo: Mock IND Library modal + search
  const [showMockLibrary, setShowMockLibrary] = useState(false);
  const [mockLibraryQuery, setMockLibraryQuery] = useState('');
  const [mockLibraryStage, setMockLibraryStage] = useState('All');

  const [editorMode, setEditorMode] = useState('tiptap'); // 'tiptap' | 'safe'
  const [zenMode, setZenMode] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ectd_coauthor_editor_mode_v1');
      if (saved === 'tiptap' || saved === 'safe') setEditorMode(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('ectd_coauthor_editor_mode_v1', editorMode);
    } catch {
      // ignore
    }
  }, [editorMode]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ectd_coauthor_zen_mode_v1');
      if (saved === 'true' || saved === 'false') setZenMode(saved === 'true');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('ectd_coauthor_zen_mode_v1', String(Boolean(zenMode)));
    } catch {
      // ignore
    }
  }, [zenMode]);

  useEffect(() => {
    if (!zenMode) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setZenMode(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zenMode]);

  useEffect(() => {
    if (!selectedDocument && zenMode) setZenMode(false);
  }, [selectedDocument, zenMode]);

  // Layout persistence (keeps the demo UI clean for meetings)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ectd_coauthor_layout_v1');
      const parsed = raw ? safeJsonParse(raw, null) : null;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.hideFileExplorer === 'boolean') setHideFileExplorer(parsed.hideFileExplorer);
        if (typeof parsed.hideNavigation === 'boolean') setHideNavigation(parsed.hideNavigation);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'ectd_coauthor_layout_v1',
        JSON.stringify({
          hideFileExplorer,
          hideNavigation,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }
  }, [hideFileExplorer, hideNavigation]);

  const focusMode = hideFileExplorer && hideNavigation;

  // Investor demo helpers (local, resilient to API availability)
  const getDemoStorageKey = (organizationId, projectId) => {
    const org = String(organizationId || 'demo');
    const proj = String(projectId || 'demo');
    return `ectd_coauthor_investor_demo_v1:${org}:${proj}`;
  };

  const safeJsonParse = (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const fillInvestorDemoPlaceholders = (raw) => {
    if (!raw) return '';
    let s = String(raw);

    const replacements = {
      '[SPONSOR NAME]': 'HelioNova Therapeutics, Inc.',
      '[SPONSOR LETTERHEAD]': 'HELIONOVA THERAPEUTICS, INC.\n1234 Innovation Way\nCambridge, MA 02139\nUSA',
      '[DATE]': 'January 13, 2026',
      '[DRUG NAME]': 'HN-101',
      '[GENERIC NAME]': 'helionovabine',
      '[IND NUMBER]': '159321',
      '[INDICATION]': 'Relapsed/Refractory Solid Tumors',
      '[ROUTE]': 'IV',
      '[DOSAGE FORM]': 'Sterile injectable solution',
      '[NAME]': 'Jordan Rivera',
      '[TITLE]': 'VP, Regulatory Affairs',
      '[PHONE]': '+1 (617) 555-0134',
      '[EMAIL]': 'regulatory@helionova.example',
      '[ADDRESS]': '1234 Innovation Way, Cambridge, MA 02139',
      '[CODE NAME]': 'HN-101',
      '[CLASS]': 'Small-molecule kinase inhibitor',
      '[NUMBER]': '1',
      '[SUBMISSION TYPE]': 'Initial IND',
      '[FAX]': '+1 (617) 555-0101',
    };

    Object.entries(replacements).forEach(([from, to]) => {
      s = s.split(from).join(to);
    });

    return s;
  };

  const buildInvestorDemoDocuments = () => {
    const pickById = (id) => indTemplates.find((t) => t.id === id);

    const mk = ({
      id,
      title,
      module,
      status,
      content,
      section,
      tags,
      updatedAt,
      workflow,
    }) => ({
      id,
      title,
      module,
      section,
      status,
      updatedAt: updatedAt || new Date().toISOString(),
      content,
      metadata: {
        demo: true,
        investor: true,
        tags: tags || [],
        workflow: workflow || null,
      },
    });

    const isoDaysAgo = (days) => {
      const d = new Date();
      d.setDate(d.getDate() - Number(days || 0));
      return d.toISOString();
    };

    const withDocControl = (body, docControl) => {
      const header = [
        '---',
        'DOCUMENT CONTROL (Mock IND)',
        `Sponsor: ${docControl.sponsor}`,
        `Program: ${docControl.program}`,
        `IND: ${docControl.indNumber}`,
        `Module: ${docControl.moduleLabel}`,
        `Section: ${docControl.section}`,
        `Stage: ${docControl.stage}`,
        `Version: ${docControl.version}`,
        `Owner: ${docControl.owner}`,
        `Reviewers: ${Array.isArray(docControl.reviewers) ? docControl.reviewers.join(', ') : docControl.reviewers}`,
        docControl.dueDate ? `Due: ${docControl.dueDate}` : null,
        docControl.lastChange ? `Last change: ${docControl.lastChange}` : null,
        '---',
        '',
      ].filter(Boolean);
      return header.join('\n') + (body || '');
    };

    const cover = pickById('ind-m1-cover');
    const form1571 = pickById('ind-m1-1571');
    const intro = pickById('ind-m2-intro');
    const ib = pickById('ind-m2-ib');
    const cmc = pickById('ind-m3-cmc');
    const m4 = pickById('ind-m4-pharm-tox');
    const m5 = indTemplates.find((t) => String(t.moduleId) === 'module5') || null;

    const docs = [
      mk({
        id: 'demo-m1-cover-letter',
        title: 'IND Module 1.0 – Cover Letter (Investor Demo)',
        module: 'module1',
        section: '1.0',
        status: 'draft',
        updatedAt: isoDaysAgo(12),
        workflow: {
          stage: 'Draft',
          version: 'v0.6',
          owner: 'Jordan Rivera (Reg Affairs)',
          reviewers: ['A. Patel (Clinical)', 'M. Chen (CMC)'],
          dueDate: 'Jan 20, 2026',
          lastChange: 'Updated submission type + meeting request language',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(cover?.content || ''),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 1',
            section: '1.0',
            stage: 'Draft',
            version: 'v0.6',
            owner: 'Jordan Rivera',
            reviewers: ['A. Patel', 'M. Chen'],
            dueDate: 'Jan 20, 2026',
            lastChange: 'Updated meeting request language',
          }
        ),
        tags: ['module1', 'administrative', 'ready-to-review'],
      }),
      mk({
        id: 'demo-m1-1571',
        title: 'IND Module 1.2 – Form FDA 1571 (Investor Demo)',
        module: 'module1',
        section: '1.2',
        status: 'in review',
        updatedAt: isoDaysAgo(7),
        workflow: {
          stage: 'In Review',
          version: 'v0.9',
          owner: 'Jordan Rivera (Reg Affairs)',
          reviewers: ['Legal (S. Nguyen)'],
          dueDate: 'Jan 16, 2026',
          lastChange: 'Updated address + investigator count',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(form1571?.content || ''),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 1',
            section: '1.2',
            stage: 'In Review',
            version: 'v0.9',
            owner: 'Jordan Rivera',
            reviewers: ['S. Nguyen (Legal)'],
            dueDate: 'Jan 16, 2026',
            lastChange: 'Updated sponsor address + investigator count',
          }
        ),
        tags: ['module1', 'form', 'in-review'],
      }),
      mk({
        id: 'demo-m1-1572',
        title: 'IND Module 1.3 – Form FDA 1572 (Site 001 Draft)',
        module: 'module1',
        section: '1.3',
        status: 'draft',
        updatedAt: isoDaysAgo(5),
        workflow: {
          stage: 'Draft',
          version: 'v0.3',
          owner: 'Trial Start-up (M. Brooks)',
          reviewers: ['Jordan Rivera (Reg Affairs)'],
          dueDate: 'Jan 18, 2026',
          lastChange: 'Added PI credentials + lab contact details',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(
            `FORM FDA 1572 (Mock)\n\nProtocol: HN-101-001\nSite: 001 (US)\nPrincipal Investigator: Dr. Taylor Reynolds, MD\nAddress: 200 Longwood Ave, Boston, MA 02115\nIRB: BayState IRB (Mock)\nLab: Central Lab - NeoLabs (Mock)\n\nNOTES (Mock):\n- Pending final CV attachment\n- Pending IRB approval letter\n- Confirm sub-investigator list\n`
          ),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 1',
            section: '1.3',
            stage: 'Draft',
            version: 'v0.3',
            owner: 'M. Brooks',
            reviewers: ['Jordan Rivera'],
            dueDate: 'Jan 18, 2026',
            lastChange: 'Added PI credentials + lab contact details',
          }
        ),
        tags: ['module1', 'form', 'site-startup', 'draft'],
      }),
      mk({
        id: 'demo-m1-3674',
        title: 'IND Module 1.4 – Form FDA 3674 (Final)',
        module: 'module1',
        section: '1.4',
        status: 'final',
        updatedAt: isoDaysAgo(3),
        workflow: {
          stage: 'Final',
          version: 'v1.0',
          owner: 'Jordan Rivera (Reg Affairs)',
          reviewers: ['S. Nguyen (Legal)'],
          dueDate: 'Jan 13, 2026',
          lastChange: 'Finalized clinicaltrials.gov certification language',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(
            `FORM FDA 3674 (Mock Final)\n\nCertification of Compliance (ClinicalTrials.gov Requirements)\n- Sponsor: [SPONSOR NAME]\n- IND: [IND NUMBER]\n- Applicable clinical trial registration: YES (planned upon first patient enrollment)\n\nSignature: [NAME], [TITLE]\nDate: [DATE]\n`
          ),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 1',
            section: '1.4',
            stage: 'Final',
            version: 'v1.0',
            owner: 'Jordan Rivera',
            reviewers: ['S. Nguyen'],
            dueDate: 'Jan 13, 2026',
            lastChange: 'Finalized certification language',
          }
        ),
        tags: ['module1', 'form', 'final'],
      }),
      mk({
        id: 'demo-m2-introduction',
        title: 'IND Module 2.2 – Introduction (Draft with SmartTags)',
        module: 'module2',
        section: '2.2',
        status: 'draft',
        updatedAt: isoDaysAgo(10),
        workflow: {
          stage: 'Draft',
          version: 'v0.5',
          owner: 'A. Patel (Clinical)',
          reviewers: ['Jordan Rivera (Reg Affairs)'],
          dueDate: 'Jan 21, 2026',
          lastChange: 'Inserted SmartTag placeholders for efficacy snapshot',
        },
        content:
          withDocControl(
            fillInvestorDemoPlaceholders(intro?.content || ''),
            {
              sponsor: 'HelioNova Therapeutics, Inc.',
              program: 'HN-101',
              indNumber: '159321',
              moduleLabel: 'Module 2',
              section: '2.2',
              stage: 'Draft',
              version: 'v0.5',
              owner: 'A. Patel',
              reviewers: ['Jordan Rivera'],
              dueDate: 'Jan 21, 2026',
              lastChange: 'Inserted SmartTag placeholders',
            }
          ) +
          "\n\nDATA-BOUND TOKENS (demo):\n- ⟦Hazard Ratio (PFS): 0.45 | ADSL.HR_PFS | TLF-14.2.1 | v1.0⟧\n- ⟦Median PFS (months): 8.7 | ADSL.MEDPFS | TLF-14.2.1 | v1.0⟧\n\nReviewer notes: Replace demo values with your study outputs.",
        tags: ['module2', 'smarttags', 'draft'],
      }),
      mk({
        id: 'demo-m2-investigators-brochure',
        title: "IND Module 2.3 – Investigator’s Brochure (In Progress)",
        module: 'module2',
        section: '2.3',
        status: 'draft',
        updatedAt: isoDaysAgo(8),
        workflow: {
          stage: 'In Progress',
          version: 'v0.2',
          owner: 'Medical Writing (K. Alvarez)',
          reviewers: ['Nonclinical (R. Singh)', 'Clinical (A. Patel)'],
          dueDate: 'Jan 28, 2026',
          lastChange: 'Added tox table placeholders + investigator guidance stub',
        },
        content:
          withDocControl(
            fillInvestorDemoPlaceholders(ib?.content || ''),
            {
              sponsor: 'HelioNova Therapeutics, Inc.',
              program: 'HN-101',
              indNumber: '159321',
              moduleLabel: 'Module 2',
              section: '2.3',
              stage: 'In Progress',
              version: 'v0.2',
              owner: 'K. Alvarez',
              reviewers: ['R. Singh', 'A. Patel'],
              dueDate: 'Jan 28, 2026',
              lastChange: 'Added tox table placeholders',
            }
          ) +
          "\n\nIN-PROGRESS SECTIONS (demo):\n- Nonclinical tox summary: pending GLP final report\n- First-in-human dose rationale: draft\n- Investigator guidance: needs SME review", 
        tags: ['module2', 'ib', 'in-progress'],
      }),
      mk({
        id: 'demo-m2-qos',
        title: 'IND Module 2.3 – Quality Overall Summary (CMC) (In Review)',
        module: 'module2',
        section: '2.3.QOS',
        status: 'in review',
        updatedAt: isoDaysAgo(4),
        workflow: {
          stage: 'In Review',
          version: 'v0.8',
          owner: 'CMC (M. Chen)',
          reviewers: ['QA (P. Williams)', 'Jordan Rivera (Reg Affairs)'],
          dueDate: 'Jan 17, 2026',
          lastChange: 'Updated DS impurity control strategy summary',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(
            `QUALITY OVERALL SUMMARY (Mock)\n\nDrug Substance:\n- Manufacturer: CMO Partner A (Mock)\n- Control strategy: identity/potency/impurities with validated methods\n\nDrug Product:\n- Presentation: 10 mg/mL vial (single-use)\n- Container closure: type I glass vial + stopper\n\nCritical Quality Attributes (Mock):\n- Potency: ⟦Potency_Assay: 98.6% | QC.POTENCY | TLF-3.2.S.4 | v0.8⟧\n- Impurity A: ⟦Impurity_A: 0.12% | QC.IMP_A | TLF-3.2.S.4 | v0.8⟧\n\nReviewer notes (Mock):\n- Confirm acceptance criteria align with ICH Q3A/Q3B\n- Add batch genealogy summary once PPQ lots available\n`
          ),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 2',
            section: '2.3',
            stage: 'In Review',
            version: 'v0.8',
            owner: 'M. Chen',
            reviewers: ['P. Williams', 'Jordan Rivera'],
            dueDate: 'Jan 17, 2026',
            lastChange: 'Updated impurity control strategy',
          }
        ),
        tags: ['module2', 'qos', 'cmc', 'in-review'],
      }),
      mk({
        id: 'demo-m3-cmc',
        title: 'IND Module 3 – CMC Overview + Controls (Draft)',
        module: 'module3',
        section: '3.0',
        status: 'draft',
        updatedAt: isoDaysAgo(9),
        workflow: {
          stage: 'Draft',
          version: 'v0.4',
          owner: 'CMC (M. Chen)',
          reviewers: ['QA (P. Williams)'],
          dueDate: 'Jan 24, 2026',
          lastChange: 'Added stability snapshot + release testing list',
        },
        content:
          withDocControl(
            fillInvestorDemoPlaceholders(cmc?.content || ''),
            {
              sponsor: 'HelioNova Therapeutics, Inc.',
              program: 'HN-101',
              indNumber: '159321',
              moduleLabel: 'Module 3',
              section: '3.0',
              stage: 'Draft',
              version: 'v0.4',
              owner: 'M. Chen',
              reviewers: ['P. Williams'],
              dueDate: 'Jan 24, 2026',
              lastChange: 'Added stability snapshot + release tests',
            }
          ) +
          "\n\nDEMO CMC SNAPSHOT:\n- DS manufacturer: HelioNova CMO Partner A (GMP)\n- DP presentation: 10 mg/mL vial (single-use)\n- Release tests: identity, potency, impurities, endotoxin, sterility\n- Stability: 3-month accelerated data; 12-month long-term ongoing", 
        tags: ['module3', 'cmc', 'draft'],
      }),
      mk({
        id: 'demo-m3-specs',
        title: 'IND Module 3.2 – Drug Substance Specifications (Ready for QA)',
        module: 'module3',
        section: '3.2',
        status: 'review',
        updatedAt: isoDaysAgo(2),
        workflow: {
          stage: 'Ready for QA',
          version: 'v0.9',
          owner: 'QC (L. Johnson)',
          reviewers: ['QA (P. Williams)'],
          dueDate: 'Jan 14, 2026',
          lastChange: 'Aligned specs table with method validation status',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(
            `DRUG SUBSTANCE SPECIFICATIONS (Mock)\n\nTests / Acceptance Criteria (Mock):\n- Identity: Pass\n- Assay: 98.0–102.0%\n- Impurities: Total ≤ 1.0%; Any single ≤ 0.3%\n- Residual solvents: per ICH Q3C\n- Water: ≤ 1.0%\n\nSmartTags (Mock):\n- ⟦Assay_Result: 99.1% | QC.ASSAY | TLF-3.2.S.4 | v0.9 | status=verified⟧\n- ⟦Total_Impurities: 0.42% | QC.TOT_IMP | TLF-3.2.S.4 | v0.9 | status=verified⟧\n\nQA checklist (Mock):\n- Verify methods validated / qualified\n- Confirm batch/lot references\n- Confirm impurity reporting threshold\n`
          ),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 3',
            section: '3.2',
            stage: 'Ready for QA',
            version: 'v0.9',
            owner: 'L. Johnson',
            reviewers: ['P. Williams'],
            dueDate: 'Jan 14, 2026',
            lastChange: 'Aligned specs with validation status',
          }
        ),
        tags: ['module3', 'cmc', 'qa'],
      }),
      mk({
        id: 'demo-m4-pharm-tox',
        title: 'IND Module 4 – Pharm/Tox Summary (Draft)',
        module: 'module4',
        section: '4.0',
        status: 'draft',
        updatedAt: isoDaysAgo(6),
        workflow: {
          stage: 'Draft',
          version: 'v0.3',
          owner: 'Nonclinical (R. Singh)',
          reviewers: ['A. Patel (Clinical)'],
          dueDate: 'Jan 25, 2026',
          lastChange: 'Updated tox study status + TK summary placeholders',
        },
        content:
          withDocControl(
            fillInvestorDemoPlaceholders(m4?.content || 'MODULE 4 – PHARMACOLOGY AND TOXICOLOGY'),
            {
              sponsor: 'HelioNova Therapeutics, Inc.',
              program: 'HN-101',
              indNumber: '159321',
              moduleLabel: 'Module 4',
              section: '4.0',
              stage: 'Draft',
              version: 'v0.3',
              owner: 'R. Singh',
              reviewers: ['A. Patel'],
              dueDate: 'Jan 25, 2026',
              lastChange: 'Updated tox study status',
            }
          ) +
          "\n\nDEMO STATUS:\n- Safety pharmacology: complete\n- Repeat-dose tox: in progress (study report due in 2 weeks)\n- Genotox: complete\n- TK/PK: complete", 
        tags: ['module4', 'nonclinical', 'draft'],
      }),
      mk({
        id: 'demo-m4-glp-report',
        title: 'IND Module 4.2 – GLP Repeat-Dose Tox Report (Placeholder - In Review)',
        module: 'module4',
        section: '4.2',
        status: 'in review',
        updatedAt: isoDaysAgo(1),
        workflow: {
          stage: 'In Review',
          version: 'v0.7',
          owner: 'CRO (ToxOps)',
          reviewers: ['Nonclinical (R. Singh)', 'QA (P. Williams)'],
          dueDate: 'Jan 14, 2026',
          lastChange: 'CRO delivered draft PDF; extracting tables pending',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(
            `GLP REPEAT-DOSE TOX REPORT (Mock Placeholder)\n\nThis is a mock “in review” artifact used for demo workflows.\n\nKey findings (Mock):\n- NOAEL: 30 mg/kg\n- Target organs: liver (mild reversible changes)\n- Safety margins: acceptable for proposed starting dose\n\nActions (Mock):\n- Insert SmartTags once tables are extracted:\n  - ⟦NOAEL_mg_per_kg: 30 | NONCLIN.NOAEL | TLF-4.2 | v0.7 | status=draft⟧\n  - ⟦Target_Organ: liver | NONCLIN.TARGET | TLF-4.2 | v0.7 | status=draft⟧\n\nReviewer notes (Mock):\n- Confirm histopath conclusion wording\n- Confirm TK exposure multiples\n`
          ),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 4',
            section: '4.2',
            stage: 'In Review',
            version: 'v0.7',
            owner: 'CRO (ToxOps)',
            reviewers: ['R. Singh', 'P. Williams'],
            dueDate: 'Jan 14, 2026',
            lastChange: 'CRO delivered draft; extraction pending',
          }
        ),
        tags: ['module4', 'glp', 'in-review'],
      }),
      mk({
        id: 'demo-m5-clinical-protocol',
        title: 'IND Module 5 – Protocol Synopsis (Draft)',
        module: 'module5',
        section: '5.0',
        status: 'draft',
        updatedAt: isoDaysAgo(11),
        workflow: {
          stage: 'Draft',
          version: 'v0.4',
          owner: 'Clinical Ops (D. Kim)',
          reviewers: ['A. Patel (Clinical)', 'Jordan Rivera (Reg Affairs)'],
          dueDate: 'Jan 23, 2026',
          lastChange: 'Updated endpoints + site count assumptions',
        },
        content:
          withDocControl(
            fillInvestorDemoPlaceholders(m5?.content || ''),
            {
              sponsor: 'HelioNova Therapeutics, Inc.',
              program: 'HN-101',
              indNumber: '159321',
              moduleLabel: 'Module 5',
              section: '5.0',
              stage: 'Draft',
              version: 'v0.4',
              owner: 'D. Kim',
              reviewers: ['A. Patel', 'Jordan Rivera'],
              dueDate: 'Jan 23, 2026',
              lastChange: 'Updated endpoints + site assumptions',
            }
          ) +
          "\n\nPROTOCOL SYNOPSIS (demo):\n- Phase: 1b/2a\n- Design: open-label, dose-escalation + expansion\n- Population: advanced solid tumors\n- Primary endpoint: safety/tolerability (DLT)\n- Key secondary: ORR, DoR, PFS\n- Sites: 8 US sites (startup in progress)",
        tags: ['module5', 'clinical', 'draft'],
      }),
      mk({
        id: 'demo-m5-protocol-shell',
        title: 'IND Module 5 – Protocol (Shell v0.1, Template Pulled)',
        module: 'module5',
        section: '5.1',
        status: 'draft',
        updatedAt: isoDaysAgo(13),
        workflow: {
          stage: 'Draft',
          version: 'v0.1',
          owner: 'Medical Writing (K. Alvarez)',
          reviewers: ['Clinical Ops (D. Kim)'],
          dueDate: 'Jan 30, 2026',
          lastChange: 'Created protocol shell from Smart Template',
        },
        content: withDocControl(
          fillInvestorDemoPlaceholders(
            `CLINICAL PROTOCOL (Mock Shell)\n\nTitle: A Phase 1b/2a Study of [DRUG NAME] in [INDICATION]\nProtocol ID: HN-101-001\n\nSections (Shell):\n1. Synopsis\n2. Background\n3. Objectives\n4. Endpoints\n5. Study Design\n6. Statistical Considerations\n7. Safety Monitoring\n\nOwner notes (Mock):\n- Replace placeholder objectives with program-specific goals\n- Insert SmartTags for endpoint feasibility from historical CSR data\n`
          ),
          {
            sponsor: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
            moduleLabel: 'Module 5',
            section: '5.1',
            stage: 'Draft',
            version: 'v0.1',
            owner: 'K. Alvarez',
            reviewers: ['D. Kim'],
            dueDate: 'Jan 30, 2026',
            lastChange: 'Created shell from template',
          }
        ),
        tags: ['module5', 'protocol', 'template'],
      }),
    ];

    return docs;
  };

  const [seededDocuments, setSeededDocuments] = useState([]);
  const [demoSeedInfo, setDemoSeedInfo] = useState({ seeded: false, storageKey: '' });

  const seedInvestorDemoIfMissing = useCallback(() => {
    const projectId = localStorage.getItem('currentProjectId') || '';
    const organizationId = localStorage.getItem('currentOrganizationId') || localStorage.getItem('organizationId') || 'demo';
    const storageKey = getDemoStorageKey(organizationId, projectId);

    const existingRaw = (() => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    })();

    const existing = existingRaw ? safeJsonParse(existingRaw, null) : null;
    if (existing?.documents?.length) {
      setSeededDocuments(existing.documents);
      setDemoSeedInfo({ seeded: true, storageKey });
      return { seededNow: false, storageKey };
    }

    const docs = buildInvestorDemoDocuments();
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          seededAt: new Date().toISOString(),
          demoClient: {
            name: 'HelioNova Therapeutics, Inc.',
            program: 'HN-101',
            indNumber: '159321',
          },
          documents: docs,
        })
      );
    } catch {
      // If storage is unavailable, we still provide in-memory demo content.
    }

    setSeededDocuments(docs);
    setDemoSeedInfo({ seeded: true, storageKey });
    return { seededNow: true, storageKey };
  }, []);

  const upsertDocumentInLists = useCallback((nextDoc) => {
    if (!nextDoc) return;

    setApiDocuments((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex((d) => String(d?.id ?? d?.documentId) === String(nextDoc?.id ?? nextDoc?.documentId));
      if (idx >= 0) {
        const copy = list.slice();
        copy[idx] = { ...copy[idx], ...nextDoc };
        return copy;
      }
      return [nextDoc, ...list];
    });

    setSeededDocuments((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex((d) => String(d?.id ?? d?.documentId) === String(nextDoc?.id ?? nextDoc?.documentId));
      if (idx >= 0) {
        const copy = list.slice();
        copy[idx] = { ...copy[idx], ...nextDoc };
        return copy;
      }
      return [nextDoc, ...list];
    });
  }, []);

  const persistDemoDocumentBestEffort = useCallback(
    (nextDoc) => {
      if (!nextDoc) return;
      if (!demoSeedInfo?.storageKey) return;
      try {
        const raw = localStorage.getItem(demoSeedInfo.storageKey);
        if (!raw) return;
        const parsed = safeJsonParse(raw, null);
        if (!parsed || !Array.isArray(parsed.documents)) return;
        const idx = parsed.documents.findIndex((d) => String(d?.id) === String(nextDoc?.id));
        if (idx < 0) return;
        const updated = { ...parsed.documents[idx], ...nextDoc };
        const next = {
          ...parsed,
          documents: parsed.documents.map((d, i) => (i === idx ? updated : d)),
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(demoSeedInfo.storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [demoSeedInfo, safeJsonParse]
  );

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('ectd_coauthor_quickstart_dismissed');
      setShowQuickStart(dismissed !== 'true');
    } catch {
      setShowQuickStart(true);
    }
  }, []);

  useEffect(() => {
    // Always ensure demo docs exist so the investor view has immediate content.
    try {
      const { seededNow } = seedInvestorDemoIfMissing();
      if (seededNow) {
        toast({
          title: 'Investor Demo Workspace Ready',
          description: 'Loaded demo IND Module 1–5 documents and Smart Templates.',
        });
      }
    } catch {
      // best-effort
    }
  }, [seedInvestorDemoIfMissing, toast]);

  const openHelp = (topic = 'quickstart') => {
    setHelpTopic(topic);
    setHelpOpen(true);
  };

  // eCTD Navigator state
  const [expandedSections, setExpandedSections] = useState({
    module1: true,
    module2: true,
    'module2-clinical': false,
    'module2-quality': false,
    module3: false,
    module4: false,
    module5: false,
  });

  // Sample file data matching user's PDF
  const [vaultFiles] = useState([
    {
      name: 'Cover Letter.docx',
      modified: '2025-05-15',
      status: 'final',
      size: '1.5 MB',
      version: '1.0',
    },
    {
      name: 'Application Form.pdf',
      modified: '2025-05-12',
      status: 'final',
      size: '2.3 MB',
      version: '1.0',
    },
  ]);

  // Workspace list fallback (shown only if API is unavailable)
  const fallbackDocuments = useMemo(
    () => [
      {
        id: 'fallback-1',
        title: 'Module 2.5 Clinical Overview',
        module: 'module2',
        section: '2.5 Clinical Overview',
        version: 1,
        status: 'draft',
        updatedAt: new Date().toISOString(),
        content: 'Clinical trial data and analysis…',
      },
    ],
    []
  );

  useEffect(() => {
    const fetchDocs = async () => {
      setApiDocumentsLoading(true);
      setApiDocumentsError(null);
      try {
        const projectId = localStorage.getItem('currentProjectId') || '';
        const organizationId = localStorage.getItem('currentOrganizationId') || '7';
        const url = `/api/ectd-documents?projectId=${encodeURIComponent(projectId)}&organizationId=${encodeURIComponent(organizationId)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch documents (${res.status})`);
        const data = await res.json();
        setApiDocuments(Array.isArray(data) ? data : []);
      } catch (e) {
        setApiDocuments([]);
        setApiDocumentsError(e?.message || 'Failed to fetch documents');
      } finally {
        setApiDocumentsLoading(false);
      }
    };

    fetchDocs();
  }, []);

  const workspaceDocs = useMemo(() => {
    const merged = [...(Array.isArray(apiDocuments) ? apiDocuments : []), ...(Array.isArray(seededDocuments) ? seededDocuments : [])];
    const deduped = (() => {
      const seen = new Set();
      return merged.filter((d) => {
        const key = String(d?.id ?? d?.documentId ?? d?.title ?? '');
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();

    const base = deduped.length ? deduped : fallbackDocuments;

    const withDates = base
      .map((d) => {
        const updated = d?.updatedAt ? new Date(d.updatedAt) : null;
        return {
          ...d,
          __updatedAtMs: Number.isFinite(updated?.getTime?.()) ? updated.getTime() : 0,
        };
      })
      .sort((a, b) => (b.__updatedAtMs || 0) - (a.__updatedAtMs || 0));
    return withDates;
  }, [apiDocuments, seededDocuments, fallbackDocuments]);

  const recentWorkspaceDocs = useMemo(() => workspaceDocs.slice(0, 3), [workspaceDocs]);

  function formatModuleLabel(module) {
    const m = String(module || '').toLowerCase();
    if (m === 'module1') return 'Module 1';
    if (m === 'module2') return 'Module 2';
    if (m === 'module3') return 'Module 3';
    if (m === 'module4') return 'Module 4';
    if (m === 'module5') return 'Module 5';
    return module || 'Unassigned';
  }

  function formatStatusLabel(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'in review' || s === 'in_review' || s === 'inreview' || s === 'review') return 'In Review';
    if (s === 'final' || s === 'finalized' || s === 'finalised') return 'Final';
    if (s === 'approved') return 'Approved';
    if (s === 'draft') return 'Draft';
    return status || 'Draft';
  }

  const mockIndDocs = useMemo(() => {
    return (Array.isArray(workspaceDocs) ? workspaceDocs : [])
      .filter((d) => d?.metadata?.demo)
      .slice()
      .sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || '')));
  }, [workspaceDocs]);

  const mockDocsByStage = useMemo(() => {
    const buckets = {
      Draft: [],
      'In Review': [],
      Final: [],
      Approved: [],
    };

    mockIndDocs.forEach((d) => {
      const label = formatStatusLabel(d?.status);
      if (label === 'Approved') buckets.Approved.push(d);
      else if (label === 'Final') buckets.Final.push(d);
      else if (label === 'In Review') buckets['In Review'].push(d);
      else buckets.Draft.push(d);
    });

    return buckets;
  }, [mockIndDocs]);

  const workingCopies = useMemo(() => {
    const list = (Array.isArray(workspaceDocs) ? workspaceDocs : [])
      .filter((d) => !d?.metadata?.demo)
      .filter((d) => d?.metadata?.createdFrom === 'mock-ind-library' || d?.metadata?.fromMockId)
      .slice();

    return list
      .map((d) => {
        const updated = d?.updatedAt ? new Date(d.updatedAt) : null;
        return {
          ...d,
          __updatedAtMs: Number.isFinite(updated?.getTime?.()) ? updated.getTime() : 0,
        };
      })
      .sort((a, b) => (b.__updatedAtMs || 0) - (a.__updatedAtMs || 0));
  }, [workspaceDocs]);

  const filteredMockLibraryDocs = useMemo(() => {
    const query = String(mockLibraryQuery || '').trim().toLowerCase();
    const stage = String(mockLibraryStage || 'All');
    const base = Array.isArray(mockIndDocs) ? mockIndDocs : [];
    return base
      .filter((d) => {
        if (stage === 'All') return true;
        return formatStatusLabel(d?.status) === stage;
      })
      .filter((d) => {
        if (!query) return true;
        const hay = [
          d?.title,
          d?.module,
          formatModuleLabel(d?.module),
          d?.section,
          d?.metadata?.workflow?.owner,
          d?.metadata?.workflow?.version,
          formatStatusLabel(d?.status),
        ]
          .filter(Boolean)
          .join(' • ')
          .toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 50);
  }, [mockIndDocs, mockLibraryQuery, mockLibraryStage]);

  const createWorkingCopyFromMock = useCallback(
    (doc) => {
      if (!doc) return;
      const now = new Date().toISOString();
      const newDoc = {
        ...(doc || {}),
        id: `work-${Date.now()}`,
        title: `${doc.title || 'Untitled'} (Working Copy)`,
        status: 'draft',
        updatedAt: now,
        metadata: {
          ...(doc.metadata || {}),
          demo: false,
          fromMockId: doc.id,
          createdFrom: 'mock-ind-library',
        },
      };

      upsertDocumentInLists(newDoc);

      // Persist the working copy into the demo storage so it survives reloads.
      try {
        const storageKey = demoSeedInfo?.storageKey;
        if (storageKey) {
          const raw = localStorage.getItem(storageKey);
          const parsed = raw ? safeJsonParse(raw, null) : null;
          if (parsed && Array.isArray(parsed.documents)) {
            const exists = parsed.documents.some((d) => String(d?.id) === String(newDoc?.id));
            const nextDocs = exists ? parsed.documents : [newDoc, ...parsed.documents];
            localStorage.setItem(
              storageKey,
              JSON.stringify({
                ...parsed,
                documents: nextDocs,
                updatedAt: now,
              })
            );
          }
        }
      } catch {
        // ignore
      }

      setSelectedDocument(newDoc);
      toast({
        title: 'Working copy created',
        description: 'Opened an editable copy in the document editor.',
      });
    },
    [demoSeedInfo, safeJsonParse, toast, upsertDocumentInLists]
  );

  // Featured templates (latest 3 for main view)
  const [featuredTemplates] = useState([
    {
      name: 'Module 1 1 Form_1571',
      module: 'administrative',
      updated: 'Updated',
      blocks: ['1.1'],
      validated: true,
      regions: ['US FDA'],
    },
    {
      name: 'Module_1_2_Cover_Letter',
      module: 'administrative',
      updated: 'Updated',
      blocks: ['1.2'],
      validated: true,
      regions: ['US FDA'],
    },
    {
      name: 'Module_1_3_1_Sponsor_Contact_Information',
      module: 'administrative',
      updated: 'Updated',
      blocks: ['1.3.1'],
      validated: true,
      regions: ['US FDA'],
    },
  ]);

  // All templates (complete list)
  const [allTemplates] = useState([
    {
      name: 'Module 1 1 Form_1571',
      module: 'administrative',
      updated: 'Updated',
      blocks: ['1.1'],
      validated: true,
      regions: ['US FDA'],
    },
    {
      name: 'Module_1_2_Cover_Letter',
      module: 'administrative',
      updated: 'Updated',
      blocks: ['1.2'],
      validated: true,
      regions: ['US FDA'],
    },
    {
      name: 'Module_1_3_1_Sponsor_Contact_Information',
      module: 'administrative',
      updated: 'Updated',
      blocks: ['1.3.1'],
      validated: true,
      regions: ['US FDA'],
    },
    {
      name: 'Module_1_20_Introduction_General_Plan',
      module: 'administrative',
      updated: 'Updated',
      blocks: ['1.20'],
      validated: true,
      regions: ['US FDA'],
    },
    {
      name: 'Module_2_2_Introduction',
      module: 'summary',
      updated: 'Updated',
      blocks: ['2.2'],
      validated: true,
      regions: ['US FDA', 'EU EMA'],
    },
    {
      name: 'Clinical Overview Template',
      module: 'Module 2',
      updated: '2 months ago',
      blocks: ['2.5', '2.5.6', '2.7.3'],
      validated: true,
      regions: ['US FDA', 'EU EMA'],
    },
    {
      name: 'CTD Module 3 Quality Template',
      module: 'Module 3',
      updated: '1 month ago',
      blocks: ['3.2.S.4.1'],
      validated: true,
      regions: ['US FDA', 'EU EMA'],
    },
    {
      name: 'NDA Cover Letter Template',
      module: 'Module 1',
      updated: '3 weeks ago',
      blocks: ['1.2'],
      validated: true,
      regions: ['US FDA', 'EU EMA'],
    },
  ]);

  const smartTemplateLibrary = useMemo(() => {
    const mappedInd = (indTemplates || []).map((t) => {
      const moduleId = String(t.moduleId || '').toLowerCase();
      const moduleNumber = moduleId.replace('module', '') || '1';
      return {
        id: t.id,
        name: t.title,
        module: `Module ${moduleNumber}`,
        updated: 'Demo-ready',
        blocks: [t.moduleSection || moduleNumber],
        validated: true,
        regions: [t.region || 'FDA'],
        description: t.description,
        documentType: t.documentType,
        content: fillInvestorDemoPlaceholders(t.content || ''),
        source: 'ind-templates',
      };
    });

    const legacy = (allTemplates || []).map((t) => ({
      ...t,
      id: t.id || `legacy-${t.name}`,
      validated: true,
      source: 'legacy',
      content: t.content
        ? fillInvestorDemoPlaceholders(t.content)
        : `<h1>${t.name}</h1><p>Template content available in demo library.</p>`,
    }));

    const seen = new Set();
    return [...mappedInd, ...legacy].filter((t) => {
      const key = String(t.id || t.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allTemplates]);

  const [templateSearch, setTemplateSearch] = useState('');
  const [templateModuleFilter, setTemplateModuleFilter] = useState('all');

  const filteredTemplates = useMemo(() => {
    const q = String(templateSearch || '').trim().toLowerCase();
    return smartTemplateLibrary
      .filter((t) => {
        if (templateModuleFilter === 'all') return true;
        return String(t.module || '').toLowerCase().includes(templateModuleFilter);
      })
      .filter((t) => {
        if (!q) return true;
        return (
          String(t.name || '').toLowerCase().includes(q) ||
          String(t.description || '').toLowerCase().includes(q) ||
          String(t.documentType || '').toLowerCase().includes(q)
        );
      });
  }, [smartTemplateLibrary, templateSearch, templateModuleFilter]);

  const recommendedTemplates = useMemo(() => {
    const preferredIds = [
      'ind-m1-cover',
      'ind-m1-1571',
      'ind-m2-intro',
      'ind-m3-cmc',
      'ind-m4-pharm-tox',
    ];

    const picked = preferredIds
      .map((id) => smartTemplateLibrary.find((t) => t.id === id))
      .filter(Boolean);

    const extras = smartTemplateLibrary
      .filter((t) => !preferredIds.includes(t.id))
      .slice(0, 2);

    return [...picked, ...extras].slice(0, 6);
  }, [smartTemplateLibrary]);

  // Validation dashboard data
  const [validationData] = useState({
    completeness: 78,
    compliance: 92,
    validation: 65,
    issues: 4,
    issueDescription:
      'Missing source citations in section 2.5.4 and incomplete benefit-risk assessment.',
  });

  // Document health metrics
  const [documentHealth] = useState({
    completeness: 72,
    consistency: 86,
    issueResolution: 63,
  });

  const toggleSection = sectionId => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleFileSelect = file => {
    setSelectedFiles(prev => {
      const isSelected = prev.some(f => f.name === file.name);
      if (isSelected) {
        return prev.filter(f => f.name !== file.name);
      } else {
        return [...prev, file];
      }
    });
  };

  const handleCreateDocument = async () => {
    if (!documentTitle || !selectedModule) {
      toast({
        title: 'Missing Information',
        description: 'Please enter document title and select eCTD module',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/v1/drafting/start_task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'ectd-project',
          ectd_section: selectedModule,
          document_title: documentTitle,
          template: selectedTemplate,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setShowNewDocumentDialog(false);
        // Instead of redirecting, open the embedded editor
        setSelectedDocument({
          id: result.task_id || Date.now(),
          title: documentTitle,
          module: selectedModule,
          content: '', // Initial content
          status: 'Draft'
        });
        toast({
          title: 'Document Creation Started',
          description: 'AI is generating your regulatory document...',
        });
      }
    } catch (error) {
      console.error('Document creation error:', error);
      // Fallback for demo/offline mode
      setShowNewDocumentDialog(false);
      setSelectedDocument({
        id: Date.now(),
        title: documentTitle,
        module: selectedModule,
        content: '',
        status: 'Draft'
      });
      toast({
        title: 'Document Created',
        description: 'New document ready for editing.',
      });
    }
  };

  const compileSubmission = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: 'No Files Selected',
        description: 'Please select documents from the VAULT to compile',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Compiling Submission',
      description: `Creating eCTD package with ${selectedFiles.length} documents`,
    });
  };

  if (zenMode && selectedDocument) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-100">
        <div className="h-full w-full flex flex-col">
          <div className="shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setZenMode(false)}>
                Exit ZEN (Esc)
              </Button>
              <div className="text-sm text-slate-700 truncate">
                {selectedDocument?.title || 'Untitled Document'}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <Button
                variant={editorMode === 'tiptap' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = editorMode === 'tiptap' ? 'safe' : 'tiptap';
                  setEditorMode(next);
                  toast({
                    title: next === 'tiptap' ? 'Modern editor enabled' : 'Safe editor enabled',
                    description:
                      next === 'tiptap'
                        ? 'Rich text + SmartTag chips + better formatting.'
                        : 'Plain-text safe mode for maximum stability.',
                  });
                }}
              >
                {editorMode === 'tiptap' ? 'Editor: Modern' : 'Editor: Safe'}
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <EnhancedDocumentEditor
              document={selectedDocument}
              zenMode
              onBack={() => {
                setSelectedDocument(null);
                setZenMode(false);
              }}
              forceTipTap={editorMode === 'tiptap'}
              onSave={(payload) => {
                const now = new Date().toISOString();
                const nextDoc =
                  payload && typeof payload === 'object'
                    ? { ...payload, updatedAt: now }
                    : { ...(selectedDocument || {}), content: String(payload || ''), updatedAt: now };

                setSelectedDocument(nextDoc);
                upsertDocumentInLists(nextDoc);
                persistDemoDocumentBestEffort(nextDoc);

                toast({ title: 'Saved', description: 'Document saved successfully.' });
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">TrialSage™</h1>
              <p className="text-sm text-gray-600">Advanced AI-Powered Regulatory Platform</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center gap-2">
                <Button
                  variant={focusMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    const next = !focusMode;
                    setHideFileExplorer(next);
                    setHideNavigation(next);
                    toast({
                      title: next ? 'Focus Mode enabled' : 'Focus Mode disabled',
                      description: next
                        ? 'Hid VAULT + Guided Workflow for a cleaner view.'
                        : 'Restored panels for full navigation.',
                    });
                  }}
                >
                  {focusMode ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                  Focus
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHideFileExplorer((v) => !v)}
                >
                  <Columns2 className="h-4 w-4 mr-2" />
                  {hideFileExplorer ? 'Show VAULT' : 'Hide VAULT'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHideNavigation((v) => !v)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {hideNavigation ? 'Show Guide' : 'Hide Guide'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setHideFileExplorer(false);
                    setHideNavigation(false);
                    toast({ title: 'Layout reset', description: 'Panels restored to default.' });
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => openHelp('quickstart')}>
                <BookOpen className="h-4 w-4 mr-2" />
                Help
              </Button>
              <span className="text-sm">Welcome, Admin</span>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                A
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>eCTD Co-Author Help</DialogTitle>
            <DialogDescription>
              A quick guide to the features that matter: documents, data, SmartTags, validation, and export.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={helpTopic} onValueChange={setHelpTopic}>
            <TabsList className="flex w-full flex-wrap gap-2 justify-start">
              <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="smarttags">SmartTags & Data</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="export">Export & Publish</TabsTrigger>
            </TabsList>
            <TabsContent value="quickstart" className="mt-4 space-y-3">
              <div className="text-sm text-gray-700 space-y-2">
                <div className="font-medium">Recommended first run</div>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Open <span className="font-medium">Data Center</span> and browse documents or the Data Browser.</li>
                  <li>Select a document to open it in the editor.</li>
                  <li>Drag a data point into the editor to create a <span className="font-medium">SmartTag</span>.</li>
                  <li>Click a SmartTag to see its provenance in the right rail and export when ready.</li>
                </ol>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setHelpOpen(false);
                    setActiveTab('datacenter');
                  }}
                >
                  Open Data Center
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHelpTopic('smarttags');
                  }}
                >
                  Learn SmartTags
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHelpOpen(false);
                    setActiveTab('validation');
                  }}
                >
                  Go to Validation
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="documents" className="mt-4 space-y-3">
              <div className="text-sm text-gray-700 space-y-2">
                <div className="font-medium">How to open a document</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Use <span className="font-medium">Workspace → Recent Documents</span> for quick access.</li>
                  <li>Use <span className="font-medium">Data Center → Documents</span> for structured browsing and versions.</li>
                  <li>Once a document is open, Save/Export controls appear on the editor toolbar.</li>
                </ul>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setHelpOpen(false);
                  setActiveTab('datacenter');
                }}
              >
                Browse Documents in Data Center
              </Button>
            </TabsContent>
            <TabsContent value="smarttags" className="mt-4 space-y-3">
              <div className="text-sm text-gray-700 space-y-2">
                <div className="font-medium">SmartTags (data-bound tokens)</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Drag a data item from the right rail <span className="font-medium">Data</span> tab into the editor to insert a SmartTag.</li>
                  <li>Click a SmartTag to focus its source + version in the right rail.</li>
                  <li>Export supports batch-resolving draft/warning SmartTags before publishing.</li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setHelpOpen(false);
                    setActiveTab('workspace');
                  }}
                >
                  Open Workspace
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHelpOpen(false);
                    toast({
                      title: 'Tip',
                      description: 'Open a document, then use the editor right rail: Data → drag into the document.',
                    });
                  }}
                >
                  Show a Tip
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="validation" className="mt-4 space-y-3">
              <div className="text-sm text-gray-700 space-y-2">
                <div className="font-medium">Validation</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Use the Validation tab to identify completeness/compliance gaps.</li>
                  <li>Resolve flagged sections, then re-run checks before export.</li>
                </ul>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setHelpOpen(false);
                  setActiveTab('validation');
                }}
              >
                Open Validation
              </Button>
            </TabsContent>
            <TabsContent value="export" className="mt-4 space-y-3">
              <div className="text-sm text-gray-700 space-y-2">
                <div className="font-medium">Export & Publish</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Export from the editor when a document is open (PDF/packaging workflows).</li>
                  <li>Use lifecycle/publishing tabs for sequence-level operations.</li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setHelpOpen(false);
                    setActiveTab('lifecycle');
                  }}
                >
                  Open Lifecycle
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHelpOpen(false);
                    toast({
                      title: 'Export',
                      description: 'Open a document first; export controls live on the editor toolbar.',
                    });
                  }}
                >
                  Where is Export?
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHelpOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-full mx-auto px-6 py-6">
        {/* eCTD Submission Workflow */}
        {!hideNavigation && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">eCTD Submission Workflow</CardTitle>
            <CardDescription>
              Follow these steps to create a valid eCTD submission package
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Step 1 */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <h3 className="font-medium">Select Documents</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Select files from Module 1 and Module 2 by clicking the checkboxes
                </p>
                <Button variant="outline" size="sm" onClick={() => openHelp('documents')}>
                  Show me how
                </Button>
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                    2
                  </div>
                  <h3 className="font-medium">Review Selected Documents</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Ensure you have selected files from both Module 1 and Module 2
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Module 1 document(s) selected
                  </div>
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Module 2 document(s) selected
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => openHelp('documents')}>
                  Learn about eCTD modules
                </Button>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                    3
                  </div>
                  <h3 className="font-medium">Compile Submission Package</h3>
                </div>
                <p className="text-sm text-gray-600">Create an eCTD-compliant submission package</p>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                  onClick={compileSubmission}
                >
                  Compile Submission
                </Button>
              </div>

              {/* Step 4 */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                    4
                  </div>
                  <h3 className="font-medium">Review Validation Results</h3>
                </div>
                <p className="text-sm text-gray-600">
                  Verify that your submission meets ICH standards
                </p>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" onClick={() => openHelp('validation')}>
                    About ICH Standards
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveTab('validation');
                      openHelp('validation');
                    }}
                  >
                    View Validation Results
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Need help? Click any "Show me how" button for guidance
              </p>
              <Button variant="link" className="text-blue-600" onClick={() => openHelp('quickstart')}>
                View Full Tutorial
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        {hideNavigation && (
          <div className="mb-6 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setHideNavigation(false)}>
              <Settings className="h-4 w-4 mr-2" />
              Show Guided Workflow
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* VAULT File Explorer */}
          {!hideFileExplorer && (
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-lg">VAULT File Explorer</CardTitle>
                      <CardDescription>Browse and select files for your submission</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setHideFileExplorer(true)}>
                      Hide File Explorer
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* eCTD Navigator */}
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    <div className="space-y-2">
                      {/* Module 1 */}
                      <div
                        className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        onClick={() => toggleSection('module1')}
                      >
                        {expandedSections.module1 ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <FolderOpen className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Module 1</span>
                      </div>

                      {/* Module 2 */}
                      <div
                        className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        onClick={() => toggleSection('module2')}
                      >
                        {expandedSections.module2 ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <FolderOpen className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Module 2</span>
                      </div>

                      {expandedSections.module2 && (
                        <div className="ml-6 space-y-1">
                          <div className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded text-sm">
                            <FolderOpen className="h-3 w-3 text-gray-500" />
                            <span>Module 2/clinical</span>
                          </div>
                          <div className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded text-sm">
                            <FolderOpen className="h-3 w-3 text-gray-500" />
                            <span>Module 2/quality</span>
                          </div>
                        </div>
                      )}

                      {/* Module 3-5 */}
                      {[3, 4, 5].map(moduleNum => (
                        <div
                          key={moduleNum}
                          className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          onClick={() => toggleSection(`module${moduleNum}`)}
                        >
                          <ChevronRight className="h-4 w-4" />
                          <FolderOpen className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">Module {moduleNum}</span>
                        </div>
                      ))}

                      <Button variant="outline" size="sm" className="w-full mt-4">
                        <Plus className="h-4 w-4 mr-2" />
                        New Folder
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Selected Documents */}
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg">Selected Documents</CardTitle>
                  <CardDescription>
                    Documents selected for inclusion in your eCTD submission
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* File list */}
                    <div className="border rounded-lg">
                      <div className="flex justify-between items-center p-3 bg-gray-50 border-b">
                        <div className="flex items-center space-x-4">
                          <Button variant="outline" size="sm">
                            New File
                          </Button>
                          <Button variant="outline" size="sm">
                            Delete
                          </Button>
                          <Button variant="outline" size="sm">
                            Add to Submission
                          </Button>
                        </div>
                        <span className="text-sm text-gray-500">{vaultFiles.length} items</span>
                      </div>

                      <div className="divide-y">
                        {vaultFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleFileSelect(file)}
                          >
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={selectedFiles.some(f => f.name === file.name)}
                                onChange={() => handleFileSelect(file)}
                                className="rounded border-gray-300"
                              />
                              <FileText className="h-4 w-4 text-blue-600" />
                              <div>
                                <div className="font-medium text-sm">{file.name}</div>
                                <div className="text-xs text-gray-500">
                                  {file.modified} • {file.size}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge variant={file.status === 'final' ? 'default' : 'secondary'}>
                                {file.status}
                              </Badge>
                              <span className="text-xs text-gray-500">v{file.version}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-3 bg-gray-50 border-t text-center">
                        <span className="text-sm text-gray-500">
                          Sequence: SN0013 • Selected: {selectedFiles.length} files
                        </span>
                      </div>
                    </div>

                    {/* eCTD Submission Package */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <h3 className="font-medium">eCTD Submission Package</h3>
                      <p className="text-sm text-gray-600">
                        Compile your selected documents into an eCTD-compliant submission package
                      </p>
                      <div className="flex space-x-2">
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={compileSubmission}
                        >
                          Compile Submission
                        </Button>
                        <Button variant="outline">View Validation Results</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Main eCTD Co-Author Area */}
          <div className={hideFileExplorer ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-xl flex items-center space-x-2">
                      <FileText className="h-6 w-6 text-blue-600" />
                      <span>eCTD Co-Author</span>
                    </CardTitle>
                    <CardDescription>AI-Powered Document Editor</CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant={editorMode === 'tiptap' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        const next = editorMode === 'tiptap' ? 'safe' : 'tiptap';
                        setEditorMode(next);
                        toast({
                          title: next === 'tiptap' ? 'Modern editor enabled' : 'Safe editor enabled',
                          description:
                            next === 'tiptap'
                              ? 'Rich text + SmartTag chips + better formatting.'
                              : 'Plain-text safe mode for maximum stability.',
                        });
                      }}
                    >
                      {editorMode === 'tiptap' ? 'Editor: Modern' : 'Editor: Safe'}
                    </Button>
                    <Button variant="outline" size="sm">
                      Chat with Dossier
                    </Button>
                    <Button variant="outline" size="sm">
                      Export
                    </Button>
                    <Button variant="outline" size="sm">
                      Lifecycle
                    </Button>
                    <Button 
                      variant={showCollaborationHub ? "secondary" : "outline"} 
                      size="sm"
                      onClick={() => setShowCollaborationHub(!showCollaborationHub)}
                      className={showCollaborationHub ? "bg-blue-100 text-blue-700 border-blue-300" : ""}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Team Collaboration
                    </Button>
                    <Button variant="outline" size="sm">
                      AI Assistant
                    </Button>

                    <Button
                      variant={zenMode ? 'default' : 'outline'}
                      size="sm"
                      disabled={!selectedDocument}
                      onClick={() => setZenMode(true)}
                      title={selectedDocument ? 'Full-screen editor only' : 'Open a document to enable ZEN mode'}
                    >
                      ZEN
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative">
                {showCollaborationHub && <CollaborationHub />}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="flex w-full flex-wrap justify-start gap-1">
                    <TabsTrigger value="workspace">Workspace</TabsTrigger>
                    <TabsTrigger value="datacenter">Data Center</TabsTrigger>
                    <TabsTrigger value="contentreuse">Content Reuse</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                    <TabsTrigger value="validation">Validation</TabsTrigger>
                    <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
                    <TabsTrigger value="compliance">Compliance & Quality</TabsTrigger>
                    <TabsTrigger value="health">Document Health</TabsTrigger>
                    <TabsTrigger value="review">Review</TabsTrigger>
                    <TabsTrigger value="datastudio">Data Studio</TabsTrigger>
                  </TabsList>

                  {/* Workspace Tab */}
                  <TabsContent value="workspace" className="space-y-6">
                    <Card className="border-emerald-200 bg-emerald-50">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">Investor Demo IND Workspace</CardTitle>
                            <CardDescription>
                              Fake client: <span className="font-medium">HelioNova Therapeutics</span> • Program:{' '}
                              <span className="font-medium">HN-101</span> • IND{' '}
                              <span className="font-medium">159321</span>
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-100 text-emerald-800">
                              {workspaceDocs.length} docs
                            </Badge>
                            <Badge className="bg-blue-100 text-blue-800">
                              {filteredTemplates.length} templates
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              const doc = workspaceDocs.find((d) => String(d.module).toLowerCase() === 'module1');
                              if (doc) setSelectedDocument(doc);
                              else toast({ title: 'Not found', description: 'No Module 1 demo doc found.' });
                            }}
                          >
                            Open Module 1
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const doc = workspaceDocs.find((d) => String(d.module).toLowerCase() === 'module2');
                              if (doc) setSelectedDocument(doc);
                              else toast({ title: 'Not found', description: 'No Module 2 demo doc found.' });
                            }}
                          >
                            Open Module 2
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const doc = workspaceDocs.find((d) => String(d.module).toLowerCase() === 'module3');
                              if (doc) setSelectedDocument(doc);
                              else toast({ title: 'Not found', description: 'No Module 3 demo doc found.' });
                            }}
                          >
                            Open Module 3
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const doc = workspaceDocs.find((d) => String(d.module).toLowerCase() === 'module4');
                              if (doc) setSelectedDocument(doc);
                              else toast({ title: 'Not found', description: 'No Module 4 demo doc found.' });
                            }}
                          >
                            Open Module 4
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const doc = workspaceDocs.find((d) => String(d.module).toLowerCase() === 'module5');
                              if (doc) setSelectedDocument(doc);
                              else toast({ title: 'Not found', description: 'No Module 5 demo doc found.' });
                            }}
                          >
                            Open Module 5
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setActiveTab('templates')}>
                            Browse Smart Templates
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              try {
                                if (demoSeedInfo.storageKey) localStorage.removeItem(demoSeedInfo.storageKey);
                              } catch {
                                // ignore
                              }
                              const { seededNow } = seedInvestorDemoIfMissing();
                              toast({
                                title: 'Demo workspace refreshed',
                                description: seededNow
                                  ? 'Re-seeded investor demo documents.'
                                  : 'Loaded investor demo documents.',
                              });
                            }}
                          >
                            Refresh Demo
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-base">Recommended Smart Templates</CardTitle>
                            <CardDescription>
                              One-click examples to show value fast (preview or create a draft).
                            </CardDescription>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setActiveTab('templates')}>
                            Browse Library
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {recommendedTemplates.map((t) => (
                            <div key={t.id || t.name} className="border rounded-lg p-3 bg-white">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{t.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {t.module}{t.documentType ? ` • ${t.documentType}` : ''}
                                  </div>
                                </div>
                                <Badge className="bg-green-100 text-green-800">Validated</Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-3">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => {
                                    const newDoc = {
                                      id: `local-${Date.now()}`,
                                      title: `New ${t.name}`,
                                      module: String(t.module || 'Module 1').toLowerCase().includes('2')
                                        ? 'module2'
                                        : String(t.module || '').toLowerCase().includes('3')
                                          ? 'module3'
                                          : String(t.module || '').toLowerCase().includes('4')
                                            ? 'module4'
                                            : String(t.module || '').toLowerCase().includes('5')
                                              ? 'module5'
                                              : 'module1',
                                      status: 'draft',
                                      updatedAt: new Date().toISOString(),
                                      content:
                                        t.content || `<h1>${t.name}</h1><p>Document created from template.</p>`,
                                      metadata: { demo: true, template_id: t.id, template_name: t.name },
                                    };
                                    setSelectedDocument(newDoc);
                                    toast({ title: 'Draft created', description: `Opened “${t.name}”.` });
                                  }}
                                >
                                  Create
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const previewDoc = {
                                      id: `preview-${t.id || t.name}`,
                                      title: `${t.name} (Template Preview)`,
                                      module: String(t.module || 'Module 1').toLowerCase().includes('2')
                                        ? 'module2'
                                        : String(t.module || '').toLowerCase().includes('3')
                                          ? 'module3'
                                          : String(t.module || '').toLowerCase().includes('4')
                                            ? 'module4'
                                            : String(t.module || '').toLowerCase().includes('5')
                                              ? 'module5'
                                              : 'module1',
                                      status: 'draft',
                                      updatedAt: new Date().toISOString(),
                                      content:
                                        t.content || `<h1>${t.name}</h1><p>No template content available.</p>`,
                                      metadata: { demo: true, templatePreview: true, template_id: t.id },
                                    };
                                    setSelectedDocument(previewDoc);
                                    toast({ title: 'Template preview', description: `Opened “${t.name}”.` });
                                  }}
                                >
                                  Preview
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {showQuickStart && (
                      <Card className="border-blue-200 bg-blue-50">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base">Quick Start</CardTitle>
                              <CardDescription>
                                Start here if you’re not sure what to click: open Data Center, pick a document, then use SmartTags.
                              </CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowQuickStart(false);
                                try {
                                  localStorage.setItem('ectd_coauthor_quickstart_dismissed', 'true');
                                } catch {
                                  // ignore
                                }
                              }}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => setActiveTab('datacenter')}>Open Data Center</Button>
                            <Button size="sm" variant="outline" onClick={() => openHelp('smarttags')}>What are SmartTags?</Button>
                            <Button size="sm" variant="outline" onClick={() => setActiveTab('templates')}>Browse Templates</Button>
                            <Button size="sm" variant="outline" onClick={() => setActiveTab('validation')}>Run Validation</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Smart Submission Wizard - GPS for the user */}
                    {!selectedDocument && (
                      <SmartSubmissionWizard currentModule={selectedModule || 'Module 2'} />
                    )}

                    {selectedDocument ? (
                      <EnhancedDocumentEditor 
                        document={selectedDocument}
                        onBack={() => setSelectedDocument(null)}
                        zenMode={zenMode}
                        forceTipTap={editorMode === 'tiptap'}
                        onSave={(payload) => {
                          const now = new Date().toISOString();
                          const nextDoc =
                            payload && typeof payload === 'object'
                              ? { ...payload, updatedAt: now }
                              : { ...(selectedDocument || {}), content: String(payload || ''), updatedAt: now };

                          setSelectedDocument(nextDoc);
                          upsertDocumentInLists(nextDoc);
                          persistDemoDocumentBestEffort(nextDoc);

                          toast({ title: 'Saved', description: 'Document saved successfully.' });
                        }}
                      />
                    ) : (
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <div>
                              <CardTitle className="flex items-center space-x-2">
                                <Edit className="h-5 w-5 text-blue-600" />
                                <span>AI-Powered Document Editor</span>
                              </CardTitle>
                              <CardDescription>
                                Create and edit regulatory documents with intelligent assistance
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {/* Mock IND Pipeline (high-signal demo content) */}
                          <div className="mb-8">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div>
                                <div className="font-semibold text-slate-900">Mock IND Pipeline</div>
                                <div className="text-sm text-slate-600">
                                  Realistic IND documents at different stages (Draft → In Review → Final). Open directly, or create a Working Copy to edit.
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                  {mockIndDocs.length} mock docs • {workingCopies.length} working copies
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const { seededNow } = seedInvestorDemoIfMissing();
                                    toast({
                                      title: seededNow ? 'Mock docs seeded' : 'Mock docs already available',
                                      description: 'Mock IND library is ready in your Workspace.',
                                    });
                                  }}
                                >
                                  Refresh Mock Docs
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowMockLibrary(true)}
                                >
                                  Browse Mock Library
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (workingCopies?.[0]) {
                                      setSelectedDocument(workingCopies[0]);
                                      return;
                                    }
                                    if (mockIndDocs?.[0]) setSelectedDocument(mockIndDocs[0]);
                                  }}
                                >
                                  Open Latest Work
                                </Button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                              {['Draft', 'In Review', 'Final'].map((stage) => (
                                <div key={stage} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm font-semibold text-slate-900">{stage}</div>
                                    <div className="text-xs text-slate-500">{(mockDocsByStage?.[stage] || []).length}</div>
                                  </div>
                                  <div className="space-y-2">
                                    {(mockDocsByStage?.[stage] || []).slice(0, 4).map((doc) => (
                                      <div
                                        key={doc?.id}
                                        className="rounded-md border border-slate-200 bg-white p-3 hover:bg-slate-50 transition"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="text-sm font-medium text-slate-900 truncate">{doc?.title}</div>
                                            <div className="text-xs text-slate-600 mt-1">
                                              {formatModuleLabel(doc?.module)}
                                              {doc?.section ? ` • ${doc.section}` : ''}
                                              {doc?.metadata?.workflow?.version ? ` • ${doc.metadata.workflow.version}` : ''}
                                            </div>
                                            {doc?.metadata?.workflow?.owner ? (
                                              <div className="text-[11px] text-slate-500 mt-1 truncate">
                                                Owner: {doc.metadata.workflow.owner}
                                              </div>
                                            ) : null}
                                          </div>
                                          <Badge variant={stage === 'Final' ? 'default' : stage === 'In Review' ? 'secondary' : 'outline'}>
                                            {formatStatusLabel(doc?.status)}
                                          </Badge>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                          <Button size="sm" variant="outline" onClick={() => setSelectedDocument(doc)}>
                                            Open
                                          </Button>
                                          <Button size="sm" onClick={() => createWorkingCopyFromMock(doc)}>
                                            Create Working Copy
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                    {(mockDocsByStage?.[stage] || []).length > 4 ? (
                                      <Button
                                        variant="link"
                                        className="h-auto p-0 text-xs text-slate-600 justify-start"
                                        onClick={() => {
                                          setMockLibraryStage(stage);
                                          setMockLibraryQuery('');
                                          setShowMockLibrary(true);
                                        }}
                                      >
                                        +{(mockDocsByStage?.[stage] || []).length - 4} more… (open library)
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Working Copies */}
                            <div className="mt-6">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-semibold text-slate-900">Your Working Copies</div>
                                <Button
                                  variant="link"
                                  className="text-blue-600"
                                  onClick={() => {
                                    setShowMockLibrary(true);
                                    setMockLibraryStage('All');
                                    setMockLibraryQuery('');
                                  }}
                                >
                                  View in Library
                                </Button>
                              </div>
                              {workingCopies.length ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {workingCopies.slice(0, 3).map((doc) => (
                                    <div key={doc?.id} className="rounded-md border border-slate-200 bg-white p-3">
                                      <div className="text-sm font-medium text-slate-900 truncate">{doc?.title}</div>
                                      <div className="text-xs text-slate-600 mt-1">
                                        {formatModuleLabel(doc?.module)}
                                        {doc?.section ? ` • ${doc.section}` : ''}
                                      </div>
                                      <div className="mt-2 flex items-center gap-2">
                                        <Button size="sm" variant="outline" onClick={() => setSelectedDocument(doc)}>
                                          Open
                                        </Button>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setSelectedDocument(doc);
                                            setZenMode(true);
                                          }}
                                        >
                                          Open in ZEN
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-slate-600 border border-dashed border-slate-300 rounded-md p-4 bg-white">
                                  Create a working copy from any mock doc to start editing.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex space-x-4 mb-6">
                            <Button
                              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
                              onClick={() => setShowNewDocumentDialog(true)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              New Document
                            </Button>
                            <Button variant="outline">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Edit in Google Docs
                            </Button>
                            <Button variant="outline">
                              <Upload className="h-4 w-4 mr-2" />
                              Import
                            </Button>
                          </div>

                          {/* Recent Documents */}
                          <div className="space-y-4">
                            <h3 className="font-medium">Recent Documents</h3>
                            {apiDocumentsLoading && (
                              <div className="text-sm text-gray-600">Loading documents…</div>
                            )}
                            {!apiDocumentsLoading && apiDocumentsError && (
                              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                                Using fallback documents. Data Center API error: {apiDocumentsError}
                              </div>
                            )}
                            <div className="space-y-3">
                              {(showAllDocuments ? workspaceDocs : recentWorkspaceDocs).map(
                                (doc, index) => (
                                  <div
                                    key={doc?.id ?? index}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => setSelectedDocument(doc)}
                                  >
                                    <div className="flex items-center space-x-3">
                                      <FileText className="h-5 w-5 text-blue-600" />
                                      <div>
                                        <div className="font-medium">{doc.title}</div>
                                        <div className="text-sm text-gray-500">
                                          {formatModuleLabel(doc.module)} • Last edited{' '}
                                          {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : 'recently'}
                                        </div>
                                      </div>
                                    </div>
                                    <Badge
                                      variant={
                                        formatStatusLabel(doc.status) === 'Final'
                                          ? 'default'
                                          : formatStatusLabel(doc.status) === 'In Review'
                                            ? 'secondary'
                                            : 'outline'
                                      }
                                    >
                                      {formatStatusLabel(doc.status)}
                                    </Badge>
                                  </div>
                                )
                              )}
                            </div>
                            <Button
                              variant="link"
                              className="text-blue-600"
                              onClick={() => {
                                setShowAllDocuments(!showAllDocuments);
                              }}
                            >
                              {showAllDocuments ? 'Show Recent Only' : 'View All Documents'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Data Center Tab */}
                  <TabsContent value="datacenter" className="space-y-6">
                    <ECTDDataCenterIntegration 
                      projectId={localStorage.getItem('currentProjectId')}
                      onDocumentSelect={(doc) => {
                        // Handle document selection - open in editor
                        console.log('Opening document:', doc);
                        toast({
                          title: 'Document Selected',
                          description: `Opening ${doc.title} in editor...`,
                        });
                        // Navigate to document editor with selected document
                        setActiveTab('workspace');
                        // Set the selected document for editing
                        setSelectedDocument(doc);
                      }}
                    />
                  </TabsContent>

                  {/* Content Reuse Tab */}
                  <TabsContent value="contentreuse" className="space-y-6">
                    <Tabs defaultValue="library">
                      <TabsList>
                        <TabsTrigger value="library">Content Library</TabsTrigger>
                        <TabsTrigger value="generator">Context Generator</TabsTrigger>
                        <TabsTrigger value="summarizer">AI Summarizer</TabsTrigger>
                      </TabsList>

                      <TabsContent value="library" className="mt-4">
                        <ECTDContentReuseManager 
                          projectId={localStorage.getItem('currentProjectId')}
                          onContentInsert={(content) => {
                            // Handle content insertion into active document
                            console.log('Inserting reusable content:', content);
                            toast({
                              title: 'Content Ready',
                              description: 'Content is ready to be inserted. Open a document to insert.',
                            });
                            
                            // If there's an active document, insert the content
                            if (selectedDocument) {
                              // Navigate to workspace to show the document editor
                              setActiveTab('workspace');
                              // Here you would insert the content into the active editor
                              // For now, just log it
                              console.log('Would insert into document:', selectedDocument.title, content);
                            }
                          }}
                        />
                      </TabsContent>

                      <TabsContent value="generator" className="mt-4">
                        <ContextAwareGenerator 
                          onInsert={(content) => {
                            toast({
                              title: 'Draft Ready',
                              description: 'Content copied to clipboard and ready for insertion.',
                            });
                            if (selectedDocument) {
                              setActiveTab('workspace');
                            }
                          }}
                        />
                      </TabsContent>

                      <TabsContent value="summarizer" className="mt-4 h-[600px]">
                        <AutomatedSummarization 
                          onInsert={(content) => {
                             toast({
                              title: 'Summary Ready',
                              description: 'Summary copied to clipboard and ready for insertion.',
                            });
                            if (selectedDocument) {
                              setActiveTab('workspace');
                            }
                          }}
                        />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* Templates Tab */}
                  <TabsContent value="templates" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle>Document Templates</CardTitle>
                            <CardDescription>
                              Start with pre-approved Smart Templates for IND Module 1–5 (mock client ready)
                            </CardDescription>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge className="bg-blue-100 text-blue-800">ICH Compliant</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                          <div className="md:col-span-2">
                            <Label htmlFor="templateSearch">Search templates</Label>
                            <Input
                              id="templateSearch"
                              value={templateSearch}
                              onChange={(e) => setTemplateSearch(e.target.value)}
                              placeholder="Try: cover letter, 1571, CMC, tox, protocol…"
                            />
                          </div>
                          <div>
                            <Label>Module filter</Label>
                            <Select value={templateModuleFilter} onValueChange={setTemplateModuleFilter}>
                              <SelectTrigger>
                                <SelectValue placeholder="All modules" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All modules</SelectItem>
                                <SelectItem value="module 1">Module 1</SelectItem>
                                <SelectItem value="module 2">Module 2</SelectItem>
                                <SelectItem value="module 3">Module 3</SelectItem>
                                <SelectItem value="module 4">Module 4</SelectItem>
                                <SelectItem value="module 5">Module 5</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-4">
                          <div className="text-sm text-gray-700">
                            <span className="font-medium">{filteredTemplates.length}</span> templates available
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAllTemplates(!showAllTemplates)}
                          >
                            {showAllTemplates ? 'Show Recommended Only' : 'View Full Library'}
                          </Button>
                        </div>

                        <div className="space-y-4">
                          <h3 className="font-medium">{showAllTemplates ? 'Smart Template Library' : 'Recommended Templates'}</h3>
                          <div className="grid gap-4">
                            {(showAllTemplates
                              ? filteredTemplates
                              : filteredTemplates.slice(0, 8)
                            ).map(
                              (template, index) => (
                                <div key={index} className="border rounded-lg p-4">
                                  <div className="flex justify-between items-start mb-3">
                                    <div>
                                      <h4 className="font-medium">{template.name}</h4>
                                      <p className="text-sm text-gray-600">
                                        {template.module} • {template.updated}
                                        {template.documentType ? ` • ${template.documentType}` : ''}
                                      </p>
                                      {template.description ? (
                                        <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                                      ) : null}
                                    </div>
                                    <Badge className="bg-green-100 text-green-800">Validated</Badge>
                                  </div>

                                  <div className="flex items-center space-x-4 mb-3">
                                    {template.regions.map((region, regionIndex) => (
                                      <Badge
                                        key={regionIndex}
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {region}
                                      </Badge>
                                    ))}
                                  </div>

                                  <div className="space-y-2">
                                    <div className="text-sm">
                                      <span className="font-medium">
                                        eCTD Structured Content Blocks:
                                      </span>
                                      <div className="flex space-x-2 mt-1">
                                        {template.blocks.map((block, blockIndex) => (
                                          <Badge
                                            key={blockIndex}
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            {block}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="text-sm">
                                      <span className="font-medium">ICH Guidelines Referenced</span>
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div className="flex items-center space-x-2 pt-3 border-t">
                                      <Button 
                                        size="sm" 
                                        variant="default"
                                        className="flex-1"
                                        onClick={() => {
                                          // Investor-demo behavior: always create/open locally immediately.
                                          const docId = `local-${Date.now()}`;
                                          const newDoc = {
                                            id: docId,
                                            title: `New ${template.name}`,
                                            module: String(template.module || 'Module 1').toLowerCase().includes('2')
                                              ? 'module2'
                                              : String(template.module || '').toLowerCase().includes('3')
                                                ? 'module3'
                                                : String(template.module || '').toLowerCase().includes('4')
                                                  ? 'module4'
                                                  : String(template.module || '').toLowerCase().includes('5')
                                                    ? 'module5'
                                                    : 'module1',
                                            status: 'draft',
                                            updatedAt: new Date().toISOString(),
                                            content: template.content || `<h1>${template.name}</h1><p>Document created from template.</p>`,
                                            metadata: {
                                              demo: true,
                                              template_id: template.id,
                                              template_name: template.name,
                                              regions: template.regions,
                                            },
                                          };

                                          setSelectedDocument(newDoc);
                                          setActiveTab('workspace');

                                          toast({
                                            title: 'Document Created',
                                            description: `Opened a new draft from “${template.name}”.`,
                                          });

                                          // Best-effort API create (non-blocking)
                                          fetch('/api/coauthor/documents', {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json',
                                              'x-organization-id': localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '6',
                                            },
                                            body: JSON.stringify({
                                              title: newDoc.title,
                                              content: newDoc.content,
                                              module_number: String(template.module || 'Module 1').split(' ')[1] || '1',
                                              module_name: template.module || 'Module 1',
                                              status: 'draft',
                                              sections: template.blocks || [],
                                              metadata: newDoc.metadata,
                                            }),
                                          }).catch(() => {
                                            // ignore for demo mode
                                          });
                                        }}
                                        data-testid={`create-template-${index}`}
                                      >
                                        <FileText className="h-3 w-3 mr-1" />
                                        Create from Template
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => {
                                          const previewDoc = {
                                            id: `preview-${template.id || template.name}`,
                                            title: `${template.name} (Template Preview)`,
                                            module: String(template.module || 'Module 1').toLowerCase().includes('2')
                                              ? 'module2'
                                              : String(template.module || '').toLowerCase().includes('3')
                                                ? 'module3'
                                                : String(template.module || '').toLowerCase().includes('4')
                                                  ? 'module4'
                                                  : String(template.module || '').toLowerCase().includes('5')
                                                    ? 'module5'
                                                    : 'module1',
                                            status: 'draft',
                                            updatedAt: new Date().toISOString(),
                                            content: template.content || `<h1>${template.name}</h1><p>No template content available.</p>`,
                                            metadata: { demo: true, templatePreview: true, template_id: template.id },
                                          };

                                          setSelectedDocument(previewDoc);
                                          setActiveTab('workspace');
                                          toast({
                                            title: 'Template Preview',
                                            description: `Opened “${template.name}” in the editor.`,
                                          });
                                        }}
                                        data-testid={`preview-template-${index}`}
                                      >
                                        <Eye className="h-3 w-3 mr-1" />
                                        Preview
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Validation Tab - Now includes SEND/TRC Validation */}
                  <TabsContent value="validation" className="space-y-6">
                    {/* Comprehensive eCTD Validation Engine */}
                    <ECTDValidationEngine 
                      projectId={localStorage.getItem('currentProjectId')}
                      documents={selectedFiles}
                    />

                    {/* SEND/TRC Validation Panel */}
                    <div className="mt-8">
                      <h3 className="text-lg font-medium mb-4">Specialized Data Validation</h3>
                      <SENDValidationPanel 
                        documentId={selectedDocument?.id}
                        moduleType={selectedDocument?.module || 'module4'}
                      />
                    </div>
                  </TabsContent>

                  {/* Lifecycle Tab */}
                  <TabsContent value="lifecycle" className="space-y-6">
                    <Tabs defaultValue="manager">
                      <TabsList>
                        <TabsTrigger value="manager">Sequence Manager</TabsTrigger>
                        <TabsTrigger value="publishing">Publishing</TabsTrigger>
                      </TabsList>
                      <TabsContent value="manager" className="mt-4">
                        <LifecycleManager />
                      </TabsContent>
                      <TabsContent value="publishing" className="mt-4">
                        <PublishingManager />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* Compliance & Quality Tab */}
                  <TabsContent value="compliance" className="space-y-6">
                    <Tabs defaultValue="audit">
                      <TabsList>
                        <TabsTrigger value="audit">Audit Trail (21 CFR Part 11)</TabsTrigger>
                        <TabsTrigger value="consistency">Global Consistency</TabsTrigger>
                      </TabsList>
                      <TabsContent value="audit" className="mt-4">
                        <AuditTrailViewer />
                      </TabsContent>
                      <TabsContent value="consistency" className="mt-4">
                        <GlobalConsistencyChecker />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* Document Health Tab */}
                  <TabsContent value="health" className="space-y-6">
                    <div className="grid grid-cols-3 gap-6">
                      <Card>
                        <CardContent className="p-6 text-center">
                          <div className="text-2xl font-bold text-blue-600 mb-2">
                            {documentHealth.completeness}%
                          </div>
                          <div className="text-sm text-gray-600">Completeness</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-6 text-center">
                          <div className="text-2xl font-bold text-green-600 mb-2">
                            {documentHealth.consistency}%
                          </div>
                          <div className="text-sm text-gray-600">Consistency</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-6 text-center">
                          <div className="text-2xl font-bold text-amber-600 mb-2">
                            {documentHealth.issueResolution}%
                          </div>
                          <div className="text-sm text-gray-600">Issue Resolution</div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* Review Tab */}
                  <TabsContent value="review" className="space-y-6">
                    <Tabs defaultValue="module-review">
                      <TabsList>
                        <TabsTrigger value="module-review">Module Review</TabsTrigger>
                        <TabsTrigger value="predictive-analytics">Predictive Analytics</TabsTrigger>
                        <TabsTrigger value="global-strategy">Global Strategy</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="module-review" className="mt-4 h-[600px]">
                        <CoAuthor_eCTD_Module_Review />
                      </TabsContent>
                      
                      <TabsContent value="predictive-analytics" className="mt-4">
                        <PredictiveRegulatoryAnalytics 
                          projectId={localStorage.getItem('currentProjectId')}
                          currentModule={selectedModule}
                        />
                      </TabsContent>

                      <TabsContent value="global-strategy" className="mt-4">
                        <GlobalSubmissionStrategy 
                          projectId={localStorage.getItem('currentProjectId')}
                        />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* Data Studio Tab */}
                  <TabsContent value="datastudio" className="space-y-6">
                    <IntegratedDataVisualization />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mock IND Library Dialog */}
      <Dialog open={showMockLibrary} onOpenChange={setShowMockLibrary}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Mock IND Library</DialogTitle>
            <DialogDescription>
              Search and open realistic IND documents across Module 1–5. Use “Create Working Copy” to edit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <Label htmlFor="mockLibrarySearch">Search</Label>
                <Input
                  id="mockLibrarySearch"
                  value={mockLibraryQuery}
                  onChange={(e) => setMockLibraryQuery(e.target.value)}
                  placeholder="Try: cover letter, 1571, protocol, SAP, Module 2.7, in review, owner…"
                />
              </div>
              <div className="md:w-[280px]">
                <Label htmlFor="mockLibraryStage">Stage</Label>
                <Select value={mockLibraryStage} onValueChange={setMockLibraryStage}>
                  <SelectTrigger id="mockLibraryStage">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All stages</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="In Review">In Review</SelectItem>
                    <SelectItem value="Final">Final</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-600">
              <div>
                Showing <span className="font-medium text-slate-900">{filteredMockLibraryDocs.length}</span> results
                {mockIndDocs.length ? <span> (of {mockIndDocs.length} mock docs)</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMockLibraryQuery('');
                    setMockLibraryStage('All');
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto space-y-2 pr-1">
              {filteredMockLibraryDocs.map((doc) => (
                <div
                  key={doc?.id}
                  className="rounded-md border border-slate-200 bg-white p-3 hover:bg-slate-50 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{doc?.title}</div>
                      <div className="text-xs text-slate-600 mt-1">
                        {formatModuleLabel(doc?.module)}
                        {doc?.section ? ` • ${doc.section}` : ''}
                        {doc?.metadata?.workflow?.version ? ` • ${doc.metadata.workflow.version}` : ''}
                        {doc?.metadata?.workflow?.owner ? ` • Owner: ${doc.metadata.workflow.owner}` : ''}
                      </div>
                    </div>
                    <Badge
                      variant={
                        formatStatusLabel(doc?.status) === 'Final'
                          ? 'default'
                          : formatStatusLabel(doc?.status) === 'In Review'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {formatStatusLabel(doc?.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setShowMockLibrary(false);
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        createWorkingCopyFromMock(doc);
                        setShowMockLibrary(false);
                      }}
                    >
                      Create Working Copy
                    </Button>
                  </div>
                </div>
              ))}

              {!filteredMockLibraryDocs.length ? (
                <div className="text-sm text-slate-600 border border-dashed border-slate-300 rounded-md p-6 bg-white">
                  No results. Try removing filters or searching for “Module 1”, “protocol”, or “SAP”.
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMockLibrary(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Document Dialog */}
      <Dialog open={showNewDocumentDialog} onOpenChange={setShowNewDocumentDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New AI Document</DialogTitle>
            <DialogDescription>
              Generate a regulatory document using AI with eCTD compliance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={documentTitle}
                onChange={e => setDocumentTitle(e.target.value)}
                placeholder="Enter document title..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="module">eCTD Module</Label>
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger>
                  <SelectValue placeholder="Select eCTD module..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="module-1">Module 1: Administrative Information</SelectItem>
                  <SelectItem value="module-2">
                    Module 2: Common Technical Document Summaries
                  </SelectItem>
                  <SelectItem value="module-3">Module 3: Quality</SelectItem>
                  <SelectItem value="module-4">Module 4: Nonclinical Study Reports</SelectItem>
                  <SelectItem value="module-5">Module 5: Clinical Study Reports</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Template (Optional)</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No template</SelectItem>
                  <SelectItem value="clinical-overview">Clinical Overview Template</SelectItem>
                  <SelectItem value="quality-summary">Quality Summary Template</SelectItem>
                  <SelectItem value="cover-letter">Cover Letter Template</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDocumentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDocument}>Create Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
