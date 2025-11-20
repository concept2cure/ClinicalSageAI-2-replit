# TrialSage IND Package Implementation Plan

## Project Overview

TrialSage is developing a comprehensive IND (Investigational New Drug) workflow management system that guides users from initial planning through final submission to regulatory authorities. This document outlines our current implementation and the required work to complete the full IND process interface.

## Current Implementation Status

We've built core components for document management and some regulatory workflow features, but the complete end-to-end IND process user interface requires development. Key existing features include:

1. **Basic IND Sequence Management**

   - IndSequenceManager for tracking IND submissions
   - Status visualization and filtering by criteria

2. **Document Management & Builder Tools**

   - SubmissionBuilder with drag-and-drop interface
   - Document version comparison functionality
   - eCTD structure validation

3. **Security Framework**

   - AES-256 encryption implementation
   - API security with request signing
   - SecureToast notification system

4. **AI-Assisted Features**
   - Initial conversational agent framework
   - Basic protocol optimization logic

## Technical Requirements for Full IND Workflow

### 1. End-to-End IND Process UI

**Requirements:**

- Complete wizard-style interface guiding users through each IND phase
- Step-by-step process with progress tracking
- Contextual help and regulatory guidance at each step
- Unified dashboard view of IND timeline and status

**Architectural Considerations:**

- Multi-step form design with state persistence
- Modular component structure for maintainability
- Unified styling with enterprise-grade visual design

### 2. Critical IND Workflow Stages

Each stage requires specific UI components:

**a. Initial Planning & Pre-IND**

- Project initiation forms
- Pre-IND meeting preparation tools
- FDA interaction management interface
- Milestone scheduling & tracking

**b. Nonclinical Data Collection**

- Study data organization interface
- Data validation against FDA requirements
- Gap analysis visualization
- Automated reporting framework

**c. CMC (Chemistry, Manufacturing & Controls)**

- Material registration and tracking
- Manufacturing process documentation
- Quality control data management
- Stability data organization tools

**d. Clinical Protocol Development**

- Protocol builder with templates
- Statistical design assistance
- Endpoint selection guidance
- Patient safety monitoring plans

**e. Investigator Brochure Creation**

- Data integration from nonclinical studies
- Adverse event visualization
- Document assembly with regulatory guidance
- Version control system

**f. FDA Form Completion**

- Form 1571 guided completion
- Form 1572 investigator management
- Form 3674 clinical trials registration
- Electronic submission preparation

**g. Final Submission Assembly**

- eCTD-compliant document organization
- Cross-reference verification
- Technical validation tools
- Submission readiness checklist

## Implementation Plan

### Phase 1: Wizard Framework

#### Step 1: Create Wizard Layout Component

