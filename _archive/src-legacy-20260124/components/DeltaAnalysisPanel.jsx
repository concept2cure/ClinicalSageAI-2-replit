import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

/**
 * Enhanced Delta Analysis Panel Component
 * Displays comprehensive field-level differences between two CSRs
 */
const DeltaAnalysisPanel = ({ data }) => {
  if (!data || !data.delta) {
    return null;
  }

  const { delta, csr_ids } = data;

  return (
    <div className="mt-10">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold mb-4">Field-Level Delta Analysis</h2>
        <Badge variant="outline" className="mb-2">
          CSR #{csr_ids[0]} vs. #{csr_ids[1]}
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-green-700 mb-4">{delta.summary}</p>

          <Tabs defaultValue="ae" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ae">Adverse Events</TabsTrigger>
              <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
              <TabsTrigger value="dropout">Dropout Rates</TabsTrigger>
            </TabsList>

            {/* AE Keywords Tab */}
            <TabsContent value="ae" className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Differing AE Keywords</h3>
              <p className="text-xs text-muted-foreground mb-2">{delta.AE_summary}</p>

              {delta.AE_keywords.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {delta.AE_keywords.map((term, idx) => (
                    <div key={idx} className="text-xs p-2 bg-gray-50 rounded-md">
                      {term}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic">No significant AE keyword differences found</p>
              )}
            </TabsContent>

            {/* Endpoints Tab */}
            <TabsContent value="endpoints" className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Endpoint Differences</h3>
              <p className="text-xs text-muted-foreground mb-2">{delta.endpoints.summary}</p>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-medium">Primary Endpoints</h4>
                  <Separator className="my-2" />
                  {delta.endpoints.primary.length > 0 ? (
                    <ul className="space-y-1">
                      {delta.endpoints.primary.map((endpoint, idx) => (
                        <li key={idx} className="text-xs p-2 bg-blue-50 rounded-md">
                          {endpoint}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs italic">No primary endpoint differences found</p>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-medium">Secondary Endpoints</h4>
                  <Separator className="my-2" />
                  {delta.endpoints.secondary.length > 0 ? (
                    <ul className="space-y-1">
                      {delta.endpoints.secondary.map((endpoint, idx) => (
                        <li key={idx} className="text-xs p-2 bg-indigo-50 rounded-md">
                          {endpoint}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs italic">No secondary endpoint differences found</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Dropout Tab */}
            <TabsContent value="dropout" className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Dropout Analysis</h3>
              <p className="text-xs text-muted-foreground mb-2">{delta.dropout.summary}</p>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs font-medium">CSR #{csr_ids[0]}</p>
                    <p className="text-sm font-bold mt-1">
                      {delta.dropout.rates.csr1 || 'Not reported'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Completion: {delta.dropout.completion.csr1 || 'Not reported'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs font-medium">CSR #{csr_ids[1]}</p>
                    <p className="text-sm font-bold mt-1">
                      {delta.dropout.rates.csr2 || 'Not reported'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Completion: {delta.dropout.completion.csr2 || 'Not reported'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4">
                <h4 className="text-xs font-medium">Differing Dropout Reasons</h4>
                <Separator className="my-2" />
                {delta.dropout.reasons.length > 0 ? (
                  <ul className="space-y-1">
                    {delta.dropout.reasons.map((reason, idx) => (
                      <li key={idx} className="text-xs p-2 bg-red-50 rounded-md">
                        {reason}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs italic">No differing dropout reasons found</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeltaAnalysisPanel;
