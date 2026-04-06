import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Sparkles, RefreshCw, Save, Copy, BookOpenCheck, FileText, ArrowDown } from 'lucide-react';

export default function TemplateEditor({ sectionId, initialValues = {}, template, onSave }) {
 const [values, setValues] = useState({});
 const [loading, setLoading] = useState(false);
 const [progress, setProgress] = useState(0);
 const [output, setOutput] = useState('');

 useEffect(() => {
 // Initialize form values from initial values or empty strings
 if (template?.fields) {
 const defaultValues = {};
 template.fields.forEach(field => {
 defaultValues[field.name] = initialValues[field.name] || '';
 });
 setValues(defaultValues);
 }
 }, [sectionId, initialValues, template]);

 const handleInputChange = (name, value) => {
 setValues(prev => ({ ...prev, [name]: value }));
 };

 const handleGenerate = async () => {
 setLoading(true);
 setProgress(0);

 // Simulate progress updates
 const interval = setInterval(() => {
 setProgress(prev => {
 if (prev >= 95) {
 clearInterval(interval);
 return 95;
 }
 return prev + 5;
 });
 }, 100);

 // Simulate API delay
 setTimeout(() => {
 clearInterval(interval);
 setProgress(100);

 // Create a template-based output
 let result = template.prompt;

 // Replace template variables
 Object.entries(values).forEach(([key, value]) => {
 result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || `[${key}]`);
 });

 // Expand the result into a full document
 const expandedResult = `
# ${template.title}

## Introduction
${result}

## Details
${
 values.EfficacySummary
 ? `
### Efficacy Results
${values.EfficacySummary}
`
 : ''
}

${
 values.SafetySummary
 ? `
### Safety Profile
${values.SafetySummary}
`
 : ''
}

${
 values.ManufacturingProcess
 ? `
### Manufacturing Information
${values.ManufacturingProcess}
`
 : ''
}

${
 values.QualityControls
 ? `
### Quality Control Procedures
${values.QualityControls}
`
 : ''
}

## Conclusion
Based on the provided information, this ${template.title.toLowerCase()} meets regulatory requirements and provides a comprehensive overview of the product's profile.
 `.trim();

 setOutput(expandedResult);
 setLoading(false);

 // Call onSave with the generated content
 if (onSave) {
 onSave(expandedResult);
 }
 }, 2000);
 };

 const handleTemplateReset = () => {
 const defaultValues = {};
 template.fields.forEach(field => {
 defaultValues[field.name] = '';
 });
 setValues(defaultValues);
 setOutput('');
 };

 if (!template) {
 return <p>No template available for section {sectionId}</p>;
 }

 return (
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center">
 <FileText className="mr-2 h-5 w-5" />
 {template.title} Template
 </CardTitle>
 <CardDescription>Fill in the fields below to generate content using AI</CardDescription>
 </CardHeader>
 <CardContent className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {template.fields.map(field => (
 <div key={field.name} className="space-y-2">
 <Label htmlFor={field.name}>{field.label}</Label>
 {field.type === 'textarea' ? (
 <Textarea
 id={field.name}
 rows={4}
 value={values[field.name] || ''}
 onChange={e => handleInputChange(field.name, e.target.value)}
 placeholder={`Enter ${field.label.toLowerCase()}...`}
 disabled={loading}
 />
 ) : (
 <Input
 id={field.name}
 type="text"
 value={values[field.name] || ''}
 onChange={e => handleInputChange(field.name, e.target.value)}
 placeholder={`Enter ${field.label.toLowerCase()}...`}
 disabled={loading}
 />
 )}
 </div>
 ))}
 </div>

 <div className="flex justify-between items-center">
 <div className="space-x-2">
 <Button onClick={handleGenerate} disabled={loading} className="flex items-center">
 {loading ? (
 <>
 <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
 Generating...
 </>
 ) : (
 <>
 <Sparkles className="mr-2 h-4 w-4" />
 Generate with AI
 </>
 )}
 </Button>

 <Button variant="outline" onClick={handleTemplateReset} disabled={loading}>
 Reset
 </Button>
 </div>

 {loading && <span className="text-sm text-muted-foreground">{progress}% complete</span>}
 </div>

 {loading && <Progress value={progress} className="h-1" />}

 {output && (
 <>
 <div className="flex items-center justify-center py-2">
 <ArrowDown className="h-6 w-6 text-muted-foreground" />
 </div>

 <div className="relative">
 <Textarea className="min-h-[300px] font-mono resize-y" value={output} readOnly />
 <div className="absolute top-2 right-2 space-x-1">
 <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
 <Copy className="h-4 w-4" />
 </Button>
 <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
 <BookOpenCheck className="h-4 w-4" />
 </Button>
 </div>
 </div>
 </>
 )}
 </CardContent>
 </Card>
 );
}
