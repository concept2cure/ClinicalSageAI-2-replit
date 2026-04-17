import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Info,
  FileCheck,
  AlertCircle,
  Search,
  CheckCircle,
  FileText,
  Plus,
  Sparkles,
  Loader2,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toaster';
import CerTooltipWrapper from './CerTooltipWrapper';
import { cerApiService } from '../../services/CerAPIService';

// Evidence source types
const EVIDENCE_SOURCES = {
  FAERS: 'FDA Adverse Events',
  LITERATURE: 'Scientific Literature',
  CLINICAL_INVESTIGATION: 'Clinical Investigation',
  PMCF: 'Post-Market Clinical Follow-up',
  COMPLAINT: 'Complaint & Vigilance',
  NON_CLINICAL: 'Non-Clinical Study',
  EQUIVALENT_DEVICE: 'Equivalent Device Data',
};

// Standard GSPRs based on MDR
const GSPRs = [
  {
    id: '1',
    title: 'GSPR 1 - General safety and performance',
    description:
      'Devices shall achieve their intended performance and be designed and manufactured in such a way that, during normal conditions of use, they are suitable for their intended purpose.',
  },
  {
    id: '2',
    title: 'GSPR 2 - Risk reduction',
    description:
      'The manufacturer shall establish, implement, document and maintain a risk management system.',
  },
  {
    id: '3',
    title: 'GSPR 3 - Risk control measures',
    description:
      'Devices shall be designed and manufactured in such a way that they remove or reduce risks as far as possible through safe design and manufacture.',
  },
  {
    id: '14',
    title: 'GSPR 14 - Clinical evaluation requirements',
    description:
      'Demonstration of conformity with the general safety and performance requirements shall include a clinical evaluation in accordance with Article 61 of MDR.',
  },
  {
    id: '14.1',
    title: 'GSPR 14.1 - Clinical investigations',
    description:
      'Clinical investigations shall be performed in accordance with MDR Annex XV on an equivalent or similar device to obtain data regarding safety and performance, including clinical benefits.',
  },
  {
    id: '14.2',
    title: 'GSPR 14.2 - Clinical evidence',
    description:
      'Clinical evidence must be sufficient to demonstrate compliance with relevant GSPRs when the device is used as intended by the manufacturer.',
  },
  {
    id: '14.3',
    title: 'GSPR 14.3 - Clinical benefits',
    description:
      'Demonstration of clinical benefit must be based on available clinical data relevant to the intended purpose, target population, and performance of the device.',
  },
  {
    id: '23',
    title: 'GSPR 23 - Information supplied by the manufacturer',
    description:
      'Each device shall be accompanied by information needed to identify the device and manufacturer, safety and performance information for the user or patient, and information on risks, warnings, and precautions.',
  },
];

// Default initial mapping structure
const createInitialMapping = (selectedGSPRs = []) => {
  const mapping = {};
  selectedGSPRs.forEach(gsprId => {
    mapping[gsprId] = {
      evidenceSources: [],
      complianceStatement: '',
      regulatoryInterpretation: '', // New field for specific MDR interpretation
      acceptanceCriteria: '', // New field for defining acceptance criteria
      evidenceStrength: 'unrated', // unrated, low, medium, high
      evidenceQuality: [], // Array of evidence quality factors
      clinicalRelevance: '', // Clinical relevance explanation
      gapsIdentified: false,
      gapStatement: '',
      gapImpact: '', // New field for gap impact assessment
      nextSteps: '',
      complianceStatus: 'pending', // pending, partial, compliant
      reviewerComments: '', // New field for reviewer input
      lastReviewed: null, // Timestamp for last review
      risk: 'unassessed', // unassessed, low, medium, high
    };
  });
  return mapping;
};

