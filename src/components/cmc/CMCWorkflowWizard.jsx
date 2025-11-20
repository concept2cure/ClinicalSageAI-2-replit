import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  ArrowLeft,
  Play,
  Save,
  FlaskConical,
  FileText,
  BarChart3,
  Shield,
  Clock,
  Users,
  Target,
  AlertTriangle,
  ChevronRight,
  Lightbulb,
  Microscope,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CMCWorkflowWizard = ({ onProjectCreated }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [projectData, setProjectData] = useState({
    drugName: '',
    drugType: '',
    dosageForm: '',
    indication: '',
    developmentStage: '',
    regulatoryRegion: '',
    manufacturingSite: '',
    targetSubmissionDate: '',
    projectManager: '',
    organizationId: '7', // Default for demo
  });
  const [isCreating, setIsCreating] = useState(false);
  const [workflows, setWorkflows] = useState([]);
  const [activeWorkflow, setActiveWorkflow] = useState(null);

  const steps = [
    {
      id: 'project-setup',
      title: 'Project Setup',
      description: 'Define your CMC project fundamentals',
      icon: FlaskConical,
      estimatedTime: '5 minutes',
    },
    {
      id: 'drug-characterization',
      title: 'Drug Characterization',
      description: 'Define drug substance and product properties',
      icon: Microscope,
      estimatedTime: '15 minutes',
    },
    {
      id: 'workflow-selection',
      title: 'Workflow Selection',
      description: 'Choose and customize development workflows',
      icon: Target,
      estimatedTime: '10 minutes',
    },
    {
      id: 'team-assignment',
      title: 'Team & Timeline',
      description: 'Assign team members and set milestones',
      icon: Users,
      estimatedTime: '8 minutes',
    },
    {
      id: 'review-launch',
      title: 'Review & Launch',
      description: 'Review setup and launch your CMC project',
      icon: Play,
      estimatedTime: '5 minutes',
    },
  ];

  const drugTypes = [
    'Small Molecule',
    'Monoclonal Antibody',
    'Peptide/Protein',
    'Cell Therapy',
    'Gene Therapy',
    'Vaccine',
    'Combination Product',
  ];

  const dosageForms = [
    'Tablet',
    'Capsule',
    'Solution for injection',
    'Lyophilized powder',
    'Topical cream',
    'Inhalation solution',
    'Transdermal patch',
  ];

  const developmentStages = [
    'Discovery',
    'Preclinical',
    'Phase I',
    'Phase II',
    'Phase III',
    'Commercial',
  ];

  const regulatoryRegions = [
    'FDA (United States)',
    'EMA (European Union)',
    'PMDA (Japan)',
    'Health Canada',
    'TGA (Australia)',
    'Global (Multi-region)',
  ];

  useEffect(() => {
    // Load available workflow templates
    loadWorkflowTemplates();
  }, []);

  const loadWorkflowTemplates = async () => {
    try {
      const response = await fetch('/api/cmc/blueprint/templates?organizationId=7');
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data.data || []);
      }
    } catch (error) {
      console.error('Error loading workflow templates:', error);
    }
  };

  const handleInputChange = (field, value) => {
    setProjectData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateProject = async () => {
    setIsCreating(true);
    try {
      // Generate comprehensive CMC blueprint
      const blueprintResponse = await fetch('/api/cmc/blueprint/generate-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });

      if (blueprintResponse.ok) {
        const blueprintData = await blueprintResponse.json();
        onProjectCreated && onProjectCreated(blueprintData.data);
      } else {
        throw new Error('Failed to create CMC project');
      }
    } catch (error) {
      console.error('Error creating CMC project:', error);
      alert('Error creating project: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const getProgressPercentage = () => {
    return ((currentStep + 1) / steps.length) * 100;
  };

  const isStepComplete = stepIndex => {
    if (stepIndex === 0) {
      return projectData.drugName && projectData.drugType && projectData.dosageForm;
    }
    if (stepIndex === 1) {
      return projectData.indication && projectData.developmentStage;
    }
    if (stepIndex === 2) {
      return projectData.regulatoryRegion;
    }
    if (stepIndex === 3) {
      return projectData.targetSubmissionDate;
    }
    return stepIndex < currentStep;
  };

  const canProceed = () => {
    return isStepComplete(currentStep);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CMC Project Setup Wizard</h1>
        <p className="text-gray-600">
          Create a comprehensive CMC strategy with guided workflows and regulatory intelligence
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-700">Setup Progress</span>
          <span className="text-sm text-gray-500">
            {Math.round(getProgressPercentage())}% Complete
          </span>
        </div>
        <Progress value={getProgressPercentage()} className="w-full" />
      </div>

      {/* Step Navigation */}
      <div className="mb-8">
        <nav className="flex justify-between">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = isStepComplete(index);

            return (
              <div key={step.id} className="flex flex-col items-center relative">
                {index > 0 && (
                  <div
                    className={`absolute left-0 top-6 w-full h-0.5 -ml-12 ${
                      isStepComplete(index - 1) ? 'bg-indigo-500' : 'bg-gray-200'
                    }`}
                    style={{ width: 'calc(100% - 3rem)' }}
                  />
                )}

                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-2 relative z-10 ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-50'
                      : isCompleted
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 bg-white'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <StepIcon
                      className={`w-6 h-6 ${isActive ? 'text-indigo-500' : 'text-gray-400'}`}
                    />
                  )}
                </div>

                <div className="text-center mt-2">
                  <div
                    className={`text-sm font-medium ${
                      isActive
                        ? 'text-indigo-600'
                        : isCompleted
                          ? 'text-green-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {step.title}
                  </div>
                  <div className="text-xs text-gray-400">{step.estimatedTime}</div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Step Content */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              {React.createElement(steps[currentStep].icon, {
                className: 'w-5 h-5 text-indigo-600',
              })}
            </div>
            <div>
              <CardTitle>{steps[currentStep].title}</CardTitle>
              <CardDescription>{steps[currentStep].description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Step 0: Project Setup */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="drugName">Drug Name *</Label>
                  <Input
                    id="drugName"
                    value={projectData.drugName}
                    onChange={e => handleInputChange('drugName', e.target.value)}
                    placeholder="e.g., Pembrolizumab, Aspirin"
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drugType">Drug Type *</Label>
                  <Select
                    value={projectData.drugType}
                    onValueChange={value => handleInputChange('drugType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select drug type" />
                    </SelectTrigger>
                    <SelectContent>
                      {drugTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dosageForm">Dosage Form *</Label>
                  <Select
                    value={projectData.dosageForm}
                    onValueChange={value => handleInputChange('dosageForm', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select dosage form" />
                    </SelectTrigger>
                    <SelectContent>
                      {dosageForms.map(form => (
                        <SelectItem key={form} value={form}>
                          {form}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manufacturingSite">Manufacturing Site</Label>
                  <Input
                    id="manufacturingSite"
                    value={projectData.manufacturingSite}
                    onChange={e => handleInputChange('manufacturingSite', e.target.value)}
                    placeholder="e.g., Genentech, South San Francisco"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 mb-1">Smart Suggestions</h4>
                    <p className="text-sm text-blue-700">
                      Based on your drug type selection, we'll automatically recommend appropriate
                      analytical methods, stability conditions, and regulatory guidelines in the
                      next steps.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Drug Characterization */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="indication">Indication *</Label>
                  <Input
                    id="indication"
                    value={projectData.indication}
                    onChange={e => handleInputChange('indication', e.target.value)}
                    placeholder="e.g., Advanced Non-Small Cell Lung Cancer"
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="developmentStage">Development Stage *</Label>
                  <Select
                    value={projectData.developmentStage}
                    onValueChange={value => handleInputChange('developmentStage', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select development stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {developmentStages.map(stage => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {projectData.drugType && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">
                    Recommended Characterization for {projectData.drugType}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {projectData.drugType === 'Small Molecule' && (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Structural elucidation (NMR, MS)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Polymorphism screening</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Solubility studies</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Impurity profiling</span>
                        </div>
                      </>
                    )}
                    {projectData.drugType === 'Monoclonal Antibody' && (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Primary structure analysis</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Aggregation analysis</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Charge variant analysis</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Glycosylation profiling</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Workflow Selection */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="regulatoryRegion">Regulatory Region *</Label>
                <Select
                  value={projectData.regulatoryRegion}
                  onValueChange={value => handleInputChange('regulatoryRegion', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select regulatory region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regulatoryRegions.map(region => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Recommended Workflows</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-2 border-indigo-200 bg-indigo-50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <FlaskConical className="w-5 h-5 text-indigo-600" />
                        <span className="font-medium">Drug Substance Development</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Complete workflow for drug substance characterization, process development,
                        and control strategy.
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">16 weeks</Badge>
                        <Badge variant="outline">ICH Q11</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-green-200 bg-green-50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Microscope className="w-5 h-5 text-green-600" />
                        <span className="font-medium">Analytical Method Development</span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Systematic approach to developing and validating analytical methods per ICH
                        Q2(R1).
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">12 weeks</Badge>
                        <Badge variant="outline">ICH Q2(R1)</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Team & Timeline */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="projectManager">Project Manager</Label>
                  <Input
                    id="projectManager"
                    value={projectData.projectManager}
                    onChange={e => handleInputChange('projectManager', e.target.value)}
                    placeholder="e.g., Dr. Sarah Johnson"
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetSubmissionDate">Target Submission Date *</Label>
                  <Input
                    id="targetSubmissionDate"
                    type="date"
                    value={projectData.targetSubmissionDate}
                    onChange={e => handleInputChange('targetSubmissionDate', e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-yellow-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-900 mb-1">Timeline Recommendation</h4>
                    <p className="text-sm text-yellow-700">
                      Based on your drug type and development stage, we recommend allowing 52 weeks
                      for complete CMC development. Critical path activities will be automatically
                      identified and prioritized.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Launch */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-4">Project Summary</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Drug Name:</span>
                      <p className="font-medium">{projectData.drugName}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Drug Type:</span>
                      <p className="font-medium">{projectData.drugType}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Dosage Form:</span>
                      <p className="font-medium">{projectData.dosageForm}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Development Stage:</span>
                      <p className="font-medium">{projectData.developmentStage}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">What Happens Next</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Comprehensive CMC blueprint will be generated</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">
                      Workflows and tasks will be automatically created
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Compliance framework will be established</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Risk assessment will be performed</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Previous
        </Button>

        <div className="flex gap-3">
          <Button variant="outline" className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save Draft
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleCreateProject}
              disabled={!canProceed() || isCreating}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Launch Project
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CMCWorkflowWizard;
