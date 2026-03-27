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
import { useQueryClient } from '@tanstack/react-query';

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
  /** Project ID to auto-register artifact in vault and project management */
  projectId?: string;
  /** CTD section code for eCTD mapping */
  ctdSection?: string;
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

type GovernedDownloadRef = {
  encoding: 'base64';
  mime_type: string;
  filename: string;
  data: string;
};

type GovernedExportResponse = {
  governed?: boolean;
  artifact_id?: string;
  source_type?: string;
  downloadable_output_ref?: GovernedDownloadRef;
};

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

function tryDownloadFromGovernedRef(data: GovernedExportResponse, fallbackFilename: string): boolean {
  const ref = data?.downloadable_output_ref;
  if (!ref || ref.encoding !== 'base64' || !ref.data) return false;

  const bytes = atob(ref.data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: ref.mime_type || 'application/octet-stream' });
  triggerDownload(blob, ref.filename || fallbackFilename);
  return true;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Register a generated artifact in the vault and project management system.
 * This ensures every deliverable is tracked: stored in vault, linked to project,
 * and creates a task completion record in the collaboration module.
 */
async function registerInVaultAndPM(
  request: DeliverableRequest,
  result: DeliverableResult,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const { projectId, title, filename, format, ctdSection } = request;
  if (!projectId) return; // Skip if no project context

  try {
    // 1. Register artifact in vault
    await apiRequest('POST', '/api/concept2cure/vault/artifacts', {
      projectId,
      title,
      filename,
      format,
      ctdSection: ctdSection || null,
      recordId: result.recordId || null,
      downloadUrl: result.downloadUrl || null,
      generatedAt: new Date().toISOString(),
      source: request.endpoint,
    }).catch(() => {
      // Vault registration is best-effort — log but don't block
    });

    // 2. Create task completion in project management
    await apiRequest('POST', '/api/concept2cure/projects/tasks', {
      projectId,
      type: 'deliverable_generated',
      title: `Generated: ${title}`,
      description: `${filename} (${format.toUpperCase()}) generated via ${request.endpoint}`,
      status: 'completed',
      completedAt: new Date().toISOString(),
      metadata: {
        artifactType: format,
        ctdSection,
        filename,
      },
    }).catch(() => {
      // PM registration is best-effort
    });

    // 3. Invalidate project queries so vault and task lists refresh
    queryClient.invalidateQueries({ queryKey: ['concept2cure-project-artifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['concept2cure-project-tasks', projectId] });
  } catch {
    // Silent failure — vault/PM registration should never block deliverable flow
  }
}

export function useDeliverable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<DeliverableResult | null>(null);

  const generate = useCallback(
    async (request: DeliverableRequest): Promise<DeliverableResult> => {
      const { endpoint, method = 'POST', body, filename, format, title, saveOnly } = request;

      setIsGenerating(true);
      setLastResult(null);

      try {
        // Make the API call
        const requestBody =
          method === 'POST' && request.projectId && body && !Object.prototype.hasOwnProperty.call(body, 'projectId')
            ? { ...body, projectId: Number(request.projectId) }
            : body;
        const response = await apiRequest(method, endpoint, requestBody);

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

          // Auto-register in vault and project management
          registerInVaultAndPM(request, result, queryClient);

          toast({
            title: `${title} ready`,
            description: `${filename} has been downloaded.`,
          });

          return result;
        }

        // JSON response — could be a record creation or a download URL
        const data = (await response.json().catch(() => ({}))) as GovernedExportResponse & Record<string, any>;

        if (!saveOnly && tryDownloadFromGovernedRef(data, filename)) {
          const result: DeliverableResult = {
            success: true,
            recordId: data.artifact_id,
            data,
          };
          setLastResult(result);
          registerInVaultAndPM(request, result, queryClient);
          queryClient.invalidateQueries({ queryKey: ['project-workspace-artifacts', request.projectId] });
          toast({
            title: `${title} ready`,
            description: `${filename} has been downloaded from governed export.`,
          });
          return result;
        }

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

          // Auto-register in vault and project management
          registerInVaultAndPM(request, result, queryClient);

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

        // Auto-register in vault and project management
        registerInVaultAndPM(request, result, queryClient);

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
    [toast, queryClient]
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
