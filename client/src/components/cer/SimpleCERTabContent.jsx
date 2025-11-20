import React from 'react';
import CerBuilderPanel from './CerBuilderPanel';
import DocumentVaultPanel from './DocumentVaultPanel';
import CerDataRetrievalPanel from './CerDataRetrievalPanel';
import InternalClinicalDataPanel from './InternalClinicalDataPanel';
import GSPRMappingPanel from './GSPRMappingPanel';
import EquivalenceBuilderPanel from './EquivalenceBuilderPanel';
import StateOfArtPanel from './StateOfArtPanel';
import ClinicalEvaluationPlanPanel from './ClinicalEvaluationPlanPanel';
import ComplianceScorePanel from './ComplianceScorePanel';
import NotificationBanner from './NotificationBanner';
import LiteratureSearchPanel from './LiteratureSearchPanel';
import LiteratureMethodologyPanel from './LiteratureMethodologyPanel';
import LiteratureReviewWorkflow from './LiteratureReviewWorkflow';
import CerAssistantPanel from './CerAssistantPanel';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SimpleCERTabContent({
  activeTab,
  title,
  faers = [],
  comparators = [],
  sections = [],
  deviceName = '',
  deviceType = '',
  manufacturer = '',
  isFetchingFaers = false,
  showEvidenceReminder = true,
  onTitleChange,
  onSectionsChange,
  onFaersChange,
  onComparatorsChange,
  onExport,
  setActiveTab,
  setShowEvidenceReminder,
  setIsFetchingFaers,
  toast,
}) {
  if (activeTab === 'builder') {
    return (
      <div className="bg-[#F9F9F9] py-4">
        <div className="flex flex-col md:flex-row items-start justify-between">
          <div className="flex-1 px-4">
            <h2 className="text-xl font-semibold text-[#323130]">Section Generator</h2>
            <div className="mt-2 mb-4">
              <div className="bg-[#EFF6FC] rounded-md px-3 py-1 text-sm inline-flex items-center gap-1 text-[#0F6CBD]">
                <span>AI-Powered</span>
              </div>
            </div>
            <CerBuilderPanel
              title={title}
              faers={faers}
              comparators={comparators}
              sections={sections}
              onTitleChange={onTitleChange}
              onSectionsChange={onSectionsChange}
              onFaersChange={onFaersChange}
              onComparatorsChange={onComparatorsChange}
            />
          </div>
          <div className="w-full md:w-auto md:min-w-[280px] md:max-w-[320px] px-4 mt-6 md:mt-0">
            <h2 className="text-xl font-semibold text-[#323130]">Report Sections</h2>
            <div className="mt-2 mb-4">
              <div className="bg-[#F3F2F1] rounded px-3 py-1 text-sm inline-flex items-center gap-1">
                <span>{sections.length} sections</span>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-md font-medium mb-2 text-[#323130]">Report Title</h3>
              <input
                type="text"
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                className="w-full p-2 border border-[#E1DFDD] rounded"
                placeholder="Clinical Evaluation Report"
              />
            </div>

            {sections.length > 0 ? (
              <div className="space-y-2">
                {sections.map((section, idx) => (
                  <div key={idx} className="bg-[#F3F2F1] p-2 rounded text-sm">
                    {section.title}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">
                No sections added yet. Generate sections from the tools on the left.
              </div>
            )}
          </div>
        </div>
        <div className="px-4 mt-4 text-center">
          <Button
            onClick={() => onExport('docx')}
            className="bg-transparent text-[#0F6CBD] hover:bg-[#EFF6FC] border-none"
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
    );
  }

  if (activeTab === 'cep') {
    return (
      <ClinicalEvaluationPlanPanel
        onCEPGenerated={cepData => {
          const existingIndex = sections.findIndex(
            section =>
              section.type === 'cep' ||
              (section.title && section.title.toLowerCase().includes('evaluation plan'))
          );

          if (existingIndex >= 0) {
            const updatedSections = [...sections];
            updatedSections[existingIndex] = {
              ...updatedSections[existingIndex],
              content: cepData.content,
              lastUpdated: new Date().toISOString(),
            };
            onSectionsChange(updatedSections);

            toast({
              title: 'CEP Updated',
              description: 'Clinical Evaluation Plan has been updated in your CER.',
              variant: 'default',
            });
          } else {
            onSectionsChange([...sections, cepData]);

            toast({
              title: 'CEP Added',
              description: 'Clinical Evaluation Plan has been added to your CER.',
              variant: 'default',
            });
          }
        }}
        deviceName={deviceName}
        deviceType={deviceType}
        manufacturer={manufacturer}
      />
    );
  }

  if (activeTab === 'literature') {
    return (
      <Tabs defaultValue="search" className="w-full">
        <TabsList className="flex overflow-x-auto whitespace-nowrap bg-white border-b border-gray-200 rounded-none w-full justify-start gap-2">
          <TabsTrigger
            value="search"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0F6CBD] data-[state=active]:text-[#0F6CBD] data-[state=active]:shadow-none bg-transparent px-3 py-2 font-normal text-[#616161] flex-shrink-0"
          >
            Search & Analyze
          </TabsTrigger>
          <TabsTrigger
            value="methodology"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0F6CBD] data-[state=active]:text-[#0F6CBD] data-[state=active]:shadow-none bg-transparent px-3 py-2 font-normal text-[#616161] flex-shrink-0"
          >
            Search Methodology
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4">
          <LiteratureSearchPanel
            onAddSection={newSection => {
              onSectionsChange([...sections, newSection]);
              toast({
                title: 'Literature Review Added',
                description: 'Added to your CER.',
                variant: 'default',
              });
            }}
            deviceName={deviceName}
            manufacturer={manufacturer}
            cerTitle={title}
          />
        </TabsContent>

        <TabsContent value="methodology" className="mt-4">
          <LiteratureMethodologyPanel
            onAddToCER={newSection => {
              onSectionsChange([...sections, newSection]);
              toast({
                title: 'Literature Methodology Added',
                description: 'Search methodology documentation added to your CER.',
                variant: 'default',
              });
            }}
            deviceName={deviceName}
            deviceType={deviceType}
            manufacturer={manufacturer}
          />
        </TabsContent>
      </Tabs>
    );
  }

  if (activeTab === 'literature-review') {
    return (
      <LiteratureReviewWorkflow
        deviceName={deviceName}
        manufacturer={manufacturer}
        onAddToCER={reviewData => {
          const existingIndex = sections.findIndex(
            section =>
              section.type === 'literature-review' ||
              (section.title && section.title.toLowerCase().includes('literature review'))
          );

          if (existingIndex >= 0) {
            const updatedSections = [...sections];
            updatedSections[existingIndex] = {
              ...updatedSections[existingIndex],
              content: reviewData.content,
              lastUpdated: new Date().toISOString(),
            };
            onSectionsChange(updatedSections);

            toast({
              title: 'Literature Review Updated',
              description: 'Literature review has been updated in your CER.',
              variant: 'default',
            });
          } else {
            onSectionsChange([...sections, reviewData]);

            toast({
              title: 'Literature Review Added',
              description: 'Literature review has been added to your CER.',
              variant: 'default',
            });
          }
        }}
      />
    );
  }

  if (activeTab === 'internal-clinical-data') {
    return (
      <InternalClinicalDataPanel
        jobId={`cer-${Date.now()}`}
        deviceName={deviceName}
        manufacturer={manufacturer}
        onAddToCER={internalClinicalData => {
          const existingIndex = sections.findIndex(
            section =>
              section.type === 'internal-clinical-data' ||
              (section.title && section.title.toLowerCase().includes('internal clinical data'))
          );

          if (existingIndex >= 0) {
            const updatedSections = [...sections];
            updatedSections[existingIndex] = {
              ...updatedSections[existingIndex],
              content: internalClinicalData.content,
              lastUpdated: new Date().toISOString(),
            };
            onSectionsChange(updatedSections);

            toast({
              title: 'Internal Clinical Data Updated',
              description: 'Your CER now includes the latest internal clinical evidence.',
              variant: 'default',
            });
          } else {
            onSectionsChange([...sections, internalClinicalData]);

            toast({
              title: 'Internal Clinical Data Added',
              description: 'Internal clinical evidence has been added to your CER.',
              variant: 'default',
            });
          }
        }}
      />
    );
  }

  if (activeTab === 'documents') {
    return <DocumentVaultPanel jobId={`cer-${Date.now()}`} />;
  }

  if (activeTab === 'data-retrieval') {
    return (
      <>
        {!isFetchingFaers && faers.length === 0 && (
          <NotificationBanner
            title="Essential: Retrieve FAERS Data First"
            description="For optimal CER quality, start by retrieving real-world adverse event data and literature evidence."
            actionText="Start Retrieval"
            onActionClick={() => setActiveTab('data-retrieval')}
            onDismiss={() => setShowEvidenceReminder(false)}
            variant="info"
            visible={showEvidenceReminder}
            showInfoIcon={true}
            infoTooltip="Pull in real-world adverse event data (FAERS) and key published studies—so your AI sections include actual safety and evidence."
            additionalContent="Why run this? AI section drafts will cite and analyze FAERS + literature automatically."
          />
        )}
        <CerDataRetrievalPanel
          reportId={`cer-${Date.now()}`}
          deviceName={deviceName}
          onDataUpdated={data => {
            if (data.type === 'faers' && data.data) {
              onFaersChange(data.data.reports || []);
              onComparatorsChange(data.data.comparators || []);
              toast({
                title: 'FAERS Data Retrieved',
                description: 'Your FAERS data has been downloaded and imported.',
                variant: 'default',
              });
            }
          }}
          setIsFetchingFaers={setIsFetchingFaers}
        />
      </>
    );
  }

  if (activeTab === 'equivalence') {
    return (
      <EquivalenceBuilderPanel
        deviceName={deviceName}
        deviceType={deviceType}
        manufacturer={manufacturer}
        onDataGenerated={data => {
          setEquivalenceData(data);
          const existingIndex = sections.findIndex(
            section =>
              section.type === 'equivalence' ||
              (section.title && section.title.toLowerCase().includes('equivalence'))
          );

          if (existingIndex >= 0) {
            const updatedSections = [...sections];
            updatedSections[existingIndex] = {
              ...updatedSections[existingIndex],
              content: data.content,
              lastUpdated: new Date().toISOString(),
            };
            onSectionsChange(updatedSections);

            toast({
              title: 'Equivalence Data Updated',
              description: 'Your CER now includes the latest equivalence data.',
              variant: 'default',
            });
          } else {
            onSectionsChange([
              ...sections,
              {
                type: 'equivalence',
                title: 'Device Equivalence Analysis',
                content: data.content,
                lastUpdated: new Date().toISOString(),
              },
            ]);

            toast({
              title: 'Equivalence Data Added',
              description: 'Equivalence analysis has been added to your CER.',
              variant: 'default',
            });
          }
        }}
      />
    );
  }

  if (activeTab === 'gspr-mapping') {
    return (
      <GSPRMappingPanel
        deviceName={deviceName}
        deviceType={deviceType}
        manufacturer={manufacturer}
        sections={sections}
        faers={faers}
        comparators={comparators}
        onAddToReport={gspr => {
          const existingIndex = sections.findIndex(
            section =>
              section.type === 'gspr' ||
              (section.title && section.title.toLowerCase().includes('gspr'))
          );

          if (existingIndex >= 0) {
            const updatedSections = [...sections];
            updatedSections[existingIndex] = {
              ...updatedSections[existingIndex],
              content: gspr.content,
              lastUpdated: new Date().toISOString(),
            };
            onSectionsChange(updatedSections);

            toast({
              title: 'GSPR Mapping Updated',
              description: 'Your CER now includes the latest GSPR mapping data.',
              variant: 'default',
            });
          } else {
            onSectionsChange([...sections, gspr]);

            toast({
              title: 'GSPR Mapping Added',
              description: 'GSPR requirements mapping has been added to your CER.',
              variant: 'default',
            });
          }
        }}
      />
    );
  }

  if (activeTab === 'sota') {
    return (
      <StateOfArtPanel
        deviceName={deviceName}
        deviceType={deviceType}
        manufacturer={manufacturer}
        onSotaGenerated={sotaData => {
          const existingIndex = sections.findIndex(
            section =>
              section.type === 'sota' ||
              (section.title && section.title.toLowerCase().includes('state of the art'))
          );

          if (existingIndex >= 0) {
            const updatedSections = [...sections];
            updatedSections[existingIndex] = {
              ...updatedSections[existingIndex],
              content: sotaData.content,
              lastUpdated: new Date().toISOString(),
            };
            onSectionsChange(updatedSections);

            toast({
              title: 'SOTA Analysis Updated',
              description: 'State of the Art analysis has been updated in your CER.',
              variant: 'default',
            });
          } else {
            onSectionsChange([...sections, sotaData]);

            toast({
              title: 'SOTA Analysis Added',
              description: 'State of the Art analysis has been added to your CER.',
              variant: 'default',
            });
          }
        }}
      />
    );
  }

  if (activeTab === 'compliance') {
    return (
      <ComplianceScorePanel
        title="Compliance Checker"
        description="Verify your CER against regulatory requirements"
        sections={sections}
        template={selectedTemplate || 'eu-mdr'}
        deviceType={deviceType}
        onRunCompliance={() => {
          setIsComplianceRunning(true);

          // Simulate compliance checking
          setTimeout(() => {
            setCompliance({
              score: 82,
              issues: [
                { severity: 'high', description: 'Missing PMCF plan details' },
                { severity: 'medium', description: 'Insufficient equivalence data' },
                { severity: 'low', description: 'Literature review methodology needs more detail' },
              ],
              recommendations: [
                'Add details about your Post-Market Clinical Follow-up plan',
                'Enhance your equivalence justification with more technical parameters',
                'Expand your literature review methodology section',
              ],
            });
            setIsComplianceRunning(false);

            toast({
              title: 'Compliance Check Complete',
              description: 'Review the compliance results and address any issues.',
              variant: 'default',
            });
          }, 3000);
        }}
        isRunning={isComplianceRunning}
        compliance={compliance}
      />
    );
  }

  if (activeTab === 'assistant') {
    return (
      <CerAssistantPanel
        deviceName={deviceName}
        deviceType={deviceType}
        manufacturer={manufacturer}
        sections={sections}
        faers={faers}
      />
    );
  }

  // Default case - should never be reached if navigation is working correctly
  return (
    <div className="p-6 text-center">
      <h3 className="text-xl mb-4">Tab content not found</h3>
      <p>The selected tab "{activeTab}" does not have corresponding content.</p>
      <Button className="mt-4" onClick={() => setActiveTab('builder')}>
        Return to Builder
      </Button>
    </div>
  );
}
