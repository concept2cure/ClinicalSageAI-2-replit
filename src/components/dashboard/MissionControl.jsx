import React, { useEffect, useState } from 'react';
import { db } from '../../lib/database'; // Import the centralized DB
import { 
  FileText, Plus, Search, MoreVertical, 
  ShieldCheck, AlertTriangle, Clock, 
  Activity, Database, LayoutGrid, List,
   Bell, Settings, User, ChevronRight,
   Filter, ArrowUpRight, Loader2
} from 'lucide-react';

const ACTIVITY_FEED = [
   { user: 'System', action: 'synced', target: 'Data Lake v2.4', time: '1m ago' },
   { user: 'J. Smith', action: 'flagged', target: 'Table 14.2.1', time: '1h ago', alert: true },
];

function formatRelativeTime(isoString) {
   if (!isoString) return '—';

   const timestamp = new Date(isoString).getTime();
   if (Number.isNaN(timestamp)) return '—';

   const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
   if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
   const deltaMinutes = Math.floor(deltaSeconds / 60);
   if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
   const deltaHours = Math.floor(deltaMinutes / 60);
   if (deltaHours < 24) return `${deltaHours}h ago`;
   const deltaDays = Math.floor(deltaHours / 24);
   return `${deltaDays}d ago`;
}

