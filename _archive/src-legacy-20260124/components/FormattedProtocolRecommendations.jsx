import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * FormattedProtocolRecommendations
 *
 * This component provides a well-structured, readable format for protocol recommendations,
 * organizing them into sections with clear headings and styling.
 */
const FormattedProtocolRecommendations = ({ recommendation, protocolTitle }) => {
  // Process raw recommendation text into structured sections
  const processRecommendation = text => {
    if (!text) return [];

    // Extract study name/title if available
    const studyTitle = protocolTitle || (text.match(/LMN-\d+|WT\d+/i) || [])[0] || 'Protocol';

    // Split by numbered points (1., 2., etc.) to identify major sections
    const sections = text.split(/\n\s*\d+\.\s+\*\*/).filter(Boolean);

    const introSection = sections.shift() || '';

    // Process each recommendation section
    return sections.map((section, index) => {
      // Extract title
      const titleMatch = section.match(/([^:*]+)\*\*/);
      const title = titleMatch ? titleMatch[1].trim() : `Recommendation ${index + 1}`;

      // Split into subsections based on bullet points
      const content = section.replace(/^[^:*]+\*\*/, '').trim();
      const subsections = content.split(/\n\s*-\s+\*\*/).filter(Boolean);

      // Process each subsection
      const processedSubsections = subsections.map(subsection => {
        const subtitleMatch = subsection.match(/([^:*]+)\*\*/);
        const subtitle = subtitleMatch ? subtitleMatch[1].trim() : '';
        const subcontent = subsection.replace(/^[^:*]+\*\*/, '').trim();

        return {
          subtitle,
          content: subcontent,
        };
      });

      return {
        title,
        subsections: processedSubsections,
      };
    });
  };

  const structuredRecommendations = processRecommendation(recommendation);

  return (
    <div className="space-y-6">
      <Card className="border-blue-100">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold text-blue-800 mb-4">
            Protocol Optimization Recommendations
          </h2>

          <div className="space-y-6">
            {structuredRecommendations.map((section, index) => (
              <div key={index} className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-medium text-blue-700 mb-3 pb-2 border-b border-blue-100">
                  {index + 1}. {section.title}
                </h3>

                <div className="space-y-4">
                  {section.subsections.map((subsection, subIdx) => (
                    <div key={subIdx} className="ml-2">
                      {subsection.subtitle && (
                        <h4 className="text-md font-medium text-gray-800 mb-1 flex items-start">
                          <span className="text-blue-500 mr-2">•</span>
                          <span>{subsection.subtitle}</span>
                        </h4>
                      )}
                      <div className="text-gray-700 ml-6 text-sm whitespace-pre-wrap">
                        {subsection.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FormattedProtocolRecommendations;
