import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { FileSymlink, ArrowRight, Download, CheckCircle2, AlertCircle, FilePenLine, Brain } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function FixedProtocolViewer({ originalText = "", sessionId = null, onProtocolRepaired = () => {} }) {
  const [isRepairing, setIsRepairing] = useState(false);
  const [originalProtocol, setOriginalProtocol] = useState(originalText);
  const [fixedProtocol, setFixedProtocol] = useState("");
  const [changes, setChanges] = useState([]);
  const [activeTab, setActiveTab] = useState("original");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Initialize protocol content from props or load from API if available
  useEffect(() => {
    // First set the protocol text from props if available
    if (originalText && originalText.trim() !== "") {
      setOriginalProtocol(originalText);
    }
    
    // Then, if session ID is provided, try to load any existing fixed protocol
    if (sessionId && typeof sessionId === "string" && sessionId.trim() !== "") {
      setIsLoading(true);
      console.log(`Loading existing protocol for session: ${sessionId}`);
      
      fetch(`/api/protocol/get-latest?study_id=${sessionId}`)
        .then(response => {
          if (response.ok) return response.json();
          throw new Error("Failed to load protocol");
        })
        .then(data => {
          // Only override with API data if it exists and there's no initial text
          // or if the API data is more recent
          if (data.original && (!originalText || data.timestamp)) {
            setOriginalProtocol(data.original);
          }
          
          if (data.fixed) {
            setFixedProtocol(data.fixed);
            setActiveTab("fixed");
          }
          if (data.changes) setChanges(data.changes);
        })
        .catch(error => {
          console.error(`Error loading protocol for session ${sessionId}:`, error);
          // Don't show error toast as this is just a loading attempt
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (sessionId) {
      console.warn("Protocol load skipped: Invalid sessionId format");
    }
  }, [sessionId, originalText]);

  const handleTextChange = (e) => {
    setOriginalProtocol(e.target.value);
  };

  const handleRepairProtocol = async () => {
    if (!originalProtocol.trim()) {
      // toast call replaced
  // Original: toast({
        title: "Empty Protocol",
        description: "Please enter protocol text first.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Empty Protocol",
        description: "Please enter protocol text first.",
        variant: "destructive",
      });
      return;
    }

    // Enhanced session validation
    if (!sessionId || typeof sessionId !== "string" || sessionId.trim() === "") {
      // toast call replaced
  // Original: toast({
        title: "No Study Session Selected",
        description: "Please select a valid study session before repairing the protocol.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "No Study Session Selected",
        description: "Please select a valid study session before repairing the protocol.",
        variant: "destructive",
      });
      console.error("Protocol repair attempted without valid sessionId");
      return;
    }

    setIsRepairing(true);

    try {
      // First, log this to wisdom trace for decision tracking
      let traceResponse;
      try {
        traceResponse = await fetch('/api/wisdom/trace-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            input: "Request to repair protocol document",
            reasoning: [
              "Analyzing protocol for gaps and inconsistencies", 
              "Checking for regulatory compliance issues",
              "Identifying missing sections per ICH guidelines",
              "Evaluating statistical methodology and endpoint definitions"
            ],
            output: "Protocol repair initiated with regulatory focus"
          })
        });
      } catch (traceError) {
        console.error("Failed to log wisdom trace:", traceError);
      }

      // Now repair the protocol
      const response = await fetch("/api/protocol/repair", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          study_id: sessionId,
          protocol_text: originalProtocol,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to repair protocol");
      }

      const data = await response.json();
      setFixedProtocol(data.fixed_protocol);
      setChanges(data.changes || []);
      setActiveTab("fixed");

      // Log this insight to memory
      try {
        await fetch('/api/insight/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            study_id: sessionId,
            title: "Protocol Repaired",
            summary: `AI repaired protocol with ${data.changes?.length || 0} changes addressing protocol issues.`,
            status: "completed"
          })
        });
      } catch (insightError) {
        console.error("Failed to save insight:", insightError);
      }

      // Call the callback if provided
      if (onProtocolRepaired) {
        onProtocolRepaired(data.changes || []);
      }

      // toast call replaced
  // Original: toast({
        title: "Protocol Repaired",
        description: "Your protocol has been improved based on regulatory standards.",
      })
  console.log('Toast would show:', {
        title: "Protocol Repaired",
        description: "Your protocol has been improved based on regulatory standards.",
      });
    } catch (error) {
      console.error("Protocol repair error:", error);
      // toast call replaced
  // Original: toast({
        title: "Repair Failed",
        description: error.message || "An error occurred during protocol repair.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "Repair Failed",
        description: error.message || "An error occurred during protocol repair.",
        variant: "destructive",
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const handleDownloadFixed = () => {
    if (!fixedProtocol) {
      // toast call replaced
  // Original: toast({
        title: "No Fixed Protocol",
        description: "Please repair the protocol first.",
        variant: "destructive",
      })
  console.log('Toast would show:', {
        title: "No Fixed Protocol",
        description: "Please repair the protocol first.",
        variant: "destructive",
      });
      return;
    }

    const blob = new Blob([fixedProtocol], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repaired-protocol.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Log this action with session validation
    if (sessionId && typeof sessionId === "string" && sessionId.trim() !== "") {
      fetch('/api/insight/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study_id: sessionId,
          title: "Protocol Downloaded",
          summary: "Downloaded repaired protocol text file",
          status: "completed"
        })
      })
      .then(() => {
        console.log(`Download action logged to session: ${sessionId}`);
      })
      .catch(error => {
        console.error(`Failed to log download action to session ${sessionId}:`, error);
      });
    } else {
      console.warn("Protocol download not logged: Invalid or missing sessionId");
    }

    // toast call replaced
  // Original: toast({
      title: "Protocol Downloaded",
      description: "Your repaired protocol has been downloaded.",
    })
  console.log('Toast would show:', {
      title: "Protocol Downloaded",
      description: "Your repaired protocol has been downloaded.",
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileSymlink className="mr-2 h-5 w-5" />
          AI-Repaired Protocol
        </CardTitle>
        <CardDescription>
          Improve your protocol with AI-driven regulatory fixes
        </CardDescription>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="original">Original Protocol</TabsTrigger>
          <TabsTrigger value="fixed" disabled={!fixedProtocol}>
            Repaired Protocol
            {fixedProtocol && (
              <Badge variant="outline" className="ml-2">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Fixed
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="original" className="space-y-4 pt-4">
          <CardContent>
            <Textarea
              placeholder="Paste your protocol text here or load it from the Upload tab..."
              value={originalProtocol}
              onChange={handleTextChange}
              rows={12}
              className="font-mono text-sm"
            />
          </CardContent>

          <CardFooter className="flex justify-between">
            <div className="text-sm text-muted-foreground">
              {sessionId ? (
                <span className="text-green-600 flex items-center">
                  <Brain className="mr-1 h-4 w-4" />
                  Using Session: {sessionId}
                </span>
              ) : (
                <span className="text-amber-600">Select a study session first</span>
              )}
            </div>
            <Button
              onClick={handleRepairProtocol}
              disabled={isRepairing || !originalProtocol.trim() || !sessionId}
            >
              {isRepairing ? (
                "Repairing..."
              ) : (
                <>
                  <FilePenLine className="mr-2 h-4 w-4" />
                  Repair Protocol
                </>
              )}
            </Button>
          </CardFooter>
        </TabsContent>

        <TabsContent value="fixed" className="space-y-4 pt-4">
          <CardContent className="space-y-4">
            {changes.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-2">Changes Made:</h3>
                <Accordion type="single" collapsible className="w-full">
                  {changes.map((change, index) => (
                    <AccordionItem key={index} value={`item-${index}`}>
                      <AccordionTrigger className="text-sm">
                        <div className="flex items-center">
                          <Badge variant={change.type === "addition" ? "default" : "secondary"} className="mr-2">
                            {change.type === "addition" ? "Added" : "Modified"}
                          </Badge>
                          {change.section || `Change ${index + 1}`}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="text-sm space-y-2 p-2 border rounded-md bg-muted/30">
                          <p><strong>Reason:</strong> {change.reason}</p>
                          {change.before && (
                            <div>
                              <p className="text-muted-foreground">Before:</p>
                              <p className="p-1 bg-red-50 border border-red-100 rounded text-xs font-mono">
                                {change.before}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-muted-foreground">After:</p>
                            <p className="p-1 bg-green-50 border border-green-100 rounded text-xs font-mono">
                              {change.after}
                            </p>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            <ScrollArea className="h-[300px] rounded-md border p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap">{fixedProtocol}</pre>
            </ScrollArea>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Alert className="w-fit">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Protocol Improved</AlertTitle>
              <AlertDescription>
                Fixed {changes.length} issues according to regulatory standards
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={handleDownloadFixed}>
              <Download className="mr-2 h-4 w-4" />
              Download Fixed Protocol
            </Button>
          </CardFooter>
        </TabsContent>
      </Tabs>
    </Card>
  );
}