```jsx
// src/components/ind-wizard/IndWizardLayout.jsx
import React, { useState, createContext, useContext, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import PreIndStep from './steps/PreIndStep';
// Import other step components as they are created

// Define the structure for IND data
const initialIndData = {
  projectDetails: {},
  preIndMeeting: {},
  nonclinicalData: {},
  cmcData: {},
  clinicalProtocol: {},
  investigatorBrochure: {},
  fdaForms: {},
  // Other sections as needed
};

// Define the wizard steps
const steps = [
  { id: 'pre-ind', title: 'Initial Planning & Pre-IND', component: PreIndStep },
  // Add other steps as they are created
];

// Create Context for Wizard State
const WizardContext = createContext(null);

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within an IndWizardLayout');
  }
  return context;
}

export default function IndWizardLayout() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [indData, setIndData] = useState(initialIndData);
  const [savingStatus, setSavingStatus] = useState('idle'); // idle, saving, success, error

  const CurrentStepComponent = steps[currentStepIndex].component;
  const totalSteps = steps.length;
  const progress = ((currentStepIndex + 1) / totalSteps) * 100;

  const goToNextStep = () => {
    // Save current step data before proceeding
    saveCurrentStep().then(() => {
      setCurrentStepIndex(prevIndex => Math.min(prevIndex + 1, totalSteps - 1));
    });
  };

  const goToPreviousStep = () => {
    setCurrentStepIndex(prevIndex => Math.max(prevIndex - 1, 0));
  };

  // Function to update the shared IND data
  const updateIndData = (section, data) => {
    setIndData(prevData => ({
      ...prevData,
      [section]: { ...prevData[section], ...data },
    }));
  };

  // Save current step data to the server
  const saveCurrentStep = async () => {
    try {
      setSavingStatus('saving');
      // API call to save the current state
      // const response = await apiRequest('POST', '/api/ind/save-draft', indData);
      setSavingStatus('success');
      return true;
    } catch (error) {
      setSavingStatus('error');
      return false;
    }
  };

  // Memoize context value to prevent unnecessary re-renders
  const wizardContextValue = useMemo(
    () => ({
      currentStepIndex,
      totalSteps,
      indData,
      updateIndData,
      goToNextStep,
      goToPreviousStep,
      savingStatus,
      saveCurrentStep,
    }),
    [currentStepIndex, totalSteps, indData, savingStatus]
  );

  return (
    <WizardContext.Provider value={wizardContextValue}>
      <div className="container mx-auto p-6 border rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">IND Creation Wizard</h1>

        {/* Step Indicator */}
        <div className="mb-6">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">
              Step {currentStepIndex + 1} of {totalSteps}: {steps[currentStepIndex].title}
            </span>
            <span className="text-sm font-medium text-gray-700">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="w-full" />
        </div>

        {/* Render Current Step Component */}
        <div className="mb-6 min-h-[500px] p-4 border rounded-lg bg-white">
          <CurrentStepComponent />
        </div>

        {/* Save Status */}
        <div className="text-sm text-right mb-2">
          {savingStatus === 'saving' && <span className="text-amber-500">Saving...</span>}
          {savingStatus === 'success' && <span className="text-green-500">Changes saved</span>}
          {savingStatus === 'error' && <span className="text-red-500">Error saving changes</span>}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between border-t pt-4">
          <Button variant="outline" onClick={goToPreviousStep} disabled={currentStepIndex === 0}>
            Previous
          </Button>

          <div>
            <Button variant="outline" className="mr-2" onClick={saveCurrentStep}>
              Save Progress
            </Button>

            {currentStepIndex < totalSteps - 1 ? (
              <Button onClick={goToNextStep}>Next</Button>
            ) : (
              <Button onClick={() => alert('Submit IND Data (Implement Me!)')}>
                Review & Submit
              </Button>
            )}
          </div>
        </div>
      </div>
    </WizardContext.Provider>
  );
}
```

#### Step 2: Implement First Wizard Step (Pre-IND)

