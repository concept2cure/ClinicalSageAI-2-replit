import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

/**
 * Enhanced Protocol Intelligence Panel
 *
 * This component showcases the AI-powered protocol intelligence capabilities,
 * highlighting the CSR library matching, historic success rates, and
 * detailed protocol improvement recommendations.
 */
const EnhancedProtocolIntelligencePanel = ({ protocolData, analysisResults, matchedCsrs }) => {
  // Calculate the historic success rate based on matched CSRs
  const calculateHistoricSuccessRate = () => {
    if (!matchedCsrs || matchedCsrs.length === 0) return 0;

    const successfulTrials = matchedCsrs.filter(
      csr => csr.outcome && csr.outcome.toLowerCase().includes('success')
    ).length;

    return Math.round((successfulTrials / matchedCsrs.length) * 100);
  };

  const historicSuccessRate = calculateHistoricSuccessRate();

  // Group CSRs by sponsor company for the competitive landscape
  const groupCsrsByCompany = () => {
    if (!matchedCsrs || matchedCsrs.length === 0) return [];

    const companies = {};
    matchedCsrs.forEach(csr => {
      const sponsor = csr.sponsor || 'Unknown';
      if (!companies[sponsor]) {
        companies[sponsor] = { name: sponsor, count: 0, trials: [] };
      }
      companies[sponsor].count += 1;
      companies[sponsor].trials.push(csr);
    });

    return Object.values(companies).sort((a, b) => b.count - a.count);
  };

  const competitiveLandscape = groupCsrsByCompany();

  // Extract therapeutic areas from matched CSRs
  const getTherapeuticAreas = () => {
    if (!matchedCsrs || matchedCsrs.length === 0) return [];

    const areas = {};
    matchedCsrs.forEach(csr => {
      const area = csr.therapeuticArea || csr.indication || 'Unknown';
      if (!areas[area]) {
        areas[area] = { name: area, count: 0, trials: [] };
      }
      areas[area].count += 1;
      areas[area].trials.push(csr);
    });

    return Object.values(areas).sort((a, b) => b.count - a.count);
  };

  const therapeuticAreas = getTherapeuticAreas();

  return (
    <div className="space-y-6">
      <Card className="border-blue-100">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
          <CardTitle className="text-xl text-blue-800 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10z" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 19v-2" />
              <path d="M12 7V5" />
              <path d="M19 12h-2" />
              <path d="M7 12H5" />
              <path d="m16.95 7.05-.7.7" />
              <path d="m7.75 16.25-.7.7" />
              <path d="m16.95 16.95-.7-.7" />
              <path d="m7.75 7.75-.7-.7" />
            </svg>
            Enhanced Protocol Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-6">
            <p className="text-gray-700 mb-3">
              Our advanced AI has analyzed your protocol against our comprehensive CSR intelligence
              library to identify patterns, insights, and opportunities for optimization.
            </p>

            <Alert className="bg-blue-50 border-blue-200 text-blue-800 mb-4">
              <AlertDescription>
                <span className="font-semibold">Protocol Analysis:</span> We found{' '}
                {matchedCsrs.length} similar clinical trials in our database matching your
                therapeutic area ({protocolData.indication}) and phase (
                {protocolData.phase.replace('phase', 'Phase ')}).
              </AlertDescription>
            </Alert>
          </div>

          <Tabs defaultValue="success-metrics">
            <TabsList className="mb-4 bg-slate-100 p-1 rounded-lg">
              <TabsTrigger
                value="success-metrics"
                className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
              >
                Success Metrics
              </TabsTrigger>
              <TabsTrigger
                value="therapeutic-areas"
                className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
              >
                Therapeutic Areas
              </TabsTrigger>
              <TabsTrigger
                value="competitive"
                className="data-[state=active]:bg-white data-[state=active]:text-blue-700 rounded-md"
              >
                Competitive Landscape
              </TabsTrigger>
            </TabsList>

            <TabsContent value="success-metrics" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                  <h3 className="text-md font-semibold mb-2 text-blue-800">
                    Historic Success Rate
                  </h3>
                  <div className="flex items-center justify-center py-4">
                    <div className="relative w-32 h-32">
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <circle cx="50" cy="50" r="45" fill="#EFF6FF" />
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="transparent"
                          stroke="#DBEAFE"
                          strokeWidth="10"
                          strokeDasharray="283"
                          strokeDashoffset="0"
                          transform="rotate(-90 50 50)"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="transparent"
                          stroke="#3B82F6"
                          strokeWidth="10"
                          strokeDasharray="283"
                          strokeDashoffset={283 - (283 * historicSuccessRate) / 100}
                          strokeLinecap="round"
                          transform="rotate(-90 50 50)"
                        />
                        <text
                          x="50"
                          y="50"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="24"
                          fontWeight="bold"
                          fill="#1E40AF"
                        >
                          {historicSuccessRate}%
                        </text>
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 text-center">
                    Based on {matchedCsrs.length} similar trials in our CSR library with the same
                    therapeutic area and phase.
                  </p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm">
                  <h3 className="text-md font-semibold mb-2 text-indigo-800">
                    Protocol Quality Score
                  </h3>
                  <div className="mt-6 space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">
                          Regulatory Alignment
                        </span>
                        <span className="text-sm font-medium text-blue-700">
                          {analysisResults?.regulatoryAlignmentScore || 0}%
                        </span>
                      </div>
                      <Progress
                        value={analysisResults?.regulatoryAlignmentScore || 0}
                        className="h-2 bg-blue-100"
                        indicatorClassName="bg-blue-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">
                          CSR Library Alignment
                        </span>
                        <span className="text-sm font-medium text-indigo-700">
                          {analysisResults?.csrAlignmentScore || 0}%
                        </span>
                      </div>
                      <Progress
                        value={analysisResults?.csrAlignmentScore || 0}
                        className="h-2 bg-indigo-100"
                        indicatorClassName="bg-indigo-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">
                          Academic Alignment
                        </span>
                        <span className="text-sm font-medium text-emerald-700">
                          {analysisResults?.academicAlignmentScore || 0}%
                        </span>
                      </div>
                      <Progress
                        value={analysisResults?.academicAlignmentScore || 0}
                        className="h-2 bg-emerald-100"
                        indicatorClassName="bg-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm">
                  <h3 className="text-md font-semibold mb-2 text-emerald-800">
                    Key Success Factors
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {analysisResults?.keySuggestions?.slice(0, 5).map((item, i) => (
                      <li key={i} className="flex items-start">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-emerald-500 mr-2 mt-1 flex-shrink-0"
                        >
                          <path d="m9 12 2 2 4-4" />
                          <path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 4.6 9c-1 .6-1.7 1.8-1.7 3s.7 2.4 1.7 3c-.3 1.2 0 2.5 1 3.4.8.8 2.1 1.1 3.3.8.6 1 1.8 1.7 3 1.7s2.4-.6 3-1.7c1.2.3 2.5 0 3.4-1 .8-.8 1.1-2.1.8-3.3 1-.6 1.7-1.8 1.7-3s-.7-2.4-1.7-3c.3-1.2 0-2.5-1-3.4-.8-.8-2.1-1.1-3.3-.8A3.6 3.6 0 0 0 12 3z" />
                        </svg>
                        <span className="text-sm text-gray-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="therapeutic-areas" className="space-y-4">
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                <h3 className="text-md font-semibold mb-4 text-blue-800">
                  Relevant Therapeutic Areas
                </h3>

                <div className="space-y-3">
                  {therapeuticAreas.map((area, index) => (
                    <div
                      key={index}
                      className="border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{area.name}</span>
                        <span className="text-sm font-medium text-blue-700">
                          {area.count} trials
                        </span>
                      </div>
                      <Progress
                        value={(area.count / matchedCsrs.length) * 100}
                        className="h-2 bg-blue-100"
                        indicatorClassName="bg-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {area.trials[0]?.title?.substring(0, 60)}...
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="competitive" className="space-y-4">
              <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm">
                <h3 className="text-md font-semibold mb-4 text-indigo-800">
                  Competitive Sponsor Landscape
                </h3>

                <div className="space-y-4">
                  {competitiveLandscape.map((company, index) => (
                    <div
                      key={index}
                      className="border-b border-gray-100 pb-4 last:border-0 last:pb-0"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{company.name}</span>
                        <span className="text-sm font-medium text-indigo-700">
                          {company.count} trials
                        </span>
                      </div>
                      <Progress
                        value={(company.count / matchedCsrs.length) * 100}
                        className="h-2 bg-indigo-100"
                        indicatorClassName="bg-indigo-500"
                      />

                      <div className="mt-2 space-y-1">
                        {company.trials.slice(0, 2).map((trial, idx) => (
                          <div key={idx} className="text-xs text-gray-600 flex gap-2">
                            <span className="text-indigo-500">•</span>
                            <span>{trial.title?.substring(0, 60)}...</span>
                          </div>
                        ))}
                        {company.trials.length > 2 && (
                          <div className="text-xs text-indigo-600 font-medium">
                            +{company.trials.length - 2} more trials
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnhancedProtocolIntelligencePanel;
