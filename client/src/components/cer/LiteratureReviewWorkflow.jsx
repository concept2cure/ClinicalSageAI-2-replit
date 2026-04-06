import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import {
 Search,
 Plus,
 Trash2,
 FileText,
 Save,
 Download,
 AlertCircle,
 Check,
 FileCheck,
 Filter,
 Database,
 Calendar,
 BookOpen,
 BarChart2,
 Star,
 CheckCircle,
 Clock,
 HelpCircle,
 ExternalLink,
} from 'lucide-react';
import CerTooltipWrapper from './CerTooltipWrapper';
import { literatureAPIService } from '@/services/LiteratureAPIService';

// Standard databases options
const DATABASES = [
 {
 id: 'pubmed',
 name: 'PubMed',
 description: 'Biomedical literature from MEDLINE, life science journals, and online books.',
 },
 {
 id: 'embase',
 name: 'Embase',
 description: 'Biomedical and pharmacological database of published literature.',
 },
 {
 id: 'cochrane',
 name: 'Cochrane Library',
 description: 'Collection of databases in medicine and other healthcare specialties.',
 },
 {
 id: 'scopus',
 name: 'Scopus',
 description: 'Abstract and citation database of peer-reviewed literature.',
 },
 {
 id: 'web_of_science',
 name: 'Web of Science',
 description: 'Subscription-based scientific citation indexing service.',
 },
 {
 id: 'cinahl',
 name: 'CINAHL',
 description: 'Cumulative Index to Nursing and Allied Health Literature.',
 },
 {
 id: 'psycinfo',
 name: 'PsycINFO',
 description: 'Database of abstracts of literature in behavioral sciences and mental health.',
 },
 {
 id: 'clinicaltrials',
 name: 'ClinicalTrials.gov',
 description: 'Registry and results database of clinical studies.',
 },
];

// Study types for classification
const STUDY_TYPES = [
 { id: 'rct', name: 'Randomized Controlled Trial', level: 'High' },
 { id: 'systematic_review', name: 'Systematic Review/Meta-Analysis', level: 'High' },
 { id: 'cohort', name: 'Cohort Study', level: 'Medium' },
 { id: 'case_control', name: 'Case-Control Study', level: 'Medium' },
 { id: 'case_series', name: 'Case Series', level: 'Low' },
 { id: 'case_report', name: 'Case Report', level: 'Low' },
 { id: 'expert_opinion', name: 'Expert Opinion', level: 'Very Low' },
 { id: 'non_clinical', name: 'Non-Clinical Study', level: 'Special' },
];

// Bias assessment domains based on Cochrane RoB 2.0
const BIAS_DOMAINS = [
 {
 id: 'randomization',
 name: 'Randomization Process',
 description: 'Bias arising from the randomization process',
 },
 {
 id: 'deviations',
 name: 'Deviations from Intended Interventions',
 description: 'Bias due to deviations from intended interventions',
 },
 {
 id: 'missing_data',
 name: 'Missing Outcome Data',
 description: 'Bias due to missing outcome data',
 },
 {
 id: 'measurement',
 name: 'Outcome Measurement',
 description: 'Bias in measurement of the outcome',
 },
 {
 id: 'selection',
 name: 'Selection of Reported Result',
 description: 'Bias in selection of the reported result',
 },
 { id: 'other', name: 'Other Sources of Bias', description: 'Bias arising from other sources' },
];

const createInitialReviewState = () => ({
 // Meta information
 title: 'Literature Review for Clinical Evaluation Report',
 device: '',
 author: '',
 date: new Date().toISOString().split('T')[0],

 // Search Strategy
 databases: ['pubmed', 'embase', 'clinicaltrials'], // Default selected databases
 searchPeriod: {
 startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 10))
 .toISOString()
 .split('T')[0], // Default 10 years back
 endDate: new Date().toISOString().split('T')[0], // Today
 },
 searchQueries: [
 {
 id: crypto.randomUUID(),
 database: 'pubmed',
 query: '',
 results: null,
 date: new Date().toISOString().split('T')[0],
 },
 ],

 // Inclusion/Exclusion Criteria
 inclusionCriteria: [
 {
 id: crypto.randomUUID(),
 criterion: 'Studies involving the subject device or equivalent devices',
 enabled: true,
 },
 { id: crypto.randomUUID(), criterion: 'Clinical studies with human subjects', enabled: true },
 { id: crypto.randomUUID(), criterion: 'Studies published in English', enabled: true },
 ],
 exclusionCriteria: [
 { id: crypto.randomUUID(), criterion: 'Animal or in vitro studies only', enabled: true },
 { id: crypto.randomUUID(), criterion: 'Case reports with sample size < 5', enabled: true },
 { id: crypto.randomUUID(), criterion: 'Conference abstracts without full text', enabled: true },
 ],

 // Selected studies
 selectedStudies: [],

 // Appraisal settings
 appraisalCriteria: {
 relevance: [
 {
 id: 'device_relevance',
 name: 'Device Relevance',
 description: 'How directly relevant is the study to the subject device?',
 },
 {
 id: 'population_relevance',
 name: 'Population Relevance',
 description: 'How well does the study population match the intended use population?',
 },
 {
 id: 'outcome_relevance',
 name: 'Outcome Relevance',
 description:
 'How relevant are the studied outcomes to the intended performance and safety claims?',
 },
 {
 id: 'setting_relevance',
 name: 'Clinical Setting Relevance',
 description: 'How representative is the clinical setting to real-world use?',
 },
 ],
 methodQuality: [
 {
 id: 'study_design',
 name: 'Study Design',
 description: 'Appropriateness of study design for the research question',
 },
 {
 id: 'sample_size',
 name: 'Sample Size',
 description: 'Adequacy of sample size for meaningful statistical analysis',
 },
 {
 id: 'follow_up',
 name: 'Follow-up Period',
 description: 'Adequacy of follow-up period to observe relevant outcomes',
 },
 {
 id: 'statistical_analysis',
 name: 'Statistical Analysis',
 description: 'Appropriateness of statistical methods used',
 },
 ],
 },

 // PRISMA flow tracking
 prismaFlow: {
 identified: 0,
 screened: 0,
 eligible: 0,
 included: 0,
 },
});

