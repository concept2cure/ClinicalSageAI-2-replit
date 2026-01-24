import React, { useState } from 'react';
import { FileDown, Printer, Share2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface WisdomTraceExporterProps {
  traceId: string;
  traceName: string;
  includeEvidence?: boolean;
  includeReasoning?: boolean;
  includeAlternatives?: boolean;
}

export default function WisdomTraceExporter({
  traceId,
  traceName,
  includeEvidence = true,
  includeReasoning = true,
  includeAlternatives = true
}: WisdomTraceExporterProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'html' | 'json'>('pdf');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [includeEvidenceChecked, setIncludeEvidenceChecked] = useState(includeEvidence);
  const [includeReasoningChecked, setIncludeReasoningChecked] = useState(includeReasoning);
  const [includeAlternativesChecked, setIncludeAlternativesChecked] = useState(includeAlternatives);

  const handleExport = async () => {
    setIsExporting(true);
    
    // This would be an actual API call in production
    try {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API delay
      
      // Show success message
      // toast call replaced
  // Original: toast({
        title: "Export Successful",
        description: `Wisdom trace "${traceName}" has been exported as ${exportFormat.toUpperCase()
  console.log('Toast would show:', {
        title: "Export Successful",
        description: `Wisdom trace "${traceName}" has been exported as ${exportFormat.toUpperCase()}.`,
        variant: "default",
      });
      
      // For PDF/HTML, this would trigger a download in a real implementation
      if (exportFormat === 'pdf' || exportFormat === 'html') {
        // In a real implementation, we would have:
        // window.open(URL.createObjectURL(response.data), '_blank');
        console.log(`Downloaded ${exportFormat} file for trace ID: ${traceId}`);
      }
      
      setIsDialogOpen(false);
    } catch (error) {
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: "There was an error exporting the wisdom trace. Please try again.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: "There was an error exporting the wisdom trace. Please try again.",
        variant: "destructive",
      });
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    // toast call replaced
  // Original: toast({
      title: "Print Initiated",
      description: "Preparing wisdom trace for printing...",
    })
  console.log('Toast would show:', {
      title: "Print Initiated",
      description: "Preparing wisdom trace for printing...",
    });
    // In a real implementation, we would handle the print logic here
    // window.print();
  };

  const handleShare = () => {
    // toast call replaced
  // Original: toast({
      title: "Sharing Options",
      description: "You can now share this trace with your team or stakeholders.",
    })
  console.log('Toast would show:', {
      title: "Sharing Options",
      description: "You can now share this trace with your team or stakeholders.",
    });
    // In a real implementation, we would open a share dialog or copy a link to clipboard
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2" onClick={() => setIsDialogOpen(true)}>
                <FileDown className="h-4 w-4" />
                Export Trace
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Export this wisdom trace as PDF, HTML, or JSON</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Print this wisdom trace for your records</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share this wisdom trace with your team</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Wisdom Trace</DialogTitle>
            <DialogDescription>
              Create an audit trail document of this recommendation trace.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Export Format</h4>
              <div className="flex gap-2">
                <Button 
                  variant={exportFormat === 'pdf' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setExportFormat('pdf')}
                  className="flex-1"
                >
                  PDF
                </Button>
                <Button 
                  variant={exportFormat === 'html' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setExportFormat('html')}
                  className="flex-1"
                >
                  HTML
                </Button>
                <Button 
                  variant={exportFormat === 'json' ? 'default' : 'outline'} 
                  size="sm" 
                  onClick={() => setExportFormat('json')}
                  className="flex-1"
                >
                  JSON
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium mb-2">Include Sections</h4>
              <Card>
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Evidence Base</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`rounded-full p-1.5 h-auto ${includeEvidenceChecked ? 'bg-primary text-white' : 'bg-slate-100'}`}
                      onClick={() => setIncludeEvidenceChecked(!includeEvidenceChecked)}
                    >
                      {includeEvidenceChecked && <Check className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Reasoning Process</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`rounded-full p-1.5 h-auto ${includeReasoningChecked ? 'bg-primary text-white' : 'bg-slate-100'}`}
                      onClick={() => setIncludeReasoningChecked(!includeReasoningChecked)}
                    >
                      {includeReasoningChecked && <Check className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Alternative Approaches</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`rounded-full p-1.5 h-auto ${includeAlternativesChecked ? 'bg-primary text-white' : 'bg-slate-100'}`}
                      onClick={() => setIncludeAlternativesChecked(!includeAlternativesChecked)}
                    >
                      {includeAlternativesChecked && <Check className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-4">
              <Card className="bg-slate-50 border-dashed">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium">{traceName}</h3>
                      <div className="text-xs text-slate-500 mt-1">Trace ID: {traceId}</div>
                    </div>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      Ready for Export
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}