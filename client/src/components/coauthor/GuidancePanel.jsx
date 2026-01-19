import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lightbulb, ChevronsRight, RefreshCw, ThumbsUp, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { fetchSectionGuidance } from '@/api/coauthor';

// Default guidance for sections without specific data
const defaultGuidance = {
  note: 'This section should follow the ICH CTD format guidelines. Ensure all content is clear, accurate, and supported by appropriate data.',
  tips: [
    'Use consistent terminology throughout the document',
    'Ensure all references are properly cited',
    'Include a table of contents for complex sections',
  ],
};

export default function GuidancePanel({ sectionId }) {
  const [guidance, setGuidance] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchSectionGuidance(sectionId)
      .then(data => {
        if (!isMounted) return;
        const rules = Array.isArray(data?.rules) ? data.rules : [];

        if (!rules.length) {
          setGuidance(defaultGuidance);
          return;
        }

        const severityRank = {
          critical: 0,
          major: 1,
          minor: 2,
          informational: 3,
        };

        const sortedRules = [...rules].sort(
          (a, b) => (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99)
        );

        const topRule = sortedRules[0];
        const tips = sortedRules
          .map(rule => rule.remediation || rule.description)
          .filter(Boolean)
          .slice(0, 3);

        setGuidance({
          note: topRule?.description || defaultGuidance.note,
          tips: tips.length ? tips : defaultGuidance.tips,
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setGuidance(defaultGuidance);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sectionId]);

  const handleCopyTip = tip => {
    navigator.clipboard
      .writeText(tip)
      .then(() => {
        // Would show a toast in real implementation
        console.log('Copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy:', err);
      });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center">
            <Lightbulb className="h-4 w-4 mr-2" />
            Regulatory Guidance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <Lightbulb className="h-4 w-4 mr-2 text-amber-500" />
          Regulatory Guidance
        </CardTitle>
        <CardDescription>AI-powered recommendations for Section {sectionId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-amber-50 border-l-4 border-amber-400 rounded text-sm">
          {guidance.note}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Expert Recommendations:</h4>
          {guidance.tips.map((tip, index) => (
            <div
              key={index}
              className="flex items-start space-x-2 p-2 hover:bg-slate-50 rounded-md group"
            >
              <ChevronsRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm flex-1">{tip}</p>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 flex-shrink-0"
                onClick={() => handleCopyTip(tip)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="pt-1 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs flex items-center text-muted-foreground"
          >
            <ThumbsUp className="h-3 w-3 mr-1" />
            Helpful
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
