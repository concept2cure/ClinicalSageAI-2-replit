/**
 * Concept2Cure - Document Uploader
 * 
 * Drag-and-drop document upload component with progress indication.
 * Claude.ai parity: Project Knowledge document upload.
 * 
 * @module concept2cure/components/knowledge/DocumentUploader
 * @version 1.0.0
 */

import React, { useCallback, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  File,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentUploaderProps {
  onUpload: (file: File) => Promise<unknown>;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  disabled?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const getFileIcon = (type: string) => {
  if (type.includes('pdf')) return FileText;
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) {
    return FileSpreadsheet;
  }
  if (type.includes('word') || type.includes('document')) return FileText;
  return File;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  onUpload,
  isUploading,
  uploadProgress,
  error,
  disabled = false,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  }, [disabled, isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isUploading) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setUploadSuccess(false);
      
      try {
        await onUpload(file);
        setUploadSuccess(true);
        setTimeout(() => {
          setSelectedFile(null);
          setUploadSuccess(false);
        }, 2000);
      } catch {
        // Error handled by parent
      }
    }
  }, [disabled, isUploading, onUpload]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setUploadSuccess(false);
      
      try {
        await onUpload(file);
        setUploadSuccess(true);
        setTimeout(() => {
          setSelectedFile(null);
          setUploadSuccess(false);
        }, 2000);
      } catch {
        // Error handled by parent
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onUpload]);

  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  const handleClearFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setUploadSuccess(false);
  }, []);

  const FileIcon = selectedFile ? getFileIcon(selectedFile.type) : Upload;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'relative border border-dashed rounded-lg p-6 transition-all cursor-pointer',
          'flex flex-col items-center justify-center gap-3',
          isDragging && 'border-stone-600 bg-blue-50',
          isUploading && 'border-blue-300 bg-blue-50 cursor-wait',
          uploadSuccess && 'border-green-500 bg-green-50',
          error && 'border-red-300 bg-red-50',
          disabled && 'opacity-50 cursor-not-allowed',
          !isDragging && !isUploading && !uploadSuccess && !error && 
            'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
        )}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.xls,.csv"
          onChange={handleFileSelect}
          disabled={disabled || isUploading}
        />

        {/* Icon */}
        <div
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-150',
            isDragging && 'bg-blue-100 text-blue-600',
            isUploading && 'bg-blue-100 text-blue-600',
            uploadSuccess && 'bg-green-100 text-green-600',
            error && 'bg-red-100 text-red-600',
            !isDragging && !isUploading && !uploadSuccess && !error && 'bg-stone-100 text-stone-500'
          )}
        >
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : uploadSuccess ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : error ? (
            <AlertCircle className="h-6 w-6" />
          ) : (
            <FileIcon className="h-6 w-6" />
          )}
        </div>

        {/* Text */}
        {selectedFile ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium truncate max-w-[200px]">{selectedFile.name}</span>
            <span className="text-stone-500">({formatFileSize(selectedFile.size)})</span>
            {!isUploading && !uploadSuccess && (
              <button
                onClick={handleClearFile}
                className="p-1 hover:bg-stone-200 rounded"
              >
                <X className="h-4 w-4 text-stone-500" />
              </button>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-medium text-stone-700">
              {isDragging ? 'Drop file here' : 'Drag & drop or click to upload'}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              PDF, DOCX, TXT, MD, XLSX, CSV (max 50MB)
            </p>
          </div>
        )}

        {/* Progress Bar */}
        {isUploading && (
          <div className="w-full max-w-xs">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-center text-stone-500 mt-1">
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}

        {/* Success Message */}
        {uploadSuccess && (
          <p className="text-sm text-green-600 font-medium">
            Document added to project knowledge
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default DocumentUploader;