export default function LiteratureReviewWorkflow({
 deviceName = '',
 manufacturer = '',
 onAddSection = () => {},
 initialData = null,
}) {
 const [activeTab, setActiveTab] = useState('search-strategy');
 const [reviewData, setReviewData] = useState(initialData || createInitialReviewState());
 const [isSearching, setIsSearching] = useState(false);
 const [searchResults, setSearchResults] = useState([]);
 const [hasChanged, setHasChanged] = useState(false);
 const [isGeneratingAppraisals, setIsGeneratingAppraisals] = useState(false);
 const [searchSummary, setSearchSummary] = useState(null);

 // Update device name if provided from parent
 useEffect(() => {
 if (deviceName && deviceName !== reviewData.device) {
 setReviewData(prev => ({
 ...prev,
 device: deviceName,
 }));
 }
 }, [deviceName]);

 // #1 - Search Strategy Handlers
 const handleAddSearchQuery = () => {
 setReviewData(prev => ({
 ...prev,
 searchQueries: [
 ...prev.searchQueries,
 {
 id: crypto.randomUUID(),
 database: 'pubmed',
 query: '',
 results: null,
 date: new Date().toISOString().split('T')[0],
 },
 ],
 }));
 setHasChanged(true);
 };

 const handleRemoveSearchQuery = id => {
 setReviewData(prev => ({
 ...prev,
 searchQueries: prev.searchQueries.filter(query => query.id !== id),
 }));
 setHasChanged(true);
 };

 const handleUpdateSearchQuery = (id, field, value) => {
 setReviewData(prev => ({
 ...prev,
 searchQueries: prev.searchQueries.map(query =>
 query.id === id ? { ...query, [field]: value } : query
 ),
 }));
 setHasChanged(true);
 };

 const handleDatabaseSelection = (dbId, isSelected) => {
 setReviewData(prev => ({
 ...prev,
 databases: isSelected ? [...prev.databases, dbId] : prev.databases.filter(id => id !== dbId),
 }));
 setHasChanged(true);
 };

 // #2 - Inclusion/Exclusion Criteria Handlers
 const handleAddCriterion = type => {
 const newCriterion = { id: crypto.randomUUID(), criterion: '', enabled: true };

 setReviewData(prev => ({
 ...prev,
 [type]: [...prev[type], newCriterion],
 }));
 setHasChanged(true);
 };

 const handleRemoveCriterion = (type, id) => {
 setReviewData(prev => ({
 ...prev,
 [type]: prev[type].filter(criterion => criterion.id !== id),
 }));
 setHasChanged(true);
 };

 const handleUpdateCriterion = (type, id, field, value) => {
 setReviewData(prev => ({
 ...prev,
 [type]: prev[type].map(criterion =>
 criterion.id === id ? { ...criterion, [field]: value } : criterion
 ),
 }));
 setHasChanged(true);
 };

 // #3 - Study Selection and Management
 const handleSearchPubMed = async queryId => {
 const query = reviewData.searchQueries.find(q => q.id === queryId);
 if (!query || !query.query.trim()) return;

 try {
 setIsSearching(true);

 // Perform the search using the LiteratureAPIService
 const result = await literatureAPIService.searchPubMed({
 query: query.query,
 device: reviewData.device || deviceName,
 manufacturer: manufacturer,
 });

 // Update the query with results count
 setReviewData(prev => ({
 ...prev,
 searchQueries: prev.searchQueries.map(q =>
 q.id === queryId ? { ...q, results: result.papers?.length || 0 } : q
 ),
 }));

 // Set search results
 setSearchResults(result.papers || []);

 // Update PRISMA flow counts
 setReviewData(prev => ({
 ...prev,
 prismaFlow: {
 ...prev.prismaFlow,
 identified: (prev.prismaFlow.identified || 0) + (result.papers?.length || 0),
 },
 }));
 } catch (error) {
 console.error('Error searching PubMed:', error);
 } finally {
 setIsSearching(false);
 }
 };

 const handleAddStudy = study => {
 // Check if already added
 if (reviewData.selectedStudies.some(s => s.id === study.id)) return;

 // Add the study to the selected list with initial appraisal structure
 setReviewData(prev => ({
 ...prev,
 selectedStudies: [
 ...prev.selectedStudies,
 {
 ...study,
 included: true,
 studyType: guessStudyType(study),
 relevanceScores: {
 device_relevance: null,
 population_relevance: null,
 outcome_relevance: null,
 setting_relevance: null,
 },
 methodQualityScores: {
 study_design: null,
 sample_size: null,
 follow_up: null,
 statistical_analysis: null,
 },
 biasAssessment: BIAS_DOMAINS.reduce((acc, domain) => {
 acc[domain.id] = { risk: 'unclear', justification: '' };
 return acc;
 }, {}),
 overallRelevance: null,
 overallQuality: null,
 notes: '',
 },
 ],
 prismaFlow: {
 ...prev.prismaFlow,
 screened: (prev.prismaFlow.screened || 0) + 1,
 eligible: (prev.prismaFlow.eligible || 0) + 1,
 included: (prev.prismaFlow.included || 0) + 1,
 },
 }));
 setHasChanged(true);
 };

 const handleRemoveStudy = studyId => {
 setReviewData(prev => ({
 ...prev,
 selectedStudies: prev.selectedStudies.filter(study => study.id !== studyId),
 prismaFlow: {
 ...prev.prismaFlow,
 included: Math.max(0, (prev.prismaFlow.included || 0) - 1),
 },
 }));
 setHasChanged(true);
 };

 const handleUpdateStudy = (studyId, field, value) => {
 setReviewData(prev => ({
 ...prev,
 selectedStudies: prev.selectedStudies.map(study =>
 study.id === studyId ? { ...study, [field]: value } : study
 ),
 }));
 setHasChanged(true);
 };

 const handleUpdateStudyNestedField = (studyId, parentField, field, value) => {
 setReviewData(prev => ({
 ...prev,
 selectedStudies: prev.selectedStudies.map(study =>
 study.id === studyId
 ? {
 ...study,
 [parentField]: {
 ...study[parentField],
 [field]: value,
 },
 }
 : study
 ),
 }));
 setHasChanged(true);
 };

 const handleUpdateBiasAssessment = (studyId, domainId, field, value) => {
 setReviewData(prev => ({
 ...prev,
 selectedStudies: prev.selectedStudies.map(study =>
 study.id === studyId
 ? {
 ...study,
 biasAssessment: {
 ...study.biasAssessment,
 [domainId]: {
 ...study.biasAssessment[domainId],
 [field]: value,
 },
 },
 }
 : study
 ),
 }));
 setHasChanged(true);
 };

 // #4 - AI-assisted Study Appraisal using GPT-4o
 const generateAIAppraisals = async () => {
 if (reviewData.selectedStudies.length === 0) return;

 try {
 setIsGeneratingAppraisals(true);

 // Display toast notification about AI appraisal
 toast({
 title: 'GPT-4o AI Appraisal Started',
 description: 'Generating regulatory-compliant study appraisals with advanced AI analysis.',
 variant: 'default',
 duration: 5000,
 });

 // Batch the studies for processing
 const updatedStudies = [...reviewData.selectedStudies];

 for (let i = 0; i < updatedStudies.length; i++) {
 const study = updatedStudies[i];

 // Only process studies that don't have appraisals yet
 if (!study.aiAppraisal) {
 try {
 // Generate AI appraisal for relevance
 const relevanceAppraisal = await literatureAPIService.generateRelevanceAppraisal(
 study,
 reviewData.device || deviceName,
 reviewData.inclusionCriteria.filter(c => c.enabled).map(c => c.criterion),
 reviewData.exclusionCriteria.filter(c => c.enabled).map(c => c.criterion)
 );

 // Generate AI appraisal for bias
 const biasAppraisal = await literatureAPIService.generateBiasAssessment(
 study,
 BIAS_DOMAINS
 );

 // Update the study with AI appraisals
 updatedStudies[i] = {
 ...study,
 aiAppraisal: {
 relevance: relevanceAppraisal,
 bias: biasAppraisal,
 timestamp: new Date().toISOString(),
 },
 // Pre-fill scores based on AI assessment
 relevanceScores: {
 device_relevance: relevanceAppraisal.scores.device_relevance || null,
 population_relevance: relevanceAppraisal.scores.population_relevance || null,
 outcome_relevance: relevanceAppraisal.scores.outcome_relevance || null,
 setting_relevance: relevanceAppraisal.scores.setting_relevance || null,
 },
 overallRelevance: relevanceAppraisal.overallScore || null,
 // Update bias assessment with AI suggestions
 biasAssessment: {
 ...study.biasAssessment,
 ...Object.keys(biasAppraisal.domainAssessments || {}).reduce((acc, domainId) => {
 const assessment = biasAppraisal.domainAssessments[domainId];
 acc[domainId] = {
 risk: assessment.riskLevel || 'unclear',
 justification: assessment.justification || '',
 };
 return acc;
 }, {}),
 },
 overallQuality: biasAppraisal.overallRisk
 ? biasAppraisal.overallRisk === 'high'
 ? 'low'
 : biasAppraisal.overallRisk === 'low'
 ? 'high'
 : 'medium'
 : null,
 };
 } catch (error) {
 console.error(`Error generating appraisal for study ${study.id}:`, error);
 }
 }
 }

 setReviewData(prev => ({
 ...prev,
 selectedStudies: updatedStudies,
 }));
 } catch (error) {
 console.error('Error in AI appraisal generation:', error);
 } finally {
 setIsGeneratingAppraisals(false);
 }
 };

 // #5 - Search Summary Generation
 const generateSearchSummary = async () => {
 try {
 // Generate summary based on all the review data
 const summary = await literatureAPIService.generateSearchSummary({
 device: reviewData.device || deviceName,
 databases: reviewData.databases.map(id => DATABASES.find(db => db.id === id)?.name || id),
 searchPeriod: reviewData.searchPeriod,
 searchQueries: reviewData.searchQueries,
 inclusionCriteria: reviewData.inclusionCriteria
 .filter(c => c.enabled)
 .map(c => c.criterion),
 exclusionCriteria: reviewData.exclusionCriteria
 .filter(c => c.enabled)
 .map(c => c.criterion),
 prismaFlow: reviewData.prismaFlow,
 selectedStudies: reviewData.selectedStudies.map(study => ({
 id: study.id,
 title: study.title,
 authors: study.authors,
 journal: study.journal,
 pubDate: study.publication_date,
 studyType: study.studyType,
 overallRelevance: study.overallRelevance,
 overallQuality: study.overallQuality,
 })),
 });

 setSearchSummary(summary);
 } catch (error) {
 console.error('Error generating search summary:', error);
 }
 };

 // #6 - Add to CER
 const addToCER = () => {
 // Format the data into a structured markdown section
 const searchMethodSection = {
 title: 'Literature Search Methodology',
 type: 'literature-methodology',
 content: generateLiteratureMethodologyContent(),
 lastUpdated: new Date().toISOString(),
 };

 onAddSection(searchMethodSection);
 };

 // Helper function to generate a properly formatted literature methodology section
 const generateLiteratureMethodologyContent = () => {
 const databaseNames = reviewData.databases
 .map(id => DATABASES.find(db => db.id === id)?.name || id)
 .join(', ');

 // Format dates for better readability
 const formatDate = dateString => {
 if (!dateString) return 'Not specified';
 const date = new Date(dateString);
 return date.toLocaleDateString('en-US', {
 year: 'numeric',
 month: 'long',
 day: 'numeric',
 });
 };

 // Create search queries list
 const searchQueriesList = reviewData.searchQueries
 .map(query => {
 const dbName = DATABASES.find(db => db.id === query.database)?.name || query.database;
 return `- **${dbName}**: ${query.query}${
 query.results !== null ? ` (${query.results} results)` : ''
 }`;
 })
 .join('\n');

 // Format inclusion criteria
 const inclusionList = reviewData.inclusionCriteria
 .filter(c => c.enabled)
 .map(c => `- ${c.criterion}`)
 .join('\n');

 // Format exclusion criteria
 const exclusionList = reviewData.exclusionCriteria
 .filter(c => c.enabled)
 .map(c => `- ${c.criterion}`)
 .join('\n');

 // Format PRISMA flow
 const prismaFlow = reviewData.prismaFlow;

 // Format the selected studies list
 const selectedStudiesList = reviewData.selectedStudies
 .map(study => {
 const relevanceLevel = study.overallRelevance
 ? study.overallRelevance >= 4
 ? 'High'
 : study.overallRelevance >= 3
 ? 'Medium'
 : 'Low'
 : 'Not assessed';

 const qualityLevel = study.overallQuality || 'Not assessed';

 return `- **${study.title}** (${study.authors?.[0] || 'Unknown'} et al., ${
 new Date(study.publication_date).getFullYear() || 'Unknown'
 })\n - Type: ${
 study.studyType?.name || study.studyType || 'Not specified'
 }\n - Relevance: ${relevanceLevel}\n - Quality: ${qualityLevel}`;
 })
 .join('\n\n');

 // Create the section content
 return `# Literature Search Methodology

## 1. Search Strategy Overview

### Databases Searched
${databaseNames}

### Search Period
From ${formatDate(reviewData.searchPeriod.startDate)} to ${formatDate(
 reviewData.searchPeriod.endDate
 )}

### Search Queries
${searchQueriesList}

## 2. Study Selection Criteria

### Inclusion Criteria
${inclusionList}

### Exclusion Criteria
${exclusionList}

## 3. PRISMA Flow Diagram

- Records identified through database searching: ${prismaFlow.identified || 0}
- Records screened: ${prismaFlow.screened || 0}
- Records assessed for eligibility: ${prismaFlow.eligible || 0}
- Studies included in qualitative synthesis: ${prismaFlow.included || 0}

## 4. Study Appraisal Method

All included studies were appraised for:

1. **Relevance to the device under evaluation**:
 - Device relevance
 - Population relevance
 - Outcome relevance
 - Clinical setting relevance

2. **Methodological quality**:
 - Study design appropriateness
 - Sample size adequacy
 - Follow-up period
 - Statistical analysis

3. **Risk of bias**:
 - Using domains adapted from Cochrane Risk of Bias tool
 - Each domain rated as Low, Some Concerns, or High Risk

## 5. Included Studies Summary

${selectedStudiesList || 'No studies have been included yet.'}

---

This search and appraisal methodology follows the requirements of MEDDEV 2.7/1 Rev 4 for clinical evaluation reports and adheres to the principles of systematic literature review.`;
 };

 // Helper function to guess the study type based on title and abstract
 const guessStudyType = study => {
 const titleLower = (study.title || '').toLowerCase();
 const abstractLower = (study.abstract || '').toLowerCase();
 const textToCheck = titleLower + ' ' + abstractLower;

 if (textToCheck.includes('randomized') && textToCheck.includes('trial')) {
 return 'rct';
 } else if (textToCheck.includes('systematic review') || textToCheck.includes('meta-analysis')) {
 return 'systematic_review';
 } else if (textToCheck.includes('cohort')) {
 return 'cohort';
 } else if (textToCheck.includes('case-control')) {
 return 'case_control';
 } else if (textToCheck.includes('case series')) {
 return 'case_series';
 } else if (textToCheck.includes('case report')) {
 return 'case_report';
 } else if (textToCheck.includes('in vitro') || textToCheck.includes('animal')) {
 return 'non_clinical';
 } else {
 return null; // Unknown type
 }
 };

 // Helper function for rendering star ratings
 const renderStarRating = (score, onChange) => {
 return (
 <div className="flex items-center space-x-1">
 {[1, 2, 3, 4, 5].map(value => (
 <button
 key={value}
 type="button"
 className={`text-xs ${score >= value ? 'text-yellow-500' : 'text-gray-300'}`}
 onClick={() => onChange(value)}
 >
 <Star className="h-4 w-4" fill={score >= value ? 'currentColor' : 'none'} />
 </button>
 ))}
 </div>
 );
 };

 // Component for the Search Strategy tab
 const SearchStrategyTab = () => (
 <div className="space-y-6">
 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <div className="flex justify-between items-center">
 <div>
 <CardTitle className="text-lg text-[#141413]">Databases</CardTitle>
 <CardDescription>Select the databases used for the literature search</CardDescription>
 </div>
 <CerTooltipWrapper
 tooltipContent="Select all databases that were searched during the literature review."
 whyThisMatters="MDR requires documentation of the data sources consulted. Multiple databases improve the comprehensiveness of your search and strengthen your clinical evaluation."
 >
 <HelpCircle className="h-5 w-5 text-[#292524]" />
 </CerTooltipWrapper>
 </div>
 </CardHeader>
 <CardContent className="p-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {DATABASES.map(database => (
 <div key={database.id} className="flex items-start space-x-2">
 <Checkbox
 id={`db-${database.id}`}
 checked={reviewData.databases.includes(database.id)}
 onCheckedChange={checked => handleDatabaseSelection(database.id, checked)}
 className="mt-1"
 />
 <div>
 <Label htmlFor={`db-${database.id}`} className="font-medium text-[#141413]">
 {database.name}
 </Label>
 <p className="text-[#6b6963] text-xs">{database.description}</p>
 </div>
 </div>
 ))}
 </div>
 </CardContent>
 </Card>

 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <div className="flex justify-between items-center">
 <div>
 <CardTitle className="text-lg text-[#141413]">Search Period</CardTitle>
 <CardDescription>Define the time period covered by the search</CardDescription>
 </div>
 <CerTooltipWrapper
 tooltipContent="Specify the exact date range of your literature search."
 whyThisMatters="MDR requires documentation of the search period. This allows others to reproduce your search and assess if it covers the relevant timeframe for your device."
 >
 <HelpCircle className="h-5 w-5 text-[#292524]" />
 </CerTooltipWrapper>
 </div>
 </CardHeader>
 <CardContent className="p-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label htmlFor="start-date" className="text-[#141413]">
 Start Date
 </Label>
 <Input
 id="start-date"
 type="date"
 value={reviewData.searchPeriod.startDate}
 onChange={e =>
 setReviewData(prev => ({
 ...prev,
 searchPeriod: {
 ...prev.searchPeriod,
 startDate: e.target.value,
 },
 }))
 }
 className="border-[#e8e6dc]"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="end-date" className="text-[#141413]">
 End Date
 </Label>
 <Input
 id="end-date"
 type="date"
 value={reviewData.searchPeriod.endDate}
 onChange={e =>
 setReviewData(prev => ({
 ...prev,
 searchPeriod: {
 ...prev.searchPeriod,
 endDate: e.target.value,
 },
 }))
 }
 className="border-[#e8e6dc]"
 max={new Date().toISOString().split('T')[0]}
 />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <div className="flex justify-between items-center">
 <div>
 <CardTitle className="text-lg text-[#141413]">Search Queries</CardTitle>
 <CardDescription>
 Document the exact search strings used in each database
 </CardDescription>
 </div>
 <Button
 onClick={handleAddSearchQuery}
 size="sm"
 className="bg-[#292524] hover:bg-[#1c1917] text-white"
 >
 <Plus className="h-4 w-4 mr-1" />
 Add Query
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-6 space-y-4">
 {reviewData.searchQueries.length === 0 ? (
 <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[#e8e6dc] rounded-md">
 <Database className="h-8 w-8 text-[#292524] mb-2" />
 <p className="text-center text-[#6b6963]">No search queries added yet</p>
 <p className="text-center text-xs text-[#6b6963] mt-1">
 Click "Add Query" to document your search strings
 </p>
 </div>
 ) : (
 reviewData.searchQueries.map((query, index) => (
 <div key={query.id} className="p-4 border border-[#e8e6dc] rounded-md space-y-3">
 <div className="flex justify-between items-center">
 <div className="flex items-center">
 <Badge variant="outline" className="bg-[#faf0ec] text-[#292524] mr-2">
 Query {index + 1}
 </Badge>
 {query.results !== null && (
 <Badge variant="outline" className="bg-[#e4ebd8] text-[#788c5d]">
 {query.results} results
 </Badge>
 )}
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleRemoveSearchQuery(query.id)}
 className="h-8 w-8 p-0 text-[#1c1917]"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <div className="md:col-span-1">
 <Label htmlFor={`db-select-${query.id}`} className="text-[#141413] text-xs">
 Database
 </Label>
 <Select
 value={query.database}
 onValueChange={value => handleUpdateSearchQuery(query.id, 'database', value)}
 >
 <SelectTrigger id={`db-select-${query.id}`} className="border-[#e8e6dc] mt-1">
 <SelectValue placeholder="Select database" />
 </SelectTrigger>
 <SelectContent>
 {DATABASES.map(db => (
 <SelectItem key={db.id} value={db.id}>
 {db.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="md:col-span-2">
 <Label htmlFor={`query-${query.id}`} className="text-[#141413] text-xs">
 Search String
 </Label>
 <Textarea
 id={`query-${query.id}`}
 value={query.query}
 onChange={e => handleUpdateSearchQuery(query.id, 'query', e.target.value)}
 className="border-[#e8e6dc] mt-1 h-20"
 placeholder="Enter the exact search string used..."
 />
 </div>
 <div className="md:col-span-1 flex flex-col justify-end">
 <Button
 onClick={() => handleSearchPubMed(query.id)}
 disabled={isSearching || !query.query.trim()}
 className="bg-[#292524] hover:bg-[#1c1917] text-white mt-auto"
 >
 {isSearching ? (
 <>
 <Clock className="h-4 w-4 mr-2 animate-spin" />
 Searching...
 </>
 ) : (
 <>
 <Search className="h-4 w-4 mr-2" />
 Search PubMed
 </>
 )}
 </Button>
 </div>
 </div>
 </div>
 ))
 )}

 {/* Search Results Section */}
 {searchResults.length > 0 && (
 <div className="mt-6 border border-[#e8e6dc] rounded-md p-4">
 <div className="flex justify-between items-center mb-4">
 <h3 className="text-[#141413] font-medium">
 Search Results ({searchResults.length})
 </h3>
 <Badge variant="outline" className="bg-[#faf0ec] text-[#292524]">
 <BookOpen className="h-3 w-3 mr-1" />
 PubMed Results
 </Badge>
 </div>

 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-[50%]">Title</TableHead>
 <TableHead>Authors</TableHead>
 <TableHead>Year</TableHead>
 <TableHead className="text-right">Action</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {searchResults.slice(0, 10).map(study => (
 <TableRow key={study.id}>
 <TableCell className="font-medium">{study.title}</TableCell>
 <TableCell>{study.authors?.join(', ') || 'Unknown'}</TableCell>
 <TableCell>
 {new Date(study.publication_date).getFullYear() || 'Unknown'}
 </TableCell>
 <TableCell className="text-right">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleAddStudy(study)}
 disabled={reviewData.selectedStudies.some(s => s.id === study.id)}
 className="h-8 text-[#292524] hover:text-[#1c1917] hover:bg-[#faf0ec]"
 >
 {reviewData.selectedStudies.some(s => s.id === study.id) ? (
 <>
 <CheckCircle className="h-4 w-4 mr-1" />
 Added
 </>
 ) : (
 <>
 <Plus className="h-4 w-4 mr-1" />
 Include
 </>
 )}
 </Button>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>

 {searchResults.length > 10 && (
 <div className="text-center text-[#6b6963] text-sm mt-2">
 Showing 10 of {searchResults.length} results
 </div>
 )}
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );

 // Component for the Criteria tab
 const CriteriaTab = () => (
 <div className="space-y-6">
 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <div className="flex justify-between items-center">
 <div>
 <CardTitle className="text-lg text-[#141413]">Inclusion Criteria</CardTitle>
 <CardDescription>
 Define criteria for including studies in the analysis
 </CardDescription>
 </div>
 <Button
 onClick={() => handleAddCriterion('inclusionCriteria')}
 size="sm"
 className="bg-[#292524] hover:bg-[#1c1917] text-white"
 >
 <Plus className="h-4 w-4 mr-1" />
 Add Criterion
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-6">
 {reviewData.inclusionCriteria.length === 0 ? (
 <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[#e8e6dc] rounded-md">
 <Filter className="h-8 w-8 text-[#292524] mb-2" />
 <p className="text-center text-[#6b6963]">No inclusion criteria added yet</p>
 <p className="text-center text-xs text-[#6b6963] mt-1">
 Click "Add Criterion" to define your inclusion criteria
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 {reviewData.inclusionCriteria.map(criterion => (
 <div
 key={criterion.id}
 className="flex items-start space-x-2 p-3 border border-[#e8e6dc] rounded-md"
 >
 <Checkbox
 id={`inclusion-${criterion.id}`}
 checked={criterion.enabled}
 onCheckedChange={checked =>
 handleUpdateCriterion('inclusionCriteria', criterion.id, 'enabled', checked)
 }
 className="mt-1"
 />
 <div className="flex-1">
 <Textarea
 value={criterion.criterion}
 onChange={e =>
 handleUpdateCriterion(
 'inclusionCriteria',
 criterion.id,
 'criterion',
 e.target.value
 )
 }
 className="border-[#e8e6dc] min-h-10"
 placeholder="Describe inclusion criterion..."
 />
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleRemoveCriterion('inclusionCriteria', criterion.id)}
 className="h-8 w-8 p-0 text-[#1c1917]"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <div className="flex justify-between items-center">
 <div>
 <CardTitle className="text-lg text-[#141413]">Exclusion Criteria</CardTitle>
 <CardDescription>
 Define criteria for excluding studies from the analysis
 </CardDescription>
 </div>
 <Button
 onClick={() => handleAddCriterion('exclusionCriteria')}
 size="sm"
 className="bg-[#292524] hover:bg-[#1c1917] text-white"
 >
 <Plus className="h-4 w-4 mr-1" />
 Add Criterion
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-6">
 {reviewData.exclusionCriteria.length === 0 ? (
 <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[#e8e6dc] rounded-md">
 <Filter className="h-8 w-8 text-[#292524] mb-2" />
 <p className="text-center text-[#6b6963]">No exclusion criteria added yet</p>
 <p className="text-center text-xs text-[#6b6963] mt-1">
 Click "Add Criterion" to define your exclusion criteria
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 {reviewData.exclusionCriteria.map(criterion => (
 <div
 key={criterion.id}
 className="flex items-start space-x-2 p-3 border border-[#e8e6dc] rounded-md"
 >
 <Checkbox
 id={`exclusion-${criterion.id}`}
 checked={criterion.enabled}
 onCheckedChange={checked =>
 handleUpdateCriterion('exclusionCriteria', criterion.id, 'enabled', checked)
 }
 className="mt-1"
 />
 <div className="flex-1">
 <Textarea
 value={criterion.criterion}
 onChange={e =>
 handleUpdateCriterion(
 'exclusionCriteria',
 criterion.id,
 'criterion',
 e.target.value
 )
 }
 className="border-[#e8e6dc] min-h-10"
 placeholder="Describe exclusion criterion..."
 />
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleRemoveCriterion('exclusionCriteria', criterion.id)}
 className="h-8 w-8 p-0 text-[#1c1917]"
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <CardTitle className="text-lg text-[#141413]">PRISMA Flow Diagram</CardTitle>
 <CardDescription>Track the flow of studies through the review process</CardDescription>
 </CardHeader>
 <CardContent className="p-6">
 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <div className="p-4 border border-[#e8e6dc] rounded-md text-center space-y-2">
 <p className="text-[#141413] font-medium">Identified</p>
 <p className="text-3xl text-[#292524] font-semibold">
 {reviewData.prismaFlow.identified || 0}
 </p>
 <p className="text-xs text-[#6b6963]">
 Records identified through database searching
 </p>
 </div>
 <div className="p-4 border border-[#e8e6dc] rounded-md text-center space-y-2">
 <p className="text-[#141413] font-medium">Screened</p>
 <p className="text-3xl text-[#292524] font-semibold">
 {reviewData.prismaFlow.screened || 0}
 </p>
 <p className="text-xs text-[#6b6963]">Records after duplicates removed</p>
 </div>
 <div className="p-4 border border-[#e8e6dc] rounded-md text-center space-y-2">
 <p className="text-[#141413] font-medium">Eligible</p>
 <p className="text-3xl text-[#292524] font-semibold">
 {reviewData.prismaFlow.eligible || 0}
 </p>
 <p className="text-xs text-[#6b6963]">Full-text articles assessed for eligibility</p>
 </div>
 <div className="p-4 border border-[#e8e6dc] rounded-md text-center space-y-2">
 <p className="text-[#141413] font-medium">Included</p>
 <p className="text-3xl text-[#292524] font-semibold">
 {reviewData.prismaFlow.included || 0}
 </p>
 <p className="text-xs text-[#6b6963]">Studies included in analysis</p>
 </div>
 </div>

 <div className="mt-4 text-xs text-[#6b6963]">
 <p>
 The PRISMA flow diagram documents how studies were selected through the review
 process. This diagram will be automatically updated as you add studies to your review.
 </p>
 </div>
 </CardContent>
 </Card>
 </div>
 );

 // Component for the Study Selection tab
 const StudySelectionTab = () => (
 <div className="space-y-6">
 {isSearching ? (
 <Card className="border-[#e8e6dc]">
 <CardContent className="p-8 flex flex-col items-center">
 <Clock className="h-12 w-12 text-[#292524] animate-spin mb-4" />
 <p className="text-[#141413] font-medium mb-2">Searching Literature Database</p>
 <p className="text-[#6b6963] text-center mb-4">Retrieving results from PubMed...</p>
 <Progress value={65} className="w-full max-w-md" />
 </CardContent>
 </Card>
 ) : (
 <>
 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <div className="flex justify-between items-center">
 <div>
 <CardTitle className="text-lg text-[#141413]">Selected Studies</CardTitle>
 <CardDescription>Studies included in the clinical evaluation</CardDescription>
 </div>
 <CerTooltipWrapper
 tooltipContent="This list contains all studies that have been screened and included in your clinical evaluation."
 whyThisMatters="MDR requires documentation of all studies included in the clinical evaluation along with their appraisal. Notified Bodies specifically check for a comprehensive and structured literature review."
 >
 <HelpCircle className="h-5 w-5 text-[#292524]" />
 </CerTooltipWrapper>
 </div>
 </CardHeader>
 <CardContent className="p-6">
 {reviewData.selectedStudies.length === 0 ? (
 <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[#e8e6dc] rounded-md">
 <BookOpen className="h-8 w-8 text-[#292524] mb-2" />
 <p className="text-center text-[#6b6963]">No studies selected yet</p>
 <p className="text-center text-xs text-[#6b6963] mt-1">
 Search the literature database and include relevant studies
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 <Alert className="bg-[#faf0ec] border-[#292524]">
 <AlertCircle className="h-4 w-4 text-[#292524]" />
 <AlertTitle className="text-[#292524]">
 AI-Assisted Appraisal Available
 </AlertTitle>
 <AlertDescription className="text-[#141413]">
 Generate automated relevance and bias assessments for all selected studies
 using AI. The system will analyze study content and provide initial ratings.
 <div className="mt-2">
 <Button
 onClick={generateAIAppraisals}
 disabled={isGeneratingAppraisals}
 className="bg-[#292524] hover:bg-[#1c1917] text-white"
 >
 {isGeneratingAppraisals ? (
 <>
 <Clock className="h-4 w-4 mr-2 animate-spin" />
 Generating Appraisals...
 </>
 ) : (
 <>
 <BarChart2 className="h-4 w-4 mr-2" />
 Generate AI Appraisals
 </>
 )}
 </Button>
 </div>
 </AlertDescription>
 </Alert>

 <div className="overflow-x-auto">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-[40%]">Title</TableHead>
 <TableHead>Authors</TableHead>
 <TableHead>Year</TableHead>
 <TableHead>Type</TableHead>
 <TableHead>Relevance</TableHead>
 <TableHead>Quality</TableHead>
 <TableHead className="text-right">Action</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {reviewData.selectedStudies.map(study => (
 <TableRow key={study.id}>
 <TableCell className="font-medium">
 <div className="truncate max-w-xs">{study.title}</div>
 {study.journal && (
 <div className="text-xs text-[#6b6963]">{study.journal}</div>
 )}
 </TableCell>
 <TableCell>
 {study.authors?.length > 0
 ? `${study.authors[0]}${study.authors.length > 1 ? ' et al.' : ''}`
 : 'Unknown'}
 </TableCell>
 <TableCell>
 {study.publication_date
 ? new Date(study.publication_date).getFullYear()
 : 'Unknown'}
 </TableCell>
 <TableCell>
 <Select
 value={study.studyType || ''}
 onValueChange={value =>
 handleUpdateStudy(study.id, 'studyType', value)
 }
 >
 <SelectTrigger className="border-[#e8e6dc] h-8 text-xs w-32">
 <SelectValue placeholder="Select type" />
 </SelectTrigger>
 <SelectContent>
 {STUDY_TYPES.map(type => (
 <SelectItem key={type.id} value={type.id}>
 {type.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </TableCell>
 <TableCell>
 {study.overallRelevance ? (
 <Badge
 className={`${
 study.overallRelevance >= 4
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.overallRelevance >= 3
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.overallRelevance >= 4
 ? 'High'
 : study.overallRelevance >= 3
 ? 'Medium'
 : 'Low'}
 </Badge>
 ) : (
 <span className="text-xs text-[#6b6963]">Not assessed</span>
 )}
 </TableCell>
 <TableCell>
 {study.overallQuality ? (
 <Badge
 className={`${
 study.overallQuality === 'high'
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.overallQuality === 'medium'
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.overallQuality === 'high'
 ? 'High'
 : study.overallQuality === 'medium'
 ? 'Medium'
 : 'Low'}
 </Badge>
 ) : (
 <span className="text-xs text-[#6b6963]">Not assessed</span>
 )}
 </TableCell>
 <TableCell className="text-right">
 <div className="flex items-center justify-end space-x-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setActiveTab('appraisal')}
 className="h-8 text-xs border-[#292524] text-[#292524] hover:bg-[#faf0ec]"
 >
 Appraise
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleRemoveStudy(study.id)}
 className="h-8 text-xs text-[#1c1917] hover:bg-red-50"
 >
 Remove
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </div>
 )}
 </CardContent>
 <CardFooter className="bg-[#faf9f5] border-t border-[#e8e6dc] px-6 py-3">
 <div className="w-full flex justify-between items-center">
 <div className="text-sm text-[#6b6963]">
 {reviewData.selectedStudies.length}{' '}
 {reviewData.selectedStudies.length === 1 ? 'study' : 'studies'} included
 </div>
 <div>
 <Button
 onClick={() => setActiveTab('search-strategy')}
 variant="outline"
 className="text-[#292524] border-[#292524] hover:bg-[#faf0ec]"
 >
 <Search className="h-4 w-4 mr-2" />
 Search More Studies
 </Button>
 </div>
 </div>
 </CardFooter>
 </Card>
 </>
 )}
 </div>
 );

 // Component for the Study Appraisal tab
 const StudyAppraisalTab = () => (
 <div className="space-y-6">
 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <CardTitle className="text-lg text-[#141413]">Study Appraisal</CardTitle>
 <CardDescription>
 Assess relevance and methodological quality of included studies
 </CardDescription>
 </CardHeader>
 <CardContent className="p-0">
 {reviewData.selectedStudies.length === 0 ? (
 <div className="p-6">
 <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[#e8e6dc] rounded-md">
 <AlertCircle className="h-8 w-8 text-[#292524] mb-2" />
 <p className="text-center text-[#6b6963]">No studies selected for appraisal</p>
 <p className="text-center text-xs text-[#6b6963] mt-1">
 Select studies in the Study Selection tab first
 </p>
 <Button
 onClick={() => setActiveTab('study-selection')}
 className="mt-4 bg-[#292524] hover:bg-[#1c1917] text-white"
 >
 Go to Study Selection
 </Button>
 </div>
 </div>
 ) : (
 <div className="p-4">
 <Accordion type="single" collapsible className="w-full">
 {reviewData.selectedStudies.map(study => (
 <AccordionItem
 key={study.id}
 value={study.id}
 className="border border-[#e8e6dc] rounded-md mb-4 overflow-hidden"
 >
 <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-[#f4f3ee]">
 <div className="flex-1 flex justify-between items-center pr-4">
 <div>
 <h3 className="font-medium text-[#141413] text-left">{study.title}</h3>
 <p className="text-xs text-[#6b6963] text-left">
 {study.authors?.length > 0
 ? `${study.authors[0]}${study.authors.length > 1 ? ' et al.' : ''}`
 : 'Unknown'}
 {study.publication_date
 ? ` (${new Date(study.publication_date).getFullYear()})`
 : ''}
 {study.journal ? ` - ${study.journal}` : ''}
 </p>
 </div>
 <div className="flex items-center space-x-3">
 <div className="text-right">
 <div className="flex items-center">
 <span className="text-xs font-medium mr-2">Relevance:</span>
 {study.overallRelevance ? (
 <Badge
 className={`${
 study.overallRelevance >= 4
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.overallRelevance >= 3
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.overallRelevance >= 4
 ? 'High'
 : study.overallRelevance >= 3
 ? 'Medium'
 : 'Low'}
 </Badge>
 ) : (
 <span className="text-xs text-[#6b6963]">Pending</span>
 )}
 </div>
 <div className="flex items-center mt-1">
 <span className="text-xs font-medium mr-2">Quality:</span>
 {study.overallQuality ? (
 <Badge
 className={`${
 study.overallQuality === 'high'
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.overallQuality === 'medium'
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.overallQuality === 'high'
 ? 'High'
 : study.overallQuality === 'medium'
 ? 'Medium'
 : 'Low'}
 </Badge>
 ) : (
 <span className="text-xs text-[#6b6963]">Pending</span>
 )}
 </div>
 </div>
 {study.aiAppraisal && (
 <Badge variant="outline" className="bg-[#faf0ec] text-[#292524]">
 AI Appraised
 </Badge>
 )}
 </div>
 </div>
 </AccordionTrigger>
 <AccordionContent className="border-t border-[#e8e6dc]">
 <div className="p-4 space-y-6">
 {study.aiAppraisal && (
 <Alert className="bg-[#faf0ec] border-[#292524]">
 <AlertCircle className="h-4 w-4 text-[#292524]" />
 <AlertTitle className="text-[#141413]">
 AI-Generated Appraisal
 </AlertTitle>
 <AlertDescription className="text-[#6b6963]">
 <p>
 An initial appraisal has been generated using AI analysis. Review
 and adjust the ratings as needed.
 </p>
 {study.aiAppraisal.relevance?.summary && (
 <div className="mt-2">
 <p className="font-medium text-[#141413]">
 Relevance Assessment:
 </p>
 <p className="text-sm">{study.aiAppraisal.relevance.summary}</p>
 </div>
 )}
 {study.aiAppraisal.bias?.summary && (
 <div className="mt-2">
 <p className="font-medium text-[#141413]">Bias Assessment:</p>
 <p className="text-sm">{study.aiAppraisal.bias.summary}</p>
 </div>
 )}
 </AlertDescription>
 </Alert>
 )}

 <div>
 <h4 className="font-medium text-[#141413] mb-3">Study Details</h4>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
 <div>
 <Label
 htmlFor={`study-type-${study.id}`}
 className="text-[#141413] text-xs"
 >
 Study Type
 </Label>
 <Select
 value={study.studyType || ''}
 onValueChange={value =>
 handleUpdateStudy(study.id, 'studyType', value)
 }
 >
 <SelectTrigger
 id={`study-type-${study.id}`}
 className="border-[#e8e6dc] mt-1"
 >
 <SelectValue placeholder="Select type" />
 </SelectTrigger>
 <SelectContent>
 {STUDY_TYPES.map(type => (
 <SelectItem key={type.id} value={type.id}>
 {type.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="md:col-span-2">
 <Label
 htmlFor={`study-notes-${study.id}`}
 className="text-[#141413] text-xs"
 >
 Notes
 </Label>
 <Textarea
 id={`study-notes-${study.id}`}
 value={study.notes || ''}
 onChange={e => handleUpdateStudy(study.id, 'notes', e.target.value)}
 placeholder="Add notes about this study..."
 className="border-[#e8e6dc] mt-1 h-10"
 />
 </div>
 </div>

 {study.abstract && (
 <div className="p-3 bg-[#f4f3ee] rounded text-sm text-[#141413] mb-4">
 <p className="font-medium mb-1">Abstract:</p>
 <p>{study.abstract}</p>
 </div>
 )}

 {study.url && (
 <div className="flex items-center mb-4">
 <a
 href={study.url}
 target="_blank"
 rel="noopener noreferrer"
 className="text-sm text-[#292524] hover:underline flex items-center"
 >
 <ExternalLink className="h-3.5 w-3.5 mr-1" />
 View Full Text
 </a>
 </div>
 )}
 </div>

 <div>
 <h4 className="font-medium text-[#141413] mb-3">Relevance Assessment</h4>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-[40%]">Relevance Criterion</TableHead>
 <TableHead>Rating</TableHead>
 <TableHead className="w-[40%]">AI Assessment</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {reviewData.appraisalCriteria.relevance.map(criterion => (
 <TableRow key={criterion.id}>
 <TableCell>
 <div className="font-medium text-[#141413]">
 {criterion.name}
 </div>
 <div className="text-xs text-[#6b6963]">
 {criterion.description}
 </div>
 </TableCell>
 <TableCell>
 {renderStarRating(
 study.relevanceScores?.[criterion.id] || 0,
 value =>
 handleUpdateStudyNestedField(
 study.id,
 'relevanceScores',
 criterion.id,
 value
 )
 )}
 </TableCell>
 <TableCell>
 {study.aiAppraisal?.relevance?.criteriaAssessments?.[
 criterion.id
 ] || (
 <span className="text-xs text-[#6b6963]">
 No AI assessment available
 </span>
 )}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>

 <div className="mt-4 flex items-center justify-between">
 <div>
 <Label className="text-[#141413]">Overall Relevance Rating</Label>
 <div className="flex items-center mt-1">
 {renderStarRating(study.overallRelevance || 0, value =>
 handleUpdateStudy(study.id, 'overallRelevance', value)
 )}
 <div className="ml-3">
 {study.overallRelevance && (
 <Badge
 className={`${
 study.overallRelevance >= 4
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.overallRelevance >= 3
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.overallRelevance >= 4
 ? 'High'
 : study.overallRelevance >= 3
 ? 'Medium'
 : 'Low'}{' '}
 Relevance
 </Badge>
 )}
 </div>
 </div>
 </div>

 {study.aiAppraisal?.relevance?.overallScore && (
 <div className="text-sm">
 <span className="text-[#6b6963]">AI recommended rating: </span>
 <Badge
 className={`${
 study.aiAppraisal.relevance.overallScore >= 4
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.aiAppraisal.relevance.overallScore >= 3
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.aiAppraisal.relevance.overallScore >= 4
 ? 'High'
 : study.aiAppraisal.relevance.overallScore >= 3
 ? 'Medium'
 : 'Low'}
 </Badge>
 </div>
 )}
 </div>
 </div>

 <div>
 <h4 className="font-medium text-[#141413] mb-3">Bias Assessment</h4>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-[30%]">Bias Domain</TableHead>
 <TableHead className="w-[20%]">Risk Level</TableHead>
 <TableHead>Justification</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {BIAS_DOMAINS.map(domain => (
 <TableRow key={domain.id}>
 <TableCell>
 <div className="font-medium text-[#141413]">{domain.name}</div>
 <div className="text-xs text-[#6b6963]">
 {domain.description}
 </div>
 </TableCell>
 <TableCell>
 <Select
 value={study.biasAssessment?.[domain.id]?.risk || 'unclear'}
 onValueChange={value =>
 handleUpdateBiasAssessment(
 study.id,
 domain.id,
 'risk',
 value
 )
 }
 >
 <SelectTrigger className="border-[#e8e6dc]">
 <SelectValue placeholder="Select risk" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="low">Low Risk</SelectItem>
 <SelectItem value="some_concerns">Some Concerns</SelectItem>
 <SelectItem value="high">High Risk</SelectItem>
 <SelectItem value="unclear">Unclear</SelectItem>
 <SelectItem value="not_applicable">
 Not Applicable
 </SelectItem>
 </SelectContent>
 </Select>
 </TableCell>
 <TableCell>
 <Textarea
 value={study.biasAssessment?.[domain.id]?.justification || ''}
 onChange={e =>
 handleUpdateBiasAssessment(
 study.id,
 domain.id,
 'justification',
 e.target.value
 )
 }
 placeholder="Explain the basis for this risk assessment..."
 className="border-[#e8e6dc] h-16"
 />
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>

 <div className="mt-4 flex items-center justify-between">
 <div>
 <Label className="text-[#141413]">Overall Quality Assessment</Label>
 <div className="flex items-center mt-1">
 <Select
 value={study.overallQuality || ''}
 onValueChange={value =>
 handleUpdateStudy(study.id, 'overallQuality', value)
 }
 >
 <SelectTrigger className="border-[#e8e6dc] w-40">
 <SelectValue placeholder="Select overall quality" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="high">High Quality</SelectItem>
 <SelectItem value="medium">Medium Quality</SelectItem>
 <SelectItem value="low">Low Quality</SelectItem>
 </SelectContent>
 </Select>
 <div className="ml-3">
 {study.overallQuality && (
 <Badge
 className={`${
 study.overallQuality === 'high'
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.overallQuality === 'medium'
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.overallQuality === 'high'
 ? 'High'
 : study.overallQuality === 'medium'
 ? 'Medium'
 : 'Low'}{' '}
 Quality
 </Badge>
 )}
 </div>
 </div>
 </div>

 {study.aiAppraisal?.bias?.overallRisk && (
 <div className="text-sm">
 <span className="text-[#6b6963]">AI recommended quality: </span>
 <Badge
 className={`${
 study.aiAppraisal.bias.overallRisk === 'low'
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.aiAppraisal.bias.overallRisk === 'some_concerns'
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.aiAppraisal.bias.overallRisk === 'low'
 ? 'High'
 : study.aiAppraisal.bias.overallRisk === 'some_concerns'
 ? 'Medium'
 : 'Low'}
 </Badge>
 </div>
 )}
 </div>
 </div>
 </div>
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );

 // Component for the Search Report tab
 const SearchReportTab = () => (
 <div className="space-y-6">
 <Card className="border-[#e8e6dc]">
 <CardHeader className="bg-[#faf9f5] border-b border-[#e8e6dc]">
 <div className="flex justify-between items-center">
 <div>
 <CardTitle className="text-lg text-[#141413]">Literature Search Report</CardTitle>
 <CardDescription>
 Summary of the literature search methodology and results
 </CardDescription>
 </div>
 <Button
 onClick={generateSearchSummary}
 className="bg-[#292524] hover:bg-[#1c1917] text-white"
 >
 <FileText className="h-4 w-4 mr-2" />
 Generate Report
 </Button>
 </div>
 </CardHeader>
 <CardContent className="p-6">
 {!searchSummary ? (
 <div className="flex flex-col items-center justify-center p-8 border border-dashed border-[#e8e6dc] rounded-md">
 <FileText className="h-8 w-8 text-[#292524] mb-2" />
 <p className="text-center text-[#6b6963]">No search report generated yet</p>
 <p className="text-center text-xs text-[#6b6963] mt-1">
 Click "Generate Report" to create a summary of your literature search
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {searchSummary.content && (
 <div className="prose prose-sm max-w-none">
 <div
 className="text-[#141413]"
 dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(searchSummary.content) }}
 />
 </div>
 )}

 {searchSummary.tables && searchSummary.tables.included_studies && (
 <div className="mt-6">
 <h3 className="text-[#141413] font-medium mb-2">Included Studies Overview</h3>
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-[#e8e6dc] border border-[#e8e6dc] text-sm">
 <thead>
 <tr className="bg-[#faf9f5]">
 <th className="px-3 py-2 text-left text-[#141413] font-medium border-b border-[#e8e6dc]">
 Study
 </th>
 <th className="px-3 py-2 text-left text-[#141413] font-medium border-b border-[#e8e6dc]">
 Year
 </th>
 <th className="px-3 py-2 text-left text-[#141413] font-medium border-b border-[#e8e6dc]">
 Type
 </th>
 <th className="px-3 py-2 text-left text-[#141413] font-medium border-b border-[#e8e6dc]">
 Relevance
 </th>
 <th className="px-3 py-2 text-left text-[#141413] font-medium border-b border-[#e8e6dc]">
 Quality
 </th>
 </tr>
 </thead>
 <tbody className="divide-y divide-[#e8e6dc]">
 {searchSummary.tables.included_studies.map((study, index) => (
 <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-[#faf9f5]'}>
 <td className="px-3 py-2 text-[#141413]">{study.title}</td>
 <td className="px-3 py-2 text-[#141413]">{study.year}</td>
 <td className="px-3 py-2 text-[#141413]">{study.type}</td>
 <td className="px-3 py-2">
 <Badge
 className={`${
 study.relevance === 'High'
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.relevance === 'Medium'
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.relevance}
 </Badge>
 </td>
 <td className="px-3 py-2">
 <Badge
 className={`${
 study.quality === 'High'
 ? 'bg-[#e4ebd8] text-[#788c5d]'
 : study.quality === 'Medium'
 ? 'bg-[#FFF4CE] text-[#797775]'
 : 'bg-[#f5ddd4] text-[#1c1917]'
 }`}
 >
 {study.quality}
 </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 <div className="pt-4 flex justify-end">
 <Button onClick={addToCER} className="bg-[#292524] hover:bg-[#1c1917] text-white">
 <FileCheck className="h-4 w-4 mr-2" />
 Add to CER
 </Button>
 </div>
 </div>
 )}
 </CardContent>
 </Card>
 </div>
 );

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <div>
 <h2 className="text-2xl font-semibold text-[#141413]">Literature Review Workflow</h2>
 <p className="text-[#6b6963] mt-1">
 Document and track your search methodology, evidence selection, and appraisal process
 </p>
 </div>
 <div className="flex space-x-2">
 <Button
 variant="outline"
 className="border-[#292524] text-[#292524] hover:bg-[#faf0ec]"
 onClick={() => setHasChanged(false)}
 disabled={!hasChanged}
 >
 <Save className="h-4 w-4 mr-2" />
 Save Progress
 </Button>
 </div>
 </div>

 <Tabs
 defaultValue="search-strategy"
 className="w-full"
 onValueChange={setActiveTab}
 value={activeTab}
 >
 <TabsList className="bg-[#f4f3ee] p-1 rounded-md mb-4">
 <TabsTrigger
 value="search-strategy"
 className="data-[state=active]:bg-white data-[state=active]:text-[#141413] px-3 py-1.5 text-[#6b6963] rounded-sm"
 >
 Search Strategy
 </TabsTrigger>
 <TabsTrigger
 value="criteria"
 className="data-[state=active]:bg-white data-[state=active]:text-[#141413] px-3 py-1.5 text-[#6b6963] rounded-sm"
 >
 Inclusion/Exclusion
 </TabsTrigger>
 <TabsTrigger
 value="study-selection"
 className="data-[state=active]:bg-white data-[state=active]:text-[#141413] px-3 py-1.5 text-[#6b6963] rounded-sm"
 >
 Study Selection
 </TabsTrigger>
 <TabsTrigger
 value="appraisal"
 className="data-[state=active]:bg-white data-[state=active]:text-[#141413] px-3 py-1.5 text-[#6b6963] rounded-sm"
 >
 Quality Appraisal
 </TabsTrigger>
 <TabsTrigger
 value="search-report"
 className="data-[state=active]:bg-white data-[state=active]:text-[#141413] px-3 py-1.5 text-[#6b6963] rounded-sm"
 >
 Search Report
 </TabsTrigger>
 </TabsList>

 <TabsContent value="search-strategy">
 <SearchStrategyTab />
 </TabsContent>

 <TabsContent value="criteria">
 <CriteriaTab />
 </TabsContent>

 <TabsContent value="study-selection">
 <StudySelectionTab />
 </TabsContent>

 <TabsContent value="appraisal">
 <StudyAppraisalTab />
 </TabsContent>

 <TabsContent value="search-report">
 <SearchReportTab />
 </TabsContent>
 </Tabs>
 </div>
 );
}
