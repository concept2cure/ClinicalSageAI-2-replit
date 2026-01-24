// Functional IND Wizard - Actually working implementation
import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FileText, Save, Download, Send, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export default function FunctionalINDWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [projectData, setProjectData] = useState({
    projectName: '',
    drugName: '',
    indication: '',
    sponsor: '',
    investigator: '',
    phase: 'Phase I',
    studyType: 'First-in-Human',
    therapeuticArea: '',
    targetPatients: '',
    primaryEndpoint: '',
    secondaryEndpoints: '',
    inclusionCriteria: '',
    exclusionCriteria: '',
    dosing: '',
    safety: '',
    efficacy: '',
    manufacturing: '',
    formulation: '',
  });
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const { toast } = useToast();

  const steps = [
    { id: 1, title: 'Project Setup', icon: FileText },
    { id: 2, title: 'Drug Information', icon: FileText },
    { id: 3, title: 'Clinical Protocol', icon: FileText },
    { id: 4, title: 'Safety Data', icon: FileText },
    { id: 5, title: 'Review & Submit', icon: Send },
  ];

  const handleInputChange = (field, value) => {
    setProjectData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      const method = projectId ? 'PUT' : 'POST';
      const url = projectId ? `/api/ind/projects/${projectId}` : '/api/ind/create';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData),
      });

      if (!response.ok) {
        throw new Error('Failed to save project');
      }

      const result = await response.json();
      setProjectId(result.id);

      toast({
        title: 'Project Saved',
        description: `IND project "${projectData.projectName}" has been saved successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: 'Failed to save project. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const generateDocument = async () => {
    try {
      const response = await fetch('/api/ind/generate-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectData,
          documentType: 'IND_APPLICATION',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectData.projectName}_IND_Application.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Document Generated',
        description: 'IND application document has been generated and downloaded.',
      });
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate document. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const submitToFDA = async () => {
    try {
      const response = await fetch('/api/ind/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit to FDA');
      }

      const result = await response.json();

      toast({
        title: 'Submission Successful',
        description: `IND application submitted successfully. Tracking ID: ${result.trackingId}`,
      });
    } catch (error) {
      toast({
        title: 'Submission Failed',
        description: 'Failed to submit to FDA. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="projectName">Project Name *</Label>
                <Input
                  id="projectName"
                  value={projectData.projectName}
                  onChange={e => handleInputChange('projectName', e.target.value)}
                  placeholder="Enter project name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="drugName">Drug Name *</Label>
                <Input
                  id="drugName"
                  value={projectData.drugName}
                  onChange={e => handleInputChange('drugName', e.target.value)}
                  placeholder="Enter drug name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="indication">Indication *</Label>
                <Input
                  id="indication"
                  value={projectData.indication}
                  onChange={e => handleInputChange('indication', e.target.value)}
                  placeholder="Enter indication"
                  required
                />
              </div>
              <div>
                <Label htmlFor="sponsor">Sponsor *</Label>
                <Input
                  id="sponsor"
                  value={projectData.sponsor}
                  onChange={e => handleInputChange('sponsor', e.target.value)}
                  placeholder="Enter sponsor name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="investigator">Principal Investigator *</Label>
                <Input
                  id="investigator"
                  value={projectData.investigator}
                  onChange={e => handleInputChange('investigator', e.target.value)}
                  placeholder="Enter investigator name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="therapeuticArea">Therapeutic Area</Label>
                <Select
                  value={projectData.therapeuticArea}
                  onValueChange={value => handleInputChange('therapeuticArea', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select therapeutic area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oncology">Oncology</SelectItem>
                    <SelectItem value="neurology">Neurology</SelectItem>
                    <SelectItem value="cardiology">Cardiology</SelectItem>
                    <SelectItem value="immunology">Immunology</SelectItem>
                    <SelectItem value="endocrinology">Endocrinology</SelectItem>
                    <SelectItem value="infectious-disease">Infectious Disease</SelectItem>
                    <SelectItem value="rare-disease">Rare Disease</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="phase">Study Phase *</Label>
                <Select
                  value={projectData.phase}
                  onValueChange={value => handleInputChange('phase', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select phase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Phase I">Phase I</SelectItem>
                    <SelectItem value="Phase I/II">Phase I/II</SelectItem>
                    <SelectItem value="Phase II">Phase II</SelectItem>
                    <SelectItem value="Phase II/III">Phase II/III</SelectItem>
                    <SelectItem value="Phase III">Phase III</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="studyType">Study Type *</Label>
                <Select
                  value={projectData.studyType}
                  onValueChange={value => handleInputChange('studyType', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select study type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="First-in-Human">First-in-Human</SelectItem>
                    <SelectItem value="Dose-Escalation">Dose-Escalation</SelectItem>
                    <SelectItem value="Proof-of-Concept">Proof-of-Concept</SelectItem>
                    <SelectItem value="Biomarker">Biomarker Study</SelectItem>
                    <SelectItem value="Combination">Combination Study</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="formulation">Drug Formulation *</Label>
              <Textarea
                id="formulation"
                value={projectData.formulation}
                onChange={e => handleInputChange('formulation', e.target.value)}
                placeholder="Describe the drug formulation, route of administration, and dosage form"
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="manufacturing">Manufacturing Information *</Label>
              <Textarea
                id="manufacturing"
                value={projectData.manufacturing}
                onChange={e => handleInputChange('manufacturing', e.target.value)}
                placeholder="Provide manufacturing details, quality control, and stability data"
                rows={4}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="targetPatients">Target Patient Population *</Label>
              <Textarea
                id="targetPatients"
                value={projectData.targetPatients}
                onChange={e => handleInputChange('targetPatients', e.target.value)}
                placeholder="Describe the target patient population"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="primaryEndpoint">Primary Endpoint *</Label>
              <Textarea
                id="primaryEndpoint"
                value={projectData.primaryEndpoint}
                onChange={e => handleInputChange('primaryEndpoint', e.target.value)}
                placeholder="Define the primary endpoint"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="secondaryEndpoints">Secondary Endpoints</Label>
              <Textarea
                id="secondaryEndpoints"
                value={projectData.secondaryEndpoints}
                onChange={e => handleInputChange('secondaryEndpoints', e.target.value)}
                placeholder="List secondary endpoints"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="inclusionCriteria">Inclusion Criteria *</Label>
                <Textarea
                  id="inclusionCriteria"
                  value={projectData.inclusionCriteria}
                  onChange={e => handleInputChange('inclusionCriteria', e.target.value)}
                  placeholder="List inclusion criteria"
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="exclusionCriteria">Exclusion Criteria *</Label>
                <Textarea
                  id="exclusionCriteria"
                  value={projectData.exclusionCriteria}
                  onChange={e => handleInputChange('exclusionCriteria', e.target.value)}
                  placeholder="List exclusion criteria"
                  rows={4}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="dosing">Dosing Strategy *</Label>
              <Textarea
                id="dosing"
                value={projectData.dosing}
                onChange={e => handleInputChange('dosing', e.target.value)}
                placeholder="Describe dosing strategy and escalation plan"
                rows={3}
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="safety">Safety Profile *</Label>
              <Textarea
                id="safety"
                value={projectData.safety}
                onChange={e => handleInputChange('safety', e.target.value)}
                placeholder="Describe known safety profile, preclinical toxicology, and risk mitigation strategies"
                rows={6}
              />
            </div>
            <div>
              <Label htmlFor="efficacy">Efficacy Data</Label>
              <Textarea
                id="efficacy"
                value={projectData.efficacy}
                onChange={e => handleInputChange('efficacy', e.target.value)}
                placeholder="Describe available efficacy data from preclinical studies"
                rows={4}
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Review Your IND Application</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <strong>Project Name:</strong> {projectData.projectName}
                    </div>
                    <div>
                      <strong>Drug Name:</strong> {projectData.drugName}
                    </div>
                    <div>
                      <strong>Indication:</strong> {projectData.indication}
                    </div>
                    <div>
                      <strong>Sponsor:</strong> {projectData.sponsor}
                    </div>
                    <div>
                      <strong>Phase:</strong> {projectData.phase}
                    </div>
                    <div>
                      <strong>Study Type:</strong> {projectData.studyType}
                    </div>
                  </div>
                  <div>
                    <strong>Primary Endpoint:</strong> {projectData.primaryEndpoint}
                  </div>
                  <div>
                    <strong>Target Patients:</strong> {projectData.targetPatients}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button onClick={generateDocument} className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Generate IND Document
              </Button>
              <Button onClick={submitToFDA} className="flex-1" variant="default">
                <Send className="w-4 h-4 mr-2" />
                Submit to FDA
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isStepComplete = stepId => {
    switch (stepId) {
      case 1:
        return (
          projectData.projectName &&
          projectData.drugName &&
          projectData.indication &&
          projectData.sponsor
        );
      case 2:
        return (
          projectData.phase &&
          projectData.studyType &&
          projectData.formulation &&
          projectData.manufacturing
        );
      case 3:
        return (
          projectData.targetPatients &&
          projectData.primaryEndpoint &&
          projectData.inclusionCriteria &&
          projectData.exclusionCriteria &&
          projectData.dosing
        );
      case 4:
        return projectData.safety;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const canProceed = () => {
    return isStepComplete(currentStep);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">IND Wizard</h1>
          <p className="text-gray-600">Complete your IND application step by step</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {steps.map(step => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    currentStep === step.id
                      ? 'bg-blue-600 text-white'
                      : isStepComplete(step.id)
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {isStepComplete(step.id) ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : currentStep === step.id ? (
                    <Clock className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`ml-3 text-sm font-medium ${
                    currentStep === step.id ? 'text-blue-600' : 'text-gray-500'
                  }`}
                >
                  {step.title}
                </span>
              </div>
            ))}
          </div>
          <Progress value={(currentStep / steps.length) * 100} className="w-full" />
        </div>

        {/* Step Content */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>
              Step {currentStep}: {steps[currentStep - 1].title}
            </CardTitle>
          </CardHeader>
          <CardContent>{renderStep()}</CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
            >
              Previous
            </Button>
            <Button onClick={saveProject} disabled={saving} variant="outline">
              {saving ? <Clock className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
          </div>

          <Button
            onClick={() => setCurrentStep(Math.min(steps.length, currentStep + 1))}
            disabled={currentStep === steps.length || !canProceed()}
          >
            {currentStep === steps.length ? 'Complete' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
