import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/**
 * DocumentPreview
 *
 * Read-only modal preview for documents. Fetches the server-rendered HTML
 * preview from /api/documents/:id/preview and displays it in a sandboxed
 * iframe.
 *
 * Props:
 *  - documentId: numeric ID of the document to preview
 *  - open: whether the dialog is visible
 *  - onOpenChange: callback to toggle dialog visibility
 *  - title: optional title to show in the dialog header
 */

interface DocumentPreviewProps {
  documentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; html: string; isPdf: boolean; pdfUrl: string }
  | { status: 'error'; message: string };

export default function DocumentPreview({
  documentId,
  open,
  onOpenChange,
  title,
}: DocumentPreviewProps) {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchPreview = useCallback(async () => {
    if (!documentId || documentId <= 0) return;

    setState({ status: 'loading' });

    try {
      const organizationId =
        localStorage.getItem('organizationId') ||
        localStorage.getItem('currentOrganizationId') ||
        '1';

      const authToken =
        localStorage.getItem('token') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('auth_token');

      const headers: Record<string, string> = {
        'x-organization-id': organizationId,
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(
        `/api/documents/${documentId}/preview?format=html`,
        {
          headers,
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error || `Request failed with status ${response.status}`
        );
      }

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('application/pdf')) {
        // PDF response – create a blob URL for inline viewing
        const blob = await response.blob();
        const pdfUrl = URL.createObjectURL(blob);
        setState({ status: 'loaded', html: '', isPdf: true, pdfUrl });
      } else {
        // HTML response
        const html = await response.text();
        setState({ status: 'loaded', html, isPdf: false, pdfUrl: '' });
      }
    } catch (err: any) {
      setState({
        status: 'error',
        message: err.message || 'Failed to load document preview',
      });
    }
  }, [documentId]);

  // Fetch when the dialog opens
  useEffect(() => {
    if (open && documentId > 0) {
      fetchPreview();
    }
    if (!open) {
      setState({ status: 'idle' });
    }
  }, [open, documentId, fetchPreview]);

  // Clean up PDF blob URLs
  useEffect(() => {
    return () => {
      if (state.status === 'loaded' && state.isPdf && state.pdfUrl) {
        URL.revokeObjectURL(state.pdfUrl);
      }
    };
  }, [state]);

  // Write HTML content into the sandboxed iframe once loaded
  useEffect(() => {
    if (
      state.status === 'loaded' &&
      !state.isPdf &&
      state.html &&
      iframeRef.current
    ) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(state.html);
        doc.close();
      }
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[90vw] h-[85vh] flex flex-col p-0 gap-0"
        style={{ maxHeight: '85vh' }}
      >
        <DialogHeader className="px-6 py-4 border-b border-gray-200 shrink-0">
          <DialogTitle className="text-base font-semibold truncate">
            {title || `Document #${documentId}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Read-only preview
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Loading */}
          {state.status === 'loading' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="inline-block w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-3" />
                <p className="text-sm">Loading preview...</p>
              </div>
            </div>
          )}

          {/* Error */}
          {state.status === 'error' && (
            <div className="flex items-center justify-center h-full px-8">
              <div className="text-center max-w-md">
                <div className="text-red-500 text-3xl mb-3">!</div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Preview unavailable
                </p>
                <p className="text-xs text-gray-500 mb-4">{state.message}</p>
                <button
                  onClick={fetchPreview}
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* PDF preview */}
          {state.status === 'loaded' && state.isPdf && (
            <iframe
              src={state.pdfUrl}
              className="w-full h-full border-0"
              title="PDF preview"
            />
          )}

          {/* HTML preview in sandboxed iframe */}
          {state.status === 'loaded' && !state.isPdf && (
            <iframe
              ref={iframeRef}
              sandbox="allow-same-origin"
              className="w-full h-full border-0 bg-white"
              title="Document preview"
            />
          )}

          {/* Idle / no document */}
          {state.status === 'idle' && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No document selected
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
