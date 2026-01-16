import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, ChevronDown, ChevronUp, Download, ExternalLink, Sparkles } from 'lucide-react'
import AIStudyConversation from './AIStudyConversation';

const SimilarStudyResults = ({ results, searchQuery, onClear }) => {
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [expandedStudies, setExpandedStudies] = useState({});
  const [activeTab, setActiveTab] = useState('results');

  const toggleExpandStudy = studyId => {
    setExpandedStudies(prev => ({
      ...prev,
      [studyId]: !prev[studyId],
    }));
  };

  const handleSelectStudy = study => {
    setSelectedStudy(study);
    setActiveTab('analysis');
  };

  const formatDate = dateString => {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return dateString;
    }
  };

  const calculateMatchScore = study => {
    if (study.matchScore !== undefined) {
      return Math.round(study.matchScore * 100);
    }
    if (study.similarity !== undefined) {
      return Math.round(study.similarity * 100);
    }
    return null;
  };

  const getRelevanceClass = score => {
    if (score > 85) return 'bg-green-100 text-green-800';
    if (score > 70) return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const truncateText = (text, maxLength = 150) => {
    if (!text) return 'No description available';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  const renderStudyCardContent = (study, isExpanded) => {
    const matchScore = calculateMatchScore(study);

    return (
      <>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-lg font-medium">{study.title}</h3>
            <div className="flex flex-wrap gap-2 mt-1 mb-2">
              <Badge variant="outline">{study.phase || 'Phase not specified'}</Badge>
              <Badge variant="outline">{study.indication || 'Indication not specified'}</Badge>
              {study.sampleSize && <Badge variant="outline">{study.sampleSize} participants</Badge>}
              {study.date && <Badge variant="outline">{formatDate(study.date)}</Badge>}
              {study.sponsor && <Badge variant="outline">{study.sponsor}</Badge>}
              {matchScore && (
                <Badge className={getRelevanceClass(matchScore)}>{matchScore}% Match</Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleExpandStudy(study.id)}
            className="mt-1"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {isExpanded
            ? study.summary || 'No detailed description available'
            : truncateText(study.summary)}
        </p>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            {study.primaryEndpoints && (
              <div>
                <h4 className="text-sm font-medium">Primary Endpoints:</h4>
                <ul className="text-sm text-muted-foreground pl-5 list-disc">
                  {Array.isArray(study.primaryEndpoints) ? (
                    study.primaryEndpoints.map((endpoint, i) => <li key={i}>{endpoint}</li>)
                  ) : (
                    <li>{study.primaryEndpoints}</li>
                  )}
                </ul>
              </div>
            )}

            {study.secondaryEndpoints && (
              <div>
                <h4 className="text-sm font-medium">Secondary Endpoints:</h4>
                <ul className="text-sm text-muted-foreground pl-5 list-disc">
                  {Array.isArray(study.secondaryEndpoints) ? (
                    study.secondaryEndpoints.map((endpoint, i) => <li key={i}>{endpoint}</li>)
                  ) : (
                    <li>{study.secondaryEndpoints}</li>
                  )}
                </ul>
              </div>
            )}

            {study.inclusionCriteria && (
              <div>
                <h4 className="text-sm font-medium">Key Inclusion Criteria:</h4>
                <ul className="text-sm text-muted-foreground pl-5 list-disc">
                  {Array.isArray(study.inclusionCriteria) ? (
                    study.inclusionCriteria
                      .slice(0, 5)
                      .map((criteria, i) => <li key={i}>{criteria}</li>)
                  ) : (
                    <li>{study.inclusionCriteria}</li>
                  )}
                  {Array.isArray(study.inclusionCriteria) && study.inclusionCriteria.length > 5 && (
                    <li className="italic">
                      And {study.inclusionCriteria.length - 5} more criteria...
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => handleSelectStudy(study)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Analyze
              </Button>
              {study.externalLink && (
                <Button size="sm" variant="outline" asChild>
                  <a href={study.externalLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Source
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Similar Studies</CardTitle>
            <CardDescription>
              {results.length} studies matching "{searchQuery}"
            </CardDescription>
          </div>
          <Button variant="outline" onClick={onClear}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </div>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-6">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="analysis" disabled={!selectedStudy}>
              AI Analysis
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="results" className="m-0">
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {results.map(study => (
                  <Card key={study.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      {renderStudyCardContent(study, expandedStudies[study.id])}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="flex justify-between border-t px-6 py-4">
            <div className="text-sm text-muted-foreground">
              Select a study and click "Analyze" for AI-powered insights
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Results
            </Button>
          </CardFooter>
        </TabsContent>

        <TabsContent value="analysis" className="m-0">
          <div className="border-t">
            {selectedStudy ? (
              <div className="flex flex-col h-[600px]">
                <div className="p-4 border-b bg-muted/40">
                  <h2 className="text-lg font-semibold">{selectedStudy.title}</h2>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline">{selectedStudy.phase || 'Phase not specified'}</Badge>
                    <Badge variant="outline">
                      {selectedStudy.indication || 'Indication not specified'}
                    </Badge>
                    {selectedStudy.sponsor && (
                      <Badge variant="outline">{selectedStudy.sponsor}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <AIStudyConversation study={selectedStudy} />
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">Select a study to analyze</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default SimilarStudyResults;
