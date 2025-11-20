import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  BarChart2,
  Check,
  Sparkles,
  RotateCcw,
  Save,
  Clipboard,
  Plus,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function ProtocolForm({ draft, onChange, onRegenerate }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Handle saving the protocol
  const handleSave = () => {
    setIsSaving(true);

    // Simulate API call delay
    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: 'Protocol saved',
        description: 'Your protocol has been saved successfully.',
      });
    }, 800);
  };

  // Handle regenerating a section with AI
  const handleRegenerate = () => {
    setIsGenerating(true);

    // Call the provided regenerate function
    if (onRegenerate) {
      onRegenerate()
        .then(() => {
          setIsGenerating(false);
          toast({
            title: 'Protocol regenerated',
            description: 'Protocol section has been regenerated with AI assistance.',
          });
        })
        .catch(error => {
          setIsGenerating(false);
          toast({
            title: 'Regeneration failed',
            description: error.message,
            variant: 'destructive',
          });
        });
    } else {
      // Simulate API call delay if no function provided
      setTimeout(() => {
        setIsGenerating(false);
        toast({
          title: 'Protocol regenerated',
          description: 'Protocol section has been regenerated with AI assistance.',
        });
      }, 2000);
    }
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-xl font-semibold flex items-center">
          <FileText className="h-5 w-5 mr-2 text-blue-600" />
          Study Protocol
        </CardTitle>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="gap-1.5"
          >
            {isGenerating ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Regenerating...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Regenerate with AI</span>
              </>
            )}
          </Button>
          <Button onClick={handleSave} disabled={isSaving} size="sm" className="gap-1.5">
            {isSaving ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Protocol</span>
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="details" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full md:w-[400px]">
            <TabsTrigger value="details">Study Details</TabsTrigger>
            <TabsTrigger value="design">Study Design</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="studyTitle">Study Title</Label>
                <Input
                  id="studyTitle"
                  placeholder="Enter study title"
                  value={draft.title || ''}
                  onChange={e => onChange({ ...draft, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phase">Study Phase</Label>
                <Input
                  id="phase"
                  placeholder="e.g., Phase 1, Phase 2a"
                  value={draft.phase || ''}
                  onChange={e => onChange({ ...draft, phase: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sponsor">Sponsor</Label>
                <Input
                  id="sponsor"
                  placeholder="Enter sponsor name"
                  value={draft.sponsor || ''}
                  onChange={e => onChange({ ...draft, sponsor: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="indication">Indication</Label>
                <Input
                  id="indication"
                  placeholder="Enter therapeutic indication"
                  value={draft.indication || ''}
                  onChange={e => onChange({ ...draft, indication: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="objective">Study Objective</Label>
              <Textarea
                id="objective"
                placeholder="Describe the primary objective of the study"
                className="min-h-[100px]"
                value={draft.objective || ''}
                onChange={e => onChange({ ...draft, objective: e.target.value })}
              />
            </div>
          </TabsContent>

          <TabsContent value="design" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="studyDesign">Study Design</Label>
                <Input
                  id="studyDesign"
                  placeholder="e.g., Randomized, Double-blind, Placebo-controlled"
                  value={draft.design || ''}
                  onChange={e => onChange({ ...draft, design: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Study Duration</Label>
                <Input
                  id="duration"
                  placeholder="e.g., 12 weeks"
                  value={draft.duration || ''}
                  onChange={e => onChange({ ...draft, duration: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="population">Study Population</Label>
                <Input
                  id="population"
                  placeholder="e.g., Adult patients with T2DM"
                  value={draft.population || ''}
                  onChange={e => onChange({ ...draft, population: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sampleSize">Sample Size</Label>
                <Input
                  id="sampleSize"
                  placeholder="e.g., 120 patients"
                  value={draft.sampleSize || ''}
                  onChange={e => onChange({ ...draft, sampleSize: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eligibility">Eligibility Criteria</Label>
              <Textarea
                id="eligibility"
                placeholder="Describe inclusion and exclusion criteria"
                className="min-h-[150px]"
                value={draft.eligibility || ''}
                onChange={e => onChange({ ...draft, eligibility: e.target.value })}
              />
            </div>
          </TabsContent>

          <TabsContent value="endpoints" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primaryEndpoint">Primary Endpoint</Label>
              <Textarea
                id="primaryEndpoint"
                placeholder="Describe primary endpoint"
                className="min-h-[80px]"
                value={draft.primaryEndpoint || ''}
                onChange={e => onChange({ ...draft, primaryEndpoint: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryEndpoints">Secondary Endpoints</Label>
              <Textarea
                id="secondaryEndpoints"
                placeholder="List secondary endpoints"
                className="min-h-[120px]"
                value={draft.secondaryEndpoints || ''}
                onChange={e => onChange({ ...draft, secondaryEndpoints: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="safetyEndpoints">Safety Endpoints</Label>
              <Textarea
                id="safetyEndpoints"
                placeholder="Describe safety assessments"
                className="min-h-[80px]"
                value={draft.safetyEndpoints || ''}
                onChange={e => onChange({ ...draft, safetyEndpoints: e.target.value })}
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
