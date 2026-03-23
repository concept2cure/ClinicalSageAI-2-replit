import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';

export default function CSRIngest() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = e => {
    setFiles(Array.from(e.target.files));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);

    // Create a FormData object to send files
    const formData = new FormData();
    files.forEach((file, index) => {
      formData.append(`csr-${index}`, file);
    });

    try {
      // In a real implementation, this would make an API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast({ title: `${files.length} CSR(s) successfully uploaded and being processed` });
      setFiles([]);
    } catch (error) {
      console.error('Upload failed:', error);
      toast({ title: 'Upload failed. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSR Ingestion</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 p-6 rounded-md text-center">
            <input
              type="file"
              multiple
              accept=".pdf,.docx"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer text-blue-600 hover:text-blue-800"
            >
              Drag PDFs here or click to select files
            </label>

            {files.length > 0 && (
              <div className="mt-4 text-sm text-gray-600">{files.length} file(s) selected</div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
              {uploading ? 'Processing...' : 'Upload & Process CSRs'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
