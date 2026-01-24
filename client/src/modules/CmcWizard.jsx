import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  FlaskConical, 
  FileText, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Beaker,
  Factory,
  ClipboardCheck
} from 'lucide-react';

/**
 * CMC Wizard - Chemistry, Manufacturing, and Controls Module
 */
const CmcWizard = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');

  const steps = [
    { id: 'drug-substance', title: 'Drug Substance (3.2.S)', icon: Beaker },
    { id: 'drug-product', title: 'Drug Product (3.2.P)', icon: FlaskConical },
    { id: 'manufacturing', title: 'Manufacturing', icon: Factory },
    { id: 'controls', title: 'Quality Controls', icon: ClipboardCheck },
    { id: 'review', title: 'Review & Submit', icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <FlaskConical className="h-8 w-8 text-blue-600" />
            CMC Documentation Wizard
          </h1>
          <p className="text-slate-600 mt-2">
            Chemistry, Manufacturing, and Controls documentation for regulatory submissions
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {React.createElement(steps[currentStep].icon, { className: "h-5 w-5" })}
              {steps[currentStep].title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="requirements">Requirements</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h3 className="font-semibold mb-2">Step Overview</h3>
                  <p className="text-slate-600">
                    Complete CMC documentation for this section.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="requirements">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">ICH Guidelines</h4>
                  <ul className="list-disc list-inside text-sm text-slate-600">
                    <li>ICH Q8 - Pharmaceutical Development</li>
                    <li>ICH Q9 - Quality Risk Management</li>
                  </ul>
                </div>
              </TabsContent>
              <TabsContent value="documents">
                <div className="text-center py-8 text-slate-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Upload CMC documents</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Previous
          </Button>
          <Button onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))} disabled={currentStep === steps.length - 1}>
            Next <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CmcWizard;