export default function GSPRMappingPanel({
  deviceName = '',
  faersData = [],
  literatureData = [],
  sections = [],
  selectedGSPRs = ['1', '2', '3', '14', '14.2'],
  initialMapping = null,
  onUpdateMapping = () => {},
  onAddToReport = () => {},
}) {
  const [mapping, setMapping] = useState(initialMapping || createInitialMapping(selectedGSPRs));
  const [availableEvidenceCount, setAvailableEvidenceCount] = useState({
    FAERS: 0,
    LITERATURE: 0,
    CLINICAL_INVESTIGATION: 0,
    PMCF: 0,
    COMPLAINT: 0,
    NON_CLINICAL: 0,
    EQUIVALENT_DEVICE: 0,
  });
  const [changes, setChanges] = useState(false);
  const [activeGspr, setActiveGspr] = useState(null);

  // Debug logging for state changes
  const setActiveGsprWithLogging = gsprId => {
    console.log('Setting active GSPR to:', gsprId);
    setActiveGspr(gsprId);
  };
  const [evidenceSearchTerm, setEvidenceSearchTerm] = useState('');
  const [availableEvidence, setAvailableEvidence] = useState([]);
  const [filteredEvidence, setFilteredEvidence] = useState([]);
  const [isGeneratingAIAnalysis, setIsGeneratingAIAnalysis] = useState(false);
  const [aiAnalysisProgress, setAiAnalysisProgress] = useState(0);
  const [aiAnalysisTarget, setAiAnalysisTarget] = useState(null);
  const { toast } = useToast();

  // Initialize or update the mapping when selectedGSPRs change
  useEffect(() => {
    if (!initialMapping) {
      // Only update if not provided with initial data
      setMapping(prevMapping => {
        const newMapping = { ...prevMapping };

        // Add new GSPRs
        selectedGSPRs.forEach(gsprId => {
          if (!newMapping[gsprId]) {
            newMapping[gsprId] = {
              evidenceSources: [],
              complianceStatement: '',
              regulatoryInterpretation: '',
              acceptanceCriteria: '',
              evidenceStrength: 'unrated',
              evidenceQuality: [],
              clinicalRelevance: '',
              gapsIdentified: false,
              gapStatement: '',
              gapImpact: '',
              nextSteps: '',
              complianceStatus: 'pending',
              reviewerComments: '',
              lastReviewed: null,
              risk: 'unassessed',
            };
          }
        });

        // Remove GSPRs that are no longer selected
        Object.keys(newMapping).forEach(gsprId => {
          if (!selectedGSPRs.includes(gsprId)) {
            delete newMapping[gsprId];
          }
        });

        return newMapping;
      });
    }
  }, [selectedGSPRs, initialMapping]);

  // Process available evidence
  useEffect(() => {
    // Process FAERS data
    const faersEvidence = faersData.map((item, index) => ({
      id: `faers-${index}`,
      type: 'FAERS',
      title: `${item.product_name || 'Product'} Adverse Event Report`,
      description: item.reaction_text || 'Adverse event report',
      date: item.report_date || new Date().toISOString().split('T')[0],
      severity: item.serious ? 'High' : 'Medium',
      sourceUrl: null,
      data: item,
    }));

    // Process literature data
    const literatureEvidence = literatureData.map((item, index) => ({
      id: `lit-${index}`,
      type: 'LITERATURE',
      title: item.title || 'Scientific Publication',
      description: item.abstract
        ? `${item.abstract.substring(0, 150)}...`
        : 'Scientific literature',
      date: item.publication_date || new Date().toISOString().split('T')[0],
      severity: 'Medium',
      sourceUrl: item.url || null,
      data: item,
    }));

    // Combine all evidence
    const allEvidence = [...faersEvidence, ...literatureEvidence];

    // Update evidence counts
    setAvailableEvidenceCount({
      FAERS: faersEvidence.length,
      LITERATURE: literatureEvidence.length,
      CLINICAL_INVESTIGATION: 0, // These would come from other data sources
      PMCF: 0,
      COMPLAINT: 0,
      NON_CLINICAL: 0,
      EQUIVALENT_DEVICE: 0,
    });

    setAvailableEvidence(allEvidence);
    setFilteredEvidence(allEvidence);
  }, [faersData, literatureData]);

  // Filter evidence based on search term
  useEffect(() => {
    if (!evidenceSearchTerm.trim()) {
      setFilteredEvidence(availableEvidence);
      return;
    }

    const lowercaseTerm = evidenceSearchTerm.toLowerCase();
    const filtered = availableEvidence.filter(
      evidence =>
        evidence.title.toLowerCase().includes(lowercaseTerm) ||
        evidence.description.toLowerCase().includes(lowercaseTerm)
    );

    setFilteredEvidence(filtered);
  }, [evidenceSearchTerm, availableEvidence]);

  // Change handlers
  const handleAddEvidence = (gsprId, evidence) => {
    setMapping(prevMapping => {
      // Skip if this evidence is already linked to this GSPR
      if (prevMapping[gsprId].evidenceSources.some(e => e.id === evidence.id)) {
        return prevMapping;
      }

      const updatedMapping = {
        ...prevMapping,
        [gsprId]: {
          ...prevMapping[gsprId],
          evidenceSources: [...prevMapping[gsprId].evidenceSources, evidence],
        },
      };

      // Update compliance status based on evidence count
      if (updatedMapping[gsprId].evidenceSources.length > 0) {
        updatedMapping[gsprId].complianceStatus = updatedMapping[gsprId].gapsIdentified
          ? 'partial'
          : 'compliant';
      }

      return updatedMapping;
    });

    setChanges(true);
  };

  const handleRemoveEvidence = (gsprId, evidenceId) => {
    setMapping(prevMapping => {
      const updatedSources = prevMapping[gsprId].evidenceSources.filter(e => e.id !== evidenceId);

      const updatedMapping = {
        ...prevMapping,
        [gsprId]: {
          ...prevMapping[gsprId],
          evidenceSources: updatedSources,
        },
      };

      // Update compliance status based on evidence count
      if (updatedSources.length === 0) {
        updatedMapping[gsprId].complianceStatus = 'pending';
      } else {
        updatedMapping[gsprId].complianceStatus = updatedMapping[gsprId].gapsIdentified
          ? 'partial'
          : 'compliant';
      }

      return updatedMapping;
    });

    setChanges(true);
  };

  const handleComplianceStatementChange = (gsprId, statement) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        complianceStatement: statement,
      },
    }));

    setChanges(true);
  };

  const handleGapsIdentifiedChange = (gsprId, hasGaps) => {
    setMapping(prevMapping => {
      const updatedMapping = {
        ...prevMapping,
        [gsprId]: {
          ...prevMapping[gsprId],
          gapsIdentified: hasGaps,
        },
      };

      // Update compliance status based on gaps and evidence
      if (updatedMapping[gsprId].evidenceSources.length > 0) {
        updatedMapping[gsprId].complianceStatus = hasGaps ? 'partial' : 'compliant';
      }

      return updatedMapping;
    });

    setChanges(true);
  };

  const handleGapStatementChange = (gsprId, statement) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        gapStatement: statement,
      },
    }));

    setChanges(true);
  };

  const handleNextStepsChange = (gsprId, steps) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        nextSteps: steps,
      },
    }));

    setChanges(true);
  };

  const handleComplianceStatusChange = (gsprId, status) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        complianceStatus: status,
      },
    }));

    setChanges(true);
  };

  // New handlers for enhanced fields
  const handleRegulatoryInterpretationChange = (gsprId, interpretation) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        regulatoryInterpretation: interpretation,
      },
    }));

    setChanges(true);
  };

  const handleAcceptanceCriteriaChange = (gsprId, criteria) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        acceptanceCriteria: criteria,
      },
    }));

    setChanges(true);
  };

  const handleEvidenceStrengthChange = (gsprId, strength) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        evidenceStrength: strength,
      },
    }));

    setChanges(true);
  };

  const handleEvidenceQualityChange = (gsprId, qualityFactors) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        evidenceQuality: qualityFactors,
      },
    }));

    setChanges(true);
  };

  const handleClinicalRelevanceChange = (gsprId, relevance) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        clinicalRelevance: relevance,
      },
    }));

    setChanges(true);
  };

  const handleGapImpactChange = (gsprId, impact) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        gapImpact: impact,
      },
    }));

    setChanges(true);
  };

  const handleReviewerCommentsChange = (gsprId, comments) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        reviewerComments: comments,
        lastReviewed: new Date().toISOString(),
      },
    }));

    setChanges(true);
  };

  const handleRiskAssessmentChange = (gsprId, risk) => {
    setMapping(prevMapping => ({
      ...prevMapping,
      [gsprId]: {
        ...prevMapping[gsprId],
        risk: risk,
      },
    }));

    setChanges(true);
  };

  const handleSetActiveGspr = gsprId => {
    console.log('Setting active GSPR:', gsprId);
    setActiveGspr(gsprId);
    setEvidenceSearchTerm('');
    setFilteredEvidence(availableEvidence);
  };

  const handleSave = () => {
    onUpdateMapping(mapping);
    setChanges(false);
  };

  const handleAddToReport = () => {
    // Convert mapping to CER section content
    const gsprEvaluationContent = generateGsprEvaluationContent(mapping);
    onAddToReport(gsprEvaluationContent);
    setChanges(false);
  };

  // GPT-4o powered GSPR analysis function
  const generateAIAnalysis = async gsprId => {
    console.log('Starting AI analysis for GSPR:', gsprId);
    try {
      const gspr = GSPRs.find(g => g.id === gsprId);
      if (!gspr) {
        console.error('GSPR not found:', gsprId);
        return;
      }

      setIsGeneratingAIAnalysis(true);
      setAiAnalysisTarget(gsprId);
      setAiAnalysisProgress(10);

      // Notify user that AI analysis has started
      toast({
        title: 'GPT-4o Analysis Started',
        description: `Analyzing GSPR ${gsprId} using advanced AI to ensure regulatory compliance.`,
        variant: 'default',
        duration: 5000,
      });

      // Prepare context data for the AI
      const evidenceSources = mapping[gsprId].evidenceSources;
      console.log('Evidence sources for AI analysis:', evidenceSources.length);

      // Prepare evidence context
      setAiAnalysisProgress(30);
      const evidenceContext = evidenceSources.map(evidence => {
        return {
          type: evidence.type,
          title: evidence.title,
          description: evidence.description,
          date: evidence.date,
          severity: evidence.severity,
          data: evidence.data,
        };
      });

      // Use the cerApiService to call the AI analysis endpoint
      setAiAnalysisProgress(50);
      const result = await cerApiService.analyzeGsprWithAI({
        deviceName,
        gspr: {
          id: gspr.id,
          title: gspr.title,
          description: gspr.description,
        },
        evidenceContext,
        currentAnalysis: mapping[gsprId],
      });

      setAiAnalysisProgress(80);

      // Update the mapping with AI-generated content
      setMapping(prevMapping => ({
        ...prevMapping,
        [gsprId]: {
          ...prevMapping[gsprId],
          regulatoryInterpretation:
            result.regulatoryInterpretation || prevMapping[gsprId].regulatoryInterpretation,
          acceptanceCriteria: result.acceptanceCriteria || prevMapping[gsprId].acceptanceCriteria,
          complianceStatement:
            result.complianceStatement || prevMapping[gsprId].complianceStatement,
          clinicalRelevance: result.clinicalRelevance || prevMapping[gsprId].clinicalRelevance,
          evidenceStrength: result.evidenceStrength || prevMapping[gsprId].evidenceStrength,
          gapsIdentified:
            result.gapsIdentified !== undefined
              ? result.gapsIdentified
              : prevMapping[gsprId].gapsIdentified,
          gapStatement: result.gapStatement || prevMapping[gsprId].gapStatement,
          gapImpact: result.gapImpact || prevMapping[gsprId].gapImpact,
          nextSteps: result.nextSteps || prevMapping[gsprId].nextSteps,
          complianceStatus: result.complianceStatus || prevMapping[gsprId].complianceStatus,
          risk: result.risk || prevMapping[gsprId].risk,
          analysisByGpt4o: true,
          analysisDate: result.analysisDate || new Date().toISOString(),
        },
      }));

      setAiAnalysisProgress(100);
      setChanges(true);

      // Notify user that AI analysis is complete
      toast({
        title: 'AI Analysis Complete',
        description: `GSPR ${gsprId} analysis completed successfully with GPT-4o.`,
        variant: 'default',
        duration: 5000,
      });
    } catch (error) {
      console.error('Error in AI GSPR analysis:', error);
      toast({
        title: 'AI Analysis Error',
        description: 'Failed to complete the analysis. Please try again or complete manually.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setTimeout(() => {
        setIsGeneratingAIAnalysis(false);
        setAiAnalysisTarget(null);
        setAiAnalysisProgress(0);
      }, 1000);
    }
  };

  // Generate CER section content from the mapping data
  const generateGsprEvaluationContent = mappingData => {
    const content = {
      title: 'GSPR Clinical Evaluation Mapping',
      type: 'gspr-mapping',
      content: `
# GSPR Clinical Evaluation Mapping

## Overview
This section provides a systematic mapping between the General Safety and Performance Requirements (GSPRs) and the clinical evidence that supports compliance with each requirement. This mapping is in accordance with EU MDR Annex I and MEDDEV 2.7/1 Rev 4 guidance.

${Object.entries(mappingData)
  .map(([gsprId, data]) => {
    const gspr = GSPRs.find(g => g.id === gsprId) || {
      title: `GSPR ${gsprId}`,
      description: 'No description available',
    };

    return `
## ${gspr.title}
**Description:** ${gspr.description}

**Compliance Status:** ${
      data.complianceStatus === 'compliant'
        ? 'Compliant'
        : data.complianceStatus === 'partial'
        ? 'Partially Compliant'
        : 'Pending Evaluation'
    }

${
  data.regulatoryInterpretation
    ? `**Regulatory Interpretation:**\n${data.regulatoryInterpretation}\n`
    : ''
}

${data.complianceStatement ? `**Compliance Statement:**\n${data.complianceStatement}\n` : ''}

${data.acceptanceCriteria ? `**Acceptance Criteria:**\n${data.acceptanceCriteria}\n` : ''}

${data.clinicalRelevance ? `**Clinical Relevance:**\n${data.clinicalRelevance}\n` : ''}

${
  data.evidenceStrength !== 'unrated'
    ? `**Evidence Strength Assessment:** ${
        data.evidenceStrength === 'high'
          ? 'High'
          : data.evidenceStrength === 'medium'
          ? 'Medium'
          : 'Low'
      }\n`
    : ''
}

${
  data.evidenceSources.length > 0
    ? `
### Supporting Evidence
${data.evidenceSources
  .map(
    evidence => `
- **${evidence.title}** (${EVIDENCE_SOURCES[evidence.type] || evidence.type})
  - Description: ${evidence.description}
  - Date: ${evidence.date}
  - Severity: ${evidence.severity}
${evidence.sourceUrl ? `  - Source: ${evidence.sourceUrl}` : ''}
`
  )
  .join('')}
`
    : ''
}

${
  data.gapsIdentified
    ? `
### Identified Gaps
${data.gapStatement || 'Gaps have been identified but not detailed.'}

${data.gapImpact ? `**Gap Impact Assessment:**\n${data.gapImpact}\n` : ''}

${data.nextSteps ? `**Next Steps to Address Gaps:**\n${data.nextSteps}` : ''}
`
    : ''
}

${
  data.risk !== 'unassessed'
    ? `
### Risk Assessment
**Risk Level:** ${data.risk === 'high' ? 'High' : data.risk === 'medium' ? 'Medium' : 'Low'}
`
    : ''
}

${
  data.reviewerComments
    ? `
### Reviewer Notes
${data.reviewerComments}
${data.lastReviewed ? `\n*Last reviewed: ${new Date(data.lastReviewed).toLocaleDateString()}*` : ''}
`
    : ''
}
`;
  })
  .join('')}

## Summary
This mapping provides traceability from clinical evidence to regulatory requirements, demonstrating how the compiled clinical data supports the device's compliance with relevant GSPRs from MDR Annex I. The evaluation follows a systematic approach per MEDDEV 2.7/1 Rev 4, section 8.2 on demonstration of conformity.

## Methodology
The evaluation of each GSPR:
1. Identifies relevant clinical evidence from multiple data sources (literature, investigations, post-market surveillance)
2. Assesses the strength and quality of evidence against pre-defined acceptance criteria
3. Identifies and addresses any gaps in clinical evidence
4. Provides a clear statement of conformity with appropriate justification

Compliance is determined based on evidence strength, quality, and clinical relevance according to the MEDDEV 2.7/1 Rev 4 guidelines, which requires "sufficient clinical evidence" to demonstrate conformity.
`,
      lastUpdated: new Date().toISOString(),
    };

    return content;
  };

  // Get the GSPR details for a given ID
  const getGsprDetails = gsprId => {
    return (
      GSPRs.find(g => g.id === gsprId) || {
        title: `GSPR ${gsprId}`,
        description: 'No description available',
      }
    );
  };

  // Get status color for compliance state
  const getStatusColor = status => {
    switch (status) {
      case 'compliant':
        return 'bg-[#e4ebd8] text-[#788c5d] border-[#788c5d]';
      case 'partial':
        return 'bg-[#FFFCE5] text-[#986F0B] border-[#F2C811]';
      case 'pending':
      default:
        return 'bg-[#F5F5F5] text-[#616161] border-[#BDBDBD]';
    }
  };

  // Get status icon for compliance state
  const getStatusIcon = status => {
    switch (status) {
      case 'compliant':
        return <CheckCircle className="h-4 w-4 mr-1.5" />;
      case 'partial':
        return <AlertCircle className="h-4 w-4 mr-1.5" />;
      case 'pending':
      default:
        return <Info className="h-4 w-4 mr-1.5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#141413]">GSPR Requirements Mapping</h2>
          <p className="text-[#6b6963] mt-1">
            Map each selected GSPR to supporting clinical evidence and evaluate compliance
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            className="border-[#d97757] text-[#d97757] hover:bg-[#faf0ec]"
            onClick={handleSave}
            disabled={!changes}
          >
            Save Mapping
          </Button>
          <CerTooltipWrapper
            tooltipContent="Add this GSPR mapping as a dedicated section in your CER document. This creates a traceability matrix between regulatory requirements and clinical evidence."
            whyThisMatters="Clear traceability from GSPRs to supporting evidence is a key requirement for regulatory approval. It demonstrates how your clinical evaluation supports device conformity with essential requirements."
            tooltipPosition="bottom"
          >
            <Button
              className="bg-[#d97757] hover:bg-[#c15f3c] text-white"
              onClick={handleAddToReport}
            >
              <FileCheck className="h-4 w-4 mr-2" />
              Add to CER
            </Button>
          </CerTooltipWrapper>
        </div>
      </div>

      <div className="bg-[#f4f3ee] p-4 rounded border border-[#e8e6dc]">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-[#d97757] mt-0.5" />
          <div>
            <h4 className="text-[#141413] font-medium">GSPR Mapping Guidance</h4>
            <p className="text-[#6b6963] text-sm">
              For each selected GSPR, link supporting clinical evidence from your data sources.
              Provide a compliance statement explaining how the evidence demonstrates conformity.
              Identify any gaps and define next steps where needed.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="mapping" className="w-full">
        <TabsList className="bg-white border-b border-gray-200 rounded-none w-full flex justify-start gap-2 mb-4">
          <TabsTrigger
            value="mapping"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#d97757] data-[state=active]:text-[#d97757] data-[state=active]:shadow-none bg-transparent px-3 py-2 font-normal text-[#616161]"
          >
            GSPR Mapping
          </TabsTrigger>
          <TabsTrigger
            value="evidence"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#d97757] data-[state=active]:text-[#d97757] data-[state=active]:shadow-none bg-transparent px-3 py-2 font-normal text-[#616161]"
          >
            Evidence Library
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mapping">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white p-4 rounded border border-[#e8e6dc]">
                <h3 className="text-[#141413] font-medium mb-3">Selected GSPRs</h3>
                <div className="h-[450px] overflow-y-auto">
                  {selectedGSPRs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                      <Info className="h-6 w-6 text-[#d97757] mb-2" />
                      <p className="text-[#6b6963] text-sm">No GSPRs selected</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#e8e6dc]">
                      {selectedGSPRs.map(gsprId => {
                        const gspr = getGsprDetails(gsprId);
                        const mappingData = mapping[gsprId] || {
                          evidenceSources: [],
                          complianceStatus: 'pending',
                        };
                        const isActive = activeGspr === gsprId;

                        return (
                          <li
                            key={gsprId}
                            className={`p-3 cursor-pointer hover:bg-[#f4f3ee] ${
                              isActive ? 'bg-[#faf0ec] border-l-2 border-[#d97757]' : ''
                            }`}
                            onClick={() => handleSetActiveGspr(gsprId)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-[#141413]">
                                {gspr.title}
                              </span>
                              <Badge
                                className={`text-xs ${getStatusColor(
                                  mappingData.complianceStatus
                                )}`}
                              >
                                {getStatusIcon(mappingData.complianceStatus)}
                                <span>
                                  {mappingData.complianceStatus === 'compliant'
                                    ? 'Compliant'
                                    : mappingData.complianceStatus === 'partial'
                                    ? 'Partial'
                                    : 'Pending'}
                                </span>
                              </Badge>
                            </div>
                            <div className="flex items-center mt-1 text-xs text-[#6b6963]">
                              <FileText className="h-3 w-3 mr-1" />
                              <span>{mappingData.evidenceSources.length} evidence items</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-1 lg:col-span-2">
              {activeGspr ? (
                <div className="bg-white p-5 rounded border border-[#e8e6dc]">
                  {console.log('Rendering GSPR detail panel for:', activeGspr)}
                  <div className="flex justify-between items-start mb-4 border-b border-[#e8e6dc] pb-4">
                    <div>
                      <h3 className="text-lg font-medium text-[#141413]">
                        {getGsprDetails(activeGspr).title}
                      </h3>
                      <p className="text-sm text-[#6b6963] mt-1">
                        {getGsprDetails(activeGspr).description}
                      </p>
                    </div>
                    <Badge
                      className={`text-xs ${getStatusColor(
                        mapping[activeGspr]?.complianceStatus || 'pending'
                      )}`}
                    >
                      {getStatusIcon(mapping[activeGspr]?.complianceStatus || 'pending')}
                      <span>
                        {mapping[activeGspr]?.complianceStatus === 'compliant'
                          ? 'Compliant'
                          : mapping[activeGspr]?.complianceStatus === 'partial'
                          ? 'Partial'
                          : 'Pending'}
                      </span>
                    </Badge>
                  </div>

                  {/* AI Analysis Button and Progress */}
                  <div className="mb-4">
                    {console.log('Rendering AI Analysis section')}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2">
                      <div className="flex items-center">
                        <Shield className="h-4 w-4 text-[#d97757] mr-2" />
                        <span className="text-sm font-medium text-[#141413]">
                          AI-Assisted Regulatory Analysis
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 border-[#d97757] text-[#d97757] hover:bg-[#faf0ec] w-full sm:w-auto"
                        onClick={() => generateAIAnalysis(activeGspr)}
                        disabled={isGeneratingAIAnalysis}
                      >
                        {isGeneratingAIAnalysis && aiAnalysisTarget === activeGspr ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            <span>Generate with GPT-4o</span>
                          </>
                        )}
                      </Button>
                    </div>

                    {isGeneratingAIAnalysis && aiAnalysisTarget === activeGspr && (
                      <div>
                        <Progress value={aiAnalysisProgress} className="h-2 mb-1" />
                        <p className="text-xs text-[#6b6963] text-right">
                          {aiAnalysisProgress < 100
                            ? 'GPT-4o is analyzing evidence and generating regulatory insights...'
                            : 'Analysis complete!'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-[#141413] mb-2">
                        <span className="flex items-center">
                          Regulatory Interpretation
                          <CerTooltipWrapper
                            tooltipContent="Specify how this GSPR applies to your device in its specific context"
                            whyThisMatters="Accurate interpretation of GSPRs in the context of your device is a key regulatory requirement that helps notified bodies understand relevance"
                          >
                            <Info className="h-3.5 w-3.5 ml-1 text-gray-400" />
                          </CerTooltipWrapper>
                        </span>
                      </h4>
                      <Textarea
                        value={mapping[activeGspr]?.regulatoryInterpretation || ''}
                        onChange={e =>
                          handleRegulatoryInterpretationChange(activeGspr, e.target.value)
                        }
                        placeholder="Explain how this requirement applies to your device..."
                        className="border-[#e8e6dc] h-20 text-sm"
                      />
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-[#141413] mb-2">Compliance Status</h4>
                      <Select
                        value={mapping[activeGspr]?.complianceStatus || 'pending'}
                        onValueChange={value => handleComplianceStatusChange(activeGspr, value)}
                      >
                        <SelectTrigger className="border-[#e8e6dc] mb-2">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending Evaluation</SelectItem>
                          <SelectItem value="partial">Partially Compliant</SelectItem>
                          <SelectItem value="compliant">Fully Compliant</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex items-center space-x-2 mt-2">
                        <Checkbox
                          id="gaps-identified"
                          checked={mapping[activeGspr]?.gapsIdentified || false}
                          onCheckedChange={checked =>
                            handleGapsIdentifiedChange(activeGspr, checked)
                          }
                        />
                        <label
                          htmlFor="gaps-identified"
                          className="text-xs font-medium leading-none"
                        >
                          Evidence gaps identified
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-[#141413] mb-2">
                        Compliance Statement
                        <span className="text-xs text-[#d97757] ml-1">*</span>
                      </h4>
                      <Textarea
                        value={mapping[activeGspr]?.complianceStatement || ''}
                        onChange={e => handleComplianceStatementChange(activeGspr, e.target.value)}
                        placeholder="Explain how evidence demonstrates compliance..."
                        className="border-[#e8e6dc] h-20 text-sm"
                      />
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-[#141413] mb-2">
                        <span className="flex items-center">
                          Acceptance Criteria
                          <CerTooltipWrapper
                            tooltipContent="Define criteria that must be met to consider this GSPR as satisfied"
                            whyThisMatters="Pre-defined acceptance criteria are essential for meeting EU MDR requirements and notified body expectations"
                          >
                            <Info className="h-3.5 w-3.5 ml-1 text-gray-400" />
                          </CerTooltipWrapper>
                        </span>
                      </h4>
                      <Textarea
                        value={mapping[activeGspr]?.acceptanceCriteria || ''}
                        onChange={e => handleAcceptanceCriteriaChange(activeGspr, e.target.value)}
                        placeholder="Define measurable criteria for considering this GSPR satisfied..."
                        className="border-[#e8e6dc] h-20 text-sm"
                      />
                    </div>
                  </div>

                  {mapping[activeGspr]?.gapsIdentified && (
                    <div className="p-3 border border-[#F2C811] bg-[#FFFCE5] rounded mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-[#141413]">Gap Assessment</h4>
                        <CerTooltipWrapper
                          tooltipContent="Gaps in clinical evidence must be identified and addressed per MDR Annex XIV"
                          whyThisMatters="Notified Bodies will scrutinize your gap management and mitigation plans as part of conformity assessment"
                        >
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        </CerTooltipWrapper>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-xs text-[#141413] font-medium mb-1 block">
                            Gap Description
                          </label>
                          <Textarea
                            value={mapping[activeGspr]?.gapStatement || ''}
                            onChange={e => handleGapStatementChange(activeGspr, e.target.value)}
                            placeholder="Describe identified gaps in the clinical evidence..."
                            className="border-[#e8e6dc] h-16 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[#141413] font-medium mb-1 block">
                            Gap Impact Assessment
                          </label>
                          <Textarea
                            value={mapping[activeGspr]?.gapImpact || ''}
                            onChange={e => handleGapImpactChange(activeGspr, e.target.value)}
                            placeholder="Assess the impact of these gaps on safety and performance..."
                            className="border-[#e8e6dc] h-16 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-[#141413] font-medium mb-1 block">
                          Mitigation Plan & Next Steps
                          <span className="text-xs text-[#d97757] ml-1">*</span>
                        </label>
                        <Textarea
                          value={mapping[activeGspr]?.nextSteps || ''}
                          onChange={e => handleNextStepsChange(activeGspr, e.target.value)}
                          placeholder="Define concrete actions to address the identified gaps (e.g., PMCF studies, additional literature reviews)..."
                          className="border-[#e8e6dc] h-16 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-medium text-[#141413]">Linked Evidence</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-[#d97757] hover:bg-[#faf0ec]"
                        onClick={() => {
                          const newEvidence = {
                            id: `ev-${Date.now()}`,
                            title: 'New Evidence Source',
                            type: 'clinical_data',
                            description: '',
                          };
                          handleAddEvidence(activeGspr, newEvidence);
                          toast({
                            title: 'Evidence added',
                            description:
                              'A new evidence source has been linked to this GSPR requirement.',
                          });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Evidence
                      </Button>
                    </div>

                    {mapping[activeGspr]?.evidenceSources &&
                    mapping[activeGspr]?.evidenceSources.length > 0 ? (
                      <div className="border border-[#e8e6dc] rounded overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-[#faf9f5] text-[#6b6963]">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Title</th>
                              <th className="text-left px-3 py-2 font-medium w-24">Type</th>
                              <th className="text-right px-3 py-2 font-medium w-16"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e8e6dc]">
                            {mapping[activeGspr].evidenceSources.slice(0, 3).map(evidence => (
                              <tr key={evidence.id} className="hover:bg-[#f4f3ee]">
                                <td className="px-3 py-2 truncate">{evidence.title}</td>
                                <td className="px-3 py-2">
                                  {EVIDENCE_SOURCES[evidence.type] || evidence.type}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[#8a8880] hover:text-red-600 hover:bg-red-50"
                                    onClick={() => handleRemoveEvidence(activeGspr, evidence.id)}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {mapping[activeGspr].evidenceSources.length > 3 && (
                          <div className="px-3 py-2 text-center text-xs text-[#d97757] hover:bg-[#faf0ec] cursor-pointer">
                            Show {mapping[activeGspr].evidenceSources.length - 3} more items
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center border border-dashed border-[#e8e6dc] rounded p-4">
                        <p className="text-[#6b6963] text-sm">
                          No evidence linked to this requirement yet
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[#e8e6dc] pt-4 mt-4 mb-4">
                    <h4 className="text-sm font-medium text-[#141413] mb-3">
                      <span className="flex items-center">
                        Evidence Quality & Strength Assessment
                        <CerTooltipWrapper
                          tooltipContent="Assess the overall quality and strength of the evidence for this GSPR"
                          whyThisMatters="MEDDEV 2.7/1 Rev 4 requires assessment of evidence quality factors such as methodological quality, directness of evidence, consistency, and clinical significance"
                        >
                          <Info className="h-3.5 w-3.5 ml-1 text-gray-400" />
                        </CerTooltipWrapper>
                      </span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs text-[#141413] font-medium mb-1 block">
                          Evidence Strength
                        </label>
                        <Select
                          value={mapping[activeGspr]?.evidenceStrength || 'unrated'}
                          onValueChange={value => handleEvidenceStrengthChange(activeGspr, value)}
                        >
                          <SelectTrigger className="border-[#e8e6dc]">
                            <SelectValue placeholder="Select strength" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unrated">Unrated</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-[#141413] font-medium mb-1 block">
                          Clinical Relevance
                        </label>
                        <Textarea
                          value={mapping[activeGspr]?.clinicalRelevance || ''}
                          onChange={e => handleClinicalRelevanceChange(activeGspr, e.target.value)}
                          placeholder="Explain the clinical relevance of the evidence to this specific requirement..."
                          className="border-[#e8e6dc] h-20 text-sm"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="text-xs text-[#141413] font-medium mb-1 block">
                        Reviewer Comments
                      </label>
                      <Textarea
                        value={mapping[activeGspr]?.reviewerComments || ''}
                        onChange={e => handleReviewerCommentsChange(activeGspr, e.target.value)}
                        placeholder="Add reviewer notes, action items, or comments for peer review..."
                        className="border-[#e8e6dc] h-16 text-sm"
                      />
                      {mapping[activeGspr]?.lastReviewed && (
                        <p className="text-xs text-[#6b6963] mt-1">
                          Last reviewed:{' '}
                          {new Date(mapping[activeGspr].lastReviewed).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      className="border-[#d97757] text-[#d97757] hover:bg-[#faf0ec]"
                      onClick={handleSave}
                      disabled={!changes}
                    >
                      Save Mapping
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded border border-[#e8e6dc] flex flex-col items-center justify-center h-[450px] text-center p-6">
                  <Info className="h-8 w-8 text-[#d97757] mb-3" />
                  <h3 className="text-md font-medium text-[#141413] mb-1">Select a GSPR to Map</h3>
                  <p className="text-sm text-[#6b6963] max-w-md">
                    Choose a requirement from the list to map clinical evidence
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="evidence">
          <div className="bg-white p-5 rounded border border-[#e8e6dc]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-[#141413]">Evidence Library</h3>
              <div className="flex space-x-3">
                <Badge variant="outline" className="bg-[#faf0ec] text-[#d97757]">
                  FAERS: {availableEvidenceCount.FAERS}
                </Badge>
                <Badge variant="outline" className="bg-[#faf0ec] text-[#d97757]">
                  Literature: {availableEvidenceCount.LITERATURE}
                </Badge>
              </div>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#6b6963]" />
              <Input
                className="border-[#e8e6dc] pl-10"
                placeholder="Search evidence by title, type, or date..."
                value={evidenceSearchTerm}
                onChange={e => setEvidenceSearchTerm(e.target.value)}
              />
            </div>

            <div className="border border-[#e8e6dc] rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#faf9f5] text-[#6b6963]">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Title</th>
                    <th className="text-left px-4 py-3 font-medium w-32">Type</th>
                    <th className="text-left px-4 py-3 font-medium w-32">Date</th>
                    <th className="text-right px-4 py-3 font-medium w-32">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6dc]">
                  {filteredEvidence.length > 0 ? (
                    filteredEvidence.map(evidence => (
                      <tr key={evidence.id} className="hover:bg-[#f4f3ee]">
                        <td className="px-4 py-3 truncate max-w-[300px]">{evidence.title}</td>
                        <td className="px-4 py-3">
                          {EVIDENCE_SOURCES[evidence.type] || evidence.type}
                        </td>
                        <td className="px-4 py-3">{evidence.date}</td>
                        <td className="px-4 py-3 text-right">
                          {activeGspr && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-[#d97757] hover:text-[#c15f3c] hover:bg-[#faf0ec]"
                              onClick={() => handleAddEvidence(activeGspr, evidence)}
                              disabled={mapping[activeGspr]?.evidenceSources?.some(
                                e => e.id === evidence.id
                              )}
                            >
                              {mapping[activeGspr]?.evidenceSources?.some(e => e.id === evidence.id)
                                ? 'Added'
                                : 'Add'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-4 py-6 text-center text-[#6b6963]">
                        No evidence found. Try adjusting your search or retrieving more data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
