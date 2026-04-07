import { useState, useRef } from 'react';
import { Upload, X, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

/**
 * File Uploader component with drop zone and file listing
 */
export const FileUploader = ({
  onFilesSelected,
  multiple = false,
  maxFiles = 10,
  accept = '.pdf,.docx,.doc,.xls,.xlsx,.txt,.xml,.jpg,.jpeg,.png,.gif',
  acceptedFileTypesMessage = 'PDF, Word, Excel, Text, and image files are supported',
  maxSizeMB = 50,
}) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Handle click on upload button
  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  // Handle file input change
  const handleFileChange = e => {
    const files = Array.from(e.target.files);
    processFiles(files);
  };

  // Process selected files, checking for validation
  const processFiles = files => {
    // Check for max files limit
    if (multiple && selectedFiles.length + files.length > maxFiles) {
      toast({ title: `You can only upload a maximum of ${maxFiles} files.` });
      return;
    }

    // Check for file size limit
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const oversizedFiles = files.filter(file => file.size > maxSizeBytes);

    if (oversizedFiles.length > 0) {
      toast({ title: 
        `Some files exceed the maximum size of ${maxSizeMB}MB: ${oversizedFiles.map(f => f.name).join(', ')}`
       });
      return;
    }

    // Update selected files
    const newFiles = multiple ? [...selectedFiles, ...files] : files;
    setSelectedFiles(newFiles);

    // Pass files to parent component
    onFilesSelected(newFiles);
  };

  // Handle file removal
  const handleRemoveFile = index => {
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);

    // Pass updated files to parent component
    onFilesSelected(newFiles);
  };

  // Handle drag events
  const handleDragOver = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  // Get file size as formatted string
  const getFileSize = size => {
    if (size < 1024) {
      return size + ' B';
    } else if (size < 1024 * 1024) {
      return (size / 1024).toFixed(2) + ' KB';
    } else {
      return (size / (1024 * 1024)).toFixed(2) + ' MB';
    }
  };

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
      />

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        } text-center cursor-pointer transition-colors`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleUploadClick}
      >
        <UploadCloud className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
        <div className="mb-2 text-sm font-medium">
          <span className="text-primary">Click to upload</span> or drag and drop
        </div>
        <p className="text-xs text-muted-foreground">{acceptedFileTypesMessage}</p>
        <p className="text-xs text-muted-foreground mt-1">Maximum file size: {maxSizeMB}MB</p>
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-medium">Selected Files ({selectedFiles.length})</h4>
          <ul className="space-y-2">
            {selectedFiles.map((file, index) => (
              <li key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                <div className="flex items-center">
                  <Upload className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium truncate max-w-[240px]">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{getFileSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={e => {
                    e.stopPropagation();
                    handleRemoveFile(index);
                  }}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove file</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
