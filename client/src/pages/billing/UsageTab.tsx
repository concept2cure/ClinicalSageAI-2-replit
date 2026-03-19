import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Download } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

import {
  UsageData,
  apiFetch,
  formatCurrency,
  formatNumber,
  formatDate,
  PIE_COLORS,
} from './billingTypes';

export default function UsageTab() {
  const [range, setRange] = useState<string>('30d');

  const { data, isLoading } = useQuery<UsageData>({
    queryKey: ['billing-usage', range],
    queryFn: () => apiFetch<UsageData>(`/api/billing/usage?range=${range}`),
  });

  function exportCsv() {
    if (!data?.records) return;
    const header = 'Date,Module,Requests,Tokens Used,Cost\n';
    const rows = data.records
      .map((r) => `${r.date},${r.module},${r.requests},${r.tokensUsed},${r.cost.toFixed(4)}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading usage data...
        </div>
      )}

      {data && (
        <>
          {/* Total Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Cost</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.total.cost)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Requests</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.total.requests)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Tokens</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.total.tokens)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Cost Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Daily API Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `$${v}`} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Cost']}
                      labelFormatter={(label: string) => formatDate(label)}
                    />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Module Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cost by Module</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.byModule}
                        dataKey="cost"
                        nameKey="module"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ module, percent }: { module: string; percent: number }) =>
                          `${module} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {data.byModule.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Requests by Module</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byModule} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="module" type="category" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                      <Bar dataKey="requests" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Usage Records Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Tokens Used</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No usage records for this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.records.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{formatDate(r.date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {r.module}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(r.requests)}</TableCell>
                        <TableCell className="text-right">{formatNumber(r.tokensUsed)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.cost)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
