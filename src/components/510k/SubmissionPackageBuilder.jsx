import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Send,
  Eye,
  RefreshCw,
  Folder,
  File,
} from 'lucide-react';

export default function SubmissionPackageBuilder({
  deviceProfile,
  predicateDevice,
  equivalenceAnalysis,
  complianceCheck,
  onPackageComplete,
}) {
  const { toast } = useToast();
  const [packageData, setPackageData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [packageStatus, setPackageStatus] = useState('draft'); // draft, review, ready, submitted

  useEffect(() => {
    if (deviceProfile && !packageData) {
      initializePackage();
    }
  }, [deviceProfile]);

  const initializePackage = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/510k/submission-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceProfile,
          predicateDevice,
          equivalenceAnalysis,
          complianceCheck,
        }),
      });

      if (!response.ok) throw new Error('Failed to initialize package');

      const result = await response.json();
      setPackageData(result);
      setSelectedDocuments(result.documents.map(d => d.id));

      toast({
        title: 'Package Initialized',
        description: `${result.documents.length} documents prepared`,
      });
    } catch (error) {
      toast({
        title: 'Initialization Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateDocument = async (documentId) => {
    try {
      const response = await fetch(`/api/510k/generate-document/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceProfile,
          predicateDevice,
          equivalenceAnalysis,
          complianceCheck,
        }),
      });

      if (!response.ok) throw new Error('Document generation failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Update document status
      setPackageData(prev => ({
        ...prev,
        documents: prev.documents.map(doc =>
          doc.id === documentId ? { ...doc, status: 'generated', generatedAt: new Date().toISOString() } : doc
        ),
      }));

      toast({
        title: 'Document Generated',
        description: `${documentId} has been generated and downloaded`,
      });
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const downloadPackage = async () => {
    try {
      const response = await fetch('/api/510k/download-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: packageData.id,
          selectedDocuments,
        }),
      });

      if (!response.ok) throw new Error('Package download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `510k_submission_${deviceProfile.deviceName.replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Package Downloaded',
        description: 'Complete submission package downloaded successfully',
      });
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getDocumentIcon = (type) => {
    switch (type) {
      case 'cover-letter':
        return <FileText className="w-5 h-5 text-blue-500" />;
      case 'device-description':
        return <Package className="w-5 h-5 text-purple-500" />;
      case 'substantial-equivalence':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'labeling':
        return <FileText className="w-5 h-5 text-orange-500" />;
      case 'performance':
        return <FileText className="w-5 h-5 text-red-500" />;
      default:
        return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'generated':
        return <Badge className="bg-green-500">Generated</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Draft</Badge>;
    }
  };

  const calculateCompletionScore = () => {
    if (!packageData) return 0;
    const totalDocs = packageData.documents.length;
    const generatedDocs = packageData.documents.filter(d => d.status === 'generated').length;
    return Math.round((generatedDocs / totalDocs) * 100);
  };

  if (isGenerating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="w-12 h-12 text-blue-500 animate-pulse mb-4" />
          <h3 className="text-lg font-semibold mb-2">Preparing Submission Package</h3>
          <p className="text-sm text-gray-600">Analyzing requirements and generating document templates...</p>
        </CardContent>
      </Card>
    );
  }

  if (!packageData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Folder className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600">Complete previous steps to generate submission package</p>
        </CardContent>
      </Card>
    );
  }

  const completionScore = calculateCompletionScore();

  return (
    <div className="space-y-6">
      {/* Package Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>510(k) Submission Package</CardTitle>
              <CardDescription>
                {deviceProfile.deviceName} - {packageData.submissionType || 'Traditional 510(k)'}
              </CardDescription>
            </div>
            <Badge className={completionScore === 100 ? 'bg-green-500' : 'bg-yellow-500'}>
              {completionScore}% Complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={completionScore} className="h-3" />

            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 border rounded-lg">
                <FileText className="w-6 h-6 mx-auto mb-1 text-blue-500" />
                <div className="text-xl font-bold">{packageData.documents.length}</div>
                <div className="text-xs text-gray-600">Total Documents</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-500" />
                <div className="text-xl font-bold">
                  {packageData.documents.filter(d => d.status === 'generated').length}
                </div>
                <div className="text-xs text-gray-600">Generated</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <Clock className="w-6 h-6 mx-auto mb-1 text-yellow-500" />
                <div className="text-xl font-bold">
                  {packageData.documents.filter(d => d.status === 'pending').length}
                </div>
                <div className="text-xs text-gray-600">Pending</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <Package className="w-6 h-6 mx-auto mb-1 text-purple-500" />
                <div className="text-xl font-bold">{(packageData.estimatedSize / 1024 / 1024).toFixed(1)} MB</div>
                <div className="text-xs text-gray-600">Est. Size</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>Required Documents</CardTitle>
          <CardDescription>Select documents to include in submission package</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {packageData.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Checkbox
                    checked={selectedDocuments.includes(doc.id)}
                    onCheckedChange={(checked) => {
                      setSelectedDocuments(prev =>
                        checked ? [...prev, doc.id] : prev.filter(id => id !== doc.id)
                      );
                    }}
                  />
                  {getDocumentIcon(doc.type)}
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{doc.title}</div>
                    <div className="text-xs text-gray-600">{doc.description}</div>
                    {doc.regulation && (
                      <div className="text-xs text-blue-600 mt-1">{doc.regulation}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(doc.status)}
                  <div className="flex gap-2">
                    {doc.status === 'generated' && (
                      <Button variant="ghost" size="sm" onClick={() => generateDocument(doc.id)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateDocument(doc.id)}
                      disabled={!deviceProfile}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Warnings & Recommendations */}
      {packageData.warnings && packageData.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              {packageData.warnings.map((warning, idx) => (
                <div key={idx} className="text-sm">
                  • {warning}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={initializePackage}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Package
        </Button>
        <Button
          variant="outline"
          onClick={downloadPackage}
          disabled={completionScore < 50}
        >
          <Download className="w-4 h-4 mr-2" />
          Download Package
        </Button>
        <Button
          onClick={() => {
            setPackageStatus('ready');
            if (onPackageComplete) {
              onPackageComplete(packageData);
            }
            toast({
              title: 'Package Ready',
              description: 'Submission package is ready for review and submission',
            });
          }}
          disabled={completionScore < 100}
        >
          <Send className="w-4 h-4 mr-2" />
          Mark Ready for Submission
        </Button>
      </div>
    </div>
  );
}
