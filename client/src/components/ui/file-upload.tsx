import React, { useState, useRef } from 'react';
import { Button } from './button';
import { Upload, X, FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * File Upload Component
 *
 * A flexible file upload component that supports drag and drop.
 *
 * @param {Object} props
 * @param {Function} props.onChange - Callback when file selection changes
 * @param {string} props.accept - MIME types to accept
 * @param {number} props.maxSize - Maximum file size in bytes
 * @param {boolean} props.disabled - Whether the component is disabled
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - Additional CSS classes
 */
interface FileUploadProps {
  onChange: (file: File | null) => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  value?: File;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onChange,
  accept = '*/*',
  maxSize = 10 * 1024 * 1024, // 10MB default
  disabled = false,
  placeholder = 'Drag and drop a file, or click to browse',
  className,
  ...props
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    setError(null);

    // Check file size
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / 1024 / 1024);
      setError(`File is too large. Maximum size is ${maxSizeMB}MB.`);
      setSelectedFile(null);
      onChange(null);
      return;
    }

    // Check file type if accept is specified
    if (accept !== '*/*') {
      const acceptTypes = accept.split(',').map(type => type.trim());
      const fileType = file.type;

      // Handle file extensions (e.g., .pdf, .doc)
      const fileExtensionMatch = acceptTypes.some(type => {
        if (type.startsWith('.')) {
          const extension = '.' + file.name.split('.').pop()?.toLowerCase();
          return extension === type.toLowerCase();
        }

        // Handle MIME types
        if (type.includes('/')) {
          // Handle wildcards like "image/*"
          if (type.endsWith('/*')) {
            const mainType = type.split('/')[0];
            return fileType.startsWith(mainType + '/');
          }
          return fileType === type;
        }

        return false;
      });

      if (!fileExtensionMatch) {
        setError(`Invalid file type. Accepted types: ${accept}`);
        setSelectedFile(null);
        onChange(null);
        return;
      }
    }

    setSelectedFile(file);
    onChange(file);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    onChange(null);
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-4 transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-stone-200 hover:border-primary/50',
          disabled ? 'bg-stone-100 opacity-60 cursor-not-allowed' : 'cursor-pointer',
          className
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        {...props}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileInputChange}
          accept={accept}
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center space-y-2 py-4">
          {selectedFile ? (
            <div className="flex items-center gap-2">
              <FileIcon className="h-6 w-6 text-primary" />
              <div className="text-sm font-medium">{selectedFile.name}</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={clearFile}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove file</span>
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-stone-400" />
              <div className="text-sm text-stone-600 text-center">{placeholder}</div>
              <div className="text-xs text-stone-400">
                Maximum file size: {Math.round(maxSize / 1024 / 1024)}MB
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="text-sm text-stone-1000 mt-1">{error}</div>}
    </div>
  );
};
