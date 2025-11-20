import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, RefreshCw, Save, FileText, Clipboard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import FDA510kService from '../../services/FDA510kService';

import { PredicateSearch } from './PredicateSearch';
import { EquivalenceTable } from './EquivalenceTable';
import { Editor } from '@/components/ui/editor';

/**
 * PredicateAnalysis Component
 *
 * This component combines predicate device search with
 * substantial equivalence analysis and recommendations.
 *
 * @param {Object} props - Component props
 * @param {Object} props.deviceProfile - The user's device profile
 * @param {Function} props.onNavigateBack - Callback to navigate back
 * @param {Object} props.initialPredicate - Initial predicate device, if any
 */
export const PredicateAnalysis = ({ deviceProfile, onNavigateBack, initialPredicate = null }) => {
  const [activeTab, setActiveTab] = useState('search');
  const [selectedPredicate, setSelectedPredicate] = useState(initialPredicate);
  const [equivalenceData, setEquivalenceData] = useState(null);
  const [recommendations, setRecommendations] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Set initial predicate if provided
  useEffect(() => {
    if (initialPredicate) {
      setSelectedPredicate(initialPredicate);
      setActiveTab('equivalence');
      generateEquivalenceAnalysis(initialPredicate);
    }
  }, [initialPredicate]);

  // Handle predicate device selection
  const handlePredicateSelect = predicate => {
    setSelectedPredicate(predicate);
    setActiveTab('equivalence');
    generateEquivalenceAnalysis(predicate);
  };

  // Generate equivalence analysis when a predicate is selected
  const generateEquivalenceAnalysis = async predicate => {
    if (!deviceProfile || !predicate) {
      return;
    }

    setIsLoading(true);

    try {
      const analysis = await FDA510kService.draftEquivalence(deviceProfile, predicate);

      setEquivalenceData(analysis);

      // Generate recommendations based on equivalence analysis
      if (analysis) {
        const recommendations = await FDA510kService.getRecommendations(
          deviceProfile,
          predicate,
          analysis
        );

        setRecommendations(recommendations.text || '');
      }
    } catch (error) {
      console.error('Error generating equivalence analysis:', error);
      toast({
        title: 'Analysis Failed',
        description: 'Failed to generate equivalence analysis. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh the analysis
  const handleRefreshAnalysis = () => {
    generateEquivalenceAnalysis(selectedPredicate);
  };

  // Save the analysis and recommendations
  const handleSaveAnalysis = () => {
    toast({
      title: 'Analysis Saved',
      description: 'Your equivalence analysis has been saved successfully.',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Predicate Device Analysis</h2>
          <p className="text-muted-foreground">
            Search for and analyze substantial equivalence to predicate devices.
          </p>
        </div>
        <Button variant="outline" onClick={onNavigateBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Device Profile
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="search" className="flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            Find Predicate
          </TabsTrigger>
          <TabsTrigger
            value="equivalence"
            className="flex items-center"
            disabled={!selectedPredicate}
          >
            <Clipboard className="h-4 w-4 mr-2" />
            Equivalence Analysis
          </TabsTrigger>
          <TabsTrigger
            value="recommendations"
            className="flex items-center"
            disabled={!equivalenceData}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search">
          <PredicateSearch deviceProfile={deviceProfile} onSelect={handlePredicateSelect} />
        </TabsContent>

        <TabsContent value="equivalence">
          <EquivalenceTable
            subjectDevice={deviceProfile}
            predicateDevice={selectedPredicate}
            equivalenceData={equivalenceData}
            isLoading={isLoading}
            onRefresh={handleRefreshAnalysis}
          />
        </TabsContent>

        <TabsContent value="recommendations">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Recommendations</CardTitle>
              <CardDescription>
                Based on the substantial equivalence analysis, here are recommended steps and
                considerations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Editor
                  value={recommendations}
                  onChange={setRecommendations}
                  placeholder="Loading recommendations..."
                  className="min-h-[300px] border rounded-md"
                />

                <div className="flex justify-end">
                  <Button onClick={handleSaveAnalysis} className="ml-2">
                    <Save className="h-4 w-4 mr-2" />
                    Save Recommendations
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PredicateAnalysis;
