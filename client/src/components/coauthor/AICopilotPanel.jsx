import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

/**
 * AICopilotPanel
 *
 * Right-side panel for the Co-Author feature that provides AI assistance.
 * Includes context retrieval, draft generation, and section validation.
 */
export default function AICopilotPanel() {
 const [contextQuery, setContextQuery] = useState('');
 const [contextSnippets, setContextSnippets] = useState([]);
 const [loadingContext, setLoadingContext] = useState(false);
 const [selectedSnippets, setSelectedSnippets] = useState([]);

 // Handle context search
 const handleContextSearch = async () => {
 if (!contextQuery.trim()) return;

 setLoadingContext(true);

 try {
 // Simulate API call
 setTimeout(() => {
 // Sample context snippets
 const sampleSnippets = [
 {
 id: 1,
 source: 'ICH E3 Guidelines',
 text: 'Clinical summaries should include a comprehensive analysis of all clinical data relevant to the product.',
 },
 {
 id: 2,
 source: 'FDA Guidance, 2023',
 text: 'Section 2.7 should provide a detailed summary of clinical findings, including benefits and risks assessment.',
 },
 {
 id: 3,
 source: 'EMA Clinical Documentation',
 text: 'The clinical summary should be concise but comprehensive, highlighting key efficacy and safety findings.',
 },
 ];

 setContextSnippets(sampleSnippets);
 setLoadingContext(false);
 }, 800);
 } catch (error) {
 console.error('Error fetching context:', error);
 setLoadingContext(false);
 }
 };

 // Toggle a context snippet selection
 const toggleSnippetSelection = snippet => {
 if (selectedSnippets.some(s => s.id === snippet.id)) {
 setSelectedSnippets(selectedSnippets.filter(s => s.id !== snippet.id));
 } else {
 setSelectedSnippets([...selectedSnippets, snippet]);
 }
 };

 // Check if a snippet is selected
 const isSnippetSelected = snippet => {
 return selectedSnippets.some(s => s.id === snippet.id);
 };

 return (
 <div className="ai-copilot-panel">
 {/* Search box */}
 <div className="mb-4">
 <label htmlFor="context-search" className="block text-sm font-medium text-gray-700 mb-1">
 Search Regulatory Context
 </label>
 <div className="flex gap-2">
 <input
 id="context-search"
 type="text"
 className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
 placeholder="Search for relevant guidance..."
 value={contextQuery}
 onChange={e => setContextQuery(e.target.value)}
 onKeyDown={e => {
 if (e.key === 'Enter') handleContextSearch();
 }}
 />
 <button
 onClick={handleContextSearch}
 disabled={loadingContext || !contextQuery.trim()}
 className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60"
 >
 {loadingContext ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Search className="h-4 w-4" />
 )}
 </button>
 </div>
 </div>

 {/* Context search results */}
 {contextSnippets.length > 0 && (
 <div className="mb-4">
 <h3 className="text-sm font-medium text-gray-700 mb-2">
 Found {contextSnippets.length} relevant sources:
 </h3>
 <div className="space-y-3 max-h-[400px] overflow-y-auto">
 {contextSnippets.map(snippet => (
 <div
 key={snippet.id}
 className={`p-3 text-sm border rounded-md cursor-pointer transition-colors ${
 isSnippetSelected(snippet)
 ? 'bg-indigo-50 border-indigo-200'
 : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
 }`}
 onClick={() => toggleSnippetSelection(snippet)}
 >
 <p className="text-gray-700 italic">"{snippet.text}"</p>
 <div className="flex justify-between items-center mt-2">
 <span className="text-xs text-gray-500">{snippet.source}</span>
 {isSnippetSelected(snippet) ? (
 <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
 Selected
 </span>
 ) : (
 <span className="text-xs text-indigo-600">Click to select</span>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Risk analysis visualization */}
 <div className="border border-gray-200 rounded-md p-3 mt-4">
 <h3 className="text-sm font-medium mb-2">Section Risk Analysis</h3>
 <div className="space-y-3">
 {/* Risk items */}
 <div className="flex items-center">
 <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
 <span className="text-sm">Missing safety endpoint data</span>
 </div>
 <div className="flex items-center">
 <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
 <span className="text-sm">Incomplete efficacy analysis</span>
 </div>
 <div className="flex items-center">
 <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
 <span className="text-sm">Patient demographics well-described</span>
 </div>
 </div>
 </div>

 {/* Regulatory guidance summary */}
 <div className="border border-gray-200 rounded-md p-3 mt-4">
 <h3 className="text-sm font-medium mb-2">Key Guidance</h3>
 <ul className="text-sm space-y-2 list-disc pl-4">
 <li>Include comprehensive benefit-risk assessment (ICH E3)</li>
 <li>Summarize all Phase 2-3 studies (FDA, 2023)</li>
 <li>Address special population considerations (EMA, 2022)</li>
 </ul>
 </div>
 </div>
 );
}
