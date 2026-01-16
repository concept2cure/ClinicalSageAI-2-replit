import React, { useState, useContext, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, Search, History, Shield } from 'lucide-react'
import { DocuShareContext } from '@/contexts/DocuShareContext';
import DocumentUpload from './components/DocumentUpload';
import DocumentPreview from './components/DocumentPreview';
import DocumentSearch from './components/DocumentSearch';
import VersionHistory from './components/VersionHistory';
import AuditTrail from './components/AuditTrail';

const UnifiedDocuSharePanel = ({
  onDocumentSelect,
  selectedDocument,
  moduleType = 'general',
  tenantId,
  showAuditTrail = true,
  showVersionHistory = true,
}) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);

  const {
    documents,
    uploadDocument,
    searchDocuments,
    getDocumentVersions,
    getAuditTrail,
    isLoading,
    error: contextError,
  } = useContext(DocuShareContext);

  useEffect(() => {
    if (contextError) {
      setError(contextError);
    }
  }, [contextError]);

  const handleDocumentUpload = async (file, metadata) => {
    try {
      setLoading(true);
      setError(null);

      const uploadedDoc = await uploadDocument(file, {
        ...metadata,
        moduleType,
        tenantId,
      });

      setUploadedDocuments(prev => [...prev, uploadedDoc]);

      // Switch to preview tab after successful upload
      if (uploadedDoc) {
        setActiveTab('preview');
        onDocumentSelect?.(uploadedDoc);
      }
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query, filters) => {
    try {
      setLoading(true);
      setError(null);

      const results = await searchDocuments(query, {
        ...filters,
        moduleType,
        tenantId,
      });

      setSearchResults(results);
      setActiveTab('search');
    } catch (err) {
      setError(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSelect = document => {
    onDocumentSelect?.(document);
    setActiveTab('preview');
  };

  const handleVersionSelect = async (documentId, version) => {
    try {
      setLoading(true);
      const versionData = await getDocumentVersions(documentId, version);
      onDocumentSelect?.(versionData);
    } catch (err) {
      setError(`Failed to load version: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const tabConfig = [
    {
      value: 'upload',
      label: 'Upload',
      icon: Upload,
      component: DocumentUpload,
    },
    {
      value: 'preview',
      label: 'Preview',
      icon: Search,
      component: DocumentPreview,
      disabled: !selectedDocument,
    },
    {
      value: 'search',
      label: 'Search',
      icon: Search,
      component: DocumentSearch,
    },
    ...(showVersionHistory
      ? [
          {
            value: 'versions',
            label: 'Versions',
            icon: History,
            component: VersionHistory,
            disabled: !selectedDocument,
          },
        ]
      : []),
    ...(showAuditTrail
      ? [
          {
            value: 'audit',
            label: 'Audit',
            icon: Shield,
            component: AuditTrail,
            disabled: !selectedDocument,
          },
        ]
      : []),
  ];

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
          DocuShare Integration
          {loading && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {error && (
          <Alert className="mx-4 mb-4 border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mx-4 mb-4">
            {tabConfig.map(({ value, label, icon: Icon, disabled }) => (
              <TabsTrigger
                key={value}
                value={value}
                disabled={disabled || loading}
                className="flex items-center gap-1"
              >
                <Icon className="h-3 w-3" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabConfig.map(({ value, component: Component }) => (
            <TabsContent key={value} value={value} className="px-4 pb-4">
              <Component
                selectedDocument={selectedDocument}
                searchResults={searchResults}
                uploadedDocuments={uploadedDocuments}
                onDocumentUpload={handleDocumentUpload}
                onDocumentSelect={handleDocumentSelect}
                onSearch={handleSearch}
                onVersionSelect={handleVersionSelect}
                moduleType={moduleType}
                tenantId={tenantId}
                loading={loading}
                error={error}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default UnifiedDocuSharePanel;
