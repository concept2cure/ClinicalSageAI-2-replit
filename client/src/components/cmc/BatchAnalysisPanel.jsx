import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileBarChart, RefreshCw, ChartBar } from 'lucide-react'

export default function BatchAnalysisPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <ChartBar className="h-4 w-4 mr-2" />
          Batch Analysis
        </CardTitle>
        <CardDescription>Recent manufacturing batch results</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left font-medium p-2">Batch</th>
                <th className="text-left font-medium p-2">Assay (%)</th>
                <th className="text-left font-medium p-2">Impurities (%)</th>
                <th className="text-left font-medium p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2">B-23095</td>
                <td className="p-2">99.3</td>
                <td className="p-2">0.08</td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Released
                  </span>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-2">B-23094</td>
                <td className="p-2">98.7</td>
                <td className="p-2">0.12</td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Released
                  </span>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-2">B-23093</td>
                <td className="p-2">99.1</td>
                <td className="p-2">0.09</td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Released
                  </span>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-2">B-23092</td>
                <td className="p-2">97.8</td>
                <td className="p-2">0.15</td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Released
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Statistical Analysis</div>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 border rounded-md bg-card">
            <div className="text-xs text-muted-foreground mb-1">Assay</div>
            <div className="text-lg font-medium">98.7% ± 0.6%</div>
            <div className="text-xs text-muted-foreground">95% CI</div>
          </div>
          <div className="p-3 border rounded-md bg-card">
            <div className="text-xs text-muted-foreground mb-1">Impurities</div>
            <div className="text-lg font-medium">0.11% ± 0.03%</div>
            <div className="text-xs text-muted-foreground">95% CI</div>
          </div>
          <div className="p-3 border rounded-md bg-card">
            <div className="text-xs text-muted-foreground mb-1">Cpk (Assay)</div>
            <div className="text-lg font-medium">1.32</div>
            <div className="text-xs text-muted-foreground">Process capability</div>
          </div>
          <div className="p-3 border rounded-md bg-card">
            <div className="text-xs text-muted-foreground mb-1">Batch-to-Batch RSD</div>
            <div className="text-lg font-medium">0.63%</div>
            <div className="text-xs text-muted-foreground">Relative std dev</div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" className="w-full">
          <FileBarChart className="h-4 w-4 mr-2" />
          View Trending Analysis
        </Button>
      </CardFooter>
    </Card>
  );
}
