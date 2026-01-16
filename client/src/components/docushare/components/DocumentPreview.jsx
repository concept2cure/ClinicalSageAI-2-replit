import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Eye, FileText, Calendar, User, Tag, Shield, ExternalLink } from 'lucide-react'

const DocumentPreview = ({ selectedDocument, onDocumentSelect, loading }) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    if (selectedDocument) {
      setMetadata(selectedDocument);
      // Generate preview URL if document supports it
      if (selectedDocument.type?.includes('pdf')) {
        setPreviewUrl(`/api/documents/${selectedDocument.id}/preview`);
      }
    }
  }, [selectedDocument]);

  if (!selectedDocument) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>Select a document to preview</p>
        </div>
      </div>
    );
  }

  const formatFileSize = bytes => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = dateString => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getConfidentialityColor = level => {
    const colors = {
      public: 'bg-green-100 text-green-800',
      internal: 'bg-blue-100 text-blue-800',
      confidential: 'bg-orange-100 text-orange-800',
      restricted: 'bg-red-100 text-red-800',
    };
    return colors[level] || colors.internal;
  };

  return (
    <div className="space-y-4">
      {/* Document Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5" />
                {metadata.title || metadata.filename}
              </CardTitle>
              {metadata.description && (
                <p className="text-sm text-gray-600">{metadata.description}</p>
              )}
            </div>
            <Badge className={getConfidentialityColor(metadata.confidentiality)}>
              <Shield className="h-3 w-3 mr-1" />
              {metadata.confidentiality || 'Internal'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>{formatDate(metadata.uploadedAt || metadata.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-gray-400" />
              <span>{metadata.uploadedBy || 'System'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-gray-400" />
              <span>{formatFileSize(metadata.size || 0)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Tag className="h-4 w-4 text-gray-400" />
              <span>{metadata.category || 'General'}</span>
            </div>
          </div>

          {metadata.tags && metadata.tags.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Tags:</p>
              <div className="flex flex-wrap gap-1">
                {metadata.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator className="my-4" />

          <div className="flex gap-2">
            <Button size="sm" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button size="sm" variant="outline" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              View Full
            </Button>
            <Button size="sm" variant="outline" className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Open in DocuShare
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Content */}
      {previewUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Document Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-gray-50">
              <iframe
                src={previewUrl}
                className="w-full h-96"
                title="Document Preview"
                onError={() => setPreviewUrl(null)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata Details */}
      <Card>
        <CardHeader>
          <CardTitle>Document Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Document ID:</span>
                <span className="ml-2 text-gray-600">{metadata.id}</span>
              </div>
              <div>
                <span className="font-medium">Version:</span>
                <span className="ml-2 text-gray-600">{metadata.version || '1.0'}</span>
              </div>
              <div>
                <span className="font-medium">Format:</span>
                <span className="ml-2 text-gray-600">{metadata.type || 'Unknown'}</span>
              </div>
              <div>
                <span className="font-medium">Module:</span>
                <span className="ml-2 text-gray-600">{metadata.moduleType || 'General'}</span>
              </div>
            </div>

            {metadata.checksum && (
              <div className="text-sm">
                <span className="font-medium">Checksum:</span>
                <span className="ml-2 text-gray-600 font-mono">{metadata.checksum}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentPreview;
