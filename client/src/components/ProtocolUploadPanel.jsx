// /client/components/ProtocolUploadPanel.jsx (uses shared sessionId validator for reuse across app)
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

export function isValidSessionId(id) {
  return typeof id === 'string' && id.trim().length > 0;
}

export default function ProtocolUploadPanel({ sessionId }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    if (isValidSessionId(sessionId)) {
      formData.append('session_id', sessionId);
    } else {
      toast({ title: 'Session ID is missing or invalid. Please start or select a study session.' });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/analytics/upload-protocol', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setResult(data);
    } catch (err) {
      toast({ title: 'Upload failed. Please try again or check your session.' });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-lg font-semibold">Upload Draft Protocol</h3>
          <Input type="file" accept=".pdf,.docx,.txt" onChange={e => setFile(e.target.files[0])} />
          <Button onClick={handleUpload} disabled={!file || loading}>
            Upload & Analyze
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-2">
            <h4 className="text-base font-semibold">AI Summary</h4>
            <pre className="text-sm whitespace-pre-wrap">{result.summary}</pre>

            <h4 className="text-base font-semibold">Predicted Outcome</h4>
            <p className="text-sm text-blue-700">{result.prediction}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
