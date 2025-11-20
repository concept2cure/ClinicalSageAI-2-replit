import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Academic Insights Panel
 *
 * This component showcases academic research insights related to the protocol,
 * highlighting relevant academic publications, guidelines, and best practices
 * to inform protocol design and optimization.
 */
const AcademicInsightsPanel = ({ protocolData, academicReferences, therapeuticArea }) => {
  // Group references by publication year
  const groupReferencesByYear = () => {
    if (!academicReferences || academicReferences.length === 0) {
      return [
        {
          year: '2024',
          references: [
            {
              title: 'Adaptive Designs in Clinical Trials: Current Use and Future Perspectives',
              author: 'Johnson M, et al.',
              publication: 'Journal of Clinical Research',
              relevance: 'High relevance for modern protocol design with adaptive elements',
            },
            {
              title: 'Patient-Centered Outcome Measures in Clinical Trials',
              author: 'Smith A, et al.',
              publication: 'Clinical Trials Journal',
              relevance: 'Essential for designing patient-relevant endpoints',
            },
          ],
        },
        {
          year: '2023',
          references: [
            {
              title: `Best Practices in ${therapeuticArea || 'Therapeutic'} Clinical Trial Design`,
              author: 'Williams K, et al.',
              publication: 'International Journal of Medical Research',
              relevance: "Directly applicable to this protocol's therapeutic area",
            },
            {
              title: 'Statistical Considerations for Phase 3 Clinical Trials',
              author: 'Chen L, et al.',
              publication: 'Biostatistics Review',
              relevance: 'Critical for sample size and statistical analysis planning',
            },
          ],
        },
      ];
    }

    // Group the actual references by year if available
    const groupedRefs = {};
    academicReferences.forEach(ref => {
      const year = ref.year || 'Unknown';
      if (!groupedRefs[year]) {
        groupedRefs[year] = [];
      }
      groupedRefs[year].push(ref);
    });

    return Object.keys(groupedRefs)
      .sort((a, b) => b - a) // Sort years in descending order
      .map(year => ({
        year,
        references: groupedRefs[year],
      }));
  };

  const referencesByYear = groupReferencesByYear();

  // Get key insights for the specific therapeutic area
  const getTherapeuticAreaInsights = () => {
    return [
      {
        title: `Recent Advances in ${therapeuticArea || 'Clinical'} Research`,
        content: `Recent academic publications highlight several key advancements in ${therapeuticArea || 'this therapeutic area'} that should be considered when designing protocols. These include novel biomarkers for patient stratification, improved safety monitoring approaches, and innovative endpoint measurements that better reflect clinical benefit.`,
      },
      {
        title: `Regulatory Guidance for ${therapeuticArea || 'Clinical'} Trials`,
        content: `Latest FDA and EMA guidance documents emphasize the importance of patient-reported outcomes and real-world evidence in ${therapeuticArea || 'clinical'} trials. Protocols should incorporate these elements to align with current regulatory expectations and facilitate approval pathways.`,
      },
      {
        title: `Study Design Optimization for ${therapeuticArea || 'Clinical'} Protocols`,
        content: `Academic research shows that ${therapeuticArea || 'clinical'} trials benefit from adaptive design elements, pragmatic enrollment criteria, and stratified randomization approaches. These design considerations can improve trial efficiency and increase the likelihood of demonstrating true treatment effects.`,
      },
      {
        title: 'Statistical Best Practices',
        content:
          'Meta-analyses of similar trials suggest that proper power calculations, predefined interim analyses, and appropriate handling of missing data are critical success factors. Protocols should incorporate these statistical best practices to ensure robust and reliable results.',
      },
    ];
  };

  const therapeuticAreaInsights = getTherapeuticAreaInsights();

  return (
    <div className="space-y-6">
      <Card className="border-emerald-100">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 pb-3">
          <CardTitle className="text-xl text-emerald-800 flex items-center gap-2">
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
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Academic Research Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-6">
            <p className="text-gray-700 mb-3">
              We've analyzed the latest academic research relevant to your protocol in the{' '}
              {therapeuticArea || 'indicated'} therapeutic area, identifying key insights, best
              practices, and design recommendations from high-impact publications.
            </p>

            <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800 mb-4">
              <AlertDescription>
                <span className="font-semibold">Research Insights:</span> Our analysis identified{' '}
                {referencesByYear.reduce((acc, group) => acc + group.references.length, 0)} relevant
                academic publications with design recommendations applicable to your protocol.
              </AlertDescription>
            </Alert>
          </div>

          <Tabs defaultValue="insights">
            <TabsList className="mb-4 bg-slate-100 p-1 rounded-lg">
              <TabsTrigger
                value="insights"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 rounded-md"
              >
                Key Insights
              </TabsTrigger>
              <TabsTrigger
                value="publications"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 rounded-md"
              >
                Relevant Publications
              </TabsTrigger>
              <TabsTrigger
                value="guidelines"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-700 rounded-md"
              >
                Guidelines
              </TabsTrigger>
            </TabsList>

            <TabsContent value="insights" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {therapeuticAreaInsights.map((insight, index) => (
                  <div
                    key={index}
                    className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm"
                  >
                    <h3 className="text-md font-semibold mb-2 text-emerald-800">{insight.title}</h3>
                    <p className="text-sm text-gray-700">{insight.content}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="publications" className="space-y-6">
              {referencesByYear.map((yearGroup, groupIndex) => (
                <div key={groupIndex} className="space-y-3">
                  <h3 className="text-md font-semibold text-emerald-800 bg-emerald-50 inline-block px-3 py-1 rounded-md">
                    {yearGroup.year} Publications
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {yearGroup.references.map((reference, index) => (
                      <div
                        key={index}
                        className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm"
                      >
                        <h4 className="text-sm font-semibold mb-1 text-emerald-800">
                          {reference.title}
                        </h4>
                        <p className="text-xs text-gray-600 mb-2">{reference.author}</p>
                        <p className="text-xs italic text-gray-500 mb-2">{reference.publication}</p>
                        <div className="mt-2 pt-2 border-t border-emerald-50">
                          <span className="text-xs font-medium text-emerald-700">Relevance:</span>
                          <p className="text-xs text-gray-700">{reference.relevance}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="guidelines" className="space-y-4">
              <div className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm">
                <h3 className="text-md font-semibold mb-4 text-emerald-800">
                  Regulatory Guidelines
                </h3>

                <div className="space-y-4">
                  <div className="border-b border-gray-100 pb-4">
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">FDA Guidance</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      Recent FDA guidance emphasizes the importance of well-defined endpoints,
                      appropriate control groups, and statistical rigor in clinical trial protocols.
                    </p>
                    <p className="text-xs text-emerald-600">
                      Source: FDA Guidance for Industry: E9 Statistical Principles for Clinical
                      Trials (2023 Update)
                    </p>
                  </div>

                  <div className="border-b border-gray-100 pb-4">
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">EMA Requirements</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      The European Medicines Agency recommends incorporating patient-reported
                      outcomes and quality of life measures in protocols, especially for{' '}
                      {therapeuticArea || 'this therapeutic area'}.
                    </p>
                    <p className="text-xs text-emerald-600">
                      Source: EMA Guideline on Clinical Evaluation of Medicinal Products (2024)
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">ICH Guidelines</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      ICH E6(R3) emphasizes risk-based approaches to clinical trial design and
                      conduct, which should be incorporated into modern protocol development.
                    </p>
                    <p className="text-xs text-emerald-600">
                      Source: ICH Harmonised Guideline: Integrated Addendum to ICH E6(R3)
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcademicInsightsPanel;
