// --- TrialSage Enterprise: Document Recommendation Sidebar Component ---

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Star, FileText, Users, TrendingUp, Clock, AlertCircle, Sparkles, RefreshCw, BookOpen, Eye, User } from 'lucide-react'

import {
  getPersonalizedRecommendations,
  getSimilarDocuments,
  getTeamRecommendations,
  getTrendingDocuments,
  logDocumentInteraction,
} from '@/services/RecommendationService';

export default function RecommendationSidebar({
  userId,
  tenantId,
  currentDocument,
  currentFolder,
  onDocumentSelect,
}) {
  const [activeTab, setActiveTab] = useState('personalized');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Recommendation state
  const [recommendations, setRecommendations] = useState({
    personalized: [],
    similar: [],
    team: [],
    trending: [],
  });

  // Load recommendations based on active tab
  useEffect(() => {
    if (!userId || !tenantId) return;

    loadRecommendations(activeTab);
  }, [activeTab, userId, tenantId, currentDocument]);

  // Load recommendations for the specified type
  const loadRecommendations = async type => {
    setLoading(true);
    setError(null);

    try {
      let result = [];

      switch (type) {
        case 'personalized':
          result = await getPersonalizedRecommendations({
            userId,
            tenantId,
            context: currentFolder,
            limit: 5,
          });
          break;

        case 'similar':
          if (currentDocument) {
            result = await getSimilarDocuments(currentDocument.id, {
              tenantId,
              limit: 5,
            });
          }
          break;

        case 'team':
          result = await getTeamRecommendations({
            userId,
            tenantId,
            limit: 5,
          });
          break;

        case 'trending':
          result = await getTrendingDocuments({
            tenantId,
            timeframe: 'week',
            limit: 5,
          });
          break;

        default:
          result = [];
      }

      setRecommendations(prev => ({
        ...prev,
        [type]: result,
      }));
    } catch (err) {
      console.error(`Error loading ${type} recommendations:`, err);
      setError(`Failed to load ${type} recommendations`);
    } finally {
      setLoading(false);
    }
  };

  // Handle document click
  const handleDocumentClick = async doc => {
    // Log interaction for recommendation improvement
    try {
      await logDocumentInteraction({
        documentId: doc.id,
        userId,
        action: 'view',
        metadata: {
          source: 'recommendation',
          recommendationType: activeTab,
        },
        tenantId,
      });
    } catch (err) {
      console.error('Error logging document interaction:', err);
    }

    // Call parent handler
    if (onDocumentSelect) {
      onDocumentSelect(doc);
    }
  };

  // Render loading skeleton
  const renderLoading = () => (
    <div className="space-y-4 py-2">
      <Skeleton className="h-20 w-full rounded-md" />
      <Skeleton className="h-20 w-full rounded-md" />
      <Skeleton className="h-20 w-full rounded-md" />
    </div>
  );

  // Render error state
  const renderError = () => (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <AlertCircle className="h-10 w-10 text-red-500 mb-2" />
      <p className="text-sm text-gray-600">{error}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => loadRecommendations(activeTab)}
      >
        Try Again
      </Button>
    </div>
  );

  // Render empty state
  const renderEmpty = message => (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <FileText className="h-10 w-10 text-gray-300 mb-2" />
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );

  // Get current recommendations based on active tab
  const getCurrentRecommendations = () => {
    return recommendations[activeTab] || [];
  };

  // Render content based on state
  const renderContent = () => {
    if (loading) {
      return renderLoading();
    }

    if (error) {
      return renderError();
    }

    const currentRecs = getCurrentRecommendations();

    if (activeTab === 'similar' && !currentDocument) {
      return renderEmpty('Select a document to see similar content');
    }

    if (currentRecs.length === 0) {
      return renderEmpty(
        activeTab === 'personalized'
          ? 'Interact with more documents to get personalized recommendations'
          : `No ${activeTab} recommendations available`
      );
    }

    return (
      <div className="space-y-3 py-1">
        {currentRecs.map((doc, index) => (
          <DocumentCard
            key={index}
            document={doc}
            onClick={() => handleDocumentClick(doc)}
            type={activeTab}
          />
        ))}
      </div>
    );
  };

  return (
    <Card className="shadow-md h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center">
          <Sparkles className="h-5 w-5 text-blue-500 mr-2" />
          Intelligent Recommendations
        </CardTitle>
        <CardDescription>Documents tailored to your activity</CardDescription>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="px-4">
          <TabsList className="w-full">
            <TabsTrigger value="personalized" className="flex-1">
              <Star className="h-4 w-4 mr-2" />
              For You
            </TabsTrigger>
            <TabsTrigger value="similar" className="flex-1" disabled={!currentDocument}>
              <BookOpen className="h-4 w-4 mr-2" />
              Similar
            </TabsTrigger>
            <TabsTrigger value="team" className="flex-1">
              <Users className="h-4 w-4 mr-2" />
              Team
            </TabsTrigger>
            <TabsTrigger value="trending" className="flex-1">
              <TrendingUp className="h-4 w-4 mr-2" />
              Trending
            </TabsTrigger>
          </TabsList>
        </div>

        <CardContent className="h-[calc(100%-6rem)] overflow-hidden">
          <ScrollArea className="h-full pr-2">{renderContent()}</ScrollArea>
        </CardContent>
      </Tabs>

      <div className="px-4 pb-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => loadRecommendations(activeTab)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

// Document card component
function DocumentCard({ document, onClick, type }) {
  // Format percentage from score (0-1)
  const formatScore = score => {
    if (!score) return null;
    return Math.round(score * 100);
  };

  // Get score field based on recommendation type
  const getScoreInfo = () => {
    if (!document) return null;

    switch (type) {
      case 'personalized':
        return {
          field: 'relevanceScore',
          label: 'Relevance',
        };
      case 'similar':
        return {
          field: 'similarityScore',
          label: 'Similarity',
        };
      case 'team':
        return {
          field: 'popularity',
          label: 'Popularity',
        };
      default:
        return null;
    }
  };

  // Format timestamp to relative time
  const formatRelativeTime = timestamp => {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const scoreInfo = getScoreInfo();
  const scoreValue =
    scoreInfo && document[scoreInfo.field] ? formatScore(document[scoreInfo.field]) : null;

  return (
    <div
      className="border rounded-md p-3 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{document.name}</h4>
          <p className="text-xs text-gray-500">{document.type}</p>
        </div>

        {scoreValue && (
          <div className="ml-2 px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-full flex items-center">
            {scoreInfo.label}: {scoreValue}%
          </div>
        )}
      </div>

      {/* Additional information based on recommendation type */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {type === 'team' && document.team && (
            <Badge variant="outline" className="text-xs">
              {document.team}
            </Badge>
          )}

          {type === 'trending' && document.views && (
            <div className="flex items-center text-xs text-gray-500">
              <Eye className="h-3.5 w-3.5 mr-1" />
              {document.views} views
            </div>
          )}

          {type === 'trending' && document.uniqueUsers && (
            <div className="flex items-center text-xs text-gray-500">
              <User className="h-3.5 w-3.5 mr-1" />
              {document.uniqueUsers} users
            </div>
          )}

          {type === 'personalized' && document.reason && (
            <div className="text-xs text-gray-500 italic">{document.reason}</div>
          )}
        </div>

        {document.lastViewed && (
          <div className="text-xs text-gray-500">{formatRelativeTime(document.lastViewed)}</div>
        )}
      </div>
    </div>
  );
}
