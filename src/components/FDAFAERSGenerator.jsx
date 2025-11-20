import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// API function to generate a CER report from an NDC code
const generateCERFromNDC = async (ndcCode, productName = "") => {
  try {
    const response = await fetch(`/api/cer/faers/${ndcCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_name: productName })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate CER report");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error generating CER:", error);
    throw error;
  }
};

const FDAFAERSGenerator = () => {
  const [ndcCode, setNdcCode] = useState("");
  const [productName, setProductName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [cerReport, setCerReport] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("form");
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!ndcCode.trim()) {
      setError("NDC code is required");
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const result = await generateCERFromNDC(ndcCode, productName);
      setCerReport(result);
      setActiveTab("report");
      // toast call replaced
  // Original: toast({
        title: "Report Generated Successfully",
        description: "Your Clinical Evaluation Report has been created.",
        variant: "success",
      })
  console.log('Toast would show:', {
        title: "Report Generated Successfully",
        description: "Your Clinical Evaluation Report has been created.",
        variant: "success",
      });
    } catch (err) {
      setError(err.message || "Failed to generate report");
      // toast call replaced
  // Original: toast({
        title: "Error Generating Report",
        description: err.message || "Failed to generate CER report",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Generating Report",
        description: err.message || "Failed to generate CER report",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!cerReport) return;
    
    try {
      const response = await fetch('/api/cer/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `CER for ${productName || ndcCode}`,
          device_name: productName || "FDA Product",
          manufacturer: cerReport.manufacturer || "Unknown",
          content_text: cerReport.cer_report,
          metadata: {
            ndc_code: ndcCode,
            generated_from: "FDA FAERS"
          }
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to save report");
      }
      
      const result = await response.json();
      
      // toast call replaced
  // Original: toast({
        title: "Report Saved Successfully",
        description: `Report ID: ${result.cer_id}`,
        variant: "success",
      })
  console.log('Toast would show:', {
        title: "Report Saved Successfully",
        description: `Report ID: ${result.cer_id}`,
        variant: "success",
      });
    } catch (err) {
      // toast call replaced
  // Original: toast({
        title: "Error Saving Report",
        description: err.message || "Failed to save CER report",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Error Saving Report",
        description: err.message || "Failed to save CER report",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>FDA FAERS Automatic CER Generator</CardTitle>
        <CardDescription>
          Generate Clinical Evaluation Reports from FDA FAERS data by providing an NDC code
        </CardDescription>
      </CardHeader>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="form">Input</TabsTrigger>
          <TabsTrigger value="report" disabled={!cerReport}>Report</TabsTrigger>
        </TabsList>
        
        <TabsContent value="form">
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ndc-code">NDC Code <span className="text-red-500">*</span></Label>
                <Input
                  id="ndc-code"
                  placeholder="Enter NDC Code (e.g. 0002-4462)"
                  value={ndcCode}
                  onChange={(e) => setNdcCode(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  National Drug Code identifier for the product
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="product-name">Product Name (Optional)</Label>
                <Input
                  id="product-name"
                  placeholder="Enter Product Name"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>
              
              {error && (
                <div className="flex items-center p-3 text-sm border rounded-md border-red-200 bg-red-50 text-red-600">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {error}
                </div>
              )}
            </form>
          </CardContent>
          
          <CardFooter>
            <Button 
              onClick={handleSubmit} 
              disabled={isGenerating || !ndcCode}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Report...
                </>
              ) : (
                "Generate CER Report"
              )}
            </Button>
          </CardFooter>
        </TabsContent>
        
        <TabsContent value="report">
          <CardContent>
            {cerReport ? (
              <div className="space-y-4">
                <div className="p-4 border rounded-md bg-green-50 border-green-200">
                  <div className="flex items-center mb-2">
                    <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                    <h3 className="font-medium text-green-800">Report Generated Successfully</h3>
                  </div>
                  <p className="text-sm text-green-700">
                    The report has been generated based on FDA FAERS data for NDC code: {ndcCode}
                  </p>
                </div>
                
                <div className="p-4 border rounded-md">
                  <h3 className="mb-2 font-medium">Generated Report</h3>
                  <div className="p-3 overflow-auto text-sm bg-gray-50 rounded-md max-h-[400px] whitespace-pre-wrap">
                    {cerReport.cer_report}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">No report generated yet</p>
              </div>
            )}
          </CardContent>
          
          <CardFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setActiveTab("form")}
              className="w-full sm:w-auto"
            >
              Back to Input
            </Button>
            
            <Button 
              onClick={handleSave} 
              disabled={!cerReport}
              className="w-full sm:w-auto"
            >
              Save Report to Database
            </Button>
          </CardFooter>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default FDAFAERSGenerator;