import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, Check, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProcessedDocument {
  id: string;
  fileName: string;
  title: string;
  type: string;
  source: string;
  year: number;
  success: boolean;
  summary: string;
  keyInsights: string[];
  tags: string[];
}

export function AcademicUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processedDocument, setProcessedDocument] = useState<ProcessedDocument | null>(null);
  const [recentDocuments, setRecentDocuments] = useState<ProcessedDocument[]>([]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      // Validate file type
      if (selectedFile.type !== 'application/pdf') {
        // toast call replaced
  // Original: toast({
          title: "Invalid file type",
          description: "Please upload a PDF file.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Invalid file type",
          description: "Please upload a PDF file.",
          variant: "destructive"
        });
        return;
      }
      
      setFile(selectedFile);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      // toast call replaced
  // Original: toast({
        title: "No file selected",
        description: "Please select a PDF file to upload.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No file selected",
        description: "Please select a PDF file to upload.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/academic/process-pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setProcessedDocument(result);
        // toast call replaced
  // Original: toast({
          title: "Document processed successfully",
          description: `Processed ${result.fileName}`,
          variant: "default"
        })
  console.log('Toast would show:', {
          title: "Document processed successfully",
          description: `Processed ${result.fileName}`,
          variant: "default"
        });
        
        // Add to recent documents
        setRecentDocuments(prev => [result, ...prev]);
      } else {
        // toast call replaced
  // Original: toast({
          title: "Processing error",
          description: result.error || "Failed to process document",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Processing error",
          description: result.error || "Failed to process document",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      // toast call replaced
  // Original: toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">Upload Academic PDF</TabsTrigger>
          <TabsTrigger value="recent">Recent Documents</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload Academic Documents</CardTitle>
              <CardDescription>
                Upload academic papers, guidelines, or books to enhance the system's knowledge base.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid w-full gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="pdf">Select PDF Document</Label>
                  <Input id="pdf" type="file" accept=".pdf" onChange={handleFileChange} />
                </div>
                {file && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-muted-foreground">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload and Process
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
          
          {processedDocument && (
            <Card className="mt-6">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Processing Results</CardTitle>
                  {processedDocument.success ? (
                    <div className="flex items-center text-green-500">
                      <Check className="mr-1 h-5 w-5" />
                      Success
                    </div>
                  ) : (
                    <div className="flex items-center text-red-500">
                      <AlertCircle className="mr-1 h-5 w-5" />
                      Failed
                    </div>
                  )}
                </div>
                <CardDescription>
                  Document ID: {processedDocument.id}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">{processedDocument.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {processedDocument.type} • {processedDocument.source} • {processedDocument.year}
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium">Summary</h4>
                    <p className="text-sm mt-1">{processedDocument.summary}</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium">Key Insights</h4>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                      {processedDocument.keyInsights.map((insight, index) => (
                        <li key={index} className="text-sm">{insight}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium">Tags</h4>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {processedDocument.tags.map((tag, index) => (
                        <span key={index} className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="recent">
          <Card>
            <CardHeader>
              <CardTitle>Recently Processed Documents</CardTitle>
              <CardDescription>
                Academic documents that have been processed and added to the knowledge base.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentDocuments.length > 0 ? (
                <div className="space-y-4">
                  {recentDocuments.map((doc) => (
                    <div key={doc.id} className="border rounded-md p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{doc.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {doc.type} • {doc.source} • {doc.year}
                          </p>
                        </div>
                        {doc.success ? (
                          <div className="flex items-center text-green-500 text-sm">
                            <Check className="mr-1 h-4 w-4" />
                            Processed
                          </div>
                        ) : (
                          <div className="flex items-center text-red-500 text-sm">
                            <AlertCircle className="mr-1 h-4 w-4" />
                            Failed
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        <p className="text-sm line-clamp-2">{doc.summary}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {doc.tags.slice(0, 5).map((tag, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded-md text-xs">
                            {tag}
                          </span>
                        ))}
                        {doc.tags.length > 5 && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-md text-xs">
                            +{doc.tags.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="mx-auto h-12 w-12 opacity-20 mb-2" />
                  <p>No documents processed yet</p>
                  <p className="text-sm">Upload a document to see it here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}