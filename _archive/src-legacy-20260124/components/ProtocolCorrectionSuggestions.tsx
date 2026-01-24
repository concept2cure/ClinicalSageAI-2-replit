import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertCircle as AlertCircleIcon, CheckCircle as CheckCircleIcon, ClipboardCopy as ClipboardCopyIcon, Lightbulb as LightbulbIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

// Define interfaces
interface CSRContext {
  id?: string | number;
  title?: string;
  indication?: string;
}

interface ProtocolData {
  // Protocol data structure
  title?: string;
  version?: string;
  sample_size?: number | string;
}

type SuggestionStatus = 'critical' | 'important' | 'suggested';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  recommendation: string;
  rationale: string;
  section: string;
  status: SuggestionStatus;
}

interface SuggestionsByCategory {
  critical: Suggestion[];
  important: Suggestion[];
  suggested: Suggestion[];
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  onCopy: (text: string) => void;
  onAccept: (id: string) => void;
  getStatusIcon: (status: SuggestionStatus) => React.ReactNode;
  getStatusColor: (status: SuggestionStatus) => string;
}

interface ProtocolCorrectionSuggestionsProps {
  csrContext?: CSRContext;
  protocolData?: ProtocolData;
}

/**
 * ProtocolCorrectionSuggestions component provides AI-generated recommendations
 * for protocol improvements based on CSR precedents.
 */
