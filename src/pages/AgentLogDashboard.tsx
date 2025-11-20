import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import dayjs from 'dayjs';
import TrendingTagsChart from '@/components/TrendingTagsChart';
import TagCorrelationHeatmap from '@/components/TagCorrelationHeatmap';

interface AgentLog {
  timestamp: string;
  message: string;
  response: string;
  csrIds: string[];
  hasContext: boolean;
}

type TagsByLogIndex = Record<number, string[]>;
type TimeSeriesData = Array<{ date: string; count: number; tag: string }>;

// Helper to group logs by time period
type TimeGrouping = 'day' | 'week' | 'month';

export default function AgentLogDashboard() {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [csrId, setCsrId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [endpointStats, setEndpointStats] = useState<Record<string, number>>({});
  const [tagsByLog, setTagsByLog] = useState<TagsByLogIndex>({});
  const [topTags, setTopTags] = useState<[string, number][]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData>([]);
  const [timeGrouping, setTimeGrouping] = useState<TimeGrouping>('week');
  const [tagPairs, setTagPairs] = useState<Record<string, number>>({});
  const [chartColors] = useState<string[]>([
    '#8884d8',
    '#82ca9d',
    '#ffc658',
    '#ff8042',
    '#0088fe',
    '#00C49F',
    '#FFBB28',
    '#FF8042',
    '#9c27b0',
    '#f44336',
  ]);

  // Create a formatter for dates based on the selected grouping
  const formatDate = (dateStr: string, grouping: TimeGrouping): string => {
    const date = new Date(dateStr);

    if (grouping === 'day') {
      return date.toISOString().substring(0, 10);
    } else if (grouping === 'week') {
      // Get the first day of the week (Sunday)
      const firstDay = new Date(date);
      const day = date.getDay();
      firstDay.setDate(date.getDate() - day);
      return firstDay.toISOString().substring(0, 10);
    } else {
      // month
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  };

  // Generate time series data for trending topics
  const generateTimeSeriesData = (
    logs: AgentLog[],
    tagsByLogIndex: TagsByLogIndex,
    topTags: [string, number][],
    grouping: TimeGrouping
  ): TimeSeriesData => {
    const timeSeriesMap = new Map<string, Map<string, number>>();

    // Initialize all dates for all top tags
    topTags.forEach(([tag]) => {
      logs.forEach((log, index) => {
        const logTags = tagsByLogIndex[index] || [];
        if (logTags.includes(tag)) {
          const dateGroup = formatDate(log.timestamp, grouping);

          if (!timeSeriesMap.has(dateGroup)) {
            timeSeriesMap.set(dateGroup, new Map<string, number>());
          }

          const tagCounts = timeSeriesMap.get(dateGroup)!;
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      });
    });

    // Convert to array format for Recharts
    const result: TimeSeriesData = [];

    // Sort dates chronologically
    const sortedDates = Array.from(timeSeriesMap.keys()).sort();

    sortedDates.forEach(date => {
      const tagCounts = timeSeriesMap.get(date)!;

      topTags.forEach(([tag]) => {
        result.push({
          date,
          tag,
          count: tagCounts.get(tag) || 0,
        });
      });
    });

    return result;
  };

  // Format data for bar chart
  const prepareBarChartData = (topTags: [string, number][]) => {
    return topTags.map(([tag, count]) => ({
      tag,
      count,
    }));
  };

  // Calculate tag co-occurrences for the correlation heatmap
  const calculateTagPairs = (tagsByLogIndex: TagsByLogIndex): Record<string, number> => {
    const pairMap: Record<string, number> = {};

    // Loop through each log entry
    Object.values(tagsByLogIndex).forEach(tags => {
      if (tags.length < 2) return; // Need at least 2 tags to form a pair

      // Generate all unique pairs (combinations of 2 tags)
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          // Create a consistent key by sorting tags alphabetically
          const key = [tags[i], tags[j]].sort().join('::');
          pairMap[key] = (pairMap[key] || 0) + 1;
        }
      }
    });

    return pairMap;
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.append('keyword', keyword);
      if (csrId) params.append('csr_id', csrId);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);

      const res = await fetch(`/api/logs/agent?${params.toString()}`);
      const data = await res.json();
      setLogs(data);

      // Setup for analysis
      const termMap: Record<string, number> = {};
      const tagMap: TagsByLogIndex = {};
      const tagCount: Record<string, number> = {};

      // Common endpoints, phases, and indications to detect
      const commonEndpoints = [
        'orr',
        'pfs',
        'os',
        'hba1c',
        'response rate',
        'safety',
        'ae',
        'efficacy',
        'duration',
        'progression',
        'survival',
        'dfs',
        'recist',
      ];

      const phaseTerms = ['phase 1', 'phase 2', 'phase 3', 'phase i', 'phase ii', 'phase iii'];

      const indicationTerms = [
        'oncology',
        'cardiology',
        'neurology',
        'diabetes',
        'immunology',
        'rheumatology',
        'respiratory',
        'gastroenterology',
        'infectious disease',
        'cancer',
        'cardiac',
        'neurological',
        'metabolic',
        'autoimmune',
      ];

      data.forEach((entry: AgentLog, idx: number) => {
        const combinedText = `${entry.message}\n${entry.response}`.toLowerCase();
        const tags: string[] = [];

        // Detect endpoints
        commonEndpoints.forEach(term => {
          if (combinedText.includes(term)) {
            termMap[term] = (termMap[term] || 0) + 1;
            tags.push(term.toUpperCase());
          }
        });

        // Detect phases
        phaseTerms.forEach(term => {
          if (combinedText.includes(term)) {
            const phaseTag = term.toUpperCase();
            tags.push(phaseTag);
          }
        });

        // Detect indications
        indicationTerms.forEach(term => {
          if (combinedText.includes(term)) {
            const indicationTag = term.toUpperCase();
            tags.push(indicationTag);
          }
        });

        // Save tags for this log entry
        if (tags.length > 0) {
          // Deduplicate tags
          const uniqueTags = Array.from(new Set(tags));
          tagMap[idx] = uniqueTags;

          // Count tag frequency across all logs
          uniqueTags.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          });
        }
      });

      // Sort endpoint stats by frequency (descending)
      const sortedStats: Record<string, number> = {};
      Object.entries(termMap)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, value]) => {
          sortedStats[key] = value;
        });

      // Get top 5 trending tags
      const sortedTags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      // Calculate tag pair co-occurrences for the heatmap
      const tagPairsData = calculateTagPairs(tagMap);

      setEndpointStats(sortedStats);
      setTagsByLog(tagMap);
      setTopTags(sortedTags);
      setTagPairs(tagPairsData);

      // Generate time series data for trending tag visualization
      const timeData = generateTimeSeriesData(data, tagMap, sortedTags, timeGrouping);
      setTimeSeriesData(timeData);
    } catch (error) {
      console.error('Error fetching agent logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update time series when timeGrouping changes
  useEffect(() => {
    if (logs.length > 0 && Object.keys(tagsByLog).length > 0 && topTags.length > 0) {
      const timeData = generateTimeSeriesData(logs, tagsByLog, topTags, timeGrouping);
      setTimeSeriesData(timeData);
    }
  }, [timeGrouping]);

  const exportToCSV = () => {
    const headers = ['timestamp', 'message', 'csr_ids', 'response', 'tags'];
    const rows = logs.map((log, idx) => [
      new Date(log.timestamp).toISOString(),
      log.message.replace(/\n/g, ' ').replace(/"/g, '""'),
      log.csrIds?.join(', ') || '',
      log.response.replace(/\n/g, ' ').replace(/"/g, '""'),
      tagsByLog[idx]?.join(', ') || '',
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.map(val => `"${val}"`).join(','))].join(
      '\n'
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agent_logs.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Helper function to get badge color based on tag type
  const getBadgeVariant = (tag: string) => {
    if (tag.includes('PHASE')) return 'secondary';
    if (
      [
        'ONCOLOGY',
        'CARDIOLOGY',
        'NEUROLOGY',
        'DIABETES',
        'IMMUNOLOGY',
        'RHEUMATOLOGY',
        'RESPIRATORY',
        'GASTROENTEROLOGY',
        'INFECTIOUS DISEASE',
        'CANCER',
        'CARDIAC',
        'NEUROLOGICAL',
        'METABOLIC',
        'AUTOIMMUNE',
      ].includes(tag)
    ) {
      return 'destructive';
    }
    return 'default';
  };

  // Prepare data for bar chart
  const barChartData = prepareBarChartData(topTags);

  // Restructure time series data for line chart by tag
  const getLineChartData = () => {
    const dateMap = new Map<string, Record<string, number>>();

    timeSeriesData.forEach(item => {
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, { date: item.date });
      }

      const dateEntry = dateMap.get(item.date)!;
      dateEntry[item.tag] = item.count;
    });

    return Array.from(dateMap.values());
  };

  const lineChartData = getLineChartData();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold text-blue-800">📊 Study Design Agent Logs</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4">
        <Input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="🔍 Keyword"
        />
        <Input value={csrId} onChange={e => setCsrId(e.target.value)} placeholder="🔎 CSR ID" />
        <Input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          placeholder="To"
        />
      </div>

      <div className="flex justify-between items-center pb-4">
        <div className="flex gap-2">
          <Button
            onClick={fetchLogs}
            className="bg-blue-600 text-white hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Apply Filters'}
          </Button>

          <Button
            onClick={() => {
              setKeyword('');
              setCsrId('');
              setDateFrom('');
              setDateTo('');
              setTimeout(fetchLogs, 0);
            }}
            variant="outline"
            disabled={isLoading}
          >
            Clear Filters
          </Button>
        </div>

        <Button
          onClick={exportToCSV}
          className="bg-gray-700 text-white hover:bg-gray-800"
          disabled={isLoading || logs.length === 0}
        >
          📥 Export CSV
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && logs.length === 0 && (
        <div className="text-center py-10 text-gray-500">
          No agent logs found. Try using the agent to generate some logs!
        </div>
      )}

      {/* Analytics Tabs */}
      {!isLoading && logs.length > 0 && (
        <Tabs defaultValue="trends" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="trends">Trending Topics</TabsTrigger>
            <TabsTrigger value="timeline">Time Analysis</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoint Mentions</TabsTrigger>
            <TabsTrigger value="correlations">Tag Correlations</TabsTrigger>
          </TabsList>

          {/* Trending Topics Tab */}
          <TabsContent value="trends" className="space-y-4">
            {topTags.length > 0 && (
              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <h4 className="text-md font-semibold text-purple-800 mb-4">
                    🔥 Top Trending Topics
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bar Chart */}
                    <div className="min-h-[300px]">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={barChartData}
                          margin={{
                            top: 5,
                            right: 30,
                            left: 20,
                            bottom: 60,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="tag"
                            angle={-45}
                            textAnchor="end"
                            tick={{ fontSize: 12 }}
                            height={70}
                          />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" name="Mentions" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Pie Chart */}
                    <div className="min-h-[300px]">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={barChartData}
                            dataKey="count"
                            nameKey="tag"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ tag, count, percent }) =>
                              `${tag}: ${count} (${(percent * 100).toFixed(0)}%)`
                            }
                          >
                            {barChartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={chartColors[index % chartColors.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Topic List */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
                    {topTags.map(([tag, count], i) => (
                      <div
                        key={i}
                        className="text-sm text-gray-700 bg-purple-50 p-2 rounded border"
                      >
                        <span className="font-medium">{tag}</span>: {count} mentions
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Time Analysis Tab */}
          <TabsContent value="timeline" className="space-y-4">
            <Card className="border border-gray-200">
              <CardContent className="pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-md font-semibold text-blue-800">📅 Topic Trends Over Time</h4>

                  <div className="flex gap-2">
                    <Button
                      variant={timeGrouping === 'day' ? 'default' : 'outline'}
                      onClick={() => setTimeGrouping('day')}
                      className="text-xs h-8"
                    >
                      Daily
                    </Button>
                    <Button
                      variant={timeGrouping === 'week' ? 'default' : 'outline'}
                      onClick={() => setTimeGrouping('week')}
                      className="text-xs h-8"
                    >
                      Weekly
                    </Button>
                    <Button
                      variant={timeGrouping === 'month' ? 'default' : 'outline'}
                      onClick={() => setTimeGrouping('month')}
                      className="text-xs h-8"
                    >
                      Monthly
                    </Button>
                  </div>
                </div>

                {/* Line chart for time trends */}
                <div className="min-h-[400px]">
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart
                      data={lineChartData}
                      margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 60,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        angle={-45}
                        textAnchor="end"
                        tick={{ fontSize: 12 }}
                        height={70}
                      />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {topTags.map(([tag], index) => (
                        <Line
                          key={tag}
                          type="monotone"
                          dataKey={tag}
                          name={tag}
                          stroke={chartColors[index % chartColors.length]}
                          activeDot={{ r: 8 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  This chart shows how frequently each topic appears in agent conversations over
                  time, grouped by {timeGrouping}. Use this to identify trends and shifts in user
                  interests.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Endpoints Tab */}
          <TabsContent value="endpoints" className="space-y-4">
            <Card className="border border-gray-200">
              <CardContent className="pt-6">
                <h4 className="text-md font-semibold text-green-800 mb-4">📈 Endpoint Mentions</h4>

                {/* Horizontal bar chart for endpoints */}
                <div className="min-h-[400px]">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart
                      data={Object.entries(endpointStats).map(([term, count]) => ({
                        term: term.toUpperCase(),
                        count,
                      }))}
                      layout="vertical"
                      margin={{
                        top: 5,
                        right: 30,
                        left: 100,
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="term" type="category" width={80} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" name="Mentions" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Endpoint list */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
                  {Object.entries(endpointStats).map(([term, count], i) => (
                    <div key={i} className="text-sm text-gray-700 bg-green-50 p-2 rounded border">
                      🔹 <span className="font-medium">{term.toUpperCase()}</span>: {count} mentions
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tag Correlations Tab */}
          <TabsContent value="correlations" className="space-y-4">
            <Card className="border border-gray-200">
              <CardContent className="pt-6">
                <h4 className="text-md font-semibold text-rose-700 mb-4">
                  🔥 Tag Correlation Heatmap
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  This heatmap shows which tags frequently appear together in the same conversation.
                  Darker colors indicate stronger relationships between tags.
                </p>

                {Object.keys(tagPairs).length > 0 ? (
                  <div className="overflow-auto" style={{ maxHeight: '500px' }}>
                    <TagCorrelationHeatmap tagPairs={tagPairs} />
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Not enough data to generate correlations. Try filtering for more conversations.
                  </div>
                )}

                <div className="mt-4">
                  <h5 className="text-sm font-medium mb-2">Top Tag Pairs:</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {Object.entries(tagPairs)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 6)
                      .map(([pair, count], i) => {
                        const [tag1, tag2] = pair.split('::');
                        return (
                          <div
                            key={i}
                            className="text-sm text-gray-700 bg-rose-50 p-2 rounded border"
                          >
                            <span className="font-medium">{tag1}</span> +{' '}
                            <span className="font-medium">{tag2}</span>: {count} co-occurrences
                          </div>
                        );
                      })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Log Entries */}
      <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">
        Log Entries {logs.length > 0 ? `(${logs.length})` : ''}
      </h3>
      <div className="space-y-4">
        {logs.map((entry, i) => (
          <Card key={i} className="border border-gray-200">
            <CardContent className="space-y-2 pt-6">
              <p className="text-sm text-gray-600">
                🕒 {new Date(entry.timestamp).toLocaleString()}
              </p>
              <p className="text-sm text-blue-700 font-medium">🧑‍💬 Question:</p>
              <p className="text-sm bg-blue-50 p-2 rounded border text-gray-800 whitespace-pre-wrap">
                {entry.message}
              </p>
              {entry.csrIds?.length > 0 && (
                <p className="text-sm text-gray-600 italic">
                  CSR Context: {entry.csrIds.join(', ')}
                </p>
              )}
              <p className="text-sm text-green-700 font-medium">🤖 Response:</p>
              <p className="text-sm bg-green-50 p-2 rounded border whitespace-pre-wrap">
                {entry.response}
              </p>

              {/* Tags */}
              {tagsByLog[i] && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tagsByLog[i].map((tag, idx) => (
                    <Badge key={idx} variant={getBadgeVariant(tag)} className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
