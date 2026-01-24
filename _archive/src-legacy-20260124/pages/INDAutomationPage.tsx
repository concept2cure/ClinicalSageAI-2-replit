import React from 'react';
import { useTitle } from '@/hooks/use-title';
import INDAutomationPanel from '@/components/ind-automation/INDAutomationPanel';

/**
 * IND Automation Page
 *
 * This page provides access to the IND Automation features
 * for generating FDA Investigational New Drug application documents
 */
export function INDAutomationPage() {
  useTitle('IND Automation | LumenTrialGuide.AI');

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold">IND Automation System</h1>
        <p className="text-muted-foreground">
          Generate FDA Investigational New Drug (IND) application documents using intelligent
          automation
        </p>
      </div>

      <div className="grid gap-6">
        <INDAutomationPanel />

        <div className="bg-muted p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">About IND Automation</h2>
          <p className="mb-4">
            The IND Automation System simplifies the process of creating compliant FDA
            Investigational New Drug (IND) application documents. Currently supporting:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Module 3: Chemistry, Manufacturing, and Controls (CMC)</strong> - Document
              containing detailed information about the drug substance, its composition,
              manufacturing process, and quality control.
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            This system is in Phase 1 (Proof of Concept). Future releases will include support for
            all IND modules and advanced features like cross-referencing between modules.
          </p>
        </div>
      </div>
    </div>
  );
}

export default INDAutomationPage;