const ProtocolCorrectionSuggestions: React.FC<ProtocolCorrectionSuggestionsProps> = ({ csrContext, protocolData }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SuggestionStatus>('critical');
  
  const [suggestions, setSuggestions] = useState<SuggestionsByCategory>({
    critical: [
      {
        id: 'c1',
        title: 'Sample Size Concerns',
        description: 'Current sample size appears inadequate based on CSR precedent for similar trials.',
        recommendation: 'Consider increasing sample size from 120 to at least 150 participants to achieve adequate statistical power for primary endpoint.',
        rationale: 'Historical success rates for similar trials suggest a minimum of 150 participants to detect the expected treatment effect with 90% power.',
        section: 'Study Design',
        status: 'critical'
      },
      {
        id: 'c2',
        title: 'Endpoint Definition Issue',
        description: 'Primary endpoint lacks specific measurement timepoint, which differs from successful precedent.',
        recommendation: 'Specify that primary endpoint should be assessed at Week 12 rather than "end of treatment" to align with regulatory precedent.',
        rationale: 'All 5 approved drugs in this class used a fixed timepoint of Week 12 for primary efficacy assessment.',
        section: 'Endpoints',
        status: 'critical'
      }
    ],
    important: [
      {
        id: 'i1',
        title: 'Inclusion Criteria Gap',
        description: 'Missing key patient characteristic in inclusion criteria found in similar successful protocols.',
        recommendation: 'Add inclusion criterion: "Patients must have documented failure of at least one prior therapy" to align with precedent.',
        rationale: 'All approved drugs for this indication specified prior treatment failure in protocol inclusion criteria.',
        section: 'Eligibility',
        status: 'important'
      },
      {
        id: 'i2',
        title: 'Statistical Method Divergence',
        description: 'Proposed statistical approach differs from recent successful trials.',
        recommendation: 'Consider using MMRM (Mixed Model Repeated Measures) instead of LOCF for handling missing data.',
        rationale: 'Recent regulatory guidance and approved protocols have shifted from LOCF to MMRM for improved handling of missing data.',
        section: 'Statistics',
        status: 'important'
      }
    ],
    suggested: [
      {
        id: 's1',
        title: 'Dosing Schedule Optimization',
        description: 'Alternative dosing schedule may improve adherence based on precedent.',
        recommendation: 'Consider weekly rather than twice-weekly dosing to improve patient compliance while maintaining efficacy.',
        rationale: 'Recent trials for similar molecules showed equivalent efficacy with weekly dosing and improved patient adherence.',
        section: 'Treatment Plan',
        status: 'suggested'
      },
      {
        id: 's2',
        title: 'Additional Safety Monitoring',
        description: 'Enhanced monitoring for specific adverse event could strengthen safety profile.',
        recommendation: 'Add liver enzyme monitoring at weeks 2, 4, and 8 to address known class effect.',
        rationale: 'Similar compounds have shown transient liver enzyme elevations; early monitoring allows for dose adjustment if needed.',
        section: 'Safety',
        status: 'suggested'
      },
      {
        id: 's3',
        title: 'Secondary Endpoint Addition',
        description: 'Consider additional endpoint to strengthen regulatory package.',
        recommendation: 'Add quality of life measure (e.g., SF-36) as secondary endpoint to support value proposition.',
        rationale: 'Recent successful submissions included quality of life measures as supportive endpoints.',
        section: 'Endpoints',
        status: 'suggested'
      }
    ]
  });

  const getStatusIcon = (status: SuggestionStatus): React.ReactNode => {
    switch (status) {
      case 'critical':
        return <AlertCircleIcon className="h-5 w-5 text-red-500" />;
      case 'important':
        return <AlertCircleIcon className="h-5 w-5 text-amber-500" />;
      case 'suggested':
        return <LightbulbIcon className="h-5 w-5 text-blue-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: SuggestionStatus): string => {
    switch (status) {
      case 'critical':
        return 'bg-red-500';
      case 'important':
        return 'bg-amber-500';
      case 'suggested':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const copySuggestion = (text: string): void => {
    navigator.clipboard.writeText(text);
    // toast call replaced
  // Original: toast({
      title: "Copied to clipboard",
      description: "Suggestion copied for easy insertion into protocol",
    })
  console.log('Toast would show:', {
      title: "Copied to clipboard",
      description: "Suggestion copied for easy insertion into protocol",
    });
  };

  const acceptSuggestion = (id: string): void => {
    // This would typically update the protocol with the suggested change
    // For now, just show a toast confirmation
    // toast call replaced
  // Original: toast({
      title: "Suggestion accepted",
      description: "The suggested change will be applied to the protocol",
      icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />
    })
  console.log('Toast would show:', {
      title: "Suggestion accepted",
      description: "The suggested change will be applied to the protocol",
      icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />
    });
    
    // In a real implementation, this would update the protocol document
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LightbulbIcon className="h-5 w-5 text-amber-500" />
          Protocol Optimization Suggestions
        </CardTitle>
        <CardDescription>
          AI-generated recommendations based on CSR precedent analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="critical" value={activeTab} onValueChange={(value) => setActiveTab(value as SuggestionStatus)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="critical" className="relative">
              Critical
              {suggestions.critical.length > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white">
                  {suggestions.critical.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="important" className="relative">
              Important
              {suggestions.important.length > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-amber-500 text-white">
                  {suggestions.important.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="suggested" className="relative">
              Suggested
              {suggestions.suggested.length > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-blue-500 text-white">
                  {suggestions.suggested.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="critical" className="space-y-4 mt-4">
            {suggestions.critical.map((suggestion) => (
              <SuggestionCard 
                key={suggestion.id}
                suggestion={suggestion}
                onCopy={copySuggestion}
                onAccept={acceptSuggestion}
                getStatusIcon={getStatusIcon}
                getStatusColor={getStatusColor}
              />
            ))}
          </TabsContent>
          
          <TabsContent value="important" className="space-y-4 mt-4">
            {suggestions.important.map((suggestion) => (
              <SuggestionCard 
                key={suggestion.id}
                suggestion={suggestion}
                onCopy={copySuggestion}
                onAccept={acceptSuggestion}
                getStatusIcon={getStatusIcon}
                getStatusColor={getStatusColor}
              />
            ))}
          </TabsContent>
          
          <TabsContent value="suggested" className="space-y-4 mt-4">
            {suggestions.suggested.map((suggestion) => (
              <SuggestionCard 
                key={suggestion.id}
                suggestion={suggestion}
                onCopy={copySuggestion}
                onAccept={acceptSuggestion}
                getStatusIcon={getStatusIcon}
                getStatusColor={getStatusColor}
              />
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const SuggestionCard: React.FC<SuggestionCardProps> = ({ 
  suggestion, 
  onCopy, 
  onAccept, 
  getStatusIcon, 
  getStatusColor 
}) => {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          {getStatusIcon(suggestion.status)}
          <div>
            <h4 className="font-medium">{suggestion.title}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{suggestion.description}</p>
          </div>
        </div>
        <Badge className={`${getStatusColor(suggestion.status)} text-white`}>
          {suggestion.section}
        </Badge>
      </div>
      
      <Separator className="my-3" />
      
      <div className="mt-2">
        <div className="text-sm font-medium">Recommendation:</div>
        <p className="text-sm mt-1 p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
          {suggestion.recommendation}
        </p>
      </div>
      
      <div className="mt-3">
        <div className="text-sm font-medium">Rationale:</div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{suggestion.rationale}</p>
      </div>
      
      <div className="flex justify-end mt-4 gap-2">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => onCopy(suggestion.recommendation)}
          className="gap-1"
        >
          <ClipboardCopyIcon className="h-3.5 w-3.5" />
          Copy
        </Button>
        <Button 
          size="sm"
          onClick={() => onAccept(suggestion.id)}
          className="gap-1"
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          Accept
        </Button>
      </div>
    </div>
  );
};

export default ProtocolCorrectionSuggestions;