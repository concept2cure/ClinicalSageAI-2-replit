import { FileText, Search, BarChart2, Upload, FilePlus } from 'lucide-react'
import { Link } from 'react-router-dom';

export default function TopNavigation() {
  return (
    <nav className="bg-slate-800 text-white px-6 py-3 flex items-center gap-6 shadow-xl">
      <Link to="/docs" className="flex items-center gap-1 hover:opacity-80">
        <FileText size={18} /> Docs
      </Link>
      <Link to="/search" className="flex items-center gap-1 hover:opacity-80">
        <Search size={18} /> Search
      </Link>
      <Link to="/analytics" className="flex items-center gap-1 hover:opacity-80">
        <BarChart2 size={18} /> Analytics
      </Link>
      <Link to="/import" className="flex items-center gap-1 hover:opacity-80">
        <Upload size={18} /> Import
      </Link>
      <Link to="/ind" className="flex items-center gap-1 hover:opacity-80">
        <FilePlus size={18} /> IND Builder
      </Link>
    </nav>
  );
}
