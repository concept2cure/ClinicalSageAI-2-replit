import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Upload, File, ListChecks, Info, CheckCircle2, XCircle, Clock, ArrowRight, UploadCloud, Trash2, AlertTriangle, Database, FileText, Layers, Bookmark } from 'lucide-react'

// Sample recent uploads
const recentUploads = [
  {
    id: 'up-001',
    name: 'CSR-2023-F245-Draft.pdf',
    size: '8.7 MB',
    status: 'processed',
    date: '2025-04-30',
    result: {
      csrId: 'CSR-2023-F245',
      title: 'Phase A1 Single Ascending Dose Study in Healthy Volunteers',
      sponsor: 'Novagen Therapeutics',
      indication: 'Safety Assessment',
      phase: 'Phase 1',
      confidence: 94,
    },
  },
  {
    id: 'up-002',
    name: 'Phase-2b-OncoMab-CSR-Final.pdf',
    size: '12.3 MB',
    status: 'processed',
    date: '2025-04-28',
    result: {
      csrId: 'CSR-2023-F247',
      title: 'Phase 2b Dose Optimization Study of OncoMab',
      sponsor: 'CellImmune, Inc.',
      indication: 'Solid Tumors',
      phase: 'Phase 2b',
      confidence: 97,
    },
  },
  {
    id: 'up-003',
    name: 'CardioPlus-Phase3-CSR.pdf',
    size: '15.1 MB',
    status: 'processing',
    date: '2025-04-29',
    progress: 72,
  },
  {
    id: 'up-004',
    name: 'NeuroTide-CSR-2023.pdf',
    size: '7.8 MB',
    status: 'failed',
    date: '2025-04-25',
    error:
      'Document format error. Please ensure the document is a valid PDF and follows CSR structure.',
  },
];

const phaseOptions = ['Phase 1', 'Phase 2', 'Phase 2a', 'Phase 2b', 'Phase 3', 'Phase 4'];

const indicationOptions = [
  'Oncology',
  'Cardiology',
  'Neurology',
  'Infectious Disease',
  'Immunology',
  'Metabolic Disorders',
  'Gastroenterology',
  'Respiratory',
  'Dermatology',
  'Urology',
  'Other',
];

const CSRUploader = () => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [metadata, setMetadata] = useState({
    title: '',
    sponsor: '',
    phase: '',
    indication: '',
    studyId: '',
    documentDate: '',
  });

  const handleFileChange = e => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
    }
  };

  const handleUpload = () => {
    if (!uploadedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        const newProgress = prev + 5;
        if (newProgress >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          return 100;
        }
        return newProgress;
      });
    }, 300);
  };

  const handleCancelUpload = () => {
    setUploadedFile(null);
    setIsUploading(false);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            CSR Upload & Processing
          </CardTitle>
          <CardDescription>
            Upload clinical study reports for automated extraction and analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!uploadedFile ? (
            <div className="border-2 border-dashed rounded-lg p-10 text-center">
              <div className="flex flex-col items-center">
                <UploadCloud className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium mb-2">Upload CSR File</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-md">
                  Drag and drop your Clinical Study Report PDF file here, or click to browse. Our
                  AI-powered system will extract, analyze, and index the content automatically.
                </p>
                <Input
                  type="file"
                  id="csr-file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  onClick={() => document.getElementById('csr-file').click()}
                  className="gap-1"
                >
                  <FileText className="h-4 w-4" />
                  Browse Files
                </Button>
                <div className="text-xs text-gray-400 mt-4">
                  Maximum file size: 100MB. Supported format: PDF
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-start gap-3">
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <File className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                      <div className="font-medium">{uploadedFile.name}</div>
                      <div className="text-sm text-gray-500">
                        {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCancelUpload}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-6">
                <h3 className="text-lg font-medium mb-4">Document Metadata</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Document Title</label>
                    <Input
                      placeholder="Enter CSR title"
                      value={metadata.title}
                      onChange={e => setMetadata({ ...metadata, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Sponsor</label>
                    <Input
                      placeholder="Enter sponsor name"
                      value={metadata.sponsor}
                      onChange={e => setMetadata({ ...metadata, sponsor: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Study Phase</label>
                    <Select
                      value={metadata.phase}
                      onValueChange={value => setMetadata({ ...metadata, phase: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select phase" />
                      </SelectTrigger>
                      <SelectContent>
                        {phaseOptions.map(phase => (
                          <SelectItem key={phase} value={phase}>
                            {phase}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Indication</label>
                    <Select
                      value={metadata.indication}
                      onValueChange={value => setMetadata({ ...metadata, indication: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select indication" />
                      </SelectTrigger>
                      <SelectContent>
                        {indicationOptions.map(indication => (
                          <SelectItem key={indication} value={indication}>
                            {indication}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Study ID / Protocol Number
                    </label>
                    <Input
                      placeholder="Enter study ID"
                      value={metadata.studyId}
                      onChange={e => setMetadata({ ...metadata, studyId: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Document Date</label>
                    <Input
                      type="date"
                      value={metadata.documentDate}
                      onChange={e => setMetadata({ ...metadata, documentDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="border-t pt-4 flex justify-between">
                  <p className="text-sm text-gray-500 flex items-center">
                    <Info className="h-4 w-4 mr-1 text-gray-400" />
                    Metadata will be auto-extracted but can be manually edited
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancelUpload}>
                      Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={isUploading}>
                      {isUploading ? 'Uploading...' : 'Upload & Process'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-6">
            <h3 className="text-lg font-medium mb-4">Recent Uploads</h3>
            <div className="space-y-3">
              {recentUploads.map(upload => (
                <div key={upload.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-gray-100 rounded-md">
                        <FileText className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <div className="font-medium">{upload.name}</div>
                        <div className="text-sm text-gray-500">
                          {upload.size} · {upload.date}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={
                        upload.status === 'processed'
                          ? 'success'
                          : upload.status === 'processing'
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {upload.status === 'processed' && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Processed
                        </span>
                      )}
                      {upload.status === 'processing' && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Processing
                        </span>
                      )}
                      {upload.status === 'failed' && (
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </Badge>
                  </div>

                  {upload.status === 'processed' && upload.result && (
                    <div className="bg-gray-50 p-3 rounded-md text-sm">
                      <div className="flex justify-between mb-2">
                        <div className="font-medium">{upload.result.csrId}</div>
                        <div className="text-gray-500">Confidence: {upload.result.confidence}%</div>
                      </div>
                      <div className="text-gray-700 mb-2">{upload.result.title}</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{upload.result.phase}</Badge>
                        <Badge variant="secondary">{upload.result.indication}</Badge>
                        <div className="text-xs text-gray-500 flex items-center">
                          <Database className="h-3 w-3 mr-1" />
                          {upload.result.sponsor}
                        </div>
                      </div>
                      <div className="flex justify-end mt-3">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                          <Layers className="h-3 w-3" />
                          View Analysis
                        </Button>
                      </div>
                    </div>
                  )}

                  {upload.status === 'processing' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Processing document...</span>
                        <span>{upload.progress}%</span>
                      </div>
                      <Progress value={upload.progress} className="h-1.5" />
                    </div>
                  )}

                  {upload.status === 'failed' && (
                    <div className="bg-red-50 p-3 rounded-md text-sm flex gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span className="text-red-700">{upload.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6 flex justify-between">
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <Info className="h-4 w-4 text-gray-400 mt-0.5" />
            <div>
              <p>CSRs will be automatically processed with our AI-powered extraction system.</p>
              <p>
                Processing typically takes 2-5 minutes depending on document size and complexity.
              </p>
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default CSRUploader;
