import React, { useState, useRef } from 'react';
// Using a simple SVG instead of the radix-ui icon
const UploadIcon = () => (
 <svg
 xmlns="http://www.w3.org/2000/svg"
 width="24"
 height="24"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 >
 <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
 <polyline points="17 8 12 3 7 8" />
 <line x1="12" y1="3" x2="12" y2="15" />
 </svg>
);
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * FileUploader Component
 *
 * A versatile file uploader component with drag and drop support
 *
 * @param {Function} onFilesSelected - Callback function that receives the selected files
 * @param {string} label - Label text for the upload area
 * @param {string} acceptedFileTypes - Comma-separated file extensions (e.g., ".pdf,.docx")
 * @param {number} maxSizeMB - Maximum file size in MB
 * @param {boolean} multiple - Allow selecting multiple files
 * @param {string} className - Additional CSS classes
 */
export const FileUploader = ({
 onFilesSelected,
 label = 'Drop files here or click to upload',
 acceptedFileTypes = '*',
 maxSizeMB = 10,
 multiple = false,
 className,
}) => {
 const [isDragging, setIsDragging] = useState(false);
 const [error, setError] = useState('');
 const fileInputRef = useRef(null);

 const maxSizeBytes = maxSizeMB * 1024 * 1024; // Convert MB to bytes

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

 setError('');
 const files = e.dataTransfer.files;
 validateAndProcessFiles(files);
 };

 const handleFileInputChange = e => {
 setError('');
 const files = e.target.files;
 validateAndProcessFiles(files);
 };

 const validateAndProcessFiles = files => {
 if (!files || files.length === 0) return;

 // Validate file size
 for (let i = 0; i < files.length; i++) {
 if (files[i].size > maxSizeBytes) {
 setError(`File "${files[i].name}" exceeds the maximum size of ${maxSizeMB}MB.`);
 return;
 }
 }

 // Validate file type if acceptedFileTypes is specified and not wildcard
 if (acceptedFileTypes !== '*') {
 const acceptedTypesArray = acceptedFileTypes
 .split(',')
 .map(type => type.trim().toLowerCase());

 for (let i = 0; i < files.length; i++) {
 const fileExtension = '.' + files[i].name.split('.').pop().toLowerCase();

 if (!acceptedTypesArray.includes(fileExtension)) {
 setError(`File "${files[i].name}" has an unsupported file type.`);
 return;
 }
 }
 }

 // If validation passes, call the callback
 if (onFilesSelected) {
 onFilesSelected(files);
 }

 // Reset the file input so the same file can be uploaded again if needed
 if (fileInputRef.current) {
 fileInputRef.current.value = '';
 }
 };

 const handleButtonClick = () => {
 if (fileInputRef.current) {
 fileInputRef.current.click();
 }
 };

 return (
 <div className="space-y-2">
 <div
 className={cn(
 'border-2 border-dashed rounded-md cursor-pointer flex flex-col items-center justify-center p-6 text-center',
 isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20',
 error ? 'border-red-500 bg-red-50' : '',
 className
 )}
 onDragOver={handleDragOver}
 onDragLeave={handleDragLeave}
 onDrop={handleDrop}
 onClick={handleButtonClick}
 >
 <UploadIcon
 className={cn(
 'h-6 w-6 mb-2',
 isDragging ? 'text-primary' : 'text-muted-foreground',
 error ? 'text-red-500' : ''
 )}
 />

 <div className="flex flex-col space-y-1">
 <p
 className={cn(
 'text-sm font-medium',
 isDragging ? 'text-primary' : 'text-foreground',
 error ? 'text-red-600' : ''
 )}
 >
 {label}
 </p>
 <p className="text-xs text-muted-foreground">
 {multiple ? 'Up to' : 'Maximum'} {maxSizeMB}MB
 {acceptedFileTypes !== '*' && ` • ${acceptedFileTypes.replace(/\./g, '')}`}
 </p>
 </div>

 <input
 ref={fileInputRef}
 type="file"
 className="hidden"
 accept={acceptedFileTypes}
 multiple={multiple}
 onChange={handleFileInputChange}
 />
 </div>

 {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
 </div>
 );
};

export default FileUploader;
