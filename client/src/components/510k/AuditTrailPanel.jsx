import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck, History, FileCheck, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SignOffAuditTrail from './SignOffAuditTrail';
import ManagerSignOffService from '../../services/ManagerSignOffService';
import { toast } from '@/hooks/use-toast';

/**
 * 510(k) Audit Trail Panel
 *
 * This panel displays a comprehensive audit trail for 510(k) submissions,
 * including manager sign-offs, workflow transitions, and document history.
 */
const AuditTrailPanel = ({ deviceProfile, organizationId }) => {
  const [activeTab, setActiveTab] = useState('sign-offs');
  const [signOffCount, setSignOffCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (deviceProfile?.deviceName) {
      // Count the number of sign-offs for this device
      try {
        const signOffs = ManagerSignOffService.getDeviceSignOffs(deviceProfile.deviceName);
        setSignOffCount(signOffs.length);
      } catch (error) {
        console.error('[AuditTrailPanel] Error counting sign-offs:', error);
      }
    }
  }, [deviceProfile]);

  const handleExportAudit = () => {
    setIsExporting(true);
    // Real export is generated server-side via the eSTAR governed export pipeline.
    // This button routes to that flow rather than fabricating a client-side PDF.
    setTimeout(() => {
      setIsExporting(false);
      toast({
        title: 'Export audit from eSTAR builder',
        description: 'Regulatory audit exports are produced through the governed eSTAR package at Stage 5. Open the eSTAR Builder to generate the audit log.',
      });
    }, 300);
  };

  if (!deviceProfile) {
    return (
      <Card className="border-stone-200 shadow-sm">
        <CardHeader className="bg-amber-50 border-b">
          <CardTitle className="text-base font-semibold text-stone-800">
            <div className="flex items-center">
              <History className="h-5 w-5 text-amber-600 mr-2" />
              Regulatory Audit Trail
            </div>
          </CardTitle>
          <CardDescription className="text-stone-600">
            Please select a device profile to view audit history
          </CardDescription>
        </CardHeader>

        <CardContent className="py-10">
          <div className="text-center">
            <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-stone-700">No device selected</p>
            <p className="text-stone-500 mt-1">
              Select a device profile to view its regulatory audit trail
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-stone-200 shadow-sm">
      <CardHeader className="bg-stone-50 border-b">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base font-semibold text-stone-800">
              <div className="flex items-center">
                <History className="h-5 w-5 text-stone-600 mr-2" />
                Regulatory Audit Trail
              </div>
            </CardTitle>
            <CardDescription className="text-stone-600">
              Complete approval history for {deviceProfile.deviceName}
            </CardDescription>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAudit}
            disabled={isExporting}
            className="text-xs"
          >
            {isExporting ? (
              <>
                <div className="animate-spin h-3.5 w-3.5 border-2 border-stone-500 rounded-full border-t-transparent mr-1"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 mr-1" />
                Export audit log
              </>
            )}
          </Button>
        </div>

        <div className="mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="sign-offs" className="text-xs">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Manager sign-offs
                {signOffCount > 0 && (
                  <Badge className="ml-2 bg-stone-100 text-stone-800 text-xs">{signOffCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="document-history" className="text-xs">
                <FileCheck className="h-3.5 w-3.5 mr-1" />
                Document history
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="pt-4 pb-6">
        <TabsContent value="sign-offs" className="mt-0">
          <SignOffAuditTrail deviceName={deviceProfile.deviceName} exportable={true} />
        </TabsContent>

        <TabsContent value="document-history" className="mt-0">
          <div className="text-center py-10 text-stone-500">
            <FileCheck className="h-10 w-10 mx-auto mb-3 text-stone-300" />
            <p className="text-sm font-medium text-stone-700">Document history</p>
            <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
              Versioned document revisions appear here as you edit and approve 510(k) artifacts.
              Ask the AI assistant to review the current state of your submission package.
            </p>
          </div>
        </TabsContent>
      </CardContent>
    </Card>
  );
};

export default AuditTrailPanel;
