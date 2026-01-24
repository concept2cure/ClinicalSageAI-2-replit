import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Info,
  Download,
  FileText,
  Tag,
  Calendar,
  User,
  BarChart,
} from 'lucide-react';

/**
 * A component to display AI-generated insights with filtering and search capabilities
 */
const InsightsDisplay = ({
  insights = [],
  predicateDevices = [],
  literatureReferences = [],
  onGenerateReport = () => {},
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [openInsight, setOpenInsight] = useState(null);

  // Define insight categories and priority levels for filtering
  const categories = ['predicate', 'literature', 'regulatory', 'technical'];
  const priorities = ['high', 'medium', 'low'];

  // Filter and search insights
  const filteredInsights = useMemo(() => {
    return insights.filter(insight => {
      // Apply category filter
      if (filterCategory !== 'all' && insight.category !== filterCategory) {
        return false;
      }

      // Apply priority filter
      if (filterPriority !== 'all' && insight.priority !== filterPriority) {
        return false;
      }

      // Apply search term filter
      if (
        searchTerm &&
        !insight.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !insight.description.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [insights, searchTerm, filterCategory, filterPriority]);

  // Generate statistics for insights
  const insightStats = useMemo(() => {
    const stats = {
      total: insights.length,
      byCategory: {},
      byPriority: {
        high: insights.filter(i => i.priority === 'high').length,
        medium: insights.filter(i => i.priority === 'medium').length,
        low: insights.filter(i => i.priority === 'low').length,
      },
    };

    // Count by category
    categories.forEach(category => {
      stats.byCategory[category] = insights.filter(i => i.category === category).length;
    });

    return stats;
  }, [insights, categories]);

  // Generate color based on priority
  const getPriorityColor = priority => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Format category name for display
  const formatCategory = category => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  // Toggle insight expansion
  const toggleInsight = id => {
    if (openInsight === id) {
      setOpenInsight(null);
    } else {
      setOpenInsight(id);
    }
  };

  return (
    <div className="bg-white rounded-md border border-gray-200 shadow-sm">
      <Card>
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-blue-700 mb-1 flex items-center">
                <Info className="mr-2 h-5 w-5 text-blue-600" />
                510(k) Submission Insights
              </CardTitle>
              <CardDescription>
                AI-powered analysis and recommendations for your submission
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={onGenerateReport}
            >
              <FileText className="mr-1 h-4 w-4" />
              Generate Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="insights" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="statistics">Statistics</TabsTrigger>
              <TabsTrigger value="predicates">Predicates</TabsTrigger>
              <TabsTrigger value="literature">Literature</TabsTrigger>
            </TabsList>

            <TabsContent value="insights" className="pt-2">
              <div className="flex flex-col">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input
                      type="text"
                      placeholder="Search insights..."
                      className="pl-8 w-full"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={filterCategory}
                      onChange={e => setFilterCategory(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      {categories.map(category => (
                        <option key={category} value={category}>
                          {formatCategory(category)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={filterPriority}
                      onChange={e => setFilterPriority(e.target.value)}
                    >
                      <option value="all">All Priorities</option>
                      {priorities.map(priority => (
                        <option key={priority} value={priority}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {filteredInsights.length === 0 ? (
                  <div className="bg-gray-50 p-8 text-center rounded-md border border-gray-100">
                    <AlertCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                    <h3 className="font-medium text-gray-700 mb-1">No Insights Found</h3>
                    <p className="text-gray-500 text-sm max-w-md mx-auto">
                      {searchTerm || filterCategory !== 'all' || filterPriority !== 'all'
                        ? 'Try adjusting your search or filters to see more results.'
                        : 'No insights have been generated yet. Try running an analysis on your device profile.'}
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {filteredInsights.map((insight, index) => (
                        <Collapsible
                          key={insight.id || index}
                          open={openInsight === (insight.id || index)}
                          onOpenChange={() => toggleInsight(insight.id || index)}
                          className="border rounded-md overflow-hidden"
                        >
                          <CollapsibleTrigger className="flex w-full justify-between items-center p-3 hover:bg-gray-50 focus:outline-none">
                            <div className="flex items-center space-x-3">
                              <div
                                className={`p-1.5 rounded-full ${getPriorityColor(insight.priority).split(' ')[0]}`}
                              >
                                {insight.priority === 'high' && (
                                  <AlertCircle className="h-4 w-4 text-red-600" />
                                )}
                                {insight.priority === 'medium' && (
                                  <Info className="h-4 w-4 text-amber-600" />
                                )}
                                {insight.priority === 'low' && (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                              <div className="text-left">
                                <h3 className="font-medium text-gray-800">{insight.title}</h3>
                                <div className="flex items-center mt-1">
                                  <Badge
                                    variant="outline"
                                    className={`mr-2 ${getPriorityColor(insight.priority)}`}
                                  >
                                    {insight.priority.charAt(0).toUpperCase() +
                                      insight.priority.slice(1)}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {formatCategory(insight.category)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {openInsight === (insight.id || index) ? (
                              <ChevronUp className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="p-4 border-t bg-white">
                              <p className="text-gray-600 mb-3">{insight.description}</p>
                              {insight.recommendation && (
                                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-md p-3">
                                  <h4 className="font-medium text-blue-700 mb-1 flex items-center">
                                    <Lightbulb className="mr-2 h-4 w-4 text-blue-600" />
                                    Recommendation
                                  </h4>
                                  <p className="text-blue-600 text-sm">{insight.recommendation}</p>
                                </div>
                              )}
                              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                                <div className="flex items-center text-xs text-gray-500">
                                  <Calendar className="mr-1 h-3 w-3" />
                                  {new Date(insight.timestamp || Date.now()).toLocaleDateString()}
                                </div>
                                {insight.source && (
                                  <Badge
                                    variant="outline"
                                    className="bg-gray-50 text-gray-600 border-gray-200"
                                  >
                                    Source: {insight.source}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </TabsContent>

            <TabsContent value="statistics" className="pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                  <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                    <BarChart className="mr-2 h-4 w-4 text-blue-600" />
                    Insights by Priority
                  </h3>
                  <div className="space-y-3">
                    {priorities.map(priority => (
                      <div key={priority} className="flex items-center">
                        <div
                          className={`w-3 h-3 rounded-full mr-2 ${getPriorityColor(priority).split(' ')[0]}`}
                        ></div>
                        <span className="text-sm text-gray-700 mr-3">
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getPriorityColor(priority).split(' ')[0]}`}
                            style={{
                              width: `${(insightStats.byPriority[priority] / insightStats.total) * 100 || 0}%`,
                            }}
                          ></div>
                        </div>
                        <span className="ml-3 text-xs text-gray-500">
                          {insightStats.byPriority[priority] || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-md border border-gray-200 shadow-sm">
                  <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                    <Tag className="mr-2 h-4 w-4 text-blue-600" />
                    Insights by Category
                  </h3>
                  <div className="space-y-3">
                    {categories.map(category => {
                      // Define colors for categories
                      const categoryColors = {
                        predicate: 'bg-blue-100',
                        literature: 'bg-purple-100',
                        regulatory: 'bg-indigo-100',
                        technical: 'bg-teal-100',
                      };

                      return (
                        <div key={category} className="flex items-center">
                          <div
                            className={`w-3 h-3 rounded-full mr-2 ${categoryColors[category] || 'bg-gray-100'}`}
                          ></div>
                          <span className="text-sm text-gray-700 mr-3">
                            {formatCategory(category)}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${categoryColors[category] || 'bg-gray-300'}`}
                              style={{
                                width: `${(insightStats.byCategory[category] / insightStats.total) * 100 || 0}%`,
                              }}
                            ></div>
                          </div>
                          <span className="ml-3 text-xs text-gray-500">
                            {insightStats.byCategory[category] || 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="predicates" className="pt-2">
              {predicateDevices.length === 0 ? (
                <div className="bg-gray-50 p-8 text-center rounded-md border border-gray-100">
                  <AlertCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                  <h3 className="font-medium text-gray-700 mb-1">No Predicate Devices Found</h3>
                  <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Use the predicate discovery tool to find potential predicate devices for your
                    submission.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {predicateDevices.map((device, index) => (
                    <div key={device.id || index} className="border rounded-md p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-gray-800">
                            {device.deviceName || 'Unknown Device'}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {device.manufacturer || 'Unknown Manufacturer'}
                          </p>
                        </div>
                        {device.matchScore && (
                          <Badge
                            variant="outline"
                            className={`${getPriorityColor(device.matchScore >= 0.75 ? 'low' : device.matchScore >= 0.5 ? 'medium' : 'high')}`}
                          >
                            {Math.round(device.matchScore * 100)}% Match
                          </Badge>
                        )}
                      </div>

                      {device.description && (
                        <p className="text-sm text-gray-600 mt-3 line-clamp-3">
                          {device.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {device.deviceClass && (
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-100"
                          >
                            Class {device.deviceClass}
                          </Badge>
                        )}
                        {device.kNumber && (
                          <Badge
                            variant="outline"
                            className="bg-gray-50 text-gray-700 border-gray-200"
                          >
                            {device.kNumber}
                          </Badge>
                        )}
                        {device.decisionDate && (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-100"
                          >
                            Approved: {new Date(device.decisionDate).toLocaleDateString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="literature" className="pt-2">
              {literatureReferences.length === 0 ? (
                <div className="bg-gray-50 p-8 text-center rounded-md border border-gray-100">
                  <AlertCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                  <h3 className="font-medium text-gray-700 mb-1">No Literature References Found</h3>
                  <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Use the literature discovery tool to find relevant scientific literature for
                    your submission.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {literatureReferences.map((reference, index) => (
                    <div key={reference.id || index} className="border rounded-md p-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-medium text-gray-800">
                          {reference.title || 'Untitled Reference'}
                        </h3>
                        {reference.relevanceScore && (
                          <Badge
                            variant="outline"
                            className={`${getPriorityColor(reference.relevanceScore >= 0.75 ? 'low' : reference.relevanceScore >= 0.5 ? 'medium' : 'high')}`}
                          >
                            {Math.round(reference.relevanceScore * 100)}% Relevant
                          </Badge>
                        )}
                      </div>

                      {reference.authors && (
                        <p className="text-sm text-gray-600 mt-1 flex items-center">
                          <User className="mr-1 h-3 w-3" />
                          {reference.authors}
                        </p>
                      )}

                      {reference.abstract && (
                        <p className="text-sm text-gray-600 mt-3 line-clamp-3">
                          {reference.abstract}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex flex-wrap gap-2">
                          {reference.journal && (
                            <Badge
                              variant="outline"
                              className="bg-purple-50 text-purple-700 border-purple-100"
                            >
                              {reference.journal}
                            </Badge>
                          )}
                          {reference.publicationDate && (
                            <Badge
                              variant="outline"
                              className="bg-gray-50 text-gray-700 border-gray-200"
                            >
                              {new Date(reference.publicationDate).getFullYear()}
                            </Badge>
                          )}
                        </div>

                        {reference.url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600"
                            onClick={() => window.open(reference.url, '_blank')}
                          >
                            View Source
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsightsDisplay;
