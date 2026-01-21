import React from 'react';
import { useLocation } from 'wouter';
import { LayoutDashboard, Stethoscope, ShieldCheck, Database, LogOut, FileEdit } from 'lucide-react';

export const Sidebar = () => {
  const [location, setLocation] = useLocation();

  const NavItem = ({ icon: Icon, label, path }: any) => (
    <div
      onClick={() => setLocation(path)}
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-1 ${
        location === path
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={18} />
      <span className="text-sm font-bold">{label}</span>
    </div>
  );

  return (
    <div className="w-64 bg-slate-900 h-screen flex flex-col p-4 border-r border-slate-800 flex-shrink-0">
      <div className="flex items-center gap-2 mb-10 px-2 pt-2">
        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-black text-white text-lg">C</div>
        <div className="font-bold text-white tracking-wider text-sm">
          CLINICAL<span className="text-blue-500">SAGE</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="text-[10px] font-bold text-slate-600 uppercase mb-2 px-2 tracking-widest mt-2">
          Modules
        </div>
        <NavItem icon={LayoutDashboard} label="Pharma Command" path="/client-portal" />
        <NavItem icon={Stethoscope} label="Medical Device (CERV2)" path="/cerv2" />
        <NavItem icon={FileEdit} label="eCTD Co-Author" path="/co-author" />

        <div className="text-[10px] font-bold text-slate-600 uppercase mb-2 px-2 tracking-widest mt-8">
          Intelligence
        </div>
        <NavItem icon={Database} label="Deep Genome Vault" path="/vault" />

        <div className="text-[10px] font-bold text-slate-600 uppercase mb-2 px-2 tracking-widest mt-8">
          Compliance
        </div>
        <NavItem icon={ShieldCheck} label="Audit Trail" path="/audit-log" />
      </div>

      <div className="border-t border-slate-800 pt-4 mt-2">
        <button
          onClick={() => setLocation('/')}
          className="w-full flex items-center gap-3 p-2 text-slate-500 hover:text-white cursor-pointer transition-colors rounded hover:bg-slate-800"
        >
          <LogOut size={16} />
          <span className="text-xs font-bold">Secure Logout</span>
        </button>
      </div>
    </div>
  );
};
