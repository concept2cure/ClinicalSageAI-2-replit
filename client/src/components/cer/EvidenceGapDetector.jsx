import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, AlertTriangle, Book, Database, ArrowRight } from 'lucide-react';
import CerTooltipWrapper from './CerTooltipWrapper';
import { useToast } from '@/components/ui/toaster';

/**
 * Evidence Gap Detector Component
 *
 * This component analyzes a CER section to identify claims without proper
 * evidence backing. It suggests potential data sources for each gap.
 */
const EvidenceGapDetector = ({ section, onCitationNeeded }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [gaps, setGaps] = useState([]);
  const { toast } = useToast();

  // Evidence gap analysis is performed by the backend AI pipeline, not by
  // client-side keyword heuristics. Never fabricate regulatory findings.
  const analyzeForGaps = async () => {
    setIsAnalyzing(true);

    try {
      const response = await fetch('/api/cer/evidence-gaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: section?.content || '', sectionId: section?.id }),
      });

      if (!response.ok) {
        throw new Error(`Evidence gap service returned ${response.status}`);
      }

      const data = await response.json();
      const detected = Array.isArray(data?.gaps) ? data.gaps : [];
      setGaps(detected);

      if (detected.length === 0) {
        toast({
          title: 'No evidence gaps detected',
          description: 'All claims appear to be properly supported by evidence.',
          variant: 'default',
        });
      }
    } catch (error) {
      toast({
        title: 'Evidence gap analysis unavailable',
        description: 'The evidence gap analyzer is offline. Ask the AI assistant to review your claims manually.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!section) {
    return null;
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center">
          <CerTooltipWrapper
            content={
              <div>
                <p className="font-semibold mb-1">Evidence Gap Detection</p>
                <p>
                  This feature analyzes the section text to identify claims that lack supporting
                  evidence.
                </p>
                <p className="mt-1">
                  Addressing these gaps will strengthen your CER's regulatory compliance.
                </p>
              </div>
            }
          >
            Evidence Gap Detection
          </CerTooltipWrapper>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button onClick={analyzeForGaps} disabled={isAnalyzing} size="sm" className="w-full">
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Section...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Analyze for Evidence Gaps
              </>
            )}
          </Button>

          {gaps.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2 flex items-center text-amber-600">
                <AlertTriangle className="w-4 h-4 mr-1" />
                {gaps.length} Evidence {gaps.length === 1 ? 'Gap' : 'Gaps'} Detected
              </h4>

              <div className="space-y-3">
                {gaps.map((gap, index) => (
                  <div
                    key={index}
                    className="bg-amber-50 border border-amber-200 p-3 rounded-md text-sm"
                  >
                    <p className="font-medium">{gap.claim}</p>
                    <p className="text-gray-600 text-xs mt-1">{gap.suggestion}</p>

                    <div className="flex items-center mt-2">
                      {gap.dataType === 'literature' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-blue-600"
                          onClick={() => onCitationNeeded && onCitationNeeded(gap)}
                        >
                          <Book className="w-3 h-3" />
                          <span>Add Literature Citation</span>
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}

                      {gap.dataType === 'faers' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-blue-600"
                          onClick={() => onCitationNeeded && onCitationNeeded(gap)}
                        >
                          <Database className="w-3 h-3" />
                          <span>Add FAERS Reference</span>
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EvidenceGapDetector;
