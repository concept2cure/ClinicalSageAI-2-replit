import React, { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, X, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UploadedFile {
  file: File;
  id: string;
  progress: number;
}

interface FileUploaderProps {
  accept?: string;
  maxFiles?: number;
  maxSize?: number; // in MB
  onUpload: (files: UploadedFile[]) => void;
  uploadMessage?: string;
  className?: string;
  disabled?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  accept = '*',
  maxFiles = 1,
  maxSize = 10,
  onUpload,
  uploadMessage = 'Drag & drop files here or click to browse',
  className,
  disabled = false
}) => {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const validateFiles = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return [];
    if (disabled) return [];

    const validFiles: File[] = [];
    const maxSizeBytes = maxSize * 1024 * 1024;

    // Check if we'd exceed max files
    if (files.length + selectedFiles.length > maxFiles) {
      // toast call replaced
  // Original: toast({
        title: 'Too many files',
        description: `You can only upload a maximum of ${maxFiles} files.`,
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Too many files',
        description: `You can only upload a maximum of ${maxFiles} files.`,
        variant: 'destructive',
      });
      return [];
    }

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Check file size
      if (file.size > maxSizeBytes) {
        // toast call replaced
  // Original: toast({
          title: 'File too large',
          description: `${file.name} exceeds the maximum size of ${maxSize}MB`,
          variant: 'destructive',
        })
  console.log('Toast would show:', {
          title: 'File too large',
          description: `${file.name} exceeds the maximum size of ${maxSize}MB`,
          variant: 'destructive',
        });
        continue;
      }

      // Check file type if accept is specified
      if (accept !== '*') {
        const acceptedTypes = accept.split(',').map(type => type.trim());
        const fileType = file.type;
        const fileExtension = '.' + file.name.split('.').pop();
        
        if (!acceptedTypes.some(type => 
          type === fileType || 
          type === fileExtension || 
          (type.includes('/*') && fileType.startsWith(type.replace('/*', '/')))
        )) {
          // toast call replaced
  // Original: toast({
            title: 'Invalid file type',
            description: `${file.name} is not an accepted file type`,
            variant: 'destructive',
          })
  console.log('Toast would show:', {
            title: 'Invalid file type',
            description: `${file.name} is not an accepted file type`,
            variant: 'destructive',
          });
          continue;
        }
      }

      validFiles.push(file);
    }

    return validFiles;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    
    if (disabled) return;
    
    const droppedFiles = e.dataTransfer.files;
    handleFiles(droppedFiles);
  };

  const handleFiles = (selectedFiles: FileList | null) => {
    const validFiles = validateFiles(selectedFiles);
    
    if (validFiles.length > 0) {
      const newUploadedFiles = validFiles.map(file => ({
        file,
        id: Math.random().toString(36).substring(2, 9),
        progress: 100, // Instantly complete for this implementation
      }));
      
      const updatedFiles = [...files, ...newUploadedFiles];
      setFiles(updatedFiles);
      onUpload(updatedFiles);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset the input value so the same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    const updatedFiles = files.filter(file => file.id !== id);
    setFiles(updatedFiles);
    onUpload(updatedFiles);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-lg transition-colors',
          dragging 
            ? 'border-primary bg-primary/5' 
            : disabled
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
              : 'border-gray-300 hover:border-primary/50 hover:bg-primary/5 cursor-pointer',
          className
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        {files.length === 0 ? (
          <div className="flex flex-col items-center">
            <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
            <p className="mb-2 text-sm text-center text-muted-foreground">{uploadMessage}</p>
            <p className="text-xs text-muted-foreground">Max file size: {maxSize}MB</p>
          </div>
        ) : (
          <div className="w-full space-y-2">
            {files.map((file) => (
              <div 
                key={file.id} 
                className="flex items-center justify-between p-2 rounded bg-gray-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center space-x-2">
                  <FileCheck className="flex-shrink-0 w-5 h-5 text-green-500" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate max-w-[200px]">{file.file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatFileSize(file.file.size)}</span>
                  </div>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(file.id);
                    }}
                    className="p-1 rounded-full hover:bg-gray-200"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            ))}
            {!disabled && files.length < maxFiles && (
              <p className="text-xs text-center text-muted-foreground">
                Click to add {maxFiles > 1 ? 'more files' : 'another file'}
              </p>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          multiple={maxFiles > 1}
          disabled={disabled}
        />
      </div>
    </div>
  );
};