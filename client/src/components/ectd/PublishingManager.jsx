import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Download, FileCode, Package, Settings, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';

export default function PublishingManager({ sequenceId = "0000" }) {
  const { toast } = useToast();
  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  
  const [metadata, setMetadata] = useState({
    appNumber: "123456",
    agency: "FDA",
    submissionType: "NDA",
    sequence: sequenceId
  });

  const handlePublish = () => {
    setIsPublishing(true);
    setProgress(0);

    // Simulate publishing steps
    const steps = [
      { pct: 10, msg: "Validating XML backbone..." },
      { pct: 30, msg: "Checking file checksums (MD5)..." },
      { pct: 50, msg: "Generating util/dtd/index.xml..." },
      { pct: 70, msg: "Compressing files..." },
      { pct: 90, msg: "Finalizing package..." },
      { pct: 100, msg: "Complete!" }
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep >= steps.length) {
        clearInterval(interval);
        setIsPublishing(false);
        setIsComplete(true);
        toast({
          title: "Publishing Complete",
          description: `Sequence ${metadata.sequence} is ready for download.`,
        });
        return;
      }
      
      setProgress(steps[currentStep].pct);
      // In a real app, we'd show the message too
      currentStep++;
    }, 800);
  };

  return (
    <div className="space-y-6">
      {!isComplete ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" /> Submission Publisher
            </CardTitle>
            <CardDescription>
              Configure and generate the final eCTD package for Sequence {metadata.sequence}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Application Number</Label>
                <Input 
                  value={metadata.appNumber} 
                  onChange={(e) => setMetadata({...metadata, appNumber: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label>Agency</Label>
                <Select 
                  value={metadata.agency} 
                  onValueChange={(val) => setMetadata({...metadata, agency: val})}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FDA">FDA (US)</SelectItem>
                    <SelectItem value="EMA">EMA (EU)</SelectItem>
                    <SelectItem value="PMDA">PMDA (Japan)</SelectItem>
                    <SelectItem value="HC">Health Canada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Submission Type</Label>
                <Select 
                  value={metadata.submissionType} 
                  onValueChange={(val) => setMetadata({...metadata, submissionType: val})}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NDA">NDA (New Drug Application)</SelectItem>
                    <SelectItem value="IND">IND (Investigational New Drug)</SelectItem>
                    <SelectItem value="BLA">BLA (Biologics License Application)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sequence Number</Label>
                <Input value={metadata.sequence} disabled />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Pre-Publishing Check</p>
                <p>Ensure all validation errors are resolved before publishing. 3 Warnings detected.</p>
              </div>
            </div>

            {isPublishing && (
              <div className="space-y-2 pt-4">
                <div className="flex justify-between text-sm">
                  <span>Publishing progress...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline">Run Validation Again</Button>
            <Button onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? 'Publishing...' : 'Generate eCTD Package'}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <CheckCircle className="h-6 w-6" /> Publishing Successful
            </CardTitle>
            <CardDescription className="text-green-700">
              The eCTD package for Sequence {metadata.sequence} has been generated successfully.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white p-4 rounded border border-green-100 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Package Size:</span>
                <span className="font-medium">45.2 MB</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">File Count:</span>
                <span className="font-medium">128 files</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Checksum:</span>
                <span className="font-mono text-xs">a1b2c3d4...</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button className="bg-green-600 hover:bg-green-700 text-white gap-2">
              <Download className="h-4 w-4" /> Download Package (ZIP)
            </Button>
            <Button variant="outline" className="bg-white" onClick={() => setIsComplete(false)}>
              Start Over
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
