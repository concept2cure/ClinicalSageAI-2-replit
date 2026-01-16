// DocumentEmbeddingInfo.jsx - Component for displaying detailed document embedding information
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, File, FileText, FileCode, Database, Layers, Clock, RotateCw, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DocumentEmbeddingInfo = ({ document, isExpanded, onToggleExpand }) => {
  const [activeTab, setActiveTab] = useState('info');

  // File icon based on document type or extension
  const getFileIcon = () => {
    const ext = document.filename ? document.filename.split('.').pop().toLowerCase() : '';

    switch (ext) {
      case 'pdf':
        return <FileText className="h-5 w-5 text-blue-500" />;
      case 'json':
      case 'xml':
        return <FileCode className="h-5 w-5 text-green-500" />;
      default:
        return <File className="h-5 w-5 text-slate-500" />;
    }
  };

  // Status badge color and text
  const getStatusBadge = () => {
    switch (document.status) {
      case 'embedded':
        return (
          <Badge className="ml-2" variant="outline">
            <span className="h-2 w-2 rounded-full bg-emerald-500 mr-1"></span>
            Embedded
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="ml-2" variant="outline">
            <span className="h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
            Pending
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="ml-2" variant="outline">
            <span className="h-2 w-2 rounded-full bg-blue-500 mr-1"></span>
            Processing
          </Badge>
        );
      case 'error':
        return (
          <Badge className="ml-2 bg-red-100 text-red-800 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge className="ml-2" variant="outline">
            <span className="h-2 w-2 rounded-full bg-slate-500 mr-1"></span>
            {document.status || 'Unknown'}
          </Badge>
        );
    }
  };

  return (
    <Card
      className={`border ${isExpanded ? 'border-slate-300 dark:border-slate-600' : 'border-slate-200 dark:border-slate-700'}`}
    >
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center">
          {getFileIcon()}
          <div className="ml-3">
            <div className="font-medium">{document.title || document.filename || 'Document'}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {document.filename && <span className="mr-3">{document.filename}</span>}
              {document.chunks > 0 && <span className="mr-3">{document.chunks} chunks</span>}
              {document.updated && (
                <span>Updated: {new Date(document.updated).toLocaleString()}</span>
              )}
            </div>
          </div>
          {getStatusBadge()}
        </div>
        <div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <CardContent className="pb-4 pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="chunks">Chunks</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Document Details</div>
                  <div className="text-xs text-slate-500">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>ID:</span>
                      <span className="font-mono">{document.id || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Type:</span>
                      <span>{document.docType || 'Document'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>File Size:</span>
                      <span>
                        {document.fileSize
                          ? `${(document.fileSize / 1024 / 1024).toFixed(2)} MB`
                          : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Pages:</span>
                      <span>{document.pages || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Created:</span>
                      <span>
                        {document.created ? new Date(document.created).toLocaleString() : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Updated:</span>
                      <span>
                        {document.updated ? new Date(document.updated).toLocaleString() : 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Embedding Details</div>
                  <div className="text-xs text-slate-500">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Status:</span>
                      <span>{document.status || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Chunks:</span>
                      <span>{document.chunks || 0}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Model:</span>
                      <span>{document.embeddingModel || 'text-embedding-ada-002'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Processed:</span>
                      <span>
                        {document.processedAt
                          ? new Date(document.processedAt).toLocaleString()
                          : 'Not processed'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Vector Dimensions:</span>
                      <span>{document.dimensions || 1536}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Processing Time:</span>
                      <span>
                        {document.processingTime ? `${document.processingTime.toFixed(2)}s` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {document.description && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-md p-3 text-sm mt-4">
                  {document.description}
                </div>
              )}
            </TabsContent>

            <TabsContent value="chunks" className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium">Document Chunks</span>
                <Badge variant="outline" className="ml-auto">
                  {document.chunks || 0} chunks
                </Badge>
              </div>

              {document.chunks > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {/* This would be populated with actual chunk data if available */}
                  {Array.from({ length: Math.min(document.chunks, 5) }, (_, i) => (
                    <div
                      key={i}
                      className="bg-slate-50 dark:bg-slate-800 p-3 rounded-md text-xs border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-medium">Chunk {i + 1}</span>
                        <span className="text-slate-500">
                          {document.pages ? `Page ${Math.min(i + 1, document.pages)}` : ''}
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-400">
                        {document.title
                          ? `Content from ${document.title}...`
                          : 'Document chunk content would appear here...'}
                      </div>
                    </div>
                  ))}

                  {document.chunks > 5 && (
                    <div className="text-center text-xs text-slate-500 mt-2">
                      {document.chunks - 5} more chunks not shown
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Layers className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">No chunks available for this document.</p>
                  {document.status === 'pending' && (
                    <p className="text-xs mt-1">Document is pending processing.</p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium">Processing History</span>
              </div>

              {document.history && document.history.length > 0 ? (
                <div className="space-y-3">
                  {document.history.map((event, idx) => (
                    <div key={idx} className="flex items-start text-xs">
                      <div className="mt-0.5 mr-2">
                        {event.type === 'processing' ? (
                          <RotateCw className="h-3.5 w-3.5 text-blue-500" />
                        ) : event.type === 'error' ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{event.message || 'Event'}</div>
                        <div className="text-slate-500 mt-0.5">
                          {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Clock className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">No processing history available.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={document.status === 'processing'}
              onClick={e => {
                e.stopPropagation();
                // This would trigger a re-processing action
                alert(`Reprocess document: ${document.title || document.filename}`);
              }}
            >
              <RotateCw className="h-3.5 w-3.5 mr-1" />
              Reprocess
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default DocumentEmbeddingInfo;
