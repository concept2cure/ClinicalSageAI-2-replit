import React, { useState, useCallback } from 'react';
import { useDropzone } from '../lightweight-wrappers.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  FileType,
  FilePlus,
  AlertCircle,
  CheckCircle,
  FileText,
  Database,
} from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

export default function CSRIngest() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState('csr');
  const [sponsor, setSponsor] = useState('');
  const [indication, setIndication] = useState('');
  const { toast } = useToast();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // Filter for PDF files
      const pdfFiles = acceptedFiles.filter(
        file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      );

      if (pdfFiles.length !== acceptedFiles.length) {
        toast({
          title: 'Invalid file format',
          description: 'Only PDF files are accepted for CSR documents.',
          variant: 'destructive',
        });
      }

      setFiles(prev => [...prev, ...pdfFiles]);
    },
    [toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB max file size
  });

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (files.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select at least one file to upload.',
        variant: 'destructive',
      });
      return;
    }

    if (!sponsor.trim()) {
      toast({
        title: 'Sponsor required',
        description: 'Please enter the sponsor name for the documents.',
        variant: 'destructive',
      });
      return;
    }

    if (!indication.trim()) {
      toast({
        title: 'Indication required',
        description: 'Please enter the indication for the documents.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      if (sponsor) formData.append('sponsor', sponsor);
      if (indication) formData.append('indication', indication);

      const response = await fetch('/api/csr/ingest', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      setUploadProgress(100);
      setFiles([]);
      setSponsor('');
      setIndication('');
      toast({
        title: 'Upload successful',
        description: `${files.length} document${files.length > 1 ? 's' : ''} uploaded for processing.`,
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: 'The CSR ingestion service is unavailable. Try again shortly.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Upload className="mr-2 h-5 w-5" />
          CSR Document Ingestion
        </CardTitle>
        <CardDescription>Upload and process clinical study reports for AI analysis</CardDescription>
      </CardHeader>

      <CardContent className="flex-grow flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label htmlFor="documentType">Document Type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger id="documentType">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csr">Clinical Study Report (CSR)</SelectItem>
                <SelectItem value="protocol">Protocol</SelectItem>
                <SelectItem value="sap">Statistical Analysis Plan</SelectItem>
                <SelectItem value="eot">End of Text Tables</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="sponsor">Sponsor</Label>
            <Input
              id="sponsor"
              placeholder="Enter sponsor name"
              value={sponsor}
              onChange={e => setSponsor(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="indication">Therapeutic Area / Indication</Label>
            <Input
              id="indication"
              placeholder="Enter therapeutic area or indication"
              value={indication}
              onChange={e => setIndication(e.target.value)}
            />
          </div>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4 flex-grow flex flex-col justify-center items-center ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          <input {...getInputProps()} />
          <FileType className="h-12 w-12 text-gray-400 mb-2" />
          <p className="text-lg font-medium">Drag and drop PDF files here</p>
          <p className="text-sm text-gray-500 mb-2">Or click to browse files</p>
          <p className="text-xs text-gray-400">Maximum file size: 50MB</p>
        </div>

        {files.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2">Selected Files ({files.length})</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded"
                >
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-blue-500" />
                    <span className="truncate max-w-xs">{file.name}</span>
                    <span className="ml-2 text-gray-500 text-xs">
                      ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="h-6 w-6 p-0"
                  >
                    <span className="sr-only">Remove file</span>
                    <AlertCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isUploading ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Uploading and processing...</span>
              <span>{Math.round(uploadProgress)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <div className="flex justify-between mt-auto">
            <Button
              variant="outline"
              className="gap-1"
              onClick={() => setFiles([])}
              disabled={files.length === 0}
            >
              Clear All
            </Button>
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || !sponsor.trim() || !indication.trim()}
              className="gap-1"
            >
              <Database className="h-4 w-4" />
              <span>Process Documents</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
