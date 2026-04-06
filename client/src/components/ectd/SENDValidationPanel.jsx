import { useState, useCallback } from 'react';
import { 
 AlertCircle, CheckCircle2, XCircle, Upload, 
 FileText, Download, Zap, AlertTriangle,
 ShieldCheck, FileSearch, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function SENDValidationPanel({ documentId, moduleType = 'module4' }) {
 const { toast } = useToast();
 const [isValidating, setIsValidating] = useState(false);
 const [validationResults, setValidationResults] = useState(null);
 const [trcResults, setTrcResults] = useState(null);
 const [selectedDatasets, setSelectedDatasets] = useState([]);
 const [defineXML, setDefineXML] = useState(null);
 const [activeTab, setActiveTab] = useState('send');

 // Sample SEND dataset for testing
 const sampleSENDDataset = {
 DM: {
 domain: 'DM',
 variables: ['STUDYID', 'DOMAIN', 'USUBJID', 'SUBJID', 'RFSTDTC', 'RFENDTC', 'SPECIES', 'STRAIN', 'SEX'],
 data: [
 {
 STUDYID: 'TOX001',
 DOMAIN: 'DM',
 USUBJID: 'TOX001-001-001',
 SUBJID: '001',
 RFSTDTC: '2024-01-15',
 RFENDTC: '2024-03-15',
 SPECIES: 'RAT',
 STRAIN: 'Sprague-Dawley',
 SEX: 'M'
 }
 ]
 },
 EX: {
 domain: 'EX',
 variables: ['STUDYID', 'DOMAIN', 'USUBJID', 'EXSEQ', 'EXTRT', 'EXDOSE', 'EXDOSU', 'EXROUTE', 'EXSTDTC'],
 data: [
 {
 STUDYID: 'TOX001',
 DOMAIN: 'EX',
 USUBJID: 'TOX001-001-001',
 EXSEQ: 1,
 EXTRT: 'Test Article',
 EXDOSE: 100,
 EXDOSU: 'mg/kg',
 EXROUTE: 'ORAL GAVAGE',
 EXSTDTC: '2024-01-15'
 }
 ]
 },
 LB: {
 domain: 'LB',
 variables: ['STUDYID', 'DOMAIN', 'USUBJID', 'LBSEQ', 'LBTESTCD', 'LBTEST', 'LBORRES', 'LBORRESU'],
 data: []
 }
 };

 // Validate SEND dataset
 const validateSENDData = async () => {
 setIsValidating(true);
 try {
 const results = [];
 
 for (const [domain, dataset] of Object.entries(sampleSENDDataset)) {
 const response = await apiRequest('/api/validation/send', {
 method: 'POST',
 body: JSON.stringify({
 domain,
 variables: dataset.variables,
 data: dataset.data,
 metadata: {
 studyId: 'TOX001',
 studyName: '28-Day Toxicity Study in Rats',
 protocolName: 'Protocol TOX-001'
 }
 })
 });
 
 results.push({
 domain,
 ...response.validation
 });
 }
 
 setValidationResults(results);
 
 toast({
 title: 'SEND Validation Complete',
 description: `Validated ${results.length} domains`,
 variant: results.every(r => r.valid) ? 'default' : 'destructive'
 });
 } catch (error) {
 console.error('SEND validation error:', error);
 toast({
 title: 'Validation Failed',
 description: error.message,
 variant: 'destructive'
 });
 } finally {
 setIsValidating(false);
 }
 };

 // Run TRC validation
 const runTRCValidation = async () => {
 setIsValidating(true);
 try {
 const formData = new FormData();
 formData.append('datasets', JSON.stringify(sampleSENDDataset));
 formData.append('metadata', JSON.stringify({
 studyId: 'TOX001',
 submissionType: 'NDA',
 module: moduleType
 }));
 
 if (defineXML) {
 formData.append('defineXML', defineXML);
 }
 
 const response = await fetch('/api/validation/trc', {
 method: 'POST',
 headers: {
 'x-organization-id': localStorage.getItem('organizationId') || '6'
 },
 body: formData
 });
 
 const data = await response.json();
 setTrcResults(data);
 
 toast({
 title: 'TRC Validation Complete',
 description: `Overall score: ${data.summary?.overallScore || 0}%`,
 variant: data.summary?.canSubmit ? 'default' : 'destructive'
 });
 } catch (error) {
 console.error('TRC validation error:', error);
 toast({
 title: 'TRC Validation Failed',
 description: error.message,
 variant: 'destructive'
 });
 } finally {
 setIsValidating(false);
 }
 };

 // Generate Define.xml
 const generateDefineXML = async () => {
 try {
 const response = await apiRequest('/api/validation/generate-define', {
 method: 'POST',
 body: JSON.stringify({
 datasets: sampleSENDDataset,
 metadata: {
 studyId: 'TOX001',
 studyName: '28-Day Toxicity Study in Rats',
 studyDescription: 'A 28-day repeat dose toxicity study',
 protocolName: 'Protocol TOX-001'
 }
 })
 });
 
 setDefineXML(response.defineXML);
 
 // Download the generated Define.xml
 const blob = new Blob([response.defineXML], { type: 'text/xml' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = response.filename;
 a.click();
 URL.revokeObjectURL(url);
 
 toast({
 title: 'Define.xml Generated',
 description: 'File downloaded successfully'
 });
 } catch (error) {
 console.error('Define.xml generation error:', error);
 toast({
 title: 'Generation Failed',
 description: error.message,
 variant: 'destructive'
 });
 }
 };

 // Auto-fix issues
 const autoFixIssues = async (domain) => {
 try {
 const response = await apiRequest('/api/validation/auto-fix', {
 method: 'POST',
 body: JSON.stringify({
 dataset: sampleSENDDataset[domain],
 domain
 })
 });
 
 // Update the dataset with fixed version
 sampleSENDDataset[domain] = response.fixed;
 
 toast({
 title: 'Auto-Fix Applied',
 description: `${response.corrections.length} corrections made`,
 variant: 'success'
 });
 
 // Re-run validation
 await validateSENDData();
 } catch (error) {
 console.error('Auto-fix error:', error);
 toast({
 title: 'Auto-Fix Failed',
 description: error.message,
 variant: 'destructive'
 });
 }
 };

 // Render validation status badge
 const getStatusBadge = (status) => {
 if (status === 'success' || status === true) {
 return <Badge variant="success" className="bg-green-100 text-green-800">Passed</Badge>;
 } else if (status === 'warning') {
 return <Badge variant="warning" className="bg-yellow-100 text-yellow-800">Warning</Badge>;
 } else {
 return <Badge variant="destructive" className="bg-red-100 text-red-800">Failed</Badge>;
 }
 };

 // Render severity icon
 const getSeverityIcon = (severity) => {
 switch (severity) {
 case 'ERROR':
 return <XCircle className="h-4 w-4 text-red-500" />;
 case 'WARNING':
 return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
 default:
 return <CheckCircle2 className="h-4 w-4 text-green-500" />;
 }
 };

 return (
 <div className="space-y-6" data-testid="send-validation-panel">
 {/* Header */}
 <div className="flex justify-between items-center">
 <div>
 <h2 className="text-2xl font-semibold">CDISC SEND Validation & TRC Checks</h2>
 <p className="text-sm text-gray-500 mt-1">
 Validate nonclinical data against FDA technical requirements
 </p>
 </div>
 <div className="flex gap-2">
 <Button
 onClick={generateDefineXML}
 variant="outline"
 size="sm"
 data-testid="button-generate-define"
 >
 <FileText className="h-4 w-4 mr-2" />
 Generate Define.xml
 </Button>
 </div>
 </div>

 {/* Main Validation Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
 <TabsList className="grid w-full grid-cols-3">
 <TabsTrigger value="send" data-testid="tab-send">
 SEND Validation
 </TabsTrigger>
 <TabsTrigger value="trc" data-testid="tab-trc">
 TRC Checks
 </TabsTrigger>
 <TabsTrigger value="summary" data-testid="tab-summary">
 Summary Report
 </TabsTrigger>
 </TabsList>

 {/* SEND Validation Tab */}
 <TabsContent value="send" className="space-y-4">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <ShieldCheck className="h-5 w-5" />
 SEND Dataset Validation
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {/* Validation Actions */}
 <div className="flex gap-2">
 <Button
 onClick={validateSENDData}
 disabled={isValidating}
 data-testid="button-validate-send"
 >
 <FileSearch className="h-4 w-4 mr-2" />
 {isValidating ? 'Validating...' : 'Validate SEND Data'}
 </Button>
 <Button
 variant="outline"
 disabled={!validationResults}
 data-testid="button-upload-dataset"
 >
 <Upload className="h-4 w-4 mr-2" />
 Upload Dataset
 </Button>
 </div>

 {/* Validation Results */}
 {validationResults && (
 <div className="space-y-3">
 {validationResults.map((result, idx) => (
 <Card key={idx} className="border-l-4" 
 style={{ borderLeftColor: result.valid ? '#788c5d' : '#ef4444' }}>
 <CardContent className="pt-4">
 <div className="flex justify-between items-start mb-3">
 <div className="flex items-center gap-2">
 <span className="font-semibold">{result.domain} Domain</span>
 {getStatusBadge(result.valid)}
 </div>
 {!result.valid && (
 <Button
 size="sm"
 variant="outline"
 onClick={() => autoFixIssues(result.domain)}
 data-testid={`button-autofix-${result.domain}`}
 >
 <Zap className="h-3 w-3 mr-1" />
 Auto-Fix
 </Button>
 )}
 </div>

 {/* Errors */}
 {result.errors?.length > 0 && (
 <div className="space-y-2">
 <p className="text-sm font-medium text-red-600">Errors:</p>
 {result.errors.map((error, i) => (
 <div key={i} className="flex items-start gap-2 text-sm">
 {getSeverityIcon(error.severity)}
 <span>{error.message}</span>
 </div>
 ))}
 </div>
 )}

 {/* Warnings */}
 {result.warnings?.length > 0 && (
 <div className="space-y-2 mt-3">
 <p className="text-sm font-medium text-yellow-600">Warnings:</p>
 {result.warnings.map((warning, i) => (
 <div key={i} className="flex items-start gap-2 text-sm">
 <AlertTriangle className="h-4 w-4 text-yellow-500" />
 <span>{warning.message}</span>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* TRC Checks Tab */}
 <TabsContent value="trc" className="space-y-4">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <AlertCircle className="h-5 w-5" />
 Technical Rejection Criteria Checks
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {/* TRC Actions */}
 <Button
 onClick={runTRCValidation}
 disabled={isValidating}
 data-testid="button-run-trc"
 >
 <Settings className="h-4 w-4 mr-2" />
 {isValidating ? 'Running Checks...' : 'Run TRC Validation'}
 </Button>

 {/* TRC Results */}
 {trcResults?.summary && (
 <div className="space-y-4">
 {/* Overall Score */}
 <Card>
 <CardContent className="pt-4">
 <div className="space-y-3">
 <div className="flex justify-between items-center">
 <span className="font-medium">Overall Compliance Score</span>
 <span className="text-2xl font-bold">
 {trcResults.summary.overallScore}%
 </span>
 </div>
 <Progress value={trcResults.summary.overallScore} className="h-3" />
 {trcResults.summary.canSubmit ? (
 <Alert className="bg-green-50 border-green-200">
 <CheckCircle2 className="h-4 w-4 text-green-600" />
 <AlertTitle>Ready for Submission</AlertTitle>
 <AlertDescription>
 Your submission meets FDA technical requirements
 </AlertDescription>
 </Alert>
 ) : (
 <Alert variant="destructive">
 <AlertCircle className="h-4 w-4" />
 <AlertTitle>Not Ready for Submission</AlertTitle>
 <AlertDescription>
 {trcResults.summary.errorCount} critical errors must be fixed
 </AlertDescription>
 </Alert>
 )}
 </div>
 </CardContent>
 </Card>

 {/* Category Scores */}
 <div className="grid grid-cols-2 gap-3">
 {trcResults.summary.categories?.map((category, idx) => (
 <Card key={idx}>
 <CardContent className="pt-4">
 <div className="flex justify-between items-center mb-2">
 <span className="text-sm font-medium">{category.name}</span>
 <span className="text-lg font-semibold">{category.score}%</span>
 </div>
 <Progress 
 value={category.score} 
 className="h-2"
 style={{
 '--progress-background': category.status === 'success' ? '#788c5d' :
 category.status === 'warning' ? '#f59e0b' : '#ef4444'
 }}
 />
 <div className="flex justify-between text-xs text-gray-500 mt-1">
 <span>{category.passed} passed</span>
 <span>{category.failed} failed</span>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>

 {/* Critical Errors */}
 {trcResults.results?.errors?.length > 0 && (
 <Card className="border-red-200">
 <CardHeader>
 <CardTitle className="text-red-600 text-sm">Critical Errors</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 {trcResults.results.errors.slice(0, 5).map((error, i) => (
 <div key={i} className="flex items-start gap-2 text-sm">
 <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
 <div>
 <span className="font-medium">[{error.rule?.id}]</span> {error.message}
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Summary Report Tab */}
 <TabsContent value="summary" className="space-y-4">
 <Card>
 <CardHeader>
 <CardTitle>Validation Summary Report</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {(validationResults || trcResults) ? (
 <>
 {/* Summary Stats */}
 <div className="grid grid-cols-3 gap-4">
 <Card>
 <CardContent className="pt-4">
 <div className="text-center">
 <p className="text-sm text-gray-500">SEND Domains</p>
 <p className="text-2xl font-bold">
 {validationResults?.filter(r => r.valid).length || 0} / {validationResults?.length || 0}
 </p>
 <p className="text-xs text-gray-400">Valid</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="pt-4">
 <div className="text-center">
 <p className="text-sm text-gray-500">TRC Score</p>
 <p className="text-2xl font-bold">
 {trcResults?.summary?.overallScore || 0}%
 </p>
 <p className="text-xs text-gray-400">Compliance</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="pt-4">
 <div className="text-center">
 <p className="text-sm text-gray-500">Status</p>
 <p className="text-2xl font-bold">
 {trcResults?.summary?.canSubmit ? '✓' : '✗'}
 </p>
 <p className="text-xs text-gray-400">
 {trcResults?.summary?.canSubmit ? 'Ready' : 'Not Ready'}
 </p>
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Export Actions */}
 <div className="flex gap-2 justify-end">
 <Button variant="outline" size="sm">
 <Download className="h-4 w-4 mr-2" />
 Export Report (PDF)
 </Button>
 <Button variant="outline" size="sm">
 <Download className="h-4 w-4 mr-2" />
 Export Report (Excel)
 </Button>
 </div>
 </>
 ) : (
 <Alert>
 <AlertCircle className="h-4 w-4" />
 <AlertTitle>No Validation Results</AlertTitle>
 <AlertDescription>
 Run SEND validation and TRC checks to generate a summary report
 </AlertDescription>
 </Alert>
 )}
 </div>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 );
}