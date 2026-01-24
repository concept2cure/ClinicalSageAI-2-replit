// src/pages/INDWizard.jsx
import React from 'react';
import { Route, Switch, useLocation } from 'wouter';
import IndWizardLayout from '../components/ind-wizard/IndWizardLayout';
import PreIndStep from '../components/ind-wizard/steps/PreIndStep';
import { Button } from '@/components/ui/button';
import UnifiedDocumentUpload from '../components/unified/UnifiedDocumentUpload';

// This would be filled with actual components as they are created
const NonclinicalStep = () => (
  <div className="p-10 text-center">Nonclinical Data Collection (Coming Soon)</div>
);
const CmcStep = () => <div className="p-10 text-center">CMC Data (Coming Soon)</div>;
const ClinicalProtocolStep = () => (
  <div className="p-10 text-center">Clinical Protocol (Coming Soon)</div>
);
const InvestigatorBrochureStep = () => (
  <div className="p-10 text-center">Investigator Brochure (Coming Soon)</div>
);
const FDAFormsStep = () => <div className="p-10 text-center">FDA Forms (Coming Soon)</div>;
const FinalSubmissionStep = () => (
  <div className="p-10 text-center">Final Submission (Coming Soon)</div>
);

export default function INDWizard() {
  return (
    <div className="min-h-screen">
      <div className="flex justify-between items-center p-4 bg-white border-b">
        <h1 className="text-3xl font-bold">IND Preparation Wizard</h1>
        <div>
          <Button
            variant="outline"
            className="mr-2"
            onClick={() => {
              // This would be implemented to return to the dashboard
              alert('Return to dashboard');
              window.location.href = '/';
            }}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>

      <Switch>
        <Route path="/ind-wizard" exact>
          <IndWizardLayout>
            <PreIndStep />
          </IndWizardLayout>
        </Route>
        <Route path="/ind-wizard/pre-planning">
          <IndWizardLayout>
            <PreIndStep />
          </IndWizardLayout>
        </Route>
        <Route path="/ind-wizard/nonclinical">
          <IndWizardLayout>
            <NonclinicalStep />
          </IndWizardLayout>
        </Route>
        <Route path="/ind-wizard/cmc">
          <IndWizardLayout>
            <CmcStep />
          </IndWizardLayout>
        </Route>
        <Route path="/ind-wizard/clinical-protocol">
          <IndWizardLayout>
            <ClinicalProtocolStep />
          </IndWizardLayout>
        </Route>
        <Route path="/ind-wizard/investigator-brochure">
          <IndWizardLayout>
            <InvestigatorBrochureStep />
          </IndWizardLayout>
        </Route>
        <Route path="/ind-wizard/fda-forms">
          <IndWizardLayout>
            <FDAFormsStep />
          </IndWizardLayout>
        </Route>
        <Route path="/ind-wizard/final-submission">
          <IndWizardLayout>
            <FinalSubmissionStep />
          </IndWizardLayout>
        </Route>
      </Switch>
    </div>
  );
}
