import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lightbulb, Check, AlertCircle, Info } from 'lucide-react';

export default function StudyDesignAssistant({ session }) {
 const [query, setQuery] = useState('');
 const [recommendations, setRecommendations] = useState([]);
 const [loading, setLoading] = useState(false);

 const generateRecommendations = async () => {
 if (!query.trim()) return;

 setLoading(true);

 // In a real implementation, this would make an API call
 await new Promise(resolve => setTimeout(resolve, 2000));

 // Sample recommendations
 const sampleRecommendations = [
 {
 type: 'best_practice',
 title: 'Consider adaptive trial design',
 description:
 'For this indication, an adaptive design with potential for sample size re-estimation would improve efficiency.',
 source: 'Based on 7 similar trials in the CTgov database',
 icon: <Check className="h-5 w-5 text-green-500" />,
 },
 {
 type: 'regulatory',
 title: 'Include DSMB monitoring',
 description:
 'FDA guidance for this indication requires Data and Safety Monitoring Board oversight with specified stopping rules.',
 source: 'FDA Guidance (2023)',
 icon: <AlertCircle className="h-5 w-5 text-red-500" />,
 },
 {
 type: 'efficiency',
 title: 'Optimize inclusion criteria',
 description:
 'Your inclusion criteria may be too restrictive, potentially slowing enrollment. Consider relaxing HbA1c range.',
 source: 'Analysis of 12 similar completed trials',
 icon: <Lightbulb className="h-5 w-5 text-yellow-500" />,
 },
 {
 type: 'information',
 title: 'Statistical power considerations',
 description:
 'Based on expected effect size and variability, a minimum of 120 subjects (60 per arm) is suggested.',
 source: 'Power calculation based on historical data',
 icon: <Info className="h-5 w-5 text-stone-500" />,
 },
 ];

 setRecommendations(sampleRecommendations);
 setLoading(false);
 };

 return (
 <Card>
 <CardHeader>
 <CardTitle>Study Design Assistant</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div>
 <label className="text-sm font-medium mb-1 block">
 What aspect of the study design would you like help with?
 </label>
 <Textarea
 value={query}
 onChange={e => setQuery(e.target.value)}
 placeholder="e.g., What are the optimal inclusion criteria for a Phase 2 diabetes study? or What endpoints should I consider for my oncology trial?"
 rows={3}
 className="w-full"
 />
 <Button
 onClick={generateRecommendations}
 disabled={!query.trim() || loading}
 className="mt-2"
 >
 {loading ? 'Generating...' : 'Generate Recommendations'}
 </Button>
 </div>

 {recommendations.length > 0 && (
 <div className="space-y-4 mt-4">
 <h3 className="font-semibold">Recommendations</h3>
 {recommendations.map((rec, index) => (
 <div key={index} className="border rounded-md p-3">
 <div className="flex items-start">
 <div className="mr-3 mt-1">{rec.icon}</div>
 <div>
 <h4 className="font-medium">{rec.title}</h4>
 <p className="text-sm mt-1">{rec.description}</p>
 <p className="text-xs text-gray-500 mt-2">Source: {rec.source}</p>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}

 {session && (
 <div className="mt-6 p-3 bg-stone-50 rounded-md">
 <p className="text-sm">
 <span className="font-medium">Current session:</span> {session.name}
 </p>
 <p className="text-xs text-gray-600 mt-1">Indication: {session.indication}</p>
 </div>
 )}
 </CardContent>
 </Card>
 );
}
