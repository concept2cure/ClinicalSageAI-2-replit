/**
 * EvidenceLibrary - Clean, workflow-focused evidence upload and management
 * 
 * Simplified design:
 * - Prominent upload area with drag-and-drop
 * - Clean searchable file list
 * - Simple file details in side panel
 * - Removed: folders, bulk actions, complex state
 */

import React, { useMemo, useRef, useState } from 'react';
import { Upload, Search, FileText, Trash2, Download, X } from 'lucide-react';
import { useEvidence, useEvidenceDelete, useEvidenceUpload } from '../../hooks/useCERv2Queries';
import { evidenceApi } from '../../lib/cerv2WorkbenchContract';

const formatSize = (bytes) => {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

export default function EvidenceLibrary({ programId }) {
  const fileInputRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const filters = useMemo(() => ({ search: debouncedSearch || undefined }), [debouncedSearch]);
  const { data, isLoading, error: listError } = useEvidence(programId, { filters });
  const uploadEvidence = useEvidenceUpload(programId);
  const deleteEvidence = useEvidenceDelete(programId);

  React.useEffect(() => {
    setDocs(data?.data || []);
  }, [data]);

  React.useEffect(() => {
    if (listError) {
      setError(listError?.message || 'Failed to load evidence.');
    }
  }, [listError]);

  const handleFiles = async (files) => {
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        await uploadEvidence.mutateAsync(file);
      }
    } catch (err) {
      setError(err?.message || 'Failed to upload evidence.');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    await handleFiles(files);
  };

  const handleDelete = async () => {
    if (!selectedDoc) return;
    if (!window.confirm(`Delete ${selectedDoc.name}?`)) return;
    try {
      await deleteEvidence.mutateAsync(selectedDoc.evidenceId);
      setSelectedDoc(null);
    } catch (err) {
      setError(err?.message || 'Failed to delete evidence.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        className={`bg-white rounded-xl shadow-sm border-2 border-dashed p-8 text-center transition-all ${
          isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <Upload className={`h-12 w-12 mx-auto mb-4 ${
          isDragging ? 'text-blue-600' : 'text-slate-400'
        }`} />
        <div className="text-lg font-semibold text-slate-900 mb-2">
          {uploading ? 'Uploading...' : 'Drop files here to upload'}
        </div>
        <div className="text-sm text-slate-500 mb-4">
          Or click the button below to browse your files
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          Select Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files || []))}
        />
      </div>

      {/* Search & List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {/* Header */}
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Evidence Files</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {docs.length} {docs.length === 1 ? 'file' : 'files'} uploaded
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* File List */}
        <div className="p-4">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">
              <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full mx-auto mb-3"></div>
              Loading evidence...
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <div className="text-slate-600 font-medium mb-1">No evidence files yet</div>
              <div className="text-sm text-slate-500">Upload your first file to get started</div>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.evidenceId}
                  className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedDoc?.evidenceId === doc.evidenceId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedDoc(doc)}
                >
                  <FileText className="h-8 w-8 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {doc.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {formatSize(doc.sizeBytes)}
                      {doc.hash && (
                        <>
                          <span className="mx-2">·</span>
                          <code className="font-mono">{doc.hash.substring(0, 8)}...</code>
                        </>
                      )}
                    </div>
                  </div>
                  <a
                    href={evidenceApi.getDownloadUrl(programId, doc.evidenceId)}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel - Fixed Position */}
      {selectedDoc && (
        <div className="fixed right-6 top-24 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">
                {selectedDoc.name}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {formatSize(selectedDoc.sizeBytes)}
              </div>
            </div>
            <button
              onClick={() => setSelectedDoc(null)}
              className="p-1 hover:bg-slate-100 rounded"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>
          
          <div className="space-y-3 mb-4">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                File Path
              </div>
              <div className="text-sm text-slate-700 break-all">
                {selectedDoc.folderPath || 'evidence'}
              </div>
            </div>
            
            {selectedDoc.hash && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  SHA-256
                </div>
                <div className="text-xs font-mono text-slate-700 break-all bg-slate-50 p-2 rounded">
                  {selectedDoc.hash}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <a
              href={evidenceApi.getDownloadUrl(programId, selectedDoc.evidenceId)}
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors text-center"
            >
              Download
            </a>
            <button
              onClick={handleDelete}
              className="px-3 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
