import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Check, FileText, Users, Settings, Rocket, Package } from 'lucide-react';
import { format } from 'date-fns';

interface ProjectTemplate {
  id: number;
  template_name: string;
  device_classification: string;
  device_type: string;
  description: string;
  default_timeline_days: number;
  testing_requirements: any[];
  documentation_checklist: any[];
}

interface TeamMember {
  user_id: string;
  role: string;
  name: string;
  email: string;
}

export default function NewProjectWizard() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [projectData, setProjectData] = useState({
    // Step 1: Basic Info
    projectName: '',
    deviceName: '',
    organizationId: localStorage.getItem('organizationId') || '1',
    
    // Step 2: Template Selection
    templateId: '',
    deviceClassification: '',
    deviceType: '',
    
    // Step 3: Device Specifications
    intendedUse: '',
    indications: '',
    productCode: '',
    regulationNumber: '',
    hasSoftware: false,
    hasCybersecurity: false,
    hasSterility: false,
    hasBiocompatibility: true,
    hasClinicalData: false,
    hasAI: false,
    
    // Step 4: Team Assignment
    projectLead: '',
    regulatoryLead: '',
    qualityLead: '',
    teamMembers: [] as TeamMember[],
    
    // Step 5: Timeline
    targetSubmissionDate: '',
    estimatedTimelineDays: 180
  });

  const steps = [
    { title: 'Project Information', icon: <Settings className="h-5 w-5" />, description: 'Basic project details' },
    { title: 'Device Template', icon: <Package className="h-5 w-5" />, description: 'Select device type template' },
    { title: 'Device Specifications', icon: <FileText className="h-5 w-5" />, description: 'Enter device details' },
    { title: 'Team Assignment', icon: <Users className="h-5 w-5" />, description: 'Assign project team' },
    { title: 'Review & Create', icon: <Rocket className="h-5 w-5" />, description: 'Review and launch project' }
  ];

  // Fetch available templates
  const { data: templates = [] } = useQuery<ProjectTemplate[]>({
    queryKey: ['/api/510k-project/templates'],
    enabled: currentStep === 1
  });

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/510k-project/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': projectData.organizationId
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create project');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Project Created Successfully!',
        description: `Your 510(k) project "${projectData.projectName}" has been initialized.`,
      });
      // Navigate to the project dashboard
      setLocation(`/medical-device?projectId=${data.projectId}`);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create project. Please try again.',
        variant: 'destructive'
      });
    }
  });

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id.toString() === templateId);
    if (template) {
      setProjectData({
        ...projectData,
        templateId,
        deviceClassification: template.device_classification,
        deviceType: template.device_type,
        estimatedTimelineDays: template.default_timeline_days
      });
    }
  };

  const handleNext = () => {
    // Validate required fields before proceeding
    if (currentStep === 0 && (!projectData.projectName || !projectData.deviceName)) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    if (currentStep === 2 && (!projectData.intendedUse || !projectData.indications)) {
      toast({
        title: "Missing Information",
        description: "Intended use and indications are required",
        variant: "destructive"
      });
      return;
    }
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateProject = () => {
    createProjectMutation.mutate(projectData);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        // Step 1: Basic Project Information
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                data-testid="input-project-name"
                placeholder="e.g., CardioMonitor Pro 510(k) Submission"
                value={projectData.projectName}
                onChange={(e) => setProjectData({ ...projectData, projectName: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="deviceName">Device Trade Name</Label>
              <Input
                id="deviceName"
                data-testid="input-device-name"
                placeholder="e.g., CardioMonitor Pro"
                value={projectData.deviceName}
                onChange={(e) => setProjectData({ ...projectData, deviceName: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
        );

      case 1:
        // Step 2: Template Selection
        return (
          <div className="space-y-4">
            <div className="grid gap-4">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  data-testid={`template-card-${template.id}`}
                  className={`cursor-pointer transition-all ${
                    projectData.templateId === template.id.toString()
                      ? 'border-primary ring-2 ring-primary'
                      : 'hover:border-gray-400'
                  }`}
                  onClick={() => handleTemplateSelect(template.id.toString())}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{template.template_name}</CardTitle>
                        <CardDescription className="mt-1">{template.description}</CardDescription>
                      </div>
                      <div className="flex flex-col items-end text-sm">
                        <span className="font-semibold text-primary">{template.device_classification}</span>
                        <span className="text-muted-foreground">{template.device_type}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Timeline: {template.default_timeline_days} days</span>
                        <span>{template.testing_requirements.length} test requirements</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 2:
        // Step 3: Device Specifications
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="intendedUse">Intended Use</Label>
              <Textarea
                id="intendedUse"
                data-testid="input-intended-use"
                placeholder="Describe the intended use of the device..."
                value={projectData.intendedUse}
                onChange={(e) => setProjectData({ ...projectData, intendedUse: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="indications">Indications for Use</Label>
              <Textarea
                id="indications"
                data-testid="input-indications"
                placeholder="Describe the indications for use..."
                value={projectData.indications}
                onChange={(e) => setProjectData({ ...projectData, indications: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="productCode">Product Code</Label>
                <Input
                  id="productCode"
                  data-testid="input-product-code"
                  placeholder="e.g., DQK"
                  value={projectData.productCode}
                  onChange={(e) => setProjectData({ ...projectData, productCode: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="regulationNumber">Regulation Number</Label>
                <Input
                  id="regulationNumber"
                  data-testid="input-regulation-number"
                  placeholder="e.g., 21 CFR 870.2340"
                  value={projectData.regulationNumber}
                  onChange={(e) => setProjectData({ ...projectData, regulationNumber: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Device Features</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'hasSoftware', label: 'Contains Software' },
                  { key: 'hasCybersecurity', label: 'Cybersecurity Required' },
                  { key: 'hasSterility', label: 'Sterile Device' },
                  { key: 'hasBiocompatibility', label: 'Biocompatibility Required' },
                  { key: 'hasClinicalData', label: 'Clinical Data Available' },
                  { key: 'hasAI', label: 'AI/ML Components' }
                ].map((feature) => (
                  <label key={feature.key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      data-testid={`checkbox-${feature.key}`}
                      checked={projectData[feature.key as keyof typeof projectData] as boolean}
                      onChange={(e) =>
                        setProjectData({ ...projectData, [feature.key]: e.target.checked })
                      }
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{feature.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        // Step 4: Team Assignment
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectLead">Project Lead</Label>
              <Input
                id="projectLead"
                data-testid="input-project-lead"
                placeholder="Enter name or email"
                value={projectData.projectLead}
                onChange={(e) => setProjectData({ ...projectData, projectLead: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="regulatoryLead">Regulatory Lead</Label>
              <Input
                id="regulatoryLead"
                data-testid="input-regulatory-lead"
                placeholder="Enter name or email"
                value={projectData.regulatoryLead}
                onChange={(e) => setProjectData({ ...projectData, regulatoryLead: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="qualityLead">Quality Lead</Label>
              <Input
                id="qualityLead"
                data-testid="input-quality-lead"
                placeholder="Enter name or email"
                value={projectData.qualityLead}
                onChange={(e) => setProjectData({ ...projectData, qualityLead: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="targetDate">Target Submission Date</Label>
              <Input
                id="targetDate"
                data-testid="input-target-date"
                type="date"
                value={projectData.targetSubmissionDate}
                onChange={(e) => setProjectData({ ...projectData, targetSubmissionDate: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
        );

      case 4:
        // Step 5: Review & Create
        return (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-lg">Project Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Project Name:</span>
                  <p className="font-medium" data-testid="text-review-project-name">{projectData.projectName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Device Name:</span>
                  <p className="font-medium" data-testid="text-review-device-name">{projectData.deviceName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Classification:</span>
                  <p className="font-medium" data-testid="text-review-classification">{projectData.deviceClassification}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Device Type:</span>
                  <p className="font-medium" data-testid="text-review-device-type">{projectData.deviceType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Project Lead:</span>
                  <p className="font-medium" data-testid="text-review-project-lead">{projectData.projectLead || 'Not assigned'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Target Submission:</span>
                  <p className="font-medium" data-testid="text-review-target-date">
                    {projectData.targetSubmissionDate
                      ? format(new Date(projectData.targetSubmissionDate), 'MMM dd, yyyy')
                      : 'Not set'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Ready to Create Project?</h4>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                Once created, your project will be initialized with the selected template and team assignments.
                You can start working on your 510(k) submission immediately.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 0:
        return projectData.projectName && projectData.deviceName;
      case 1:
        return projectData.templateId;
      case 2:
        return projectData.intendedUse && projectData.indications;
      case 3:
        return true; // Team assignment is optional
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">New 510(k) Project Wizard</h1>
          <p className="text-muted-foreground mt-2">
            Create a new FDA 510(k) submission project with guided setup
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`flex-1 ${index < steps.length - 1 ? 'relative' : ''}`}
              >
                {index < steps.length - 1 && (
                  <div
                    className={`absolute top-5 left-[50%] w-full h-0.5 ${
                      index < currentStep ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-800'
                    }`}
                  />
                )}
                <div
                  className={`flex flex-col items-center relative z-10 cursor-pointer`}
                  onClick={() => index <= currentStep && setCurrentStep(index)}
                  data-testid={`step-indicator-${index}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      index <= currentStep
                        ? 'bg-primary text-white'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                    }`}
                  >
                    {index < currentStep ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  <div className="mt-2 text-center">
                    <p className={`text-sm font-medium ${
                      index <= currentStep ? 'text-primary' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground hidden sm:block">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content Card */}
        <Card>
          <CardHeader>
            <CardTitle>{steps[currentStep].title}</CardTitle>
            <CardDescription>{steps[currentStep].description}</CardDescription>
          </CardHeader>
          <CardContent>{renderStepContent()}</CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            data-testid="button-previous"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setLocation('/medical-device')}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            
            {currentStep === steps.length - 1 ? (
              <Button
                onClick={handleCreateProject}
                disabled={!isStepValid() || createProjectMutation.isPending}
                data-testid="button-create-project"
              >
                {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                <Rocket className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!isStepValid()}
                data-testid="button-next"
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}