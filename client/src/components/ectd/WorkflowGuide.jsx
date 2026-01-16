import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ArrowRight, FileText, Upload, Download } from 'lucide-react'

const WorkflowGuide = () => {
  const workflowSteps = [
    {
      id: 1,
      title: 'Document Preparation',
      description: 'Prepare and organize your regulatory documents according to eCTD structure',
      icon: <FileText className="h-5 w-5" />,
      status: 'active',
    },
    {
      id: 2,
      title: 'File Selection',
      description: 'Select documents from the Module 1-5 structure using the file browser',
      icon: <Upload className="h-5 w-5" />,
      status: 'pending',
    },
    {
      id: 3,
      title: 'Validation Check',
      description: 'System validates compliance with ICH and regional requirements',
      icon: <CheckCircle className="h-5 w-5" />,
      status: 'pending',
    },
    {
      id: 4,
      title: 'Submission Generation',
      description: 'Generate compliant eCTD submission package with XML backbone',
      icon: <Download className="h-5 w-5" />,
      status: 'pending',
    },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>eCTD Submission Workflow</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {workflowSteps.map((step, index) => (
            <div key={step.id} className="flex items-center space-x-4">
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  step.status === 'active'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {step.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-medium">{step.title}</h3>
                  <Badge variant={step.status === 'active' ? 'default' : 'secondary'}>
                    Step {step.id}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">{step.description}</p>
              </div>
              {index < workflowSteps.length - 1 && <ArrowRight className="h-4 w-4 text-gray-400" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkflowGuide;
