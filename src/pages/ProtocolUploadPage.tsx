import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Upload, Check, AlertTriangle, FileUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";

export default function ProtocolUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Check file type (PDF, .docx or .txt)
      const fileType = selectedFile.name.split('.').pop()?.toLowerCase();
      if (fileType !== 'docx' && fileType !== 'txt' && fileType !== 'pdf') {
        // toast call replaced
  // Original: toast({
          title: "Invalid file type",
          description: "Please upload a PDF, .docx, or .txt file.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Invalid file type",
          description: "Please upload a PDF, .docx, or .txt file.",
          variant: "destructive"
        });
        return;
      }
      
      // Check file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        // toast call replaced
  // Original: toast({
          title: "File too large",
          description: "Maximum file size is 10MB.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "File too large",
          description: "Maximum file size is 10MB.",
          variant: "destructive"
        });
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    setUploadProgress(0);
    
    // Simulate progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 300);
    
    const formData = new FormData();
    formData.append('protocol', file);
    
    try {
      const response = await apiRequest('POST', '/api/protocol/upload', formData);
      
      if (response.ok) {
        clearInterval(interval);
        setUploadProgress(100);
        setUploading(false);
        setExtracting(true);
        
        const data = await response.json();
        
        // Short delay to show extraction status
        setTimeout(() => {
          setExtracting(false);
          
          // toast call replaced
  // Original: toast({
            title: "Protocol uploaded successfully",
            description: "Your protocol has been analyzed.",
            variant: "default"
          })
  console.log('Toast would show:', {
            title: "Protocol uploaded successfully",
            description: "Your protocol has been analyzed.",
            variant: "default"
          });
          
          // Navigate to analysis page with the protocol ID
          navigate(`/protocol/analysis/${data.protocolId}`);
        }, 1500);
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      clearInterval(interval);
      setUploading(false);
      setUploadProgress(0);
      
      // toast call replaced
  // Original: toast({
        title: "Upload failed",
        description: "There was an error uploading your protocol. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Upload failed",
        description: "There was an error uploading your protocol. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  return (
    <div className="container mx-auto py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Upload Protocol Draft</h1>
          <p className="text-muted-foreground">
            Upload your clinical trial protocol draft to analyze it against our database of Clinical Study Reports.
            We'll extract key parameters and provide insights to optimize your protocol design.
          </p>
        </div>
        
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload Protocol Document</CardTitle>
            <CardDescription>
              Supported file formats: PDF, .docx, .txt (Max 10MB)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="protocol-file">Protocol File</Label>
                <div className="flex gap-2">
                  <Input 
                    id="protocol-file" 
                    type="file" 
                    onChange={handleFileChange}
                    disabled={uploading || extracting}
                    accept=".docx,.txt,.pdf"
                  />
                  <Button 
                    onClick={handleUpload} 
                    disabled={!file || uploading || extracting}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading
                      </>
                    ) : extracting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting
                      </>
                    ) : (
                      <>
                        <FileUp className="mr-2 h-4 w-4" />
                        Upload
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {file && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>{file.name}</span>
                  <Badge variant="outline" className="ml-auto">
                    {(file.size / 1024).toFixed(1)} KB
                  </Badge>
                </div>
              )}
              
              {(uploading || extracting) && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{extracting ? "Extracting protocol data..." : "Uploading..."}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>What happens next?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-primary/10 p-1.5 rounded-full">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Extract Trial Parameters</h3>
                  <p className="text-sm text-muted-foreground">
                    We'll automatically extract key trial parameters like phase, indication, sample size, 
                    duration, endpoints, and study arms.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-primary/10 p-1.5 rounded-full">
                  <Check className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Analyze Against CSR Database</h3>
                  <p className="text-sm text-muted-foreground">
                    Compare your protocol design against our database of Clinical Study Reports to 
                    identify optimization opportunities and potential risks.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-primary/10 p-1.5 rounded-full">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Get Strategic Recommendations</h3>
                  <p className="text-sm text-muted-foreground">
                    Receive AI-powered recommendations to improve your trial design, 
                    optimize endpoints, and increase the probability of trial success.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}