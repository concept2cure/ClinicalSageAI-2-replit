import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, FileSearch, Shield } from 'lucide-react'

export default function QualityRiskAssessment() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2" />
          Quality Risk Assessment
        </CardTitle>
        <CardDescription>FMEA risk analysis summary</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left font-medium p-2">Risk Area</th>
                <th className="text-left font-medium p-2">Risk Score</th>
                <th className="text-left font-medium p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2">Raw Material Variability</td>
                <td className="p-2">
                  <div className="flex items-center">
                    <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 w-[60%]" />
                    </div>
                    <span className="ml-2">6/10</span>
                  </div>
                </td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                    Monitoring
                  </span>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-2">Process Robustness</td>
                <td className="p-2">
                  <div className="flex items-center">
                    <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 w-[30%]" />
                    </div>
                    <span className="ml-2">3/10</span>
                  </div>
                </td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Controlled
                  </span>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-2">Stability Risk</td>
                <td className="p-2">
                  <div className="flex items-center">
                    <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 w-[20%]" />
                    </div>
                    <span className="ml-2">2/10</span>
                  </div>
                </td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Controlled
                  </span>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-2">Analytical Method Reliability</td>
                <td className="p-2">
                  <div className="flex items-center">
                    <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 w-[10%]" />
                    </div>
                    <span className="ml-2">1/10</span>
                  </div>
                </td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Controlled
                  </span>
                </td>
              </tr>
              <tr className="border-t">
                <td className="p-2">Container Closure Integrity</td>
                <td className="p-2">
                  <div className="flex items-center">
                    <div className="h-2 w-16 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 w-[40%]" />
                    </div>
                    <span className="ml-2">4/10</span>
                  </div>
                </td>
                <td className="p-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                    Monitoring
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="pt-2">
          <h3 className="text-sm font-medium mb-2">Risk Mitigation Actions</h3>
          <div className="space-y-2">
            <div className="flex items-start">
              <div className="h-5 w-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 text-xs font-medium mr-2 mt-0.5 flex-shrink-0">
                1
              </div>
              <div className="text-sm">
                <span className="font-medium">Raw Material Variability</span>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Implementing additional raw material specifications for critical attributes and
                  increasing testing frequency for high-risk suppliers.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="h-5 w-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 text-xs font-medium mr-2 mt-0.5 flex-shrink-0">
                2
              </div>
              <div className="text-sm">
                <span className="font-medium">Container Closure</span>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Conducting additional integrity testing under stress conditions and evaluating
                  alternative packaging suppliers for more robust materials.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" className="w-full">
          <Shield className="h-4 w-4 mr-2" />
          View Full Risk Assessment
        </Button>
      </CardFooter>
    </Card>
  );
}
