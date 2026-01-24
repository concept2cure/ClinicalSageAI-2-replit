// /client/src/modules/Module3QualityPage.jsx

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Beaker, Box, FileText, Globe } from 'lucide-react';

// Import Module 3 components
import InfoTooltipModule3 from '@/components/ind-wizard/InfoTooltipModule3';
import UploadStatusTrackerModule3 from '@/components/ind-wizard/UploadStatusTrackerModule3';
import DrugSubstanceUploader from '@/components/ind-wizard/DrugSubstanceUploader';
import DrugProductUploader from '@/components/ind-wizard/DrugProductUploader';
import AppendicesUploader from '@/components/ind-wizard/AppendicesUploader';
import RegionalInfoUploader from '@/components/ind-wizard/RegionalInfoUploader';
import Module3NextButton from '@/components/ind-wizard/Module3NextButton';
import AdvisorSidebarV3 from '@/components/advisor/AdvisorSidebarV3';

export default function Module3QualityPage() {
  const [formStatus, setFormStatus] = useState({
    drugSubstanceUploaded: false,
    drugProductUploaded: false,
    appendicesUploaded: false,
    regionalInfoUploaded: false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            CTD Module 3: Quality (CMC Documentation)
            <InfoTooltipModule3 />
          </h1>
          <p className="text-muted-foreground">
            Chemistry, Manufacturing, and Controls (CMC) documentation for the drug substance and
            drug product.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Status Tracker and Advisor (1/4 width on desktop) */}
        <div className="md:col-span-1 space-y-6">
          <UploadStatusTrackerModule3 formStatus={formStatus} />

          {/* Add Advisor Sidebar */}
          <AdvisorSidebarV3 />
        </div>

        {/* Main Content (3/4 width on desktop) */}
        <div className="md:col-span-3 space-y-6">
          <Tabs defaultValue="substance" className="w-full">
            <TabsList className="grid grid-cols-4 mb-4 w-full">
              <TabsTrigger value="substance" className="flex items-center">
                <Beaker className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Drug Substance</span>
                <span className="sm:hidden">3.2.S</span>
              </TabsTrigger>
              <TabsTrigger value="product" className="flex items-center">
                <Beaker className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Drug Product</span>
                <span className="sm:hidden">3.2.P</span>
              </TabsTrigger>
              <TabsTrigger value="appendices" className="flex items-center">
                <Box className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Appendices</span>
                <span className="sm:hidden">3.2.A</span>
              </TabsTrigger>
              <TabsTrigger value="regional" className="flex items-center">
                <Globe className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Regional</span>
                <span className="sm:hidden">3.2.R</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="substance">
              <Card>
                <CardHeader>
                  <CardTitle>Drug Substance (API) Documentation</CardTitle>
                </CardHeader>
                <CardContent>
                  <DrugSubstanceUploader setFormStatus={setFormStatus} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="product">
              <Card>
                <CardHeader>
                  <CardTitle>Drug Product Documentation</CardTitle>
                </CardHeader>
                <CardContent>
                  <DrugProductUploader setFormStatus={setFormStatus} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appendices">
              <Card>
                <CardHeader>
                  <CardTitle>Appendices Documentation</CardTitle>
                </CardHeader>
                <CardContent>
                  <AppendicesUploader setFormStatus={setFormStatus} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="regional">
              <Card>
                <CardHeader>
                  <CardTitle>Regional Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <RegionalInfoUploader setFormStatus={setFormStatus} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Module3NextButton formStatus={formStatus} />
        </div>
      </div>
    </div>
  );
}
