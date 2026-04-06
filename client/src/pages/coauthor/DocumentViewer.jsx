/**
 * Document Viewer Component - Emergency Fix
 *
 * This is a simplified document viewer component that embeds Google Docs
 * without requiring any authentication or complex setup.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Link, ExternalLink } from 'lucide-react';

export default function DocumentViewer() {
 const [isLoading, setIsLoading] = useState(true);
 const documentId = '1CuT-VSa4gnQKoQdRKDFJ3SglvZ4AaJmSjMXE4jOcpyw';

 useEffect(() => {
 // Simulate a loading delay
 const timer = setTimeout(() => {
 setIsLoading(false);
 }, 1500);

 return () => clearTimeout(timer);
 }, []);

 return (
 <div className="container mx-auto p-4">
 <Card className="w-full">
 <CardHeader>
 <CardTitle className="flex items-center text-lg">
 <FileText className="mr-2 h-5 w-5" />
 eCTD Module Document Viewer
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="mb-4 p-4 bg-stone-50 rounded-md border border-stone-100 text-stone-700 text-sm">
 Viewing: Clinical Overview Document (Module 2.5) —{' '}
 <span className="font-bold">Demo Mode</span>
 </div>

 <div className="border rounded-md overflow-hidden" style={{ height: '75vh' }}>
 {isLoading ? (
 <div className="h-full flex items-center justify-center bg-gray-50">
 <div className="text-center">
 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-500 mx-auto mb-4"></div>
 <p className="text-gray-500">Loading document...</p>
 </div>
 </div>
 ) : (
 <iframe
 src={`https://docs.google.com/document/d/${documentId}/edit?usp=sharing&embedded=true&rm=demo`}
 className="w-full h-full border-0"
 allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
 allowFullScreen={true}
 />
 )}
 </div>
 </CardContent>
 <CardFooter className="flex justify-between">
 <div>
 <Button variant="outline" size="sm" className="mr-2">
 <Download className="h-4 w-4 mr-2" />
 Export PDF
 </Button>
 <Button variant="outline" size="sm">
 <Link className="h-4 w-4 mr-2" />
 Copy Link
 </Button>
 </div>
 <Button variant="default" size="sm">
 <ExternalLink className="h-4 w-4 mr-2" />
 Open in Google Docs
 </Button>
 </CardFooter>
 </Card>
 </div>
 );
}
