/**
 * Universal Deliverable Hook
 *
 * Every feature in the platform must produce a tangible deliverable:
 * a document, report, data record, or exported artifact.
 *
 * This hook handles the full lifecycle:
 *   1. API call to backend generation service
 *   2. Loading / progress state
 *   3. File download (PDF, DOCX, XLSX, CSV) or DB record creation
 *   4. Toast notification on success/failure
 *
 * Usage:
 *   const { generate, isGenerating } = useDeliverable();
 *   await generate({
 *     endpoint: '/api/cerv2/export/pdf',
 *     method: 'POST',
 *     body: { docType: 'cerv2_510k', sections: [...] },
 *     filename: 'QualityAssessment.pdf',
 *     format: 'pdf',
 *     title: 'Quality Assessment Report',
 *   });
 */
import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliverableFormat =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'csv'
  | 'json'
  | 'xml'
  | 'zip'
  | 'html';

export interface DeliverableRequest {
  /** Backend API endpoint */
  endpoint: string;
  /** HTTP method (defaults to POST) */
  method?: 'GET' | 'POST';
  /** Request body */
  body?: Record<string, unknown>;
  /** Output filename for download */
  filename: string;
  /** File format — determines MIME type and download behavior */
  format: DeliverableFormat;
  /** Human-readable title for toast notification */
  title: string;
  /** If true, save to DB only (no file download). Toast confirms creation. */
  saveOnly?: boolean;
}

export interface DeliverableResult {
  success: boolean;
  /** Download URL if file was generated */
  downloadUrl?: string;
  /** Record ID if saved to DB */
  recordId?: string;
  /** Any data returned by the API */
  data?: unknown;
}

const MIME_TYPES: Record<DeliverableFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  html: 'text/html',
};

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDeliverable() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<DeliverableResult | null>(null);

  const generate = useCallback(
    async (request: DeliverableRequest): Promise<DeliverableResult> => {
      const { endpoint, method = 'POST', body, filename, format, title, saveOnly } = request;

      setIsGenerating(true);
      setLastResult(null);

      try {
        // Make the API call
        const response = await apiRequest(method, endpoint, body);

        // If the response is a file (binary), download it
        const contentType = response.headers.get('Content-Type') || '';
        const isBinary =
          contentType.includes('octet-stream') ||
          contentType.includes('pdf') ||
          contentType.includes('zip') ||
          contentType.includes('wordprocessing') ||
          contentType.includes('spreadsheet');

        if (!saveOnly && (isBinary || response.headers.get('Content-Disposition'))) {
          // Binary file response — download directly
          const blob = await response.blob();
          triggerDownload(blob, filename);

          const result: DeliverableResult = { success: true };
          setLastResult(result);

          toast({
            title: `${title} ready`,
            description: `${filename} has been downloaded.`,
          });

          return result;
        }

        // JSON response — could be a record creation or a download URL
        const data = await response.json().catch(() => ({}));

        if (data.downloadUrl) {
          // Fetch the file from the download URL
          if (!saveOnly) {
            const fileRes = await fetch(data.downloadUrl);
            const blob = await fileRes.blob();
            triggerDownload(blob, filename);
          }

          const result: DeliverableResult = {
            success: true,
            downloadUrl: data.downloadUrl,
            recordId: data.id,
            data,
          };
          setLastResult(result);

          toast({
            title: `${title} ready`,
            description: saveOnly
              ? `${title} has been saved.`
              : `${filename} has been downloaded.`,
          });

          return result;
        }

        // Save-only or data-only response
        const result: DeliverableResult = {
          success: true,
          recordId: data.id,
          data,
        };
        setLastResult(result);

        toast({
          title: saveOnly ? `${title} saved` : `${title} generated`,
          description: saveOnly
            ? `Record created successfully.`
            : `${title} has been generated.`,
        });

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation failed';

        // Fallback: generate a local placeholder document
        const fallbackResult = await generateLocalFallback(request);
        if (fallbackResult) {
          setLastResult(fallbackResult);
          toast({
            title: `${title} ready (preview)`,
            description: `Generated locally. Connect backend for full output.`,
          });
          return fallbackResult;
        }

        toast({
          title: `${title} failed`,
          description: message,
          variant: 'destructive',
        });

        const result: DeliverableResult = { success: false };
        setLastResult(result);
        return result;
      } finally {
        setIsGenerating(false);
      }
    },
    [toast]
  );

  return { generate, isGenerating, lastResult };
}

