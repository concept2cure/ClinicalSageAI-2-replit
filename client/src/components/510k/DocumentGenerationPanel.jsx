import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Download, 
  Lock, 
  Unlock, 
  RefreshCw, 
  CheckCircle,
  AlertCircle,
  Loader2,
  FileCheck,
  Send,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DocumentGenerationPanel = ({ projectId, projectData }) => {
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [mainDocument, setMainDocument] = useState(null);
  const [forms, setForms] = useState([]);
  const [generationStatus, setGenerationStatus] = useState(null);
  const { toast } = useToast();

  // Fetch existing documents for the project
  useEffect(() => {
    if (projectId) {
      fetchDocuments();
    }
  }, [projectId]);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`/api/510k/${projectId}/documents`, {
        headers: {
          'x-organization-id': localStorage.getItem('organizationId') || '1',
          'x-user-id': localStorage.getItem('userId') || '1'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.documents) {
          setDocuments(data.documents);
          
          // Separate main document from forms
          const main = data.documents.find(d => d.documentType === '510k-main');
          const fdaForms = data.documents.filter(d => d.documentType === 'fda-form');
          
          setMainDocument(main);
          setForms(fdaForms);
        }
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  // Generate all documents for the project
  const handleGenerateDocuments = async () => {
    setLoading(true);
    setGenerationStatus('generating');
    
    try {
      const response = await fetch(`/api/510k/${projectId}/generate-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('organizationId') || '1',
          'x-user-id': localStorage.getItem('userId') || '1'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Documents Generated Successfully",
          description: "All 510(k) documents and FDA forms have been generated.",
          variant: "success"
        });
        
        setGenerationStatus('success');
        await fetchDocuments();
      } else {
        throw new Error(data.error || 'Failed to generate documents');
      }
    } catch (error) {
      console.error('Error generating documents:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate documents. Please try again.",
        variant: "destructive"
      });
      setGenerationStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // Lock a document for regulatory compliance
  const handleLockDocument = async (documentId) => {
    try {
      const response = await fetch(`/api/510k/documents/${documentId}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('organizationId') || '1',
          'x-user-id': localStorage.getItem('userId') || '1'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Document Locked",
          description: "Document has been locked for regulatory compliance.",
          variant: "success"
        });
        await fetchDocuments();
      } else {
        throw new Error(data.error || 'Failed to lock document');
      }
    } catch (error) {
      console.error('Error locking document:', error);
      toast({
        title: "Lock Failed",
        description: error.message || "Failed to lock document.",
        variant: "destructive"
      });
    }
  };

  // Create a new version of a document
  const handleCreateVersion = async (documentId) => {
    try {
      const response = await fetch(`/api/510k/documents/${documentId}/version`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': localStorage.getItem('organizationId') || '1',
          'x-user-id': localStorage.getItem('userId') || '1'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "New Version Created",
          description: `Version ${data.document.version} has been created.`,
          variant: "success"
        });
        await fetchDocuments();
      } else {
        throw new Error(data.error || 'Failed to create version');
      }
    } catch (error) {
      console.error('Error creating version:', error);
      toast({
        title: "Version Creation Failed",
        description: error.message || "Failed to create new version.",
        variant: "destructive"
      });
    }
  };

  // Download a PDF form
  const handleDownloadPDF = async (documentId, formType) => {
    try {
      const response = await fetch(`/api/510k/documents/${documentId}/pdf/${formType}`, {
        headers: {
          'x-organization-id': localStorage.getItem('organizationId') || 'default',
          'x-user-id': localStorage.getItem('userId') || 'system'
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FDA-Form-${formType}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Download Started",
          description: `FDA Form ${formType} is downloading.`,
          variant: "success"
        });
      } else {
        throw new Error('Failed to download PDF');
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download PDF. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'secondary';
      case 'in_review': return 'warning';
      case 'locked': return 'info';
      case 'submitted': return 'success';
      default: return 'default';
    }
  };

  // Render document card
  const renderDocumentCard = (doc) => {
    const metadata = typeof doc.metadata === 'string' 
      ? JSON.parse(doc.metadata) 
      : doc.metadata;
    
    const formType = metadata?.formType;
    
    return (
      <Card key={doc.documentId} className="mb-4">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {doc.title}
              </CardTitle>
              <CardDescription className="mt-1">
                Document ID: {doc.documentId} • Version: {doc.version}
              </CardDescription>
            </div>
            <Badge variant={getStatusColor(doc.status)}>
              {doc.status === 'locked' && <Lock className="h-3 w-3 mr-1" />}
              {doc.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Document info */}
            <div className="text-sm text-muted-foreground">
              <p>Type: {doc.documentType}</p>
              <p>Created: {new Date(doc.createdAt).toLocaleDateString()}</p>
              {doc.lockedAt && (
                <p>Locked: {new Date(doc.lockedAt).toLocaleDateString()}</p>
              )}
              {doc.finalHash && (
                <p className="font-mono text-xs">
                  Hash: {doc.finalHash.substring(0, 16)}...
                </p>
              )}
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {/* PDF Download for forms */}
              {formType && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadPDF(doc.documentId, formType)}
                  data-testid={`download-pdf-${formType}`}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download PDF
                </Button>
              )}
              
              {/* Lock/Unlock */}
              {doc.status === 'draft' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleLockDocument(doc.documentId)}
                  data-testid={`lock-document-${doc.documentId}`}
                >
                  <Lock className="h-4 w-4 mr-1" />
                  Lock Document
                </Button>
              )}
              
              {/* Create Version */}
              {doc.status !== 'submitted' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCreateVersion(doc.documentId)}
                  data-testid={`create-version-${doc.documentId}`}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  New Version
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with generate button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Document Generation</h2>
          <p className="text-muted-foreground">
            Generate and manage 510(k) documents and FDA forms
          </p>
        </div>
        <Button
          onClick={handleGenerateDocuments}
          disabled={loading}
          size="lg"
          className="gap-2"
          data-testid="generate-documents"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileCheck className="h-5 w-5" />
              Generate All Documents
            </>
          )}
        </Button>
      </div>

      {/* Generation status */}
      {generationStatus && (
        <Alert className={generationStatus === 'success' ? 'border-green-500' : generationStatus === 'error' ? 'border-red-500' : ''}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {generationStatus === 'generating' && 'Generating documents from workflow data...'}
            {generationStatus === 'success' && 'All documents have been successfully generated!'}
            {generationStatus === 'error' && 'Document generation failed. Please check your workflow data and try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Documents tabs */}
      {(mainDocument || forms.length > 0) && (
        <Tabs defaultValue="main" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="main">Main Document</TabsTrigger>
            <TabsTrigger value="forms">FDA Forms ({forms.length})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="main" className="mt-4">
            {mainDocument ? (
              renderDocumentCard(mainDocument)
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No main document generated yet. Click "Generate All Documents" to create.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="forms" className="mt-4">
            {forms.length > 0 ? (
              <div className="space-y-4">
                {forms.map(form => renderDocumentCard(form))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    No FDA forms generated yet. Click "Generate All Documents" to create.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Empty state */}
      {!mainDocument && forms.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-medium">No Documents Yet</h3>
              <p className="text-sm text-muted-foreground">
                Generate your 510(k) documents and FDA forms from your workflow data.
              </p>
              <Button
                onClick={handleGenerateDocuments}
                className="mt-4"
                data-testid="generate-documents-empty"
              >
                <FileCheck className="h-4 w-4 mr-2" />
                Generate Documents Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DocumentGenerationPanel;