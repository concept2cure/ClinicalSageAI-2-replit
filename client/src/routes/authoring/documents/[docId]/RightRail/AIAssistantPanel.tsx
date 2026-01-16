import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { insertSmartDraft } from '@/components/editor/commands/insertSmartDraft';
import { LumenAIService } from '@/services/LumenAIService';
import { useToast } from '@/hooks/use-toast';
import type { SourceReference } from '@/services/LumenAIService';
import { SourceCitationList } from './components/SourceCitationList';

type EditorWindow = Window & { __indEditor?: Editor | null };
type Region = 'FDA' | 'EMA' | 'PMDA' | 'WHO';

interface AIAssistantPanelProps {
  documentId: string;
  productName: string;
  region: Region;
  section?: string;
}

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  documentId,
  productName,
  region,
  section = '3.2.P',
}) => {
  const [isDrafting, setIsDrafting] = useState(false);
  const [sources, setSources] = useState<SourceReference[]>([]);
  const { toast } = useToast();

  const handleDraftContent = async () => {
    const editor = (window as EditorWindow).__indEditor ?? null;

    if (!editor) {
      toast({
        title: 'No active editor',
        description: 'Open a document section before drafting AI content.',
        variant: 'destructive',
      });
      return;
    }

    setIsDrafting(true);
    setSources([]);

    try {
      const response = await LumenAIService.generateSectionDraft({
        documentId,
        sectionId: section ?? '2.5-clinical-overview',
        context: `Summarize efficacy results for ${productName} (${region})`,
      });

      if (!response.success) {
        throw new Error('AI service returned a failure status');
      }

      insertSmartDraft(editor, response.markdown, { sources: response.sources });
      setSources(response.sources ?? []);

      toast({
        title: 'Draft inserted',
        description: 'AI Co-Author added a structured paragraph with live data chips.',
      });
    } catch (error) {
      console.error('[AI Draft] Failed to insert draft:', error);
      toast({
        title: 'Draft failed',
        description: 'AI Co-Author could not generate a draft. Please try again.',
        variant: 'destructive',
      });
      setSources([]);
    } finally {
      setIsDrafting(false);
    }
  };

  return (
    <Card data-testid="ai-assistant-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          AI Co-Author
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Generate a structured conclusion with live Smart Data chips. The output is parsed into the
          editor so reviewers can trace every claim back to source evidence.
        </p>
        <Button
          onClick={() => void handleDraftContent()}
          disabled={isDrafting}
          variant="default"
          size="sm"
        >
          {isDrafting ? 'Drafting...' : 'Draft Narrative'}
        </Button>
        <SourceCitationList sources={sources} />
      </CardContent>
    </Card>
  );
};

export default AIAssistantPanel;
