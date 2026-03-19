import { useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DownloadIcon, ImageIcon, FileIcon } from 'lucide-react';

interface TrendingTagsChartProps {
  trendingByMonth: Record<string, Record<string, number>>;
}

const CHART_COLORS = [
  '#6a9bcc',
  '#92a87a',
  '#ffc658',
  '#ff8042',
  '#0088fe',
  '#788c5d',
  '#d97706',
  '#d97757',
  '#9c27b0',
  '#f44336',
];

export default function TrendingTagsChart({ trendingByMonth }: TrendingTagsChartProps) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [tagLimit, setTagLimit] = useState<number>(5);
  const [isExporting, setIsExporting] = useState(false);
  const [drilldownData, setDrilldownData] = useState<{
    month: string;
    tag: string;
    count: number;
  } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Format the monthly data into a format suitable for Recharts
  const chartData = useMemo(() => {
    // No data available
    if (Object.keys(trendingByMonth).length === 0) {
      return [];
    }

    // Get all unique tags across all months
    const allTags = new Set<string>();
    Object.values(trendingByMonth).forEach(monthData => {
      Object.keys(monthData).forEach(tag => allTags.add(tag));
    });

    // Get top N tags based on total frequency
    const tagTotals: Record<string, number> = {};
    allTags.forEach(tag => {
      let total = 0;
      Object.values(trendingByMonth).forEach(monthData => {
        total += monthData[tag] || 0;
      });
      tagTotals[tag] = total;
    });

    const topTags = Object.entries(tagTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, tagLimit)
      .map(([tag]) => tag);

    // Create data points for each month with the top tags
    const months = Object.keys(trendingByMonth).sort();
    return months.map(month => {
      const monthData = { month };

      topTags.forEach(tag => {
        // @ts-ignore - dynamic property access
        monthData[tag] = trendingByMonth[month]?.[tag] || 0;
      });

      return monthData;
    });
  }, [trendingByMonth, tagLimit]);

  // Export chart as PNG or PDF
  const exportChart = (format: 'png' | 'pdf') => {
    if (!chartRef.current) return;

    setIsExporting(true);

    // Using html2canvas library
    import('html2canvas')
      .then(({ default: html2canvas }) => {
        html2canvas(chartRef.current as HTMLElement).then(canvas => {
          if (format === 'png') {
            // Export as PNG
            const link = document.createElement('a');
            link.download = `trending-tags-${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            setIsExporting(false);
          } else {
            // Export as PDF
            import('jspdf')
              .then(({ default: jsPDF }) => {
                const pdf = new jsPDF({
                  orientation: 'landscape',
                  unit: 'mm',
                });

                // Add title
                pdf.setFontSize(16);
                pdf.text('Tag Trends Analysis', 14, 15);

                // Add date
                pdf.setFontSize(10);
                pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);

                // Add chart image
                const imgData = canvas.toDataURL('image/png');
                const width = pdf.internal.pageSize.getWidth();
                const height = pdf.internal.pageSize.getHeight();
                pdf.addImage(imgData, 'PNG', 10, 30, width - 20, height - 60);

                // Add footer
                pdf.setFontSize(8);
                pdf.text('Concept2Cure Study Design Agent Analysis Report', 14, height - 10);

                // Save the PDF
                pdf.save(`trending-tags-${new Date().toISOString().slice(0, 10)}.pdf`);
                setIsExporting(false);
              })
              .catch(err => {
                console.error('Error generating PDF:', err);
                setIsExporting(false);
              });
          }
        });
      })
      .catch(err => {
        console.error('Error exporting chart:', err);
        setIsExporting(false);
      });
  };

  // Handle point click for drill-down
  const handlePointClick = (data: any, index: number) => {
    const month = data.month;
    const entries = Object.entries(data).filter(([key]) => key !== 'month');

    if (entries.length > 0) {
      const [tag, count] = entries[index % entries.length];
      setDrilldownData({ month, tag, count: count as number });
    }
  };

  // If no data, show empty state
  if (chartData.length === 0) {
    return null;
  }

  // Get all tag names from the first data point (excluding 'month')
  const tagNames = Object.keys(chartData[0]).filter(key => key !== 'month');

  return (
    <Card className="border border-gray-200">
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
          <h4 className="text-md font-semibold text-blue-800">📅 Monthly Tag Trends</h4>

          <div className="flex items-center gap-2">
            <Select
              defaultValue={chartType}
              onValueChange={value => setChartType(value as 'line' | 'bar')}
            >
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue placeholder="Chart Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="bar">Bar Chart</SelectItem>
              </SelectContent>
            </Select>

            <Select
              defaultValue={String(tagLimit)}
              onValueChange={value => setTagLimit(Number(value))}
            >
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue placeholder="Tag Limit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Top 3</SelectItem>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative group">
              <Button
                onClick={() => exportChart('png')}
                variant="outline"
                size="sm"
                disabled={isExporting}
                className="h-8 flex items-center gap-1"
              >
                {isExporting ? (
                  <>Exporting...</>
                ) : (
                  <>
                    <DownloadIcon size={14} />
                    Export
                  </>
                )}
              </Button>
              <div className="absolute top-full right-0 mt-1 bg-white rounded-md shadow-md border border-gray-200 p-1 w-36 z-10 hidden group-hover:block">
                <Button
                  onClick={() => exportChart('png')}
                  variant="ghost"
                  size="sm"
                  className="w-full flex items-center justify-start gap-2 mb-1"
                >
                  <ImageIcon size={14} />
                  PNG Image
                </Button>
                <Button
                  onClick={() => exportChart('pdf')}
                  variant="ghost"
                  size="sm"
                  className="w-full flex items-center justify-start gap-2"
                >
                  <FileIcon size={14} />
                  PDF Document
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="h-[400px] w-full" ref={chartRef}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                onClick={data =>
                  data &&
                  handlePointClick(data.activePayload?.[0]?.payload, data.activeTooltipIndex || 0)
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  angle={-45}
                  textAnchor="end"
                  tick={{ fontSize: 12 }}
                  height={70}
                />
                <YAxis />
                <Tooltip
                  formatter={(value, name) => [`${value} mentions`, name]}
                  labelFormatter={label => `Month: ${label}`}
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                />
                <Legend />
                {tagNames.map((tag, i) => (
                  <Line
                    key={tag}
                    type="monotone"
                    dataKey={tag}
                    name={tag}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    activeDot={{ r: 8, onClick: () => {} }}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                onClick={data =>
                  data &&
                  handlePointClick(data.activePayload?.[0]?.payload, data.activeTooltipIndex || 0)
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  angle={-45}
                  textAnchor="end"
                  tick={{ fontSize: 12 }}
                  height={70}
                />
                <YAxis />
                <Tooltip
                  formatter={(value, name) => [`${value} mentions`, name]}
                  labelFormatter={label => `Month: ${label}`}
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                />
                <Legend />
                {tagNames.map((tag, i) => (
                  <Bar
                    key={tag}
                    dataKey={tag}
                    name={tag}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-gray-500 mt-2">
          This chart shows how tag frequency changes over time. Click on any data point to see
          details. Use the Export button to save the chart as an image for reports.
        </p>
      </CardContent>

      {/* Drill-down Dialog */}
      <Dialog open={!!drilldownData} onOpenChange={open => !open && setDrilldownData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag Details</DialogTitle>
            <DialogDescription>Detailed information for the selected data point.</DialogDescription>
          </DialogHeader>

          {drilldownData && (
            <div className="py-4">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-3 rounded-md">
                    <p className="text-sm font-medium text-blue-800">Month</p>
                    <p className="text-lg font-semibold">{drilldownData.month}</p>
                  </div>

                  <div className="bg-purple-50 p-3 rounded-md">
                    <p className="text-sm font-medium text-purple-800">Tag</p>
                    <p className="text-lg font-semibold">{drilldownData.tag}</p>
                  </div>

                  <div className="bg-green-50 p-3 rounded-md">
                    <p className="text-sm font-medium text-green-800">Count</p>
                    <p className="text-lg font-semibold">{drilldownData.count} mentions</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Growth Analysis</h4>
                  <p className="text-sm text-gray-700">
                    {(() => {
                      // Find the previous month
                      const months = chartData.map(d => d.month);
                      const currentMonthIndex = months.indexOf(drilldownData.month);

                      if (currentMonthIndex > 0) {
                        const prevMonth = months[currentMonthIndex - 1];
                        // @ts-ignore - dynamic access
                        const prevCount = chartData[currentMonthIndex - 1][drilldownData.tag] || 0;
                        const growth = drilldownData.count - prevCount;
                        const growthPercent = prevCount
                          ? Math.round((growth / prevCount) * 100)
                          : 0;

                        if (growth > 0) {
                          return `Increased by ${growth} (${growthPercent}%) from ${prevMonth}`;
                        } else if (growth < 0) {
                          return `Decreased by ${Math.abs(growth)} (${Math.abs(growthPercent)}%) from ${prevMonth}`;
                        } else {
                          return `No change from ${prevMonth}`;
                        }
                      } else {
                        return `First appearance in the dataset`;
                      }
                    })()}
                  </p>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Possible Insights</h4>
                  <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                    <li>
                      This tag appears in {Math.round((drilldownData.count / 10) * 100)}% of
                      conversations this month
                    </li>
                    <li>Consider monitoring this trend in future agent interactions</li>
                    <li>May indicate growing interest in this topic area</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
