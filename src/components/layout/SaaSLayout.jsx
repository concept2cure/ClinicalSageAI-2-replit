import React from 'react';
import { 
  LayoutGrid, FileText, Database, Settings, 
  LogOut, ChevronDown, Search, Bell 
} from 'lucide-react';

export function SaaSLayout({ children, user, tenant, activeModule, onNavigate }) {
  if (!user || !tenant) return <div className="h-screen flex items-center justify-center">Loading Session...</div>;

  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Mission Control', icon: LayoutGrid },
    { id: 'co-author', label: 'Co-Author', icon: FileText },
    { id: 'data-lake', label: 'Data Manager', icon: Database },
    { id: 'admin', label: 'Admin Console', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg">C</div>
          <span className="font-bold tracking-tight text-lg">ClinicalSage</span>
        </div>

        {/* TENANT CONTEXT */}
        <div className="p-4">
           <button className="w-full bg-slate-800 hover:bg-slate-700 transition-colors rounded-lg p-3 flex items-center justify-between group">
              <div className="flex flex-col items-start overflow-hidden">
                 <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Workspace</span>
                 <span className="font-bold text-sm truncate w-full text-left">{tenant.name}</span>
              </div>
              <ChevronDown size={16} className="text-slate-500 group-hover:text-white" />
           </button>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${activeModule === item.id 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'}
              `}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* USER FOOTER */}
        <div className="p-4 border-t border-slate-800 flex items-center gap-3">
           <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center font-bold text-xs">{user.name[0]}</div>
           <div className="flex-1 overflow-hidden">
              <div className="text-sm font-bold truncate">{user.name}</div>
              <div className="text-xs text-slate-500 truncate">{user.role}</div>
           </div>
           <LogOut size={16} className="text-slate-500 hover:text-white cursor-pointer"/>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
         <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
            <h2 className="text-lg font-bold text-gray-800">{NAV_ITEMS.find(n => n.id === activeModule)?.label}</h2>
            <div className="flex items-center gap-4">
               <div className="relative hidden md:block">
                  <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                  <input placeholder="Global Search..." className="pl-9 pr-4 py-2 bg-gray-100 rounded-full text-sm w-64 focus:ring-2 focus:ring-blue-500 transition-all" />
               </div>
               <Bell size={20} className="text-gray-400 hover:text-gray-600 cursor-pointer" />
            </div>
         </header>
         <main className="flex-1 overflow-auto bg-gray-50 relative">
            {children}
         </main>
      </div>
    </div>
  );
}
