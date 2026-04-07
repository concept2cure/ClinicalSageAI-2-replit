import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Building2,
  Package,
  Users,
  Calendar,
  Shield,
  Cpu,
  Heart,
  FlaskConical,
  Zap,
  FileText,
  Save,
  Rocket,
  Layout,
  Sparkles,
} from 'lucide-react';
import {
  DEVICE_TEMPLATES,
  applyTemplateToForm,
  getAllTemplates,
} from '../../services/ProjectTemplates';

const WIZARD_STEPS = [
  { id: 'template', label: 'Choose Template', icon: <Layout className="h-5 w-5" /> },
  { id: 'basic', label: 'Basic Information', icon: <FileText className="h-5 w-5" /> },
  { id: 'device', label: 'Device Details', icon: <Package className="h-5 w-5" /> },
  { id: 'classification', label: 'Classification', icon: <Shield className="h-5 w-5" /> },
  { id: 'requirements', label: 'Special Requirements', icon: <Cpu className="h-5 w-5" /> },
  { id: 'team', label: 'Team Assignment', icon: <Users className="h-5 w-5" /> },
  { id: 'timeline', label: 'Timeline', icon: <Calendar className="h-5 w-5" /> },
  { id: 'review', label: 'Review & Create', icon: <CheckCircle className="h-5 w-5" /> },
];

