import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Info, Download, FileText, Eye } from 'lucide-react';
import { cerApiService } from '@/services/CerAPIService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import SaveCerToVaultButton from './SaveCerToVaultButton';

export default function CerPreviewPanel({
  title,
  sections = [],
  faers = [],
  comparators = [],
  complianceData,
}) {
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const { toast } = useToast();
  // Helper function to find compliance score for a section
  const getSectionComplianceStatus = sectionTitle => {
    if (!complianceData || !complianceData.sectionScores) return null;

    const sectionData = complianceData.sectionScores.find(
      section => section.title.toLowerCase() === sectionTitle.toLowerCase()
    );

    if (!sectionData) return null;

    return {
      score: sectionData.averageScore,
      status:
        sectionData.averageScore >= 0.8
          ? 'compliant'
          : sectionData.averageScore >= 0.6
            ? 'needs-improvement'
            : 'non-compliant',
      suggestions: Object.values(sectionData.standards || {})
        .flatMap(s => s.suggestions || [])
        .filter(Boolean),
      feedback: Object.values(sectionData.standards || {})
        .map(s => s.feedback)
        .filter(Boolean)
        .join(' '),
    };
  };

  // Get badge color based on compliance status
  const getComplianceColor = status => {
    switch (status) {
      case 'compliant':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'needs-improvement':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'non-compliant':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Get icon based on compliance status
  const getComplianceIcon = status => {
    switch (status) {
      case 'compliant':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'needs-improvement':
        return <Info className="h-4 w-4 text-yellow-600" />;
      case 'non-compliant':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  // Generate MEDDEV 2.7/1 Rev 4 complaint PDF preview
  const generatePDFPreview = async () => {
    if (sections.length === 0) {
      toast({
        title: 'No content to preview',
        description: 'Add sections to your report before generating a preview.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGeneratingPreview(true);

      // Use a hidden iframe to show the preview
      const previewContainer = document.getElementById('pdf-preview-container');
      if (!previewContainer) {
        const container = document.createElement('div');
        container.id = 'pdf-preview-container';
        container.className =
          'fixed top-0 left-0 w-full h-full bg-black bg-opacity-75 z-50 flex items-center justify-center';
        container.style.display = 'none';
        document.body.appendChild(container);

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.innerText = 'Close Preview';
        closeButton.className = 'absolute top-4 right-4 bg-white px-4 py-2 rounded shadow';
        closeButton.onclick = () => {
          container.style.display = 'none';
        };
        container.appendChild(closeButton);
      }

      // Prepare data for preview
      const exportData = {
        title,
        sections,
        faers,
        comparators,
        complianceData,
        templateId: 'meddev', // MEDDEV 2.7/1 Rev 4 format
        metadata: {
          device: title.split(' ')[0] || 'Medical Device',
          manufacturer: 'TrialSage Medical',
          modelNumber: 'TS-' + Date.now().toString().slice(-6),
          version: '1.0',
          date: new Date().toLocaleDateString(),
          standard: 'MEDDEV 2.7/1 Rev 4',
          watermark: 'PREVIEW - NOT FOR REGULATORY SUBMISSION',
        },
      };

      // Generate PDF blob
      const pdfBlob = await cerApiService.exportToPDF(exportData);

      // Create object URL for preview
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Show preview in iframe
      const container = document.getElementById('pdf-preview-container');
      let iframe = container.querySelector('iframe');

      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.className = 'w-4/5 h-4/5 border-none';
        container.appendChild(iframe);
      }

      iframe.src = pdfUrl;
      container.style.display = 'flex';

      toast({
        title: 'Preview Generated',
        description: 'MEDDEV 2.7/1 Rev 4 compliant preview created successfully',
        variant: 'success',
      });
    } catch (error) {
      console.error('Preview generation failed:', error);
      toast({
        title: 'Preview Generation Failed',
        description: error.message || 'Failed to generate PDF preview',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  return (
    <div className="p-6 bg-white border border-[#E1DFDD] rounded-md shadow-sm">
      {/* Top panel with actions */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 pb-4 border-b border-[#E1DFDD]">
        <h1 className="text-xl font-semibold text-[#323130] mb-3 sm:mb-0">
          {title || 'Clinical Evaluation Report'}
        </h1>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={generatePDFPreview}
            disabled={isGeneratingPreview || sections.length === 0}
            className="bg-[#0F6CBD] hover:bg-[#115EA3] text-white h-9"
            size="sm"
          >
            {isGeneratingPreview ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-opacity-50 border-t-transparent rounded-full"></div>
                Generating...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Preview PDF
              </>
            )}
          </Button>

          <Button
            onClick={() =>
              cerApiService
                .exportToPDF({
                  title,
                  sections,
                  faers,
                  comparators,
                  complianceData,
                  templateId: 'meddev',
                })
                .then(blob => cerApiService.downloadBlob(blob, `${title.replace(/\s+/g, '_')}.pdf`))
            }
            disabled={sections.length === 0}
            className="bg-[#0F6CBD] hover:bg-[#115EA3] text-white h-9"
            size="sm"
          >
            <FileText className="h-4 w-4 mr-2" />
            Download PDF
          </Button>

          <SaveCerToVaultButton
            cerData={{
              title,
              sections,
              faers,
              comparators,
            }}
            metadata={{
              name: title,
              version: '1.0.0',
              status: 'draft',
              description: `Clinical Evaluation Report for ${title.split(' Clinical Evaluation')[0]}`,
              tags: ['MEDDEV 2.7/1 Rev 4', 'Clinical Evaluation', 'EU MDR'],
              manufacturer: 'TrialSage Medical',
              modelNumber: 'TS-' + Date.now().toString().slice(-6),
              date: new Date().toLocaleDateString(),
              standard: 'MEDDEV 2.7/1 Rev 4',
            }}
            disabled={sections.length === 0}
            variant="default"
            className="bg-[#107C10] hover:bg-[#0B5A0B] text-white h-9"
            size="sm"
          />
        </div>
      </div>

      {/* Report info with MEDDEV 2.7/1 Rev 4 format */}
      <div className="bg-[#F3F2F1] p-4 rounded mb-6">
        <h2 className="text-base font-semibold text-[#323130] mb-2">
          MEDDEV 2.7/1 Rev 4 Compliant Report
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p>
              <span className="font-medium">Device Name:</span>{' '}
              {title.split(' Clinical Evaluation')[0]}
            </p>
            <p>
              <span className="font-medium">Document Type:</span> Clinical Evaluation Report
            </p>
            <p>
              <span className="font-medium">Regulatory Framework:</span> EU MDR
            </p>
          </div>
          <div>
            <p>
              <span className="font-medium">Compliance Standard:</span> MEDDEV 2.7/1 Rev 4
            </p>
            <p>
              <span className="font-medium">Generation Date:</span>{' '}
              {new Date().toLocaleDateString()}
            </p>
            <p>
              <span className="font-medium">Status:</span>
              <Badge
                variant="outline"
                className="ml-2 bg-[#FFFCE5] text-[#986F0B] border-[#F2C811]"
              >
                Draft
              </Badge>
            </p>
          </div>
        </div>
      </div>

      {sections.length > 0 ? (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-[#323130]">Report Contents</h2>

          {/* Table of contents */}
          <div className="mb-6 p-4 bg-white border border-[#E1DFDD] rounded">
            <h3 className="text-sm font-semibold mb-2 text-[#323130]">Table of Contents</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              {sections.map((section, index) => (
                <li key={index} className="text-[#0F6CBD]">
                  <span className="text-[#323130]">{section.title || section.section}</span>
                </li>
              ))}
              {faers.length > 0 && (
                <li className="text-[#0F6CBD]">
                  <span className="text-[#323130]">FAERS Safety Data</span>
                </li>
              )}
              {comparators.length > 0 && (
                <li className="text-[#0F6CBD]">
                  <span className="text-[#323130]">Comparator Products Analysis</span>
                </li>
              )}
            </ol>
          </div>

          {/* Section content */}
          {sections.map((s, i) => {
            const complianceStatus = getSectionComplianceStatus(s.section);
            const hasComplianceData = complianceStatus !== null;

            return (
              <div
                key={i}
                className={`mb-4 border p-4 bg-white rounded shadow ${hasComplianceData ? `border-l-4 ${complianceStatus.status === 'compliant' ? 'border-l-green-500' : complianceStatus.status === 'needs-improvement' ? 'border-l-yellow-500' : 'border-l-red-500'}` : ''}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold text-[#323130]">{s.title || s.section}</h3>
                  {hasComplianceData && (
                    <div
                      className={`px-2 py-1 rounded-full flex items-center gap-1 text-xs border ${getComplianceColor(complianceStatus.status)}`}
                    >
                      {getComplianceIcon(complianceStatus.status)}
                      <span>{Math.round(complianceStatus.score * 100)}% Compliant</span>
                    </div>
                  )}
                </div>

                {hasComplianceData && complianceStatus.status !== 'compliant' && (
                  <div
                    className={`mb-3 text-sm p-2 rounded ${complianceStatus.status === 'needs-improvement' ? 'bg-yellow-50' : 'bg-red-50'}`}
                  >
                    <p className="font-medium mb-1">
                      {complianceStatus.status === 'needs-improvement'
                        ? 'Improvement Suggestions:'
                        : 'Compliance Issues:'}
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {complianceStatus.suggestions.length > 0 ? (
                        complianceStatus.suggestions
                          .slice(0, 3)
                          .map((suggestion, idx) => <li key={idx}>{suggestion}</li>)
                      ) : (
                        <li>
                          {complianceStatus.feedback || 'Review section for regulatory compliance'}
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="whitespace-pre-wrap text-sm text-[#323130] leading-relaxed">
                  {s.content}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 bg-[#F3F2F1] rounded-md border border-dashed border-[#E1DFDD]">
          <FileText className="h-12 w-12 text-[#A19F9D] mb-4" />
          <h3 className="text-lg font-semibold text-[#323130] mb-2">No Content Available</h3>
          <p className="text-[#605E5C] text-sm max-w-md text-center mb-6">
            Your report doesn't have any sections yet. Add content using the Builder, Literature, or
            Zero-Click Report generator.
          </p>
        </div>
      )}

      {faers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-[#323130]">FAERS Safety Data</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-[#E1DFDD]">
              <thead>
                <tr className="bg-[#F3F2F1]">
                  <th className="border border-[#E1DFDD] px-3 py-2 text-left text-[#323130]">
                    Adverse Event
                  </th>
                  <th className="border border-[#E1DFDD] px-3 py-2 text-left text-[#323130]">
                    Outcome
                  </th>
                  <th className="border border-[#E1DFDD] px-3 py-2 text-left text-[#323130]">
                    Serious
                  </th>
                  <th className="border border-[#E1DFDD] px-3 py-2 text-left text-[#323130]">
                    Demographics
                  </th>
                  <th className="border border-[#E1DFDD] px-3 py-2 text-left text-[#323130]">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {faers.map((f, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F9F9F9]'}>
                    <td className="border border-[#E1DFDD] px-3 py-2">{f.reaction}</td>
                    <td className="border border-[#E1DFDD] px-3 py-2">{f.outcome}</td>
                    <td className="border border-[#E1DFDD] px-3 py-2">
                      {f.is_serious ? (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Yes</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">No</Badge>
                      )}
                    </td>
                    <td className="border border-[#E1DFDD] px-3 py-2">
                      {f.age ? `${f.age} years, ` : ''}
                      {f.sex === '1' ? 'Male' : f.sex === '2' ? 'Female' : 'Unknown'}
                    </td>
                    <td className="border border-[#E1DFDD] px-3 py-2">{f.report_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {comparators.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-[#323130]">
            Comparator Products Analysis
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {comparators.map((c, i) => (
              <div key={i} className="border border-[#E1DFDD] rounded p-4 bg-white">
                <h3 className="font-semibold text-[#323130] mb-2">{c.comparator}</h3>
                <div className="text-sm space-y-2">
                  <p>
                    <span className="font-medium">Risk Score:</span> {c.riskScore}
                  </p>
                  <p>
                    <span className="font-medium">Reports:</span> {c.reportCount}
                  </p>
                  <div className="h-2 bg-[#F3F2F1] rounded-full mt-2">
                    <div
                      className={`h-2 rounded-full ${
                        c.riskScore < 0.3
                          ? 'bg-green-500'
                          : c.riskScore < 0.7
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${c.riskScore * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
