// /client/src/components/SidebarNav.jsx
import { Link } from 'wouter';
import {
 BrainCircuit,
 BarChart3,
 FileText,
 UploadCloud,
 LineChart,
 NotebookText,
 FlaskConical,
 ClipboardCheck,
} from 'lucide-react';

export default function SidebarNav() {
 return (
 <aside className="bg-zinc-50/80 backdrop-blur border-r border-zinc-200/50 min-h-screen w-64 p-4 flex flex-col gap-3 text-sm text-zinc-600">
 <div className="flex items-center gap-2 px-2">
 <div className="h-8 w-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold">
 C2C
 </div>
 <span className="text-sm font-semibold text-zinc-900">Concept2Cure</span>
 </div>
 <div className="px-2 text-[11px] uppercase tracking-wider text-zinc-400">Access</div>
 <nav className="space-y-1">
 <NavItem icon={BrainCircuit} href="/study" label="Intelligence" />
 <NavItem icon={BarChart3} href="/analytics" label="Analytics" />
 <NavItem icon={UploadCloud} href="/predict" label="Predict Trial" />
 <NavItem icon={LineChart} href="/csrs" label="CSR Library" />
 <NavItem icon={FileText} href="/reports" label="Reports" />
 <NavItem icon={NotebookText} href="/use-cases" label="Use Cases" />
 <NavItem icon={FlaskConical} href="/planning" label="Modeling & Design" />
 <NavItem
 icon={ClipboardCheck}
 href="/cer"
 label="CER Generator"
 className="font-semibold text-stone-700"
 />
 </nav>
 </aside>
 );
}

function NavItem({ icon: Icon, label, href, className }) {
 return (
 <Link
 to={href}
 className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-200/50 transition ${className || ''}`}
 >
 <Icon size={16} className="text-zinc-500" />
 <span>{label}</span>
 </Link>
 );
}
