import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, File, Check, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const phaseOptions = ["Phase 1", "Phase 1/2", "Phase 2", "Phase 2/3", "Phase 3", "Phase 4", "Other"];

export function CSRDirectUploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [metadata, setMetadata] = useState({
    title: '',
    sponsor: '',
    indication: '',
    phase: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  };
  
  const removeFile = (index: number) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };
  
  const handleMetadataChange = (key: string, value: string) => {
    setMetadata(prev => ({ ...prev, [key]: value }));
  };
  
  const resetUploader = () => {
    setFiles([]);
    setUploadProgress(0);
    setSuccessCount(0);
    setErrorCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const uploadSingleFile = async (file: File): Promise<boolean> => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add metadata if available
    if (metadata.title) formData.append('title', metadata.title || file.name.replace(/\.[^/.]+$/, ""));
    if (metadata.sponsor) formData.append('sponsor', metadata.sponsor);
    if (metadata.indication) formData.append('indication', metadata.indication);
    if (metadata.phase) formData.append('phase', metadata.phase);
    
    try {
      const response = await fetch('/api/upload-csr', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }
      
      const result = await response.json();
      return true;
    } catch (error) {
      console.error('Error uploading file:', error);
      return false;
    }
  };
  
  const uploadBatch = async () => {
    if (files.length === 0) {
      // toast call replaced
  // Original: toast({
        title: "No files selected",
        description: "Please select one or more files to upload",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No files selected",
        description: "Please select one or more files to upload",
        variant: "destructive"
      });
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    setSuccessCount(0);
    setErrorCount(0);
    
    let successFiles = 0;
    let errorFiles = 0;
    
    for (let i = 0; i < files.length; i++) {
      const result = await uploadSingleFile(files[i]);
      
      if (result) {
        successFiles++;
      } else {
        errorFiles++;
      }
      
      setSuccessCount(successFiles);
      setErrorCount(errorFiles);
      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
    }
    
    if (errorFiles === 0) {
      // toast call replaced
  // Original: toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${successFiles} CSR file${successFiles !== 1 ? 's' : ''}`,
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Upload Complete",
        description: `Successfully uploaded ${successFiles} CSR file${successFiles !== 1 ? 's' : ''}`,
        variant: "default"
      });
    } else {
      // toast call replaced
  // Original: toast({
        title: "Upload Partially Complete",
        description: `Uploaded ${successFiles} file${successFiles !== 1 ? 's' : ''}, with ${errorFiles} error${errorFiles !== 1 ? 's' : ''}`,
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Upload Partially Complete",
        description: `Uploaded ${successFiles} file${successFiles !== 1 ? 's' : ''}, with ${errorFiles} error${errorFiles !== 1 ? 's' : ''}`,
        variant: "destructive"
      });
    }
    
    setUploading(false);
  };
  
  // Special case for batch upload of multiple files
  const handleBatchUpload = async () => {
    if (files.length === 0) {
      // toast call replaced
  // Original: toast({
        title: "No files selected",
        description: "Please select one or more files to upload",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No files selected",
        description: "Please select one or more files to upload",
        variant: "destructive"
      });
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    
    // Add all files with the 'files' key (for batch processing)
    files.forEach(file => {
      formData.append('files', file);
    });
    
    // Add metadata if available
    if (metadata.title) formData.append('title', metadata.title);
    if (metadata.sponsor) formData.append('sponsor', metadata.sponsor);
    if (metadata.indication) formData.append('indication', metadata.indication);
    if (metadata.phase) formData.append('phase', metadata.phase);
    
    try {
      // Show a 20% progress immediately to indicate upload started
      setUploadProgress(20);
      
      const response = await fetch('/api/upload-csr-batch', {
        method: 'POST',
        body: formData,
      });
      
      // Show 70% progress after server receives files
      setUploadProgress(70);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Batch upload failed');
      }
      
      const result = await response.json();
      
      setUploadProgress(100);
      setSuccessCount(result.successCount || files.length);
      setErrorCount(result.errorCount || 0);
      
      // toast call replaced
  // Original: toast({
        title: "Batch Upload Started",
        description: `Successfully submitted ${files.length} CSR file${files.length !== 1 ? 's' : ''} for processing`,
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Batch Upload Started",
        description: `Successfully submitted ${files.length} CSR file${files.length !== 1 ? 's' : ''} for processing`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error in batch upload:', error);
      setErrorCount(files.length);
      
      // toast call replaced
  // Original: toast({
        title: "Batch Upload Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Batch Upload Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    }
    
    setUploading(false);
  };
  
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">CSR Direct Uploader</CardTitle>
        <CardDescription>
          Upload Clinical Study Reports (CSRs) directly to the intelligence engine
        </CardDescription>
      </CardHeader>
      
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid grid-cols-2 mx-6">
          <TabsTrigger value="single">Individual Upload</TabsTrigger>
          <TabsTrigger value="batch">Batch Upload</TabsTrigger>
        </TabsList>
        
        <TabsContent value="single">
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title (Optional)</Label>
                  <Input 
                    id="title" 
                    placeholder="CSR Title" 
                    value={metadata.title}
                    onChange={(e) => handleMetadataChange('title', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor">Sponsor (Optional)</Label>
                  <Input 
                    id="sponsor" 
                    placeholder="Sponsor Name" 
                    value={metadata.sponsor}
                    onChange={(e) => handleMetadataChange('sponsor', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="indication">Indication (Optional)</Label>
                  <Input 
                    id="indication" 
                    placeholder="e.g., Diabetes, Oncology" 
                    value={metadata.indication}
                    onChange={(e) => handleMetadataChange('indication', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phase">Phase (Optional)</Label>
                  <Select 
                    value={metadata.phase} 
                    onValueChange={(value) => handleMetadataChange('phase', value)}
                  >
                    <SelectTrigger id="phase">
                      <SelectValue placeholder="Select Phase" />
                    </SelectTrigger>
                    <SelectContent>
                      {phaseOptions.map((phase) => (
                        <SelectItem key={phase} value={phase}>
                          {phase}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xml"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
                
                {files.length === 0 ? (
                  <div className="py-4">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Drag and drop your PDF or XML files, or 
                      <Button 
                        onClick={() => fileInputRef.current?.click()} 
                        variant="link" 
                        className="px-1"
                      >
                        browse
                      </Button>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Supported file types: PDF, XML (up to 100MB)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-left">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between py-2 border-b">
                          <div className="flex items-center">
                            <File className="h-5 w-5 mr-2 text-blue-500" />
                            <span className="text-sm truncate max-w-xs">
                              {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            disabled={uploading}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    
                    <Button 
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      disabled={uploading}
                    >
                      Add More Files
                    </Button>
                  </div>
                )}
              </div>
              
              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading {successCount + errorCount} of {files.length}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={resetUploader}
              disabled={uploading || files.length === 0}
            >
              Reset
            </Button>
            <Button 
              onClick={uploadBatch} 
              disabled={uploading || files.length === 0}
              className="ml-auto"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>Upload {files.length > 0 ? `(${files.length})` : ''}</>
              )}
            </Button>
          </CardFooter>
        </TabsContent>
        
        <TabsContent value="batch">
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batch-sponsor">Common Sponsor (Optional)</Label>
                  <Input 
                    id="batch-sponsor" 
                    placeholder="e.g., Company Name for all files" 
                    value={metadata.sponsor}
                    onChange={(e) => handleMetadataChange('sponsor', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batch-indication">Common Indication (Optional)</Label>
                  <Input 
                    id="batch-indication" 
                    placeholder="e.g., Same indication for all files" 
                    value={metadata.indication}
                    onChange={(e) => handleMetadataChange('indication', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xml"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
                
                {files.length === 0 ? (
                  <div className="py-4">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Drag and drop multiple PDF or XML files, or 
                      <Button 
                        onClick={() => fileInputRef.current?.click()} 
                        variant="link" 
                        className="px-1"
                      >
                        browse
                      </Button>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Select multiple files to process in a single batch (up to 20 files recommended)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-left max-h-60 overflow-y-auto">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between py-2 border-b">
                          <div className="flex items-center">
                            <File className="h-5 w-5 mr-2 text-blue-500" />
                            <span className="text-sm truncate max-w-xs">
                              {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            disabled={uploading}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    
                    <Button 
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      disabled={uploading}
                    >
                      Add More Files
                    </Button>
                  </div>
                )}
              </div>
              
              {uploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing batch upload...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
              
              {(successCount > 0 || errorCount > 0) && !uploading && (
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center">
                    {successCount > 0 && (
                      <div className="flex items-center text-green-600 mr-4">
                        <Check className="h-5 w-5 mr-1" />
                        <span>{successCount} successful</span>
                      </div>
                    )}
                    {errorCount > 0 && (
                      <div className="flex items-center text-red-600">
                        <AlertTriangle className="h-5 w-5 mr-1" />
                        <span>{errorCount} failed</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={resetUploader}
              disabled={uploading || files.length === 0}
            >
              Reset
            </Button>
            <Button 
              onClick={handleBatchUpload} 
              disabled={uploading || files.length === 0}
              className="ml-auto"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing Batch...
                </>
              ) : (
                <>Upload Batch {files.length > 0 ? `(${files.length} files)` : ''}</>
              )}
            </Button>
          </CardFooter>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

export default CSRDirectUploader;