import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function SessionSummaryPanel({ sessionId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const fetchSummary = async () => {
    const res = await fetch(`/api/session/summary/${sessionId}`);
    const data = await res.json();
    setSummary(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchSummary();
  }, [sessionId]);

  const handleExportSummary = async () => {
    try {
      setExporting(true);
      
      // toast call replaced
  // Original: toast({
        title: "Preparing Export",
        description: "Generating session summary report...",
      })
  console.log('Toast would show:', {
        title: "Preparing Export",
        description: "Generating session summary report...",
      });
      
      // Call the API endpoint to generate the summary report
      const response = await fetch(`/api/export/session-summary/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          include_timestamp: true,
          format: 'pdf'
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate summary export");
      }
      
      // Trigger download
      window.open(`/api/download/session-summary/${sessionId}`, '_blank');
      
      // toast call replaced
  // Original: toast({
        title: "Export Ready",
        description: "Session summary report has been prepared and downloaded",
      })
  console.log('Toast would show:', {
        title: "Export Ready",
        description: "Session summary report has been prepared and downloaded",
      });
    } catch (error) {
      console.error("Failed to export summary:", error);
      // toast call replaced
  // Original: toast({
        title: "Export Failed",
        description: "There was an error generating your summary report",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Export Failed",
        description: "There was an error generating your summary report",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">🔄 Loading session summary…</p>;
  }

  return (
    <Card className="border border-blue-100 bg-blue-50">
      <CardContent className="p-4">
        <h2 className="text-lg font-semibold mb-2">📋 Session Summary</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Study ID: <strong>{summary.session_id}</strong><br />
          Last Updated: {summary.last_updated}
        </p>
        <ul className="text-sm space-y-1">
          {Object.entries(summary.generated_files).map(([key, value]) => (
            <li key={key} className="flex items-center gap-2">
              {value ? "✅" : "❌"} {key.replace(/_/g, " ").toUpperCase()}
            </li>
          ))}
        </ul>
        <Button
          className="mt-4 w-full"
          variant="outline"
          onClick={handleExportSummary}
          disabled={exporting}
        >
          {exporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Preparing Export...
            </>
          ) : (
            "📄 Export Summary Snapshot"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}