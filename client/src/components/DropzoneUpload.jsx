import { useCallback, useState } from 'react';
import { useDropzone } from '../lightweight-wrappers.js';
import { uploadDoc } from '../hooks/useDocuShare';
import { useDocAI } from '../hooks/useDocAI';
import { toast } from '../lightweight-wrappers.js';

export default function DropzoneUpload({ onComplete, showAiSummary = false }) {
  const [processingResults, setProcessingResults] = useState(null);
  const { processAndUpload } = useDocAI();

  const onDrop = useCallback(
    async files => {
      const results = [];

      for (const f of files) {
        try {
          // Use new AI-powered document processing if enabled
          if (showAiSummary) {
            const result = await toast.promise(processAndUpload(f, 'drafts'), {
              loading: `Analyzing ${f.name} with AI…`,
              success: `${f.name} analyzed and uploaded!`,
              error: err => `AI analysis failed: ${err.message}`,
            });
            results.push(result);
            console.log('AI document processing result:', result);
          } else {
            // Use standard upload
            await toast.promise(uploadDoc(f), {
              loading: `Uploading ${f.name}…`,
              success: `${f.name} uploaded!`,
              error: `${f.name} failed ⚠️`,
            });
          }
        } catch (error) {
          console.error(`Error processing ${f.name}:`, error);
        }
      }

      if (results.length > 0) {
        setProcessingResults(results);
      }

      onComplete?.();
    },
    [onComplete, showAiSummary, processAndUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': [] },
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${isDragActive ? 'bg-indigo-50' : 'bg-white'}`}
      >
        <input {...getInputProps()} />
        <p className="text-gray-600">Drag & drop PDFs here, or click to browse</p>
        {showAiSummary && (
          <p className="text-xs text-indigo-600 mt-2">Using AI-powered document analysis</p>
        )}
      </div>

      {processingResults && processingResults.length > 0 && (
        <div className="mt-4 space-y-4">
          <h3 className="text-sm font-medium">AI Document Analysis</h3>
          {processingResults.map((result, index) => (
            <div key={index} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <h4 className="font-medium">{result.name}</h4>
                {result.module && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                    {result.module}
                  </span>
                )}
              </div>

              {result.summary && (
                <div className="mt-2">
                  <h5 className="text-xs font-medium text-gray-500">Summary</h5>
                  <p className="text-sm mt-1">{result.summary}</p>
                </div>
              )}

              {result.keywords && result.keywords.length > 0 && (
                <div className="mt-3">
                  <h5 className="text-xs font-medium text-gray-500">Keywords</h5>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.keywords.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
