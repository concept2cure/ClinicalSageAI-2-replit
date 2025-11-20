import React, { useState, useCallback, ChangeEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileText, UploadCloud, AlertCircle, CheckCircle } from "lucide-react";

// Types for the CSR extraction result
interface FileInfo {
  originalName: string;
  size: number;
  type: string;
}

interface CSRExtractionResult {
  csr_id: string;
  status: string;
  fileInfo?: FileInfo;
  json_path?: string;
  mapped_output?: string;
  sections?: Record<string, any>;
  entities?: Record<string, any>;
  [key: string]: any;
}

/**
 * CSRExtractorDashboard - Component for uploading and processing Clinical Study Reports
 * 
 * Features:
 * - PDF upload and parsing
 * - Extraction of structured data from CSR documents
 * - Display of processing results
 * - Download of extracted JSON data
 * - Integration with protocol planning workflow
 */
const CSRExtractorDashboard: React.FC = () => {
  // File and result state
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CSRExtractionResult | null>(null);
  const [status, setStatus] = useState<string>("");
  
  // Loading state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  
  // Navigation
  const [, setLocation] = useLocation();
  
  // Toast notifications
  const { toast } = useToast();

  /**
   * Handle file selection
   */
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    
    if (selectedFile) {
      // Check file type
      const validTypes = ['application/pdf', 'text/plain'];
      if (!validTypes.includes(selectedFile.type)) {
        // toast call replaced
  // Original: toast({
          title: "Invalid File Type",
          description: "Please upload a PDF or text file.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "Invalid File Type",
          description: "Please upload a PDF or text file.",
          variant: "destructive"
        });
        return;
      }
      
      // Check file size (limit to 20MB)
      if (selectedFile.size > 20 * 1024 * 1024) {
        // toast call replaced
  // Original: toast({
          title: "File Too Large",
          description: "File size should not exceed 20MB.",
          variant: "destructive"
        })
  console.log('Toast would show:', {
          title: "File Too Large",
          description: "File size should not exceed 20MB.",
          variant: "destructive"
        });
        return;
      }
      
      setFile(selectedFile);
      setStatus("");
      // toast call replaced
  // Original: toast({
        title: "File Selected",
        description: `${selectedFile.name} selected for processing.`,
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "File Selected",
        description: `${selectedFile.name} selected for processing.`,
        variant: "default"
      });
    }
  }, [toast]);

  /**
   * Handle file upload and processing
   */
  const handleUpload = useCallback(async () => {
    if (!file) {
      // toast call replaced
  // Original: toast({
        title: "No File Selected",
        description: "Please select a CSR document to upload.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "No File Selected",
        description: "Please select a CSR document to upload.",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    setStatus("Uploading and processing...");
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/csr/upload-enhanced", {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }
      
      const data = await res.json();
      setResult(data);
      setStatus("✅ CSR document successfully processed");
      
      // toast call replaced
  // Original: toast({
        title: "Processing Complete",
        description: "CSR has been parsed and mapped successfully.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "Processing Complete",
        description: "CSR has been parsed and mapped successfully.",
        variant: "default"
      });
    } catch (err) {
      console.error("Upload error:", err);
      setStatus("❌ Upload or processing failed");
      
      // toast call replaced
  // Original: toast({
        title: "Processing Failed",
        description: "Failed to process the CSR document. Please try again.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Processing Failed",
        description: "Failed to process the CSR document. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  }, [file, toast]);

  /**
   * Navigate to the planning page with the processed CSR
   */
  const handleUseInPlanning = useCallback(() => {
    if (!result?.csr_id) {
      // toast call replaced
  // Original: toast({
        title: "Invalid CSR",
        description: "Cannot use this CSR for planning. Missing CSR ID.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Invalid CSR",
        description: "Cannot use this CSR for planning. Missing CSR ID.",
        variant: "destructive"
      });
      return;
    }
    
    setLocation(`/planning?csr_id=${result.csr_id}`);
  }, [result, setLocation, toast]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-blue-700">Upload CSR Document</h2>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Upload a Clinical Study Report (PDF). We'll parse it into structured data using semantic, pharmacologic, and statistical mapping.
          </p>
          
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
            <input 
              type="file" 
              accept=".pdf,.txt" 
              onChange={handleFileChange} 
              className="mb-4"
            />
            <div>
              <Button 
                onClick={handleUpload} 
                disabled={isUploading || !file} 
                className="w-full sm:w-auto"
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Upload and Process
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {status && (
            <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${
              status.includes("✅") ? "bg-green-50 text-green-700" : 
              status.includes("❌") ? "bg-red-50 text-red-700" : 
              "bg-blue-50 text-blue-700"
            }`}>
              {status.includes("✅") ? (
                <CheckCircle className="h-4 w-4" />
              ) : status.includes("❌") ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {status}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-xl font-semibold text-blue-700 mb-3">Processed Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <h3 className="font-medium text-slate-700">CSR ID</h3>
                <p className="text-sm">{result.csr_id}</p>
              </div>
              <div>
                <h3 className="font-medium text-slate-700">Status</h3>
                <p className="text-sm">{result.status}</p>
              </div>
              <div>
                <h3 className="font-medium text-slate-700">Original Filename</h3>
                <p className="text-sm">{result.fileInfo?.originalName}</p>
              </div>
              <div>
                <h3 className="font-medium text-slate-700">File Size</h3>
                <p className="text-sm">{result.fileInfo?.size?.toLocaleString()} bytes</p>
              </div>
            </div>
            
            <div className="mt-6">
              <h3 className="font-medium text-slate-700 mb-2">Response Details</h3>
              <pre className="bg-slate-50 text-xs p-3 rounded overflow-x-auto h-60 whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              {result.json_path && (
                <Button variant="outline" asChild>
                  <a href={result.json_path} target="_blank" rel="noopener noreferrer">
                    <FileText className="mr-2 h-4 w-4" />
                    Download Processed JSON
                  </a>
                </Button>
              )}
              <Button onClick={handleUseInPlanning}>
                Use in Protocol Planning
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CSRExtractorDashboard;