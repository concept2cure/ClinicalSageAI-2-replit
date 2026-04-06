import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';

export default function NavigationBanner() {
 return (
 <div className="bg-white border-b border-gray-200 px-6 py-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/')}>
 <ArrowLeft className="h-4 w-4 mr-2" />
 Back to Home
 </Button>
 <div className="h-6 w-px bg-gray-300" />
 <h2 className="text-lg font-semibold text-gray-900">eCTD Co-Author</h2>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => (window.location.href = '/client-portal')}
 >
 <Home className="h-4 w-4 mr-2" />
 Client Portal
 </Button>
 </div>
 </div>
 </div>
 );
}