export function MissionControl({ onOpenEditor, tenantId }) {
   const [projects, setProjects] = useState([]);
   const [isLoading, setIsLoading] = useState(true);
   const [viewMode, setViewMode] = useState('grid'); // grid | list
   const [filter, setFilter] = useState('ALL');

   // --- FETCH TENANT DATA ---
   useEffect(() => {
      const loadData = async () => {
         if (!tenantId) {
            setProjects([]);
            setIsLoading(false);
            return;
         }

         setIsLoading(true);
         try {
            // FETCH ONLY THIS TENANT'S PROJECTS
            const data = await db.getProjects(tenantId);
            setProjects(data);
         } catch (e) {
            console.error('Failed to load dashboard:', e);
            setProjects([]);
         } finally {
            setIsLoading(false);
         }
      };

      loadData();
   }, [tenantId]); // Re-fetch if tenant changes

   const filteredProjects = projects.filter((p) => {
      if (filter === 'ACTIVE') return p.status !== 'LOCKED';
      if (filter === 'ARCHIVED') return false;
      return true;
   });

   const totalAlerts = projects.reduce((acc, p) => acc + (p.errors || 0), 0);
   const totalReady = projects.filter((p) => p.status === 'READY').length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      
      {/* ENTERPRISE TOP NAV */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2 rounded-lg text-white shadow-md">
              <Activity size={20} />
            </div>
            <div className="leading-tight">
               <span className="block text-lg font-bold tracking-tight text-gray-900">ClinicalSage</span>
               <span className="block text-[10px] text-gray-500 font-medium tracking-wider uppercase">Enterprise Platform</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-500">
               <button className="text-gray-900 hover:text-blue-600 transition-colors">Dashboard</button>
               <button className="hover:text-blue-600 transition-colors">Data Lake</button>
               <button className="hover:text-blue-600 transition-colors">Team</button>
            </div>
            <div className="h-6 w-px bg-gray-200"></div>
            <div className="flex items-center gap-3">
               <button className="relative p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                  <Bell size={20} />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
               </button>
               <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs border border-blue-200">
                  ME
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex gap-8">
        
        {/* LEFT: PRIMARY CONTENT */}
        <div className="flex-1">
            {/* HERO & FILTERS */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Mission Control</h1>
                        <p className="text-gray-500 text-sm mt-1">
                           {isLoading ? 'Syncing...' : `You have ${projects.length} active protocols.`}
                        </p>
              </div>
              <div className="flex items-center gap-3">
                 <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                    <input 
                        placeholder="Search..." 
                        className="pl-9 pr-4 py-2 bg-white border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-sm w-64 shadow-sm"
                    />
                 </div>
                 <button 
                    onClick={() => onOpenEditor('new')}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md transition-all active:scale-95"
                 >
                    <Plus size={18} /> New
                 </button>
              </div>
            </div>

            {/* METRICS STRIP */}
            <div className="grid grid-cols-3 gap-4 mb-8">
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-24 relative overflow-hidden group">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                  <div className="text-gray-500 text-xs font-bold uppercase tracking-wide relative z-10">Active Dossiers</div>
                  <div className="text-3xl font-bold text-gray-900 relative z-10">{projects.length}</div>
                  <FileText className="absolute bottom-4 right-4 text-blue-200" size={32} />
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-24 relative overflow-hidden group">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-amber-50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                  <div className="text-gray-500 text-xs font-bold uppercase tracking-wide relative z-10">Data Alerts</div>
                  <div className="text-3xl font-bold text-amber-600 relative z-10">{totalAlerts}</div>
                  <AlertTriangle className="absolute bottom-4 right-4 text-amber-200" size={32} />
               </div>
               <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-24 relative overflow-hidden group">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-green-50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                  <div className="text-gray-500 text-xs font-bold uppercase tracking-wide relative z-10">Submission Ready</div>
                  <div className="text-3xl font-bold text-green-600 relative z-10">{totalReady}</div>
                  <ShieldCheck className="absolute bottom-4 right-4 text-green-200" size={32} />
               </div>
            </div>

            {/* TAB FILTERS */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-1 mb-6">
                <div className="flex gap-6">
                   {['ALL', 'ACTIVE', 'ARCHIVED'].map(tab => (
                       <button 
                         key={tab}
                         onClick={() => setFilter(tab)}
                         className={`pb-3 text-xs font-bold tracking-wide transition-colors ${filter === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                       >
                         {tab} PROJECTS
                       </button>
                   ))}
                </div>
                <div className="flex gap-2 text-gray-400">
                    <button onClick={() => setViewMode('grid')} className={`p-1 hover:text-gray-600 ${viewMode === 'grid' && 'text-blue-600'}`}><LayoutGrid size={16}/></button>
                    <button onClick={() => setViewMode('list')} className={`p-1 hover:text-gray-600 ${viewMode === 'list' && 'text-blue-600'}`}><List size={16}/></button>
                </div>
            </div>

                  {/* PROJECT GRID */}
                  {isLoading ? (
                     <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
                        <p className="text-sm font-medium">Securely loading tenant data...</p>
                     </div>
                  ) : filteredProjects.length === 0 ? (
                     <div className="p-12 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                        <p>No projects found for this organization.</p>
                        <button
                           onClick={() => onOpenEditor('new')}
                           className="text-blue-600 font-bold hover:underline mt-2"
                        >
                           Create your first protocol
                        </button>
                     </div>
                  ) : (
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {filteredProjects.map((project) => (
                           <div
                              key={project.id}
                              onClick={() => onOpenEditor(project.id)}
                              className="group bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-lg hover:border-blue-400 transition-all duration-300 relative overflow-hidden"
                           >
                              <div className="flex justify-between items-start mb-3">
                                 <div className="flex items-center gap-3">
                                    <div
                                       className={`p-2.5 rounded-lg ${
                                          project.status === 'READY'
                                             ? 'bg-green-100 text-green-600'
                                             : project.errors > 0
                                                ? 'bg-amber-100 text-amber-600'
                                                : 'bg-blue-50 text-blue-600'
                                       }`}
                                    >
                                       <FileText size={20} />
                                    </div>
                                    <div>
                                       <h3 className="font-bold text-base text-gray-900 leading-tight group-hover:text-blue-700 transition-colors">
                                          {project.title}
                                       </h3>
                                       <p className="text-xs text-gray-500">
                                          Version {project.version} • {project.stage}
                                       </p>
                                    </div>
                                 </div>
                                 {project.errors > 0 && (
                                    <div className="animate-pulse w-2 h-2 rounded-full bg-red-500"></div>
                                 )}
                              </div>

                              {/* PROGRESS BAR */}
                              <div className="mt-4 mb-4">
                                 <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wide">
                                    <span>Health Score</span>
                                    <span className={project.health < 80 ? 'text-amber-500' : 'text-green-500'}>
                                       {project.health}%
                                    </span>
                                 </div>
                                 <div className="bg-gray-100 rounded-full h-1.5 w-full overflow-hidden">
                                    <div
                                       className={`h-full rounded-full transition-all duration-1000 ${
                                          project.health < 80 ? 'bg-amber-500' : 'bg-green-500'
                                       }`}
                                       style={{ width: `${project.health}%` }}
                                    ></div>
                                 </div>
                              </div>

                              {/* FOOTER */}
                              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                 <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <User size={12} className="text-gray-400" />
                                    <span>{project.editor}</span>
                                    <span className="text-gray-300">•</span>
                                    <span>{formatRelativeTime(project.last_modified)}</span>
                                 </div>

                                 <div
                                    className={`text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-wide ${
                                       project.status === 'READY'
                                          ? 'bg-green-50 text-green-700 border-green-100'
                                          : 'bg-amber-50 text-amber-700 border-amber-100'
                                    }`}
                                 >
                                    {project.status}
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
        </div>

        {/* RIGHT: INTELLIGENCE FEED */}
        <div className="w-80 hidden xl:block shrink-0">
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-full">
              <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                 <Bell size={16} className="text-blue-600" />
                 Morning Briefing
              </h3>
              
              <div className="relative pl-4 border-l-2 border-gray-100 space-y-6">
                 {ACTIVITY_FEED.map((item, i) => (
                    <div key={i} className="relative">
                       <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white ${item.alert ? 'bg-red-500' : 'bg-gray-300'}`}></div>
                       <div className="text-xs text-gray-500 mb-0.5">{item.time}</div>
                       <div className="text-sm text-gray-900 leading-snug">
                          <span className="font-bold">{item.user}</span> {item.action} <span className="font-medium text-blue-600">{item.target}</span>
                       </div>
                       {item.alert && (
                          <div className="mt-2 bg-red-50 border border-red-100 p-2 rounded text-xs text-red-700 leading-tight">
                             Action Required: Please review audit log.
                          </div>
                       )}
                    </div>
                 ))}
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Links</h4>
                 <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-center justify-between group cursor-pointer hover:text-blue-600">
                       <span>CDISC Standards</span> <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                    </li>
                    <li className="flex items-center justify-between group cursor-pointer hover:text-blue-600">
                       <span>FDA eCTD Guidance</span> <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                    </li>
                 </ul>
              </div>
           </div>
        </div>
      </main>
    </div>
  );
}