export default function ProjectCreationWizard({ onComplete, onCancel }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form data state
  const [formData, setFormData] = useState({
    // Template Selection
    templateId: '',
    requiredSections: [],
    documentMapping: {},

    // Basic Information
    projectName: '',
    projectDescription: '',
    submissionType: 'traditional',
    organizationId: null,

    // Device Details
    deviceName: '',
    deviceModel: '',
    deviceVersion: '',
    manufacturerName: '',
    manufacturerAddress: '',
    intendedUse: '',
    indicationsForUse: '',

    // Classification
    deviceClassification: 'II',
    productCode: '',
    regulationNumber: '',
    panelCode: '',
    predicateDeviceName: '',
    predicateDeviceNumber: '',

    // Special Requirements
    hasSoftware: false,
    hasCybersecurity: false,
    hasSterility: false,
    hasBiocompatibility: true,
    hasClinicalData: false,
    hasAI: false,

    // Team Assignment
    projectLead: '',
    regulatoryLead: '',
    qualityLead: '',
    teamMembers: [],

    // Timeline
    targetSubmissionDate: '',
    estimatedDuration: '6',
    priority: 'medium',
  });

  // Available templates
  const [templates] = useState(getAllTemplates());

  // Get organization ID from TenantContext
  const { currentOrganization } = useTenantContext();
  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (orgId) {
      setFormData(prev => ({
        ...prev,
        organizationId: typeof orgId === 'string' ? parseInt(orgId) : orgId,
      }));
    }
  }, [currentOrganization]);

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async data => {
      // First create the base project
      const projectResponse = await apiRequest('/api/510k/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: data.projectName,
          description: data.projectDescription,
          type: 'regulatory',
          status: 'planning',
          organizationId: data.organizationId,
        }),
      });

      if (!projectResponse.ok) {
        throw new Error('Failed to create project');
      }

      const project = await projectResponse.json();

      // Create the 510k-specific project entry
      const response = await apiRequest('/api/510k/workflow/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          projectId: project.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create 510(k) project');
      }

      const projectResult = await response.json();

      // Initialize the workflow stages automatically
      const workflowInitData = {
        projectName: data.projectName,
        projectDescription: data.projectDescription,
        submissionType: data.submissionType,
        deviceName: data.deviceName,
        intendedUse: data.intendedUse,
        deviceClassification: data.deviceClassification,
        productCode: data.productCode,
        // Initialize stage progress with all stages
        stageProgress: {
          setup: { status: 'todo', completion: 0, gates: {} },
          strategy: { status: 'todo', completion: 0, gates: {} },
          evidence_plan: { status: 'todo', completion: 0, gates: {} },
          evidence: { status: 'todo', completion: 0, gates: {} },
          authoring: { status: 'todo', completion: 0, gates: {} },
          estar_rta: { status: 'todo', completion: 0, gates: {} },
          submit_ai: { status: 'todo', completion: 0, gates: {} },
        },
        // Copy over template-based settings
        hasSoftware: data.hasSoftware,
        hasAI: data.hasAI,
        isCyberDevice: data.isCyberDevice,
        isSterile: data.isSterile,
        hasClinicalData: data.hasClinicalData,
        hasPatientContacting: data.hasPatientContacting,
        contactDuration: data.contactDuration,
        contactType: data.contactType,
      };

      // Initialize the workflow with initial data
      await apiRequest(`/api/510k-workflow/${project.id}`, {
        method: 'POST',
        body: JSON.stringify({
          stage: 'setup',
          section: 'device_intake',
          data: workflowInitData,
          organizationId: data.organizationId,
        }),
      });

      return projectResult;
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/510k/workflow/projects'] });
      toast({
        title: 'Success',
        description: `Project "${formData.projectName}" created successfully`,
      });
      onComplete(data);
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create project',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTemplateSelect = templateKey => {
    const updatedFormData = applyTemplateToForm(templateKey, formData);
    setFormData(updatedFormData);
    toast({
      title: 'Template Applied',
      description: `Successfully applied ${DEVICE_TEMPLATES[templateKey].name} template`,
    });
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, WIZARD_STEPS.length - 1));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const validateCurrentStep = () => {
    const step = WIZARD_STEPS[currentStep].id;

    switch (step) {
      case 'basic':
        if (!formData.projectName || !formData.projectDescription) {
          toast({
            title: 'Validation Error',
            description: 'Please fill in all required fields',
            variant: 'destructive',
          });
          return false;
        }
        break;
      case 'device':
        if (!formData.deviceName || !formData.intendedUse) {
          toast({
            title: 'Validation Error',
            description: 'Device name and intended use are required',
            variant: 'destructive',
          });
          return false;
        }
        break;
      case 'classification':
        if (!formData.deviceClassification) {
          toast({
            title: 'Validation Error',
            description: 'Device classification is required',
            variant: 'destructive',
          });
          return false;
        }
        break;
    }

    return true;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    createProjectMutation.mutate(formData);
  };

  const renderStepContent = () => {
    const step = WIZARD_STEPS[currentStep].id;

    switch (step) {
      case 'template':
        return (
          <div className="space-y-4">
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                Choose a pre-configured template to accelerate your 510(k) submission. Templates
                include optimized workflows, required sections, and smart document mapping.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(template => (
                <Card
                  key={template.key}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    formData.templateId === template.key ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => handleTemplateSelect(template.key)}
                  data-testid={`template-${template.key}`}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      {template.name}
                      {formData.templateId === template.key && (
                        <CheckCircle className="h-5 w-5 text-blue-500" />
                      )}
                    </CardTitle>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        Class {template.deviceClassification}
                      </span>
                      <span className="text-xs bg-blue-100 px-2 py-1 rounded">
                        {template.submissionType}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">{template.description}</p>
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-gray-700">Key Features:</p>
                      <ul className="text-xs text-gray-600 mt-1 space-y-1">
                        <li>• {template.requiredSections.length} required sections</li>
                        <li>• {template.estimatedDuration || '6'} months estimated</li>
                        {template.defaultValues.hasSoftware && <li>• Software/SaMD support</li>}
                        {template.defaultValues.hasAI && <li>• AI/ML capabilities</li>}
                        {template.defaultValues.hasClinicalData && (
                          <li>• Clinical data included</li>
                        )}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {!formData.templateId && (
              <Alert>
                <AlertDescription>
                  You can also proceed without a template for a fully custom 510(k) submission.
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectName" data-testid="label-projectName">
                Project Name *
              </Label>
              <Input
                id="projectName"
                data-testid="input-projectName"
                value={formData.projectName}
                onChange={e => handleInputChange('projectName', e.target.value)}
                placeholder="Enter project name"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="projectDescription" data-testid="label-projectDescription">
                Project Description *
              </Label>
              <Textarea
                id="projectDescription"
                data-testid="textarea-projectDescription"
                value={formData.projectDescription}
                onChange={e => handleInputChange('projectDescription', e.target.value)}
                placeholder="Describe the project objectives and scope"
                className="mt-1"
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="submissionType" data-testid="label-submissionType">
                Submission Type
              </Label>
              <Select
                value={formData.submissionType}
                onValueChange={value => handleInputChange('submissionType', value)}
                data-testid="select-submissionType"
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select submission type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="traditional">Traditional 510(k)</SelectItem>
                  <SelectItem value="special">Special 510(k)</SelectItem>
                  <SelectItem value="abbreviated">Abbreviated 510(k)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'device':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="deviceName" data-testid="label-deviceName">
                  Device Name *
                </Label>
                <Input
                  id="deviceName"
                  data-testid="input-deviceName"
                  value={formData.deviceName}
                  onChange={e => handleInputChange('deviceName', e.target.value)}
                  placeholder="Enter device name"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="deviceModel" data-testid="label-deviceModel">
                  Model Number
                </Label>
                <Input
                  id="deviceModel"
                  data-testid="input-deviceModel"
                  value={formData.deviceModel}
                  onChange={e => handleInputChange('deviceModel', e.target.value)}
                  placeholder="Enter model number"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="manufacturerName" data-testid="label-manufacturerName">
                Manufacturer Name
              </Label>
              <Input
                id="manufacturerName"
                data-testid="input-manufacturerName"
                value={formData.manufacturerName}
                onChange={e => handleInputChange('manufacturerName', e.target.value)}
                placeholder="Enter manufacturer name"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="intendedUse" data-testid="label-intendedUse">
                Intended Use *
              </Label>
              <Textarea
                id="intendedUse"
                data-testid="textarea-intendedUse"
                value={formData.intendedUse}
                onChange={e => handleInputChange('intendedUse', e.target.value)}
                placeholder="Describe the intended use of the device"
                className="mt-1"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="indicationsForUse" data-testid="label-indicationsForUse">
                Indications for Use
              </Label>
              <Textarea
                id="indicationsForUse"
                data-testid="textarea-indicationsForUse"
                value={formData.indicationsForUse}
                onChange={e => handleInputChange('indicationsForUse', e.target.value)}
                placeholder="Describe the indications for use"
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
        );

      case 'classification':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="deviceClassification" data-testid="label-deviceClassification">
                Device Classification *
              </Label>
              <Select
                value={formData.deviceClassification}
                onValueChange={value => handleInputChange('deviceClassification', value)}
                data-testid="select-deviceClassification"
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="I">Class I</SelectItem>
                  <SelectItem value="II">Class II</SelectItem>
                  <SelectItem value="III">Class III</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="productCode" data-testid="label-productCode">
                  Product Code
                </Label>
                <Input
                  id="productCode"
                  data-testid="input-productCode"
                  value={formData.productCode}
                  onChange={e => handleInputChange('productCode', e.target.value)}
                  placeholder="3-letter product code"
                  className="mt-1"
                  maxLength={3}
                />
              </div>

              <div>
                <Label htmlFor="regulationNumber" data-testid="label-regulationNumber">
                  Regulation Number
                </Label>
                <Input
                  id="regulationNumber"
                  data-testid="input-regulationNumber"
                  value={formData.regulationNumber}
                  onChange={e => handleInputChange('regulationNumber', e.target.value)}
                  placeholder="e.g., 21 CFR 880.5180"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="predicateDeviceName" data-testid="label-predicateDeviceName">
                Predicate Device Name
              </Label>
              <Input
                id="predicateDeviceName"
                data-testid="input-predicateDeviceName"
                value={formData.predicateDeviceName}
                onChange={e => handleInputChange('predicateDeviceName', e.target.value)}
                placeholder="Enter predicate device name"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="predicateDeviceNumber" data-testid="label-predicateDeviceNumber">
                Predicate Device 510(k) Number
              </Label>
              <Input
                id="predicateDeviceNumber"
                data-testid="input-predicateDeviceNumber"
                value={formData.predicateDeviceNumber}
                onChange={e => handleInputChange('predicateDeviceNumber', e.target.value)}
                placeholder="e.g., K123456"
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'requirements':
        return (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">
              Select all special requirements that apply to your device
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="hasSoftware"
                  data-testid="checkbox-hasSoftware"
                  checked={formData.hasSoftware}
                  onCheckedChange={checked => handleInputChange('hasSoftware', checked)}
                />
                <Label htmlFor="hasSoftware" className="flex items-center cursor-pointer">
                  <Cpu className="h-4 w-4 mr-2" />
                  Contains Software (SaMD/SiMD)
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="hasCybersecurity"
                  data-testid="checkbox-hasCybersecurity"
                  checked={formData.hasCybersecurity}
                  onCheckedChange={checked => handleInputChange('hasCybersecurity', checked)}
                />
                <Label htmlFor="hasCybersecurity" className="flex items-center cursor-pointer">
                  <Shield className="h-4 w-4 mr-2" />
                  Requires Cybersecurity Assessment
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="hasSterility"
                  data-testid="checkbox-hasSterility"
                  checked={formData.hasSterility}
                  onCheckedChange={checked => handleInputChange('hasSterility', checked)}
                />
                <Label htmlFor="hasSterility" className="flex items-center cursor-pointer">
                  <FlaskConical className="h-4 w-4 mr-2" />
                  Requires Sterilization Validation
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="hasBiocompatibility"
                  data-testid="checkbox-hasBiocompatibility"
                  checked={formData.hasBiocompatibility}
                  onCheckedChange={checked => handleInputChange('hasBiocompatibility', checked)}
                />
                <Label htmlFor="hasBiocompatibility" className="flex items-center cursor-pointer">
                  <Heart className="h-4 w-4 mr-2" />
                  Requires Biocompatibility Testing
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="hasClinicalData"
                  data-testid="checkbox-hasClinicalData"
                  checked={formData.hasClinicalData}
                  onCheckedChange={checked => handleInputChange('hasClinicalData', checked)}
                />
                <Label htmlFor="hasClinicalData" className="flex items-center cursor-pointer">
                  <Users className="h-4 w-4 mr-2" />
                  Includes Clinical Data
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="hasAI"
                  data-testid="checkbox-hasAI"
                  checked={formData.hasAI}
                  onCheckedChange={checked => handleInputChange('hasAI', checked)}
                />
                <Label htmlFor="hasAI" className="flex items-center cursor-pointer">
                  <Zap className="h-4 w-4 mr-2" />
                  Uses AI/Machine Learning
                </Label>
              </div>
            </div>
          </div>
        );

      case 'team':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="projectLead" data-testid="label-projectLead">
                Project Lead
              </Label>
              <Input
                id="projectLead"
                data-testid="input-projectLead"
                value={formData.projectLead}
                onChange={e => handleInputChange('projectLead', e.target.value)}
                placeholder="Enter project lead name or email"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="regulatoryLead" data-testid="label-regulatoryLead">
                Regulatory Lead
              </Label>
              <Input
                id="regulatoryLead"
                data-testid="input-regulatoryLead"
                value={formData.regulatoryLead}
                onChange={e => handleInputChange('regulatoryLead', e.target.value)}
                placeholder="Enter regulatory lead name or email"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="qualityLead" data-testid="label-qualityLead">
                Quality Lead
              </Label>
              <Input
                id="qualityLead"
                data-testid="input-qualityLead"
                value={formData.qualityLead}
                onChange={e => handleInputChange('qualityLead', e.target.value)}
                placeholder="Enter quality lead name or email"
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'timeline':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="targetSubmissionDate" data-testid="label-targetSubmissionDate">
                Target Submission Date
              </Label>
              <Input
                id="targetSubmissionDate"
                data-testid="input-targetSubmissionDate"
                type="date"
                value={formData.targetSubmissionDate}
                onChange={e => handleInputChange('targetSubmissionDate', e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="estimatedDuration" data-testid="label-estimatedDuration">
                Estimated Duration (months)
              </Label>
              <Select
                value={formData.estimatedDuration}
                onValueChange={value => handleInputChange('estimatedDuration', value)}
                data-testid="select-estimatedDuration"
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="9">9 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                  <SelectItem value="18">18 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="priority" data-testid="label-priority">
                Priority Level
              </Label>
              <Select
                value={formData.priority}
                onValueChange={value => handleInputChange('priority', value)}
                data-testid="select-priority"
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Review your project details before creating the 510(k) submission project.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-sm text-gray-600">Basic Information</h4>
                <p className="text-sm">
                  <strong>Project Name:</strong> {formData.projectName}
                </p>
                <p className="text-sm">
                  <strong>Submission Type:</strong> {formData.submissionType}
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-sm text-gray-600">Device Details</h4>
                <p className="text-sm">
                  <strong>Device Name:</strong> {formData.deviceName}
                </p>
                <p className="text-sm">
                  <strong>Classification:</strong> Class {formData.deviceClassification}
                </p>
                {formData.predicateDeviceName && (
                  <p className="text-sm">
                    <strong>Predicate:</strong> {formData.predicateDeviceName}
                  </p>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-sm text-gray-600">Special Requirements</h4>
                <div className="flex flex-wrap gap-2 mt-1">
                  {formData.hasSoftware && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      Software
                    </span>
                  )}
                  {formData.hasCybersecurity && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      Cybersecurity
                    </span>
                  )}
                  {formData.hasSterility && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      Sterility
                    </span>
                  )}
                  {formData.hasBiocompatibility && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                      Biocompatibility
                    </span>
                  )}
                  {formData.hasClinicalData && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                      Clinical Data
                    </span>
                  )}
                  {formData.hasAI && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                      AI/ML
                    </span>
                  )}
                </div>
              </div>

              {formData.targetSubmissionDate && (
                <div>
                  <h4 className="font-semibold text-sm text-gray-600">Timeline</h4>
                  <p className="text-sm">
                    <strong>Target Submission:</strong>{' '}
                    {new Date(formData.targetSubmissionDate).toLocaleDateString()}
                  </p>
                  <p className="text-sm">
                    <strong>Duration:</strong> {formData.estimatedDuration} months
                  </p>
                  <p className="text-sm">
                    <strong>Priority:</strong> {formData.priority}
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Create New 510(k) Project</CardTitle>
        <CardDescription>
          Complete the following steps to set up a new FDA 510(k) submission project
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Progress indicator */}
        <div className="mb-8">
          <Progress value={((currentStep + 1) / WIZARD_STEPS.length) * 100} className="h-2" />
          <div className="flex justify-between mt-4">
            {WIZARD_STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`flex flex-col items-center ${
                  index <= currentStep ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                <div
                  className={`rounded-full p-2 ${
                    index <= currentStep ? 'bg-blue-100' : 'bg-gray-100'
                  }`}
                >
                  {step.icon}
                </div>
                <span className="text-xs mt-1 text-center">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[400px]">{renderStepContent()}</div>

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8">
          <div>
            {currentStep > 0 && (
              <Button
                onClick={handlePrevious}
                variant="outline"
                disabled={isSubmitting}
                data-testid="button-previous"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onCancel}
              variant="outline"
              disabled={isSubmitting}
              data-testid="button-cancel"
            >
              Cancel
            </Button>

            {currentStep < WIZARD_STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={isSubmitting} data-testid="button-next">
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                data-testid="button-create"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <>
                    <Save className="h-4 w-4 mr-2 animate-spin" />
                    Creating Project...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Create Project
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
