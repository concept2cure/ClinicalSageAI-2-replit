import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function CSRExtractorDashboard() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [, setLocation] = useLocation();

  const handleUpload = async () => {
    if (!file) return;
    setStatus('Uploading...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/csr/upload-enhanced', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setResult(data);
      setStatus('✅ Parsed and mapped.');
    } catch (err) {
      setStatus('❌ Upload failed.');
    }
  };

  const handleUseInPlanning = () => {
    if (!result?.csr_id) return;
    setLocation(`/planning?csr_id=${result.csr_id}`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-xl font-semibold text-blue-700">Upload CSR Document</h2>
          <p className="text-sm text-muted-foreground">
            Upload a Clinical Study Report (PDF). We'll parse it into structured data using
            semantic, pharmacologic, and statistical mapping.
          </p>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={e => setFile(e.target.files[0])}
              className="mb-4"
            />
            <div>
              <Button onClick={handleUpload} className="w-full sm:w-auto">
                Upload and Process
              </Button>
            </div>
          </div>
          {status && (
            <div
              className={`p-3 rounded-md text-sm ${
                status.includes('✅')
                  ? 'bg-green-50 text-green-700'
                  : status.includes('❌')
                    ? 'bg-red-50 text-red-700'
                    : 'bg-blue-50 text-blue-700'
              }`}
            >
              {status}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold text-blue-700 mb-3">Processed Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <h3 className="font-medium text-slate-700">CSR ID</h3>
                <p className="text-sm">{result.csr_id}</p>
              </div>
              <div>
                <h3 className="font-medium text-slate-700">Status</h3>
                <p className="text-sm">{result.status}</p>
              </div>
              <div>
                <h3 className="font-medium text-slate-700">Original Filename</h3>
                <p className="text-sm">{result.fileInfo?.originalName}</p>
              </div>
              <div>
                <h3 className="font-medium text-slate-700">File Size</h3>
                <p className="text-sm">{result.fileInfo?.size} bytes</p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-medium text-slate-700 mb-2">Response Details</h3>
              <pre className="bg-slate-50 text-xs p-3 rounded overflow-x-auto h-60 whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              {result.json_path && (
                <Button variant="outline" asChild>
                  <a href={result.json_path} target="_blank" rel="noopener noreferrer">
                    Download Processed JSON
                  </a>
                </Button>
              )}
              <Button onClick={handleUseInPlanning}>Use in Protocol Planning</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
