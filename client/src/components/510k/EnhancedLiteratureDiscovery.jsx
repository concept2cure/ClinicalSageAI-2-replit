/**
 * Enhanced Literature Discovery Component
 *
 * This component provides advanced literature search and discovery capabilities
 * for 510(k) submissions, including semantic search, citation management,
 * and AI-powered summaries.
 */

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { useTenant } from '../../contexts/TenantContext.tsx';
import { Newspaper, BookCopy, FileText } from 'lucide-react'

import EnhancedLiteratureSearch from './EnhancedLiteratureSearch';
import CitationManager from './CitationManager';
import LiteratureSummaryGenerator from './LiteratureSummaryGenerator';

const EnhancedLiteratureDiscovery = ({ deviceProfile, onLiteratureAdded }) => {
  const [activeTab, setActiveTab] = useState('search');
  const [selectedArticles, setSelectedArticles] = useState([]);
  const { toast } = useToast();
  const { currentOrganization } = useTenant();

  const handleArticleSelect = article => {
    if (!selectedArticles.some(a => a.id === article.id)) {
      setSelectedArticles(prevArticles => [...prevArticles, article]);
      toast({
        title: 'Article added',
        description: `"${article.title}" added to your citations`,
      });
    } else {
      toast({
        title: 'Article already added',
        description: 'This article is already in your citations',
        variant: 'default',
      });
    }
  };

  const handleArticleRemove = articleId => {
    setSelectedArticles(selectedArticles.filter(article => article.id !== articleId));
    toast({
      title: 'Article removed',
      description: 'Article removed from your citations',
    });
  };

  const handleAddToCitations = citations => {
    if (onLiteratureAdded) {
      onLiteratureAdded(citations);
    }

    toast({
      title: 'Citations added',
      description: `${citations.length} citations added to your submission`,
    });

    // Switch to citation manager tab
    setActiveTab('citations');
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Enhanced Literature Discovery</CardTitle>
        <CardDescription>
          Search, manage, and analyze scientific literature for your 510(k) submission
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-6">
            <TabsTrigger value="search" className="flex items-center">
              <Newspaper className="h-4 w-4 mr-2" />
              Search &amp; Discovery
            </TabsTrigger>
            <TabsTrigger
              value="citations"
              className="flex items-center"
              disabled={selectedArticles.length === 0}
            >
              <BookCopy className="h-4 w-4 mr-2" />
              Citation Manager
              {selectedArticles.length > 0 && (
                <span className="ml-2 text-xs bg-primary/20 text-primary rounded-full px-2">
                  {selectedArticles.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="summaries"
              className="flex items-center"
              disabled={selectedArticles.length === 0}
            >
              <FileText className="h-4 w-4 mr-2" />
              AI Summaries
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            <EnhancedLiteratureSearch
              deviceProfile={deviceProfile}
              onArticleSelect={handleArticleSelect}
              selectedArticleIds={selectedArticles.map(a => a.id)}
            />
          </TabsContent>

          <TabsContent value="citations">
            <CitationManager
              articles={selectedArticles}
              onArticleRemove={handleArticleRemove}
              onAddToCitations={handleAddToCitations}
            />
          </TabsContent>

          <TabsContent value="summaries">
            <LiteratureSummaryGenerator articles={selectedArticles} deviceProfile={deviceProfile} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EnhancedLiteratureDiscovery;
