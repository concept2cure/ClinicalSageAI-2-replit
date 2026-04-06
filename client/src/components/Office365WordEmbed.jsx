import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';

function Office365WordEmbed({ documentId, title }) {
 return (
 <Card className="w-full h-96">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <ExternalLink className="h-5 w-5 text-stone-600" />
 Office 365 Word - {title || 'Document'}
 </CardTitle>
 </CardHeader>
 <CardContent className="h-full">
 <div className="flex items-center justify-center h-full bg-gray-50 rounded border-2 border-dashed border-gray-300">
 <div className="text-center">
 <ExternalLink className="h-12 w-12 mx-auto mb-4 text-gray-400" />
 <p className="text-gray-600">Office 365 Word integration will be embedded here</p>
 <p className="text-sm text-gray-500 mt-2">
 Document ID: {documentId || 'Not specified'}
 </p>
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

export default Office365WordEmbed;
