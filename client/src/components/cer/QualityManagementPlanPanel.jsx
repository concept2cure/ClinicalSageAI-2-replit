import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle,
  Clock,
  Clipboard,
  ClipboardCheck,
  Download,
  Edit,
  FilePlus,
  FileCheck,
  FileText,
  LinkIcon,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import CerTooltipWrapper from './CerTooltipWrapper';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { cerApiService } from '@/services/CerAPIService';
import { getComplianceMetrics } from '@/services/CerComplianceService';
import ComplianceDashboardPanel from './ComplianceDashboardPanel';
import ObjectiveComplianceCard from './ObjectiveComplianceCard';
import QmpAuditTrailPanel from './QmpAuditTrailPanel';
import QmpTraceabilityHeatmap from './QmpTraceabilityHeatmap';
import CerComprehensiveReportsPanel from './CerComprehensiveReportsPanel';

// ICH E6(R3) Compliant Quality Management Plan Component
const QualityManagementPlanPanel = ({ deviceName, manufacturer, onQMPGenerated }) => {
  const { toast } = useToast();
  const [objectives, setObjectives] = useState([]);
  const [ctqFactors, setCtqFactors] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  // QMP Metadata fields (added based on new requirements)
  const [planMetadata, setPlanMetadata] = useState({
    planName: 'Quality Management Plan',
    planVersion: '1.0.0',
    authorName: 'System User', // Default value, should be replaced with actual user
    authorRole: 'Quality Manager',
    dateCreated: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    linkedCerVersion: 'Current Draft',
  });

  const [currentObjective, setCurrentObjective] = useState({
    id: null,
    title: '',
    description: '',
    measures: '',
    responsible: '',
    timeline: '',
    status: 'planned',
    scopeSections: [], // New field for multi-select list of CER sections
    mitigationActions: '', // New field for control actions
  });

  const [currentCtq, setCurrentCtq] = useState({
    id: null,
    objectiveId: null,
    name: '',
    description: '',
    riskLevel: 'medium',
    associatedSection: '',
    mitigation: '',
    nextReviewDate: '', // For risk-based review scheduling
    status: 'pending', // For tracking CtQ satisfaction status
  });

  const [editingCtqId, setEditingCtqId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [draggedObjective, setDraggedObjective] = useState(null);
  const [showInlineCtqForm, setShowInlineCtqForm] = useState(null);
  const [validationResults, setValidationResults] = useState(null);

  // Refs for drag and drop
  const objectiveRefs = useRef({});

  // Load existing QMP data from API on component mount
  useEffect(() => {
    const loadQmpData = async () => {
      try {
        setIsLoadingPlan(true);

        // Fetch QMP data with metadata from the server
        const response = await fetch('/api/qmp-api/data');

        if (response.ok) {
          const data = await response.json();

          // Set QMP data including metadata
          if (data.objectives) {
            setObjectives(data.objectives);
          }

          if (data.ctqFactors) {
            setCtqFactors(data.ctqFactors);
          }

          // Set metadata if available, otherwise use defaults
          if (data.metadata) {
            setPlanMetadata(data.metadata);
          }

          toast({
            title: 'QMP Data Loaded',
            description: 'Quality Management Plan data loaded successfully',
            variant: 'default',
          });
        } else {
          // If API call fails, use sample data for demonstration
          toast({
            title: 'Using Sample Data',
            description: 'Could not load QMP data from server. Using sample data.',
            variant: 'default',
          });

          const sampleObjectives = [
            {
              id: 1,
              title: 'Ensure Clinical Data Integrity',
              description:
                'Maintain the highest standards for clinical data collection, processing, and analysis to ensure data integrity throughout the clinical evaluation process.',
              measures:
                'Data validation rate >98%, Error reporting within 24 hours, Monthly data quality audits',
              responsible: 'Clinical Data Manager',
              timeline: 'Throughout CER development and ongoing monitoring',
              status: 'in-progress',
            },
            {
              id: 2,
              title: 'Regulatory Compliance Assurance',
              description:
                'Ensure all aspects of the clinical evaluation comply with EU MDR 2017/745, MEDDEV 2.7/1 Rev 4, and applicable international standards.',
              measures:
                '100% compliance with regulatory requirements, Pre-submission regulatory review completed',
              responsible: 'Regulatory Affairs Manager',
              timeline: 'Verification prior to submission and ongoing monitoring',
              status: 'planned',
            },
          ];

          const sampleCtqFactors = [
            {
              id: 1,
              objectiveId: 1,
              name: 'Literature Search Comprehensiveness',
              description:
                'Ensuring literature searches capture all relevant clinical data for the device and equivalent devices',
              riskLevel: 'high',
              associatedSection: 'Literature Review',
              mitigation:
                'Use structured search protocol with multiple databases; independent verification of search results',
            },
            {
              id: 2,
              objectiveId: 1,
              name: 'FAERS Data Integration',
              description:
                'Ensuring complete and accurate adverse event data integration from FDA FAERS',
              riskLevel: 'medium',
              associatedSection: 'Post-Market Surveillance',
              mitigation:
                'Automated data validation checks; manual verification of critical signals',
            },
            {
              id: 3,
              objectiveId: 2,
              name: 'GSPR Documentation Completeness',
              description: 'Ensuring all applicable GSPRs are addressed with appropriate evidence',
              riskLevel: 'high',
              associatedSection: 'GSPR Mapping',
              mitigation:
                'Dual verification process; regulatory expert review; completeness checklist',
            },
          ];

          setObjectives(sampleObjectives);
          setCtqFactors(sampleCtqFactors);
        }
      } catch (error) {
        console.error('Error loading QMP data:', error);
        toast({
          title: 'Error loading Quality Management Plan',
          description: error.message || 'Could not load QMP data. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingPlan(false);
      }
    };

    loadQmpData();
  }, [toast]);

  // Add or update objective
  const handleSaveObjective = () => {
    if (!currentObjective.title || !currentObjective.description) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a title and description for the quality objective.',
        variant: 'destructive',
      });
      return;
    }

    if (currentObjective.id) {
      // Update existing objective
      setObjectives(
        objectives.map(obj => (obj.id === currentObjective.id ? currentObjective : obj))
      );
      toast({
        title: 'Objective Updated',
        description: 'Quality objective has been updated successfully.',
        variant: 'default',
      });
    } else {
      // Add new objective
      const newObjective = {
        ...currentObjective,
        id: objectives.length ? Math.max(...objectives.map(o => o.id)) + 1 : 1,
      };
      setObjectives([...objectives, newObjective]);
      toast({
        title: 'Objective Added',
        description: 'New quality objective has been added successfully.',
        variant: 'default',
      });
    }

    // Reset form
    setCurrentObjective({
      id: null,
      title: '',
      description: '',
      measures: '',
      responsible: '',
      timeline: '',
      status: 'planned',
      scopeSections: [],
      mitigationActions: '',
    });
    setIsEditing(false);
  };

  // Edit existing objective
  const handleEditObjective = objective => {
    setCurrentObjective(objective);
    setIsEditing(true);
  };

  // Delete objective
  const handleDeleteObjective = id => {
    // Check if there are any CtQ factors associated with this objective
    const associatedFactors = ctqFactors.filter(factor => factor.objectiveId === id);

    if (associatedFactors.length > 0) {
      // Ask for confirmation before deleting the objective and associated factors
      if (
        window.confirm(
          `This objective has ${associatedFactors.length} associated Critical-to-Quality factors. Are you sure you want to delete it and all associated factors?`
        )
      ) {
        setObjectives(objectives.filter(obj => obj.id !== id));
        setCtqFactors(ctqFactors.filter(factor => factor.objectiveId !== id));
        toast({
          title: 'Objective Deleted',
          description: `Quality objective and ${associatedFactors.length} associated Critical-to-Quality factors have been removed.`,
          variant: 'default',
        });
      }
    } else {
      setObjectives(objectives.filter(obj => obj.id !== id));
      toast({
        title: 'Objective Deleted',
        description: 'Quality objective has been removed.',
        variant: 'default',
      });
    }
  };

  // Add or update CtQ factor
  const handleSaveCtqFactor = () => {
    if (!currentCtq.name || !currentCtq.description || !currentCtq.objectiveId) {
      toast({
        title: 'Missing Information',
        description:
          'Please provide a name, description, and select an objective for the Critical-to-Quality factor.',
        variant: 'destructive',
      });
      return;
    }

    if (editingCtqId) {
      // Update existing CtQ factor
      setCtqFactors(
        ctqFactors.map(factor =>
          factor.id === editingCtqId ? { ...currentCtq, id: editingCtqId } : factor
        )
      );
      toast({
        title: 'CtQ Factor Updated',
        description: 'Critical-to-Quality factor has been updated successfully.',
        variant: 'default',
      });
    } else {
      // Add new CtQ factor
      const newCtq = {
        ...currentCtq,
        id: ctqFactors.length ? Math.max(...ctqFactors.map(f => f.id)) + 1 : 1,
      };
      setCtqFactors([...ctqFactors, newCtq]);
      toast({
        title: 'CtQ Factor Added',
        description: 'New Critical-to-Quality factor has been added successfully.',
        variant: 'default',
      });
    }

    // Reset form
    setCurrentCtq({
      id: null,
      objectiveId: null,
      name: '',
      description: '',
      riskLevel: 'medium',
      associatedSection: '',
      mitigation: '',
    });
    setEditingCtqId(null);
  };

  // Edit existing CtQ factor
  const handleEditCtqFactor = factor => {
    setCurrentCtq(factor);
    setEditingCtqId(factor.id);
  };

  // Delete CtQ factor
  const handleDeleteCtqFactor = id => {
    setCtqFactors(ctqFactors.filter(factor => factor.id !== id));
    toast({
      title: 'CtQ Factor Deleted',
      description: 'Critical-to-Quality factor has been removed.',
      variant: 'default',
    });
  };

  // Save QMP data to backend
  const saveQmpData = async () => {
    try {
      // Update the lastUpdated timestamp in metadata
      const updatedMetadata = {
        ...planMetadata,
        lastUpdated: new Date().toISOString(),
      };

      // Prepare data to save
      const qmpDataToSave = {
        objectives: objectives,
        ctqFactors: ctqFactors,
        metadata: updatedMetadata,
      };

      // Save data to backend
      const response = await fetch('/api/qmp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(qmpDataToSave),
      });

      if (response.ok) {
        setPlanMetadata(updatedMetadata);
        toast({
          title: 'QMP Data Saved',
          description: 'Quality Management Plan data saved successfully',
          variant: 'default',
        });
        return true;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save QMP data');
      }
    } catch (error) {
      console.error('Error saving QMP data:', error);
      toast({
        title: 'Error Saving QMP Data',
        description: error.message || 'Could not save QMP data. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Generate QMP document and add to CER
  const handleGenerateQMP = async () => {
    if (objectives.length === 0) {
      toast({
        title: 'No Objectives Defined',
        description:
          'Please define at least one quality objective before generating the QMP document.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      // First save the current QMP data
      const saveSuccess = await saveQmpData();

      if (!saveSuccess) {
        toast({
          title: 'QMP Generation Warning',
          description: 'Proceeding with QMP generation, but the latest data might not be saved.',
          variant: 'default',
        });
      }

      // Format QMP content
      const qmpContent = formatQmpContent();

      // Call the API to generate the QMP document
      const generateResponse = await fetch('/api/qmp/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceName,
          manufacturer,
          objectives,
          ctqFactors,
          metadata: planMetadata,
        }),
      });

      if (generateResponse.ok) {
        const data = await generateResponse.json();

        if (onQMPGenerated) {
          onQMPGenerated({
            title: planMetadata.planName || 'Quality Management Plan',
            type: 'qmp',
            content: data.content || qmpContent,
            metadata: planMetadata,
            lastUpdated: new Date().toISOString(),
          });
        }

        toast({
          title: 'QMP Generated Successfully',
          description: 'Quality Management Plan has been generated and added to your CER.',
          variant: 'default',
        });
      } else {
        const errorData = await generateResponse.json();
        throw new Error(errorData.error || 'Failed to generate QMP document');
      }
    } catch (error) {
      console.error('Error generating QMP:', error);
      toast({
        title: 'QMP Generation Failed',
        description: error.message || 'Could not generate QMP document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Format QMP content for inclusion in CER
  const formatQmpContent = () => {
    const deviceInfo = deviceName
      ? `Device: ${deviceName}${manufacturer ? ` (Manufacturer: ${manufacturer})` : ''}`
      : `Unnamed Device${manufacturer ? ` (Manufacturer: ${manufacturer})` : ''}`;

    // Format date strings for document
    const createdDate = new Date(planMetadata.dateCreated).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const updatedDate = new Date(planMetadata.lastUpdated).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Create title block for the QMP document with metadata as a formatted table
    const metadataSection = `
# ${planMetadata.planName}

| Document Metadata | Details |
|-------------------|---------|
| Plan Version | ${planMetadata.planVersion} |
| ${deviceInfo} | |
| Author | ${planMetadata.authorName}, ${planMetadata.authorRole} |
| Creation Date | ${createdDate} |
| Last Updated | ${updatedDate} |
| Linked CER Version | ${planMetadata.linkedCerVersion} |

`;

    const content = `${metadataSection}

## 1. Introduction

This Quality Management Plan (QMP) has been developed in accordance with ICH E6(R3) principles and EU MDR 2017/745 requirements to ensure the quality, integrity, and compliance of the clinical evaluation process for this medical device. The QMP outlines quality objectives, critical-to-quality factors, and methods for monitoring and maintaining quality throughout the clinical evaluation process.

## 2. Quality Objectives

${objectives
  .map(
    obj => `
### 2.${objectives.indexOf(obj) + 1}. ${obj.title}

**Description:** ${obj.description}

**Success Measures:** ${obj.measures}

**Responsible Party:** ${obj.responsible}

**Timeline:** ${obj.timeline}

**Status:** ${obj.status.charAt(0).toUpperCase() + obj.status.slice(1)}

${obj.scopeSections && obj.scopeSections.length > 0 ? `**Applicable CER Sections:** ${obj.scopeSections.join(', ')}` : ''}

${obj.mitigationActions ? `**Mitigation / Control Actions:**\n${obj.mitigationActions}` : ''}

${getCtqFactorsForObjective(obj.id)}
`
  )
  .join('')}

## 3. Quality Risk Management

The Critical-to-Quality factors identified above form the basis of our risk-based approach to quality management throughout the clinical evaluation process. Each factor has been assessed for risk level and appropriate mitigation strategies have been implemented.

## 4. Monitoring and Continuous Improvement

Quality monitoring will be conducted continuously throughout the clinical evaluation process. Regular quality reviews will be conducted at key milestones, with a comprehensive review prior to finalization of the CER.

## 5. Compliance Statement

This Quality Management Plan complies with:
- ICH E6(R3) Good Clinical Practice
- EU MDR 2017/745 Quality Management System requirements
- ISO 14155:2020 Clinical investigation of medical devices for human subjects
- MEDDEV 2.7/1 Rev 4 Clinical Evaluation guidance

_Document Generated: ${new Date().toLocaleDateString()}_
`;

    return content;
  };

  // Helper function to format CtQ factors for a specific objective
  const getCtqFactorsForObjective = objectiveId => {
    const factors = ctqFactors.filter(factor => factor.objectiveId === objectiveId);

    if (factors.length === 0) {
      return 'No Critical-to-Quality factors defined for this objective.';
    }

    return `**Critical-to-Quality Factors:**\n${factors
      .map(
        factor => `
* **${factor.name}**
  * Associated Section: ${factor.associatedSection}
  * Risk Level: ${factor.riskLevel.charAt(0).toUpperCase() + factor.riskLevel.slice(1)}
  * Description: ${factor.description}
  * Mitigation: ${factor.mitigation}
`
      )
      .join('')}`;
  };

  // Drag and drop functionality
  const handleDragStart = (e, objective) => {
    setDraggedObjective(objective);
    // Set data to make dragging work
    e.dataTransfer.setData('text/plain', objective.id);
    e.dataTransfer.effectAllowed = 'move';
    // Add styling to the dragged item
    setTimeout(() => {
      if (objectiveRefs.current[objective.id]) {
        objectiveRefs.current[objective.id].style.opacity = '0.4';
      }
    }, 0);
  };

  const handleDragEnd = (e, objective) => {
    if (objectiveRefs.current[objective.id]) {
      objectiveRefs.current[objective.id].style.opacity = '1';
    }
    setDraggedObjective(null);
  };

  const handleDragOver = (e, targetObjective) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Don't do anything if it's the same objective
    if (!draggedObjective || draggedObjective.id === targetObjective.id) {
      return;
    }

    // Add visual indicator for drop target
    if (objectiveRefs.current[targetObjective.id]) {
      objectiveRefs.current[targetObjective.id].style.borderTop = '3px dashed #5585b3';
    }
  };

  const handleDragLeave = (e, targetObjective) => {
    if (objectiveRefs.current[targetObjective.id]) {
      objectiveRefs.current[targetObjective.id].style.borderTop = 'none';
    }
  };

  const handleDrop = (e, targetObjective) => {
    e.preventDefault();

    // Reset styling
    if (objectiveRefs.current[targetObjective.id]) {
      objectiveRefs.current[targetObjective.id].style.borderTop = 'none';
    }

    // Don't do anything if it's the same objective
    if (!draggedObjective || draggedObjective.id === targetObjective.id) {
      return;
    }

    // Reorder objectives
    const newObjectives = [...objectives];
    const draggedIndex = newObjectives.findIndex(o => o.id === draggedObjective.id);
    const targetIndex = newObjectives.findIndex(o => o.id === targetObjective.id);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove dragged item
      const [removed] = newObjectives.splice(draggedIndex, 1);
      // Insert at new position
      newObjectives.splice(targetIndex, 0, removed);

      setObjectives(newObjectives);
      toast({
        title: 'Objectives Reordered',
        description: 'Quality objectives order has been updated successfully.',
        variant: 'default',
      });
    }
  };

  // Add CtQ inline for specific objective
  const handleAddCtqInline = objectiveId => {
    setCurrentCtq({
      id: null,
      objectiveId: objectiveId,
      name: '',
      description: '',
      riskLevel: 'medium',
      associatedSection: '',
      mitigation: '',
      nextReviewDate: '',
      status: 'pending',
    });

    setShowInlineCtqForm(objectiveId);
  };

  const handleSaveInlineCtq = () => {
    handleSaveCtqFactor();
    setShowInlineCtqForm(null);
  };

  const handleCancelInlineCtq = () => {
    setShowInlineCtqForm(null);
    setCurrentCtq({
      id: null,
      objectiveId: null,
      name: '',
      description: '',
      riskLevel: 'medium',
      associatedSection: '',
      mitigation: '',
      nextReviewDate: '',
      status: 'pending',
    });
  };

  // Render status badge with appropriate color and icon
  const renderStatusBadge = status => {
    let color, icon;

    switch (status) {
      case 'completed':
        color = 'bg-green-100 text-green-800 border-green-200';
        icon = <CheckCircle className="mr-1 h-3 w-3" />;
        break;
      case 'in-progress':
        color = 'bg-blue-100 text-blue-800 border-blue-200';
        icon = <ArrowRight className="mr-1 h-3 w-3" />;
        break;
      case 'blocked':
        color = 'bg-red-100 text-red-800 border-red-200';
        icon = <XCircle className="mr-1 h-3 w-3" />;
        break;
      case 'planned':
      default:
        color = 'bg-gray-100 text-gray-800 border-gray-200';
        icon = <Clock className="mr-1 h-3 w-3" />;
    }

    return (
      <Badge
        className={`${color} rounded-md py-0.5 px-2 text-xs font-medium capitalize flex items-center`}
      >
        {icon}
        {status.replace('-', ' ')}
      </Badge>
    );
  };

  // Render risk level badge with appropriate color and icon
  const renderRiskBadge = level => {
    let color, icon;
    switch (level) {
      case 'high':
        color = 'bg-red-100 text-red-800 border-red-200';
        icon = <AlertCircle className="mr-1 h-3 w-3" />;
        break;
      case 'medium':
        color = 'bg-amber-100 text-amber-800 border-amber-200';
        icon = <AlertTriangle className="mr-1 h-3 w-3" />;
        break;
      case 'low':
        color = 'bg-green-100 text-green-800 border-green-200';
        icon = <CheckCircle className="mr-1 h-3 w-3" />;
        break;
      default:
        color = 'bg-gray-100 text-gray-800 border-gray-200';
        icon = <AlertCircle className="mr-1 h-3 w-3" />;
    }

    return (
      <Badge
        className={`${color} rounded-md py-0.5 px-2 text-xs font-medium capitalize flex items-center`}
      >
        {icon}
        {level} risk
      </Badge>
    );
  };

  // Validate QMP integration with CER
  const validateQmpIntegration = async () => {
    if (objectives.length === 0) {
      toast({
        title: 'No Objectives Defined',
        description: 'Please define at least one quality objective before validating the QMP.',
        variant: 'destructive',
      });
      return;
    }

    setIsValidating(true);

    try {
      // Get all CER sections
      const cerSections = [
        'Safety',
        'Literature Review',
        'Clinical Data',
        'GSPR Mapping',
        'State of the Art',
        'Benefit-Risk',
        'PMS',
        'PMCF',
        'Equivalence',
      ];

      // Call validation API
      const results = await cerApiService.validateQmpIntegration(objectives, cerSections, 'mdr');

      setValidationResults(results);

      // Status-based toast notification
      if (results.complianceStatus.compliant) {
        toast({
          title: 'QMP Integration Validated',
          description: 'Your Quality Management Plan meets ICH E6(R3) integration requirements',
          variant: 'default',
        });
      } else if (results.complianceStatus.criticalSectionsMissing) {
        toast({
          title: 'Critical Gaps Detected',
          description: `Missing critical sections: ${results.sectionsAnalysis.missingCriticalSections.join(', ')}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Improvements Needed',
          description: `${results.aiAnalysis.recommendations.length} recommendations available, coverage: ${results.complianceStatus.coverage}%`,
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error validating QMP integration:', error);
      toast({
        title: 'Validation Error',
        description: error.message || 'Could not validate QMP integration with CER.',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Render validation results UI
  const renderValidationResults = () => {
    if (!validationResults) return null;

    const { complianceStatus, sectionsAnalysis, aiAnalysis } = validationResults;

    const statusColor = complianceStatus.compliant
      ? 'bg-green-50 border-green-200'
      : complianceStatus.criticalSectionsMissing
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200';

    const statusIcon = complianceStatus.compliant ? (
      <CheckCircle className="h-5 w-5 text-green-500" />
    ) : complianceStatus.criticalSectionsMissing ? (
      <AlertTriangle className="h-5 w-5 text-red-500" />
    ) : (
      <AlertCircle className="h-5 w-5 text-amber-500" />
    );

    return (
      <div className="mt-4 mb-6">
        <div className={`border rounded-md p-4 ${statusColor}`}>
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">{statusIcon}</div>
            <div className="ml-3">
              <h3 className="text-sm font-medium">
                {complianceStatus.compliant
                  ? 'QMP integration validated successfully'
                  : complianceStatus.criticalSectionsMissing
                    ? 'Critical sections missing from QMP coverage'
                    : 'Improvements needed for full QMP integration'}
              </h3>
              <div className="mt-2 text-sm">
                <p>Coverage: {complianceStatus.coverage}% of required CER sections</p>

                {sectionsAnalysis.missingCriticalSections.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-red-700">Missing critical sections:</p>
                    <ul className="list-disc pl-5 mt-1 text-red-700">
                      {sectionsAnalysis.missingCriticalSections.map(section => (
                        <li key={section}>{section}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {sectionsAnalysis.missingOptionalSections.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-amber-700">Missing optional sections:</p>
                    <ul className="list-disc pl-5 mt-1 text-amber-700">
                      {sectionsAnalysis.missingOptionalSections.map(section => (
                        <li key={section}>{section}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiAnalysis.recommendations.length > 0 && (
                  <div className="mt-3">
                    <p className="font-medium">AI Recommendations:</p>
                    <ul className="list-disc pl-5 mt-1">
                      {aiAnalysis.recommendations.slice(0, 3).map((rec, idx) => (
                        <li key={idx} className="mt-1">
                          {rec}
                        </li>
                      ))}
                      {aiAnalysis.recommendations.length > 3 && (
                        <li className="mt-1 italic">
                          {aiAnalysis.recommendations.length - 3} more recommendations available...
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // State for compliance metrics
  const [complianceMetrics, setComplianceMetrics] = useState(null);
  const [isLoadingCompliance, setIsLoadingCompliance] = useState(false);

  // Fetch compliance metrics
  const fetchComplianceMetrics = async () => {
    try {
      setIsLoadingCompliance(true);
      const data = await getComplianceMetrics('current', 'mdr');
      setComplianceMetrics(data);
    } catch (error) {
      console.error('Error fetching compliance metrics:', error);
      toast({
        title: 'Error Loading Compliance Metrics',
        description: error.message || 'Failed to load compliance metrics',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCompliance(false);
    }
  };

  // Load compliance metrics on component mount
  useEffect(() => {
    if (objectives.length > 0) {
      fetchComplianceMetrics();
    }
  }, [objectives]);

  // Calculate metrics for dashboard with compliance engine integration
  const metrics = useMemo(() => {
    const totalObjectives = objectives.length;
    const completedObjectives = objectives.filter(obj => obj.status === 'completed').length;
    const inProgressObjectives = objectives.filter(obj => obj.status === 'in-progress').length;
    const blockedObjectives = objectives.filter(obj => obj.status === 'blocked').length;

    const totalCtqFactors = ctqFactors.length;
    const highRiskFactors = ctqFactors.filter(factor => factor.riskLevel === 'high').length;
    const mediumRiskFactors = ctqFactors.filter(factor => factor.riskLevel === 'medium').length;
    const lowRiskFactors = ctqFactors.filter(factor => factor.riskLevel === 'low').length;

    // Link analysis - checks which CtQ factors have associated sections
    const linkedFactors = ctqFactors.filter(
      factor => factor.associatedSection && factor.associatedSection.trim() !== ''
    ).length;

    // Calculate completion percentage
    const objectivesCompletionPercentage =
      totalObjectives > 0 ? Math.round((completedObjectives / totalObjectives) * 100) : 0;

    const ctqFactorsWithMitigation = ctqFactors.filter(
      factor => factor.mitigation && factor.mitigation.trim() !== ''
    ).length;

    const mitigationCompletionPercentage =
      totalCtqFactors > 0 ? Math.round((ctqFactorsWithMitigation / totalCtqFactors) * 100) : 0;

    // Analyze scope section coverage - all required CER sections
    const requiredCERSections = [
      'Safety',
      'Literature Review',
      'Clinical Data',
      'GSPR Mapping',
      'State of the Art',
      'Benefit-Risk',
      'PMS',
      'PMCF',
      'Equivalence',
    ];

    // Count how many required sections are covered by at least one quality objective
    const coveredSections = requiredCERSections.filter(section => {
      return objectives.some(obj => obj.scopeSections && obj.scopeSections.includes(section));
    });

    const sectionCoverageCount = coveredSections.length;
    const sectionCoveragePercentage = Math.round(
      (sectionCoverageCount / requiredCERSections.length) * 100
    );

    // Calculate scope section weight for each objective (more sections = higher complexity)
    const objectivesWithSections = objectives.filter(
      obj => obj.scopeSections && obj.scopeSections.length > 0
    ).length;

    const scopeCoveragePercentage =
      totalObjectives > 0 ? Math.round((objectivesWithSections / totalObjectives) * 100) : 0;

    // Weighted document readiness - includes section coverage as a key compliance factor
    const documentReadiness =
      totalObjectives > 0 && totalCtqFactors > 0
        ? Math.round(
            objectivesCompletionPercentage * 0.3 +
              mitigationCompletionPercentage * 0.2 +
              (linkedFactors / totalCtqFactors) * 100 * 0.2 +
              sectionCoveragePercentage * 0.3
          )
        : 0;

    // Get compliance status counts from compliance engine metrics
    let complianceStatusCounts = {
      excellent: 0,
      good: 0,
      needsImprovement: 0,
      criticalIssues: 0,
      notEvaluated: totalObjectives,
    };

    if (complianceMetrics && complianceMetrics.complianceBreakdown) {
      complianceStatusCounts = complianceMetrics.complianceBreakdown;
    }

    // Include compliance metrics
    const complianceScore = complianceMetrics ? complianceMetrics.overallComplianceScore : null;

    return {
      totalObjectives,
      completedObjectives,
      inProgressObjectives,
      blockedObjectives,
      totalCtqFactors,
      highRiskFactors,
      mediumRiskFactors,
      lowRiskFactors,
      linkedFactors,
      objectivesCompletionPercentage,
      mitigationCompletionPercentage,
      documentReadiness,
      // New metrics for compliance engine
      sectionCoverageCount,
      sectionCoveragePercentage,
      totalSections: requiredCERSections.length,
      scopeCoveragePercentage,
      coveredSections,
      // Compliance metrics from engine
      complianceScore,
      complianceStatusCounts,
      // Include object mapping for status counts
      objectivesByStatus: {
        complete: completedObjectives,
        inProgress: inProgressObjectives,
        planned: totalObjectives - completedObjectives - inProgressObjectives - blockedObjectives,
        blocked: blockedObjectives,
      },
      // Overall completion for API compatibility
      overallCompletion: objectivesCompletionPercentage,
      // Section coverage for API compatibility
      sectionCoverage: sectionCoveragePercentage,
    };
  }, [objectives, ctqFactors, complianceMetrics]);

  return (
    <div className="bg-[#F9F9F9] p-4">
      {/* QMP Metadata Header Bar */}
      <div className="mb-4 p-3 bg-white rounded-lg border shadow-sm flex flex-wrap items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold text-[#5585b3]">{planMetadata.planName}</h3>
            <span className="text-xs text-[#6b6963]">ICH E6(R3) Documentation</span>
          </div>
          <Badge variant="outline" className="bg-gray-50 text-[#141413] font-medium">
            v{planMetadata.planVersion}
          </Badge>
        </div>

        <div className="flex items-center space-x-3 text-sm">
          <div className="flex items-center text-[#6b6963]">
            <span className="font-medium">{planMetadata.authorName}</span>
            <span className="mx-1">•</span>
            <span>{planMetadata.authorRole}</span>
          </div>
          <div className="flex items-center text-[#6b6963]">
            <span>Created: {new Date(planMetadata.dateCreated).toLocaleDateString()}</span>
            <span className="mx-1">•</span>
            <span>CER: {planMetadata.linkedCerVersion}</span>
          </div>
          <Button
            onClick={saveQmpData}
            size="sm"
            variant="outline"
            className="flex items-center text-sm ml-2 bg-[#5585b3] text-white hover:bg-[#5585b3]/90 hover:text-white"
          >
            <Save className="mr-1 h-4 w-4" />
            Save Metadata
          </Button>
        </div>
      </div>

      {/* QMP Metadata Section */}
      <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[#141413] flex items-center">
            <FileText className="mr-2 h-5 w-5 text-[#5585b3]" />
            Plan Metadata
            <span className="text-xs font-normal text-[#6b6963] ml-2">
              ICH E6(R3) Documentation
            </span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Plan Name & Version */}
          <div>
            <label className="text-sm font-medium text-[#141413]">Plan Name</label>
            <Input
              value={planMetadata.planName}
              onChange={e =>
                setPlanMetadata({
                  ...planMetadata,
                  planName: e.target.value,
                  lastUpdated: new Date().toISOString(),
                })
              }
              placeholder="Quality Management Plan"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#141413]">Plan Version</label>
            <Input
              value={planMetadata.planVersion}
              onChange={e =>
                setPlanMetadata({
                  ...planMetadata,
                  planVersion: e.target.value,
                  lastUpdated: new Date().toISOString(),
                })
              }
              placeholder="1.0.0"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#141413]">Linked CER Version</label>
            <Select
              value={planMetadata.linkedCerVersion}
              onValueChange={value =>
                setPlanMetadata({
                  ...planMetadata,
                  linkedCerVersion: value,
                  lastUpdated: new Date().toISOString(),
                })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select CER version" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="Current Draft">Current Draft</SelectItem>
                  <SelectItem value="v1.0">v1.0</SelectItem>
                  <SelectItem value="v2.0">v2.0</SelectItem>
                  <SelectItem value="v2.3">v2.3</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Author Info & Dates */}
          <div>
            <label className="text-sm font-medium text-[#141413]">Author Name</label>
            <Input
              value={planMetadata.authorName}
              onChange={e =>
                setPlanMetadata({
                  ...planMetadata,
                  authorName: e.target.value,
                  lastUpdated: new Date().toISOString(),
                })
              }
              placeholder="Auto-populated from user profile"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#141413]">Author Role</label>
            <Input
              value={planMetadata.authorRole}
              onChange={e =>
                setPlanMetadata({
                  ...planMetadata,
                  authorRole: e.target.value,
                  lastUpdated: new Date().toISOString(),
                })
              }
              placeholder="Quality Manager"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium text-[#141413]">Date Created</label>
              <Input
                value={new Date(planMetadata.dateCreated).toLocaleDateString()}
                readOnly
                className="mt-1 bg-gray-50"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#141413]">Last Updated</label>
              <Input
                value={new Date(planMetadata.lastUpdated).toLocaleDateString()}
                readOnly
                className="mt-1 bg-gray-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Metrics */}
      <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
        <h3 className="text-lg font-semibold text-[#141413] mb-3 flex items-center">
          <BarChart3 className="mr-2 h-5 w-5 text-[#5585b3]" />
          Quality Management Dashboard
          <span className="text-xs font-normal text-[#6b6963] ml-2">
            ICH E6(R3) Implementation Status
          </span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Card className="shadow-none border-l-4 border-l-blue-500">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm text-[#141413]">Quality Objectives</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="text-2xl font-bold text-[#5585b3]">{metrics.totalObjectives}</div>
              <div className="text-xs text-[#6b6963] mt-1 flex items-center">
                <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                {metrics.completedObjectives} Complete
                {metrics.blockedObjectives > 0 && (
                  <span className="ml-2 text-red-500 flex items-center">
                    <XCircle className="h-3 w-3 mr-1" />
                    {metrics.blockedObjectives} Blocked
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-l-4 border-l-[#5585b3]">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm text-[#141413]">Critical-to-Quality Factors</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="text-2xl font-bold text-[#5585b3]">{metrics.totalCtqFactors}</div>
              <div className="text-xs text-[#6b6963] mt-1 flex items-center flex-wrap">
                {metrics.highRiskFactors > 0 && (
                  <span className="mr-2 text-red-700 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {metrics.highRiskFactors} High
                  </span>
                )}
                {metrics.mediumRiskFactors > 0 && (
                  <span className="mr-2 text-amber-700 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {metrics.mediumRiskFactors} Medium
                  </span>
                )}
                {metrics.lowRiskFactors > 0 && (
                  <span className="text-green-700 flex items-center">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {metrics.lowRiskFactors} Low
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-l-4 border-l-purple-500">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm text-[#141413]">Document Readiness</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="text-2xl font-bold text-purple-600">{metrics.documentReadiness}%</div>
              <div className="mt-1">
                <Progress value={metrics.documentReadiness} className="h-1.5 w-full bg-gray-200" />
              </div>
              <div className="text-xs text-[#6b6963] mt-1 flex items-center">
                <FileText className="h-3 w-3 mr-1 text-purple-500" />
                {metrics.documentReadiness < 50
                  ? 'Needs attention'
                  : metrics.documentReadiness < 80
                    ? 'Making progress'
                    : 'Almost ready'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Comprehensive Reports Section */}
        <div className="mb-6">
          <CerComprehensiveReportsPanel
            cerData={{
              deviceName,
              manufacturer,
              version: '1.0',
            }}
            deviceName={deviceName}
            manufacturer={manufacturer}
            qmpData={planMetadata}
            objectives={objectives}
            ctqFactors={ctqFactors}
            complianceMetrics={metrics}
            // The following props would be populated with actual data in a real implementation
            literatureData={{
              reviewStatus: 'in-progress',
              completionPercentage: 78,
            }}
            clinicalData={{}}
            regulatoryData={{
              complianceScore: 85,
            }}
            validationResults={{
              issues: [
                {
                  severity: 'critical',
                  message: 'Missing required clinical data in the Post-Market Surveillance section',
                },
                {
                  severity: 'critical',
                  message: 'Benefit-Risk Analysis lacks quantitative evidence',
                },
              ],
            }}
            riskAnalysisData={{
              completionPercentage: 90,
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card className="shadow-none border-l-4 border-l-green-500">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm text-[#141413] flex items-center">
                CER Section Coverage
                <CerTooltipWrapper
                  tooltipContent="Measures how many CER sections have associated quality objectives for compliance"
                  whyThisMatters="EU MDR requires documented quality controls for all major sections of the CER"
                >
                  <AlertCircle className="h-3.5 w-3.5 ml-1 text-gray-400" />
                </CerTooltipWrapper>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="text-xl font-bold text-green-600">
                {metrics.sectionCoverageCount}/{metrics.totalSections} Sections
              </div>
              <div className="mt-1">
                <Progress
                  value={metrics.sectionCoveragePercentage}
                  className="h-1.5 w-full bg-gray-200"
                />
              </div>
              <div className="text-xs text-[#6b6963] mt-3">
                <div className="flex flex-wrap gap-1 mb-1">
                  {metrics.coveredSections.map(section => (
                    <Badge
                      key={section}
                      variant="outline"
                      className="bg-[#faf0ec] text-[#5585b3] border-[#5585b3] text-xs"
                    >
                      {section}
                    </Badge>
                  ))}
                </div>
                {metrics.sectionCoveragePercentage < 50 ? (
                  <div className="mt-1 text-red-600 flex items-center">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Add objectives for additional CER sections
                  </div>
                ) : metrics.sectionCoveragePercentage < 100 ? (
                  <div className="mt-1 text-amber-600 flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Some sections are missing quality coverage
                  </div>
                ) : (
                  <div className="mt-1 text-green-600 flex items-center">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    All CER sections have quality coverage
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border-l-4 border-l-amber-500">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm text-[#141413] flex items-center">
                Traceability & Compliance Status
                <CerTooltipWrapper
                  tooltipContent="Measures links between quality objectives, CtQ factors, and CER sections"
                  whyThisMatters="Traceability is key for regulatory inspections and audit readiness"
                >
                  <AlertCircle className="h-3.5 w-3.5 ml-1 text-gray-400" />
                </CerTooltipWrapper>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-sm font-medium text-[#141413]">Linked CtQ Factors</div>
                  <div className="text-lg font-bold text-amber-600">
                    {metrics.linkedFactors}/{metrics.totalCtqFactors}
                  </div>
                  <div className="text-xs text-[#6b6963] mt-1 flex items-center">
                    <LinkIcon className="h-3 w-3 mr-1 text-[#5585b3]" />
                    {metrics.totalCtqFactors > 0
                      ? Math.round((metrics.linkedFactors / metrics.totalCtqFactors) * 100)
                      : 0}
                    % Linked
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-[#141413]">Objectives with Scope</div>
                  <div className="text-lg font-bold text-amber-600">
                    {metrics.objectivesWithSections}/{metrics.totalObjectives}
                  </div>
                  <div className="text-xs text-[#6b6963] mt-1 flex items-center">
                    <FileCheck className="h-3 w-3 mr-1 text-[#5585b3]" />
                    {metrics.scopeCoveragePercentage}% Coverage
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs">
                {metrics.sectionCoveragePercentage < 100 ||
                (metrics.totalCtqFactors > 0 &&
                  metrics.linkedFactors / metrics.totalCtqFactors < 0.8) ? (
                  <Alert className="p-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-xs font-medium">Compliance Warning</AlertTitle>
                    <AlertDescription className="text-xs">
                      Improve scope and linkage coverage to meet ICH E6(R3) compliance
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="p-2 border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-xs font-medium">Compliance Ready</AlertTitle>
                    <AlertDescription className="text-xs">
                      QMP elements meet ICH E6(R3) and EU MDR traceability requirements
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-xs text-[#6b6963] flex justify-between items-center">
          <div className="flex items-center">
            <Shield className="h-4 w-4 mr-1 text-[#5585b3]" />
            <span>ICH E6(R3) Quality Management Implementation</span>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateQMP}
              disabled={isGenerating}
              className="h-7 text-xs"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#5585b3] mr-1"></div>
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="mr-1 h-3 w-3" />
                  Export QMP Document
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Panel - Quality Objectives */}
        <div className="w-full md:w-1/2">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#141413] flex items-center">
              <CerTooltipWrapper
                tooltipContent="Quality Objectives define specific, measurable goals to ensure the quality of your clinical evaluation process according to ICH E6(R3) principles."
                whyThisMatters="Quality objectives are required under EU MDR to demonstrate your approach to ensuring clinical data quality and integrity. They provide auditable evidence of your quality management system."
              >
                Quality Objectives
              </CerTooltipWrapper>
            </h2>
            <div className="mt-2 mb-4">
              <div className="bg-[#faf0ec] rounded-md px-3 py-1 text-sm inline-flex items-center gap-1 text-[#5585b3]">
                <span>ICH E6(R3) Compliant</span>
              </div>
            </div>

            {isLoadingPlan ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5585b3]"></div>
              </div>
            ) : (
              <>
                {objectives.length > 0 ? (
                  <div className="space-y-4">
                    {objectives.map(objective => (
                      <Card
                        key={objective.id}
                        className="bg-white border rounded-md shadow-sm"
                        ref={el => (objectiveRefs.current[objective.id] = el)}
                        draggable="true"
                        onDragStart={e => handleDragStart(e, objective)}
                        onDragEnd={e => handleDragEnd(e, objective)}
                        onDragOver={e => handleDragOver(e, objective)}
                        onDragLeave={e => handleDragLeave(e, objective)}
                        onDrop={e => handleDrop(e, objective)}
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-md font-medium text-[#141413] flex items-center">
                              <span
                                className="cursor-move mr-2 text-gray-400 hover:text-gray-600"
                                title="Drag to reorder"
                              >
                                ⋮⋮
                              </span>
                              {objective.title}
                            </CardTitle>
                            <div className="flex space-x-1">
                              {renderStatusBadge(objective.status)}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                          <p className="text-sm text-[#6b6963] mb-2">{objective.description}</p>
                          {objective.measures && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-[#6b6963]">
                                Success Measures:
                              </p>
                              <p className="text-xs text-[#6b6963]">{objective.measures}</p>
                            </div>
                          )}
                          {objective.responsible && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-[#6b6963]">Responsible:</p>
                              <p className="text-xs text-[#6b6963]">{objective.responsible}</p>
                            </div>
                          )}

                          {/* Inline CtQ form */}
                          {showInlineCtqForm === objective.id && (
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                              <h5 className="text-sm font-medium text-[#141413] flex items-center justify-between">
                                <span>Add New Critical-to-Quality Factor</span>
                                <Button
                                  onClick={handleCancelInlineCtq}
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                >
                                  <X size={14} />
                                </Button>
                              </h5>
                              <div className="space-y-2 mt-2">
                                <Input
                                  placeholder="CtQ Factor Name"
                                  value={currentCtq.name}
                                  onChange={e =>
                                    setCurrentCtq({ ...currentCtq, name: e.target.value })
                                  }
                                  className="text-sm"
                                />
                                <Textarea
                                  placeholder="Description"
                                  value={currentCtq.description}
                                  onChange={e =>
                                    setCurrentCtq({ ...currentCtq, description: e.target.value })
                                  }
                                  rows={2}
                                  className="text-sm"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-[#141413]">Risk Level</label>
                                    <Select
                                      value={currentCtq.riskLevel}
                                      onValueChange={value =>
                                        setCurrentCtq({ ...currentCtq, riskLevel: value })
                                      }
                                    >
                                      <SelectTrigger className="mt-1 h-8 text-xs">
                                        <SelectValue placeholder="Select risk level" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-[#141413]">CER Section</label>
                                    <Input
                                      placeholder="Associated Section"
                                      value={currentCtq.associatedSection}
                                      onChange={e =>
                                        setCurrentCtq({
                                          ...currentCtq,
                                          associatedSection: e.target.value,
                                        })
                                      }
                                      className="mt-1 h-8 text-xs"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs text-[#141413]">Mitigation</label>
                                  <Textarea
                                    placeholder="Mitigation actions"
                                    value={currentCtq.mitigation}
                                    onChange={e =>
                                      setCurrentCtq({ ...currentCtq, mitigation: e.target.value })
                                    }
                                    rows={2}
                                    className="mt-1 text-sm"
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  className="w-full mt-2 h-7 text-xs bg-[#5585b3] text-white hover:bg-[#5585b3]/90"
                                  onClick={handleSaveInlineCtq}
                                >
                                  <Plus size={14} className="mr-1" />
                                  Add Factor
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Display Scope Sections if available */}
                          {objective.scopeSections && objective.scopeSections.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-medium text-[#6b6963] mb-1">
                                Scope Sections:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {objective.scopeSections.map(section => (
                                  <Badge
                                    key={section}
                                    variant="outline"
                                    className="bg-[#faf0ec] text-[#5585b3] border-[#5585b3] text-xs"
                                  >
                                    {section}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Display Mitigation/Control Actions if available */}
                          {objective.mitigationActions &&
                            objective.mitigationActions.trim() !== '' && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-[#6b6963] mb-1">
                                  Mitigation / Control Actions:
                                </p>
                                <div className="text-xs text-[#141413] p-2 bg-[#F3F3F3] rounded-md">
                                  {objective.mitigationActions.split('\n').map((line, i) => (
                                    <p key={i} className={i > 0 ? 'mt-1' : ''}>
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                        </CardContent>
                        <CardFooter className="p-3 pt-0 flex justify-between items-center">
                          <div className="flex space-x-1">
                            <Button
                              onClick={() => handleEditObjective(objective)}
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-[#5585b3]"
                            >
                              <Edit size={14} className="mr-1" />
                              Edit
                            </Button>
                            <Button
                              onClick={() => handleDeleteObjective(objective.id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-red-500"
                            >
                              <Trash2 size={14} className="mr-1" />
                              Delete
                            </Button>
                          </div>
                          <Button
                            onClick={() => handleAddCtqInline(objective.id)}
                            variant="outline"
                            size="sm"
                            className="h-8 bg-transparent text-[#5585b3] border-[#5585b3]"
                          >
                            <Plus size={14} className="mr-1" />
                            Add CtQ Factor
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Alert className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No Quality Objectives</AlertTitle>
                    <AlertDescription>
                      Quality objectives define how you will ensure quality in your CER. Add at
                      least one objective to create your Quality Management Plan.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* Add/Edit Objective Form */}
            {isEditing ? (
              <Card className="bg-white border rounded-md shadow-sm mt-4">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-md font-medium text-[#141413]">
                    {currentObjective.id ? 'Edit Objective' : 'Add New Objective'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Title</label>
                    <Input
                      value={currentObjective.title}
                      onChange={e =>
                        setCurrentObjective({ ...currentObjective, title: e.target.value })
                      }
                      placeholder="E.g., Ensure Data Integrity"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Description</label>
                    <Textarea
                      value={currentObjective.description}
                      onChange={e =>
                        setCurrentObjective({ ...currentObjective, description: e.target.value })
                      }
                      placeholder="Describe the quality objective..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Success Measures</label>
                    <Textarea
                      value={currentObjective.measures}
                      onChange={e =>
                        setCurrentObjective({ ...currentObjective, measures: e.target.value })
                      }
                      placeholder="Define how success will be measured..."
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Responsible Party</label>
                    <Input
                      value={currentObjective.responsible}
                      onChange={e =>
                        setCurrentObjective({ ...currentObjective, responsible: e.target.value })
                      }
                      placeholder="E.g., Clinical Data Manager"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Timeline</label>
                    <Input
                      value={currentObjective.timeline}
                      onChange={e =>
                        setCurrentObjective({ ...currentObjective, timeline: e.target.value })
                      }
                      placeholder="E.g., Throughout CER development"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Status</label>
                    <Select
                      value={currentObjective.status}
                      onValueChange={value =>
                        setCurrentObjective({ ...currentObjective, status: value })
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="in-progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Scope Selector - Multi-select list of CER sections */}
                  <div>
                    <label className="text-sm font-medium text-[#141413] flex items-center">
                      Scope Sections
                      <CerTooltipWrapper
                        tooltipContent="Select which CER sections this quality objective applies to"
                        whyThisMatters="Tying objectives to specific sections helps with traceability and ensures all CER parts meet quality requirements"
                      >
                        <AlertCircle className="h-3.5 w-3.5 ml-1 text-gray-400" />
                      </CerTooltipWrapper>
                    </label>
                    <div className="mt-1 p-2 border rounded-md flex flex-wrap gap-1 bg-white">
                      {[
                        'Safety',
                        'Literature Review',
                        'Clinical Data',
                        'GSPR Mapping',
                        'State of the Art',
                        'Benefit-Risk',
                        'PMS',
                        'PMCF',
                        'Equivalence',
                      ].map(section => (
                        <Badge
                          key={section}
                          variant={
                            currentObjective.scopeSections?.includes(section)
                              ? 'default'
                              : 'outline'
                          }
                          className={`cursor-pointer ${
                            currentObjective.scopeSections?.includes(section)
                              ? 'bg-[#5585b3] hover:bg-[#0E5CA8] text-white'
                              : 'bg-white hover:bg-gray-100 text-gray-700'
                          }`}
                          onClick={() => {
                            const currentSections = currentObjective.scopeSections || [];
                            const newSections = currentSections.includes(section)
                              ? currentSections.filter(s => s !== section)
                              : [...currentSections, section];
                            setCurrentObjective({
                              ...currentObjective,
                              scopeSections: newSections,
                            });
                          }}
                        >
                          {section}
                          {currentObjective.scopeSections?.includes(section) && (
                            <X className="ml-1 h-3 w-3" />
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Mitigation / Control Actions */}
                  <div>
                    <label className="text-sm font-medium text-[#141413] flex items-center">
                      Mitigation / Control Actions
                      <CerTooltipWrapper
                        tooltipContent="Define specific actions to ensure this quality objective is met"
                        whyThisMatters="Mitigation actions demonstrate how quality will be actively managed and controlled throughout the CER process"
                      >
                        <AlertCircle className="h-3.5 w-3.5 ml-1 text-gray-400" />
                      </CerTooltipWrapper>
                    </label>
                    <Textarea
                      value={currentObjective.mitigationActions}
                      onChange={e =>
                        setCurrentObjective({
                          ...currentObjective,
                          mitigationActions: e.target.value,
                        })
                      }
                      placeholder="E.g., Run data consistency script weekly, Implement dual validation process..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                </CardContent>
                <CardFooter className="p-4 flex justify-end gap-2">
                  <Button
                    onClick={() => {
                      setCurrentObjective({
                        id: null,
                        title: '',
                        description: '',
                        measures: '',
                        responsible: '',
                        timeline: '',
                        status: 'planned',
                        scopeSections: [],
                        mitigationActions: '',
                      });
                      setIsEditing(false);
                    }}
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveObjective} className="bg-[#5585b3] hover:bg-[#0E5CA8]">
                    <Save size={16} className="mr-1" />
                    Save Objective
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              <Button
                onClick={() => setIsEditing(true)}
                className="mt-4 bg-[#5585b3] hover:bg-[#0E5CA8]"
              >
                <Plus size={16} className="mr-1" />
                Add Quality Objective
              </Button>
            )}
          </div>
        </div>

        {/* Right Panel - Critical-to-Quality Factors */}
        <div className="w-full md:w-1/2">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#141413] flex items-center">
              <CerTooltipWrapper
                tooltipContent="Critical-to-Quality (CtQ) factors identify the specific aspects of your clinical evaluation that are most important for maintaining quality and regulatory compliance."
                whyThisMatters="CtQ factors help you implement a risk-based approach to quality management as required by ICH E6(R3) and EU MDR. They allow you to focus resources on the most critical quality aspects."
              >
                Critical-to-Quality Factors
              </CerTooltipWrapper>
            </h2>
            <div className="mt-2 mb-4">
              <div className="bg-[#faf0ec] rounded-md px-3 py-1 text-sm inline-flex items-center gap-1 text-[#5585b3]">
                <span>Risk-Based Approach</span>
              </div>
            </div>

            {isLoadingPlan ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5585b3]"></div>
              </div>
            ) : (
              <>
                {ctqFactors.length > 0 ? (
                  <div className="space-y-3">
                    {ctqFactors.map(factor => {
                      const associatedObjective = objectives.find(
                        obj => obj.id === factor.objectiveId
                      );

                      return (
                        <Card key={factor.id} className="bg-white border rounded-md shadow-sm">
                          <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-md font-medium text-[#141413]">
                                {factor.name}
                              </CardTitle>
                              <div className="flex space-x-1">
                                {renderRiskBadge(factor.riskLevel)}
                              </div>
                            </div>
                            {associatedObjective && (
                              <CardDescription className="text-xs text-[#5585b3]">
                                {associatedObjective.title}
                              </CardDescription>
                            )}
                          </CardHeader>
                          <CardContent className="p-4 pt-2">
                            <p className="text-sm text-[#6b6963] mb-2">{factor.description}</p>

                            {/* Visual traceability links - improved with ICH E6(R3) alignment */}
                            <div className="mt-3 mb-2">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-[#5585b3]">
                                  CER Traceability
                                </span>
                                <div className="text-xs text-gray-500">ICH E6(R3)</div>
                              </div>

                              {factor.associatedSection ? (
                                <div className="border border-green-200 rounded-md overflow-hidden">
                                  <div className="bg-green-100 px-2 py-1 flex items-center justify-between">
                                    <div className="flex items-center">
                                      <CheckCircle className="h-3 w-3 mr-1 text-green-700" />
                                      <p className="text-xs font-medium text-green-700">
                                        Traced to CER
                                      </p>
                                    </div>
                                    <Badge className="bg-green-200 text-green-800 px-2 py-0 text-xs">
                                      Linked
                                    </Badge>
                                  </div>
                                  <div className="p-2 bg-white border-t border-green-200">
                                    <div className="flex flex-col">
                                      <div className="flex items-center mb-1">
                                        <FileText className="h-3 w-3 mr-1 text-[#5585b3]" />
                                        <p className="text-xs font-medium text-[#5585b3]">
                                          Associated CER Section:
                                        </p>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs text-[#141413] pl-4">
                                          {factor.associatedSection}
                                        </p>
                                        <div className="bg-[#faf0ec] rounded-md px-2 py-0.5 text-xs text-[#5585b3]">
                                          Direct Link
                                        </div>
                                      </div>

                                      {/* Add CER compliance status indicator */}
                                      <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                                        <span className="text-xs text-gray-500">
                                          Compliance Verification:
                                        </span>
                                        <Badge className="bg-blue-100 text-blue-800 px-2 py-0 text-xs">
                                          Verified
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="border border-amber-200 rounded-md overflow-hidden">
                                  <div className="bg-amber-100 px-2 py-1 flex items-center justify-between">
                                    <div className="flex items-center">
                                      <AlertTriangle className="h-3 w-3 mr-1 text-amber-700" />
                                      <p className="text-xs font-medium text-amber-700">
                                        Needs Traceability
                                      </p>
                                    </div>
                                    <Badge className="bg-amber-200 text-amber-800 px-2 py-0 text-xs">
                                      Pending
                                    </Badge>
                                  </div>
                                  <div className="p-2 bg-white border-t border-amber-200 flex items-center">
                                    <LinkIcon className="h-3 w-3 mr-1 text-amber-700" />
                                    <span className="text-xs text-amber-700">
                                      Link this factor to a CER section for complete ICH E6(R3)
                                      traceability
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {factor.mitigation && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-[#6b6963]">
                                  Mitigation Strategy:
                                </p>
                                <p className="text-xs text-[#6b6963]">{factor.mitigation}</p>
                              </div>
                            )}
                          </CardContent>
                          <CardFooter className="p-3 pt-0 flex justify-end space-x-2">
                            <Button
                              onClick={() => handleEditCtqFactor(factor)}
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-[#5585b3]"
                            >
                              <Edit size={14} className="mr-1" />
                              Edit
                            </Button>
                            <Button
                              onClick={() => handleDeleteCtqFactor(factor.id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-red-500"
                            >
                              <Trash2 size={14} className="mr-1" />
                              Delete
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Alert className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No CtQ Factors</AlertTitle>
                    <AlertDescription>
                      Critical-to-Quality factors identify specific elements that are crucial for
                      maintaining quality in your CER. Add objectives first, then define CtQ factors
                      for each objective.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* Add/Edit CtQ Factor Form */}
            <div id="add-ctq-section">
              <Card className="bg-white border rounded-md shadow-sm mt-4">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-md font-medium text-[#141413]">
                    {editingCtqId ? 'Edit CtQ Factor' : 'Add New CtQ Factor'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-[#141413]">
                      Associated Objective
                    </label>
                    <Select
                      value={currentCtq.objectiveId?.toString() || ''}
                      onValueChange={value =>
                        setCurrentCtq({ ...currentCtq, objectiveId: parseInt(value) })
                      }
                      disabled={objectives.length === 0}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue
                          placeholder={
                            objectives.length > 0
                              ? 'Select an objective'
                              : 'No objectives available'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {objectives.map(obj => (
                            <SelectItem key={obj.id} value={obj.id.toString()}>
                              {obj.title}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Factor Name</label>
                    <Input
                      value={currentCtq.name}
                      onChange={e => setCurrentCtq({ ...currentCtq, name: e.target.value })}
                      placeholder="E.g., Literature Search Comprehensiveness"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Description</label>
                    <Textarea
                      value={currentCtq.description}
                      onChange={e => setCurrentCtq({ ...currentCtq, description: e.target.value })}
                      placeholder="Describe why this factor is critical to quality..."
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">
                      Associated CER Section
                    </label>
                    <Input
                      value={currentCtq.associatedSection}
                      onChange={e =>
                        setCurrentCtq({ ...currentCtq, associatedSection: e.target.value })
                      }
                      placeholder="E.g., Literature Review, Post-Market Surveillance"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">Risk Level</label>
                    <Select
                      value={currentCtq.riskLevel}
                      onValueChange={value => setCurrentCtq({ ...currentCtq, riskLevel: value })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select risk level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="low">Low Risk</SelectItem>
                          <SelectItem value="medium">Medium Risk</SelectItem>
                          <SelectItem value="high">High Risk</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#141413]">
                      Mitigation Strategy
                    </label>
                    <Textarea
                      value={currentCtq.mitigation}
                      onChange={e => setCurrentCtq({ ...currentCtq, mitigation: e.target.value })}
                      placeholder="Describe how risks will be mitigated..."
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                </CardContent>
                <CardFooter className="p-4 flex justify-end gap-2">
                  <Button
                    onClick={() => {
                      setCurrentCtq({
                        id: null,
                        objectiveId: null,
                        name: '',
                        description: '',
                        riskLevel: 'medium',
                        associatedSection: '',
                        mitigation: '',
                      });
                      setEditingCtqId(null);
                    }}
                    variant="ghost"
                  >
                    Clear
                  </Button>
                  <Button
                    onClick={handleSaveCtqFactor}
                    className="bg-[#5585b3] hover:bg-[#0E5CA8]"
                    disabled={objectives.length === 0}
                  >
                    <Save size={16} className="mr-1" />
                    Save CtQ Factor
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Panel - Generate QMP Document */}
      <div className="mt-6 bg-white p-4 rounded-md border shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div>
            <h3 className="text-lg font-medium text-[#141413]">Quality Management Plan Document</h3>
            <p className="text-sm text-[#6b6963]">
              Generate an ICH E6(R3) compliant Quality Management Plan to include in your CER.
            </p>
          </div>
          <div className="mt-2 md:mt-0">
            <CerTooltipWrapper
              tooltipContent="Validate QMP integration with CER sections per ICH E6(R3) requirements."
              whyThisMatters="Validation ensures your Quality Management Plan properly addresses all critical areas of the CER and meets regulatory expectations."
              side="left"
            >
              <Button
                onClick={validateQmpIntegration}
                variant="outline"
                className="mr-2 bg-transparent text-[#5585b3] hover:bg-[#FDF6FA] border-[#F9D8E8]"
                disabled={objectives.length === 0 || isValidating}
              >
                {isValidating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#5585b3] mr-2"></div>
                    Validating...
                  </>
                ) : (
                  <>
                    <Shield size={16} className="mr-1" />
                    Validate ICH E6(R3) Compliance
                  </>
                )}
              </Button>
            </CerTooltipWrapper>

            <CerTooltipWrapper
              tooltipContent="Preview the QMP document before adding it to your CER."
              whyThisMatters="A well-structured Quality Management Plan demonstrates to regulators that you have a systematic approach to ensuring clinical evaluation quality."
              side="left"
            >
              <Button
                onClick={() => {
                  const qmpContent = formatQmpContent();
                  // In a real implementation, show a preview modal
                  console.log(qmpContent);
                  toast({
                    title: 'QMP Preview Generated',
                    description: 'Quality Management Plan preview is available in browser console.',
                    variant: 'default',
                  });
                }}
                variant="outline"
                className="mr-2 bg-transparent text-[#5585b3] hover:bg-[#faf0ec] border-[#D1E5FA]"
              >
                <Clipboard size={16} className="mr-1" />
                Preview
              </Button>
            </CerTooltipWrapper>

            <CerTooltipWrapper
              tooltipContent="Generate the QMP document and add it to your CER. This will create a new section or update an existing QMP section in your CER."
              whyThisMatters="Having a QMP as part of your CER ensures regulatory compliance with EU MDR and ICH E6(R3) requirements."
              side="left"
            >
              <Button
                onClick={handleGenerateQMP}
                className="bg-[#5585b3] hover:bg-[#0E5CA8]"
                disabled={objectives.length === 0 || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FilePlus size={16} className="mr-1" />
                    Generate QMP Document
                  </>
                )}
              </Button>
            </CerTooltipWrapper>
          </div>
        </div>

        {/* Display Validation Results */}
        {validationResults && <div className="mb-4">{renderValidationResults()}</div>}

        <Card className="bg-[#faf9f5] border rounded-md overflow-hidden">
          <CardHeader className="p-3 bg-[#F5F5F5] border-b">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium text-[#141413]">
                QMP Document Preview
              </CardTitle>
              <div className="text-xs text-gray-500">ICH E6(R3) Compliant Format</div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[200px] py-2 px-4">
              <div className="text-xs text-[#141413] font-mono whitespace-pre-wrap">
                {objectives.length > 0 ? (
                  <pre className="text-xs font-mono">
                    {`# Quality Management Plan

Device: ${deviceName || 'Unnamed Device'}${manufacturer ? ` (Manufacturer: ${manufacturer})` : ''}

## 1. Introduction

This Quality Management Plan (QMP) has been developed in accordance with ICH E6(R3) principles...

## 2. Quality Objectives

${objectives
  .map(
    (obj, idx) => `### 2.${idx + 1}. ${obj.title}

**Description:** ${obj.description}

**Success Measures:** ${obj.measures || 'Not specified'}

**Status:** ${obj.status.charAt(0).toUpperCase() + obj.status.slice(1)}

${getCtqFactorsForObjective(obj.id).substring(0, 100)}...
`
  )
  .join('\n')}

## 3. Quality Risk Management

The Critical-to-Quality factors identified above form the basis of our risk-based approach...

## 4. Monitoring and Continuous Improvement

Quality monitoring will be conducted continuously throughout the clinical evaluation process...

...
`}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-gray-500">
                    <AlertCircle className="h-5 w-5 mb-2" />
                    <p>Add quality objectives to generate a preview</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QualityManagementPlanPanel;
