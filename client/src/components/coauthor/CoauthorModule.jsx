import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import DraftEditor from './DraftEditor';
import TemplateEditor from './TemplateEditor';
import RegulatorySearch from './RegulatorySearch';
import GuidancePanel from './GuidancePanel';
import RiskAnalysisWidget from './RiskAnalysisWidget';
import LumenChatPane from './LumenChatPane';
import SectionHeader from './SectionHeader';

// Sample template for CTD sections
const SECTION_TEMPLATES = {
 2.7: {
 title: 'Clinical Summary',
 prompt:
 'This clinical summary focuses on {{Indication}} using {{DrugName}} at doses of {{Dosage}}. The efficacy data showed {{EfficacySummary}} and the safety profile demonstrated {{SafetySummary}}.',
 fields: [
 { name: 'Indication', label: 'Indication', type: 'text' },
 { name: 'DrugName', label: 'Drug Name', type: 'text' },
 { name: 'Dosage', label: 'Dosage Range', type: 'text' },
 { name: 'EfficacySummary', label: 'Efficacy Summary', type: 'textarea' },
 { name: 'SafetySummary', label: 'Safety Summary', type: 'textarea' },
 ],
 },
 3.2: {
 title: 'Quality Information',
 prompt:
 'The manufacturing process for {{DrugName}} utilizes {{ManufacturingProcess}}. Quality is ensured through {{QualityControls}}. The drug substance has a purity of {{Purity}} and stability data shows {{StabilityData}}.',
 fields: [
 { name: 'DrugName', label: 'Drug Name', type: 'text' },
 { name: 'ManufacturingProcess', label: 'Manufacturing Process', type: 'textarea' },
 { name: 'QualityControls', label: 'Quality Controls', type: 'textarea' },
 { name: 'Purity', label: 'Purity Specifications', type: 'text' },
 { name: 'StabilityData', label: 'Stability Data', type: 'textarea' },
 ],
 },
 4.2: {
 title: 'Pharmacology Studies',
 prompt:
 'Pharmacology studies for {{DrugName}} demonstrate the mechanism of action involves {{MechanismOfAction}}. In animal models, the drug showed {{PrimaryPD}} with secondary pharmacodynamics showing {{SecondaryPD}}. Safety pharmacology indicates {{SafetyFindings}}.',
 fields: [
 { name: 'DrugName', label: 'Drug Name', type: 'text' },
 { name: 'MechanismOfAction', label: 'Mechanism of Action', type: 'textarea' },
 { name: 'PrimaryPD', label: 'Primary Pharmacodynamics', type: 'textarea' },
 { name: 'SecondaryPD', label: 'Secondary Pharmacodynamics', type: 'textarea' },
 { name: 'SafetyFindings', label: 'Safety Pharmacology Findings', type: 'textarea' },
 ],
 },
};

// Default content for demo purposes
const DEFAULT_CONTENT = {
 2.7: 'This section provides a comprehensive summary of all clinical data supporting the safety and efficacy of the investigational product.',
 3.2: 'This section contains detailed information on the drug substance, drug product, manufacturing process, and control procedures.',
 4.2: 'This section presents the results of primary pharmacodynamics studies conducted using both in vitro and in vivo models.',
};

export default function CoauthorModule({ sectionId = '2.7', sectionTitle = 'Clinical Summary' }) {
 const [activeTab, setActiveTab] = useState('edit');
 const [content, setContent] = useState('');
 const [lastSaved, setLastSaved] = useState(null);
 const [wordCount, setWordCount] = useState(0);

 // Set default content on first load
 useEffect(() => {
 setContent(DEFAULT_CONTENT[sectionId] || '');
 }, [sectionId]);

 // Update word count when content changes
 useEffect(() => {
 if (content) {
 setWordCount(content.split(/\s+/).filter(Boolean).length);
 } else {
 setWordCount(0);
 }
 }, [content]);

 const handleSave = () => {
 // In a real implementation, this would call an API
 console.log(`Saving content for section ${sectionId}`);
 setLastSaved(new Date());

 // Simulate API call
 return new Promise(resolve => {
 setTimeout(() => {
 resolve({ success: true });
 }, 500);
 });
 };

 const handleContentChange = newContent => {
 setContent(newContent);
 };

 const handleTemplateOutput = generatedContent => {
 setContent(generatedContent);
 setActiveTab('edit');
 };

 const handleBack = () => {
 // In a real implementation, this would navigate back to the module dashboard
 console.log('Back button clicked');
 };

 return (
 <div className="p-4 space-y-6">
 <SectionHeader
 sectionId={sectionId}
 sectionTitle={sectionTitle}
 wordCount={wordCount}
 lastSaved={lastSaved}
 activeTab={activeTab}
 onTabChange={setActiveTab}
 onSave={handleSave}
 onBack={handleBack}
 />

 <Tabs value={activeTab} className="w-full">
 <TabsContent value="edit" className="mt-0">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div className="md:col-span-2">
 <DraftEditor content={content} onChange={handleContentChange} />
 </div>
 <div className="space-y-6">
 <LumenChatPane contextId={sectionId} />
 <RiskAnalysisWidget sectionId={sectionId} />
 </div>
 </div>
 </TabsContent>

 <TabsContent value="template" className="mt-0">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div className="md:col-span-2">
 <TemplateEditor
 sectionId={sectionId}
 template={SECTION_TEMPLATES[sectionId] || SECTION_TEMPLATES['2.7']}
 onSave={handleTemplateOutput}
 />
 </div>
 <div className="space-y-6">
 <LumenChatPane contextId={sectionId} />
 </div>
 </div>
 </TabsContent>

 <TabsContent value="guidance" className="mt-0">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div className="md:col-span-2">
 <div className="space-y-4">
 <GuidancePanel sectionId={sectionId} />
 <RegulatorySearch sectionId={sectionId} />
 </div>
 </div>
 <div className="space-y-6">
 <LumenChatPane contextId={sectionId} />
 </div>
 </div>
 </TabsContent>

 <TabsContent value="review" className="mt-0">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div className="md:col-span-2">
 <div className="p-6 border rounded-md bg-white">
 <h3 className="text-lg font-semibold mb-4">
 {sectionId} {sectionTitle} - Review
 </h3>
 <div className="prose prose-sm max-w-none">
 <div
 dangerouslySetInnerHTML={{
 __html: DOMPurify.sanitize(content.replace(/\n/g, '<br />')),
 }}
 />
 </div>
 </div>
 </div>
 <div className="space-y-6">
 <RiskAnalysisWidget sectionId={sectionId} />
 <GuidancePanel sectionId={sectionId} />
 </div>
 </div>
 </TabsContent>
 </Tabs>
 </div>
 );
}
