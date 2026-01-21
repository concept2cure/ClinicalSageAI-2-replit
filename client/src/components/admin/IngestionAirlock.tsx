import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantContext } from '@/contexts/TenantContext';

interface IngestionAirlockProps {
  onIngested?: () => void;
}

export default function IngestionAirlock({ onIngested }: IngestionAirlockProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { getTenantHeaders } = useTenantContext();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    setStatus('idle');
    setMessage('');
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0] || null;
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus('error');
      setMessage('Please select a PDF file to ingest.');
      return;
    }

    if (file.type && file.type !== 'application/pdf') {
      setStatus('error');
      setMessage('Only PDF files are accepted.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const token =
      localStorage.getItem('accessToken') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('token');
    const tenantHeaders = getTenantHeaders();

    try {
      setStatus('uploading');
      setMessage('Uploading and parsing...');

      const response = await fetch('/api/ingest/upload', {
        method: 'POST',
        body: formData,
        headers: {
          ...tenantHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Ingestion failed');
      }

      setStatus('success');
      setMessage('Ingestion complete. Intelligence vault updated.');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onIngested?.();
    } catch (error: any) {
      setStatus('error');
      setMessage(error?.message || 'Upload failed');
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-indigo-600" />
          Ingestion Airlock
        </CardTitle>
        <CardDescription>
          Upload CSR PDFs for automated extraction and live analytics updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
            isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'
          }`}
          onDragOver={event => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-2">
            <FileText className="h-8 w-8 text-slate-400" />
            <div className="text-sm font-semibold text-slate-700">
              Drag and drop a PDF here
            </div>
            <div className="text-xs text-slate-500">PDF only • Max size depends on server limit</div>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => inputRef.current?.click()}
            >
              Browse files
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={event => handleFileSelect(event.target.files?.[0] || null)}
            />
          </div>
        </div>

        {file && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-medium text-slate-700">{file.name}</div>
            <div className="text-xs text-slate-500">{Math.ceil(file.size / 1024)} KB</div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleUpload} disabled={status === 'uploading'}>
            {status === 'uploading' ? 'Ingesting...' : 'Start Ingestion'}
          </Button>
          {status === 'success' && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              {message}
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle className="h-4 w-4" />
              {message}
            </div>
          )}
          {status === 'uploading' && (
            <div className="text-sm text-slate-500">{message}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