```jsx
// src/components/ind-wizard/steps/PreIndStep.jsx
import React, { useState, useEffect } from 'react';
import { useWizard } from '../IndWizardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/security/SecureToast';

export default function PreIndStep() {
  const { indData, updateIndData } = useWizard();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('project-details');

  // Local state for form fields
  const [projectDetails, setProjectDetails] = useState(
    indData.projectDetails || {
      projectName: '',
      investigationalProduct: '',
      therapeuticArea: '',
      targetIndication: '',
      developmentPhase: '',
      projectDescription: '',
      startDate: null,
      estimatedSubmissionDate: null,
    }
  );

  const [preIndMeeting, setPreIndMeeting] = useState(
    indData.preIndMeeting || {
      meetingRequested: false,
      proposedDate: null,
      meetingObjectives: '',
      keyQuestions: '',
      meetingMaterials: [],
      fdaFeedback: '',
    }
  );

  // Save form data to wizard context when component unmounts or tab changes
  useEffect(() => {
    return () => {
      // Save current local state to wizard context
      updateIndData('projectDetails', projectDetails);
      updateIndData('preIndMeeting', preIndMeeting);
    };
  }, []);

  // Handle input changes for project details
  const handleProjectDetailsChange = e => {
    const { name, value } = e.target;
    setProjectDetails(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle date changes for project details
  const handleProjectDateChange = (field, date) => {
    setProjectDetails(prev => ({
      ...prev,
      [field]: date,
    }));
  };

  // Handle input changes for pre-IND meeting
  const handlePreIndMeetingChange = e => {
    const { name, value, type, checked } = e.target;
    setPreIndMeeting(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Handle date changes for pre-IND meeting
  const handleMeetingDateChange = date => {
    setPreIndMeeting(prev => ({
      ...prev,
      proposedDate: date,
    }));
  };

  // Handle tab changes and save data
  const handleTabChange = value => {
    // Save current tab data
    if (activeTab === 'project-details') {
      updateIndData('projectDetails', projectDetails);
    } else if (activeTab === 'pre-ind-meeting') {
      updateIndData('preIndMeeting', preIndMeeting);
    }

    setActiveTab(value);
  };

  // Handle file upload for meeting materials
  const handleFileUpload = e => {
    const files = Array.from(e.target.files);

    // In a real implementation, you would upload these files to your server
    // and then update the state with the file metadata or URLs

    // For now, just update the local state with file names
    setPreIndMeeting(prev => ({
      ...prev,
      meetingMaterials: [
        ...prev.meetingMaterials,
        ...files.map(file => ({ name: file.name, size: file.size })),
      ],
    }));

    showToast('Files uploaded successfully', 'success');
  };

  return (
    <div>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-6">
          <TabsTrigger value="project-details">Project Details</TabsTrigger>
          <TabsTrigger value="pre-ind-meeting">Pre-IND Meeting</TabsTrigger>
          <TabsTrigger value="milestones">Key Milestones</TabsTrigger>
        </TabsList>

        <TabsContent value="project-details">
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>
                Enter basic information about your investigational product and development program.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project Name</Label>
                  <Input
                    id="projectName"
                    name="projectName"
                    value={projectDetails.projectName}
                    onChange={handleProjectDetailsChange}
                    placeholder="Enter project name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="investigationalProduct">Investigational Product</Label>
                  <Input
                    id="investigationalProduct"
                    name="investigationalProduct"
                    value={projectDetails.investigationalProduct}
                    onChange={handleProjectDetailsChange}
                    placeholder="Enter drug/biologic name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="therapeuticArea">Therapeutic Area</Label>
                  <Input
                    id="therapeuticArea"
                    name="therapeuticArea"
                    value={projectDetails.therapeuticArea}
                    onChange={handleProjectDetailsChange}
                    placeholder="E.g., Oncology, Neurology, etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetIndication">Target Indication</Label>
                  <Input
                    id="targetIndication"
                    name="targetIndication"
                    value={projectDetails.targetIndication}
                    onChange={handleProjectDetailsChange}
                    placeholder="Specific disease indication"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="developmentPhase">Development Phase</Label>
                  <Input
                    id="developmentPhase"
                    name="developmentPhase"
                    value={projectDetails.developmentPhase}
                    onChange={handleProjectDetailsChange}
                    placeholder="E.g., First-in-human, Phase 1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate">Project Start Date</Label>
                  <DatePicker
                    id="startDate"
                    selected={projectDetails.startDate}
                    onChange={date => handleProjectDateChange('startDate', date)}
                    placeholderText="Select start date"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="projectDescription">Project Description</Label>
                  <Textarea
                    id="projectDescription"
                    name="projectDescription"
                    value={projectDetails.projectDescription}
                    onChange={handleProjectDetailsChange}
                    placeholder="Brief description of the development program"
                    rows={4}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                onClick={() => {
                  updateIndData('projectDetails', projectDetails);
                  showToast('Project details saved', 'success');
                }}
              >
                Save Details
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="pre-ind-meeting">
          <Card>
            <CardHeader>
              <CardTitle>Pre-IND Meeting</CardTitle>
              <CardDescription>
                Manage Pre-IND meeting requests and FDA interactions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="meetingRequested"
                    name="meetingRequested"
                    checked={preIndMeeting.meetingRequested}
                    onChange={handlePreIndMeetingChange}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="meetingRequested">Request Pre-IND Meeting</Label>
                </div>

                {preIndMeeting.meetingRequested && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="proposedDate">Proposed Meeting Date</Label>
                      <DatePicker
                        id="proposedDate"
                        selected={preIndMeeting.proposedDate}
                        onChange={handleMeetingDateChange}
                        placeholderText="Select proposed date"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="meetingObjectives">Meeting Objectives</Label>
                      <Textarea
                        id="meetingObjectives"
                        name="meetingObjectives"
                        value={preIndMeeting.meetingObjectives}
                        onChange={handlePreIndMeetingChange}
                        placeholder="Primary objectives for this meeting"
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="keyQuestions">Key Questions for FDA</Label>
                      <Textarea
                        id="keyQuestions"
                        name="keyQuestions"
                        value={preIndMeeting.keyQuestions}
                        onChange={handlePreIndMeetingChange}
                        placeholder="Specific questions you would like the FDA to address"
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="meetingMaterials">Upload Meeting Materials</Label>
                      <Input
                        id="meetingMaterials"
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-gray-500">
                        Upload briefing documents, background materials, or presentation slides
                      </p>
                    </div>

                    {preIndMeeting.meetingMaterials.length > 0 && (
                      <div className="space-y-2">
                        <Label>Uploaded Materials</Label>
                        <ul className="text-sm space-y-1">
                          {preIndMeeting.meetingMaterials.map((file, index) => (
                            <li key={index} className="flex items-center justify-between">
                              <span>{file.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPreIndMeeting(prev => ({
                                    ...prev,
                                    meetingMaterials: prev.meetingMaterials.filter(
                                      (_, i) => i !== index
                                    ),
                                  }));
                                }}
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="fdaFeedback">FDA Feedback (if received)</Label>
                      <Textarea
                        id="fdaFeedback"
                        name="fdaFeedback"
                        value={preIndMeeting.fdaFeedback}
                        onChange={handlePreIndMeetingChange}
                        placeholder="Document key feedback or guidance received from the FDA"
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button
                onClick={() => {
                  updateIndData('preIndMeeting', preIndMeeting);
                  showToast('Pre-IND meeting information saved', 'success');
                }}
              >
                Save Meeting Information
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="milestones">
          <Card>
            <CardHeader>
              <CardTitle>Key Milestones</CardTitle>
              <CardDescription>
                Set and track key milestones for your IND preparation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center py-20 text-gray-500">
                [Milestone tracking interface will be implemented here]
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### Phase 2: Integration with Main Application

#### Step 1: Create IND Module Route

```jsx
// client/src/pages/INDWizard.jsx
import React from 'react';
import IndWizardLayout from '../components/ind-wizard/IndWizardLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/security/SecureToast';

