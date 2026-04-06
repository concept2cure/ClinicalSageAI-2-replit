import React from 'react';
import { useLocation } from 'wouter';
import { FileText, Clock, Home } from 'lucide-react';

export default function Navigation() {
 const [location] = useLocation();

 return (
 <nav className="bg-white/80 backdrop-blur border-b border-zinc-200">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="flex justify-between h-14">
 <div className="flex items-center gap-6">
 <div className="flex-shrink-0 flex items-center gap-2">
 <div className="h-8 w-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold">
 C2C
 </div>
 <h1 className="text-base font-semibold text-zinc-900">Concept2Cure</h1>
 </div>
 <div className="flex items-center gap-2">
 <a
 href="/"
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
 location === '/' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
 }`}
 >
 <Home className="h-3.5 w-3.5" />
 <span>Home</span>
 </a>
 <a
 href="/module32"
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
 location === '/module32' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
 }`}
 >
 <FileText className="h-3.5 w-3.5" />
 <span>CMC Doc</span>
 </a>
 <a
 href="/versions"
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
 location === '/versions' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
 }`}
 >
 <Clock className="h-3.5 w-3.5" />
 <span>Versions</span>
 </a>
 </div>
 </div>
 </div>
 </div>
 </nav>
 );
}
