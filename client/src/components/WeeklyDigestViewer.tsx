import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowDown, ArrowUp, ArrowRight, AlertTriangle, Clock, Brain } from 'lucide-react'

// Mock data for the digest - in production, this would come from the backend
const mockDigestData = {
  period: {
    start: '2025-04-01',
    end: '2025-04-08',
  },
  topTags: [
    { name: 'PFS', count: 42, change: 28 },
    { name: 'PHASE 3', count: 38, change: -5 },
    { name: 'ONCOLOGY', count: 35, change: 12 },
    { name: 'OS', count: 29, change: 8 },
    { name: 'SAFETY', count: 27, change: 15 },
  ],
  watchlistSpikes: [
    { name: 'PFS', count: 42, change: 28, previousCount: 33 },
    { name: 'RECIST', count: 18, change: 125, previousCount: 8 },
    { name: 'ORR', count: 15, change: 114, previousCount: 7 },
  ],
  notableInteractions: [
    {
      id: 'conv-123',
      date: '2025-04-05',
      duration: '15m',
      messageCount: 12,
      topic: 'Oncology trial design with PFS primary endpoint',
      tags: ['ONCOLOGY', 'PFS', 'PHASE 3'],
    },
    {
      id: 'conv-124',
      date: '2025-04-04',
      duration: '12m',
      messageCount: 10,
      topic: 'Optimal dosing strategy for diabetes intervention',
      tags: ['DIABETES', 'HBA1C', 'PHASE 2'],
    },
    {
      id: 'conv-125',
      date: '2025-04-07',
      duration: '14m',
      messageCount: 11,
      topic: 'Safety monitoring requirements for cardiovascular trials',
      tags: ['CARDIAC', 'SAFETY', 'AE'],
    },
  ],
};

interface DigestProps {
  data?: typeof mockDigestData;
  onViewConversation?: (id: string) => void;
}

export default function WeeklyDigestViewer({
  data = mockDigestData,
  onViewConversation = () => {},
}: DigestProps) {
  const [currentTab, setCurrentTab] = useState('trends');

  // Format date ranges nicely
  const formatDateRange = () => {
    const start = new Date(data.period.start).toLocaleDateString();
    const end = new Date(data.period.end).toLocaleDateString();
    return `${start} to ${end}`;
  };

  // Helper for tag change indicators
  const renderChangeIndicator = (change: number) => {
    if (change > 0) {
      return (
        <span className="flex items-center text-green-600">
          <ArrowUp size={16} className="mr-1" />
          {change}%
        </span>
      );
    } else if (change < 0) {
      return (
        <span className="flex items-center text-red-600">
          <ArrowDown size={16} className="mr-1" />
          {Math.abs(change)}%
        </span>
      );
    } else {
      return (
        <span className="flex items-center text-gray-600">
          <ArrowRight size={16} className="mr-1" />
          0%
        </span>
      );
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <div>
            📊 Weekly Agent Analytics Digest
            <span className="text-sm font-normal text-gray-500 ml-2">{formatDateRange()}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // This would trigger a PDF or email export in the real implementation
              alert('Export functionality would be implemented here');
            }}
          >
            Export Report
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={currentTab} onValueChange={setCurrentTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="trends">
              <ArrowUp className="w-4 h-4 mr-2" />
              Top Tags
            </TabsTrigger>
            <TabsTrigger value="watchlist">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Watchlist Spikes
            </TabsTrigger>
            <TabsTrigger value="conversations">
              <Brain className="w-4 h-4 mr-2" />
              Notable Interactions
            </TabsTrigger>
          </TabsList>

          {/* Top Tags Tab */}
          <TabsContent value="trends" className="space-y-4">
            <div className="grid gap-4">
              {data.topTags.map((tag, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center">
                    <span className="text-2xl mr-2">{i + 1}.</span>
                    <Badge variant="default" className="mr-2 px-2 py-1">
                      {tag.name}
                    </Badge>
                    <span className="text-gray-700">{tag.count} mentions</span>
                  </div>
                  <div className="flex items-center">{renderChangeIndicator(tag.change)}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-4">
              This report shows the most frequently mentioned tags in agent conversations this week,
              compared to the previous week.
            </p>
          </TabsContent>

          {/* Watchlist Spikes Tab */}
          <TabsContent value="watchlist" className="space-y-4">
            {data.watchlistSpikes.length > 0 ? (
              <div className="grid gap-4">
                {data.watchlistSpikes.map((spike, i) => (
                  <div key={i} className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" />
                        <Badge variant="default" className="mr-2">
                          {spike.name}
                        </Badge>
                      </div>
                      <span className="text-amber-700 font-semibold">
                        +{spike.change}% increase
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">
                      Mentions increased from {spike.previousCount} to {spike.count} in the past
                      week
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                No significant spikes detected in your watchlist tags.
              </div>
            )}
            <p className="text-sm text-gray-500 mt-4">
              Tags on your watchlist with a significant increase (100%+) in mentions are highlighted
              here.
            </p>
          </TabsContent>

          {/* Notable Interactions Tab */}
          <TabsContent value="conversations" className="space-y-4">
            <div className="grid gap-4">
              {data.notableInteractions.map((conversation, i) => (
                <div key={i} className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex justify-between mb-2">
                    <h4 className="font-medium text-blue-800">{conversation.topic}</h4>
                    <span className="text-sm text-gray-500">{conversation.date}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600 mb-3">
                    <Clock size={14} className="mr-1" />
                    <span className="mr-3">{conversation.duration}</span>
                    <span>{conversation.messageCount} messages</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {conversation.tags.map((tag, tagIndex) => (
                      <Badge key={tagIndex} variant="outline" className="bg-white">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-700 hover:text-blue-800 hover:bg-blue-100 mt-1"
                    onClick={() => onViewConversation(conversation.id)}
                  >
                    View Conversation
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-4">
              These are the longest and most substantive agent conversations from the past week.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