export default function INDWizard() {
  const { showToast } = useToast();

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">IND Preparation Wizard</h1>
        <div>
          <Button
            variant="outline"
            className="mr-2"
            onClick={() => {
              // Implement save as draft logic
              showToast('IND application saved as draft', 'success');
            }}
          >
            Save as Draft
          </Button>
          <Button
            variant="outline"
            className="mr-2"
            onClick={() => {
              // Implement dashboard return logic
              window.location.href = '/ind/planner';
            }}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">About the IND Wizard</h2>
        <p className="text-gray-700">
          This guided wizard will help you prepare all necessary components for your Investigational
          New Drug (IND) application. Follow each step sequentially to ensure completeness of your
          submission. Your progress is automatically saved.
        </p>
      </div>

      <IndWizardLayout />
    </div>
  );
}
```

#### Step 2: Add Route to App.tsx

```jsx
// Existing App.tsx file with added route
<Route path="/ind/wizard">
  <ErrorBoundary>
    <INDWizard />
  </ErrorBoundary>
</Route>
```

### Phase 3: Implement Remaining Wizard Steps

For each of the IND workflow stages, implement corresponding step components:

1. NonclinicalDataStep.jsx
2. CMCDataStep.jsx
3. ClinicalProtocolStep.jsx
4. InvestigatorBrochureStep.jsx
5. FDAFormsStep.jsx
6. FinalSubmissionStep.jsx

Each step would follow a similar pattern as the PreIndStep, with appropriate forms and interfaces for that particular stage of the IND process.

## Technical Stack

- **Frontend:** React 18+ with TypeScript, shadcn components, TailwindCSS
- **State Management:** React Context/Query combined with server state
- **Backend:** Express server with FastAPI for ML capabilities
- **Database:** PostgreSQL with proper data modeling
- **Security:** AES-256 encryption, API request signing, CSRF protection
- **AI Integration:** OpenAI API with context management

## API Integration Plan

The IND wizard will need the following API endpoints:

1. **Draft Management**

   - GET /api/ind/drafts - List all IND drafts
   - GET /api/ind/drafts/:id - Get specific IND draft
   - POST /api/ind/drafts - Create new IND draft
   - PUT /api/ind/drafts/:id - Update IND draft
   - DELETE /api/ind/drafts/:id - Delete IND draft

2. **Document Generation**

   - POST /api/ind/generate-document - Generate document from template
   - GET /api/ind/templates - Get available document templates

3. **FDA Interaction**

   - POST /api/ind/meeting-request - Submit Pre-IND meeting request
   - GET /api/ind/regulatory-guidelines - Get relevant regulatory guidelines

4. **AI Assistance**
   - POST /api/ind/ai-recommend - Get AI recommendations for current stage
   - POST /api/ind/ai-validate - Validate current data against regulatory requirements

## UI/UX Considerations

- Use a consistent color scheme across all wizard steps
- Implement clear error messaging and validation
- Provide contextual help tooltips for regulatory terminology
- Show real-time progress indication
- Auto-save functionality to prevent data loss
- Responsive design for different screen sizes

## Next Steps

1. Implement the IndWizardLayout component
2. Create the PreIndStep component
3. Integrate with App.tsx routing
4. Develop API endpoints for draft management
5. Proceed with implementing remaining step components
6. Connect with AI assistance capabilities

This plan provides a comprehensive roadmap for building the complete IND Wizard interface, enabling users to navigate the entire IND process from start to submission.
