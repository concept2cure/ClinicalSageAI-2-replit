import { useState } from "react";
import { motion } from "framer-motion";
import { Server, Key, Database, Code, Braces, Copy, ExternalLink, FileJson, Check } from "lucide-react";

import { PageContainer, HeaderSection, ContentSection } from "@/components/layout";
import Navbar from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function ApiDocumentation() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    
    // toast call replaced
  // Original: toast({
      title: "Copied to clipboard",
      description: "Code snippet has been copied to your clipboard",
    })
  console.log('Toast would show:', {
      title: "Copied to clipboard",
      description: "Code snippet has been copied to your clipboard",
    });
  };

  return (
    <PageContainer>
      <HeaderSection>
        <Navbar />
        <div className="container px-4 md:px-6 flex flex-col items-center text-center space-y-4 py-8 md:py-12">
          <div className="space-y-2">
            <Badge variant="outline" className="text-primary border-primary px-3 py-1">
              Developer Resources
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tighter">
              TrialSage API Documentation
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Integrate TrialSage data and insights directly into your applications
            </p>
          </div>
        </div>
      </HeaderSection>
      
      <ContentSection>
        <div className="container px-4 md:px-6 py-8 md:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 space-y-4">
              <div className="sticky top-20">
                <h3 className="text-lg font-semibold mb-4">API Resources</h3>
                <ul className="space-y-2">
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      <Server className="h-4 w-4 mr-2" /> Getting Started
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      <Key className="h-4 w-4 mr-2" /> Authentication
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      <Database className="h-4 w-4 mr-2" /> Reports
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      <Code className="h-4 w-4 mr-2" /> Analytics
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      <Braces className="h-4 w-4 mr-2" /> Protocols
                    </Button>
                  </li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-8 mb-4">SDKs & Libraries</h3>
                <ul className="space-y-2">
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      JavaScript
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      Python
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" className="w-full justify-start text-slate-800 dark:text-slate-200">
                      R
                    </Button>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="lg:col-span-3 space-y-8">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Getting Started</h2>
                <p>
                  The TrialSage API provides programmatic access to clinical study report data, analytics, and insights. 
                  This guide will help you get started with integrating TrialSage into your applications.
                </p>
                
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-2">Base URL</h3>
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md font-mono text-sm flex justify-between items-center">
                    <code>https://api.trialsage.com/v1</code>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard("https://api.trialsage.com/v1", "base-url")}>
                      {copied === "base-url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Authentication</h2>
                <p>
                  All API requests must be authenticated using an API key. You can generate an API key in your 
                  TrialSage dashboard under Account Settings &gt; API Keys.
                </p>
                
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-2">API Key Authentication</h3>
                  <p className="mb-3">
                    Include your API key in the Authorization header of all requests:
                  </p>
                  <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md font-mono text-sm flex justify-between items-center">
                    <code>Authorization: Bearer YOUR_API_KEY</code>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard("Authorization: Bearer YOUR_API_KEY", "auth-header")}>
                      {copied === "auth-header" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-lg">
                  <h4 className="font-semibold">Security Note</h4>
                  <p className="text-sm mt-1">
                    Keep your API key secure and never expose it in client-side code. Use server-side code to make API requests.
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Example Requests</h2>
                
                <Tabs defaultValue="javascript" className="w-full">
                  <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="curl">cURL</TabsTrigger>
                  </TabsList>
                  <TabsContent value="javascript" className="mt-4">
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-md font-mono text-sm">
                      <pre>{`const fetchReports = async () => {
  const response = await fetch('https://api.trialsage.com/v1/reports?indication=oncology&phase=2', {
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data;
};`}</pre>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2" 
                      onClick={() => copyToClipboard(`const fetchReports = async () => {
  const response = await fetch('https://api.trialsage.com/v1/reports?indication=oncology&phase=2', {
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data;
};`, "js-example")}
                    >
                      {copied === "js-example" ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Copy
                    </Button>
                  </TabsContent>
                  <TabsContent value="python" className="mt-4">
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-md font-mono text-sm">
                      <pre>{`import requests

def fetch_reports():
    headers = {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }
    
    response = requests.get(
        'https://api.trialsage.com/v1/reports',
        params={'indication': 'oncology', 'phase': '2'},
        headers=headers
    )
    
    return response.json()`}</pre>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => copyToClipboard(`import requests

def fetch_reports():
    headers = {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }
    
    response = requests.get(
        'https://api.trialsage.com/v1/reports',
        params={'indication': 'oncology', 'phase': '2'},
        headers=headers
    )
    
    return response.json()`, "py-example")}
                    >
                      {copied === "py-example" ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Copy
                    </Button>
                  </TabsContent>
                  <TabsContent value="curl" className="mt-4">
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-md font-mono text-sm">
                      <pre>{`curl -X GET \\
  'https://api.trialsage.com/v1/reports?indication=oncology&phase=2' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json'`}</pre>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => copyToClipboard(`curl -X GET \\
  'https://api.trialsage.com/v1/reports?indication=oncology&phase=2' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json'`, "curl-example")}
                    >
                      {copied === "curl-example" ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Copy
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">API Endpoints</h2>
                
                <Card className="border-2 border-transparent hover:border-primary/30 transition-all">
                  <CardHeader>
                    <CardTitle>Reports</CardTitle>
                    <CardDescription>Access clinical study reports</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center text-primary">
                        <FileJson className="h-4 w-4 mr-2" /> GET /reports
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        List available clinical study reports with filtering options
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-xs">
                        <code>GET /reports?indication=diabetes&phase=3&limit=10</code>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center text-primary">
                        <FileJson className="h-4 w-4 mr-2" /> GET /reports/{'{'}"id"{'}'} 
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Get detailed information about a specific report
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-xs">
                        <code>GET /reports/12345</code>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center text-primary">
                        <FileJson className="h-4 w-4 mr-2" /> GET /reports/search
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Search for reports by keyword across all fields
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-xs">
                        <code>GET /reports/search?q=biomarker%20response</code>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-2 border-transparent hover:border-primary/30 transition-all">
                  <CardHeader>
                    <CardTitle>Analytics</CardTitle>
                    <CardDescription>Generate insights and statistics</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center text-primary">
                        <FileJson className="h-4 w-4 mr-2" /> GET /analytics/endpoints
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Get endpoint usage statistics by indication
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-xs">
                        <code>GET /analytics/endpoints?indication=oncology</code>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center text-primary">
                        <FileJson className="h-4 w-4 mr-2" /> GET /analytics/statistics
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Get statistical parameters for similar trials
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-xs">
                        <code>GET /analytics/statistics?indication=alzheimer&phase=2</code>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-2 border-transparent hover:border-primary/30 transition-all">
                  <CardHeader>
                    <CardTitle>Protocols</CardTitle>
                    <CardDescription>Protocol generation and optimization</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center text-primary">
                        <FileJson className="h-4 w-4 mr-2" /> POST /protocols/generate
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Generate a protocol template based on study parameters
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-xs">
                        <code>POST /protocols/generate {'\n'}{'{'}{'\n'}  "indication": "type 2 diabetes",{'\n'}  "phase": "2",{'\n'}  "population": "adults",{'\n'}  "primaryEndpoint": "HbA1c reduction"{'\n'}{'}'}</code>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-1 flex items-center text-primary">
                        <FileJson className="h-4 w-4 mr-2" /> POST /protocols/optimize
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Optimize an existing protocol with recommendations based on similar studies
                      </p>
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-xs">
                        <code>POST /protocols/optimize {'\n'}{'{'}{'\n'}  "protocolId": "12345",{'\n'}  "optimize": ["endpoints", "inclusion", "sample_size"]{'\n'}{'}'}</code>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="mt-16 border-t pt-8">
                <div className="text-center space-y-4">
                  <h2 className="text-2xl font-bold">Ready to get started?</h2>
                  <p className="text-muted-foreground max-w-2xl mx-auto">
                    Sign up for TrialSage today to get your API keys and start integrating 
                    clinical trial intelligence into your applications.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row justify-center gap-4 mt-6">
                    <Button size="lg" className="gap-2">
                      Create Account <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="gap-2">
                      Contact Developer Support
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentSection>
    </PageContainer>
  );
}