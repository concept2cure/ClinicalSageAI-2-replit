import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart,
  BookOpen,
  Clock,
  FileText,
  Loader2,
  Settings,
  Star,
  TrendingUp,
  Users,
  Calendar,
  Eye,
  Download,
  Edit,
  Share2,
  Zap,
  LayoutGrid,
} from 'lucide-react';

import {
  getPersonalizedRecommendations,
  getSimilarDocuments,
  getTeamRecommendations,
  getTrendingDocuments,
  getRecentlyViewedDocuments,
  logDocumentInteraction,
} from '@/services/RecommendationService';

const iconMap = {
  view: <Eye className="h-4 w-4" />,
  download: <Download className="h-4 w-4" />,
  edit: <Edit className="h-4 w-4" />,
  share: <Share2 className="h-4 w-4" />,
};

/**
 * Document Recommendations Component
 *
 * Displays AI-powered document recommendations based on user behavior patterns,
 * content similarity, and team activity.
 */
export default function DocumentRecommendations({
  userId,
  tenantId,
  currentFolder,
  currentDocument,
  onDocumentSelect,
  className,
}) {
  // State
  const [activeTab, setActiveTab] = useState('personalized');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Recommendation state
  const [personalizedRecommendations, setPersonalizedRecommendations] = useState([]);
  const [similarDocuments, setSimilarDocuments] = useState([]);
  const [teamRecommendations, setTeamRecommendations] = useState([]);
  const [trendingDocuments, setTrendingDocuments] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);

  // Recommendation settings
  const [recommendationSettings, setRecommendationSettings] = useState({
    limit: 5,
    includeContent: false,
    timeframe: 'week',
  });

  // Load initial recommendations
  useEffect(() => {
    if (userId && tenantId) {
      if (activeTab === 'personalized') {
        loadPersonalizedRecommendations();
      } else if (activeTab === 'recent') {
        loadRecentDocuments();
      } else if (activeTab === 'trending') {
        loadTrendingDocuments();
      } else if (activeTab === 'team') {
        loadTeamRecommendations();
      }
    }
  }, [userId, tenantId, activeTab]);

  // Load similar document recommendations when current document changes
  useEffect(() => {
    if (currentDocument && activeTab === 'similar') {
      loadSimilarDocuments(currentDocument.id);
    }
  }, [currentDocument, activeTab]);

  // Log document view for current document
  useEffect(() => {
    if (currentDocument && userId) {
      logDocumentInteraction({
        documentId: currentDocument.id,
        userId: userId,
        action: 'view',
        metadata: {
          folder: currentFolder,
          timestamp: new Date().toISOString(),
        },
        tenantId: tenantId,
      }).catch(err => console.error('Error logging document view:', err));
    }
  }, [currentDocument, userId, tenantId]);

  // Load personalized recommendations
  const loadPersonalizedRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);

      const recommendations = await getPersonalizedRecommendations({
        userId: userId,
        limit: recommendationSettings.limit,
        context: currentFolder,
        tenantId: tenantId,
      });

      setPersonalizedRecommendations(recommendations);
    } catch (err) {
      console.error('Error loading personalized recommendations:', err);
      setError('Failed to load personalized recommendations');
    } finally {
      setLoading(false);
    }
  };

  // Load similar documents
  const loadSimilarDocuments = async docId => {
    if (!docId) return;

    try {
      setLoading(true);
      setError(null);

      const recommendations = await getSimilarDocuments(docId, {
        limit: recommendationSettings.limit,
        includeContent: recommendationSettings.includeContent,
        tenantId: tenantId,
      });

      setSimilarDocuments(recommendations);
    } catch (err) {
      console.error('Error loading similar documents:', err);
      setError('Failed to load similar documents');
    } finally {
      setLoading(false);
    }
  };

  // Load team recommendations
  const loadTeamRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);

      const recommendations = await getTeamRecommendations({
        userId: userId,
        limit: recommendationSettings.limit,
        tenantId: tenantId,
      });

      setTeamRecommendations(recommendations);
    } catch (err) {
      console.error('Error loading team recommendations:', err);
      setError('Failed to load team recommendations');
    } finally {
      setLoading(false);
    }
  };

  // Load trending documents
  const loadTrendingDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const recommendations = await getTrendingDocuments({
        timeframe: recommendationSettings.timeframe,
        limit: recommendationSettings.limit,
        tenantId: tenantId,
      });

      setTrendingDocuments(recommendations);
    } catch (err) {
      console.error('Error loading trending documents:', err);
      setError('Failed to load trending documents');
    } finally {
      setLoading(false);
    }
  };

  // Load recent documents
  const loadRecentDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const recommendations = await getRecentlyViewedDocuments(userId, {
        limit: recommendationSettings.limit,
        tenantId: tenantId,
      });

      setRecentDocuments(recommendations);
    } catch (err) {
      console.error('Error loading recent documents:', err);
      setError('Failed to load recent documents');
    } finally {
      setLoading(false);
    }
  };

  // Handle document selection
  const handleDocumentClick = async (document, source) => {
    // Log the interaction
    try {
      await logDocumentInteraction({
        documentId: document.id,
        userId: userId,
        action: 'select',
        metadata: {
          source: source,
          recommendationTab: activeTab,
        },
        tenantId: tenantId,
      });
    } catch (err) {
      console.error('Error logging document selection:', err);
    }

    // Call the parent component's handler
    if (onDocumentSelect) {
      onDocumentSelect(document);
    }
  };

  // Render loading skeleton
  const renderSkeleton = () => (
    <div className="space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );

  // Render error state
  const renderError = message => (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className="text-red-500 mb-2">
        <AlertCircle className="h-10 w-10 mx-auto" />
      </div>
      <p className="text-sm text-gray-600">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => {
          if (activeTab === 'personalized') loadPersonalizedRecommendations();
          else if (activeTab === 'similar') loadSimilarDocuments(currentDocument?.id);
          else if (activeTab === 'team') loadTeamRecommendations();
          else if (activeTab === 'trending') loadTrendingDocuments();
          else if (activeTab === 'recent') loadRecentDocuments();
        }}
      >
        Retry
      </Button>
    </div>
  );

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-500" />
          <span>Recommended Documents</span>
        </CardTitle>
        <CardDescription>Personalized document suggestions based on your activity</CardDescription>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-4">
          <TabsList className="w-full">
            <TabsTrigger value="personalized" className="flex-1">
              <Star className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">For You</span>
            </TabsTrigger>
            <TabsTrigger value="similar" className="flex-1" disabled={!currentDocument}>
              <BookOpen className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Similar</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="flex-1">
              <Users className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
            <TabsTrigger value="trending" className="flex-1">
              <TrendingUp className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Trending</span>
            </TabsTrigger>
            <TabsTrigger value="recent" className="flex-1">
              <Clock className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Recent</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <Separator className="mt-3 mb-0" />

        <CardContent className="pt-3">
          <ScrollArea className="h-[300px] pr-4">
            <TabsContent value="personalized" className="mt-0 p-0">
              {loading ? (
                renderSkeleton()
              ) : error ? (
                renderError(error)
              ) : personalizedRecommendations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <LayoutGrid className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    We'll provide personalized recommendations as you interact with documents.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {personalizedRecommendations.map(doc => (
                    <RecommendationCard
                      key={doc.id}
                      document={doc}
                      onClick={() => handleDocumentClick(doc, 'personalized')}
                      showReason
                      scoreField="relevanceScore"
                      scoreLabel="Relevance"
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="similar" className="mt-0 p-0">
              {!currentDocument ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <FileText className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">Select a document to see similar content</p>
                </div>
              ) : loading ? (
                renderSkeleton()
              ) : error ? (
                renderError(error)
              ) : similarDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <FileText className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">No similar documents found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {similarDocuments.map(doc => (
                    <RecommendationCard
                      key={doc.id}
                      document={doc}
                      onClick={() => handleDocumentClick(doc, 'similar')}
                      showKeywords
                      scoreField="similarityScore"
                      scoreLabel="Similarity"
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="team" className="mt-0 p-0">
              {loading ? (
                renderSkeleton()
              ) : error ? (
                renderError(error)
              ) : teamRecommendations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <Users className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">No team recommendations yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamRecommendations.map(doc => (
                    <RecommendationCard
                      key={doc.id}
                      document={doc}
                      onClick={() => handleDocumentClick(doc, 'team')}
                      showTeam
                      scoreField="popularity"
                      scoreLabel="Popularity"
                      views={doc.viewedBy}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="trending" className="mt-0 p-0">
              {loading ? (
                renderSkeleton()
              ) : error ? (
                renderError(error)
              ) : trendingDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <BarChart className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">No trending documents found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trendingDocuments.map(doc => (
                    <RecommendationCard
                      key={doc.id}
                      document={doc}
                      onClick={() => handleDocumentClick(doc, 'trending')}
                      showViews
                      showUsers
                      views={doc.views}
                      users={doc.uniqueUsers}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recent" className="mt-0 p-0">
              {loading ? (
                renderSkeleton()
              ) : error ? (
                renderError(error)
              ) : recentDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <Clock className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">No recently viewed documents</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDocuments.map(doc => (
                    <RecommendationCard
                      key={doc.id}
                      document={doc}
                      onClick={() => handleDocumentClick(doc, 'recent')}
                      showTimestamp
                      showAction
                      timestamp={doc.timestamp}
                      action={doc.action}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </CardContent>
      </Tabs>

      <CardFooter className="flex justify-between pt-0">
        <div className="text-xs text-gray-500">
          {activeTab === 'trending' && (
            <div className="flex items-center gap-1">
              <button
                className={`px-2 py-1 rounded text-xs font-medium ${recommendationSettings.timeframe === 'day' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
                onClick={() => {
                  setRecommendationSettings({ ...recommendationSettings, timeframe: 'day' });
                  setActiveTab('trending'); // Force reload
                }}
              >
                Today
              </button>
              <button
                className={`px-2 py-1 rounded text-xs font-medium ${recommendationSettings.timeframe === 'week' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
                onClick={() => {
                  setRecommendationSettings({ ...recommendationSettings, timeframe: 'week' });
                  setActiveTab('trending'); // Force reload
                }}
              >
                This Week
              </button>
              <button
                className={`px-2 py-1 rounded text-xs font-medium ${recommendationSettings.timeframe === 'month' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
                onClick={() => {
                  setRecommendationSettings({ ...recommendationSettings, timeframe: 'month' });
                  setActiveTab('trending'); // Force reload
                }}
              >
                This Month
              </button>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Reload current tab data
            if (activeTab === 'personalized') loadPersonalizedRecommendations();
            else if (activeTab === 'similar') loadSimilarDocuments(currentDocument?.id);
            else if (activeTab === 'team') loadTeamRecommendations();
            else if (activeTab === 'trending') loadTrendingDocuments();
            else if (activeTab === 'recent') loadRecentDocuments();
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// Recommendation Card Component
function RecommendationCard({
  document,
  onClick,
  showReason = false,
  showKeywords = false,
  showTeam = false,
  showViews = false,
  showUsers = false,
  showTimestamp = false,
  showAction = false,
  scoreField = null,
  scoreLabel = 'Score',
  views = null,
  users = null,
  timestamp = null,
  action = null,
}) {
  // Format timestamp
  const formatTimestamp = timestamp => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Calculate score percentage
  const scorePercentage = () => {
    if (!scoreField || !document[scoreField]) return null;
    return Math.round(document[scoreField] * 100);
  };

  return (
    <div
      className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-grow min-w-0">
          <h4 className="font-medium text-sm text-gray-900 truncate">{document.name}</h4>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {document.type}
            {document.category && <span> • {document.category}</span>}
          </p>
        </div>

        {scorePercentage() !== null && (
          <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
            {scoreLabel}: {scorePercentage()}%
          </div>
        )}
      </div>

      {showReason && document.reason && (
        <div className="mt-2 text-xs text-gray-600 italic">{document.reason}</div>
      )}

      {showKeywords && document.keywords && document.keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {document.keywords.map((keyword, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {keyword}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {showTeam && document.team && (
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Users className="h-3.5 w-3.5" />
              <span>{document.team}</span>
            </div>
          )}

          {showViews && views !== null && (
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Eye className="h-3.5 w-3.5" />
              <span>{views} views</span>
            </div>
          )}

          {showUsers && users !== null && (
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Users className="h-3.5 w-3.5" />
              <span>{users} users</span>
            </div>
          )}

          {showAction && action && (
            <div className="flex items-center gap-1 text-xs text-gray-600">
              {iconMap[action] || <Eye className="h-3.5 w-3.5" />}
              <span>{action}</span>
            </div>
          )}
        </div>

        {showTimestamp && timestamp && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatRelativeTime(timestamp)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to format relative time
function formatRelativeTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}