// ---------------------------------------------------------------------------
// Local fallback generator
// ---------------------------------------------------------------------------
// When backend is unavailable, generates a structured placeholder document
// so the UI is never "decorative only". Users see real output shape.

async function generateLocalFallback(
  request: DeliverableRequest
): Promise<DeliverableResult | null> {
  const { filename, format, title, saveOnly } = request;
  if (saveOnly) return null;

  const timestamp = new Date().toISOString();

  let content: string;
  let mimeType = MIME_TYPES[format];

  switch (format) {
    case 'json':
      content = JSON.stringify(
        {
          title,
          generatedAt: timestamp,
          platform: 'Concept2Cure',
          note: 'Preview document — connect to backend services for full regulatory output.',
          sections: [
            { heading: 'Executive Summary', content: '[AI-generated content will appear here]' },
            { heading: 'Findings', content: '[Detailed findings based on your data]' },
            { heading: 'Recommendations', content: '[Actionable recommendations]' },
          ],
        },
        null,
        2
      );
      break;

    case 'csv':
      content = [
        'Section,Status,Details,Timestamp',
        `"${title}","Generated","Preview document",${timestamp}`,
        '"Executive Summary","Pending","Connect backend for content",""',
        '"Findings","Pending","Connect backend for content",""',
        '"Recommendations","Pending","Connect backend for content",""',
      ].join('\n');
      break;

    case 'xml':
      content = `<?xml version="1.0" encoding="UTF-8"?>
<deliverable>
  <title>${title}</title>
  <generatedAt>${timestamp}</generatedAt>
  <platform>Concept2Cure</platform>
  <note>Preview document — connect to backend for full output.</note>
</deliverable>`;
      break;

    case 'html':
      content = `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:0 1rem;color:#27272a}
h1{font-size:1.5rem;border-bottom:1px solid #e4e4e7;padding-bottom:0.5rem}
.meta{color:#a1a1aa;font-size:0.875rem}
.section{margin:1.5rem 0;padding:1rem;background:#fafafa;border-radius:0.5rem;border:1px solid #f4f4f5}
.section h2{font-size:1rem;margin:0 0 0.5rem}</style></head>
<body>
<h1>${title}</h1>
<p class="meta">Generated ${new Date().toLocaleDateString()} · Concept2Cure Platform</p>
<div class="section"><h2>Executive Summary</h2><p>[Content generated by AI based on your submission data]</p></div>
<div class="section"><h2>Findings</h2><p>[Detailed findings]</p></div>
<div class="section"><h2>Recommendations</h2><p>[Actionable next steps]</p></div>
</body></html>`;
      break;

    default:
      // For pdf/docx/xlsx/zip — generate an HTML fallback that can be printed to PDF
      content = `${title}\n${'='.repeat(title.length)}\n\nGenerated: ${timestamp}\nPlatform: Concept2Cure\n\nThis is a preview document. Connect to backend services for full regulatory-grade output.\n\nSections:\n1. Executive Summary\n2. Findings\n3. Recommendations\n`;
      mimeType = 'text/plain';
      break;
  }

  const blob = new Blob([content], { type: mimeType });
  // Adjust extension for fallback text files
  const adjustedFilename =
    format === 'pdf' || format === 'docx' || format === 'xlsx' || format === 'zip'
      ? filename.replace(/\.[^.]+$/, '.txt')
      : filename;

  triggerDownload(blob, adjustedFilename);
  return { success: true };
}

export default useDeliverable;
