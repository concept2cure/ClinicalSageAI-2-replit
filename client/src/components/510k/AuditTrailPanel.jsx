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

 setTimeout(() => {
 // In a production environment, this would generate a real PDF
 console.log(
 '[AuditTrailPanel] Exporting complete regulatory audit for:',
 deviceProfile?.deviceName
 );
 setIsExporting(false);

 // Show alert for demo purposes
 toast({ title: 
 'In a production environment, this would generate a comprehensive FDA-compliant audit log PDF for regulatory submissions.'
 });
 }, 1500);
 };

 if (!deviceProfile) {
 return (
 <Card className="border-gray-200 shadow-sm">
 <CardHeader className="bg-gradient-to-r from-amber-50 to-white border-b">
 <CardTitle className="text-xl font-bold text-gray-800">
 <div className="flex items-center">
 <History className="h-5 w-5 text-amber-600 mr-2" />
 Regulatory Audit Trail
 </div>
 </CardTitle>
 <CardDescription className="text-gray-600">
 Please select a device profile to view audit history
 </CardDescription>
 </CardHeader>

 <CardContent className="py-10">
 <div className="text-center">
 <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
 <p className="text-lg font-medium text-gray-700">No Device Selected</p>
 <p className="text-gray-500 mt-1">
 Select a device profile to view its regulatory audit trail
 </p>
 </div>
 </CardContent>
 </Card>
 );
 }

 return (
 <Card className="border-gray-200 shadow-sm">
 <CardHeader className="bg-gradient-to-r from-stone-50 to-white border-b">
 <div className="flex justify-between items-start">
 <div>
 <CardTitle className="text-xl font-bold text-gray-800">
 <div className="flex items-center">
 <History className="h-5 w-5 text-stone-600 mr-2" />
 Regulatory Audit Trail
 </div>
 </CardTitle>
 <CardDescription className="text-gray-600">
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
 Export Full Audit Log
 </>
 )}
 </Button>
 </div>

 <div className="mt-4">
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList>
 <TabsTrigger value="sign-offs" className="text-xs">
 <ShieldCheck className="h-3.5 w-3.5 mr-1" />
 Manager Sign-Offs
 {signOffCount > 0 && (
 <Badge className="ml-2 bg-stone-100 text-stone-800 text-xs">{signOffCount}</Badge>
 )}
 </TabsTrigger>
 <TabsTrigger value="document-history" className="text-xs">
 <FileCheck className="h-3.5 w-3.5 mr-1" />
 Document History
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
 <div className="rounded-md bg-stone-50 p-4 mb-4">
 <div className="flex">
 <div className="flex-shrink-0">
 <AlertTriangle className="h-5 w-5 text-stone-400" />
 </div>
 <div className="ml-3">
 <h3 className="text-sm font-medium text-stone-800">Document History</h3>
 <div className="mt-2 text-sm text-stone-700">
 <p>
 A full revision history of all document changes and modifications would be
 displayed here in a production environment. This includes all edits to
 submission documents with timestamps and user details.
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* Placeholder for document history - would be populated in production */}
 <div className="text-center py-10 text-gray-500">
 <FileCheck className="h-12 w-12 mx-auto mb-3 text-gray-400" />
 <p className="text-lg font-medium text-gray-600">Document History</p>
 <p className="mt-1">A comprehensive change history would be displayed here.</p>
 <p className="text-sm mt-4">
 This would include all document revisions, edits, and reviews with complete
 traceability for FDA submissions.
 </p>
 </div>
 </TabsContent>
 </CardContent>
 </Card>
 );
};

export default AuditTrailPanel;
