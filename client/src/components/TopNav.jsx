import { Sun, Moon, Bot } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useAnAQuickAssistant } from './assistant';

export default function TopNav() {
 const { toggleAssistant } = useAnAQuickAssistant();
 const [dark, setDark] = useState(
 localStorage.getItem('theme') === 'dark' ||
 (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
 );

 useEffect(() => {
 // Update the document class when theme changes
 document.documentElement.classList.toggle('dark', dark);
 localStorage.setItem('theme', dark ? 'dark' : 'light');
 }, [dark]);

 return (
 <nav className="fixed w-full z-50 flex justify-between items-center bg-white/70 dark:bg-slate-900/70 backdrop-blur border-b px-6 py-2">
 <Link
 to="/"
 className="font-bold text-regulatory-600 dark:text-regulatory-400 focus-visible:outline-none focus-visible:ring focus-visible:ring-regulatory-400 rounded-sm"
 aria-label="Concept2Cure Home"
 >
 Concept2Cure
 </Link>

 <div className="flex items-center gap-6">
 <Link
 to="/client-portal/ectd-coauthor"
 className="text-sm text-slate-700 dark:text-slate-300 hover:text-regulatory-600 dark:hover:text-regulatory-400 transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-regulatory-400 rounded-sm"
 >
 eCTD Co-Author
 </Link>
 <Link
 to="/csr-intelligence"
 className="text-sm text-slate-700 dark:text-slate-300 hover:text-regulatory-600 dark:hover:text-regulatory-400 transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-regulatory-400 rounded-sm"
 >
 CSR Library
 </Link>
 <Link
 to="/cmc-module"
 className="text-sm text-slate-700 dark:text-slate-300 hover:text-regulatory-600 dark:hover:text-regulatory-400 transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-regulatory-400 rounded-sm"
 >
 CMC Suite
 </Link>
 <Link
 to="/cmc-blueprint-generator"
 className="text-sm text-slate-700 dark:text-slate-300 hover:text-regulatory-600 dark:hover:text-regulatory-400 transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-regulatory-400 rounded-sm"
 >
 AI-CMC Blueprint
 </Link>
 <Link
 to="/demo"
 className="text-sm text-slate-700 dark:text-slate-300 hover:text-regulatory-600 dark:hover:text-regulatory-400 transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-regulatory-400 rounded-sm"
 >
 Demo
 </Link>
 <button
 aria-label="Ask AnA — RI Co-pilot"
 onClick={toggleAssistant}
 className="flex items-center px-3 py-1.5 mr-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-indigo-400"
 >
 <Bot size={16} className="mr-1.5" />
 <span>Ask AnA</span>
 </button>
 <button
 aria-label="Toggle dark mode"
 onClick={() => setDark(!dark)}
 className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-regulatory-600 dark:hover:text-regulatory-400 transition-colors focus-visible:outline-none focus-visible:ring focus-visible:ring-regulatory-400"
 >
 {dark ? <Sun size={18} /> : <Moon size={18} />}
 </button>
 </div>
 </nav>
 );
}
